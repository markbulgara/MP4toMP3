package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"strings"
	"time"

	"mp4tomp3/internal/crawler"
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
	fetchWorkers := fs.Int("fetch-workers", 64, "Parallel metadata fetch workers")
	timeout := fs.Duration("timeout", 20*time.Second, "Metadata fetch timeout")
	userAgent := fs.String("user-agent", "", "Custom User-Agent for metadata fetch")
	maxConnections := fs.Int("max-connections", 512, "Max connections for metadata fetch")
	fs.Parse(args)

	if *domain == "" {
		fmt.Println("-domain is required")
		fs.Usage()
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

func printUsage() {
	fmt.Println(`katana-indexer

Usage:
  katana-indexer crawl --domain https://example.com --db data/index.db
  katana-indexer serve --db data/index.db --addr :8080

Commands:
  crawl   Run katana crawler and collect metadata.
  serve   Launch search UI for indexed metadata.
`)
}
