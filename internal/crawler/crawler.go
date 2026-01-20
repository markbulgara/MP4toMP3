package crawler

import (
	"bufio"
	"context"
	"encoding/json"
	"encoding/xml"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"mp4tomp3/internal/db"
	"mp4tomp3/internal/metadata"
)

type Options struct {
	Domain          string
	DBPath          string
	KatanaPath      string
	KatanaArgs      []string
	SeedFile        string
	SeedURLs        []string
	UseSitemap      bool
	UseRobots       bool
	AllowExternal   bool
	MaxSeeds        int
	HeadMetadata    bool
	MetadataWorkers int
	MetadataTimeout time.Duration
	UserAgent       string
	MaxConnections  int
	FailOnEmpty     bool
}

type KatanaEvent struct {
	URL string `json:"url"`
}

func Run(ctx context.Context, opts Options) error {
	if opts.Domain == "" {
		return fmt.Errorf("domain is required")
	}
	if opts.KatanaPath == "" {
		opts.KatanaPath = "katana"
	}
	if opts.MetadataWorkers <= 0 {
		opts.MetadataWorkers = 32
	}
	if opts.MaxSeeds <= 0 {
		opts.MaxSeeds = 20000
	}
	if opts.MetadataTimeout <= 0 {
		opts.MetadataTimeout = 20 * time.Second
	}
	if opts.MaxConnections <= 0 {
		opts.MaxConnections = 256
	}

	dbConn, err := db.Open(opts.DBPath)
	if err != nil {
		return err
	}
	defer dbConn.Close()

	baseURL, err := normalizeBase(opts.Domain)
	if err != nil {
		return err
	}

	katanaArgs := []string{"-u", baseURL.String(), "-json", "-silent", "-no-color", "-headless=false"}
	katanaArgs = append(katanaArgs, opts.KatanaArgs...)

	cmd := exec.CommandContext(ctx, opts.KatanaPath, katanaArgs...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	fetchQueue := make(chan string, opts.MetadataWorkers*2)
	var wg sync.WaitGroup
	client := metadata.NewHTTPClient(opts.MetadataTimeout, opts.UserAgent, opts.MaxConnections)

	if opts.HeadMetadata {
		for i := 0; i < opts.MetadataWorkers; i++ {
			wg.Add(1)
			go func() {
				defer wg.Done()
				for target := range fetchQueue {
					fetchCtx, cancel := context.WithTimeout(ctx, opts.MetadataTimeout)
					result, err := metadata.Fetch(fetchCtx, client, target)
					cancel()

					entry := db.Entry{URL: target}
					if err == nil {
						entry.Title = result.Title
						entry.ContentType = result.ContentType
						status := result.StatusCode
						entry.Status = &status
						if result.Bytes > 0 {
							bytes := result.Bytes
							entry.Bytes = &bytes
						}
					}
					now := time.Now().UTC()
					entry.FetchedAt = &now
					_ = db.UpdateMetadata(dbConn, entry)
				}
			}()
		}
	}

	seen := map[string]struct{}{}
	var discovered int
	katanaCount := 0
	now := time.Now().UTC()

	addURL := func(raw string, source string) {
		normalized := normalizeURL(baseURL, raw)
		if normalized == "" {
			return
		}
		if _, ok := seen[normalized]; ok {
			return
		}
		seen[normalized] = struct{}{}
		discovered++
		_ = db.UpsertURL(dbConn, normalized, source, now)
		_ = db.RecordSource(dbConn, normalized, source, now)
		if opts.HeadMetadata {
			select {
			case fetchQueue <- normalized:
			default:
			}
		}
	}

	if opts.SeedFile != "" {
		if seeds, err := readSeedFile(opts.SeedFile); err == nil {
			for _, seed := range seeds {
				addURL(seed, "seed-file")
			}
		}
	}

	for _, seed := range opts.SeedURLs {
		addURL(seed, "seed-url")
	}

	if opts.UseRobots {
		sitemapURLs, err := fetchRobotsSitemaps(ctx, client, baseURL)
		if err == nil {
			for _, sitemapURL := range sitemapURLs {
				addSitemapURLs(ctx, client, baseURL, sitemapURL, opts, addURL)
			}
		}
		if len(sitemapURLs) == 0 && opts.UseSitemap {
			for _, candidate := range commonSitemaps(baseURL) {
				addSitemapURLs(ctx, client, baseURL, candidate, opts, addURL)
			}
		}
	} else if opts.UseSitemap {
		for _, candidate := range commonSitemaps(baseURL) {
			addSitemapURLs(ctx, client, baseURL, candidate, opts, addURL)
		}
	}

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var event KatanaEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			continue
		}
		if event.URL == "" {
			continue
		}
		katanaCount++
		addURL(event.URL, "katana")
	}

	close(fetchQueue)
	wg.Wait()

	if err := scanner.Err(); err != nil {
		return err
	}
	if err := cmd.Wait(); err != nil {
		return err
	}

	if katanaCount == 0 {
		fmt.Println("No links discovered. Target may be SPA/JS-rendered; consider using sitemap/robots/seeds mode.")
	}

	if discovered == 0 && opts.FailOnEmpty {
		return fmt.Errorf("no urls discovered")
	}

	return nil
}

func normalizeBase(domain string) (*url.URL, error) {
	parsed, err := url.Parse(domain)
	if err != nil || parsed.Host == "" {
		parsed, err = url.Parse("https://" + domain)
		if err != nil {
			return nil, err
		}
	}
	return parsed, nil
}

func normalizeURL(base *url.URL, raw string) string {
	parsed, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return ""
	}
	if parsed.Scheme == "" && parsed.Host == "" {
		parsed = base.ResolveReference(parsed)
	}
	if parsed.Scheme == "" {
		parsed.Scheme = base.Scheme
	}
	if parsed.Host == "" {
		parsed.Host = base.Host
	}
	parsed.Fragment = ""
	return parsed.String()
}

func readSeedFile(path string) ([]string, error) {
	file, err := os.Open(filepath.Clean(path))
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var urls []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		urls = append(urls, line)
	}
	return urls, scanner.Err()
}

func fetchRobotsSitemaps(ctx context.Context, client *http.Client, base *url.URL) ([]string, error) {
	robotsURL := base.ResolveReference(&url.URL{Path: "/robots.txt"})
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, robotsURL.String(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("robots status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1024*1024))
	if err != nil {
		return nil, err
	}
	var sitemaps []string
	for _, line := range strings.Split(string(body), "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(strings.ToLower(trimmed), "sitemap:") {
			value := strings.TrimSpace(trimmed[len("sitemap:"):])
			if value != "" {
				sitemaps = append(sitemaps, value)
			}
		}
	}
	return sitemaps, nil
}

func commonSitemaps(base *url.URL) []string {
	paths := []string{"/sitemap.xml", "/sitemap_index.xml", "/sitemap-index.xml", "/sitemap.txt"}
	results := make([]string, 0, len(paths))
	for _, path := range paths {
		results = append(results, base.ResolveReference(&url.URL{Path: path}).String())
	}
	return results
}

func addSitemapURLs(ctx context.Context, client *http.Client, base *url.URL, sitemapURL string, opts Options, add func(string, string)) {
	urls, err := fetchSitemapURLs(ctx, client, sitemapURL, opts.MaxSeeds)
	if err != nil {
		return
	}
	for _, loc := range urls {
		locURL, err := url.Parse(loc)
		if err != nil {
			continue
		}
		if !opts.AllowExternal && !sameHost(base, locURL) {
			continue
		}
		add(loc, "sitemap")
	}
}

func fetchSitemapURLs(ctx context.Context, client *http.Client, sitemapURL string, max int) ([]string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sitemapURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("sitemap status %d", resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 8*1024*1024))
	if err != nil {
		return nil, err
	}
	urls, indexLocs := parseSitemap(body)
	if len(indexLocs) > 0 {
		all := []string{}
		for _, loc := range indexLocs {
			childURLs, err := fetchSitemapURLs(ctx, client, loc, max)
			if err != nil {
				continue
			}
			all = append(all, childURLs...)
			if len(all) >= max {
				return all[:max], nil
			}
		}
		return all, nil
	}
	if len(urls) > max {
		return urls[:max], nil
	}
	return urls, nil
}

type sitemapURLSet struct {
	URLs []sitemapURL `xml:"url"`
}

type sitemapURL struct {
	Loc string `xml:"loc"`
}

type sitemapIndex struct {
	Sitemaps []sitemapEntry `xml:"sitemap"`
}

type sitemapEntry struct {
	Loc string `xml:"loc"`
}

func parseSitemap(body []byte) ([]string, []string) {
	var urlSet sitemapURLSet
	if err := xml.Unmarshal(body, &urlSet); err == nil && len(urlSet.URLs) > 0 {
		return extractLocs(urlSet.URLs), nil
	}
	var index sitemapIndex
	if err := xml.Unmarshal(body, &index); err == nil && len(index.Sitemaps) > 0 {
		locs := make([]string, 0, len(index.Sitemaps))
		for _, entry := range index.Sitemaps {
			loc := strings.TrimSpace(entry.Loc)
			if loc != "" {
				locs = append(locs, loc)
			}
		}
		return nil, locs
	}
	return nil, nil
}

func extractLocs(items []sitemapURL) []string {
	results := make([]string, 0, len(items))
	for _, item := range items {
		loc := strings.TrimSpace(item.Loc)
		if loc != "" {
			results = append(results, loc)
		}
	}
	return results
}

func sameHost(base *url.URL, target *url.URL) bool {
	if target == nil {
		return false
	}
	host := target.Host
	if host == "" {
		host = base.Host
	}
	return strings.EqualFold(base.Host, host)
}
