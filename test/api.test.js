/* API tests. The same checks run against BOTH stores (memory and
   SQLite) to prove they behave identically. Run with: npm test */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { createMemoryStore } = require('../src/memory-store');
const { createSqliteStore } = require('../src/sqlite-store');

const STORES = {
  memory: () => createMemoryStore(),
  sqlite: () => createSqliteStore({ file: ':memory:' })
};

for (const [name, makeStore] of Object.entries(STORES)) {
  describe(`API with ${name} store`, () => {
    let server;
    let base;
    let store;

    before(async () => {
      store = makeStore();
      const app = createApp(store, { logRequests: false, allowedOrigins: ['http://localhost:5500'] });
      await new Promise(resolve => { server = app.listen(0, resolve); });
      base = `http://localhost:${server.address().port}/api`;
    });

    after(() => { server.close(); store.close(); });

    async function call(method, path, body, { raw, headers = {} } = {}) {
      const res = await fetch(base + path, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body: raw ?? (body === undefined ? undefined : JSON.stringify(body))
      });
      const text = await res.text();
      return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
    }

    test('GET /books starts empty', async () => {
      const res = await call('GET', '/books');
      assert.equal(res.status, 200);
      assert.deepEqual(res.json.data, []);
    });

    test('POST /books creates a book with defaults (201 + Location)', async () => {
      const res = await call('POST', '/books', { title: '  Dune  ' });
      assert.equal(res.status, 201);
      assert.equal(res.json.data.title, 'Dune');
      assert.equal(res.json.data.status, 'to-read');
      assert.equal(res.headers.get('location'), `/api/books/${res.json.data.id}`);
    });

    test('GET /books/:id returns one book', async () => {
      const created = await call('POST', '/books', { title: 'Sapiens', author: 'Yuval Noah Harari', status: 'reading' });
      const res = await call('GET', `/books/${created.json.data.id}`);
      assert.equal(res.status, 200);
      assert.equal(res.json.data.author, 'Yuval Noah Harari');
    });

    test('GET /books?status= filters, and rejects unknown statuses', async () => {
      const res = await call('GET', '/books?status=reading');
      assert.equal(res.status, 200);
      assert.ok(res.json.data.length > 0);
      assert.ok(res.json.data.every(b => b.status === 'reading'));
      assert.equal((await call('GET', '/books?status=lost')).status, 400);
    });

    test('Rule-breaking values are rejected with 422 and a list of problems', async () => {
      const res = await call('POST', '/books', { status: 'done', rating: 5 });
      assert.equal(res.status, 422);
      assert.equal(res.json.error.details.length, 3);
      assert.equal((await call('POST', '/books', { title: 42 })).status, 422);
      assert.equal((await call('POST', '/books', { title: 'x'.repeat(201) })).status, 422);
    });

    test('Malformed bodies are rejected with 400', async () => {
      assert.equal((await call('POST', '/books', ['not', 'an', 'object'])).status, 400);
      const res = await call('POST', '/books', undefined, { raw: '{"title": ' });
      assert.equal(res.status, 400);
      assert.match(res.json.error.message, /not valid JSON/);
    });

    test('Bodies over 10 KB are rejected with 413', async () => {
      const res = await call('POST', '/books', { title: 'x'.repeat(11000) });
      assert.equal(res.status, 413);
    });

    test('Duplicate books are rejected with 409 (case-insensitive)', async () => {
      await call('POST', '/books', { title: 'Ali and Nino', author: 'Kurban Said' });
      const res = await call('POST', '/books', { title: 'ali and nino', author: 'KURBAN SAID' });
      assert.equal(res.status, 409);
    });

    test('PATCH changes only the fields sent', async () => {
      const created = await call('POST', '/books', { title: 'Emma', author: 'Jane Austen' });
      const id = created.json.data.id;
      const res = await call('PATCH', `/books/${id}`, { status: 'finished' });
      assert.equal(res.status, 200);
      assert.equal(res.json.data.status, 'finished');
      assert.equal(res.json.data.author, 'Jane Austen');
      assert.equal((await call('PATCH', `/books/${id}`, {})).status, 422);
    });

    test('PUT replaces a book', async () => {
      const created = await call('POST', '/books', { title: 'Old title', author: 'Someone', status: 'reading' });
      const res = await call('PUT', `/books/${created.json.data.id}`, { title: 'New title' });
      assert.equal(res.status, 200);
      assert.equal(res.json.data.title, 'New title');
      assert.equal(res.json.data.author, '');
      assert.equal(res.json.data.status, 'to-read');
    });

    test('DELETE removes a book (204), then it is gone (404)', async () => {
      const created = await call('POST', '/books', { title: 'Temporary' });
      const id = created.json.data.id;
      assert.equal((await call('DELETE', `/books/${id}`)).status, 204);
      assert.equal((await call('GET', `/books/${id}`)).status, 404);
      assert.equal((await call('DELETE', `/books/${id}`)).status, 404);
    });

    test('GET /authors counts books per author', async () => {
      await call('POST', '/books', { title: 'Persuasion', author: 'Jane Austen' });
      const res = await call('GET', '/authors');
      assert.equal(res.status, 200);
      assert.equal(res.json.data.find(a => a.name === 'Jane Austen').bookCount, 2);
    });

    test('Invalid ids give 400, unknown routes give 404', async () => {
      assert.equal((await call('GET', '/books/abc')).status, 400);
      assert.equal((await call('GET', '/books/0')).status, 400);
      assert.equal((await call('GET', '/nothing-here')).status, 404);
    });

    test('CORS: allowed origins get headers and a 204 preflight', async () => {
      const preflight = await fetch(`${base}/books`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'http://localhost:5500',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'content-type'
        }
      });
      assert.equal(preflight.status, 204);
      assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5500');
      assert.match(preflight.headers.get('access-control-allow-methods'), /POST/);
    });

    test('CORS: other origins get no permission header', async () => {
      const res = await call('GET', '/books', undefined, { headers: { Origin: 'https://evil.example' } });
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });
  });
}
