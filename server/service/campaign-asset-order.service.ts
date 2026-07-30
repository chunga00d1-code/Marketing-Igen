import crypto from "crypto";
import mongoose from "mongoose";
import { CampaignAssetOrderModel } from "../model/campaign-asset-order.model";
import { CampaignAssetOrderAIJobModel } from "../model/campaign-asset-order-ai-job.model";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { MarketingContentModel } from "../model/marketing-content.model";
import { BulkTemplateModel } from "../model/bulk-template.model";
import { BulkRenderJobModel } from "../model/bulk-render-job.model";
import { BulkRenderItemModel } from "../model/bulk-render-item.model";
import { CampaignSheetRowModel } from "../model/campaign-content-sheet.model";
import { IBulkLayer } from "../interface/bulk-create.interface";
import { bulkCreateService } from "./bulk-create.service";
import { aiKnowledgeService } from "./ai-knowledge.service";
import { openrouterChat } from "./openrouter.service";
import { walletService } from "./wallet.service";
import { campaignQueueService } from "../queue/campaign-queue";
import { broadcastEvent } from "../socket";
import { getGoogleDriveDirectLink, getGoogleDriveFileMimeType, listGoogleDriveFolderFiles } from "./marketing-campaign-helper";
import {
  buildCampaignDriveImportPreview,
  CampaignDriveImportOrder,
} from "./campaign-drive-order-import.service";
import {
  CampaignAssetOrderAIJobStatus,
  CampaignAssetOrderFormat,
  CampaignAssetOrderOverwritePolicy,
  CampaignAssetOrderStatus,
  CampaignAssetRole,
  CampaignAssetSource,
  ICampaignAssetOrderAsset,
} from "../interface/campaign-asset-order.interface";
import { MarketingCampaignSlotStatus } from "../interface/marketing-campaign-slot.interface";

const MAX_ORDERS_PER_CAMPAIGN = 500;
const MAX_ASSETS_PER_ORDER = 20;
const MAX_CUSTOM_FIELDS_PER_CAMPAIGN = 15;
const MAX_CUSTOM_FIELD_VALUE_LENGTH = 500;
const MAX_BULK_IMAGES_PER_ORDER = 10;
// Keep each provider request compact so a full campaign does not time out while
// producing one large JSON response. Billing remains based on the former
// 20-row logical batch, not the smaller transport batch.
const AI_FILL_ALL_BATCH_SIZE = 4;
const AI_FILL_ALL_BILLING_BATCH_SIZE = 20;
const AI_FILL_ALL_TIMEOUT_MS = 60_000;
const AI_FILL_ALL_MAX_TOKENS = 3_000;
const ASSET_ORDER_AI_MODEL = process.env.ASSET_ORDER_AI_MODEL || "deepseek/deepseek-v4-flash";
const terminalSlotStatuses = ["published", "cancelled"] as const;
const aiWritableFieldKeys = [
  "contentGroup",
  "shootingContent",
  "productionRequirements",
  "quantitySuggestion",
  "format",
  "headline",
  "subheadline",
  "cta",
  "visualBrief",
  "videoScript",
] as const;
type AiWritableFieldKey = (typeof aiWritableFieldKeys)[number];
const supportedDriveMediaPattern = /\.(jpg|jpeg|png|webp|gif|heic|mp4|mov|avi|webm)$/i;
const supportedDriveVideoPattern = /\.(mp4|mov|avi|webm)$/i;
const supportedDriveVideoMimeTypes = new Set(["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm"]);
const supportedTikTokDriveVideoPattern = /\.(mp4|mov|webm)$/i;
const supportedTikTokDriveVideoMimeTypes = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const supportedDriveImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif"]);

type DriveFileWithMimeType = {
  id: string;
  name: string;
  mimeType?: string;
};

function getDriveMediaType(file: DriveFileWithMimeType): "image" | "video" | undefined {
  if (supportedDriveVideoPattern.test(file.name) || supportedDriveVideoMimeTypes.has(file.mimeType || "")) return "video";
  if (supportedDriveMediaPattern.test(file.name) || supportedDriveImageMimeTypes.has(file.mimeType || "")) return "image";
  return undefined;
}

function isSupportedTikTokDriveVideo(file: DriveFileWithMimeType) {
  return supportedTikTokDriveVideoPattern.test(file.name)
    || supportedTikTokDriveVideoMimeTypes.has(file.mimeType || "");
}

async function resolveDriveMediaMimeTypes(files: Array<{ id: string; name: string }>): Promise<DriveFileWithMimeType[]> {
  const resolved: DriveFileWithMimeType[] = [];
  const batchSize = 10;
  for (let index = 0; index < files.length; index += batchSize) {
    const batch = files.slice(index, index + batchSize);
    const next = await Promise.all(batch.map(async (file) => {
      if (supportedDriveMediaPattern.test(file.name)) return file;
      return { ...file, mimeType: await getGoogleDriveFileMimeType(file.id) };
    }));
    resolved.push(...next);
  }
  return resolved;
}

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
  videoScript?: string;
  assets?: ICampaignAssetOrderAsset[];
  customFields?: Record<string, string>;
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

function toStringRecord(value: unknown) {
  if (value instanceof Map) {
    return Object.fromEntries([...value.entries()].map(([key, item]) => [String(key), cleanText(item, MAX_CUSTOM_FIELD_VALUE_LENGTH)]));
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .map(([key, item]) => [key, cleanText(item, MAX_CUSTOM_FIELD_VALUE_LENGTH)]));
}

function activeCustomFields(campaign: { assetOrderCustomFields?: Array<{ key: string; label: string; archived?: boolean }> }) {
  return (campaign.assetOrderCustomFields || []).filter((field) => !field.archived);
}

function normalizeCustomFieldValues(
  campaign: { assetOrderCustomFields?: Array<{ key: string; label: string; archived?: boolean }> },
  input: Record<string, string> | undefined,
  current: Record<string, string> = {}
) {
  if (input === undefined) return current;
  const allowedKeys = new Set(activeCustomFields(campaign).map((field) => field.key));
  const next = { ...current };
  for (const [key, value] of Object.entries(input)) {
    if (!allowedKeys.has(key)) {
      throw httpError("Cá»™t tÃ¹y chá»‰nh nÃ y khÃ´ng tá»“n táº¡i hoáº·c Ä‘Ã£ Ä‘Æ°á»£c áº©n.", 400, "INVALID_CUSTOM_FIELD");
    }
    next[key] = cleanText(value, MAX_CUSTOM_FIELD_VALUE_LENGTH);
  }
  return next;
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
  if (terminalSlotStatuses.some((status) => status === slot.status)) {
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
    customFields: toStringRecord(order.customFields),
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
  slots: Array<{
    _id: mongoose.Types.ObjectId;
    pillar?: string;
    objective?: string;
    topicBrief?: string;
    mediaType?: string;
  }>
) {
  const campaignObjectId = new mongoose.Types.ObjectId(campaignId);
  const [rows, existing] = await Promise.all([
    CampaignSheetRowModel.find({ companyCode, campaignId }).select("slotId fields lastEditedBy").lean(),
    CampaignAssetOrderModel.find({ companyCode, campaignId, slotId: { $exists: true } }).select("slotId").lean(),
  ]);
  const existingSlotIds = new Set(existing.map((order) => String(order.slotId)));
  const rowMap = new Map(rows.map((row) => [String(row.slotId), row]));
  const pending = slots.flatMap((slot) => {
    const slotId = String(slot._id);
    if (existingSlotIds.has(slotId)) return [];
    const row = rowMap.get(slotId);
    const values = new Map((row?.fields || []).map((field) => [field.key, cleanText(field.value, 1000)]));
    const productionBrief = values.get("productionBrief") || "";
    const assetFormat = values.get("assetFormat") || "";
    const normalizedFormat = normalizeLookup(assetFormat);
    const format: CampaignAssetOrderFormat = normalizedFormat.includes("video") || slot.mediaType === "video" || slot.mediaType === "human-video"
      ? "video"
      : "image";
    const headline = cleanText(slot.topicBrief, 120);
    return [{
      companyCode,
      campaignId: campaignObjectId,
      slotId: slot._id,
      createdBy: String(row?.lastEditedBy || createdBy),
      title: headline || "Order bài viết",
      contentGroup: cleanText(slot.pillar, 240),
      shootingContent: productionBrief || cleanText(slot.topicBrief, 1000),
      productionRequirements: productionBrief || cleanText(slot.objective, 2000),
      quantitySuggestion: format === "video" ? "1 video" : "1 ảnh",
      usageChannels: "Facebook",
      source: "manual" as const,
      format,
      aspectRatio: "4:5" as const,
      headline,
      visualBrief: productionBrief || "",
      videoScript: "",
      assets: [],
      manualFieldKeys: [],
      status: resolveStatus({ format, headline, assets: [] }),
      revision: 0,
    }];
  });
  if (pending.length) {
    await CampaignAssetOrderModel.bulkWrite(
      pending.map((order) => ({
        updateOne: {
          filter: {
            companyCode,
            campaignId: campaignObjectId,
            slotId: order.slotId,
          },
          update: { $setOnInsert: order },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  }
}

type LegacyGeneratedOrderBrief = {
  _id: unknown;
  slotId?: unknown;
  manualFieldKeys?: string[];
  shootingContent?: string;
  productionRequirements?: string;
  visualBrief?: string;
  revision?: number;
};

async function localizeLegacyGeneratedOrderBriefs(
  companyCode: string,
  campaignId: string,
  orders: LegacyGeneratedOrderBrief[],
  slots: Array<{ _id: unknown; topicBrief?: string }>
) {
  const candidates = orders.filter((order) =>
    order.slotId &&
    (!Array.isArray(order.manualFieldKeys) || order.manualFieldKeys.length === 0) &&
    order.shootingContent &&
    order.shootingContent === order.productionRequirements &&
    order.shootingContent === order.visualBrief
  );
  if (!candidates.length) return;

  const contents = await MarketingContentModel.find({
    companyCode,
    campaignId,
    campaignSlotId: { $in: candidates.map((order) => String(order.slotId)) },
  }).select("campaignSlotId outline bodyText mediaPrompt").lean();
  const contentMap = new Map(contents.map((content) => [String(content.campaignSlotId), content]));
  const slotMap = new Map(slots.map((slot) => [String(slot._id), slot]));
  const updates = candidates.flatMap((order) => {
    const content = contentMap.get(String(order.slotId));
    const mediaPrompt = cleanText(content?.mediaPrompt, 2000);
    if (!mediaPrompt || order.shootingContent !== mediaPrompt) return [];

    const slot = slotMap.get(String(order.slotId));
    const vietnameseBrief = cleanText(content?.outline || content?.bodyText || slot?.topicBrief, 2000);
    if (!vietnameseBrief || vietnameseBrief === mediaPrompt) return [];

    const previousRevision = Number(order.revision || 0);
    const localized = {
      shootingContent: vietnameseBrief.slice(0, 1000),
      productionRequirements: vietnameseBrief,
      visualBrief: vietnameseBrief.slice(0, 1000),
    };
    Object.assign(order, localized, { revision: previousRevision + 1 });
    return [{
      updateOne: {
        filter: {
          _id: order._id,
          companyCode,
          campaignId,
          revision: previousRevision,
          manualFieldKeys: { $size: 0 },
          shootingContent: mediaPrompt,
          productionRequirements: mediaPrompt,
          visualBrief: mediaPrompt,
        },
        update: { $set: localized, $inc: { revision: 1 } },
      },
    }];
  });
  if (updates.length) {
    await CampaignAssetOrderModel.bulkWrite(updates, { ordered: false });
  }
}

async function getDriveImportContext(companyCode: string, campaignId: string, googleDriveFolderUrl: string) {
  const campaign = await assertCampaign(companyCode, campaignId);
  const folderUrl = cleanText(googleDriveFolderUrl, 2000);
  if (!folderUrl) {
    throw httpError("Vui lòng nhập link thư mục Google Drive công khai.", 400, "DRIVE_URL_REQUIRED");
  }

  const slots = await MarketingCampaignSlotModel.find({
    companyCode,
    campaignId,
    status: { $nin: [...terminalSlotStatuses] },
  }).sort({ scheduledAt: 1 }).lean();
  await migrateLegacySheetOrders(companyCode, campaignId, campaign.createdBy, slots);

  const slotMap = new Map(slots.map((slot) => [String(slot._id), slot]));
  const storedOrders = await CampaignAssetOrderModel.find({
    companyCode,
    campaignId,
    slotId: { $exists: true },
    status: { $nin: ["completed", "cancelled"] },
  }).lean();
  const orders = storedOrders
    .filter((order) => slotMap.has(String(order.slotId)))
    .sort((left, right) => {
      const leftDate = slotMap.get(String(left.slotId))?.scheduledAt || 0;
      const rightDate = slotMap.get(String(right.slotId))?.scheduledAt || 0;
      return Number(new Date(leftDate)) - Number(new Date(rightDate));
    });

  const driveFiles = await resolveDriveMediaMimeTypes(await listGoogleDriveFolderFiles(folderUrl));
  const isTikTokCampaign = campaign.platforms.includes("TikTok");
  const supportedMediaFiles = driveFiles.filter((file) => getDriveMediaType(file));
  if (isTikTokCampaign && supportedMediaFiles.some((file) => !isSupportedTikTokDriveVideo(file))) {
    throw httpError(
      "Chiến dịch TikTok chỉ nhận video từ Google Drive. Hãy bỏ ảnh, AVI và chỉ giữ video MP4, MOV hoặc WebM.",
      400,
      "TIKTOK_VIDEO_ONLY"
    );
  }
  const files = (isTikTokCampaign
    ? supportedMediaFiles.filter(isSupportedTikTokDriveVideo)
    : supportedMediaFiles
  ).map((file) => {
    const isVideo = getDriveMediaType(file) === "video";
    return {
      id: file.id,
      name: file.name,
      isVideo,
      isMedia: true,
      directUrl: getGoogleDriveDirectLink(file.id, isVideo ? "video" : "image"),
    };
  });
  const importOrders: CampaignDriveImportOrder[] = orders.map((order) => {
    const slot = slotMap.get(String(order.slotId));
    return {
      orderId: String(order._id),
      slotId: String(order.slotId),
      title: order.title,
      scheduledAt: slot?.scheduledAt || new Date(0),
    };
  });

  return {
    campaign,
    folderUrl,
    slots,
    slotMap,
    orders,
    preview: buildCampaignDriveImportPreview(importOrders, files),
  };
}

export const campaignAssetOrderService = {
  async getAiCost(companyCode: string, campaignId: string) {
    const campaign = await assertCampaign(companyCode, campaignId);
    return campaign.qualityMode === "budget" ? 0.5 : 2.5;
  },

  async getFillAllAiCost(companyCode: string, campaignId: string) {
    const [campaign, orderCount] = await Promise.all([
      assertCampaign(companyCode, campaignId),
      MarketingCampaignSlotModel.countDocuments({
        companyCode,
        campaignId,
        status: { $nin: [...terminalSlotStatuses] },
      }),
    ]);
    const batches = Math.ceil(orderCount / AI_FILL_ALL_BILLING_BATCH_SIZE);
    const unitCost = campaign.qualityMode === "budget" ? 0.5 : 2.5;
    return { orderCount, batches, cost: batches * unitCost };
  },

  async createFillAllAIJob(
    companyCode: string,
    campaignId: string,
    userId: string,
    input: {
      idempotencyKey: string;
      instruction?: string;
      overwritePolicy?: CampaignAssetOrderOverwritePolicy;
    }
  ) {
    const campaign = await assertCampaign(companyCode, campaignId);
    const existing = await CampaignAssetOrderAIJobModel.findOne({ companyCode, idempotencyKey: input.idempotencyKey }).lean();
    if (existing) return existing;

    const slots = await MarketingCampaignSlotModel.find({
      companyCode,
      campaignId,
      status: { $nin: [...terminalSlotStatuses] },
    }).select("_id pillar objective topicBrief mediaType").lean();
    await migrateLegacySheetOrders(companyCode, campaignId, campaign.createdBy, slots);
    const orders = await CampaignAssetOrderModel.find({
      companyCode,
      campaignId,
      slotId: { $exists: true },
      status: { $nin: ["completed", "cancelled"] },
    }).select("_id").sort({ updatedAt: 1 }).lean();
    if (!orders.length) {
      throw httpError("Chưa có Order gắn với bài viết để AI điền.", 409, "NO_SLOT_ORDERS");
    }

    const unitCost = campaign.qualityMode === "budget" ? 0.5 : 2.5;
    try {
      const job = await CampaignAssetOrderAIJobModel.create({
        companyCode,
        campaignId,
        createdBy: userId,
        instruction: cleanText(input.instruction, 2000),
        overwritePolicy: input.overwritePolicy || "empty_only",
        targetOrderIds: orders.map((order) => order._id),
        totalItems: orders.length,
        modelName: ASSET_ORDER_AI_MODEL,
        estimatedCost: Math.ceil(orders.length / AI_FILL_ALL_BILLING_BATCH_SIZE) * unitCost,
        idempotencyKey: input.idempotencyKey,
      });
      return job.toObject();
    } catch (error: unknown) {
      if ((error as { code?: number })?.code === 11000) {
        const duplicate = await CampaignAssetOrderAIJobModel.findOne({ companyCode, idempotencyKey: input.idempotencyKey }).lean();
        if (duplicate) return duplicate;
      }
      throw error;
    }
  },

  async processFillAllAIJob(jobId: string) {
    const lockId = crypto.randomUUID();
    const now = new Date();
    const job = await CampaignAssetOrderAIJobModel.findOneAndUpdate(
      {
        _id: jobId,
        status: "queued",
        $or: [
          { lockExpiresAt: { $exists: false } },
          { lockExpiresAt: null },
          { lockExpiresAt: { $lte: now } },
        ],
      },
      {
        $set: {
          status: "processing",
          lockId,
          lockedAt: now,
          lockExpiresAt: new Date(now.getTime() + 20 * 60_000),
          startedAt: now,
          errorMessage: "",
        },
        $inc: { attemptCount: 1 },
      },
      { returnDocument: "after" }
    );
    if (!job) return null;

    const campaign = await MarketingCampaignModel.findOne({ _id: job.campaignId, companyCode: job.companyCode }).lean();
    if (!campaign) throw httpError("Chiến dịch của AI job không còn tồn tại.", 404);
    const allOrders = await CampaignAssetOrderModel.find({
      _id: { $in: job.targetOrderIds },
      companyCode: job.companyCode,
      campaignId: job.campaignId,
      status: { $nin: ["completed", "cancelled"] },
    }).sort({ updatedAt: 1 }).lean();
    const completedIds = new Set(job.results.map((result) => String(result.orderId)));
    const orders = allOrders.filter((order) => !completedIds.has(String(order._id)));
    const slots = await MarketingCampaignSlotModel.find({
      companyCode: job.companyCode,
      campaignId: job.campaignId,
      _id: { $in: orders.map((order) => order.slotId).filter(Boolean) },
    }).select("_id pillar objective topicBrief mediaType").lean();
    const slotMap = new Map(slots.map((slot) => [String(slot._id), slot]));
    const contents = await MarketingContentModel.find({
      companyCode: job.companyCode,
      campaignId: String(job.campaignId),
      campaignSlotId: { $in: slots.map((slot) => String(slot._id)) },
    }).select("campaignSlotId title bodyText outline mediaPrompt voiceScript mediaType").lean();
    const contentMap = new Map(contents.map((content) => [String(content.campaignSlotId), content]));
    const query = [
      campaign.sourceBrief,
      ...orders.map((order) => {
        const slot = order.slotId ? slotMap.get(String(order.slotId)) : undefined;
        const content = order.slotId ? contentMap.get(String(order.slotId)) : undefined;
        return [slot?.pillar, slot?.objective, slot?.topicBrief, order.title, content?.title, content?.bodyText, content?.mediaPrompt]
          .filter(Boolean)
          .join(" ");
      }),
    ].join("\n").slice(0, 20_000);
    const knowledge = await aiKnowledgeService.searchRelevantContext({
      companyCode: job.companyCode,
      query,
      channel: "facebook",
      purpose: "marketing",
      topK: 8,
    });
    const references = (knowledge.items || []).slice(0, 5).flatMap((item: unknown) => {
      const value = item as { documentId?: unknown; chunkId?: unknown; title?: unknown; text?: unknown };
      const title = cleanText(value.title, 500) || undefined;
      const excerpt = cleanText(value.text, 300) || undefined;
      return [
        { kind: "knowledge_document" as const, id: String(value.documentId || ""), title, excerpt },
        { kind: "knowledge_chunk" as const, id: String(value.chunkId || ""), title, excerpt },
      ].filter((reference) => reference.id);
    });
    const remainingRequestCount = Math.ceil(orders.length / AI_FILL_ALL_BATCH_SIZE);
    const remainingBudget = Math.max(Number(job.estimatedCost || 0) - Number(job.actualCost || 0), 0);
    const requestCost = remainingRequestCount > 0 ? remainingBudget / remainingRequestCount : 0;

    for (let start = 0; start < orders.length; start += AI_FILL_ALL_BATCH_SIZE) {
      const latest = await CampaignAssetOrderAIJobModel.findById(job._id).select("cancelRequestedAt status completedItems failedItems skippedItems conflictedItems actualCost").lean();
      if (latest?.cancelRequestedAt || latest?.status === "cancelled") {
        await CampaignAssetOrderAIJobModel.updateOne(
          { _id: job._id, lockId },
          { $set: { status: "cancelled", completedAt: new Date() }, $unset: { lockId: 1, lockExpiresAt: 1 } }
        );
        return CampaignAssetOrderAIJobModel.findById(job._id).lean();
      }

      const batch = orders.slice(start, start + AI_FILL_ALL_BATCH_SIZE);
      const batchResults: Array<{
        orderId: mongoose.Types.ObjectId;
        expectedRevision: number;
        updatedFields: string[];
        warnings: string[];
        status: "applied" | "skipped" | "conflict" | "failed";
      }> = [];
      let providerCharged = false;
      try {
        if (requestCost > 0) await walletService.checkBalance(job.createdBy, requestCost);
        const response = await openrouterChat({
          model: job.modelName,
          temperature: 0.35,
          jsonMode: true,
          maxTokens: AI_FILL_ALL_MAX_TOKENS,
          timeoutMs: AI_FILL_ALL_TIMEOUT_MS,
          maxRetries: 2,
          responseSchema: {
            type: "object",
            properties: {
              rows: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    orderId: { type: "string" },
                    format: { type: "string", enum: ["image", "video"] },
                    contentGroup: { type: "string" },
                    shootingContent: { type: "string" },
                    productionRequirements: { type: "string" },
                    quantitySuggestion: { type: "string" },
                    headline: { type: "string" },
                    subheadline: { type: "string" },
                    cta: { type: "string" },
                    visualBrief: { type: "string" },
                    videoScript: { type: "string" },
                    warnings: { type: "array", items: { type: "string" } },
                  },
                  required: ["orderId", "format", "contentGroup", "shootingContent", "productionRequirements", "quantitySuggestion", "headline", "subheadline", "cta", "visualBrief", "videoScript", "warnings"],
                },
              },
            },
            required: ["rows"],
          },
          messages: [
            {
              role: "system",
              content: "Bạn là người lập brief sản xuất media cho người dùng Việt Nam, không chuyên kỹ thuật. Chỉ trả JSON đúng schema. Điền mọi dòng bằng câu tiếng Việt ngắn, rõ, dễ đọc; không dùng tiếng Anh trừ tên riêng, tên sản phẩm hoặc tên model. Không sao chép nguyên văn mediaPrompt tiếng Anh từ dữ liệu đầu vào. Hãy diễn đạt các cụm như 'split screen video', 'fast-paced', 'screen recording' thành 'video chia đôi màn hình', 'nhịp nhanh', 'quay màn hình'. Giới hạn: contentGroup tối đa 50 ký tự; shootingContent 100; productionRequirements 140; quantitySuggestion 30; headline 35; subheadline (caption) 70; cta 24; visualBrief 120; videoScript 350. Chọn chính xác image hoặc video: video chỉ khi chuyển động, thao tác, trình diễn, câu chuyện hoặc lời thoại giúp ích rõ ràng; còn lại chọn image. Với image, videoScript để rỗng. Với video, videoScript phải có mở cảnh, diễn biến và CTA ngắn. Không bịa giá, ưu đãi, chính sách, tồn kho, liên hệ hoặc cam kết.",
            },
            {
              role: "user",
              content: `CHIẾN DỊCH:\n${campaign.sourceBrief}\n\nKHO TRI THỨC FACEBOOK:\n${cleanText(knowledge.contextText, 6000) || "Không có"}\n\nCÁC DÒNG CẦN ĐIỀN:\n${JSON.stringify(batch.map((order) => {
                const slot = order.slotId ? slotMap.get(String(order.slotId)) : undefined;
                const content = order.slotId ? contentMap.get(String(order.slotId)) : undefined;
                return {
                  orderId: String(order._id),
                  post: slot?.topicBrief || order.title,
                  pillar: slot?.pillar || order.contentGroup,
                  objective: slot?.objective || "",
                  suggestedMedia: slot?.mediaType || order.format,
                  finalContent: content
                    ? {
                      title: cleanText(content.title, 160),
                      bodyText: cleanText(content.bodyText, 900),
                      outline: cleanText(content.outline, 700),
                      mediaPrompt: cleanText(content.mediaPrompt, 500),
                      voiceScript: cleanText(content.voiceScript, 700),
                      mediaType: content.mediaType,
                    }
                    : undefined,
                };
              }))}\n\nYÊU CẦU THÊM:\n${job.instruction || "Không có"}`,
            },
          ],
        });
        if (requestCost > 0) {
          await walletService.deductBalance(
            job.createdBy,
            requestCost,
            "Chi phí AI điền Order ảnh, video",
            `asset-order-ai-job:${job.companyCode}:${job._id}:${start / AI_FILL_ALL_BATCH_SIZE}`
          );
          providerCharged = true;
        }

        const parsed = JSON.parse(response.text) as { rows?: unknown };
        if (!Array.isArray(parsed.rows)) throw httpError("AI không trả về danh sách dòng Order.", 502, "INVALID_AI_RESPONSE");
        const generatedByOrderId = new Map<string, Record<string, unknown>>();
        const batchIds = new Set(batch.map((order) => String(order._id)));
        for (const item of parsed.rows) {
          if (!item || typeof item !== "object") continue;
          const value = item as Record<string, unknown>;
          const orderId = String(value.orderId || "");
          if (batchIds.has(orderId) && !generatedByOrderId.has(orderId)) generatedByOrderId.set(orderId, value);
        }

        for (const order of batch) {
          const generated = generatedByOrderId.get(String(order._id));
          if (!generated) {
            batchResults.push({ orderId: order._id, expectedRevision: order.revision, updatedFields: [], warnings: ["AI không trả về dữ liệu cho dòng này."], status: "failed" });
            continue;
          }
          const format: CampaignAssetOrderFormat = generated.format === "video" ? "video" : "image";
          const warnings = Array.isArray(generated.warnings)
            ? generated.warnings.map((warning) => cleanText(warning, 300)).filter(Boolean).slice(0, 5)
            : [];
          const generatedValues: Record<AiWritableFieldKey, string | CampaignAssetOrderFormat> = {
            contentGroup: cleanText(generated.contentGroup, 50),
            shootingContent: cleanText(generated.shootingContent, 100),
            productionRequirements: cleanText(generated.productionRequirements, 140),
            quantitySuggestion: cleanText(generated.quantitySuggestion, 30),
            format,
            headline: cleanText(generated.headline, 35),
            subheadline: cleanText(generated.subheadline, 70),
            cta: cleanText(generated.cta, 24),
            visualBrief: cleanText(generated.visualBrief, 120),
            videoScript: format === "video" ? cleanText(generated.videoScript, 350) : "",
          };
          const requiredFields = format === "video"
            ? ["contentGroup", "shootingContent", "productionRequirements", "quantitySuggestion", "videoScript"]
            : ["contentGroup", "shootingContent", "productionRequirements", "quantitySuggestion", "headline", "subheadline", "visualBrief"];
          const missingFields = requiredFields.filter((field) => !String(generatedValues[field as AiWritableFieldKey] || "").trim());
          if (missingFields.length) {
            batchResults.push({
              orderId: order._id,
              expectedRevision: order.revision,
              updatedFields: [],
              warnings: [...warnings, `AI thiếu: ${missingFields.join(", ")}.`],
              status: "failed",
            });
            continue;
          }
          const manualFields = new Set(order.manualFieldKeys || []);
          const patch: Record<string, unknown> = {};
          const updatedFields: string[] = [];
          for (const field of aiWritableFieldKeys) {
            if (job.overwritePolicy === "empty_only" && manualFields.has(field)) continue;
            patch[field] = generatedValues[field];
            updatedFields.push(field);
          }
          const aiProposal = {
            idempotencyKey: `${job.idempotencyKey.slice(0, 150)}:${String(order._id)}`,
            generationJobId: String(job._id),
            modelName: job.modelName,
            ...generatedValues,
            usageChannels: "Facebook",
            references,
            warnings,
            createdAt: new Date(),
            appliedAt: updatedFields.length ? new Date() : undefined,
          };
          if (!updatedFields.length) {
            await CampaignAssetOrderModel.updateOne(
              { _id: order._id, companyCode: job.companyCode, campaignId: job.campaignId, revision: order.revision },
              { $set: { aiProposal } }
            );
            batchResults.push({ orderId: order._id, expectedRevision: order.revision, updatedFields, warnings, status: "skipped" });
            continue;
          }
          const nextFormat = (patch.format || order.format) as CampaignAssetOrderFormat;
          const nextHeadline = String(patch.headline ?? order.headline);
          const updated = await CampaignAssetOrderModel.updateOne(
            { _id: order._id, companyCode: job.companyCode, campaignId: job.campaignId, revision: order.revision },
            {
              $set: {
                ...patch,
                usageChannels: "Facebook",
                aiProposal,
                status: resolveStatus({ format: nextFormat, headline: nextHeadline, assets: order.assets }),
              },
              $inc: { revision: 1 },
            }
          );
          batchResults.push({
            orderId: order._id,
            expectedRevision: order.revision,
            updatedFields,
            warnings,
            status: updated.modifiedCount ? "applied" : "conflict",
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI xử lý nhóm Order thất bại.";
        const recordedOrderIds = new Set(batchResults.map((result) => String(result.orderId)));
        for (const order of batch.filter((item) => !recordedOrderIds.has(String(item._id)))) {
          batchResults.push({ orderId: order._id, expectedRevision: order.revision, updatedFields: [], warnings: [message], status: "failed" });
        }
      }

      const skipped = batchResults.filter((result) => result.status === "skipped").length;
      const conflicted = batchResults.filter((result) => result.status === "conflict").length;
      const failed = batchResults.filter((result) => result.status === "failed").length;
      const processed = start + batch.length;
      await CampaignAssetOrderAIJobModel.updateOne(
        { _id: job._id, lockId },
        {
          $push: { results: { $each: batchResults } },
          $set: {
            completedItems: processed,
            progress: Math.round((processed / Math.max(job.totalItems, 1)) * 100),
            lockExpiresAt: new Date(Date.now() + 20 * 60_000),
          },
          $inc: {
            failedItems: failed,
            skippedItems: skipped,
            conflictedItems: conflicted,
            actualCost: providerCharged ? requestCost : 0,
          },
        }
      );
    }

    const finalJob = await CampaignAssetOrderAIJobModel.findById(job._id);
    if (!finalJob) return null;
    const status: CampaignAssetOrderAIJobStatus = finalJob.failedItems === finalJob.totalItems
      ? "failed"
      : finalJob.failedItems || finalJob.conflictedItems || finalJob.skippedItems
        ? "partial"
        : "completed";
    finalJob.status = status;
    finalJob.progress = 100;
    finalJob.completedAt = new Date();
    finalJob.lockId = undefined;
    finalJob.lockExpiresAt = undefined;
    await finalJob.save();
    return finalJob.toObject();
  },

  async failFillAllAIJob(jobId: string, error: unknown) {
    const message = error instanceof Error ? error.message : "AI job Order thất bại.";
    return CampaignAssetOrderAIJobModel.findByIdAndUpdate(
      jobId,
      { $set: { status: "failed", errorMessage: message.slice(0, 1000), completedAt: new Date() }, $unset: { lockId: 1, lockExpiresAt: 1 } },
      { returnDocument: "after" }
    ).lean();
  },

  async getFillAllAIJob(companyCode: string, campaignId: string, jobId: string) {
    await assertCampaign(companyCode, campaignId);
    const job = await CampaignAssetOrderAIJobModel.findOne({ _id: jobId, companyCode, campaignId }).lean();
    if (!job) throw httpError("Không tìm thấy AI job Order.", 404);
    return job;
  },

  async cancelFillAllAIJob(companyCode: string, campaignId: string, jobId: string) {
    await assertCampaign(companyCode, campaignId);
    const job = await CampaignAssetOrderAIJobModel.findOneAndUpdate(
      { _id: jobId, companyCode, campaignId, status: { $in: ["queued", "processing"] } },
      [{
        $set: {
          cancelRequestedAt: "$$NOW",
          status: { $cond: [{ $eq: ["$status", "queued"] }, "cancelled", "$status"] },
          completedAt: { $cond: [{ $eq: ["$status", "queued"] }, "$$NOW", "$completedAt"] },
        },
      }],
      { returnDocument: "after", updatePipeline: true }
    ).lean();
    if (!job) throw httpError("AI job Order không còn ở trạng thái có thể hủy.", 409);
    return job;
  },

  async recoverStaleFillAllAIJobs() {
    const stale = await CampaignAssetOrderAIJobModel.find({ status: "processing", lockExpiresAt: { $lte: new Date() } }).select("_id").lean();
    if (stale.length) {
      await CampaignAssetOrderAIJobModel.updateMany(
        { _id: { $in: stale.map((job) => job._id) } },
        { $set: { status: "queued" }, $unset: { lockId: 1, lockExpiresAt: 1 } }
      );
    }
    return stale.map((job) => String(job._id));
  },

  async list(companyCode: string, campaignId: string) {
    const campaign = await assertCampaign(companyCode, campaignId);
    const slots = await MarketingCampaignSlotModel.find({ companyCode, campaignId, status: { $nin: [...terminalSlotStatuses] } })
      .sort({ scheduledAt: 1 })
      .select("pillar objective topicBrief platform status scheduledAt integrationId mediaType")
      .populate("integrationId", "displayName username")
      .lean();
    await migrateLegacySheetOrders(companyCode, campaignId, campaign.createdBy, slots);
    const storedOrders = await CampaignAssetOrderModel.find({ companyCode, campaignId }).sort({ updatedAt: -1 }).lean();
    await localizeLegacyGeneratedOrderBriefs(companyCode, campaignId, storedOrders, slots);
    const slotMap = new Map(slots.map((slot) => [String(slot._id), slot]));
    const orders = storedOrders
      .filter((order) => !order.slotId || slotMap.has(String(order.slotId)))
      .sort((left, right) => {
        const leftScheduledAt = left.slotId ? slotMap.get(String(left.slotId))?.scheduledAt : undefined;
        const rightScheduledAt = right.slotId ? slotMap.get(String(right.slotId))?.scheduledAt : undefined;
        return Number(new Date(leftScheduledAt || 0)) - Number(new Date(rightScheduledAt || 0));
      });
    return {
      campaign: { id: String(campaign._id), title: campaign.title, timezone: campaign.timezone, platforms: campaign.platforms },
      customFieldColumns: activeCustomFields(campaign).map((field) => ({ key: field.key, label: field.label })),
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

  async previewDriveImport(companyCode: string, campaignId: string, googleDriveFolderUrl: string) {
    const { campaign, preview } = await getDriveImportContext(companyCode, campaignId, googleDriveFolderUrl);
    if (!preview.totalFiles) {
      throw httpError(
        campaign.platforms.includes("TikTok")
          ? "Không tìm thấy video hợp lệ trong thư mục Drive. TikTok chỉ nhận video MP4, MOV hoặc WebM."
          : "Không tìm thấy ảnh hoặc video hợp lệ trong thư mục Drive. Hãy kiểm tra quyền chia sẻ công khai.",
        400,
        "DRIVE_MEDIA_NOT_FOUND"
      );
    }
    return preview;
  },

  async applyDriveImport(companyCode: string, campaignId: string, googleDriveFolderUrl: string) {
    const { campaign, folderUrl, slotMap, orders, preview } = await getDriveImportContext(
      companyCode,
      campaignId,
      googleDriveFolderUrl
    );
    const mappedFiles = preview.mappings.filter((mapping) => mapping.files.length > 0);
    if (!mappedFiles.length) {
      throw httpError(
        "Không có file nào ghép được với bài viết. Tên file cần chứa số thứ tự bài, ví dụ 1.jpg hoặc 3_2.png.",
        400,
        "DRIVE_FILES_UNMATCHED"
      );
    }
    const importableSlotStatuses = new Set<MarketingCampaignSlotStatus>([
      "planned",
      "queued",
      "generating",
      "researching",
      "writing",
      "awaiting_assets",
      "retrying",
      "needs_attention",
      "failed",
    ]);
    const mappings = mappedFiles.filter((mapping) => {
      const slot = slotMap.get(mapping.slotId);
      return mapping.files.length > 0 && slot && importableSlotStatuses.has(slot.status);
    });
    if (!mappings.length) {
      throw httpError(
        "Không có bài nào đang ở trạng thái có thể nhận file Drive. Hãy chờ bài hoàn tất bước đang xử lý rồi thử lại.",
        409,
        "DRIVE_IMPORT_NOT_AVAILABLE"
      );
    }

    const orderMap = new Map(orders.map((order) => [String(order._id), order]));
    const readySlotIds: string[] = [];
    const orderOperations = mappings.flatMap((mapping) => {
      const order = orderMap.get(mapping.orderId);
      if (!order) return [];
      const preservedAssets = (order.assets || []).filter((asset) => asset.source !== "drive");
      const driveAssets = mapping.files.map((file, index) => ({
        role: file.isVideo ? "video" as const : index === 0 ? "primary" as const : "secondary" as const,
        sourceUrl: file.directUrl,
        originalName: file.name,
        source: "drive" as const,
        order: preservedAssets.length + index,
      }));
      const assets = [...preservedAssets, ...driveAssets].slice(0, MAX_ASSETS_PER_ORDER);
      const format: CampaignAssetOrderFormat = mapping.files.some((file) => file.isVideo) ? "video" : "image";
      return [{
        updateOne: {
          filter: { _id: order._id, companyCode, campaignId },
          update: {
            $set: {
              assets,
              format,
              source: "drive" as CampaignAssetSource,
              status: resolveStatus({ format, headline: order.headline, assets }),
            },
            $inc: { revision: 1 },
          },
        },
      }];
    });
    if (orderOperations.length) {
      await CampaignAssetOrderModel.bulkWrite(orderOperations, { ordered: false });
    }

    for (const mapping of mappings) {
      const slot = slotMap.get(mapping.slotId);
      if (!slot) continue;
      const hasVideo = mapping.files.some((file) => file.isVideo);
      const driveUrls = mapping.files.map((file) => `https://drive.google.com/file/d/${file.id}/view`);
      const directUrls = mapping.files.map((file) => file.directUrl);
      const canStartMedia = slot.status === "awaiting_assets" && Boolean(slot.marketingContentId);
      const updated = await MarketingCampaignSlotModel.findOneAndUpdate(
        {
          _id: slot._id,
          companyCode,
          campaignId,
          status: canStartMedia ? "awaiting_assets" : slot.status,
        },
        {
          $set: {
            realImageDriveUrls: driveUrls,
            realImageDirectUrls: directUrls,
            mediaType: hasVideo ? "video" : "image",
            ...(canStartMedia ? { status: "generating_media" } : {}),
          },
          $unset: {
            mediaIngestionFingerprint: 1,
            ingestedMedia: 1,
            visualAnalysis: 1,
          },
          ...(canStartMedia ? {
            $push: {
              transitions: {
                from: "awaiting_assets",
                to: "generating_media",
                reason: `Đã nhận ${mapping.files.length} file từ Google Drive theo Order #${mapping.position}; bắt đầu gắn media, không phân tích Vision.`,
                at: new Date(),
              },
            },
          } : {}),
        },
        { returnDocument: "after" }
      ).lean();
      if (updated && canStartMedia) readySlotIds.push(String(slot._id));
    }

    await MarketingCampaignModel.updateOne(
      { _id: campaign._id, companyCode },
      { $set: { imageMode: "order", googleDriveFolderUrl: folderUrl } }
    );

    for (const slotId of readySlotIds) {
      broadcastEvent("campaign:slot-update", {
        slotId,
        campaignId,
        companyCode,
        status: "generating_media",
        updatedAt: new Date().toISOString(),
      });
      await campaignQueueService.addMediaJob(slotId);
    }

    return {
      ...preview,
      appliedOrders: mappings.length,
      queuedSlots: readySlotIds.length,
    };
  },

  async addCustomField(companyCode: string, campaignId: string, label: string) {
    const campaign = await assertCampaign(companyCode, campaignId);
    const cleanedLabel = cleanText(label, 120);
    if (!cleanedLabel) throw httpError("Tên cột là bắt buộc.", 400, "CUSTOM_FIELD_LABEL_REQUIRED");
    const fields = activeCustomFields(campaign);
    if (fields.length >= MAX_CUSTOM_FIELDS_PER_CAMPAIGN) {
      throw httpError(`Mỗi chiến dịch chỉ được thêm tối đa ${MAX_CUSTOM_FIELDS_PER_CAMPAIGN} cột tùy chỉnh.`, 400, "CUSTOM_FIELD_LIMIT");
    }
    if (fields.some((field) => normalizeLookup(field.label) === normalizeLookup(cleanedLabel))) {
      throw httpError("Cột tùy chỉnh này đã có trong bảng Order.", 409, "DUPLICATE_CUSTOM_FIELD");
    }
    const field = {
      key: `custom_${crypto.randomBytes(6).toString("hex")}`,
      label: cleanedLabel,
      archived: false,
      createdAt: new Date(),
    };
    await MarketingCampaignModel.updateOne(
      { _id: campaignId, companyCode },
      { $push: { assetOrderCustomFields: field } }
    );
    return { key: field.key, label: field.label };
  },

  async archiveCustomField(companyCode: string, campaignId: string, fieldKey: string) {
    await assertCampaign(companyCode, campaignId);
    const result = await MarketingCampaignModel.updateOne(
      {
        _id: campaignId,
        companyCode,
        assetOrderCustomFields: { $elemMatch: { key: fieldKey, archived: false } },
      },
      { $set: { "assetOrderCustomFields.$.archived": true } }
    );
    if (!result.modifiedCount) throw httpError("Không tìm thấy cột tùy chỉnh đang dùng.", 404, "CUSTOM_FIELD_NOT_FOUND");
    return { key: fieldKey, archived: true };
  },

  async exportForBulkCreate(companyCode: string, campaignId: string) {
    const data = await this.list(companyCode, campaignId);
    const skipped: Array<{ orderId: string; reason: string }> = [];
    const rows = data.orders.flatMap((order) => {
      if (!order.slotId || order.status === "cancelled") return [];
      if (order.format === "video") {
        skipped.push({ orderId: order._id, reason: "Order video cần đi theo luồng kịch bản/video, chưa nhập vào Bulk Create ảnh." });
        return [];
      }
      const primaryAsset = selectAsset(order, "ảnh chính");
      return [{
        id: `campaign-order-${order._id}`,
        selected: true,
        cells: {
          order_id: order._id,
          slot_id: order.slotId,
          content_group: order.contentGroup || "",
          shooting_content: order.shootingContent || "",
          production_requirements: order.productionRequirements || "",
          quantity_suggestion: order.quantitySuggestion || "",
          headline: order.headline || "",
          caption: order.subheadline || "",
          cta: order.cta || "",
          visual_brief: order.visualBrief || "",
          ...Object.fromEntries(data.customFieldColumns.map((field) => [field.key, order.customFields?.[field.key] || ""])),
          primary_image: primaryAsset?.sourceUrl || "",
        },
      }];
    });
    return {
      sourceName: `Order chiến dịch · ${data.campaign.title}`,
      campaign: data.campaign,
      columns: [
        { key: "order_id", label: "Mã Order", type: "text" as const, samples: rows.slice(0, 3).map((row) => row.cells.order_id) },
        { key: "slot_id", label: "Mã bài viết", type: "text" as const, samples: rows.slice(0, 3).map((row) => row.cells.slot_id) },
        { key: "content_group", label: "Nhóm nội dung", type: "text" as const, samples: rows.slice(0, 3).map((row) => row.cells.content_group) },
        { key: "shooting_content", label: "Nội dung quay/chụp", type: "text" as const, samples: rows.slice(0, 3).map((row) => row.cells.shooting_content) },
        { key: "production_requirements", label: "Chi tiết yêu cầu", type: "text" as const, samples: rows.slice(0, 3).map((row) => row.cells.production_requirements) },
        { key: "quantity_suggestion", label: "Số lượng đề xuất", type: "text" as const, samples: rows.slice(0, 3).map((row) => row.cells.quantity_suggestion) },
        { key: "headline", label: "Tiêu đề", type: "text" as const, samples: rows.slice(0, 3).map((row) => row.cells.headline) },
        { key: "caption", label: "Caption", type: "text" as const, samples: rows.slice(0, 3).map((row) => row.cells.caption) },
        { key: "cta", label: "CTA", type: "text" as const, samples: rows.slice(0, 3).map((row) => row.cells.cta) },
        { key: "visual_brief", label: "Mô tả ảnh", type: "text" as const, samples: rows.slice(0, 3).map((row) => row.cells.visual_brief) },
        ...data.customFieldColumns.map((field) => ({
          key: field.key,
          label: field.label,
          type: "text" as const,
          samples: rows.slice(0, 3).map((row) => row.cells[field.key]),
        })),
        { key: "primary_image", label: "Ảnh chính", type: "image" as const, samples: rows.slice(0, 3).map((row) => row.cells.primary_image) },
      ],
      rows,
      skipped,
      missingPrimaryAssetCount: rows.filter((row) => !row.cells.primary_image).length,
      maxBulkRows: 100,
    };
  },

  async listBulkCreateImportJobs(companyCode: string, campaignId: string) {
    await assertCampaign(companyCode, campaignId);
    const [orders, jobs] = await Promise.all([
      CampaignAssetOrderModel.find({ companyCode, campaignId, status: { $ne: "cancelled" } })
        .select("_id")
        .lean(),
      BulkRenderJobModel.find({
        companyCode,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .select("_id templateName status totalItems completedItems failedItems progress createdAt completedAt")
        .lean(),
    ]);
    if (!orders.length || !jobs.length) return [];
    const orderIds = orders.map((order) => String(order._id));
    const items = await BulkRenderItemModel.find({
      companyCode,
      jobId: { $in: jobs.map((job) => job._id) },
      "values.__campaign_asset_order_id": { $in: orderIds },
    }).select("jobId status outputUrl").lean();
    const linkedItemCountByJobId = new Map<string, number>();
    const linkedCountByJobId = new Map<string, number>();
    for (const item of items) {
      const key = String(item.jobId);
      linkedItemCountByJobId.set(key, (linkedItemCountByJobId.get(key) || 0) + 1);
      if (item.status === "completed" && item.outputUrl) {
        linkedCountByJobId.set(key, (linkedCountByJobId.get(key) || 0) + 1);
      }
    }
    return jobs
      .filter((job) => linkedItemCountByJobId.has(String(job._id)))
      .map((job) => ({
        ...job,
        _id: String(job._id),
        linkedOutputCount: linkedCountByJobId.get(String(job._id)) || 0,
        linkedItemCount: linkedItemCountByJobId.get(String(job._id)) || 0,
      }));
  },

  async previewBulkCreateImport(companyCode: string, campaignId: string, jobId: string) {
    if (!mongoose.isValidObjectId(jobId)) throw httpError("Bulk Create job không hợp lệ.", 400);
    await assertCampaign(companyCode, campaignId);
    const [job, items] = await Promise.all([
      BulkRenderJobModel.findOne({ _id: jobId, companyCode })
        .select("_id templateName status totalItems completedItems failedItems createdAt completedAt")
        .lean(),
      BulkRenderItemModel.find({ jobId, companyCode, status: "completed" })
        .sort({ rowIndex: 1 })
        .select("rowIndex values outputUrl")
        .lean(),
    ]);
    if (!job) throw httpError("Không tìm thấy Bulk Create job.", 404);
    if (!["completed", "partial"].includes(job.status)) {
      throw httpError(
        "Bulk Create chưa hoàn tất nên chưa thể gắn vào chiến dịch.",
        409,
        "BULK_CREATE_NOT_COMPLETED"
      );
    }

    const outputUrlsByOrderId = new Map<string, string[]>();
    let unlinkedOutputCount = 0;
    for (const item of items) {
      const orderId = String(item.values?.__campaign_asset_order_id || "");
      const outputUrl = String(item.outputUrl || "");
      if (!mongoose.isValidObjectId(orderId) || !outputUrl) {
        if (outputUrl) unlinkedOutputCount += 1;
        continue;
      }
      const urls = outputUrlsByOrderId.get(orderId) || [];
      if (!urls.includes(outputUrl)) urls.push(outputUrl);
      outputUrlsByOrderId.set(orderId, urls);
    }

    const orders = outputUrlsByOrderId.size
      ? await CampaignAssetOrderModel.find({
        _id: { $in: [...outputUrlsByOrderId.keys()] },
        companyCode,
        campaignId,
        status: { $ne: "cancelled" },
      }).select("_id slotId title outputUrls").lean()
      : [];
    const slotIds = orders.map((order) => order.slotId).filter(Boolean);
    const slots = slotIds.length
      ? await MarketingCampaignSlotModel.find({
        _id: { $in: slotIds },
        companyCode,
        campaignId,
      }).select("_id platform status scheduledAt realImageDirectUrls").lean()
      : [];
    const slotMap = new Map(slots.map((slot) => [String(slot._id), slot]));
    const matchedOrderIds = new Set(orders.map((order) => String(order._id)));
    const importableSlotStatuses = new Set<MarketingCampaignSlotStatus>([
      "planned",
      "queued",
      "generating",
      "researching",
      "writing",
      "awaiting_assets",
      "retrying",
      "needs_attention",
      "failed",
    ]);
    const mappings = orders.map((order) => {
      const orderId = String(order._id);
      const slotId = order.slotId ? String(order.slotId) : "";
      const slot = slotMap.get(slotId);
      const allOutputUrls = outputUrlsByOrderId.get(orderId) || [];
      const outputUrls = allOutputUrls.slice(0, MAX_BULK_IMAGES_PER_ORDER);
      let blockedReason = "";
      if (!slot) blockedReason = "Order chưa liên kết với bài viết.";
      else if (slot.platform !== "Facebook") blockedReason = "Bulk Create chỉ được gắn vào bài Facebook.";
      else if (!importableSlotStatuses.has(slot.status)) blockedReason = "Bài đang ở trạng thái không thể thay đổi media.";
      return {
        orderId,
        slotId,
        title: order.title,
        platform: slot?.platform || "",
        slotStatus: slot?.status || "",
        scheduledAt: slot?.scheduledAt,
        currentUrls: slot?.realImageDirectUrls || order.outputUrls || [],
        outputUrls,
        truncatedCount: Math.max(0, allOutputUrls.length - outputUrls.length),
        canApply: !blockedReason && outputUrls.length > 0,
        blockedReason: blockedReason || undefined,
      };
    });
    const missingOrderIds = [...outputUrlsByOrderId.keys()].filter((orderId) => !matchedOrderIds.has(orderId));
    return {
      job: { ...job, _id: String(job._id) },
      mappings,
      applicableOrders: mappings.filter((mapping) => mapping.canApply).length,
      blockedOrders: mappings.filter((mapping) => !mapping.canApply).length,
      linkedOutputCount: mappings.reduce((sum, mapping) => sum + mapping.outputUrls.length, 0),
      unlinkedOutputCount,
      missingOrderIds,
      maxImagesPerOrder: MAX_BULK_IMAGES_PER_ORDER,
    };
  },

  async syncBulkCreateImport(
    companyCode: string,
    campaignId: string,
    jobId: string,
    mode: "replace" | "append" = "replace"
  ) {
    const campaign = await assertCampaign(companyCode, campaignId);
    const preview = await this.previewBulkCreateImport(companyCode, campaignId, jobId);
    const applicableMappings = preview.mappings.filter((mapping) => mapping.canApply);
    if (!applicableMappings.length) {
      return {
        updatedCount: 0,
        attachedSlots: 0,
        queuedSlots: 0,
        skippedOrders: preview.blockedOrders,
        truncatedImages: 0,
        unmatchedOrderIds: preview.missingOrderIds,
        jobStatus: preview.job.status,
      };
    }

    const readySlotIds: string[] = [];
    let attachedSlots = 0;
    let updatedCount = 0;
    let truncatedImages = 0;

    for (const mapping of applicableMappings) {
      const slot = await MarketingCampaignSlotModel.findOne({
        _id: mapping.slotId,
        companyCode,
        campaignId,
        platform: "Facebook",
        status: mapping.slotStatus,
      }).select("_id status marketingContentId realImageDirectUrls").lean();
      if (!slot) continue;
      const mergedUrls = mode === "append"
        ? [...new Set([...(slot.realImageDirectUrls || []), ...mapping.outputUrls])]
        : mapping.outputUrls;
      const finalUrls = mergedUrls.slice(0, MAX_BULK_IMAGES_PER_ORDER);
      truncatedImages += mapping.truncatedCount + Math.max(0, mergedUrls.length - finalUrls.length);
      const canStartMedia = slot.status === "awaiting_assets" && Boolean(slot.marketingContentId);
      const updated = await MarketingCampaignSlotModel.findOneAndUpdate(
        {
          _id: slot._id,
          companyCode,
          campaignId,
          platform: "Facebook",
          status: canStartMedia ? "awaiting_assets" : slot.status,
        },
        {
          $set: {
            realImageDriveUrls: [],
            realImageDirectUrls: finalUrls,
            mediaType: "image",
            ...(canStartMedia ? { status: "generating_media" } : {}),
          },
          $unset: {
            mediaIngestionFingerprint: 1,
            ingestedMedia: 1,
            visualAnalysis: 1,
          },
          ...(canStartMedia ? {
            $push: {
              transitions: {
                from: "awaiting_assets",
                to: "generating_media",
                reason: `Đã ${mode === "append" ? "bổ sung" : "thay thế"} ${finalUrls.length} ảnh từ Bulk Create; bắt đầu gắn media, không phân tích Vision.`,
                at: new Date(),
              },
            },
          } : {}),
        },
        { returnDocument: "after" }
      ).lean();
      if (!updated) continue;
      attachedSlots += 1;
      if (canStartMedia) readySlotIds.push(String(slot._id));
      const orderUpdate = await CampaignAssetOrderModel.updateOne(
        {
          _id: mapping.orderId,
          companyCode,
          campaignId,
          status: { $ne: "cancelled" },
        },
        {
          $set: {
            bulkJobId: preview.job._id,
            outputUrls: finalUrls,
            status: "completed" as CampaignAssetOrderStatus,
          },
          $inc: { revision: 1 },
        }
      );
      updatedCount += orderUpdate.modifiedCount;
    }

    await MarketingCampaignModel.updateOne(
      { _id: campaign._id, companyCode },
      { $set: { imageMode: "order" } }
    );
    for (const slotId of readySlotIds) {
      broadcastEvent("campaign:slot-update", {
        slotId,
        campaignId,
        companyCode,
        status: "generating_media",
        updatedAt: new Date().toISOString(),
      });
      await campaignQueueService.addMediaJob(slotId);
    }
    return {
      updatedCount,
      attachedSlots,
      queuedSlots: readySlotIds.length,
      skippedOrders: preview.blockedOrders,
      truncatedImages,
      unmatchedOrderIds: preview.missingOrderIds,
      jobStatus: preview.job.status,
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
    if (slot) {
      const existing = await CampaignAssetOrderModel.exists({ companyCode, campaignId, slotId: slot._id });
      if (existing) throw httpError("Bài viết này đã có Order sản xuất.", 409, "SLOT_ORDER_EXISTS");
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
      videoScript: cleanText(input.videoScript, 4000),
      assets,
      customFields: normalizeCustomFieldValues(campaign, input.customFields),
      manualFieldKeys: aiWritableFieldKeys.filter((field) => {
        const value = input[field as keyof AssetOrderInput];
        return value !== undefined && String(value).trim() !== "";
      }),
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
    const campaign = await assertCampaign(companyCode, campaignId);
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
    if (slot && String(slot._id) !== String(current.slotId || "")) {
      const existing = await CampaignAssetOrderModel.exists({
        _id: { $ne: orderId },
        companyCode,
        campaignId,
        slotId: slot._id,
      });
      if (existing) throw httpError("Bài viết này đã có Order sản xuất.", 409, "SLOT_ORDER_EXISTS");
    }
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
      videoScript: input.videoScript === undefined ? current.videoScript : cleanText(input.videoScript, 4000),
      assets,
      status: resolveStatus({ format, headline, assets }),
      ...(slot ? { slotId: slot._id } : input.slotId === "" ? { slotId: null } : {}),
      updatedBy: userId,
    };
    if (input.customFields !== undefined) {
      patch.customFields = normalizeCustomFieldValues(campaign, input.customFields, toStringRecord(current.customFields));
    }
    const manualFieldKeys = new Set(current.manualFieldKeys || []);
    for (const field of aiWritableFieldKeys) {
      if (input[field as keyof AssetOrderInput] !== undefined) manualFieldKeys.add(field);
    }
    if (input.customFields !== undefined) {
      for (const key of Object.keys(input.customFields)) manualFieldKeys.add(`customFields.${key}`);
    }
    patch.manualFieldKeys = [...manualFieldKeys];
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
    const finalContent = slot
      ? await MarketingContentModel.findOne({
        companyCode,
        campaignId,
        campaignSlotId: slot._id,
      }).select("title bodyText outline mediaPrompt voiceScript mediaType").lean()
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
      finalContent?.title,
      finalContent?.bodyText,
      finalContent?.mediaPrompt,
    ].filter(Boolean).join("\n");
    const knowledge = await aiKnowledgeService.searchRelevantContext({
      companyCode,
      query,
      channel: "facebook",
      purpose: "marketing",
      pageId: integrationPageId(slot?.integrationId),
      topK: 5,
    });
    const model = ASSET_ORDER_AI_MODEL;
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
          format: { type: "string", enum: ["image", "video"] },
          videoScript: { type: "string" },
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
          "format",
          "videoScript",
          "warnings",
        ],
      },
      messages: [
        {
          role: "system",
          content: "Bạn tạo nội dung ngắn cho ảnh/video marketing để dùng trong Bulk Create. Chỉ trả JSON đúng schema. Không bịa giá, ưu đãi, chính sách, tồn kho, liên hệ hoặc cam kết. headline tối đa 35 ký tự, subheadline tối đa 70 ký tự, cta tối đa 24 ký tự, visualBrief tối đa 120 ký tự.",
        },
        {
          role: "system",
          content: "Bắt buộc trả thêm các trường trong bảng sản xuất và viết TOÀN BỘ bằng tiếng Việt dễ hiểu, không dùng tiếng Anh trừ tên riêng, tên sản phẩm hoặc tên model: contentGroup tối đa 50 ký tự; shootingContent tối đa 100 ký tự; productionRequirements tối đa 140 ký tự; quantitySuggestion tối đa 30 ký tự; format chỉ được là image hoặc video; videoScript tối đa 350 ký tự. Chọn video khi cần chuyển động, quy trình, thao tác, trình diễn, câu chuyện hoặc lời thoại; nếu không thì chọn image. Với image, headline là tiêu đề, subheadline là caption Facebook, visualBrief là mô tả ảnh và videoScript để trống. Không viết các cụm mô tả kiểu tiếng Anh như 'split screen video', 'fast-paced', 'screen recording'; hãy chuyển thành tiếng Việt như 'video chia đôi màn hình', 'nhịp nhanh', 'quay màn hình'. Kênh sử dụng phải bám theo nền tảng của slot, không tự đổi sang nền tảng khác.",
        },
        {
          role: "user",
          content: `CHIẾN DỊCH:\n${campaign.sourceBrief}\n\nSLOT:\n${JSON.stringify(slot ? { pillar: slot.pillar, objective: slot.objective, topicBrief: slot.topicBrief, platform: slot.platform } : {})}\n\nCONTENT CUỐI CÙNG CỦA BÀI:\n${JSON.stringify(finalContent || {})}\n\nORDER HIỆN TẠI:\n${JSON.stringify({ title: order.title, contentGroup: order.contentGroup, shootingContent: order.shootingContent, productionRequirements: order.productionRequirements, quantitySuggestion: order.quantitySuggestion, usageChannels: "Facebook", format: order.format, aspectRatio: order.aspectRatio, headline: order.headline, subheadline: order.subheadline, cta: order.cta, visualBrief: order.visualBrief, assetRoles: order.assets.map((asset) => asset.role) })}\n\nKHO TRI THỨC ĐÚNG PAGE:\n${knowledge.contextText || "Không có"}\n\nYÊU CẦU THÊM:\n${input.instruction || "Không có"}`,
        },
      ],
    });
    let generated: {
      contentGroup?: unknown;
      shootingContent?: unknown;
      productionRequirements?: unknown;
      quantitySuggestion?: unknown;
      format?: unknown;
      videoScript?: unknown;
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
    const generatedFormat: CampaignAssetOrderFormat = generated.format === "video" ? "video" : "image";
    order.aiProposal = {
      idempotencyKey: input.idempotencyKey,
      contentGroup: cleanText(generated.contentGroup, 50),
      shootingContent: cleanText(generated.shootingContent, 100),
      productionRequirements: cleanText(generated.productionRequirements, 140),
      quantitySuggestion: cleanText(generated.quantitySuggestion, 30),
      usageChannels: "Facebook",
      format: generatedFormat,
      headline: cleanText(generated.headline, 35),
      subheadline: cleanText(generated.subheadline, 70),
      cta: cleanText(generated.cta, 24),
      visualBrief: cleanText(generated.visualBrief, 120),
      videoScript: generatedFormat === "video" ? cleanText(generated.videoScript, 350) : "",
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
        | "format"
        | "headline"
        | "subheadline"
        | "cta"
        | "visualBrief"
        | "videoScript"
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
      "format",
      "headline",
      "subheadline",
      "cta",
      "visualBrief",
      "videoScript",
    ]);
    const patch = {
      ...(selected.has("contentGroup") ? { contentGroup: order.aiProposal.contentGroup || "" } : {}),
      ...(selected.has("shootingContent") ? { shootingContent: order.aiProposal.shootingContent || "" } : {}),
      ...(selected.has("productionRequirements") ? { productionRequirements: order.aiProposal.productionRequirements || "" } : {}),
      ...(selected.has("quantitySuggestion") ? { quantitySuggestion: order.aiProposal.quantitySuggestion || "" } : {}),
      ...(selected.has("usageChannels") ? { usageChannels: "Facebook" } : {}),
      ...(selected.has("format") ? { format: order.aiProposal.format || order.format } : {}),
      ...(selected.has("headline") ? { headline: order.aiProposal.headline } : {}),
      ...(selected.has("subheadline") ? { subheadline: order.aiProposal.subheadline || "" } : {}),
      ...(selected.has("cta") ? { cta: order.aiProposal.cta || "" } : {}),
      ...(selected.has("visualBrief") ? { visualBrief: order.aiProposal.visualBrief || "" } : {}),
      ...(selected.has("videoScript") ? { videoScript: order.aiProposal.videoScript || "" } : {}),
    };
    const headline = (patch.headline === undefined ? order.headline : patch.headline) || "";
    const format = (patch.format === undefined ? order.format : patch.format) as CampaignAssetOrderFormat;
    const updated = await CampaignAssetOrderModel.findOneAndUpdate(
      { _id: orderId, companyCode, campaignId, revision: input.expectedRevision },
      {
        $set: {
          ...patch,
          status: resolveStatus({ format, headline, assets: order.assets }),
          "aiProposal.appliedAt": new Date(),
        },
        $inc: { revision: 1 },
      },
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
