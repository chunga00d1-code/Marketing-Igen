import { getAccessToken } from "./authService";

export const tiktokMessengerService = {
  /**
   * Lay danh sach cuoc hoi thoai cua TikTok Business Account da lien ket
   */
  async getConversations(options?: { limit?: number; skip?: number }): Promise<any[]> {
    console.log("[FE TikTok Service] Bat dau goi API getConversations...");
    const params = new URLSearchParams();
    if (options?.limit !== undefined) {
      params.set("limit", String(options.limit));
    }
    if (options?.skip !== undefined) {
      params.set("skip", String(options.skip));
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`/api/v1/tiktok/messenger/conversations${query}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("[FE TikTok Service] API getConversations that bai:", res.status, data);
      throw new Error(data.message || "Không thể tải danh sách cuộc hội thoại TikTok.");
    }

    const result = await res.json();
    console.log(`[FE TikTok Service] API getConversations thanh cong. So luong: ${result.data?.length || 0}`);
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
    console.log(`[FE TikTok Service] Bat dau goi API getMessages cho conversation: ${conversationId}...`);
    const res = await fetch(`/api/v1/tiktok/messenger/conversations/${conversationId}/messages?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE TikTok Service] API getMessages cho conversation ${conversationId} that bai:`, res.status, data);
      throw new Error(data.message || "Không thể tải lịch sử tin nhắn TikTok.");
    }

    const result = await res.json();
    console.log(`[FE TikTok Service] API getMessages cho conversation ${conversationId} thanh cong. So luong: ${result.data?.length || 0}`);
    return {
      data: result.data || [],
      pagination: result.pagination || { limit: options?.limit || 20, hasMore: false, nextBefore: null },
    };
  },

  /**
   * Danh dau da doc cuoc hoi thoai TikTok
   */
  async markRead(conversationId: string): Promise<any> {
    console.log(`[FE TikTok Service] Bat dau goi API markRead cho conversation ${conversationId}...`);
    const res = await fetch(`/api/v1/tiktok/messenger/conversations/${conversationId}/mark-read`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE TikTok Service] API markRead cho conversation ${conversationId} that bai:`, res.status, data);
      throw new Error(data.message || "Không thể đánh dấu đã đọc cuộc hội thoại TikTok.");
    }

    const result = await res.json();
    return result.data;
  },

  async resumeAI(conversationId: string): Promise<any> {
    console.log(`[FE TikTok Service] Bat dau goi API resumeAI cho conversation ${conversationId}...`);
    const res = await fetch(`/api/v1/tiktok/messenger/conversations/${conversationId}/resume-ai`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE TikTok Service] API resumeAI cho conversation ${conversationId} that bai:`, res.status, data);
      throw new Error(data.message || "Không thể kích hoạt lại AI cho cuộc hội thoại TikTok.");
    }

    const result = await res.json();
    return result.data;
  },

  async sendReply(conversationId: string, text: string): Promise<any> {
    console.log(`[FE TikTok Service] Bat dau goi API sendReply toi conversation ${conversationId}. Noi dung: "${text}"`);
    const res = await fetch("/api/v1/tiktok/messenger/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ conversationId, recipientId: conversationId, text }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE TikTok Service] API sendReply toi conversation ${conversationId} that bai:`, res.status, data);
      throw new Error(data.message || "Gửi tin nhắn TikTok thất bại.");
    }

    const result = await res.json();
    console.log(`[FE TikTok Service] API sendReply toi conversation ${conversationId} thanh cong.`, result);
    return result.data;
  },
};
