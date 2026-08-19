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
  operations: Array<
    | { op: "add"; layerId: string; label: string }
    | { op: "update"; layerId: string; label: string; fields: string[] }
    | { op: "remove"; layerId: string; label: string }
    | { op: "reorder"; layerId: string; label: string; zIndex: number }
    | { op: "replace-background"; label: string }
    | { op: "resize-canvas"; label: string; width: number; height: number }
  >;
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

function optionalColorValue(value: unknown, fallback?: string) {
  const candidate = stringValue(value);
  if (HEX_COLOR.test(candidate)) return candidate.toLowerCase();
  return fallback && HEX_COLOR.test(fallback) ? fallback.toLowerCase() : undefined;
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
  const resolvedFontSize = type === "text"
    ? clamp(candidate.fontSize, 8, 300, current?.fontSize || 60)
    : undefined;
  const layerKind = type === "text" && (
    candidate.layerKind === "text"
    || candidate.layerKind === "shape"
    || candidate.layerKind === "badge"
    || candidate.layerKind === "cta"
    || candidate.layerKind === "icon"
  )
    ? candidate.layerKind
    : type === "text"
      ? current?.layerKind || "text"
      : undefined;

  return {
    ...(current || {}),
    id,
    type,
    layerKind,
    groupId: stringValue(candidate.groupId, current?.groupId || "", 100) || undefined,
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
      fontSize: resolvedFontSize,
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
      autoFit: typeof candidate.autoFit === "boolean"
        ? candidate.autoFit
        : current?.autoFit ?? true,
      minFontSize: clamp(
        candidate.minFontSize,
        8,
        resolvedFontSize || 300,
        Math.min(current?.minFontSize || 12, resolvedFontSize || 300)
      ),
      maxLines: candidate.maxLines === undefined && current?.maxLines === undefined
        ? undefined
        : Math.round(clamp(candidate.maxLines, 1, 20, current?.maxLines || 3)),
    } : {}),
    fillColor: optionalColorValue(candidate.fillColor, current?.fillColor),
    borderColor: optionalColorValue(candidate.borderColor, current?.borderColor),
    borderWidth: clamp(candidate.borderWidth, 0, 100, current?.borderWidth || 0),
    borderRadius: clamp(candidate.borderRadius, 0, 9999, current?.borderRadius || 0),
    opacity: clamp(candidate.opacity, 0.01, 1, current?.opacity || 1),
    padding: clamp(candidate.padding, 0, 500, current?.padding || 0),
    defaultValue: safeDefaultValue,
  };
}

type AppliedOperation = BulkAiSceneResult["operations"][number];

function describeSceneDiff(
  input: BulkAiSceneInput,
  scene: BulkAiSceneResult["scene"],
  values: Record<string, string>
): AppliedOperation[] {
  const operations: AppliedOperation[] = [];
  if (
    scene.canvas.width !== input.scene.canvas.width
    || scene.canvas.height !== input.scene.canvas.height
  ) {
    operations.push({
      op: "resize-canvas",
      label: `Đổi kích thước canvas thành ${scene.canvas.width}×${scene.canvas.height}`,
      width: scene.canvas.width,
      height: scene.canvas.height,
    });
  }
  if (JSON.stringify(scene.background) !== JSON.stringify(input.scene.background)) {
    operations.push({ op: "replace-background", label: "Thay đổi nền trang" });
  }

  const currentById = new Map(input.scene.layers.map((layer) => [layer.id, layer]));
  const nextById = new Map(scene.layers.map((layer) => [layer.id, layer]));
  input.scene.layers.forEach((layer) => {
    if (!nextById.has(layer.id)) {
      operations.push({ op: "remove", layerId: layer.id, label: `Xóa ${layer.fieldName}` });
    }
  });
  scene.layers.forEach((layer) => {
    const current = currentById.get(layer.id);
    if (!current) {
      operations.push({ op: "add", layerId: layer.id, label: `Thêm ${layer.fieldName}` });
      return;
    }
    const fields = Object.keys(layer).filter((field) =>
      JSON.stringify(layer[field as keyof IBulkLayer])
      !== JSON.stringify(current[field as keyof IBulkLayer])
    );
    if (values[layer.id] !== input.values[layer.id]) fields.push("value");
    if (fields.length > 0) {
      operations.push({
        op: "update",
        layerId: layer.id,
        label: `Chỉnh ${layer.fieldName}`,
        fields: [...new Set(fields)],
      });
    }
  });
  return operations.slice(0, 50);
}

function normalizeOperationResult(
  raw: Record<string, unknown>,
  input: BulkAiSceneInput,
  allowedImages: Set<string>
): BulkAiSceneResult | null {
  if (!Array.isArray(raw.operations)) return null;

  let canvas = { ...input.scene.canvas };
  let background = { ...input.scene.background };
  let layers = input.scene.layers.map((layer) => ({ ...layer }));
  const values = { ...input.values };
  const applied: AppliedOperation[] = [];

  raw.operations.slice(0, 50).forEach((item, operationIndex) => {
    if (!item || typeof item !== "object") return;
    const operation = item as Record<string, unknown>;
    const op = stringValue(operation.op, "", 40);
    const layerId = stringValue(operation.layerId, "", 100);

    if (op === "replace-background") {
      const candidate = operation.value || operation.background;
      const nextBackground = normalizeBackground(candidate, background, allowedImages);
      if (JSON.stringify(nextBackground) === JSON.stringify(background)) return;
      background = nextBackground;
      applied.push({ op, label: "Thay đổi nền trang" });
      return;
    }

    if (op === "resize-canvas") {
      const candidate = operation.value && typeof operation.value === "object"
        ? operation.value as Record<string, unknown>
        : operation;
      const nextCanvas = {
        width: Math.round(clamp(candidate.width, 320, 4096, canvas.width)),
        height: Math.round(clamp(candidate.height, 320, 4096, canvas.height)),
      };
      if (nextCanvas.width === canvas.width && nextCanvas.height === canvas.height) return;
      canvas = nextCanvas;
      applied.push({
        op,
        label: `Đổi kích thước canvas thành ${canvas.width}×${canvas.height}`,
        width: canvas.width,
        height: canvas.height,
      });
      return;
    }

    if (op === "add") {
      if (layers.length >= 20) return;
      const rawLayer = operation.layer && typeof operation.layer === "object"
        ? operation.layer as Record<string, unknown>
        : operation.value && typeof operation.value === "object"
          ? operation.value as Record<string, unknown>
          : {};
      const requestedId = stringValue(rawLayer.id, "", 100);
      const uniqueId = requestedId && !layers.some((layer) => layer.id === requestedId)
        ? requestedId
        : `ai-layer-${Date.now()}-${operationIndex}`;
      const layer = normalizeLayer(
        { ...rawLayer, id: uniqueId },
        undefined,
        layers.length,
        allowedImages
      );
      if (!layer) return;
      layers.push(layer);
      const proposedValue = stringValue(
        operation.valueText ?? operation.content ?? operation.layerValue,
        layer.defaultValue || ""
      );
      values[layer.id] = layer.type === "image" && proposedValue && !allowedImages.has(proposedValue)
        ? layer.defaultValue || ""
        : proposedValue;
      applied.push({ op, layerId: layer.id, label: `Thêm ${layer.fieldName}` });
      return;
    }

    const layerIndex = layers.findIndex((layer) => layer.id === layerId);
    if (layerIndex < 0) return;
    const current = layers[layerIndex];

    if (op === "remove") {
      layers.splice(layerIndex, 1);
      delete values[layerId];
      applied.push({ op, layerId, label: `Xóa ${current.fieldName}` });
      return;
    }

    if (op === "reorder") {
      const zIndex = Math.round(clamp(operation.zIndex, 0, 1000, current.zIndex));
      if (zIndex === current.zIndex) return;
      layers[layerIndex] = { ...current, zIndex };
      applied.push({ op, layerId, label: `Đổi thứ tự ${current.fieldName}`, zIndex });
      return;
    }

    if (op === "update") {
      const changes = operation.changes && typeof operation.changes === "object"
        ? operation.changes as Record<string, unknown>
        : {};
      const normalized = normalizeLayer(
        { ...current, ...changes, id: current.id, type: current.type },
        current,
        layerIndex,
        allowedImages
      );
      if (!normalized) return;
      const changedFields = Object.keys(changes).filter((field) =>
        JSON.stringify(normalized[field as keyof IBulkLayer])
        !== JSON.stringify(current[field as keyof IBulkLayer])
      );
      if (operation.value !== undefined) {
        const proposedValue = stringValue(operation.value, values[layerId] || normalized.defaultValue || "");
        const safeValue = normalized.type === "image" && proposedValue && !allowedImages.has(proposedValue)
          ? values[layerId] || normalized.defaultValue || ""
          : proposedValue;
        if (safeValue !== values[layerId]) {
          values[layerId] = safeValue;
          changedFields.push("value");
        }
      }
      if (changedFields.length === 0) return;
      layers[layerIndex] = normalized;
      applied.push({
        op,
        layerId,
        label: `Chỉnh ${normalized.fieldName}`,
        fields: [...new Set(changedFields)],
      });
    }
  });

  layers = layers.slice(0, 20)
    .sort((left, right) => left.zIndex - right.zIndex)
    .map((layer, index) => ({ ...layer, zIndex: index }));
  const normalizedValues = Object.fromEntries(layers.map((layer) => [
    layer.id,
    values[layer.id] || layer.defaultValue || "",
  ]));
  return {
    reply: stringValue(raw.reply, "Đã cập nhật trang theo yêu cầu.", 1_000).trim()
      || "Đã cập nhật trang theo yêu cầu.",
    scene: {
      sceneVersion: 2,
      canvas,
      background,
      layers,
    },
    values: normalizedValues,
    operations: applied,
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

  const scene: BulkAiSceneResult["scene"] = {
    sceneVersion: 2,
    canvas,
    background: normalizeBackground(rawScene.background, input.scene.background, allowedImages),
    layers,
  };
  return {
    reply: stringValue(raw.reply, "Đã cập nhật bố cục trên trang hiện tại.", 1_000).trim()
      || "Đã cập nhật bố cục trên trang hiện tại.",
    scene,
    values,
    operations: describeSceneDiff(input, scene, values),
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
        operations: [{
          op: "add | update | remove | reorder | replace-background | resize-canvas",
          layerId: "existing layer id for update/remove/reorder",
          changes: "only changed layer fields for update",
          value: "new row value for update, or background/canvas object",
          layer: "complete new layer for add",
          layerValue: "content of a newly added layer",
          zIndex: "target order for reorder",
        }],
      },
      messages: [
        {
          role: "system",
          content: `Bạn là art director điều khiển trình biên tập thiết kế có cấu trúc. Không trả HTML/CSS, không trả ảnh phẳng và không dựng lại toàn bộ scene. Đầu ra chỉ gồm reply và danh sách operations tối thiểu để người dùng tiếp tục kéo, thả, đổi kích thước và sửa chữ.

FORM HIỆN TẠI LÀ NGUỒN SỰ THẬT:
- Mọi lần chỉnh sửa phải bắt đầu từ scene/form hiện tại được gửi trong tin nhắn cuối.
- Giữ nguyên id, type, nội dung, ảnh, vị trí và style của mọi layer không liên quan đến yêu cầu mới nhất.
- Chỉ trả operations cần thiết, không trả lại toàn bộ scene.
- update phải dùng đúng layerId hiện tại và changes chỉ chứa trường thực sự cần đổi. Nội dung mới đặt trong value.
- add phải có layer hoàn chỉnh và nội dung đặt trong layerValue. remove/reorder chỉ dùng layerId đang tồn tại.
- Không có operation nào đồng nghĩa giữ nguyên phần đó. Không tự bịa giá, ưu đãi, số liệu hoặc tuyên bố.

QUY TẮC BỐ CỤC:
- x, y, width, height đều là phần trăm 0-100 và layer phải nằm trọn trong canvas.
- Headline rõ, tối đa 2-3 dòng; lề an toàn 6-8%; phân cấp thị giác và tương phản tốt.
- Layer chữ nên bật autoFit:true, minFontSize hợp lý và đặt maxLines 2-3 cho headline, 3-6 cho nội dung phụ.
- Có thể dùng layerKind text, shape, badge, cta hoặc icon. Shape dùng type:text, layerKind:shape và layerValue rỗng; badge/cta/icon vẫn là layer chữ chỉnh sửa được.
- fillColor, borderColor là màu hex; borderWidth 0-30; borderRadius 0-100; opacity 0.05-1; padding 0-80.
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

    const parsed = parseJsonObject(response.text);
    const result = normalizeOperationResult(parsed, input, allowedImages)
      || normalizeResult(parsed, input, allowedImages);
    await walletService.deductBalance(
      actor.id,
      API_COSTS.AI_HTML_CHAT,
      "Chi phí AI chỉnh sửa bố cục thiết kế"
    );
    return result;
  },
};
