// Tạo file Word (.docx) thật ngay trong trình duyệt, không cần thư viện ngoài: gói ZIP (không nén) + XML.
// Đáp án đúng được GẠCH CHÂN chữ cái (A./B./…) → nhập lại vào hệ thống đọc được đúng như đề giáo viên soạn.
import { KEYS } from './lib.js';

const enc = new TextEncoder();
const xesc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

let crcTable;
function crc32(buf) {
  if (!crcTable) { crcTable = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcTable[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
/** files: [{name, data: Uint8Array}] → Uint8Array (ZIP, method "store"). */
export function makeZip(files) {
  const chunks = [], central = []; let offset = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const f of files) {
    const name = enc.encode(f.name), crc = crc32(f.data), size = f.data.length;
    const local = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0)]);
    chunks.push(local, name, f.data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(size), ...u32(size), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
    offset += local.length + name.length + size;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...chunks, ...central, end], out = new Uint8Array(all.reduce((s, c) => s + c.length, 0));
  let p = 0; for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

/** Một đoạn văn: runs = [{t, b, i, u, mono}] */
function para(runs, { center = false, size = 26, keep = false } = {}) {
  const r = runs.map((x) => {
    const rpr = `${x.b ? '<w:b/>' : ''}${x.i ? '<w:i/>' : ''}${x.u ? '<w:u w:val="single"/>' : ''}${x.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : ''}<w:sz w:val="${x.sz || size}"/>`;
    const parts = String(x.t).split('\t').map((seg) => `<w:t xml:space="preserve">${xesc(seg)}</w:t>`).join('<w:tab/>');
    return `<w:r><w:rPr>${rpr}</w:rPr>${parts}</w:r>`;
  }).join('');
  return `<w:p><w:pPr>${keep ? '<w:keepNext/>' : ''}${center ? '<w:jc w:val="center"/>' : ''}<w:spacing w:after="80"/></w:pPr>${r}</w:p>`;
}

/** Văn bản (có thể chứa khối mã ```…```) → các đoạn văn. firstRuns: phần mở đầu trên dòng đầu (vd "Câu 1."). */
function textParas(text, firstRuns = []) {
  const out = []; let inCode = false, first = true;
  for (const line of String(text ?? '').split('\n')) {
    if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) { out.push(para([{ t: line.replace(/^ +/, (m) => '\u00a0'.repeat(m.length)), mono: true, sz: 22 }])); continue; }
    out.push(para(first ? [...firstRuns, { t: line }] : [{ t: line }])); first = false;
  }
  if (first) out.push(para(firstRuns));
  return out;
}

export function buildQuestionsDocx(title, qs, { intro = [] } = {}) {
  const body = [para([{ t: title, b: true, sz: 32 }], { center: true })];
  intro.forEach((l) => body.push(para([{ t: l, i: true, sz: 22 }])));
  if (intro.length) body.push(para([{ t: '' }]));
  qs.forEach((q, i) => {
    body.push(...textParas(q.q, [{ t: `Câu ${i + 1}. `, b: true }]).map((x, k) => (k === 0 ? x.replace('<w:pPr>', '<w:pPr><w:keepNext/>') : x)));
    KEYS.filter((k) => q[k]).forEach((k) => {
      const ls = String(q[k]).split('\n');
      body.push(para([{ t: `${k}.`, b: true, u: k === q.ans }, { t: '\t' + ls[0] }]));
      ls.slice(1).forEach((l) => body.push(para([{ t: '\t' + l }])));
    });
    if (q.exp) body.push(...textParas(q.exp, [{ t: 'Lời giải: ', i: true }]));
    body.push(para([{ t: '' }]));
  });
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/><w:sz w:val="26"/><w:szCs w:val="26"/><w:lang w:val="vi-VN"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
  const types = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  const docRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>';
  const f = (name, x) => ({ name, data: enc.encode(x) });
  return makeZip([f('[Content_Types].xml', types), f('_rels/.rels', rels), f('word/document.xml', doc), f('word/styles.xml', styles), f('word/_rels/document.xml.rels', docRels)]);
}
export const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** File Word mẫu: hướng dẫn cách soạn + 3 câu ví dụ (có cả câu có mã C++). */
export function buildTemplateDocx() {
  const qs = [
    { q: 'Thủ đô của Việt Nam là gì?', A: 'Hà Nội', B: 'Huế', C: 'Đà Nẵng', D: 'TP. Hồ Chí Minh', ans: 'A', exp: 'Hà Nội là thủ đô của Việt Nam.' },
    { q: 'Đoạn chương trình sau in ra giá trị nào?\n```\n#include <iostream>\nusing namespace std;\nint main() {\n    int a = 5, b = 3;\n    cout << a - b;\n    return 0;\n}\n```', A: '2', B: '8', C: '15', D: 'Lỗi biên dịch', ans: 'A', exp: 'a - b = 5 - 3 = 2.' },
    { q: 'Câu chỉ có hai đáp án (Đúng/Sai): Trái Đất quay quanh Mặt Trời.', A: 'Đúng', B: 'Sai', C: '', D: '', ans: 'A', exp: '' },
  ];
  return buildQuestionsDocx('MẪU ĐỀ THI', qs, { intro: ['Cách soạn: mỗi câu bắt đầu bằng "Câu 1.", "Câu 2."… Đáp án A, B, C, D mỗi đáp án một dòng.', 'Báo đáp án đúng bằng cách GẠCH CHÂN chữ cái đáp án đúng (A., B., C. hoặc D.), hoặc thêm dòng "Đáp án: A".', 'Lời giải ghi sau chữ "Lời giải:" (không bắt buộc). Đoạn mã C++ nên đặt trong khung mã hoặc để nguyên thụt lề.'] });
}
