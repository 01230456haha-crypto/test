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


// ---------- Chuẩn hóa văn bản dán từ Word / PDF ----------
/** Bỏ ký tự ẩn, đổi khoảng trắng lạ, chuẩn hóa dấu tiếng Việt (NFC), chữ nghiêng toán học 𝑥 → x. */
export function normalizeText(s) {
  let t = String(s ?? '');
  t = t.replace(/[\u200b\u200c\u200d\u2060\ufeff\u00ad]/g, '').replace(/[\u00a0\u2007\u202f]/g, ' ').replace(/\r/g, '');
  try { t = t.normalize('NFC'); } catch (e) { /* bỏ qua */ }
  return t.replace(/[\u{1D400}-\u{1D7FF}]/gu, (ch) => ch.normalize('NFKC'));
}

/** Dòng này trông giống mã nguồn (C++, Python…)? Dùng để tự đóng khung mã khi nhập từ Word/PDF. */
export function looksLikeCode(line) {
  const t = String(line || '').trim();
  if (!t) return false;
  if (/^[{}]\s*;?$/.test(t)) return true;
  if (/^#\s*(include|define|ifdef|ifndef|endif|pragma)\b/.test(t)) return true;
  if (/^using\s+namespace\b/.test(t)) return true;
  if (/^(int|long|float|double|char|bool|string|void|auto|const|unsigned|vector|struct|class|return|cout|cin|printf|scanf|for|while|if|else|do|switch|case|break|continue)\b/.test(t) && /[;{}()=<>:]/.test(t)) return true;
  if (/;\s*$/.test(t) && /[(){}\[\]=<>+\-*\/&|]/.test(t)) return true;
  return false;
}
/** Bọc các dòng mã liên tiếp (sau dòng đầu của đề) bằng ``` để hiển thị đúng thụt lề, không bị KaTeX/định dạng làm hỏng. */
export function autoFenceCode(text) {
  const t = String(text || '');
  if (t.includes('```')) return t;
  const lines = t.split('\n'); if (lines.length < 2) return t;
  const out = [lines[0]]; let run = [];
  const flush = () => { if (run.length) { out.push('```', ...run, '```'); run = []; } };
  for (const l of lines.slice(1)) { if (looksLikeCode(l)) run.push(l); else { flush(); out.push(l); } }
  flush();
  return out.join('\n');
}

/** Văn bản → HTML an toàn: khối mã ```...``` và `mã nội dòng`; còn lại giữ xuống dòng. */
export function richText(s) {
  const raw = String(s ?? '').replace(/\t/g, '    ');
  const inline = (x) => esc(x).replace(/`([^`\n]+)`/g, '<code>$1</code>');
  const parts = raw.split('```');
  if (parts.length < 3) return inline(raw);
  let out = '';
  parts.forEach((part, i) => {
    const isCode = i % 2 === 1 && i < parts.length - 1;
    if (isCode) {
      let code = part.replace(/^[ \t]*\n/, '').replace(/\s+$/, '');
      const first = code.split('\n')[0];
      if (code.includes('\n') && /^[A-Za-z+#]{1,10}$/.test(first.trim())) code = code.slice(first.length + 1);
      out += `<pre class="code"><code>${esc(code)}</code></pre>`;
    } else {
      let t = part;
      if (i > 0) t = t.replace(/^\n/, '');
      if (i < parts.length - 1) t = t.replace(/\n$/, '');
      out += inline(t);
    }
  });
  return out;
}

// ---------- Lớp học (một học viên có thể thuộc nhiều lớp) ----------
export const userClasses = (u) => (u && Array.isArray(u.classes) && u.classes.length ? u.classes : u && u.className ? [u.className] : []);
export const attemptClasses = (a) => (a && Array.isArray(a.classes) && a.classes.length ? a.classes : a && a.className ? [a.className] : []);

// ---------- PDF: ghép các mảnh chữ thành dòng ----------
export function pdfItemsToLines(items) {
  const rows = [];
  for (const it of items || []) {
    if (!it || typeof it.str !== 'string' || !it.transform) continue;
    const x = it.transform[4], y = it.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) <= 2.5);
    if (!row) { row = { y, parts: [] }; rows.push(row); }
    row.parts.push({ x, str: it.str, w: it.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y);
  rows.forEach((r) => r.parts.sort((a, b) => a.x - b.x));
  const live = rows.filter((r) => r.parts.some((p) => p.str.trim()));
  const base = Math.min(...live.map((r) => r.parts.find((p) => p.str.trim()).x));
  return live.map((r) => {
    const first = r.parts.find((p) => p.str.trim());
    const cw = first.w && first.str.length ? first.w / first.str.length : 5; // độ rộng 1 ký tự
    let s = ' '.repeat(Math.max(0, Math.round((first.x - base) / cw)) >= 2 ? Math.round((first.x - base) / cw) : 0), end = null; // thụt lề (mã nguồn)
    for (const p of r.parts) {
      if (end !== null && p.str) { const gap = p.x - end; if (gap > 24) s += '   '; else if (gap > 1.2 && !s.endsWith(' ') && !p.str.startsWith(' ')) s += ' '; }
      s += p.str; if (p.str) end = p.x + p.w;
    }
    return s.replace(/\s+$/, '');
  }).filter((l) => l.trim() !== '');
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
    const q = autoFenceCode(normalizeText(it.q).trim());
    const o = {};
    KEYS.forEach((k) => (o[k] = normalizeText(it[k]).trim()));
    const filled = KEYS.filter((k) => o[k]);
    if (!q && !filled.length) return; // dòng trống
    const ans = normalizeAnswer(it.ans);
    if (!q) return errors.push(`${label}: thiếu nội dung câu hỏi`);
    if (filled.length < 2) return errors.push(`${label}: cần ít nhất 2 đáp án`);
    if (!ans) return errors.push(`${label}: chưa có đáp án đúng (trong Word hãy gạch chân chữ cái đáp án đúng, hoặc thêm dòng "Đáp án: A")`);
    if (!o[ans]) return errors.push(`${label}: đáp án ${ans} đang để trống`);
    let id = sanitizeId(it.id) || 'q' + (questions.length + 1);
    const base = id; let n = 2;
    while (used.has(id)) id = `${base}_${n++}`;
    used.add(id);
    questions.push({ id, q, ...o, ans, exp: normalizeText(it.exp).trim() });
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

/** Tách một dòng có nhiều đáp án ("A. xxx   B. yyy") thành từng đáp án. Dòng phải bắt đầu bằng nhãn A/B/C/D. */
function splitOptions(line) {
  const re = /(^|\s)(\*?)([A-Da-d])[.)]\s*/g; const hits = []; let m;
  while ((m = re.exec(line))) hits.push({ start: m.index + m[1].length, end: re.lastIndex, key: m[3].toUpperCase(), star: m[2] === '*' });
  if (!hits.length || hits[0].start !== line.search(/\S/)) return null;
  const chain = [hits[0]]; // chỉ giữ chuỗi liên tiếp A, B, C, D
  for (const h of hits.slice(1)) if (h.key.charCodeAt(0) === chain[chain.length - 1].key.charCodeAt(0) + 1) chain.push(h);
  return chain.map((h, i) => ({ key: h.key, star: h.star, text: line.slice(h.end, i + 1 < chain.length ? chain[i + 1].start : line.length).trim() }));
}

/** HTML từ Word (mammoth) → văn bản. Chữ cái đáp án được GẠCH CHÂN sẽ thành đáp án đúng (*A.). */
export function htmlToQuestionText(html) {
  const dec = (t) => t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  let h = String(html || '').replace(/<u>([\s\S]*?)<\/u>/gi, (m, inner) => {
    const t = inner.replace(/<[^>]+>/g, '');
    return /^\s*[A-Da-d]\s*[.)]/.test(t) ? '*' + t.replace(/^\s+/, '') : t;
  });
  const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
  const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', i: 'ᵢ', j: 'ⱼ', n: 'ₙ' };
  const script = (map, mark) => (m, inner) => { const t = inner.replace(/<[^>]+>/g, ''); return [...t].every((c) => map[c]) && t ? [...t].map((c) => map[c]).join('') : (t.length > 1 ? `${mark}(${t})` : mark + t); };
  h = h.replace(/<sup>([\s\S]*?)<\/sup>/gi, script(SUP, '^')).replace(/<sub>([\s\S]*?)<\/sub>/gi, script(SUB, '_'));
  h = h.replace(/>\s*\n\s*</g, '><').replace(/\s*\n\s*/g, ' '); // xuống dòng trong mã HTML chỉ là khoảng trắng (khác với </p>, <br>)
  h = h.replace(/<\/(p|li|tr|h\d|div)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(td|th)>/gi, '\t').replace(/<[^>]+>/g, '');
  return dec(h);
}

/** Phân tích văn bản dán từ Word: "Câu 1: … / A. … / Đáp án: B / Giải thích: …". Giữ nguyên thụt lề của mã nguồn (C++…). */
export function parseQuestionText(text) {
  const out = []; let cur = null, field = null, inFence = false; const keyPairs = [];
  const reQ = /^\s*(?:câu|cau|question)\s*\d+\s*[:.)\-]?\s*(.*)$/i;
  const reNum = /^\s*\d+\s*[.)]\s+(.*)$/;
  const reAns = /^\s*(?:đáp án|dap an|đ\/a|answer)(?:\s*đúng)?\s*[:：]?\s*(.*)$/i;
  const reExp = /^\s*(?:giải thích|giai thich|lời giải|loi giai|hướng dẫn giải|explanation)\s*[:：]?\s*(.*)$/i;
  const rePart = /^\s*PH[ẦA]N\s+[IVXLC\d]+\b/i;
  const lines = normalizeText(text).split('\n');
  const hasPrefix = lines.some((l) => reQ.test(l));
  const start = (t) => { cur = { q: t, A: '', B: '', C: '', D: '', ans: '', exp: '' }; out.push(cur); field = 'q'; };
  const add = (txt) => { cur[field] = (cur[field] ? cur[field] + '\n' : '') + txt; };
  for (const raw of lines) {
    const line = raw.trim();
    // khối mã ``` ... ```: giữ nguyên mọi dòng (kể cả dòng trống, thụt lề, "A." trong mã)
    if (cur && /^```/.test(line)) { inFence = !inFence; if (field === 'ans') field = 'exp'; add(line); continue; }
    if (cur && inFence) { add(raw.replace(/\t/g, '    ').replace(/\s+$/, '')); continue; }
    if (!line) continue;
    let m;
    if (rePart.test(line)) { cur = null; field = null; continue; } // tiêu đề phần: bỏ qua
    if (/đáp án|dap an|answer/i.test(line)) { // bảng đáp án cuối đề: "Đáp án: 1.A 2.B 3.C ..."
      const ps = [...line.matchAll(/(\d{1,3})\s*[.\-:)]?\s*([A-Da-d])(?![A-Za-z\u00C0-\u1EF9])/g)];
      if (ps.length >= 3) { ps.forEach((p) => keyPairs.push([+p[1], p[2].toUpperCase()])); continue; }
    }
    if (cur && (m = line.match(reExp))) { cur.exp = m[1]; field = 'exp'; continue; }
    if (cur && (m = line.match(reAns))) { cur.ans = normalizeAnswer(m[1]); field = 'ans'; continue; }
    if (cur) {
      const opts = splitOptions(line);
      if (opts) { opts.forEach((o) => { cur[o.key] = o.text; if (o.star) cur.ans = o.key; }); field = opts[opts.length - 1].key; continue; }
    }
    if ((m = line.match(reQ))) { start(m[1]); continue; }
    if ((m = line.match(reNum)) && (!hasPrefix || (cur && cur.ans && field === 'ans'))) { start(m[1]); continue; }
    if (!cur) { if (!hasPrefix) start(line); continue; } // trước câu đầu tiên: bỏ qua lời dẫn nếu đề có "Câu N"
    if (field === 'ans') { if (!hasPrefix) start(line); continue; }
    add(looksLikeCode(line) ? raw.replace(/\t/g, '    ').replace(/\s+$/, '') : line); // dòng nối tiếp (mã nguồn giữ thụt lề)
  }
  keyPairs.forEach(([n, a]) => { if (out[n - 1] && !out[n - 1].ans) out[n - 1].ans = a; });
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
/** Đề đang giao cho ai: none (chưa giao) | all | classes | students. Đề cũ chưa có trường này: để trống = tất cả. */
export function audienceOf(q) {
  if (q.audience) return q.audience;
  if ((q.allowedClasses || []).length || (q.allowedUsers || []).length) return 'classes';
  return 'all';
}
/** Thư mục: mặc định chưa giao (không ảnh hưởng đề bên trong). */
export const folderAudience = (f) => f.audience || 'none';
export const AUDIENCE_LABEL = { none: 'Chưa giao', all: 'Tất cả mọi người', classes: 'Theo lớp', students: 'Theo học viên' };
export const isOn = (v) => v === true || v === 'always'; // bật đảo (tương thích đề cũ)
/** Việc giao (audience + lớp + học viên) có cho phép người này xem không? */
function specAllows(aud, spec, profile, uid) {
  if (aud === 'all') return true;
  if (aud === 'none') return false;
  const us = spec.allowedUsers || [];
  if (aud === 'students') return us.includes(uid);
  const mine = userClasses(profile).map((c) => String(c).trim().toLowerCase());
  const cs = (spec.allowedClasses || []).map((c) => String(c).trim().toLowerCase());
  return us.includes(uid) || cs.some((c) => mine.includes(c));
}
/** Các thư mục cha (từ gần đến xa) của một thư mục. */
export function folderChain(folders, fid) {
  const out = []; const seen = new Set(); let cur = (folders || []).find((f) => f.id === fid);
  while (cur && !seen.has(cur.id)) { out.push(cur); seen.add(cur.id); cur = (folders || []).find((f) => f.id === cur.parentId); }
  return out;
}
/** Thư mục (đã giao) mà đề này được thừa hưởng việc giao. */
export function inheritedFolder(q, folders) {
  return folderChain(folders, q.folderId).find((f) => folderAudience(f) !== 'none') || null;
}
/** Học viên này có thấy đề không? Đề thấy được nếu chính đề được giao HOẶC thư mục chứa nó được giao. */
export function canSeeQuiz(q, folders, profile, uid) {
  if (q.hidden) return false;
  if (profile?.role === 'admin') return true;
  if (profile?.role === 'guest') return q.guest === true;
  if (specAllows(audienceOf(q), q, profile, uid)) return true;
  return folderChain(folders, q.folderId).some((f) => specAllows(folderAudience(f), f, profile, uid));
}
/** Tương thích cũ (không xét thư mục). */
export const canSee = (q, profile, uid) => canSeeQuiz(q, [], profile, uid);
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
  const subs = attempts.filter((a) => a.status === 'submitted' && !a.retry); // bài ôn câu sai không tính thống kê
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

/** Trang HTML để in/lưu PDF. withAnswers=true: đánh dấu đáp án đúng (gạch chân) + lời giải. */
export function questionsToPrintHtml(title, qs, { withAnswers = true } = {}) {
  const body = qs.map((q, i) => `<div class="q"><p class="qt"><b>Câu ${i + 1}.</b> ${richText(q.q)}</p>${KEYS.filter((k) => q[k]).map((k) => `<p class="o"><b${withAnswers && k === q.ans ? ' class="ok"' : ''}>${k}.</b> ${richText(q[k])}</p>`).join('')}${withAnswers ? `<p class="a">Đáp án: <b>${q.ans}</b></p>${q.exp ? `<p class="e"><i>Lời giải:</i> ${richText(q.exp)}</p>` : ''}` : ''}</div>`).join('');
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${esc(title)}</title><style>
@page{size:A4;margin:16mm}body{font:12pt/1.5 "Times New Roman",serif;color:#000;margin:0}h1{text-align:center;font-size:16pt;margin:0 0 12pt}
.q{break-inside:avoid;margin:0 0 12pt}.q p{margin:2pt 0;white-space:pre-wrap}.o{padding-left:18pt}.ok{text-decoration:underline}.a{color:#075}.e{font-size:11pt}
pre.code{font:10pt/1.35 Consolas,"DejaVu Sans Mono",monospace;background:#f3f3f3;border:1px solid #ccc;padding:6pt;margin:4pt 0;white-space:pre;break-inside:avoid}code{font-family:Consolas,"DejaVu Sans Mono",monospace}
</style></head><body><h1>${esc(title)}</h1>${body}</body></html>`;
}
