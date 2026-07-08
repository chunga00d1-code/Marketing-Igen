import { getAccessToken } from "./authService";
import { ContentApprovalCard } from "../types";
import { geminiApi } from "../api/gemini";
import { elevenlabsApi } from "../api/elevenlabs";
import { heygenApi } from "../api/heygen";

const DEMO_VIDEO_URL_PATTERNS = [
  "w3schools.com/html/mov_bbb.mp4",
  "example.com/video.mp4",
  "example.com/videos/"
];

export function buildFacebookPostUrl(postId?: string | null): string {
  const normalizedPostId = String(postId || "").trim();
  if (!normalizedPostId || normalizedPostId.includes("mock")) {
    return "";
  }

  if (normalizedPostId.includes("_")) {
    const [pageId, storyFbid] = normalizedPostId.split("_");
    if (pageId && storyFbid) {
      return `https://www.facebook.com/permalink.php?story_fbid=${encodeURIComponent(storyFbid)}&id=${encodeURIComponent(pageId)}`;
    }
  }

  return `https://www.facebook.com/${encodeURIComponent(normalizedPostId)}`;
}

function normalizePromptBlock(value?: string | null): string {
  return String(value || "").replace(/\r/g, "").trim();
}

export function buildFaithfulMediaPrompt(
  card: Partial<ContentApprovalCard>,
  type: "image" | "video" = "image"
): string {
  const sourceBrief = normalizePromptBlock(card.sourceBrief);
  const title = normalizePromptBlock(card.title);
  const mediaPrompt = normalizePromptBlock(card.mediaPrompt);
  const outline = normalizePromptBlock(card.outline);
  const bodyText = normalizePromptBlock(card.bodyText);
  const channel = normalizePromptBlock(card.channel);
  const contentType = normalizePromptBlock(card.contentType);

  const sourceFacts = [
    sourceBrief ? `Original source brief: ${sourceBrief}` : "",
    title ? `Title: ${title}` : "",
    channel ? `Channel: ${channel}` : "",
    contentType ? `Content type: ${contentType}` : "",
    outline ? `Outline: ${outline}` : "",
    bodyText ? `Body text: ${bodyText}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const strictRules = [
    "STRICT SOURCE-OF-TRUTH REQUIREMENT:",
    "Use only the information grounded in the title, outline, body text, and provided reference image.",
    "Do not invent people, products, services, locations, claims, numbers, uniforms, branding details, office scenes, or props that are not explicitly present in the source.",
    "If the source is a recruitment post, the visual must stay in a recruitment/employer-branding context only.",
    "If the source does not mention a product, do not add a product shot.",
    "If the source does not specify a location or character, keep the scene generic and minimal rather than making up details.",
    type === "image"
      ? "Generate one faithful still image that matches the brief exactly."
      : "Generate one faithful video concept that matches the brief exactly.",
  ].join("\n");

  const visualInstruction = mediaPrompt
    ? `Existing visual prompt to preserve and refine faithfully:\n${mediaPrompt}`
    : "No existing visual prompt is available. Derive the visual only from the source facts above without adding new meaning.";

  return [strictRules, sourceFacts ? `SOURCE FACTS:\n${sourceFacts}` : "", visualInstruction]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function stripDemoVideoUrl(videoUrl?: string | null): string | null {
  const value = String(videoUrl || "").trim();
  if (!value) return null;
  const normalized = value.toLowerCase();
  return DEMO_VIDEO_URL_PATTERNS.some((pattern) => normalized.includes(pattern)) ? null : value;
}

function normalizeMarketingCard(item: any): ContentApprovalCard {
  return {
    ...item,
    id: item._id || item.id,
    videoUrl: stripDemoVideoUrl(item.videoUrl),
  };
}

function sanitizeMarketingPayload<T extends Record<string, any>>(payload: T): T {
  if (!Object.prototype.hasOwnProperty.call(payload, "videoUrl")) {
    return payload;
  }
  return {
    ...payload,
    videoUrl: stripDemoVideoUrl(payload.videoUrl),
  };
}

export const marketingService = {
  async getCards(authorUid?: string): Promise<ContentApprovalCard[]> {
    let url = "/api/v1/crud/marketing-contents";
    if (authorUid) {
      url += `?authorUid=${encodeURIComponent(authorUid)}`;
    }
    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });
    if (!res.ok) {
      throw new Error("Không thể tải danh sách bài viết duyệt.");
    }
    const json = await res.json();
    return (json.data || []).map(normalizeMarketingCard);
  },

  subscribeToContents(
    onUpdate: (cards: ContentApprovalCard[]) => void,
    onError: (error: unknown) => void,
    currentUid?: string,
    currentRole?: string
  ): () => void {
    const isUserRole = currentRole === 'user' || currentRole === 'manager';
    const authorUid = undefined; // Hiển thị với tất cả nhân viên trong doanh nghiệp, không lọc theo tác giả


    const fetchCards = async () => {
      try {
        let data = await this.getCards(authorUid);
        
        // Sắp xếp bài mới lên đầu (generatedAt giảm dần)
        data.sort((a, b) => {
          const timeA = a.generatedAt ? new Date(a.generatedAt).getTime() : 0;
          const timeB = b.generatedAt ? new Date(b.generatedAt).getTime() : 0;
          return timeB - timeA;
        });

        // Tự động đánh dấu isNew cho các bài viết tạo mới trong vòng 30 giây gần đây
        const nowTime = Date.now();
        data = data.map(card => {
          const isRecent = card.generatedAt && (nowTime - new Date(card.generatedAt).getTime() < 30000);
          if (isRecent) {
            return { ...card, isNew: true };
          }
          return card;
        });

        onUpdate(data);
      } catch (err) {
        if (onError) {
          onError(err);
        } else {
          console.error("Lỗi tải danh sách bài đăng marketing:", err);
        }
      }
    };

    fetchCards();
    const interval = setInterval(fetchCards, 5000);
    return () => clearInterval(interval);
  },

  async updateCardStatus(id: string, newStatus: 'draft' | 'pending' | 'approved' | 'scheduled' | 'published'): Promise<void> {
    const payload: Record<string, any> = { status: newStatus };
    if (newStatus === 'approved') {
      payload.scheduledDate = "";
      payload.scheduledTime = "";
    }
    await this.updateCard(id, payload);
  },

  async scheduleCard(id: string, scheduledDate: string, scheduledTime: string, integrationId?: string): Promise<void> {
    // 1. Lấy dữ liệu bài đăng đầy đủ trước
    const cardData = await this.getCardById(id);

    if (!cardData.authorUid) {
      throw new Error("Bài đăng không có thông tin tác giả (authorUid).");
    }

    const channel = cardData.channel || 'Facebook';
    let integrationInfo: any = null;

    // 2. Đọc cấu hình liên kết mạng xã hội
    if (integrationId) {
      // Đọc cấu hình từ SocialIntegration cụ thể được chọn
      const res = await fetch(`/api/v1/crud/social-integrations/${integrationId}`, {
        headers: {
          "Authorization": `Bearer ${getAccessToken()}`,
        },
      });
      if (!res.ok) {
        throw new Error("Không tìm thấy thông tin tài khoản liên kết được chọn.");
      }
      const json = await res.json();
      const integration = json.data;

      if (channel === 'Facebook') {
        integrationInfo = {
          pageId: integration.username, // Page ID lưu ở username
          pageAccessToken: integration.accessToken,
          isMock: !!integration.isMock
        };
      } else if (channel === 'TikTok') {
        integrationInfo = {
          username: integration.username,
          displayName: integration.displayName,
          blotatoAccountId: integration.blotatoAccountId,
          accessToken: integration.accessToken,
          isMock: !!integration.isMock
        };
      } else {
        throw new Error(`Kênh đăng tải "${channel}" chưa hỗ trợ tự động lên lịch.`);
      }
    } else {
      // Fallback: Đọc cấu hình liên kết mạng xã hội cá nhân của tác giả qua user API
      const userRes = await fetch(`/api/v1/crud/users/${cardData.authorUid}`, {
        headers: {
          "Authorization": `Bearer ${getAccessToken()}`,
        },
      });
      if (!userRes.ok) {
        throw new Error("Không tìm thấy thông tin hồ sơ của tác giả.");
      }
      const userJson = await userRes.json();
      const userProfile = userJson.data;

      if (channel === 'Facebook') {
        const fbInt = userProfile.facebookIntegration;
        if (!fbInt || !fbInt.isConnected) {
          throw new Error("Tác giả chưa liên kết với Facebook Page.");
        }
        integrationInfo = {
          pageId: fbInt.pageId,
          pageAccessToken: fbInt.pageAccessToken,
          isMock: !!fbInt.isMock
        };
      } else if (channel === 'TikTok') {
        const ttInt = userProfile.tiktokIntegration;
        if (!ttInt || !ttInt.isConnected) {
          throw new Error("Tác giả chưa liên kết với tài khoản TikTok.");
        }
        integrationInfo = {
          username: ttInt.username,
          displayName: ttInt.displayName,
          isMock: !!ttInt.isMock
        };
      } else {
        throw new Error(`Kênh đăng tải "${channel}" chưa hỗ trợ tự động lên lịch.`);
      }
    }

    // 3. Gọi API Express Backend gửi yêu cầu schedule sang n8n
    const response = await fetch('/api/v1/scheduler/schedule-post', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`
      },
      body: JSON.stringify({
        cardId: id,
        channel,
        title: cardData.title,
        bodyText: cardData.bodyText,
        imageUrl: cardData.imageUrl || '',
        videoUrl: cardData.videoUrl || '',
        scheduledDate,
        scheduledTime,
        integration: integrationInfo
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Lên lịch qua n8n thất bại: ${response.status} - ${errText}`);
    }

    const resData = await response.json();
    if (resData.status !== 'success') {
      throw new Error(resData.message || 'Lỗi không xác định từ máy chủ khi lên lịch.');
    }

    // 4. Chỉ khi thành công hết, mới lưu thời gian đặt lịch, đổi status sang scheduled và lưu facebookPostId
    const fbPostId = resData.data?.id || resData.data?.data?.id || '';
    
    await this.updateCard(id, {
      status: 'scheduled',
      scheduledDate,
      scheduledTime,
      integrationId,
      ...(fbPostId ? { facebookPostId: fbPostId } : {})
    });

    console.log(`[iGen Schedule Service]: Đã lên lịch bài đăng ${id} thành công qua n8n! ID bài viết: ${fbPostId}`);
  },

  async deleteCard(id: string): Promise<void> {
    const res = await fetch(`/api/v1/crud/marketing-contents/${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });
    if (!res.ok) {
      throw new Error("Không thể xóa bài đăng.");
    }
  },

  async saveCard(card: ContentApprovalCard): Promise<ContentApprovalCard> {
    const { id, ...postBody } = sanitizeMarketingPayload(card);
    const res = await fetch("/api/v1/crud/marketing-contents", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(postBody),
    });
    if (!res.ok) {
      throw new Error("Không thể lưu bài đăng.");
    }
    const json = await res.json();
    return normalizeMarketingCard(json.data);
  },

  async saveCards(cards: ContentApprovalCard[]): Promise<ContentApprovalCard[]> {
    const savedCards = await Promise.all(
      cards.map(async (card) => {
        const { id, ...postBody } = sanitizeMarketingPayload(card);
        const res = await fetch("/api/v1/crud/marketing-contents", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${getAccessToken()}`,
          },
          body: JSON.stringify(postBody),
        });
        if (!res.ok) {
          throw new Error("Không thể lưu bài đăng.");
        }
        const json = await res.json();
        return normalizeMarketingCard(json.data);
      })
    );
    return savedCards;
  },

  async updateCard(id: string, card: Partial<ContentApprovalCard>): Promise<void> {
    const res = await fetch(`/api/v1/crud/marketing-contents/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(sanitizeMarketingPayload(card)),
    });
    if (!res.ok) {
      throw new Error("Không thể cập nhật bài đăng.");
    }
  },

  async getCardById(id: string): Promise<ContentApprovalCard> {
    const res = await fetch(`/api/v1/crud/marketing-contents/${id}`, {
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });
    if (!res.ok) {
      throw new Error("Không tìm thấy thông tin bài đăng.");
    }
    const json = await res.json();
    return normalizeMarketingCard(json.data);
  },

  async publishToFacebook(
    id: string,
    pageAccessToken: string,
    pageId: string,
    bodyText: string,
    isMock: boolean,
    imageUrl?: string,
    videoUrl?: string
  ): Promise<string> {
    if (isMock) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const mockPostId = `mock-post-${Date.now()}`;
      await this.updateCard(id, {
        status: 'published',
        publishedAt: new Date().toISOString(),
        facebookPostId: mockPostId
      });
      console.log(`[iGen ERP Autopost (MOCK)]: Đã đăng bài thành công lên Facebook Page (Demo). ID bài viết: ${mockPostId}`);
      return mockPostId;
    }

    const response = await fetch('/api/v1/facebook/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({
        cardId: id,
        pageId,
        accessToken: pageAccessToken,
        content: extractDraftContent(bodyText),
        imageUrl,
        videoUrl
      })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || errData.details || `Lỗi máy chủ HTTP ${response.status}`);
    }

    const result = await response.json();
    const fbData = result.data?.data ?? result.data;
    const postId = fbData.id ?? fbData.post_id ?? `post-${Date.now()}`;
    const postUrl = fbData.postUrl ?? fbData.permalink_url ?? buildFacebookPostUrl(postId);

    await this.updateCard(id, {
      status: 'published',
      publishedAt: new Date().toISOString(),
      facebookPostId: postId,
      postUrl
    });

    console.log(`[iGen ERP Autopost]: Đã đăng bài thành công lên Facebook Page qua n8n. Post ID: ${postId}`);
    return postId;
  },

  async developIdea(concept: {
    title: string;
    summary: string;
    suggestedContent: string;
    channels: string[];
    mediaType?: string;
    imageModel?: string;
    imageResolution?: string;
    imageAspectRatio?: string;
    videoModel?: string;
    videoQuality?: string;
    videoDuration?: number;
    videoAspectRatio?: string;
    mediaPrompt?: string;
    humanVoiceId?: string;
    humanVoiceModel?: string;
    humanDurationSeconds?: number;
  }) {
    return geminiApi.developMarketingIdea(concept);
  },

  async fetchSuggestions(): Promise<string[]> {
    return geminiApi.fetchMarketingSuggestions();
  },

  async updateCardMedia(mediaUrl: string | null, type: 'image' | 'video', cardIds: string[]): Promise<void> {
    if (cardIds.length === 0) return;
    await Promise.all(
      cardIds.map((id) => {
        const updateData: Record<string, any> = {};
        if (type === 'image') {
          updateData.imageUrl = mediaUrl ? mediaUrl : null;
        } else {
          updateData.videoUrl = mediaUrl ? mediaUrl : null;
        }
        return this.updateCard(id, updateData);
      })
    );
  },

  async uploadMediaToStorage(tempUrl: string, filename: string, type: 'image' | 'video'): Promise<string> {
    try {
      const response = await fetch('/api/v1/media/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`
        },
        body: JSON.stringify({
          file: tempUrl,
          folder: 'igen_erp/marketing',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Lỗi tải lên Cloudinary: ${response.statusText}`);
      }

      const data = await response.json();
      return data.url;
    } catch (e) {
      console.error("[marketingService.uploadMediaToStorage] Error:", e);
      throw e;
    }
  },

  async publishToTikTok(
    id: string,
    caption: string,
    videoUrl: string,
    isMock: boolean,
    privacyLevel: string = 'SELF_ONLY',
    options?: {
      integrationId?: string;
      accessToken?: string;
      username?: string;
    }
  ): Promise<{ postId: string; status: "success" | "pending"; shareUrl?: string }> {
    if (isMock) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const mockPostId = `tiktok_mock_${Date.now()}`;
      await this.updateCard(id, {
        status: 'published',
        publishedAt: new Date().toISOString(),
        tiktokPostId: mockPostId,
        tiktokShareUrl: `https://www.tiktok.com/@demo/video/${mockPostId}`
      });
      console.log(`[iGen ERP TikTok (MOCK)]: Đã đăng video thành công. ID: ${mockPostId}`);
      return {
        postId: mockPostId,
        status: "success",
        shareUrl: `https://www.tiktok.com/@demo/video/${mockPostId}`
      };
    }

    const response = await fetch('/api/v1/tiktok/publish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({
        cardId: id,
        caption,
        videoUrl,
        privacyLevel,
        integrationId: options?.integrationId,
        accessToken: options?.accessToken,
        username: options?.username,
      }),
    });

    if (!response.ok) {
      let errMsg = "";
      try {
        const errData = await response.json();
        errMsg = errData.details || errData.message || `Lỗi máy chủ HTTP ${response.status}`;
      } catch {
        errMsg = `Lỗi máy chủ HTTP ${response.status}`;
      }
      throw new Error(errMsg);
    }

    const resData = await response.json();
    if (resData.status !== 'success' && resData.status !== 'pending') {
      throw new Error(resData.message || 'Lỗi không xác định từ máy chủ khi đăng TikTok.');
    }

    const { postId, shareUrl, publishId } = resData.data || {};
    const normalizedStatus = resData.status === "pending" ? "pending" : "success";

    if (normalizedStatus === "success") {
      await this.updateCard(id, {
        status: 'published',
        publishedAt: new Date().toISOString(),
        tiktokPostId: postId,
        tiktokShareUrl: shareUrl
      });

      console.log(`[iGen ERP TikTok]: Đã đăng video thành công. Post ID: ${postId}`);
    } else {
      await this.updateCard(id, {
        status: 'processing',
        tiktokPostId: postId || publishId || '',
        tiktokShareUrl: shareUrl || ''
      });

      console.log(`[iGen ERP TikTok]: Video đang được TikTok xử lý. Publish ID: ${publishId || postId || "n/a"}`);
    }

    return {
      postId: String(postId || publishId || ""),
      status: normalizedStatus,
      shareUrl: shareUrl || "",
    };
  },
  async resolveHeyGenVideoUrl(videoId: string, context: {
    avatarId: string;
    audioUrl?: string;
    audioRecordId?: string;
    motionText?: string;
    aspectRatio?: "16:9" | "9:16" | "1:1";
    title?: string;
    description?: string;
  }) {
    const maxAttempts = 36;
    const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await wait(10000);

      const status = await heygenApi.getVideoStatus(videoId, context);
      const jobStatus = String(status?.jobStatus || "").toLowerCase();
      const finalUrl = status?.videoUrl || status?.record?.url || "";

      if (finalUrl && !finalUrl.startsWith("pending://heygen/")) {
        return {
          videoUrl: finalUrl,
          provider: "heygen",
        };
      }

      if (jobStatus === "completed" && finalUrl) {
        return {
          videoUrl: finalUrl,
          provider: "heygen",
        };
      }

      if (jobStatus === "failed" || jobStatus === "error") {
        throw new Error(status?.error || "HeyGen không thể tạo video từ audio đã sinh.");
      }
    }

    throw new Error("HeyGen tạo video quá lâu. Vui lòng kiểm tra lại lịch sử render sau.");
  },

  async generateHumanVideoForCard(
    cardId: string,
    options?: {
      avatarId?: string;
      voiceId?: string;
      voiceModel?: string;
      engineType?: string;
      inputText?: string;
      usePersonalVoice?: boolean;
      aspectRatio?: "16:9" | "9:16" | "1:1";
      quality?: string;
      onProgressUpdate?: (status: string) => void;
    }
  ): Promise<ContentApprovalCard> {
    const card = await this.getCardById(cardId);
    if (!card) {
      throw new Error("Không tìm thấy bài đăng.");
    }

    const engineType = options?.engineType || card.engineType || "avatar_iv";
    const isAvatarThree = engineType === "avatar_iii";
    const usePersonalVoice = Boolean(options?.usePersonalVoice ?? card.usePersonalVoice ?? false);
    const voiceScript = options?.inputText || card.inputText || getHumanVideoScript(card);
    const motionText = String(card.motionText || "").trim();

    let avatarId = options?.avatarId || card.avatarId || "mc-linh";
    let voiceId = options?.voiceId || card.voiceId || (isAvatarThree ? "0e7e1377232f4544876e37c503cc083f" : "igen-female-bright");
    let voiceModel = options?.voiceModel || "eleven_turbo_v2_5";
    const aspectRatio = options?.aspectRatio || (card.channel === "TikTok" ? "9:16" : "16:9");
    const quality = options?.quality || "720p";
    const onProgressUpdate = options?.onProgressUpdate;

    let audioRecordId: string | undefined = undefined;
    let audioUrl: string | undefined = undefined;

    if (isAvatarThree || usePersonalVoice) {
      if (onProgressUpdate) {
        onProgressUpdate("Đang gửi yêu cầu tạo video trực tiếp bằng văn bản sang HeyGen...");
      }
    } else {
      if (onProgressUpdate) {
        onProgressUpdate("Đang tạo giọng nói Tiếng Việt...");
      }

      const voiceResult = await elevenlabsApi.generateVoice({
        textToSpeak: voiceScript,
        mode: "single",
        modelName: voiceModel,
        voiceName: voiceId,
        title: card.title,
        description: card.motionText || `Voice auto cho ${card.channel}`,
        saveToHistory: true
      });

      audioRecordId = voiceResult.record?._id || voiceResult.record?.id;
      audioUrl = voiceResult.record?.url || voiceResult.url;
      if (!audioUrl) {
        throw new Error("Không nhận được audio từ ElevenLabs để tạo video người thật.");
      }

      if (onProgressUpdate) {
        onProgressUpdate("Đang gửi audio sang HeyGen...");
      }
    }

    const heygenCreated = await heygenApi.createAvatarVideo({
      avatarId,
      audioRecordId,
      audioUrl,
      inputText: isAvatarThree || usePersonalVoice ? voiceScript : undefined,
      engineType,
      voiceId: isAvatarThree || usePersonalVoice ? voiceId : undefined,
      usePersonalVoice,
      motionText,
      aspectRatio,
      resolution: quality === "1080p" ? "1080p" : "720p",
      title: card.title,
      description: card.title
    });

    const videoId = String(heygenCreated?.videoId || heygenCreated?.record?.metadata?.heygenVideoId || "").trim();
    if (!videoId) {
      throw new Error("HeyGen không trả về videoId hợp lệ.");
    }

    if (onProgressUpdate) {
      onProgressUpdate("Đang chờ HeyGen xử lý video...");
    }

    const resolvedVideo = await this.resolveHeyGenVideoUrl(videoId, {
      avatarId,
      audioRecordId,
      audioUrl,
      inputText: isAvatarThree || usePersonalVoice ? voiceScript : undefined,
      engineType,
      voiceId: isAvatarThree || usePersonalVoice ? voiceId : undefined,
      usePersonalVoice,
      motionText,
      aspectRatio,
      title: card.title,
      description: card.title
    });

    let finalVideoUrl = resolvedVideo.videoUrl;
    let finalAudioUrl = audioUrl;

    try {
      if (onProgressUpdate) {
        onProgressUpdate("Đang tối ưu hóa lưu trữ Cloudinary...");
      }
      const filename = `human_video_${Date.now()}.mp4`;
      finalVideoUrl = await this.uploadMediaToStorage(resolvedVideo.videoUrl, filename, 'video');
    } catch (e) {
      console.warn("Could not upload HeyGen video to Cloudinary, using direct URL:", e);
    }

    const updatePayload = {
      videoUrl: finalVideoUrl,
      voiceScript,
      motionText,
      audioUrl: finalAudioUrl,
      audioRecordId,
      videoProvider: resolvedVideo.provider,
      engineType,
      avatarId,
      voiceId,
      inputText: isAvatarThree || usePersonalVoice ? voiceScript : undefined,
      usePersonalVoice,
    };

    await this.updateCard(card.id, updatePayload);

    return {
      ...card,
      ...updatePayload
    };
  },
};

export function extractDraftContent(text: string): string {
  if (!text) return "";
  
  const markers = [
    "# BẢN NHÁP CHI TIẾT (DRAFT)",
    "# BẢN NHÁP CHI TIẾT",
    "BẢN NHÁP CHI TIẾT (DRAFT)",
    "BẢN NHÁP CHI TIẾT",
    "[BẢN NHÁP CHI TIẾT (DRAFT)]",
    "[BẢN NHÁP CHI TIẾT]",
    "(BẢN NHÁP CHI TIẾT (DRAFT))",
    "(BẢN NHÁP CHI TIẾT)",
    
    "✍️ NỘI DUNG CHI TIẾT (DRAFT CONTENT):",
    "✍️ NỘI DUNG CHI TIẾT (DRAFT CONTENT)",
    "NỘI DUNG CHI TIẾT (DRAFT CONTENT):",
    "NỘI DUNG CHI TIẾT (DRAFT CONTENT)",
    "✍️ NỘI DUNG CHI TIẾT:",
    "✍️ NỘI DUNG CHI TIẾT",
    "NỘI DUNG CHI TIẾT:",
    "NỘI DUNG CHI TIẾT",
    
    "[DRAFT CONTENT]",
    "(DRAFT CONTENT)",
    "DRAFT CONTENT:",
    "DRAFT CONTENT",
    
    "[DRAFT]",
    "(DRAFT)",
    "DRAFT:",
    "DRAFT"
  ];

  const sortedMarkers = [...markers].sort((a, b) => b.length - a.length);

  let currentText = text.trim();
  let found = true;
  let iterations = 0;
  
  while (found && iterations < 5) {
    found = false;
    const prefix = currentText.substring(0, 1500);
    const prefixUpper = prefix.toUpperCase();
    
    for (const marker of sortedMarkers) {
      const index = prefixUpper.indexOf(marker.toUpperCase());
      if (index !== -1) {
        currentText = currentText.substring(index + marker.length).trim();
        found = true;
        iterations++;
        break;
      }
    }
  }
  
  return currentText;
}

export function splitOutlineAndDraft(text: string): { outline: string; bodyText: string } {
  if (!text) return { outline: "", bodyText: "" };
  
  const markers = [
    "# BẢN NHÁP CHI TIẾT (DRAFT)",
    "# BẢN NHÁP CHI TIẾT",
    "BẢN NHÁP CHI TIẾT (DRAFT)",
    "BẢN NHÁP CHI TIẾT",
    "[BẢN NHÁP CHI TIẾT (DRAFT)]",
    "[BẢN NHÁP CHI TIẾT]",
    "(BẢN NHÁP CHI TIẾT (DRAFT))",
    "(BẢN NHÁP CHI TIẾT)",
    
    "✍️ NỘI DUNG CHI TIẾT (DRAFT CONTENT):",
    "✍️ NỘI DUNG CHI TIẾT (DRAFT CONTENT)",
    "NỘI DUNG CHI TIẾT (DRAFT CONTENT):",
    "NỘI DUNG CHI TIẾT (DRAFT CONTENT)",
    "✍️ NỘI DUNG CHI TIẾT:",
    "✍️ NỘI DUNG CHI TIẾT",
    "NỘI DUNG CHI TIẾT:",
    "NỘI DUNG CHI TIẾT",
    
    "[DRAFT CONTENT]",
    "(DRAFT CONTENT)",
    "DRAFT CONTENT:",
    "DRAFT CONTENT",
    
    "[DRAFT]",
    "(DRAFT)",
    "DRAFT:",
    "DRAFT"
  ];

  const sortedMarkers = [...markers].sort((a, b) => b.length - a.length);
  
  const prefix = text.substring(0, 1500);
  const prefixUpper = prefix.toUpperCase();
  
  for (const marker of sortedMarkers) {
    const index = prefixUpper.indexOf(marker.toUpperCase());
    if (index !== -1) {
      const outline = text.substring(0, index).trim();
      const bodyText = extractDraftContent(text.substring(index));
      return { outline, bodyText };
    }
  }
  
  return { outline: "", bodyText: text.trim() };
}

export function getHumanVideoScript(card: Partial<ContentApprovalCard>): string {
  const directScript = sanitizeHumanVideoVoiceScript(String(card.voiceScript || "").trim());
  if (directScript) return directScript;

  const outlineText = String(card.outline || "").trim();
  const bodyText = String(card.bodyText || "").trim();
  const fallbackParts = [
    `Xin chào, đây là video giới thiệu cho chiến dịch ${card.title || ""}.`,
    card.outline || "",
    bodyText,
    "Liên hệ ngay để nhận tư vấn và nhận ưu đãi phù hợp."
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  return (outlineText || fallbackParts).slice(0, 1200);
}

export function sanitizeHumanVideoVoiceScript(rawText: string): string {
  const text = String(rawText || "").trim();
  if (!text) return "";

  const instructionMarkers = [
    "YÊU CẦU RIÊNG CHO VIDEO NGƯỜI THẬT:",
    "YEU CAU RIENG CHO VIDEO NGUOI THAT:",
  ];

  let cleaned = text;
  for (const marker of instructionMarkers) {
    const markerIndex = cleaned.toUpperCase().indexOf(marker.toUpperCase());
    if (markerIndex !== -1) {
      cleaned = cleaned.slice(0, markerIndex).trim();
      break;
    }
  }

  cleaned = cleaned
    .replace(/^Xin chao,\s*/i, "Xin chào, ")
    .replace(/\bday la\b/gi, "đây là")
    .replace(/\bnoi dung gioi thieu ngan gon cho chien dich\b/gi, "nội dung giới thiệu cho chiến dịch")
    .replace(/\bHay lien he ngay de nhan tu van chi tiet va uu dai phu hop\.?$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  return cleaned;
}

export function stripHumanVideoOutlineSections(rawText: string): string {
  const text = String(rawText || "").trim();
  if (!text) return "";

  const outlineMarkers = [
    "DAN Y CHI TIET",
    "OUTLINE:",
    "(OUTLINE):",
    "[OUTLINE]:",
  ];

  let cleaned = text;
  for (const marker of outlineMarkers) {
    const markerIndex = cleaned.toUpperCase().indexOf(marker);
    if (markerIndex !== -1) {
      cleaned = cleaned.slice(0, markerIndex).trim();
      break;
    }
  }

  return cleaned.replace(/\s+/g, " ").trim();
}
