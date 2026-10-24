// Trình soạn đề (2 tab): Câu hỏi · Giao bài & cài đặt
import { db, F } from './fb.js';
import { go } from './state.js';
import { esc, KEYS, finalize, mergeQuestions, newQuestionId, toLocalInput, fromLocalInput, audienceOf, isOn, richText } from './lib.js';
import { getQuiz, getContent, saveContent, getClasses, getAll, pathOf, getFolders } from './data.js';
import { parseFile, exportQuestionsXlsx, exportQuestionsWord, exportQuestionsPdf, downloadTemplate, downloadWordTemplate } from './importer.js';
import { mountResults } from './admin-results.js';
import { ic } from './icons.js';
import { toast, modal, confirmBox, loading, empty, renderMath } from './ui.js';
import { mountAssignPicker, applyAssign, audienceChips, copyQuizLink } from './adminui.js';

const TABS = [['results', 'Kết quả', 'chart'], ['questions', 'Câu hỏi', 'list'], ['settings', 'Giao bài & cài đặt', 'send']];

export async function renderQuizEditor(root, p, q) {
  const id = p.id;
  let tab = q.tab || 'results'; // bấm vào đề → thấy ngay ai đang làm / ai đã làm
  if (tab === 'live') tab = 'results';
  if (tab === 'assign') tab = 'settings';
  root.innerHTML = loading();
  const [quiz, folders] = await Promise.all([getQuiz(id), getFolders()]);
  if (!quiz) { root.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy đề')}<a class="btn" href="#/admin/exams">Quay lại</a></div>`; return; }
  const back = quiz.folderId ? '#/admin/f/' + quiz.folderId : '#/admin/exams';
  const crumbs = pathOf(folders, quiz.folderId);

  const kind = quiz.mode === 'practice' ? 'Luyện tập' : 'Kiểm tra';
  root.innerHTML = `
    <a class="back" href="${back}">${ic('left', 16)} ${crumbs.length ? esc(crumbs[crumbs.length - 1].name) : 'Danh sách đề'}</a>
    <div class="qe-head card pad">
      <div class="qe-t"><span class="qc-ic mode-${quiz.mode} lg">${ic('file', 24)}</span><div><h1>${esc(quiz.title)}</h1>
        <div class="chips-inline"><span class="tag">${quiz.count || 0} câu</span><span class="tag">${quiz.minutes > 0 ? quiz.minutes + ' phút' : 'Không giới hạn giờ'}</span><span class="tag mode-${quiz.mode}">${kind}</span>${audienceChips(quiz, folders)}${quiz.hidden ? '<span class="tag warn">Đang ẩn</span>' : ''}</div></div>
        <div class="row qe-act"><button class="btn sm" id="copyLink">${ic('link', 15)} Sao chép link</button></div></div>
      ${audienceOf(quiz) === 'none' ? `<div class="note warn" style="margin-bottom:0">${ic('lock', 16)}<span>Đề này <b>chưa giao</b> nên học viên chưa thấy.</span><a class="btn primary sm" href="#/admin/quiz/${id}?tab=settings">${ic('send', 15)} Giao bài ngay</a></div>` : ''}
    </div>
    <nav class="tabs sub">${TABS.map(([k, n, i]) => `<a href="#/admin/quiz/${id}?tab=${k}" class="${k === tab ? 'on' : ''}">${ic(i, 16)}<span>${n}</span></a>`).join('')}</nav>
    <div id="tab"></div>`;
  root.querySelector('#copyLink').onclick = () => copyQuizLink(id);
  const box = root.querySelector('#tab');
  const ctx = { id, quiz, box, root };
  const fn = { results: ({ id, box }) => mountResults(box, { quizId: id, fixed: true }), questions: tabQuestions, settings: tabSettings }[tab] || tabQuestions;
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
    return `<div class="qrow" data-id="${x.id}"><div class="qr-n">${i + 1}</div><div class="qr-b"><div class="qr-q rt">${richText(x.q)}</div>
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
        <button class="btn" data-act="export" ${qs.length ? '' : 'disabled'}>${ic('download', 16)} Tải file về</button></div>
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
      else if (act === 'export') exportDialog(quiz.title, qs);
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

/** Chọn định dạng tải về: Excel, Word (.docx), PDF. */
function exportDialog(title, qs) {
  const opts = [['xlsx', 'Excel (.xlsx)', 'Nhập lại hệ thống được, dùng để lưu trữ', 'file'], ['word', 'Word (.docx)', 'Đáp án đúng được gạch chân', 'file'], ['pdfa', 'PDF có đáp án', 'In hoặc lưu thành PDF, kèm đáp án và lời giải', 'download'], ['pdf', 'PDF đề thi', 'Không có đáp án, để phát cho học viên', 'download']];
  return modal({
    title: 'Tải file về', hideOk: true, cancelText: 'Đóng',
    html: `<div class="stack">${opts.map(([k, t, d, i]) => `<button class="btn block left exp-opt" data-x="${k}">${ic(i, 18)}<span><b>${t}</b><small class="muted">${d}</small></span></button>`).join('')}</div>`,
    onOpen: (box) => box.addEventListener('click', (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return; box.close(null);
      const k = b.dataset.x;
      if (k === 'xlsx') exportQuestionsXlsx(title, qs); else if (k === 'word') exportQuestionsWord(title, qs);
      else { exportQuestionsPdf(title, qs, k === 'pdfa'); toast('Chọn "Lưu dưới dạng PDF" trong hộp thoại in.', 'info', 5000); }
    }),
  });
}

function importModal(existing) {
  let res = null;
  return modal({
    title: 'Nhập câu hỏi', wide: true, okText: 'Áp dụng',
    html: `<div class="seg"><button class="on" data-t="file">Tải file lên</button><button data-t="paste">Dán văn bản từ Word</button></div>
      <div id="p-file"><label class="drop">${ic('upload', 30)}<b>Chọn file Excel, Word, PDF…</b><span>.xlsx · .docx · .pdf · .csv · .json · .txt</span><input type="file" id="fi" hidden accept=".xlsx,.xls,.csv,.json,.docx,.pdf,.txt"></label>
        <p class="muted s">Excel: cột STT, Mã câu, Câu hỏi, A, B, C, D, Đáp án, Giải thích. Word: gạch chân đáp án đúng hoặc ghi dòng "Đáp án: A". PDF cần có dòng "Đáp án: …" (PDF không lưu được gạch chân).</p>
        <div class="row"><button class="btn sm" type="button" id="tplX">Tải Excel mẫu</button><button class="btn sm" type="button" id="tplW">Tải Word mẫu</button></div></div>
      <div id="p-paste" class="hide"><textarea class="input" id="tx" rows="9" placeholder="Câu 1: Thủ đô của Việt Nam?&#10;A. Hà Nội&#10;B. Huế&#10;C. Đà Nẵng&#10;D. Cần Thơ&#10;Đáp án: A&#10;Giải thích: …"></textarea><button class="btn" id="parse" style="margin-top:8px">Phân tích văn bản</button></div>
      <div id="pv"></div>
      ${existing ? `<div class="field" style="margin-top:12px"><span>Cách nhập</span><label class="check"><input type="radio" name="md" value="add" checked> Thêm vào cuối đề (đang có ${existing} câu)</label><label class="check"><input type="radio" name="md" value="rep"> Thay thế toàn bộ câu hỏi hiện có</label></div>` : ''}`,
    onOpen: (m) => {
      const show = (r) => {
        res = r;
        m.querySelector('#pv').innerHTML = `<div class="note ${r.questions.length ? 'ok' : 'warn'}" style="margin-top:12px">${ic(r.questions.length ? 'check' : 'alert', 16)}<span>Đọc được <b>${r.questions.length}</b> câu hợp lệ${r.errors.length ? `, <b>${r.errors.length}</b> mục lỗi (sẽ bị bỏ qua)` : ''}.</span></div>
          ${r.errors.length ? `<ul class="errs">${r.errors.slice(0, 10).map((x) => `<li>${esc(x)}</li>`).join('')}${r.errors.length > 10 ? `<li>… và ${r.errors.length - 10} lỗi khác</li>` : ''}</ul>` : ''}`;
      };
      m.querySelector('#tplX').onclick = downloadTemplate; m.querySelector('#tplW').onclick = downloadWordTemplate;
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

// ====================== TAB: GIAO BÀI & CÀI ĐẶT (một trang) ======================
async function tabSettings({ id, quiz, box }) {
  box.innerHTML = loading();
  const [classes, users] = await Promise.all([getClasses(), getAll('users')]);
  const students = users.filter((u) => u.role === 'user' && u.status !== 'blocked').sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'vi'));
  const sw = (i, t, d, on) => `<label class="sw-row"><div><b>${t}</b><span class="muted">${d}</span></div><span class="switch"><input type="checkbox" id="${i}" ${on ? 'checked' : ''}><i></i></span></label>`;
  const practice = quiz.mode === 'practice';
  const desc = { exam: 'Làm xong nộp bài mới thấy đáp án và điểm. Học viên tự chọn xem từng câu hoặc cả trang.', practice: 'Chọn đáp án, bấm Kiểm tra mới hiện đúng/sai kèm lời giải.' };
  box.innerHTML = `<div class="card pad"><h3>${ic('send', 18)} Giao đề cho ai?</h3><div id="ap"></div></div>
    <div class="card pad" style="margin-top:14px"><h3>Cài đặt đề</h3>
      <div class="cfg-row"><div><b>Loại đề</b><p class="muted" id="kdesc" style="margin:2px 0 0">${practice ? desc.practice : desc.exam}</p></div>
        <div class="bigseg"><label><input type="radio" name="kind" value="practice" ${practice ? 'checked' : ''}><span>Luyện tập</span></label><label><input type="radio" name="kind" value="exam" ${!practice ? 'checked' : ''}><span>Kiểm tra</span></label></div></div>
      <label class="field" style="margin-top:14px"><span>Tên đề</span><input class="input" id="title" value="${esc(quiz.title)}"></label>
      <div class="two"><label class="field"><span>Thời gian (phút)</span><input class="input" type="number" min="0" id="minutes" value="${quiz.minutes ?? 0}"><small class="muted">0 = không giới hạn</small></label>
        <label class="field"><span>Số câu mỗi lần làm</span><input class="input" type="number" min="0" id="pick" value="${quiz.pickCount || 0}"><small class="muted">0 = làm hết. Số khác = bốc ngẫu nhiên</small></label></div>
      ${sw('shuf', 'Đảo câu hỏi và đáp án', 'Mỗi lần làm, thứ tự câu hỏi và đáp án A, B, C, D được xáo trộn.', isOn(quiz.shuffleQ) || isOn(quiz.shuffleA))}</div>
    <details class="adv"><summary>${ic('settings', 17)} Nâng cao</summary><div class="adv-b">
      ${sw('review', 'Cho xem lại đáp án sau khi nộp', 'Tắt thì học viên chỉ thấy điểm.', !quiz.lockReview)}
      ${sw('hidden', 'Ẩn đề', 'Học viên không thấy đề, chỉ xem được điểm đã làm.', quiz.hidden)}
      <div class="two" style="margin-top:12px"><label class="field"><span>Điểm đạt (thang 10)</span><input class="input" type="number" min="0" max="10" step="0.5" id="pass" value="${quiz.passScore ?? 5}"></label>
        <label class="field"><span>Số lần làm tối đa</span><input class="input" type="number" min="0" id="max" value="${quiz.maxAttempts || 0}"><small class="muted">0 = không giới hạn</small></label></div>
      <div class="two"><label class="field"><span>Mở đề lúc</span><input class="input" type="datetime-local" id="openAt" value="${toLocalInput(quiz.openAt)}"></label>
        <label class="field"><span>Đóng đề lúc</span><input class="input" type="datetime-local" id="closeAt" value="${toLocalInput(quiz.closeAt)}"></label></div>
      <label class="field"><span>Lời nhắn cho học viên</span><textarea class="input" id="desc" rows="2">${esc(quiz.description || '')}</textarea></label>
      <button class="btn danger-o" id="del">${ic('trash', 16)} Xóa đề này</button></div></details>
    <div class="row" style="margin-top:16px"><button class="btn primary lg" id="save">${ic('save', 16)} Lưu</button></div>`;
  const picker = mountAssignPicker(box.querySelector('#ap'), { classes, students, value: { audience: audienceOf(quiz), allowedClasses: quiz.allowedClasses, allowedUsers: quiz.allowedUsers, guest: quiz.guest } });
  box.addEventListener('change', (e) => {
    if (e.target.name === 'kind') box.querySelector('#kdesc').textContent = desc[e.target.value];
  });
  box.querySelector('#save').onclick = async (e) => {
    const g = (s) => box.querySelector(s);
    const title = g('#title').value.trim(); if (!title) return toast('Tên đề không được để trống.', 'error');
    const v = picker.get(), err = picker.check(v); if (err) return toast(err, 'error');
    e.currentTarget.disabled = true;
    try {
      const mode = g('input[name=kind]:checked').value === 'practice' ? 'practice' : 'exam'; // cách hiển thị do học viên chọn
      await applyAssign([id], v, {
        title, description: g('#desc').value.trim(), minutes: Math.max(0, +g('#minutes').value || 0), pickCount: Math.max(0, parseInt(g('#pick').value) || 0),
        passScore: Math.min(10, Math.max(0, +g('#pass').value || 0)), maxAttempts: Math.max(0, parseInt(g('#max').value) || 0),
        openAt: fromLocalInput(g('#openAt').value), closeAt: fromLocalInput(g('#closeAt').value),
        mode, shuffleQ: g('#shuf').checked, shuffleA: g('#shuf').checked, lockReview: !g('#review').checked, hidden: g('#hidden').checked,
      });
      toast(v.audience === 'none' ? 'Đã lưu. Đề đang ở dạng nháp (chưa giao).' : 'Đã lưu và giao bài.', 'success'); go('/admin/quiz/' + id + '?tab=settings');
    } catch (er) { toast(er.message, 'error'); e.currentTarget.disabled = false; }
  };
  box.querySelector('#del').onclick = async () => {
    if (!(await confirmBox(`Xóa đề "${quiz.title}"? Lịch sử làm bài của học viên vẫn được giữ.`, 'Xóa đề', true))) return;
    await F.deleteDoc(F.doc(db, 'quizzes', id)); await F.deleteDoc(F.doc(db, 'quizContent', id));
    toast('Đã xóa đề.', 'success'); go(quiz.folderId ? '/admin/f/' + quiz.folderId : '/admin/exams');
  };
}
