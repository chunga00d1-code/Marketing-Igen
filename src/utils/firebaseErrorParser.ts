import { parseAppError } from "./errorParser";

type FirebaseLikeError = {
  code?: string;
  message?: string;
};

const FIREBASE_AUTH_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Email hoac mat khau khong chinh xac.",
  "auth/user-not-found": "Email hoac mat khau khong chinh xac.",
  "auth/wrong-password": "Email hoac mat khau khong chinh xac.",
  "auth/invalid-email": "Dia chi email khong dung dinh dang.",
  "auth/too-many-requests": "Tai khoan tam thoi bi khoa do dang nhap qua nhieu lan. Vui long thu lai sau.",
  "auth/network-request-failed": "Khong the ket noi toi may chu. Vui long kiem tra ket noi Internet hoac thu lai sau.",
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
