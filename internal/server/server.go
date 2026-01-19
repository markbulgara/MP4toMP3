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
	"mp4tomp3/internal/metadata"
)

const pageSize = 50

var indexTemplate = template.Must(template.New("index").Parse(`
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Katana Index</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b0d12; color: #e6e6e6; margin: 0; }
    header { padding: 24px; background: #121725; }
    h1 { margin: 0 0 6px; }
    form { display: flex; gap: 12px; }
    input[type=text] { flex: 1; padding: 10px 12px; border-radius: 6px; border: 1px solid #2b3145; background: #0b0f1a; color: #e6e6e6; }
    button { padding: 10px 16px; border-radius: 6px; border: none; background: #2c6cff; color: white; font-weight: 600; }
    main { padding: 24px; }
    .result { padding: 16px; border-radius: 8px; background: #121725; margin-bottom: 16px; }
    .result a { color: #7fb0ff; font-size: 16px; }
    .meta { font-size: 13px; color: #a8b0c2; margin-top: 6px; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 6px; background: #29314a; color: #d2dbf6; font-size: 12px; margin-right: 6px; }
  </style>
</head>
<body>
  <header>
    <h1>Katana Index</h1>
    <p>Search metadata to find hard-to-locate videos.</p>
    <form method="get" action="/">
      <input type="text" name="q" value="{{.Query}}" placeholder="Search keywords, tags, description">
      <button type="submit">Search</button>
    </form>
  </header>
  <main>
    <p>{{.Count}} URLs indexed.</p>
    {{range .Results}}
      <div class="result">
        <div><a href="{{.URL}}" target="_blank" rel="noopener">{{.TitleOrURL}}</a></div>
        <div class="meta">
          {{if .IsVideo}}<span class="badge">video</span>{{end}}
          {{if .Tag}}<span class="badge">{{.Tag}}</span>{{end}}
          {{if .ContentType}}<span class="badge">{{.ContentType}}</span>{{end}}
          {{if .Keywords}}<span class="badge">{{.Keywords}}</span>{{end}}
        </div>
        {{if .Description}}<div class="meta">{{.Description}}</div>{{end}}
        {{if .VideoURLs}}<div class="meta">Video URLs: {{.VideoURLs}}</div>{{end}}
      </div>
    {{end}}
  </main>
</body>
</html>
`))

type ResultView struct {
	URL         string
	TitleOrURL  string
	Description string
	Keywords    string
	Tag         string
	ContentType string
	VideoURLs   string
	IsVideo     bool
}

type PageData struct {
	Query   string
	Results []ResultView
	Count   int
}

func Serve(dbPath string, addr string) error {
	conn, err := db.Open(dbPath)
	if err != nil {
		return err
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
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
		count, _ := db.Count(conn)
		views := make([]ResultView, 0, len(results))
		for _, entry := range results {
			views = append(views, ResultView{
				URL:         entry.URL,
				TitleOrURL:  titleOrURL(entry),
				Description: entry.Description,
				Keywords:    entry.Keywords,
				Tag:         entry.Tag,
				ContentType: entry.ContentType,
				VideoURLs:   metadata.PrettyVideoURLs(entry.VideoURLs),
				IsVideo:     entry.IsVideo == 1,
			})
		}

		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = indexTemplate.Execute(w, PageData{Query: query, Results: views, Count: count})
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
		w.Header().Set("Content-Type", "application/json")
		_ = writeJSON(w, results)
	})

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	fmt.Printf("Search UI running on %s\n", addr)
	return server.ListenAndServe()
}

func titleOrURL(entry db.URLEntry) string {
	if entry.Title != "" {
		return entry.Title
	}
	return entry.URL
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

func writeJSON(w http.ResponseWriter, value interface{}) error {
	encoder := json.NewEncoder(w)
	encoder.SetIndent("", "  ")
	return encoder.Encode(value)
}
