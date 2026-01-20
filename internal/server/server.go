package server

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"mp4tomp3/internal/crawler"
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
  <title>Katana Index Controller</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #0b0d12; color: #e6e6e6; margin: 0; }
    header { padding: 24px; background: #121725; }
    h1 { margin: 0 0 6px; }
    main { padding: 24px; display: grid; gap: 24px; }
    section { background: #121725; padding: 16px; border-radius: 12px; }
    label { font-size: 12px; color: #9aa6c4; }
    input[type=text], input[type=number] { width: 100%; padding: 10px 12px; border-radius: 6px; border: 1px solid #2b3145; background: #0b0f1a; color: #e6e6e6; }
    button { padding: 10px 16px; border-radius: 6px; border: none; background: #2c6cff; color: white; font-weight: 600; cursor: pointer; }
    button.secondary { background: #2a3246; }
    button.danger { background: #a83232; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .row { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
    .status-pill { padding: 4px 10px; border-radius: 999px; font-size: 12px; background: #29314a; }
    .progress { width: 100%; height: 10px; background: #0b0f1a; border-radius: 999px; overflow: hidden; }
    .progress span { display: block; height: 100%; background: linear-gradient(90deg, #2c6cff, #7fb0ff); width: 0%; }
    pre { background: #0b0f1a; padding: 12px; border-radius: 8px; max-height: 240px; overflow: auto; font-size: 12px; }
    .result { padding: 12px; border-radius: 8px; background: #0f1321; margin-top: 12px; }
    .result a { color: #7fb0ff; font-size: 15px; }
    .meta { font-size: 12px; color: #a8b0c2; margin-top: 6px; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 6px; background: #29314a; color: #d2dbf6; font-size: 12px; margin-right: 6px; }
  </style>
</head>
<body>
  <header>
    <h1>Katana Index Controller</h1>
    <p>Run, monitor, and search your crawler index from one UI.</p>
  </header>
  <main>
    <section>
      <h2>Run crawl</h2>
      <div class="grid">
        <div>
          <label>Domain or URL</label>
          <input id="domain" type="text" placeholder="https://example.com">
        </div>
        <div>
          <label>Database path (optional)</label>
          <input id="dbPath" type="text" placeholder="katana-index\\example.com\\index.db">
        </div>
        <div>
          <label>Katana args (optional)</label>
          <input id="katanaArgs" type="text" placeholder="-depth 5 -jc">
        </div>
        <div>
          <label>Katana path (optional)</label>
          <input id="katanaPath" type="text" placeholder="katana.exe">
        </div>
        <div>
          <label>User-Agent (optional)</label>
          <input id="userAgent" type="text" placeholder="Custom UA">
        </div>
        <div>
          <label>Fetch workers</label>
          <input id="fetchWorkers" type="number" value="64" min="1">
        </div>
        <div>
          <label>Max connections</label>
          <input id="maxConnections" type="number" value="512" min="1">
        </div>
        <div>
          <label>Timeout (seconds)</label>
          <input id="timeout" type="number" value="20" min="1">
        </div>
      </div>
      <div class="row" style="margin-top:12px;">
        <button id="startBtn">Start crawl</button>
        <button id="stopBtn" class="danger">Stop & save</button>
        <button id="loadBtn" class="secondary">Load existing index</button>
        <span id="statusPill" class="status-pill">Idle</span>
      </div>
    </section>

    <section>
      <h2>Status</h2>
      <div class="row">
        <div>Indexed URLs: <strong id="indexedCount">0</strong></div>
        <div>Metadata fetched: <strong id="metadataCount">0</strong></div>
        <div>Errors: <strong id="errorCount">0</strong></div>
        <div>Database: <strong id="activeDb">None</strong></div>
      </div>
      <div class="progress" style="margin-top:12px;"><span id="progressBar"></span></div>
    </section>

    <section>
      <h2>Logs</h2>
      <pre id="logOutput">Waiting for crawl...</pre>
    </section>

    <section>
      <h2>Search index</h2>
      <div class="row">
        <input id="searchQuery" type="text" placeholder="Search keywords, tags, description">
        <button id="searchBtn">Search</button>
      </div>
      <div id="searchResults"></div>
    </section>
  </main>

<script>
  const statusPill = document.getElementById('statusPill');
  const indexedCount = document.getElementById('indexedCount');
  const metadataCount = document.getElementById('metadataCount');
  const errorCount = document.getElementById('errorCount');
  const activeDb = document.getElementById('activeDb');
  const progressBar = document.getElementById('progressBar');
  const logOutput = document.getElementById('logOutput');
  const searchResults = document.getElementById('searchResults');

  async function refreshStatus() {
    const res = await fetch('/api/status');
    const data = await res.json();
    statusPill.textContent = data.running ? 'Running' : 'Idle';
    indexedCount.textContent = data.urlsIndexed;
    metadataCount.textContent = data.metadataFetched;
    errorCount.textContent = data.errors;
    activeDb.textContent = data.dbPath || 'None';
    progressBar.style.width = (data.progressPercent || 0) + '%';
  }

  async function refreshLogs() {
    const res = await fetch('/api/logs');
    const data = await res.json();
    logOutput.textContent = data.lines.join('\n');
  }

  async function startCrawl() {
    const payload = {
      domain: document.getElementById('domain').value,
      dbPath: document.getElementById('dbPath').value,
      katanaArgs: document.getElementById('katanaArgs').value,
      katanaPath: document.getElementById('katanaPath').value,
      userAgent: document.getElementById('userAgent').value,
      fetchWorkers: parseInt(document.getElementById('fetchWorkers').value, 10),
      maxConnections: parseInt(document.getElementById('maxConnections').value, 10),
      timeoutSeconds: parseInt(document.getElementById('timeout').value, 10)
    };
    const res = await fetch('/api/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const text = await res.text();
      alert(text);
    }
  }

  async function stopCrawl() {
    await fetch('/api/stop', { method: 'POST' });
  }

  async function loadIndex() {
    const payload = { dbPath: document.getElementById('dbPath').value };
    const res = await fetch('/api/load', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (!res.ok) {
      const text = await res.text();
      alert(text);
    }
  }

  async function runSearch() {
    const query = document.getElementById('searchQuery').value;
    const res = await fetch('/api/search?q=' + encodeURIComponent(query));
    if (!res.ok) {
      searchResults.innerHTML = '<p>Search failed.</p>';
      return;
    }
    const results = await res.json();
    if (results.length === 0) {
      searchResults.innerHTML = '<p>No results.</p>';
      return;
    }
    searchResults.innerHTML = results.map(item => {
      const badges = [item.tag, item.content_type, item.keywords].filter(Boolean)
        .map(b => '<span class="badge">' + b + '</span>').join('');
      const video = item.is_video === 1 ? '<span class="badge">video</span>' : '';
      const description = item.description ? '<div class="meta">' + item.description + '</div>' : '';
      const videoUrls = item.video_urls ? '<div class="meta">Video URLs: ' + item.video_urls + '</div>' : '';
      const title = item.title || item.url;
      return '<div class="result">' +
        '<div><a href=\"' + item.url + '\" target=\"_blank\" rel=\"noopener\">' + title + '</a></div>' +
        '<div class="meta">' + video + badges + '</div>' +
        description +
        videoUrls +
      '</div>';
    }).join('');
  }

  document.getElementById('startBtn').addEventListener('click', startCrawl);
  document.getElementById('stopBtn').addEventListener('click', stopCrawl);
  document.getElementById('loadBtn').addEventListener('click', loadIndex);
  document.getElementById('searchBtn').addEventListener('click', runSearch);

  setInterval(() => {
    refreshStatus();
    refreshLogs();
  }, 2000);

  refreshStatus();
  refreshLogs();
</script>
</body>
</html>
`))

type AppState struct {
	mu              sync.RWMutex
	db              *sql.DB
	dbPath          string
	domain          string
	running         bool
	urlsIndexed     int
	metadataFetched int
	errors          int
	startedAt       time.Time
	finishedAt      *time.Time
	cancel          context.CancelFunc
	logs            *logBuffer
}

type logBuffer struct {
	mu    sync.Mutex
	lines []string
	max   int
}

func newLogBuffer(limit int) *logBuffer {
	return &logBuffer{max: limit}
}

func (l *logBuffer) Add(line string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	if len(l.lines) >= l.max {
		l.lines = l.lines[1:]
	}
	l.lines = append(l.lines, line)
}

func (l *logBuffer) Snapshot() []string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return append([]string{}, l.lines...)
}

func Serve(dbPath string, addr string) error {
	app := &AppState{logs: newLogBuffer(300)}
	if dbPath != "" {
		if err := app.loadDB(dbPath); err != nil {
			return err
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_ = indexTemplate.Execute(w, nil)
	})

	mux.HandleFunc("/api/status", func(w http.ResponseWriter, r *http.Request) {
		status := app.status()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(status)
	})

	mux.HandleFunc("/api/logs", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{"lines": app.logs.Snapshot()})
	})

	mux.HandleFunc("/api/start", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var req startRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Domain) == "" {
			http.Error(w, "domain is required", http.StatusBadRequest)
			return
		}
		if err := app.startCrawl(req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	})

	mux.HandleFunc("/api/stop", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		app.stopCrawl()
		w.WriteHeader(http.StatusAccepted)
	})

	mux.HandleFunc("/api/load", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		var req loadRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.DBPath) == "" {
			http.Error(w, "dbPath is required", http.StatusBadRequest)
			return
		}
		if err := app.loadDB(req.DBPath); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusAccepted)
	})

	mux.HandleFunc("/api/search", func(w http.ResponseWriter, r *http.Request) {
		query := strings.TrimSpace(r.URL.Query().Get("q"))
		page := parseInt(r.URL.Query().Get("page"), 0)
		if page < 0 {
			page = 0
		}
		conn := app.dbConn()
		if conn == nil {
			http.Error(w, "no database loaded", http.StatusBadRequest)
			return
		}
		results, err := db.Search(conn, query, pageSize, page*pageSize)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		for i := range results {
			results[i].VideoURLs = metadata.PrettyVideoURLs(results[i].VideoURLs)
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(results)
	})

	server := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	fmt.Printf("GUI running on %s\n", addr)
	return server.ListenAndServe()
}

type startRequest struct {
	Domain         string `json:"domain"`
	DBPath         string `json:"dbPath"`
	KatanaArgs     string `json:"katanaArgs"`
	KatanaPath     string `json:"katanaPath"`
	UserAgent      string `json:"userAgent"`
	FetchWorkers   int    `json:"fetchWorkers"`
	TimeoutSeconds int    `json:"timeoutSeconds"`
	MaxConnections int    `json:"maxConnections"`
}

type loadRequest struct {
	DBPath string `json:"dbPath"`
}

type statusResponse struct {
	Running         bool       `json:"running"`
	Domain          string     `json:"domain"`
	DBPath          string     `json:"dbPath"`
	URLsIndexed     int        `json:"urlsIndexed"`
	MetadataFetched int        `json:"metadataFetched"`
	Errors          int        `json:"errors"`
	ProgressPercent int        `json:"progressPercent"`
	StartedAt       time.Time  `json:"startedAt"`
	FinishedAt      *time.Time `json:"finishedAt"`
}

func (a *AppState) dbConn() *sql.DB {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.db
}

func (a *AppState) status() statusResponse {
	a.mu.RLock()
	defer a.mu.RUnlock()
	progress := 0
	if a.urlsIndexed > 0 {
		progress = int(float64(a.metadataFetched) / float64(a.urlsIndexed) * 100)
		if progress > 100 {
			progress = 100
		}
	}
	return statusResponse{
		Running:         a.running,
		Domain:          a.domain,
		DBPath:          a.dbPath,
		URLsIndexed:     a.urlsIndexed,
		MetadataFetched: a.metadataFetched,
		Errors:          a.errors,
		ProgressPercent: progress,
		StartedAt:       a.startedAt,
		FinishedAt:      a.finishedAt,
	}
}

func (a *AppState) startCrawl(req startRequest) error {
	a.mu.Lock()
	if a.running {
		a.mu.Unlock()
		return fmt.Errorf("crawl already running")
	}
	resolvedDBPath, err := ensureDBPath(req.Domain, req.DBPath)
	if err != nil {
		a.mu.Unlock()
		return err
	}
	if err := a.loadDB(resolvedDBPath); err != nil {
		a.mu.Unlock()
		return err
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.cancel = cancel
	a.running = true
	a.domain = req.Domain
	a.urlsIndexed = 0
	a.metadataFetched = 0
	a.errors = 0
	a.startedAt = time.Now().UTC()
	a.finishedAt = nil
	a.logs.Add(fmt.Sprintf("Starting crawl for %s", req.Domain))
	a.mu.Unlock()

	opts := crawler.Options{
		Domain:         req.Domain,
		DBPath:         resolvedDBPath,
		KatanaPath:     strings.TrimSpace(req.KatanaPath),
		KatanaArgs:     strings.Fields(req.KatanaArgs),
		FetchWorkers:   coalesceInt(req.FetchWorkers, 64),
		Timeout:        time.Duration(coalesceInt(req.TimeoutSeconds, 20)) * time.Second,
		UserAgent:      strings.TrimSpace(req.UserAgent),
		MaxConnections: coalesceInt(req.MaxConnections, 512),
		Reporter:       &serverReporter{app: a},
	}

	go func() {
		if err := crawler.Run(ctx, opts); err != nil {
			a.logs.Add(fmt.Sprintf("crawl failed: %v", err))
			a.mu.Lock()
			a.errors++
			a.running = false
			finished := time.Now().UTC()
			a.finishedAt = &finished
			a.mu.Unlock()
			return
		}
		a.logs.Add("crawl completed")
		a.mu.Lock()
		a.running = false
		finished := time.Now().UTC()
		a.finishedAt = &finished
		a.mu.Unlock()
	}()

	return nil
}

func (a *AppState) stopCrawl() {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.cancel != nil {
		a.logs.Add("stop requested: saving current index")
		a.cancel()
		a.cancel = nil
	}
}

func (a *AppState) loadDB(path string) error {
	conn, err := db.Open(path)
	if err != nil {
		return err
	}
	a.mu.Lock()
	if a.db != nil {
		_ = a.db.Close()
	}
	a.db = conn
	a.dbPath = path
	a.mu.Unlock()
	a.logs.Add(fmt.Sprintf("loaded index: %s", path))
	return nil
}

type serverReporter struct {
	app *AppState
}

func (s *serverReporter) OnKatanaEvent(event crawler.KatanaEvent) {
	s.app.mu.Lock()
	s.app.urlsIndexed++
	s.app.mu.Unlock()
}

func (s *serverReporter) OnMetadataFetched(url string, result metadata.Result, err error) {
	s.app.mu.Lock()
	s.app.metadataFetched++
	if err != nil {
		s.app.errors++
	}
	s.app.mu.Unlock()
	if err != nil {
		s.app.logs.Add(fmt.Sprintf("metadata error for %s: %v", url, err))
		return
	}
	if result.IsVideo {
		s.app.logs.Add(fmt.Sprintf("video detected: %s", url))
	}
}

func (s *serverReporter) OnLog(line string) {
	s.app.logs.Add(line)
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

func coalesceInt(value int, fallback int) int {
	if value <= 0 {
		return fallback
	}
	return value
}

func ensureDBPath(domain string, explicitPath string) (string, error) {
	if explicitPath != "" {
		if err := os.MkdirAll(filepath.Dir(explicitPath), 0o755); err != nil {
			return "", err
		}
		return explicitPath, nil
	}

	parsed := strings.TrimSpace(domain)
	if parsed == "" {
		return "", fmt.Errorf("domain is required to auto-generate db path")
	}
	safeDomain := sanitizeName(parsed)
	if strings.Contains(parsed, "://") {
		if u, err := url.Parse(parsed); err == nil {
			if u.Host != "" {
				safeDomain = sanitizeName(u.Host)
			}
		}
	}
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
