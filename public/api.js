/* =========================================================
   API client: the only file that talks to the server.
   Every call goes through request(), which:
   - sends JSON with the right headers
   - gives up after 8 seconds instead of hanging forever
   - checks response.ok (a 404 or 500 does NOT throw by itself)
   - turns every failure into an ApiError with a clear message
   ========================================================= */

const TIMEOUT_MS = 8000;

// Same server by default. To run the frontend from another origin
// (e.g. VS Code Live Server on :5500), set <meta name="api-base"
// content="http://localhost:3000"> and add that origin to the
// server's ALLOWED_ORIGINS so CORS lets the request through.
const API_BASE = `${document.querySelector('meta[name="api-base"]')?.content || ''}/api`;

export class ApiError extends Error {
  constructor(message, { status = 0, details = [] } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;   // 0 means the request never got an answer
    this.details = details; // list of validation problems, if any
  }
}

function fallbackMessage(status) {
  if (status >= 500) return 'The server had a problem. Please try again in a moment.';
  if (status === 404) return 'That item no longer exists.';
  return `Request failed with status ${status}.`;
}

export async function request(method, path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const options = { method, headers: { Accept: 'application/json' }, signal: controller.signal };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body); // serialization: object -> text
  }

  let response;
  try {
    response = await fetch(API_BASE + path, options);
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new ApiError('The server took too long to respond. Please try again.');
    }
    throw new ApiError('Could not reach the server. Check your connection and that the server is running.');
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return null; // No Content: success with nothing to read

  // Deserialization: text -> object (only if the server really sent JSON)
  const isJson = (response.headers.get('Content-Type') || '').includes('application/json');
  const payload = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError(payload?.error?.message || fallbackMessage(response.status), {
      status: response.status,
      details: payload?.error?.details || []
    });
  }

  if (!payload || !('data' in payload)) {
    throw new ApiError('The server sent an unexpected response.', { status: response.status });
  }
  return payload.data;
}

// One function per endpoint, so the rest of the app never builds URLs
export const api = {
  listBooks:   ()            => request('GET', '/books'),
  listAuthors: ()            => request('GET', '/authors'),
  createBook:  book          => request('POST', '/books', book),
  updateBook:  (id, changes) => request('PATCH', `/books/${encodeURIComponent(id)}`, changes),
  deleteBook:  id            => request('DELETE', `/books/${encodeURIComponent(id)}`)
};
