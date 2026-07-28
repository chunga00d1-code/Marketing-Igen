import mongoose from "mongoose";
import { CampaignAssetOrderModel } from "../model/campaign-asset-order.model";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { BulkTemplateModel } from "../model/bulk-template.model";
import { BulkRenderJobModel } from "../model/bulk-render-job.model";
import { BulkRenderItemModel } from "../model/bulk-render-item.model";
import { CampaignSheetRowModel } from "../model/campaign-content-sheet.model";
import { IBulkLayer } from "../interface/bulk-create.interface";
import { bulkCreateService } from "./bulk-create.service";
import { aiKnowledgeService } from "./ai-knowledge.service";
import { openrouterChat } from "./openrouter.service";
import {
  CampaignAssetOrderFormat,
  CampaignAssetOrderStatus,
  CampaignAssetRole,
  CampaignAssetSource,
  ICampaignAssetOrderAsset,
} from "../interface/campaign-asset-order.interface";

const MAX_ORDERS_PER_CAMPAIGN = 500;
const MAX_ASSETS_PER_ORDER = 20;
const terminalSlotStatuses = new Set(["published", "cancelled"]);

interface AssetOrderInput {
  slotId?: string;
  title: string;
  contentGroup?: string;
  shootingContent?: string;
  productionRequirements?: string;
  quantitySuggestion?: string;
  usageChannels?: string;
  source?: CampaignAssetSource;
  format?: CampaignAssetOrderFormat;
  aspectRatio?: "1:1" | "4:5" | "9:16" | "16:9";
  templateId?: string;
  headline?: string;
  subheadline?: string;
  cta?: string;
  visualBrief?: string;
  assets?: ICampaignAssetOrderAsset[];
}

function httpError(message: string, statusCode: number, code?: string) {
  const error = new Error(message) as Error & { statusCode?: number; code?: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function normalizeAssets(value: ICampaignAssetOrderAsset[] | undefined) {
  const seen = new Set<string>();
  return (value || []).slice(0, MAX_ASSETS_PER_ORDER).map((asset, index) => {
    const sourceUrl = cleanText(asset.sourceUrl, 14_000_000);
    if (!/^https?:\/\//i.test(sourceUrl)) {
      throw httpError("Mỗi ảnh hoặc video nguồn phải có liên kết HTTP/HTTPS hợp lệ.", 400, "INVALID_ASSET_URL");
    }
    const key = `${asset.role}:${sourceUrl}`;
    if (seen.has(key)) {
      throw httpError("Không thể thêm trùng cùng một tài nguyên vào Order.", 400, "DUPLICATE_ASSET");
    }
    seen.add(key);
    return {
      role: asset.role as CampaignAssetRole,
      sourceUrl,
      originalName: cleanText(asset.originalName, 500) || undefined,
      source: asset.source as CampaignAssetSource,
      order: Number.isFinite(Number(asset.order)) ? Math.max(0, Math.min(100, Number(asset.order))) : index,
    };
  });
}

function resolveStatus(input: Pick<AssetOrderInput, "format" | "headline" | "assets">): CampaignAssetOrderStatus {
  const assets = input.assets || [];
  if (!input.headline?.trim()) return "draft";
  if (assets.length === 0) return "needs_assets";
  if (input.format === "video" && !assets.some((asset) => asset.role === "video")) return "needs_assets";
  return "ready";
}

async function assertCampaign(companyCode: string, campaignId: string) {
  if (!mongoose.isValidObjectId(campaignId)) throw httpError("ID chiến dịch không hợp lệ.", 400);
  const campaign = await MarketingCampaignModel.findOne({ _id: campaignId, companyCode }).lean();
  if (!campaign) throw httpError("Không tìm thấy chiến dịch.", 404);
  return campaign;
}

async function assertSlot(companyCode: string, campaignId: string, slotId?: string) {
  if (!slotId) return null;
  if (!mongoose.isValidObjectId(slotId)) throw httpError("ID bài viết không hợp lệ.", 400);
  const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, companyCode, campaignId })
    .populate("integrationId", "displayName username")
    .lean();
  if (!slot) throw httpError("Bài viết không thuộc chiến dịch.", 404);
  if (terminalSlotStatuses.has(slot.status)) {
    throw httpError("Bài viết đã xuất bản hoặc đã hủy nên không thể tạo Order mới.", 409, "SLOT_READ_ONLY");
  }
  return slot;
}

function serializeOrder(order: Record<string, unknown>) {
  return {
    ...order,
    _id: String(order._id),
    campaignId: String(order.campaignId),
    slotId: order.slotId ? String(order.slotId) : undefined,
    templateId: order.templateId ? String(order.templateId) : undefined,
    bulkJobId: order.bulkJobId ? String(order.bulkJobId) : undefined,
  };
}

function integrationLabel(integration: unknown) {
  if (!integration || typeof integration !== "object") return "";
  const value = integration as { displayName?: unknown; username?: unknown };
  return String(value.displayName || value.username || "");
}

function integrationPageId(integration: unknown) {
  if (!integration || typeof integration !== "object") return undefined;
  const value = integration as { username?: unknown };
  const pageId = String(value.username || "").trim();
  return pageId || undefined;
}

function normalizeLookup(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function selectAsset(order: { assets: ICampaignAssetOrderAsset[] }, fieldName: string) {
  const normalized = normalizeLookup(fieldName);
  const imageIndex = /\b(\d{1,2})\b/.exec(normalized);
  const orderedImages = order.assets
    .filter((asset) => asset.role !== "logo" && asset.role !== "video")
    .sort((left, right) => left.order - right.order);
  if (imageIndex) {
    const indexed = orderedImages[Number(imageIndex[1]) - 1];
    if (indexed) return indexed;
  }
  const desiredRole: CampaignAssetRole = normalized.includes("logo")
    ? "logo"
    : /\b(2|secondary|phu)\b/.test(normalized)
      ? "secondary"
      : "primary";
  return order.assets.find((asset) => asset.role === desiredRole)
    || (desiredRole === "primary" ? orderedImages[0] : undefined);
}

function mapOrderToTemplate(order: {
  headline: string;
  subheadline?: string;
  cta?: string;
  visualBrief?: string;
  assets: ICampaignAssetOrderAsset[];
}, layers: IBulkLayer[]) {
  const values: Record<string, string> = {};
  const mapping: Array<{ layerId: string; fieldName: string; source: string; value: string }> = [];
  const missing: Array<{ layerId: string; fieldName: string; type: "text" | "image" }> = [];
  for (const layer of layers) {
    const name = normalizeLookup(layer.fieldName);
    let value = "";
    let source = "";
    if (layer.type === "image") {
      const asset = selectAsset(order, layer.fieldName);
      value = asset?.sourceUrl || layer.defaultValue || "";
      source = asset ? `${asset.role}: ${asset.originalName || "nguồn"}` : layer.defaultValue ? "giá trị mặc định" : "";
    } else if (/\b(cta|call to action)\b/.test(name)) {
      value = order.cta || layer.defaultValue || "";
      source = order.cta ? "CTA" : layer.defaultValue ? "giá trị mặc định" : "";
    } else if (/\b(subtitle|subheadline|chu phu|text phu|mo ta|description)\b/.test(name)) {
      value = order.subheadline || layer.defaultValue || "";
      source = order.subheadline ? "chữ phụ" : layer.defaultValue ? "giá trị mặc định" : "";
    } else if (/\b(brief|visual)\b/.test(name)) {
      value = order.visualBrief || layer.defaultValue || "";
      source = order.visualBrief ? "brief hình" : layer.defaultValue ? "giá trị mặc định" : "";
    } else if (/\b(title|headline|chu chinh|text chinh|main text)\b/.test(name)) {
      value = order.headline || layer.defaultValue || "";
      source = order.headline ? "chữ chính" : layer.defaultValue ? "giá trị mặc định" : "";
    } else {
      value = layer.defaultValue || "";
      source = layer.defaultValue ? "giá trị mặc định" : "";
    }
    if (!value) missing.push({ layerId: layer.id, fieldName: layer.fieldName, type: layer.type });
    values[layer.id] = value;
    mapping.push({ layerId: layer.id, fieldName: layer.fieldName, source, value });
  }
  return { values, mapping, missing };
}

async function migrateLegacySheetOrders(
  companyCode: string,
  campaignId: string,
  createdBy: string,
  slots: Array<{ _id: unknown; topicBrief?: string; mediaType?: string }>
) {
  const [rows, existing] = await Promise.all([
    CampaignSheetRowModel.find({ companyCode, campaignId }).select("slotId fields lastEditedBy").lean(),
    CampaignAssetOrderModel.find({ companyCode, campaignId, slotId: { $exists: true } }).select("slotId").lean(),
  ]);
  const existingSlotIds = new Set(existing.map((order) => String(order.slotId)));
  const slotMap = new Map(slots.map((slot) => [String(slot._id), slot]));
  const pending = rows.flatMap((row) => {
    const slotId = String(row.slotId);
    const slot = slotMap.get(slotId);
    if (!slot || existingSlotIds.has(slotId)) return [];
    const values = new Map((row.fields || []).map((field) => [field.key, cleanText(field.value, 1000)]));
    const productionBrief = values.get("productionBrief") || "";
    const assetFormat = values.get("assetFormat") || "";
    const usageChannels = values.get("usageChannels") || "";
    if (!productionBrief && !assetFormat && !usageChannels) return [];
    const normalizedFormat = normalizeLookup(assetFormat);
    const format: CampaignAssetOrderFormat = normalizedFormat.includes("video") && normalizedFormat.includes("anh")
      ? "image_video"
      : normalizedFormat.includes("video") || slot.mediaType === "video" || slot.mediaType === "human-video"
        ? "video"
        : "image";
    const headline = cleanText(slot.topicBrief, 120);
    return [{
      companyCode,
      campaignId,
      slotId: row.slotId,
      createdBy: String(row.lastEditedBy || createdBy),
      title: headline || "Order đã chuyển đổi",
      source: "manual" as const,
      format,
      aspectRatio: "4:5" as const,
      headline,
      visualBrief: productionBrief || usageChannels,
      assets: [],
      status: resolveStatus({ format, headline, assets: [] }),
      revision: 0,
    }];
  });
  if (pending.length) await CampaignAssetOrderModel.insertMany(pending, { ordered: false });
}

export const campaignAssetOrderService = {
  async getAiCost(companyCode: string, campaignId: string) {
    const campaign = await assertCampaign(companyCode, campaignId);
    return campaign.qualityMode === "budget" ? 0.5 : 2.5;
  },

  async list(companyCode: string, campaignId: string) {
    const campaign = await assertCampaign(companyCode, campaignId);
    const slots = await MarketingCampaignSlotModel.find({ companyCode, campaignId })
      .sort({ scheduledAt: 1 })
      .select("pillar topicBrief platform status scheduledAt integrationId mediaType")
      .populate("integrationId", "displayName username")
      .lean();
    await migrateLegacySheetOrders(companyCode, campaignId, campaign.createdBy, slots);
    const orders = await CampaignAssetOrderModel.find({ companyCode, campaignId }).sort({ updatedAt: -1 }).lean();
    const slotMap = new Map(slots.map((slot) => [String(slot._id), slot]));
    return {
      campaign: { id: String(campaign._id), title: campaign.title, timezone: campaign.timezone },
      slots: slots.map((slot) => ({
        _id: String(slot._id),
        topicBrief: slot.topicBrief,
        pillar: slot.pillar,
        platform: slot.platform,
        status: slot.status,
        scheduledAt: slot.scheduledAt,
        mediaType: slot.mediaType,
        page: integrationLabel(slot.integrationId),
      })),
      orders: orders.map((order) => ({
        ...serializeOrder(order as unknown as Record<string, unknown>),
        slot: order.slotId ? slotMap.get(String(order.slotId)) : undefined,
      })),
    };
  },

  async create(companyCode: string, campaignId: string, userId: string, input: AssetOrderInput) {
    const [campaign, count, slot] = await Promise.all([
      assertCampaign(companyCode, campaignId),
      CampaignAssetOrderModel.countDocuments({ companyCode, campaignId }),
      assertSlot(companyCode, campaignId, input.slotId),
    ]);
    if (count >= MAX_ORDERS_PER_CAMPAIGN) {
      throw httpError(`Mỗi chiến dịch chỉ có thể có tối đa ${MAX_ORDERS_PER_CAMPAIGN} Order.`, 400, "ORDER_LIMIT");
    }
    const assets = normalizeAssets(input.assets);
    const format = input.format || (slot?.mediaType === "video" || slot?.mediaType === "human-video" ? "video" : "image");
    const headline = cleanText(input.headline, 120);
    const title = cleanText(input.title, 240) || cleanText(slot?.topicBrief, 240) || `Order ${campaign.title}`;
    const order = await CampaignAssetOrderModel.create({
      companyCode,
      campaignId,
      slotId: slot?._id,
      createdBy: userId,
      title,
      contentGroup: cleanText(input.contentGroup, 240),
      shootingContent: cleanText(input.shootingContent, 1000),
      productionRequirements: cleanText(input.productionRequirements, 2000),
      quantitySuggestion: cleanText(input.quantitySuggestion, 120),
      usageChannels: "Facebook",
      source: input.source || "manual",
      format,
      aspectRatio: input.aspectRatio || "4:5",
      templateId: input.templateId && mongoose.isValidObjectId(input.templateId) ? input.templateId : undefined,
      headline,
      subheadline: cleanText(input.subheadline, 220),
      cta: cleanText(input.cta, 80),
      visualBrief: cleanText(input.visualBrief, 1000),
      assets,
      status: resolveStatus({ format, headline, assets }),
      revision: 0,
    });
    return serializeOrder(order.toObject() as unknown as Record<string, unknown>);
  },

  async update(
    companyCode: string,
    campaignId: string,
    orderId: string,
    userId: string,
    input: Partial<AssetOrderInput> & { expectedRevision: number }
  ) {
    await assertCampaign(companyCode, campaignId);
    if (!mongoose.isValidObjectId(orderId)) throw httpError("ID Order không hợp lệ.", 400);
    const current = await CampaignAssetOrderModel.findOne({ _id: orderId, companyCode, campaignId }).lean();
    if (!current) throw httpError("Không tìm thấy Order.", 404);
    if (["completed", "cancelled"].includes(current.status)) {
      throw httpError("Order đã hoàn tất hoặc đã hủy nên không thể chỉnh sửa.", 409, "ORDER_READ_ONLY");
    }
    if (current.revision !== input.expectedRevision) {
      throw httpError("Order đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", 409, "REVISION_CONFLICT");
    }
    const slot = input.slotId === undefined
      ? undefined
      : await assertSlot(companyCode, campaignId, input.slotId || undefined);
    const assets = input.assets === undefined ? current.assets : normalizeAssets(input.assets);
    const format = input.format || current.format;
    const headline = input.headline === undefined ? current.headline : cleanText(input.headline, 120);
    const patch: Record<string, unknown> = {
      title: input.title === undefined ? current.title : cleanText(input.title, 240),
      contentGroup: input.contentGroup === undefined ? current.contentGroup : cleanText(input.contentGroup, 240),
      shootingContent: input.shootingContent === undefined ? current.shootingContent : cleanText(input.shootingContent, 1000),
      productionRequirements: input.productionRequirements === undefined ? current.productionRequirements : cleanText(input.productionRequirements, 2000),
      quantitySuggestion: input.quantitySuggestion === undefined ? current.quantitySuggestion : cleanText(input.quantitySuggestion, 120),
      usageChannels: "Facebook",
      source: input.source || current.source,
      format,
      aspectRatio: input.aspectRatio || current.aspectRatio,
      headline,
      subheadline: input.subheadline === undefined ? current.subheadline : cleanText(input.subheadline, 220),
      cta: input.cta === undefined ? current.cta : cleanText(input.cta, 80),
      visualBrief: input.visualBrief === undefined ? current.visualBrief : cleanText(input.visualBrief, 1000),
      assets,
      status: resolveStatus({ format, headline, assets }),
      ...(slot ? { slotId: slot._id } : input.slotId === "" ? { slotId: null } : {}),
      updatedBy: userId,
    };
    if (input.templateId !== undefined) {
      patch.templateId = input.templateId && mongoose.isValidObjectId(input.templateId) ? input.templateId : null;
    }
    const updated = await CampaignAssetOrderModel.findOneAndUpdate(
      { _id: orderId, companyCode, campaignId, revision: input.expectedRevision },
      { $set: patch, $inc: { revision: 1 } },
      { returnDocument: "after" }
    ).lean();
    if (!updated) throw httpError("Order đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", 409, "REVISION_CONFLICT");
    return serializeOrder(updated as unknown as Record<string, unknown>);
  },

  async archive(companyCode: string, campaignId: string, orderId: string) {
    if (!mongoose.isValidObjectId(orderId)) throw httpError("ID Order không hợp lệ.", 400);
    const updated = await CampaignAssetOrderModel.findOneAndUpdate(
      { _id: orderId, companyCode, campaignId, status: { $nin: ["completed", "cancelled"] } },
      { $set: { status: "cancelled" }, $inc: { revision: 1 } },
      { returnDocument: "after" }
    ).lean();
    if (!updated) throw httpError("Không tìm thấy Order có thể hủy.", 404);
    return serializeOrder(updated as unknown as Record<string, unknown>);
  },

  async createAiProposal(
    companyCode: string,
    campaignId: string,
    orderId: string,
    input: { idempotencyKey: string; instruction?: string }
  ) {
    const campaign = await assertCampaign(companyCode, campaignId);
    if (!mongoose.isValidObjectId(orderId)) throw httpError("ID Order không hợp lệ.", 400);
    const order = await CampaignAssetOrderModel.findOne({ _id: orderId, companyCode, campaignId });
    if (!order) throw httpError("Không tìm thấy Order.", 404);
    if (["completed", "cancelled"].includes(order.status)) {
      throw httpError("Order đã hoàn tất hoặc đã hủy nên không thể dùng AI.", 409, "ORDER_READ_ONLY");
    }
    if (order.aiProposal?.idempotencyKey === input.idempotencyKey) {
      return serializeOrder(order.toObject() as unknown as Record<string, unknown>);
    }

    const slot = order.slotId
      ? await MarketingCampaignSlotModel.findOne({ _id: order.slotId, companyCode, campaignId })
        .populate("integrationId", "username displayName")
        .lean()
      : null;
    const query = [
      campaign.sourceBrief,
      slot?.pillar,
      slot?.objective,
      slot?.topicBrief,
      order.title,
      order.headline,
      order.subheadline,
      order.visualBrief,
    ].filter(Boolean).join("\n");
    const knowledge = await aiKnowledgeService.searchRelevantContext({
      companyCode,
      query,
      channel: slot?.platform === "TikTok" ? "tiktok" : "facebook",
      purpose: "marketing",
      pageId: integrationPageId(slot?.integrationId),
      topK: 5,
    });
    const model = campaign.qualityMode === "budget"
      ? (process.env.CAMPAIGN_BUDGET_MODEL || "qwen/qwen-3.6-flash")
      : (process.env.CAMPAIGN_PREMIUM_MODEL || "google/gemini-3.5-flash");
    const response = await openrouterChat({
      model,
      temperature: 0.55,
      jsonMode: true,
      responseSchema: {
        type: "object",
        properties: {
          headline: { type: "string" },
          subheadline: { type: "string" },
          cta: { type: "string" },
          visualBrief: { type: "string" },
          contentGroup: { type: "string" },
          shootingContent: { type: "string" },
          productionRequirements: { type: "string" },
          quantitySuggestion: { type: "string" },
          warnings: { type: "array", items: { type: "string" } },
        },
        required: [
          "headline",
          "subheadline",
          "cta",
          "visualBrief",
          "contentGroup",
          "shootingContent",
          "productionRequirements",
          "quantitySuggestion",
          "warnings",
        ],
      },
      messages: [
        {
          role: "system",
          content: "Bạn tạo brief ngắn cho ảnh/video marketing. Chỉ trả JSON đúng schema. Không bịa giá, ưu đãi, chính sách, tồn kho, liên hệ hoặc cam kết. headline tối đa 45 ký tự, subheadline tối đa 70 ký tự, cta tối đa 24 ký tự, visualBrief tối đa 160 ký tự.",
        },
        {
          role: "system",
          content: "Also return the production-table fields: contentGroup (content category), shootingContent (what to shoot/film), productionRequirements (visual requirements), and quantitySuggestion (suggested image/video count). Use Vietnamese. The usage channel is always Facebook; never suggest another channel.",
        },
        {
          role: "user",
          content: `CHIẾN DỊCH:\n${campaign.sourceBrief}\n\nSLOT:\n${JSON.stringify(slot ? { pillar: slot.pillar, objective: slot.objective, topicBrief: slot.topicBrief, platform: slot.platform } : {})}\n\nORDER HIỆN TẠI:\n${JSON.stringify({ title: order.title, contentGroup: order.contentGroup, shootingContent: order.shootingContent, productionRequirements: order.productionRequirements, quantitySuggestion: order.quantitySuggestion, usageChannels: "Facebook", format: order.format, aspectRatio: order.aspectRatio, headline: order.headline, subheadline: order.subheadline, cta: order.cta, visualBrief: order.visualBrief, assetRoles: order.assets.map((asset) => asset.role) })}\n\nKHO TRI THỨC ĐÚNG PAGE:\n${knowledge.contextText || "Không có"}\n\nYÊU CẦU THÊM:\n${input.instruction || "Không có"}`,
        },
      ],
    });
    let generated: {
      contentGroup?: unknown;
      shootingContent?: unknown;
      productionRequirements?: unknown;
      quantitySuggestion?: unknown;
      headline?: unknown;
      subheadline?: unknown;
      cta?: unknown;
      visualBrief?: unknown;
      warnings?: unknown;
    };
    try {
      generated = JSON.parse(response.text) as typeof generated;
    } catch {
      throw httpError("AI trả về dữ liệu không hợp lệ.", 502, "INVALID_AI_RESPONSE");
    }
    const references = (knowledge.items || []).slice(0, 5).flatMap((item: unknown) => {
      const value = item as { documentId?: unknown; chunkId?: unknown; title?: unknown; text?: unknown };
      const title = cleanText(value.title, 500) || undefined;
      const excerpt = cleanText(value.text, 300) || undefined;
      return [
        { kind: "knowledge_document" as const, id: String(value.documentId || ""), title, excerpt },
        { kind: "knowledge_chunk" as const, id: String(value.chunkId || ""), title, excerpt },
      ].filter((reference) => reference.id);
    });
    order.aiProposal = {
      idempotencyKey: input.idempotencyKey,
      contentGroup: cleanText(generated.contentGroup, 80),
      shootingContent: cleanText(generated.shootingContent, 300),
      productionRequirements: cleanText(generated.productionRequirements, 500),
      quantitySuggestion: cleanText(generated.quantitySuggestion, 80),
      usageChannels: "Facebook",
      headline: cleanText(generated.headline, 45),
      subheadline: cleanText(generated.subheadline, 70),
      cta: cleanText(generated.cta, 24),
      visualBrief: cleanText(generated.visualBrief, 160),
      references,
      warnings: Array.isArray(generated.warnings) ? generated.warnings.map((warning) => cleanText(warning, 300)).filter(Boolean).slice(0, 5) : [],
      createdAt: new Date(),
    };
    await order.save();
    return serializeOrder(order.toObject() as unknown as Record<string, unknown>);
  },

  async applyAiProposal(
    companyCode: string,
    campaignId: string,
    orderId: string,
    input: {
      expectedRevision: number;
      fieldKeys?: Array<
        | "contentGroup"
        | "shootingContent"
        | "productionRequirements"
        | "quantitySuggestion"
        | "usageChannels"
        | "headline"
        | "subheadline"
        | "cta"
        | "visualBrief"
      >;
    }
  ) {
    if (!mongoose.isValidObjectId(orderId)) throw httpError("ID Order không hợp lệ.", 400);
    const order = await CampaignAssetOrderModel.findOne({ _id: orderId, companyCode, campaignId });
    if (!order) throw httpError("Không tìm thấy Order.", 404);
    if (!order.aiProposal) throw httpError("Order chưa có đề xuất AI để áp dụng.", 409);
    if (order.revision !== input.expectedRevision) {
      throw httpError("Order đã được cập nhật ở nơi khác. Hãy tải lại trước khi áp dụng AI.", 409, "REVISION_CONFLICT");
    }
    const selected = new Set(input.fieldKeys?.length ? input.fieldKeys : [
      "contentGroup",
      "shootingContent",
      "productionRequirements",
      "quantitySuggestion",
      "usageChannels",
      "headline",
      "subheadline",
      "cta",
      "visualBrief",
    ]);
    const patch = {
      ...(selected.has("contentGroup") ? { contentGroup: order.aiProposal.contentGroup || "" } : {}),
      ...(selected.has("shootingContent") ? { shootingContent: order.aiProposal.shootingContent || "" } : {}),
      ...(selected.has("productionRequirements") ? { productionRequirements: order.aiProposal.productionRequirements || "" } : {}),
      ...(selected.has("quantitySuggestion") ? { quantitySuggestion: order.aiProposal.quantitySuggestion || "" } : {}),
      ...(selected.has("usageChannels") ? { usageChannels: "Facebook" } : {}),
      ...(selected.has("headline") ? { headline: order.aiProposal.headline } : {}),
      ...(selected.has("subheadline") ? { subheadline: order.aiProposal.subheadline || "" } : {}),
      ...(selected.has("cta") ? { cta: order.aiProposal.cta || "" } : {}),
      ...(selected.has("visualBrief") ? { visualBrief: order.aiProposal.visualBrief || "" } : {}),
    };
    const headline = (patch.headline === undefined ? order.headline : patch.headline) || "";
    const updated = await CampaignAssetOrderModel.findOneAndUpdate(
      { _id: orderId, companyCode, campaignId, revision: input.expectedRevision },
      { $set: { ...patch, status: resolveStatus({ format: order.format, headline, assets: order.assets }) }, $inc: { revision: 1 } },
      { returnDocument: "after" }
    ).lean();
    if (!updated) throw httpError("Order đã được cập nhật ở nơi khác. Hãy tải lại trước khi áp dụng AI.", 409, "REVISION_CONFLICT");
    return serializeOrder(updated as unknown as Record<string, unknown>);
  },

  async previewBulkMapping(companyCode: string, campaignId: string, orderId: string, templateId: string) {
    if (!mongoose.isValidObjectId(orderId) || !mongoose.isValidObjectId(templateId)) {
      throw httpError("Order hoặc template không hợp lệ.", 400);
    }
    const [order, template] = await Promise.all([
      CampaignAssetOrderModel.findOne({ _id: orderId, companyCode, campaignId }).lean(),
      BulkTemplateModel.findOne({ _id: templateId, companyCode, status: "active" }).lean(),
    ]);
    if (!order) throw httpError("Không tìm thấy Order.", 404);
    if (!template) throw httpError("Không tìm thấy template hoặc bạn không có quyền dùng.", 404);
    if (order.format === "video") {
      throw httpError("Bulk Create hiện chỉ tạo ảnh. Hãy chọn Order ảnh hoặc Ảnh + Video.", 409, "IMAGE_ONLY");
    }
    const result = mapOrderToTemplate(order, template.layers as IBulkLayer[]);
    return {
      orderId: String(order._id),
      template: { _id: String(template._id), name: template.name, canvas: template.canvas },
      ...result,
      ready: result.missing.length === 0,
    };
  },

  async createBulkJob(
    companyCode: string,
    campaignId: string,
    userId: string,
    orderId: string,
    input: { templateId: string; idempotencyKey: string }
  ) {
    const existingOrder = await CampaignAssetOrderModel.findOne({ _id: orderId, companyCode, campaignId }).lean();
    if (!existingOrder) throw httpError("Không tìm thấy Order.", 404);
    if (existingOrder.status === "bulk_queued" && existingOrder.bulkJobId) {
      const existingJob = await BulkRenderJobModel.findOne({ _id: existingOrder.bulkJobId, companyCode }).lean();
      if (existingJob && ["queued", "processing"].includes(existingJob.status)) {
        return { order: serializeOrder(existingOrder as unknown as Record<string, unknown>), job: existingJob };
      }
    }
    const preview = await this.previewBulkMapping(companyCode, campaignId, orderId, input.templateId);
    if (!preview.ready) {
      throw httpError(`Template còn thiếu dữ liệu ở: ${preview.missing.map((item) => item.fieldName).join(", ")}.`, 409, "MAPPING_INCOMPLETE");
    }
    const job = await bulkCreateService.createJob(
      { id: userId, companyCode },
      { templateId: input.templateId, rows: [preview.values], idempotencyKey: input.idempotencyKey }
    );
    const updated = await CampaignAssetOrderModel.findOneAndUpdate(
      { _id: orderId, companyCode, campaignId, status: { $nin: ["completed", "cancelled"] } },
      { $set: { templateId: input.templateId, bulkJobId: job._id, status: "bulk_queued" }, $inc: { revision: 1 } },
      { returnDocument: "after" }
    ).lean();
    if (!updated) throw httpError("Order không còn có thể đưa vào Bulk Create.", 409, "ORDER_READ_ONLY");
    return { order: serializeOrder(updated as unknown as Record<string, unknown>), job };
  },

  async syncBulkJob(companyCode: string, campaignId: string, orderId: string) {
    if (!mongoose.isValidObjectId(orderId)) throw httpError("ID Order không hợp lệ.", 400);
    const order = await CampaignAssetOrderModel.findOne({ _id: orderId, companyCode, campaignId });
    if (!order) throw httpError("Không tìm thấy Order.", 404);
    if (!order.bulkJobId) return serializeOrder(order.toObject() as unknown as Record<string, unknown>);
    const [job, items] = await Promise.all([
      BulkRenderJobModel.findOne({ _id: order.bulkJobId, companyCode }).lean(),
      BulkRenderItemModel.find({ jobId: order.bulkJobId, companyCode, status: "completed" }).select("outputUrl").lean(),
    ]);
    if (!job) throw httpError("Không tìm thấy Bulk Create job của Order.", 404);
    const outputUrls = items.map((item) => String(item.outputUrl || "")).filter(Boolean);
    const nextStatus: CampaignAssetOrderStatus = job.status === "completed" && outputUrls.length > 0
      ? "completed"
      : ["failed", "cancelled"].includes(job.status)
        ? "ready"
        : order.status;
    const outputChanged = outputUrls.length !== order.outputUrls.length
      || outputUrls.some((url, index) => url !== order.outputUrls[index]);
    if (outputChanged || nextStatus !== order.status) {
      order.outputUrls = outputUrls;
      order.status = nextStatus;
      await order.save();
    }
    return serializeOrder(order.toObject() as unknown as Record<string, unknown>);
  },
};
