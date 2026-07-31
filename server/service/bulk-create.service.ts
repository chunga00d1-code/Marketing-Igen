import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { BulkTemplateModel } from "../model/bulk-template.model";
import { BulkRenderJobModel } from "../model/bulk-render-job.model";
import { BulkRenderItemModel } from "../model/bulk-render-item.model";
import { BulkAssetModel } from "../model/bulk-asset.model";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { CampaignAssetOrderModel } from "../model/campaign-asset-order.model";
import { IBulkBackground, IBulkCanvas, IBulkLayer } from "../interface/bulk-create.interface";
import {
  assertSafeBulkImageSource,
  bulkCreateRendererService,
} from "./bulk-create-renderer.service";
import { cloudinaryService } from "./cloudinary.service";
import {
  importEmbeddedGoogleSheetImages,
  importUploadedWorkbookImages,
} from "./bulk-create-xlsx-image.service";

interface Actor {
  id: string;
  companyCode: string;
  role?: string;
}

interface TemplateInput {
  sceneVersion?: number;
  name: string;
  canvas: IBulkCanvas;
  background: IBulkBackground;
  layers: IBulkLayer[];
  thumbnailUrl?: string;
}

interface JobInput {
  templateId: string;
  rows: Array<Record<string, string>>;
  idempotencyKey: string;
  campaignId?: string;
  sourceType?: "manual" | "campaign_orders" | "sheet";
  mappingMode?: "order" | "position" | "manual";
}

const JOB_LEASE_MS = 10 * 60 * 1000;
const MAX_SHEET_XLSX_BYTES = 50 * 1024 * 1024;
const MAX_JOB_INPUT_BYTES = 60 * 1024 * 1024;
const MAX_ITEM_ATTEMPTS = 3;
const ITEM_RETRY_DELAYS_MS = [0, 750, 2_000];
const configuredItemConcurrency = Number(process.env.BULK_CREATE_ITEM_CONCURRENCY || 3);
const ITEM_CONCURRENCY = Number.isFinite(configuredItemConcurrency)
  ? Math.min(5, Math.max(1, Math.floor(configuredItemConcurrency)))
  : 3;

const campaignWritableSlotStatuses = new Set([
  "planned", "queued", "generating", "researching", "writing", "scoring",
  "awaiting_assets", "retrying", "needs_attention", "failed",
]);

function optionalObjectId(value: unknown, label: string) {
  const id = String(value || "").trim();
  if (!id) return undefined;
  if (!mongoose.isValidObjectId(id)) throw new Error(`${label} khÃ´ng há»£p lá»‡.`);
  return id;
}

async function validateCampaignJobContext(actor: Actor, input: JobInput, rows: Array<Record<string, string>>) {
  if (!input.campaignId) return { targetType: "standalone" as const };
  if (!mongoose.isValidObjectId(input.campaignId)) throw new Error("ID chiáº¿n dá»‹ch khÃ´ng há»£p lá»‡.");
  const campaign = await MarketingCampaignModel.exists({ _id: input.campaignId, companyCode: actor.companyCode });
  if (!campaign) throw new Error("KhÃ´ng tÃ¬m tháº¥y chiáº¿n dá»‹ch hoáº·c báº¡n khÃ´ng cÃ³ quyá»n truy cáº­p.");

  const slotIds = Array.from(new Set(rows
    .map((row) => optionalObjectId(row.__campaign_slot_id, "ID bÃ i viáº¿t"))
    .filter((id): id is string => Boolean(id))));
  const orderIds = Array.from(new Set(rows
    .map((row) => optionalObjectId(row.__campaign_asset_order_id, "ID Order"))
    .filter((id): id is string => Boolean(id))));
  if (!slotIds.length) throw new Error("Bulk Create cho chiáº¿n dá»‹ch cáº§n gáº¯n Ã­t nháº¥t má»™t bÃ i viáº¿t.");

  const slots = await MarketingCampaignSlotModel.find({
    _id: { $in: slotIds }, companyCode: actor.companyCode, campaignId: input.campaignId, platform: "Facebook",
  }).select("_id status mediaType").lean();
  const orders = orderIds.length
    ? await CampaignAssetOrderModel.find({ _id: { $in: orderIds }, companyCode: actor.companyCode, campaignId: input.campaignId })
      .select("_id slotId status").lean()
    : [];
  const slotById = new Map(slots.map((slot) => [String(slot._id), slot]));
  const orderById = new Map(orders.map((order) => [String(order._id), order]));
  for (const row of rows) {
    const slotId = optionalObjectId(row.__campaign_slot_id, "ID bÃ i viáº¿t");
    const orderId = optionalObjectId(row.__campaign_asset_order_id, "ID Order");
    if (!slotId) throw new Error("Má»—i dÃ²ng Bulk Create cá»§a chiáº¿n dá»‹ch pháº£i gáº¯n má»™t bÃ i viáº¿t.");
    const slot = slotById.get(slotId);
    if (!slot) throw new Error("BÃ i viáº¿t khÃ´ng thuá»™c chiáº¿n dá»‹ch Facebook Ä‘Ã£ chá»n.");
    if (!campaignWritableSlotStatuses.has(String(slot.status))) {
      throw new Error("BÃ i viáº¿t Ä‘ang á»Ÿ tráº¡ng thÃ¡i khÃ´ng thá»ƒ gáº¯n áº£nh.");
    }
    if (["video", "human-video"].includes(String(slot.mediaType))) {
      throw new Error("Bulk Create chá»‰ gáº¯n áº£nh vÃ o bÃ i Facebook dÃ¹ng áº£nh.");
    }
    if (orderId) {
      const order = orderById.get(orderId);
      if (!order || String(order.slotId || "") !== slotId || order.status === "cancelled") {
        throw new Error("Order khÃ´ng thuá»™c Ä‘Ãºng bÃ i viáº¿t cá»§a chiáº¿n dá»‹ch.");
      }
    }
  }
  return { targetType: "campaign" as const };
}

function isCloudinaryImage(value: string) {
  return /^https:\/\/res\.cloudinary\.com\//i.test(value);
}

function isUploadableImage(value: string) {
  return value.startsWith("data:image/") || value.startsWith("https://");
}

async function waitForRetry(attempt: number) {
  const delay = ITEM_RETRY_DELAYS_MS[Math.min(attempt, ITEM_RETRY_DELAYS_MS.length - 1)] || 0;
  if (delay > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
}

function isRetryableItemError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return ![
    /thiếu dữ liệu/i,
    /không hợp lệ/i,
    /phải sử dụng HTTPS/i,
    /chưa được (?:cho phép|phép render)/i,
    /vượt quá giới hạn/i,
    /không thể nạp Sharp\/libvips/i,
    /kích thước canvas/i,
  ].some((pattern) => pattern.test(message));
}

async function normalizeRowImages(
  layers: IBulkLayer[],
  values: Record<string, string>,
  folder: string,
  uploadCache: Map<string, Promise<string>>
) {
  const normalizedValues = { ...values };
  let changed = false;

  await Promise.all(layers.map(async (layer) => {
    if (layer.type !== "image") return;
    const source = String(
      normalizedValues[layer.id] ?? normalizedValues[layer.fieldName] ?? layer.defaultValue ?? ""
    ).trim();
    if (!source) return;
    assertSafeBulkImageSource(source);
    if (isCloudinaryImage(source) || !isUploadableImage(source)) return;

    let upload = uploadCache.get(source);
    if (!upload) {
      upload = cloudinaryService.uploadMedia(source, folder);
      uploadCache.set(source, upload);
    }
    try {
      normalizedValues[layer.id] = await upload;
      changed = true;
    } catch (error) {
      if (uploadCache.get(source) === upload) uploadCache.delete(source);
      throw error;
    }
  }));

  return { values: normalizedValues, changed };
}

function parseGoogleSheetLink(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Liên kết Google Sheet không hợp lệ.");
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com") {
    throw new Error("Chỉ hỗ trợ liên kết Google Sheet từ docs.google.com.");
  }
  const match = url.pathname.match(/^\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (!match) throw new Error("Không tìm thấy mã Google Sheet trong liên kết.");
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
  return {
    spreadsheetId: match[1],
    sheetId: url.searchParams.get("gid") || hashParams.get("gid") || "0",
  };
}

function scope(actor: Actor) {
  return { companyCode: actor.companyCode };
}

function validateTemplateInput(input: Pick<TemplateInput, "canvas" | "background" | "layers">) {
  const ids = new Set<string>();
  const fieldNames = new Set<string>();
  for (const layer of input.layers) {
    if (ids.has(layer.id)) throw new Error(`Trùng mã layer '${layer.id}'.`);
    const normalizedName = layer.fieldName.trim().toLocaleLowerCase("vi-VN");
    if (fieldNames.has(normalizedName)) throw new Error(`Trùng tên trường '${layer.fieldName}'.`);
    if (layer.x + layer.width > 100.01 || layer.y + layer.height > 100.01) throw new Error(`Layer '${layer.fieldName}' nằm ngoài canvas.`);
    ids.add(layer.id);
    fieldNames.add(normalizedName);
  }
  if (input.background.type === "image" && !input.background.imageUrl) throw new Error("Template ảnh nền đang thiếu đường dẫn ảnh.");
}

async function getTemplate(actor: Actor, templateId: string) {
  if (!mongoose.isValidObjectId(templateId)) throw new Error("Template không hợp lệ.");
  const template = await BulkTemplateModel.findOne({ _id: templateId, ...scope(actor), status: "active" });
  if (!template) throw new Error("Không tìm thấy template hoặc bạn không có quyền truy cập.");
  return template;
}

async function updateJobProgress(jobId: string) {
  const [completedItems, failedItems, cancelledItems, job] = await Promise.all([
    BulkRenderItemModel.countDocuments({ jobId, status: "completed" }),
    BulkRenderItemModel.countDocuments({ jobId, status: "failed" }),
    BulkRenderItemModel.countDocuments({ jobId, status: "cancelled" }),
    BulkRenderJobModel.findById(jobId),
  ]);
  if (!job) return;
  const processed = completedItems + failedItems + cancelledItems;
  const progress = Math.round(processed / job.totalItems * 100);
  await BulkRenderJobModel.updateOne({ _id: jobId }, { $set: { completedItems, failedItems, progress } });
}

export const bulkCreateService = {
  async previewPublicGoogleSheet(actor: Actor, input: { url: string }) {
    const { spreadsheetId, sheetId } = parseGoogleSheetLink(input.url);
    const imported = await importEmbeddedGoogleSheetImages({
      actor,
      spreadsheetId,
      maxBytes: MAX_SHEET_XLSX_BYTES,
    });
    return {
      spreadsheetId,
      sheetId,
      ...imported,
    };
  },

  async previewWorkbook(actor: Actor, input: { file: string; originalName?: string }) {
    const match = /^data:[^;,]*;base64,([A-Za-z0-9+/=]+)$/i.exec(input.file);
    if (!match) throw new Error("Dữ liệu tệp XLSX không hợp lệ.");
    const buffer = Buffer.from(match[1], "base64");
    const imported = await importUploadedWorkbookImages({
      actor,
      buffer,
      maxBytes: MAX_SHEET_XLSX_BYTES,
    });
    return {
      ...imported,
      originalName: input.originalName?.trim() || "Dữ liệu.xlsx",
    };
  },

  async uploadAsset(actor: Actor, input: { file: string; originalName?: string }) {
    const safeCompanyCode = actor.companyCode.toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    const url = await cloudinaryService.uploadMedia(
      input.file,
      `igen_erp/bulk-create/${safeCompanyCode}/${actor.id}/assets`
    );
    return BulkAssetModel.create({
      companyCode: actor.companyCode,
      createdBy: actor.id,
      url,
      originalName: input.originalName?.trim() || "image",
      status: "active",
    });
  },

  async listAssets(actor: Actor, limit = 60) {
    return BulkAssetModel.find({
      ...scope(actor),
      createdBy: actor.id,
      status: "active",
    })
      .sort({ createdAt: -1 })
      .limit(Math.min(100, Math.max(1, limit)))
      .lean();
  },

  async archiveAsset(actor: Actor, assetId: string) {
    if (!mongoose.isValidObjectId(assetId)) throw new Error("Ảnh tải lên không hợp lệ.");
    const result = await BulkAssetModel.updateOne(
      { _id: assetId, ...scope(actor), createdBy: actor.id, status: "active" },
      { $set: { status: "archived" } }
    );
    if (result.matchedCount === 0) {
      throw new Error("Không tìm thấy ảnh tải lên hoặc bạn không có quyền truy cập.");
    }
  },

  async createTemplate(actor: Actor, input: TemplateInput) {
    validateTemplateInput(input);
    return BulkTemplateModel.create({ ...input, companyCode: actor.companyCode, createdBy: actor.id, visibility: "private", useCount: 0, version: 1, status: "active" });
  },

  async listTemplates(actor: Actor) {
    return BulkTemplateModel.find({ ...scope(actor), status: "active" }).sort({ updatedAt: -1 }).lean();
  },

  async listTemplatesPage(actor: Actor, page: number, pageSize: number) {
    const normalizedPage = Math.max(1, Math.floor(page));
    const normalizedPageSize = Math.min(24, Math.max(1, Math.floor(pageSize)));
    const filter = { ...scope(actor), status: "active" as const };
    const [items, total] = await Promise.all([
      BulkTemplateModel.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((normalizedPage - 1) * normalizedPageSize)
        .limit(normalizedPageSize)
        .lean(),
      BulkTemplateModel.countDocuments(filter),
    ]);
    return {
      items,
      page: normalizedPage,
      pageSize: normalizedPageSize,
      total,
      hasMore: normalizedPage * normalizedPageSize < total,
    };
  },

  async listCommunityTemplates() {
    return BulkTemplateModel.find({ visibility: "public", status: "active" })
      .select("sceneVersion name canvas background layers thumbnailUrl visibility version publishedAt useCount")
      .sort({ useCount: -1, publishedAt: -1 })
      .limit(60)
      .lean();
  },

  async publishTemplate(actor: Actor, templateId: string) {
    const template = await getTemplate(actor, templateId);
    if (String(template.createdBy) !== actor.id && actor.role !== "superadmin") throw new Error("Chỉ người tạo template mới có thể chia sẻ mẫu này.");
    template.visibility = "public";
    template.publishedAt = new Date();
    return template.save();
  },

  async unpublishTemplate(actor: Actor, templateId: string) {
    const template = await getTemplate(actor, templateId);
    if (String(template.createdBy) !== actor.id && actor.role !== "superadmin") throw new Error("Chỉ người tạo template mới có thể ngừng chia sẻ mẫu này.");
    template.visibility = "private";
    template.publishedAt = undefined;
    return template.save();
  },

  async useCommunityTemplate(actor: Actor, templateId: string) {
    if (!mongoose.isValidObjectId(templateId)) throw new Error("Template không hợp lệ.");
    const source = await BulkTemplateModel.findOne({ _id: templateId, visibility: "public", status: "active" });
    if (!source) throw new Error("Mẫu cộng đồng không tồn tại hoặc đã ngừng chia sẻ.");
    const [copy] = await Promise.all([
      BulkTemplateModel.create({
        companyCode: actor.companyCode,
        createdBy: actor.id,
        sceneVersion: source.sceneVersion || 1,
        name: `${source.name} - bản sao`,
        canvas: source.canvas,
        background: source.background,
        layers: source.layers,
        thumbnailUrl: source.thumbnailUrl,
        visibility: "private",
        useCount: 0,
        version: 1,
        status: "active",
      }),
      BulkTemplateModel.updateOne({ _id: source._id }, { $inc: { useCount: 1 } }),
    ]);
    return copy;
  },

  async getTemplate(actor: Actor, templateId: string) {
    return getTemplate(actor, templateId);
  },

  async updateTemplate(actor: Actor, templateId: string, input: Partial<TemplateInput>) {
    const template = await getTemplate(actor, templateId);
    if (template.visibility === "public" && String(template.createdBy) !== actor.id && actor.role !== "superadmin") {
      throw new Error("Chỉ người tạo template mới có thể chỉnh sửa mẫu đang được chia sẻ.");
    }
    validateTemplateInput({
      canvas: input.canvas || template.canvas,
      background: input.background || template.background,
      layers: input.layers || template.layers,
    });
    Object.assign(template, input);
    template.version += 1;
    return template.save();
  },

  async archiveTemplate(actor: Actor, templateId: string) {
    const template = await getTemplate(actor, templateId);
    if (template.visibility === "public" && String(template.createdBy) !== actor.id && actor.role !== "superadmin") {
      throw new Error("Chỉ người tạo template mới có thể lưu trữ mẫu đang được chia sẻ.");
    }
    template.status = "archived";
    await template.save();
  },

  async preview(actor: Actor, input: { templateId?: string; template?: TemplateInput; values: Record<string, string> }) {
    const template = input.templateId ? await getTemplate(actor, input.templateId) : input.template;
    if (!template) throw new Error("Thiếu thông tin template để xem trước.");
    return bulkCreateRendererService.renderBulkImage({
      sceneVersion: template.sceneVersion || 1,
      canvas: template.canvas,
      background: template.background,
      layers: template.layers,
    }, input.values);
  },

  async createJob(actor: Actor, input: JobInput) {
    const existing = await BulkRenderJobModel.findOne({ ...scope(actor), idempotencyKey: input.idempotencyKey });
    if (existing) return existing;
    const inputBytes = input.rows.reduce(
      (total, row) => total + Object.entries(row).reduce(
        (rowTotal, [key, value]) =>
          rowTotal + Buffer.byteLength(key, "utf8") + Buffer.byteLength(String(value), "utf8"),
        0
      ),
      0
    );
    if (inputBytes > MAX_JOB_INPUT_BYTES) {
      throw new Error("Tổng dữ liệu của một lượt tạo ảnh vượt quá giới hạn 60 MB.");
    }
    const template = await getTemplate(actor, input.templateId);
    const normalizedRows = input.rows.map((row, rowIndex) => {
      const normalizedRow = { ...row };
      for (const layer of template.layers) {
        const value = String(
          row[layer.id] ?? row[layer.fieldName] ?? layer.defaultValue ?? ""
        ).trim();
        if (!value) throw new Error(`Dòng ${rowIndex + 1} thiếu dữ liệu '${layer.fieldName}'.`);
        normalizedRow[layer.id] = value;
      }
      return normalizedRow;
    });
    const target = await validateCampaignJobContext(actor, input, normalizedRows);
    const snapshot = {
      sceneVersion: template.sceneVersion || 1,
      canvas: template.canvas,
      background: template.background,
      layers: template.layers,
    };
    const jobId = new mongoose.Types.ObjectId();
    try {
      await BulkRenderItemModel.insertMany(normalizedRows.map((values, rowIndex) => ({
        companyCode: actor.companyCode,
        jobId,
        rowIndex,
        campaignAssetOrderId: optionalObjectId(values.__campaign_asset_order_id, "ID Order"),
        campaignSlotId: optionalObjectId(values.__campaign_slot_id, "ID bÃ i viáº¿t"),
        sourceRowId: String(values.__source_row_id || "").trim() || undefined,
        values,
        status: "queued",
      })));
      return await BulkRenderJobModel.create({
        _id: jobId,
        companyCode: actor.companyCode,
        createdBy: actor.id,
        templateId: template._id,
        templateName: template.name,
        templateSnapshot: snapshot,
        targetType: target.targetType,
        campaignId: input.campaignId || undefined,
        sourceType: input.sourceType || "manual",
        mappingMode: input.mappingMode,
        status: "queued",
        totalItems: input.rows.length,
        idempotencyKey: input.idempotencyKey,
      });
    } catch (error) {
      await BulkRenderItemModel.deleteMany({ jobId });
      if ((error as { code?: number }).code === 11000) {
        const duplicate = await BulkRenderJobModel.findOne({
          ...scope(actor),
          idempotencyKey: input.idempotencyKey,
        });
        if (duplicate) return duplicate;
      }
      throw error;
    }
  },

  async listJobs(actor: Actor, limit = 20) {
    return BulkRenderJobModel.find(scope(actor)).sort({ createdAt: -1 }).limit(Math.min(50, limit)).lean();
  },

  async getJob(actor: Actor, jobId: string) {
    if (!mongoose.isValidObjectId(jobId)) throw new Error("Job không hợp lệ.");
    const job = await BulkRenderJobModel.findOne({ _id: jobId, ...scope(actor) }).lean();
    if (!job) throw new Error("Không tìm thấy job hoặc bạn không có quyền truy cập.");
    return job;
  },

  async listItems(actor: Actor, jobId: string) {
    await this.getJob(actor, jobId);
    return BulkRenderItemModel.find({ jobId, ...scope(actor) }).sort({ rowIndex: 1 }).lean();
  },

  async retryFailed(actor: Actor, jobId: string) {
    const job = await this.getJob(actor, jobId);
    if (job.status === "queued" || job.status === "processing") {
      throw new Error("Job vẫn đang được xử lý, chưa thể thử lại lúc này.");
    }
    if (job.status === "cancelled") {
      throw new Error("Job đã bị hủy. Hãy tạo một lượt mới nếu bạn muốn tiếp tục.");
    }
    const result = await BulkRenderItemModel.updateMany(
      { jobId, ...scope(actor), status: "failed" },
      {
        $set: {
          status: "queued",
          attempts: 0,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        },
        $unset: { outputUrl: 1 },
      }
    );
    if (result.modifiedCount === 0) throw new Error("Không có ảnh lỗi nào có thể thử lại.");
    await BulkRenderJobModel.updateOne(
      { _id: jobId, ...scope(actor) },
      {
        $set: { status: "queued", errorMessage: null },
        $unset: {
          completedAt: 1,
          lockId: 1,
          lockedAt: 1,
          lockExpiresAt: 1,
          cancelRequestedAt: 1,
        },
      }
    );
    await updateJobProgress(jobId);
    return this.getJob(actor, jobId);
  },

  async cancel(actor: Actor, jobId: string) {
    const job = await this.getJob(actor, jobId);
    if (["completed", "failed", "partial", "cancelled"].includes(job.status)) return job;
    await BulkRenderJobModel.updateOne(
      { _id: jobId, ...scope(actor) },
      { $set: { status: "cancelled", cancelRequestedAt: new Date(), completedAt: new Date() }, $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 } }
    );
    await BulkRenderItemModel.updateMany(
      { jobId, ...scope(actor), status: "queued" },
      { $set: { status: "cancelled", completedAt: new Date() } }
    );
    await updateJobProgress(jobId);
    return this.getJob(actor, jobId);
  },

  async processJob(jobId: string) {
    const now = new Date();
    const lockId = randomUUID();
    const job = await BulkRenderJobModel.findOneAndUpdate(
      {
        _id: jobId,
        $or: [
          { status: "queued" },
          { status: "processing", lockExpiresAt: { $lte: now } },
          { status: "processing", lockExpiresAt: { $exists: false } },
        ],
      },
      {
        $set: {
          status: "processing",
          startedAt: now,
          errorMessage: null,
          lockId,
          lockedAt: now,
          lockExpiresAt: new Date(now.getTime() + JOB_LEASE_MS),
        },
      },
      { new: true }
    );
    if (!job) return;

    const leaseHeartbeat = setInterval(() => {
      void BulkRenderJobModel.updateOne(
        { _id: jobId, lockId, status: "processing" },
        { $set: { lockExpiresAt: new Date(Date.now() + JOB_LEASE_MS) } }
      ).catch((error) => {
        console.error(`[BulkCreate] Không thể gia hạn lease cho job ${jobId}:`, error);
      });
    }, 60_000);
    leaseHeartbeat.unref();

    try {
    const items = await BulkRenderItemModel.find({
      jobId,
      companyCode: job.companyCode,
      status: "queued",
    }).sort({ rowIndex: 1 });
    const uploadCache = new Map<string, Promise<string>>();
    const inputFolder = `igen_erp/bulk-create/${job.companyCode}/${job._id}/inputs`;

    const processItem = async (itemId: mongoose.Types.ObjectId) => {
      while (true) {
        const claimed = await BulkRenderItemModel.findOneAndUpdate(
          {
            _id: itemId,
            companyCode: job.companyCode,
            status: "queued",
            attempts: { $lt: MAX_ITEM_ATTEMPTS },
          },
          { $set: { status: "processing", startedAt: new Date() }, $inc: { attempts: 1 } },
          { new: true }
        );
        if (!claimed) return;

        try {
          const normalized = await normalizeRowImages(
            job.templateSnapshot.layers,
            claimed.values,
            inputFolder,
            uploadCache
          );
          if (normalized.changed) {
            await BulkRenderItemModel.updateOne(
              { _id: claimed._id, status: "processing" },
              { $set: { values: normalized.values } }
            );
          }
          const output = await bulkCreateRendererService.renderBulkImage(
            job.templateSnapshot,
            normalized.values
          );
          const outputUrl = await cloudinaryService.uploadMediaBuffer(
            output,
            `igen_erp/bulk-create/${job.companyCode}/${job._id}`,
            `row-${claimed.rowIndex + 1}`
          );
          const currentJob = await BulkRenderJobModel.findById(jobId).select("status").lean();
          if (!currentJob || currentJob.status === "cancelled") {
            await BulkRenderItemModel.updateOne(
              { _id: claimed._id, status: "processing" },
              { $set: { status: "cancelled", completedAt: new Date() } }
            );
            return;
          }
          await BulkRenderItemModel.updateOne(
            { _id: claimed._id, status: "processing" },
            {
              $set: {
                status: "completed",
                outputUrl,
                completedAt: new Date(),
                errorMessage: null,
              },
            }
          );
          return;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const currentJob = await BulkRenderJobModel.findById(jobId).select("status").lean();
          if (!currentJob || currentJob.status === "cancelled") {
            await BulkRenderItemModel.updateOne(
              { _id: claimed._id, status: "processing" },
              { $set: { status: "cancelled", errorMessage: message, completedAt: new Date() } }
            );
            return;
          }

          const canRetry =
            claimed.attempts < MAX_ITEM_ATTEMPTS &&
            isRetryableItemError(error);
          await BulkRenderItemModel.updateOne(
            { _id: claimed._id, status: "processing" },
            {
              $set: {
                status: canRetry ? "queued" : "failed",
                errorMessage: message,
                completedAt: canRetry ? null : new Date(),
              },
            }
          );
          if (!canRetry) return;
          await waitForRetry(claimed.attempts);
        }
      }
    };

    for (let index = 0; index < items.length; index += ITEM_CONCURRENCY) {
      const latestJob = await BulkRenderJobModel.findOne({ _id: jobId, lockId }).select("status").lean();
      if (!latestJob || latestJob.status === "cancelled") break;
      const chunk = items.slice(index, index + ITEM_CONCURRENCY);
      await Promise.all(chunk.map((item) => processItem(item._id)));
      await updateJobProgress(jobId);
      await BulkRenderJobModel.updateOne(
        { _id: jobId, lockId, status: "processing" },
        { $set: { lockExpiresAt: new Date(Date.now() + JOB_LEASE_MS) } }
      );
    }

    const [completed, failed, cancelled] = await Promise.all([
      BulkRenderItemModel.countDocuments({ jobId, status: "completed" }),
      BulkRenderItemModel.countDocuments({ jobId, status: "failed" }),
      BulkRenderItemModel.countDocuments({ jobId, status: "cancelled" }),
    ]);
    if (cancelled > 0 || (await BulkRenderJobModel.findById(jobId).select("status").lean())?.status === "cancelled") return;
    const status = completed === job.totalItems ? "completed" : completed > 0 ? "partial" : "failed";
    await BulkRenderJobModel.updateOne({ _id: jobId, lockId }, {
      $set: {
        status,
        completedItems: completed,
        failedItems: failed,
        progress: 100,
        completedAt: new Date(),
        errorMessage: status === "failed" ? "Không có ảnh nào được tạo thành công." : null,
      },
      $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 },
    });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const currentJob = await BulkRenderJobModel.findById(jobId)
        .select("status")
        .lean()
        .catch(() => null);
      if (currentJob?.status === "cancelled") {
        await BulkRenderItemModel.updateMany(
          { jobId, companyCode: job.companyCode, status: "processing" },
          {
            $set: {
              status: "cancelled",
              errorMessage: message,
              completedAt: new Date(),
            },
          }
        );
        await updateJobProgress(jobId);
        return;
      }
      await Promise.all([
        BulkRenderItemModel.updateMany(
          {
            jobId,
            companyCode: job.companyCode,
            status: "processing",
            attempts: { $lt: MAX_ITEM_ATTEMPTS },
          },
          {
            $set: {
              status: "queued",
              errorMessage: message,
              startedAt: null,
              completedAt: null,
            },
          }
        ),
        BulkRenderItemModel.updateMany(
          {
            jobId,
            companyCode: job.companyCode,
            status: "processing",
            attempts: { $gte: MAX_ITEM_ATTEMPTS },
          },
          {
            $set: {
              status: "failed",
              errorMessage: message,
              completedAt: new Date(),
            },
          }
        ),
        BulkRenderJobModel.updateOne(
          { _id: jobId, lockId, status: "processing" },
          {
            $set: { status: "queued", errorMessage: message },
            $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 },
          }
        ),
      ]).catch((recoveryError) => {
        console.error(`[BulkCreate] Không thể trả job ${jobId} về hàng chờ:`, recoveryError);
      });
      throw error;
    } finally {
      clearInterval(leaseHeartbeat);
    }
  },

  async recoverStaleJobs() {
    const now = new Date();
    const staleJobs = await BulkRenderJobModel.find({
      status: "processing",
      $or: [{ lockExpiresAt: { $lte: now } }, { lockExpiresAt: { $exists: false } }],
    }).select("_id").lean();
    for (const job of staleJobs) {
      await BulkRenderItemModel.updateMany(
        { jobId: job._id, status: "processing", attempts: { $lt: 3 } },
        { $set: { status: "queued", errorMessage: null, startedAt: null, completedAt: null } }
      );
      await BulkRenderItemModel.updateMany(
        { jobId: job._id, status: "processing", attempts: { $gte: 3 } },
        { $set: { status: "failed", errorMessage: "Job bị gián đoạn quá số lần cho phép.", completedAt: now } }
      );
      await BulkRenderJobModel.updateOne(
        { _id: job._id, status: "processing" },
        { $set: { status: "queued", errorMessage: "Job được khôi phục sau khi tiến trình trước bị gián đoạn." }, $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 } }
      );
    }
    const queuedJobs = await BulkRenderJobModel.find({ status: "queued" })
      .sort({ createdAt: 1 })
      .limit(500)
      .select("_id")
      .lean();
    return [...new Set([
      ...staleJobs.map((job) => String(job._id)),
      ...queuedJobs.map((job) => String(job._id)),
    ])];
  },

  async failJob(jobId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all([
      BulkRenderJobModel.updateOne(
        { _id: jobId, status: { $in: ["queued", "processing"] } },
        { $set: { status: "failed", errorMessage: message, completedAt: new Date() }, $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 } }
      ),
      BulkRenderItemModel.updateMany(
        { jobId, status: { $in: ["queued", "processing"] } },
        { $set: { status: "failed", errorMessage: message, completedAt: new Date() } }
      ),
    ]);
  },
};
