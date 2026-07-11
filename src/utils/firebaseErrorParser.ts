import { parseAppError } from "./errorParser";

type FirebaseLikeError = {
  code?: string;
  message?: string;
};

const FIREBASE_AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email hoặc mật khẩu không chính xác.",
  "auth/user-not-found": "Email hoặc mật khẩu không chính xác.",
  "auth/wrong-password": "Email hoặc mật khẩu không chính xác.",
  "auth/invalid-email": "Địa chỉ email không đúng định dạng.",
  "auth/too-many-requests": "Tài khoản tạm thời bị khóa do đăng nhập quá nhiều lần. Vui lòng thử lại sau.",
  "auth/network-request-failed": "Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối Internet hoặc thử lại sau.",
};

export function parseFirebaseError(error: unknown, fallbackMessage: string): string {
  if (error && typeof error === "object") {
    const firebaseError = error as FirebaseLikeError;
    if (firebaseError.code && FIREBASE_AUTH_MESSAGES[firebaseError.code]) {
      return FIREBASE_AUTH_MESSAGES[firebaseError.code];
    }
  }

  return parseAppError(error, fallbackMessage);
}
