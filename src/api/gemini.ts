export interface MarketingDevelopPost {
  channel: string;
  contentType: string;
  bodyText: string;
  outline?: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaPrompt?: string;
  voiceScript?: string;
  motionText?: string;
}

function getJwtHeaders(withContentType: boolean = true) {
  const headers: Record<string, string> = {};
  if (withContentType) {
    headers["Content-Type"] = "application/json";
  }
  const token = localStorage.getItem("accessToken");
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function getHeaders(withContentType: boolean = true) {
  const headers: Record<string, string> = {};
  if (withContentType) {
    headers['Content-Type'] = 'application/json';
  }
  const token = localStorage.getItem("accessToken");
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

async function handleErrorResponse(response: Response, defaultError: string): Promise<never> {
  const data = await response.json().catch(() => ({}));
  throw new Error(data.message || defaultError);
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  timeoutMessage: string
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export const geminiApi = {
  /**
   * Lấy 3 gợi ý chủ đề marketing ban đầu từ server.
   */
  async fetchMarketingSuggestions(): Promise<string[]> {
    const headers = await getHeaders(false);
    const response = await fetch('/api/v1/gemini/marketing-suggestions', {
      headers
    });
    if (!response.ok) {
      await handleErrorResponse(response, 'Không thể tải gợi ý chiến dịch marketing');
    }
    const data = await response.json();
    return data.suggestions || [];
  },

  /**
   * Phân tích mục tiêu chiến dịch để lấy các content pillars đề xuất.
   */
  async analyzeMarketingPillars(campaignTopic: string, images?: string[]): Promise<{ pillars: any[] }> {
    const headers = await getHeaders(true);
    const response = await fetchWithTimeout(
      '/api/v1/gemini/marketing-pillars',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ campaignTopic, images }),
      },
      150000,
      'Hết thời gian phân tích Content Pillars. Vui lòng thử lại.'
    );
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi phân tích Content Pillars');
    }
    return response.json();
  },

  /**
   * Thay thế 1 Content Pillar bằng 1 Trụ cột khác mới hoàn toàn.
   */
  async swapMarketingPillar(
    campaignTopic: string,
    currentPillars: any[],
    pillarIdToReplace: string,
    images?: string[]
  ): Promise<{ pillar: any; isMock?: boolean }> {
    const headers = await getHeaders(true);
    const response = await fetchWithTimeout(
      '/api/v1/gemini/marketing-pillars/swap',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ campaignTopic, currentPillars, pillarIdToReplace, images }),
      },
      90000,
      'Hết thời gian thay đổi Content Pillar. Vui lòng thử lại.'
    );
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi thay đổi Content Pillar');
    }
    return response.json();
  },

  /**
   * Phát sinh các bản nháp ý tưởng chiến dịch marketing từ các pillars được chọn.
   */
  async generateMarketingIdeas(
    campaignTopic: string,
    selectedPillars: string[],
    channels?: string[],
    mediaType?: string,
    images?: string[]
  ): Promise<{ concepts: any[]; isMock?: boolean }> {
    const headers = await getHeaders(true);
    const response = await fetchWithTimeout(
      '/api/v1/gemini/marketing-ideas',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ campaignTopic, selectedPillars, channels, mediaType, images }),
      },
      mediaType === "human-video" ? 300000 : 180000,
      mediaType === "human-video"
        ? 'Tạo ý tưởng cho video người thật mất quá lâu. Vui lòng thử lại sau ít phút.'
        : 'Tạo ý tưởng marketing bị quá thời gian chờ. Vui lòng thử lại.'
    );
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi phát sinh ý tưởng marketing');
    }
    return response.json();
  },

  /**
   * Lập dàn ý và viết bài đăng chi tiết cho từng kênh truyền thông từ một ý tưởng cụ thể.
   */
  async developMarketingIdea(concept: {
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
  }): Promise<{ posts: MarketingDevelopPost[]; isMock?: boolean }> {
    const headers = await getHeaders(true);
    const response = await fetchWithTimeout(
      '/api/v1/gemini/marketing-develop',
      {
        method: 'POST',
        headers,
        body: JSON.stringify(concept),
      },
      concept.mediaType === "human-video" ? 360000 : 240000,
      concept.mediaType === "human-video"
        ? 'Phát triển nội dung cho video người thật mất quá lâu. Vui lòng thử lại sau.'
        : 'Phát triển nội dung AI bị quá thời gian chờ. Vui lòng thử lại.'
    );
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi lập dàn ý và viết bài chi tiết');
    }
    return response.json();
  },

  /**
   * Gửi tin nhắn chat đến AI Assistant trong CRM Omni-Inbox.
   */
  async sendChatMessage(
    message: string,
    history: any[],
    aiConfig: any
  ): Promise<{ text: string; isMock: boolean }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ message, history, aiConfig }),
    });
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi kết nối Trợ lý AI');
    }
    return response.json();
  },

  async getKnowledgeHealth(): Promise<any> {
    const response = await fetch("/api/v1/gemini/knowledge-health", {
      headers: getJwtHeaders(false),
    });
    if (!response.ok) {
      throw new Error("Không thể kiểm tra trạng thái AI knowledge");
    }
    return response.json();
  },

  async clearKnowledge(): Promise<any> {
    const response = await fetch("/api/v1/gemini/clear-knowledge", {
      method: "POST",
      headers: getJwtHeaders(true),
    });
    if (!response.ok) {
      throw new Error("Khong the xoa toan bo tri thuc AI");
    }
    return response.json();
  },

  async testReply(message: string, aiConfig: any): Promise<any> {
    const response = await fetch("/api/v1/gemini/test-reply", {
      method: "POST",
      headers: getJwtHeaders(true),
      body: JSON.stringify({ message, aiConfig }),
    });
    if (!response.ok) {
      throw new Error("Không thể tạo câu trả lời thử");
    }
    return response.json();
  },

  async fetchAIReplyLogs(limit: number = 8): Promise<any[]> {
    const response = await fetch(`/api/v1/gemini/ai-reply-logs?limit=${limit}`, {
      headers: getJwtHeaders(false),
    });
    if (!response.ok) {
      throw new Error("Không thể tải log phản hồi AI");
    }
    const data = await response.json();
    return data.logs || [];
  },

  async sendAIReplyFeedback(id: string, feedback: "good" | "bad" | "needs_fix", note: string = ""): Promise<void> {
    const response = await fetch(`/api/v1/gemini/ai-reply-logs/${id}/feedback`, {
      method: "PATCH",
      headers: getJwtHeaders(true),
      body: JSON.stringify({ feedback, note }),
    });
    if (!response.ok) {
      throw new Error("Không thể lưu feedback AI");
    }
  },

  /**
   * Sinh ảnh minh họa AI.
   */
  async generateImage(
    prompt: string,
    options?: { aspectRatio?: string; modelName?: string; resolution?: string; existingImageUris?: string[] }
  ): Promise<{ url: string; isMock: boolean; record?: any }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/generate-image', {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, ...options }),
    });
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi khi sinh ảnh minh họa AI');
    }
    return response.json();
  },

  async generateVideo(
    prompt: string,
    durationSeconds?: number,
    options?: { aspectRatio?: string; modelName?: string; resolution?: string; referenceVideoUri?: string; referenceImageUris?: string[]; activeCardId?: string }
  ): Promise<{ url: string; isMock: boolean; record?: any }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/generate-video', {
      method: 'POST',
      headers,
      body: JSON.stringify({ prompt, durationSeconds, ...options }),
    });
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi khi sinh video AI');
    }
    return response.json();
  },

  async editVideo(
    videoUrl: string,
    prompt: string,
    options?: {
      modelName?: string; aspectRatio?: string; resolution?: string;
      duration?: number; videoDurations?: number[]; blueprint?: any;
      renderMode?: string; renderEngine?: string;
      referenceVideoUrl?: string; referenceVideoDuration?: number;
      outline?: string; scenes?: string[]; brandName?: string; bgMusicUrl?: string;
      scenesContent?: Array<{
        type: 'hook' | 'story' | 'insight' | 'pipeline' | 'ui_mockup' | 'before_after' | 'cta';
        label?: string; title?: string; subtitle?: string;
        titleColor?: 'gold' | 'red' | 'green' | 'white' | 'cyan';
        highlightWords?: string[];
        items?: Array<{ icon?: string; title: string; description?: string; variant?: string }>;
        steps?: Array<{ step?: string; icon?: string; title: string; description?: string; tag?: string; variant?: string }>;
        stats?: Array<{ value: string; label: string }>;
        code?: string;
        liveStats?: Array<{ label: string; value: string }>;
        before?: { label: string; duration?: string };
        after?: { label: string; badge?: string };
        metric?: { from: string; to: string; label?: string };
        ctaButton?: string; ctaPrompt?: string; duration?: number;
      }>;
      colorScheme?: 'dark-gold' | 'dark-cyan' | 'dark-red';
    }
  ): Promise<{ status: string; record: any; blueprint: any }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/edit-video', {
      method: 'POST',
      headers,
      body: JSON.stringify({ videoUrl, prompt, ...options }),
    });
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi khi biên tập video bằng AI');
    }
    return response.json();
  },

  async generateVoice(input: {
    textToSpeak: string;
    styleInstructions?: string;
    mode?: "single" | "multi";
    temperature?: number;
    modelName?: string;
    voiceName?: string;
    speakerA?: string;
    speakerB?: string;
    title?: string;
    description?: string;
    stability?: number;
    similarityBoost?: number;
    useSpeakerBoost?: boolean;
    style?: number;
  }): Promise<{ status: string; record: any }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/generate-voice', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi khi sinh giọng nói AI');
    }
    return response.json();
  },

  async optimizeScript(text: string, readingStyle?: string, model?: string): Promise<{ optimizedText: string }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/optimize-script', {
      method: 'POST',
      headers,
      body: JSON.stringify({ text, readingStyle, model }),
    });
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi khi tối ưu kịch bản');
    }
    return response.json();
  },

  async optimizeImagePrompt(description: string, imageUris?: string[], modelName?: string): Promise<any> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/optimize-prompt', {
      method: 'POST',
      headers,
      body: JSON.stringify({ description, imageUris, modelName }),
    });
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi khi tối ưu prompt ảnh');
    }
    return response.json();
  },

  async optimizeEditPrompt(description: string): Promise<{ optimized_prompt: string }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/optimize-edit-prompt', {
      method: 'POST',
      headers,
      body: JSON.stringify({ description }),
    });
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi khi tối ưu prompt chỉnh sửa video');
    }
    return response.json();
  },

  async optimizeVideoPrompt(description: string, imageUris?: string[]): Promise<any> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/optimize-video-prompt', {
      method: 'POST',
      headers,
      body: JSON.stringify({ description, imageUris }),
    });
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi khi tối ưu prompt video');
    }
    return response.json();
  },

  async analyzeVideoStyle(
    videoUrl: string,
    duration?: number,
    targetVideoUrl?: string,
    targetDuration?: number,
    prompt?: string
  ): Promise<{ status: string; extractedPrompt: string }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/analyze-video-style', {
      method: 'POST',
      headers,
      body: JSON.stringify({ videoUrl, duration, targetVideoUrl, targetDuration, prompt }),
    });
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi khi phân tích phong cách video mẫu');
    }
    return response.json();
  },

  async generateEditScript(
    videoUrl: string,
    duration: number,
    prompt?: string
  ): Promise<{ status: string; script: any }> {
    const headers = await getHeaders(true);
    const response = await fetchWithTimeout(
      '/api/v1/gemini/generate-edit-script',
      { method: 'POST', headers, body: JSON.stringify({ videoUrl, duration, prompt }) },
      300000,
      'Tạo kịch bản biên tập mất quá lâu. Vui lòng thử lại.'
    );
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi tạo kịch bản biên tập video');
    }
    return response.json();
  },

  async renderFromEditScript(
    script: any,
    aspectRatio?: string,
    resolution?: string
  ): Promise<{ status: string; record: any; blueprint: any }> {
    const headers = await getHeaders(true);
    const response = await fetchWithTimeout(
      '/api/v1/gemini/render-from-edit-script',
      { method: 'POST', headers, body: JSON.stringify({ script, aspectRatio, resolution }) },
      60000,
      'Xếp hàng kết xuất video mất quá lâu. Vui lòng thử lại.'
    );
    if (!response.ok) {
      await handleErrorResponse(response, 'Lỗi kết xuất video từ kịch bản');
    }
    return response.json();
  },

  async getMediaHistory(type: "image" | "video" | "voice"): Promise<{ status: string; history: any[] }> {
    const headers = await getHeaders(false);
    const response = await fetch(`/api/v1/gemini/media-history?type=${type}`, {
      headers,
    });
    if (!response.ok) {
      throw new Error('Lỗi lấy lịch sử sinh đa phương tiện');
    }
    return response.json();
  },

  async deleteMediaHistory(id: string): Promise<{ status: string }> {
    const headers = await getHeaders(false);
    const response = await fetch(`/api/v1/gemini/media-history/${id}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) {
      throw new Error('Lỗi khi xóa bản ghi lịch sử');
    }
    return response.json();
  },

  async getElevenLabsVoices(): Promise<{ status: string; voices: any[] }> {
    const headers = await getHeaders(false);
    const response = await fetch('/api/v1/gemini/elevenlabs-voices', {
      headers,
    });
    if (!response.ok) {
      throw new Error('Lỗi lấy danh sách giọng nói ElevenLabs');
    }
    return response.json();
  },

  async generateCustomVoicePreview(input: {
    gender: string;
    accent: string;
    age: string;
    accentStrength: number;
    text: string;
  }): Promise<{ generatedVoiceId: string; url: string }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/elevenlabs-custom-voice-preview', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error('Lỗi thiết kế giọng nói thử nghiệm');
    }
    return response.json();
  },

  async createCustomVoice(input: {
    voiceName: string;
    voiceDescription: string;
    generatedVoiceId: string;
  }): Promise<{ voice_id: string }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/elevenlabs-create-voice', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error('Lỗi lưu giọng nói cá nhân');
    }
    return response.json();
  },

  async addElevenLabsVoice(input: {
    name: string;
    description: string;
    files: string[];
    userId?: string;
  }): Promise<{ voice_id: string }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/elevenlabs-add-voice', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      throw new Error('Lỗi khi nhân bản giọng nói ElevenLabs');
    }
    return response.json();
  },

  async deleteElevenLabsVoice(voiceId: string): Promise<{ success: boolean }> {
    const headers = await getHeaders(true);
    const response = await fetch(`/api/v1/gemini/elevenlabs-delete-voice/${voiceId}`, {
      method: 'DELETE',
      headers,
    });
    if (!response.ok) {
      throw new Error('Lỗi khi xóa giọng nói ElevenLabs');
    }
    return response.json();
  },

  // ─── FreeLLM API — LLM miễn phí ────────────────────────────────────────────

  /** Kiểm tra trạng thái cấu hình FreeLLM API */
  async freeLLMStatus(): Promise<{ configured: boolean; model: string; url: string | null; message: string }> {
    const headers = await getHeaders(false);
    const response = await fetch('/api/v1/gemini/freellm-status', { headers });
    if (!response.ok) await handleErrorResponse(response, 'Lỗi kiểm tra FreeLLM API');
    return response.json().then((r: any) => r);
  },

  /** Chat multi-turn hoặc single prompt với FreeLLM */
  async freeLLMChat(input: {
    messages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    prompt?: string;
    systemPrompt?: string;
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  }): Promise<{ content: string; model: string; usage?: any }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/freellm-chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'chat', ...input }),
    });
    if (!response.ok) await handleErrorResponse(response, 'Lỗi khi gọi FreeLLM API');
    return response.json().then((r: any) => ({ content: r.content, model: r.model, usage: r.usage }));
  },

  /** Tối ưu prompt tiếng Việt → tiếng Anh chuyên nghiệp */
  async freeLLMOptimizePrompt(prompt: string): Promise<string> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/freellm-chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'optimize-prompt', prompt }),
    });
    if (!response.ok) await handleErrorResponse(response, 'Lỗi tối ưu prompt FreeLLM');
    const data = await response.json();
    return data.result || '';
  },

  /** Tóm tắt văn bản bằng FreeLLM */
  async freeLLMSummarize(text: string, maxWords?: number): Promise<string> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/freellm-chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'summarize', prompt: text, maxTokens: maxWords }),
    });
    if (!response.ok) await handleErrorResponse(response, 'Lỗi tóm tắt FreeLLM');
    const data = await response.json();
    return data.result || '';
  },

  /** Sinh nội dung marketing với FreeLLM */
  async freeLLMMarketing(params: {
    topic: string;
    platform?: 'facebook' | 'instagram' | 'tiktok' | 'zalo' | 'general';
    tone?: 'professional' | 'friendly' | 'humorous' | 'inspirational';
    language?: 'vi' | 'en';
  }): Promise<{ title: string; content: string; hashtags: string[] }> {
    const headers = await getHeaders(true);
    const response = await fetch('/api/v1/gemini/freellm-chat', {
      method: 'POST',
      headers,
      body: JSON.stringify({ action: 'marketing', prompt: params.topic, ...params }),
    });
    if (!response.ok) await handleErrorResponse(response, 'Lỗi sinh marketing content FreeLLM');
    const data = await response.json();
    return data.result || { title: '', content: '', hashtags: [] };
  },

  async uploadLocalDocument(fileName: string, fileBase64: string, mimeType: string): Promise<any> {
    const headers = await getHeaders(true);
    const response = await fetch("/api/v1/gemini/upload-document", {
      method: "POST",
      headers,
      body: JSON.stringify({ fileName, fileBase64, mimeType }),
    });
    if (!response.ok) {
      await handleErrorResponse(response, "Lỗi tải lên tài liệu huấn luyện AI");
    }
    return response.json();
  },
};

