// Trạng thái dùng chung + vài hàm cầu nối (tránh import vòng tròn).
export const DEFAULT_SETTINGS = { registerMode: 'open', emailReg: true, googleReg: true, googleLogin: true, guestEnabled: false };
export const state = { user: null, profile: null, settings: { ...DEFAULT_SETTINGS }, flash: null };
export const flags = { authBusy: false };
export const hooks = {}; // app.js gắn: boot, logout
export const isAdmin = () => state.profile?.role === 'admin';
export const isGuest = () => state.profile?.role === 'guest';
export function go(path) {
  if (location.hash === '#' + path) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = path;
}
export function authError(e) {
  const m = {
    'auth/invalid-credential': 'Sai tên đăng nhập hoặc mật khẩu.',
    'auth/user-not-found': 'Không tìm thấy tài khoản.',
    'auth/wrong-password': 'Sai mật khẩu.',
    'auth/invalid-email': 'Email hoặc tên đăng nhập không hợp lệ.',
    'auth/email-already-in-use': 'Email/tên đăng nhập này đã có người dùng.',
    'auth/weak-password': 'Mật khẩu cần ít nhất 6 ký tự.',
    'auth/too-many-requests': 'Thử quá nhiều lần, hãy đợi một lúc rồi thử lại.',
    'auth/network-request-failed': 'Lỗi mạng, hãy kiểm tra kết nối.',
    'auth/popup-closed-by-user': 'Bạn đã đóng cửa sổ đăng nhập Google.',
    'auth/popup-blocked': 'Trình duyệt chặn cửa sổ bật lên, hãy cho phép rồi thử lại.',
    'auth/operation-not-allowed': 'Cách đăng nhập này chưa được bật trong Firebase (Authentication → Sign-in method).',
    'auth/unauthorized-domain': 'Tên miền chưa được thêm vào Firebase (Authentication → Settings → Authorized domains).',
    'auth/requires-recent-login': 'Hãy đăng xuất, đăng nhập lại rồi thử lại.',
    'permission-denied': 'Không đủ quyền (kiểm tra Firestore Rules).',
  };
  return m[e?.code] || e?.message || String(e);
}
