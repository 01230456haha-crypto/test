// Màn hình đăng nhập / đăng ký / chờ duyệt / bị khóa.
import { auth, db, A, F } from './fb.js';
import { state, flags, hooks, authError } from './state.js';
import { toLoginEmail, esc } from './lib.js';
import { getClasses } from './data.js';
import { ic } from './icons.js';
import { themeBtn, toast } from './ui.js';
import { SITE_NAME } from './config.js';

export async function createProfile(u, extra = {}) {
  const email = u.email || '';
  const data = {
    email, username: '', displayName: extra.displayName || u.displayName || email.split('@')[0] || 'Học viên',
    className: extra.className || '', classes: extra.className ? [extra.className] : [], role: 'user',
    status: state.settings.registerMode === 'approval' ? 'pending' : 'active',
    createdAt: Date.now(), provider: extra.provider || 'password',
  };
  await F.setDoc(F.doc(db, 'users', u.uid), data);
  return data;
}

export async function renderLogin(root) {
  const s = state.settings;
  const flash = state.flash; state.flash = null;
  let mode = 'login';
  let classes = [];
  try { classes = await getClasses(); } catch (e) { /* chưa có quyền đọc → bỏ qua */ }
  const canRegister = s.registerMode !== 'closed' && s.emailReg;
  const canGoogle = s.googleLogin || (s.googleReg && s.registerMode !== 'closed');

  const draw = () => {
    root.innerHTML = `
    <div class="auth-wrap"><div class="auth-theme">${themeBtn()}</div>
      <div class="auth">
        <aside class="auth-hero">
          <div class="brand-mark">${ic('book', 26)}</div>
          <h1>${esc(SITE_NAME)}</h1>
          <p>Luyện đề trắc nghiệm mọi lúc, mọi nơi. Theo dõi tiến độ và kết quả của bạn.</p>
          <ul>
            <li>${ic('bolt', 16)} Làm bài mượt trên điện thoại và máy tính</li>
            <li>${ic('chart', 16)} Lưu lịch sử trên mọi thiết bị</li>
            <li>${ic('target', 16)} Chấm điểm và giải thích ngay</li>
          </ul>
        </aside>
        <section class="auth-form">
          <h2>${mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</h2>
          <p class="muted">${mode === 'login' ? 'Chào mừng bạn quay lại' : (s.registerMode === 'approval' ? 'Tài khoản cần được giảng viên duyệt trước khi làm bài.' : 'Điền thông tin bên dưới để bắt đầu')}</p>
          ${flash ? `<div class="note warn">${ic('alert', 16)}<span>${esc(flash)}</span></div>` : ''}
          <form id="f" novalidate>
            ${mode === 'login' ? `
              <label class="field"><span>Email hoặc tên đăng nhập</span><input class="input" name="login" autocomplete="username" autocapitalize="none" required></label>
              <label class="field"><span>Mật khẩu</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>` : `
              <label class="field"><span>Họ và tên</span><input class="input" name="name" autocomplete="name" required></label>
              <label class="field"><span>Email</span><input class="input" type="email" name="email" autocomplete="email" autocapitalize="none" required></label>
              ${classes.length ? `<label class="field"><span>Lớp</span><select class="input" name="cls"><option value="">— Chọn lớp —</option>${classes.map((c) => `<option>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
              <label class="field"><span>Mật khẩu (từ 6 ký tự)</span><input class="input" type="password" name="password" autocomplete="new-password" required></label>`}
            <button class="btn primary block lg" id="submit">${mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}</button>
          </form>
          ${canGoogle ? `<div class="or"><span>hoặc</span></div><button class="btn block" id="google"><span class="g">G</span> Tiếp tục với Google</button>` : ''}
          ${s.guestEnabled ? `<button class="btn ghost block" id="guest" style="margin-top:8px">${ic('eye', 16)} Vào học thử (khách)</button>` : ''}
          ${mode === 'login' && canRegister ? `<p class="swlink">Chưa có tài khoản? <a href="#" id="toReg">Đăng ký</a></p>` : ''}
          ${mode === 'register' ? `<p class="swlink">Đã có tài khoản? <a href="#" id="toLogin">Đăng nhập</a></p>` : ''}
          ${mode === 'login' && !canRegister ? `<p class="hint">Tài khoản do giảng viên cấp. Cần hỗ trợ? Hãy liên hệ giảng viên.</p>` : ''}
        </section>
      </div></div>`;
    root.querySelector('#toReg')?.addEventListener('click', (e) => { e.preventDefault(); mode = 'register'; draw(); });
    root.querySelector('#toLogin')?.addEventListener('click', (e) => { e.preventDefault(); mode = 'login'; draw(); });
    root.querySelector('#f').addEventListener('submit', onSubmit);
    root.querySelector('#google')?.addEventListener('click', google);
    root.querySelector('#guest')?.addEventListener('click', guest);
  };

  async function guarded(fn) {
    const btns = root.querySelectorAll('button'); btns.forEach((b) => (b.disabled = true));
    flags.authBusy = true;
    try { await fn(); } catch (e) { toast(authError(e), 'error', 5000); }
    finally { flags.authBusy = false; btns.forEach((b) => (b.disabled = false)); }
    await hooks.boot(auth.currentUser);
  }

  function onSubmit(e) {
    e.preventDefault();
    const f = new FormData(e.target);
    if (mode === 'login') {
      const email = toLoginEmail(f.get('login'));
      if (!email || !f.get('password')) return toast('Hãy nhập đủ tên đăng nhập và mật khẩu.', 'error');
      return guarded(() => A.signInWithEmailAndPassword(auth, email, String(f.get('password'))));
    }
    const email = toLoginEmail(f.get('email')), name = String(f.get('name') || '').trim(), pw = String(f.get('password') || '');
    if (!name || !email || !String(f.get('email')).includes('@')) return toast('Hãy nhập họ tên và email hợp lệ.', 'error');
    if (pw.length < 6) return toast('Mật khẩu cần ít nhất 6 ký tự.', 'error');
    guarded(async () => {
      const cred = await A.createUserWithEmailAndPassword(auth, email, pw);
      await createProfile(cred.user, { displayName: name, className: f.get('cls') || '' });
    });
  }
  function google() {
    guarded(async () => {
      const cred = await A.signInWithPopup(auth, new A.GoogleAuthProvider());
      const snap = await F.getDoc(F.doc(db, 'users', cred.user.uid));
      if (snap.exists()) return;
      if (s.registerMode === 'closed' || !s.googleReg) {
        await A.deleteUser(cred.user).catch(() => A.signOut(auth));
        throw new Error('Giảng viên không mở đăng ký bằng Google. Hãy liên hệ để được cấp tài khoản.');
      }
      await createProfile(cred.user, { provider: 'google' });
    });
  }
  function guest() { guarded(() => A.signInAnonymously(auth)); }
  draw();
}

export function renderGate(root, kind) {
  const pending = kind === 'pending';
  root.innerHTML = `<div class="auth-wrap"><div class="auth-theme">${themeBtn()}</div><div class="gate card">
    <div class="gate-ic ${pending ? 'warn' : 'danger'}">${ic(pending ? 'clock' : 'lock', 30)}</div>
    <h2>${pending ? 'Tài khoản đang chờ duyệt' : 'Tài khoản đã bị khóa'}</h2>
    <p class="muted">${pending ? 'Giảng viên sẽ duyệt tài khoản của bạn sớm. Bạn sẽ làm bài được ngay sau khi được duyệt.' : 'Vui lòng liên hệ giảng viên để được hỗ trợ.'}</p>
    <div class="row center">${pending ? `<button class="btn" id="re">${ic('refresh', 16)} Kiểm tra lại</button>` : ''}<button class="btn primary" id="out">${ic('logout', 16)} Đăng xuất</button></div></div></div>`;
  root.querySelector('#out').onclick = () => hooks.logout();
  root.querySelector('#re')?.addEventListener('click', () => hooks.boot(auth.currentUser));
}
