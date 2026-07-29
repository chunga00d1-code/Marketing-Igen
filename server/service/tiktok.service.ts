/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
import { broadcastEvent } from "../socket";
import { MarketingContentModel } from "../model/marketing-content.model";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { UserModel } from "../model/user.model";
import { telegramService } from "./telegram.service";
import { cloudinaryService } from "./cloudinary.service";
import jwt from "jsonwebtoken";
import { createHmac, timingSafeEqual } from "crypto";

const TIKTOK_API_BASE = "https://open.tiktokapis.com";
const TIKTOK_OAUTH_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";

function getTikTokRedirectUri(target?: string) {
  if (target === "company") {
    return String(
      process.env.TIKTOK_BUSINESS_REDIRECT_URI ||
      `${String(process.env.APP_URL || "").replace(/\/$/, "")}/api/v1/tiktok-business/oauth/callback`
    ).trim();
  }
  return String(
    process.env.TIKTOK_REDIRECT_URI ||
    `${String(process.env.APP_URL || "").replace(/\/$/, "")}/api/v1/tiktok/oauth/callback`
  ).trim();
}

function getTikTokClientKey(target?: string) {
  if (target === "company") {
    return String(process.env.TIKTOK_BUSINESS_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY || "").trim();
  }
  return String(process.env.TIKTOK_CLIENT_KEY || "").trim();
}

function getTikTokClientSecret(target?: string) {
  if (target === "company") {
    return String(process.env.TIKTOK_BUSINESS_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET || "").trim();
  }
  return String(process.env.TIKTOK_CLIENT_SECRET || "").trim();
}

function getOAuthStateSecret() {
  return String(process.env.JWT_ACCESS_SECRET || "your_jwt_access_secret_key");
}

function encodeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeStringEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function verifyWebhookRequest(input: {
  signature?: string;
  rawBody?: string;
  relayToken?: string;
}) {
  const signature = String(input.signature || "").trim();
  const clientSecrets = [
    String(process.env.TIKTOK_BUSINESS_CLIENT_SECRET || "").trim(),
    String(process.env.TIKTOK_CLIENT_SECRET || "").trim(),
  ].filter((secret, index, all) => Boolean(secret) && all.indexOf(secret) === index);
  if (signature && clientSecrets.length > 0 && input.rawBody) {
    const parts = new Map(
      signature.split(",").map((part) => {
        const separatorIndex = part.indexOf("=");
        return separatorIndex > 0
          ? [part.slice(0, separatorIndex).trim(), part.slice(separatorIndex + 1).trim()]
          : ["", ""];
      })
    );
    const timestamp = parts.get("t") || "";
    const receivedSignature = parts.get("s") || "";
    const timestampSeconds = Number(timestamp);
    if (
      timestamp
      && receivedSignature
      && Number.isFinite(timestampSeconds)
      && Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds) <= 5 * 60
    ) {
      return clientSecrets.some((clientSecret) => {
        const expectedSignature = createHmac("sha256", clientSecret)
          .update(`${timestamp}.${input.rawBody}`)
          .digest("hex");
        return safeStringEqual(receivedSignature, expectedSignature);
      });
    }
    return false;
  }

  const expectedRelayToken = String(process.env.TIKTOK_WEBHOOK_SECRET || "").trim();
  if (expectedRelayToken) {
    return safeStringEqual(String(input.relayToken || "").trim(), expectedRelayToken);
  }
  return process.env.NODE_ENV !== "production";
}

export function getTikTokSourceVideoUrl(videoUrl: string, appBaseUrl: string) {
  const normalizedAppBaseUrl = String(appBaseUrl || "").replace(/\/$/, "");
  if (!normalizedAppBaseUrl) {
    throw new Error("APP_URL is required for TikTok Direct Post.");
  }

  const appOrigin = new URL(normalizedAppBaseUrl).origin;
  const videoOrigin = new URL(videoUrl).origin;
  return videoOrigin === appOrigin
    ? videoUrl
    : `${normalizedAppBaseUrl}/api/v1/media/video-proxy?url=${encodeURIComponent(videoUrl)}`;
}

export function extractTikTokWebhookIdentifiers(payload: any) {
  const event = payload?.event || payload?.data?.event || payload?.type || payload?.event_type || "unknown";
  let serializedContent: Record<string, any> = {};
  if (typeof payload?.content === "string" && payload.content.trim()) {
    try {
      const parsedContent = JSON.parse(payload.content);
      if (parsedContent && typeof parsedContent === "object" && !Array.isArray(parsedContent)) {
        serializedContent = parsedContent;
      }
    } catch {
      serializedContent = {};
    }
  } else if (payload?.content && typeof payload.content === "object" && !Array.isArray(payload.content)) {
    serializedContent = payload.content;
  }
  const data = payload?.data
    || (Object.keys(serializedContent).length > 0 ? serializedContent : payload);

  return {
    eventType: String(event || "unknown"),
    cardId: String(data?.cardId || data?.metadata?.cardId || payload?.cardId || "").trim(),
    publishId: String(
      data?.publishId ||
      data?.publish_id ||
      data?.postSubmissionId ||
      data?.post_submission_id ||
      payload?.publishId ||
      payload?.publish_id ||
      payload?.postSubmissionId ||
      payload?.post_submission_id ||
      ""
    ).trim(),
    postId: String(
      data?.postId ||
      data?.post_id ||
      data?.videoId ||
      data?.video_id ||
      data?.publicaly_available_post_id?.[0] ||
      payload?.postId ||
      payload?.post_id ||
      ""
    ).trim(),
    shareUrl: String(data?.shareUrl || data?.share_url || payload?.shareUrl || payload?.share_url || "").trim(),
    status: String(
      data?.status ||
      data?.publishStatus ||
      data?.publish_status ||
      payload?.status ||
      payload?.publishStatus ||
      payload?.publish_status ||
      ""
    ).trim(),
    messageText: String(data?.reason || data?.fail_reason || data?.message?.text || data?.text || payload?.text || "").trim(),
    conversationId: String(data?.conversationId || data?.conversation_id || payload?.conversationId || "").trim(),
    senderId: String(data?.senderId || data?.sender_id || payload?.senderId || "").trim(),
    raw: payload,
  };
}

function mapWebhookStatusToCardStatus(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (!normalized) return null;
  if (normalized === "post.publish.complete" || normalized === "post.publish.publicly_available") {
    return "published";
  }
  if (normalized === "post.publish.failed") {
    return "failed";
  }
  if (["publish_complete", "completed", "success", "published", "posted"].includes(normalized)) {
    return "published";
  }
  if (["failed", "error", "rejected", "canceled", "cancelled"].includes(normalized)) {
    return "failed";
  }
  if (["processing", "pending", "queued", "scheduled", "submitted"].includes(normalized)) {
    return "processing";
  }
  return null;
}

function translateTikTokError(errorMsg: string, errorCode?: string): string {
  const code = String(errorCode || "").trim().toLowerCase();
  const msg = String(errorMsg || "").toLowerCase();

  if (code === "unaudited_client_can_only_post_to_private_accounts" || msg.includes("unaudited_client_can_only_post_to_private_accounts") || msg.includes("private accounts")) {
    return "Ứng dụng TikTok chưa được cấp quyền đăng công khai cho tài khoản này. Hãy kiểm tra lại sản phẩm Content Posting API, scope video.publish và trạng thái phê duyệt trên TikTok Developer Console.";
  }

  if (code === "url_ownership_unverified" || msg.includes("url_ownership_unverified") || msg.includes("url ownership")) {
    return "Đường dẫn video chưa được xác minh quyền sở hữu tên miền trên TikTok Developer Portal. Hãy đảm bảo biến môi trường `APP_URL` trong file `.env` đã trỏ chính xác về tên miền ERP của bạn (domain này phải trùng với tên miền của Redirect URI được cấu hình trên ứng dụng TikTok Developer).";
  }

  if (code === "access_token_invalid" || code === "invalid_access_token" || msg.includes("access_token") || msg.includes("token is invalid")) {
    return "Liên kết kết nối với tài khoản TikTok của bạn đã hết hạn, bị thu hồi hoặc không hợp lệ. Vui lòng truy cập Cài đặt -> Liên kết MXH trên hệ thống ERP để hủy kết nối cũ và liên kết lại tài khoản TikTok của bạn.";
  }

  if (code === "scope_not_authorized" || msg.includes("scope_not_authorized") || msg.includes("scope")) {
    return "Tài khoản TikTok của bạn chưa cấp quyền đăng video (thiếu scope video.publish). Vui lòng truy cập Cài đặt -> Liên kết MXH, hủy liên kết cũ và thực hiện liên kết lại tài khoản TikTok, đồng thời tích chọn đầy đủ các quyền yêu cầu trên màn hình ủy quyền của TikTok.";
  }

  if (code === "rate_limit_exceeded" || msg.includes("rate_limit") || msg.includes("too many requests")) {
    return "Tần suất gửi yêu cầu lên TikTok quá nhanh hoặc ứng dụng đã vượt quá giới hạn lượt gọi API trong ngày. Vui lòng đợi ít phút và thử lại sau.";
  }

  if (code === "spam_risk" || msg.includes("spam") || msg.includes("spam_risk")) {
    return "Bài viết bị TikTok đánh giá có nguy cơ spam hoặc tài khoản của bạn đã đạt giới hạn đăng bài trong ngày của TikTok API. Để khắc phục:\n" +
      "1. Đổi lại nội dung tiêu đề/caption của bài viết để tránh trùng lặp.\n" +
      "2. Chỉnh sửa nhẹ video (thêm bộ lọc, thay đổi độ dài) để tránh bị hệ thống quét trùng lặp.\n" +
      "3. Chờ 24 giờ rồi thử đăng lại.";
  }

  if (code === "invalid_params" || msg.includes("invalid_params") || msg.includes("parameter")) {
    return "Tham số gửi lên TikTok không hợp lệ. Vui lòng kiểm tra lại caption (không chứa ký tự lạ bị cấm), cấu hình video hoặc kích thước file gửi đi.";
  }

  if (code === "invalid_file_upload" || msg.includes("file specification") || msg.includes("video format")) {
    return "Tệp video không đáp ứng đúng tiêu chuẩn kỹ thuật yêu cầu của TikTok. Vui lòng đảm bảo:\n" +
      "- Video có thời lượng tối thiểu là 3 giây và tối đa là 10 phút.\n" +
      "- Định dạng video là MP4 hoặc WebM.\n" +
      "- Kích thước tệp không quá lớn (khuyên dùng dưới 50MB).";
  }

  return errorMsg;
}

async function savePublishTracking(
  cardId: string,
  payload: { publishId?: string; provider?: string; status?: string; shareUrl?: string; postId?: string }
) {
  const updateData: Record<string, any> = {
    tiktokWebhookUpdatedAt: new Date(),
  };

  if (payload.publishId) updateData.tiktokPublishId = payload.publishId;
  if (payload.provider) updateData.tiktokProvider = payload.provider;
  if (payload.shareUrl) updateData.tiktokShareUrl = payload.shareUrl;
  if (payload.postId) updateData.tiktokPostId = payload.postId;

  const mappedStatus = mapWebhookStatusToCardStatus(payload.status || "");
  if (mappedStatus) {
    updateData.status = mappedStatus;
    if (mappedStatus === "published") {
      updateData.publishedAt = new Date();
    }
  }

  await MarketingContentModel.findByIdAndUpdate(cardId, { $set: updateData });
}

async function refreshCompanyTikTokToken(integrationId: string, integration: any): Promise<string> {
  const clientKey = integration.verifyToken || process.env.TIKTOK_CLIENT_KEY || "";
  const clientSecret = integration.appSecret || process.env.TIKTOK_CLIENT_SECRET || "";
  const refreshToken = integration.refreshToken;

  if (!refreshToken) {
    throw new Error("No refresh token found for TikTok integration.");
  }

  console.log(`[TikTok Service] Refreshing company token for integration ID: ${integrationId}`);



  const bodyParams = new URLSearchParams();
  bodyParams.set("client_key", clientKey);
  bodyParams.set("client_secret", clientSecret);
  bodyParams.set("grant_type", "refresh_token");
  bodyParams.set("refresh_token", refreshToken);

  const response = await (globalThis as any).fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParams.toString(),
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`TikTok token refresh response is not JSON: ${text}`);
  }

  if (!response.ok || (data.error?.code !== "ok" && !data.access_token)) {
    const errCode = data.error?.code || response.status;
    const errMsg = data.error?.message || "Unknown TikTok refresh token error";
    throw new Error(`TikTok token refresh failed [${errCode}]: ${errMsg}`);
  }

  const newAccessToken = data.access_token;
  const newRefreshToken = data.refresh_token || refreshToken;
  const expiresIn = data.expires_in || 86400; // in seconds
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await SocialIntegrationModel.findByIdAndUpdate(integrationId, {
    $set: {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenExpiredAt: expiresAt,
    }
  });

  return newAccessToken;
}

async function refreshUserTikTokToken(userId: string, integration: any): Promise<string> {
  const clientKey = integration.clientKey || integration.verifyToken || process.env.TIKTOK_CLIENT_KEY || "";
  const clientSecret = integration.clientSecret || integration.appSecret || process.env.TIKTOK_CLIENT_SECRET || "";
  const refreshToken = integration.refreshToken;

  if (!refreshToken) {
    throw new Error("No refresh token found for user TikTok integration.");
  }

  console.log(`[TikTok Service] Refreshing user token for user ID: ${userId}`);



  const bodyParams = new URLSearchParams();
  bodyParams.set("client_key", clientKey);
  bodyParams.set("client_secret", clientSecret);
  bodyParams.set("grant_type", "refresh_token");
  bodyParams.set("refresh_token", refreshToken);

  const response = await (globalThis as any).fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParams.toString(),
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`TikTok token refresh response is not JSON: ${text}`);
  }

  if (!response.ok || (data.error?.code !== "ok" && !data.access_token)) {
    const errCode = data.error?.code || response.status;
    const errMsg = data.error?.message || "Unknown TikTok refresh token error";
    throw new Error(`TikTok token refresh failed [${errCode}]: ${errMsg}`);
  }

  const newAccessToken = data.access_token;
  const newRefreshToken = data.refresh_token || refreshToken;
  const expiresIn = data.expires_in || 86400; // in seconds
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  await UserModel.findByIdAndUpdate(userId, {
    $set: {
      "tiktokIntegration.accessToken": newAccessToken,
      "tiktokIntegration.refreshToken": newRefreshToken,
      "tiktokIntegration.tokenExpiredAt": expiresAt,
    }
  });

  return newAccessToken;
}

async function resolveDirectCredentials(
  integrationId?: string,
  companyCode?: string,
  accessToken?: string,
  username?: string,
  userId?: string
) {
  let resolvedAccessToken = accessToken;
  let resolvedUsername = username;

  if (integrationId) {
    console.log(`[TikTok Service] Loading TikTok integration from DB: ${integrationId}`);
    const integration = await SocialIntegrationModel.findById(integrationId);

    if (!integration) {
      throw new Error("Không tìm thấy tài khoản kết nối TikTok trên hệ thống.");
    }
    if (companyCode && integration.companyCode !== companyCode) {
      throw new Error("Tài khoản kết nối không thuộc phạm vi công ty của bạn.");
    }
    if (!integration.isConnected) {
      throw new Error("Tài khoản kết nối TikTok đang bị vô hiệu hóa.");
    }
    if (integration.platform !== "TikTok") {
      throw new Error("Tài khoản kết nối được chọn không phải TikTok.");
    }
    if (!integration.accessToken) {
      throw new Error("Tai khoan TikTok nay chua co access token de dang bai.");
    }

    const expiryTime = integration.tokenExpiredAt ? new Date(integration.tokenExpiredAt).getTime() : 0;
    const now = Date.now();
    if (integration.refreshToken && (expiryTime === 0 || expiryTime <= now || expiryTime - now < 10 * 60 * 1000)) {
      try {
        resolvedAccessToken = await refreshCompanyTikTokToken(integrationId, integration);
      } catch (err: any) {
        console.warn(`[TikTok Service] Tự động refresh company token gặp lỗi: ${err.message}. Sử dụng token cũ.`);
        resolvedAccessToken = integration.accessToken;

        // Gửi cảnh báo về Telegram và đánh dấu ngắt kết nối
        const errMsg = String(err.message || "").toLowerCase();
        if (errMsg.includes("refresh_token") || errMsg.includes("token refresh failed") || errMsg.includes("invalid_grant") || errMsg.includes("expired")) {
          await SocialIntegrationModel.findByIdAndUpdate(integrationId, { isConnected: false });
          const { telegramService } = require("./telegram.service");
          await telegramService.sendIntegrationDisconnectAlert(
            "TikTok",
            integration.displayName || "TikTok Account",
            integration.username || "unknown",
            integration.companyCode || "SYSTEM",
            `Không thể tự động làm mới Refresh Token TikTok. Chi tiết: ${err.message || err}`
          ).catch((e: any) => console.error("[TikTok Service] Không thể gửi cảnh báo lỗi Token về Telegram:", e));
        }
      }
    } else {
      resolvedAccessToken = integration.accessToken;
    }
    resolvedUsername = integration.username || resolvedUsername;
  } else if (userId) {
    const user = await UserModel.findById(userId);
    const integration = user?.tiktokIntegration;
    if (integration && integration.isConnected) {
      const expiryTime = integration.tokenExpiredAt ? new Date(integration.tokenExpiredAt).getTime() : 0;
      const now = Date.now();
      if (integration.refreshToken && (expiryTime === 0 || expiryTime <= now || expiryTime - now < 10 * 60 * 1000)) {
        try {
          resolvedAccessToken = await refreshUserTikTokToken(userId, integration);
        } catch (err: any) {
          console.warn(`[TikTok Service] Tu dong refresh user token gap loi: ${err.message}. Su dung token cu.`);
          resolvedAccessToken = integration.accessToken || accessToken;

          const errMsg = String(err.message || "").toLowerCase();
          if (errMsg.includes("refresh_token") || errMsg.includes("token refresh failed") || errMsg.includes("invalid_grant") || errMsg.includes("expired")) {
            await UserModel.findByIdAndUpdate(userId, { "tiktokIntegration.isConnected": false });
            const { telegramService } = require("./telegram.service");
            await telegramService.sendIntegrationDisconnectAlert(
              "TikTok",
              `TikTok Account (User: ${user?.email || "unknown"})`,
              integration.username || "unknown",
              user?.companyCode || "SYSTEM",
              `Không thể tự động làm mới Refresh Token TikTok cá nhân. Chi tiết: ${err.message || err}`
            ).catch((e: any) => console.error("[TikTok Service] Không thể gửi cảnh báo lỗi Token về Telegram:", e));
          }
        }
      } else {
        resolvedAccessToken = integration.accessToken || accessToken;
      }
      resolvedUsername = integration.username || username;
    }
  }

  if (!resolvedAccessToken) {
    throw new Error("Thiếu accessToken TikTok. Hãy kết nối tài khoản TikTok hoặc truyền integrationId hợp lệ.");
  }

  return {
    accessToken: resolvedAccessToken,
    username: resolvedUsername || "",
  };
}

async function oldResolveDirectCredentials(integrationId?: any, companyCode?: any, accessToken?: any, username?: any) {





  let resolvedAccessToken = accessToken;
  let resolvedUsername = username;

  if (integrationId) {
    console.log(`[TikTok Service] Loading TikTok integration from DB: ${integrationId}`);
    const integration = await SocialIntegrationModel.findById(integrationId);

    if (!integration) {
      throw new Error("Khong tim thay tai khoan ket noi TikTok tren he thong.");
    }
    if (companyCode && integration.companyCode !== companyCode) {
      throw new Error("Tai khoan ket noi khong thuoc pham vi cong ty cua ban.");
    }
    if (!integration.isConnected) {
      throw new Error("Tai khoan ket noi TikTok dang bi vo hieu hoa.");
    }
    if (integration.platform !== "TikTok") {
      throw new Error("Tai khoan ket noi duoc chon khong phai TikTok.");
    }
    if (!integration.accessToken) {
      throw new Error("Tai khoan TikTok nay chua co access token de dang bai.");
    }

    resolvedAccessToken = integration.accessToken;
    resolvedUsername = integration.username || resolvedUsername;
  }

  if (!resolvedAccessToken) {
    throw new Error("Thieu accessToken TikTok. Hay ket noi tai khoan TikTok hoac truyen integrationId hop le.");
  }

  return {
    accessToken: resolvedAccessToken,
    username: resolvedUsername || "",
  };
}

type TikTokOAuthTarget = "personal" | "company";

type TikTokDirectPostOptions = {
  allowComment?: boolean;
  allowDuet?: boolean;
  allowStitch?: boolean;
  brandContentToggle?: boolean;
  brandContent?: boolean;
  brandOrganic?: boolean;
  isAigc?: boolean;
  videoDurationSeconds?: number;
  consentAccepted?: boolean;
};

function signOAuthState(payload: {
  userId: string;
  companyCode?: string;
  email?: string;
  target: TikTokOAuthTarget;
  integrationId?: string;
}) {
  return jwt.sign(payload, getOAuthStateSecret(), { expiresIn: "10m" });
}

function verifyOAuthState(state: string) {
  return jwt.verify(state, getOAuthStateSecret()) as {
    userId: string;
    companyCode?: string;
    email?: string;
    target: TikTokOAuthTarget;
    integrationId?: string;
  };
}

async function exchangeCodeForOAuthToken(code: string, credentials?: { clientKey: string; clientSecret: string }, target?: string) {
  const clientKey = String(credentials?.clientKey || getTikTokClientKey(target)).trim();
  const clientSecret = String(credentials?.clientSecret || getTikTokClientSecret(target)).trim();
  const redirectUri = getTikTokRedirectUri(target);

  if (!clientKey || !clientSecret || !redirectUri) {
    throw new Error("TikTok OAuth chua du cau hinh client key, client secret hoac redirect uri.");
  }

  const bodyParams = new URLSearchParams();
  bodyParams.set("client_key", clientKey);
  bodyParams.set("client_secret", clientSecret);
  bodyParams.set("code", code);
  bodyParams.set("grant_type", "authorization_code");
  bodyParams.set("redirect_uri", redirectUri);

  const response = await (globalThis as any).fetch(`${TIKTOK_API_BASE}/v2/oauth/token/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: bodyParams.toString(),
  });

  const text = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`TikTok OAuth response is not JSON: ${text}`);
  }

  if (!response.ok || (!data.access_token && data.error)) {
    const errCode = data.error?.code || response.status;
    const errMsg = data.error?.message || data.description || "Unknown TikTok OAuth error";
    throw new Error(`TikTok OAuth failed [${errCode}]: ${errMsg}`);
  }

  return data;
}

async function resolveOAuthClientCredentials(params: {
  userId: string;
  companyCode?: string;
  target: TikTokOAuthTarget;
  integrationId?: string;
}) {
  if (params.target === "company") {
    let clientKey = "";
    let clientSecret = "";

    if (params.integrationId) {
      const integration = await SocialIntegrationModel.findById(params.integrationId).lean();
      if (integration) {
        if (integration.companyCode !== params.companyCode) {
          throw new Error("Ban khong co quyen ket noi kenh TikTok cua doanh nghiep khac.");
        }
        clientKey = String(integration.verifyToken || "").trim();
        clientSecret = String(integration.appSecret || "").trim();
      }
    }

    if (!clientKey) clientKey = getTikTokClientKey("company");
    if (!clientSecret) clientSecret = getTikTokClientSecret("company");

    return { clientKey, clientSecret };
  }

  const user = await UserModel.findById(params.userId).lean();
  const integration = user?.tiktokIntegration;
  const clientKey = String(integration?.clientKey || getTikTokClientKey("personal") || "").trim();
  const clientSecret = String(integration?.clientSecret || getTikTokClientSecret("personal") || "").trim();

  return { clientKey, clientSecret };
}

async function savePersonalTikTokOAuthIntegration(params: {
  userId: string;
  tokenData: any;
  creatorInfo: any;
  clientKey?: string;
}) {
  const expiresAt = params.tokenData.expires_in
    ? new Date(Date.now() + Number(params.tokenData.expires_in) * 1000)
    : undefined;

  await UserModel.findByIdAndUpdate(params.userId, {
    $set: {
      tiktokIntegration: {
        isConnected: true,
        username: params.creatorInfo.data.creatorUsername || "",
        displayName: params.creatorInfo.data.creatorNickname || params.creatorInfo.data.creatorUsername || "TikTok User",
        avatarUrl: params.creatorInfo.data.creatorAvatarUrl || "",
        accessToken: params.tokenData.access_token,
        refreshToken: params.tokenData.refresh_token || "",
        tokenExpiredAt: expiresAt,
        clientKey: params.clientKey || getTikTokClientKey(),
        scopes: String(params.tokenData.scope || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        connectedAt: new Date(),
        privacyLevel:
          params.creatorInfo.data.privacyLevelOptions?.includes("PUBLIC_TO_EVERYONE")
            ? "PUBLIC_TO_EVERYONE"
            : params.creatorInfo.data.privacyLevelOptions?.includes("MUTUAL_FOLLOW_FRIENDS")
              ? "MUTUAL_FOLLOW_FRIENDS"
              : "SELF_ONLY",
        isMock: false,
      },
    },
  });
}

async function saveCompanyTikTokOAuthIntegration(params: {
  userId: string;
  email?: string;
  companyCode?: string;
  integrationId?: string;
  tokenData: any;
  creatorInfo: any;
  clientKey?: string;
  clientSecret?: string;
}) {
  let resolvedCompanyCode = params.companyCode;
  if (!resolvedCompanyCode) {
    const user = await UserModel.findById(params.userId).lean();
    resolvedCompanyCode = user?.companyCode || "SYSTEM";
  }

  let existingAppSecret = "";
  let existingVerifyToken = "";

  if (params.integrationId) {
    const existing = await SocialIntegrationModel.findById(params.integrationId).lean();
    if (!existing) {
      throw new Error("Khong tim thay kenh TikTok doanh nghiep de cap nhat.");
    }
    if (existing.companyCode !== resolvedCompanyCode) {
      throw new Error("Ban khong co quyen cap nhat kenh TikTok cua doanh nghiep khac.");
    }
    existingAppSecret = String(existing.appSecret || "").trim();
    existingVerifyToken = String(existing.verifyToken || "").trim();
  }

  const expiresAt = params.tokenData.expires_in
    ? new Date(Date.now() + Number(params.tokenData.expires_in) * 1000)
    : undefined;

  const payload = {
    companyCode: resolvedCompanyCode,
    platform: "TikTok" as const,
    displayName: params.creatorInfo.data.creatorNickname || params.creatorInfo.data.creatorUsername || "TikTok Company",
    username: params.creatorInfo.data.creatorUsername || "",
    avatarUrl: params.creatorInfo.data.creatorAvatarUrl || "",
    accessToken: params.tokenData.access_token,
    refreshToken: params.tokenData.refresh_token || "",
    tokenExpiredAt: expiresAt,
    appSecret: params.clientSecret || existingAppSecret || getTikTokClientSecret(),
    verifyToken: params.clientKey || existingVerifyToken || getTikTokClientKey(),
    isConnected: true,
    createdBy: params.email || params.userId,
    isMock: false,
    connectedAt: new Date(),
  };

  if (params.integrationId) {
    await SocialIntegrationModel.findByIdAndUpdate(params.integrationId, {
      $set: payload,
    });
    return;
  }

  await SocialIntegrationModel.findOneAndUpdate(
    {
      companyCode: resolvedCompanyCode,
      platform: "TikTok",
      username: payload.username,
    },
    {
      $set: payload,
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }
  );
}

export const tiktokService = {
  verifyWebhookRequest,

  async createOAuthSession(params: {
    userId: string;
    companyCode?: string;
    email?: string;
    target: string;
    integrationId?: string;
  }) {
    const target = params.target === "company" ? "company" : "personal";
    const credentials = await resolveOAuthClientCredentials({
      userId: params.userId,
      companyCode: params.companyCode,
      target,
      integrationId: params.integrationId || undefined,
    });

    const clientKey = credentials.clientKey;
    const clientSecret = credentials.clientSecret;
    const redirectUri = getTikTokRedirectUri(target);

    if (!clientKey || !clientSecret || !redirectUri) {
      throw new Error(
        target === "company"
          ? "Kenh TikTok doanh nghiep va he thong deu chua cau hinh Client Key va Client Secret."
          : "Tai khoan TikTok ca nhan va he thong deu chua cau hinh Client Key va Client Secret."
      );
    }

    const state = signOAuthState({
      userId: params.userId,
      companyCode: params.companyCode,
      email: params.email,
      target,
      integrationId: params.integrationId || undefined,
    });

    const query = new URLSearchParams({
      client_key: clientKey,
      response_type: "code",
      scope: "user.info.basic,video.publish",
      redirect_uri: redirectUri,
      state,
    });

    return {
      status: "success",
      data: {
        authUrl: `${TIKTOK_OAUTH_AUTHORIZE_URL}?${query.toString()}`,
        redirectUri,
        target,
      },
    };
  },

  async completeOAuthCallback(params: {
    code: string;
    state: string;
    error?: string;
    errorDescription?: string;
  }) {
    if (params.error) {
      throw new Error(params.errorDescription || params.error || "Nguoi dung da huy ket noi TikTok.");
    }
    if (!params.code || !params.state) {
      throw new Error("Thieu code hoac state khi TikTok callback.");
    }

    const statePayload = verifyOAuthState(params.state);

    const credentials = await resolveOAuthClientCredentials({
      userId: statePayload.userId,
      companyCode: statePayload.companyCode,
      target: statePayload.target,
      integrationId: statePayload.integrationId,
    });
    const tokenData = await exchangeCodeForOAuthToken(params.code, credentials, statePayload.target);
    const creatorInfo = await this.getCreatorInfo(tokenData.access_token);

    if (statePayload.target === "company") {
      await saveCompanyTikTokOAuthIntegration({
        userId: statePayload.userId,
        email: statePayload.email,
        companyCode: statePayload.companyCode,
        integrationId: statePayload.integrationId,
        tokenData,
        creatorInfo,
        clientKey: credentials.clientKey,
        clientSecret: credentials.clientSecret,
      });
    } else {
      await savePersonalTikTokOAuthIntegration({
        userId: statePayload.userId,
        tokenData,
        creatorInfo,
        clientKey: credentials.clientKey,
      });
    }

    return {
      ok: true,
      target: statePayload.target,
      profile: {
        username: creatorInfo.data.creatorUsername || "",
        displayName: creatorInfo.data.creatorNickname || creatorInfo.data.creatorUsername || "TikTok User",
        avatarUrl: creatorInfo.data.creatorAvatarUrl || "",
      },
    };
  },

  renderOAuthPopupPage(payload: { ok: boolean; target?: string; profile?: any; error?: string }) {
    const safeMessage = encodeHtml(
      payload.ok
        ? payload.target === "company"
          ? "Đã kết nối TikTok doanh nghiệp thành công."
          : "Đã kết nối TikTok cá nhân thành công."
        : payload.error || "Kết nối TikTok thất bại."
    );

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>TikTok OAuth</title>
    <style>
      body{font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
      .card{max-width:420px;width:100%;background:#111827;border:1px solid #334155;border-radius:20px;padding:24px;box-shadow:0 20px 40px rgba(0,0,0,.35)}
      .badge{display:inline-block;padding:6px 10px;border-radius:999px;font-size:12px;font-weight:700;background:${payload.ok ? "#052e16" : "#450a0a"};color:${payload.ok ? "#86efac" : "#fca5a5"}}
      h1{font-size:20px;margin:16px 0 8px;color:#fff}
      p{font-size:14px;line-height:1.6;color:#cbd5e1;margin:0}
    </style>
  </head>
  <body>
    <div class="card">
      <span class="badge">${payload.ok ? "SUCCESS" : "FAILED"}</span>
      <h1>${payload.ok ? "TikTok Đã Kết Nối" : "TikTok Kết Nối Thất Bại"}</h1>
      <p>${safeMessage}</p>
    </div>
    <script>
      (function () {
        var payload = ${JSON.stringify(payload)};
        try {
          localStorage.setItem("tt_oauth_result", JSON.stringify(payload));
        } catch (e) {}
        try {
          if (window.opener && window.location.origin) {
            window.opener.postMessage({ type: "TIKTOK_OAUTH_RESULT", payload: payload }, window.location.origin);
          }
        } catch (e) {}
        setTimeout(function () { window.close(); }, 900);
      })();
    </script>
  </body>
</html>`;
  },

  async publishVideo(
    cardId: string,
    caption: string,
    videoUrl: string,
    privacyLevel: string = "SELF_ONLY",
    accessToken?: string,
    username?: string,
    scheduledTime?: string,
    integrationId?: string,
    companyCode?: string,
    postOptions: TikTokDirectPostOptions = {},
    requestUserId?: string
  ) {
    void scheduledTime;

    const supportedPrivacyLevels = new Set([
      "PUBLIC_TO_EVERYONE",
      "MUTUAL_FOLLOW_FRIENDS",
      "FOLLOWER_OF_CREATOR",
      "SELF_ONLY",
    ]);
    const previewVideoDuration = Number(postOptions.videoDurationSeconds || 0);
    const hasCommercialDisclosure = Boolean(postOptions.brandContentToggle);
    const brandContent = hasCommercialDisclosure && Boolean(postOptions.brandContent);
    const brandOrganic = hasCommercialDisclosure && Boolean(postOptions.brandOrganic);

    if (postOptions.consentAccepted !== true) {
      throw new Error("Bạn phải xác nhận điều khoản TikTok trước khi đăng.");
    }
    if (!supportedPrivacyLevels.has(privacyLevel)) {
      throw new Error("Quyền riêng tư TikTok không hợp lệ.");
    }
    if (!Number.isFinite(previewVideoDuration) || previewVideoDuration <= 0) {
      throw new Error("Không đọc được thời lượng video để kiểm tra giới hạn TikTok.");
    }
    if (hasCommercialDisclosure && !brandContent && !brandOrganic) {
      throw new Error("Vui lòng chọn Your Brand, Branded Content hoặc cả hai trước khi đăng.");
    }
    if (brandContent && privacyLevel === "SELF_ONLY") {
      throw new Error("Branded Content không thể đăng ở chế độ Chỉ mình tôi.");
    }

    let userId: string | undefined = requestUserId;
    const card = cardId ? await MarketingContentModel.findById(cardId) : null;
    if (requestUserId) {
      if (!card) {
        throw new Error("Không tìm thấy nội dung TikTok cần đăng.");
      }
      if (companyCode && card.companyCode !== companyCode) {
        throw new Error("Bạn không có quyền đăng nội dung của doanh nghiệp khác.");
      }
      if (card.channel !== "TikTok") {
        throw new Error("Nội dung được chọn không thuộc kênh TikTok.");
      }
      if (!card.videoUrl || card.videoUrl !== videoUrl) {
        throw new Error("Video đã thay đổi. Vui lòng mở lại màn duyệt TikTok để kiểm tra preview.");
      }
    }
    if (!userId && card?.authorUid) {
      userId = card.authorUid;
    }

    const credentials = await resolveDirectCredentials(integrationId, companyCode, accessToken, username, userId);
    const creatorInfo = await this.getCreatorInfo(credentials.accessToken);
    const availablePrivacy = creatorInfo.data.privacyLevelOptions || [];
    const maxDuration = Number(creatorInfo.data.maxVideoPostDurationSec || 0);

    if (!creatorInfo.data.creatorNickname || availablePrivacy.length === 0 || maxDuration <= 0) {
      throw new Error("Tài khoản TikTok hiện chưa thể đăng thêm bài. Vui lòng thử lại sau.");
    }

    if (!availablePrivacy.includes(privacyLevel)) {
      throw new Error("Quyền riêng tư đã chọn không còn khả dụng. Vui lòng mở lại màn đăng TikTok và chọn lại.");
    }

    const verifiedVideoDuration = await cloudinaryService.getVideoDurationSeconds(videoUrl);
    if (verifiedVideoDuration > maxDuration) {
      throw new Error(`Video dài ${Math.ceil(verifiedVideoDuration)} giây, vượt giới hạn ${maxDuration} giây của tài khoản TikTok này.`);
    }

    const resolveDisableFlag = (allowed: boolean | undefined, disabledByCreator: boolean) =>
      disabledByCreator || (typeof allowed === "boolean" ? !allowed : false);

    console.log(
      `[TikTok Service -> Direct API] Publishing card ${cardId} for ${credentials.username || "unknown"} with privacy ${privacyLevel}`
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: `Bearer ${credentials.accessToken}`,
    };

    const appBaseUrl = String(process.env.APP_URL || "").replace(/\/$/, "");
    if (!appBaseUrl) {
      throw new Error("APP_URL chưa được cấu hình để TikTok tải video từ domain đã xác minh.");
    }
    const sourceVideoUrl = getTikTokSourceVideoUrl(videoUrl, appBaseUrl);
    const parsedSourceUrl = new URL(sourceVideoUrl);
    if (process.env.NODE_ENV === "production" && parsedSourceUrl.protocol !== "https:") {
      throw new Error("TikTok Direct Post yêu cầu URL video HTTPS trên domain đã xác minh.");
    }

    const initPayload = {
      post_info: {
        title: caption || "",
        privacy_level: privacyLevel,
        disable_duet: resolveDisableFlag(postOptions.allowDuet, creatorInfo.data.duetDisabled),
        disable_comment: resolveDisableFlag(postOptions.allowComment, creatorInfo.data.commentDisabled),
        disable_stitch: resolveDisableFlag(postOptions.allowStitch, creatorInfo.data.stitchDisabled),
        video_cover_timestamp_ms: 1000,
        brand_content_toggle: brandContent,
        brand_organic_toggle: brandOrganic,
        is_aigc: Boolean(postOptions.isAigc),
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: sourceVideoUrl,
      },
    };

    let publishId = "";

    try {
      const initResponse = await (globalThis as any).fetch(`${TIKTOK_API_BASE}/v2/post/publish/video/init/`, {
        method: "POST",
        headers,
        body: JSON.stringify(initPayload),
      });

      const initText = await initResponse.text();
      let initData: any = {};
      try {
        initData = JSON.parse(initText);
      } catch {
        throw new Error(`TikTok API response is not JSON: ${initText.slice(0, 200)}`);
      }

      if (!initResponse.ok || initData.error?.code !== "ok") {
        const errCode = initData.error?.code || initResponse.status;
        const errMsg = initData.error?.message || "Unknown TikTok API error";
        const translatedMsg = translateTikTokError(errMsg, String(errCode));
        throw new Error(`Khoi tao bai dang TikTok that bai: ${translatedMsg}`);
      }

      publishId = String(initData.data?.publish_id || "").trim();
      if (!publishId) {
        throw new Error("TikTok API did not return publish_id.");
      }
    } catch (error: any) {
      console.error("[tiktokService.publishVideo] Direct init error:", error);

      const errMsg = String(error.message || "").toLowerCase();
      const isTokenError = errMsg.includes("access_token") || errMsg.includes("token is invalid") || errMsg.includes("hết hạn, bị thu hồi") || errMsg.includes("unauthorized");
      if (isTokenError) {
        if (integrationId) {
          await SocialIntegrationModel.findByIdAndUpdate(integrationId, { isConnected: false });
          const integration = await SocialIntegrationModel.findById(integrationId);
          const { telegramService } = require("./telegram.service");
          await telegramService.sendIntegrationDisconnectAlert(
            "TikTok",
            integration?.displayName || "TikTok Account",
            integration?.username || "unknown",
            integration?.companyCode || "SYSTEM",
            `Mất kết nối Token TikTok khi đang đăng video. Chi tiết: ${error.message}`
          ).catch((e: any) => console.error("[TikTok Service] Không thể gửi cảnh báo lỗi Token về Telegram:", e));
        } else if (userId) {
          await UserModel.findByIdAndUpdate(userId, { "tiktokIntegration.isConnected": false });
          const user = await UserModel.findById(userId);
          const integration = user?.tiktokIntegration;
          const { telegramService } = require("./telegram.service");
          await telegramService.sendIntegrationDisconnectAlert(
            "TikTok",
            `TikTok Account (User: ${user?.email || "unknown"})`,
            integration?.username || "unknown",
            user?.companyCode || "SYSTEM",
            `Mất kết nối Token TikTok cá nhân khi đang đăng video. Chi tiết: ${error.message}`
          ).catch((e: any) => console.error("[TikTok Service] Không thể gửi cảnh báo lỗi Token về Telegram:", e));
        }
      }

      if (error.message.startsWith("Khoi tao bai dang TikTok that bai:")) {
        throw error;
      }
      const translatedMsg = translateTikTokError(error.message);
      throw new Error(`Khoi tao bai dang TikTok that bai: ${translatedMsg}`);
    }

    const maxPolls = 10;
    const pollIntervalMs = 3000;

    for (let attempt = 1; attempt <= maxPolls; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      try {
        const statusResponse = await (globalThis as any).fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
          method: "POST",
          headers,
          body: JSON.stringify({ publish_id: publishId }),
        });

        const statusText = await statusResponse.text();
        let statusData: any = {};
        try {
          statusData = JSON.parse(statusText);
        } catch {
          console.warn(`[TikTok Service] Poll #${attempt}: response is not JSON`);
          continue;
        }

        if (!statusResponse.ok || statusData.error?.code !== "ok") {
          const errCode = statusData.error?.code || statusResponse.status;
          const errMsg = statusData.error?.message || "Unknown TikTok API error";
          const translatedMsg = translateTikTokError(errMsg, String(errCode));
          throw new Error(`Lay trang thai TikTok that bai: ${translatedMsg}`);
        }

        const publishStatus = String(statusData.data?.status || "").trim();
        const videoId = String(statusData.data?.publicaly_available_post_id?.[0] || "").trim();
        const shareUrl = videoId
          ? `https://www.tiktok.com/@${credentials.username || "user"}/video/${videoId}`
          : "";

        if (publishStatus === "PUBLISH_COMPLETE") {
          // Gửi thông báo tự động tới Telegram với link video TikTok
          const telegramChatId = process.env.TELEGRAM_CHAT_ID;
          if (telegramChatId && shareUrl) {
            const cardTitle = card?.title || caption || "Không có tiêu đề";
            const message = [
              "📢 <b>ĐÃ ĐĂNG VIDEO LÊN TIKTOK!</b> 📢",
              "=============================",
              `📝 <b>Tiêu đề:</b> ${cardTitle}`,
              `🔗 <b>Đường dẫn video:</b>`,
              `<a href="${shareUrl}">${shareUrl}</a>`,
              "=============================",
            ].join("\n");
            telegramService.sendMessage(telegramChatId, message).catch((err) => {
              console.error("[Telegram Bot] Lỗi gửi thông báo đăng bài TikTok:", err);
            });
          }

          return {
            status: "success",
            message: "Dang video len TikTok thanh cong",
            provider: "tiktok_direct",
            data: {
              publishId,
              postId: videoId,
              shareUrl,
              publishStatus,
              success: true,
            },
          };
        }

        if (publishStatus === "FAILED") {
          const failReason = statusData.data?.fail_reason || "Khong ro ly do";
          const translatedMsg = translateTikTokError(failReason);
          throw new Error(`TikTok tu choi dang video: ${translatedMsg}`);
        }
      } catch (error: any) {
        if (String(error.message || "").includes("TikTok")) {
          throw error;
        }
        console.warn(`[TikTok Service] Poll #${attempt} network issue: ${error.message}`);
      }
    }

    return {
      status: "pending",
      message: "Video dang duoc TikTok xu ly. Hay doi webhook callback hoac kiem tra lai sau.",
      provider: "tiktok_direct",
      data: {
        publishId,
        shareUrl: "",
        publishStatus: "PROCESSING",
        success: false,
      },
    };
  },

  async registerPublishTracking(cardId: string, result: any) {
    const provider = String(result?.provider || "").trim();
    const data = result?.data || {};
    const publishId = String(data?.publishId || "").trim();
    const postId = String(data?.postId || "").trim();
    const shareUrl = String(data?.shareUrl || "").trim();
    const publishStatus = String(data?.publishStatus || result?.status || "").trim();

    if (!cardId) return;

    await savePublishTracking(cardId, {
      publishId,
      provider,
      status: publishStatus,
      shareUrl,
      postId,
    });
  },

  /**
   * Reconciles Direct Post requests that are still being processed by TikTok.
   * Webhooks remain the primary source of truth; this is only a bounded
   * fallback for late or missed provider callbacks. Final states deliberately
   * flow through processWebhook so cards, campaign slots and statistics stay
   * in one idempotent state transition path.
   */
  async reconcilePendingPublishes(options?: { limit?: number }) {
    const limit = Math.max(1, Math.min(Number(options?.limit || 10), 25));
    const pendingContents = await MarketingContentModel.find({
      channel: "TikTok",
      status: "processing",
      tiktokPublishId: { $exists: true, $ne: "" },
    })
      .select("_id companyCode authorUid integrationId tiktokPublishId tiktokWebhookUpdatedAt")
      .sort({ tiktokWebhookUpdatedAt: 1, _id: 1 })
      .limit(limit)
      .lean();

    const results: Array<Record<string, unknown>> = [];
    for (const content of pendingContents) {
      const cardId = String(content._id);
      const publishId = String(content.tiktokPublishId || "").trim();

      try {
        const credentials = await resolveDirectCredentials(
          content.integrationId ? String(content.integrationId) : undefined,
          content.companyCode,
          undefined,
          undefined,
          content.authorUid
        );
        const response = await (globalThis as any).fetch(`${TIKTOK_API_BASE}/v2/post/publish/status/fetch/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json; charset=UTF-8",
            Authorization: `Bearer ${credentials.accessToken}`,
          },
          body: JSON.stringify({ publish_id: publishId }),
        });
        const responseText = await response.text();
        let data: any = {};
        try {
          data = JSON.parse(responseText);
        } catch {
          throw new Error("TikTok status response is not JSON.");
        }

        if (!response.ok || data.error?.code !== "ok") {
          const code = String(data.error?.code || response.status);
          const message = String(data.error?.message || "Unknown TikTok API error");
          throw new Error(`TikTok status fetch failed [${code}]: ${translateTikTokError(message, code)}`);
        }

        const providerStatus = String(data.data?.status || "PROCESSING").trim().toUpperCase();
        const postId = String(data.data?.publicaly_available_post_id?.[0] || "").trim();
        const shareUrl = postId && credentials.username
          ? `https://www.tiktok.com/@${credentials.username}/video/${postId}`
          : "";

        if (providerStatus === "PUBLISH_COMPLETE") {
          await this.processWebhook({
            event: "post.publish.complete",
            content: JSON.stringify({
              publish_id: publishId,
              publicaly_available_post_id: postId ? [postId] : [],
              share_url: shareUrl,
              status: providerStatus,
            }),
          });
          results.push({ cardId, publishId, status: "published", providerStatus, postId, shareUrl });
          continue;
        }

        if (providerStatus === "FAILED") {
          const failReason = String(data.data?.fail_reason || "TikTok rejected the video.");
          await this.processWebhook({
            event: "post.publish.failed",
            content: JSON.stringify({
              publish_id: publishId,
              fail_reason: failReason,
              status: providerStatus,
            }),
          });
          results.push({ cardId, publishId, status: "failed", providerStatus, error: failReason });
          continue;
        }

        results.push({ cardId, publishId, status: "processing", providerStatus });
      } catch (error: any) {
        results.push({
          cardId,
          publishId,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      checked: pendingContents.length,
      published: results.filter((result) => result.status === "published").length,
      failed: results.filter((result) => result.status === "failed").length,
      processing: results.filter((result) => result.status === "processing").length,
      errors: results.filter((result) => result.status === "error").length,
      results,
    };
  },

  async processWebhook(payload: any) {
    const parsed = extractTikTokWebhookIdentifiers(payload);
    const normalizedEvent = parsed.eventType.toLowerCase();

    const matchedCard = parsed.cardId
      ? await MarketingContentModel.findById(parsed.cardId)
      : await MarketingContentModel.findOne({
        $or: [
          ...(parsed.publishId ? [{ tiktokPublishId: parsed.publishId }] : []),
          ...(parsed.postId ? [{ tiktokPostId: parsed.postId }] : []),
        ],
      });

    if (normalizedEvent.includes("message")) {
      const messageEvent = {
        platform: "tiktok",
        conversationId: parsed.conversationId,
        senderId: parsed.senderId,
        text: parsed.messageText,
        cardId: matchedCard?._id?.toString() || parsed.cardId || "",
        raw: parsed.raw,
      };

      broadcastEvent("tiktok_message_received", messageEvent);

      return {
        status: "success",
        type: "message",
        matchedCardId: matchedCard?._id?.toString() || null,
      };
    }

    if (!matchedCard) {
      return {
        status: "ignored",
        type: "publish",
        reason: "card_not_found",
        publishId: parsed.publishId,
        postId: parsed.postId,
      };
    }

    const mappedStatus = mapWebhookStatusToCardStatus(parsed.status || parsed.eventType);
    const updateData: Record<string, any> = {
      tiktokLastWebhookEvent: parsed.eventType,
      tiktokWebhookUpdatedAt: new Date(),
    };

    if (parsed.publishId) updateData.tiktokPublishId = parsed.publishId;
    if (parsed.postId) updateData.tiktokPostId = parsed.postId;
    if (parsed.shareUrl) updateData.tiktokShareUrl = parsed.shareUrl;
    if (mappedStatus) updateData.status = mappedStatus;
    let didTransitionCard = false;
    if (mappedStatus === "published") {
      const transitionedCard = await MarketingContentModel.findOneAndUpdate(
        { _id: matchedCard._id, status: { $ne: "published" } },
        { $set: { ...updateData, publishedAt: new Date() } },
        { new: true }
      ).lean();
      didTransitionCard = Boolean(transitionedCard);
      if (didTransitionCard) {
        updateData.publishedAt = new Date();
      } else {
        delete updateData.status;
        delete updateData.publishedAt;
      }
    } else if (mappedStatus === "failed") {
      const transitionedCard = await MarketingContentModel.findOneAndUpdate(
        { _id: matchedCard._id, status: { $nin: ["published", "failed"] } },
        { $set: updateData },
        { new: true }
      ).lean();
      didTransitionCard = Boolean(transitionedCard);
      if (!didTransitionCard) delete updateData.status;
    } else if (mappedStatus === "processing" && ["published", "failed"].includes(matchedCard.status)) {
      // A delayed non-final provider event must not reopen a terminal card.
      delete updateData.status;
    }

    if (mappedStatus === "published" && didTransitionCard) {
      updateData.publishedAt = new Date();
      // Gửi thông báo tự động tới Telegram với link video TikTok từ webhook callback
      const telegramChatId = process.env.TELEGRAM_CHAT_ID;
      const shareUrl = parsed.shareUrl || matchedCard.tiktokShareUrl;
      if (telegramChatId && shareUrl) {
        const message = [
          "📢 <b>ĐÃ ĐĂNG VIDEO LÊN TIKTOK (WEBHOOK)!</b> 📢",
          "=============================",
          `📝 <b>Tiêu đề:</b> ${matchedCard.title || "Không có tiêu đề"}`,
          `🔗 <b>Đường dẫn video:</b>`,
          `<a href="${shareUrl}">${shareUrl}</a>`,
          "=============================",
        ].join("\n");
        telegramService.sendMessage(telegramChatId, message).catch((err) => {
          console.error("[Telegram Bot] Lỗi gửi thông báo đăng bài TikTok webhook:", err);
        });
      }
    }

    const updatedCard = await MarketingContentModel.findByIdAndUpdate(
      matchedCard._id,
      { $set: updateData },
      { new: true }
    ).lean();

    // A provider webhook is the source of truth for an asynchronous Direct
    // Post. Complete the campaign slot as well as the content card so the
    // calendar, campaign stats, and retry state do not remain stuck at
    // `publishing`.
    const campaignSlot = await MarketingCampaignSlotModel.findOne({
      marketingContentId: matchedCard._id,
      companyCode: matchedCard.companyCode,
    });
    const terminalCardStatusMatches =
      (mappedStatus === "published" && updatedCard?.status === "published") ||
      (mappedStatus === "failed" && updatedCard?.status === "failed");
    if (campaignSlot && terminalCardStatusMatches) {
      const previousStatus = campaignSlot.status;
      let transitionedSlot = null;
      if (mappedStatus === "published" && previousStatus !== "published") {
        const publishedPostId = parsed.postId || campaignSlot.publishedPostId || "";
        const publishedUrl = parsed.shareUrl || updatedCard?.tiktokShareUrl || campaignSlot.publishedUrl || "";
        transitionedSlot = await MarketingCampaignSlotModel.findOneAndUpdate(
          { _id: campaignSlot._id, status: previousStatus },
          {
            $set: {
              status: "published",
              publishedPostId,
              publishedUrl,
              lockId: undefined,
              lockedAt: undefined,
              lockExpiresAt: undefined,
              lastError: undefined,
            },
            $push: {
              transitions: {
                from: previousStatus,
                to: "published",
                reason: "TikTok publish completion webhook",
                at: new Date(),
              },
            },
          },
          { new: true }
        );
      } else if (mappedStatus === "failed" && previousStatus !== "failed" && previousStatus !== "published") {
        transitionedSlot = await MarketingCampaignSlotModel.findOneAndUpdate(
          { _id: campaignSlot._id, status: previousStatus },
          {
            $set: {
              status: "failed",
              lockId: undefined,
              lockedAt: undefined,
              lockExpiresAt: undefined,
              lastError: {
                type: "provider",
                message: parsed.messageText || "TikTok báo lỗi khi xử lý video.",
                occurredAt: new Date(),
              },
            },
            $push: {
              transitions: {
                from: previousStatus,
                to: "failed",
                reason: "TikTok publish failure webhook",
                at: new Date(),
              },
            },
          },
          { new: true }
        );
      }

      if (transitionedSlot && (mappedStatus === "published" || mappedStatus === "failed")) {
        try {
          const { marketingCampaignService } = await import("./marketing-campaign.service");
          await marketingCampaignService.syncCampaignStatusAndStats(transitionedSlot.campaignId);
        } catch (error) {
          console.error("[TikTok Webhook] Campaign status sync failed:", error);
        }
      }
    }

    broadcastEvent("tiktok_post_updated", {
      cardId: String(matchedCard._id),
      publishId: parsed.publishId,
      postId: parsed.postId,
      status: mappedStatus || parsed.status || "updated",
      shareUrl: parsed.shareUrl,
      eventType: parsed.eventType,
      card: updatedCard,
    });

    return {
      status: "success",
      type: "publish",
      cardId: String(matchedCard._id),
      eventType: parsed.eventType,
      publishStatus: parsed.status,
    };
  },

  async getCreatorInfo(accessToken: string) {
    if (!accessToken) {
      throw new Error("Access Token TikTok khong duoc de trong.");
    }

    try {
      const response = await (globalThis as any).fetch(`${TIKTOK_API_BASE}/v2/post/publish/creator_info/query/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`TikTok API response is not JSON: ${text.slice(0, 200)}`);
      }

      if (!response.ok || data.error?.code !== "ok") {
        const errCode = data.error?.code || response.status;
        const errMsg = data.error?.message || "Unknown TikTok API error";
        throw new Error(`Lay thong tin creator that bai [${errCode}]: ${errMsg}`);
      }

      return {
        status: "success",
        message: "Lay thong tin creator TikTok thanh cong",
        data: {
          creatorAvatarUrl: data.data?.creator_avatar_url || "",
          creatorNickname: data.data?.creator_nickname || "",
          creatorUsername: data.data?.creator_username || "",
          privacyLevelOptions: data.data?.privacy_level_options || [],
          commentDisabled: data.data?.comment_disabled ?? false,
          duetDisabled: data.data?.duet_disabled ?? false,
          stitchDisabled: data.data?.stitch_disabled ?? false,
          maxVideoPostDurationSec: Number(data.data?.max_video_post_duration_sec || 0),
        },
      };
    } catch (error: any) {
      console.error("[tiktokService.getCreatorInfo] Error:", error);
      throw new Error(`Lay thong tin creator TikTok that bai: ${error.message}`);
    }
  },

  async getCreatorInfoForIntegration(params: {
    integrationId?: string;
    companyCode?: string;
    userId?: string;
  }) {
    const credentials = await resolveDirectCredentials(
      params.integrationId,
      params.companyCode,
      undefined,
      undefined,
      params.userId
    );
    return this.getCreatorInfo(credentials.accessToken);
  },

  async validateToken(username: string, accessToken: string) {
    if (!accessToken) {
      throw new Error("Thieu access token TikTok de xac thuc.");
    }

    try {
      console.log(`[TikTok Service] Validating direct TikTok token for "${username || "unknown"}"...`);
      const creatorInfo = await this.getCreatorInfo(accessToken);

      return {
        status: "success",
        message: "Xac thuc Access Token TikTok thanh cong",
        valid: true,
        provider: "tiktok_direct",
        displayName: creatorInfo.data.creatorNickname || creatorInfo.data.creatorUsername || username || "TikTok User",
        avatarUrl: creatorInfo.data.creatorAvatarUrl || "",
        privacyLevelOptions: creatorInfo.data.privacyLevelOptions,
      };
    } catch (error: any) {
      console.error("[tiktokService.validateToken] Error:", error);
      throw new Error(`Xac thuc token TikTok that bai: ${error.message}`);
    }
  },
  refreshCompanyTikTokToken,
  refreshUserTikTokToken,
};
