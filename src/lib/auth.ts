// Khóa màn hình bằng tài khoản quản trị.
// Lưu ý: kiểm tra phía trình duyệt chỉ ngăn người khác mở app trên máy, không thay thế bảo mật máy chủ.

const SESSION_KEY = 'trithucviet_session';
// Băm (cyrb53, seed 2026) của "tên đăng nhập đã chuẩn hóa|mật khẩu" — không lưu mật khẩu dạng rõ trong mã nguồn
const CREDENTIAL_HASH = '199a46af1923c0';

const cyrb53 = (str: string, seed = 0) => {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
};

// Không phân biệt hoa/thường và khoảng trắng thừa ở tên đăng nhập
const normalizeUser = (s: string) => s.normalize('NFC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');

export const checkCredentials = (user: string, pass: string) =>
  cyrb53(`${normalizeUser(user)}|${pass}`, 2026) === CREDENTIAL_HASH;

export const isUnlocked = () => {
  try { return sessionStorage.getItem(SESSION_KEY) === CREDENTIAL_HASH; } catch { return false; }
};

export const setUnlocked = (value: boolean) => {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, CREDENTIAL_HASH);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* trình duyệt chặn lưu trữ: phải đăng nhập lại mỗi lần tải trang */ }
};
