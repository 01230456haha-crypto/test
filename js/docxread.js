// Đọc file Word (.docx) trực tiếp trong trình duyệt, không cần thư viện ngoài.
// Giữ được: chữ GẠCH CHÂN (đáp án đúng), thụt lề (mã nguồn), chỉ số trên/dưới, bảng, và đổi
// CÔNG THỨC Word (Equation) sang LaTeX $...$ để hiện đẹp bằng KaTeX.

// ---------- Đọc một tệp trong gói ZIP ----------
export async function readZipEntry(buf, name) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Không phải file .docx hợp lệ.');
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const fname = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
    if (fname === name) {
      const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = u8.subarray(start, start + csize);
      if (method === 0) return data;
      if (method !== 8) throw new Error('Kiểu nén không hỗ trợ.');
      if (typeof DecompressionStream === 'undefined') throw new Error('Trình duyệt chưa hỗ trợ giải nén (hãy dùng Chrome/Safari bản mới).');
      return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    }
    p += 46 + nlen + xlen + clen;
  }
  return null;
}

// ---------- XML nhỏ gọn ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, g) => (g[0] === '#' ? String.fromCodePoint(g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10)) : ENT[g.toLowerCase()]));
export function parseXml(xml) {
  const root = { name: '#root', attrs: {}, kids: [] }, stack = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g; let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[1] !== undefined) top.kids.push({ text: m[1] });
    else if (m[2]) { if (stack.length > 1) stack.pop(); }
    else if (m[3]) {
      const attrs = {}; (m[4] || '').replace(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g, (x, k, a, b) => { attrs[k] = unent(a ?? b); });
      const n = { name: m[3], attrs, kids: [] }; top.kids.push(n); if (!m[5]) stack.push(n);
    } else if (m[6] !== undefined) top.kids.push({ text: unent(m[6]) });
  }
  return root;
}
const els = (n) => (n.kids || []).filter((k) => k.name);
const first = (n, name) => els(n).find((k) => k.name === name);
const attr = (n, k) => (n && n.attrs ? n.attrs[k] : undefined);
const textOf = (n) => (n.text !== undefined ? n.text : (n.kids || []).map(textOf).join(''));

// ---------- Công thức Word (OMML) → LaTeX ----------
const SYM = { '∗': '*', '×': '\\times ', '÷': '\\div ', '·': '\\cdot ', '⋅': '\\cdot ', '≤': '\\le ', '≥': '\\ge ', '≠': '\\ne ', '≈': '\\approx ', '∞': '\\infty ', '…': '\\ldots ', '⋯': '\\cdots ', '±': '\\pm ', '∓': '\\mp ', '→': '\\to ', '←': '\\leftarrow ', '⇒': '\\Rightarrow ', '⇔': '\\Leftrightarrow ', '∈': '\\in ', '∉': '\\notin ', '⊂': '\\subset ', '⊆': '\\subseteq ', '∪': '\\cup ', '∩': '\\cap ', '∅': '\\emptyset ', '∀': '\\forall ', '∃': '\\exists ', '√': '\\surd ', '−': '-', '°': '^\\circ ', '∑': '\\sum ', '∏': '\\prod ', '∫': '\\int ', 'π': '\\pi ', 'α': '\\alpha ', 'β': '\\beta ', 'γ': '\\gamma ', 'δ': '\\delta ', 'Δ': '\\Delta ', 'θ': '\\theta ', 'λ': '\\lambda ', 'μ': '\\mu ', 'σ': '\\sigma ', 'φ': '\\varphi ', 'ω': '\\omega ', 'Ω': '\\Omega ', '%': '\\% ', '&': '\\& ', '#': '\\# ', '$': '\\$ ' };
const KNOWN_FN = ['sin', 'cos', 'tan', 'cot', 'log', 'ln', 'lim', 'max', 'min', 'exp', 'arcsin', 'arccos', 'arctan'];
const mtext = (r) => els(r).filter((k) => k.name === 'm:t' || k.name === 'w:t').map(textOf).join('');
const sym = (t) => [...t].map((c) => SYM[c] ?? c).join('');
const brace = (n, name) => { const c = first(n, name); return c ? omml(c) : ''; };
const delim = (c, d) => ({ '{': '\\{', '}': '\\}', '': '.', '〈': '\\langle ', '〉': '\\rangle ', '⌊': '\\lfloor ', '⌋': '\\rfloor ', '⌈': '\\lceil ', '⌉': '\\rceil ' }[c] ?? c ?? d);
function ommlNode(n) {
  switch (n.name) {
    case 'm:r': { const t = mtext(n), plain = attr(first(first(n, 'm:rPr') || { kids: [] }, 'm:sty'), 'm:val') === 'p'; return /^[A-Za-zÀ-ỹ]{2,}$/.test(t) && (plain || KNOWN_FN.includes(t)) ? (KNOWN_FN.includes(t) ? `\\${t} ` : `\\mathrm{${t}}`) : sym(t); }
    case 'm:f': return `\\frac{${brace(n, 'm:num')}}{${brace(n, 'm:den')}}`;
    case 'm:rad': { const deg = brace(n, 'm:deg').trim(); return deg ? `\\sqrt[${deg}]{${brace(n, 'm:e')}}` : `\\sqrt{${brace(n, 'm:e')}}`; }
    case 'm:sSup': return `{${brace(n, 'm:e')}}^{${brace(n, 'm:sup')}}`;
    case 'm:sSub': return `{${brace(n, 'm:e')}}_{${brace(n, 'm:sub')}}`;
    case 'm:sSubSup': return `{${brace(n, 'm:e')}}_{${brace(n, 'm:sub')}}^{${brace(n, 'm:sup')}}`;
    case 'm:sPre': return `{}_{${brace(n, 'm:sub')}}^{${brace(n, 'm:sup')}}{${brace(n, 'm:e')}}`;
    case 'm:d': {
      const pr = first(n, 'm:dPr'), b = attr(first(pr || { kids: [] }, 'm:begChr'), 'm:val'), e = attr(first(pr || { kids: [] }, 'm:endChr'), 'm:val'), sp = attr(first(pr || { kids: [] }, 'm:sepChr'), 'm:val') ?? ',';
      return `\\left${delim(b, '(')}${els(n).filter((k) => k.name === 'm:e').map(omml).join(sym(sp))}\\right${delim(e, ')')}`;
    }
    case 'm:nary': {
      const pr = first(n, 'm:naryPr'), ch = attr(first(pr || { kids: [] }, 'm:chr'), 'm:val') ?? '∫', sub = brace(n, 'm:sub'), sup = brace(n, 'm:sup');
      return `${sym(ch)}${sub ? `_{${sub}}` : ''}${sup ? `^{${sup}}` : ''}{${brace(n, 'm:e')}}`;
    }
    case 'm:func': return `${brace(n, 'm:fName')}{${brace(n, 'm:e')}}`;
    case 'm:bar': return `\\overline{${brace(n, 'm:e')}}`;
    case 'm:acc': return `\\hat{${brace(n, 'm:e')}}`;
    case 'm:limLow': return `{${brace(n, 'm:e')}}_{${brace(n, 'm:lim')}}`;
    case 'm:limUpp': return `{${brace(n, 'm:e')}}^{${brace(n, 'm:lim')}}`;
    case 'm:eqArr': return `\\begin{aligned}${els(n).filter((k) => k.name === 'm:e').map(omml).join('\\\\ ')}\\end{aligned}`;
    case 'm:m': return `\\begin{matrix}${els(n).filter((k) => k.name === 'm:mr').map((r) => els(r).filter((k) => k.name === 'm:e').map(omml).join(' & ')).join(' \\\\ ')}\\end{matrix}`;
    default: return /Pr$/.test(n.name) ? '' : omml(n);
  }
}
function omml(n) { return els(n).map(ommlNode).join(''); }

// ---------- Đoạn văn ----------
const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', a: 'ₐ', e: 'ₑ', o: 'ₒ', x: 'ₓ', i: 'ᵢ', j: 'ⱼ', n: 'ₙ' };
const script = (map, mark, t) => (t && [...t].every((c) => map[c]) ? [...t].map((c) => map[c]).join('') : t.length > 1 ? `${mark}(${t})` : mark + t);

function runInfo(r) {
  const pr = first(r, 'w:rPr'); let u = false, va = '';
  if (pr) { const un = first(pr, 'w:u'); u = !!un && attr(un, 'w:val') !== 'none'; va = attr(first(pr, 'w:vertAlign'), 'w:val') || ''; }
  let t = '';
  for (const k of els(r)) {
    if (k.name === 'w:t') t += textOf(k);
    else if (k.name === 'w:tab') t += '\t';
    else if (k.name === 'w:br' || k.name === 'w:cr') t += '\n';
    else if (k.name === 'w:noBreakHyphen') t += '-';
  }
  if (va === 'superscript') t = script(SUP, '^', t); else if (va === 'subscript') t = script(SUB, '_', t);
  return { t, u };
}
function collect(n, segs) {
  for (const k of els(n)) {
    if (k.name === 'w:r') segs.push(runInfo(k));
    else if (k.name === 'm:oMath') segs.push({ t: '$' + omml(k).replace(/\s+/g, ' ').trim() + '$', u: false });
    else if (k.name === 'm:oMathPara') collect(k, segs);
    else if (['w:pPr', 'w:rPr', 'w:del', 'w:drawing', 'w:pict', 'w:instrText', 'm:oMathParaPr'].includes(k.name)) continue;
    else collect(k, segs); // hyperlink, smartTag, ins, sdt…
  }
}
function paragraph(p) {
  const segs = []; collect(p, segs);
  const indent = Math.max(0, Math.round((+attr(first(first(p, 'w:pPr') || { kids: [] }, 'w:ind'), 'w:left') || +attr(first(first(p, 'w:pPr') || { kids: [] }, 'w:ind'), 'w:start') || 0) / 720 * 4));
  let out = '';
  segs.forEach((s, i) => {
    let t = s.t;
    if (s.u && out.trim() === '' || (s.u && /\t\s*$/.test(out))) { // chữ cái đáp án được gạch chân → đáp án đúng
      const rest = t + segs.slice(i + 1).map((x) => x.t).join('');
      if (/^\s*[A-Da-d]\s*[.)]/.test(rest) && /^\s*[A-Da-d]\s*([.)]|$)/.test(t)) t = t.replace(/^(\s*)/, '$1*');
    }
    out += t;
  });
  return (indent >= 2 && out.trim() ? ' '.repeat(indent) : '') + out.replace(/\s+$/, '');
}
function walk(node, lines) {
  for (const k of els(node)) {
    if (k.name === 'w:p') lines.push(...paragraph(k).split('\n'));
    else if (k.name === 'w:tbl') els(k).filter((r) => r.name === 'w:tr').forEach((r) => lines.push(els(r).filter((c) => c.name === 'w:tc').map((c) => { const l = []; walk(c, l); return l.join(' ').trim(); }).join('\t')));
    else if (['w:sdt', 'w:sdtContent', 'w:body', 'w:ins'].includes(k.name)) walk(k, lines);
  }
}

/** ArrayBuffer của file .docx → văn bản theo từng dòng, sẵn sàng cho bộ phân tích câu hỏi. */
export async function docxToText(buf) {
  const xml = await readZipEntry(buf, 'word/document.xml');
  if (!xml) throw new Error('File Word không có nội dung (word/document.xml).');
  const doc = parseXml(new TextDecoder().decode(xml)), body = first(first(doc, 'w:document') || doc, 'w:body') || doc, lines = [];
  walk(body, lines);
  return lines.join('\n');
}
