// Trình soạn đề: Câu hỏi · Cài đặt · Giao bài · Kết quả · Đang làm
import { db, F } from './fb.js';
import { go } from './state.js';
import { esc, KEYS, finalize, mergeQuestions, newQuestionId, quizStats, attemptsToRows, fmtDate, fmtTime, fmtScore, toLocalInput, fromLocalInput, audienceOf, isOn } from './lib.js';
import { getQuiz, getContent, saveContent, getClasses, getAll, getAttemptsWhere, deleteAttempts, pathOf, getFolders } from './data.js';
import { parseFile, exportQuestionsXlsx, exportQuestionsWord, downloadTemplate } from './importer.js';
import { ic } from './icons.js';
import { toast, modal, confirmBox, loading, empty, classChip, exportXlsx, safeName, renderMath, debounce } from './ui.js';
import { liveTable, mountAssignPicker, applyAssign, audienceChips } from './adminui.js';

const TABS = [['questions', 'Câu hỏi', 'list'], ['settings', 'Cài đặt', 'settings'], ['assign', 'Giao bài', 'send'], ['results', 'Kết quả', 'chart'], ['live', 'Đang làm', 'activity']];

export async function renderQuizEditor(root, p, q) {
  const id = p.id, tab = q.tab || 'questions';
  root.innerHTML = loading();
  const [quiz, folders] = await Promise.all([getQuiz(id), getFolders()]);
  if (!quiz) { root.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy đề')}<a class="btn" href="#/admin">Quay lại</a></div>`; return; }
  const back = quiz.folderId ? '#/admin/f/' + quiz.folderId : '#/admin/exams';
  const crumbs = pathOf(folders, quiz.folderId);

  const kind = quiz.mode === 'practice' ? 'Luyện tập' : 'Kiểm tra';
  root.innerHTML = `
    <a class="back" href="${back}">${ic('left', 16)} ${crumbs.length ? esc(crumbs[crumbs.length - 1].name) : 'Danh sách đề'}</a>
    <div class="qe-head card pad">
      <div class="qe-t"><span class="qc-ic mode-${quiz.mode} lg">${ic('file', 24)}</span><div><h1>${esc(quiz.title)}</h1>
        <div class="chips-inline"><span class="tag">${quiz.count || 0} câu</span><span class="tag">${quiz.minutes > 0 ? quiz.minutes + ' phút' : 'Không giới hạn giờ'}</span><span class="tag mode-${quiz.mode}">${kind}</span>${audienceChips(quiz)}${quiz.hidden ? '<span class="tag warn">Đang ẩn</span>' : ''}</div></div></div>
      ${audienceOf(quiz) === 'none' ? `<div class="note warn" style="margin-bottom:0">${ic('lock', 16)}<span>Đề này <b>chưa giao</b> nên học viên chưa thấy.</span><a class="btn primary sm" href="#/admin/quiz/${id}?tab=assign">${ic('send', 15)} Giao bài ngay</a></div>` : ''}
    </div>
    <nav class="tabs sub">${TABS.map(([k, n, i]) => `<a href="#/admin/quiz/${id}?tab=${k}" class="${k === tab ? 'on' : ''}">${ic(i, 16)}<span>${n}</span></a>`).join('')}</nav>
    <div id="tab"></div>`;
  const box = root.querySelector('#tab');
  const ctx = { id, quiz, box, root };
  const fn = { questions: tabQuestions, settings: tabSettings, assign: tabAssign, results: tabResults, live: tabLive }[tab] || tabQuestions;
  const cleanup = await fn(ctx);
  return () => { root.onclick = null; box.onclick = null; if (typeof cleanup === 'function') cleanup(); };
}

// ====================== TAB: CÂU HỎI ======================
async function tabQuestions({ id, quiz, box }) {
  box.innerHTML = loading();
  let qs = await getContent(id), shown = 50, editing = null, isNew = false;
  const persist = async () => { await saveContent(id, qs); };

  function editForm(x) {
    return `<div class="qedit"><label class="field"><span>Nội dung câu hỏi <small>(công thức: $x^2$)</small></span><textarea class="input" id="e-q" rows="3">${esc(x.q)}</textarea></label>
      <div class="opt-edit">${KEYS.map((k) => `<label class="oe"><input type="radio" name="e-ans" value="${k}" ${x.ans === k ? 'checked' : ''}><b>${k}</b><input class="input" id="e-${k}" value="${esc(x[k])}" placeholder="Đáp án ${k}"></label>`).join('')}</div>
      <p class="muted s">Bấm vào nút tròn bên cạnh đáp án đúng.</p>
      <label class="field"><span>Giải thích <small>(không bắt buộc)</small></span><textarea class="input" id="e-exp" rows="2">${esc(x.exp || '')}</textarea></label>
      <div class="row"><button class="btn primary" data-act="save">${ic('check', 16)} Lưu câu</button><button class="btn" data-act="cancel">Hủy</button></div></div>`;
  }
  function card(x, i) {
    if (editing === x.id) return `<div class="qrow editing" data-id="${x.id}"><div class="qr-n">${i + 1}</div><div class="qr-b">${editForm(x)}</div></div>`;
    return `<div class="qrow" data-id="${x.id}"><div class="qr-n">${i + 1}</div><div class="qr-b"><div class="qr-q">${esc(x.q)}</div>
      <div class="qr-o">${KEYS.filter((k) => x[k]).map((k) => `<span class="${k === x.ans ? 'ok' : ''}"><b>${k}</b> ${esc(x[k])}</span>`).join('')}</div>
      ${x.exp ? `<div class="qr-e">${ic('sparkle', 13)} ${esc(x.exp)}</div>` : ''}</div>
      <div class="qr-a"><button class="btn icon ghost sm" data-act="up" title="Lên" ${i === 0 ? 'disabled' : ''}>${ic('left', 15).replace('<svg', '<svg style="transform:rotate(90deg)"')}</button>
        <button class="btn icon ghost sm" data-act="down" title="Xuống" ${i === qs.length - 1 ? 'disabled' : ''}>${ic('left', 15).replace('<svg', '<svg style="transform:rotate(-90deg)"')}</button>
        <button class="btn icon ghost sm" data-act="edit" title="Sửa">${ic('edit', 16)}</button><button class="btn icon ghost sm" data-act="del" title="Xóa">${ic('trash', 16)}</button></div></div>`;
  }
  function draw() {
    box.innerHTML = `<div class="toolbar">
        <button class="btn primary" data-act="add">${ic('plus', 16)} Thêm câu</button>
        <button class="btn" data-act="import">${ic('upload', 16)} Nhập từ file / dán văn bản</button>
        <button class="btn" data-act="xlsx" ${qs.length ? '' : 'disabled'}>${ic('download', 16)} Xuất Excel</button>
        <button class="btn" data-act="word" ${qs.length ? '' : 'disabled'}>${ic('download', 16)} Xuất Word</button>
        <button class="btn ghost" data-act="tpl">Tải Excel mẫu</button></div>
      ${qs.length ? '' : `<div class="card pad">${empty('file', 'Đề chưa có câu hỏi nào', 'Bấm "Thêm câu" để soạn trực tiếp hoặc "Nhập từ file" để tải lên Excel/Word.')}</div>`}
      <div class="qlist">${qs.slice(0, shown).map(card).join('')}${isNew && editing ? '' : ''}</div>
      ${qs.length > shown ? `<div class="row center"><button class="btn" data-act="more">Hiện thêm (${qs.length - shown} câu nữa)</button></div>` : ''}`;
    renderMath(box);
  }
  const rowId = (e) => e.target.closest('.qrow')?.dataset.id;

  box.onclick = async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act, qid = rowId(e), i = qs.findIndex((x) => x.id === qid);
    try {
      if (act === 'add') {
        const nq = { id: newQuestionId(qs), q: '', A: '', B: '', C: '', D: '', ans: 'A', exp: '' };
        qs.push(nq); editing = nq.id; isNew = true; shown = Math.max(shown, qs.length); draw();
        box.querySelector('.qrow.editing')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (act === 'edit') { editing = qid; isNew = false; draw(); }
      else if (act === 'cancel') { if (isNew) qs = qs.filter((x) => x.id !== editing); editing = null; isNew = false; draw(); }
      else if (act === 'save') {
        const g = (s) => box.querySelector(s).value;
        const r = finalize([{ id: qid, q: g('#e-q'), A: g('#e-A'), B: g('#e-B'), C: g('#e-C'), D: g('#e-D'), ans: box.querySelector('input[name=e-ans]:checked')?.value, exp: g('#e-exp') }]);
        if (!r.questions.length) return toast(r.errors[0] || 'Câu hỏi chưa hợp lệ.', 'error');
        qs[i] = { ...r.questions[0], id: qid }; editing = null; isNew = false;
        await persist(); draw(); toast('Đã lưu câu hỏi.', 'success');
      } else if (act === 'del') {
        if (!(await confirmBox(`Xóa câu ${i + 1}?`, 'Xóa', true))) return;
        qs.splice(i, 1); await persist(); draw();
      } else if (act === 'up' || act === 'down') {
        const j = act === 'up' ? i - 1 : i + 1; if (j < 0 || j >= qs.length) return;
        [qs[i], qs[j]] = [qs[j], qs[i]]; await persist(); draw();
      } else if (act === 'more') { shown += 50; draw(); }
      else if (act === 'xlsx') exportQuestionsXlsx(quiz.title, qs);
      else if (act === 'word') exportQuestionsWord(quiz.title, qs);
      else if (act === 'tpl') downloadTemplate();
      else if (act === 'import') {
        const r = await importModal(qs.length);
        if (!r) return;
        qs = r.replace ? r.questions : mergeQuestions(qs, r.questions);
        await persist(); draw(); toast(`Đã nhập ${r.questions.length} câu.`, 'success');
      }
    } catch (err) { toast(err.message, 'error'); }
  };
  draw();
}

function importModal(existing) {
  let res = null;
  return modal({
    title: 'Nhập câu hỏi', wide: true, okText: 'Áp dụng',
    html: `<div class="seg"><button class="on" data-t="file">Tải file lên</button><button data-t="paste">Dán văn bản từ Word</button></div>
      <div id="p-file"><label class="drop">${ic('upload', 30)}<b>Chọn file Excel, CSV, JSON hoặc Word</b><span>.xlsx · .csv · .json · .docx · .txt</span><input type="file" id="fi" hidden accept=".xlsx,.xls,.csv,.json,.docx,.txt"></label>
        <p class="muted s">Cột Excel: STT, Mã câu, Câu hỏi, A, B, C, D, Đáp án, Giải thích (STT, Mã câu, Giải thích có thể bỏ trống).</p></div>
      <div id="p-paste" class="hide"><textarea class="input" id="tx" rows="9" placeholder="Câu 1: Thủ đô của Việt Nam?&#10;A. Hà Nội&#10;B. Huế&#10;C. Đà Nẵng&#10;D. Cần Thơ&#10;Đáp án: A&#10;Giải thích: …"></textarea><button class="btn" id="parse" style="margin-top:8px">Phân tích văn bản</button></div>
      <div id="pv"></div>
      ${existing ? `<div class="field" style="margin-top:12px"><span>Cách nhập</span><label class="check"><input type="radio" name="md" value="add" checked> Thêm vào cuối đề (đang có ${existing} câu)</label><label class="check"><input type="radio" name="md" value="rep"> Thay thế toàn bộ câu hỏi hiện có</label></div>` : ''}`,
    onOpen: (m) => {
      const show = (r) => {
        res = r;
        m.querySelector('#pv').innerHTML = `<div class="note ${r.questions.length ? 'ok' : 'warn'}" style="margin-top:12px">${ic(r.questions.length ? 'check' : 'alert', 16)}<span>Đọc được <b>${r.questions.length}</b> câu hợp lệ${r.errors.length ? `, <b>${r.errors.length}</b> mục lỗi (sẽ bị bỏ qua)` : ''}.</span></div>
          ${r.errors.length ? `<ul class="errs">${r.errors.slice(0, 10).map((x) => `<li>${esc(x)}</li>`).join('')}${r.errors.length > 10 ? `<li>… và ${r.errors.length - 10} lỗi khác</li>` : ''}</ul>` : ''}`;
      };
      m.querySelectorAll('.seg [data-t]').forEach((b) => (b.onclick = () => {
        m.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
        m.querySelector('#p-file').classList.toggle('hide', b.dataset.t !== 'file');
        m.querySelector('#p-paste').classList.toggle('hide', b.dataset.t !== 'paste');
      }));
      m.querySelector('#fi').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { show(await parseFile(f)); } catch (err) { res = null; m.querySelector('#pv').innerHTML = `<div class="note warn" style="margin-top:12px">${ic('alert', 16)}<span>${esc(err.message)}</span></div>`; }
      };
      m.querySelector('#parse').onclick = async () => {
        const { parseQuestionText } = await import('./lib.js');
        show(parseQuestionText(m.querySelector('#tx').value));
      };
    },
    onOk: (m) => {
      if (!res || !res.questions.length) throw new Error('Chưa có câu hỏi hợp lệ để nhập.');
      return { questions: res.questions, replace: m.querySelector('input[name=md]:checked')?.value === 'rep' };
    },
  });
}

// ====================== TAB: CÀI ĐẶT ======================
async function tabSettings({ id, quiz, box }) {
  const sw = (i, t, d, on) => `<label class="sw-row"><div><b>${t}</b><span class="muted">${d}</span></div><span class="switch"><input type="checkbox" id="${i}" ${on ? 'checked' : ''}><i></i></span></label>`;
  const practice = quiz.mode === 'practice', layout = quiz.mode === 'scroll' ? 'scroll' : 'step';
  const desc = { exam: 'Làm xong nộp bài mới thấy đáp án và điểm. Dùng để kiểm tra.', practice: 'Chọn đáp án xong biết ngay đúng/sai kèm giải thích. Dùng để ôn tập.' };
  box.innerHTML = `<div class="card pad"><div class="cfg-row"><div><h3 style="margin:0">Loại đề</h3><p class="muted" id="kdesc" style="margin:4px 0 0">${practice ? desc.practice : desc.exam}</p></div>
      <div class="bigseg"><label><input type="radio" name="kind" value="exam" ${!practice ? 'checked' : ''}><span>Kiểm tra</span></label><label><input type="radio" name="kind" value="practice" ${practice ? 'checked' : ''}><span>Luyện tập</span></label></div></div>
      <div class="cfg-row ${practice ? 'hide' : ''}" id="layoutRow" style="margin-top:14px"><div><b>Cách hiển thị câu hỏi</b></div>
      <div class="bigseg sm"><label><input type="radio" name="layout" value="step" ${layout === 'step' ? 'checked' : ''}><span>Từng câu</span></label><label><input type="radio" name="layout" value="scroll" ${layout === 'scroll' ? 'checked' : ''}><span>Tất cả trên một trang</span></label></div></div></div>
    <div class="card pad" style="margin-top:14px"><h3>Cấu hình chung</h3>
      <label class="field"><span>Tên đề</span><input class="input" id="title" value="${esc(quiz.title)}"></label>
      <label class="field"><span>Lời nhắn cho học viên <small>(không bắt buộc)</small></span><textarea class="input" id="desc" rows="2">${esc(quiz.description || '')}</textarea></label>
      <div class="two"><label class="field"><span>Thời gian làm bài (phút)</span><input class="input" type="number" min="0" id="minutes" value="${quiz.minutes ?? 0}"><small class="muted">Nhập 0 để không giới hạn thời gian</small></label>
      <label class="field"><span>Điểm đạt (thang 10)</span><input class="input" type="number" min="0" max="10" step="0.5" id="pass" value="${quiz.passScore ?? 5}"></label></div></div>
    <div class="card pad" style="margin-top:14px"><h3>Tùy chọn</h3>
      ${sw('shq', 'Đảo thứ tự câu hỏi', 'Mỗi lần làm, câu hỏi được xáo trộn.', isOn(quiz.shuffleQ))}
      ${sw('sha', 'Đảo thứ tự đáp án', 'Các đáp án A, B, C, D được xáo trộn trong từng câu.', isOn(quiz.shuffleA))}
      ${sw('review', 'Cho xem lại đề và đáp án sau khi nộp', 'Tắt thì học viên chỉ thấy điểm.', !quiz.lockReview)}
      ${sw('hidden', 'Ẩn đề', 'Học viên không thấy đề trong danh sách, chỉ xem được điểm đã làm.', quiz.hidden)}</div>
    <div class="row" style="margin-top:16px"><button class="btn primary lg" id="save">${ic('save', 16)} Lưu cài đặt</button><button class="btn danger-o" id="del">${ic('trash', 16)} Xóa đề</button></div>`;
  box.addEventListener('change', (e) => {
    if (e.target.name === 'kind') {
      box.querySelector('#layoutRow').classList.toggle('hide', e.target.value === 'practice');
      box.querySelector('#kdesc').textContent = desc[e.target.value];
    }
  });
  box.querySelector('#save').onclick = async (e) => {
    const g = (s) => box.querySelector(s);
    const title = g('#title').value.trim(); if (!title) return toast('Tên đề không được để trống.', 'error');
    e.currentTarget.disabled = true;
    try {
      const mode = g('input[name=kind]:checked').value === 'practice' ? 'practice' : g('input[name=layout]:checked').value;
      await F.updateDoc(F.doc(db, 'quizzes', id), {
        title, description: g('#desc').value.trim(), minutes: Math.max(0, +g('#minutes').value || 0), passScore: Math.min(10, Math.max(0, +g('#pass').value || 0)),
        mode, shuffleQ: g('#shq').checked, shuffleA: g('#sha').checked, lockReview: !g('#review').checked, hidden: g('#hidden').checked, updatedAt: Date.now(),
      });
      toast('Đã lưu cài đặt.', 'success'); go('/admin/quiz/' + id + '?tab=settings');
    } catch (err) { toast(err.message, 'error'); e.currentTarget.disabled = false; }
  };
  box.querySelector('#del').onclick = async () => {
    if (!(await confirmBox(`Xóa đề "${quiz.title}"? Lịch sử làm bài của học viên vẫn được giữ.`, 'Xóa đề', true))) return;
    await F.deleteDoc(F.doc(db, 'quizzes', id)); await F.deleteDoc(F.doc(db, 'quizContent', id));
    toast('Đã xóa đề.', 'success'); go(quiz.folderId ? '/admin/f/' + quiz.folderId : '/admin/exams');
  };
}

// ====================== TAB: GIAO BÀI ======================
async function tabAssign({ id, quiz, box }) {
  box.innerHTML = loading();
  const [classes, users] = await Promise.all([getClasses(), getAll('users')]);
  const students = users.filter((u) => u.role === 'user' && u.status !== 'blocked').sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'vi'));
  box.innerHTML = `<div class="card pad"><h3>${ic('send', 18)} Giao đề này cho ai?</h3><div id="ap"></div></div>
    <div class="card pad" style="margin-top:14px"><h3>${ic('clock', 18)} Thời gian & số lần làm <small class="muted">(không bắt buộc)</small></h3><div class="two">
      <label class="field"><span>Mở đề lúc <small>(trống = mở ngay)</small></span><input class="input" type="datetime-local" id="openAt" value="${toLocalInput(quiz.openAt)}"></label>
      <label class="field"><span>Đóng đề lúc <small>(trống = không đóng)</small></span><input class="input" type="datetime-local" id="closeAt" value="${toLocalInput(quiz.closeAt)}"></label></div>
      <label class="field"><span>Số lần làm tối đa của mỗi học viên</span><input class="input" type="number" min="0" id="max" value="${quiz.maxAttempts || 0}"><small class="muted">Nhập 0 để không giới hạn</small></label></div>
    <div class="row" style="margin-top:16px"><button class="btn primary lg" id="save">${ic('send', 16)} Lưu việc giao bài</button></div>`;
  const picker = mountAssignPicker(box.querySelector('#ap'), { classes, students, value: { audience: audienceOf(quiz), allowedClasses: quiz.allowedClasses, allowedUsers: quiz.allowedUsers, guest: quiz.guest } });
  box.querySelector('#save').onclick = async (e) => {
    const v = picker.get(), err = picker.check(v); if (err) return toast(err, 'error');
    e.currentTarget.disabled = true;
    try {
      await applyAssign([id], v, { openAt: fromLocalInput(box.querySelector('#openAt').value), closeAt: fromLocalInput(box.querySelector('#closeAt').value), maxAttempts: Math.max(0, parseInt(box.querySelector('#max').value) || 0) });
      toast(v.audience === 'none' ? 'Đề đang ở dạng nháp (chưa giao).' : 'Đã giao bài.', 'success'); go('/admin/quiz/' + id + '?tab=assign');
    } catch (er) { toast(er.message, 'error'); e.currentTarget.disabled = false; }
  };
}

// ====================== TAB: KẾT QUẢ ======================
async function tabResults({ id, quiz, box }) {
  box.innerHTML = loading();
  const [atts, qs] = await Promise.all([getAttemptsWhere('quizId', id), getContent(id)]);
  const classNames = [...new Set(atts.map((a) => a.className).filter(Boolean))].sort();
  let text = '', cls = '';
  const stat = () => quizStats(atts.filter((a) => !cls || a.className === cls), qs);
  function draw() {
    const s = stat(), max = Math.max(1, ...s.dist);
    const subs = atts.filter((a) => a.status === 'submitted' && (!cls || a.className === cls) && (a.userName + ' ' + (a.className || '')).toLowerCase().includes(text)).sort((a, b) => b.submittedAt - a.submittedAt);
    box.innerHTML = `<div class="toolbar"><div class="search grow">${ic('search', 16)}<input class="input" id="t" placeholder="Tìm theo tên học viên…" value="${esc(text)}"></div>
        <select class="input w-auto" id="c"><option value="">Tất cả lớp</option>${classNames.map((c) => `<option ${c === cls ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
        <button class="btn" id="exp" ${subs.length ? '' : 'disabled'}>${ic('download', 16)} Xuất Excel</button></div>
      <div class="kpis"><div class="kpi"><b>${s.n}</b><span>Lượt nộp</span></div><div class="kpi"><b>${s.n ? fmtScore(s.avg) : '—'}</b><span>Điểm trung bình</span></div><div class="kpi ok"><b>${s.n ? Math.round(s.passRate * 100) + '%' : '—'}</b><span>Tỷ lệ đạt</span></div><div class="kpi"><b>${s.ranking.length}</b><span>Học viên đã làm</span></div></div>
      ${s.n ? `<div class="two-col"><div class="card pad"><h3>Phân bố điểm</h3><div class="hist">${s.dist.map((v, i) => `<div class="hb"><span class="hv">${v || ''}</span><i style="height:${(v / max) * 100}%"></i><em>${i}-${i + 1}</em></div>`).join('')}</div></div>
        <div class="card pad"><h3>${ic('trophy', 18)} Xếp hạng</h3><ol class="rank">${s.ranking.slice(0, 10).map((a, i) => `<li><span class="rk r${i + 1}">${i + 1}</span><div><b>${esc(a.userName)}</b> ${classChip(a.className)}</div><span class="score big ${a.score >= (a.passScore ?? 5) ? 'good' : 'bad'}">${fmtScore(a.score)}</span></li>`).join('')}</ol></div></div>
        <div class="card pad" style="margin-top:14px"><h3>${ic('alert', 18)} Câu sai nhiều nhất</h3>${s.wrongTop.length ? `<div class="tablewrap"><table><thead><tr><th>Câu hỏi</th><th>Số lượt sai</th><th>Tỷ lệ</th></tr></thead><tbody>${s.wrongTop.map((w) => `<tr><td class="clamp">${esc(w.q)}</td><td>${w.count}</td><td>${Math.round(w.rate * 100)}%</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Chưa có câu nào bị sai.</p>'}</div>
        <div class="card" style="margin-top:14px"><div class="tablewrap"><table><thead><tr><th>Học viên</th><th>Lớp</th><th>Điểm</th><th>Đúng/Tổng</th><th>Thời gian</th><th>Nộp lúc</th><th></th></tr></thead><tbody>${subs.map((a) => `<tr><td><a href="#/admin/user/${a.uid}">${esc(a.userName)}</a></td><td>${classChip(a.className)}</td><td><b class="score ${a.score >= (a.passScore ?? 5) ? 'good' : 'bad'}">${fmtScore(a.score)}</b></td><td>${a.correct}/${a.total}</td><td>${fmtTime(a.durationSec)}</td><td>${fmtDate(a.submittedAt)}</td><td class="nowrap"><a class="btn sm" href="#/result/${a.id}">Xem bài</a> <button class="btn icon ghost sm" data-del="${a.id}" title="Xóa lượt này">${ic('trash', 15)}</button></td></tr>`).join('')}</tbody></table></div></div>
        <div class="row" style="margin-top:12px"><button class="btn danger-o" id="delAll">${ic('trash', 16)} Xóa toàn bộ kết quả của đề này</button></div>`
      : `<div class="card pad">${empty('chart', 'Chưa có lượt làm nào', 'Khi học viên nộp bài, thống kê sẽ hiện ở đây.')}</div>`}`;
    const t = box.querySelector('#t'); if (t && document.activeElement === document.body && text) { t.focus(); t.setSelectionRange(text.length, text.length); }
  }
  box.addEventListener('input', debounce((e) => { if (e.target.id === 't') { text = e.target.value.toLowerCase(); draw(); const t = box.querySelector('#t'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 150));
  box.addEventListener('change', (e) => { if (e.target.id === 'c') { cls = e.target.value; draw(); } });
  box.onclick = async (e) => {
    const d = e.target.closest('[data-del]');
    if (d) { if (!(await confirmBox('Xóa lượt làm này?', 'Xóa', true))) return; await deleteAttempts([{ id: d.dataset.del }]); atts.splice(atts.findIndex((a) => a.id === d.dataset.del), 1); draw(); }
    else if (e.target.closest('#delAll')) { if (!(await confirmBox('Xóa TOÀN BỘ kết quả của đề này? Không thể khôi phục.', 'Xóa hết', true))) return; await deleteAttempts(atts); atts.length = 0; draw(); toast('Đã xóa.', 'success'); }
    else if (e.target.closest('#exp')) exportXlsx([{ name: 'Kết quả', rows: attemptsToRows(atts.filter((a) => a.status === 'submitted' && (!cls || a.className === cls))) }], 'ket-qua-' + safeName(quiz.title) + '.xlsx');
  };
  draw();
}

// ====================== TAB: ĐANG LÀM ======================
async function tabLive({ id, box }) {
  let list = [];
  box.innerHTML = `<div class="card" id="lv">${loading()}</div>`;
  const lv = box.querySelector('#lv'), draw = () => (lv.innerHTML = liveTable(list, { showQuiz: false }));
  const unsub = F.onSnapshot(F.query(F.collection(db, 'attempts'), F.where('quizId', '==', id)), (s) => { list = s.docs.map((d) => ({ id: d.id, ...d.data() })).filter((a) => a.status === 'in_progress'); draw(); });
  const t = setInterval(draw, 1000);
  return () => { unsub(); clearInterval(t); };
}
