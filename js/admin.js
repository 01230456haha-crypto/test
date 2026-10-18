// Quản trị: thư mục & đề, theo dõi trực tiếp, cài đặt đăng nhập, sao lưu.
import { db, F } from './fb.js';
import { state, go, DEFAULT_SETTINGS } from './state.js';
import { esc, byName, MODES, audienceOf } from './lib.js';
import { getFolders, getQuizzes, getContent, getAll, createQuiz, pathOf, descendantIds } from './data.js';
import { ic } from './icons.js';
import { toast, modal, confirmBox, promptBox, loading, empty, downloadBlob, readFile } from './ui.js';
import { tabsHtml, audienceChips, assignModal, applyAssign, copyQuizLink } from './adminui.js';

const nameOf = (t, x) => (t === 'folder' ? x.name : x.title);

// ====================== QUẢN LÝ THƯ MỤC & ĐỀ ======================
function treeOptions(folders, exclude = new Set()) {
  const out = [];
  const walk = (pid, d) => folders.filter((f) => (f.parentId || null) === pid).sort(byName).forEach((f) => { if (exclude.has(f.id)) return; out.push({ id: f.id, name: f.name, d }); walk(f.id, d + 1); });
  walk(null, 0); return out;
}
/** Trả về id thư mục ('' = gốc) hoặc null nếu hủy. */
export function pickFolder(title, folders, exclude) {
  const opts = treeOptions(folders, exclude);
  return modal({
    title, okText: 'Chọn vị trí này',
    html: `<div class="tree"><label class="radio"><input type="radio" name="dest" value="" checked><span>${ic('home', 15)} Thư mục gốc</span></label>${opts.map((o) => `<label class="radio" style="padding-left:${12 + o.d * 18}px"><input type="radio" name="dest" value="${o.id}"><span>${ic('folder', 15)} ${esc(o.name)}</span></label>`).join('')}</div>`,
    onOk: (box) => box.querySelector('input[name=dest]:checked').value,
  });
}
async function copyQuiz(q, dest, title) {
  const { id, ...meta } = q;
  const ref = F.doc(F.collection(db, 'quizzes'));
  const content = await getContent(id);
  await F.setDoc(ref, { ...meta, title, folderId: dest || null, createdAt: Date.now(), updatedAt: Date.now() }); // giữ nguyên cách giao của đề gốc
  await F.setDoc(F.doc(db, 'quizContent', ref.id), { questions: content });
  return ref.id;
}
async function copyFolder(f, dest, folders, quizzes, name) {
  const ref = F.doc(F.collection(db, 'folders'));
  await F.setDoc(ref, { name: name || f.name, parentId: dest || null, createdAt: Date.now() });
  for (const q of quizzes.filter((x) => (x.folderId || null) === f.id)) await copyQuiz(q, ref.id, q.title);
  for (const s of folders.filter((x) => (x.parentId || null) === f.id)) await copyFolder(s, ref.id, folders, quizzes);
}

// ====================== QUẢN LÝ THƯ MỤC & ĐỀ ======================
export async function renderExplorer(root, p) {
  const fid = p.id || null;
  let folders = [], quizzes = [];
  const sel = new Set(); // 'q:ID' hoặc 'f:ID'
  root.innerHTML = loading();
  const load = async () => { [folders, quizzes] = await Promise.all([getFolders(), getQuizzes()]); draw(); };
  const quizIdsOf = (keys) => {
    const out = new Set();
    for (const k of keys) {
      const [t, id] = k.split(':');
      if (t === 'q') out.add(id);
      else { const ds = descendantIds(folders, id); quizzes.filter((q) => ds.has(q.folderId)).forEach((q) => out.add(q.id)); }
    }
    return [...out];
  };
  const drawSel = () => {
    const el = root.querySelector('#selbar'); if (!el) return;
    el.innerHTML = sel.size ? `<div class="selbar"><b>Đã chọn ${sel.size}</b><button class="btn primary sm" id="bulkAssign">${ic('send', 15)} Giao bài</button><button class="btn sm" id="bulkClear">Bỏ chọn</button></div>` : '';
  };

  function draw() {
    const here = fid ? folders.find((f) => f.id === fid) : null;
    if (fid && !here) { root.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy thư mục')}</div>`; return; }
    const subs = folders.filter((f) => (f.parentId || null) === fid).sort(byName);
    const qs = quizzes.filter((q) => (q.folderId || null) === fid).sort(byName);
    const crumbs = pathOf(folders, fid);
    const chk = (key) => `<label class="chk"><input type="checkbox" data-sel="${key}" ${sel.has(key) ? 'checked' : ''}></label>`;
    root.innerHTML = `<div class="page-h"><div><h1 class="ptitle">${here ? esc(here.name) : 'Đề thi'}</h1>
        <div class="crumbs">${ic('home', 15)}<a href="#/admin/exams">Tất cả</a>${crumbs.map((c) => `<span>/</span><a href="#/admin/f/${c.id}">${esc(c.name)}</a>`).join('')}</div></div>
        <div class="row"><button class="btn" id="newFolder">${ic('folder', 16)} Thư mục mới</button><button class="btn primary" id="newQuiz">${ic('plus', 16)} Tạo đề mới</button></div></div>
      ${quizzes.some((q) => audienceOf(q) === 'none') ? `<div class="note warn" style="margin-top:0">${ic('lock', 16)}<span><b>${quizzes.filter((q) => audienceOf(q) === 'none').length}</b> đề chưa giao nên học viên chưa thấy. Tick chọn đề rồi bấm <b>Giao bài</b>.</span></div>` : ''}
      <div id="selbar"></div>
      ${subs.length || qs.length ? `<div class="card list-card">
        ${subs.map((f) => `<div class="row-item">${chk('f:' + f.id)}<a class="ri-main" href="#/admin/f/${f.id}"><span class="ri-ic folder">${ic('folder', 20)}</span><div class="ri-b"><b>${esc(f.name)}</b><span class="muted">${folders.filter((x) => x.parentId === f.id).length} thư mục · ${quizzes.filter((q) => q.folderId === f.id).length} đề</span></div></a>
          <button class="btn icon ghost" data-menu="folder" data-id="${f.id}" aria-label="Thao tác">${ic('more')}</button></div>`).join('')}
        ${qs.map((q) => `<div class="row-item">${chk('q:' + q.id)}<a class="ri-main" href="#/admin/quiz/${q.id}"><span class="ri-ic mode-${q.mode}">${ic('file', 20)}</span><div class="ri-b"><b>${esc(q.title)}</b>
          <span class="muted">${q.count || 0} câu · ${q.minutes > 0 ? q.minutes + ' phút' : 'không giới hạn giờ'} · ${q.mode === 'practice' ? 'Luyện tập' : 'Kiểm tra'}</span>
          <div class="chips-inline">${audienceChips(q)}${q.hidden ? '<span class="tag warn">Đang ẩn</span>' : ''}</div></div></a>
          <button class="btn icon ghost" data-menu="quiz" data-id="${q.id}" aria-label="Thao tác">${ic('more')}</button></div>`).join('')}</div>`
      : `<div class="card pad">${empty('folder', 'Thư mục này đang trống', 'Hãy tạo đề mới hoặc thư mục con.')}</div>`}`;
    drawSel();
  }

  root.onclick = async (e) => {
    try {
      const menu = e.target.closest('[data-menu]');
      if (menu) return itemMenu(menu.dataset.menu, menu.dataset.id);
      if (e.target.closest('#bulkClear')) { sel.clear(); return draw(); }
      if (e.target.closest('#bulkAssign')) {
        const ids = quizIdsOf([...sel]);
        if (!ids.length) return toast('Mục đã chọn chưa có đề nào để giao.', 'error');
        const v = await assignModal({ title: `Giao bài cho ${ids.length} đề` }); if (!v) return;
        await applyAssign(ids, v); toast(`Đã giao ${ids.length} đề.`, 'success'); sel.clear(); return load();
      }
      if (e.target.closest('#newFolder')) {
        const name = await promptBox('Thư mục mới', 'Tên thư mục (ví dụ: Toán 12, Chương 1)', '', 'Tạo');
        if (!name) return;
        await F.addDoc(F.collection(db, 'folders'), { name, parentId: fid, createdAt: Date.now() });
        toast('Đã tạo thư mục.', 'success'); load();
      } else if (e.target.closest('#newQuiz')) {
        const title = await promptBox('Tạo đề mới', 'Tên đề thi', '', 'Tạo và soạn câu hỏi');
        if (!title) return;
        const id = await createQuiz(title, fid);
        go('/admin/quiz/' + id);
      }
    } catch (err) { toast(err.message, 'error'); }
  };
  root.onchange = (e) => {
    const c = e.target.closest('[data-sel]'); if (!c) return;
    c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); drawSel();
  };

  async function itemMenu(t, id) {
    const item = (t === 'folder' ? folders : quizzes).find((x) => x.id === id); if (!item) return;
    const ops = [['open', 'Mở', 'right'], ['assign', 'Giao bài…', 'send'], ['link', 'Sao chép link đề', 'link'], ['rename', 'Đổi tên', 'edit'], ['move', 'Di chuyển tới…', 'move'], ['copy', 'Sao chép tới…', 'copy'], ['dup', 'Nhân bản tại chỗ', 'copy'], ['del', 'Xóa', 'trash']].filter(([k]) => k !== 'link' || t === 'quiz');
    modal({
      title: nameOf(t, item), hideOk: true, cancelText: 'Đóng',
      html: `<div class="stack">${ops.map(([k, n, i]) => `<button class="btn block left ${k === 'del' ? 'danger-o' : ''}" data-op="${k}">${ic(i, 16)} ${n}</button>`).join('')}</div>`,
      onOpen: (box) => box.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-op]'); if (!b) return;
        box.close(null);
        try { await doOp(b.dataset.op, t, item); } catch (err) { toast(err.message, 'error'); }
      }),
    });
  }
  async function doOp(op, t, item) {
    const isF = t === 'folder';
    const ex = isF ? descendantIds(folders, item.id) : new Set();
    if (op === 'open') return go(isF ? '/admin/f/' + item.id : '/admin/quiz/' + item.id);
    if (op === 'link') return copyQuizLink(item.id);
    if (op === 'assign') {
      const ids = quizIdsOf([(isF ? 'f:' : 'q:') + item.id]);
      if (!ids.length) return toast('Thư mục này chưa có đề nào để giao.', 'error');
      const v = await assignModal({ title: isF ? `Giao ${ids.length} đề trong "${item.name}"` : `Giao bài: ${item.title}`, value: isF ? {} : { audience: audienceOf(item), allowedClasses: item.allowedClasses, allowedUsers: item.allowedUsers, guest: item.guest } });
      if (!v) return; await applyAssign(ids, v); toast('Đã giao bài.', 'success');
    } else if (op === 'rename') {
      const v = await promptBox('Đổi tên', 'Tên mới', nameOf(t, item)); if (!v) return;
      await F.updateDoc(F.doc(db, isF ? 'folders' : 'quizzes', item.id), isF ? { name: v } : { title: v, updatedAt: Date.now() });
      toast('Đã đổi tên.', 'success');
    } else if (op === 'move') {
      const dest = await pickFolder('Di chuyển tới', folders, ex); if (dest === null) return;
      await F.updateDoc(F.doc(db, isF ? 'folders' : 'quizzes', item.id), isF ? { parentId: dest || null } : { folderId: dest || null });
      toast('Đã di chuyển.', 'success');
    } else if (op === 'copy' || op === 'dup') {
      let dest = isF ? item.parentId || '' : item.folderId || '';
      if (op === 'copy') { dest = await pickFolder('Sao chép tới', folders, ex); if (dest === null) return; }
      const nm = op === 'dup' ? nameOf(t, item) + ' (bản sao)' : nameOf(t, item);
      toast('Đang sao chép…');
      if (isF) await copyFolder(item, dest, folders, quizzes, nm); else await copyQuiz(item, dest, nm);
      toast('Đã sao chép.', 'success');
    } else if (op === 'del') {
      const ids = isF ? descendantIds(folders, item.id) : null;
      const inside = isF ? quizzes.filter((q) => ids.has(q.folderId)) : [];
      const ok = await confirmBox(isF ? `Xóa thư mục "${item.name}" cùng ${ids.size - 1} thư mục con và ${inside.length} đề bên trong?\nLịch sử làm bài của học viên vẫn được giữ.` : `Xóa đề "${item.title}"?\nLịch sử làm bài của học viên vẫn được giữ (chỉ xem điểm).`, 'Xóa', true);
      if (!ok) return;
      if (isF) { for (const q of inside) { await F.deleteDoc(F.doc(db, 'quizzes', q.id)); await F.deleteDoc(F.doc(db, 'quizContent', q.id)); } for (const x of ids) await F.deleteDoc(F.doc(db, 'folders', x)); }
      else { await F.deleteDoc(F.doc(db, 'quizzes', item.id)); await F.deleteDoc(F.doc(db, 'quizContent', item.id)); }
      toast('Đã xóa.', 'success');
    }
    await load();
  }
  await load();
  return () => { root.onclick = null; root.onchange = null; };
}

// ====================== CÀI ĐẶT ĐĂNG NHẬP ======================
export async function renderSettings(root) {
  const s = { ...DEFAULT_SETTINGS, ...state.settings };
  const sw = (id, title, sub, on) => `<label class="sw-row"><div><b>${title}</b><span class="muted">${sub}</span></div><span class="switch"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><i></i></span></label>`;
  const modes = [['open', 'Mở', 'Ai cũng tự đăng ký và vào học ngay.', 'users'], ['approval', 'Cần duyệt', 'Đăng ký xong phải chờ bạn duyệt mới làm được đề.', 'clock'], ['closed', 'Đóng', 'Không ai tự tạo được tài khoản. Bạn tự cấp cho học viên.', 'lock']];
  root.innerHTML = `${tabsHtml('settings')}<div class="page-h"><div><h1 class="ptitle">Cài đặt</h1><p class="muted">Cách học viên tạo tài khoản và vào hệ thống.</p></div><a class="btn" href="#/">${ic('eye', 16)} Xem như học viên</a></div>
    <div class="card pad"><h3>Cách tạo tài khoản</h3><div class="mode-cards">${modes.map(([k, t, d, i]) => `<label class="mode-card"><input type="radio" name="rm" value="${k}" ${s.registerMode === k ? 'checked' : ''}><div>${ic(i, 22)}<b>${t}</b><span>${d}</span></div></label>`).join('')}</div></div>
    <div class="card pad" style="margin-top:14px"><h3>Hình thức đăng nhập</h3>
      ${sw('emailReg', 'Cho đăng ký bằng email', 'Tắt nếu bạn chỉ muốn tự cấp tài khoản.', s.emailReg)}
      ${sw('googleReg', 'Cho đăng ký bằng Google', 'Học viên mới bấm "Tiếp tục với Google" sẽ tạo được tài khoản.', s.googleReg)}
      ${sw('googleLogin', 'Cho tài khoản đã có đăng nhập bằng Google', 'Nút Google vẫn hiện cho người đã có tài khoản.', s.googleLogin)}
      ${sw('guestEnabled', 'Cho phép vào làm đề dạng khách', 'Không cần tài khoản, chỉ làm được các đề bạn bật "Cho khách".', s.guestEnabled)}
    </div>
    <div class="row" style="margin-top:16px"><button class="btn primary lg" id="save">${ic('save', 16)} Lưu cài đặt</button></div>
    <div class="note info" style="margin-top:14px">${ic('info', 16)}<span>Tài khoản bạn cấp bằng tên đăng nhập luôn đăng nhập được, bất kể các cài đặt trên.</span></div>`;
  root.querySelector('#save').onclick = async (e) => {
    e.currentTarget.disabled = true;
    const v = { registerMode: root.querySelector('input[name=rm]:checked').value };
    ['emailReg', 'googleReg', 'googleLogin', 'guestEnabled'].forEach((k) => (v[k] = root.querySelector('#' + k).checked));
    try { await F.setDoc(F.doc(db, 'settings', 'app'), v, { merge: true }); state.settings = { ...state.settings, ...v }; toast('Đã lưu cài đặt.', 'success'); }
    catch (err) { toast(err.message, 'error'); }
    e.currentTarget.disabled = false;
  };
}

// ====================== SAO LƯU / KHÔI PHỤC ======================
const BACKUP_COLS = [['folders', 'Thư mục'], ['classes', 'Lớp học'], ['quizzes', 'Đề thi (cài đặt)'], ['quizContent', 'Câu hỏi'], ['users', 'Hồ sơ học viên'], ['attempts', 'Lịch sử làm bài']];
export async function renderBackup(root) {
  root.innerHTML = `${tabsHtml('backup')}<div class="page-h"><div><h1 class="ptitle">Sao lưu & khôi phục</h1><p class="muted">Lưu toàn bộ dữ liệu ra một file để phòng khi cần.</p></div></div>
    <div class="card pad"><h3>${ic('download', 18)} Sao lưu toàn bộ</h3><p class="muted">Tải về một file .json gồm đề, câu hỏi, lớp, hồ sơ và lịch sử. Mật khẩu không nằm trong file sao lưu.</p><button class="btn primary" id="bk">${ic('download', 16)} Tải file sao lưu</button></div>
    <div class="card pad" style="margin-top:14px"><h3>${ic('upload', 18)} Khôi phục từ file</h3><p class="muted">Dữ liệu trong file được ghi đè lên dữ liệu trùng mã; phần còn lại giữ nguyên.</p>
      <input type="file" id="rf" accept=".json" class="input"><div id="rs"></div></div>`;
  root.querySelector('#bk').onclick = async (e) => {
    e.currentTarget.disabled = true; toast('Đang tạo file sao lưu…');
    try {
      const out = { app: 'quiz-site', version: 1, createdAt: Date.now(), settings: state.settings, data: {} };
      for (const [c] of BACKUP_COLS) out.data[c] = await getAll(c);
      const d = new Date(); const pad = (n) => String(n).padStart(2, '0');
      downloadBlob(new Blob([JSON.stringify(out)], { type: 'application/json' }), `sao-luu-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`);
      toast('Đã tải file sao lưu.', 'success');
    } catch (err) { toast(err.message, 'error'); }
    e.currentTarget.disabled = false;
  };
  root.querySelector('#rf').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const rs = root.querySelector('#rs');
    try {
      const j = JSON.parse(await readFile(f, 'text'));
      if (j.app !== 'quiz-site' || !j.data) throw new Error('Đây không phải file sao lưu của hệ thống này.');
      rs.innerHTML = `<div class="stack" style="margin-top:12px"><b>Chọn phần cần khôi phục:</b>${BACKUP_COLS.filter(([c]) => j.data[c]).map(([c, n]) => `<label class="check"><input type="checkbox" value="${c}" checked> ${n} (${j.data[c].length})</label>`).join('')}<button class="btn primary" id="doRestore">${ic('upload', 16)} Khôi phục</button><div id="prog" class="muted"></div></div>`;
      rs.querySelector('#doRestore').onclick = async (ev) => {
        const cols = [...rs.querySelectorAll('input:checked')].map((i) => i.value);
        if (!cols.length) return;
        if (!(await confirmBox('Khôi phục sẽ ghi đè dữ liệu trùng mã. Tiếp tục?', 'Khôi phục', true))) return;
        ev.currentTarget.disabled = true;
        try {
          for (const c of cols) {
            const rows = j.data[c];
            for (let i = 0; i < rows.length; i += 400) {
              const b = F.writeBatch(db);
              rows.slice(i, i + 400).forEach(({ id, ...rest }) => b.set(F.doc(db, c, id), rest));
              await b.commit();
              rs.querySelector('#prog').textContent = `Đang ghi ${c}: ${Math.min(i + 400, rows.length)}/${rows.length}`;
            }
          }
          rs.querySelector('#prog').textContent = 'Hoàn tất.'; toast('Đã khôi phục dữ liệu.', 'success');
        } catch (err) { toast(err.message, 'error'); ev.currentTarget.disabled = false; }
      };
    } catch (err) { rs.innerHTML = `<div class="note warn" style="margin-top:12px">${esc(err.message)}</div>`; }
  };
}
