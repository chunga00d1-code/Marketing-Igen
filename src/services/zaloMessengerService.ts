import { getAccessToken } from "./authService";

export const zaloMessengerService = {
  /**
   * Lay danh sach cuoc hoi thoai cua Zalo OA da lien ket
   */
  async getConversations(options?: { limit?: number; skip?: number }): Promise<any[]> {
    console.log("[FE Zalo Service] Bat dau goi API getConversations...");
    const params = new URLSearchParams();
    if (options?.limit !== undefined) {
      params.set("limit", String(options.limit));
    }
    if (options?.skip !== undefined) {
      params.set("skip", String(options.skip));
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`/api/v1/zalo/conversations${query}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("[FE Zalo Service] API getConversations that bai:", res.status, data);
      throw new Error(data.message || "Không thể tải danh sách cuộc hội thoại Zalo.");
    }

    const result = await res.json();
    console.log(`[FE Zalo Service] API getConversations thanh cong. So luong: ${result.data?.length || 0}`);
    return result.data || [];
  },

  /**
   * Lay lich su tin nhan cua mot cuoc hoi thoai cu the
   */
  async getMessages(conversationId: string, options?: { limit?: number; before?: string; sync?: boolean }): Promise<{ data: any[]; pagination: { limit: number; hasMore: boolean; nextBefore: string | null } }> {
    const params = new URLSearchParams();
    params.set("limit", String(options?.limit || 20));
    if (options?.before) {
      params.set("before", options.before);
    }
    if (options?.sync) {
      params.set("sync", "1");
    }
    console.log(`[FE Zalo Service] Bat dau goi API getMessages cho conversation: ${conversationId}...`);
    const res = await fetch(`/api/v1/zalo/conversations/${conversationId}/messages?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE Zalo Service] API getMessages cho conversation ${conversationId} that bai:`, res.status, data);
      throw new Error(data.message || "Không thể tải lịch sử tin nhắn Zalo.");
    }

    const result = await res.json();
    console.log(`[FE Zalo Service] API getMessages cho conversation ${conversationId} thanh cong. So luong: ${result.data?.length || 0}`);
    return {
      data: result.data || [],
      pagination: result.pagination || { limit: options?.limit || 20, hasMore: false, nextBefore: null },
    };
  },

  /**
   * Danh dau da doc cuoc hoi thoai qua Zalo OA
   */
  async markRead(conversationId: string): Promise<any> {
    console.log(`[FE Zalo Service] Bat dau goi API markRead cho conversation ${conversationId}...`);
    const res = await fetch(`/api/v1/zalo/conversations/${conversationId}/mark-read`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE Zalo Service] API markRead cho conversation ${conversationId} that bai:`, res.status, data);
      throw new Error(data.message || "Không thể đánh dấu đã đọc cuộc hội thoại Zalo.");
    }

    const result = await res.json();
    return result.data;
  },

  async resumeAI(conversationId: string): Promise<any> {
    console.log(`[FE Zalo Service] Bat dau goi API resumeAI cho conversation ${conversationId}...`);
    const res = await fetch(`/api/v1/zalo/conversations/${conversationId}/resume-ai`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE Zalo Service] API resumeAI cho conversation ${conversationId} that bai:`, res.status, data);
      throw new Error(data.message || "Không thể kích hoạt lại AI cho cuộc hội thoại Zalo.");
    }

    const result = await res.json();
    return result.data;
  },

  async sendReply(conversationId: string, text: string): Promise<any> {
    console.log(`[FE Zalo Service] Bat dau goi API sendReply toi conversation ${conversationId}. Noi dung: "${text}"`);
    const res = await fetch("/api/v1/zalo/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ conversationId, recipientId: conversationId, text }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE Zalo Service] API sendReply toi conversation ${conversationId} that bai:`, res.status, data);
      const rawMessage = data.message || "Gửi tin nhắn Zalo thất bại.";
      const friendlyMessage = rawMessage.includes("Code: -209") || rawMessage.includes("chua duoc phe duyet")
        ? "Zalo OA/App chưa được phê duyệt quyền gửi tin nhắn. Bạn nhận được tin nhắn nhưng chưa thể trả lời từ app này."
        : rawMessage.includes("Code: -224") || rawMessage.includes("upgrade OA Tier Package")
          ? "Zalo OA hiện chưa đủ gói dịch vụ để gửi tin nhắn qua API. Vui lòng nâng cấp gói OA trên Zalo Cloud."
        : rawMessage.includes("Code: -216") || rawMessage.includes("expired")
          ? "Access token Zalo OA đã hết hạn. Vui lòng cập nhật token mới."
          : rawMessage;
      throw new Error(friendlyMessage);
    }

    const result = await res.json();
    console.log(`[FE Zalo Service] API sendReply toi conversation ${conversationId} thanh cong.`, result);
    return result.data;
  },

  /**
   * Luu thong tin cau hinh Zalo OA (thu cong hoac Demo)
   */
  async saveIntegration(integrationData: { oaId: string; oaName: string; accessToken: string; refreshToken?: string; isMock?: boolean }): Promise<any> {
    console.log("[FE Zalo Service] Goi API luu cau hinh Zalo...");
    const res = await fetch("/api/v1/zalo/save-integration", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(integrationData),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể lưu thông tin cấu hình Zalo OA.");
    }

    const result = await res.json();
    return result.data;
  },

  /**
   * Goi yeu cau go bo cau hinh Zalo OA
   */
  async removeIntegration(): Promise<void> {
    console.log("[FE Zalo Service] Goi API go cau hinh Zalo...");
    const res = await fetch("/api/v1/zalo/integration", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể gỡ bỏ cấu hình Zalo OA.");
    }
  },
};
