// Giao diện học viên: trang chủ, bắt đầu làm đề, lịch sử, tài khoản.
import { auth, db, A, F } from './fb.js';
import { state, go, hooks, isGuest, authError } from './state.js';
import { esc, byName, canSee, quizAccess, fmtDate, fmtTime, fmtScore, buildPlan, displayLogin, audienceOf, isOn } from './lib.js';
import { getQuizzes, getQuiz, getContent, getAttemptsWhere } from './data.js';
import { ic } from './icons.js';
import { toast, modal, loading, empty, avatar, classChip, debounce } from './ui.js';

const myAttempts = () => getAttemptsWhere('uid', state.user.uid);
const scoreClass = (a) => ((a.score ?? 0) >= (a.passScore ?? 5) ? 'good' : 'bad');

function stillRunning(a) { return a.status === 'in_progress' && (!a.deadline || a.deadline > Date.now()); }

// ====================== TRANG CHỦ: DANH SÁCH LỚP ======================
const norm = (x) => String(x || '').trim().toLowerCase();
const timeText = (q) => (q.openAt || q.closeAt ? `${q.openAt ? fmtDate(q.openAt) : '…'} – ${q.closeAt ? fmtDate(q.closeAt) : '…'}` : 'Không thời hạn');

export async function renderHome(root) {
  root.innerHTML = loading();
  const guest = isGuest(), admin = state.profile.role === 'admin';
  const [quizzes, attempts] = await Promise.all([getQuizzes(guest), myAttempts().catch(() => [])]);
  const vis = quizzes.filter((q) => canSee(q, state.profile, state.user.uid)).sort(byName);
  const submitted = attempts.filter((a) => a.status === 'submitted');
  const running = attempts.filter(stillRunning).sort((a, b) => b.startedAt - a.startedAt);
  const lastOf = (qid) => submitted.filter((a) => a.quizId === qid).sort((a, b) => b.submittedAt - a.submittedAt)[0];
  const cntOf = (qid) => attempts.filter((a) => a.quizId === qid).length;
  const cls = state.profile.className;

  // Chia thành các khung: theo lớp của học viên, giao riêng, tự do
  const sections = [];
  if (admin) sections.push({ title: 'Tất cả đề (xem như học viên)', list: vis });
  else {
    const classQs = vis.filter((q) => audienceOf(q) === 'classes' && cls && (q.allowedClasses || []).some((c) => norm(c) === norm(cls)));
    const free = vis.filter((q) => audienceOf(q) === 'all');
    const own = vis.filter((q) => !classQs.includes(q) && !free.includes(q));
    if (classQs.length) sections.push({ title: cls, chip: true, list: classQs });
    if (own.length) sections.push({ title: 'Giao riêng cho bạn', list: own });
    if (free.length) sections.push({ title: 'Tự do', list: free });
  }
  const row = (q) => {
    const l = lastOf(q.id), acc = quizAccess(q, Date.now(), cntOf(q.id));
    return `<a class="exam-row ${acc.ok ? '' : 'off'}" href="#/quiz/${q.id}" data-t="${esc(norm(q.title))}"><span class="er-ic mode-${q.mode}">${ic(q.mode === 'practice' ? 'sparkle' : 'file', 24)}</span>
      <div class="er-b"><b>${esc(q.title)}</b>
        <span>${l ? `Điểm của bạn: <b class="${(l.score ?? 0) >= (l.passScore ?? 5) ? 'good' : 'bad'}">${fmtScore(l.score)}</b>` : '<span class="muted">Chưa làm</span>'}</span>
        <span class="muted">Thời gian vào thi: ${timeText(q)}</span>
        ${acc.ok ? '' : `<span class="tag warn">${esc(acc.reason)}</span>`}</div></a>`;
  };
  const sec = (x, si) => `<section class="card sec-card" data-sec="${si}"><h3>${x.chip ? classChip(x.title) : esc(x.title)} <small class="muted">${x.list.length} đề</small></h3>
    <div class="er-list">${x.list.map((q, i) => row(q).replace('class="exam-row', `class="exam-row${i >= 4 ? ' more-hide' : ''}`)).join('')}</div>
    ${x.list.length > 4 ? `<button class="more-btn" data-more>${ic('plus', 14)} Xem thêm</button>` : ''}</section>`;

  root.innerHTML = `<div class="page-h"><h1 class="ptitle">Danh sách lớp</h1>${vis.length ? `<div class="search">${ic('search', 16)}<input class="input" id="q" placeholder="Tìm kiếm đề thi"></div>` : ''}</div>
    ${running.length ? `<div class="resume">${running.map((a) => `<a class="resume-i" href="#/exam/${a.id}">${ic('play', 18)}<div><b>Tiếp tục: ${esc(a.quizTitle)}</b><span>Đã làm ${Object.keys(a.answers || {}).length}/${a.total} câu</span></div>${ic('right', 18)}</a>`).join('')}</div>` : ''}
    ${sections.length ? `<div class="sec-grid">${sections.map(sec).join('')}</div>`
      : `<div class="card pad">${empty('book', guest ? 'Chưa có đề nào cho khách' : 'Chưa có đề nào được giao cho bạn', 'Khi giáo viên giao bài, đề sẽ hiện ở đây.')}</div>`}`;

  root.onclick = (e) => {
    const m = e.target.closest('[data-more]'); if (!m) return;
    const card = m.closest('.sec-card'); card.classList.toggle('open');
    m.innerHTML = card.classList.contains('open') ? `${ic('x', 14)} Thu gọn` : `${ic('plus', 14)} Xem thêm`;
  };
  root.oninput = debounce((e) => {
    if (e.target.id !== 'q') return;
    const t = norm(e.target.value);
    root.querySelectorAll('.sec-card').forEach((c) => {
      let any = false;
      c.querySelectorAll('.exam-row').forEach((r) => { const hit = !t || r.dataset.t.includes(t); r.style.display = hit ? '' : 'none'; any = any || hit; });
      c.classList.toggle('searching', !!t); c.style.display = any ? '' : 'none';
    });
  }, 150);
}

function resultRow(a) {
  return `<a class="row-item" href="#/result/${a.id}"><div class="ri-b"><b>${esc(a.quizTitle)}</b><span class="muted">${fmtDate(a.submittedAt)} · ${fmtTime(a.durationSec)} · ${a.correct}/${a.total} câu đúng</span></div><span class="score big ${scoreClass(a)}">${fmtScore(a.score)}</span></a>`;
}

// ====================== BẮT ĐẦU LÀM ĐỀ ======================
export async function renderQuizStart(root, p) {
  root.innerHTML = loading();
  const quiz = await getQuiz(p.id);
  const all = await myAttempts().catch(() => []);
  const mine = all.filter((a) => a.quizId === p.id);
  const done = mine.filter((a) => a.status === 'submitted').sort((a, b) => b.submittedAt - a.submittedAt);
  const running = mine.filter(stillRunning)[0];
  const histBlock = done.length ? `<div class="center"><button class="btn" id="hist">${ic('clock', 16)} Xem lịch sử làm bài</button></div><div id="histList" class="hide"><div class="card list-card" style="margin-top:14px">${done.map(resultRow).join('')}</div></div>` : '';
  const toggleHist = () => root.querySelector('#hist')?.addEventListener('click', () => root.querySelector('#histList').classList.toggle('hide'));
  if (!quiz || !canSee(quiz, state.profile, state.user.uid)) {
    // đề bị ẩn/xóa/không giao cho bạn: chỉ cho xem điểm & lịch sử
    root.innerHTML = `<a class="back" href="#/">${ic('left', 16)} Quay lại</a><div class="card pad narrow center-t">${empty('lock', 'Đề này không còn khả dụng', 'Bạn vẫn xem được điểm và lịch sử đã làm.')}</div>${histBlock}`;
    toggleHist(); return;
  }
  const acc = quizAccess(quiz, Date.now(), mine.length);
  const left = quiz.maxAttempts > 0 ? Math.max(0, quiz.maxAttempts - mine.length) : null;
  const practice = quiz.mode === 'practice';
  const info = (icon, label, val) => `<div class="info-row">${ic(icon, 18)}<span>${label}</span><b>${val}</b></div>`;
  root.innerHTML = `<a class="back" href="#/">${ic('left', 16)} Quay lại</a>
    <div class="card pad narrow start">
      <h1>${esc(quiz.title)}</h1>${quiz.description ? `<p class="muted pre center-t">${esc(quiz.description)}</p>` : ''}
      <div class="info-list">${info('clock', 'Thời gian làm bài', quiz.minutes > 0 ? quiz.minutes + ' phút' : 'Không giới hạn')}${info('list', 'Số lượng câu hỏi', quiz.count || 0)}${info('file', 'Loại đề', practice ? 'Luyện tập' : 'Kiểm tra')}${left !== null ? info('refresh', 'Số lần làm còn lại', left) : ''}${quiz.openAt || quiz.closeAt ? info('clock', 'Thời gian vào thi', timeText(quiz)) : ''}</div>
      ${running ? `<a class="btn primary lg block" href="#/exam/${running.id}">${ic('play', 18)} Tiếp tục bài đang làm</a>`
        : acc.ok ? `<button class="btn primary lg block" id="start">${ic('play', 18)} ${practice ? 'Bắt đầu luyện tập' : 'Bắt đầu làm bài'}</button>`
        : `<div class="note warn" style="margin:0">${ic('alert', 16)}<span>${esc(acc.reason)}</span></div>`}
    </div>${histBlock}`;
  toggleHist();
  root.querySelector('#start')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const qs = await getContent(quiz.id);
      if (!qs.length) throw new Error('Đề này chưa có câu hỏi.');
      const sq = isOn(quiz.shuffleQ), sa = isOn(quiz.shuffleA);
      const now = Date.now();
      const ref = await F.addDoc(F.collection(db, 'attempts'), {
        uid: state.user.uid, userName: state.profile.displayName || 'Học viên', className: state.profile.className || '',
        quizId: quiz.id, quizTitle: quiz.title, mode: quiz.mode, status: 'in_progress', startedAt: now,
        minutes: quiz.minutes || 0, deadline: quiz.minutes > 0 ? now + quiz.minutes * 60000 : null, passScore: quiz.passScore ?? 5,
        plan: buildPlan(qs, sq, sa), answers: {}, marked: [], log: [], cur: 0, total: qs.length, lastSeen: now, shuffleQ: sq, shuffleA: sa,
      });
      go('/exam/' + ref.id);
    } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
  });
}

// ====================== LỊCH SỬ ======================
export async function renderHistory(root) {
  root.innerHTML = loading();
  const list = (await myAttempts()).sort((a, b) => b.startedAt - a.startedAt);
  root.innerHTML = `<h1 class="ptitle">Lịch sử làm bài</h1>
    ${list.length ? `<div class="card list-card">${list.map((a) => a.status === 'submitted' ? resultRow(a)
      : `<a class="row-item" href="#/exam/${a.id}"><div class="ri-b"><b>${esc(a.quizTitle)}</b><span class="muted">Bắt đầu ${fmtDate(a.startedAt)}</span></div><span class="tag warn">${stillRunning(a) ? 'Đang làm dở' : 'Chưa nộp'}</span></a>`).join('')}</div>`
      : empty('clock', 'Bạn chưa làm đề nào')}`;
}

// ====================== TÀI KHOẢN ======================
export function renderProfile(root) {
  const p = state.profile, guest = isGuest();
  const canPw = !guest && auth.currentUser?.providerData?.[0]?.providerId === 'password';
  root.innerHTML = `<h1 class="ptitle">Tài khoản</h1>
    <div class="card pad profile"><div class="pf-h">${avatar(p.displayName, 64)}<div><h2>${esc(p.displayName || 'Khách')}</h2>
      <div class="muted">${guest ? 'Đang dùng chế độ khách' : esc(displayLogin(p))}</div><div style="margin-top:6px">${classChip(p.className)}</div></div></div>
      <div class="row" style="margin-top:16px">
        ${canPw ? `<button class="btn" id="pw">${ic('key', 16)} Đổi mật khẩu</button>` : ''}
        <button class="btn danger-o" id="out">${ic('logout', 16)} ${guest ? 'Thoát chế độ khách' : 'Đăng xuất'}</button></div></div>`;
  root.querySelector('#out').onclick = () => hooks.logout();
  root.querySelector('#pw')?.addEventListener('click', () => modal({
    title: 'Đổi mật khẩu', okText: 'Đổi mật khẩu',
    html: `<label class="field"><span>Mật khẩu hiện tại</span><input class="input" type="password" id="o" autocomplete="current-password"></label>
           <label class="field"><span>Mật khẩu mới (từ 6 ký tự)</span><input class="input" type="password" id="n" autocomplete="new-password"></label>`,
    onOk: async (box) => {
      const o = box.querySelector('#o').value, n = box.querySelector('#n').value;
      if (n.length < 6) throw new Error('Mật khẩu mới cần ít nhất 6 ký tự.');
      try {
        const u = auth.currentUser;
        await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, o));
        await A.updatePassword(u, n);
      } catch (e) { throw new Error(authError(e)); }
      F.deleteDoc(F.doc(db, 'userSecrets', state.user.uid)).catch(() => {});
      toast('Đã đổi mật khẩu.', 'success'); return true;
    },
  }));
}
