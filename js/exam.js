// Giao diện làm bài (3 dạng) và màn hình kết quả / xem lại.
import { db, F } from './fb.js';
import { state, go, isAdmin } from './state.js';
import { esc, KEYS, MODES, grade, fmtTime, fmtDate, fmtScore, canSee, buildPlan, richText, attemptClasses } from './lib.js';
import { confirmBox } from './ui.js';
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
    return `<div class="${c}"><span class="ol">${letter(pos)}</span><span class="ot rt">${richText(q[k])}</span>${tag}</div>`;
  }).join('');
  return `<article class="qcard review ${status}"><div class="qhead"><span class="qno">Câu ${idx + 1}</span><span class="rstat ${status}">${status === 'ok' ? ic('check', 14) : status === 'no' ? ic('x', 14) : ic('alert', 14)} ${label}</span></div>
    <div class="qtext rt">${richText(q.q)}</div><div class="opts">${opts}</div>
    ${q.exp ? `<div class="explain"><b>${ic('sparkle', 15)} Lời giải</b><div class="rt">${richText(q.exp)}</div></div>` : ''}</article>`;
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
  let qs = await getContent(a.quizId);
  if (a.subset) { const ids = new Set(a.plan?.qOrder || []); qs = qs.filter((q) => ids.has(q.id)); } // ôn câu sai hoặc bốc ngẫu nhiên
  if (!qs.length) { root.innerHTML = `<div class="card pad">${empty('alert', 'Đề này chưa có câu hỏi hoặc đã bị xóa')}<a class="btn" href="#/">Về trang chủ</a></div>`; return; }

  const byId = Object.fromEntries(qs.map((q) => [q.id, q]));
  const order = (a.plan?.qOrder || []).filter((id) => byId[id]);
  if (!a.subset) qs.forEach((q) => { if (!order.includes(q.id)) order.push(q.id); }); // câu mới thêm sau khi bắt đầu
  const n = order.length;
  const optKeys = (id) => {
    const q = byId[id];
    const base = (a.plan?.oOrder?.[id] || KEYS).filter((k) => String(q[k] || '').trim());
    KEYS.forEach((k) => { if (String(q[k] || '').trim() && !base.includes(k)) base.push(k); });
    return base;
  };
  const practice = a.mode === 'practice', scroll = a.mode === 'scroll';
  const lk = 'quiz_att_' + a.id;
  const ZOOMS = [0.9, 1, 1.15, 1.3, 1.5];
  let zi = Math.max(0, Math.min(ZOOMS.length - 1, +(store.get('quiz_zoom') ?? 1)));

  // checked = các câu đã bấm "Kiểm tra" (chỉ ở chế độ luyện tập)
  const S = { answers: { ...(a.answers || {}) }, marked: new Set(a.marked || []), checked: new Set(a.checked || []), cur: Math.min(a.cur || 0, n - 1) };
  try {
    const loc = JSON.parse(store.get(lk) || 'null');
    if (loc?.answers) for (const [k, v] of Object.entries(loc.answers)) if (!(k in S.answers) && byId[k]) S.answers[k] = v;
  } catch (e) { /* bỏ qua */ }
  if (practice) Object.keys(S.answers).forEach((id) => { if (!byId[id]) S.checked.delete(id); });

  document.body.classList.add('in-exam');
  root.innerHTML = `
  <div class="exam" id="exam" style="--z:${ZOOMS[zi]}">
    <header class="exam-top">
      <button class="btn" id="back" aria-label="Quay lại">${ic('left', 16)}<span class="hide-m">Quay lại</span></button>
      <div class="et-c"><b>${esc(a.quizTitle)}</b><span>Thí sinh: ${esc(a.userName || state.profile?.displayName || '')}</span></div>
      <div class="et-r">
        <div class="timer" id="timer">${ic('clock', 16)}<span id="tv">--:--</span></div>
        <button class="tool d-only" id="zout" title="Thu nhỏ chữ" aria-label="Thu nhỏ chữ">${ic('zoomout', 18)}</button>
        <button class="tool d-only" id="zin" title="Phóng to chữ" aria-label="Phóng to chữ">${ic('zoomin', 18)}</button>
        <button class="tool" id="snd" title="Bật/tắt âm thanh" aria-label="Bật/tắt âm thanh">${ic(isSoundOn() ? 'volume' : 'mute', 18)}</button>
      </div>
    </header>
    <div class="progress"><i id="bar"></i></div>
    <main class="exam-main" id="main"></main>
    <footer class="exam-bottom" id="bottom"></footer>
    <div class="cheer" id="cheer"></div>
  </div>`;
  const $ = (s) => root.querySelector(s);
  const main = $('#main');
  let submitting = false, warned = false, lastFail = 0, timerT, hbT, cheerT;
  const isChecked = (id) => practice && S.checked.has(id);

  // ---------- Một câu hỏi ----------
  function explainHtml(id) {
    const q = byId[id], keys = optKeys(id), ok = S.answers[id] === q.ans;
    return `<b>${ok ? ic('check', 15) + ' Chính xác!' : ic('x', 15) + ' Chưa đúng — đáp án đúng là ' + letter(keys.indexOf(q.ans))}</b>${q.exp ? `<div class="rt">${richText(q.exp)}</div>` : ''}`;
  }
  function qHtml(i) {
    const id = order[i], q = byId[id], keys = optKeys(id), chosen = S.answers[id], chk = isChecked(id);
    const opts = keys.map((k, pos) => {
      let c = 'opt';
      if (chk) { if (k === q.ans) c += ' correct'; else if (k === chosen) c += ' wrong'; }
      else if (chosen === k) c += ' sel';
      return `<button class="${c}" data-i="${i}" data-k="${k}" ${chk ? 'disabled' : ''}><span class="ol">${letter(pos)}</span><span class="ot rt">${richText(q[k])}</span></button>`;
    }).join('');
    const mk = S.marked.has(id);
    return `<article class="qcard" id="qc-${i}"><div class="qhead"><span class="qno">Câu ${i + 1}<small>/${n}</small></span>
      <button class="flag ${mk ? 'on' : ''}" data-act="mark" data-i="${i}">${ic('flag', 15)} ${mk ? 'Đã đánh dấu' : 'Đánh dấu'}</button></div>
      <div class="qtext rt">${richText(q.q)}</div><div class="pick-hint">Chọn một đáp án đúng</div><div class="opts">${opts}</div>${chk ? `<div class="explain ${S.answers[id] === q.ans ? 'ok' : 'no'}">${explainHtml(id)}</div>` : ''}</article>`;
  }
  /** Cập nhật câu hỏi TẠI CHỖ (đổi class, thêm lời giải) — không dựng lại thẻ nên không bị nhảy/giật trang. */
  function paintCard(i) {
    const card = document.getElementById('qc-' + i); if (!card) return;
    const id = order[i], q = byId[id], chosen = S.answers[id], chk = isChecked(id);
    card.querySelectorAll('.opt').forEach((b) => {
      const k = b.dataset.k;
      b.classList.toggle('sel', !chk && chosen === k);
      b.classList.toggle('correct', chk && k === q.ans);
      b.classList.toggle('wrong', chk && k === chosen && k !== q.ans);
      b.disabled = chk;
    });
    const mk = S.marked.has(id), fl = card.querySelector('.flag');
    fl.classList.toggle('on', mk); fl.innerHTML = `${ic('flag', 15)} ${mk ? 'Đã đánh dấu' : 'Đánh dấu'}`;
    let ex = card.querySelector('.explain');
    if (chk) {
      if (!ex) { ex = document.createElement('div'); card.appendChild(ex); }
      ex.className = 'explain ' + (chosen === q.ans ? 'ok' : 'no'); ex.innerHTML = explainHtml(id); renderMath(ex);
    } else if (ex) ex.remove();
  }
  function drawAll() {
    if (scroll) main.innerHTML = order.map((_, i) => qHtml(i)).join('');
    else drawSingle(0);
    renderMath(main); drawBottom(); updateBar();
  }
  function drawSingle(dir) {
    main.innerHTML = qHtml(S.cur);
    main.querySelector('.qcard').classList.add(dir > 0 ? 'in-next' : dir < 0 ? 'in-prev' : 'in-fade');
    renderMath(main); window.scrollTo({ top: 0 });
  }
  const doneCount = () => Object.keys(S.answers).filter((id) => byId[id]).length;
  function updateBar() { $('#bar').style.width = (doneCount() / n) * 100 + '%'; }

  // ---------- Thanh dưới ----------
  function drawBottom() {
    const last = S.cur === n - 1, id = order[S.cur];
    const dots = !scroll && n <= 15 ? `<span class="dots d-only">${order.map((x, i) => {
      let c = '';
      if (S.answers[x] !== undefined) c = isChecked(x) ? (S.answers[x] === byId[x].ans ? 'ok' : 'no') : 'done';
      if (i === S.cur) c += ' cur';
      return `<i class="${c}"></i>`;
    }).join('')}</span>` : '';
    let right;
    if (scroll) right = `<button class="btn cta lg" data-act="finish">Nộp bài</button>`;
    else if (practice && !S.checked.has(id)) right = `<button class="btn cta lg" data-act="check" ${S.answers[id] ? '' : 'disabled'}>Kiểm tra</button>`;
    else if (last) right = `<button class="btn cta lg" data-act="finish">${practice ? 'Kết thúc' : 'Nộp bài'}</button>`;
    else right = `<button class="btn primary lg" data-act="next"><span class="hide-m">Câu tiếp theo</span><span class="only-m">Tiếp</span> ${ic('right', 16)}</button>`;
    $('#bottom').innerHTML = `<div class="eb-l">${practice ? `<button class="btn ghost" id="restart">${ic('refresh', 16)}<span class="hide-m">Bắt đầu lại</span></button>` : ''}${scroll ? '' : `<button class="btn" data-act="prev" ${S.cur === 0 ? 'disabled' : ''} aria-label="Câu trước">${ic('left', 16)}</button>`}</div>
      <div class="eb-c"><button class="qcount" id="qlist">${ic('list', 18)} ${scroll ? `Đã làm ${doneCount()}/${n}` : `Câu ${S.cur + 1}/${n}`}</button>${dots}</div>
      <div class="eb-r">${right}</div>`;
  }

  // ---------- Danh sách câu hỏi (cửa sổ) ----------
  async function openList() {
    const cells = order.map((id, i) => {
      let c = 'qn';
      if (S.answers[id] !== undefined) { c += ' done'; if (isChecked(id)) c += S.answers[id] === byId[id].ans ? ' ok' : ' no'; }
      if (S.marked.has(id)) c += ' flag';
      if (i === S.cur && !scroll) c += ' cur';
      return `<button class="${c}" data-go="${i}">${i + 1}</button>`;
    }).join('');
    const v = await modal({
      title: 'Danh sách câu hỏi', wide: true, okText: practice ? 'Kết thúc' : 'Nộp bài', cancelText: 'Đóng',
      html: `<div class="gb-stat"><span>Đã làm <b>${doneCount()}</b>/${n}</span><span>Đánh dấu <b>${S.marked.size}</b></span></div><div class="qgrid">${cells}</div>
        <div class="legend"><span><i class="lgd"></i>Chưa làm</span><span><i class="lgd done"></i>Đã chọn</span><span><i class="lgd flag"></i>Đánh dấu</span>${practice ? '<span><i class="lgd ok"></i>Đúng</span><span><i class="lgd no"></i>Sai</span>' : ''}</div>`,
      onOpen: (box) => box.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) { box.close(null); goTo(+g.dataset.go); } }),
    });
    if (v) askSubmit();
  }
  function goTo(i) {
    i = Math.max(0, Math.min(n - 1, i));
    const dir = i - S.cur; S.cur = i;
    if (scroll) document.getElementById('qc-' + i)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else drawSingle(dir);
    drawBottom();
  }

  // ---------- Thông báo nhỏ gọn "Chính xác!" / "Chưa đúng" (không che câu hỏi) ----------
  const GOOD = ['Chính xác!', 'Tuyệt vời!', 'Làm tốt lắm!', 'Quá đỉnh!'], BAD = ['Chưa đúng', 'Cố lên!', 'Xem lời giải nhé'];
  function cheer(ok) {
    const pool = ok ? GOOD : BAD, el = $('#cheer'); if (!el) return;
    el.className = 'cheer ' + (ok ? 'good' : 'bad');
    el.innerHTML = `${ic(ok ? 'star' : 'x', 18)}<b>${pool[Math.floor(Math.random() * pool.length)]}</b>`;
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(cheerT); cheerT = setTimeout(() => el.classList.remove('show'), 1500);
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
    if (submitting || isChecked(id)) return;
    const same = S.answers[id] === k; // bấm lại để bỏ chọn
    if (same) delete S.answers[id]; else S.answers[id] = k;
    S.cur = i;
    if (practice) beep('tap');
    paintCard(i); drawBottom(); updateBar();
    persist(same ? { [`answers.${id}`]: F.deleteField() } : { [`answers.${id}`]: k, log: F.arrayUnion({ q: id, k, t: Date.now() }) });
  }
  /** Luyện tập: bấm "Kiểm tra" mới hiện đúng/sai (tránh chạm nhầm). */
  function check() {
    const id = order[S.cur];
    if (!practice || submitting || !S.answers[id] || S.checked.has(id)) return;
    S.checked.add(id);
    const ok = S.answers[id] === byId[id].ans;
    beep(ok ? 'ok' : 'bad'); cheer(ok);
    paintCard(S.cur); drawBottom();
    persist({ checked: F.arrayUnion(id) });
  }
  function toggleMark(i) {
    const id = order[i];
    if (S.marked.has(id)) { S.marked.delete(id); persist({ marked: F.arrayRemove(id) }); }
    else { S.marked.add(id); persist({ marked: F.arrayUnion(id) }); }
    paintCard(i);
  }
  async function restart() {
    if (!(await confirmBox('Làm lại từ đầu? Các câu đã chọn sẽ bị xóa.', 'Bắt đầu lại'))) return;
    S.answers = {}; S.marked.clear(); S.checked.clear(); S.cur = 0;
    persist({ answers: {}, marked: [], checked: [] }); drawAll();
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
    else if (g.score >= (a.passScore ?? 5)) beep('done');
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
        ${marked.length ? `<div class="sub-h">${ic('flag', 15)} Đã đánh dấu (${marked.length})</div><div class="chips">${chips(marked, 'flag')}</div>` : ''}`,
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
    const m = e.target.closest('[data-act=mark]'); if (m) toggleMark(+m.dataset.i);
  });
  $('#bottom').addEventListener('click', (e) => {
    if (e.target.closest('#qlist')) return openList();
    if (e.target.closest('#restart')) return restart();
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'prev') goTo(S.cur - 1);
    else if (act === 'next') goTo(S.cur + 1);
    else if (act === 'check') check();
    else if (act === 'finish') askSubmit();
  });
  $('#back').onclick = () => { toast('Bài làm đã được lưu, bạn có thể tiếp tục sau.', 'info'); go('/'); };
  const setZoom = (d) => { zi = Math.max(0, Math.min(ZOOMS.length - 1, zi + d)); store.set('quiz_zoom', zi); $('#exam').style.setProperty('--z', ZOOMS[zi]); $('#zout').disabled = zi === 0; $('#zin').disabled = zi === ZOOMS.length - 1; };
  $('#zout').onclick = () => setZoom(-1); $('#zin').onclick = () => setZoom(1); setZoom(0);
  $('#snd').addEventListener('click', (e) => { setSound(!isSoundOn()); e.currentTarget.innerHTML = ic(isSoundOn() ? 'volume' : 'mute', 18); if (isSoundOn()) beep('ok'); });
  const onKey = (e) => {
    if (e.target.closest('input,textarea,select') || document.querySelector('.overlay') || scroll) return;
    if (e.key === 'ArrowRight') goTo(S.cur + 1);
    else if (e.key === 'ArrowLeft') goTo(S.cur - 1);
    else if (e.key === 'Enter') {
      const id = order[S.cur];
      if (practice && !S.checked.has(id)) check();
      else if (S.cur === n - 1) askSubmit(); else goTo(S.cur + 1);
    } else if (/^[a-dA-D1-4]$/.test(e.key)) {
      const pos = isNaN(e.key) ? e.key.toUpperCase().charCodeAt(0) - 65 : +e.key - 1;
      const k = optKeys(order[S.cur])[pos]; if (k) pick(S.cur, k);
    }
  };
  document.addEventListener('keydown', onKey);

  drawAll(); startTimers();
  return () => { clearInterval(timerT); clearInterval(hbT); clearTimeout(cheerT); document.removeEventListener('keydown', onKey); document.body.classList.remove('in-exam'); };
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
      ${own ? '' : `<p class="muted">Học viên: <b>${esc(a.userName)}</b> ${attemptClasses(a).length ? '· ' + esc(attemptClasses(a).join(', ')) : ''}</p>`}
      <p class="muted">Nộp lúc ${fmtDate(a.submittedAt)} · ${MODES[a.mode] || ''}</p>
      ${own && !locked && a.wrong > 0 ? `<button class="btn cta" id="retry">${ic('refresh', 16)} Ôn lại ${a.wrong} câu sai</button>` : ''}</div>
  </section>
  ${a.comment ? `<div class="cmt"><b>${ic('mail', 16)} Nhận xét của giáo viên</b><div class="pre">${esc(a.comment)}</div></div>` : ''}
  ${own ? '' : `<div class="card pad" style="margin-bottom:14px"><label class="field" style="margin:0"><span>Nhận xét gửi học viên</span><textarea class="input" id="cmtBox" rows="2" placeholder="Ví dụ: Em cần xem lại chương 2…">${esc(a.comment || '')}</textarea></label><button class="btn primary sm" id="cmtSave" style="margin-top:8px">${ic('save', 15)} Lưu nhận xét</button></div>`}
  <div class="kpis">
    <div class="kpi ok"><b>${a.correct}</b><span>Câu đúng</span></div><div class="kpi no"><b>${a.wrong}</b><span>Câu sai</span></div>
    <div class="kpi"><b>${a.blank}</b><span>Chưa làm</span></div><div class="kpi"><b>${fmtTime(a.durationSec)}</b><span>Thời gian</span></div></div>
  <div id="review"></div>
  ${own ? '' : `<div class="row center" style="margin-top:18px"><button class="btn danger-o" id="delAtt">${ic('trash', 16)} Xóa bài này (cho thi lại)</button></div>`}
  <div class="row center" style="margin:18px 0 8px">${quiz && own && canSee(quiz, state.profile, state.user.uid) ? `<a class="btn primary" href="#/quiz/${quiz.id}">${ic('refresh', 16)} Làm lại đề này</a>` : ''}<a class="btn" href="${backHref}">${own ? 'Về trang chủ' : 'Quay lại'}</a></div>`;

  root.querySelector('#cmtSave')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    try { await F.updateDoc(F.doc(db, 'attempts', a.id), { comment: root.querySelector('#cmtBox').value.trim() }); toast('Đã lưu nhận xét.', 'success'); }
    catch (err) { toast(err.message, 'error'); }
    ev.currentTarget.disabled = false;
  });
  root.querySelector('#delAtt')?.addEventListener('click', async () => {
    if (!(await confirmBox('Xóa bài làm này? Học viên sẽ được làm lại.', 'Xóa', true))) return;
    await F.deleteDoc(F.doc(db, 'attempts', a.id)); toast('Đã xóa bài làm.', 'success'); go('/admin/user/' + a.uid);
  });
  root.querySelector('#retry')?.addEventListener('click', async (ev) => {
    ev.currentTarget.disabled = true;
    try {
      const wrongIds = a.wrongIds || [];
      const qsAll = await getContent(a.quizId);
      const base = qsAll.filter((q) => wrongIds.includes(q.id));
      if (!base.length) throw new Error('Không tìm thấy các câu sai (đề có thể đã bị sửa).');
      const now = Date.now();
      const ref = await F.addDoc(F.collection(db, 'attempts'), {
        uid: state.user.uid, userName: a.userName || state.profile.displayName || 'Học viên', className: a.className || '',
        quizId: a.quizId, quizTitle: (a.quizTitle || '') + ' (ôn câu sai)', mode: 'practice', status: 'in_progress', startedAt: now,
        minutes: 0, deadline: null, passScore: a.passScore ?? 5, plan: buildPlan(base, true, false), subset: true, retry: true,
        answers: {}, marked: [], log: [], cur: 0, total: base.length, lastSeen: now, shuffleQ: true, shuffleA: false,
      });
      go('/exam/' + ref.id);
    } catch (err) { toast(err.message, 'error'); ev.currentTarget.disabled = false; }
  });
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
