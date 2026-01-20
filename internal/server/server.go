package server

import (
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"strconv"
	"strings"
	"time"

	"mp4tomp3/internal/db"
)

const pageSize = 50

var indexTemplate = template.Must(template.New("index").Parse(`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Katana Indexer</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b0d12; color: #e6e6e6; margin: 0; }
    header { padding: 24px; background: #121725; }
    main { padding: 24px; }
    input[type=text] { width: 70%; padding: 10px 12px; border-radius: 6px; border: 1px solid #2b3145; background: #0b0f1a; color: #e6e6e6; }
    button { padding: 10px 16px; border-radius: 6px; border: none; background: #2c6cff; color: white; font-weight: 600; }
    .result { padding: 12px; border-radius: 8px; background: #121725; margin-top: 12px; }
    .result a { color: #7fb0ff; font-size: 15px; }
    .meta { font-size: 12px; color: #a8b0c2; margin-top: 6px; }
  </style>
</head>
<body>
  <header>
    <h1>Katana Indexer</h1>
    <p>Search URLs and titles captured during the crawl.</p>
  </header>
  <main>
    <div>
      <input id="query" type="text" placeholder="Search URL or title">
      <button id="searchBtn">Search</button>
    </div>
    <div id="results"></div>
  </main>

<script>
  async function search() {
    const query = document.getElementById('query').value;
    const res = await fetch('/api/search?q=' + encodeURIComponent(query));
    if (!res.ok) {
      document.getElementById('results').innerHTML = '<p>Search failed.</p>';
      return;
    }
    const results = await res.json();
    if (results.length === 0) {
      document.getElementById('results').innerHTML = '<p>No results.</p>';
      return;
    }
    document.getElementById('results').innerHTML = results.map(item => {
      const title = item.title || item.url;
      const status = item.status !== null ? item.status : '';
      const contentType = item.content_type || '';
      return '<div class="result">' +
        '<div><a href="' + item.url + '" target="_blank" rel="noopener">' + title + '</a></div>' +
        '<div class="meta">' + item.url + '</div>' +
        '<div class="meta">Status: ' + status + ' | ' + contentType + '</div>' +
      '</div>';
    }).join('');
  }

  document.getElementById('searchBtn').addEventListener('click', search);
</script>
</body>
</html>
`))

type responseEntry struct {
	URL         string `json:"url"`
	Title       string `json:"title"`
	Status      *int   `json:"status"`
	ContentType string `json:"content_type"`
}

func Serve(dbPath string, addr string) error {
	conn, err := db.Open(dbPath)
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = indexTemplate.Execute(w, nil)
	})

	mux.HandleFunc("/api/search", func(w http.ResponseWriter, r *http.Request) {
		query := strings.TrimSpace(r.URL.Query().Get("q"))
		page := parseInt(r.URL.Query().Get("page"), 0)
		if page < 0 {
			page = 0
		}
		results, err := db.Search(conn, query, pageSize, page*pageSize)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		payload := make([]responseEntry, 0, len(results))
		for _, entry := range results {
			payload = append(payload, responseEntry{
				URL:         entry.URL,
				Title:       entry.Title,
				Status:      entry.Status,
				ContentType: entry.ContentType,
			})
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(payload)
	})

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	fmt.Printf("Search UI running on %s\n", addr)
	return server.ListenAndServe()
}

func parseInt(value string, fallback int) int {
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
