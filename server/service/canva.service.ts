import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { UserModel } from "../model/user.model";

const API = "https://api.canva.com/rest/v1";
const TOKEN_EXPIRY_MARGIN_MS = 60_000;

interface CanvaTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
  message?: string;
}

interface CanvaDesignResponse {
  items?: unknown[];
  message?: string;
}

function cfg() {
  const id = String(process.env.CANVA_CLIENT_ID || "").trim();
  const secret = String(process.env.CANVA_CLIENT_SECRET || "").trim();
  const redirect = String(process.env.CANVA_REDIRECT_URI || "").trim();
  const key = String(process.env.CANVA_TOKEN_ENCRYPTION_KEY || "").trim();
  if (!id || !secret || !redirect || !key) {
    throw new Error("Thiếu cấu hình Canva trong .env.");
  }
  return { id, secret, redirect, key };
}

function crypt(value: string, decrypt = false) {
  const key = createHash("sha256").update(cfg().key).digest();
  if (!decrypt) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const body = Buffer.concat([cipher.update(value), cipher.final()]);
    return [
      iv.toString("base64url"),
      cipher.getAuthTag().toString("base64url"),
      body.toString("base64url"),
    ].join(".");
  }

  const [iv, tag, body] = value.split(".");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(body, "base64url")),
    decipher.final(),
  ]).toString();
}

async function exchange(body: URLSearchParams) {
  const config = cfg();
  const response = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.id}:${config.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const data = await response.json().catch(() => ({})) as CanvaTokenResponse;
  if (!response.ok || !data.access_token || !data.refresh_token) {
    throw new Error(data.error_description || data.message || data.error || "Canva không thể cấp quyền.");
  }
  return data as Required<Pick<CanvaTokenResponse, "access_token" | "refresh_token">> & CanvaTokenResponse;
}

async function saveTokens(
  userId: string,
  data: CanvaTokenResponse & { access_token: string; refresh_token: string },
) {
  await UserModel.updateOne(
    { _id: userId },
    {
      $set: {
        "canvaIntegration.connected": true,
        "canvaIntegration.accessToken": crypt(data.access_token),
        "canvaIntegration.refreshToken": crypt(data.refresh_token),
        "canvaIntegration.tokenExpiresAt": new Date(Date.now() + (data.expires_in || 14_400) * 1000),
      },
    },
  );
}

async function accessTokenFor(userId: string, forceRefresh = false) {
  const user = await UserModel.findById(userId).select("canvaIntegration");
  const integration = user?.canvaIntegration;
  if (!integration?.connected || !integration.accessToken || !integration.refreshToken) {
    throw new Error("Bạn chưa kết nối Canva.");
  }

  const expiresAt = integration.tokenExpiresAt?.getTime() || 0;
  if (!forceRefresh && expiresAt > Date.now() + TOKEN_EXPIRY_MARGIN_MS) {
    return crypt(integration.accessToken, true);
  }

  const data = await exchange(new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: crypt(integration.refreshToken, true),
  }));
  await saveTokens(userId, data);
  return data.access_token;
}

async function fetchDesigns(accessToken: string) {
  const response = await fetch(`${API}/designs?limit=30&sort_by=modified_descending`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await response.json().catch(() => ({})) as CanvaDesignResponse;
  return { response, data };
}

export const canvaService = {
  async start(userId: string) {
    const state = randomBytes(32).toString("hex");
    const verifier = randomBytes(64).toString("base64url");
    const config = cfg();
    await UserModel.updateOne(
      { _id: userId },
      {
        $set: {
          "canvaIntegration.oauthState": state,
          "canvaIntegration.oauthCodeVerifier": crypt(verifier),
          "canvaIntegration.oauthStateExpiresAt": new Date(Date.now() + 600_000),
        },
      },
    );
    const query = [
      ["code_challenge_method", "S256"],
      ["response_type", "code"],
      ["client_id", config.id],
      ["redirect_uri", config.redirect],
      ["scope", "design:content:read design:meta:read"],
      ["code_challenge", createHash("sha256").update(verifier).digest("base64url")],
      ["state", state],
    ].map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("&");
    return `https://www.canva.com/api/oauth/authorize?${query}`;
  },

  async callback(code: string, state: string) {
    if (!code || !state) throw new Error("Canva không trả về mã xác thực hợp lệ.");
    const user = await UserModel.findOne({
      "canvaIntegration.oauthState": state,
      "canvaIntegration.oauthStateExpiresAt": { $gt: new Date() },
    });
    if (!user?.canvaIntegration?.oauthCodeVerifier) {
      throw new Error("Phiên Canva hết hạn, hãy thử lại.");
    }
    const data = await exchange(new URLSearchParams({
      grant_type: "authorization_code",
      code,
      code_verifier: crypt(user.canvaIntegration.oauthCodeVerifier, true),
      redirect_uri: cfg().redirect,
    }));
    await saveTokens(String(user._id), data);
    await UserModel.updateOne(
      { _id: user._id },
      {
        $set: { "canvaIntegration.connectedAt": new Date() },
        $unset: {
          "canvaIntegration.oauthState": 1,
          "canvaIntegration.oauthCodeVerifier": 1,
          "canvaIntegration.oauthStateExpiresAt": 1,
        },
      },
    );
  },

  async status(userId: string) {
    const user = await UserModel.findById(userId).select("canvaIntegration");
    const integration = user?.canvaIntegration;
    return {
      connected: Boolean(
        integration?.connected
        && integration.accessToken
        && integration.refreshToken
      ),
      connectedAt: integration?.connectedAt,
    };
  },

  async designs(userId: string) {
    let token = await accessTokenFor(userId);
    let result = await fetchDesigns(token);
    if (result.response.status === 401) {
      token = await accessTokenFor(userId, true);
      result = await fetchDesigns(token);
    }
    if (!result.response.ok) {
      throw new Error(result.data.message || "Không thể tải mẫu Canva.");
    }
    return result.data.items || [];
  },
};
