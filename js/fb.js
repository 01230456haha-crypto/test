// Khởi tạo Firebase (nạp thẳng từ CDN của Google, không cần build).
import { initializeApp, deleteApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import * as A from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import * as F from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { firebaseConfig } from './config.js';

export { A, F };
export const configured = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('DAN_');
export const app = initializeApp(firebaseConfig);
export const auth = A.getAuth(app);
export const db = F.getFirestore(app);

/** Tạo tài khoản đăng nhập mới mà KHÔNG làm admin bị đăng xuất (dùng app phụ). */
export async function createAuthUser(email, password) {
  const sec = initializeApp(firebaseConfig, 'create' + Date.now());
  try {
    const sa = A.getAuth(sec);
    const cred = await A.createUserWithEmailAndPassword(sa, email, password);
    const uid = cred.user.uid;
    await A.signOut(sa);
    return uid;
  } finally { await deleteApp(sec); }
}
/** Đăng nhập thay học viên (bằng mật khẩu admin đã cấp) để đổi mật khẩu. */
export async function withUserSession(email, password, fn) {
  const sec = initializeApp(firebaseConfig, 'sess' + Date.now());
  try {
    const sa = A.getAuth(sec);
    const cred = await A.signInWithEmailAndPassword(sa, email, password);
    return await fn(cred.user);
  } finally {
    try { await A.signOut(A.getAuth(sec)); } catch (e) { /* bỏ qua */ }
    await deleteApp(sec);
  }
}
