/* Database-specific tests (Project 3). Run with: npm test */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createSqliteStore } = require('../src/sqlite-store');

const SCHEMA = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');

test('Authors live in their own table and are shared between books (one-to-many)', () => {
  const store = createSqliteStore({ file: ':memory:' });
  store.create({ title: 'Emma', author: 'Jane Austen', status: 'to-read' });
  store.create({ title: 'Persuasion', author: 'jane austen', status: 'to-read' });
  const authors = store.listAuthors();
  assert.equal(authors.length, 1); // same author, case-insensitive
  assert.equal(authors[0].bookCount, 2);
  store.close();
});

test('Authors with no books left are removed', () => {
  const store = createSqliteStore({ file: ':memory:' });
  const book = store.create({ title: 'Solo', author: 'One-Book Author', status: 'to-read' });
  store.remove(book.id);
  assert.equal(store.listAuthors().length, 0);
  store.close();
});

test('SQL injection input is stored as plain text, not run as SQL', () => {
  const store = createSqliteStore({ file: ':memory:' });
  store.create({ title: 'Normal', author: '', status: 'to-read' });
  const evil = "x'); DROP TABLE books; --";
  const book = store.create({ title: evil, author: "' OR 1=1 --", status: 'to-read' });
  assert.equal(book.title, evil);
  assert.equal(store.list().length, 2); // table still exists, nothing else changed
  store.close();
});

test('Schema constraints block bad data even if the API is bypassed', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  assert.throws(() => db.exec("INSERT INTO books (title, status) VALUES ('A', 'lost')"), /CHECK constraint/);
  assert.throws(() => db.exec('INSERT INTO books (title) VALUES (NULL)'), /NOT NULL/);
  assert.throws(() => db.exec("INSERT INTO books (title) VALUES ('   ')"), /CHECK constraint/);
  assert.throws(() => db.exec("INSERT INTO books (title, author_id) VALUES ('B', 999)"), /FOREIGN KEY/);
  db.exec("INSERT INTO books (title) VALUES ('Same')");
  assert.throws(() => db.exec("INSERT INTO books (title) VALUES ('SAME')"), /UNIQUE/);
  db.close();
});

test('Data survives a restart (persistence)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelf-'));
  const file = path.join(dir, 'shelf.db');

  const first = createSqliteStore({ file });
  first.create({ title: 'Kept', author: 'Writer', status: 'reading' });
  first.close();

  const second = createSqliteStore({ file }); // like restarting the server
  assert.equal(second.list()[0].title, 'Kept');
  second.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Sample books are only added to an empty database', () => {
  const seed = [{ title: 'Seeded', author: 'A', status: 'to-read' }];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shelf-'));
  const file = path.join(dir, 'shelf.db');
  createSqliteStore({ file, seed }).close();
  const again = createSqliteStore({ file, seed });
  assert.equal(again.list().length, 1);
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
