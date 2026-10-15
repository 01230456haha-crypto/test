// Giao diện làm bài (3 dạng) và màn hình kết quả / xem lại.
import { db, F } from './fb.js';
import { state, go, isAdmin } from './state.js';
import { esc, KEYS, MODES, grade, fmtTime, fmtDate, fmtScore, canSee } from './lib.js';
import { getContent, getQuiz } from './data.js';
import { ic } from './icons.js';
import { toast, modal, loading, empty, renderMath, beep, isSoundOn, setSound, store, themeBtn } from './ui.js';

const letter = (pos) => String.fromCharCode(65 + pos);

/** HTML xem lại một câu (dùng ở trang kết quả). keys = thứ tự đáp án đã hiển thị. */
export function reviewQuestionHtml(q, idx, keys, chosen) {
  const status = !chosen ? 'blank' : chosen === q.ans ? 'ok' : 'no';
  const label = { blank: 'Chưa làm', ok: 'Đúng', no: 'Sai' }[status];
  const opts = keys.map((k, pos) => {
    let c = 'opt static';
    if (k === q.ans) c += ' correct'; else if (k === chosen) c += ' wrong';
    const tag = k === q.ans ? '<em class="otag ok">Đáp án đúng</em>' : k === chosen ? '<em class="otag no">Bạn chọn</em>' : '';
    return `<div class="${c}"><span class="ol">${letter(pos)}</span><span class="ot">${esc(q[k])}</span>${tag}</div>`;
  }).join('');
  return `<article class="qcard review ${status}"><div class="qhead"><span class="qno">Câu ${idx + 1}</span><span class="rstat ${status}">${status === 'ok' ? ic('check', 14) : status === 'no' ? ic('x', 14) : ic('alert', 14)} ${label}</span></div>
    <div class="qtext">${esc(q.q)}</div><div class="opts">${opts}</div>
    ${q.exp ? `<div class="explain"><b>${ic('sparkle', 15)} Lời giải</b><div class="pre">${esc(q.exp)}</div></div>` : ''}</article>`;
}

// ====================================================================
//                         MÀN HÌNH LÀM BÀI
// ====================================================================
export async function renderExam(root, p) {
  root.innerHTML = loading();
  const ref = F.doc(db, 'attempts', p.id);
  const snap = await F.getDoc(ref);
  if (!snap.exists() || snap.data().uid !== state.user.uid) { root.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy bài làm')}</div>`; return; }
  const a = { id: p.id, ...snap.data() };
  if (a.status === 'submitted') { go('/result/' + a.id); return; }
  const qs = await getContent(a.quizId);
  if (!qs.length) { root.innerHTML = `<div class="card pad">${empty('alert', 'Đề này chưa có câu hỏi hoặc đã bị xóa')}<a class="btn" href="#/">Về trang chủ</a></div>`; return; }

  const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
  const order = (a.plan?.qOrder || []).filter((id) => byId[id]);
  qs.forEach((q) => { if (!order.includes(q.id)) order.push(q.id); }); // câu mới thêm sau khi bắt đầu
  const n = order.length;
  const optKeys = (id) => {
    const q = byId[id];
    const base = (a.plan?.oOrder?.[id] || KEYS).filter((k) => String(q[k] || '').trim());
    KEYS.forEach((k) => { if (String(q[k] || '').trim() && !base.includes(k)) base.push(k); });
    return base;
  };
  const practice = a.mode === 'practice', scroll = a.mode === 'scroll';
  const lk = 'quiz_att_' + a.id;

  // Trạng thái trong bộ nhớ + khôi phục bản lưu cục bộ nếu máy chủ thiếu
  const S = { answers: { ...(a.answers || {}) }, marked: new Set(a.marked || []), cur: Math.min(a.cur || 0, n - 1) };
  try {
    const loc = JSON.parse(store.get(lk) || 'null');
    if (loc?.answers) for (const [k, v] of Object.entries(loc.answers)) if (!(k in S.answers) && byId[k]) S.answers[k] = v;
  } catch (e) { /* bỏ qua */ }

  document.body.classList.add('in-exam');
  root.innerHTML = `
  <div class="exam">
    <header class="exam-top">
      <div class="et-l"><b class="et-title">${esc(a.quizTitle)}</b>
        <div class="et-badges"><span class="tag mode-${a.mode}">${MODES[a.mode]}</span><span class="tag">${a.shuffleQ ? 'Đảo câu hỏi' : 'Giữ thứ tự câu'}</span><span class="tag">${a.shuffleA ? 'Đảo đáp án' : 'Giữ thứ tự đáp án'}</span></div></div>
      <div class="et-r">
        ${practice ? `<button class="btn icon ghost" id="snd" title="Bật/tắt âm thanh" aria-label="Bật/tắt âm thanh">${ic(isSoundOn() ? 'volume' : 'mute')}</button>` : ''}
        ${themeBtn()}
        <div class="timer" id="timer">${ic('clock', 16)}<span id="tv">--:--</span></div>
        <button class="btn ghost m-only" id="gridBtn">${ic('grid', 16)}</button>
        <button class="btn primary" id="submit">${practice ? 'Kết thúc' : 'Nộp bài'}</button>
      </div>
    </header>
    <div class="progress"><i id="bar"></i></div>
    <div class="exam-body"><main id="main"></main><aside id="side" class="exam-side"></aside></div>
    <div class="sheet-bg" id="sheetBg"></div>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const main = $('#main'), side = $('#side');
  let submitting = false, warned = false, lastFail = 0, timerT, hbT;

  // ---------- Hiển thị một câu ----------
  function qHtml(i) {
    const id = order[i], q = byId[id], keys = optKeys(id), chosen = S.answers[id];
    const locked = practice && chosen;
    const opts = keys.map((k, pos) => {
      let c = 'opt';
      if (chosen === k) c += ' sel';
      if (locked) { if (k === q.ans) c += ' correct'; else if (k === chosen) c += ' wrong'; }
      return `<button class="${c}" data-i="${i}" data-k="${k}" ${locked ? 'disabled' : ''}><span class="ol">${letter(pos)}</span><span class="ot">${esc(q[k])}</span></button>`;
    }).join('');
    const right = chosen === q.ans;
    const explain = locked ? `<div class="explain ${right ? 'ok' : 'no'}"><b>${right ? ic('check', 15) + ' Chính xác!' : ic('x', 15) + ' Chưa đúng — đáp án đúng là ' + letter(keys.indexOf(q.ans))}</b>${q.exp ? `<div class="pre">${esc(q.exp)}</div>` : ''}</div>` : '';
    const mk = S.marked.has(id);
    return `<article class="qcard" id="qc-${i}"><div class="qhead"><span class="qno">Câu ${i + 1}<small>/${n}</small></span>
      <button class="flag ${mk ? 'on' : ''}" data-act="mark" data-i="${i}">${ic('flag', 15)} ${mk ? 'Đã đánh dấu' : 'Đánh dấu xem lại'}</button></div>
      <div class="qtext">${esc(q.q)}</div><div class="opts">${opts}</div>${explain}</article>`;
  }
  const navHtml = () => `<div class="qnav"><button class="btn" data-act="prev" ${S.cur === 0 ? 'disabled' : ''}>${ic('left', 16)} Câu trước</button>
    <span class="muted">${S.cur + 1} / ${n}</span>
    ${S.cur === n - 1 ? `<button class="btn primary" data-act="finish">${practice ? 'Kết thúc' : 'Nộp bài'}</button>` : `<button class="btn primary" data-act="next">Câu sau ${ic('right', 16)}</button>`}</div>`;

  function drawAll() {
    if (scroll) { main.innerHTML = order.map((_, i) => qHtml(i)).join(''); }
    else drawSingle(0);
    renderMath(main); drawGrid(); updateBar();
  }
  function drawSingle(dir) {
    main.innerHTML = qHtml(S.cur) + navHtml();
    main.querySelector('.qcard').classList.add(dir > 0 ? 'in-next' : dir < 0 ? 'in-prev' : 'in-fade');
    renderMath(main);
    main.scrollTo?.(0, 0); window.scrollTo({ top: 0 });
  }
  function redrawCard(i) {
    const el = main.querySelector('#qc-' + i); if (!el) return;
    el.outerHTML = qHtml(i);
    renderMath(main.querySelector('#qc-' + i));
    if (!scroll) { const nav = main.querySelector('.qnav'); if (nav) nav.outerHTML = navHtml(); }
  }
  function updateBar() { $('#bar').style.width = (Object.keys(S.answers).filter((id) => byId[id]).length / n) * 100 + '%'; }

  // ---------- Bảng câu hỏi (QuestionGrid) ----------
  function drawGrid() {
    const done = Object.keys(S.answers).filter((id) => byId[id]).length;
    side.innerHTML = `<div class="grid-box"><div class="gb-h"><b>Bảng câu hỏi</b><button class="btn icon ghost sm m-only" id="gridClose" aria-label="Đóng">${ic('x', 16)}</button></div>
      <div class="gb-stat"><span>Đã làm <b>${done}</b>/${n}</span><span>Đánh dấu <b>${S.marked.size}</b></span></div>
      <div class="qgrid">${order.map((id, i) => {
        let c = 'qn';
        if (S.answers[id]) { c += ' done'; if (practice) c += S.answers[id] === byId[id].ans ? ' ok' : ' no'; }
        if (S.marked.has(id)) c += ' flag';
        if (i === S.cur) c += ' cur';
        return `<button class="${c}" data-go="${i}">${i + 1}</button>`;
      }).join('')}</div>
      <div class="legend"><span><i class="lg none"></i>Chưa làm</span><span><i class="lg done"></i>Đã chọn</span><span><i class="lg flag"></i>Đánh dấu</span>${practice ? '<span><i class="lg no"></i>Sai</span>' : ''}</div></div>`;
  }
  const sheet = (open) => { side.classList.toggle('open', open); $('#sheetBg').classList.toggle('open', open); };

  function goTo(i) {
    i = Math.max(0, Math.min(n - 1, i));
    const dir = i - S.cur; S.cur = i;
    if (scroll) { document.getElementById('qc-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
    else drawSingle(dir);
    drawGrid(); sheet(false);
  }

  // ---------- Lưu ----------
  function persist(fields) {
    store.set(lk, JSON.stringify({ answers: S.answers }));
    F.updateDoc(ref, { ...fields, cur: S.cur, lastSeen: Date.now() }).catch(() => {
      if (!warned) { warned = true; toast('Chưa lưu lên máy chủ được (mất mạng?). Bài vẫn được giữ trên thiết bị này.', 'error', 5000); }
    });
  }
  function pick(i, k) {
    const id = order[i];
    if (submitting || (practice && S.answers[id])) return;
    const same = !practice && S.answers[id] === k; // bấm lại để bỏ chọn
    if (same) delete S.answers[id]; else S.answers[id] = k;
    S.cur = i;
    if (practice) beep(k === byId[id].ans ? 'ok' : 'bad');
    redrawCard(i); drawGrid(); updateBar();
    persist(same ? { [`answers.${id}`]: F.deleteField() } : { [`answers.${id}`]: k, log: F.arrayUnion({ q: id, k, t: Date.now() }) });
  }
  function toggleMark(i) {
    const id = order[i];
    if (S.marked.has(id)) { S.marked.delete(id); persist({ marked: F.arrayRemove(id) }); }
    else { S.marked.add(id); persist({ marked: F.arrayUnion(id) }); }
    redrawCard(i); drawGrid();
  }

  // ---------- Nộp bài ----------
  async function doSubmit(auto) {
    if (submitting) return;
    submitting = true; clearInterval(timerT); clearInterval(hbT);
    const g = grade(qs, S.answers);
    const end = a.deadline ? Math.min(Date.now(), a.deadline) : Date.now();
    try {
      await F.updateDoc(ref, {
        status: 'submitted', submittedAt: end, durationSec: Math.max(0, Math.round((end - a.startedAt) / 1000)),
        correct: g.correct, wrong: g.wrong, blank: g.blank, total: g.total, score: g.score, wrongIds: g.wrongIds,
        answers: S.answers, marked: [...S.marked], lastSeen: Date.now(),
      });
    } catch (e) {
      submitting = false; lastFail = Date.now(); startTimers();
      return toast('Nộp bài chưa được (' + (e.message || 'lỗi mạng') + '). Hãy kiểm tra mạng và thử lại.', 'error', 6000);
    }
    store.del(lk);
    if (auto) toast('Hết giờ — bài đã được tự động nộp.', 'info', 5000);
    go('/result/' + a.id);
  }
  async function askSubmit() {
    const blank = order.map((id, i) => (S.answers[id] ? -1 : i)).filter((i) => i >= 0);
    const marked = order.map((id, i) => (S.marked.has(id) ? i : -1)).filter((i) => i >= 0);
    const chips = (arr, c) => arr.map((i) => `<button class="chip-n ${c}" data-j="${i}">${i + 1}</button>`).join('');
    const v = await modal({
      title: practice ? 'Kết thúc bài luyện tập' : 'Nộp bài', okText: practice ? 'Kết thúc' : 'Nộp bài', cancelText: 'Làm tiếp',
      html: `<p>Bạn đã làm <b>${n - blank.length}/${n}</b> câu.</p>
        ${blank.length ? `<div class="sub-h">${ic('alert', 15)} Chưa làm (${blank.length}) — bấm số để quay lại</div><div class="chips">${chips(blank, '')}</div>` : `<div class="note ok">${ic('check', 16)}<span>Bạn đã trả lời tất cả các câu.</span></div>`}
        ${marked.length ? `<div class="sub-h">${ic('flag', 15)} Đã đánh dấu xem lại (${marked.length})</div><div class="chips">${chips(marked, 'flag')}</div>` : ''}
        <p class="muted s">Sau khi nộp bạn không thể sửa bài.</p>`,
      onOpen: (box) => box.addEventListener('click', (e) => { const b = e.target.closest('[data-j]'); if (b) { box.close(null); goTo(+b.dataset.j); } }),
    });
    if (v) doSubmit(false);
  }

  // ---------- Đồng hồ + heartbeat ----------
  function tick() {
    const el = $('#tv'); if (!el) return;
    const now = Date.now();
    if (a.deadline) {
      const rem = Math.ceil((a.deadline - now) / 1000);
      el.textContent = fmtTime(rem);
      const t = $('#timer'); t.classList.toggle('warn', rem <= 300 && rem > 60); t.classList.toggle('danger', rem <= 60);
      if (rem <= 0 && now - lastFail > 5000) doSubmit(true);
    } else el.textContent = fmtTime((now - a.startedAt) / 1000);
  }
  function startTimers() {
    clearInterval(timerT); clearInterval(hbT);
    timerT = setInterval(tick, 1000); tick();
    hbT = setInterval(() => F.updateDoc(ref, { lastSeen: Date.now(), cur: S.cur }).catch(() => {}), 20000);
  }

  // ---------- Sự kiện ----------
  main.addEventListener('click', (e) => {
    const o = e.target.closest('.opt[data-k]'); if (o) return pick(+o.dataset.i, o.dataset.k);
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'mark') toggleMark(+b.dataset.i);
    else if (act === 'prev') goTo(S.cur - 1);
    else if (act === 'next') goTo(S.cur + 1);
    else if (act === 'finish') askSubmit();
  });
  side.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]'); if (g) return goTo(+g.dataset.go);
    if (e.target.closest('#gridClose')) sheet(false);
  });
  $('#gridBtn').onclick = () => sheet(true);
  $('#sheetBg').onclick = () => sheet(false);
  $('#submit').onclick = askSubmit;
  $('#snd')?.addEventListener('click', (e) => { setSound(!isSoundOn()); e.currentTarget.innerHTML = ic(isSoundOn() ? 'volume' : 'mute'); if (isSoundOn()) beep('ok'); });
  const onKey = (e) => {
    if (e.target.closest('input,textarea,select') || document.querySelector('.overlay')) return;
    if (!scroll && e.key === 'ArrowRight') goTo(S.cur + 1);
    else if (!scroll && e.key === 'ArrowLeft') goTo(S.cur - 1);
    else if (/^[a-dA-D1-4]$/.test(e.key) && !scroll) {
      const pos = isNaN(e.key) ? e.key.toUpperCase().charCodeAt(0) - 65 : +e.key - 1;
      const k = optKeys(order[S.cur])[pos]; if (k) pick(S.cur, k);
    }
  };
  document.addEventListener('keydown', onKey);

  drawAll(); startTimers();
  return () => { clearInterval(timerT); clearInterval(hbT); document.removeEventListener('keydown', onKey); document.body.classList.remove('in-exam'); };
}

// ====================================================================
//                        MÀN HÌNH KẾT QUẢ
// ====================================================================
export async function renderResult(root, p) {
  root.innerHTML = loading();
  const snap = await F.getDoc(F.doc(db, 'attempts', p.id));
  if (!snap.exists()) { root.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy bài làm')}</div>`; return; }
  const a = { id: p.id, ...snap.data() };
  const own = a.uid === state.user.uid;
  if (!own && !isAdmin()) { root.innerHTML = `<div class="card pad">${empty('lock', 'Bạn không có quyền xem bài này')}</div>`; return; }
  if (a.status !== 'submitted') {
    if (own) return go('/exam/' + a.id);
    root.innerHTML = `<div class="card pad">${empty('clock', 'Học viên chưa nộp bài này')}<a class="btn" href="#/admin/user/${a.uid}">Quay lại</a></div>`; return;
  }
  const quiz = await getQuiz(a.quizId).catch(() => null);
  const locked = !isAdmin() && (!quiz || quiz.lockReview || quiz.hidden);
  const pass = (a.score || 0) >= (a.passScore ?? 5);
  const pct = Math.max(0, Math.min(1, (a.score || 0) / 10)), R = 52, C = 2 * Math.PI * R;
  const backHref = own ? '#/' : `#/admin/user/${a.uid}`;

  root.innerHTML = `
  <a class="back" href="${backHref}">${ic('left', 16)} ${own ? 'Về trang chủ' : 'Quay lại học viên'}</a>
  <section class="card pad result ${pass ? 'pass' : 'fail'}">
    <div class="ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${R}" class="rg-bg"/><circle cx="60" cy="60" r="${R}" class="rg-fg" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg>
      <div class="ring-t"><b>${fmtScore(a.score)}</b><span>/ 10</span></div></div>
    <div class="res-b"><div class="verdict ${pass ? 'good' : 'bad'}">${ic(pass ? 'trophy' : 'target', 16)} ${pass ? 'Đạt yêu cầu' : 'Chưa đạt'}</div>
      <h1>${esc(a.quizTitle)}</h1>
      ${own ? '' : `<p class="muted">Học viên: <b>${esc(a.userName)}</b> ${a.className ? '· ' + esc(a.className) : ''}</p>`}
      <p class="muted">Nộp lúc ${fmtDate(a.submittedAt)} · ${MODES[a.mode] || ''}</p></div>
  </section>
  <div class="kpis">
    <div class="kpi ok"><b>${a.correct}</b><span>Câu đúng</span></div><div class="kpi no"><b>${a.wrong}</b><span>Câu sai</span></div>
    <div class="kpi"><b>${a.blank}</b><span>Chưa làm</span></div><div class="kpi"><b>${fmtTime(a.durationSec)}</b><span>Thời gian</span></div></div>
  <div id="review"></div>
  <div class="row center" style="margin:18px 0 8px">${quiz && own && canSee(quiz, state.profile, state.user.uid) ? `<a class="btn primary" href="#/quiz/${quiz.id}">${ic('refresh', 16)} Làm lại đề này</a>` : ''}<a class="btn" href="${backHref}">${own ? 'Về trang chủ' : 'Quay lại'}</a></div>`;

  const rv = root.querySelector('#review');
  if (locked) { rv.innerHTML = `<div class="note warn" style="margin-top:14px">${ic('lock', 16)}<span>Đề này đã bị khóa hoặc ẩn nên bạn chỉ xem được điểm. Bạn không xem lại được đề và đáp án.</span></div>`; return; }
  const qs = await getContent(a.quizId);
  const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
  const order = (a.plan?.qOrder || qs.map((q) => q.id)).filter((id) => byId[id]);
  const answers = a.answers || {};
  const keysOf = (id) => { const b = (a.plan?.oOrder?.[id] || KEYS).filter((k) => String(byId[id][k] || '').trim()); KEYS.forEach((k) => { if (String(byId[id][k] || '').trim() && !b.includes(k)) b.push(k); }); return b; };
  const st = (id) => (!answers[id] ? 'blank' : answers[id] === byId[id].ans ? 'ok' : 'no');
  let filter = 'all';
  const draw = () => {
    const cnt = { all: order.length, no: order.filter((id) => st(id) === 'no').length, blank: order.filter((id) => st(id) === 'blank').length };
    const list = order.map((id, i) => ({ id, i })).filter((x) => filter === 'all' || st(x.id) === filter);
    rv.innerHTML = `<h3 class="sec">Xem lại bài làm</h3>
      <div class="seg">${[['all', 'Tất cả'], ['no', 'Câu sai'], ['blank', 'Chưa làm']].map(([k, t]) => `<button class="${filter === k ? 'on' : ''}" data-f="${k}">${t} <small>${cnt[k]}</small></button>`).join('')}</div>
      <div class="review-list">${list.length ? list.map((x) => reviewQuestionHtml(byId[x.id], x.i, keysOf(x.id), answers[x.id])).join('') : empty('check', 'Không có câu nào ở mục này')}</div>`;
    renderMath(rv);
  };
  rv.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { filter = b.dataset.f; draw(); } });
  draw();
}
