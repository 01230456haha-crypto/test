// Giao diện học viên: danh sách lớp → thư mục → đề, vào làm bài, lịch sử, cài đặt.
import { auth, db, A, F } from './fb.js';
import { state, go, hooks, isGuest, isAdmin, authError } from './state.js';
import { esc, byName, canSeeQuiz, quizAccess, fmtDate, fmtTime, fmtScore, buildPlan, displayLogin, audienceOf, folderAudience, folderChain, isOn, shuffle, userClasses } from './lib.js';
import { getFolders, getQuizzes, getQuiz, getContent, getAttemptsWhere } from './data.js';
import { ic } from './icons.js';
import { toast, modal, loading, empty, avatar, classChip, classChips, debounce, store, applyTheme, currentTheme, isSoundOn, setSound, beep } from './ui.js';

const myAttempts = () => getAttemptsWhere('uid', state.user.uid);
const scoreClass = (a) => ((a.score ?? 0) >= (a.passScore ?? 5) ? 'good' : 'bad');
const stillRunning = (a) => a.status === 'in_progress' && (!a.deadline || a.deadline > Date.now());
const norm = (x) => String(x || '').trim().toLowerCase();
const timeText = (q) => (q.openAt || q.closeAt ? `${q.openAt ? fmtDate(q.openAt) : '…'} – ${q.closeAt ? fmtDate(q.closeAt) : '…'}` : 'Không thời hạn');
const chTitle = (k) => (k === '@free' ? 'Tự do' : k === '@own' ? 'Giao riêng cho bạn' : k === '@all' ? 'Tất cả đề (xem như học viên)' : k);

/** Đề này thuộc "kênh" nào của học viên: tên lớp, @own (giao riêng), @free (giao mọi người). */
function channelsOf(q, folders, profile, uid) {
  if (profile.role === 'guest') return new Set(['@free']);
  const keys = new Set(), mine = userClasses(profile);
  const specs = [[audienceOf(q), q], ...folderChain(folders, q.folderId).map((f) => [folderAudience(f), f])];
  for (const [aud, sp] of specs) {
    if (aud === 'all') keys.add('@free');
    else if (aud === 'classes') {
      (sp.allowedClasses || []).forEach((c) => { const m = mine.find((x) => norm(x) === norm(c)); if (m) keys.add(m); });
      if ((sp.allowedUsers || []).includes(uid)) keys.add('@own');
    } else if (aud === 'students' && (sp.allowedUsers || []).includes(uid)) keys.add('@own');
  }
  return keys;
}

function examRow(q, attempts) {
  const done = attempts.filter((a) => a.quizId === q.id && a.status === 'submitted' && !a.retry).sort((a, b) => b.submittedAt - a.submittedAt);
  const l = done[0], acc = quizAccess(q, Date.now(), attempts.filter((a) => a.quizId === q.id && !a.retry).length);
  return `<a class="exam-row ${acc.ok ? '' : 'off'}" href="#/quiz/${q.id}" data-t="${esc(norm(q.title))}"><span class="er-ic mode-${q.mode}">${ic(q.mode === 'practice' ? 'sparkle' : 'file', 24)}</span>
    <div class="er-b"><b>${esc(q.title)}</b>
      <span>${l ? `Điểm của bạn: <b class="${scoreClass(l)}">${fmtScore(l.score)}</b>` : '<span class="muted">Chưa làm</span>'}</span>
      ${q.openAt || q.closeAt ? `<span class="muted">Thời gian vào thi: ${timeText(q)}</span>` : ''}
      ${acc.ok ? '' : `<span class="tag warn">${esc(acc.reason)}</span>`}</div></a>`;
}
function resumeBanner(running) {
  return running.length ? `<div class="resume">${running.map((a) => `<a class="resume-i" href="#/exam/${a.id}">${ic('play', 18)}<div><b>Tiếp tục: ${esc(a.quizTitle)}</b><span>Đã làm ${Object.keys(a.answers || {}).length}/${a.total} câu</span></div>${ic('right', 18)}</a>`).join('')}</div>` : '';
}
async function loadAll() {
  const guest = isGuest(), admin = isAdmin();
  const [quizzes, folders, attempts] = await Promise.all([getQuizzes(guest), getFolders(), myAttempts().catch(() => [])]);
  const vis = quizzes.filter((q) => canSeeQuiz(q, folders, state.profile, state.user.uid)).sort(byName);
  const inChannel = (q, k) => (admin ? true : channelsOf(q, folders, state.profile, state.user.uid).has(k));
  return { guest, admin, folders, attempts, vis, inChannel };
}

// ====================== TRANG CHỦ: DANH SÁCH LỚP ======================
export async function renderHome(root) {
  root.innerHTML = loading();
  const { admin, folders, attempts, vis } = await loadAll();
  const running = attempts.filter(stillRunning).sort((a, b) => b.startedAt - a.startedAt);
  const counts = {};
  if (admin) counts['@all'] = vis.length;
  else vis.forEach((q) => channelsOf(q, folders, state.profile, state.user.uid).forEach((k) => (counts[k] = (counts[k] || 0) + 1)));
  const mine = userClasses(state.profile);
  const keys = [...mine.filter((c) => counts[c]), ...['@own', '@free', '@all'].filter((k) => counts[k])];
  const card = (k) => `<a class="class-card" href="#/class/${encodeURIComponent(k)}" style="--h:${k.startsWith('@') ? 215 : (k.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0))}"><div class="cc-ic">${ic(k === '@free' ? 'sparkle' : k === '@own' ? 'user' : 'book', 22)}</div><b>${esc(chTitle(k))}</b><div class="cc-m"><span>${ic('file', 14)} ${counts[k]} đề thi</span></div></a>`;

  root.innerHTML = `<div class="page-h"><h1 class="ptitle">Danh sách lớp</h1>${vis.length ? `<div class="search">${ic('search', 16)}<input class="input" id="q" placeholder="Tìm đề thi"></div>` : ''}</div>
    ${resumeBanner(running)}
    <div id="chs">${keys.length ? `<div class="grid class-grid">${keys.map(card).join('')}</div>` : `<div class="card pad">${empty('book', 'Chưa có đề nào được giao cho bạn', 'Khi giáo viên giao bài, lớp và đề sẽ hiện ở đây.')}</div>`}</div>
    <div id="found" class="hide"></div>`;
  root.oninput = debounce((e) => {
    if (e.target.id !== 'q') return;
    const t = norm(e.target.value), found = root.querySelector('#found'), chs = root.querySelector('#chs');
    chs.classList.toggle('hide', !!t); found.classList.toggle('hide', !t);
    if (t) { const hits = vis.filter((q) => norm(q.title).includes(t)); found.innerHTML = hits.length ? `<div class="card pad"><div class="er-list">${hits.map((q) => examRow(q, attempts)).join('')}</div></div>` : `<div class="card pad">${empty('search', 'Không tìm thấy đề phù hợp')}</div>`; }
  }, 150);
}

// ====================== TRONG MỘT LỚP: THƯ MỤC + ĐỀ ======================
export async function renderClass(root, p) {
  root.innerHTML = loading();
  const key = decodeURIComponent(p.key), fid = p.fid || null;
  const { folders, attempts, vis, inChannel } = await loadAll();
  const V = vis.filter((q) => inChannel(q, key));
  const has = new Set(); V.forEach((q) => folderChain(folders, q.folderId).forEach((f) => has.add(f.id)));
  const subs = folders.filter((f) => (f.parentId || null) === fid && has.has(f.id)).sort(byName);
  const qs = V.filter((q) => (q.folderId || null) === fid);
  const countIn = (f) => V.filter((q) => folderChain(folders, q.folderId).some((x) => x.id === f.id)).length;
  const chain = folderChain(folders, fid).reverse();
  const base = '#/class/' + encodeURIComponent(key);
  if (fid && !chain.length) { root.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy thư mục')}<a class="btn" href="${base}">Quay lại</a></div>`; return; }
  const running = fid ? [] : attempts.filter(stillRunning);
  root.innerHTML = `<a class="back" href="${fid && chain.length > 1 ? base + '/f/' + chain[chain.length - 2].id : fid ? base : '#/'}">${ic('left', 16)} Quay lại</a>
    <div class="page-h"><div><h1 class="ptitle">${fid ? esc(chain[chain.length - 1].name) : esc(chTitle(key))}</h1>
      <div class="crumbs">${ic('book', 15)}<a href="#/">Danh sách lớp</a><span>/</span><a href="${base}">${esc(chTitle(key))}</a>${chain.map((c) => `<span>/</span><a href="${base}/f/${c.id}">${esc(c.name)}</a>`).join('')}</div></div>
      ${subs.length + qs.length > 3 ? `<div class="search">${ic('search', 16)}<input class="input" id="q" placeholder="Tìm trong mục này"></div>` : ''}</div>
    ${resumeBanner(running)}
    ${subs.length ? `<div class="fold-grid">${subs.map((f) => `<a class="fold-card" href="${base}/f/${f.id}" data-t="${esc(norm(f.name))}"><span class="fc-ic">${ic('folder', 22)}</span><div><b>${esc(f.name)}</b><span>${countIn(f)} đề thi</span></div></a>`).join('')}</div>` : ''}
    ${qs.length ? `<div class="card pad"><div class="er-list">${qs.map((q) => examRow(q, attempts)).join('')}</div></div>` : ''}
    ${!subs.length && !qs.length ? `<div class="card pad">${empty('folder', 'Chưa có đề nào ở đây')}</div>` : ''}`;
  root.oninput = debounce((e) => {
    if (e.target.id !== 'q') return; const t = norm(e.target.value);
    root.querySelectorAll('.fold-card,.exam-row').forEach((r) => { r.style.display = !t || (r.dataset.t || '').includes(t) ? '' : 'none'; });
  }, 150);
}

function resultRow(a) {
  return `<a class="row-item" href="#/result/${a.id}"><div class="ri-b"><b>${esc(a.quizTitle)}</b><span class="muted">${fmtDate(a.submittedAt)} · ${fmtTime(a.durationSec)} · ${a.correct}/${a.total} câu đúng</span></div><span class="score big ${scoreClass(a)}">${fmtScore(a.score)}</span></a>`;
}

// ====================== BẮT ĐẦU LÀM ĐỀ ======================
export async function renderQuizStart(root, p) {
  root.innerHTML = loading();
  const [quiz, folders] = await Promise.all([getQuiz(p.id), getFolders().catch(() => [])]);
  const all = await myAttempts().catch(() => []);
  const mine = all.filter((a) => a.quizId === p.id && !a.retry);
  const done = mine.filter((a) => a.status === 'submitted').sort((a, b) => b.submittedAt - a.submittedAt);
  const running = mine.filter(stillRunning)[0];
  const histBlock = done.length ? `<div class="center"><button class="btn" id="hist">${ic('clock', 16)} Xem lịch sử làm bài</button></div><div id="histList" class="hide"><div class="card list-card" style="margin-top:14px">${done.map(resultRow).join('')}</div></div>` : '';
  const toggleHist = () => root.querySelector('#hist')?.addEventListener('click', () => root.querySelector('#histList').classList.toggle('hide'));
  if (!quiz || !canSeeQuiz(quiz, folders, state.profile, state.user.uid)) {
    root.innerHTML = `<a class="back" href="#/">${ic('left', 16)} Quay lại</a><div class="card pad narrow center-t">${empty('lock', 'Đề này không còn khả dụng', 'Bạn vẫn xem được điểm và lịch sử đã làm.')}</div>${histBlock}`;
    toggleHist(); return;
  }
  const acc = quizAccess(quiz, Date.now(), mine.length);
  const left = quiz.maxAttempts > 0 ? Math.max(0, quiz.maxAttempts - mine.length) : null;
  const practice = quiz.mode === 'practice';
  const layout = store.get('quiz_layout') === 'scroll' ? 'scroll' : 'step';
  const total = quiz.pickCount > 0 && quiz.pickCount < (quiz.count || 0) ? quiz.pickCount : quiz.count || 0;
  const info = (icon, label, val) => `<div class="info-row">${ic(icon, 18)}<span>${label}</span><b>${val}</b></div>`;
  root.innerHTML = `<a class="back" href="#/">${ic('left', 16)} Quay lại</a>
    <div class="card pad narrow start">
      <h1>${esc(quiz.title)}</h1>${quiz.description ? `<p class="muted pre center-t">${esc(quiz.description)}</p>` : ''}
      <div class="info-list">${info('clock', 'Thời gian làm bài', quiz.minutes > 0 ? quiz.minutes + ' phút' : 'Không giới hạn')}${info('list', 'Số lượng câu hỏi', total)}${info('file', 'Loại đề', practice ? 'Luyện tập' : 'Kiểm tra')}${left !== null ? info('refresh', 'Số lần làm còn lại', left) : ''}${quiz.openAt || quiz.closeAt ? info('clock', 'Thời gian vào thi', timeText(quiz)) : ''}</div>
      ${!practice && !running && acc.ok ? `<div class="start-layout"><b>Cách hiển thị</b><div class="bigseg sm"><label><input type="radio" name="lay" value="step" ${layout === 'step' ? 'checked' : ''}><span>Từng câu</span></label><label><input type="radio" name="lay" value="scroll" ${layout === 'scroll' ? 'checked' : ''}><span>Cả trang</span></label></div></div>` : ''}
      ${running ? `<a class="btn cta lg block" href="#/exam/${running.id}">${ic('play', 18)} Tiếp tục bài đang làm</a>`
        : acc.ok ? `<button class="btn cta lg block" id="start">${ic('play', 18)} ${practice ? 'Bắt đầu luyện tập' : 'Bắt đầu làm bài'}</button>`
        : `<div class="note warn" style="margin:0">${ic('alert', 16)}<span>${esc(acc.reason)}</span></div>`}
    </div>${histBlock}`;
  toggleHist();
  root.querySelector('#start')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true;
    try {
      const qs = await getContent(quiz.id);
      if (!qs.length) throw new Error('Đề này chưa có câu hỏi.');
      const sq = isOn(quiz.shuffleQ), sa = isOn(quiz.shuffleA);
      const base = quiz.pickCount > 0 && quiz.pickCount < qs.length ? shuffle(qs).slice(0, quiz.pickCount) : qs; // bốc ngẫu nhiên N câu
      const lay = practice ? 'practice' : (root.querySelector('input[name=lay]:checked')?.value || 'step');
      if (!practice) store.set('quiz_layout', lay);
      const cls = userClasses(state.profile), now = Date.now();
      const ref = await F.addDoc(F.collection(db, 'attempts'), {
        uid: state.user.uid, userName: state.profile.displayName || 'Học viên', className: cls.join(', '), classes: cls,
        quizId: quiz.id, quizTitle: quiz.title, mode: lay, status: 'in_progress', startedAt: now,
        minutes: quiz.minutes || 0, deadline: quiz.minutes > 0 ? now + quiz.minutes * 60000 : null, passScore: quiz.passScore ?? 5,
        plan: buildPlan(base, sq, sa), subset: base.length < qs.length, answers: {}, marked: [], checked: [], log: [], cur: 0, total: base.length, lastSeen: now, shuffleQ: sq, shuffleA: sa,
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

// ====================== CÀI ĐẶT (TÀI KHOẢN) ======================
export function renderProfile(root) {
  const p = state.profile, guest = isGuest();
  const canPw = !guest && auth.currentUser?.providerData?.[0]?.providerId === 'password';
  const zi = +(store.get('quiz_zoom') ?? 1), zsel = zi >= 3 ? 'big' : zi <= 0 ? 'small' : 'mid';
  const sw = (id, t, d, on) => `<label class="sw-row"><div><b>${t}</b><span class="muted">${d}</span></div><span class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></span></label>`;
  root.innerHTML = `<h1 class="ptitle">Cài đặt</h1>
    <div class="card pad profile"><div class="pf-h">${avatar(p.displayName, 64)}<div><h2>${esc(p.displayName || 'Khách')}</h2>
      <div class="muted">${guest ? 'Đang dùng chế độ khách' : esc(displayLogin(p))}</div><div style="margin-top:6px">${classChips(p)}</div></div></div>
      ${guest ? '' : `<label class="field" style="margin-top:16px"><span>Tên hiển thị</span><div class="row" style="flex-wrap:nowrap"><input class="input" id="dn" maxlength="40" value="${esc(p.displayName || '')}"><button class="btn primary" id="saveName">Lưu</button></div></label>`}</div>
    <div class="card pad" style="margin-top:14px"><h3>Tùy chọn</h3>
      ${sw('dark', 'Giao diện tối', 'Dịu mắt khi học buổi tối.', currentTheme() === 'dark')}
      ${sw('snd', 'Âm thanh khi luyện tập', 'Tiếng "tưng" khi đúng, "bụp" khi sai.', isSoundOn())}
      <div class="cfg-row" style="padding-top:12px"><div><b>Cỡ chữ khi làm bài</b></div><div class="bigseg sm"><label><input type="radio" name="zs" value="small" ${zsel === 'small' ? 'checked' : ''}><span>Nhỏ</span></label><label><input type="radio" name="zs" value="mid" ${zsel === 'mid' ? 'checked' : ''}><span>Vừa</span></label><label><input type="radio" name="zs" value="big" ${zsel === 'big' ? 'checked' : ''}><span>Lớn</span></label></div></div></div>
    <div class="card pad" style="margin-top:14px"><h3>Tài khoản</h3><div class="row">
      ${canPw ? `<button class="btn" id="pw">${ic('key', 16)} Đổi mật khẩu</button>` : ''}
      <button class="btn danger-o" id="out">${ic('logout', 16)} ${guest ? 'Thoát chế độ khách' : 'Đăng xuất'}</button></div></div>`;
  const $ = (s) => root.querySelector(s);
  $('#out').onclick = () => hooks.logout();
  $('#dark').onchange = (e) => { const t = e.target.checked ? 'dark' : 'light'; store.set('quiz_theme', t); applyTheme(t); };
  $('#snd').onchange = (e) => { setSound(e.target.checked); if (e.target.checked) beep('ok'); };
  root.querySelectorAll('input[name=zs]').forEach((r) => (r.onchange = () => { store.set('quiz_zoom', { small: 0, mid: 1, big: 3 }[r.value]); toast('Đã đổi cỡ chữ.', 'success'); }));
  $('#saveName')?.addEventListener('click', async (e) => {
    const v = $('#dn').value.trim(); if (!v) return toast('Tên không được để trống.', 'error');
    e.currentTarget.disabled = true;
    try { await F.updateDoc(F.doc(db, 'users', state.user.uid), { displayName: v }); state.profile.displayName = v; toast('Đã lưu tên.', 'success'); go('/me'); }
    catch (err) { toast(authError(err), 'error'); e.currentTarget.disabled = false; }
  });
  $('#pw')?.addEventListener('click', () => modal({
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
