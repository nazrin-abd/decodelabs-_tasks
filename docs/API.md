# Shelf API reference

Base URL: `http://localhost:3000/api`

All requests and responses use JSON. Successful responses wrap the result in `data`:

```json
{ "data": { "id": 1, "title": "Dune", "author": "Frank Herbert", "status": "reading",
            "createdAt": "2026-10-20T17:01:06.532Z", "updatedAt": "2026-10-20T17:01:06.532Z" } }
```

Errors always have the same shape:

```json
{
  "error": {
    "status": 422,
    "message": "The book could not be added.",
    "details": ["\"title\" is required.", "\"status\" must be one of: to-read, reading, finished."]
  }
}
```

`details` appears only for validation errors.

## The book object

| Field | Type | Rules |
|---|---|---|
| `id` | number | Set by the server |
| `title` | string | Required. 1 to 200 characters. Spaces at the ends are trimmed |
| `author` | string | Optional. Up to 100 characters. `""` or `null` means unknown |
| `status` | string | `to-read`, `reading` or `finished`. Defaults to `to-read` |
| `createdAt`, `updatedAt` | string | ISO 8601 dates, set by the server |

Any other field in a request is rejected. The same title by the same author (ignoring capital letters) can only exist once.

## Endpoints

| Method | Path | Body | Success | Possible errors |
|---|---|---|---|---|
| GET | `/health` | | 200 | |
| GET | `/books` | | 200, array of books, newest first | 400 bad `status` filter |
| GET | `/books?status=reading` | | 200, filtered array | 400 |
| GET | `/books/:id` | | 200, one book | 400 bad id, 404 |
| POST | `/books` | `title`, optional `author`, `status` | 201, the new book, plus `Location` header | 400, 409, 413, 422 |
| PUT | `/books/:id` | Full book. Missing `author`/`status` reset to defaults | 200, the updated book | 400, 404, 409, 413, 422 |
| PATCH | `/books/:id` | Any of `title`, `author`, `status` | 200, the updated book | 400, 404, 409, 413, 422 |
| DELETE | `/books/:id` | | 204, no body | 400, 404 |
| GET | `/authors` | | 200, `[{ id, name, bookCount }]` sorted by name | |

## Status codes

| Code | Meaning in this API |
|---|---|
| 200 OK | Read or update succeeded |
| 201 Created | Book created. `Location` header points to it |
| 204 No Content | Book deleted (or a CORS preflight answered) |
| 400 Bad Request | Body isn't valid JSON or isn't an object, or the id or filter is malformed |
| 404 Not Found | No book with that id, or no such endpoint |
| 409 Conflict | That title and author are already on the shelf |
| 413 Payload Too Large | Body is over 10 KB |
| 422 Unprocessable Entity | Valid JSON, but the values break the rules (missing title, bad status, unknown field…) |
| 500 Internal Server Error | Unexpected failure. Details are logged on the server, never sent to the client |

## CORS

The frontend in `public/` is served by the same server, so it doesn't need CORS. To call the API from another origin (for example a page opened with VS Code Live Server on port 5500), list that origin when starting the server:

```bash
# macOS / Linux
ALLOWED_ORIGINS=http://localhost:5500 npm start

# Windows PowerShell
$env:ALLOWED_ORIGINS="http://localhost:5500"; npm start
```

Allowed origins get `Access-Control-Allow-Origin` and a `204` answer to the browser's `OPTIONS` preflight. Other origins get no permission header, so the browser blocks them.

## Examples

```bash
# Read
curl http://localhost:3000/api/books
curl "http://localhost:3000/api/books?status=reading"
curl http://localhost:3000/api/authors

# Create
curl -X POST http://localhost:3000/api/books \
  -H "Content-Type: application/json" \
  -d '{"title": "Emma", "author": "Jane Austen"}'

# Validation error (422)
curl -X POST http://localhost:3000/api/books \
  -H "Content-Type: application/json" \
  -d '{"status": "done"}'

# Partial update
curl -X PATCH http://localhost:3000/api/books/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "finished"}'

# Delete
curl -X DELETE http://localhost:3000/api/books/1
```

On Windows PowerShell, type `curl.exe` instead of `curl`, or use Postman or the Thunder Client extension in VS Code.
