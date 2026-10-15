// ============================================================
// lib.js — các hàm THUẦN (không đụng tới trình duyệt/Firebase), đã có test.
// ============================================================
export const KEYS = ['A', 'B', 'C', 'D'];
export const MODES = { practice: 'Luyện tập', step: 'Thi từng câu', scroll: 'Thi trải dài' };
export const HEADERS = ['STT', 'Mã câu', 'Câu hỏi', 'A', 'B', 'C', 'D', 'Đáp án', 'Giải thích'];
export const USERNAME_DOMAIN = 'quiz.local';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const byName = (a, b) => String(a.name || a.title || '').localeCompare(String(b.name || b.title || ''), 'vi', { numeric: true });

export function removeDiacritics(s) {
  return String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
/** Tên đăng nhập hoặc email → email dùng cho Firebase. Trả '' nếu không hợp lệ. */
export function toLoginEmail(input) {
  const s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  if (s.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
  const u = removeDiacritics(s).replace(/\s+/g, '').replace(/[^a-z0-9._-]/g, '');
  return u ? `${u}@${USERNAME_DOMAIN}` : '';
}
export const isUsernameEmail = (e) => String(e || '').endsWith('@' + USERNAME_DOMAIN);
export const displayLogin = (u) => (isUsernameEmail(u.email) ? String(u.email).split('@')[0] : u.email || u.username || '');
export const sanitizeId = (s) => String(s ?? '').trim().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40);

/** Màu (hue) ổn định theo tên lớp để mỗi lớp có một màu riêng. */
export function hueOf(name) {
  let h = 0;
  for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function shuffle(arr, rnd = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function normalizeAnswer(v) {
  const s = String(v ?? '').trim().toUpperCase();
  if (!s) return '';
  let m = s.match(/^[(\[]?([A-D])[)\].]?$/);
  if (m) return m[1];
  if (/^[1-4]$/.test(s)) return KEYS[+s - 1];
  m = s.match(/^(?:ĐÁP ÁN|DAP AN|ANSWER)\s*[:：]?\s*([A-D])\b/);
  return m ? m[1] : '';
}

// ---------- Nhập câu hỏi ----------
const ALIAS = {
  id: ['mã câu', 'ma cau', 'mã', 'ma', 'id', 'code'],
  q: ['câu hỏi', 'cau hoi', 'question', 'q', 'nội dung', 'noi dung'],
  A: ['a'], B: ['b'], C: ['c'], D: ['d'],
  ans: ['đáp án', 'dap an', 'answer', 'ans', 'đ/a', 'đáp án đúng'],
  exp: ['giải thích', 'giai thich', 'lời giải', 'loi giai', 'explanation', 'exp'],
};
function pick(row, names) {
  for (const k of Object.keys(row)) if (names.includes(String(k).trim().toLowerCase())) return row[k];
  return '';
}

/** Kiểm tra + gán id duy nhất. Trả {questions, errors}. */
export function finalize(items) {
  const questions = [], errors = [], used = new Set();
  items.forEach((it, i) => {
    const label = it._row ? `Dòng ${it._row}` : `Câu thứ ${i + 1}`;
    const q = String(it.q ?? '').trim();
    const o = {};
    KEYS.forEach((k) => (o[k] = String(it[k] ?? '').trim()));
    const filled = KEYS.filter((k) => o[k]);
    if (!q && !filled.length) return; // dòng trống
    const ans = normalizeAnswer(it.ans);
    if (!q) return errors.push(`${label}: thiếu nội dung câu hỏi`);
    if (filled.length < 2) return errors.push(`${label}: cần ít nhất 2 đáp án`);
    if (!ans) return errors.push(`${label}: thiếu hoặc sai đáp án đúng`);
    if (!o[ans]) return errors.push(`${label}: đáp án ${ans} đang để trống`);
    let id = sanitizeId(it.id) || 'q' + (questions.length + 1);
    const base = id; let n = 2;
    while (used.has(id)) id = `${base}_${n++}`;
    used.add(id);
    questions.push({ id, q, ...o, ans, exp: String(it.exp ?? '').trim() });
  });
  return { questions, errors };
}

export function rowsToQuestions(rows) {
  return finalize(rows.map((r, i) => ({
    _row: i + 2,
    id: pick(r, ALIAS.id), q: pick(r, ALIAS.q),
    A: pick(r, ALIAS.A), B: pick(r, ALIAS.B), C: pick(r, ALIAS.C), D: pick(r, ALIAS.D),
    ans: pick(r, ALIAS.ans), exp: pick(r, ALIAS.exp),
  })));
}

/** Phân tích văn bản dán từ Word: "Câu 1: … / A. … / Đáp án: B / Giải thích: …" */
export function parseQuestionText(text) {
  const out = []; let cur = null, field = null;
  const reQ = /^\s*(?:câu|cau|question)\s*\d+\s*[:.)\-]?\s*(.*)$/i;
  const reNum = /^\s*\d+\s*[.)]\s+(.*)$/;
  const reOpt = /^\s*(\*?)\s*([A-Da-d])\s*[.)]\s*(.*)$/;
  const reAns = /^\s*(?:đáp án|dap an|đ\/a|answer)(?:\s*đúng)?\s*[:：]?\s*(.*)$/i;
  const reExp = /^\s*(?:giải thích|giai thich|lời giải|loi giai|explanation)\s*[:：]?\s*(.*)$/i;
  const start = (t) => { cur = { q: t, A: '', B: '', C: '', D: '', ans: '', exp: '' }; out.push(cur); field = 'q'; };
  for (const raw of String(text || '').replace(/\r/g, '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    let m;
    if (cur && (m = line.match(reExp))) { cur.exp = m[1]; field = 'exp'; continue; }
    if (cur && (m = line.match(reAns))) { cur.ans = normalizeAnswer(m[1]); field = 'ans'; continue; }
    if (cur && (m = line.match(reOpt))) {
      const k = m[2].toUpperCase(); cur[k] = m[3]; field = k;
      if (m[1] === '*') cur.ans = k;
      continue;
    }
    if ((m = line.match(reQ))) { start(m[1]); continue; }
    if ((m = line.match(reNum))) { start(m[1]); continue; }
    if (!cur || field === 'ans') { start(line); continue; } // dòng thường sau đáp án = câu mới không có tiền tố
    cur[field] = (cur[field] ? cur[field] + '\n' : '') + line; // dòng nối tiếp
  }
  return finalize(out);
}

export function sampleQuestions() {
  return [
    { id: 'q1', q: 'Thủ đô của Việt Nam là gì?', A: 'Hà Nội', B: 'Huế', C: 'Đà Nẵng', D: 'TP. Hồ Chí Minh', ans: 'A', exp: 'Hà Nội là thủ đô của Việt Nam.' },
    { id: 'q2', q: 'Giải phương trình $x^2 - 5x + 6 = 0$. Tổng hai nghiệm là:', A: '5', B: '6', C: '-5', D: '1', ans: 'A', exp: 'Theo Vi-ét: $x_1 + x_2 = 5$.' },
    { id: 'q3', q: 'Nước sôi ở bao nhiêu độ C (áp suất thường)?', A: '90', B: '100', C: '110', D: '', ans: 'B', exp: '' },
  ];
}
export function questionsToRows(qs) {
  return qs.map((q, i) => ({ 'STT': i + 1, 'Mã câu': q.id, 'Câu hỏi': q.q, A: q.A, B: q.B, C: q.C, D: q.D, 'Đáp án': q.ans, 'Giải thích': q.exp || '' }));
}
export function questionsToWordHtml(title, qs) {
  const p = (s) => esc(s).replace(/\n/g, '<br>');
  const body = qs.map((q, i) =>
    `<p><b>Câu ${i + 1}:</b> ${p(q.q)}</p>` +
    KEYS.filter((k) => q[k]).map((k) => `<p>${k}. ${p(q[k])}</p>`).join('') +
    `<p><b>Đáp án:</b> ${q.ans}</p>` + (q.exp ? `<p><b>Giải thích:</b> ${p(q.exp)}</p>` : '') + '<p>&nbsp;</p>').join('');
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)}</title></head><body style="font-family:Arial;font-size:12pt"><h2>${esc(title)}</h2>${body}</body></html>`;
}
/** Gộp câu mới vào danh sách cũ, tránh trùng id. */
export function mergeQuestions(base, incoming) {
  const used = new Set(base.map((q) => q.id));
  const add = incoming.map((q) => {
    let id = q.id; const b = id; let n = 2;
    while (used.has(id)) id = `${b}_${n++}`;
    used.add(id);
    return { ...q, id };
  });
  return [...base, ...add];
}
export function newQuestionId(qs) {
  const used = new Set(qs.map((q) => q.id)); let n = qs.length + 1;
  while (used.has('q' + n)) n++;
  return 'q' + n;
}

// ---------- Làm bài ----------
export function buildPlan(questions, shuffleQ, shuffleA, rnd = Math.random) {
  const ids = questions.map((q) => q.id);
  const qOrder = shuffleQ ? shuffle(ids, rnd) : ids;
  const oOrder = {};
  for (const q of questions) {
    const ks = KEYS.filter((k) => String(q[k] || '').trim() !== '');
    oOrder[q.id] = shuffleA ? shuffle(ks, rnd) : ks;
  }
  return { qOrder, oOrder };
}
export function grade(questions, answers) {
  let correct = 0, wrong = 0, blank = 0; const wrongIds = [];
  for (const q of questions) {
    const a = (answers || {})[q.id];
    if (!a) blank++; else if (a === q.ans) correct++; else { wrong++; wrongIds.push(q.id); }
  }
  const total = questions.length;
  return { correct, wrong, blank, total, wrongIds, score: total ? Math.round((correct / total) * 1000) / 100 : 0 };
}

// ---------- Quyền & lịch ----------
const norm = (s) => String(s || '').trim().toLowerCase();
export function canSee(q, profile, uid) {
  if (q.hidden) return false;
  if (profile?.role === 'admin') return true;
  const us = q.allowedUsers || [], cs = (q.allowedClasses || []).map(norm);
  if (!us.length && !cs.length) return true;
  return us.includes(uid) || (!!profile?.className && cs.includes(norm(profile.className)));
}
export function quizAccess(q, now, used) {
  if (q.openAt && now < q.openAt) return { ok: false, reason: 'Đề chưa mở — mở lúc ' + fmtDate(q.openAt) };
  if (q.closeAt && now > q.closeAt) return { ok: false, reason: 'Đề đã đóng lúc ' + fmtDate(q.closeAt) };
  if (q.maxAttempts > 0 && used >= q.maxAttempts) return { ok: false, reason: 'Bạn đã dùng hết số lần làm' };
  return { ok: true };
}

// ---------- Định dạng ----------
const p2 = (n) => String(n).padStart(2, '0');
export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${p2(m)}:${p2(s)}` : `${p2(m)}:${p2(s)}`;
}
export function fmtDate(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export function fmtClock(ms) {
  if (!ms) return '—';
  const d = new Date(ms);
  return `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}
export function toLocalInput(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
export const fromLocalInput = (s) => (s ? new Date(s).getTime() : null);
export const fmtScore = (n) => (Math.round((n || 0) * 100) / 100).toString();

// ---------- Thống kê ----------
export function quizStats(attempts, questions = []) {
  const subs = attempts.filter((a) => a.status === 'submitted');
  const n = subs.length, dist = Array(10).fill(0);
  let sum = 0, pass = 0;
  subs.forEach((a) => {
    const sc = a.score || 0; sum += sc;
    dist[Math.min(9, Math.floor(sc))]++;
    if (sc >= (a.passScore ?? 5)) pass++;
  });
  const best = new Map();
  subs.forEach((a) => {
    const b = best.get(a.uid);
    if (!b || a.score > b.score || (a.score === b.score && (a.durationSec || 0) < (b.durationSec || 0))) best.set(a.uid, a);
  });
  const ranking = [...best.values()].sort((x, y) => y.score - x.score || (x.durationSec || 0) - (y.durationSec || 0));
  const cnt = {};
  subs.forEach((a) => (a.wrongIds || []).forEach((id) => (cnt[id] = (cnt[id] || 0) + 1)));
  const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
  const wrongTop = Object.entries(cnt)
    .map(([id, c]) => ({ id, count: c, q: byId[id]?.q || '(câu đã bị xóa)', rate: n ? c / n : 0 }))
    .sort((a, b) => b.count - a.count).slice(0, 10);
  return { n, avg: n ? sum / n : 0, passRate: n ? pass / n : 0, dist, ranking, wrongTop };
}
export function attemptsToRows(list) {
  return list.map((a) => ({
    'Học viên': a.userName || '', 'Lớp': a.className || '', 'Đề': a.quizTitle || '', 'Dạng': MODES[a.mode] || a.mode || '',
    'Bắt đầu': fmtDate(a.startedAt), 'Nộp lúc': fmtDate(a.submittedAt),
    'Thời gian': a.durationSec != null ? fmtTime(a.durationSec) : '',
    'Đúng': a.correct ?? '', 'Sai': a.wrong ?? '', 'Chưa làm': a.blank ?? '', 'Tổng câu': a.total ?? '',
    'Điểm (/10)': a.score ?? '', 'Trạng thái': a.status === 'submitted' ? 'Đã nộp' : 'Đang làm',
  }));
}
