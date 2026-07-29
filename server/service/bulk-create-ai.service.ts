import {
  BULK_FONT_FAMILIES,
  type IBulkBackground,
  type IBulkCanvas,
  type IBulkLayer,
} from "../interface/bulk-create.interface";
import { assertSafeBulkImageSource } from "./bulk-create-renderer.service";
import {
  openrouterChat,
  type OpenRouterContentPart,
  type OpenRouterMessage,
} from "./openrouter.service";
import { API_COSTS, walletService } from "./wallet.service";

type BulkAiActor = {
  id: string;
  companyCode: string;
};

type BulkAiAttachment = {
  type: "image" | "document";
  name: string;
  url?: string;
  text?: string;
};

type BulkAiHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

type BulkAiSceneInput = {
  prompt: string;
  scene: {
    sceneVersion?: number;
    canvas: IBulkCanvas;
    background: IBulkBackground;
    layers: IBulkLayer[];
  };
  values: Record<string, string>;
  attachments?: BulkAiAttachment[];
  history?: BulkAiHistoryMessage[];
};

type BulkAiSceneResult = {
  reply: string;
  scene: {
    sceneVersion: number;
    canvas: IBulkCanvas;
    background: IBulkBackground;
    layers: IBulkLayer[];
  };
  values: Record<string, string>;
};

const ALLOWED_GRADIENTS = [
  ["#ffffff", "#e0e7ff"],
  ["#172554", "#38bdf8"],
  ["#fb923c", "#a21caf"],
  ["#065f46", "#bef264"],
  ["#020617", "#f59e0b"],
  ["#fce7f3", "#e0f2fe"],
  ["#22d3ee", "#7c3aed"],
  ["#020617", "#0e7490"],
] as const;

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const FONT_SET = new Set<string>(BULK_FONT_FAMILIES);

function clamp(value: unknown, minimum: number, maximum: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function stringValue(value: unknown, fallback = "", maxLength = 14_000_000) {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function colorValue(value: unknown, fallback: string) {
  const candidate = stringValue(value);
  return HEX_COLOR.test(candidate) ? candidate.toLowerCase() : fallback;
}

function parseJsonObject(text: string) {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("AI không trả về bố cục hợp lệ.");
    return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
  }
}

function collectAllowedImages(input: BulkAiSceneInput) {
  const images = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) return;
    const source = value.trim();
    assertSafeBulkImageSource(source);
    images.add(source);
  };

  if (input.scene.background.type === "image") add(input.scene.background.imageUrl);
  input.scene.layers.forEach((layer) => {
    if (layer.type !== "image") return;
    add(layer.defaultValue);
    add(input.values[layer.id]);
    add(input.values[layer.fieldName]);
  });
  input.attachments?.forEach((attachment) => {
    if (attachment.type === "image") add(attachment.url);
  });
  return images;
}

function normalizeBackground(
  raw: unknown,
  current: IBulkBackground,
  allowedImages: Set<string>
): IBulkBackground {
  if (!raw || typeof raw !== "object") return current;
  const candidate = raw as Record<string, unknown>;
  if (candidate.type === "image") {
    const imageUrl = stringValue(candidate.imageUrl).trim();
    return imageUrl && allowedImages.has(imageUrl) ? { type: "image", imageUrl } : current;
  }
  if (candidate.type === "gradient") {
    const colors = Array.isArray(candidate.colors)
      ? candidate.colors.map((color) => stringValue(color).toLowerCase())
      : [];
    const allowed = ALLOWED_GRADIENTS.find(
      (palette) => palette[0] === colors[0] && palette[1] === colors[1]
    );
    return allowed ? { type: "gradient", colors: [...allowed] } : current;
  }
  if (candidate.type === "color") {
    return { type: "color", color: colorValue(candidate.color, "#ffffff") };
  }
  return current;
}

function normalizeLayer(
  raw: unknown,
  current: IBulkLayer | undefined,
  index: number,
  allowedImages: Set<string>
): IBulkLayer | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const type = candidate.type === "text" || candidate.type === "image"
    ? candidate.type
    : current?.type;
  if (!type) return null;

  const id = stringValue(candidate.id, current?.id || `ai-layer-${Date.now()}-${index}`, 100).trim();
  if (!id) return null;
  const width = clamp(candidate.width, 1, 100, current?.width || (type === "text" ? 80 : 40));
  const height = clamp(candidate.height, 1, 100, current?.height || (type === "text" ? 12 : 40));
  const defaultValue = stringValue(
    candidate.defaultValue,
    current?.defaultValue || "",
    type === "text" ? 10_000 : 14_000_000
  );
  const safeDefaultValue = type === "image" && defaultValue && !allowedImages.has(defaultValue)
    ? current?.defaultValue || ""
    : defaultValue;

  return {
    ...(current || {}),
    id,
    type,
    fieldName: stringValue(candidate.fieldName, current?.fieldName || (type === "text" ? "Nội dung" : "Hình ảnh"), 100).trim()
      || (type === "text" ? "Nội dung" : "Hình ảnh"),
    x: clamp(candidate.x, 0, 100 - width, Math.min(current?.x || 0, 100 - width)),
    y: clamp(candidate.y, 0, 100 - height, Math.min(current?.y || 0, 100 - height)),
    width,
    height,
    rotation: clamp(candidate.rotation, -360, 360, current?.rotation || 0),
    zIndex: Math.round(clamp(candidate.zIndex, 0, 1000, current?.zIndex ?? index)),
    locked: typeof candidate.locked === "boolean" ? candidate.locked : current?.locked || false,
    fit: candidate.fit === "cover" || candidate.fit === "contain"
      ? candidate.fit
      : current?.fit || "contain",
    ...(type === "text" ? {
      fontSize: clamp(candidate.fontSize, 8, 300, current?.fontSize || 60),
      fontFamily: FONT_SET.has(stringValue(candidate.fontFamily))
        ? stringValue(candidate.fontFamily)
        : current?.fontFamily || "Be Vietnam Pro",
      fontWeight: [100, 200, 300, 400, 500, 600, 700, 800, 900].includes(Number(candidate.fontWeight))
        ? Number(candidate.fontWeight)
        : current?.fontWeight || 700,
      fontStyle: candidate.fontStyle === "italic" ? "italic" as const : current?.fontStyle || "normal" as const,
      color: colorValue(candidate.color, current?.color || "#111827"),
      textAlign: candidate.textAlign === "center" || candidate.textAlign === "right"
        ? candidate.textAlign
        : candidate.textAlign === "left"
          ? "left"
          : current?.textAlign || "left",
      textDecoration: candidate.textDecoration === "underline" || candidate.textDecoration === "line-through"
        ? candidate.textDecoration
        : "none" as const,
      textTransform: candidate.textTransform === "uppercase"
        || candidate.textTransform === "lowercase"
        || candidate.textTransform === "capitalize"
        ? candidate.textTransform
        : "none" as const,
      letterSpacing: clamp(candidate.letterSpacing, -5, 30, current?.letterSpacing || 0),
      lineHeight: clamp(candidate.lineHeight, 0.8, 3, current?.lineHeight || 1.2),
    } : {}),
    defaultValue: safeDefaultValue,
  };
}

function normalizeResult(
  raw: Record<string, unknown>,
  input: BulkAiSceneInput,
  allowedImages: Set<string>
): BulkAiSceneResult {
  const rawScene = raw.scene && typeof raw.scene === "object"
    ? raw.scene as Record<string, unknown>
    : raw;
  const rawCanvas = rawScene.canvas && typeof rawScene.canvas === "object"
    ? rawScene.canvas as Record<string, unknown>
    : {};
  const canvas = {
    width: Math.round(clamp(rawCanvas.width, 320, 4096, input.scene.canvas.width)),
    height: Math.round(clamp(rawCanvas.height, 320, 4096, input.scene.canvas.height)),
  };
  const deletedLayerIds = new Set(
    Array.isArray(raw.deletedLayerIds)
      ? raw.deletedLayerIds.map((id) => stringValue(id, "", 100)).filter(Boolean)
      : []
  );
  const currentById = new Map(input.scene.layers.map((layer) => [layer.id, layer]));
  const normalizedReturned: IBulkLayer[] = [];
  const returnedIds = new Set<string>();
  const rawLayers = Array.isArray(rawScene.layers) ? rawScene.layers : [];

  rawLayers.slice(0, 20).forEach((rawLayer, index) => {
    const rawCandidate = rawLayer && typeof rawLayer === "object"
      ? rawLayer as Record<string, unknown>
      : {};
    const rawId = stringValue(rawCandidate.id, "", 100);
    const rawFieldName = stringValue(rawCandidate.fieldName, "", 100).trim().toLocaleLowerCase("vi-VN");
    const current = currentById.get(rawId) || input.scene.layers.find((layer) =>
      !returnedIds.has(layer.id)
      && layer.type === rawCandidate.type
      && layer.fieldName.trim().toLocaleLowerCase("vi-VN") === rawFieldName
    );
    const normalizedCandidate = current && rawId !== current.id
      ? { ...rawCandidate, id: current.id }
      : rawCandidate;
    const layer = normalizeLayer(normalizedCandidate, current, index, allowedImages);
    if (!layer || returnedIds.has(layer.id) || deletedLayerIds.has(layer.id)) return;
    normalizedReturned.push(layer);
    returnedIds.add(layer.id);
  });

  const preserved = input.scene.layers.filter(
    (layer) => !returnedIds.has(layer.id) && !deletedLayerIds.has(layer.id)
  );
  const layers = [...normalizedReturned, ...preserved].slice(0, 20)
    .map((layer, index) => ({ ...layer, zIndex: index }));

  const rawValues = raw.values && typeof raw.values === "object"
    ? raw.values as Record<string, unknown>
    : {};
  const values: Record<string, string> = {};
  layers.forEach((layer) => {
    const proposed = stringValue(rawValues[layer.id], input.values[layer.id] || layer.defaultValue || "");
    values[layer.id] = layer.type === "image" && proposed && !allowedImages.has(proposed)
      ? input.values[layer.id] || layer.defaultValue || ""
      : proposed;
  });

  return {
    reply: stringValue(raw.reply, "Đã cập nhật bố cục trên trang hiện tại.", 1_000).trim()
      || "Đã cập nhật bố cục trên trang hiện tại.",
    scene: {
      sceneVersion: 2,
      canvas,
      background: normalizeBackground(rawScene.background, input.scene.background, allowedImages),
      layers,
    },
    values,
  };
}

function buildVisionMessage(input: BulkAiSceneInput, allowedImages: Set<string>): OpenRouterContentPart[] {
  const parts: OpenRouterContentPart[] = [{
    type: "text",
    text: [
      `Yêu cầu mới nhất: ${input.prompt}`,
      "Scene/form hiện tại (đây là nguồn dữ liệu bắt buộc phải dựa vào):",
      JSON.stringify({
        scene: input.scene,
        values: input.values,
      }),
    ].join("\n\n"),
  }];

  input.attachments?.forEach((attachment) => {
    if (attachment.type === "document" && attachment.text) {
      parts.push({
        type: "text",
        text: `Tài liệu tham chiếu "${attachment.name}":\n${attachment.text}`,
      });
    }
    if (attachment.type === "image" && attachment.url) {
      parts.push({
        type: "text",
        text: `Ảnh đính kèm "${attachment.name}". Có thể dùng đúng URL này trong background.imageUrl hoặc values của layer ảnh: ${attachment.url}`,
      });
      parts.push({ type: "image_url", image_url: { url: attachment.url } });
    }
  });

  const attachedUrls = new Set(
    input.attachments?.filter((item) => item.type === "image").map((item) => item.url) || []
  );
  [...allowedImages].filter((url) => !attachedUrls.has(url)).slice(0, 6).forEach((url) => {
    parts.push({ type: "text", text: `Ảnh đang có trong form hiện tại: ${url}` });
    parts.push({ type: "image_url", image_url: { url } });
  });
  return parts;
}

export const bulkCreateAiService = {
  async updateScene(actor: BulkAiActor, input: BulkAiSceneInput): Promise<BulkAiSceneResult> {
    const allowedImages = collectAllowedImages(input);
    await walletService.checkBalance(actor.id, API_COSTS.AI_HTML_CHAT);

    const history = (input.history || []).slice(-10).map((message) => ({
      role: message.role,
      content: message.content.slice(0, 4_000),
    })) as OpenRouterMessage[];
    const response = await openrouterChat({
      model: process.env.AI_HTML_MODEL || "google/gemini-2.5-flash",
      temperature: 0.25,
      jsonMode: true,
      maxRetries: 2,
      maxTokens: 10_000,
      timeoutMs: 45_000,
      responseSchema: {
        reply: "string",
        scene: {
          canvas: { width: "number", height: "number" },
          background: {
            type: "color | gradient | image",
            color: "optional #RRGGBB",
            colors: "optional [#RRGGBB, #RRGGBB]",
            imageUrl: "optional exact supplied image URL",
          },
          layers: "complete array of editable text/image layers",
        },
        values: "object keyed by layer id",
        deletedLayerIds: "array of existing layer ids intentionally removed",
      },
      messages: [
        {
          role: "system",
          content: `Bạn là art director điều khiển trình biên tập thiết kế có cấu trúc. Không trả HTML/CSS và không trả ảnh phẳng. Đầu ra phải là scene gồm canvas, background và tối đa 20 layer text/image để người dùng tiếp tục kéo, thả, đổi kích thước và sửa chữ.

FORM HIỆN TẠI LÀ NGUỒN SỰ THẬT:
- Mọi lần chỉnh sửa phải bắt đầu từ scene/form hiện tại được gửi trong tin nhắn cuối.
- Giữ nguyên id, type, nội dung, ảnh, vị trí và style của mọi layer không liên quan đến yêu cầu mới nhất.
- Chỉ thêm layer khi thực sự cần. Chỉ xóa layer khi người dùng yêu cầu và phải ghi id vào deletedLayerIds.
- Luôn trả lại toàn bộ layer đã thêm hoặc chỉnh sửa; server sẽ tự giữ các layer không được nhắc tới.
- values chứa nội dung thật theo id layer. Không tự bịa giá, ưu đãi, số liệu hoặc tuyên bố.

QUY TẮC BỐ CỤC:
- x, y, width, height đều là phần trăm 0-100 và layer phải nằm trọn trong canvas.
- Headline rõ, tối đa 2-3 dòng; lề an toàn 6-8%; phân cấp thị giác và tương phản tốt.
- Font chỉ dùng một trong: ${BULK_FONT_FAMILIES.join(", ")}.
- Background gradient chỉ được dùng đúng một trong các cặp: ${ALLOWED_GRADIENTS.map((item) => item.join(" + ")).join("; ")}.
- Chỉ được dùng URL ảnh có sẵn trong form hoặc ảnh đính kèm. Khi người dùng yêu cầu dùng ảnh làm nền, đặt đúng URL đó vào background.imageUrl, không tạo nền khác.
- Khi có ảnh đầu vào, phải quan sát nội dung ảnh để quyết định cover/contain và bố cục chữ phù hợp.
- Nếu yêu cầu chỉ đổi một phần (ví dụ nền, headline, màu chữ), tuyệt đối không thiết kế lại các phần khác.`,
        },
        ...history,
        {
          role: "user",
          content: buildVisionMessage(input, allowedImages),
        },
      ],
    });

    const result = normalizeResult(parseJsonObject(response.text), input, allowedImages);
    await walletService.deductBalance(
      actor.id,
      API_COSTS.AI_HTML_CHAT,
      "Chi phí AI chỉnh sửa bố cục thiết kế"
    );
    return result;
  },
};
