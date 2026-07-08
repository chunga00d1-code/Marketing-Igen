import { broadcastEvent } from "../socket";
import { MarketingContentModel } from "../model/marketing-content.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { UserModel } from "../model/user.model";
import { telegramService } from "./telegram.service";
import jwt from "jsonwebtoken";

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

function verifyWebhookToken(token?: string) {
  const expectedToken = String(process.env.TIKTOK_WEBHOOK_SECRET || process.env.N8N_WEBHOOK_SECRET || "").trim();
  if (!expectedToken) {
    return true;
  }
  return String(token || "").trim() === expectedToken;
}

function extractWebhookIdentifiers(payload: any) {
  const event = payload?.event || payload?.data?.event || payload?.type || payload?.event_type || "unknown";
  const data = payload?.data || payload;

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
    messageText: String(data?.message?.text || data?.text || payload?.text || "").trim(),
    conversationId: String(data?.conversationId || data?.conversation_id || payload?.conversationId || "").trim(),
    senderId: String(data?.senderId || data?.sender_id || payload?.senderId || "").trim(),
    raw: payload,
  };
}

function mapWebhookStatusToCardStatus(status: string) {
  const normalized = String(status || "").toLowerCase();
  if (!normalized) return null;
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
    return "Ứng dụng TikTok hiện đang ở chế độ thử nghiệm (Staging). TikTok chỉ cho phép đăng video lên tài khoản thỏa mãn 2 điều kiện sau:\n" +
           "1. Tài khoản đó đã được thêm vào mục 'Sandbox Accounts' trong trang cấu hình ứng dụng trên TikTok Developer Console.\n" +
           "2. Bạn PHẢI chuyển tài khoản TikTok đó sang chế độ 'Tài khoản riêng tư' (vào ứng dụng TikTok trên điện thoại -> Cài đặt & Quyền riêng tư -> Quyền riêng tư -> bật chế độ 'Tài khoản riêng tư').";
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

  if (integration.isMock) {
    const mockAccessToken = `mock_access_token_refreshed_${Date.now()}`;
    const mockRefreshToken = `mock_refresh_token_refreshed_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 86400 * 1000); // 24h
    await SocialIntegrationModel.findByIdAndUpdate(integrationId, {
      $set: {
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        tokenExpiredAt: expiresAt,
      }
    });
    return mockAccessToken;
  }

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

  if (integration.isMock) {
    const mockAccessToken = `mock_access_token_refreshed_${Date.now()}`;
    const mockRefreshToken = `mock_refresh_token_refreshed_${Date.now()}`;
    const expiresAt = new Date(Date.now() + 86400 * 1000); // 24h
    await UserModel.findByIdAndUpdate(userId, {
      $set: {
        "tiktokIntegration.accessToken": mockAccessToken,
        "tiktokIntegration.refreshToken": mockRefreshToken,
        "tiktokIntegration.tokenExpiredAt": expiresAt,
      }
    });
    return mockAccessToken;
  }

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

    const expiryTime = integration.tokenExpiredAt ? new Date(integration.tokenExpiredAt).getTime() : 0;
    const now = Date.now();
    if (integration.refreshToken && (expiryTime === 0 || expiryTime <= now || expiryTime - now < 10 * 60 * 1000)) {
      try {
        resolvedAccessToken = await refreshCompanyTikTokToken(integrationId, integration);
      } catch (err: any) {
        console.warn(`[TikTok Service] Tu dong refresh company token gap loi: ${err.message}. Su dung token cu.`);
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
    throw new Error("Thieu accessToken TikTok. Hay ket noi TikTok sandbox hoac truyen integrationId hop le.");
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
    throw new Error("Thieu accessToken TikTok. Hay ket noi TikTok sandbox hoac truyen integrationId hop le.");
  }

  return {
    accessToken: resolvedAccessToken,
    username: resolvedUsername || "",
  };
}

type TikTokOAuthTarget = "personal" | "company";

function signOAuthState(payload: {
  userId: string;
  companyCode?: string;
  email?: string;
  target: TikTokOAuthTarget;
  integrationId?: string;
  clientKey?: string;
  clientSecret?: string;
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
    clientKey?: string;
    clientSecret?: string;
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
  clientSecret?: string;
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
        clientSecret: params.clientSecret || getTikTokClientSecret(),
        scopes: String(params.tokenData.scope || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        connectedAt: new Date(),
        privacyLevel:
          params.creatorInfo.data.privacyLevelOptions?.includes("SELF_ONLY") ? "SELF_ONLY" : "MUTUAL_FOLLOW_FRIENDS",
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
  if (!params.companyCode) {
    throw new Error("Tai khoan hien tai chua co companyCode de luu kenh TikTok doanh nghiep.");
  }

  let existingAppSecret = "";
  let existingVerifyToken = "";

  if (params.integrationId) {
    const existing = await SocialIntegrationModel.findById(params.integrationId).lean();
    if (!existing) {
      throw new Error("Khong tim thay kenh TikTok doanh nghiep de cap nhat.");
    }
    if (existing.companyCode !== params.companyCode) {
      throw new Error("Ban khong co quyen cap nhat kenh TikTok cua doanh nghiep khac.");
    }
    existingAppSecret = String(existing.appSecret || "").trim();
    existingVerifyToken = String(existing.verifyToken || "").trim();
  }

  const expiresAt = params.tokenData.expires_in
    ? new Date(Date.now() + Number(params.tokenData.expires_in) * 1000)
    : undefined;

  const payload = {
    companyCode: params.companyCode,
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
      companyCode: params.companyCode,
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
  verifyWebhookToken,

  async createOAuthSession(params: {
    userId: string;
    companyCode?: string;
    email?: string;
    target: string;
    integrationId?: string;
    clientKey?: string;
    clientSecret?: string;
  }) {
    const target = params.target === "company" ? "company" : "personal";
    const credentials = await resolveOAuthClientCredentials({
      userId: params.userId,
      companyCode: params.companyCode,
      target,
      integrationId: params.integrationId || undefined,
    });

    const clientKey = params.clientKey?.trim() || credentials.clientKey;
    const clientSecret = params.clientSecret?.trim() || credentials.clientSecret;
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
      clientKey,
      clientSecret,
    });

    const query = new URLSearchParams({
      client_key: clientKey,
      response_type: "code",
      scope: "user.info.basic,video.publish,business.message",
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
    
    let clientKey = statePayload.clientKey || "";
    let clientSecret = statePayload.clientSecret || "";

    if (!clientKey || !clientSecret) {
      const resolved = await resolveOAuthClientCredentials({
        userId: statePayload.userId,
        companyCode: statePayload.companyCode,
        target: statePayload.target,
        integrationId: statePayload.integrationId,
      });
      clientKey = resolved.clientKey;
      clientSecret = resolved.clientSecret;
    }

    const credentials = { clientKey, clientSecret };
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
        clientSecret: credentials.clientSecret,
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
          ? "Ket noi TikTok doanh nghiep thanh cong."
          : "Ket noi TikTok ca nhan thanh cong."
        : payload.error || "Ket noi TikTok that bai."
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
      <h1>${payload.ok ? "TikTok da ket noi" : "TikTok ket noi that bai"}</h1>
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
    companyCode?: string
  ) {
    void scheduledTime;

    let userId: string | undefined = undefined;
    const card = cardId ? await MarketingContentModel.findById(cardId) : null;
    if (card?.authorUid) {
      userId = card.authorUid;
    }

    const credentials = await resolveDirectCredentials(integrationId, companyCode, accessToken, username, userId);

    console.log(
      `[TikTok Service -> Direct API] Publishing card ${cardId} for ${credentials.username || "unknown"} with privacy ${privacyLevel}`
    );

    const headers: Record<string, string> = {
      "Content-Type": "application/json; charset=UTF-8",
      Authorization: `Bearer ${credentials.accessToken}`,
    };

    const initPayload = {
      post_info: {
        title: caption || "",
        privacy_level: privacyLevel,
        disable_duet: false,
        disable_comment: false,
        disable_stitch: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: (videoUrl && process.env.APP_URL && !videoUrl.startsWith(String(process.env.APP_URL).replace(/\/$/, ""))) ? `${String(process.env.APP_URL).replace(/\/$/, "")}/api/v1/media/video-proxy?url=${encodeURIComponent(videoUrl)}` : videoUrl,
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

  async processWebhook(payload: any) {
    const parsed = extractWebhookIdentifiers(payload);
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

    const mappedStatus = mapWebhookStatusToCardStatus(parsed.status);
    const updateData: Record<string, any> = {
      tiktokLastWebhookEvent: parsed.eventType,
      tiktokWebhookUpdatedAt: new Date(),
    };

    if (parsed.publishId) updateData.tiktokPublishId = parsed.publishId;
    if (parsed.postId) updateData.tiktokPostId = parsed.postId;
    if (parsed.shareUrl) updateData.tiktokShareUrl = parsed.shareUrl;
    if (mappedStatus) updateData.status = mappedStatus;
    if (mappedStatus === "published") {
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
        },
      };
    } catch (error: any) {
      console.error("[tiktokService.getCreatorInfo] Error:", error);
      throw new Error(`Lay thong tin creator TikTok that bai: ${error.message}`);
    }
  },

  async validateToken(username: string, accessToken: string) {
    if (!accessToken) {
      throw new Error("Thieu access token TikTok de xac thuc sandbox.");
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
