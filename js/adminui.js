// Thành phần dùng chung cho các trang quản trị (bộ chọn "giao cho ai", bảng đang làm bài…).
import { db, F } from './fb.js';
import { esc, fmtClock, fmtTime, hueOf, displayLogin, audienceOf } from './lib.js';
import { ic } from './icons.js';
import { getClasses, getAll } from './data.js';
import { modal, avatar, classChip } from './ui.js';

/** Thanh sao lưu/cài đặt dùng chung (các mục khác đã có thanh bên). */
export function tabsHtml(active) {
  if (active !== 'settings' && active !== 'backup') return '';
  const t = [['/admin/settings', 'Đăng nhập & đăng ký', 'settings', 'settings'], ['/admin/backup', 'Sao lưu & khôi phục', 'backup', 'db']];
  return `<nav class="tabs">${t.map(([h, n, k, i]) => `<a href="#${h}" class="${k === active ? 'on' : ''}">${ic(i, 16)}<span>${n}</span></a>`).join('')}</nav>`;
}
export const answeredCount = (a) => Object.keys(a.answers || {}).length;
export const isOnline = (ms, within = 60000) => Date.now() - (ms || 0) < within;
export const dot = (on) => `<span class="dot ${on ? 'on' : ''}"></span>`;

/** Nhãn "đề này đang giao cho ai". */
export function audienceChips(q) {
  const a = audienceOf(q);
  if (a === 'none') return '<span class="tag warn">Chưa giao</span>';
  if (a === 'all') return `<span class="tag ok">Tất cả mọi người</span>${q.guest ? '<span class="tag">Cho khách</span>' : ''}`;
  if (a === 'classes') return (q.allowedClasses || []).map(classChip).join('') || '<span class="tag warn">Chưa chọn lớp</span>';
  return `<span class="tag">${(q.allowedUsers || []).length} học viên</span>`;
}

/** Bảng các bài đang làm (thời gian thực). */
export function liveTable(list, { showQuiz = true } = {}) {
  const now = Date.now();
  if (!list.length) return `<div class="empty">${ic('activity', 34)}<b>Hiện không có ai đang làm bài</b></div>`;
  const rows = [...list].sort((x, y) => y.startedAt - x.startedAt).map((a) => {
    const on = isOnline(a.lastSeen);
    const rem = a.deadline ? a.deadline - now : null;
    return `<tr><td><a href="#/admin/user/${a.uid}"><b>${esc(a.userName)}</b></a><div class="muted s">${esc(a.className || '')}</div></td>
      ${showQuiz ? `<td>${esc(a.quizTitle)}</td>` : ''}<td>${fmtClock(a.startedAt)}</td><td>${fmtTime((now - a.startedAt) / 1000)}</td>
      <td>${rem === null ? 'Không giới hạn' : rem <= 0 ? '<span class="tag warn">Hết giờ</span>' : fmtTime(rem / 1000)}</td>
      <td><div class="mini-bar"><i style="width:${(answeredCount(a) / (a.total || 1)) * 100}%"></i></div><span class="s">${answeredCount(a)}/${a.total}</span></td>
      <td>${dot(on)}${on ? 'Trực tuyến' : 'Ngoại tuyến'}</td></tr>`;
  }).join('');
  return `<div class="tablewrap"><table><thead><tr><th>Học viên</th>${showQuiz ? '<th>Đề</th>' : ''}<th>Bắt đầu</th><th>Đã làm</th><th>Còn lại</th><th>Tiến độ</th><th>Trạng thái</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/** Bộ chọn "Giao cho ai": Chưa giao / Tất cả / Theo lớp / Theo học viên. Trả về {get, check}. */
export function mountAssignPicker(el, { classes, students, value = {}, withGuest = true }) {
  const st = { aud: value.audience || 'none', cls: new Set(value.allowedClasses || []), usr: new Set(value.allowedUsers || []), guest: !!value.guest, flt: '' };
  const opts = [['none', 'Chưa giao', 'Nháp, học viên chưa thấy đề', 'lock'], ['all', 'Tất cả mọi người', 'Mọi học viên đều thấy', 'users'], ['classes', 'Theo lớp', 'Chỉ các lớp bạn chọn thấy', 'book'], ['students', 'Theo học viên', 'Chỉ những người bạn chọn thấy', 'user']];
  const countIn = (n) => students.filter((u) => u.className === n).length;

  function body() {
    if (st.aud === 'none') return `<div class="note warn">${ic('lock', 16)}<span>Đề đang ở dạng <b>nháp</b>. Học viên <b>chưa thấy</b> đề này cho đến khi bạn chọn giao cho lớp, học viên hoặc mọi người.</span></div>`;
    if (st.aud === 'all') return `<div class="note info">${ic('users', 16)}<span>Mọi học viên đã đăng nhập đều thấy và làm được đề này.</span></div>
      ${withGuest ? `<label class="sw-row"><div><b>Cho cả khách (không cần tài khoản)</b><span class="muted">Cần bật chế độ khách ở mục Cài đặt.</span></div><span class="switch"><input type="checkbox" data-guest ${st.guest ? 'checked' : ''}><i></i></span></label>` : ''}`;
    if (st.aud === 'classes') {
      return classes.length ? `<div class="chips-pick">${classes.map((c) => `<button type="button" class="pick ${st.cls.has(c.name) ? 'on' : ''}" style="--h:${hueOf(c.name)}" data-c="${esc(c.name)}">${st.cls.has(c.name) ? ic('check', 14) : ''}${esc(c.name)}<small>${countIn(c.name)}</small></button>`).join('')}</div>
        <div class="row"><button type="button" class="btn sm" data-allc>Chọn tất cả lớp</button><button type="button" class="btn sm ghost" data-noc>Bỏ chọn</button></div>`
        : `<div class="note warn">${ic('alert', 16)}<span>Bạn chưa tạo lớp nào. Hãy vào mục <a href="#/admin/classes">Lớp học</a> để tạo lớp trước.</span></div>`;
    }
    const f = st.flt.toLowerCase();
    const list = students.filter((u) => (u.displayName + ' ' + (u.className || '') + ' ' + displayLogin(u)).toLowerCase().includes(f));
    return `<div class="search">${ic('search', 16)}<input class="input" data-flt placeholder="Tìm theo tên, lớp, tên đăng nhập…" value="${esc(st.flt)}"></div>
      <div class="pick-list">${list.length ? list.map((u) => `<label class="pick-row"><input type="checkbox" data-u="${u.id}" ${st.usr.has(u.id) ? 'checked' : ''}>${avatar(u.displayName, 28)}<span><b>${esc(u.displayName)}</b><small class="muted"> ${esc(displayLogin(u))}</small></span>${classChip(u.className)}</label>`).join('') : '<p class="muted pad-s">Không có học viên phù hợp.</p>'}</div>
      <p class="muted s">Đã chọn <b>${st.usr.size}</b> học viên.</p>`;
  }
  const drawBody = () => { el.querySelector('.aud-body').innerHTML = body(); };
  el.innerHTML = `<div class="aud-cards">${opts.map(([k, t, d, i]) => `<label class="aud-card"><input type="radio" name="aud" value="${k}" ${st.aud === k ? 'checked' : ''}><div>${ic(i, 22)}<b>${t}</b><span>${d}</span></div></label>`).join('')}</div><div class="aud-body">${body()}</div>`;

  el.addEventListener('change', (e) => {
    const t = e.target;
    if (t.name === 'aud') { st.aud = t.value; drawBody(); }
    else if (t.dataset.u) { t.checked ? st.usr.add(t.dataset.u) : st.usr.delete(t.dataset.u); el.querySelector('.aud-body p.s b').textContent = st.usr.size; }
    else if (t.hasAttribute('data-guest')) st.guest = t.checked;
  });
  el.addEventListener('click', (e) => {
    const c = e.target.closest('[data-c]');
    if (c) { st.cls.has(c.dataset.c) ? st.cls.delete(c.dataset.c) : st.cls.add(c.dataset.c); drawBody(); }
    else if (e.target.closest('[data-allc]')) { classes.forEach((x) => st.cls.add(x.name)); drawBody(); }
    else if (e.target.closest('[data-noc]')) { st.cls.clear(); drawBody(); }
  });
  let tm; el.addEventListener('input', (e) => {
    if (!e.target.hasAttribute('data-flt')) return;
    clearTimeout(tm); tm = setTimeout(() => { st.flt = e.target.value; drawBody(); const i = el.querySelector('[data-flt]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 150);
  });
  return {
    get: () => ({ audience: st.aud, allowedClasses: [...st.cls], allowedUsers: [...st.usr], guest: st.guest }),
    check: (v) => (v.audience === 'classes' && !v.allowedClasses.length ? 'Hãy chọn ít nhất một lớp.' : v.audience === 'students' && !v.allowedUsers.length ? 'Hãy chọn ít nhất một học viên.' : ''),
  };
}

/** Hộp thoại giao bài (dùng khi giao nhiều đề một lúc). */
export async function assignModal({ title = 'Giao bài', value = {} } = {}) {
  const [classes, users] = await Promise.all([getClasses(), getAll('users')]);
  const students = users.filter((u) => u.role === 'user' && u.status !== 'blocked').sort((a, b) => String(a.displayName).localeCompare(String(b.displayName), 'vi'));
  let picker;
  return modal({
    title, wide: true, okText: 'Giao bài', html: '<div id="ap"></div>',
    onOpen: (box) => { picker = mountAssignPicker(box.querySelector('#ap'), { classes, students, value }); },
    onOk: () => { const v = picker.get(); const err = picker.check(v); if (err) throw new Error(err); return v; },
  });
}
/** Ghi việc giao bài vào các đề. */
export async function applyAssign(ids, v, extra = {}) {
  for (const id of ids) {
    await F.updateDoc(F.doc(db, 'quizzes', id), {
      audience: v.audience, allowedClasses: v.audience === 'classes' ? v.allowedClasses : [], allowedUsers: v.audience === 'students' ? v.allowedUsers : [],
      guest: v.audience === 'all' ? !!v.guest : false, updatedAt: Date.now(), ...extra,
    });
  }
}
