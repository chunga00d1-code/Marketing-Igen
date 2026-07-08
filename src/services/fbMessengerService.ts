import { getAccessToken } from "./authService";

export const fbMessengerService = {
  /**
   * Lay danh sach cuoc hoi thoai cua Page Facebook da lien ket
   */
  async getConversations(options?: { sync?: boolean; pageId?: string; limit?: number; skip?: number }): Promise<any[]> {
    console.log("[FE FB Service] Bat dau goi API getConversations...");
    const params = new URLSearchParams();
    if (options?.sync) {
      params.set("sync", "1");
    }
    if (options?.pageId) {
      params.set("pageId", options.pageId);
    }
    if (options?.limit !== undefined) {
      params.set("limit", String(options.limit));
    }
    if (options?.skip !== undefined) {
      params.set("skip", String(options.skip));
    }
    const query = params.toString() ? `?${params.toString()}` : "";
    const res = await fetch(`/api/v1/facebook/messenger/conversations${query}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error("[FE FB Service] API getConversations that bai:", res.status, data);
      throw new Error(data.message || "Không thể tải danh sách cuộc hội thoại.");
    }

    const result = await res.json();
    console.log(`[FE FB Service] API getConversations thanh cong. So luong hoi thoai: ${result.data?.length || 0}`);
    return result.data || [];
  },

  /**
   * Lay lich su tin nhan cua mot cuoc hoi thoai cu the
   */
  async getMessages(conversationId: string, options?: { limit?: number; before?: string; sync?: boolean; pageId?: string }): Promise<{ data: any[]; pagination: { limit: number; hasMore: boolean; nextBefore: string | null } }> {
    const params = new URLSearchParams();
    params.set("limit", String(options?.limit || 20));
    if (options?.before) {
      params.set("before", options.before);
    }
    if (options?.sync) {
      params.set("sync", "1");
    }
    if (options?.pageId) {
      params.set("pageId", options.pageId);
    }
    console.log(`[FE FB Service] Bat dau goi API getMessages cho conversation: ${conversationId}...`);
    const res = await fetch(`/api/v1/facebook/messenger/conversations/${conversationId}/messages?${params.toString()}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE FB Service] API getMessages cho conversation ${conversationId} that bai:`, res.status, data);
      throw new Error(data.message || "Không thể tải lịch sử tin nhắn.");
    }

    const result = await res.json();
    console.log(`[FE FB Service] API getMessages cho conversation ${conversationId} thanh cong. So luong tin nhan: ${result.data?.length || 0}`);
    return {
      data: result.data || [],
      pagination: result.pagination || { limit: options?.limit || 20, hasMore: false, nextBefore: null },
    };
  },

  /**
   * Danh dau da doc cuoc hoi thoai qua Facebook
   */
  async markRead(conversationId: string, pageId?: string): Promise<any> {
    console.log(`[FE FB Service] Bat dau goi API markRead cho conversation: ${conversationId}...`);
    const query = pageId ? `?pageId=${encodeURIComponent(pageId)}` : "";
    const res = await fetch(`/api/v1/facebook/messenger/conversations/${conversationId}/mark-read${query}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE FB Service] API markRead cho conversation ${conversationId} that bai:`, res.status, data);
      throw new Error(data.message || "Không thể đánh dấu đã đọc cuộc hội thoại.");
    }

    const result = await res.json();
    return result.data;
  },

  async resumeAI(conversationId: string, pageId?: string): Promise<any> {
    console.log(`[FE FB Service] Bat dau goi API resumeAI cho conversation: ${conversationId}...`);
    const query = pageId ? `?pageId=${encodeURIComponent(pageId)}` : "";
    const res = await fetch(`/api/v1/facebook/messenger/conversations/${conversationId}/resume-ai${query}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE FB Service] API resumeAI cho conversation ${conversationId} that bai:`, res.status, data);
      throw new Error(data.message || "Không thể kích hoạt lại AI cho cuộc hội thoại Facebook.");
    }

    const result = await res.json();
    return result.data;
  },

  async sendReply(conversationId: string, text: string, pageId?: string): Promise<any> {
    console.log(`[FE FB Service] Bat dau goi API sendReply toi conversation ${conversationId}. Noi dung: "${text}"`);
    const res = await fetch("/api/v1/facebook/messenger/reply", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ conversationId, recipientId: conversationId, text, pageId }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      console.error(`[FE FB Service] API sendReply toi conversation ${conversationId} that bai:`, res.status, data);
      throw new Error(data.message || "Gửi tin nhắn thất bại.");
    }

    const result = await res.json();
    console.log(`[FE FB Service] API sendReply toi conversation ${conversationId} thanh cong. Ket qua:`, result);
    return result.data;
  },
};
