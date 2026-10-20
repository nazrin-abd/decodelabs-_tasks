/* =========================================================
   The API: routes, status codes, CORS and error handling.
   createApp(store) works with any store that has the same
   methods (list, get, listAuthors, create, update, remove),
   so the routes don't care whether data is in memory or SQLite.
   ========================================================= */

const path = require('node:path');
const express = require('express');
const { validateBook, parseId, STATUSES } = require('./validation');

/** Consistent error shape: { error: { status, message, details? } } */
function sendError(res, status, message, details) {
  const error = { status, message };
  if (details && details.length) error.details = details;
  return res.status(status).json({ error });
}

/**
 * CORS: the browser blocks a page on one origin (e.g. localhost:5500)
 * from reading responses from another (localhost:3000) unless the
 * server says it's allowed. The frontend in /public is served from
 * the same origin, so it never needs this. Other origins must be
 * listed in ALLOWED_ORIGINS.
 */
function cors(allowedOrigins) {
  return (req, res, next) => {
    const origin = req.get('Origin');
    if (origin && allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Accept');
      res.set('Access-Control-Max-Age', '600');
    }
    res.vary('Origin');
    // Preflight: the browser asks "may I?" with OPTIONS before the real request
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  };
}

function createApp(store, { logRequests = true, allowedOrigins = [] } = {}) {
  const app = express();
  app.disable('x-powered-by');

  if (logRequests) {
    app.use((req, res, next) => {
      const started = Date.now();
      res.on('finish', () => {
        console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - started}ms)`);
      });
      next();
    });
  }

  app.use('/api', cors(allowedOrigins));

  // Parse JSON bodies, refusing anything over 10 KB
  app.use(express.json({ limit: '10kb' }));

  // Serve the frontend
  app.use(express.static(path.join(__dirname, '..', 'public')));

  const api = express.Router();

  // Validates the :id and loads the book, or answers 400/404
  function loadBook(req, res, next) {
    const id = parseId(req.params.id);
    if (id === null) return sendError(res, 400, 'Book id must be a positive whole number.');
    const book = store.get(id);
    if (!book) return sendError(res, 404, `No book found with id ${id}.`);
    req.book = book;
    next();
  }

  // 400 = the request is malformed (not a JSON object)
  // 422 = well-formed, but the values break the rules
  function rejectInvalid(res, errors, message) {
    const status = errors.malformed ? 400 : 422;
    return sendError(res, status, message, errors);
  }

  function handleWriteError(res, err) {
    if (err && err.code === 'DUPLICATE') {
      return sendError(res, 409, 'This book is already on your shelf.');
    }
    throw err; // anything else becomes a 500
  }

  // GET /api/health
  api.get('/health', (req, res) => {
    res.json({ data: { status: 'ok', time: new Date().toISOString() } });
  });

  // GET /api/books  (optional ?status=reading)
  api.get('/books', (req, res) => {
    const { status } = req.query;
    if (status !== undefined && !STATUSES.includes(status)) {
      return sendError(res, 400, `"status" filter must be one of: ${STATUSES.join(', ')}.`);
    }
    res.json({ data: store.list(status) });
  });

  // GET /api/books/:id
  api.get('/books/:id', loadBook, (req, res) => {
    res.json({ data: req.book });
  });

  // POST /api/books
  api.post('/books', (req, res) => {
    const { errors, value } = validateBook(req.body);
    if (errors.length) return rejectInvalid(res, errors, 'The book could not be added.');
    try {
      const book = store.create(value);
      res.status(201).location(`/api/books/${book.id}`).json({ data: book });
    } catch (err) {
      handleWriteError(res, err);
    }
  });

  // PUT /api/books/:id  (replace: title required, others reset to defaults)
  api.put('/books/:id', loadBook, (req, res) => {
    const { errors, value } = validateBook(req.body);
    if (errors.length) return rejectInvalid(res, errors, 'The book could not be updated.');
    try {
      res.json({ data: store.update(req.book.id, value) });
    } catch (err) {
      handleWriteError(res, err);
    }
  });

  // PATCH /api/books/:id  (change only the fields sent)
  api.patch('/books/:id', loadBook, (req, res) => {
    const { errors, value } = validateBook(req.body, { partial: true });
    if (errors.length) return rejectInvalid(res, errors, 'The book could not be updated.');
    try {
      res.json({ data: store.update(req.book.id, value) });
    } catch (err) {
      handleWriteError(res, err);
    }
  });

  // DELETE /api/books/:id
  api.delete('/books/:id', loadBook, (req, res) => {
    store.remove(req.book.id);
    res.status(204).end();
  });

  // GET /api/authors  (each author with their number of books)
  api.get('/authors', (req, res) => {
    res.json({ data: store.listAuthors() });
  });

  app.use('/api', api);

  // Unknown /api route -> JSON 404 (not an HTML page)
  app.use('/api', (req, res) => {
    sendError(res, 404, `No endpoint for ${req.method} ${req.originalUrl}.`);
  });

  // Error handler: bad JSON, oversized body, or an unexpected crash
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return sendError(res, 400, 'Request body is not valid JSON.');
    }
    if (err.type === 'entity.too.large') {
      return sendError(res, 413, 'Request body is too large (limit 10 KB).');
    }
    console.error(err); // full details stay on the server
    sendError(res, 500, 'Something went wrong on the server. Please try again.');
  });

  return app;
}

module.exports = { createApp };
