import mongoose from "mongoose";
import { randomUUID } from "crypto";
import { BulkTemplateModel } from "../model/bulk-template.model";
import { BulkRenderJobModel } from "../model/bulk-render-job.model";
import { BulkRenderItemModel } from "../model/bulk-render-item.model";
import { BulkAssetModel } from "../model/bulk-asset.model";
import { IBulkBackground, IBulkCanvas, IBulkLayer } from "../interface/bulk-create.interface";
import { bulkCreateRendererService } from "./bulk-create-renderer.service";
import { cloudinaryService } from "./cloudinary.service";

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
}

const JOB_LEASE_MS = 10 * 60 * 1000;
const MAX_SHEET_RESPONSE_BYTES = 2 * 1024 * 1024;

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

function parseCsv(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (character === '"') {
      if (quoted && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function normalizeColumnKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .trim()
    .toLocaleLowerCase("vi-VN")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function looksLikeImageColumn(label: string, samples: string[]) {
  if (/(ảnh|hình|image|photo|logo|avatar|thumbnail)/i.test(label)) return true;
  return samples.some((value) => /^https:\/\/\S+\.(png|jpe?g|webp|gif)(\?\S*)?$/i.test(value));
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
  async previewPublicGoogleSheet(input: { url: string; range?: string }) {
    const { spreadsheetId, sheetId } = parseGoogleSheetLink(input.url);
    const exportUrl = new URL(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq`);
    exportUrl.searchParams.set("tqx", "out:csv");
    exportUrl.searchParams.set("gid", sheetId);
    if (input.range?.trim()) exportUrl.searchParams.set("range", input.range.trim());

    const response = await fetch(exportUrl, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) {
      throw new Error("Không thể đọc Google Sheet. Hãy bật quyền 'Bất kỳ ai có liên kết đều có thể xem'.");
    }
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_SHEET_RESPONSE_BYTES) {
      throw new Error("Google Sheet quá lớn. Hãy chọn phạm vi dữ liệu nhỏ hơn.");
    }
    const csv = await response.text();
    if (Buffer.byteLength(csv, "utf8") > MAX_SHEET_RESPONSE_BYTES) {
      throw new Error("Google Sheet quá lớn. Hãy chọn phạm vi dữ liệu nhỏ hơn.");
    }
    const contentType = response.headers.get("content-type") || "";
    if (/text\/html/i.test(contentType) || /^\s*(?:<!doctype html|<html)/i.test(csv)) {
      throw new Error("Google Sheet chưa được chia sẻ công khai hoặc liên kết không hợp lệ.");
    }

    const matrix = parseCsv(csv);
    if (matrix.length < 2) throw new Error("Google Sheet cần có một dòng tiêu đề và ít nhất một dòng dữ liệu.");
    if (matrix[0].length > 50) throw new Error("Google Sheet chỉ được tối đa 50 cột.");
    const labels = matrix[0].map((value, index) =>
      (index === 0 ? value.replace(/^\uFEFF/, "") : value).trim()
    );
    if (labels.some((label) => !label)) throw new Error("Dòng tiêu đề có cột để trống.");
    const keys = labels.map(normalizeColumnKey);
    if (keys.some((key) => !key)) {
      throw new Error("Tên cột cần có ít nhất một chữ cái hoặc chữ số.");
    }
    if (new Set(keys).size !== keys.length) throw new Error("Dòng tiêu đề có tên cột bị trùng.");

    const sourceRows = matrix
      .slice(1)
      .filter((row) => row.some((value) => value.trim()))
      .slice(0, 100);
    const columns = labels.map((label, columnIndex) => {
      const samples = sourceRows
        .map((row) => String(row[columnIndex] || "").trim())
        .filter(Boolean)
        .slice(0, 4);
      return {
        key: keys[columnIndex],
        label,
        type: looksLikeImageColumn(label, samples) ? "image" as const : "text" as const,
        samples,
      };
    });
    const rows = sourceRows.map((row, rowIndex) => ({
      id: `sheet-row-${rowIndex + 1}`,
      selected: true,
      cells: Object.fromEntries(columns.map((column, columnIndex) => [
        column.key,
        String(row[columnIndex] || "").trim(),
      ])),
    }));
    return {
      spreadsheetId,
      sheetId,
      range: input.range?.trim() || "Vùng dữ liệu tự động",
      columns,
      rows,
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
    const snapshot = {
      sceneVersion: template.sceneVersion || 1,
      canvas: template.canvas,
      background: template.background,
      layers: template.layers,
    };
    const job = await BulkRenderJobModel.create({
      companyCode: actor.companyCode,
      createdBy: actor.id,
      templateId: template._id,
      templateName: template.name,
      templateSnapshot: snapshot,
      status: "queued",
      totalItems: input.rows.length,
      idempotencyKey: input.idempotencyKey,
    });
    try {
      await BulkRenderItemModel.insertMany(normalizedRows.map((values, rowIndex) => ({
        companyCode: actor.companyCode,
        jobId: job._id,
        rowIndex,
        values,
        status: "queued",
      })));
      return job;
    } catch (error) {
      await BulkRenderJobModel.deleteOne({ _id: job._id });
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
    await this.getJob(actor, jobId);
    const result = await BulkRenderItemModel.updateMany(
      { jobId, ...scope(actor), status: "failed", attempts: { $lt: 3 } },
      { $set: { status: "queued", errorMessage: null, startedAt: null, completedAt: null } }
    );
    if (result.modifiedCount === 0) throw new Error("Không có ảnh lỗi nào có thể thử lại.");
    await BulkRenderJobModel.updateOne(
      { _id: jobId, ...scope(actor) },
      { $set: { status: "queued", errorMessage: null, completedAt: null }, $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 } }
    );
    return this.getJob(actor, jobId);
  },

  async cancel(actor: Actor, jobId: string) {
    const job = await this.getJob(actor, jobId);
    if (["completed", "failed", "partial", "cancelled"].includes(job.status)) return job;
    await BulkRenderJobModel.updateOne(
      { _id: jobId, ...scope(actor) },
      { $set: { status: "cancelled", cancelRequestedAt: new Date(), completedAt: new Date() }, $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 } }
    );
    await BulkRenderItemModel.updateMany({ jobId, status: "queued" }, { $set: { status: "cancelled", completedAt: new Date() } });
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

    const items = await BulkRenderItemModel.find({ jobId, status: "queued" }).sort({ rowIndex: 1 });
    const concurrency = 3;
    for (let index = 0; index < items.length; index += concurrency) {
      const latestJob = await BulkRenderJobModel.findOne({ _id: jobId, lockId }).select("status").lean();
      if (!latestJob || latestJob.status === "cancelled") break;
      const chunk = items.slice(index, index + concurrency);
      await Promise.all(chunk.map(async (item) => {
        const claimed = await BulkRenderItemModel.findOneAndUpdate(
          { _id: item._id, status: "queued", attempts: { $lt: 3 } },
          { $set: { status: "processing", startedAt: new Date() }, $inc: { attempts: 1 } },
          { new: true }
        );
        if (!claimed) return;
        try {
          const output = await bulkCreateRendererService.renderBulkImage(job.templateSnapshot, claimed.values);
          const outputUrl = await cloudinaryService.uploadMediaBuffer(
            output,
            `igen_erp/bulk-create/${job.companyCode}/${job._id}`,
            `row-${claimed.rowIndex + 1}`
          );
          await BulkRenderItemModel.updateOne({ _id: claimed._id }, { $set: { status: "completed", outputUrl, completedAt: new Date(), errorMessage: null } });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await BulkRenderItemModel.updateOne({ _id: claimed._id }, { $set: { status: "failed", errorMessage: message, completedAt: new Date() } });
        }
      }));
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
    return staleJobs.map((job) => String(job._id));
  },

  async failJob(jobId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await Promise.all([
      BulkRenderJobModel.updateOne(
        { _id: jobId, status: { $in: ["queued", "processing"] } },
        { $set: { status: "failed", errorMessage: message, completedAt: new Date() }, $unset: { lockId: 1, lockedAt: 1, lockExpiresAt: 1 } }
      ),
      BulkRenderItemModel.updateMany({ jobId, status: "processing" }, { $set: { status: "failed", errorMessage: message, completedAt: new Date() } }),
    ]);
  },
};
