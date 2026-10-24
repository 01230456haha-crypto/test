// Quản lý lớp, học viên (một học viên có thể vào nhiều lớp) và trang theo dõi từng học viên.
import { auth, db, A, F, createAuthUser, withUserSession } from './fb.js';
import { go } from './state.js';
import { esc, toLoginEmail, isUsernameEmail, displayLogin, hueOf, fmtDate, fmtClock, fmtTime, fmtScore, attemptsToRows, byName, KEYS, audienceOf, folderAudience, userClasses, attemptClasses, inheritedFolder, canSeeQuiz, folderChain } from './lib.js';
import { getAll, getClasses, getQuizzes, getFolders, getContent, deleteAttempts } from './data.js';
import { ic } from './icons.js';
import { toast, modal, confirmBox, promptBox, loading, empty, avatar, classChip, classChips, exportXlsx, safeName, readFile, debounce } from './ui.js';
import { tabsHtml, isOnline, dot, answeredCount, audienceChips, folderChips } from './adminui.js';

const STATUS = { active: ['Hoạt động', 'ok'], pending: ['Chờ duyệt', 'warn'], blocked: ['Đã khóa', 'bad'] };
const statusTag = (s) => { const [t, c] = STATUS[s] || ['—', '']; return `<span class="tag ${c}">${t}</span>`; };
const byDisplay = (a, b) => String(a.displayName).localeCompare(String(b.displayName), 'vi');
const setClasses = (uid, arr) => F.updateDoc(F.doc(db, 'users', uid), { classes: arr, className: arr[0] || '' });
/** Chọn nhiều lớp (bấm để bật/tắt). */
const classPickHtml = (classes, sel = []) => `<div class="chips-pick" data-cp>${classes.map((c) => `<button type="button" class="pick ${sel.includes(c.name) ? 'on' : ''}" style="--h:${hueOf(c.name)}" data-c="${esc(c.name)}">${esc(c.name)}</button>`).join('') || '<span class="muted s">Chưa có lớp nào (tạo lớp trước).</span>'}</div>`;
const bindClassPick = (el) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-cp] [data-c]'); if (b) b.classList.toggle('on'); });
const readClassPick = (el) => [...el.querySelectorAll('[data-cp] .pick.on')].map((b) => b.dataset.c);

async function ensureClass(name, classes) {
  name = String(name || '').trim(); if (!name) return;
  if (classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
  const ref = await F.addDoc(F.collection(db, 'classes'), { name, createdAt: Date.now() });
  classes.push({ id: ref.id, name });
}
/** Tạo tài khoản đăng nhập + hồ sơ. Lưu mật khẩu cấp ban đầu (chỉ admin đọc được) để sau này đổi hộ. */
async function createAccount({ login, password, name, classes: cl = [] }) {
  const email = toLoginEmail(login);
  if (!email) throw new Error('Tên đăng nhập/email không hợp lệ');
  if (String(password).length < 6) throw new Error('Mật khẩu tối thiểu 6 ký tự');
  const uid = await createAuthUser(email, String(password));
  await F.setDoc(F.doc(db, 'users', uid), { email, username: isUsernameEmail(email) ? email.split('@')[0] : '', displayName: name || login, classes: cl, className: cl[0] || '', role: 'user', status: 'active', createdAt: Date.now(), createdBy: 'admin' });
  await F.setDoc(F.doc(db, 'userSecrets', uid), { pw: String(password), setAt: Date.now() });
  return uid;
}
async function createClassPrompt(classes) {
  const name = await promptBox('Tạo lớp mới', 'Tên lớp (ví dụ: 12A1)', '', 'Tạo lớp'); if (!name) return false;
  if (classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) { toast('Lớp này đã tồn tại.', 'error'); return false; }
  await F.addDoc(F.collection(db, 'classes'), { name, createdAt: Date.now() });
  toast('Đã tạo lớp.', 'success'); return true;
}

// ====================== TRANG MỘT LỚP ======================
export async function renderClassDetail(root, p, q) {
  const tab = q.tab || 'students';
  root.innerHTML = loading();
  const [classes, users, quizzes, folders] = await Promise.all([getClasses(), getAll('users'), getQuizzes(), getFolders()]);
  const cls = classes.find((c) => c.id === p.id);
  if (!cls) { root.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy lớp')}<a class="btn" href="#/admin/users">Quay lại</a></div>`; return; }
  const inCls = (u) => userClasses(u).includes(cls.name);
  const members = users.filter((u) => u.role === 'user' && inCls(u)).sort(byDisplay);
  const direct = (sp, aud) => aud === 'classes' && (sp.allowedClasses || []).includes(cls.name);
  const quizSees = (qz) => canSeeQuiz(qz, folders, { role: 'user', classes: [cls.name] }, '');
  const nAssigned = quizzes.filter((qz) => !qz.hidden && quizSees(qz)).length;
  const T = [['students', `Học viên (${members.length})`, 'users'], ['quizzes', `Đề đã giao (${nAssigned})`, 'send'], ['results', 'Kết quả', 'chart']];
  root.innerHTML = `<a class="back" href="#/admin/users">${ic('left', 16)} Lớp & học viên</a>
    <div class="card pad class-head" style="--h:${hueOf(cls.name)}"><div class="cc-ic lg">${ic('book', 26)}</div><div class="grow"><h1>${esc(cls.name)}</h1><span class="muted">${members.length} học viên · ${nAssigned} đề đã giao</span></div>
      <button class="btn" id="exl">${ic('download', 16)} Xuất danh sách</button><button class="btn" id="ren">${ic('edit', 16)} Đổi tên</button><button class="btn danger-o" id="del">${ic('trash', 16)} Xóa lớp</button></div>
    <nav class="tabs sub">${T.map(([k, n, i]) => `<a href="#/admin/class/${cls.id}?tab=${k}" class="${k === tab ? 'on' : ''}">${ic(i, 16)}<span>${n}</span></a>`).join('')}</nav><div id="tab"></div>`;
  const box = root.querySelector('#tab');

  root.querySelector('#exl').onclick = () => exportXlsx([{ name: 'Danh sách lớp', rows: members.map((u, i) => ({ 'STT': i + 1, 'Họ tên': u.displayName, 'Tên đăng nhập': displayLogin(u), 'Các lớp': userClasses(u).join(', '), 'Trạng thái': (STATUS[u.status] || ['—'])[0] })) }], 'lop-' + safeName(cls.name) + '.xlsx');
  root.querySelector('#ren').onclick = async () => {
    const nn = await promptBox('Đổi tên lớp', 'Tên mới', cls.name); if (!nn || nn === cls.name) return;
    if (classes.some((c) => c.id !== cls.id && c.name.toLowerCase() === nn.toLowerCase())) return toast('Tên lớp đã tồn tại.', 'error');
    await F.updateDoc(F.doc(db, 'classes', cls.id), { name: nn });
    for (const u of users.filter(inCls)) await setClasses(u.id, userClasses(u).map((c) => (c === cls.name ? nn : c)));
    for (const sp of [...quizzes.map((x) => ['quizzes', x, audienceOf(x)]), ...folders.map((x) => ['folders', x, folderAudience(x)])]) {
      if (sp[2] === 'classes' && (sp[1].allowedClasses || []).includes(cls.name)) await F.updateDoc(F.doc(db, sp[0], sp[1].id), { allowedClasses: sp[1].allowedClasses.map((c) => (c === cls.name ? nn : c)) });
    }
    toast('Đã đổi tên lớp.', 'success'); go('/admin/class/' + cls.id + '?tab=' + tab);
  };
  root.querySelector('#del').onclick = async () => {
    if (!(await confirmBox(`Xóa lớp "${cls.name}"? Học viên được gỡ khỏi lớp này (vẫn giữ các lớp khác) và lớp bị gỡ khỏi các đề/thư mục đã giao. Tài khoản học viên không bị xóa.`, 'Xóa lớp', true))) return;
    for (const u of members) await setClasses(u.id, userClasses(u).filter((c) => c !== cls.name));
    for (const [col, sp, aud] of [...quizzes.map((x) => ['quizzes', x, audienceOf(x)]), ...folders.map((x) => ['folders', x, folderAudience(x)])]) {
      if (aud === 'classes' && (sp.allowedClasses || []).includes(cls.name)) { const rest = sp.allowedClasses.filter((c) => c !== cls.name); await F.updateDoc(F.doc(db, col, sp.id), { allowedClasses: rest, audience: rest.length ? 'classes' : 'none' }); }
    }
    await F.deleteDoc(F.doc(db, 'classes', cls.id)); toast('Đã xóa lớp.', 'success'); go('/admin/users');
  };

  if (tab === 'students') {
    box.innerHTML = `<div class="toolbar"><button class="btn primary" id="addExist">${ic('plus', 16)} Thêm học viên có sẵn</button><button class="btn" id="addNew">${ic('user', 16)} Tạo tài khoản mới</button><button class="btn" id="bulk">${ic('upload', 16)} Hàng loạt</button></div>
      ${members.length ? `<div class="card list-card">${members.map((u) => { const others = userClasses(u).filter((c) => c !== cls.name); return `<div class="row-item"><a class="ri-main" href="#/admin/user/${u.id}">${avatar(u.displayName, 38)}<div class="ri-b"><b>${esc(u.displayName)}</b><span class="muted">${esc(displayLogin(u))}</span>${others.length ? `<div class="chips-inline"><span class="muted s">Cũng học:</span>${others.map(classChip).join('')}</div>` : ''}</div></a>${dot(isOnline(u.lastSeen, 150000))}${statusTag(u.status)}<button class="btn icon ghost" data-rm="${u.id}" title="Gỡ khỏi lớp này">${ic('x', 16)}</button></div>`; }).join('')}</div>` : `<div class="card pad">${empty('users', 'Lớp chưa có học viên', 'Thêm học viên có sẵn hoặc tạo tài khoản mới.')}</div>`}`;
    box.onclick = async (e) => {
      try {
        const rm = e.target.closest('[data-rm]');
        if (rm) { const u = users.find((x) => x.id === rm.dataset.rm); await setClasses(u.id, userClasses(u).filter((c) => c !== cls.name)); go('/admin/class/' + cls.id); }
        else if (e.target.closest('#addExist')) {
          const others = users.filter((u) => u.role === 'user' && !inCls(u)).sort(byDisplay);
          const ids = await modal({
            title: 'Thêm học viên vào ' + cls.name, okText: 'Thêm vào lớp', wide: true,
            html: `<p class="muted s" style="margin-top:0">Học viên có thể học nhiều lớp: thêm vào đây không làm mất các lớp khác của họ.</p><div class="search">${ic('search', 16)}<input class="input" id="s" placeholder="Tìm học viên…"></div><div class="pick-list tall">${others.map((u) => `<label class="pick-row" data-s="${esc((u.displayName + ' ' + displayLogin(u) + ' ' + userClasses(u).join(' ')).toLowerCase())}"><input type="checkbox" value="${u.id}">${avatar(u.displayName, 28)}<span><b>${esc(u.displayName)}</b><small class="muted"> ${esc(displayLogin(u))}</small></span>${classChips(u)}</label>`).join('') || '<p class="muted">Không còn học viên nào.</p>'}</div>`,
            onOpen: (m) => { m.querySelector('#s').oninput = (ev) => m.querySelectorAll('[data-s]').forEach((r) => (r.style.display = r.dataset.s.includes(ev.target.value.toLowerCase()) ? '' : 'none')); },
            onOk: (m) => [...m.querySelectorAll('input[type=checkbox]:checked')].map((i) => i.value),
          });
          if (!ids?.length) return;
          for (const id of ids) await setClasses(id, [...userClasses(users.find((u) => u.id === id)), cls.name]);
          toast(`Đã thêm ${ids.length} học viên.`, 'success'); go('/admin/class/' + cls.id);
        }
        else if (e.target.closest('#addNew')) { if (await addAccountModal(classes, [cls.name])) go('/admin/class/' + cls.id); }
        else if (e.target.closest('#bulk')) { if (await bulkModal(classes, [cls.name])) go('/admin/class/' + cls.id); }
      } catch (err) { toast(err.message, 'error'); }
    };
  } else if (tab === 'quizzes') {
    const pathOf = (f) => folderChain(folders, f).reverse().map((x) => x.name).join(' / ');
    const fRows = [...folders].sort((a, b) => pathOf(a.id).localeCompare(pathOf(b.id), 'vi')).map((f) => `<label class="row-item"><span class="ri-ic folder">${ic('folder', 20)}</span><div class="ri-b"><b>${esc(pathOf(f.id))}</b><div class="chips-inline">${folderChips(f) || '<span class="muted s">Chưa giao</span>'}</div></div><span class="switch"><input type="checkbox" data-f="${f.id}" ${direct(f, folderAudience(f)) ? 'checked' : ''}><i></i></span></label>`).join('');
    const qRows = [...quizzes].sort(byName).map((x) => {
      const inh = inheritedFolder(x, folders), viaFolder = audienceOf(x) === 'none' && inh && direct(inh, folderAudience(inh));
      return `<label class="row-item"><span class="ri-ic mode-${x.mode}">${ic('file', 20)}</span><div class="ri-b"><b>${esc(x.title)}</b><div class="chips-inline">${x.folderId ? `<span class="muted s">${ic('folder', 12)} ${esc(pathOf(x.folderId))}</span>` : ''}${audienceChips(x, folders)}</div></div>${viaFolder ? `<span class="tag" style="background:var(--primary-soft);color:var(--primary)">Qua thư mục</span>` : `<span class="switch"><input type="checkbox" data-q="${x.id}" ${direct(x, audienceOf(x)) ? 'checked' : ''}><i></i></span>`}</label>`;
    }).join('');
    box.innerHTML = `<div class="note info">${ic('info', 16)}<span>Bật công tắc để giao cho lớp <b>${esc(cls.name)}</b>. Giao <b>cả thư mục</b> thì mọi đề trong thư mục (kể cả đề thêm sau) lớp đều thấy. Đề chưa giao thì học viên không thấy.</span></div>
      ${folders.length ? `<h3 class="sec">Thư mục</h3><div class="card list-card">${fRows}</div>` : ''}
      <h3 class="sec">Đề thi</h3>${quizzes.length ? `<div class="card list-card">${qRows}</div>` : `<div class="card pad">${empty('file', 'Chưa có đề nào')}</div>`}`;
    box.onchange = async (e) => {
      const i = e.target.closest('[data-q],[data-f]'); if (!i) return;
      const isF = !!i.dataset.f, id = i.dataset.f || i.dataset.q;
      const item = (isF ? folders : quizzes).find((z) => z.id === id), aud = isF ? folderAudience(item) : audienceOf(item);
      const set = new Set(aud === 'classes' ? item.allowedClasses || [] : []); // đang giao kiểu khác thì chuyển sang giao theo lớp
      i.checked ? set.add(cls.name) : set.delete(cls.name);
      const patch = { audience: set.size ? 'classes' : 'none', allowedClasses: [...set], allowedUsers: set.size ? [] : item.allowedUsers || [] };
      if (!isF) { patch.guest = false; patch.updatedAt = Date.now(); }
      i.disabled = true;
      try { await F.updateDoc(F.doc(db, isF ? 'folders' : 'quizzes', id), patch); toast(i.checked ? 'Đã giao cho lớp.' : 'Đã gỡ khỏi lớp.', 'success'); go('/admin/class/' + cls.id + '?tab=quizzes'); }
      catch (err) { toast(err.message, 'error'); i.checked = !i.checked; i.disabled = false; }
    };
  } else {
    box.innerHTML = loading();
    const memberIds = new Set(members.map((m) => m.id));
    const seen = new Set(quizzes.filter(quizSees).map((x) => x.id));
    const atts = (await getAll('attempts')).filter((a) => a.status === 'submitted' && !a.retry && memberIds.has(a.uid) && seen.has(a.quizId));
    const byQ = {}; atts.forEach((a) => (byQ[a.quizId] ||= []).push(a));
    const rowsQ = Object.values(byQ).map((l) => ({ title: l[0].quizTitle, n: l.length, avg: l.reduce((s, a) => s + a.score, 0) / l.length, pass: l.filter((a) => a.score >= (a.passScore ?? 5)).length / l.length, who: new Set(l.map((a) => a.uid)).size }));
    const byU = {}; atts.forEach((a) => (byU[a.uid] ||= []).push(a));
    const rowsU = Object.values(byU).map((l) => ({ name: l[0].userName, uid: l[0].uid, n: l.length, avg: l.reduce((s, a) => s + a.score, 0) / l.length })).sort((a, b) => b.avg - a.avg);
    const missing = members.filter((m) => !byU[m.id]);
    box.innerHTML = atts.length ? `<div class="toolbar"><button class="btn" id="exp">${ic('download', 16)} Xuất Excel kết quả lớp</button></div>
      <div class="card" style="margin-bottom:14px"><div class="tablewrap"><table><thead><tr><th>Đề</th><th>Lượt nộp</th><th>Số HV đã làm</th><th>Điểm TB</th><th>Tỷ lệ đạt</th></tr></thead><tbody>${rowsQ.map((r) => `<tr><td>${esc(r.title)}</td><td>${r.n}</td><td>${r.who}/${members.length}</td><td><b>${fmtScore(r.avg)}</b></td><td>${Math.round(r.pass * 100)}%</td></tr>`).join('')}</tbody></table></div></div>
      <div class="two-col"><div class="card pad"><h3>${ic('trophy', 18)} Xếp hạng điểm trung bình</h3><ol class="rank">${rowsU.slice(0, 15).map((r, i) => `<li><span class="rk r${i + 1}">${i + 1}</span><div><a href="#/admin/user/${r.uid}"><b>${esc(r.name)}</b></a><small class="muted"> ${r.n} lượt</small></div><span class="score big">${fmtScore(r.avg)}</span></li>`).join('')}</ol></div>
        <div class="card pad"><h3>${ic('alert', 18)} Chưa làm đề nào (${missing.length})</h3>${missing.length ? `<ul class="plain">${missing.map((m) => `<li><a href="#/admin/user/${m.id}">${esc(m.displayName)}</a></li>`).join('')}</ul>` : '<p class="muted">Tất cả học viên đã làm bài.</p>'}</div></div>`
      : `<div class="card pad">${empty('chart', 'Lớp chưa có kết quả nào', 'Kết quả của học viên lớp này ở các đề đã giao sẽ hiện ở đây.')}</div>`;
    box.querySelector('#exp')?.addEventListener('click', () => exportXlsx([{ name: 'Kết quả lớp', rows: attemptsToRows(atts) }], 'ket-qua-lop-' + safeName(cls.name) + '.xlsx'));
  }
  return () => { box.onclick = null; box.onchange = null; };
}

// ====================== HỌC VIÊN ======================
async function addAccountModal(classes, defaults = []) {
  return modal({
    title: 'Thêm học viên', okText: 'Tạo tài khoản',
    html: `<label class="field"><span>Tên đăng nhập hoặc email</span><input class="input" id="lg" autocapitalize="none" placeholder="vd: hs001 hoặc a@gmail.com"></label>
      <label class="field"><span>Mật khẩu (từ 6 ký tự)</span><input class="input" id="pw" value="${Math.random().toString(36).slice(2, 8)}"></label>
      <label class="field"><span>Họ và tên</span><input class="input" id="nm"></label>
      <div class="field"><span>Lớp (chọn nhiều được)</span>${classPickHtml(classes, defaults)}</div>
      <p class="muted s">Học viên không có email dùng tên đăng nhập. Hãy gửi tên đăng nhập và mật khẩu cho học viên.</p>`,
    onOpen: (m) => bindClassPick(m),
    onOk: async (m) => {
      const g = (s) => m.querySelector(s).value.trim();
      await createAccount({ login: g('#lg'), password: g('#pw'), name: g('#nm'), classes: readClassPick(m) });
      toast('Đã tạo tài khoản.', 'success'); return true;
    },
  });
}
async function bulkModal(classes, defaults = []) {
  return modal({
    title: 'Tạo tài khoản hàng loạt', wide: true, okText: 'Tạo tất cả',
    html: `<p class="muted">Mỗi dòng một học viên: <b>tên đăng nhập, mật khẩu, họ tên, lớp</b>. Nhiều lớp thì ngăn cách bằng dấu | (ví dụ <b>12A1|12A2</b>); lớp chưa có sẽ tự được tạo. Hoặc tải file Excel/CSV 4 cột theo thứ tự đó.</p>
      <textarea class="input" id="bl" rows="8" placeholder="hs001, 123456, Nguyễn Văn An, 12A1&#10;hs002, 123456, Trần Thị Bình, 12A1|12A2"></textarea>
      <input type="file" id="bf" accept=".xlsx,.xls,.csv" class="input" style="margin-top:8px">
      <div class="field" style="margin-top:10px"><span>Lớp mặc định (cho dòng không ghi lớp)</span>${classPickHtml(classes, defaults)}</div><div id="bp" class="log-box hide"></div>`,
    onOpen: (m) => {
      bindClassPick(m);
      m.querySelector('#bf').onchange = async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const ext = f.name.split('.').pop().toLowerCase();
        const wb = ext === 'csv' ? XLSX.read(await readFile(f, 'text'), { type: 'string' }) : XLSX.read(await readFile(f), { type: 'array' });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' }).filter((r) => r.some((c) => String(c).trim()));
        if (rows.length && /tên|user|email|login/i.test(String(rows[0][0]))) rows.shift();
        m.querySelector('#bl').value = rows.map((r) => r.slice(0, 4).join(', ')).join('\n');
      };
    },
    onOk: async (m) => {
      const lines = m.querySelector('#bl').value.split('\n').map((l) => l.split(/[,\t;]/).map((x) => x.trim())).filter((r) => r[0]);
      if (!lines.length) throw new Error('Chưa có dòng nào.');
      const dc = readClassPick(m), log = m.querySelector('#bp'); log.classList.remove('hide'); log.innerHTML = '';
      let ok = 0, fail = 0;
      for (const r of lines) {
        const [login, password, name, cl] = r; const cs = cl ? cl.split('|').map((x) => x.trim()).filter(Boolean) : dc;
        try { for (const c of cs) await ensureClass(c, classes); await createAccount({ login, password: password || '', name, classes: cs }); ok++; log.innerHTML += `<div class="ok">✓ ${esc(login)}</div>`; }
        catch (err) { fail++; log.innerHTML += `<div class="bad">✗ ${esc(login)} — ${esc(err.code === 'auth/email-already-in-use' ? 'đã tồn tại' : err.message)}</div>`; }
        log.scrollTop = log.scrollHeight;
      }
      toast(`Xong: ${ok} thành công, ${fail} lỗi.`, fail ? 'error' : 'success', 5000);
      m.querySelector('[data-m=ok]').style.display = 'none'; m.querySelector('.modal-f [data-m=cancel]').textContent = 'Đóng';
      return undefined; // giữ hộp thoại mở để xem kết quả
    },
  }).then((v) => (v === null ? true : v)); // đóng hộp thoại → làm mới danh sách
}

export async function renderUsers(root) {
  root.innerHTML = tabsHtml('users') + loading();
  let users = [], classes = [];
  let text = '', cls = '*', status = '';
  const load = async () => { [users, classes] = await Promise.all([getAll('users'), getClasses()]); draw(); };
  const stu = () => users.filter((u) => u.role !== 'admin');
  const inC = (u, c) => (c === '' ? !userClasses(u).length : userClasses(u).includes(c));

  function table() {
    const list = stu().filter((u) => (cls === '*' || inC(u, cls)) && (!status || u.status === status) && (u.displayName + ' ' + displayLogin(u)).toLowerCase().includes(text)).sort(byDisplay);
    return list.length ? `<div class="card"><div class="tablewrap"><table><thead><tr><th>Học viên</th><th>Lớp</th><th>Trạng thái</th><th>Truy cập</th></tr></thead><tbody>${list.map((u) => `<tr class="click" data-u="${u.id}"><td><div class="cell-u">${avatar(u.displayName, 34)}<div><b>${esc(u.displayName)}</b><div class="muted s">${esc(displayLogin(u))}</div></div></div></td><td>${classChips(u) || '<span class="muted">—</span>'}</td><td>${statusTag(u.status)}</td><td>${dot(isOnline(u.lastSeen, 150000))}<span class="s muted">${isOnline(u.lastSeen, 150000) ? 'Trực tuyến' : u.lastSeen ? fmtDate(u.lastSeen) : 'Chưa vào'}</span></td></tr>`).join('')}</tbody></table></div></div>` : `<div class="card pad">${empty('users', 'Không có học viên phù hợp')}</div>`;
  }
  function draw() {
    const pending = stu().filter((u) => u.status === 'pending');
    const cnt = (c) => stu().filter((u) => inC(u, c)).length;
    root.innerHTML = `${tabsHtml('users')}<div class="page-h"><div><h1 class="ptitle">Lớp &amp; học viên</h1><p class="muted">${classes.length} lớp · ${stu().length} học viên</p></div>
      <div class="row"><button class="btn primary" id="add">${ic('plus', 16)} Thêm học viên</button><button class="btn" id="bulk">${ic('upload', 16)} Hàng loạt</button><button class="btn" id="newClass">${ic('book', 16)} Tạo lớp</button><button class="btn icon" id="ref" title="Làm mới">${ic('refresh', 16)}</button></div></div>
      ${pending.length ? `<div class="note warn">${ic('clock', 16)}<span><b>${pending.length}</b> tài khoản đang chờ duyệt.</span><button class="btn sm primary" id="apprAll">Duyệt tất cả</button></div>` : ''}
      <div class="pills"><button class="${cls === '*' ? 'on' : ''}" data-c="*">Tất cả <small>${stu().length}</small></button>${classes.map((c) => `<button class="${cls === c.name ? 'on' : ''}" data-c="${esc(c.name)}" style="--h:${hueOf(c.name)}">${esc(c.name)} <small>${cnt(c.name)}</small></button>`).join('')}${cnt('') ? `<button class="${cls === '' ? 'on' : ''}" data-c="">Chưa xếp lớp <small>${cnt('')}</small></button>` : ''}</div>
      ${(() => { const c = cls !== '*' && cls !== '' ? classes.find((x) => x.name === cls) : null; return c ? `<div class="class-bar"><b>Lớp ${esc(c.name)} · ${cnt(c.name)} học viên</b><a class="btn sm" href="#/admin/class/${c.id}">${ic('book', 15)} Mở lớp: học viên, đề đã giao, kết quả</a></div>` : ''; })()}
      <div class="toolbar"><div class="search grow">${ic('search', 16)}<input class="input" id="t" placeholder="Tìm theo tên, tên đăng nhập, email…" value="${esc(text)}"></div>
        <select class="input w-auto" id="st"><option value="">Mọi trạng thái</option>${Object.entries(STATUS).map(([k, [t]]) => `<option value="${k}" ${status === k ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div id="tbl">${table()}</div>`;
  }
  root.onclick = async (e) => {
    const r = e.target.closest('[data-u]'); if (r) return go('/admin/user/' + r.dataset.u);
    const c = e.target.closest('[data-c]'); if (c) { cls = c.dataset.c; draw(); return; }
    try {
      if (e.target.closest('#add')) { if (await addAccountModal(classes, cls !== '*' && cls !== '' ? [cls] : [])) load(); }
      else if (e.target.closest('#bulk')) { await bulkModal(classes, cls !== '*' && cls !== '' ? [cls] : []); load(); }
      else if (e.target.closest('#ref')) { root.querySelector('#tbl').innerHTML = loading(); load(); }
      else if (e.target.closest('#apprAll')) { for (const u of users.filter((u) => u.status === 'pending')) await F.updateDoc(F.doc(db, 'users', u.id), { status: 'active' }); toast('Đã duyệt tất cả.', 'success'); load(); }
      else if (e.target.closest('#newClass')) { if (await createClassPrompt(classes)) load(); }
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
  form.addEventListener('click', (e) => { const bt = e.target.closest('[data-cp] [data-c]'); if (bt) bt.classList.toggle('on'); });

  function drawHead() {
    if (!u) { head.innerHTML = `<div class="card pad">${empty('alert', 'Không tìm thấy học viên')}</div>`; return; }
    const on = isOnline(u.lastSeen, 150000), cur = attempts.find((a) => a.status === 'in_progress' && (!a.deadline || a.deadline > Date.now()));
    head.innerHTML = `<div class="card pad ud-head"><div class="ud-t">${avatar(u.displayName, 60)}<div class="grow"><h1>${esc(u.displayName)}</h1><div class="muted">${esc(displayLogin(u))}</div>
      <div class="chips-inline" style="margin-top:6px">${classChips(u)}${statusTag(u.status)}<span class="tag">${dot(on)}${on ? 'Trực tuyến' : u.lastSeen ? 'Ngoại tuyến · ' + fmtDate(u.lastSeen) : 'Chưa từng vào'}</span></div></div></div>
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
      <div class="field"><span>Các lớp (chọn nhiều được)</span>${classPickHtml(classes, userClasses(u))}</div>
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
        const ncs = readClassPick(form);
        await F.updateDoc(ref, { displayName: form.querySelector('#f-n').value.trim() || u.displayName, classes: ncs, className: ncs[0] || '', status: form.querySelector('#f-s').value, role: form.querySelector('#f-r').value });
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
