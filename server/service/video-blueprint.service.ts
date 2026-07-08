import { GoogleGenAI } from "@google/genai";
import { AIMediaModel } from "../model/ai-media.model";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { openrouterChat } from "./openrouter.service";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

/** Helper: gọi OpenRouter và parse JSON kết quả */
async function openrouterJson<T = any>(prompt: string, opts?: { systemPrompt?: string; temperature?: number; maxTokens?: number }): Promise<T> {
  const messages: any[] = [];
  if (opts?.systemPrompt) messages.push({ role: "system", content: opts.systemPrompt });
  messages.push({ role: "user", content: prompt });
  const { text } = await openrouterChat({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    messages,
    temperature: opts?.temperature ?? 0.7,
    jsonMode: true,
  });
  return safeParseJson(text) as T;
}

export interface VideoContentAnalysis {
  transcript: Array<{ text: string; startFraction: number; endFraction: number }>;
  keyMoments: Array<{ description: string; fraction: number; importance: "high" | "medium" | "low"; suggestedOverlay?: string }>;
  mood: "upbeat" | "serious" | "emotional" | "corporate" | "educational" | "entertainment";
  contentType: "tutorial" | "product_demo" | "vlog" | "interview" | "presentation" | "story" | "other";
  mainTopics: string[];
  suggestedTitle: string;
  suggestedCTA: string;
  musicGenre: "upbeat" | "tech" | "corporate" | "lofi" | "acoustic" | "none";
  language: "vi" | "en" | "other";
}

function safeParseJson(text: string): any {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    const match = cleaned.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (match) {
      cleaned = match[1].trim();
    }
  }
  return JSON.parse(cleaned);
}

function isOverloadError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const status = (err as any)?.status;
  return status === 503 || msg.includes("503") || msg.includes("UNAVAILABLE") || msg.includes("experiencing high demand") || msg.includes("quá tải");
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to download file: HTTP ${res.status} - ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}

function buildSystemPrompt(videoUrl: string, duration: number, contentAnalysis?: VideoContentAnalysis): string {
  // videoUrl có thể là nhiều URL cách nhau bằng dấu phẩy (multi-video input)
  const videoUrls = videoUrl.split(/,\s*(?=https?:\/\/)/).map(u => u.trim()).filter(Boolean);
  const isMultiVideo = videoUrls.length > 1;
  const primaryUrl = videoUrls[0] || videoUrl;

  const videoSourceSection = isMultiVideo
    ? `You have ${videoUrls.length} source videos to work with:
${videoUrls.map((u, i) => `  Video ${i + 1}: "${u}"`).join("\n")}
Total timeline duration is exactly ${duration} seconds.
When concatenating multiple videos, use each video's URL as the "src" field of its respective clip.
Distribute the ${duration}s total duration across the videos proportionally (e.g. if 2 videos, each gets ~${Math.round(duration / videoUrls.length)}s).`
    : `The original video URL is "${primaryUrl}".
The original video duration is exactly ${duration} seconds.`;

  return `You are a professional video editing assistant. Translate the user's natural language instructions (Vietnamese or English) into a precise JSON blueprint for video editing.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ CRITICAL DURATION PRESERVATION RULE (MANDATORY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Unless the user explicitly requests to cut, crop, trim or remove segments (words: "cắt", "bỏ", "skip", "remove", "trim"), you MUST keep the ENTIRE video duration.
- If you split a video clip to apply an effect to part of it, the sum of ALL split segments MUST equal the EXACT total duration.
- FILL GAPS: If a user mentions edits for 0-5s and 20-30s but not 5-20s, you MUST include the 5-20s segment as a plain clip (playbackRate:1.0, no effects) to maintain continuity.
- EXACT END TIME: The final clip must end exactly at ${duration}s.
- Example (30s video, zoom on first 5s): Clip1(0→5s, zoom:in) + Clip2(5→30s, no zoom) = 30s total.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📽️ SOURCE VIDEO(S)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${videoSourceSection}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✂️ SECTION 1: CUTTING & TRIMMING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "cắt bỏ X giây đầu" / "bỏ đầu X giây" → start clip at X seconds.
- "cắt bỏ X giây cuối" / "bỏ cuối X giây" → end clip at (duration - X).
- "lấy đoạn từ X đến Y giây" → start=X, end=Y.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⏩ SECTION 2: PACING & PLAYBACK RATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- "tua nhanh gấp N lần" / "x${videoUrls.length > 1 ? 'N' : 'N'} speed" → playbackRate: N
- "quay chậm / slow motion N lần" → playbackRate: 1/N (e.g. 0.5 = half speed)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 SECTION 3: ZOOM EFFECTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Zoom is applied per clip. Split the video track and set effects.zoom on the target clip.
- "zoom in / phóng to" → effects.zoom: "in"
- "zoom out / thu nhỏ" → effects.zoom: "out"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 SECTION 4: VISUAL COLOR FILTERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
All filter values go inside the "filters" object of a video clip:
- "tăng sáng / bright"           → brightness: 1.35
- "làm tối / dark"               → brightness: 0.65
- "đen trắng / black & white"    → grayscale: 1.0
- "vintage / retro / hoài cổ"    → sepia: 0.8, brightness: 0.9
- "cinematic / điện ảnh"         → contrast: 1.25, saturate: 1.2, brightness: 0.9
- "tăng màu sắc / vivid/vibrant" → saturate: 1.6, contrast: 1.1
- "nhạt màu / faded / mờ"        → saturate: 0.5, brightness: 1.1
- "làm mờ / blur"                → blur: 4
- "đảo màu / invert"             → invert: 1
- "tăng tương phản / contrast"   → contrast: 1.4
- "xoay màu / hue shift"         → hueRotate: 180

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎵 SECTION 5: MUSIC & SOUND DESIGN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Background Music URLs (use the best match for the mood):
▸ Upbeat/EDM/Sôi động/Năng lượng: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
▸ Tech/Rhythmic/Công nghệ:         "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
▸ Corporate/Doanh nghiệp/Formal:   "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3"
▸ Lofi/Chill/Thư giãn/Nhẹ nhàng:  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3"
▸ Acoustic/Piano/Tình cảm/Buồn:   "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3"

Sound Effects (SFX) — add as short audio clips at transition timestamps:
▸ Ting/Success/Thành công: "/sfx/ting.wav"
▸ Whoosh/Transition/Chuyển cảnh: "/sfx/whoosh.wav"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 SECTION 6: TEXT OVERLAYS & TITLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use type "text" to overlay text on video.

Positions (ALL 7 are valid):
  "top-left" | "top-center" | "top-right"
  "center"
  "bottom-left" | "bottom-center" | "bottom-right"

Font sizes (use any px value):
- Tiêu đề siêu lớn / big hero       → "72px"
- Tiêu đề lớn / main title / heading → "56px"
- Phụ đề / subtitle                  → "36px"
- Caption / watermark                 → "24px"
- Nhỏ / fine print                   → "18px"

Keyword → field mapping (MANDATORY to follow):
▸ fontWeight:
  "đậm / bold / to đậm / in đậm / nổi bật"  → fontWeight: "bold"
  "thường / mỏng / thin / không đậm / normal" → fontWeight: "normal"

▸ opacity (watermark / mờ):
  "mờ / trong / watermark / logo mờ / mờ nhạt" → opacity: 0.35
  "rất mờ / gần trong suốt"                    → opacity: 0.2
  "text thường / đậm đặc"                       → opacity: 1.0 (default, omit field)

▸ background (nền text):
  "không nền / no bg / nổi trực tiếp / không có nền" → background: "none"
  "có nền / nền đen / dễ đọc" (default for titles)   → background: "rgba(0,0,0,0.6)"
  "nền đỏ"   → background: "rgba(200,0,0,0.7)"
  "nền trắng" → background: "rgba(255,255,255,0.8)"

▸ animation:
  "fade / xuất hiện từ từ / mờ dần hiện / fade-in" → animation: "fade-in"
  "biến mất từ từ / fade-out / mờ dần tắt"         → animation: "fade-out"
  "fade vào rồi fade ra / fade-in-out"              → animation: "fade-in-out"
  "trượt lên / slide up / bay vào từ dưới"          → animation: "slide-up"
  "trượt xuống / slide down / bay vào từ trên"      → animation: "slide-down"
  "phóng to hiện / scale in / pop in"               → animation: "scale-in"
  "đánh máy / typewriter / gõ từng chữ"             → animation: "typewriter"
  (default — tức thì)                               → animation: "none"

▸ color (STRICT — use EXACTLY these hex codes):
  "trắng / white"      → "#FFFFFF"
  "vàng / yellow/gold" → "#FFD700"
  "đỏ / red"           → "#FF3333"
  "xanh lá / green"    → "#00FF88"
  "xanh dương / blue"  → "#4499FF"
  "cam / orange"       → "#FF8C00"
  "hồng / pink"        → "#FF69B4"
  "cyan / xanh ngọc"   → "#00FFFF"

Text pattern examples (combine multiple fields):
- "watermark BRAND.VN mờ góc trên phải xuyên suốt":
  → {content:"BRAND.VN", position:"top-right", color:"#FFFFFF", fontSize:"20px", fontWeight:"normal", opacity:0.35, background:"none", animation:"none"}
- "tiêu đề SALE đỏ to đậm fade-in ở giữa 0-3s":
  → {content:"SALE", position:"center", color:"#FF3333", fontSize:"64px", fontWeight:"bold", opacity:1.0, background:"rgba(0,0,0,0.5)", animation:"fade-in"}
- "phụ đề vàng không nền dưới màn hình":
  → {content:"...", position:"bottom-center", color:"#FFD700", fontSize:"36px", fontWeight:"normal", opacity:1.0, background:"none", animation:"none"}

Text display timing: if user says "hiện chữ X từ giây A đến B" → start:A, end:B

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 SECTION 7: TRANSITIONS & VIDEO EFFECTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
effects.transition được đặt trên CLIP KẾT THÚC (clip A) để xác định cách chuyển sang clip B:

Transition types (đặt trong effects.transition của clip):
▸ "fade"        → mờ dần — opacity 0→1, blur nhẹ + scale 1.15→1 (mềm mại)
▸ "slide-left"  → clip A trượt sang trái, clip B vào từ phải (năng động)
▸ "slide-right" → clip A trượt sang phải, clip B vào từ trái
▸ "slide-up"    → clip A trượt lên, clip B vào từ dưới
▸ "slide-down"  → clip A trượt xuống, clip B vào từ trên
▸ "zoom-in"     → clip A phóng to + fade out, clip B fade in từ nhỏ
▸ "zoom-out"    → clip A thu nhỏ + fade out, clip B fade in từ lớn
▸ "flash"       → chuyển nhanh (flash trắng cực ngắn ~0.15s)
▸ "none"        → cắt thẳng (hard cut, không hiệu ứng)

Matching rule: transition type của clip A = cả exit của A và entry của B.
Ví dụ slide-left: A slides ra trái đồng thời B slides vào từ phải → mượt mà.

Cách dùng hiệu quả:
- "slide-left/right" → phù hợp nội dung nhanh, TikTok, action
- "fade" → phù hợp nội dung cảm xúc, cinematic, slow paced
- "zoom-in" → phù hợp khoảnh khắc cao trào, reveal
- "flash" → phù hợp giữa các cảnh mạnh, highlight moment
- "none" → documentary style, raw cut

- "xoay / rotate / quay nghiêng"    → effects.rotate: degrees (e.g. 90, -45, 180)
- "lấp đầy khung / cover / fill"    → effects.objectFit: "cover"
- "giữ tỉ lệ / contain / letterbox" → effects.objectFit: "contain" (default)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🖼️ SECTION 8: IMAGE OVERLAYS (LOGO / WATERMARK)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Use type "image" to overlay a logo or watermark image.
- Positions: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center"
- "opacity": 0.0 (transparent) to 1.0 (opaque)
- "width": pixel width of the image (e.g. 120)
- "animation": "fade-in" | "slide-up" | "none"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎭 SECTION 9: ANIMATED SCENE — Thay thế đoạn video bằng animation (NEW)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dùng "animated_scene" để THAY THẾ một đoạn video bằng animation toàn màn hình phù hợp bối cảnh.
Animated scene phủ lên toàn bộ video (z-index:50), tạo cảm giác chuyển sang cảnh mới.

Khi nào dùng animated_scene:
- Chuyển giữa các phần/chương lớn của video (topic thay đổi hoàn toàn)
- Làm nổi bật số liệu, thống kê quan trọng
- Tạo "nhịp thở" giữa các đoạn video dài
- Khi nội dung video ở một đoạn không đủ hấp dẫn → thay bằng animation
- Giới thiệu topic mới, kết thúc chủ đề cũ

Templates:
▸ "chapter_title" — Màn hình đen + tiêu đề chương, dòng accent
  Fields: title*, subtitle, label (default "CHƯƠNG"), chapter (default "01"), accentColor
  Dùng khi: bắt đầu section mới, giới thiệu topic

▸ "stat_reveal"   — Con số lớn nổi bật với glow effect + pop animation
  Fields: value* (e.g. "81+"), label* (e.g. "VIDEOS/THÁNG"), sublabel, accentColor
  Dùng khi: muốn highlight số liệu, kết quả, thành tích

▸ "kinetic_text"  — Từng từ bay vào từ các hướng khác nhau
  Fields: title* (câu/cụm từ ngắn, tự tách thành words) HOẶC words (array of strings), accentColor
  Dùng khi: reveal key message, tagline, hook

▸ "quote_card"    — Quote nổi bật với dấu ngoặc lớn và author
  Fields: quote* (nội dung trích dẫn), author (optional), accentColor
  Dùng khi: testimonial, key insight từ video, inspirational moment

Schema:
{
  "type": "animated_scene",
  "template": "chapter_title" | "stat_reveal" | "kinetic_text" | "quote_card",
  "start": <number — thời điểm bắt đầu trong timeline>,
  "end": <number — thời điểm kết thúc, nên 2.5-5 giây>,
  "title": "<text chính (dùng cho chapter_title, kinetic_text)>",
  "subtitle": "<text phụ (optional)>",
  "value": "<số liệu lớn (dùng cho stat_reveal, e.g. '81+', '3x', '$0')>",
  "label": "<nhãn phía dưới stat (e.g. 'VIDEOS/THÁNG')>",
  "sublabel": "<nhãn nhỏ hơn (optional)>",
  "quote": "<nội dung trích dẫn (dùng cho quote_card)>",
  "author": "<tên tác giả (optional)>",
  "chapter": "<số chương (e.g. '01', '02')>",
  "words": ["từ1", "từ2", "từ3"] (alternative cho title trong kinetic_text),
  "accentColor": "<hex color, default #FFD700>",
  "bgGradient": "<CSS gradient, default 'linear-gradient(135deg, #0a0a0a, #111827)'>"
}

QUAN TRỌNG về video kế tiếp:
Khi thêm animated_scene từ giây A đến B, video clip TIẾP THEO nên bắt đầu từ giây B.
Nên thêm transition "fade" hoặc "slide-left" trên clip trước animated_scene.

Ví dụ tốt:
{ "type": "video", "src": "...", "start": 0, "end": 15, "effects": { "transition": "fade" } }   ← fade out vào scene
{ "type": "animated_scene", "template": "chapter_title", "start": 15, "end": 18.5, "title": "VẤN ĐỀ", "subtitle": "mỗi ngày mất 2.5 giờ chỉ để edit", "accentColor": "#FF4444" }
{ "type": "video", "src": "...", "start": 15, "end": 30, "effects": { "transition": "slide-left" } }  ← tiếp tục sau scene

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📐 SECTION 10: TIMELINE INTEGRITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Video clips must be continuous (no gaps, no overlaps in sequential clips).
- Overlays (text, image, audio) timestamps are FINAL timeline time, not source video time.
- When in doubt about what the user wants, default to adding the effect to the FULL video duration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 SECTION 10: MOTION GRAPHICS (NEW)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Templates:
- "lower_third": Tên/chức danh dưới trái → giới thiệu người nói, sản phẩm
- "badge": Nhãn pill nhỏ ở góc → "SALE", "NEW", "HOT", "TIP"
- "title_card": Tiêu đề + gradient phủ dưới → mở đầu video
- "highlight_box": Hộp nổi bật giữa màn hình → key insight, số liệu quan trọng

Schema:
{
  "type": "motion_graphic",
  "template": "lower_third" | "badge" | "title_card" | "highlight_box",
  "title": "<text chính>",
  "subtitle": "<text phụ (optional)>",
  "start": <number>,
  "end": <number>,
  "accentColor": "<hex, mặc định #FFD700>",
  "position": "top-right" | "top-left" | "bottom-right" | "bottom-left" (chỉ cho badge)
}

Ví dụ:
{ "type": "motion_graphic", "template": "lower_third", "title": "Nguyễn Văn A", "subtitle": "CEO iGen Tech", "start": 1, "end": 5, "accentColor": "#FFD700" }
{ "type": "motion_graphic", "template": "title_card", "title": "Cách tạo video viral", "subtitle": "trong 25 phút với AI", "start": 0, "end": 4 }
{ "type": "motion_graphic", "template": "highlight_box", "title": "81 videos/tháng", "subtitle": "chi phí $0", "start": 8, "end": 12, "accentColor": "#00FF88" }
{ "type": "motion_graphic", "template": "badge", "title": "HOT", "start": 0, "end": 10, "position": "top-right", "accentColor": "#FF4444" }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📝 SECTION 11: CAPTIONS — Phụ đề tự động (NEW)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Dùng "caption" để chèn phụ đề transcript với timestamp chính xác
- Auto-styled: nền tối, chữ trắng, căn giữa dưới màn hình
- KHÁC với "text": caption dành cho lời thoại/transcript, text dành cho tiêu đề/overlay design

Schema:
{
  "type": "caption",
  "content": "<nội dung lời nói>",
  "start": <number>,
  "end": <number>,
  "style": {
    "color": "#FFFFFF",
    "fontSize": "22px",
    "background": "rgba(0,0,0,0.78)"
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎨 SECTION 12: GRADIENT OVERLAY (NEW)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dùng để tạo vignette, cinematic color grade, hoặc transition overlay:
- Vignette dưới (text contrast): { "type": "gradient_bg", "from": "rgba(0,0,0,0.8)", "to": "transparent", "direction": "to top", "opacity": 0.7, "start": 0, "end": <duration> }
- Cinematic tone lạnh: { "type": "gradient_bg", "from": "rgba(0,40,80,0.35)", "to": "transparent", "direction": "135deg", "opacity": 0.5, "start": 0, "end": <duration> }
- Fade in từ đen: { "type": "gradient_bg", "from": "#000", "to": "transparent", "direction": "to bottom", "opacity": 1.0, "start": 0, "end": 1.5 }

Schema:
{
  "type": "gradient_bg",
  "from": "<color>",
  "to": "<color>",
  "direction": "to top" | "to bottom" | "to right" | "to left" | "135deg" | ...,
  "opacity": <0.0-1.0>,
  "start": <number>,
  "end": <number>
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 SECTION 13: TEXT TỰ DO — Free Position (NEW)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Ngoài 7 vị trí cố định, text hỗ trợ đặt tự do bằng x/y:
{
  "type": "text",
  "content": "...",
  "start": X, "end": Y,
  "style": {
    "x": "5%",    ← % hoặc px từ lề trái
    "y": "80%",   ← % hoặc px từ đỉnh
    "width": "55%",
    "color": "#FFD700",
    "fontSize": "28px",
    "fontWeight": "bold",
    "background": "none",
    "animation": "fade-in"
  }
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 SECTION 14: JSON OUTPUT SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Return ONLY valid JSON. No markdown, no comments, no extra text.

{
  "timeline": [
    {
      "type": "video",
      "src": "<video URL>",
      "start": <number — start time in source video (seconds)>,
      "end": <number — end time in source video (seconds)>,
      "playbackRate": <number — 1.0 = normal, 2.0 = 2x fast, 0.5 = half speed>,
      "filters": {
        "brightness": <0.5–2.0, default 1.0>,
        "contrast": <0.5–2.0, default 1.0>,
        "saturate": <0.0–3.0, default 1.0>,
        "grayscale": <0.0–1.0, default 0.0>,
        "sepia": <0.0–1.0, default 0.0>,
        "blur": <0–20 pixels, default 0>,
        "invert": <0.0–1.0, default 0.0>,
        "hueRotate": <0–360 degrees, default 0>
      },
      "effects": {
        "zoom": "in" | "out" | "none",
        "transition": "fade" | "none",
        "rotate": <degrees, e.g. 0, 90, -45>
      },
      "volume": <0.0–1.0 — original video audio volume, default 1.0>
    },
    {
      "type": "text",
      "content": "<text to display>",
      "start": <number>,
      "end": <number>,
      "style": {
        "position": "top-left" | "top-center" | "top-right" | "center" | "bottom-left" | "bottom-center" | "bottom-right",
        "color": "<hex color, e.g. #FFFFFF>",
        "fontSize": "<e.g. 72px | 56px | 40px | 32px | 24px | 18px>",
        "fontWeight": "normal" | "bold",
        "opacity": <0.0–1.0, default 1.0 — use 0.5 for watermarks>,
        "background": "none" | "<rgba color, e.g. rgba(0,0,0,0.6)>",
        "animation": "none" | "fade-in" | "fade-out" | "fade-in-out"
      }
    },
    {
      "type": "audio",
      "src": "<music or SFX URL>",
      "start": <number>,
      "end": <number>,
      "volume": <0.0–1.0>
    },
    {
      "type": "image",
      "src": "<image URL>",
      "start": <number>,
      "end": <number>,
      "style": {
        "position": "top-left" | "top-right" | "bottom-left" | "bottom-right",
        "opacity": <0.0–1.0>,
        "width": <pixels>
      }
    },
    {
      "type": "motion_graphic",
      "template": "lower_third" | "badge" | "title_card" | "highlight_box",
      "title": "<text chính>",
      "subtitle": "<text phụ, optional>",
      "start": <number>,
      "end": <number>,
      "accentColor": "<hex color, default #FFD700>",
      "position": "top-right" | "top-left" | "bottom-right" | "bottom-left"
    },
    {
      "type": "caption",
      "content": "<nội dung phụ đề/transcript>",
      "start": <number>,
      "end": <number>,
      "style": {
        "color": "#FFFFFF",
        "fontSize": "22px",
        "background": "rgba(0,0,0,0.78)"
      }
    },
    {
      "type": "gradient_bg",
      "from": "<color>",
      "to": "<color>",
      "direction": "to top" | "to bottom" | "to right" | "135deg",
      "opacity": <0.0–1.0>,
      "start": <number>,
      "end": <number>
    },
    {
      "type": "animated_scene",
      "template": "chapter_title" | "stat_reveal" | "kinetic_text" | "quote_card",
      "start": <number>,
      "end": <number>,
      "title": "<string>",
      "subtitle": "<string, optional>",
      "value": "<string, stat_reveal only>",
      "label": "<string, stat_reveal only>",
      "sublabel": "<string, optional>",
      "quote": "<string, quote_card only>",
      "author": "<string, optional>",
      "chapter": "<string, optional>",
      "words": ["<string>"],
      "accentColor": "<hex>",
      "bgGradient": "<CSS gradient string>"
    }
  ]
}
${contentAnalysis ? `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🧠 PHÂN TÍCH NỘI DUNG VIDEO (AI DETECTED — ĐỌC KỸ TRƯỚC KHI SINH BLUEPRINT)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Loại nội dung : ${contentAnalysis.contentType}
Tâm trạng     : ${contentAnalysis.mood}
Ngôn ngữ      : ${contentAnalysis.language}
Nhạc đề xuất  : ${contentAnalysis.musicGenre}
Chủ đề chính  : ${contentAnalysis.mainTopics.join(", ")}
Tiêu đề đề xuất : "${contentAnalysis.suggestedTitle}"
CTA đề xuất     : "${contentAnalysis.suggestedCTA}"

Transcript (timestamps chính xác — dùng để tạo "caption" elements):
${contentAnalysis.transcript.map(t => `  [${(t.startFraction * duration).toFixed(1)}s → ${(t.endFraction * duration).toFixed(1)}s]: "${t.text}"`).join("\n")}

Key Moments (dùng để tạo "motion_graphic" / "text" highlight):
${contentAnalysis.keyMoments.map(m => `  [${(m.fraction * duration).toFixed(1)}s] (${m.importance}): ${m.description}${m.suggestedOverlay ? ` → overlay: "${m.suggestedOverlay}"` : ""}`).join("\n")}

HƯỚNG DẪN SỬ DỤNG PHÂN TÍCH NÀY:
1. Dùng transcript → tạo "caption" elements khớp CHÍNH XÁC timestamps từ transcript
2. Key moments với importance="high" → tạo "motion_graphic" tại thời điểm đó
3. Sử dụng "suggestedTitle" → "motion_graphic" template "title_card" ở đầu video (start:0, end:4)
4. Sử dụng "suggestedCTA" → "motion_graphic" template "highlight_box" ở cuối video
5. Chọn audio musicGenre="${contentAnalysis.musicGenre}" từ danh sách SECTION 5
6. Thêm "gradient_bg" (to top, opacity 0.6) để tăng contrast cho caption/text
` : ""}`;
}

/**
 * Represents a single editing segment in the structured style JSON.
 * All timestamps are expressed as fractions (0.0 to 1.0) of the source video duration.
 * This avoids asking the LLM to do arithmetic scaling.
 */
interface StyleSegment {
  /** Relative start position in source video, 0.0 = beginning, 1.0 = end */
  startFraction: number;
  /** Relative end position in source video, 0.0 = beginning, 1.0 = end */
  endFraction: number;
  playbackRate?: number;
  filters?: {
    brightness?: number;
    contrast?: number;
    saturate?: number;
    grayscale?: number;
  };
  effects?: {
    zoom?: "in" | "out" | "none";
    transition?: "fade" | "none";
  };
}

interface StyleTextOverlay {
  content: string;
  /** Relative start position as fraction of source video duration */
  startFraction: number;
  /** Relative end position as fraction of source video duration */
  endFraction: number;
  style?: {
    position?: string;
    color?: string;
    fontSize?: string;
  };
}

interface VideoStyleSchema {
  /** Overall editing tone / summary */
  editingStyle: string;
  /** Recommended music genre */
  musicGenre: "upbeat" | "tech" | "corporate" | "lofi" | "acoustic" | "none";
  /** Whether SFX whoosh transitions are used */
  useSFXTransitions: boolean;
  /** Video segments describing per-segment edits. ALL fractions are in [0.0, 1.0] range */
  segments: StyleSegment[];
  /** Text overlays. ALL fractions are in [0.0, 1.0] range */
  textOverlays: StyleTextOverlay[];
}

const MUSIC_URL_MAP: Record<string, string> = {
  upbeat: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  tech: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  corporate: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  lofi: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  acoustic: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
};

/**
 * Converts a VideoStyleSchema (with relative fractions) into a full Blueprint JSON
 * for a target video. All timestamp math is done here in code – not by the LLM.
 */
function buildBlueprintFromStyle(
  targetVideoUrl: string,
  targetDuration: number,
  style: VideoStyleSchema,
  userHint?: string
): any {
  const timeline: any[] = [];

  // ── Video segments ───────────────────────────────────────────────────────
  const segments = style.segments ? [...style.segments] : [];
  if (segments.length > 0) {
    // Sắp xếp các phân đoạn theo tỷ lệ phần trăm bắt đầu
    segments.sort((a, b) => a.startFraction - b.startFraction);

    // Điền các khoảng trống (gap) trong danh sách phân đoạn tỷ lệ
    const filledSegments: StyleSegment[] = [];
    let currentFraction = 0.0;
    for (const seg of segments) {
      if (seg.startFraction > currentFraction + 0.001) {
        filledSegments.push({
          startFraction: currentFraction,
          endFraction: seg.startFraction,
          playbackRate: 1.0,
        });
      }
      filledSegments.push(seg);
      currentFraction = seg.endFraction;
    }
    if (currentFraction < 0.999) {
      filledSegments.push({
        startFraction: currentFraction,
        endFraction: 1.0,
        playbackRate: 1.0,
      });
    }

    // Đổi tỷ lệ phân đoạn sang giây thực tế trên video gốc (source video)
    let cumulativeSourceOffset = 0;
    for (const seg of filledSegments) {
      const outputDuration = (seg.endFraction - seg.startFraction) * targetDuration;
      const rate = seg.playbackRate ?? 1.0;
      const sourceDuration = outputDuration * rate;

      const start = parseFloat(cumulativeSourceOffset.toFixed(3));
      const end = parseFloat((cumulativeSourceOffset + sourceDuration).toFixed(3));

      if (end <= start) continue;

      const entry: any = {
        type: "video",
        src: targetVideoUrl,
        start,
        end,
        playbackRate: rate,
      };

      if (seg.filters && Object.keys(seg.filters).length > 0) {
        entry.filters = seg.filters;
      }
      if (seg.effects && Object.keys(seg.effects).length > 0) {
        entry.effects = seg.effects;
      }

      timeline.push(entry);
      cumulativeSourceOffset += sourceDuration;
    }
  } else {
    // Fallback: single full-duration video clip
    timeline.push({
      type: "video",
      src: targetVideoUrl,
      start: 0,
      end: targetDuration,
      playbackRate: 1.0,
    });
  }

  // ── Text overlays ────────────────────────────────────────────────────────
  if (style.textOverlays && style.textOverlays.length > 0) {
    for (const overlay of style.textOverlays) {
      const start = parseFloat((overlay.startFraction * targetDuration).toFixed(3));
      const end = parseFloat((overlay.endFraction * targetDuration).toFixed(3));
      if (end <= start) continue;
      timeline.push({
        type: "text",
        content: overlay.content,
        start,
        end,
        style: overlay.style ?? { position: "bottom-center", color: "#FFD700", fontSize: "32px" },
      });
    }
  }

  // ── Background music ─────────────────────────────────────────────────────
  if (style.musicGenre && style.musicGenre !== "none") {
    const musicUrl = MUSIC_URL_MAP[style.musicGenre];
    if (musicUrl) {
      timeline.push({
        type: "audio",
        src: musicUrl,
        start: 0,
        end: targetDuration,
        volume: 0.4,
      });
    }
  }

  // ── SFX transitions ──────────────────────────────────────────────────────
  if (style.useSFXTransitions) {
    const videoSegs = timeline.filter((e) => e.type === "video");
    let accumulatedTimelineTime = 0;
    for (let i = 0; i < videoSegs.length - 1; i++) {
      const clip = videoSegs[i];
      const clipTimelineDuration = (clip.end - clip.start) / (clip.playbackRate ?? 1.0);
      accumulatedTimelineTime += clipTimelineDuration;

      const transitionStart = accumulatedTimelineTime - 0.3;
      const transitionEnd = accumulatedTimelineTime + 0.3;
      if (transitionStart >= 0 && transitionEnd <= targetDuration) {
        timeline.push({
          type: "audio",
          src: "/sfx/whoosh.wav",
          start: parseFloat(transitionStart.toFixed(3)),
          end: parseFloat(transitionEnd.toFixed(3)),
          volume: 0.6,
        });
      }
    }
  }

  return { timeline };
}

async function generateStyleViaOpenRouter(
  userPrompt?: string,
  durationSeconds = 60,
  targetDuration?: number
): Promise<VideoStyleSchema> {
  const userHint = (userPrompt && userPrompt.trim()) ? userPrompt.trim() : "Tạo video chất lượng, nhịp điệu sinh động và có nhạc nền phù hợp.";
  const effectiveTargetDuration = targetDuration || durationSeconds;

  const promptText = `Bạn là một chuyên gia biên tập video và kiến trúc sư kịch bản Remotion chuyên nghiệp.
Chúng tôi cần bạn thiết kế một phong cách biên tập video (VideoStyleSchema) dạng JSON dưới đây để làm nền tảng sinh kịch bản chỉnh sửa cho video có tổng thời lượng gốc là ${durationSeconds} giây và video đích là ${effectiveTargetDuration} giây.

Yêu cầu chỉnh sửa / Ý tưởng từ người dùng: "${userHint}"

⚠️ YÊU CẦU ĐẦU RA (MANDATORY - CRITICAL):
Trả về CHÍNH XÁC một đối tượng JSON hợp lệ theo schema sau. KHÔNG thêm bất kỳ văn bản nào ngoài JSON.

{
  "editingStyle": "mô tả ngắn về phong cách dựng tổng thể (vd: fast-cut cinematic, slow narrative, upbeat social media)",
  "musicGenre": "upbeat | tech | corporate | lofi | acoustic | none",
  "useSFXTransitions": true | false,
  "segments": [
    {
      "startFraction": <số thập phân từ 0.0 đến 1.0 = vị trí tương đối trong video>,
      "endFraction": <số thập phân từ 0.0 đến 1.0>,
      "playbackRate": <1.0 là tốc độ thường, 2.0 là gấp đôi, 0.5 là chậm gấp đôi>,
      "filters": {
        "brightness": <0.5 đến 2.0, 1.0 là bình thường>,
        "contrast": <0.5 đến 2.0, 1.0 là bình thường>,
        "saturate": <0.0 đến 3.0>,
        "grayscale": <0.0 hoặc 1.0>
      },
      "effects": {
        "zoom": "in | out | none",
        "transition": "fade | none"
      }
    }
  ],
  "textOverlays": [
    {
      "content": "Nội dung chữ hiển thị (tiếng Việt hoặc tiếng Anh dựa trên yêu cầu người dùng)",
      "startFraction": <0.0 đến 1.0>,
      "endFraction": <0.0 đến 1.0>,
      "style": {
        "position": "bottom-center | center | top-center",
        "color": "#FFFFFF | #FFD700 | #FF3333 | #00FFFF",
        "fontSize": "56px | 32px | 24px"
      }
    }
  ]
}

QUY TẮC BẮT BUỘC VỀ PHÂN SỐ THỜI GIAN:
- startFraction và endFraction là PHÂN SỐ TƯƠNG ĐỐI trong khoảng [0.0, 1.0].
- 0.0 = đầu video, 1.0 = cuối video.
- Tổng các phân đoạn (segments) phải bao phủ từ 0.0 đến 1.0 không có khoảng trống (không bị trùng lặp hay có khoảng trống ở giữa).
- Cần tạo các textOverlays phù hợp với nội dung và thời lượng của video (để phân bổ đều từ 0.0 đến 1.0).
- Hãy sáng tạo các phụ đề hoặc tiêu đề có ý nghĩa liên quan mật thiết đến yêu cầu của người dùng.`;

  console.log(`[videoBlueprintService] Calling OpenRouter to generate fallback VideoStyleSchema...`);
  try {
    const style = await openrouterJson<VideoStyleSchema>(promptText, {
      temperature: 0.7,
    });
    
    if (!style.segments || style.segments.length === 0) {
      style.segments = [{ startFraction: 0.0, endFraction: 1.0, playbackRate: 1.0 }];
    }
    
    style.segments.sort((a, b) => a.startFraction - b.startFraction);
    style.segments[0].startFraction = 0.0;
    style.segments[style.segments.length - 1].endFraction = 1.0;
    
    return style;
  } catch (err) {
    console.error(`[videoBlueprintService] OpenRouter fallback failed:`, err);
    return {
      editingStyle: "standard cinematic",
      musicGenre: "lofi",
      useSFXTransitions: true,
      segments: [
        {
          startFraction: 0.0,
          endFraction: 1.0,
          playbackRate: 1.0,
        }
      ],
      textOverlays: [
        {
          content: userHint.slice(0, 50),
          startFraction: 0.1,
          endFraction: 0.5,
          style: {
            position: "bottom-center",
            color: "#FFD700",
            fontSize: "32px",
          }
        }
      ]
    };
  }
}

async function generateStyleFallbackForCopy(d1: number, d2: number): Promise<VideoStyleSchema> {
  const promptText = `Bạn là một chuyên gia biên tập video chuyên nghiệp.
Do hệ thống phân tích hình ảnh đang tạm thời gián đoạn, chúng tôi cần bạn thiết kế một phong cách biên tập video (VideoStyleSchema) chất lượng cao để áp dụng từ video mẫu (thời lượng gốc ${d1} giây) sang video mới (thời lượng đích ${d2} giây).

Hãy thiết kế một sơ đồ biên tập hấp dẫn, phân chia video thành các phần hợp lý bằng tỷ lệ [0.0, 1.0], thêm bộ lọc màu sắc sinh động, hiệu ứng chuyển cảnh mượt mà, và phụ đề/tiêu đề gợi ý.

⚠️ YÊU CẦU ĐẦU RA (MANDATORY):
Trả về MỘT đối tượng JSON hợp lệ theo schema sau. KHÔNG thêm văn bản nào khác.

{
  "editingStyle": "mô tả ngắn về phong cách dựng tổng thể",
  "musicGenre": "upbeat | tech | corporate | lofi | acoustic | none",
  "useSFXTransitions": true | false,
  "segments": [
    {
      "startFraction": <số từ 0.0 đến 1.0>,
      "endFraction": <số từ 0.0 đến 1.0>,
      "playbackRate": <1.0 bình thường>,
      "filters": { "brightness": 1.0, "contrast": 1.0, "saturate": 1.0, "grayscale": 0.0 },
      "effects": { "zoom": "none | in | out", "transition": "none | fade" }
    }
  ],
  "textOverlays": [
    {
      "content": "Tiêu đề hoặc phụ đề gợi ý",
      "startFraction": <0.0 đến 1.0>,
      "endFraction": <0.0 đến 1.0>,
      "style": { "position": "bottom-center", "color": "#FFD700", "fontSize": "32px" }
    }
  ]
}

QUY TẮC PHÂN SỐ THỜI GIAN:
- startFraction và endFraction là PHÂN SỐ TƯƠNG ĐỐI [0.0, 1.0].
- Các phân đoạn phải bao phủ toàn bộ từ 0.0 đến 1.0.`;

  console.log(`[videoBlueprintService] Calling OpenRouter to generate fallback VideoStyleSchema for copyAndScale...`);
  try {
    return await openrouterJson<VideoStyleSchema>(promptText, { temperature: 0.6 });
  } catch (err) {
    console.error(`[videoBlueprintService] OpenRouter copy fallback failed:`, err);
    return {
      editingStyle: "cinematic style transfer fallback",
      musicGenre: "acoustic",
      useSFXTransitions: true,
      segments: [
        {
          startFraction: 0.0,
          endFraction: 1.0,
          playbackRate: 1.0,
        }
      ],
      textOverlays: [
        {
          content: "Chỉnh sửa tự động",
          startFraction: 0.1,
          endFraction: 0.4,
          style: {
            position: "bottom-center",
            color: "#FFD700",
            fontSize: "32px",
          }
        }
      ]
    };
  }
}

async function analyzeVideoContent(videoUrl: string, duration: number): Promise<VideoContentAnalysis> {
  const tempVideoPath = path.join(os.tmpdir(), `temp_content_analysis_${Date.now()}.mp4`);

  try {
    console.log(`[videoBlueprintService] Downloading video for content analysis: ${videoUrl}`);
    await downloadFile(videoUrl, tempVideoPath);

    const uploadResult = await ai.files.upload({
      file: tempVideoPath,
      config: { mimeType: "video/mp4" },
    });

    let fileState = await ai.files.get({ name: uploadResult.name });
    let pollAttempts = 0;
    while (fileState.state === "PROCESSING" && pollAttempts < 60) {
      await new Promise((r) => setTimeout(r, 2000));
      fileState = await ai.files.get({ name: uploadResult.name });
      pollAttempts++;
    }
    if (fileState.state !== "ACTIVE") {
      throw new Error(`Gemini File API: video không chuyển sang ACTIVE (state: ${fileState.state})`);
    }

    const analysisPrompt = `Phân tích nội dung của video này (tổng thời lượng ${duration} giây) và trả về JSON theo schema sau.
Tất cả timestamps phải là PHÂN SỐ TƯƠNG ĐỐI [0.0, 1.0] (0.0 = đầu video, 1.0 = cuối).

⚠️ Trả về ĐÚNG một JSON object. KHÔNG thêm văn bản nào khác.

{
  "transcript": [
    { "text": "<lời nói chính xác>", "startFraction": <0.0-1.0>, "endFraction": <0.0-1.0> }
  ],
  "keyMoments": [
    { "description": "<mô tả điểm nổi bật>", "fraction": <0.0-1.0>, "importance": "high"|"medium"|"low", "suggestedOverlay": "<text đề xuất hiển thị (optional)>" }
  ],
  "mood": "upbeat"|"serious"|"emotional"|"corporate"|"educational"|"entertainment",
  "contentType": "tutorial"|"product_demo"|"vlog"|"interview"|"presentation"|"story"|"other",
  "mainTopics": ["<chủ đề 1>", "<chủ đề 2>"],
  "suggestedTitle": "<tiêu đề hấp dẫn cho video>",
  "suggestedCTA": "<kêu gọi hành động phù hợp nội dung>",
  "musicGenre": "upbeat"|"tech"|"corporate"|"lofi"|"acoustic"|"none",
  "language": "vi"|"en"|"other"
}

Quy tắc:
- transcript: Ghi lại lời nói/tiếng chú thích chính xác theo từng câu/đoạn ngắn. Nếu video không có lời thoại, để mảng rỗng [].
- keyMoments: 3-6 khoảnh khắc quan trọng nhất (cao trào, số liệu, điểm chuyển, kết luận).
- suggestedTitle: Tiêu đề ngắn gọn, hấp dẫn, phù hợp social media.
- suggestedCTA: Ví dụ: "Đăng ký để xem thêm", "Bình luận ý kiến của bạn", "Link bio để tải ngay".`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [
            { fileData: { fileUri: uploadResult.uri, mimeType: uploadResult.mimeType } },
            { text: analysisPrompt },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    });

    try { await ai.files.delete({ name: uploadResult.name }); } catch {}

    const analysis = safeParseJson(response.text || "") as VideoContentAnalysis;

    if (!Array.isArray(analysis.transcript)) analysis.transcript = [];
    if (!Array.isArray(analysis.keyMoments)) analysis.keyMoments = [];
    if (!Array.isArray(analysis.mainTopics)) analysis.mainTopics = [];
    if (!analysis.suggestedTitle) analysis.suggestedTitle = "";
    if (!analysis.suggestedCTA) analysis.suggestedCTA = "";
    if (!analysis.musicGenre) analysis.musicGenre = "none";
    if (!analysis.language) analysis.language = "vi";

    console.log(`[videoBlueprintService] Content analysis done: contentType=${analysis.contentType}, mood=${analysis.mood}, transcript=${analysis.transcript.length} segments, keyMoments=${analysis.keyMoments.length}`);
    return analysis;
  } finally {
    if (fs.existsSync(tempVideoPath)) {
      try { fs.unlinkSync(tempVideoPath); } catch {}
    }
  }
}

export const videoBlueprintService = {
  /**
   * Kiểm tra xem prompt có yêu cầu sao chép kịch bản từ video trước hay không
   */
  isCopyPrompt(prompt: string): boolean {
    const normalizedPrompt = prompt
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d");

    const matchesVietnamese = (
      normalizedPrompt.includes("giong video truoc") ||
      normalizedPrompt.includes("giong video cu") ||
      normalizedPrompt.includes("nhu video truoc") ||
      normalizedPrompt.includes("sau giong truoc") ||
      normalizedPrompt.includes("sao chep edit") ||
      normalizedPrompt.includes("sao chep chinh sua") ||
      normalizedPrompt.includes("lay edit")
    );

    const matchesEnglish = (
      normalizedPrompt.includes("previous video") ||
      normalizedPrompt.includes("reference video") ||
      normalizedPrompt.includes("replicate") ||
      normalizedPrompt.includes("emulate") ||
      normalizedPrompt.includes("copy the style") ||
      normalizedPrompt.includes("same as the first") ||
      normalizedPrompt.includes("same as the previous")
    );

    return matchesVietnamese || matchesEnglish;
  },

  /**
   * Phân tích video mẫu để trích xuất phong cách dựng phim.
   *
   * PHƯƠNG PHÁP MỚI (chính xác):
   *   1. Gemini phân tích video mẫu và trả về JSON có timestamp dạng PHÂN SỐ (0.0–1.0).
   *   2. Backend tự nhân phân số với targetDuration để ra giây chính xác.
   *   => Tránh hoàn toàn việc để LLM tính toán số học.
   *
   * Kết quả trả về là prompt mô tả kịch bản dựa trên style đã scale sang target duration.
   */
  async extractVideoStyle(
    videoUrl: string,
    durationSeconds?: number,
    targetVideoUrl?: string,
    targetDuration?: number,
    userPrompt?: string
  ): Promise<string> {
    const tempVideoPath = path.join(os.tmpdir(), `temp_style_extraction_${Date.now()}.mp4`);

    let style: VideoStyleSchema | null = null;

    try {
      console.log(`[videoBlueprintService] Downloading video for style extraction: ${videoUrl}`);
      await downloadFile(videoUrl, tempVideoPath);
      console.log(`[videoBlueprintService] Downloaded successfully. Uploading to Gemini File API...`);

      const uploadResult = await ai.files.upload({
        file: tempVideoPath,
        config: {
          mimeType: "video/mp4",
        }
      });
      console.log(`[videoBlueprintService] Uploaded successfully. Name: ${uploadResult.name}. Waiting for status ACTIVE...`);

      // Chờ cho file xử lý xong trên Gemini (tối đa 2 phút = 60 lần × 2s)
      let fileState = await ai.files.get({ name: uploadResult.name });
      let pollAttempts = 0;
      const MAX_POLL = 60;
      while (fileState.state === "PROCESSING") {
        if (pollAttempts >= MAX_POLL) {
          throw new Error("Gemini File API timeout: video đang xử lý quá lâu (> 2 phút).");
        }
        console.log(`[videoBlueprintService] Video is processing by Gemini, waiting 2 seconds... (attempt ${pollAttempts + 1}/${MAX_POLL})`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        fileState = await ai.files.get({ name: uploadResult.name });
        pollAttempts++;
      }

      if (fileState.state !== "ACTIVE") {
        throw new Error(`Gemini File API processing failed: ${fileState.state}`);
      }

      console.log("[videoBlueprintService] File is ACTIVE. Calling Gemini model to extract structured style JSON...");

      const sourceDuration = durationSeconds || 60;

      const userHintSection = (userPrompt && userPrompt.trim())
        ? `\n\nNgoài ra, hãy kết hợp thêm ý tưởng/yêu cầu chỉnh sửa cụ thể này từ người dùng vào khi xây dựng kịch bản: "${userPrompt.trim()}"`
        : "";

      const analysisPrompt = `Hãy phân tích phong cách biên tập và kỹ thuật dựng hình của video này (tổng thời lượng ${sourceDuration} giây).

⚠️ YÊU CẦU ĐẦU RA (MANDATORY - CRITICAL):
Trả về CHÍNH XÁC một đối tượng JSON hợp lệ theo schema sau. KHÔNG thêm bất kỳ văn bản nào ngoài JSON.

{
  "editingStyle": "mô tả ngắn về phong cách dựng tổng thể (vd: fast-cut cinematic, slow narrative, upbeat social media)",
  "musicGenre": "upbeat | tech | corporate | lofi | acoustic | none",
  "useSFXTransitions": true | false,
  "segments": [
    {
      "startFraction": <số thập phân từ 0.0 đến 1.0 = vị trí tương đối trong video>,
      "endFraction": <số thập phân từ 0.0 đến 1.0>,
      "playbackRate": <1.0 là tốc độ thường, 2.0 là gấp đôi, 0.5 là chậm gấp đôi>,
      "filters": {
        "brightness": <0.5 đến 2.0, 1.0 là bình thường>,
        "contrast": <0.5 đến 2.0, 1.0 là bình thường>,
        "saturate": <0.0 đến 3.0>,
        "grayscale": <0.0 hoặc 1.0>
      },
      "effects": {
        "zoom": "in | out | none",
        "transition": "fade | none"
      }
    }
  ],
  "textOverlays": [
    {
      "content": "Chèn chữ tiêu đề mẫu",
      "startFraction": <0.0 đến 1.0>,
      "endFraction": <0.0 đến 1.0>,
      "style": {
        "position": "bottom-center | center | top-center",
        "color": "#FFFFFF | #FFD700 | #FF3333 | #00FFFF",
        "fontSize": "56px | 32px | 24px"
      }
    }
  ]
}

QUY TẮC BẮT BUỘC VỀ PHÂN SỐ THỜI GIAN:
- startFraction và endFraction là PHÂN SỐ TƯƠNG ĐỐI trong khoảng [0.0, 1.0].
- 0.0 = đầu video, 1.0 = cuối video.
- Ví dụ: nếu một hiệu ứng xảy ra ở giây thứ 15 trong video 60 giây, thì startFraction = 15/60 = 0.25.
- KHÔNG dùng giây thực, KHÔNG dùng millisecond.
- Tổng các phân đoạn (segments) phải bao phủ từ 0.0 đến 1.0 không có khoảng trống.

QUY TẮC VỀ NỘI DUNG:
- TUYỆT ĐỐI KHÔNG mô tả nội dung cụ thể (nhân vật, đồ vật, cảnh vật) của video.
- CHỈ trích xuất kỹ thuật dựng: nhịp cắt ghép, bộ lọc màu, hiệu ứng zoom/fade, text overlay chung, nhạc.
- Nội dung text overlay phải là chung chung (ví dụ: "Chèn tiêu đề ở đây", "Phụ đề mẫu").
${userHintSection}`;

      const analysisResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: {
                  fileUri: uploadResult.uri,
                  mimeType: uploadResult.mimeType,
                },
              },
              { text: analysisPrompt },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        }
      });

      const rawJson = analysisResponse.text || "";
      console.log("[videoBlueprintService] Raw style JSON from Gemini (first 500 chars):", rawJson.substring(0, 500));

      style = safeParseJson(rawJson) as VideoStyleSchema;

      // Xóa file trên Gemini để dọn dẹp
      try {
        await ai.files.delete({ name: uploadResult.name });
        console.log(`[videoBlueprintService] Deleted file from Gemini: ${uploadResult.name}`);
      } catch (delErr) {
        console.warn("[videoBlueprintService] Failed to delete file from Gemini:", delErr);
      }
    } catch (err) {
      console.error("[videoBlueprintService] Error during multimodal analysis of video:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isQuotaOrLimitError = (err as any)?.status === 429 || 
                                  errorMsg.includes("429") || 
                                  errorMsg.includes("RESOURCE_EXHAUSTED") || 
                                  errorMsg.includes("quota") ||
                                  errorMsg.includes("prepayment credits are depleted") ||
                                  errorMsg.includes("billing");

      if ((isQuotaOrLimitError || isOverloadError(err)) && !!process.env.OPENROUTER_API_KEY) {
        console.warn("[videoBlueprintService] Gemini failed during style extraction. Falling back to OpenRouter...");
        try {
          style = await generateStyleViaOpenRouter(userPrompt, durationSeconds || 60, targetDuration);
        } catch (fallbackErr) {
          console.error("[videoBlueprintService] OpenRouter fallback style generation failed:", fallbackErr);
        }
      }

      if (!style) {
        if (isOverloadError(err)) {
          throw new Error("Mô hình AI quá tải, vui lòng thử lại sau.");
        }
        throw new Error(`Lỗi khi phân tích video mẫu: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      // Dọn dẹp local temp file
      if (fs.existsSync(tempVideoPath)) {
        try {
          fs.unlinkSync(tempVideoPath);
        } catch (delErr) {
          console.warn("[videoBlueprintService] Failed to delete local temp file:", delErr);
        }
      }
    }

    if (!style) {
      throw new Error("Không nhận diện được nội dung kịch bản phân tích từ video mẫu.");
    }

    // ── Code-side scaling: convert fractions to actual seconds for the target ──
    const effectiveDuration = durationSeconds || 60;
    const scaledDuration = targetDuration || effectiveDuration;

    // Build a human-readable prompt from the structured style JSON so the rest of
    // the pipeline (prompt field in UI, generateBlueprintFromPrompt) works correctly.
    const lines: string[] = [
      `Đây là hướng dẫn biên tập video được trích xuất từ video mẫu (tổng thời lượng gốc: ${effectiveDuration}s) và được điều chỉnh cho video đích (${scaledDuration}s).`,
      ``,
      `**Phong cách dựng tổng thể:** ${style.editingStyle}`,
      ``,
      `**Nhạc nền:** ${style.musicGenre !== "none" ? style.musicGenre : "Không dùng nhạc"}`,
      `**Hiệu ứng SFX chuyển cảnh:** ${style.useSFXTransitions ? "Có" : "Không"}`,
      ``,
      `**Các phân đoạn (đã scale sang video đích ${scaledDuration}s):**`,
    ];

    if (style.segments && style.segments.length > 0) {
      for (const seg of style.segments) {
        const startSec = parseFloat((seg.startFraction * scaledDuration).toFixed(2));
        const endSec = parseFloat((seg.endFraction * scaledDuration).toFixed(2));
        const rate = seg.playbackRate ?? 1.0;
        const filterDesc = seg.filters
          ? Object.entries(seg.filters).map(([k, v]) => `${k}=${v}`).join(", ")
          : "none";
        const effectDesc = seg.effects
          ? `zoom=${seg.effects.zoom ?? "none"}, transition=${seg.effects.transition ?? "none"}`
          : "none";
        lines.push(
          `- Từ ${startSec}s đến ${endSec}s: playbackRate=${rate}, filters=[${filterDesc}], effects=[${effectDesc}]`
        );
      }
    }

    if (style.textOverlays && style.textOverlays.length > 0) {
      lines.push(``, `**Text Overlays (đã scale sang video đích ${scaledDuration}s):**`);
      for (const overlay of style.textOverlays) {
        const startSec = parseFloat((overlay.startFraction * scaledDuration).toFixed(2));
        const endSec = parseFloat((overlay.endFraction * scaledDuration).toFixed(2));
        const pos = overlay.style?.position ?? "bottom-center";
        const color = overlay.style?.color ?? "#FFD700";
        const size = overlay.style?.fontSize ?? "32px";
        lines.push(
          `- Chèn chữ "${overlay.content}" từ ${startSec}s đến ${endSec}s, vị trí: ${pos}, màu: ${color}, cỡ chữ: ${size}`
        );
      }
    }

    if (userPrompt && userPrompt.trim()) {
      lines.push(``, `**Ý tưởng bổ sung từ người dùng:** ${userPrompt.trim()}`);
    }

    const result = lines.join("\n");
    console.log("[videoBlueprintService] Style extraction completed. Result length:", result.length);

    // Attach raw style JSON as metadata comment for downstream fast-path use.
    // Guard: targetDuration must be > 0 to produce valid blueprint later.
    const effectiveTargetDuration = scaledDuration > 0 ? scaledDuration : effectiveDuration;
    const jsonMeta = `\n\n<!-- STYLE_JSON:${JSON.stringify({ style, targetDuration: effectiveTargetDuration, targetVideoUrl: targetVideoUrl || null })} -->`;
    return result + jsonMeta;
  },

  /**
   * Sử dụng Gemini để phân tích video cũ, sau đó tạo Blueprint mới cho video mới.
   * Được gọi khi có 2+ video trong danh sách (video[0] = mẫu, video[1] = đích).
   */
  async copyAndScaleBlueprint(
    userId: string,
    urls: string[],
    urlDurations: { [url: string]: number }
  ): Promise<any> {
    if (urls.length < 2) {
      throw new Error("Vui lòng tải lên ít nhất 2 video (video đầu tiên là video mẫu đã sửa, video thứ hai là video mới cần áp dụng chỉnh sửa).");
    }

    const video1Url = urls[0];
    const video2Url = urls[1];

    const d1 = urlDurations[video1Url] || 0;
    const d2 = urlDurations[video2Url] || 0;

    const tempVideoPath = path.join(os.tmpdir(), `temp_copy_template_${Date.now()}.mp4`);
    let style: VideoStyleSchema | null = null;

    try {
      console.log(`[videoBlueprintService] Downloading template video 1 for LLM analysis: ${video1Url}`);
      await downloadFile(video1Url, tempVideoPath);
      console.log(`[videoBlueprintService] Downloaded successfully. Uploading to Gemini File API...`);

      const uploadResult = await ai.files.upload({
        file: tempVideoPath,
        config: {
          mimeType: "video/mp4",
        }
      });
      console.log(`[videoBlueprintService] Uploaded successfully. Name: ${uploadResult.name}. Waiting for status ACTIVE...`);

      // Chờ cho file xử lý xong trên Gemini (tối đa 2 phút = 60 lần × 2s)
      let fileState = await ai.files.get({ name: uploadResult.name });
      let pollAttempts = 0;
      const MAX_POLL = 60;
      while (fileState.state === "PROCESSING") {
        if (pollAttempts >= MAX_POLL) {
          throw new Error("Gemini File API timeout: video đang xử lý quá lâu (> 2 phút).");
        }
        console.log(`[videoBlueprintService] Video is processing by Gemini, waiting 2 seconds... (attempt ${pollAttempts + 1}/${MAX_POLL})`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        fileState = await ai.files.get({ name: uploadResult.name });
        pollAttempts++;
      }

      if (fileState.state !== "ACTIVE") {
        throw new Error(`Gemini File API processing failed: ${fileState.state}`);
      }

      console.log("[videoBlueprintService] File is ACTIVE. Calling Gemini model to extract structured style JSON...");

      const analysisPrompt = `Phân tích kỹ thuật dựng hình và phong cách biên tập của video này (tổng thời lượng ${d1} giây).

⚠️ YÊU CẦU ĐẦU RA (MANDATORY):
Trả về MỘT đối tượng JSON hợp lệ theo schema sau. KHÔNG thêm văn bản nào khác.

{
  "editingStyle": "mô tả ngắn về phong cách dựng tổng thể",
  "musicGenre": "upbeat | tech | corporate | lofi | acoustic | none",
  "useSFXTransitions": true | false,
  "segments": [
    {
      "startFraction": <số từ 0.0 đến 1.0 — vị trí tương đối trong video>,
      "endFraction": <số từ 0.0 đến 1.0>,
      "playbackRate": <1.0 bình thường>,
      "filters": { "brightness": 1.0, "contrast": 1.0, "saturate": 1.0, "grayscale": 0.0 },
      "effects": { "zoom": "none | in | out", "transition": "none | fade" }
    }
  ],
  "textOverlays": [
    {
      "content": "Chèn chữ tiêu đề",
      "startFraction": <0.0 đến 1.0>,
      "endFraction": <0.0 đến 1.0>,
      "style": { "position": "bottom-center", "color": "#FFD700", "fontSize": "32px" }
    }
  ]
}

QUY TẮC PHÂN SỐ THỜI GIAN:
- startFraction và endFraction là PHÂN SỐ TƯƠNG ĐỐI [0.0, 1.0]. Ví dụ: giây 15 trong video 60s → fraction = 0.25.
- KHÔNG dùng giây thực. KHÔNG dùng millisecond.
- Các phân đoạn phải bao phủ toàn bộ từ 0.0 đến 1.0.
- KHÔNG mô tả nội dung cụ thể (nhân vật, đồ vật), chỉ mô tả kỹ thuật dựng.`;

      const analysisResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: {
                  fileUri: uploadResult.uri,
                  mimeType: uploadResult.mimeType,
                },
              },
              { text: analysisPrompt },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
        }
      });

      const rawJson = analysisResponse.text || "";
      console.log("[videoBlueprintService] copyAndScale: Raw style JSON (first 500):", rawJson.substring(0, 500));
      style = safeParseJson(rawJson) as VideoStyleSchema;

      // Xóa file trên Gemini để dọn dẹp
      try {
        await ai.files.delete({ name: uploadResult.name });
        console.log(`[videoBlueprintService] Deleted file from Gemini: ${uploadResult.name}`);
      } catch (delErr) {
        console.warn("[videoBlueprintService] Failed to delete file from Gemini:", delErr);
      }
    } catch (err) {
      console.error("[videoBlueprintService] Error during multimodal analysis of video 1:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isQuotaOrLimitError = (err as any)?.status === 429 || 
                                  errorMsg.includes("429") || 
                                  errorMsg.includes("RESOURCE_EXHAUSTED") || 
                                  errorMsg.includes("quota") ||
                                  errorMsg.includes("prepayment credits are depleted") ||
                                  errorMsg.includes("billing");

      if ((isQuotaOrLimitError || isOverloadError(err)) && !!process.env.OPENROUTER_API_KEY) {
        console.warn("[videoBlueprintService] Gemini failed in copyAndScale. Falling back to OpenRouter...");
        try {
          style = await generateStyleFallbackForCopy(d1, d2);
        } catch (fallbackErr) {
          console.error("[videoBlueprintService] OpenRouter copy fallback style generation failed:", fallbackErr);
        }
      }

      if (!style) {
        if (isOverloadError(err)) {
          throw new Error("Mô hình AI quá tải, vui lòng thử lại sau.");
        }
        throw new Error(`Lỗi khi phân tích video gốc: ${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      // Dọn dẹp local temp file
      if (fs.existsSync(tempVideoPath)) {
        try {
          fs.unlinkSync(tempVideoPath);
        } catch (delErr) {
          console.warn("[videoBlueprintService] Failed to delete local temp file:", delErr);
        }
      }
    }

    if (!style) {
      throw new Error("Không nhận diện được nội dung kịch bản phân tích từ video mẫu.");
    }

    // BUG-13 guard: d2 must be > 0 or all timestamps will be 0
    if (d2 <= 0) {
      throw new Error("Không xác định được thời lượng video đích. Vui lòng kiểm tra lại video đầu vào.");
    }

    // ── Code-side scaling: multiply fractions by target duration ──────────────
    console.log(`[videoBlueprintService] Building blueprint for target video (${d2}s) from style (source ${d1}s)...`);
    const blueprint = buildBlueprintFromStyle(video2Url, d2, style);

    // Sanity check
    if (!blueprint.timeline || !Array.isArray(blueprint.timeline) || blueprint.timeline.filter((item: any) => item.type === "video").length === 0) {
      console.warn("[videoBlueprintService] Blueprint has no video track, adding fallback.");
      if (!blueprint.timeline || !Array.isArray(blueprint.timeline)) {
        blueprint.timeline = [];
      }
      blueprint.timeline.unshift({
        type: "video",
        src: video2Url,
        start: 0,
        end: d2,
        playbackRate: 1.0
      });
    }

    console.log("[videoBlueprintService] Blueprint generated successfully via code-side scaling.");
    return blueprint;
  },

  /**
   * Sinh cấu trúc JSON Blueprint trực tiếp từ Prompt chỉnh sửa của người dùng.
   * Nếu prompt có chứa metadata STYLE_JSON, tạo blueprint từ structured style.
   * Ngược lại, dùng LLM để sinh blueprint từ văn bản mô tả.
   */
  async generateBlueprintFromPrompt(
    videoUrl: string,
    duration: number,
    prompt: string
  ): Promise<any> {
    if (!prompt || !prompt.trim()) {
      console.log("[videoBlueprintService] Prompt is empty, returning default unedited timeline blueprint.");
      return {
        timeline: [
          {
            type: "video",
            src: videoUrl,
            start: 0,
            end: duration,
            playbackRate: 1.0
          }
        ]
      };
    }

    // ── Fast path: if prompt contains embedded STYLE_JSON, use code-side builder ──
    const styleJsonMatch = prompt.match(/<!--\s*STYLE_JSON:(.*?)\s*-->/s);
    if (styleJsonMatch) {
      try {
        const meta = JSON.parse(styleJsonMatch[1]);
        const style = meta.style as VideoStyleSchema;
        const targetDuration = meta.targetDuration ?? duration;
        const targetVideoUrl = meta.targetVideoUrl ?? videoUrl;

        // Extract user hints from the text (before the JSON comment)
        const textPart = prompt.replace(/<!--\s*STYLE_JSON:.*?-->/s, "").trim();

        console.log(`[videoBlueprintService] Using code-side blueprint builder from embedded STYLE_JSON (targetDuration=${targetDuration}s)`);
        const blueprint = buildBlueprintFromStyle(targetVideoUrl || videoUrl, targetDuration, style, textPart);

        if (!blueprint.timeline || blueprint.timeline.filter((e: any) => e.type === "video").length === 0) {
          blueprint.timeline = [{ type: "video", src: videoUrl, start: 0, end: duration, playbackRate: 1.0 }];
        }

        return blueprint;
      } catch (parseErr) {
        console.warn("[videoBlueprintService] Failed to parse embedded STYLE_JSON, falling back to LLM:", parseErr);
      }
    }

    // ── Standard LLM path ─────────────────────────────────────────────────────
    const systemPrompt = buildSystemPrompt(videoUrl, duration);
    const userPromptText = `Hãy tạo kịch bản chỉnh sửa video JSON Blueprint cho Video có URL "${videoUrl}" và thời lượng ${duration} giây.\nYêu cầu chỉnh sửa: "${prompt}"\n\nĐảm bảo kết quả đầu ra CHỈ là JSON thô, không chứa thẻ markdown hay lời nói thừa.`;

    console.log("[videoBlueprintService] Calling Gemini model to generate blueprint from prompt...");
    try {
      const blueprintResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userPromptText,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        }
      });

      const blueprintJsonText = blueprintResponse.text || "";
      const blueprint = safeParseJson(blueprintJsonText);

      // Sanity check: Ensure there is at least one video track
      if (!blueprint.timeline || !Array.isArray(blueprint.timeline) || blueprint.timeline.filter((item: any) => item.type === "video").length === 0) {
        if (!blueprint.timeline || !Array.isArray(blueprint.timeline)) {
          blueprint.timeline = [];
        }
        blueprint.timeline.unshift({
          type: "video",
          src: videoUrl,
          start: 0,
          end: duration,
          playbackRate: 1.0
        });
      }

      return blueprint;
    } catch (err) {
      console.error("[videoBlueprintService] Error generating blueprint from prompt:", err);
      const errorMsg = err instanceof Error ? err.message : String(err);
      const isQuotaOrLimitError = (err as any)?.status === 429 || 
                                  errorMsg.includes("429") || 
                                  errorMsg.includes("RESOURCE_EXHAUSTED") || 
                                  errorMsg.includes("quota") ||
                                  errorMsg.includes("prepayment credits are depleted") ||
                                  errorMsg.includes("billing");

      if ((isQuotaOrLimitError || isOverloadError(err)) && !!process.env.OPENROUTER_API_KEY) {
        console.warn("[videoBlueprintService] Gemini failed in generateBlueprintFromPrompt. Falling back to OpenRouter...");
        try {
          const systemInstruction = buildSystemPrompt(videoUrl, duration);
          const blueprint = await openrouterJson(userPromptText, {
            systemPrompt: systemInstruction,
            temperature: 0.7,
          });

          if (blueprint && blueprint.timeline && Array.isArray(blueprint.timeline)) {
            if (blueprint.timeline.filter((item: any) => item.type === "video").length === 0) {
              blueprint.timeline.unshift({
                type: "video",
                src: videoUrl,
                start: 0,
                end: duration,
                playbackRate: 1.0
              });
            }
            console.log("[videoBlueprintService] Generated blueprint via OpenRouter fallback successfully.");
            return blueprint;
          }
        } catch (fallbackErr) {
          console.error("[videoBlueprintService] OpenRouter blueprint generation failed:", fallbackErr);
        }
      }

      return {
        timeline: [
          {
            type: "video",
            src: videoUrl,
            start: 0,
            end: duration,
            playbackRate: 1.0
          }
        ]
      };
    }
  },

  /**
   * Tinh chỉnh blueprint đã sinh (từ video mẫu) bằng thêm prompt bổ sung của user.
   * Gọi khi user vừa có video mẫu VỪA nhập thêm prompt text.
   */
  async refineBlueprint(
    existingBlueprint: any,
    additionalPrompt: string,
    videoUrl: string,
    duration: number
  ): Promise<any> {
    if (!additionalPrompt?.trim()) return existingBlueprint;

    const systemPrompt = `Bạn là AI chỉnh sửa video chuyên nghiệp.
Dưới đây là một Blueprint JSON đã được sinh từ video mẫu (phân tích phong cách dựng hình).
Hãy tinh chỉnh Blueprint này theo YÊU CẦU BỔ SUNG của người dùng mà KHÔNG thay đổi cấu trúc video track cơ bản.

Blueprint hiện tại:
${JSON.stringify(existingBlueprint, null, 2)}

Yêu cầu bổ sung: "${additionalPrompt}"

Video nguồn: ${videoUrl}
Thời lượng: ${duration}s

QUY TẮC:
- Giữ nguyên các video clip (type="video") và thứ tự thời gian
- Chỉ thêm/sửa/xóa text overlays, audio, image theo yêu cầu bổ sung
- Nếu yêu cầu nhắc đến màu sắc/hiệu ứng text, cập nhật style của textOverlay items
- Trả về JSON Blueprint hợp lệ, KHÔNG có markdown code fences, KHÔNG thêm giải thích`;

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
        config: { responseMimeType: "application/json" },
      });
      const rawJson = response.text || "";
      const refined = safeParseJson(rawJson);
      if (refined?.timeline && Array.isArray(refined.timeline)) {
        console.log("[videoBlueprintService] refineBlueprint: Successfully refined blueprint with additional prompt.");
        return refined;
      }
    } catch (err) {
      console.warn("[videoBlueprintService] refineBlueprint failed, returning original blueprint:", err);
    }
    return existingBlueprint;
  },

  analyzeVideoContent,

  /**
   * Content-Aware Blueprint Generation.
   * Bước 1: Gemini multimodal phân tích nội dung video (transcript, key moments, mood, topics).
   * Bước 2: Gemini sinh Blueprint với full context từ phân tích.
   * Kết quả: blueprint chính xác hơn nhiều — captions đúng timestamps, motion graphics tại key moments,
   * nhạc nền khớp mood, CTA và title từ nội dung thực.
   */
  async generateContentAwareBlueprint(
    videoUrl: string,
    duration: number,
    prompt: string
  ): Promise<{ blueprint: any; analysis: VideoContentAnalysis | null }> {
    let analysis: VideoContentAnalysis | null = null;

    try {
      console.log("[videoBlueprintService] Step 1/2: Analyzing video content...");
      analysis = await analyzeVideoContent(videoUrl, duration);
    } catch (err) {
      console.warn("[videoBlueprintService] Content analysis failed, falling back to standard generation:", err);
    }

    console.log("[videoBlueprintService] Step 2/2: Generating blueprint with content context...");
    const systemPrompt = buildSystemPrompt(videoUrl, duration, analysis ?? undefined);
    const userPromptText = `Hãy tạo JSON Blueprint chỉnh sửa video CHUYÊN NGHIỆP cho video URL "${videoUrl}" (${duration} giây).
Yêu cầu: "${prompt || "Tạo video chất lượng cao, chuyên nghiệp"}"

${analysis ? `Hướng dẫn bổ sung dựa trên phân tích nội dung:
- Chèn captions từ transcript với timestamps chính xác
- Thêm motion_graphic "title_card" ở đầu với tiêu đề: "${analysis.suggestedTitle}"
- Thêm motion_graphic "highlight_box" ở cuối với CTA: "${analysis.suggestedCTA}"
- Tạo motion_graphic tại các key moments quan trọng
- Chọn nhạc nền: ${analysis.musicGenre}
- Thêm gradient_bg vignette để tăng độ tương phản cho text` : ""}

Trả về CHỈ JSON thô, không markdown, không giải thích.`;

    try {
      const blueprintResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: userPromptText,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
        },
      });

      const blueprint = safeParseJson(blueprintResponse.text || "");

      if (!blueprint.timeline || !Array.isArray(blueprint.timeline)) {
        blueprint.timeline = [];
      }
      if (blueprint.timeline.filter((e: any) => e.type === "video").length === 0) {
        blueprint.timeline.unshift({ type: "video", src: videoUrl, start: 0, end: duration, playbackRate: 1.0 });
      }

      return { blueprint, analysis };
    } catch (err) {
      console.error("[videoBlueprintService] generateContentAwareBlueprint failed:", err);
      const fallback = await videoBlueprintService.generateBlueprintFromPrompt(videoUrl, duration, prompt);
      return { blueprint: fallback, analysis };
    }
  },
};
