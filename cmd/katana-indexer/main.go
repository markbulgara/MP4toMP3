package main

import (
	"context"
	"flag"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
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
	dbPath := fs.String("db", "", "SQLite database path (auto-generated when empty)")
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

	resolvedDBPath, err := ensureDBPath(*domain, *dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to build database path: %v\n", err)
		os.Exit(1)
	}

	ctx := context.Background()
	opts := crawler.Options{
		Domain:         *domain,
		DBPath:         resolvedDBPath,
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
	domain := fs.String("domain", "", "Domain or URL that was crawled (used to locate the database)")
	dbPath := fs.String("db", "", "SQLite database path (auto-generated when empty)")
	addr := fs.String("addr", ":8080", "Address to serve the search UI")
	fs.Parse(args)

	if *dbPath == "" && *domain == "" {
		fmt.Println("either -domain or -db is required")
		fs.Usage()
		os.Exit(1)
	}

	resolvedDBPath, err := ensureDBPath(*domain, *dbPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "failed to build database path: %v\n", err)
		os.Exit(1)
	}

	if err := server.Serve(resolvedDBPath, *addr); err != nil {
		fmt.Fprintf(os.Stderr, "server failed: %v\n", err)
		os.Exit(1)
	}
}

func printUsage() {
	fmt.Println(`katana-indexer

Usage:
  katana-indexer crawl --domain https://example.com --db data/index.db
  katana-indexer serve --domain https://example.com --addr :8080

Commands:
  crawl   Run katana crawler and collect metadata.
  serve   Launch search UI for indexed metadata.
`)
}

func ensureDBPath(domain string, explicitPath string) (string, error) {
	if explicitPath != "" {
		if err := os.MkdirAll(filepath.Dir(explicitPath), 0o755); err != nil {
			return "", err
		}
		return explicitPath, nil
	}

	if domain == "" {
		return "", fmt.Errorf("domain is required to auto-generate db path")
	}

	parsed, err := url.Parse(domain)
	if err != nil || parsed.Host == "" {
		parsed = &url.URL{Host: domain}
	}
	safeDomain := sanitizeName(parsed.Host)
	if safeDomain == "" {
		safeDomain = "target"
	}

	wd, err := os.Getwd()
	if err != nil {
		return "", err
	}

	baseDir := filepath.Join(wd, "katana-index")
	dbDir := filepath.Join(baseDir, safeDomain)
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		return "", err
	}
	return filepath.Join(dbDir, "index.db"), nil
}

func sanitizeName(value string) string {
	builder := strings.Builder{}
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') {
			builder.WriteRune(r)
			continue
		}
		if r == '-' || r == '_' || r == '.' {
			builder.WriteRune(r)
			continue
		}
		builder.WriteRune('_')
	}
	return strings.Trim(builder.String(), "_")
}
