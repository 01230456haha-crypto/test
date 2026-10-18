// Trang "Kết quả": bài đang làm, thống kê theo đề, danh sách bài nộp (một chỗ duy nhất).
import { db, F } from './fb.js';
import { esc, quizStats, attemptsToRows, fmtDate, fmtTime, fmtScore, byName } from './lib.js';
import { getAll, getQuizzes, getContent, deleteAttempts } from './data.js';
import { ic } from './icons.js';
import { toast, confirmBox, loading, empty, classChip, exportXlsx, safeName, debounce } from './ui.js';
import { liveTable } from './adminui.js';

export async function renderResults(root, p, q) {
  root.innerHTML = loading();
  const [quizzes, attempts] = await Promise.all([getQuizzes(), getAll('attempts')]);
  const subsAll = attempts.filter((a) => a.status === 'submitted' && !a.retry); // bài ôn câu sai không tính
  const classNames = [...new Set(subsAll.map((a) => a.className).filter(Boolean))].sort();
  let quizId = q.quiz || '', cls = '', text = '', content = [], live = [];

  const filtered = () => subsAll
    .filter((a) => (!quizId || a.quizId === quizId) && (!cls || a.className === cls) && (a.userName + ' ' + (a.className || '')).toLowerCase().includes(text))
    .sort((a, b) => b.submittedAt - a.submittedAt);
  const loadContent = async () => { content = quizId ? await getContent(quizId).catch(() => []) : []; };

  root.innerHTML = `<div class="page-h"><div><h1 class="ptitle">Kết quả</h1><p class="muted">Điểm của học viên và các bài đang làm</p></div><button class="btn" id="exp">${ic('download', 16)} Xuất Excel</button></div>
    <div id="liveBox"></div>
    <div class="toolbar">
      <select class="input w-auto" id="qs"><option value="">Tất cả đề</option>${[...quizzes].sort(byName).map((x) => `<option value="${x.id}" ${x.id === quizId ? 'selected' : ''}>${esc(x.title)}</option>`).join('')}</select>
      <select class="input w-auto" id="cs"><option value="">Tất cả lớp</option>${classNames.map((c) => `<option>${esc(c)}</option>`).join('')}</select>
      <div class="search grow">${ic('search', 16)}<input class="input" id="t" placeholder="Tìm theo tên học viên…"></div></div>
    <div id="body"></div>`;
  const body = root.querySelector('#body'), liveBox = root.querySelector('#liveBox');

  function drawLive() {
    const list = live.filter((a) => !quizId || a.quizId === quizId);
    liveBox.innerHTML = list.length ? `<div class="card" style="margin-bottom:14px"><div class="pad-s" style="padding:14px 16px 0"><b>${ic('activity', 16)} Đang làm bài (${list.length})</b> <span class="muted s">chấm xanh = đang mở trang</span></div>${liveTable(list)}</div>` : '';
  }
  function drawBody() {
    const subs = filtered(), s = quizStats(subs, content);
    const max = Math.max(1, ...s.dist);
    body.innerHTML = `<div class="kpis sm"><div class="kpi"><b>${s.n}</b><span>Lượt nộp</span></div><div class="kpi"><b>${s.n ? fmtScore(s.avg) : '—'}</b><span>Điểm trung bình</span></div><div class="kpi ok"><b>${s.n ? Math.round(s.passRate * 100) + '%' : '—'}</b><span>Tỷ lệ đạt</span></div></div>
      ${quizId && s.n ? `<div class="two-col"><div class="card pad"><h3>Phân bố điểm</h3><div class="hist">${s.dist.map((v, i) => `<div class="hb"><span class="hv">${v || ''}</span><i style="height:${(v / max) * 100}%"></i><em>${i}-${i + 1}</em></div>`).join('')}</div></div>
        <div class="card pad"><h3>${ic('trophy', 18)} Xếp hạng</h3><ol class="rank">${s.ranking.slice(0, 8).map((a, i) => `<li><span class="rk r${i + 1}">${i + 1}</span><div><b>${esc(a.userName)}</b> ${classChip(a.className)}</div><span class="score big ${a.score >= (a.passScore ?? 5) ? 'good' : 'bad'}">${fmtScore(a.score)}</span></li>`).join('')}</ol></div></div>
        <div class="card pad" style="margin-top:14px"><h3>${ic('alert', 18)} Câu sai nhiều nhất</h3>${s.wrongTop.length ? `<div class="tablewrap"><table><thead><tr><th>Câu hỏi</th><th>Lượt sai</th><th>Tỷ lệ</th></tr></thead><tbody>${s.wrongTop.map((w) => `<tr><td class="clamp">${esc(w.q)}</td><td>${w.count}</td><td>${Math.round(w.rate * 100)}%</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Chưa có câu nào bị sai.</p>'}</div>` : ''}
      ${subs.length ? `<div class="card" style="margin-top:14px"><div class="tablewrap"><table><thead><tr><th>Học viên</th>${quizId ? '' : '<th>Đề</th>'}<th>Điểm</th><th>Đúng</th><th>Thời gian</th><th>Nộp lúc</th><th></th></tr></thead><tbody>${subs.slice(0, 200).map((a) => `<tr><td><a href="#/admin/user/${a.uid}"><b>${esc(a.userName)}</b></a> ${classChip(a.className)}</td>${quizId ? '' : `<td>${esc(a.quizTitle)}</td>`}<td><b class="score ${a.score >= (a.passScore ?? 5) ? 'good' : 'bad'}">${fmtScore(a.score)}</b></td><td>${a.correct}/${a.total}</td><td>${fmtTime(a.durationSec)}</td><td>${fmtDate(a.submittedAt)}</td><td class="nowrap"><a class="btn sm" href="#/result/${a.id}">Xem bài</a> <button class="btn icon ghost sm" data-del="${a.id}" title="Xóa (cho thi lại)">${ic('trash', 15)}</button></td></tr>`).join('')}</tbody></table></div></div>${subs.length > 200 ? `<p class="muted s" style="margin-top:8px">Hiện 200 bài mới nhất. Dùng bộ lọc để thu hẹp, hoặc xuất Excel để xem đủ.</p>` : ''}`
        : `<div class="card pad">${empty('chart', 'Chưa có bài nộp nào', 'Khi học viên nộp bài, kết quả sẽ hiện ở đây.')}</div>`}`;
  }

  const unsub = F.onSnapshot(F.query(F.collection(db, 'attempts'), F.where('status', '==', 'in_progress')), (s) => { live = s.docs.map((d) => ({ id: d.id, ...d.data() })); drawLive(); });
  const tick = setInterval(drawLive, 1000);
  root.querySelector('#qs').onchange = async (e) => { quizId = e.target.value; await loadContent(); drawBody(); drawLive(); };
  root.querySelector('#cs').onchange = (e) => { cls = e.target.value; drawBody(); };
  root.querySelector('#t').oninput = debounce((e) => { text = e.target.value.toLowerCase(); drawBody(); }, 150);
  root.onclick = async (e) => {
    const d = e.target.closest('[data-del]');
    if (d) {
      if (!(await confirmBox('Xóa bài này? Học viên sẽ được làm lại.', 'Xóa', true))) return;
      await deleteAttempts([{ id: d.dataset.del }]);
      const i = subsAll.findIndex((a) => a.id === d.dataset.del); if (i >= 0) subsAll.splice(i, 1);
      drawBody(); toast('Đã xóa.', 'success');
    } else if (e.target.closest('#exp')) {
      const list = filtered(); if (!list.length) return toast('Chưa có dữ liệu để xuất.', 'error');
      exportXlsx([{ name: 'Kết quả', rows: attemptsToRows(list) }], 'ket-qua' + (quizId ? '-' + safeName(quizzes.find((x) => x.id === quizId)?.title) : '') + '.xlsx');
    }
  };
  await loadContent(); drawBody(); drawLive();
  return () => { unsub(); clearInterval(tick); root.onclick = null; };
}
