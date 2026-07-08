import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { openrouterChat } from "../openrouter.service";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

const MUSIC_URL_MAP: Record<string, string> = {
  upbeat: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  tech: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  corporate: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  lofi: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  acoustic: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
};

// ─────────────────────────────────────────────
// Public types (shared with frontend via API)
// ─────────────────────────────────────────────

export interface TextOverlay {
  content: string;
  position: "top-center" | "center" | "bottom-center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  color?: string;
  fontSize?: string;
  animation?: string;
}

export interface MotionGraphicInsert {
  template: "lower_third" | "badge" | "title_card" | "highlight_box";
  title: string;
  subtitle?: string;
  accentColor?: string;
}

export interface AnimatedSceneInsert {
  template: "chapter_title" | "stat_reveal" | "kinetic_text" | "quote_card";
  duration: number;
  title?: string;
  subtitle?: string;
  value?: string;
  label?: string;
  sublabel?: string;
  quote?: string;
  author?: string;
  chapter?: string;
  words?: string[];
  accentColor?: string;
  bgGradient?: string;
}

export interface SegmentEdit {
  segmentId: string;
  label: string;
  startTime: number;
  endTime: number;
  contentSummary: string;
  transcriptText?: string;
  keep: boolean;
  playbackRate: number;
  filters?: {
    brightness?: number;
    contrast?: number;
    saturate?: number;
    grayscale?: number;
  };
  effects?: {
    zoom?: "in" | "out" | "none";
    transition?: string;
    objectFit?: "contain" | "cover";
  };
  textOverlays?: TextOverlay[];
  captionText?: string;
  motionGraphic?: MotionGraphicInsert;
  insertAnimatedScene?: AnimatedSceneInsert;
  editNotes: string;
}

export interface VideoEditScript {
  videoUrl: string;
  totalDuration: number;
  globalSettings: {
    aspectRatio: string;
    resolution: string;
    musicGenre: "upbeat" | "tech" | "corporate" | "lofi" | "acoustic" | "none";
    musicVolume: number;
    overallStyle: string;
  };
  segments: SegmentEdit[];
  analysisNotes: string;
  generatedAt: string;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function safeParseJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const match = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (match) cleaned = match[1].trim();
  }
  return JSON.parse(cleaned);
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok) throw new Error(`Failed to download: HTTP ${res.status}`);
  fs.writeFileSync(destPath, Buffer.from(await res.arrayBuffer()));
}

function isGeminiUnavailable(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const status = (err as any)?.status;
  return (
    status === 503 || status === 429 || status === 402 ||
    msg.includes("503") || msg.includes("unavailable") || msg.includes("overloaded") ||
    msg.includes("429") || msg.includes("quota") || msg.includes("rate limit") ||
    msg.includes("resource_exhausted") || msg.includes("billing") ||
    msg.includes("prepayment credits are depleted")
  );
}

function buildFreeLLMScriptPrompt(videoUrl: string, duration: number, userPrompt: string): string {
  const hasPrompt = !!userPrompt?.trim();
  const intent = hasPrompt
    ? `Phong cách/yêu cầu: "${userPrompt.trim()}"`
    : "Không có yêu cầu cụ thể. Hãy tự chọn phong cách biên tập phù hợp nhất cho loại video này.";

  return `Bạn là chuyên gia biên tập video AI. Hãy tạo kịch bản biên tập cho video sau.

LƯU Ý QUAN TRỌNG: Bạn không thể xem được nội dung video. Hãy tạo kịch bản hợp lý dựa trên thời lượng và yêu cầu.

Video URL: ${videoUrl}
Thời lượng: ${duration} giây
${intent}

Chia video thành 6-10 đoạn đều nhau. Mỗi đoạn hãy đề xuất:
- Tốc độ phát phù hợp (đoạn nhàm cần tăng tốc, đoạn quan trọng giữ 1x)
- Transition hợp lý sang đoạn tiếp theo
- Caption mô tả đoạn đó
- Khi nào nên chèn animated scene (chapter_title hoặc stat_reveal) giữa các phần lớn

Trả về ĐÚNG JSON object theo schema sau (KHÔNG markdown):

{
  "globalSettings": {
    "musicGenre": "upbeat"|"tech"|"corporate"|"lofi"|"acoustic"|"none",
    "musicVolume": 0.3,
    "overallStyle": "mô tả phong cách"
  },
  "analysisNotes": "Ghi chú: kịch bản được tạo tự động do không thể phân tích video trực tiếp. Vui lòng điều chỉnh từng đoạn phù hợp với nội dung thực tế.",
  "segments": [
    {
      "segmentId": "seg_01",
      "label": "Mở đầu",
      "startTime": 0,
      "endTime": <số giây>,
      "contentSummary": "Đoạn mở đầu video",
      "keep": true,
      "playbackRate": 1.0,
      "filters": {},
      "effects": { "zoom": "none", "transition": "fade", "objectFit": "contain" },
      "textOverlays": [],
      "captionText": "Caption đề xuất",
      "editNotes": "Lý do đề xuất"
    }
  ]
}

Các đoạn phải phủ 0 → ${duration}s không có khoảng trống. Chỉ trả về JSON.`;
}

function buildScriptPrompt(duration: number, userPrompt: string): string {
  const hasPrompt = !!userPrompt?.trim();
  const intentBlock = hasPrompt
    ? `Yêu cầu của người dùng: "${userPrompt.trim()}"`
    : `Không có yêu cầu cụ thể từ người dùng.
Nhiệm vụ của bạn: phân tích TOÀN BỘ nội dung video, tự xác định:
- Loại video (tutorial, vlog, product demo, interview, entertainment...)
- Tông cảm xúc (upbeat, serious, emotional, corporate...)
- Đối tượng khán giả phù hợp
- Phong cách biên tập tối ưu cho loại nội dung này
- Các đoạn nên giữ, cắt, tăng/giảm tốc độ dựa trên chất lượng nội dung
Hãy TỰ QUYẾT ĐỊNH mọi lựa chọn biên tập như một editor chuyên nghiệp.`;

  return `Bạn là chuyên gia biên tập video AI. Hãy phân tích video này và tạo một kịch bản biên tập chi tiết.

${intentBlock}
Thời lượng video: ${duration} giây

NHIỆM VỤ:
1. Chia video thành 5-12 đoạn tự nhiên dựa trên nội dung, chủ đề, cảnh quay
2. Với mỗi đoạn, đề xuất chỉnh sửa cụ thể
3. Đề xuất phong cách tổng thể và nhạc nền

Trả về ĐÚNG một JSON object theo schema sau (KHÔNG markdown, KHÔNG giải thích):

{
  "globalSettings": {
    "musicGenre": "upbeat"|"tech"|"corporate"|"lofi"|"acoustic"|"none",
    "musicVolume": 0.3,
    "overallStyle": "Mô tả phong cách tổng thể (vd: cinematic TikTok, corporate presentation)"
  },
  "analysisNotes": "Nhận xét tổng quan về video và chiến lược biên tập",
  "segments": [
    {
      "segmentId": "seg_01",
      "label": "Tên đoạn ngắn (vd: Mở đầu, Hook, Giới thiệu vấn đề, Demo, CTA)",
      "startTime": <số giây bắt đầu>,
      "endTime": <số giây kết thúc>,
      "contentSummary": "Mô tả nội dung đoạn này",
      "transcriptText": "Những gì được nói nếu có",
      "keep": true,
      "playbackRate": 1.0,
      "filters": { "brightness": 1.0, "contrast": 1.0, "saturate": 1.0 },
      "effects": {
        "zoom": "none"|"in"|"out",
        "transition": "fade"|"slide-left"|"slide-right"|"slide-up"|"slide-down"|"zoom-in"|"zoom-out"|"flash"|"none",
        "objectFit": "contain"|"cover"
      },
      "textOverlays": [
        { "content": "Text", "position": "bottom-center", "color": "#FFFFFF", "fontSize": "28px" }
      ],
      "captionText": "Phụ đề chính của đoạn (optional)",
      "motionGraphic": {
        "template": "lower_third"|"badge"|"title_card"|"highlight_box",
        "title": "Text chính",
        "subtitle": "Text phụ",
        "accentColor": "#FFD700"
      },
      "insertAnimatedScene": {
        "template": "chapter_title"|"stat_reveal"|"kinetic_text"|"quote_card",
        "duration": 3.0,
        "title": "...",
        "accentColor": "#FFD700"
      },
      "editNotes": "Giải thích tại sao đề xuất chỉnh sửa này"
    }
  ]
}

QUY TẮC BẮT BUỘC:
- Tất cả segment phải phủ 0 → ${duration}s không có khoảng trống
- Nếu không cần motionGraphic → bỏ hoàn toàn trường đó
- Nếu không cần insertAnimatedScene → bỏ hoàn toàn trường đó
- Nếu không cần textOverlays → để mảng rỗng []
- "keep": false = cắt bỏ đoạn này
- editNotes PHẢI có cho mỗi đoạn
- Chỉ trả về JSON, không có gì khác`;
}

// ─────────────────────────────────────────────
// Shared: normalize raw parsed JSON → VideoEditScript
// ─────────────────────────────────────────────

function normalizeScript(parsed: any, videoUrl: string, duration: number): VideoEditScript {
  const segments: SegmentEdit[] = (parsed.segments || []).map((seg: any, idx: number) => ({
    segmentId: seg.segmentId || `seg_${String(idx + 1).padStart(2, "0")}`,
    label: seg.label || `Đoạn ${idx + 1}`,
    startTime: Number(seg.startTime ?? 0),
    endTime: Number(seg.endTime ?? duration),
    contentSummary: seg.contentSummary || "",
    transcriptText: seg.transcriptText || undefined,
    keep: seg.keep !== false,
    playbackRate: Number(seg.playbackRate || 1.0),
    filters: seg.filters || {},
    effects: seg.effects || { zoom: "none", transition: "fade", objectFit: "contain" },
    textOverlays: Array.isArray(seg.textOverlays) ? seg.textOverlays : [],
    captionText: seg.captionText || undefined,
    motionGraphic: seg.motionGraphic || undefined,
    insertAnimatedScene: seg.insertAnimatedScene || undefined,
    editNotes: seg.editNotes || "",
  }));

  return {
    videoUrl,
    totalDuration: duration,
    globalSettings: {
      aspectRatio: "16:9",
      resolution: "720p",
      musicGenre: parsed.globalSettings?.musicGenre || "none",
      musicVolume: Number(parsed.globalSettings?.musicVolume ?? 0.3),
      overallStyle: parsed.globalSettings?.overallStyle || "",
    },
    segments,
    analysisNotes: parsed.analysisNotes || "",
    generatedAt: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────
// Fallback: Claude (text-only, no video upload)
// ─────────────────────────────────────────────

function isClaudeConfigured(): boolean {
  return !!process.env.CLAUDE_API_KEY;
}

async function callClaude(prompt: string, maxTokens = 4096): Promise<string> {
  const apiKey = process.env.CLAUDE_API_KEY!;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API lỗi ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = await res.json() as any;
  return data.content?.[0]?.text || "";
}

async function generateEditScriptViaClaude(
  videoUrl: string,
  duration: number,
  userPrompt: string
): Promise<VideoEditScript> {
  console.log("[EditScript][Claude] Falling back to Claude sonnet-4-6 (text-only)...");
  // Reuse same prompt as FreeLLM — Claude handles it much better
  const rawText = await callClaude(buildFreeLLMScriptPrompt(videoUrl, duration, userPrompt), 4096);
  let parsed: any;
  try {
    parsed = safeParseJson(rawText);
  } catch {
    throw new Error(`Claude trả về JSON không hợp lệ: ${rawText.slice(0, 200)}`);
  }
  const script = normalizeScript(parsed, videoUrl, duration);
  console.log(`[EditScript][Claude] Generated script with ${script.segments.length} segments`);
  return script;
}

// ─────────────────────────────────────────────
// Fallback: OpenRouter (text-only, no video upload)
// ─────────────────────────────────────────────

async function generateEditScriptViaOpenRouter(
  videoUrl: string,
  duration: number,
  userPrompt: string
): Promise<VideoEditScript> {
  console.log("[EditScript][OpenRouter] Falling back to OpenRouter (text-only, no video analysis)...");
  const { text } = await openrouterChat({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    messages: [{ role: "user", content: buildFreeLLMScriptPrompt(videoUrl, duration, userPrompt) }],
    temperature: 0.5,
    jsonMode: true,
  });
  const parsed = safeParseJson(text);
  const script = normalizeScript(parsed, videoUrl, duration);
  console.log(`[EditScript][OpenRouter] Generated fallback script with ${script.segments.length} segments`);
  return script;
}

// ─────────────────────────────────────────────
// Generate Edit Script (Gemini multimodal + FreeLLM fallback)
// ─────────────────────────────────────────────

export async function generateEditScript(
  videoUrl: string,
  duration: number,
  userPrompt: string
): Promise<VideoEditScript> {
  // ── Try Gemini first (multimodal — can actually watch the video) ──
  if (process.env.GEMINI_API_KEY) {
    const tmpDir = os.tmpdir();
    const ext = videoUrl.endsWith(".mov") ? ".mov" : ".mp4";
    const tmpVideoPath = path.join(tmpDir, `edit_script_${Date.now()}${ext}`);
    let geminiErr: unknown;

    try {
      console.log("[EditScript] Downloading video for Gemini analysis...");
      await downloadFile(videoUrl, tmpVideoPath);

      console.log("[EditScript] Uploading to Gemini File API...");
      let geminiFile: any;
      try {
        geminiFile = await ai.files.upload({
          file: new Blob([fs.readFileSync(tmpVideoPath)], { type: "video/mp4" }),
          config: { mimeType: "video/mp4" },
        });
      } finally {
        try { fs.unlinkSync(tmpVideoPath); } catch {}
      }

      // Wait for ACTIVE state
      let fileState = geminiFile;
      for (let attempt = 0; attempt < 30; attempt++) {
        if (fileState?.state === "ACTIVE") break;
        await new Promise((r) => setTimeout(r, 3000));
        fileState = await ai.files.get({ name: fileState.name });
      }
      if (fileState?.state !== "ACTIVE") throw new Error("Gemini file upload did not reach ACTIVE state");

      console.log("[EditScript] Calling Gemini multimodal...");
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{
          role: "user",
          parts: [
            { fileData: { mimeType: "video/mp4", fileUri: fileState.uri } },
            { text: buildScriptPrompt(duration, userPrompt) },
          ],
        }],
      });

      const rawText = response.text || "";
      let parsed: any;
      try {
        parsed = safeParseJson(rawText);
      } catch {
        throw new Error(`Gemini trả về JSON không hợp lệ: ${rawText.slice(0, 200)}`);
      }

      const script = normalizeScript(parsed, videoUrl, duration);
      console.log(`[EditScript] Gemini generated script with ${script.segments.length} segments`);
      return script;

    } catch (err) {
      geminiErr = err;
      // Clean up temp file if download succeeded but upload failed
      try { if (fs.existsSync(tmpVideoPath)) fs.unlinkSync(tmpVideoPath); } catch {}

      const shouldFallback = isGeminiUnavailable(err);
      console.warn(`[EditScript] Gemini failed (fallback=${shouldFallback}):`, (err as Error).message);

      if (!shouldFallback) {
        throw err;
      }
    }

    // ── Fallback chain: Claude → OpenRouter ──
    try {
      if (isClaudeConfigured()) return await generateEditScriptViaClaude(videoUrl, duration, userPrompt);
      return await generateEditScriptViaOpenRouter(videoUrl, duration, userPrompt);
    } catch (fallbackErr: any) {
      console.warn("[EditScript] Claude fallback failed, trying OpenRouter:", fallbackErr.message);
      try {
        return await generateEditScriptViaOpenRouter(videoUrl, duration, userPrompt);
      } catch (openRouterErr) {
        console.error("[EditScript] All fallbacks failed:", openRouterErr);
      }
      throw geminiErr; // throw original Gemini error — most informative
    }
  }

  // ── No Gemini key — go directly to Claude or OpenRouter ──
  if (isClaudeConfigured()) return generateEditScriptViaClaude(videoUrl, duration, userPrompt);
  return generateEditScriptViaOpenRouter(videoUrl, duration, userPrompt);
}

// ─────────────────────────────────────────────
// Convert VideoEditScript → Blueprint JSON
// ─────────────────────────────────────────────

export function blueprintFromEditScript(script: VideoEditScript): any {
  const timeline: any[] = [];
  let timelineOffset = 0;

  for (const seg of script.segments) {
    if (!seg.keep) continue;

    const sourceDuration = seg.endTime - seg.startTime;
    const rate = Math.max(0.1, seg.playbackRate || 1.0);
    const renderDuration = sourceDuration / rate;
    const segStart = timelineOffset;
    const segEnd = timelineOffset + renderDuration;

    // Video clip
    timeline.push({
      type: "video",
      src: script.videoUrl,
      start: seg.startTime,
      end: seg.endTime,
      playbackRate: rate,
      filters: seg.filters || {},
      effects: {
        zoom: seg.effects?.zoom || "none",
        transition: seg.effects?.transition || "none",
        objectFit: seg.effects?.objectFit || "contain",
      },
      volume: 1.0,
    });

    // Caption
    if (seg.captionText) {
      timeline.push({
        type: "caption",
        content: seg.captionText,
        start: segStart,
        end: segEnd,
        style: { align: "center", color: "#FFFFFF", bgColor: "rgba(0,0,0,0.72)" },
      });
    }

    // Motion graphic (shown for up to 4s, minimum 0.6s before segment ends)
    if (seg.motionGraphic) {
      const mgEnd = Math.min(segEnd - 0.3, segStart + 4.0);
      if (mgEnd > segStart + 0.5) {
        timeline.push({
          type: "motion_graphic",
          template: seg.motionGraphic.template || "lower_third",
          title: seg.motionGraphic.title || "",
          subtitle: seg.motionGraphic.subtitle,
          accentColor: seg.motionGraphic.accentColor || "#FFD700",
          start: segStart + 0.3,
          end: mgEnd,
        });
      }
    }

    // Text overlays
    if (Array.isArray(seg.textOverlays)) {
      for (const overlay of seg.textOverlays) {
        timeline.push({
          type: "text",
          content: overlay.content,
          start: segStart,
          end: segEnd,
          style: {
            position: overlay.position || "bottom-center",
            color: overlay.color || "#FFD700",
            fontSize: overlay.fontSize || "28px",
            animation: overlay.animation || "fade-in",
          },
        });
      }
    }

    timelineOffset = segEnd;

    // Animated scene inserted AFTER this segment
    if (seg.insertAnimatedScene) {
      const sceneDuration = Math.max(2.0, seg.insertAnimatedScene.duration || 3.0);
      const sceneStart = timelineOffset;
      const sceneEnd = sceneStart + sceneDuration;

      const sceneEl: any = {
        type: "animated_scene",
        template: seg.insertAnimatedScene.template || "chapter_title",
        start: sceneStart,
        end: sceneEnd,
        accentColor: seg.insertAnimatedScene.accentColor || "#FFD700",
      };

      const fields = ["title", "subtitle", "value", "label", "sublabel", "quote", "author", "chapter", "words", "bgGradient"] as const;
      for (const f of fields) {
        if (seg.insertAnimatedScene[f] !== undefined) sceneEl[f] = seg.insertAnimatedScene[f];
      }

      timeline.push(sceneEl);
      timelineOffset = sceneEnd;
    }
  }

  const totalDuration = timelineOffset;

  // Background music
  const musicGenre = script.globalSettings?.musicGenre;
  if (musicGenre && musicGenre !== "none" && MUSIC_URL_MAP[musicGenre]) {
    timeline.push({
      type: "audio",
      src: MUSIC_URL_MAP[musicGenre],
      start: 0,
      end: totalDuration,
      volume: script.globalSettings?.musicVolume ?? 0.3,
    });
  }

  return {
    version: "2.0",
    timeline,
    settings: {
      duration: totalDuration,
      aspectRatio: script.globalSettings?.aspectRatio || "16:9",
      resolution: script.globalSettings?.resolution || "720p",
    },
  };
}
