// Quản lý lớp học, học viên (tạo tài khoản, duyệt, khóa) và trang theo dõi từng học viên.
import { auth, db, A, F, createAuthUser, withUserSession } from './fb.js';
import { go } from './state.js';
import { esc, toLoginEmail, isUsernameEmail, displayLogin, hueOf, fmtDate, fmtClock, fmtTime, fmtScore, attemptsToRows, byName, KEYS } from './lib.js';
import { getAll, getClasses, getQuizzes, getContent, getAttemptsWhere, deleteAttempts } from './data.js';
import { ic } from './icons.js';
import { toast, modal, confirmBox, promptBox, loading, empty, avatar, classChip, exportXlsx, safeName, readFile, debounce } from './ui.js';
import { tabsHtml, isOnline, dot, answeredCount } from './adminui.js';

const STATUS = { active: ['Hoạt động', 'ok'], pending: ['Chờ duyệt', 'warn'], blocked: ['Đã khóa', 'bad'] };
const statusTag = (s) => { const [t, c] = STATUS[s] || ['—', '']; return `<span class="tag ${c}">${t}</span>`; };
const classOptions = (classes, cur = '') => `<option value="">— Chưa xếp lớp —</option>${classes.map((c) => `<option ${c.name === cur ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}${cur && !classes.some((c) => c.name === cur) ? `<option selected>${esc(cur)}</option>` : ''}`;

async function ensureClass(name, classes) {
  name = String(name || '').trim(); if (!name) return;
  if (classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
  const ref = await F.addDoc(F.collection(db, 'classes'), { name, createdAt: Date.now() });
  classes.push({ id: ref.id, name });
}
/** Tạo tài khoản đăng nhập + hồ sơ. Lưu mật khẩu cấp ban đầu (chỉ admin đọc được) để sau này đổi hộ. */
async function createAccount({ login, password, name, cls }) {
  const email = toLoginEmail(login);
  if (!email) throw new Error('Tên đăng nhập/email không hợp lệ');
  if (String(password).length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự');
  const uid = await createAuthUser(email, String(password));
  await F.setDoc(F.doc(db, 'users', uid), { email, username: isUsernameEmail(email) ? email.split('@')[0] : '', displayName: name || login, className: cls || '', role: 'user', status: 'active', createdAt: Date.now(), createdBy: 'admin' });
  await F.setDoc(F.doc(db, 'userSecrets', uid), { pw: String(password), setAt: Date.now() });
  return uid;
}

// ====================== LỚP HỌC ======================
export async function renderClasses(root) {
  root.innerHTML = tabsHtml('classes') + loading();
  const [classes, users, quizzes] = await Promise.all([getClasses(), getAll('users'), getQuizzes()]);
  const stu = users.filter((u) => u.role === 'user');
  const noClass = stu.filter((u) => !u.className || !classes.some((c) => c.name === u.className)).length;
  root.innerHTML = `${tabsHtml('classes')}<div class="page-h"><div><h1 class="ptitle">Lớp học</h1><p class="muted">Chia học viên theo lớp để quản lý và giao đề theo từng lớp.</p></div>
    <button class="btn primary" id="new">${ic('plus', 16)} Tạo lớp</button></div>
    ${classes.length ? `<div class="grid class-grid">${classes.map((c) => {
      const n = stu.filter((u) => u.className === c.name).length, q = quizzes.filter((x) => (x.allowedClasses || []).includes(c.name)).length;
      return `<a class="class-card" href="#/admin/class/${c.id}" style="--h:${hueOf(c.name)}"><div class="cc-ic">${ic('book', 22)}</div><b>${esc(c.name)}</b>
        <div class="cc-m"><span>${ic('users', 14)} ${n} học viên</span><span>${ic('send', 14)} ${q} đề được giao</span></div></a>`;
    }).join('')}</div>` : `<div class="card pad">${empty('book', 'Chưa có lớp nào', 'Bấm "Tạo lớp" để bắt đầu, ví dụ: 12A1, Lớp tối T2-T4.')}</div>`}
    ${noClass ? `<div class="note info" style="margin-top:14px">${ic('info', 16)}<span>Có <b>${noClass}</b> học viên chưa xếp lớp. Vào mục <a href="#/admin/users">Học viên</a> để xếp lớp.</span></div>` : ''}`;
  root.querySelector('#new').onclick = async () => {
    const name = await promptBox('Tạo lớp mới', 'Tên lớp', '', 'Tạo lớp'); if (!name) return;
    if (classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) return toast('Lớp này đã tồn tại.', 'error');
    await F.addDoc(F.collection(db, 'classes'), { name, createdAt: Date.now() });
    toast('Đã tạo lớp.', 'success'); go('/admin/classes');
  };
}

export async function renderClassDetail(root, p, q) {
  const tab = q.tab || 'students';
  root.innerHTML = loading();
  const [classes, users, quizzes] = await Promise.all([getClasses(), getAll('users'), getQuizzes()]);
  const cls = classes.find((c) => c.id === p.id);
  if (!cls) { root.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy lớp')}<a class="btn" href="#/admin/classes">Quay lại</a></div>`; return; }
  const members = users.filter((u) => u.role === 'user' && u.className === cls.name).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'vi'));
  const assigned = quizzes.filter((x) => (x.allowedClasses || []).includes(cls.name));
  const T = [['students', 'Học viên', 'users'], ['quizzes', 'Đề được giao', 'send'], ['results', 'Kết quả lớp', 'chart']];
  root.innerHTML = `<a class="back" href="#/admin/classes">${ic('left', 16)} Tất cả lớp</a>
    <div class="card pad class-head" style="--h:${hueOf(cls.name)}"><div class="cc-ic lg">${ic('book', 26)}</div><div class="grow"><h1>${esc(cls.name)}</h1><span class="muted">${members.length} học viên · ${assigned.length} đề được giao</span></div>
      <button class="btn" id="ren">${ic('edit', 16)} Đổi tên</button><button class="btn danger-o" id="del">${ic('trash', 16)} Xóa lớp</button></div>
    <nav class="tabs sub">${T.map(([k, n, i]) => `<a href="#/admin/class/${cls.id}?tab=${k}" class="${k === tab ? 'on' : ''}">${ic(i, 16)}<span>${n}</span></a>`).join('')}</nav><div id="tab"></div>`;
  const box = root.querySelector('#tab');

  root.querySelector('#ren').onclick = async () => {
    const nn = await promptBox('Đổi tên lớp', 'Tên mới', cls.name); if (!nn || nn === cls.name) return;
    if (classes.some((c) => c.id !== cls.id && c.name.toLowerCase() === nn.toLowerCase())) return toast('Tên lớp đã tồn tại.', 'error');
    await F.updateDoc(F.doc(db, 'classes', cls.id), { name: nn });
    for (const u of users.filter((u) => u.className === cls.name)) await F.updateDoc(F.doc(db, 'users', u.id), { className: nn });
    for (const x of assigned) await F.updateDoc(F.doc(db, 'quizzes', x.id), { allowedClasses: x.allowedClasses.map((c) => (c === cls.name ? nn : c)) });
    toast('Đã đổi tên lớp.', 'success'); go('/admin/class/' + cls.id + '?tab=' + tab);
  };
  root.querySelector('#del').onclick = async () => {
    if (!(await confirmBox(`Xóa lớp "${cls.name}"? Học viên sẽ về trạng thái chưa xếp lớp và lớp bị gỡ khỏi các đề đã giao. Tài khoản học viên không bị xóa.`, 'Xóa lớp', true))) return;
    for (const u of members) await F.updateDoc(F.doc(db, 'users', u.id), { className: '' });
    for (const x of assigned) await F.updateDoc(F.doc(db, 'quizzes', x.id), { allowedClasses: x.allowedClasses.filter((c) => c !== cls.name) });
    await F.deleteDoc(F.doc(db, 'classes', cls.id)); toast('Đã xóa lớp.', 'success'); go('/admin/classes');
  };

  if (tab === 'students') {
    box.innerHTML = `<div class="toolbar"><button class="btn primary" id="addExist">${ic('plus', 16)} Thêm học viên có sẵn vào lớp</button><button class="btn" id="addNew">${ic('user', 16)} Tạo tài khoản mới trong lớp</button><button class="btn" id="bulk">${ic('upload', 16)} Tạo hàng loạt</button></div>
      ${members.length ? `<div class="card list-card">${members.map((u) => `<div class="row-item"><a class="ri-main" href="#/admin/user/${u.id}">${avatar(u.displayName, 38)}<div class="ri-b"><b>${esc(u.displayName)}</b><span class="muted">${esc(displayLogin(u))}</span></div></a>${dot(isOnline(u.lastSeen, 150000))}${statusTag(u.status)}<button class="btn icon ghost" data-rm="${u.id}" title="Gỡ khỏi lớp">${ic('x', 16)}</button></div>`).join('')}</div>` : `<div class="card pad">${empty('users', 'Lớp chưa có học viên')}</div>`}`;
    box.onclick = async (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { await F.updateDoc(F.doc(db, 'users', rm.dataset.rm), { className: '' }); go('/admin/class/' + cls.id); }
      else if (e.target.closest('#addExist')) {
        const others = users.filter((u) => u.role === 'user' && u.className !== cls.name).sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'vi'));
        const ids = await modal({
          title: 'Thêm học viên vào ' + cls.name, okText: 'Thêm vào lớp', wide: true,
          html: `<div class="search">${ic('search', 16)}<input class="input" id="s" placeholder="Tìm học viên…"></div><div class="pick-list tall">${others.map((u) => `<label class="pick-row" data-s="${esc((u.displayName + ' ' + displayLogin(u) + ' ' + (u.className || '')).toLowerCase())}"><input type="checkbox" value="${u.id}">${avatar(u.displayName, 28)}<span><b>${esc(u.displayName)}</b><small class="muted"> ${esc(displayLogin(u))}</small></span>${classChip(u.className)}</label>`).join('') || '<p class="muted">Không còn học viên nào.</p>'}</div>`,
          onOpen: (m) => m.querySelector('#s').oninput = (ev) => m.querySelectorAll('[data-s]').forEach((r) => (r.style.display = r.dataset.s.includes(ev.target.value.toLowerCase()) ? '' : 'none')),
          onOk: (m) => [...m.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value),
        });
        if (!ids?.length) return;
        for (const id of ids) await F.updateDoc(F.doc(db, 'users', id), { className: cls.name });
        toast(`Đã thêm ${ids.length} học viên.`, 'success'); go('/admin/class/' + cls.id);
      }
      else if (e.target.closest('#addNew')) { if (await addAccountModal(classes, cls.name)) go('/admin/class/' + cls.id); }
      else if (e.target.closest('#bulk')) { if (await bulkModal(classes, cls.name)) go('/admin/class/' + cls.id); }
    };
  } else if (tab === 'quizzes') {
    const sorted = [...quizzes].sort(byName);
    const audience = (x) => ((x.allowedClasses || []).length ? x.allowedClasses.map(classChip).join('') : (x.allowedUsers || []).length ? '<span class="tag">Học viên chọn riêng</span>' : '<span class="tag">Tất cả học viên</span>');
    box.innerHTML = `<div class="note info">${ic('info', 16)}<span>Bật công tắc để <b>giao đề cho lớp ${esc(cls.name)}</b>. Đề chưa giao cho lớp nào thì mọi học viên đều thấy; khi đã giao cho ít nhất một lớp thì chỉ các lớp đó thấy.</span></div>
      ${sorted.length ? `<div class="card list-card" style="margin-top:12px">${sorted.map((x) => `<label class="row-item"><span class="ri-ic mode-${x.mode}">${ic('file', 20)}</span><div class="ri-b"><b>${esc(x.title)}</b><div class="chips-inline">${audience(x)}</div></div><span class="switch"><input type="checkbox" data-q="${x.id}" ${(x.allowedClasses || []).includes(cls.name) ? 'checked' : ''}><i></i></span></label>`).join('')}</div>` : `<div class="card pad">${empty('file', 'Chưa có đề nào')}</div>`}`;
    box.onchange = async (e) => {
      const i = e.target.closest('[data-q]'); if (!i) return;
      const x = quizzes.find((z) => z.id === i.dataset.q); const set = new Set(x.allowedClasses || []);
      i.checked ? set.add(cls.name) : set.delete(cls.name);
      i.disabled = true;
      try { await F.updateDoc(F.doc(db, 'quizzes', x.id), { allowedClasses: [...set], updatedAt: Date.now() }); x.allowedClasses = [...set]; toast(i.checked ? 'Đã giao đề cho lớp.' : 'Đã gỡ đề khỏi lớp.', 'success'); box.querySelector(`[data-q="${x.id}"]`).closest('.row-item').querySelector('.chips-inline').innerHTML = audience(x); }
      catch (err) { toast(err.message, 'error'); i.checked = !i.checked; }
      i.disabled = false;
    };
  } else {
    box.innerHTML = loading();
    const atts = (await getAttemptsWhere('className', cls.name)).filter((a) => a.status === 'submitted');
    const byQ = {}; atts.forEach((a) => (byQ[a.quizId] ||= []).push(a));
    const rowsQ = Object.entries(byQ).map(([qid, l]) => ({ title: l[0].quizTitle, n: l.length, avg: l.reduce((s, a) => s + a.score, 0) / l.length, pass: l.filter((a) => a.score >= (a.passScore ?? 5)).length / l.length, who: new Set(l.map((a) => a.uid)).size }));
    const byU = {}; atts.forEach((a) => (byU[a.uid] ||= []).push(a));
    const rowsU = Object.values(byU).map((l) => ({ name: l[0].userName, uid: l[0].uid, n: l.length, avg: l.reduce((s, a) => s + a.score, 0) / l.length })).sort((a, b) => b.avg - a.avg);
    const missing = members.filter((m) => !byU[m.id]);
    box.innerHTML = atts.length ? `<div class="toolbar"><button class="btn" id="exp">${ic('download', 16)} Xuất Excel kết quả lớp</button></div>
      <div class="card" style="margin-bottom:14px"><div class="tablewrap"><table><thead><tr><th>Đề</th><th>Lượt nộp</th><th>Số HV đã làm</th><th>Điểm TB</th><th>Tỷ lệ đạt</th></tr></thead><tbody>${rowsQ.map((r) => `<tr><td>${esc(r.title)}</td><td>${r.n}</td><td>${r.who}/${members.length}</td><td><b>${fmtScore(r.avg)}</b></td><td>${Math.round(r.pass * 100)}%</td></tr>`).join('')}</tbody></table></div></div>
      <div class="two-col"><div class="card pad"><h3>${ic('trophy', 18)} Xếp hạng điểm trung bình</h3><ol class="rank">${rowsU.slice(0, 15).map((r, i) => `<li><span class="rk r${i + 1}">${i + 1}</span><div><a href="#/admin/user/${r.uid}"><b>${esc(r.name)}</b></a><small class="muted"> ${r.n} lượt</small></div><span class="score big">${fmtScore(r.avg)}</span></li>`).join('')}</ol></div>
        <div class="card pad"><h3>${ic('alert', 18)} Chưa làm đề nào (${missing.length})</h3>${missing.length ? `<ul class="plain">${missing.map((m) => `<li><a href="#/admin/user/${m.id}">${esc(m.displayName)}</a></li>`).join('')}</ul>` : '<p class="muted">Tất cả học viên đã làm bài.</p>'}</div></div>`
      : `<div class="card pad">${empty('chart', 'Lớp chưa có kết quả nào')}</div>`;
    box.querySelector('#exp')?.addEventListener('click', () => exportXlsx([{ name: 'Kết quả lớp', rows: attemptsToRows(atts) }], 'ket-qua-lop-' + safeName(cls.name) + '.xlsx'));
  }
  return () => { box.onclick = null; box.onchange = null; };
}

// ====================== HỌC VIÊN ======================
async function addAccountModal(classes, defaultClass = '') {
  return modal({
    title: 'Thêm tài khoản học viên', okText: 'Tạo tài khoản',
    html: `<label class="field"><span>Tên đăng nhập hoặc email</span><input class="input" id="lg" autocapitalize="none" placeholder="vd: hs001 hoặc a@gmail.com"></label>
      <label class="field"><span>Mật khẩu (từ 6 ký tự)</span><input class="input" id="pw" value="${Math.random().toString(36).slice(2, 8)}"></label>
      <label class="field"><span>Họ và tên</span><input class="input" id="nm"></label>
      <label class="field"><span>Lớp</span><select class="input" id="cl">${classOptions(classes, defaultClass)}</select></label>
      <p class="muted s">Học viên không có email có thể dùng tên đăng nhập. Hãy gửi tên đăng nhập và mật khẩu cho học viên.</p>`,
    onOk: async (m) => {
      const g = (s) => m.querySelector(s).value.trim();
      await createAccount({ login: g('#lg'), password: g('#pw'), name: g('#nm'), cls: g('#cl') });
      toast('Đã tạo tài khoản.', 'success'); return true;
    },
  });
}
async function bulkModal(classes, defaultClass = '') {
  return modal({
    title: 'Tạo tài khoản hàng loạt', wide: true, okText: 'Tạo tất cả',
    html: `<p class="muted">Mỗi dòng một học viên: <b>tên đăng nhập, mật khẩu, họ tên, lớp</b> (lớp có thể bỏ trống; lớp chưa có sẽ được tự tạo). Hoặc tải file Excel/CSV với 4 cột theo thứ tự đó.</p>
      <textarea class="input" id="bl" rows="8" placeholder="hs001, 123456, Nguyễn Văn An, 12A1&#10;hs002, 123456, Trần Thị Bình, 12A1"></textarea>
      <div class="row" style="margin-top:8px"><input type="file" id="bf" accept=".xlsx,.xls,.csv" class="input grow"><label class="field inline"><span>Lớp mặc định</span><select class="input" id="dc">${classOptions(classes, defaultClass)}</select></label></div><div id="bp" class="log-box hide"></div>`,
    onOpen: (m) => {
      m.querySelector('#bf').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const ext = f.name.split('.').pop().toLowerCase();
        const wb = ext === 'csv' ? XLSX.read(await readFile(f, 'text'), { type: 'string' }) : XLSX.read(await readFile(f), { type: 'array' });
        let rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).filter((r) => r.some((c) => String(c).trim()));
        if (rows.length && /tên|user|email|login/i.test(String(rows[0][0]))) rows.shift();
        m.querySelector('#bl').value = rows.map((r) => r.slice(0, 4).join(', ')).join('\n');
      };
    },
    onOk: async (m) => {
      const lines = m.querySelector('#bl').value.split('\n').map((l) => l.split(/[,\t;]/).map((x) => x.trim())).filter((r) => r[0]);
      if (!lines.length) throw new Error('Chưa có dòng nào.');
      const dc = m.querySelector('#dc').value, log = m.querySelector('#bp'); log.classList.remove('hide'); log.innerHTML = '';
      let ok = 0, fail = 0;
      for (const [i, r] of lines.entries()) {
        const [login, password, name, cls] = r; const c = cls || dc;
        try { await ensureClass(c, classes); await createAccount({ login, password: password || '', name, cls: c }); ok++; log.innerHTML += `<div class="ok">✓ ${esc(login)}</div>`; }
        catch (err) { fail++; log.innerHTML += `<div class="bad">✗ ${esc(login)} — ${esc(err.code === 'auth/email-already-in-use' ? 'đã tồn tại' : err.message)}</div>`; }
        log.scrollTop = log.scrollHeight;
      }
      toast(`Xong: ${ok} thành công, ${fail} lỗi.`, fail ? 'error' : 'success', 5000);
      m.querySelector('[data-m=ok]').style.display = 'none'; m.querySelector('.modal-f [data-m=cancel]').textContent = 'Đóng';
      return undefined; // giữ hộp thoại mở để xem kết quả
    },
  }).then((v) => v === null ? true : v); // đóng hộp thoại → làm mới danh sách
}

export async function renderUsers(root) {
  root.innerHTML = tabsHtml('users') + loading();
  let users = [], classes = [];
  let text = '', cls = '*', status = '';
  const load = async () => { [users, classes] = await Promise.all([getAll('users'), getClasses()]); draw(); };
  const stu = () => users.filter((u) => u.role !== 'admin');

  function table() {
    const list = stu().filter((u) => (cls === '*' || (cls === '' ? !u.className : u.className === cls)) && (!status || u.status === status) && (u.displayName + ' ' + displayLogin(u)).toLowerCase().includes(text))
      .sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'vi'));
    return list.length ? `<div class="card"><div class="tablewrap"><table><thead><tr><th>Học viên</th><th>Lớp</th><th>Trạng thái</th><th>Truy cập</th></tr></thead><tbody>${list.map((u) => `<tr class="click" data-u="${u.id}"><td><div class="cell-u">${avatar(u.displayName, 34)}<div><b>${esc(u.displayName)}</b><div class="muted s">${esc(displayLogin(u))}</div></div></div></td><td>${classChip(u.className) || '<span class="muted">—</span>'}</td><td>${statusTag(u.status)}</td><td>${dot(isOnline(u.lastSeen, 150000))}<span class="s muted">${isOnline(u.lastSeen, 150000) ? 'Trực tuyến' : u.lastSeen ? fmtDate(u.lastSeen) : 'Chưa vào'}</span></td></tr>`).join('')}</tbody></table></div></div>` : `<div class="card pad">${empty('users', 'Không có học viên phù hợp')}</div>`;
  }
  function draw() {
    const pending = stu().filter((u) => u.status === 'pending');
    const cnt = (c) => stu().filter((u) => (c === '' ? !u.className : u.className === c)).length;
    root.innerHTML = `${tabsHtml('users')}<div class="page-h"><div><h1 class="ptitle">Học viên</h1><p class="muted">${stu().length} tài khoản</p></div>
      <div class="row"><button class="btn primary" id="add">${ic('plus', 16)} Thêm tài khoản</button><button class="btn" id="bulk">${ic('upload', 16)} Hàng loạt</button><button class="btn" id="exp">${ic('download', 16)} Xuất lịch sử</button><button class="btn icon" id="ref" title="Làm mới">${ic('refresh', 16)}</button></div></div>
      ${pending.length ? `<div class="note warn">${ic('clock', 16)}<span><b>${pending.length}</b> tài khoản đang chờ duyệt.</span><button class="btn sm primary" id="apprAll">Duyệt tất cả</button></div>` : ''}
      <div class="pills"><button class="${cls === '*' ? 'on' : ''}" data-c="*">Tất cả <small>${stu().length}</small></button>${classes.map((c) => `<button class="${cls === c.name ? 'on' : ''}" data-c="${esc(c.name)}" style="--h:${hueOf(c.name)}">${esc(c.name)} <small>${cnt(c.name)}</small></button>`).join('')}${cnt('') ? `<button class="${cls === '' ? 'on' : ''}" data-c="">Chưa xếp lớp <small>${cnt('')}</small></button>` : ''}</div>
      <div class="toolbar"><div class="search grow">${ic('search', 16)}<input class="input" id="t" placeholder="Tìm theo tên, tên đăng nhập, email…" value="${esc(text)}"></div>
        <select class="input w-auto" id="st"><option value="">Mọi trạng thái</option>${Object.entries(STATUS).map(([k, [t]]) => `<option value="${k}" ${status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div id="tbl">${table()}</div>`;
  }
  root.onclick = async (e) => {
    const r = e.target.closest('[data-u]'); if (r) return go('/admin/user/' + r.dataset.u);
    const c = e.target.closest('[data-c]'); if (c) { cls = c.dataset.c; draw(); return; }
    try {
      if (e.target.closest('#add')) { if (await addAccountModal(classes, cls !== '*' ? cls : '')) load(); }
      else if (e.target.closest('#bulk')) { await bulkModal(classes, cls !== '*' ? cls : ''); load(); }
      else if (e.target.closest('#ref')) { root.querySelector('#tbl').innerHTML = loading(); load(); }
      else if (e.target.closest('#apprAll')) { for (const u of users.filter((u) => u.status === 'pending')) await F.updateDoc(F.doc(db, 'users', u.id), { status: 'active' }); toast('Đã duyệt tất cả.', 'success'); load(); }
      else if (e.target.closest('#exp')) { toast('Đang tải lịch sử…'); const all = await getAll('attempts'); exportXlsx([{ name: 'Lịch sử', rows: attemptsToRows(all.sort((a, b) => b.startedAt - a.startedAt)) }], 'lich-su-lam-bai.xlsx'); }
    } catch (err) { toast(err.message, 'error'); }
  };
  root.oninput = debounce((e) => { if (e.target.id === 't') { text = e.target.value.toLowerCase(); root.querySelector('#tbl').innerHTML = table(); } }, 150);
  root.onchange = (e) => { if (e.target.id === 'st') { status = e.target.value; root.querySelector('#tbl').innerHTML = table(); } };
  await load();
  return () => { root.onclick = root.oninput = root.onchange = null; };
}

// ====================== TRANG TỪNG HỌC VIÊN ======================
export async function renderUserDetail(root, p) {
  const uid = p.id; const unsubs = []; let u = null, attempts = [], classes = [];
  const expanded = new Set(), contentCache = {}, picked = new Set();
  classes = await getClasses();
  root.innerHTML = `<a class="back" href="#/admin/users">${ic('left', 16)} Danh sách học viên</a><div id="head"></div><div id="form"></div><div id="att"></div>`;
  const head = root.querySelector('#head'), form = root.querySelector('#form'), att = root.querySelector('#att');
  let formDrawn = false;

  function drawHead() {
    if (!u) { head.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy học viên')}</div>`; return; }
    const on = isOnline(u.lastSeen, 150000), cur = attempts.find((a) => a.status === 'in_progress' && (!a.deadline || a.deadline > Date.now()));
    head.innerHTML = `<div class="card pad ud-head"><div class="ud-t">${avatar(u.displayName, 60)}<div class="grow"><h1>${esc(u.displayName)}</h1><div class="muted">${esc(displayLogin(u))}</div>
      <div class="chips-inline" style="margin-top:6px">${classChip(u.className)}${statusTag(u.status)}<span class="tag">${dot(on)}${on ? 'Trực tuyến' : u.lastSeen ? 'Ngoại tuyến · ' + fmtDate(u.lastSeen) : 'Chưa từng vào'}</span></div></div></div>
      ${cur ? `<div class="note info" style="margin-top:12px">${ic('activity', 16)}<span>Đang làm <b>${esc(cur.quizTitle)}</b> từ ${fmtClock(cur.startedAt)} · đã làm ${answeredCount(cur)}/${cur.total} câu${cur.deadline ? ' · còn ' + fmtTime((cur.deadline - Date.now()) / 1000) : ''}</span></div>` : ''}
      <div class="row" style="margin-top:14px">
        ${u.status === 'pending' ? `<button class="btn primary" data-a="approve">${ic('check', 16)} Duyệt</button>` : ''}
        ${u.status === 'blocked' ? `<button class="btn" data-a="unblock">${ic('lock', 16)} Mở khóa</button>` : `<button class="btn" data-a="block">${ic('lock', 16)} Khóa tài khoản</button>`}
        <button class="btn" data-a="pw">${ic('key', 16)} Đổi mật khẩu</button>
        ${isUsernameEmail(u.email) ? '' : `<button class="btn" data-a="mail">${ic('mail', 16)} Gửi mail đặt lại MK</button>`}
        <button class="btn" data-a="xl">${ic('download', 16)} Xuất lịch sử</button></div></div>`;
  }
  function drawForm() {
    if (!u || formDrawn) return; formDrawn = true;
    form.innerHTML = `<div class="card pad" style="margin-top:14px"><h3>Thông tin</h3><div class="two"><label class="field"><span>Họ và tên</span><input class="input" id="f-n" value="${esc(u.displayName)}"></label>
      <label class="field"><span>Lớp</span><select class="input" id="f-c">${classOptions(classes, u.className)}</select></label>
      <label class="field"><span>Trạng thái</span><select class="input" id="f-s">${Object.entries(STATUS).map(([k, [t]]) => `<option value="${k}" ${u.status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label class="field"><span>Quyền</span><select class="input" id="f-r"><option value="user" ${u.role !== 'admin' ? 'selected' : ''}>Học viên</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Giảng viên (quản trị)</option></select></label></div>
      <button class="btn primary" data-a="save">${ic('save', 16)} Lưu thông tin</button></div>`;
  }
  async function logHtml(a) {
    if (!contentCache[a.quizId]) contentCache[a.quizId] = Object.fromEntries((await getContent(a.quizId).catch(() => [])).map((q) => [q.id, q]));
    const by = contentCache[a.quizId], pos = Object.fromEntries((a.plan?.qOrder || []).map((id, i) => [id, i]));
    const lines = [...(a.log || [])].sort((x, y) => x.t - y.t).map((l) => {
      const q = by[l.q]; const keys = a.plan?.oOrder?.[l.q] || KEYS; const ok = q ? q.ans === l.k : null;
      return `<div class="lg-l ${ok === null ? '' : ok ? 'ok' : 'bad'}"><span>${fmtClock(l.t)}</span><span>Câu ${(pos[l.q] ?? -1) + 1}</span><span>chọn ${String.fromCharCode(65 + Math.max(0, keys.indexOf(l.k)))}</span><b>${ok === null ? '' : ok ? 'Đúng' : 'Sai'}</b></div>`;
    }).join('');
    return lines || '<div class="muted">Chưa có lựa chọn nào.</div>';
  }
  async function drawAtt() {
    const list = [...attempts].sort((a, b) => b.startedAt - a.startedAt);
    const rows = [];
    for (const a of list) {
      const run = a.status === 'in_progress';
      rows.push(`<div class="att ${run ? 'run' : ''}"><div class="att-h"><label class="chk"><input type="checkbox" data-pk="${a.id}" ${picked.has(a.id) ? 'checked' : ''}></label>
        <div class="ri-b"><b>${esc(a.quizTitle)}</b><span class="muted">${fmtDate(a.startedAt)}${run ? ` · ${isOnline(a.lastSeen) ? 'đang làm' : 'ngoại tuyến'} · ${answeredCount(a)}/${a.total} câu${a.deadline ? ' · còn ' + (a.deadline - Date.now() > 0 ? fmtTime((a.deadline - Date.now()) / 1000) : 'hết giờ') : ''}` : ` · ${fmtTime(a.durationSec)}`}</span></div>
        ${run ? '<span class="tag warn">Chưa nộp</span>' : `<span class="score big ${a.score >= (a.passScore ?? 5) ? 'good' : 'bad'}">${fmtScore(a.score)}</span>`}
        <button class="btn sm ghost" data-ex="${a.id}">${expanded.has(a.id) ? 'Ẩn' : 'Chi tiết'}</button>${run ? '' : `<a class="btn sm" href="#/result/${a.id}">Xem bài</a>`}</div>
        ${expanded.has(a.id) ? `<div class="log-box">${await logHtml(a)}</div>` : ''}</div>`);
    }
    att.innerHTML = `<div class="page-h" style="margin-top:20px"><h3 class="sec" style="margin:0">Lịch sử làm bài (${attempts.length})</h3>
      <div class="row"><button class="btn sm danger-o" data-a="delPick" ${picked.size ? '' : 'disabled'}>${ic('trash', 14)} Xóa mục đã chọn (${picked.size})</button><button class="btn sm danger-o" data-a="delAll" ${attempts.length ? '' : 'disabled'}>Xóa tất cả</button></div></div>
      ${attempts.length ? `<div class="card list-card">${rows.join('')}</div>` : `<div class="card pad">${empty('clock', 'Chưa làm đề nào')}</div>`}
      ${u ? `<div class="danger-zone"><h3>Vùng nguy hiểm</h3><p class="muted">Xóa hồ sơ sẽ xóa dữ liệu và lịch sử của học viên. Tài khoản đăng nhập còn tồn tại trong Firebase Authentication và cần xóa tay ở đó nếu muốn.</p><button class="btn danger-o" data-a="wipe">${ic('trash', 16)} Xóa hồ sơ và dữ liệu học viên</button></div>` : ''}`;
  }

  unsubs.push(F.onSnapshot(F.doc(db, 'users', uid), (s) => { u = s.exists() ? { id: uid, ...s.data() } : null; drawHead(); drawForm(); }));
  unsubs.push(F.onSnapshot(F.query(F.collection(db, 'attempts'), F.where('uid', '==', uid)), (s) => { attempts = s.docs.map((d) => ({ id: d.id, ...d.data() })); drawHead(); drawAtt(); }));
  const tm = setInterval(() => { drawHead(); }, 5000);

  root.onclick = async (e) => {
    const ex = e.target.closest('[data-ex]');
    if (ex) { expanded.has(ex.dataset.ex) ? expanded.delete(ex.dataset.ex) : expanded.add(ex.dataset.ex); return drawAtt(); }
    const pk = e.target.closest('[data-pk]');
    if (pk) { pk.checked ? picked.add(pk.dataset.pk) : picked.delete(pk.dataset.pk); const b = att.querySelector('[data-a=delPick]'); b.disabled = !picked.size; b.innerHTML = `${ic('trash', 14)} Xóa mục đã chọn (${picked.size})`; return; }
    const b = e.target.closest('[data-a]'); if (!b || !u) return;
    const a = b.dataset.a, ref = F.doc(db, 'users', uid);
    try {
      if (a === 'approve' || a === 'unblock') await F.updateDoc(ref, { status: 'active' });
      else if (a === 'block') { if (await confirmBox(`Khóa tài khoản "${u.displayName}"? Học viên sẽ không vào làm đề được.`, 'Khóa', true)) await F.updateDoc(ref, { status: 'blocked' }); }
      else if (a === 'save') {
        const nc = form.querySelector('#f-c').value; await ensureClass(nc, classes);
        await F.updateDoc(ref, { displayName: form.querySelector('#f-n').value.trim() || u.displayName, className: nc, status: form.querySelector('#f-s').value, role: form.querySelector('#f-r').value });
        toast('Đã lưu thông tin.', 'success');
      }
      else if (a === 'mail') { await A.sendPasswordResetEmail(auth, u.email); toast('Đã gửi mail đặt lại mật khẩu tới ' + u.email, 'success', 4500); }
      else if (a === 'pw') await changePassword(u);
      else if (a === 'xl') exportXlsx([{ name: 'Lịch sử', rows: attemptsToRows(attempts) }], 'lich-su-' + safeName(u.displayName) + '.xlsx');
      else if (a === 'delPick') { if (await confirmBox(`Xóa ${picked.size} lượt làm bài đã chọn?`, 'Xóa', true)) { await deleteAttempts([...picked].map((id) => ({ id }))); picked.clear(); toast('Đã xóa.', 'success'); } }
      else if (a === 'delAll') { if (await confirmBox('Xóa TOÀN BỘ lịch sử làm bài của học viên này?', 'Xóa hết', true)) { await deleteAttempts(attempts); picked.clear(); toast('Đã xóa lịch sử.', 'success'); } }
      else if (a === 'wipe') {
        if (!(await confirmBox(`Xóa hồ sơ "${u.displayName}" cùng toàn bộ lịch sử? Không thể khôi phục.`, 'Xóa hồ sơ', true))) return;
        await deleteAttempts(attempts); await F.deleteDoc(F.doc(db, 'userSecrets', uid)).catch(() => {}); await F.deleteDoc(ref);
        toast('Đã xóa dữ liệu học viên.', 'success'); go('/admin/users');
      }
    } catch (err) { toast(err.message, 'error'); }
  };
  return () => { unsubs.forEach((f) => f()); clearInterval(tm); root.onclick = null; };
}

/** Đổi mật khẩu hộ học viên: chỉ làm được với tài khoản do admin cấp và học viên chưa tự đổi. */
async function changePassword(u) {
  return modal({
    title: 'Đổi mật khẩu cho ' + u.displayName, okText: 'Đổi mật khẩu',
    html: `<label class="field"><span>Mật khẩu mới (từ 6 ký tự)</span><input class="input" id="np" value="${Math.random().toString(36).slice(2, 8)}"></label>
      <p class="muted s">Chỉ đổi được khi tài khoản do bạn cấp và học viên chưa tự đổi mật khẩu. Nếu không được, hãy dùng "Gửi mail đặt lại MK" (tài khoản có email).</p>`,
    onOk: async (m) => {
      const np = m.querySelector('#np').value.trim(); if (np.length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự.');
      const sec = await F.getDoc(F.doc(db, 'userSecrets', u.id));
      if (!sec.exists()) throw new Error(isUsernameEmail(u.email) ? 'Không đổi hộ được vì học viên đã tự đổi mật khẩu. Hãy tạo tài khoản mới cho học viên.' : 'Không đổi hộ được vì học viên đã tự đổi mật khẩu. Hãy bấm "Gửi mail đặt lại MK".');
      try { await withUserSession(u.email, sec.data().pw, (user) => A.updatePassword(user, np)); }
      catch (e) { throw new Error('Mật khẩu đã lưu không còn đúng. ' + (isUsernameEmail(u.email) ? 'Hãy tạo tài khoản mới.' : 'Hãy dùng "Gửi mail đặt lại MK".')); }
      await F.setDoc(F.doc(db, 'userSecrets', u.id), { pw: np, setAt: Date.now() });
      toast('Đã đổi mật khẩu. Hãy báo cho học viên: ' + np, 'success', 6000); return true;
    },
  });
}
