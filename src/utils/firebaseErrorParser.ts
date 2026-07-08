/**
 * Firebase Error Parser Utility
 * Converts standard Firebase Auth, Firestore, and Storage errors into friendly Vietnamese messages.
 */

export interface FirestoreErrorInfo {
  error: string;
  operationType: string;
  path: string | null;
}

/**
 * Parses any Firebase or application error and returns a friendly localized message in Vietnamese.
 * 
 * @param error The raw error object or message
 * @param fallbackMessage Fallback message if the error is unrecognized
 */
export function parseFirebaseError(error: any, fallbackMessage: string = "Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau."): string {
  if (!error) return fallbackMessage;

  let errorCode = "";
  let errorMessage = "";

  // 1. Extract error code and message from various formats
  if (typeof error === "string") {
    errorMessage = error;
  } else if (error instanceof Error) {
    errorMessage = error.message || "";
    // Some custom firebase errors carry .code property
    if ("code" in error) {
      errorCode = (error as any).code || "";
    }
  } else if (typeof error === "object") {
    errorCode = error.code || error.errorCode || "";
    errorMessage = error.message || error.error || "";
  }

  // 2. Handle stringified JSON error thrown by handleFirestoreError
  if (errorMessage.trim().startsWith("{") && errorMessage.trim().endsWith("}")) {
    try {
      const parsed = JSON.parse(errorMessage) as FirestoreErrorInfo;
      if (parsed && parsed.error) {
        // Run the internal error message through the parser recursively
        return parseFirebaseError(parsed.error, fallbackMessage);
      }
    } catch {
      // Not a valid JSON, continue with normal parsing
    }
  }

  const cleanMsg = errorMessage.toLowerCase();
  const cleanCode = errorCode.toLowerCase();

  // 3. Match specific error codes or message substrings

  // --- Firebase Auth Errors ---
  if (cleanCode === "auth/email-already-in-use" || cleanMsg.includes("email-already-in-use")) {
    return "Địa chỉ email này đã được đăng ký cho một tài khoản khác.";
  }
  if (cleanCode === "auth/user-not-found" || cleanMsg.includes("user-not-found")) {
    return "Tài khoản không tồn tại trên hệ thống.";
  }
  if (cleanCode === "auth/wrong-password" || cleanMsg.includes("wrong-password")) {
    return "Mật khẩu đăng nhập không chính xác.";
  }
  if (cleanCode === "auth/invalid-credential" || cleanMsg.includes("invalid-credential")) {
    return "Email hoặc mật khẩu không chính xác.";
  }
  if (cleanCode === "auth/invalid-email" || cleanMsg.includes("invalid-email")) {
    return "Địa chỉ email không đúng định dạng.";
  }
  if (cleanCode === "auth/weak-password" || cleanMsg.includes("weak-password")) {
    return "Mật khẩu quá yếu. Vui lòng đặt mật khẩu tối thiểu 6 ký tự.";
  }
  if (cleanCode === "auth/requires-recent-login" || cleanMsg.includes("requires-recent-login")) {
    return "Hành động này yêu cầu bạn đăng nhập lại gần đây để xác thực bảo mật.";
  }
  if (cleanCode === "auth/too-many-requests" || cleanMsg.includes("too-many-requests")) {
    return "Tài khoản bị tạm khóa do đăng nhập sai quá nhiều lần. Vui lòng thử lại sau.";
  }
  if (cleanCode === "auth/network-request-failed" || cleanMsg.includes("network-request-failed") || cleanMsg.includes("network error")) {
    return "Lỗi kết nối mạng. Vui lòng kiểm tra lại đường truyền Internet.";
  }

  // --- Express JWT & Connection Errors ---
  if (cleanMsg.includes("failed to fetch") || cleanMsg.includes("fetch failed") || cleanMsg.includes("typeerror")) {
    return "Không thể kết nối tới máy chủ. Vui lòng kiểm tra kết nối Internet hoặc máy chủ đang bảo trì.";
  }
  if (cleanMsg.includes("tài khoản hoặc mật khẩu không chính xác") || cleanMsg.includes("email hoặc mật khẩu không chính xác") || cleanMsg.includes("wrong-password")) {
    return "Tài khoản hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.";
  }
  if (cleanMsg.includes("không tìm thấy") || cleanMsg.includes("không tồn tại")) {
    return "Tài khoản không tồn tại trên hệ thống.";
  }

  // --- Firebase Storage Errors ---
  if (cleanCode === "storage/quota-exceeded" || cleanMsg.includes("quota-exceeded") || cleanMsg.includes("quota exceeded")) {
    return "Không thể tải lên tệp tin: Dung lượng lưu trữ (Storage Quota) của hệ thống đã bị vượt quá giới hạn hoặc tài khoản thanh toán bị tạm khóa. Vui lòng liên hệ quản trị viên để nâng cấp gói hoặc kiểm tra lại thẻ Visa liên kết.";
  }
  if (cleanCode === "storage/unauthorized" || cleanMsg.includes("unauthorized") || cleanMsg.includes("permission denied")) {
    return "Tải lên tệp tin bị từ chối: Bạn không có quyền truy cập hoặc ghi dữ liệu vào thư mục lưu trữ này.";
  }
  if (cleanCode === "storage/object-not-found" || cleanMsg.includes("object-not-found")) {
    return "Không tìm thấy tệp tin được yêu cầu trên máy chủ lưu trữ.";
  }
  if (cleanCode === "storage/canceled" || cleanMsg.includes("canceled")) {
    return "Quá trình tải lên tệp tin đã bị hủy.";
  }
  if (cleanCode === "storage/unknown" || cleanMsg.includes("unknown error")) {
    return "Đã xảy ra lỗi không xác định trên hệ thống lưu trữ Storage.";
  }

  // --- Firestore Database Errors ---
  if (cleanMsg.includes("permission-denied") || cleanMsg.includes("permission denied") || cleanMsg.includes("missing or insufficient permissions")) {
    return "Thao tác bị từ chối: Tài khoản của bạn không có đủ quyền hạn để thực hiện hành động này trong cơ sở dữ liệu.";
  }
  if (cleanMsg.includes("unavailable") || cleanMsg.includes("service-unavailable")) {
    return "Dịch vụ cơ sở dữ liệu hiện không khả dụng. Vui lòng thử lại sau ít phút.";
  }
  if (cleanMsg.includes("deadline-exceeded")) {
    return "Thời gian kết nối quá hạn. Vui lòng kiểm tra lại đường truyền mạng.";
  }
  if (cleanMsg.includes("index") && cleanMsg.includes("query")) {
    return "Yêu cầu cơ sở dữ liệu thiếu chỉ mục (Index). Vui lòng tạo chỉ mục tương ứng trong Firebase Console.";
  }

  // 4. Return standard error message or fallback
  return errorMessage || fallbackMessage;
}
