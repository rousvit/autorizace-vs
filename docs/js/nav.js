// Navigace a stav okna sdílený mezi pohledy (bez závislosti na app.js).

const titleEl = () => document.getElementById('title');
let installEvent = null;

export function setTitle(text) {
  titleEl().textContent = text;
  document.title = text === 'Autorizace VS' ? text : `${text} · Autorizace VS`;
}

/** Režim soustředění: skryje spodní navigaci (kartičky, procvičování, zkouška). */
export function setFocusMode(on) {
  document.body.classList.toggle('focus-mode', !!on);
}

export function navigate(hash, replace = false) {
  if (replace) {
    history.replaceState(null, '', hash);
    dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (location.hash === hash) {
    dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

export function setInstallEvent(e) { installEvent = e; }
export const installPrompt = () => installEvent;
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
