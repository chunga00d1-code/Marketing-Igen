import { getAccessToken } from "./authService";

export interface SocialIntegration {
  _id?: string;
  companyCode?: string;
  platform: "Facebook" | "TikTok" | "Zalo";
  displayName: string;
  username?: string;
  avatarUrl?: string;
  isConnected: boolean;
  connectedAt?: string;
  createdBy: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiredAt?: string;
  appSecret?: string;
  verifyToken?: string;
  isMock?: boolean;
  blotatoAccountId?: string;
  aiAutoReplyConfig?: any;
}

export const socialIntegrationService = {
  /**
   * Lấy danh sách liên kết mạng xã hội của doanh nghiệp (tự lọc theo companyCode trên server)
   */
  async getIntegrations(platform?: string): Promise<SocialIntegration[]> {
    const query = platform ? `?platform=${encodeURIComponent(platform)}` : "";
    const res = await fetch(`/api/v1/crud/social-integrations${query}`, {
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể lấy danh sách liên kết mạng xã hội.");
    }

    const result = await res.json();
    return result.data || [];
  },

  /**
   * Tạo liên kết mạng xã hội mới cho doanh nghiệp
   */
  async createIntegration(data: Partial<SocialIntegration>): Promise<SocialIntegration> {
    const res = await fetch("/api/v1/crud/social-integrations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể thêm tài khoản liên kết.");
    }

    const result = await res.json();
    return result.data;
  },

  /**
   * Cập nhật thông tin liên kết mạng xã hội
   */
  async updateIntegration(id: string, data: Partial<SocialIntegration>): Promise<SocialIntegration> {
    const res = await fetch(`/api/v1/crud/social-integrations/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể cập nhật tài khoản liên kết.");
    }

    const result = await res.json();
    return result.data;
  },

  /**
   * Xóa liên kết mạng xã hội
   */
  async deleteIntegration(id: string): Promise<void> {
    const res = await fetch(`/api/v1/crud/social-integrations/${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể xóa tài khoản liên kết.");
    }
  }
  ,

  async validateFacebookIntegration(data: { pageId: string; accessToken: string }): Promise<any> {
    const res = await fetch("/api/v1/facebook/validate-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(data),
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.message || result.details || "Khong the xac thuc Facebook Page.");
    }
    return result;
  },

  async validateZaloIntegration(data: { oaId: string; oaName?: string; accessToken: string }): Promise<any> {
    const res = await fetch("/api/v1/zalo/validate-integration", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(data),
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.message || "Khong the xac thuc Zalo OA.");
    }
    return result;
  },

  async validateTikTokIntegration(data: { username?: string; accessToken: string }): Promise<any> {
    const res = await fetch("/api/v1/tiktok/validate-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(data),
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.message || result.details || "Khong the xac thuc TikTok.");
    }
    return result;
  },

  async getTikTokOAuthUrl(
    target: "personal" | "company",
    integrationId?: string,
    clientKey?: string,
    clientSecret?: string
  ): Promise<string> {
    const query = new URLSearchParams({ target });
    if (integrationId) {
      query.set("integrationId", integrationId);
    }
    if (clientKey) {
      query.set("clientKey", clientKey);
    }
    if (clientSecret) {
      query.set("clientSecret", clientSecret);
    }

    const res = await fetch(`/api/v1/tiktok/oauth/start?${query.toString()}`, {
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.message || "Khong the khoi tao ket noi TikTok OAuth.");
    }

    return result.data?.authUrl || "";
  }
};
