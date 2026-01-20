package crawler

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"sync"
	"time"

	"mp4tomp3/internal/db"
	"mp4tomp3/internal/metadata"
)

type Options struct {
	Domain         string
	DBPath         string
	KatanaPath     string
	KatanaArgs     []string
	FetchWorkers   int
	Timeout        time.Duration
	UserAgent      string
	MaxConnections int
	Reporter       Reporter
}

type KatanaEvent struct {
	URL       string `json:"url"`
	Tag       string `json:"tag"`
	Attribute string `json:"attribute"`
	Source    string `json:"source"`
	Depth     int    `json:"depth"`
}

type Reporter interface {
	OnKatanaEvent(event KatanaEvent)
	OnMetadataFetched(url string, result metadata.Result, err error)
	OnLog(line string)
}

func Run(ctx context.Context, opts Options) error {
	if opts.Domain == "" {
		return fmt.Errorf("domain is required")
	}

	if opts.KatanaPath == "" {
		opts.KatanaPath = "katana"
	}

	if opts.FetchWorkers <= 0 {
		opts.FetchWorkers = 32
	}

	if opts.Timeout <= 0 {
		opts.Timeout = 20 * time.Second
	}

	if opts.MaxConnections <= 0 {
		opts.MaxConnections = 256
	}

	dbConn, err := db.Open(opts.DBPath)
	if err != nil {
		return err
	}
	defer dbConn.Close()

	katanaArgs := []string{"-u", opts.Domain, "-json", "-silent", "-no-color", "-headless=false"}
	katanaArgs = append(katanaArgs, opts.KatanaArgs...)

	cmd := exec.CommandContext(ctx, opts.KatanaPath, katanaArgs...)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return err
	}

	if err := cmd.Start(); err != nil {
		return err
	}

	fetchQueue := make(chan string, opts.FetchWorkers*2)
	var wg sync.WaitGroup
	client := metadata.NewHTTPClient(opts.Timeout, opts.UserAgent, opts.MaxConnections)

	for i := 0; i < opts.FetchWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for url := range fetchQueue {
				fetchCtx, cancel := context.WithTimeout(ctx, opts.Timeout)
				result, err := metadata.Fetch(fetchCtx, client, url)
				cancel()
				if err != nil {
					_ = db.MarkFetched(dbConn, url, time.Now().UTC())
					if opts.Reporter != nil {
						opts.Reporter.OnMetadataFetched(url, result, err)
					}
					continue
				}

				entry := db.DefaultEntry(url)
				entry.Title = result.Title
				entry.Description = result.Description
				entry.Keywords = result.Keywords
				entry.ContentType = result.ContentType
				entry.StatusCode = result.StatusCode
				entry.VideoURLs = metadata.EncodeVideoURLs(result.VideoURLs)
				if result.IsVideo {
					entry.IsVideo = 1
				}
				fetchedAt := time.Now().UTC()
				entry.LastSeen = fetchedAt
				entry.FetchedAt = &fetchedAt
				_ = db.UpsertURL(dbConn, entry)
				if opts.Reporter != nil {
					opts.Reporter.OnMetadataFetched(url, result, nil)
				}
			}
		}()
	}

	stderrScanner := bufio.NewScanner(stderr)
	go func() {
		for stderrScanner.Scan() {
			if opts.Reporter != nil {
				opts.Reporter.OnLog(stderrScanner.Text())
			}
		}
	}()

	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		var event KatanaEvent
		if err := json.Unmarshal([]byte(line), &event); err != nil {
			if opts.Reporter != nil {
				opts.Reporter.OnLog(fmt.Sprintf("failed to parse katana output: %v", err))
			}
			continue
		}
		if event.URL == "" {
			continue
		}
		entry := db.DefaultEntry(event.URL)
		entry.Tag = event.Tag
		entry.Attribute = event.Attribute
		entry.Source = event.Source
		entry.Depth = event.Depth
		entry.LastSeen = time.Now().UTC()
		_ = db.UpsertURL(dbConn, entry)

		if opts.Reporter != nil {
			opts.Reporter.OnKatanaEvent(event)
		}

		needs, err := db.NeedsMetadata(dbConn, event.URL)
		if err != nil {
			continue
		}
		if needs {
			select {
			case fetchQueue <- event.URL:
			default:
				// Drop when overloaded to keep crawl fast.
			}
		}
	}

	close(fetchQueue)
	wg.Wait()

	if err := scanner.Err(); err != nil {
		return err
	}

	if err := cmd.Wait(); err != nil {
		return err
	}

	if err := stderrScanner.Err(); err != nil && !errors.Is(err, context.Canceled) {
		return err
	}

	return nil
}
