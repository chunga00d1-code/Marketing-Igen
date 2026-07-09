/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars, prefer-const */
import { ZaloConversationModel, ZaloMessageModel } from "../model/zalo-messenger.model";
import { UserModel } from "../model/user.model";
import { emitToPage } from "../socket";
import { aiAutoReplyService } from "./ai-auto-reply.service";

const syncTimestamps = new Map<string, number>();

export const zaloMessengerService = {
  shouldSync(key: string, ttlMs: number) {
    const now = Date.now();
    const lastRun = syncTimestamps.get(key) || 0;
    if (now - lastRun < ttlMs) {
      return false;
    }
    syncTimestamps.set(key, now);
    return true;
  },

  /**
   * Äá»•i Authorization Code láº¥y Access Token & Refresh Token láº§n Ä‘áº§u
   */
  async exchangeAuthCode(userId: string, oaId: string, oaName: string, appId: string, appSecret: string, authCode: string) {
    console.log(`[Zalo Service OAuth] Äá»•i auth_code cho OA: ${oaName} (${oaId}), App ID: ${appId}`);

    const url = "https://oauth.zaloapp.com/v4/oa/access_token";
    const bodyParams = new URLSearchParams();
    bodyParams.set("code", authCode);
    bodyParams.set("app_id", appId);
    bodyParams.set("grant_type", "authorization_code");

    try {
      const response = await (globalThis as any).fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "secret_key": appSecret,
        },
        body: bodyParams.toString(),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Zalo OAuth API Error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(`Zalo OAuth Error: ${data.error_name || data.error} - ${data.error_description}`);
      }

      const accessToken = data.access_token;
      const refreshToken = data.refresh_token;
      const expiresInSeconds = Number(data.expires_in) || 90000; // Máº·c Ä‘á»‹nh 25 giá»
      const tokenExpiredAt = new Date(Date.now() + expiresInSeconds * 1000);

      // Cáº¥u hÃ¬nh lÆ°u trá»¯
      const zaloIntegration = {
        isConnected: true,
        oaId,
        oaName,
        accessToken,
        refreshToken,
        tokenExpiredAt,
        connectedAt: new Date(),
        isMock: false
      };

      await UserModel.findByIdAndUpdate(userId, { zaloIntegration });
      return zaloIntegration;
    } catch (error: any) {
      console.error("[Zalo Service OAuth] Lá»—i Ä‘á»•i auth_code:", error);
      throw error;
    }
  },

  /**
   * LÆ°u cáº¥u hÃ¬nh Zalo tá»± cháº¿ (KhÃ´ng qua Popup OAuth phá»©c táº¡p)
   */
  async saveIntegrationManual(userId: string, integrationData: { oaId: string; oaName: string; accessToken: string; refreshToken: string; isMock?: boolean }) {
    const isMock = !!integrationData.isMock;
    const tokenExpiredAt = new Date(Date.now() + 25 * 60 * 60 * 1000); // Máº·c Ä‘á»‹nh háº¿t háº¡n sau 25 giá»

    const zaloIntegration = {
      isConnected: true,
      oaId: integrationData.oaId,
      oaName: integrationData.oaName,
      accessToken: integrationData.accessToken,
      refreshToken: integrationData.refreshToken,
      tokenExpiredAt,
      connectedAt: new Date(),
      isMock
    };

    console.log(`[Zalo SaveIntegrationManual] userId=${userId}, oaId=${integrationData.oaId}, oaName=${integrationData.oaName}, accessTokenTail=${integrationData.accessToken?.slice(-8) || "none"}, hasRefreshToken=${integrationData.refreshToken ? "true" : "false"}`);
    await UserModel.findByIdAndUpdate(userId, { zaloIntegration });
    const savedUser = await UserModel.findById(userId).select("email zaloIntegration").lean();
    console.log(`[Zalo SaveIntegrationManual] Saved user integration for ${savedUser?.email || userId}: oaId=${savedUser?.zaloIntegration?.oaId || "none"}, accessTokenTail=${savedUser?.zaloIntegration?.accessToken?.slice(-8) || "none"}, hasRefreshToken=${savedUser?.zaloIntegration?.refreshToken ? "true" : "false"}`);

    // Náº¿u á»Ÿ cháº¿ Ä‘á»™ mock, tá»± Ä‘á»™ng táº¡o má»™t vÃ i cuá»™c há»™i thoáº¡i máº«u Ä‘á»ƒ hiá»ƒn thá»‹ ngay
    if (isMock) {
      await this.seedMockData(integrationData.oaId);
    }

    return zaloIntegration;
  },

  async validateIntegrationToken(integrationData: { oaId: string; oaName?: string; accessToken: string }) {
    const normalizedOaId = String(integrationData.oaId || "").trim();
    const normalizedToken = String(integrationData.accessToken || "").trim();

    if (!normalizedOaId || !normalizedToken) {
      throw new Error("Thieu OA ID hoac Access Token de xac thuc Zalo OA.");
    }

    const candidateUrls = [
      "https://openapi.zalo.me/v2.0/oa/getoa",
      "https://openapi.zalo.me/v3.0/oa/getoa",
    ];

    let lastError = "";

    for (const url of candidateUrls) {
      try {
        const response = await (globalThis as any).fetch(url, {
          method: "GET",
          headers: {
            access_token: normalizedToken,
          },
        });

        const rawText = await response.text();
        let data: any = null;
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          data = { raw: rawText };
        }

        if (!response.ok) {
          lastError = `${response.status} - ${typeof data === "string" ? data : JSON.stringify(data)}`;
          continue;
        }

        const oaData = data?.data || data;
        const resolvedOaId = String(oaData?.oa_id || oaData?.oaid || oaData?.id || "").trim();
        const resolvedOaName = String(oaData?.name || oaData?.oa_name || integrationData.oaName || "").trim();

        if (resolvedOaId && resolvedOaId !== normalizedOaId) {
          throw new Error(`Token Zalo hop le nhung dang tro toi OA ID ${resolvedOaId}, khong khop voi OA ID ${normalizedOaId}.`);
        }

        return {
          valid: true,
          oaId: resolvedOaId || normalizedOaId,
          oaName: resolvedOaName || integrationData.oaName || "Zalo OA",
          source: url,
        };
      } catch (error: any) {
        lastError = error.message || String(error);
      }
    }

    throw new Error(`Khong the xac thuc Zalo OA voi ben thu 3. Chi tiet: ${lastError || "unknown_error"}`);
  },

  /**
   * Há»§y liÃªn káº¿t Zalo OA
   */
  async removeIntegration(userId: string) {
    await UserModel.findByIdAndUpdate(userId, { zaloIntegration: null });
  },

  /**
   * Láº¥y Access Token há»£p lá»‡, tá»± Ä‘á»™ng refresh náº¿u sáº¯p háº¿t háº¡n
   */
  async getAccessTokenByOAId(oaId: string): Promise<string | null> {
    const { SocialIntegrationModel } = require("../model/social-integration.model");
    const companyIntegration = await SocialIntegrationModel.findOne({
      platform: "Zalo",
      username: oaId, // OA ID is stored in username
      isConnected: true
    });

    // 1. Search in SocialIntegrationModel first (company-level)
    if (companyIntegration) {
      console.log(`[Zalo Service Token] Found company-level integration for oaId=${oaId}, accessTokenTail=${companyIntegration.accessToken?.slice(-8) || "none"}, hasRefreshToken=${companyIntegration.refreshToken ? "true" : "false"}, tokenExpiredAt=${companyIntegration.tokenExpiredAt || "none"}`);
      if (companyIntegration.isMock) {
        return "mock_zalo_access_token_123456789";
      }

      const now = Date.now();
      const expiryTime = companyIntegration.tokenExpiredAt ? new Date(companyIntegration.tokenExpiredAt).getTime() : 0;

      // Náº¿u token Ä‘Ã£ háº¿t háº¡n hoáº·c cÃ²n Ã­t hÆ¡n 10 phÃºt thÃ¬ tiáº¿n hÃ nh refresh token
      if (companyIntegration.refreshToken && (expiryTime <= now || expiryTime - now < 10 * 60 * 1000)) {
        console.log(`[Zalo Service Token] Company Zalo Token cá»§a OA ID ${oaId} sáº¯p háº¿t háº¡n. Äang tiáº¿n hÃ nh lÃ m má»›i tá»± Ä‘á»™ng...`);
        try {
          const newAccessToken = await this.refreshCompanyZaloToken(companyIntegration._id.toString(), companyIntegration);
          return newAccessToken;
        } catch (err: any) {
          console.error(`[Zalo Service Token] Tá»± Ä‘á»™ng lÃ m má»›i Company Zalo token tháº¥t báº¡i:`, err);
          await SocialIntegrationModel.findByIdAndUpdate(companyIntegration._id, {
            isConnected: false,
            accessToken: "",
            refreshToken: "",
            tokenExpiredAt: null,
          });

          // Gá»­i cáº£nh bÃ¡o vá» Telegram
          const { telegramService } = require("./telegram.service");
          await telegramService.sendIntegrationDisconnectAlert(
            "Zalo",
            companyIntegration.displayName || "Zalo OA",
            oaId,
            companyIntegration.companyCode || "SYSTEM",
            `KhÃ´ng thá»ƒ tá»± Ä‘á»™ng lÃ m má»›i Refresh Token Zalo. Chi tiáº¿t: ${err.message || err}`
          ).catch((e: any) => console.error("[Zalo Service] KhÃ´ng thá»ƒ gá»­i cáº£nh bÃ¡o lá»—i Token vá» Telegram:", e));

          return null;
        }
      }

      return companyIntegration.accessToken || null;
    }

    // 2. Fallback to UserModel (user-level)
    const user = await UserModel.findOne({
      "zaloIntegration.isConnected": true,
      "zaloIntegration.oaId": oaId
    });

    if (user && user.zaloIntegration) {
      const integration = user.zaloIntegration;
      console.log(`[Zalo Service Token] Fallback to user-level integration for oaId=${oaId}, user=${user.email}, accessTokenTail=${integration.accessToken?.slice(-8) || "none"}, hasRefreshToken=${integration.refreshToken ? "true" : "false"}, tokenExpiredAt=${integration.tokenExpiredAt || "none"}`);

      if (integration.isMock) {
        return "mock_zalo_access_token_123456789";
      }

      const now = Date.now();
      const expiryTime = new Date(integration.tokenExpiredAt).getTime();
      
      if (expiryTime - now < 10 * 60 * 1000) {
        console.log(`[Zalo Service Token] Token cá»§a OA ID ${oaId} sáº¯p háº¿t háº¡n. Äang tiáº¿n hÃ nh lÃ m má»›i tá»± Ä‘á»™ng...`);
        try {
          const refreshedToken = await this.refreshToken(user._id.toString(), integration);
          return refreshedToken;
        } catch (err: any) {
          console.error(`[Zalo Service Token] Tá»± Ä‘á»™ng lÃ m má»›i token tháº¥t báº¡i:`, err);
          await UserModel.findByIdAndUpdate(user._id, {
            "zaloIntegration.isConnected": false,
            "zaloIntegration.accessToken": "",
            "zaloIntegration.refreshToken": "",
            "zaloIntegration.tokenExpiredAt": null,
          });

          // Gá»­i cáº£nh bÃ¡o vá» Telegram
          const { telegramService } = require("./telegram.service");
          await telegramService.sendIntegrationDisconnectAlert(
            "Zalo",
            `Zalo OA (User: ${user.email})`,
            oaId,
            user.companyCode || "SYSTEM",
            `KhÃ´ng thá»ƒ tá»± Ä‘á»™ng lÃ m má»›i Refresh Token Zalo cÃ¡ nhÃ¢n. Chi tiáº¿t: ${err.message || err}`
          ).catch((e: any) => console.error("[Zalo Service] KhÃ´ng thá»ƒ gá»­i cáº£nh bÃ¡o lá»—i Token vá» Telegram:", e));

          return null;
        }
      }

      return integration.accessToken;
    }

    console.warn(`[Zalo Service Token] Khong tim thay token cho oaId=${oaId} o ca company-level lan user-level.`);

    return null;
  },

  async refreshCompanyZaloToken(integrationId: string, integration: any): Promise<string> {
    const url = "https://oauth.zaloapp.com/v4/oa/access_token";
    const bodyParams = new URLSearchParams();
    bodyParams.set("refresh_token", integration.refreshToken);
    bodyParams.set("grant_type", "refresh_token");

    const appId = process.env.ZALO_APP_ID || "";
    const appSecret = process.env.ZALO_APP_SECRET || "";

    if (!appId || !appSecret) {
      throw new Error("KhÃ´ng thá»ƒ lÃ m má»›i token: Thiáº¿u cáº¥u hÃ¬nh ZALO_APP_ID hoáº·c ZALO_APP_SECRET trong file .env");
    }

    bodyParams.set("app_id", appId);

    const response = await (globalThis as any).fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "secret_key": appSecret,
      },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Refresh Company Zalo Token tháº¥t báº¡i: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`Refresh Company Zalo Token lá»—i: ${data.error_name || data.error}`);
    }

    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token;
    const expiresInSeconds = Number(data.expires_in) || 90000;
    const tokenExpiredAt = new Date(Date.now() + expiresInSeconds * 1000);

    const { SocialIntegrationModel } = require("../model/social-integration.model");
    await SocialIntegrationModel.findByIdAndUpdate(integrationId, {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      tokenExpiredAt,
    });

    console.log(`[Zalo Service Token] ÄÃ£ lÃ m má»›i company-level token thÃ nh cÃ´ng cho ID: ${integrationId}`);
    return newAccessToken;
  },

  /**
   * Gá»i API lÃ m má»›i Zalo Access Token tá»« Zalo OAuth
   */
  async refreshToken(userId: string, integration: any): Promise<string> {
    const url = "https://oauth.zaloapp.com/v4/oa/access_token";
    const bodyParams = new URLSearchParams();
    bodyParams.set("refresh_token", integration.refreshToken);
    bodyParams.set("grant_type", "refresh_token");

    // Láº¥y App ID/Secret tá»« cáº¥u hÃ¬nh hoáº·c biáº¿n mÃ´i trÆ°á»ng
    const appId = process.env.ZALO_APP_ID || "";
    const appSecret = process.env.ZALO_APP_SECRET || "";

    if (!appId || !appSecret) {
      throw new Error("KhÃ´ng thá»ƒ lÃ m má»›i token: Thiáº¿u cáº¥u hÃ¬nh ZALO_APP_ID hoáº·c ZALO_APP_SECRET trong file .env");
    }

    bodyParams.set("app_id", appId);

    const response = await (globalThis as any).fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "secret_key": appSecret,
      },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Refresh Zalo Token tháº¥t báº¡i: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(`Refresh Zalo Token lá»—i: ${data.error_name || data.error}`);
    }

    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token;
    const expiresInSeconds = Number(data.expires_in) || 90000;
    const tokenExpiredAt = new Date(Date.now() + expiresInSeconds * 1000);

    await UserModel.findByIdAndUpdate(userId, {
      "zaloIntegration.accessToken": newAccessToken,
      "zaloIntegration.refreshToken": newRefreshToken,
      "zaloIntegration.tokenExpiredAt": tokenExpiredAt,
    });

    console.log(`[Zalo Service Token] ÄÃ£ lÃ m má»›i token thÃ nh cÃ´ng cho User ID: ${userId}`);
    return newAccessToken;
  },

  /**
   * Táº¡o dá»¯ liá»‡u giáº£ láº­p cho cháº¿ Ä‘á»™ Demo (Mock Mode)
   */
  async seedMockData(oaId: string) {
    console.log(`[Zalo Service Mock] Táº¡o dá»¯ liá»‡u giáº£ láº­p cho OA ID: ${oaId}`);
    
    // XÃ³a dá»¯ liá»‡u mock cÅ©
    const existingConvs = await ZaloConversationModel.find({ oaId });
    for (const c of existingConvs) {
      await ZaloMessageModel.deleteMany({ conversationId: c._id });
    }
    await ZaloConversationModel.deleteMany({ oaId });

    // Táº¡o khÃ¡ch hÃ ng 1: Nguyá»…n VÄƒn HÃ¹ng
    const conv1 = await ZaloConversationModel.create({
      recipientId: "zalo_user_hung_01",
      senderName: "Nguyá»…n VÄƒn HÃ¹ng",
      avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=150&q=80",
      oaId,
      lastMessageText: "TÆ° váº¥n cho tÃ´i dá»‹ch vá»¥ bÃªn báº¡n vá»›i",
      lastMessageAt: new Date(Date.now() - 30 * 60 * 1000), // 30 phÃºt trÆ°á»›c
      unreadCount: 1,
      status: "open",
      tags: ["KhÃ¡ch áº¤m", "Há»i GiÃ¡"],
      isVip: false,
    });

    await ZaloMessageModel.create({
      conversationId: conv1._id,
      senderId: "zalo_user_hung_01",
      recipientId: oaId,
      direction: "inbound",
      text: "Xin chÃ o iGen Marketing, tÃ´i Ä‘ang muá»‘n tÃ¬m hiá»ƒu vá» pháº§n má»m CRM quáº£n lÃ½ khÃ¡ch hÃ ng.",
      messageId: `msg_mock_z1_${Date.now()}`,
      timestamp: new Date(Date.now() - 35 * 60 * 1000),
      status: "read",
    });

    await ZaloMessageModel.create({
      conversationId: conv1._id,
      senderId: oaId,
      recipientId: "zalo_user_hung_01",
      direction: "outbound",
      text: "Dáº¡ em chÃ o anh HÃ¹ng áº¡. iGen Marketing cung cáº¥p giáº£i phÃ¡p CRM tÃ­ch há»£p Ä‘a kÃªnh bao gá»“m Facebook, Zalo OA giÃºp quáº£n lÃ½ tin nháº¯n táº­p trung. Anh cáº§n quáº£n lÃ½ cho Ä‘á»™i ngÅ© bao nhiÃªu nhÃ¢n sá»± áº¡?",
      messageId: `msg_mock_z2_${Date.now()}`,
      timestamp: new Date(Date.now() - 32 * 60 * 1000),
      status: "read",
    });

    await ZaloMessageModel.create({
      conversationId: conv1._id,
      senderId: "zalo_user_hung_01",
      recipientId: oaId,
      direction: "inbound",
      text: "TÆ° váº¥n cho tÃ´i dá»‹ch vá»¥ bÃªn báº¡n vá»›i. BÃªn tÃ´i cÃ³ khoáº£ng 15 nhÃ¢n viÃªn sales.",
      messageId: `msg_mock_z3_${Date.now()}`,
      timestamp: new Date(Date.now() - 30 * 60 * 1000),
      status: "delivered",
    });

    // Táº¡o khÃ¡ch hÃ ng 2: Tráº§n Thá»‹ Mai (KhÃ¡ch VIP)
    const conv2 = await ZaloConversationModel.create({
      recipientId: "zalo_user_mai_02",
      senderName: "Tráº§n Thá»‹ Mai",
      avatarUrl: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80",
      oaId,
      lastMessageText: "Cáº£m Æ¡n báº¡n nhiá»u nhÃ©, há»— trá»£ ráº¥t nhiá»‡t tÃ¬nh",
      lastMessageAt: new Date(Date.now() - 10 * 60 * 1000), // 10 phÃºt trÆ°á»›c
      unreadCount: 0,
      status: "open",
      tags: ["KhÃ¡ch VIP", "Má»›i tiáº¿p cáº­n"],
      isVip: true,
    });

    await ZaloMessageModel.create({
      conversationId: conv2._id,
      senderId: "zalo_user_mai_02",
      recipientId: oaId,
      direction: "inbound",
      text: "Há»£p Ä‘á»“ng gÃ³i CRM Enterprise 12 thÃ¡ng bÃªn mÃ¬nh Ä‘Ã£ chuyá»ƒn khoáº£n xong rá»“i nhÃ©.",
      messageId: `msg_mock_z4_${Date.now()}`,
      timestamp: new Date(Date.now() - 15 * 60 * 1000),
      status: "read",
    });

    await ZaloMessageModel.create({
      conversationId: conv2._id,
      senderId: oaId,
      recipientId: "zalo_user_mai_02",
      direction: "outbound",
      text: "Dáº¡ iGen Marketing Ä‘Ã£ nháº­n Ä‘Æ°á»£c thÃ´ng tin chuyá»ƒn khoáº£n cá»§a chá»‹ Mai rá»“i áº¡. Há»‡ thá»‘ng ERP cá»§a bÃªn mÃ¬nh Ä‘ang Ä‘Æ°á»£c khá»Ÿi táº¡o vÃ  phÃ¢n quyá»n, báº¡n ká»¹ thuáº­t viÃªn sáº½ liÃªn há»‡ chá»‹ trong 5 phÃºt ná»¯a nhÃ©.",
      messageId: `msg_mock_z5_${Date.now()}`,
      timestamp: new Date(Date.now() - 12 * 60 * 1000),
      status: "read",
    });

    await ZaloMessageModel.create({
      conversationId: conv2._id,
      senderId: "zalo_user_mai_02",
      recipientId: oaId,
      direction: "inbound",
      text: "Cáº£m Æ¡n báº¡n nhiá»u nhÃ©, há»— trá»£ ráº¥t nhiá»‡t tÃ¬nh",
      messageId: `msg_mock_z6_${Date.now()}`,
      timestamp: new Date(Date.now() - 10 * 60 * 1000),
      status: "read",
    });
  },

  async getConversations(oaId: string, options?: { limit?: number; skip?: number }) {
    console.log(`[Zalo Service] Láº¥y danh sÃ¡ch há»™i thoáº¡i cho OA ID: ${oaId}, limit: ${options?.limit || 20}, skip: ${options?.skip || 0}`);
    const limit = options?.limit || 20;
    const skip = options?.skip || 0;
    return ZaloConversationModel.find({ oaId })
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(limit);
  },

  /**
   * Láº¥y tin nháº¯n chi tiáº¿t
   */
  async getMessages(oaId: string, conversationId: string, options?: { limit?: number; before?: string; sync?: boolean }) {
    const conversation = await ZaloConversationModel.findOne({ _id: conversationId, oaId });
    if (!conversation) {
      return {
        messages: [],
        pagination: { limit: 20, hasMore: false, nextBefore: null }
      };
    }

    // Reset sá»‘ lÆ°á»£ng tin nháº¯n chÆ°a Ä‘á»c
    if (conversation.unreadCount > 0) {
      conversation.unreadCount = 0;
      await conversation.save();
    }

    const limit = Math.min(Math.max(Number(options?.limit || 20), 1), 100);
    const beforeDate = options?.before ? new Date(options.before) : null;
    const filter: any = { conversationId: conversation._id };
    
    if (beforeDate && !Number.isNaN(beforeDate.getTime())) {
      filter.timestamp = { $lt: beforeDate };
    }

    const existingMessages = await ZaloMessageModel.find(filter).sort({ timestamp: -1 }).limit(limit + 1);
    const hasMore = existingMessages.length > limit;
    const trimmedMessages = hasMore ? existingMessages.slice(0, limit) : existingMessages;
    const orderedMessages = [...trimmedMessages].reverse();
    const oldestMessage = orderedMessages[0];
    const latestMessage = orderedMessages[orderedMessages.length - 1];

    return {
      messages: orderedMessages,
      pagination: {
        limit,
        hasMore,
        nextBefore: oldestMessage?.timestamp ? new Date(oldestMessage.timestamp).toISOString() : null,
      }
    };
  },

  async markConversationRead(oaId: string, conversationId: string) {
    const conversation = await ZaloConversationModel.findOne({ _id: conversationId, oaId });
    if (!conversation) {
      throw new Error("KhÃ´ng tÃ¬m tháº¥y há»™i thoáº¡i Zalo.");
    }

    if (conversation.unreadCount !== 0) {
      conversation.unreadCount = 0;
      await conversation.save();
      emitToPage(oaId, "conversation_updated", conversation);
    }

    return { success: true };
  },

  async resumeAIAutoReply(oaId: string, conversationId: string) {
    const conversation = await ZaloConversationModel.findOne({ _id: conversationId, oaId });
    if (!conversation) {
      throw new Error("KhÃ´ng tÃ¬m tháº¥y há»™i thoáº¡i Zalo.");
    }
    conversation.aiPausedUntil = undefined;
    await conversation.save();
    emitToPage(oaId, "conversation_updated", conversation);
    return conversation;
  },

  /**
   * Gá»­i pháº£n há»“i tin nháº¯n cho khÃ¡ch hÃ ng qua Zalo OA
   */
  async sendReply(oaId: string, conversationId: string, text: string, senderType: "human" | "ai" = "human") {
    const conversation = await ZaloConversationModel.findOne({ _id: conversationId, oaId });
    if (!conversation) {
      throw new Error("KhÃ´ng tÃ¬m tháº¥y cuá»™c há»™i thoáº¡i Zalo Ä‘á»ƒ tráº£ lá»i.");
    }

    // Há»§y cÃ¡c pháº£n há»“i AI Ä‘ang lÃªn lá»‹ch do nhÃ¢n viÃªn Ä‘Ã£ can thiá»‡p
    if (senderType === "human") {
      aiAutoReplyService.cancelPendingReply(conversationId, "human_reply");
    }

    const user = await UserModel.findOne({
      "zaloIntegration.isConnected": true,
      "zaloIntegration.oaId": oaId
    });

    const { SocialIntegrationModel } = require("../model/social-integration.model");
    const companyIntegration = await SocialIntegrationModel.findOne({
      platform: "Zalo",
      username: oaId,
      isConnected: true
    }).lean();

    const isMock = companyIntegration
      ? !!companyIntegration.isMock
      : (user?.zaloIntegration?.isMock ?? false);
    const recipientId = conversation.recipientId;
    console.log(`[Zalo SendReply] oaId=${oaId}, conversationId=${conversationId}, recipientId=${recipientId}, textLength=${text.length}, hasUserLevel=${user ? "true" : "false"}, hasCompanyLevel=${companyIntegration ? "true" : "false"}, isMock=${isMock ? "true" : "false"}`);

    const messageId = `zalo_out_${Date.now()}`;
    const sentAt = new Date();
    const newMsg = new ZaloMessageModel({
      conversationId: conversation._id,
      senderId: oaId,
      recipientId: recipientId,
      direction: "outbound",
      text,
      attachments: [],
      messageId,
      timestamp: sentAt,
      status: "sent",
    });
    const emitRealtimeUpdate = () => {
      emitToPage(oaId, "new_message", {
        message: newMsg,
        conversation: conversation
      });
      emitToPage(oaId, "conversation_updated", conversation);
    };

    // PhÃ¡t socket realtime

    // Xá»­ lÃ½ gá»­i tin tháº­t hoáº·c giáº£ láº­p
    if (isMock) {
      console.log(`[Zalo Service Mock] Giáº£ láº­p gá»­i tin tá»›i Zalo User: ${recipientId}`);
      conversation.lastMessageText = text;
      conversation.lastMessageAt = sentAt;
      conversation.unreadCount = 0;
      if (senderType === "human") {
        conversation.aiPausedUntil = new Date(Date.now() + 30 * 60 * 1000); // Táº¡m dá»«ng AI cho cuá»™c há»™i thoáº¡i nÃ y 30 phÃºt
      }
      await conversation.save();
      newMsg.status = "delivered";
      await newMsg.save();
      emitRealtimeUpdate();

      // LÃªn lá»‹ch pháº£n há»“i tá»± Ä‘á»™ng tá»« Bot/KhÃ¡ch hÃ ng giáº£ láº­p sau 2.5 giÃ¢y Ä‘á»ƒ tÄƒng tÃ­nh tÆ°Æ¡ng tÃ¡c
      setTimeout(async () => {
        try {
          const autoReplyText = `[Zalo Demo Bot] Cáº£m Æ¡n báº¡n Ä‘Ã£ pháº£n há»“i: "${text}". Há»‡ thá»‘ng ERP Ä‘ang thá»­ nghiá»‡m hoáº¡t Ä‘á»™ng tá»‘t!`;
          const botMessageId = `zalo_in_mock_${Date.now()}`;
          
          const incomingMsg = new ZaloMessageModel({
            conversationId: conversation._id,
            senderId: recipientId,
            recipientId: oaId,
            direction: "inbound",
            text: autoReplyText,
            attachments: [],
            messageId: botMessageId,
            timestamp: new Date(),
            status: "delivered"
          });
          await incomingMsg.save();

          conversation.lastMessageText = autoReplyText;
          conversation.lastMessageAt = new Date();
          conversation.unreadCount += 1;
          await conversation.save();

          // PhÃ¡t socket tin nháº¯n Ä‘áº¿n
          emitToPage(oaId, "new_message", {
            message: incomingMsg,
            conversation: conversation
          });
          emitToPage(oaId, "conversation_updated", conversation);
        } catch (err) {
          console.error("Lá»—i giáº£ láº­p pháº£n há»“i Zalo:", err);
        }
      }, 2500);

    } else {
      // Gá»­i tháº­t qua Zalo OpenAPI
      const token = await this.getAccessTokenByOAId(oaId);
      console.log(`[Zalo SendReply] Resolved token for oaId=${oaId}: ${token ? `FOUND(...${token.slice(-8)})` : "NOT_FOUND"}`);
      if (!token) {
        throw new Error("Zalo token Ä‘Ã£ háº¿t háº¡n hoáº·c khÃ´ng cÃ²n há»£p lá»‡. Vui lÃ²ng káº¿t ná»‘i láº¡i Zalo OA Ä‘á»ƒ gá»­i tin.");
      }

      const url = "https://openapi.zalo.me/v3.0/oa/message/cs";
      const payload = {
        recipient: {
          user_id: recipientId
        },
        message: {
          text: text
        }
      };

      const response = await (globalThis as any).fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "access_token": token
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[Zalo Service OpenAPI] Gá»­i tin tháº¥t báº¡i: ${response.status} - ${errText}`);
        throw new Error(`Zalo API pháº£n há»“i lá»—i: ${response.status} - ${errText}`);
      }

      const resData = await response.json();
      if (resData.error) {
        throw new Error(`Zalo API Error: ${resData.message} (Code: ${resData.error})`);
      }
      
      console.log(`[Zalo Service OpenAPI] ÄÃ£ gá»­i tin nháº¯n tháº­t thÃ nh cÃ´ng:`, resData);
      conversation.lastMessageText = text;
      conversation.lastMessageAt = sentAt;
      conversation.unreadCount = 0;
      if (senderType === "human") {
        conversation.aiPausedUntil = new Date(Date.now() + 30 * 60 * 1000); // Táº¡m dá»«ng AI cho cuá»™c há»™i thoáº¡i nÃ y 30 phÃºt
      }
      await conversation.save();
      newMsg.messageId = resData.data?.message_id || messageId;
      newMsg.status = "delivered";
      await newMsg.save();
      emitRealtimeUpdate();
    }

    return {
      status: "success",
      messageId: newMsg.messageId,
    };
  },

  async diagnoseConversation(oaId: string, conversationId: string) {
    const conversation = await ZaloConversationModel.findOne({ _id: conversationId, oaId }).lean();
    const userOwner = await UserModel.findOne({
      "zaloIntegration.isConnected": true,
      "zaloIntegration.oaId": oaId
    }).select("email companyCode aiAutoReplyConfig zaloIntegration.oaId zaloIntegration.oaName zaloIntegration.accessToken").lean();
    const { SocialIntegrationModel } = require("../model/social-integration.model");
    const companyIntegration = await SocialIntegrationModel.findOne({
      platform: "Zalo",
      username: oaId,
      isConnected: true
    }).lean();

    let companyCode = userOwner?.companyCode || companyIntegration?.companyCode || null;
    let ownerEmail = userOwner?.email || null;
    let ownerSource = userOwner ? "user" : null;
    let aiEnabled = !!userOwner?.aiAutoReplyConfig?.enabled;
    let replyDelay = userOwner?.aiAutoReplyConfig?.replyDelay ?? null;
    let model = userOwner?.aiAutoReplyConfig?.model || null;

    if (!userOwner && companyCode) {
      const companyUser = await UserModel.findOne({
        companyCode,
        "aiAutoReplyConfig.enabled": true,
      }).select("email aiAutoReplyConfig").lean()
        || await UserModel.findOne({ companyCode }).select("email aiAutoReplyConfig").lean();
      if (companyUser) {
        ownerEmail = companyUser.email;
        ownerSource = "company";
        aiEnabled = !!companyUser.aiAutoReplyConfig?.enabled;
        replyDelay = companyUser.aiAutoReplyConfig?.replyDelay ?? null;
        model = companyUser.aiAutoReplyConfig?.model || null;
      }
    }

    const latestMessage = conversation
      ? await ZaloMessageModel.findOne({ conversationId: conversation._id }).sort({ timestamp: -1 }).lean()
      : null;
    const token = await this.getAccessTokenByOAId(oaId);
    const reasons: string[] = [];
    if (!conversation) reasons.push("conversation_not_found");
    if (!userOwner && !companyIntegration) reasons.push("owner_not_found");
    if (!aiEnabled) reasons.push("ai_disabled");
    if (!token) reasons.push("missing_zalo_access_token");
    if (conversation && !latestMessage) reasons.push("no_messages");
    if (latestMessage && latestMessage.direction !== "inbound") reasons.push("latest_message_not_inbound");
    if (latestMessage?.direction === "inbound" && !String(latestMessage.text || "").trim()) reasons.push("latest_inbound_message_empty");

    return {
      channel: "zalo",
      oaId,
      conversationFound: !!conversation,
      conversationOaId: conversation?.oaId || null,
      recipientId: conversation?.recipientId || null,
      ownerEmail,
      ownerSource,
      companyCode,
      aiEnabled,
      replyDelay,
      model,
      hasAccessToken: !!token,
      accessTokenTail: token ? token.slice(-8) : null,
      latestMessageDirection: latestMessage?.direction || null,
      latestMessageId: latestMessage?.messageId || null,
      latestMessageText: latestMessage?.text || null,
      latestMessageAt: latestMessage?.timestamp || null,
      shouldTriggerAutoReply: reasons.length === 0,
      reasons,
    };
  },

  async diagnoseOaConfig(userId: string, resolvedOaId?: string) {
    const user = await UserModel.findById(userId)
      .select("email companyCode zaloIntegration")
      .lean();
    const { SocialIntegrationModel } = require("../model/social-integration.model");
    const companyIntegrations = await SocialIntegrationModel.find({
      companyCode: user?.companyCode,
      platform: "Zalo",
    })
      .select("displayName username isConnected accessToken refreshToken tokenExpiredAt")
      .lean();

    const matchingCompany = resolvedOaId
      ? companyIntegrations.find((item: any) => item.username === resolvedOaId)
      : null;
    const matchingUser = user?.zaloIntegration?.oaId === resolvedOaId ? user.zaloIntegration : null;
    const token = resolvedOaId ? await this.getAccessTokenByOAId(resolvedOaId) : null;

    console.log(`[Zalo Diagnose OA] user=${user?.email}, company=${user?.companyCode}, resolvedOaId=${resolvedOaId || "none"}, userOaId=${user?.zaloIntegration?.oaId || "none"}, companyOaIds=${companyIntegrations.map((item: any) => item.username).join(",") || "none"}, token=${token ? `FOUND(...${token.slice(-8)})` : "NOT_FOUND"}`);

    return {
      userEmail: user?.email || null,
      companyCode: user?.companyCode || null,
      personalIntegration: user?.zaloIntegration
        ? {
            isConnected: !!user.zaloIntegration.isConnected,
            oaId: user.zaloIntegration.oaId || null,
            oaName: user.zaloIntegration.oaName || null,
            hasToken: !!user.zaloIntegration.accessToken,
            accessTokenTail: user.zaloIntegration.accessToken ? user.zaloIntegration.accessToken.slice(-8) : null,
            hasRefreshToken: !!user.zaloIntegration.refreshToken,
            tokenExpiredAt: user.zaloIntegration.tokenExpiredAt || null,
          }
        : null,
      companyIntegrations: companyIntegrations.map((item: any) => ({
        displayName: item.displayName,
        oaId: item.username || null,
        isConnected: !!item.isConnected,
        hasToken: !!item.accessToken,
        accessTokenTail: item.accessToken ? item.accessToken.slice(-8) : null,
        hasRefreshToken: !!item.refreshToken,
        tokenExpiredAt: item.tokenExpiredAt || null,
      })),
      resolvedOaId: resolvedOaId || null,
      resolvedSource: matchingCompany ? "company" : matchingUser ? "user" : null,
      hasResolvedToken: !!token,
      resolvedTokenTail: token ? token.slice(-8) : null,
    };
  },

  /**
   * Xá»­ lÃ½ sá»± kiá»‡n Webhook tá»« Zalo OA gá»­i sang
   */
  async handleWebhookEvent(body: any) {
    console.log("[Zalo Service Webhook] Nháº­n sá»± kiá»‡n tá»« Zalo OA:", JSON.stringify(body));

    let oaId = body.oa_id || body.recipient?.id;
    
    // Zalo's official developer console test webhook sends a hardcoded recipient.id of "579745863508352884"
    if (oaId === "579745863508352884") {
      console.log("[Zalo Service Webhook] PhÃ¡t hiá»‡n payload test tá»« Zalo Webhooks UI. Tá»± Ä‘á»™ng chuyá»ƒn Ä‘á»•i sang Zalo OA ID active.");
      const activeUser = await UserModel.findOne({ "zaloIntegration.isConnected": true });
      let foundOaId = activeUser?.zaloIntegration?.oaId;
      if (!foundOaId) {
        const { SocialIntegrationModel } = require("../model/social-integration.model");
        const companyIntegration = await SocialIntegrationModel.findOne({
          platform: "Zalo",
          isConnected: true
        });
        if (companyIntegration) {
          foundOaId = companyIntegration.username;
        }
      }
      oaId = foundOaId || process.env.ZALO_OA_ID || "270721158521070717";
    }

    const eventName = body.event_name;
    if (!oaId || !eventName) {
      console.warn("[Zalo Service Webhook] Thiáº¿u oa_id hoáº·c event_name. Bá» qua.");
      return;
    }

    // CÃ¡c sá»± kiá»‡n tin nháº¯n tá»« ngÆ°á»i dÃ¹ng
    const messageEvents = ["user_send_text", "user_send_image", "user_send_link", "user_send_sticker"];
    if (!messageEvents.includes(eventName)) {
      console.log(`[Zalo Service Webhook] Sá»± kiá»‡n ${eventName} khÃ´ng náº±m trong danh sÃ¡ch xá»­ lÃ½ tin nháº¯n chat. Bá» qua.`);
      return;
    }

    const senderId = body.sender?.id; // User ID OA-Scoped cá»§a khÃ¡ch hÃ ng
    const messageId = body.message?.msg_id || `zalo_in_${Date.now()}`;
    const timestamp = body.timestamp ? new Date(Number(body.timestamp)) : new Date();
    const duplicateMsg = await ZaloMessageModel.findOne({ messageId });
    if (duplicateMsg) {
      console.info(`[Zalo Service Webhook] Bo qua webhook trung cho messageId=${messageId}.`);
      return;
    }

    let text = body.message?.text || "";
    const attachments: any[] = [];

    if (eventName === "user_send_image" && Array.isArray(body.message?.attachments)) {
      body.message.attachments.forEach((att: any) => {
        attachments.push({
          type: "image",
          url: att.payload?.url || "",
        });
      });
      if (!text) text = "[HÃ¬nh áº£nh]";
    } else if (eventName === "user_send_sticker") {
      attachments.push({
        type: "sticker",
        url: body.message?.url || "",
      });
      if (!text) text = "[Sticker]";
    } else if (eventName === "user_send_link") {
      if (!text) text = `[Link] ${body.message?.url || ""}`;
    }

    // Láº¥y thÃ´ng tin káº¿t ná»‘i tá»« User hoáº·c Company Integration
    const user = await UserModel.findOne({
      "zaloIntegration.isConnected": true,
      "zaloIntegration.oaId": oaId
    });

    let isConnected = !!user;
    let isMock = user?.zaloIntegration?.isMock ?? false;

    if (!user) {
      const { SocialIntegrationModel } = require("../model/social-integration.model");
      const companyIntegration = await SocialIntegrationModel.findOne({
        platform: "Zalo",
        username: oaId,
        isConnected: true
      });
      if (companyIntegration) {
        isConnected = true;
        isMock = !!companyIntegration.isMock;
      }
    }

    if (!isConnected) {
      console.warn(`[Zalo Service Webhook] KhÃ´ng tÃ¬m tháº¥y liÃªn káº¿t Zalo OA hoáº¡t Ä‘á»™ng nÃ o cho OA ID: ${oaId}`);
      return;
    }

    // TÃ¬m hoáº·c táº¡o cuá»™c há»™i thoáº¡i
    let conversation = await ZaloConversationModel.findOne({ recipientId: senderId, oaId });
    let senderName = conversation?.senderName || "KhÃ¡ch hÃ ng Zalo";
    let avatarUrl = conversation?.avatarUrl || "";

    // Thá»­ láº¥y profile tá»« Zalo API náº¿u cÃ³ Access Token há»£p lá»‡, khÃ´ng pháº£i Mock vÃ  thÃ´ng tin hiá»‡n táº¡i Ä‘ang lÃ  máº·c Ä‘á»‹nh
    if (!isMock && (senderName === "KhÃ¡ch hÃ ng Zalo" || !avatarUrl)) {
      try {
        const token = await this.getAccessTokenByOAId(oaId);
        if (token) {
          const profileUrl = `https://openapi.zalo.me/v3.0/oa/getprofile?data=${encodeURIComponent(JSON.stringify({ user_id: senderId }))}`;
          const profileResponse = await (globalThis as any).fetch(profileUrl, {
            headers: { "access_token": token }
          });
          if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            if (profileData.data) {
              senderName = profileData.data.shared_info?.name || profileData.data.display_name || senderName;
              avatarUrl = profileData.data.avatar || avatarUrl;
            }
          }
        }
      } catch (err) {
        console.error("[Zalo Service Webhook] KhÃ´ng láº¥y Ä‘Æ°á»£c thÃ´ng tin profile tá»« Zalo API:", err);
      }
    }

    if (!conversation) {
      conversation = new ZaloConversationModel({
        recipientId: senderId,
        senderName,
        avatarUrl,
        oaId,
        lastMessageText: text,
        lastMessageAt: timestamp,
        unreadCount: 1,
        status: "open",
      });
      await conversation.save();
    } else {
      conversation.senderName = senderName;
      conversation.avatarUrl = avatarUrl;
      conversation.lastMessageText = text;
      conversation.lastMessageAt = timestamp;
      conversation.unreadCount += 1;
      conversation.status = "open";
      await conversation.save();
    }

    // LÆ°u tin nháº¯n chi tiáº¿t
    const existingMsg = await ZaloMessageModel.findOne({ messageId });
    if (!existingMsg) {
      const newMsg = new ZaloMessageModel({
        conversationId: conversation._id,
        senderId,
        recipientId: oaId,
        direction: "inbound",
        text,
        attachments,
        messageId,
        timestamp,
        status: "delivered",
      });
      await newMsg.save();

      // Realtime update qua Socket.IO
      emitToPage(oaId, "new_message", {
        message: newMsg,
        conversation: conversation
      });
      emitToPage(oaId, "conversation_updated", conversation);
      console.log(`[Zalo Service Webhook] ÄÃ£ lÆ°u tin nháº¯n má»›i thÃ nh cÃ´ng tá»« Zalo User: ${senderId}`);

      // KÃ­ch hoáº¡t AI Auto-Reply Bot báº¥t Ä‘á»“ng bá»™
      aiAutoReplyService.triggerAutoReply("zalo", oaId, conversation._id.toString(), text, messageId);
    }
  }
};


