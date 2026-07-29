import mongoose from "mongoose";
import { broadcastEvent } from "../../socket";
import { CreativeImageProjectModel } from "../../model/creative-image-project.model";
import { CreativeImageRenderModel } from "../../model/creative-image-render.model";
import { assertSafeBulkImageSource } from "../bulk-create-renderer.service";
import { CREATIVE_IMAGE_TEMPLATES, getCreativeImageTemplate } from "../../../src/creative-image/template-registry";
import { CREATIVE_IMAGE_CANVASES, type CreativeImageFormat } from "../../../src/creative-image/types";
import { renderAiHtmlImage, renderCreativeImage } from "./render.service";
import { openrouterChat, type OpenRouterContentPart, type OpenRouterMessage } from "../openrouter.service";
import { API_COSTS, walletService } from "../wallet.service";

export type CreativeActor = { id: string; companyCode: string };
type CanvasInput = { format: CreativeImageFormat; width: number; height: number };
type ProjectInput = { templateId: string; canvas: CanvasInput; data: Record<string, string> };
type Snapshot = { templateId: string; templateVersion: number; canvas: CanvasInput; data: Record<string, string> };
const AI_HTML_TEMPLATE_ID = "ai-html-v1";

function assertObjectId(id: string, label: string) {
  if (!mongoose.isValidObjectId(id)) throw new Error(`${label} không hợp lệ.`);
}

function normalizeCanvas(canvas: CanvasInput) {
  const preset = CREATIVE_IMAGE_CANVASES[canvas.format];
  if (!preset || preset.width !== canvas.width || preset.height !== canvas.height) {
    throw new Error("Kích thước thiết kế không thuộc preset được hỗ trợ.");
  }
  return preset;
}

function normalizeData(templateId: string, input: Record<string, string>) {
  const template = getCreativeImageTemplate(templateId);
  if (!template) throw new Error("Mẫu thiết kế không tồn tại hoặc đã ngừng hỗ trợ.");
  const data: Record<string, string> = {};
  for (const field of template.fields) {
    const value = String(input[field.key] || "").trim();
    if (field.type === "image") {
      if (value) assertSafeBulkImageSource(value);
      data[field.key] = value;
      continue;
    }
    if (field.type === "color") {
      if (value && !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`${field.label} phải là mã màu HEX hợp lệ.`);
      data[field.key] = value || template.defaults[field.key];
      continue;
    }
    if (field.maxLength && value.length > field.maxLength) throw new Error(`${field.label} vượt quá ${field.maxLength} ký tự.`);
    data[field.key] = value || template.defaults[field.key] || "";
  }
  return { template, data };
}

function normalizePrompt(prompt: unknown) {
  const value = String(prompt || "").trim();
  if (value.length < 10) throw new Error("Prompt thiết kế cần có ít nhất 10 ký tự.");
  if (value.length > 4_000) throw new Error("Prompt thiết kế không được vượt quá 4.000 ký tự.");
  return value;
}

function parseAiHtml(text: string, allowedImageUrls: Set<string>, requireBackgroundImage: boolean) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI không trả về được HTML hợp lệ.");
  }
  const html = parsed && typeof parsed === "object" && "html" in parsed ? String((parsed as { html?: unknown }).html || "").trim() : "";
  const reply = parsed && typeof parsed === "object" && "reply" in parsed
    ? String((parsed as { reply?: unknown }).reply || "").trim()
    : "Mình đã cập nhật thiết kế theo yêu cầu.";
  const imageAnalysis = parsed && typeof parsed === "object" && "imageAnalysis" in parsed
    ? String((parsed as { imageAnalysis?: unknown }).imageAnalysis || "").trim()
    : "";
  if (!html || html.length > 120_000 || /<\s*(script|iframe|object|embed|form|base|link|meta)\b/i.test(html) || /\bon[a-z]+\s*=/i.test(html) || /\burl\s*\(/i.test(html)) {
    throw new Error("HTML AI chứa thành phần không được phép.");
  }
  let usedAttachedImage = false;
  for (const source of html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const value = source[1].trim();
    if (value && !value.startsWith("#") && !allowedImageUrls.has(value)) {
      throw new Error("HTML AI sử dụng tài nguyên không nằm trong ảnh đã đính kèm.");
    }
    if (allowedImageUrls.has(value)) usedAttachedImage = true;
  }
  if (allowedImageUrls.size > 0 && imageAnalysis.length < 10) {
    throw new Error("AI chưa phân tích được ảnh đính kèm. Vui lòng thử lại.");
  }
  if (allowedImageUrls.size > 0 && !usedAttachedImage) {
    throw new Error("AI chưa đưa ảnh đính kèm vào thiết kế. Vui lòng thử lại.");
  }
  if (requireBackgroundImage) {
    const backgroundImageTag = [...html.matchAll(/<img\b[^>]*>/gi)]
      .map((match) => match[0])
      .find((tag) => [...allowedImageUrls].some((url) => tag.includes(url)));
    if (!backgroundImageTag || !/object-fit\s*:\s*cover/i.test(backgroundImageTag) || !/position\s*:\s*absolute/i.test(backgroundImageTag)) {
      throw new Error("AI chưa dùng ảnh đính kèm làm background phủ toàn khung. Vui lòng thử lại.");
    }
  }
  const detailedReply = imageAnalysis ? `${reply}\nĐã đọc ảnh: ${imageAnalysis}` : reply;
  return { html, reply: detailedReply.slice(0, 4_000) || "Mình đã cập nhật thiết kế theo yêu cầu." };
}

export type AiHtmlAttachment = { type: "image" | "document"; name: string; url?: string; text?: string };
type AiHtmlConversationMessage = { role: "user" | "assistant"; content: string; html?: string; attachments?: AiHtmlAttachment[] };

function normalizeAttachments(input: unknown): AiHtmlAttachment[] {
  if (!Array.isArray(input)) return [];
  if (input.length > 4) throw new Error("Có thể đính kèm tối đa 4 ảnh hoặc tài liệu.");
  return input.map((item) => {
    if (!item || typeof item !== "object") throw new Error("Tệp đính kèm không hợp lệ.");
    const value = item as Partial<AiHtmlAttachment>;
    const name = String(value.name || "").trim().slice(0, 200);
    if (!name) throw new Error("Tệp đính kèm cần có tên.");
    if (value.type === "image") {
      const url = String(value.url || "").trim();
      if (!url) throw new Error(`Ảnh "${name}" chưa có đường dẫn.`);
      assertSafeBulkImageSource(url);
      return { type: "image" as const, name, url };
    }
    if (value.type === "document") {
      const text = String(value.text || "").trim().slice(0, 20_000);
      if (!text) throw new Error(`Tài liệu "${name}" không có nội dung đọc được.`);
      return { type: "document" as const, name, text };
    }
    throw new Error(`Loại tệp "${name}" không được hỗ trợ.`);
  });
}

function conversationForModel(messages: AiHtmlConversationMessage[]) {
  const selected: AiHtmlConversationMessage[] = [];
  let total = 0;
  let includedLatestHtml = false;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (selected.length >= 8) break;
    const message = messages[index];
    const includeHtml = message.role === "assistant" && Boolean(message.html) && !includedLatestHtml;
    const rawContent = includeHtml ? `${message.content}\n\nHTML hiện tại:\n${message.html}` : message.content;
    const maxLength = includeHtml ? 45_000 : 4_000;
    const content = rawContent.slice(0, maxLength);
    const attachmentLength = (message.attachments || []).reduce((sum, attachment) => sum + (attachment.text?.length || 0) + (attachment.url?.length || 0), 0);
    if (selected.length >= 2 && total + content.length + attachmentLength > 60_000) break;
    selected.unshift({ role: message.role, content, html: message.html, attachments: message.attachments });
    total += content.length + attachmentLength;
    if (includeHtml) includedLatestHtml = true;
  }
  const latestImageMessage = [...messages].reverse().find((message) =>
    message.attachments?.some((attachment) => attachment.type === "image" && attachment.url)
  );
  const alreadyIncludesLatestImage = latestImageMessage
    ? selected.some((message) => message.attachments === latestImageMessage.attachments)
    : false;
  if (latestImageMessage && !alreadyIncludesLatestImage) {
    selected.unshift({
      role: latestImageMessage.role,
      content: latestImageMessage.content.slice(0, 4_000),
      attachments: latestImageMessage.attachments,
    });
  }
  return selected;
}

async function generateAiHtml(conversation: AiHtmlConversationMessage[], canvas: CanvasInput) {
  const allowedImageUrls = new Set(
    conversation.flatMap((message) => (message.attachments || [])
      .filter((attachment) => attachment.type === "image" && attachment.url)
      .map((attachment) => attachment.url as string))
  );
  const modelConversation = conversationForModel(conversation);
  const latestUserPrompt = [...conversation].reverse().find((message) => message.role === "user")?.content || "";
  const requireBackgroundImage = /(background|nền|làm nền|đặt nền|thay nền)/i.test(latestUserPrompt);
  const messages = modelConversation.map((message) => {
    if (message.role === "assistant" || !message.attachments?.length) {
      return { role: message.role, content: message.content };
    }
    const parts: OpenRouterContentPart[] = [{ type: "text", text: message.content }];
    for (const attachment of message.attachments) {
      if (attachment.type === "document" && attachment.text) {
        parts.push({ type: "text", text: `Tài liệu tham chiếu "${attachment.name}":\n${attachment.text}` });
      }
      if (attachment.type === "image" && attachment.url) {
        parts.push({ type: "text", text: `Ảnh tham chiếu "${attachment.name}". URL được phép dùng trực tiếp trong thẻ <img src="${attachment.url}">: ${attachment.url}` });
        parts.push({ type: "image_url", image_url: { url: attachment.url } });
      }
    }
    return { role: "user" as const, content: parts };
  });
  const response = await openrouterChat({
    model: process.env.AI_HTML_MODEL || "google/gemini-2.5-flash",
    temperature: 0.35,
    jsonMode: true,
    responseSchema: { reply: "string", imageAnalysis: "string", html: "string" },
    maxRetries: 2,
    maxTokens: 10_000,
    timeoutMs: 45_000,
    messages: [
      {
        role: "system",
        content: `Chuẩn hóa brief theo thứ tự: mục tiêu, đối tượng, headline, nội dung hỗ trợ, CTA, phong cách, màu sắc và tài sản đính kèm. Giữ nguyên chính xác nội dung người dùng cung cấp; không tự bịa giá, ưu đãi hoặc tuyên bố. Phần tử gốc phải có width:${canvas.width}px;height:${canvas.height}px;overflow:hidden. Bố cục cần phân cấp thị giác rõ, tương phản tốt, lề an toàn 6-8%, không tràn hoặc cắt chữ. Khi có ảnh đính kèm, dùng ảnh làm tham chiếu trực tiếp cho bố cục. Khi có tài liệu, chỉ lấy thông tin được nêu trong tài liệu.`,
      },
      {
        role: "system",
        content: `Bạn là art director làm việc theo hội thoại để tạo ảnh marketing bằng HTML/CSS. Trả về duy nhất JSON {"reply":"...", "html":"..."}. reply là câu trả lời ngắn bằng tiếng Việt: nói rõ đã chỉnh gì hoặc hỏi đúng một câu nếu brief còn thiếu. html luôn là toàn bộ fragment HTML/CSS mới nhất để chụp screenshot ${canvas.width}x${canvas.height}px, kể cả khi đang hỏi lại. Dùng inline CSS, không dùng script, iframe, form, link, meta, font hoặc tài nguyên bên ngoài, không dùng CSS url(). Tạo bố cục có phân cấp thị giác rõ, tương phản tốt và giữ nguyên nội dung người dùng yêu cầu. Có thể dùng gradient, shape CSS và emoji; không tự bịa URL ảnh.`,
      },
      {
        role: "system",
        content: `Yêu cầu chất lượng bắt buộc: thiết kế phải giống ấn phẩm marketing hoàn chỉnh, không phải bản nháp chữ trên nền màu. Headline tối đa 2-3 dòng, cỡ chữ không vượt quá 9% cạnh ngắn của canvas, line-height từ 1.05 đến 1.2 và khối chữ rộng tối đa 84% canvas. Mọi chữ phải nằm trọn trong khung, không được tràn ngang, cắt chữ hoặc che CTA. Dùng khoảng trắng, card, shape, viền hoặc gradient có chủ đích; không lạm dụng emoji. Nếu có ảnh đính kèm, trước tiên phải quan sát và mô tả ngắn nội dung thật của ảnh trong trường imageAnalysis, sau đó đưa chính ảnh đó vào bố cục bằng thẻ img với object-fit:contain hoặc object-fit:cover. URL ảnh đính kèm là ngoại lệ duy nhất được phép dùng làm tài nguyên ngoài. Không được thay logo/ảnh thật bằng emoji hoặc hình tròn giả. Nếu không có ảnh, trả imageAnalysis là chuỗi rỗng.`,
      },
      {
        role: "system",
        content: `Tin nhắn người dùng mới nhất luôn có ưu tiên cao nhất. Nếu người dùng yêu cầu dùng ảnh làm background/nền, phải giữ nguyên nội dung, chữ, CTA và cấu trúc hiện có; chỉ thay phần nền bằng chính ảnh đính kèm. Dùng thẻ <img> với URL ảnh đính kèm, position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index thấp nhất, sau đó đặt overlay và nội dung lên trên. Tuyệt đối không thay ảnh đó bằng gradient, màu nền mới, emoji hoặc ảnh tự bịa. Nếu người dùng chỉ yêu cầu thay nền thì không được tự viết lại nội dung marketing.`,
      },
      ...messages,
    ] as OpenRouterMessage[],
  });
  return parseAiHtml(response.text, allowedImageUrls, requireBackgroundImage);
}

function serialize(value: unknown) {
  if (value && typeof value === "object" && "toObject" in value && typeof value.toObject === "function") {
    return value.toObject();
  }
  return value;
}

export const creativeImageService = {
  listTemplates() {
    return CREATIVE_IMAGE_TEMPLATES;
  },

  async createProject(actor: CreativeActor, input: ProjectInput) {
    const canvas = normalizeCanvas(input.canvas);
    const { template, data } = normalizeData(input.templateId, input.data);
    return CreativeImageProjectModel.create({ userId: actor.id, companyCode: actor.companyCode, templateId: template.id, templateVersion: template.version, canvas, data });
  },

  async createAiHtmlProject(actor: CreativeActor, input: { canvas: CanvasInput; prompt: string; attachments?: AiHtmlAttachment[] }) {
    const canvas = normalizeCanvas(input.canvas);
    const prompt = normalizePrompt(input.prompt);
    const attachments = normalizeAttachments(input.attachments);
    await walletService.checkBalance(actor.id, API_COSTS.AI_HTML_CHAT);
    const conversation: AiHtmlConversationMessage[] = [{ role: "user", content: prompt, attachments }];
    const result = await generateAiHtml(conversation, canvas);
    conversation.push({ role: "assistant", content: result.reply, html: result.html });
    await walletService.deductBalance(actor.id, API_COSTS.AI_HTML_CHAT, "Chi phí trao đổi và dựng HTML bằng AI");
    return CreativeImageProjectModel.create({
      userId: actor.id,
      companyCode: actor.companyCode,
      templateId: AI_HTML_TEMPLATE_ID,
      templateVersion: 1,
      canvas,
      mode: "ai_html",
      prompt,
      html: result.html,
      conversation,
      data: { prompt, html: result.html },
    });
  },

  async sendAiHtmlMessage(actor: CreativeActor, projectId: string, message: string, inputAttachments?: AiHtmlAttachment[]) {
    const project = await this.getProject(actor, projectId);
    if (project.templateId !== AI_HTML_TEMPLATE_ID || project.mode === "template") {
      throw new Error("Bản thiết kế này không thuộc luồng AI HTML.");
    }
    const prompt = normalizePrompt(message);
    const attachments = normalizeAttachments(inputAttachments);
    const previous = project.conversation?.length
      ? project.conversation as AiHtmlConversationMessage[]
      : [
        project.prompt || String((project.data as Record<string, string>)?.prompt || ""),
        project.html || String((project.data as Record<string, string>)?.html || ""),
      ].filter(Boolean).map((content, index) => ({ role: index === 0 ? "user" as const : "assistant" as const, content }));
    const conversation: AiHtmlConversationMessage[] = [...previous, { role: "user", content: prompt, attachments }];
    await walletService.checkBalance(actor.id, API_COSTS.AI_HTML_CHAT);
    const result = await generateAiHtml(conversation, project.canvas as CanvasInput);
    conversation.push({ role: "assistant", content: result.reply, html: result.html });
    const trimmedConversation = conversation.slice(-40);
    await walletService.deductBalance(actor.id, API_COSTS.AI_HTML_CHAT, "Chi phí chỉnh sửa HTML bằng AI");
    const updated = await CreativeImageProjectModel.findOneAndUpdate(
      { _id: projectId, userId: actor.id, companyCode: actor.companyCode },
      { $set: { mode: "ai_html", prompt, html: result.html, conversation: trimmedConversation, data: { prompt, html: result.html } } },
      { new: true }
    ).lean();
    if (!updated) throw new Error("Không thể lưu phiên trao đổi AI HTML.");
    return updated;
  },

  async getProject(actor: CreativeActor, projectId: string) {
    assertObjectId(projectId, "Project");
    const project = await CreativeImageProjectModel.findOne({ _id: projectId, userId: actor.id, companyCode: actor.companyCode }).lean();
    if (!project) throw new Error("Không tìm thấy bản thiết kế hoặc bạn không có quyền truy cập.");
    return project;
  },

  async listAiHtmlProjects(actor: CreativeActor, limit: number) {
    return CreativeImageProjectModel.find({
      userId: actor.id,
      companyCode: actor.companyCode,
      $or: [{ mode: "ai_html" }, { templateId: AI_HTML_TEMPLATE_ID }],
    }).sort({ updatedAt: -1 }).limit(Math.min(Math.max(limit, 1), 30)).lean();
  },

  async updateProject(actor: CreativeActor, projectId: string, input: Partial<ProjectInput>) {
    const project = await this.getProject(actor, projectId);
    const templateId = input.templateId || project.templateId;
    const canvas = input.canvas ? normalizeCanvas(input.canvas) : project.canvas as CanvasInput;
    const { template, data } = normalizeData(templateId, input.data || project.data as Record<string, string>);
    const updated = await CreativeImageProjectModel.findOneAndUpdate(
      { _id: projectId, userId: actor.id, companyCode: actor.companyCode },
      { $set: { templateId: template.id, templateVersion: template.version, canvas, data } },
      { new: true }
    );
    if (!updated) throw new Error("Không thể cập nhật bản thiết kế.");
    return updated;
  },

  async createRender(actor: CreativeActor, projectId: string, idempotencyKey: string) {
    const project = await this.getProject(actor, projectId);
    const existing = await CreativeImageRenderModel.findOne({ projectId, idempotencyKey, userId: actor.id, companyCode: actor.companyCode });
    if (existing) return { render: existing, created: false };
    const snapshot: Snapshot = {
      templateId: project.templateId,
      templateVersion: project.templateVersion,
      canvas: project.canvas as CanvasInput,
      data: project.data as Record<string, string>,
    };
    try {
      const render = await CreativeImageRenderModel.create({ projectId, userId: actor.id, companyCode: actor.companyCode, templateSnapshot: snapshot, idempotencyKey });
      return { render, created: true };
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const duplicate = await CreativeImageRenderModel.findOne({ projectId, idempotencyKey, userId: actor.id, companyCode: actor.companyCode });
        if (duplicate) return { render: duplicate, created: false };
      }
      throw error;
    }
  },

  async getRender(actor: CreativeActor, renderId: string) {
    assertObjectId(renderId, "Lần xuất ảnh");
    const render = await CreativeImageRenderModel.findOne({ _id: renderId, userId: actor.id, companyCode: actor.companyCode }).lean();
    if (!render) throw new Error("Không tìm thấy lần xuất ảnh hoặc bạn không có quyền truy cập.");
    return render;
  },

  async listRenders(actor: CreativeActor, limit: number) {
    return CreativeImageRenderModel.find({ userId: actor.id, companyCode: actor.companyCode, status: "completed" }).sort({ createdAt: -1 }).limit(Math.min(Math.max(limit, 1), 60)).lean();
  },

  async recoverPendingRenders() {
    const staleBefore = new Date(Date.now() - 15 * 60 * 1000);
    await CreativeImageRenderModel.updateMany(
      { status: "rendering", updatedAt: { $lte: staleBefore } },
      { $set: { status: "queued", error: "Khôi phục tác vụ sau khi worker bị gián đoạn." } }
    );
    const pending = await CreativeImageRenderModel.find({ status: "queued" }).sort({ createdAt: 1 }).limit(200).select("_id").lean();
    return pending.map((render) => String(render._id));
  },

  async processRender(renderId: string) {
    const render = await CreativeImageRenderModel.findOneAndUpdate(
      { _id: renderId, status: "queued" },
      { $set: { status: "rendering", error: "" }, $inc: { attempts: 1 } },
      { new: true }
    ).lean();
    if (!render) return;
    broadcastEvent("creative_image_render_updated", { renderId, status: "rendering" });
    try {
      const snapshot = render.templateSnapshot as Snapshot;
      const outputUrl = snapshot.templateId === AI_HTML_TEMPLATE_ID
        ? await renderAiHtmlImage({ renderId, companyCode: render.companyCode, canvas: snapshot.canvas, html: snapshot.data.html || "" })
        : await renderCreativeImage({ renderId, companyCode: render.companyCode, templateId: snapshot.templateId, canvas: snapshot.canvas, data: snapshot.data });
      const completed = await CreativeImageRenderModel.findByIdAndUpdate(renderId, { $set: { status: "completed", outputUrl, completedAt: new Date(), error: "" } }, { new: true });
      await CreativeImageProjectModel.updateOne({ _id: render.projectId }, { $set: { lastRenderId: render._id } });
      broadcastEvent("creative_image_render_updated", { renderId, status: "completed", render: serialize(completed) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await CreativeImageRenderModel.updateOne({ _id: renderId, status: "rendering" }, { $set: { status: "queued", error: message } });
      broadcastEvent("creative_image_render_updated", { renderId, status: "queued", error: message });
      throw error;
    }
  },

  async failRender(renderId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = await CreativeImageRenderModel.findOneAndUpdate({ _id: renderId, status: { $in: ["queued", "rendering"] } }, { $set: { status: "failed", error: message } }, { new: true });
    broadcastEvent("creative_image_render_updated", { renderId, status: "failed", render: serialize(failed), error: message });
  },
};
