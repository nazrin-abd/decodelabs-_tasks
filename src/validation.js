/* =========================================================
   Validation: "Never trust the client."
   Every request body passes through here before it reaches
   the data layer. Returns { errors, value }:
   - errors: list of human-readable problems (empty = valid)
   - value:  the cleaned data (trimmed, defaults filled in)
   ========================================================= */

const STATUSES = ['to-read', 'reading', 'finished'];
const ALLOWED_FIELDS = ['title', 'author', 'status'];
const MAX_TITLE = 200;
const MAX_AUTHOR = 100;

/**
 * @param {unknown} body  the parsed JSON body
 * @param {{ partial?: boolean }} options
 *   partial = false -> creating/replacing: title is required, others get defaults
 *   partial = true  -> PATCH: only the fields sent are checked
 */
function validateBook(body, { partial = false } = {}) {
  // 1. Syntactic validation: is the format correct?
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    const errors = ['Request body must be a JSON object. Send it with the header "Content-Type: application/json".'];
    errors.malformed = true; // the API answers 400 for this, 422 for rule-breaking values
    return { errors, value: null };
  }

  const errors = [];
  const value = {};

  for (const key of Object.keys(body)) {
    if (!ALLOWED_FIELDS.includes(key)) errors.push(`Unknown field "${key}". Allowed fields: ${ALLOWED_FIELDS.join(', ')}.`);
  }

  // 2. Semantic validation: is the logic valid?
  // title
  if ('title' in body) {
    if (typeof body.title !== 'string' || body.title.trim() === '') {
      errors.push('"title" must be a non-empty string.');
    } else if (body.title.trim().length > MAX_TITLE) {
      errors.push(`"title" must be ${MAX_TITLE} characters or fewer.`);
    } else {
      value.title = body.title.trim();
    }
  } else if (!partial) {
    errors.push('"title" is required.');
  }

  // author (optional; empty string or null means "unknown")
  if ('author' in body) {
    if (body.author === null || body.author === '') {
      value.author = '';
    } else if (typeof body.author !== 'string') {
      errors.push('"author" must be a string.');
    } else if (body.author.trim().length > MAX_AUTHOR) {
      errors.push(`"author" must be ${MAX_AUTHOR} characters or fewer.`);
    } else {
      value.author = body.author.trim();
    }
  } else if (!partial) {
    value.author = '';
  }

  // status
  if ('status' in body) {
    if (!STATUSES.includes(body.status)) {
      errors.push(`"status" must be one of: ${STATUSES.join(', ')}.`);
    } else {
      value.status = body.status;
    }
  } else if (!partial) {
    value.status = 'to-read';
  }

  if (partial && errors.length === 0 && Object.keys(value).length === 0) {
    errors.push(`Send at least one field to update: ${ALLOWED_FIELDS.join(', ')}.`);
  }

  return { errors, value: errors.length ? null : value };
}

/** IDs must be positive whole numbers. Returns the number, or null if invalid. */
function parseId(raw) {
  return /^[1-9]\d{0,9}$/.test(String(raw)) ? Number(raw) : null;
}

module.exports = { validateBook, parseId, STATUSES };
