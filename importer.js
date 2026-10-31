// Đọc file câu hỏi: Excel / CSV / JSON / Word (.docx) / văn bản.
import { rowsToQuestions, parseQuestionText, htmlToQuestionText, pdfItemsToLines, questionsToRows, questionsToPrintHtml, sampleQuestions, HEADERS } from './lib.js';
import { readFile, downloadBlob, exportXlsx, safeName, toast } from './ui.js';
import { buildQuestionsDocx, buildTemplateDocx, WORD_MIME } from './docx.js';

export async function parseFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  if (['xlsx', 'xls', 'csv'].includes(ext)) {
    if (!window.XLSX) throw new Error('Thư viện Excel chưa tải xong (kiểm tra mạng).');
    const wb = ext === 'csv' ? XLSX.read(await readFile(file, 'text'), { type: 'string' }) : XLSX.read(await readFile(file), { type: 'array' });
    return rowsToQuestions(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' }));
  }
  if (ext === 'json') {
    const j = JSON.parse(await readFile(file, 'text'));
    return rowsToQuestions(Array.isArray(j) ? j : j.questions || []);
  }
  if (ext === 'docx') {
    if (!window.mammoth) throw new Error('Thư viện đọc Word chưa tải xong (kiểm tra mạng).');
    // convertToHtml giữ được chữ GẠCH CHÂN → đáp án đúng; các dòng có 2 đáp án (A. … B. …) cũng được tách
    const r = await mammoth.convertToHtml({ arrayBuffer: await readFile(file) }, { styleMap: ['u => u'] });
    return parseQuestionText(htmlToQuestionText(r.value));
  }
  if (ext === 'pdf') {
    if (!window.pdfjsLib) throw new Error('Thư viện đọc PDF chưa tải xong (kiểm tra mạng).');
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await readFile(file)) }).promise;
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) { const tc = await (await doc.getPage(i)).getTextContent(); text += pdfItemsToLines(tc.items).join('\n') + '\n'; }
    return parseQuestionText(text);
  }
  if (ext === 'doc') throw new Error('File .doc cũ chưa đọc được. Trong Word hãy chọn Lưu thành → định dạng .docx rồi tải lại.');
  if (['txt', 'md'].includes(ext)) return parseQuestionText(await readFile(file, 'text'));
  throw new Error('Chưa hỗ trợ định dạng .' + ext + ' (dùng .xlsx, .csv, .json, .docx, .pdf hoặc .txt).');
}
export const exportQuestionsXlsx = (title, qs) => exportXlsx([{ name: 'Câu hỏi', rows: questionsToRows(qs), header: HEADERS }], safeName(title) + '.xlsx');
export const exportQuestionsWord = (title, qs) => downloadBlob(new Blob([buildQuestionsDocx(title, qs)], { type: WORD_MIME }), safeName(title) + '.docx');
export const downloadTemplate = () => exportXlsx([{ name: 'Câu hỏi', rows: questionsToRows(sampleQuestions()), header: HEADERS }], 'mau-de-thi.xlsx');
export const downloadWordTemplate = () => downloadBlob(new Blob([buildTemplateDocx()], { type: WORD_MIME }), 'mau-de-thi.docx');
/** Xuất PDF: mở hộp thoại in của trình duyệt (chọn "Lưu dưới dạng PDF"). */
export function exportQuestionsPdf(title, qs, withAnswers = true) {
  const ifr = document.createElement('iframe');
  ifr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  ifr.srcdoc = questionsToPrintHtml(title + (withAnswers ? '' : ' (đề thi)'), qs, { withAnswers });
  ifr.onload = () => { try { ifr.contentWindow.focus(); ifr.contentWindow.print(); } catch (e) { toast('Trình duyệt không mở được hộp thoại in.', 'error'); } setTimeout(() => ifr.remove(), 60000); };
  document.body.appendChild(ifr);
}
