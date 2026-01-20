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
	fetchWorkers := fs.Int("fetch-workers", 32, "Parallel metadata fetch workers")
	timeout := fs.Duration("timeout", 20*time.Second, "Metadata fetch timeout")
	userAgent := fs.String("user-agent", "", "Custom User-Agent for metadata fetch")
	maxConnections := fs.Int("max-connections", 256, "Max connections for metadata fetch")
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
		Domain:         *domain,
		DBPath:         *dbPath,
		KatanaPath:     *katanaPath,
		KatanaArgs:     strings.Fields(*katanaArgs),
		FetchWorkers:   *fetchWorkers,
		Timeout:        *timeout,
		UserAgent:      *userAgent,
		MaxConnections: *maxConnections,
	}

	if err := crawler.Run(ctx, opts); err != nil {
		fmt.Fprintf(os.Stderr, "crawl failed: %v\n", err)
		os.Exit(1)
	}
}

func runSearch(args []string) {
	fs := flag.NewFlagSet("search", flag.ExitOnError)
	dbPath := fs.String("db", "data/index.db", "SQLite database path")
	query := fs.String("q", "", "FTS query (keywords, title, description)")
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
		fmt.Printf("%s\n  Title: %s\n  Description: %s\n  Keywords: %s\n  Content-Type: %s\n  Status: %d\n\n",
			entry.URL,
			entry.Title,
			entry.Description,
			entry.Keywords,
			entry.ContentType,
			entry.StatusCode,
		)
	}
}

func printUsage() {
	fmt.Println(`katana-indexer

Usage:
  katana-indexer crawl --domain https://example.com --db data/index.db
  katana-indexer search --db data/index.db --q "keyword"
`)
}
