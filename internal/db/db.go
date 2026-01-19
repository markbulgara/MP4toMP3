package db

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

const schema = `
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
PRAGMA temp_store=MEMORY;
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS urls (
	url TEXT PRIMARY KEY,
	title TEXT,
	description TEXT,
	keywords TEXT,
	content_type TEXT,
	tag TEXT,
	attribute TEXT,
	source TEXT,
	depth INTEGER,
	status_code INTEGER,
	video_urls TEXT,
	is_video INTEGER DEFAULT 0,
	last_seen TIMESTAMP NOT NULL,
	fetched_at TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS urls_fts USING fts5(
	url,
	title,
	description,
	keywords,
	tag,
	source,
	content_type,
	content='urls',
	content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS urls_ai AFTER INSERT ON urls BEGIN
	INSERT INTO urls_fts(rowid, url, title, description, keywords, tag, source, content_type)
	VALUES (new.rowid, new.url, new.title, new.description, new.keywords, new.tag, new.source, new.content_type);
END;

CREATE TRIGGER IF NOT EXISTS urls_ad AFTER DELETE ON urls BEGIN
	INSERT INTO urls_fts(urls_fts, rowid, url, title, description, keywords, tag, source, content_type)
	VALUES ('delete', old.rowid, old.url, old.title, old.description, old.keywords, old.tag, old.source, old.content_type);
END;

CREATE TRIGGER IF NOT EXISTS urls_au AFTER UPDATE ON urls BEGIN
	INSERT INTO urls_fts(urls_fts, rowid, url, title, description, keywords, tag, source, content_type)
	VALUES ('delete', old.rowid, old.url, old.title, old.description, old.keywords, old.tag, old.source, old.content_type);
	INSERT INTO urls_fts(rowid, url, title, description, keywords, tag, source, content_type)
	VALUES (new.rowid, new.url, new.title, new.description, new.keywords, new.tag, new.source, new.content_type);
END;
`

func Open(path string) (*sql.DB, error) {
	if path == "" {
		return nil, fmt.Errorf("db path is required")
	}

	db, err := sql.Open("sqlite3", fmt.Sprintf("file:%s?_busy_timeout=5000&_journal_mode=WAL", filepath.ToSlash(path)))
	if err != nil {
		return nil, err
	}

	if _, err := db.Exec(schema); err != nil {
		_ = db.Close()
		return nil, err
	}

	return db, nil
}

func UpsertURL(db *sql.DB, entry URLEntry) error {
	_, err := db.Exec(`
		INSERT INTO urls (
			url, title, description, keywords, content_type, tag, attribute, source, depth,
			status_code, video_urls, is_video, last_seen, fetched_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(url) DO UPDATE SET
			title=excluded.title,
			description=excluded.description,
			keywords=excluded.keywords,
			content_type=excluded.content_type,
			tag=excluded.tag,
			attribute=excluded.attribute,
			source=excluded.source,
			depth=excluded.depth,
			status_code=excluded.status_code,
			video_urls=excluded.video_urls,
			is_video=excluded.is_video,
			last_seen=excluded.last_seen,
			fetched_at=excluded.fetched_at
	`,
		entry.URL,
		entry.Title,
		entry.Description,
		entry.Keywords,
		entry.ContentType,
		entry.Tag,
		entry.Attribute,
		entry.Source,
		entry.Depth,
		entry.StatusCode,
		entry.VideoURLs,
		entry.IsVideo,
		entry.LastSeen,
		entry.FetchedAt,
	)
	return err
}

func NeedsMetadata(db *sql.DB, url string) (bool, error) {
	var fetchedAt sql.NullTime
	err := db.QueryRow("SELECT fetched_at FROM urls WHERE url = ?", url).Scan(&fetchedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return true, nil
		}
		return false, err
	}
	return !fetchedAt.Valid, nil
}

func MarkFetched(db *sql.DB, url string, fetchedAt time.Time) error {
	_, err := db.Exec("UPDATE urls SET fetched_at = ? WHERE url = ?", fetchedAt, url)
	return err
}

func Search(db *sql.DB, query string, limit int, offset int) ([]URLEntry, error) {
	if query == "" {
		rows, err := db.Query(`
			SELECT url, title, description, keywords, content_type, tag, attribute, source, depth,
			status_code, video_urls, is_video, last_seen, fetched_at
			FROM urls
			ORDER BY last_seen DESC
			LIMIT ? OFFSET ?
		`, limit, offset)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanRows(rows)
	}

	rows, err := db.Query(`
		SELECT url, title, description, keywords, content_type, tag, attribute, source, depth,
		status_code, video_urls, is_video, last_seen, fetched_at
		FROM urls
		WHERE rowid IN (
			SELECT rowid FROM urls_fts WHERE urls_fts MATCH ?
		)
		ORDER BY last_seen DESC
		LIMIT ? OFFSET ?
	`, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRows(rows)
}

func scanRows(rows *sql.Rows) ([]URLEntry, error) {
	results := []URLEntry{}
	for rows.Next() {
		var entry URLEntry
		var fetchedAt sql.NullTime
		err := rows.Scan(
			&entry.URL,
			&entry.Title,
			&entry.Description,
			&entry.Keywords,
			&entry.ContentType,
			&entry.Tag,
			&entry.Attribute,
			&entry.Source,
			&entry.Depth,
			&entry.StatusCode,
			&entry.VideoURLs,
			&entry.IsVideo,
			&entry.LastSeen,
			&fetchedAt,
		)
		if err != nil {
			return nil, err
		}
		if fetchedAt.Valid {
			entry.FetchedAt = &fetchedAt.Time
		}
		results = append(results, entry)
	}
	return results, rows.Err()
}

func Count(db *sql.DB) (int, error) {
	var count int
	err := db.QueryRow("SELECT COUNT(1) FROM urls").Scan(&count)
	return count, err
}

func DefaultEntry(url string) URLEntry {
	return URLEntry{
		URL:      url,
		LastSeen: time.Now().UTC(),
	}
}

type URLEntry struct {
	URL         string
	Title       string
	Description string
	Keywords    string
	ContentType string
	Tag         string
	Attribute   string
	Source      string
	Depth       int
	StatusCode  int
	VideoURLs   string
	IsVideo     int
	LastSeen    time.Time
	FetchedAt   *time.Time
}
