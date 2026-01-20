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

CREATE TABLE IF NOT EXISTS pages (
	url TEXT PRIMARY KEY,
	title TEXT,
	description TEXT,
	keywords TEXT,
	content_type TEXT,
	status_code INTEGER,
	last_seen TIMESTAMP NOT NULL,
	fetched_at TIMESTAMP
);

CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
	url,
	title,
	description,
	keywords,
	content='pages',
	content_rowid='rowid'
);

CREATE TRIGGER IF NOT EXISTS pages_ai AFTER INSERT ON pages BEGIN
	INSERT INTO pages_fts(rowid, url, title, description, keywords)
	VALUES (new.rowid, new.url, new.title, new.description, new.keywords);
END;

CREATE TRIGGER IF NOT EXISTS pages_ad AFTER DELETE ON pages BEGIN
	INSERT INTO pages_fts(pages_fts, rowid, url, title, description, keywords)
	VALUES ('delete', old.rowid, old.url, old.title, old.description, old.keywords);
END;

CREATE TRIGGER IF NOT EXISTS pages_au AFTER UPDATE ON pages BEGIN
	INSERT INTO pages_fts(pages_fts, rowid, url, title, description, keywords)
	VALUES ('delete', old.rowid, old.url, old.title, old.description, old.keywords);
	INSERT INTO pages_fts(rowid, url, title, description, keywords)
	VALUES (new.rowid, new.url, new.title, new.description, new.keywords);
END;
`

type Entry struct {
	URL         string
	Title       string
	Description string
	Keywords    string
	ContentType string
	StatusCode  int
	LastSeen    time.Time
	FetchedAt   *time.Time
}

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

func Upsert(dbConn *sql.DB, entry Entry) error {
	_, err := dbConn.Exec(`
		INSERT INTO pages (url, title, description, keywords, content_type, status_code, last_seen, fetched_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(url) DO UPDATE SET
			title=excluded.title,
			description=excluded.description,
			keywords=excluded.keywords,
			content_type=excluded.content_type,
			status_code=excluded.status_code,
			last_seen=excluded.last_seen,
			fetched_at=excluded.fetched_at
	`,
		entry.URL,
		entry.Title,
		entry.Description,
		entry.Keywords,
		entry.ContentType,
		entry.StatusCode,
		entry.LastSeen,
		entry.FetchedAt,
	)
	return err
}

func NeedsFetch(dbConn *sql.DB, url string) (bool, error) {
	var fetchedAt sql.NullTime
	err := dbConn.QueryRow("SELECT fetched_at FROM pages WHERE url = ?", url).Scan(&fetchedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return true, nil
		}
		return false, err
	}
	return !fetchedAt.Valid, nil
}

func Search(dbConn *sql.DB, query string, limit int, offset int) ([]Entry, error) {
	if query == "" {
		rows, err := dbConn.Query(`
			SELECT url, title, description, keywords, content_type, status_code, last_seen, fetched_at
			FROM pages
			ORDER BY last_seen DESC
			LIMIT ? OFFSET ?
		`, limit, offset)
		if err != nil {
			return nil, err
		}
		defer rows.Close()
		return scanRows(rows)
	}

	rows, err := dbConn.Query(`
		SELECT url, title, description, keywords, content_type, status_code, last_seen, fetched_at
		FROM pages
		WHERE rowid IN (SELECT rowid FROM pages_fts WHERE pages_fts MATCH ?)
		ORDER BY last_seen DESC
		LIMIT ? OFFSET ?
	`, query, limit, offset)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanRows(rows)
}

func scanRows(rows *sql.Rows) ([]Entry, error) {
	results := []Entry{}
	for rows.Next() {
		var entry Entry
		var fetchedAt sql.NullTime
		err := rows.Scan(
			&entry.URL,
			&entry.Title,
			&entry.Description,
			&entry.Keywords,
			&entry.ContentType,
			&entry.StatusCode,
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

func DefaultEntry(url string) Entry {
	return Entry{
		URL:      url,
		LastSeen: time.Now().UTC(),
	}
}
