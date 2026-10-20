-- =========================================================
-- Shelf database schema (SQLite)
--
--   authors 1 ──< many books
--
-- One author can have many books; each book has at most one
-- author. books.author_id is a foreign key to authors.id.
-- The database enforces the rules itself (NOT NULL, UNIQUE,
-- CHECK, FOREIGN KEY), so bad data can't get in even if the
-- application code has a bug.
-- =========================================================

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS authors (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT    NOT NULL UNIQUE COLLATE NOCASE
        CHECK (length(trim(name)) BETWEEN 1 AND 100)
);

CREATE TABLE IF NOT EXISTS books (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL COLLATE NOCASE
              CHECK (length(trim(title)) BETWEEN 1 AND 200),
  author_id   INTEGER REFERENCES authors(id) ON DELETE RESTRICT,
  status      TEXT    NOT NULL DEFAULT 'to-read'
              CHECK (status IN ('to-read', 'reading', 'finished')),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- The same title by the same author can only be on the shelf once
-- (ifnull treats "no author" as one value, so duplicates without an author are caught too)
CREATE UNIQUE INDEX IF NOT EXISTS books_title_author_unique
  ON books (title, ifnull(author_id, 0));

-- Speeds up GET /api/books?status=...
CREATE INDEX IF NOT EXISTS books_status_idx ON books (status);

-- Speeds up joins and the foreign key check
CREATE INDEX IF NOT EXISTS books_author_idx ON books (author_id);
