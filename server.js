/* =========================================================
   Entry point. Picks a data store, builds the app, starts
   the server and shuts down cleanly on Ctrl+C.

   Environment variables (all optional):
     PORT             port to listen on (default 3000)
     STORE            "sqlite" (default) or "memory"
     DB_FILE          path to the SQLite file (default data/shelf.db)
     ALLOWED_ORIGINS  comma-separated list of other sites allowed to
                      call the API, e.g. http://localhost:5500
   ========================================================= */

const { createApp } = require('./src/app');
const SAMPLE_BOOKS = require('./src/sample-books');

const PORT = Number(process.env.PORT) || 3000;
const STORE = (process.env.STORE || 'sqlite').toLowerCase();
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

function createStore() {
  if (STORE === 'memory') {
    const { createMemoryStore } = require('./src/memory-store');
    return createMemoryStore({ seed: SAMPLE_BOOKS });
  }
  if (STORE === 'sqlite') {
    const { createSqliteStore } = require('./src/sqlite-store');
    return createSqliteStore({ file: process.env.DB_FILE || undefined, seed: SAMPLE_BOOKS });
  }
  console.error(`Unknown STORE "${STORE}". Use "sqlite" or "memory".`);
  process.exit(1);
}

const store = createStore();
const app = createApp(store, { allowedOrigins: ALLOWED_ORIGINS });

const server = app.listen(PORT, () => {
  console.log(`Shelf is running at http://localhost:${PORT}  (store: ${STORE})`);
  console.log(`API: http://localhost:${PORT}/api/books`);
  if (ALLOWED_ORIGINS.length) console.log(`CORS allowed for: ${ALLOWED_ORIGINS.join(', ')}`);
});

function shutdown() {
  server.close(() => {
    store.close();
    console.log('Server stopped.');
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
