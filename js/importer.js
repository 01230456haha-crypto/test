// Đọc file câu hỏi: Excel / CSV / JSON / Word (.docx) / văn bản.
import { rowsToQuestions, parseQuestionText, questionsToRows, questionsToWordHtml, sampleQuestions, HEADERS } from './lib.js';
import { readFile, downloadBlob, exportXlsx, safeName } from './ui.js';

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
    const r = await mammoth.extractRawText({ arrayBuffer: await readFile(file) });
    return parseQuestionText(r.value);
  }
  if (['txt', 'md'].includes(ext)) return parseQuestionText(await readFile(file, 'text'));
  throw new Error('Chưa hỗ trợ định dạng .' + ext + ' (dùng .xlsx, .csv, .json, .docx hoặc .txt).');
}
export const exportQuestionsXlsx = (title, qs) => exportXlsx([{ name: 'Câu hỏi', rows: questionsToRows(qs), header: HEADERS }], safeName(title) + '.xlsx');
export const exportQuestionsWord = (title, qs) => downloadBlob(new Blob(['\ufeff', questionsToWordHtml(title, qs)], { type: 'application/msword' }), safeName(title) + '.doc');
export const downloadTemplate = () => exportXlsx([{ name: 'Câu hỏi', rows: questionsToRows(sampleQuestions()), header: HEADERS }], 'mau-de-thi.xlsx');
