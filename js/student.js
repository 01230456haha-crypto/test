// Giao diện học viên: trang chủ, bắt đầu làm đề, lịch sử, tài khoản.
import { auth, db, A, F } from './fb.js';
import { state, go, hooks, isGuest, authError } from './state.js';
import { esc, byName, MODES, canSee, quizAccess, fmtDate, fmtTime, fmtScore, buildPlan, displayLogin } from './lib.js';
import { getFolders, getQuizzes, getQuiz, getContent, getAttemptsWhere, pathOf } from './data.js';
import { ic } from './icons.js';
import { toast, modal, loading, empty, avatar, classChip } from './ui.js';

const myAttempts = () => getAttemptsWhere('uid', state.user.uid);
const modeIcon = { practice: 'sparkle', step: 'file', scroll: 'list' };
const scoreClass = (a) => ((a.score ?? 0) >= (a.passScore ?? 5) ? 'good' : 'bad');
const minutesText = (q) => (q.minutes > 0 ? `${q.minutes} phút` : 'Không giới hạn giờ');

function stillRunning(a) { return a.status === 'in_progress' && (!a.deadline || a.deadline > Date.now()); }

// ====================== TRANG CHỦ ======================
export async function renderHome(root, p) {
  const fid = p.id || null;
  root.innerHTML = loading();
  const guest = isGuest();
  const [folders, quizzes, attempts] = await Promise.all([getFolders(), getQuizzes(guest), myAttempts().catch(() => [])]);
  const vis = quizzes.filter((q) => canSee(q, state.profile, state.user.uid)).sort(byName);
  // thư mục nào có đề hiển thị trong nhánh con
  const hasQuiz = new Set();
  vis.forEach((q) => pathOf(folders, q.folderId).forEach((f) => hasQuiz.add(f.id)));
  const subs = folders.filter((f) => (f.parentId || null) === fid && hasQuiz.has(f.id)).sort(byName);
  const here = vis.filter((q) => (q.folderId || null) === fid);
  const crumbs = pathOf(folders, fid);
  const submitted = attempts.filter((a) => a.status === 'submitted');
  const running = attempts.filter(stillRunning).sort((a, b) => b.startedAt - a.startedAt);
  const lastOf = (qid) => submitted.filter((a) => a.quizId === qid).sort((a, b) => b.submittedAt - a.submittedAt)[0];
  const cntOf = (qid) => attempts.filter((a) => a.quizId === qid).length;
  const avg = submitted.length ? submitted.reduce((s, a) => s + (a.score || 0), 0) / submitted.length : 0;

  root.innerHTML = `
    ${fid ? '' : `<section class="hero">
      <div class="hero-t">${avatar(state.profile.displayName, 52)}<div><h1>Xin chào, ${esc(state.profile.displayName || 'bạn')}</h1>
        <div class="muted-w">${classChip(state.profile.className)} ${guest ? 'Chế độ khách — kết quả chỉ lưu trên thiết bị này' : 'Hôm nay học gì nào?'}</div></div></div>
      <div class="stats"><div><b>${vis.length}</b><span>Đề có thể làm</span></div><div><b>${submitted.length}</b><span>Lần đã làm</span></div><div><b>${submitted.length ? fmtScore(avg) : '—'}</b><span>Điểm trung bình</span></div></div>
    </section>`}
    ${running.length && !fid ? `<div class="resume">${running.map((a) => `<a class="resume-i" href="#/exam/${a.id}">${ic('play', 18)}<div><b>Tiếp tục: ${esc(a.quizTitle)}</b><span>Đã làm ${Object.keys(a.answers || {}).length}/${a.total} câu</span></div>${ic('right', 18)}</a>`).join('')}</div>` : ''}
    <div class="crumbs">${ic('home', 15)}<a href="#/">Tất cả đề</a>${crumbs.map((c) => `<span>/</span><a href="#/f/${c.id}">${esc(c.name)}</a>`).join('')}</div>
    ${subs.length ? `<div class="grid folders">${subs.map((f) => `<a class="folder-card" href="#/f/${f.id}" style="--h:${(f.name.length * 47) % 360}">${ic('folder', 22)}<b>${esc(f.name)}</b></a>`).join('')}</div>` : ''}
    ${here.length ? `<div class="grid quizzes">${here.map((q) => {
      const l = lastOf(q.id), acc = quizAccess(q, Date.now(), cntOf(q.id));
      return `<a class="quiz-card ${acc.ok ? '' : 'off'}" href="#/quiz/${q.id}">
        <div class="qc-ic mode-${q.mode}">${ic(modeIcon[q.mode] || 'file', 20)}</div>
        <div class="qc-b"><b>${esc(q.title)}</b>
          <div class="meta"><span>${q.count || 0} câu</span><span>${minutesText(q)}</span><span>${MODES[q.mode] || ''}</span></div>
          <div class="qc-f">${acc.ok ? (l ? `<span class="score ${scoreClass(l)}">Gần nhất: ${fmtScore(l.score)}</span>` : '<span class="tag">Chưa làm</span>') : `<span class="tag warn">${esc(acc.reason)}</span>`}${cntOf(q.id) ? `<span class="tag">${cntOf(q.id)} lần</span>` : ''}</div>
        </div></a>`;
    }).join('')}</div>` : ''}
    ${!subs.length && !here.length ? empty('book', 'Chưa có đề nào ở đây', 'Giảng viên sẽ giao đề cho bạn sớm.') : ''}
    ${!fid && submitted.length ? `<h3 class="sec">Kết quả gần đây</h3><div class="card list-card">${submitted.sort((a, b) => b.submittedAt - a.submittedAt).slice(0, 5).map(resultRow).join('')}</div>` : ''}`;
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
  const running = mine.filter(stillRunning)[0];
  if (!quiz || !canSee(quiz, state.profile, state.user.uid)) {
    // đề bị ẩn/xóa/không được giao: chỉ cho xem điểm & lịch sử
    root.innerHTML = `<div class="card pad"><h2>Đề không còn khả dụng</h2><p class="muted">Đề này đã bị ẩn hoặc không dành cho bạn. Bạn vẫn xem được điểm và lịch sử đã làm.</p><a class="btn" href="#/history">${ic('clock', 16)} Xem lịch sử</a></div>
      ${mine.filter((a) => a.status === 'submitted').length ? `<h3 class="sec">Lịch sử đề này</h3><div class="card list-card">${mine.filter((a) => a.status === 'submitted').sort((a, b) => b.submittedAt - a.submittedAt).map(resultRow).join('')}</div>` : ''}`;
    return;
  }
  const acc = quizAccess(quiz, Date.now(), mine.length);
  const left = quiz.maxAttempts > 0 ? Math.max(0, quiz.maxAttempts - mine.length) : null;
  const orderTxt = (v, what) => (v === 'always' ? `Đảo ${what}` : v === 'choose' ? '' : `Giữ nguyên ${what}`);
  const chooseQ = quiz.shuffleQ === 'choose', chooseA = quiz.shuffleA === 'choose';
  const modeDesc = { practice: 'Hiện từng câu, chọn xong biết ngay đúng/sai kèm giải thích.', step: 'Làm từng câu, có bảng câu hỏi và đánh dấu xem lại. Nộp xong mới có đáp án.', scroll: 'Tất cả câu hỏi trên một trang. Nộp xong mới có đáp án.' }[quiz.mode];

  root.innerHTML = `
  <a class="back" href="#/">${ic('left', 16)} Quay lại</a>
  <div class="card pad start">
    <div class="start-h"><div class="qc-ic mode-${quiz.mode} lg">${ic(modeIcon[quiz.mode] || 'file', 26)}</div><div><h1>${esc(quiz.title)}</h1>${quiz.description ? `<p class="muted pre">${esc(quiz.description)}</p>` : ''}</div></div>
    <div class="facts">
      <div>${ic('list', 18)}<b>${quiz.count || 0}</b><span>câu hỏi</span></div>
      <div>${ic('clock', 18)}<b>${quiz.minutes > 0 ? quiz.minutes : '∞'}</b><span>${quiz.minutes > 0 ? 'phút' : 'không giới hạn'}</span></div>
      <div>${ic('target', 18)}<b>${quiz.passScore ?? 5}</b><span>điểm đạt</span></div>
      <div>${ic('refresh', 18)}<b>${left === null ? '∞' : left}</b><span>lượt còn lại</span></div>
    </div>
    <div class="note info">${ic('info', 16)}<span><b>${MODES[quiz.mode]}:</b> ${modeDesc}</span></div>
    ${quiz.openAt || quiz.closeAt ? `<p class="muted s">${quiz.openAt ? 'Mở: ' + fmtDate(quiz.openAt) : ''} ${quiz.closeAt ? ' · Đóng: ' + fmtDate(quiz.closeAt) : ''}</p>` : ''}
    <div class="order-info">
      ${chooseQ ? `<label class="check"><input type="checkbox" id="sq"> Đảo thứ tự câu hỏi</label>` : `<span class="tag">${orderTxt(quiz.shuffleQ, 'thứ tự câu hỏi')}</span>`}
      ${chooseA ? `<label class="check"><input type="checkbox" id="sa"> Đảo thứ tự đáp án</label>` : `<span class="tag">${orderTxt(quiz.shuffleA, 'thứ tự đáp án')}</span>`}
      ${quiz.lockReview ? `<span class="tag warn">${ic('lock', 13)} Không xem lại đề sau khi nộp</span>` : ''}
    </div>
    ${running ? `<a class="btn primary lg block" href="#/exam/${running.id}">${ic('play', 18)} Tiếp tục bài đang làm</a>`
      : acc.ok ? `<button class="btn primary lg block" id="start">${ic('play', 18)} Bắt đầu làm bài</button>`
      : `<div class="note warn">${ic('alert', 16)}<span>${esc(acc.reason)}</span></div>`}
  </div>
  ${mine.filter((a) => a.status === 'submitted').length ? `<h3 class="sec">Lịch sử đề này</h3><div class="card list-card">${mine.filter((a) => a.status === 'submitted').sort((a, b) => b.submittedAt - a.submittedAt).map(resultRow).join('')}</div>` : ''}`;

  root.querySelector('#start')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const qs = await getContent(quiz.id);
      if (!qs.length) throw new Error('Đề này chưa có câu hỏi.');
      const sq = quiz.shuffleQ === 'always' || (chooseQ && root.querySelector('#sq').checked);
      const sa = quiz.shuffleA === 'always' || (chooseA && root.querySelector('#sa').checked);
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
