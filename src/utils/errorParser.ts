type ErrorWithCode = Error & { code?: string };

type SerializableError = {
  code?: string;
  errorCode?: string;
  message?: string;
  error?: string;
};

export function parseAppError(
  error: unknown,
  fallbackMessage = "Da xay ra loi he thong. Vui long thu lai sau."
): string {
  if (!error) return fallbackMessage;

  let errorCode = "";
  let errorMessage = "";

  if (typeof error === "string") {
    errorMessage = error;
  } else if (error instanceof Error) {
    errorMessage = error.message || "";
    errorCode = (error as ErrorWithCode).code || "";
  } else if (typeof error === "object") {
    const typedError = error as SerializableError;
    errorCode = typedError.code || typedError.errorCode || "";
    errorMessage = typedError.message || typedError.error || "";
  }

  const cleanMsg = errorMessage.toLowerCase();
  const cleanCode = errorCode.toLowerCase();

  if (cleanMsg.includes("failed to fetch") || cleanMsg.includes("fetch failed") || cleanMsg.includes("typeerror")) {
    return "Khong the ket noi toi may chu. Vui long kiem tra ket noi Internet hoac thu lai sau.";
  }
  if (cleanCode.includes("unauthorized") || cleanMsg.includes("unauthorized") || cleanMsg.includes("401")) {
    return "Phien dang nhap khong hop le hoac da het han.";
  }
  if (cleanCode.includes("forbidden") || cleanMsg.includes("forbidden") || cleanMsg.includes("403")) {
    return "Ban khong co quyen thuc hien thao tac nay.";
  }
  if (cleanMsg.includes("email") && cleanMsg.includes("already")) {
    return "Dia chi email nay da duoc su dung.";
  }
  if (cleanMsg.includes("invalid credential") || cleanMsg.includes("email hoac mat khau khong chinh xac")) {
    return "Email hoac mat khau khong chinh xac.";
  }
  if (cleanMsg.includes("khong tim thay") || cleanMsg.includes("khong ton tai") || cleanMsg.includes("not found")) {
    return "Du lieu yeu cau khong ton tai tren he thong.";
  }
  if (cleanMsg.includes("permission denied") || cleanMsg.includes("insufficient permissions")) {
    return "Tai khoan cua ban khong du quyen han de thuc hien thao tac nay.";
  }
  if (cleanMsg.includes("network")) {
    return "Loi ket noi mang. Vui long kiem tra duong truyen Internet.";
  }

  return errorMessage || fallbackMessage;
}
