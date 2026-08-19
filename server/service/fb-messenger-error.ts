export const FACEBOOK_STANDARD_MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;

export type FacebookMessengerErrorCode =
  | "FB_MESSAGING_WINDOW_EXPIRED"
  | "FB_INTEGRATION_NOT_FOUND"
  | "FB_ACCESS_TOKEN_INVALID"
  | "FB_RATE_LIMITED"
  | "FB_PERMISSION_DENIED"
  | "FB_SEND_FAILED";

export class FacebookMessengerError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: FacebookMessengerErrorCode,
    public readonly providerStatus?: number,
  ) {
    super(message);
    this.name = "FacebookMessengerError";
  }
}

export function createFacebookIntegrationNotFoundError(): FacebookMessengerError {
  return new FacebookMessengerError(
    "Không tìm thấy kết nối Facebook hợp lệ cho Page này trong công ty của bạn. Vui lòng kết nối lại Page trong phần Tích hợp.",
    403,
    "FB_INTEGRATION_NOT_FOUND",
  );
}

export function isFacebookReplyWindowOpen(lastInboundAt: Date | string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false;
  const timestamp = new Date(lastInboundAt).getTime();
  return Number.isFinite(timestamp) && now - timestamp <= FACEBOOK_STANDARD_MESSAGING_WINDOW_MS;
}

export function createFacebookReplyWindowExpiredError(): FacebookMessengerError {
  return new FacebookMessengerError(
    "Không thể gửi tin nhắn vì khách hàng đã không nhắn cho Page trong hơn 24 giờ. Theo chính sách Facebook Messenger, hãy yêu cầu khách hàng gửi một tin nhắn mới rồi phản hồi lại.",
    422,
    "FB_MESSAGING_WINDOW_EXPIRED",
  );
}

export function translateFacebookSendError(rawText: string, providerStatus: number): FacebookMessengerError {
  let errorCode = 0;
  let errorSubcode = 0;
  let providerMessage = "";

  try {
    const parsed = JSON.parse(rawText);
    errorCode = Number(parsed?.error?.code || 0);
    errorSubcode = Number(parsed?.error?.error_subcode || 0);
    providerMessage = String(parsed?.error?.message || "");
  } catch {
    providerMessage = rawText;
  }

  const normalizedMessage = providerMessage.toLowerCase();
  if (
    errorSubcode === 2018278 ||
    normalizedMessage.includes("outside the allowed time") ||
    normalizedMessage.includes("ngoài khoảng thời gian cho phép")
  ) {
    return createFacebookReplyWindowExpiredError();
  }

  if (errorCode === 190 || errorCode === 102 || normalizedMessage.includes("access token")) {
    return new FacebookMessengerError(
      "Kết nối Facebook của Page đã hết hạn hoặc không còn hợp lệ. Vui lòng kết nối lại tài khoản Facebook trong phần Tích hợp rồi thử lại.",
      401,
      "FB_ACCESS_TOKEN_INVALID",
      providerStatus,
    );
  }

  if (errorCode === 4 || errorCode === 613 || providerStatus === 429) {
    return new FacebookMessengerError(
      "Facebook đang giới hạn số lượng yêu cầu. Vui lòng chờ một lúc rồi gửi lại.",
      429,
      "FB_RATE_LIMITED",
      providerStatus,
    );
  }

  if (errorCode === 10 || errorCode === 200 || providerStatus === 403) {
    return new FacebookMessengerError(
      "Page chưa có đủ quyền gửi tin nhắn Facebook. Vui lòng kiểm tra quyền pages_messaging hoặc kết nối lại Page.",
      403,
      "FB_PERMISSION_DENIED",
      providerStatus,
    );
  }

  return new FacebookMessengerError(
    "Facebook chưa thể gửi tin nhắn lúc này. Vui lòng thử lại sau; nếu lỗi tiếp diễn, hãy kiểm tra kết nối Page.",
    502,
    "FB_SEND_FAILED",
    providerStatus,
  );
}
