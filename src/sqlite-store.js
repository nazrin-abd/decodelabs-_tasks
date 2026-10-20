/* =========================================================
   SQLite data store (Project 3). The default store.
   Same methods as the in-memory store from Project 2
   (list, get, create, update, remove), but the data now lives
   in a SQLite file and survives server restarts.

   Uses node:sqlite, the SQLite driver built into Node.js,
   so there is nothing to compile or install.

   Security: every query is a prepared statement with "?"
   placeholders. User input is passed as a parameter and is
   always treated as data, never as SQL, so SQL injection
   like  ' OR 1=1 --  does nothing.
   ========================================================= */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DEFAULT_FILE = path.join(__dirname, '..', 'data', 'shelf.db');
const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

// Every read goes through this SELECT, which JOINs the author table
// and renames columns to the camelCase the API returns.
const SELECT_BOOK = `
  SELECT b.id,
         b.title,
         coalesce(a.name, '') AS author,
         b.status,
         b.created_at AS createdAt,
         b.updated_at AS updatedAt
  FROM books b
  LEFT JOIN authors a ON a.id = b.author_id`;

function createDatabaseStore({ file = DEFAULT_FILE, seed = [] } = {}) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);
  db.exec(SCHEMA); // creates tables only if they don't exist yet

  // Prepared statements: compiled once, reused with different parameters
  const sql = {
    listAll:      db.prepare(`${SELECT_BOOK} ORDER BY b.id DESC`),
    listByStatus: db.prepare(`${SELECT_BOOK} WHERE b.status = ? ORDER BY b.id DESC`),
    getById:      db.prepare(`${SELECT_BOOK} WHERE b.id = ?`),
    countBooks:   db.prepare('SELECT count(*) AS total FROM books'),

    findAuthor:   db.prepare('SELECT id FROM authors WHERE name = ?'),
    insertAuthor: db.prepare('INSERT INTO authors (name) VALUES (?)'),
    listAuthors:  db.prepare(`
      SELECT a.id, a.name, count(b.id) AS bookCount
      FROM authors a
      LEFT JOIN books b ON b.author_id = a.id
      GROUP BY a.id
      ORDER BY a.name`),
    deleteUnusedAuthors: db.prepare(`
      DELETE FROM authors
      WHERE id NOT IN (SELECT author_id FROM books WHERE author_id IS NOT NULL)`),

    insertBook:   db.prepare('INSERT INTO books (title, author_id, status) VALUES (?, ?, ?)'),
    updateBook:   db.prepare(`UPDATE books SET title = ?, author_id = ?, status = ?, updated_at = ${NOW} WHERE id = ?`),
    deleteBook:   db.prepare('DELETE FROM books WHERE id = ?')
  };

  // Runs several statements as one unit: all succeed, or none do
  function transaction(work) {
    db.exec('BEGIN');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  // Finds the author's id, creating the author row if needed.
  // An empty name means "unknown author" and is stored as NULL.
  function authorIdFor(name) {
    if (!name) return null;
    const existing = sql.findAuthor.get(name);
    if (existing) return existing.id;
    return Number(sql.insertAuthor.run(name).lastInsertRowid);
  }

  // Turns the database's UNIQUE error into the error the API understands (409)
  function translateError(err) {
    const isUnique = err && (err.errcode === 2067 || /UNIQUE constraint failed/.test(err.message));
    if (isUnique) {
      const duplicate = new Error('Duplicate book');
      duplicate.code = 'DUPLICATE';
      return duplicate;
    }
    return err;
  }

  const store = {
    // READ (SQL SELECT)
    list(status) {
      return status ? sql.listByStatus.all(status) : sql.listAll.all();
    },

    get(id) {
      return sql.getById.get(id) || null;
    },

    listAuthors() {
      return sql.listAuthors.all();
    },

    // CREATE (SQL INSERT)
    create({ title, author, status }) {
      try {
        const id = transaction(() => {
          const authorId = authorIdFor(author);
          return Number(sql.insertBook.run(title, authorId, status).lastInsertRowid);
        });
        return store.get(id);
      } catch (err) {
        throw translateError(err);
      }
    },

    // UPDATE (SQL UPDATE) - accepts full or partial changes
    update(id, changes) {
      const current = store.get(id);
      if (!current) return null;
      const next = { ...current, ...changes };
      try {
        transaction(() => {
          const authorId = authorIdFor(next.author);
          sql.updateBook.run(next.title, authorId, next.status, id);
          sql.deleteUnusedAuthors.run();
        });
        return store.get(id);
      } catch (err) {
        throw translateError(err);
      }
    },

    // DELETE (SQL DELETE)
    remove(id) {
      return transaction(() => {
        const { changes } = sql.deleteBook.run(id);
        sql.deleteUnusedAuthors.run(); // tidy up authors with no books left
        return changes > 0;
      });
    },

    close() {
      db.close();
    }
  };

  // Add sample books the first time the database is created
  if (seed.length && sql.countBooks.get().total === 0) {
    seed.forEach(book => store.create(book));
  }

  return store;
}

module.exports = { createSqliteStore: createDatabaseStore };
