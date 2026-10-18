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
import * as AR from './admin-results.js';
import { SITE_NAME } from './config.js';

const rail = document.getElementById('rail');
const topbar = document.getElementById('topbar');
const view = document.getElementById('view');

// [mẫu đường dẫn, hàm hiển thị, tuỳ chọn]
const toExams = () => { location.replace('#/admin/exams'); }; // "/admin" cũ → danh sách đề
const ROUTES = [
  ['/', S.renderHome], ['/f/:id', S.renderHome], ['/quiz/:id', S.renderQuizStart],
  ['/exam/:id', E.renderExam, { bare: true }], ['/result/:id', E.renderResult],
  ['/history', S.renderHistory], ['/me', S.renderProfile],
  ['/admin', toExams, { admin: true }], ['/admin/exams', AD.renderExplorer, { admin: true }], ['/admin/f/:id', AD.renderExplorer, { admin: true }],
  ['/admin/quiz/:id', renderQuizEditor, { admin: true }],
  ['/admin/users', AU.renderUsers, { admin: true }], ['/admin/classes', AU.renderUsers, { admin: true }],
  ['/admin/class/:id', AU.renderClassDetail, { admin: true }], ['/admin/user/:id', AU.renderUserDetail, { admin: true }],
  ['/admin/results', AR.renderResults, { admin: true }], ['/admin/live', AR.renderResults, { admin: true }],
  ['/admin/settings', AD.renderSettings, { admin: true }], ['/admin/backup', AD.renderBackup, { admin: true }],
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

// ---------- Khung giao diện: thanh xanh bên trái + thanh trên ----------
function setShell(on) {
  document.body.classList.toggle('shell-on', on);
  if (!on) { rail.innerHTML = ''; topbar.innerHTML = ''; }
}
function drawShell(path) {
  const admin = isAdmin(), guest = isGuest();
  const items = admin
    ? [['/admin/exams', 'Đề thi', 'file', (p) => p.startsWith('/admin/exams') || p.startsWith('/admin/f/') || p.startsWith('/admin/quiz/')],
       ['/admin/users', 'Học viên', 'users', (p) => p.startsWith('/admin/user') || p.startsWith('/admin/class')],
       ['/admin/results', 'Kết quả', 'chart', (p) => p === '/admin/results' || p === '/admin/live' || p.startsWith('/result/')]]
    : [['/', 'Đề thi', 'book', (p) => p === '/' || p.startsWith('/quiz/') || p.startsWith('/result/') || p.startsWith('/f/')]]
        .concat(guest ? [] : [['/history', 'Lịch sử', 'clock', (p) => p === '/history']]);
  const bottom = admin
    ? [['/admin/settings', 'Cài đặt', 'settings', (p) => p === '/admin/settings' || p === '/admin/backup']]
    : [['/me', guest ? 'Thoát' : 'Tài khoản', 'user', (p) => p === '/me']];
  const link = ([h, t, i, on]) => `<a href="#${h}" class="${on(path) ? 'on' : ''}">${ic(i, 22)}<span>${t}</span></a>`;
  rail.innerHTML = `<a class="rail-logo" href="#${admin ? '/admin/exams' : '/'}" aria-label="Trang chủ">${ic('book', 26)}</a>
    <div class="rail-main">${items.map(link).join('')}</div><div class="rail-bot">${bottom.map(link).join('')}</div>`;
  const role = admin ? 'Giáo viên' : guest ? 'Khách' : 'Học viên';
  const inAdmin = path.startsWith('/admin') || path.startsWith('/result/');
  const swap = admin ? (inAdmin ? `<a class="btn sm tb-link" href="#/">${ic('eye', 15)} Xem như học viên</a>` : `<a class="btn sm tb-link" href="#/admin/exams">${ic('left', 15)} Về quản trị</a>`) : '';
  topbar.innerHTML = `<a class="tb-brand" href="#${admin ? '/admin/exams' : '/'}"><span class="brand-mark sm">${ic('book', 18)}</span><span>${esc(SITE_NAME)}</span></a>
    <div class="tb-r">${swap}${themeBtn()}<a class="tb-user" href="#/me">${avatar(state.profile.displayName, 36)}<div><b>${esc(state.profile.displayName || 'Khách')}</b><span>${role}</span></div></a></div>`;
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
  if (!configured) { setShell(false); return renderSetup(); }
  if (!state.ready) return;
  const { path, query } = parseHash();

  if (!state.user) { setShell(false); view.className = 'view'; return renderLogin(view); }
  if (!state.profile) return;
  if (['pending', 'blocked'].includes(state.profile.status)) { setShell(false); view.className = 'view'; return renderGate(view, state.profile.status); }
  if (path === '/login') { location.replace('#/'); return; }

  let params = {}, r = null;
  for (const x of ROUTES) { const m = path.match(x.re); if (m) { r = x; x.names.forEach((n, i) => (params[n] = decodeURIComponent(m[i + 1]))); break; } }
  if (!r) { setShell(true); drawShell(path); view.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy trang')}<a class="btn" href="#/">Về trang chủ</a></div>`; return; }
  if (r.opt.admin && !isAdmin()) { location.replace('#/'); return; }

  setShell(!r.opt.bare);
  if (!r.opt.bare) drawShell(path);
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
    // Giáo viên vừa đăng nhập thì vào thẳng trang chủ giáo viên
    if (state.profile.role === 'admin' && ['', '#', '#/', '#/login'].includes(location.hash)) location.replace('#/admin/exams');
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
