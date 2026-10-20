# Shelf — a full-stack reading tracker

Shelf helps you keep track of books: add the ones you want to read, mark the ones you've started, and watch your shelf fill up as you finish them.

It's built in four stages for the **DecodeLabs Full Stack Development** internship (Batch 2026), with no frontend framework:

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3 (Grid, Flexbox, container queries), vanilla JavaScript (ES modules) |
| Backend | Node.js, Express 5, REST API |
| Database | SQLite (through `node:sqlite`, built into Node) |
| Tests | Node's built-in test runner (`node --test`) |

## Quick start

You need **Node.js 22.13 or newer**. Check with `node --version`.

```bash
npm install
npm start
```

Then open **http://localhost:3000**.

> Open the app through the server, not by double-clicking `index.html`. The frontend loads its data from the API, and browsers block module scripts on `file://` pages.

On first start, the database is created at `data/shelf.db` with four sample books.

### Other commands

| Command | What it does |
|---|---|
| `npm test` | Runs 36 automated tests (the API against both stores, database rules, CORS) |
| `npm run dev` | Starts the server and restarts it when you edit a file |
| `npm run start:memory` | Uses the in-memory store from Project 2 instead of SQLite (data resets on restart) |
| `npm run reset-db` | Deletes the database. It's recreated with sample books on next start |

### Settings

All optional, set as environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `STORE` | `sqlite` | `sqlite` or `memory` |
| `DB_FILE` | `data/shelf.db` | Where the SQLite file lives |
| `ALLOWED_ORIGINS` | none | Other sites allowed to call the API (CORS), comma-separated |

## Project structure

```
shelf/
├── public/                  Frontend (Projects 1 and 4)
│   ├── index.html           semantic page structure
│   ├── style.css            mobile-first responsive styles
│   ├── api.js               the only code that talks to the server
│   └── script.js            state, rendering and events
├── src/                     Backend
│   ├── app.js               routes, status codes, CORS, error handling (Project 2)
│   ├── validation.js        request validation (Project 2)
│   ├── memory-store.js      in-memory store (Project 2)
│   ├── sqlite-store.js      database store, all SQL lives here (Project 3)
│   └── sample-books.js      starter data
├── schema.sql               tables, keys and constraints (Project 3)
├── server.js                picks a store and starts the server
├── test/
│   ├── api.test.js          every endpoint, run against both stores
│   └── sqlite.test.js       constraints, injection, persistence
└── docs/API.md              full API reference
```

## How it works

```
 Browser (public/)                 Server (src/)                     Database
┌──────────────────┐   fetch()    ┌──────────────────────────┐  SQL  ┌──────────────┐
│ user clicks      │ ───────────► │ app.js: route            │ ────► │ authors      │
│ api.js: request  │   JSON       │ validation.js: check     │       │ books        │
│ script.js:       │ ◄─────────── │ sqlite-store.js: query   │ ◄──── │ (shelf.db)   │
│ update state,    │ status code  │ reply with JSON + code   │ rows  └──────────────┘
│ redraw the DOM   │              └──────────────────────────┘
└──────────────────┘
```

1. **Input.** The user does something. `script.js` calls a function in `api.js`.
2. **Process.** The server validates the request, runs a parameterized SQL query and replies with JSON and a status code.
3. **Output.** The frontend checks the status, updates its state and redraws the page from that state.

The routes in `app.js` receive the store as a parameter, so they work the same with the in-memory store or SQLite. The tests run every API check against both.

---

## Project 1: Responsive Frontend Interface

**Brief:** build a responsive interface with HTML, CSS and basic JavaScript, with a clean, user-friendly UI.

| Requirement | Where |
|---|---|
| HTML, CSS, JavaScript, no frameworks | `public/` |
| Semantic HTML5 landmarks | `header`, `nav`, `main`, `section`, `article` (each book), `aside` (the shelf), `footer` in `index.html` |
| Mobile-first layout | One column by default. `min-width` breakpoints at **768px** (tablet) and **1024px** (desktop) in `style.css` |
| CSS Grid for page layout, Flexbox for components | `.layout` uses Grid; header, nav, filters and card buttons use Flexbox |
| Container queries | The book list goes from 1 to 2 to 3 columns based on its own width (`@container library`) |
| Fluid typography | Type scale built with `clamp()` |
| 2025 palette and type rules | Mocha Mousse `#A5856F`, Ethereal Blue `#A0D4E0`, Moonlit Grey `#F2F0EA`. Montserrat and Open Sans: 2 families, 3 weights |
| Accessibility (WCAG) | Skip link, AA contrast text colours, visible focus, `aria-expanded` menu, `aria-pressed` filters, `aria-invalid` form errors, live-region announcements, 40–44px touch targets, `prefers-reduced-motion` respected |

## Project 2: Backend API Development

**Brief:** create GET and POST endpoints, handle user input and responses, validate basic data.

| Requirement | Where |
|---|---|
| GET and POST endpoints | `GET /api/books`, `GET /api/books/:id`, `POST /api/books` in `src/app.js`. PUT, PATCH and DELETE are added too |
| RESTful naming | Nouns for resources (`/books`), HTTP methods for actions. No `/getBooks` |
| Handle input and responses | JSON parsing with a 10 KB limit. Every reply is `{ data }` or `{ error }` |
| Validate data ("never trust the client") | `src/validation.js` checks the format (is it a JSON object, are types right) and the rules (title required, length limits, allowed statuses, unknown fields rejected) |
| Meaningful status codes | 200, 201 + `Location`, 204, 400, 404, 409, 413, 422, 500 |
| Errors never crash or leak | One error handler turns bad JSON, oversized bodies and crashes into clean JSON errors. Stack traces stay in the server log |
| Documentation | `docs/API.md` |

The original in-memory store is kept in `src/memory-store.js`. Run it with `npm run start:memory`.

## Project 3: Database Integration

**Brief:** design a simple database schema, perform CRUD operations, ensure proper data handling.

**Schema** (`schema.sql`): two tables in a **one-to-many** relationship. One author can have many books.

```
authors (id PK, name UNIQUE)  1 ──< many  books (id PK, title, author_id FK → authors.id, status, created_at, updated_at)
```

| Requirement | Where |
|---|---|
| Schema design | `schema.sql`, with primary keys, a foreign key and indexes on `status` and `author_id` |
| Constraints in the database | `NOT NULL`, `UNIQUE` (author names; title + author), `CHECK` (allowed statuses, text lengths), `FOREIGN KEY`. They hold even if the API is bypassed, and a test proves it |
| CRUD | Create = `POST` = `INSERT`, Read = `GET` = `SELECT … JOIN`, Update = `PUT`/`PATCH` = `UPDATE`, Delete = `DELETE` = `DELETE` (`src/sqlite-store.js`) |
| SQL injection protection | Every query is a prepared statement with `?` placeholders. Input such as `' OR 1=1 --` is stored as plain text, and a test checks it |
| Transactions | Inserting an author and a book happens in one `BEGIN … COMMIT`, with `ROLLBACK` on failure |
| Persistence | Data is saved in `data/shelf.db` and survives restarts (tested) |

**Why SQL (and SQLite):** books and authors have a fixed structure and a clear relationship, which relational databases handle best. SQLite stores everything in one file, so there's no database server to install. A native driver with hand-written SQL keeps every query visible.

## Project 4: Frontend and Backend Integration

**Brief:** send requests from the frontend to the backend, display dynamic data in the UI, handle basic errors and responses.

| Requirement | Where |
|---|---|
| Send requests to the backend | `public/api.js` uses `fetch()` with `async`/`await` for all five operations |
| Display dynamic data | Books, the shelf graphic, status counts and the **Authors** panel are all drawn from API data. Elements are built with `textContent`, never `innerHTML`, which prevents XSS |
| Check responses properly | `response.ok` is checked on every call (a 404 or 500 doesn't throw by itself). A non-JSON reply is handled too |
| Handle errors | Every failure becomes an `ApiError` with a clear message. Validation and duplicate errors (422, 409) appear under the form with the list of problems. Connection and server errors appear in a banner with a **Try again** button. A 404 on an action refreshes the list |
| No frozen UI | Requests run asynchronously. Buttons disable while working ("Adding…"), and loading placeholders appear while data loads |
| `finally` cleanup | Loading states and disabled buttons are always reset in `finally` blocks |
| Parallel requests | Books and authors load together with `Promise.all` |
| Timeouts | Requests give up after 8 seconds (`AbortController`) instead of hanging |
| CORS | Allowed origins get the right headers and a `204` preflight answer. Others are refused (`src/app.js`, tested) |

### Try the error handling yourself

- **Server down:** stop the server (Ctrl+C) and reload the page. You'll see the banner and an empty state. Start the server again and press **Try again**.
- **Validation:** send a bad request with the curl examples in `docs/API.md` to see the 422 details.
- **Duplicate:** add "Dune" by "Frank Herbert" again to see the 409 message under the form.

---

## Tests

```bash
npm test
```

36 tests cover every endpoint and status code, run against both the in-memory and SQLite stores, plus CORS, schema constraints, SQL injection and data surviving a restart.

## Author

Nazrin Abdullayeva, DecodeLabs Full Stack Development internship, Batch 2026.
