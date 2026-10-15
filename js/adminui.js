// Thành phần dùng chung cho các trang quản trị.
import { esc, fmtClock, fmtTime } from './lib.js';
import { ic } from './icons.js';

export function tabsHtml(active) {
  const t = [['/admin', 'Đề thi', 'explorer', 'file'], ['/admin/classes', 'Lớp học', 'classes', 'book'], ['/admin/users', 'Học viên', 'users', 'users'],
    ['/admin/live', 'Đang làm bài', 'live', 'activity'], ['/admin/settings', 'Cài đặt', 'settings', 'settings'], ['/admin/backup', 'Sao lưu', 'backup', 'db']];
  return `<nav class="tabs">${t.map(([h, n, k, i]) => `<a href="#${h}" class="${k === active ? 'on' : ''}">${ic(i, 16)}<span>${n}</span></a>`).join('')}</nav>`;
}
export const answeredCount = (a) => Object.keys(a.answers || {}).length;
export const isOnline = (ms, within = 60000) => Date.now() - (ms || 0) < within;
export const dot = (on) => `<span class="dot ${on ? 'on' : ''}"></span>`;

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
