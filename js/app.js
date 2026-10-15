// Điểm vào của ứng dụng: khởi động, đăng nhập, định tuyến, thanh điều hướng.
import { auth, db, A, F, configured } from './fb.js';
import { state, flags, hooks, DEFAULT_SETTINGS, isAdmin, isGuest, authError } from './state.js';
import { esc } from './lib.js';
import { ic } from './icons.js';
import { initTheme, themeBtn, avatar, toast, empty } from './ui.js';
import { renderLogin, renderGate, createProfile } from './auth.js';
import * as S from './student.js';
import * as E from './exam.js';
import * as AD from './admin.js';
import { renderQuizEditor } from './admin-quiz.js';
import * as AU from './admin-users.js';
import { SITE_NAME } from './config.js';

const hdr = document.getElementById('hdr');
const view = document.getElementById('view');

// [mẫu đường dẫn, hàm hiển thị, tuỳ chọn]
const ROUTES = [
  ['/', S.renderHome], ['/f/:id', S.renderHome], ['/quiz/:id', S.renderQuizStart],
  ['/exam/:id', E.renderExam, { bare: true }], ['/result/:id', E.renderResult],
  ['/history', S.renderHistory], ['/me', S.renderProfile],
  ['/admin', AD.renderExplorer, { admin: true }], ['/admin/f/:id', AD.renderExplorer, { admin: true }],
  ['/admin/quiz/:id', renderQuizEditor, { admin: true }],
  ['/admin/classes', AU.renderClasses, { admin: true }], ['/admin/class/:id', AU.renderClassDetail, { admin: true }],
  ['/admin/users', AU.renderUsers, { admin: true }], ['/admin/user/:id', AU.renderUserDetail, { admin: true }],
  ['/admin/live', AD.renderLive, { admin: true }], ['/admin/settings', AD.renderSettings, { admin: true }], ['/admin/backup', AD.renderBackup, { admin: true }],
].map(([pat, fn, opt = {}]) => {
  const names = []; const re = new RegExp('^' + pat.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
  return { re, names, fn, opt };
});

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { path: path.replace(/\/+$/, '') || '/', query };
}

// ---------- Thanh điều hướng ----------
function drawHeader(bare) {
  if (bare || !state.user || !state.profile || ['pending', 'blocked'].includes(state.profile.status)) { hdr.innerHTML = ''; return; }
  const { path } = parseHash(), guest = isGuest();
  const links = [['/', 'Trang chủ', 'home', (p) => p === '/' || p.startsWith('/f/') || p.startsWith('/quiz/') || p.startsWith('/result/')]];
  if (!guest) links.push(['/history', 'Lịch sử', 'clock', (p) => p === '/history']);
  if (isAdmin()) links.push(['/admin', 'Quản trị', 'shield', (p) => p.startsWith('/admin')]);
  links.push(['/me', guest ? 'Thoát' : 'Tài khoản', 'user', (p) => p === '/me']);
  const first = String(state.profile.displayName || '').trim().split(/\s+/).slice(-1)[0] || 'Bạn';
  hdr.innerHTML = `<header class="app-header"><div class="hd-in">
    <a class="brand" href="#/"><span class="brand-mark sm">${ic('book', 18)}</span><span>${esc(SITE_NAME)}</span></a>
    <nav class="nav">${links.map(([h, t, i, on]) => `<a href="#${h}" class="${on(path) ? 'on' : ''}">${ic(i, 19)}<span>${t}</span></a>`).join('')}</nav>
    <div class="hd-r">${themeBtn()}<a class="me" href="#/me">${avatar(state.profile.displayName, 30)}<span>${esc(first)}</span></a></div></div></header>`;
}

// ---------- Định tuyến ----------
let token = 0, cleanup = null;
async function route() {
  document.getElementById('boot')?.remove();
  const my = ++token;
  if (cleanup) { try { cleanup(); } catch (e) { /* bỏ qua */ } cleanup = null; }
  view.onclick = view.oninput = view.onchange = null;
  document.body.classList.remove('in-exam');
  view.innerHTML = ''; view.className = 'view container';
  if (!configured) { hdr.innerHTML = ''; return renderSetup(); }
  if (!state.ready) return;
  const { path, query } = parseHash();

  if (!state.user) { hdr.innerHTML = ''; view.className = 'view'; return renderLogin(view); }
  if (!state.profile) return;
  if (['pending', 'blocked'].includes(state.profile.status)) { hdr.innerHTML = ''; view.className = 'view'; return renderGate(view, state.profile.status); }
  if (path === '/login') { location.replace('#/'); return; }

  let params = {}, r = null;
  for (const x of ROUTES) { const m = path.match(x.re); if (m) { r = x; x.names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1]))); break; } }
  if (!r) { drawHeader(false); view.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy trang')}<a class="btn" href="#/">Về trang chủ</a></div>`; return; }
  if (r.opt.admin && !isAdmin()) { location.replace('#/'); return; }

  drawHeader(!!r.opt.bare);
  if (r.opt.bare) view.className = 'view bare';
  view.classList.add('anim');
  try {
    const res = await r.fn(view, params, query);
    if (my !== token) { if (typeof res === 'function') res(); return; }
    cleanup = typeof res === 'function' ? res : null;
    if (!r.opt.bare) window.scrollTo({ top: 0 });
  } catch (e) {
    console.error(e);
    if (my !== token) return;
    view.innerHTML = `<div class="card pad">${empty('alert', 'Có lỗi xảy ra', authError(e))}<button class="btn primary" onclick="location.reload()">Tải lại trang</button></div>`;
  }
}

function renderSetup() {
  view.className = 'view';
  view.innerHTML = `<div class="auth-wrap"><div class="gate card" style="max-width:560px;text-align:left">
    <div class="gate-ic warn">${ic('settings', 30)}</div><h2>Cần cấu hình Firebase</h2>
    <p class="muted">Website đã chạy, nhưng chưa có thông tin kết nối Firebase. Hãy làm theo hướng dẫn trong file <b>README.md</b>, rồi dán cấu hình vào file <b>js/config.js</b> và tải lại trang.</p>
    <ol class="plain"><li>Tạo dự án Firebase, bật Authentication và Firestore.</li><li>Sao chép <b>firebaseConfig</b> vào <b>js/config.js</b>.</li><li>Dán nội dung <b>firestore.rules</b> vào tab Rules.</li></ol></div></div>`;
}

// ---------- Trực tuyến (heartbeat) ----------
let presenceT = null;
function stopPresence() { clearInterval(presenceT); presenceT = null; }
function startPresence() {
  stopPresence();
  if (!state.user || isGuest()) return;
  const ping = () => F.updateDoc(F.doc(db, 'users', state.user.uid), { lastSeen: Date.now() }).catch(() => {});
  ping(); presenceT = setInterval(ping, 60000);
}

// ---------- Đăng nhập / đăng xuất ----------
hooks.boot = async (u) => {
  state.user = u; state.profile = null; stopPresence();
  if (u) {
    if (u.isAnonymous) state.profile = { role: 'guest', status: 'active', displayName: 'Khách', className: '', uid: u.uid };
    else {
      try {
        const s = await F.getDoc(F.doc(db, 'users', u.uid));
        if (s.exists()) state.profile = { ...s.data(), uid: u.uid };
        else if (state.settings.registerMode === 'closed') { state.flash = 'Tài khoản này chưa được cấp quyền. Hãy liên hệ giảng viên.'; await A.signOut(auth); return; }
        else state.profile = { ...(await createProfile(u)), uid: u.uid };
        F.updateDoc(F.doc(db, 'users', u.uid), { lastLogin: Date.now() }).catch(() => {});
      } catch (e) { state.flash = authError(e); await A.signOut(auth); return; }
    }
    startPresence();
  }
  state.ready = true; route();
};
hooks.logout = async () => {
  try { if (state.user && !isGuest()) await F.updateDoc(F.doc(db, 'users', state.user.uid), { lastSeen: 0 }); } catch (e) { /* bỏ qua */ }
  await A.signOut(auth); location.hash = '#/login';
};

// ---------- Khởi động ----------
(async function start() {
  initTheme();
  window.addEventListener('hashchange', route);
  if (!configured) return route();
  try {
    const s = await F.getDoc(F.doc(db, 'settings', 'app'));
    if (s.exists()) state.settings = { ...DEFAULT_SETTINGS, ...s.data() };
  } catch (e) { console.warn('Chưa đọc được cài đặt:', e.message); }
  A.onAuthStateChanged(auth, (u) => { if (flags.authBusy) return; hooks.boot(u); });
})();
