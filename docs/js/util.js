// Drobné pomocné funkce pro DOM, text a náhodu.

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  append(el, children);
  return el;
}

/** Jako el.append(), ale přeskočí null/false (podmíněné části rozhraní). */
export function add(el, ...children) {
  append(el, children);
  return el;
}

/** Jako el.replaceChildren(), ale přeskočí null/false. */
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function svg(path, cls) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('aria-hidden', 'true');
  if (cls) s.setAttribute('class', cls);
  s.innerHTML = path;
  return s;
}

export const ICONS = {
  chev: '<path d="M9 5l7 7-7 7"/>',
  cards: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
  abc: '<circle cx="6" cy="7" r="2.2"/><circle cx="6" cy="17" r="2.2"/><path d="M11 7h9M11 17h9"/>',
  exam: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.6l5.8-.8z"/>',
  starFill: '<path fill="currentColor" d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.6l5.8-.8z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  para: '<path d="M14.5 5.5c-.6-1.3-1.8-2-3.3-2-2 0-3.4 1.2-3.4 2.9 0 4 7.4 3.1 7.4 7.4 0 1.2-.7 2.1-1.7 2.6M9.5 18.5c.6 1.3 1.8 2 3.3 2 2 0 3.4-1.2 3.4-2.9 0-4-7.4-3.1-7.4-7.4 0-1.2.7-2.1 1.7-2.6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  redo: '<path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4.5h4.5"/>',
  warn: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4.5M12 17.5v.5"/>',
  bolt: '<path d="M13 2L4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21V5M8 7h7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1.3"/><circle cx="4" cy="12" r="1.3"/><circle cx="4" cy="18" r="1.3"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r=".8"/>',
  download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14"/>',
  upload: '<path d="M12 20V9M7.5 13.5L12 9l4.5 4.5M5 4h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.4"/>',
};

export const icon = (name, cls) => svg(ICONS[name], cls);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function norm(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** České skloňování: plural(5, 'otázka', 'otázky', 'otázek') */
export function plural(n, one, few, many) {
  const a = Math.abs(n);
  if (a === 1) return one;
  if (a >= 2 && a <= 4) return few;
  return many;
}
export const count = (n, one, few, many) => `${n} ${plural(n, one, few, many)}`;

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pct(x, digits = 0) {
  return `${(x * 100).toFixed(digits).replace('.', ',')} %`;
}

export function fmtNum(x, digits = 1) {
  return x.toFixed(digits).replace('.', ',');
}

export function todayKey(d = new Date()) {
  const z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' });
}

export function fmtDateTime(ts) {
  return new Date(ts).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtDuration(ms) {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Dny do data (yyyy-mm-dd), záporné = po termínu. */
export function daysUntil(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

// --- toast, spodní panel, potvrzení ----------------------------------------------------------

export function toast(message, action) {
  const root = document.getElementById('toast-root');
  const el = h('div', { class: 'toast', role: 'status' }, h('span', null, message));
  if (action) el.append(h('button', { onclick: () => { action.run(); el.remove(); } }, action.label));
  root.append(el);
  setTimeout(() => el.remove(), action ? 9000 : 3200);
}

let openSheetClose = null;

export function sheet(title, body, { onClose } = {}) {
  closeSheet();
  const backdrop = h('div', { class: 'backdrop' });
  const closeBtn = h('button', { class: 'icon-btn', 'aria-label': 'Zavřít' }, icon('close'));
  const panel = h('section', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', null, title), closeBtn),
    h('div', { class: 'sheet-body' }, body));
  const prevFocus = document.activeElement;
  const close = () => {
    backdrop.remove();
    panel.remove();
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('popstate', onPop);
    openSheetClose = null;
    if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const onPop = () => close();
  backdrop.addEventListener('click', close);
  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('popstate', onPop);
  document.body.append(backdrop, panel);
  openSheetClose = close;
  closeBtn.focus({ preventScroll: true });
  return { close, body: panel.querySelector('.sheet-body') };
}

export function closeSheet() {
  if (openSheetClose) openSheetClose();
}

export function confirmBox(title, text, okLabel = 'Pokračovat', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); s.close(); } };
    const body = h('div', null,
      h('p', null, text),
      h('div', { class: 'grid-2' },
        h('button', { class: 'btn outline', onclick: () => finish(false) }, 'Zrušit'),
        h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, onclick: () => finish(true) }, okLabel)));
    const s = sheet(title, body, { onClose: () => { if (!done) { done = true; resolve(false); } } });
  });
}

export function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
