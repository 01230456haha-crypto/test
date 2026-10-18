// Tiện ích giao diện: sáng/tối, thông báo, hộp thoại, âm thanh, KaTeX, file.
import { esc, hueOf } from './lib.js';
import { ic } from './icons.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* bỏ qua */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { /* bỏ qua */ } },
};
export { store };

// ---------- Sáng / Tối ----------
export const currentTheme = () => document.documentElement.dataset.theme || 'light';
export function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', t === 'dark' ? '#0e1624' : '#2f6bdb');
  $$('[data-theme-toggle]').forEach((b) => (b.innerHTML = ic(t === 'dark' ? 'sun' : 'moon')));
}
export function initTheme() {
  const saved = store.get('quiz_theme');
  applyTheme(saved || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-theme-toggle]')) return;
    const t = currentTheme() === 'dark' ? 'light' : 'dark';
    store.set('quiz_theme', t); applyTheme(t);
  });
}
export const themeBtn = () => `<button class="btn icon ghost" data-theme-toggle title="Chuyển sáng / tối" aria-label="Chuyển sáng / tối">${ic(currentTheme() === 'dark' ? 'sun' : 'moon')}</button>`;

// ---------- Thành phần nhỏ ----------
export const avatar = (name, size = 36) => {
  const n = String(name || '?').trim();
  const initials = n.split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase() || '?';
  return `<span class="avatar" style="--h:${hueOf(n)};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px">${esc(initials)}</span>`;
};
export const classChip = (name) => (name ? `<span class="chip" style="--h:${hueOf(name)}">${esc(name)}</span>` : '');
export const empty = (icon, title, sub = '') => `<div class="empty">${ic(icon, 34)}<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
export const loading = (text = 'Đang tải…') => `<div class="loading"><span class="spin"></span>${esc(text)}</div>`;

// ---------- Thông báo ----------
export function toast(msg, type = 'info', ms = 3200) {
  const host = $('#toasts'); if (!host) return;
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.innerHTML = `${ic(type === 'error' ? 'alert' : type === 'success' ? 'check' : 'info', 16)}<span>${esc(msg)}</span>`;
  host.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

// ---------- Hộp thoại ----------
export function modal({ title = '', html = '', okText = 'Đồng ý', cancelText = 'Hủy', onOpen, onOk, wide = false, hideOk = false, hideCancel = false, danger = false } = {}) {
  return new Promise((resolve) => {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-h"><span>${esc(title)}</span><button class="btn icon ghost sm" data-m="cancel" aria-label="Đóng">${ic('x', 16)}</button></div>
      <div class="modal-b">${html}</div>
      ${hideOk && hideCancel ? '' : `<div class="modal-f">${hideCancel ? '' : `<button class="btn" data-m="cancel">${esc(cancelText)}</button>`}${hideOk ? '' : `<button class="btn ${danger ? 'danger' : 'primary'}" data-m="ok">${esc(okText)}</button>`}</div>`}
    </div>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('show'));
    const box = ov.querySelector('.modal');
    let closed = false;
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    const close = (v) => {
      if (closed) return; closed = true;
      document.removeEventListener('keydown', onKey);
      ov.classList.remove('show'); setTimeout(() => ov.remove(), 200);
      resolve(v);
    };
    box.close = close;
    document.addEventListener('keydown', onKey);
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(null); });
    box.querySelectorAll('[data-m=cancel]').forEach((b) => b.addEventListener('click', () => close(null)));
    const ok = box.querySelector('[data-m=ok]');
    ok?.addEventListener('click', async () => {
      if (!onOk) return close(true);
      ok.disabled = true;
      try { const v = await onOk(box); if (v !== undefined) close(v); }
      catch (e) { toast(e.message || String(e), 'error'); }
      finally { ok.disabled = false; }
    });
    onOpen?.(box);
    box.querySelector('input:not([type=radio]):not([type=checkbox]),textarea')?.focus();
  });
}
export const confirmBox = (msg, okText = 'Đồng ý', danger = false) =>
  modal({ title: 'Xác nhận', html: `<p class="pre">${esc(msg)}</p>`, okText, danger }).then((v) => !!v);
export const promptBox = (title, label, value = '', okText = 'Lưu') =>
  modal({
    title, okText,
    html: `<label class="field"><span>${esc(label)}</span><input class="input" id="pv" value="${esc(value)}"></label>`,
    onOpen: (box) => box.querySelector('#pv').addEventListener('keydown', (e) => { if (e.key === 'Enter') box.querySelector('[data-m=ok]').click(); }),
    onOk: (box) => { const v = box.querySelector('#pv').value.trim(); return v || undefined; },
  });

// ---------- Âm thanh (Web Audio, không cần file) ----------
let actx;
export const isSoundOn = () => store.get('quiz_sound') !== 'off';
export const setSound = (on) => store.set('quiz_sound', on ? 'on' : 'off');
export function beep(kind) {
  if (!isSoundOn()) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const notes = kind === 'ok' ? [[659, 0], [880, 0.11]] : [[247, 0], [196, 0.13]];
    notes.forEach(([f, t]) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = kind === 'ok' ? 'sine' : 'triangle'; o.frequency.value = f;
      o.connect(g); g.connect(actx.destination);
      const s = actx.currentTime + t;
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.12, s + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.22);
      o.start(s); o.stop(s + 0.25);
    });
  } catch (e) { /* thiết bị không hỗ trợ âm thanh */ }
}

// ---------- KaTeX ----------
export function renderMath(el) {
  try {
    window.renderMathInElement?.(el, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\[', right: '\\]', display: true }, { left: '\\(', right: '\\)', display: false }, { left: '$', right: '$', display: false }],
      throwOnError: false,
    });
  } catch (e) { /* bỏ qua */ }
}

// ---------- File ----------
export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export const readFile = (file, as = 'buffer') => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(r.result); r.onerror = () => rej(r.error);
  as === 'text' ? r.readAsText(file) : r.readAsArrayBuffer(file);
});
export const safeName = (s) => String(s || 'file').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 60);
/** sheets: [{name, rows, header?}] */
export function exportXlsx(sheets, filename) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((s) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(s.rows, s.header ? { header: s.header } : undefined), s.name.slice(0, 31)));
  XLSX.writeFile(wb, filename);
}
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
