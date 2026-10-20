/* =========================================================
   In-memory data store (Project 2).
   Data lives in an array while the server runs and resets
   when it restarts. The SQLite store (Project 3) has exactly
   the same methods, so the API can use either one.
   Run with:  npm run start:memory
   ========================================================= */

function createMemoryStore({ seed = [] } = {}) {
  let books = [];
  let nextId = 1;

  const same = (a, b) => a.toLowerCase() === b.toLowerCase();

  function isDuplicate(title, author, ignoreId) {
    return books.some(b => b.id !== ignoreId && same(b.title, title) && same(b.author, author));
  }

  function duplicateError() {
    const err = new Error('Duplicate book');
    err.code = 'DUPLICATE';
    return err;
  }

  const store = {
    list(status) {
      const result = status ? books.filter(b => b.status === status) : books;
      return [...result].sort((a, b) => b.id - a.id); // newest first
    },

    get(id) {
      return books.find(b => b.id === id) || null;
    },

    listAuthors() {
      const counts = new Map();
      books.filter(b => b.author).forEach(b => {
        const key = b.author.toLowerCase();
        const entry = counts.get(key) || { name: b.author, bookCount: 0 };
        entry.bookCount++;
        counts.set(key, entry);
      });
      return [...counts.values()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a, i) => ({ id: i + 1, ...a }));
    },

    create({ title, author, status }) {
      if (isDuplicate(title, author)) throw duplicateError();
      const now = new Date().toISOString();
      const book = { id: nextId++, title, author, status, createdAt: now, updatedAt: now };
      books.push(book);
      return { ...book };
    },

    update(id, changes) {
      const book = books.find(b => b.id === id);
      if (!book) return null;
      const merged = { ...book, ...changes };
      if (isDuplicate(merged.title, merged.author, id)) throw duplicateError();
      Object.assign(book, changes, { updatedAt: new Date().toISOString() });
      return { ...book };
    },

    remove(id) {
      const before = books.length;
      books = books.filter(b => b.id !== id);
      return books.length < before;
    },

    close() {}
  };

  seed.forEach(book => store.create(book));
  return store;
}

module.exports = { createMemoryStore };
