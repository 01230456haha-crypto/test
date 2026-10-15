// Đọc/ghi dữ liệu Firestore dùng chung.
import { db, F } from './fb.js';
import { byName } from './lib.js';

export async function getAll(col) {
  const s = await F.getDocs(F.collection(db, col));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export const getFolders = () => getAll('folders');
export const getClasses = async () => (await getAll('classes')).sort(byName);
export async function getQuizzes(guestOnly = false) {
  const ref = guestOnly ? F.query(F.collection(db, 'quizzes'), F.where('guest', '==', true)) : F.collection(db, 'quizzes');
  const s = await F.getDocs(ref);
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function getQuiz(id) {
  const s = await F.getDoc(F.doc(db, 'quizzes', id));
  return s.exists() ? { id, ...s.data() } : null;
}
export async function getContent(id) {
  const s = await F.getDoc(F.doc(db, 'quizContent', id));
  return s.exists() ? s.data().questions || [] : [];
}
export async function saveContent(id, questions) {
  if (JSON.stringify(questions).length > 950000) throw new Error('Đề quá lớn (gần 1MB). Hãy tách thành nhiều đề nhỏ hơn.');
  await F.setDoc(F.doc(db, 'quizContent', id), { questions });
  await F.updateDoc(F.doc(db, 'quizzes', id), { count: questions.length, updatedAt: Date.now() });
}
export async function getAttemptsWhere(field, value) {
  const s = await F.getDocs(F.query(F.collection(db, 'attempts'), F.where(field, '==', value)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}
export async function deleteAttempts(list) {
  for (let i = 0; i < list.length; i += 400) {
    const b = F.writeBatch(db);
    list.slice(i, i + 400).forEach((a) => b.delete(F.doc(db, 'attempts', a.id)));
    await b.commit();
  }
}
export function pathOf(folders, id) {
  const out = []; let cur = folders.find((f) => f.id === id);
  while (cur) { out.unshift(cur); cur = folders.find((f) => f.id === cur.parentId); }
  return out;
}
export function descendantIds(folders, id) {
  const ids = new Set([id]); let grow = true;
  while (grow) { grow = false; folders.forEach((f) => { if (f.parentId && ids.has(f.parentId) && !ids.has(f.id)) { ids.add(f.id); grow = true; } }); }
  return ids;
}
export const DEFAULT_QUIZ = {
  description: '', minutes: 30, mode: 'step', shuffleQ: 'never', shuffleA: 'never',
  lockReview: false, hidden: false, guest: false, openAt: null, closeAt: null, maxAttempts: 0, passScore: 5,
  allowedUsers: [], allowedClasses: [], count: 0,
};
export async function createQuiz(title, folderId) {
  const ref = F.doc(F.collection(db, 'quizzes'));
  await F.setDoc(ref, { ...DEFAULT_QUIZ, title, folderId: folderId || null, createdAt: Date.now(), updatedAt: Date.now() });
  await F.setDoc(F.doc(db, 'quizContent', ref.id), { questions: [] });
  return ref.id;
}
