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

CREATE TABLE IF NOT EXISTS urls (
	url TEXT PRIMARY KEY,
	first_seen TEXT NOT NULL,
	last_seen TEXT NOT NULL,
	source TEXT,
	status INTEGER,
	content_type TEXT,
	title TEXT,
	fetched_at TEXT,
	bytes INTEGER
);

CREATE TABLE IF NOT EXISTS url_sources (
	url TEXT NOT NULL,
	source TEXT NOT NULL,
	seen_at TEXT NOT NULL,
	PRIMARY KEY (url, source)
);
`

type Entry struct {
	URL         string
	FirstSeen   time.Time
	LastSeen    time.Time
	Source      string
	Status      *int
	ContentType string
	Title       string
	FetchedAt   *time.Time
	Bytes       *int64
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

func UpsertURL(dbConn *sql.DB, url string, source string, seenAt time.Time) error {
	now := seenAt.UTC().Format(time.RFC3339)
	_, err := dbConn.Exec(`
		INSERT INTO urls (url, first_seen, last_seen, source)
		VALUES (?, ?, ?, ?)
		ON CONFLICT(url) DO UPDATE SET
			last_seen=excluded.last_seen,
			source=excluded.source
	`, url, now, now, source)
	return err
}

func RecordSource(dbConn *sql.DB, url string, source string, seenAt time.Time) error {
	if url == "" || source == "" {
		return nil
	}
	_, err := dbConn.Exec(`
		INSERT OR IGNORE INTO url_sources (url, source, seen_at)
		VALUES (?, ?, ?)
	`, url, source, seenAt.UTC().Format(time.RFC3339))
	return err
}

func NeedsFetch(dbConn *sql.DB, url string) (bool, error) {
	var fetchedAt sql.NullString
	err := dbConn.QueryRow("SELECT fetched_at FROM urls WHERE url = ?", url).Scan(&fetchedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return true, nil
		}
		return false, err
	}
	return !fetchedAt.Valid, nil
}

func UpdateMetadata(dbConn *sql.DB, entry Entry) error {
	var status sql.NullInt64
	if entry.Status != nil {
		status = sql.NullInt64{Int64: int64(*entry.Status), Valid: true}
	}
	var fetchedAt sql.NullString
	if entry.FetchedAt != nil {
		fetchedAt = sql.NullString{String: entry.FetchedAt.UTC().Format(time.RFC3339), Valid: true}
	}
	var bytes sql.NullInt64
	if entry.Bytes != nil {
		bytes = sql.NullInt64{Int64: *entry.Bytes, Valid: true}
	}

	_, err := dbConn.Exec(`
		UPDATE urls SET
			status = ?,
			content_type = ?,
			title = ?,
			fetched_at = ?,
			bytes = ?
		WHERE url = ?
	`,
		status,
		entry.ContentType,
		entry.Title,
		fetchedAt,
		bytes,
		entry.URL,
	)
	return err
}

func Search(dbConn *sql.DB, query string, limit int, offset int) ([]Entry, error) {
	if query == "" {
		rows, err := dbConn.Query(`
			SELECT url, first_seen, last_seen, source, status, content_type, title, fetched_at, bytes
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

	likeQuery := "%" + query + "%"
	rows, err := dbConn.Query(`
		SELECT url, first_seen, last_seen, source, status, content_type, title, fetched_at, bytes
		FROM urls
		WHERE url LIKE ? OR title LIKE ?
		ORDER BY last_seen DESC
		LIMIT ? OFFSET ?
	`, likeQuery, likeQuery, limit, offset)
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
		var firstSeen sql.NullString
		var lastSeen sql.NullString
		var status sql.NullInt64
		var fetchedAt sql.NullString
		var bytes sql.NullInt64
		err := rows.Scan(
			&entry.URL,
			&firstSeen,
			&lastSeen,
			&entry.Source,
			&status,
			&entry.ContentType,
			&entry.Title,
			&fetchedAt,
			&bytes,
		)
		if err != nil {
			return nil, err
		}
		if firstSeen.Valid {
			if parsed, err := time.Parse(time.RFC3339, firstSeen.String); err == nil {
				entry.FirstSeen = parsed
			}
		}
		if lastSeen.Valid {
			if parsed, err := time.Parse(time.RFC3339, lastSeen.String); err == nil {
				entry.LastSeen = parsed
			}
		}
		if status.Valid {
			value := int(status.Int64)
			entry.Status = &value
		}
		if fetchedAt.Valid {
			if parsed, err := time.Parse(time.RFC3339, fetchedAt.String); err == nil {
				entry.FetchedAt = &parsed
			}
		}
		if bytes.Valid {
			value := bytes.Int64
			entry.Bytes = &value
		}
		results = append(results, entry)
	}
	return results, rows.Err()
}
