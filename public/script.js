/* =========================================================
   Shelf · Frontend logic
   Input -> Process -> Output:
   1. The user acts (Input).
   2. We call the API and await the answer (Process).
   3. We update state and redraw the DOM from it (Output).
   Errors are never silent: they show in a banner or under
   the form, and loading states always clear in finally{}.
   ========================================================= */

import { api, ApiError } from './api.js';

const STATUSES = {
  'to-read':  { label: 'To read',  next: 'reading',  action: 'Start reading' },
  'reading':  { label: 'Reading',  next: 'finished', action: 'Mark finished' },
  'finished': { label: 'Finished', next: 'to-read',  action: 'Read again' }
};

/* ---------- State ---------- */
const state = {
  books: [],
  authors: [],
  filter: 'all',
  phase: 'loading' // 'loading' | 'ready' | 'error'
};

/* ---------- DOM references ---------- */
const $ = id => document.getElementById(id);
const form = $('book-form');
const submitButton = form.querySelector('button[type="submit"]');
const titleInput = $('title');
const authorInput = $('author');
const statusSelect = $('status');
const titleError = $('title-error');
const formMessage = $('form-message');
const library = $('library');
const list = $('book-list');
const emptyState = $('empty-state');
const filterButtons = document.querySelectorAll('.filter');
const shelf = $('shelf-visual');
const authorList = $('author-list');
const authorsEmpty = $('authors-empty');
const announcer = $('announcer');
const banner = $('server-banner');
const bannerText = $('server-banner-text');
const retryButton = $('retry-button');
const syncStatus = $('sync-status');
const navToggle = document.querySelector('.nav-toggle');
const nav = $('site-nav');

/* ---------- Helpers ---------- */
// Build elements with textContent (never innerHTML), so text typed by
// users can't inject HTML or scripts (prevents XSS).
function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value);
  });
  children.forEach(child => node.append(child));
  return node;
}

function announce(message) {
  announcer.textContent = '';
  setTimeout(() => { announcer.textContent = message; }, 50);
}

function showBanner(message, { canRetry = true } = {}) {
  bannerText.textContent = message;
  retryButton.hidden = !canRetry;
  banner.hidden = false;
}

function hideBanner() {
  banner.hidden = true;
}

function showFormMessage(message, details = []) {
  formMessage.replaceChildren(el('strong', { text: message }));
  if (details.length) formMessage.append(el('ul', {}, details.map(d => el('li', { text: d }))));
  formMessage.hidden = false;
}

function hideFormMessage() {
  formMessage.hidden = true;
  formMessage.replaceChildren();
}

function markSynced() {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  syncStatus.textContent = `Synced at ${time}.`;
}

function countBy(status) {
  return state.books.filter(book => book.status === status).length;
}

function findBook(id) {
  return state.books.find(b => String(b.id) === String(id));
}

/* ---------- Rendering (state -> DOM) ---------- */
function render() {
  renderList();
  renderShelf();
  renderStats();
  renderAuthors();
  renderFilters();
}

function renderList() {
  library.setAttribute('aria-busy', String(state.phase === 'loading'));

  if (state.phase === 'loading' && state.books.length === 0) {
    const skeletons = Array.from({ length: 4 }, () =>
      el('li', { 'aria-hidden': 'true' }, [el('div', { className: 'book book--skeleton' })]));
    list.replaceChildren(...skeletons);
    emptyState.hidden = true;
    return;
  }

  const visible = state.filter === 'all'
    ? state.books
    : state.books.filter(book => book.status === state.filter);

  list.replaceChildren(...visible.map(renderBook));

  if (state.phase === 'error' && state.books.length === 0) {
    emptyState.hidden = false;
    emptyState.textContent = 'Your books could not be loaded. Use "Try again" above.';
  } else if (visible.length === 0) {
    emptyState.hidden = false;
    emptyState.textContent = state.books.length === 0
      ? 'No books yet. Add the first one above.'
      : `No books marked "${STATUSES[state.filter].label.toLowerCase()}". Choose another filter or add a book.`;
  } else {
    emptyState.hidden = true;
  }
}

function renderBook(book) {
  const status = STATUSES[book.status];

  const actions = el('div', { className: 'book__actions' }, [
    el('button', {
      type: 'button',
      className: 'action-advance',
      text: status.action,
      'aria-label': `${status.action}: ${book.title}`,
      dataset: { action: 'advance', id: book.id }
    }),
    el('button', {
      type: 'button',
      className: 'action-remove',
      text: 'Remove',
      'aria-label': `Remove ${book.title}`,
      dataset: { action: 'remove', id: book.id }
    })
  ]);

  const article = el('article', { className: 'book', dataset: { status: book.status } }, [
    el('h3', { text: book.title }),
    el('p', { className: 'book__author', text: book.author || 'Unknown author' }),
    el('span', { className: 'badge', text: status.label }),
    actions
  ]);

  return el('li', {}, [article]);
}

function renderShelf() {
  if (state.books.length === 0) {
    const message = state.phase === 'loading' ? 'Loading…' : 'Your shelf is empty.';
    shelf.replaceChildren(el('p', { className: 'shelf__empty', text: message }));
    shelf.setAttribute('aria-label', message);
    return;
  }

  const order = ['finished', 'reading', 'to-read'];
  const sorted = [...state.books].sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status));

  shelf.replaceChildren(...sorted.map(book => {
    const spine = el('div', { className: `spine spine--${book.status}`, text: book.title, title: book.title });
    spine.style.height = `${Math.min(8.5, 5 + book.title.length * 0.12)}rem`;
    return spine;
  }));
  shelf.setAttribute(
    'aria-label',
    `Shelf with ${state.books.length} books: ${countBy('finished')} finished, ${countBy('reading')} reading, ${countBy('to-read')} to read`
  );
}

function renderStats() {
  Object.keys(STATUSES).forEach(status => {
    $(`count-${status}`).textContent = countBy(status);
  });
}

function renderAuthors() {
  authorList.replaceChildren(...state.authors.map(author =>
    el('li', {}, [
      el('span', { text: author.name }),
      el('span', {
        className: 'author-list__count',
        text: String(author.bookCount),
        'aria-label': `${author.bookCount} ${author.bookCount === 1 ? 'book' : 'books'}`
      })
    ])));
  authorsEmpty.hidden = state.authors.length > 0 || state.phase === 'loading';
}

function renderFilters() {
  filterButtons.forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
  });
}

/* ---------- Data flow (each action = API call -> state -> render) ---------- */

// Books and authors are independent, so fetch them in parallel
async function loadAll() {
  state.phase = 'loading';
  syncStatus.textContent = 'Loading…';
  render();
  try {
    const [books, authors] = await Promise.all([api.listBooks(), api.listAuthors()]);
    state.books = books;
    state.authors = authors;
    state.phase = 'ready';
    hideBanner();
    markSynced();
  } catch (error) {
    state.phase = 'error';
    syncStatus.textContent = 'Not connected.';
    showBanner(error.message);
  } finally {
    render();
  }
}

// After a change, the author counts may have changed too
async function refreshAuthors() {
  try {
    state.authors = await api.listAuthors();
    renderAuthors();
    markSynced();
  } catch {
    syncStatus.textContent = 'Author list may be out of date.';
  }
}

async function addBook(book) {
  const created = await api.createBook(book);
  state.books.unshift(created);
  render();
  announce(`Added ${created.title} as ${STATUSES[created.status].label.toLowerCase()}.`);
  refreshAuthors();
}

async function advanceBook(id) {
  const book = findBook(id);
  if (!book) return;
  const updated = await api.updateBook(book.id, { status: STATUSES[book.status].next });
  Object.assign(book, updated);
  render();
  markSynced();
  announce(`${updated.title} is now ${STATUSES[updated.status].label.toLowerCase()}.`);
}

async function removeBook(id) {
  const book = findBook(id);
  if (!book) return;
  await api.deleteBook(book.id);
  state.books = state.books.filter(b => b !== book);
  render();
  announce(`Removed ${book.title}.`);
  titleInput.focus();
  refreshAuthors();
}

/* ---------- Events ---------- */
form.addEventListener('submit', async event => {
  event.preventDefault();
  hideFormMessage();

  const title = titleInput.value.trim();
  // A quick check in the browser for instant feedback...
  if (!title) {
    titleInput.setAttribute('aria-invalid', 'true');
    titleError.hidden = false;
    titleInput.focus();
    return;
  }
  titleInput.removeAttribute('aria-invalid');
  titleError.hidden = true;

  // ...the server validates again, because it never trusts the client.
  submitButton.disabled = true;
  submitButton.textContent = 'Adding…';
  try {
    await addBook({ title, author: authorInput.value.trim(), status: statusSelect.value });
    form.reset();
    titleInput.focus();
    hideBanner();
  } catch (error) {
    // 409 and 422 explain what to fix; anything else is a connection/server issue
    if (error instanceof ApiError && (error.status === 409 || error.status === 422)) {
      showFormMessage(error.message, error.details);
    } else {
      showFormMessage(error.message);
    }
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Add book';
  }
});

titleInput.addEventListener('input', () => {
  if (titleInput.value.trim()) {
    titleInput.removeAttribute('aria-invalid');
    titleError.hidden = true;
  }
});

// One listener handles every card button (event delegation)
list.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  button.disabled = true;
  try {
    if (action === 'advance') await advanceBook(id);
    if (action === 'remove') await removeBook(id);
    hideBanner();
  } catch (error) {
    if (error.status === 404) {
      showBanner('That book was already changed or removed. Your list has been refreshed.', { canRetry: false });
      await loadAll();
      banner.hidden = false;
    } else {
      showBanner(error.message, { canRetry: false });
    }
  } finally {
    if (button.isConnected) button.disabled = false;
  }
});

retryButton.addEventListener('click', loadAll);

filterButtons.forEach(button => {
  button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    render();
  });
});

/* ---------- Mobile navigation ---------- */
function setNav(open) {
  navToggle.setAttribute('aria-expanded', String(open));
  nav.classList.toggle('is-open', open);
}

navToggle.addEventListener('click', () => {
  setNav(navToggle.getAttribute('aria-expanded') !== 'true');
});

nav.addEventListener('click', event => {
  if (event.target.closest('a')) setNav(false);
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
    setNav(false);
    navToggle.focus();
  }
});

window.matchMedia('(min-width: 768px)').addEventListener('change', event => {
  if (event.matches) setNav(false);
});

/* ---------- Start ---------- */
loadAll();
