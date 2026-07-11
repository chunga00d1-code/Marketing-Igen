type ErrorWithCode = Error & { code?: string };

type SerializableError = {
  code?: string;
  errorCode?: string;
  message?: string;
  error?: string;
};

export function parseAppError(
  error: unknown,
  fallbackMessage = "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau."
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
    return "Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối Internet hoặc thử lại sau.";
  }
  if (cleanCode.includes("unauthorized") || cleanMsg.includes("unauthorized") || cleanMsg.includes("401")) {
    return "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.";
  }
  if (cleanCode.includes("forbidden") || cleanMsg.includes("forbidden") || cleanMsg.includes("403")) {
    return "Bạn không có quyền thực hiện thao tác này.";
  }
  if (cleanMsg.includes("email") && cleanMsg.includes("already")) {
    return "Địa chỉ email này đã được sử dụng.";
  }
  if (cleanMsg.includes("invalid credential") || cleanMsg.includes("email hoac mat khau khong chinh xac")) {
    return "Email hoặc mật khẩu không chính xác.";
  }
  if (cleanMsg.includes("khong tim thay") || cleanMsg.includes("khong ton tai") || cleanMsg.includes("not found")) {
    return "Dữ liệu yêu cầu không tồn tại trên hệ thống.";
  }
  if (cleanMsg.includes("permission denied") || cleanMsg.includes("insufficient permissions")) {
    return "Tài khoản của bạn không đủ quyền hạn để thực hiện thao tác này.";
  }
  if (cleanMsg.includes("network")) {
    return "Lỗi kết nối mạng. Vui lòng kiểm tra đường truyền Internet.";
  }

  return errorMessage || fallbackMessage;
}
