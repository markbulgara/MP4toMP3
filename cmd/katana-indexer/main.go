package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"mp4tomp3/internal/crawler"
	"mp4tomp3/internal/db"
	"mp4tomp3/internal/server"
)

func main() {
	if len(os.Args) < 2 {
		printUsage()
		os.Exit(1)
	}

	switch os.Args[1] {
	case "crawl":
		runCrawl(os.Args[2:])
	case "search":
		runSearch(os.Args[2:])
	case "serve":
		runServe(os.Args[2:])
	default:
		printUsage()
		os.Exit(1)
	}
}

func runCrawl(args []string) {
	fs := flag.NewFlagSet("crawl", flag.ExitOnError)
	domain := fs.String("domain", "", "Domain or URL to crawl")
	dbPath := fs.String("db", "data/index.db", "SQLite database path")
	katanaPath := fs.String("katana-path", "katana", "Path to katana binary")
	katanaArgs := fs.String("katana-args", "", "Extra katana args (space separated)")
	seedFile := fs.String("seed-file", "", "Path to newline-delimited seed URLs")
	seedURLs := multiValue{}
	fs.Var(&seedURLs, "seed-url", "Seed URL (repeatable)")
	useSitemap := fs.Bool("use-sitemap", true, "Discover URLs via sitemap")
	useRobots := fs.Bool("use-robots", true, "Discover sitemap URLs via robots.txt")
	allowExternal := fs.Bool("allow-external-sitemaps", false, "Allow sitemap URLs outside target host")
	maxSeeds := fs.Int("max-seeds", 20000, "Maximum sitemap URLs to add")
	headMetadata := fs.Bool("head-metadata", true, "Fetch HEAD/preview metadata for URLs")
	metadataWorkers := fs.Int("metadata-workers", 32, "Parallel metadata workers")
	metadataTimeout := fs.Duration("metadata-timeout", 20*time.Second, "Metadata fetch timeout")
	userAgent := fs.String("user-agent", "", "Custom User-Agent for metadata fetch")
	maxConnections := fs.Int("max-connections", 256, "Max connections for metadata fetch")
	failOnEmpty := fs.Bool("fail-on-empty", false, "Fail if no URLs were discovered")
	fs.Parse(args)

	if *domain == "" {
		fmt.Println("-domain is required")
		fs.Usage()
		os.Exit(1)
	}

	if err := os.MkdirAll(filepath.Dir(*dbPath), 0o755); err != nil {
		fmt.Fprintf(os.Stderr, "failed to create db directory: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	opts := crawler.Options{
		Domain:          *domain,
		DBPath:          *dbPath,
		KatanaPath:      *katanaPath,
		KatanaArgs:      strings.Fields(*katanaArgs),
		SeedFile:        *seedFile,
		SeedURLs:        seedURLs,
		UseSitemap:      *useSitemap,
		UseRobots:       *useRobots,
		AllowExternal:   *allowExternal,
		MaxSeeds:        *maxSeeds,
		HeadMetadata:    *headMetadata,
		MetadataWorkers: *metadataWorkers,
		MetadataTimeout: *metadataTimeout,
		UserAgent:       *userAgent,
		MaxConnections:  *maxConnections,
		FailOnEmpty:     *failOnEmpty,
	}

	if err := crawler.Run(ctx, opts); err != nil {
		fmt.Fprintf(os.Stderr, "crawl failed: %v\n", err)
		os.Exit(1)
	}
}

func runSearch(args []string) {
	fs := flag.NewFlagSet("search", flag.ExitOnError)
	dbPath := fs.String("db", "data/index.db", "SQLite database path")
	query := fs.String("q", "", "Search query for URL/title")
	limit := fs.Int("limit", 25, "Number of results")
	fs.Parse(args)

	conn, err := db.Open(*dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "open db failed: %v\n", err)
		os.Exit(1)
	}
	defer conn.Close()

	results, err := db.Search(conn, strings.TrimSpace(*query), *limit, 0)
	if err != nil {
		fmt.Fprintf(os.Stderr, "search failed: %v\n", err)
		os.Exit(1)
	}

	for _, entry := range results {
		fmt.Printf("%s\n  Title: %s\n  Content-Type: %s\n  Status: %d\n\n",
			entry.URL,
			entry.Title,
			entry.ContentType,
			valueOrZero(entry.Status),
		)
	}
}

func printUsage() {
	fmt.Println(`katana-indexer

Usage:
  katana-indexer crawl --domain https://example.com --db data/index.db
  katana-indexer search --db data/index.db --q "keyword"
  katana-indexer serve --db data/index.db --addr :8080
`)
}

func runServe(args []string) {
	fs := flag.NewFlagSet("serve", flag.ExitOnError)
	dbPath := fs.String("db", "data/index.db", "SQLite database path")
	addr := fs.String("addr", ":8080", "Address to serve the search UI")
	fs.Parse(args)

	if err := server.Serve(*dbPath, *addr); err != nil {
		fmt.Fprintf(os.Stderr, "server failed: %v\n", err)
		os.Exit(1)
	}
}

type multiValue []string

func (m *multiValue) String() string {
	return strings.Join(*m, ", ")
}

func (m *multiValue) Set(value string) error {
	*m = append(*m, value)
	return nil
}

func valueOrZero(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}
