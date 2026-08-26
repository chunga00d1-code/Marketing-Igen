/* eslint-disable @typescript-eslint/no-explicit-any */
import crypto from "crypto";
import mongoose from "mongoose";
import {
  CampaignSheetAIJobModel,
  CampaignSheetConfigModel,
  CampaignSheetRevisionModel,
  CampaignSheetRowModel,
} from "../model/campaign-content-sheet.model";
import { MarketingCampaignModel } from "../model/marketing-campaign.model";
import { MarketingCampaignSlotModel } from "../model/marketing-campaign-slot.model";
import { MarketingContentModel } from "../model/marketing-content.model";
import { MarketingCandidateModel } from "../model/marketing-candidate.model";
import {
  CampaignSheetDataType,
  CampaignSheetFieldPolicy,
  ICampaignSheetColumn,
  ICampaignSheetReference,
  ICampaignSheetStoredField,
} from "../interface/campaign-content-sheet.interface";
import { aiKnowledgeService } from "./ai-knowledge.service";
import type { KnowledgeDocumentType } from "./ai-knowledge.service";
import { openrouterChat } from "./openrouter.service";
import { walletService } from "./wallet.service";
import {
  resolveMonthlyPrepareAt,
  zonedLocalTimeToUtc,
} from "./marketing-campaign-schedule.service";

const MAX_CUSTOM_COLUMNS = 30;
const MAX_ROWS = 500;
const MAX_AI_ROWS = 100;
const MAX_BULK_CELLS = 1000;
const BLOCKED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
// Sheet is the planning and review surface for a slot. A slot remains editable
// while it is in the campaign pipeline; only terminal slots are immutable.
// This must match the bulk-AI eligibility query below.
const READ_ONLY_SLOT_STATUSES = new Set(["published", "cancelled"]);
const CONFIGURABLE_SLOT_STATUSES = new Set(["planned", "queued", "awaiting_assets", "retrying", "needs_attention", "failed"]);
const EDITABLE_CANONICAL_FIELDS = new Set(["scheduledAt", "pillar", "objective", "topicBrief", "funnelStage", "platform", "mediaType", "mediaSource"]);


const DEFAULT_COLUMNS: ICampaignSheetColumn[] = [
  systemColumn("scheduledAt", "Ngày đăng", "datetime", 0, false, 170),
  systemColumn("platform", "Nền tảng", "short_text", 1, false, 110),
  systemColumn("page", "Page / tài khoản", "short_text", 2, false, 170),
  systemColumn("pillar", "Nhóm nội dung", "short_text", 3, true, 170, "constraint"),
  systemColumn("funnelStage", "Funnel", "select", 4, true, 100, "constraint", ["TOFU", "MOFU", "BOFU"]),
  systemColumn("objective", "Mục tiêu", "short_text", 5, true, 180, "constraint"),
  systemColumn("topicBrief", "Nội dung cần quay/chụp", "long_text", 6, true, 260, "constraint"),
  systemColumn("title", "Tiêu đề bài", "short_text", 7, true, 240, "approved_override"),
  systemColumn("bodyText", "Nội dung", "long_text", 8, true, 360, "approved_override"),
  systemColumn("cta", "CTA", "short_text", 9, true, 180, "constraint"),
  systemColumn("hashtags", "Hashtag", "short_text", 10, true, 180, "constraint"),
  systemColumn("mediaType", "Media", "select", 11, false, 110, "constraint", ["text", "image", "video", "human-video"]),
  systemColumn("status", "Trạng thái", "short_text", 12, false, 140),
  systemColumn("mediaSource", "Ngu\u1ed3n media", "select", 12, false, 150, "constraint", ["drive", "ai", "upload", "production_order", "none"]),
];

const ORDER_INPUT_COLUMNS: ICampaignSheetColumn[] = [
  orderInputColumn("productionBrief", "Chi tiết yêu cầu", "long_text", 13, 280),
  orderInputColumn("assetFormat", "Định dạng", "select", 14, 150, ["Ảnh", "Video", "Ảnh + Video"]),
  orderInputColumn("proposedQuantity", "SL đề xuất", "short_text", 15, 150),
  orderInputColumn("usageChannels", "Phục vụ", "short_text", 16, 180),
];

function systemColumn(
  key: string,
  label: string,
  dataType: CampaignSheetDataType,
  order: number,
  aiEnabled: boolean,
  width: number,
  fieldPolicy: CampaignSheetFieldPolicy = "note",
  options: string[] = []
): ICampaignSheetColumn {
  return {
    id: `system:${key}`,
    key,
    label,
    kind: "system",
    dataType,
    systemField: key,
    required: false,
    archived: false,
    options,
    fieldPolicy,
    ai: {
      enabled: aiEnabled,
      allowedSources: ["row", "campaign", "knowledge"],
      sensitiveBusinessField: false,
      knowledgeDocumentTypes: [],
    },
    display: { order, width, frozen: order < 2, hidden: false },
  };
}

function orderInputColumn(
  key: string,
  label: string,
  dataType: CampaignSheetDataType,
  order: number,
  width: number,
  options: string[] = []
): ICampaignSheetColumn {
  return {
    id: `order:${key}`,
    key,
    label,
    kind: "custom",
    dataType,
    required: false,
    archived: false,
    options,
    fieldPolicy: "input",
    ai: {
      enabled: false,
      allowedSources: ["row", "campaign"],
      sensitiveBusinessField: false,
      knowledgeDocumentTypes: [],
    },
    display: { order, width, hidden: false, frozen: false },
  };
}

function httpError(message: string, statusCode: number, code?: string) {
  const error = new Error(message) as Error & { statusCode?: number; code?: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function normalizeKey(input: string) {
  const key = String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
  if (!key || BLOCKED_KEYS.has(key)) {
    throw httpError("Khóa trường dữ liệu không hợp lệ.", 400, "INVALID_FIELD_KEY");
  }
  return key;
}

function fieldsToMap(fields: ICampaignSheetStoredField[] = []) {
  return new Map(fields.map((field) => [field.key, field]));
}

function normalizeValue(column: ICampaignSheetColumn, value: unknown) {
  if (value === null || value === undefined || value === "") return "";
  switch (column.dataType) {
    case "number":
    case "currency": {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) throw httpError(`${column.label} phải là số hợp lệ.`, 400, "INVALID_FIELD_VALUE");
      return parsed;
    }
    case "boolean":
      return Boolean(value);
    case "multi_select": {
      const values = Array.isArray(value) ? value.map(String) : [String(value)];
      if (column.options?.length && values.some((item) => !column.options?.includes(item))) {
        throw httpError(`${column.label} chứa lựa chọn không hợp lệ.`, 400, "INVALID_FIELD_VALUE");
      }
      return values;
    }
    case "select": {
      const text = String(value);
      if (column.options?.length && !column.options.includes(text)) {
        throw httpError(`${column.label} chứa lựa chọn không hợp lệ.`, 400, "INVALID_FIELD_VALUE");
      }
      return text;
    }
    case "url":
    case "media_url": {
      const text = String(value).trim();
      if (text && !/^https?:\/\//i.test(text)) {
        throw httpError(`${column.label} phải là URL HTTP/HTTPS hợp lệ.`, 400, "INVALID_FIELD_VALUE");
      }
      return text;
    }
    case "short_text":
      return String(value).slice(0, 1000);
    case "long_text":
      return String(value).slice(0, 10000);
    default:
      return String(value);
  }
}

function parseCampaignScheduleValue(value: unknown, timezone: string) {
  const match = String(value || "").trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})$/);
  if (!match) {
    throw httpError("Schedule must use the YYYY-MM-DDTHH:mm format.", 400, "INVALID_SCHEDULE");
  }
  const [, date, time] = match;
  try {
    return { date, time, scheduledAt: zonedLocalTimeToUtc(date, time, timezone) };
  } catch (error) {
    throw httpError(error instanceof Error ? error.message : "Invalid campaign schedule.", 400, "INVALID_SCHEDULE");
  }
}

function projectSystemValues(slot: any, content: any) {
  return {
    scheduledAt: slot.scheduledAt,
    platform: slot.platform,
    page: slot.integrationId?.displayName || slot.integrationId?.username || "",
    pillar: slot.pillar || "",
    funnelStage: slot.funnelStage || "MOFU",
    objective: slot.objective || "",
    topicBrief: slot.topicBrief || "",
    mediaType: slot.mediaType || "",
    mediaSource: slot.mediaSource || "",
    status: slot.status,
    title: content?.title || "",
    bodyText: content?.bodyText || slot.customBodyText || "",
  };
}

function getKnowledgePageId(integration: unknown) {
  if (!integration || typeof integration !== "object") return undefined;
  const value = integration as { username?: unknown };
  const pageId = String(value.username || "").trim();
  return pageId || undefined;
}

async function assertCampaign(companyCode: string, campaignId: string) {
  if (!mongoose.isValidObjectId(campaignId)) throw httpError("ID chiến dịch không hợp lệ.", 400);
  const campaign = await MarketingCampaignModel.findOne({ _id: campaignId, companyCode }).lean();
  if (!campaign) throw httpError("Không tìm thấy chiến dịch.", 404);
  return campaign;
}

async function getOrCreateConfig(companyCode: string, campaignId: string) {
  const config = await CampaignSheetConfigModel.findOneAndUpdate(
    { companyCode, campaignId },
    {
      $setOnInsert: {
        companyCode,
        campaignId,
        columns: [...DEFAULT_COLUMNS, ...ORDER_INPUT_COLUMNS],
        revision: 1,
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
  const currentKeys = new Set((config.columns || []).map((column) => column.key));
  const missingSystemColumns = [...DEFAULT_COLUMNS, ...ORDER_INPUT_COLUMNS].filter((column) => !currentKeys.has(column.key));
  if (missingSystemColumns.length) {
    config.columns.push(...missingSystemColumns);
    config.revision += 1;
    await config.save();
  }
  return config;
}

async function getOrCreateRow(companyCode: string, campaignId: string, slotId: string) {
  return CampaignSheetRowModel.findOneAndUpdate(
    { companyCode, campaignId, slotId },
    {
      $setOnInsert: {
        companyCode,
        campaignId,
        slotId,
        revision: 0,
        fields: [],
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
  );
}

function serializeConfig(config: any) {
  return {
    id: String(config._id),
    revision: config.revision,
    columns: (config.columns || [])
      .filter((column: ICampaignSheetColumn) => !column.archived)
      .sort((a: ICampaignSheetColumn, b: ICampaignSheetColumn) => a.display.order - b.display.order),
  };
}

export const campaignContentSheetService = {
  limits: {
    maxCustomColumns: MAX_CUSTOM_COLUMNS,
    maxRows: MAX_ROWS,
    maxAiRows: MAX_AI_ROWS,
    maxBulkCells: MAX_BULK_CELLS,
  },

  async getAICostEstimate(companyCode: string, campaignId: string) {
    const campaign = await assertCampaign(companyCode, campaignId);
    return campaign.qualityMode === "budget" ? 0.5 : 2.5;
  },

  async getSheet(companyCode: string, campaignId: string) {
    const campaign = await assertCampaign(companyCode, campaignId);
    const config = await getOrCreateConfig(companyCode, campaignId);
    const slots = await MarketingCampaignSlotModel.find({ companyCode, campaignId })
      .sort({ scheduledAt: 1 })
      .limit(MAX_ROWS)
      .populate("integrationId", "displayName username")
      .lean();
    const slotIds = slots.map((slot) => slot._id);
    const contentIds = slots
      .map((slot) => slot.marketingContentId)
      .filter(Boolean);
    const candidateIds = slots
      .map((slot) => slot.selectedCandidateId)
      .filter(Boolean);
    const [storedRows, contents, candidates] = await Promise.all([
      CampaignSheetRowModel.find({ companyCode, campaignId, slotId: { $in: slotIds } }).lean(),
      MarketingContentModel.find({
        companyCode,
        $or: [
          { campaignSlotId: { $in: slotIds } },
          ...(contentIds.length ? [{ _id: { $in: contentIds } }] : []),
        ],
      })
        .select("campaignSlotId title bodyText outline mediaPrompt mediaUrls status")
        .lean(),
      MarketingCandidateModel.find({
        companyCode,
        ...(candidateIds.length ? { _id: { $in: candidateIds } } : { _id: { $in: [] } }),
      })
        .select("title bodyText outline mediaPrompt")
        .lean(),
    ]);
    const rowMap = new Map(storedRows.map((row) => [String(row.slotId), row]));
    const contentMap = new Map(contents.map((content) => [String(content.campaignSlotId), content]));
    const contentById = new Map(contents.map((content) => [String(content._id), content]));
    const candidateById = new Map(candidates.map((candidate) => [String(candidate._id), candidate]));

    return {
      campaign: {
        id: String(campaign._id),
        title: campaign.title,
        timezone: campaign.timezone,
        status: campaign.status,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        platforms: campaign.platforms,
      },
      config: serializeConfig(config),
      limits: this.limits,
      rows: slots.map((slot) => {
        const row = rowMap.get(String(slot._id));
        const content = contentMap.get(String(slot._id)) || contentById.get(String(slot.marketingContentId || ""));
        const candidate = candidateById.get(String(slot.selectedCandidateId || ""));
        const customFields = Object.fromEntries((row?.fields || []).map((field) => [field.key, field]));
        return {
          slotId: String(slot._id),
          revision: row?.revision || 0,
          readOnly: READ_ONLY_SLOT_STATUSES.has(slot.status),
          system: projectSystemValues(slot, content || candidate),
          fields: customFields,
          updatedAt: row?.updatedAt || slot.updatedAt,
        };
      }),
    };
  },

  async addColumn(companyCode: string, campaignId: string, userId: string, input: any) {
    await assertCampaign(companyCode, campaignId);
    const config = await getOrCreateConfig(companyCode, campaignId);
    const customColumns = config.columns.filter((column) => column.kind === "custom" && !column.archived);
    if (customColumns.length >= MAX_CUSTOM_COLUMNS) {
      throw httpError(`Mỗi chiến dịch được thêm tối đa ${MAX_CUSTOM_COLUMNS} cột tùy chỉnh.`, 400);
    }
    const key = normalizeKey(input.key || input.label);
    if (config.columns.some((column) => column.key === key && !column.archived)) {
      throw httpError("Tên trường đã tồn tại trong sheet.", 409, "DUPLICATE_FIELD_KEY");
    }
    const nowOrder = Math.max(-1, ...config.columns.map((column) => column.display.order)) + 1;
    config.columns.push({
      id: crypto.randomUUID(),
      key,
      label: String(input.label).trim().slice(0, 100),
      kind: "custom",
      dataType: input.dataType,
      required: Boolean(input.required),
      archived: false,
      options: (input.options || []).map(String).map((item: string) => item.trim()).filter(Boolean).slice(0, 100),
      defaultValue: input.defaultValue,
      fieldPolicy: input.fieldPolicy || "input",
      ai: {
        enabled: input.ai?.enabled !== false,
        instruction: String(input.ai?.instruction || "").slice(0, 2000),
        allowedSources: input.ai?.allowedSources?.length ? input.ai.allowedSources : ["row", "campaign"],
        sensitiveBusinessField: Boolean(input.ai?.sensitiveBusinessField),
        knowledgeDocumentTypes: (input.ai?.knowledgeDocumentTypes || []).map(String).slice(0, 20),
      },
      display: {
        order: nowOrder,
        width: input.display?.width || 180,
        hidden: false,
        frozen: false,
      },
    });
    config.revision += 1;
    await config.save();
    await CampaignSheetRevisionModel.create({
      companyCode,
      campaignId,
      actorType: "user",
      actorId: userId,
      operation: "add_column",
      baseRevision: config.revision - 1,
      changes: [],
    });
    return serializeConfig(config);
  },

  async addRow(companyCode: string, campaignId: string, userId: string, input: {
    date: string;
    time: string;
    platform: "Facebook" | "TikTok";
    pillar?: string;
    objective: string;
    topicBrief: string;
    funnelStage?: "TOFU" | "MOFU" | "BOFU";
    mediaType: "text" | "image" | "video" | "human-video";
    mediaSource?: "drive" | "ai" | "upload" | "production_order" | "none";
  }) {
    const campaign = await assertCampaign(companyCode, campaignId);
    if (["completed", "cancelled"].includes(campaign.status)) {
      throw httpError("Chiến dịch đã kết thúc nên không thể thêm bài viết.", 409);
    }
    const currentCount = await MarketingCampaignSlotModel.countDocuments({ companyCode, campaignId });
    if (currentCount >= MAX_ROWS) throw httpError(`Mỗi chiến dịch tối đa ${MAX_ROWS} dòng.`, 400);
    if (!campaign.platforms.includes(input.platform)) {
      throw httpError("Nền tảng chưa được cấu hình trong chiến dịch.", 400);
    }
    const scheduledAt = zonedLocalTimeToUtc(input.date, input.time, campaign.timezone);
    const duplicate = await MarketingCampaignSlotModel.exists({
      companyCode,
      campaignId,
      platform: input.platform,
      scheduledAt,
    });
    if (duplicate) throw httpError("Đã có bài viết cùng nền tảng tại thời điểm này.", 409);
    const resolvedMediaType = input.platform === "TikTok" && input.mediaType === "text" ? "video" : input.mediaType;
    const resolvedMediaSource = resolvedMediaType === "text" ? "none" : input.mediaSource || (campaign.imageMode === "ai" ? "ai" : "drive");
    const slotId = new mongoose.Types.ObjectId();
    const slot = await MarketingCampaignSlotModel.create({
      _id: slotId,
      companyCode,
      campaignId,
      scheduledAt,
      prepareAt: resolveMonthlyPrepareAt({
        campaignStartDate: campaign.startDate,
        slotDate: input.date,
        timezone: campaign.timezone,
        campaignCreatedAt: campaign.createdAt,
        leadDays: campaign.monthlyPreparationLeadDays || 10,
      }),
      verifyAt: new Date(scheduledAt.getTime() - campaign.verificationLeadMinutes * 60_000),
      platform: input.platform,
      integrationId: campaign.integrationIds?.[input.platform],
      pillar: input.pillar || campaign.contentPillars?.[0] || "Nội dung cốt lõi",
      objective: input.objective,
      topicBrief: input.topicBrief,
      funnelStage: input.funnelStage || "MOFU",
      mediaType: resolvedMediaType,
      mediaSource: resolvedMediaSource,
      status: "planned",
      attemptCount: 0,
      publishIdempotencyKey: `${campaignId}:${slotId}:${input.platform}`,
      transitions: [{
        to: "planned",
        reason: `Người dùng ${userId} thêm bài từ Campaign Content Sheet`,
        at: new Date(),
      }],
    });
    await MarketingCampaignModel.updateOne(
      { _id: campaignId, companyCode },
      { $inc: { "statistics.totalSlots": 1 } }
    );
    await getOrCreateRow(companyCode, campaignId, String(slot._id));
    return slot.toObject();
  },

  async updateColumn(companyCode: string, campaignId: string, columnId: string, userId: string, input: any) {
    await assertCampaign(companyCode, campaignId);
    const config = await getOrCreateConfig(companyCode, campaignId);
    const column = config.columns.find((item) => item.id === columnId);
    if (!column) throw httpError("Không tìm thấy cột dữ liệu.", 404);
    if (column.kind === "system" && (input.key || input.dataType || input.archived)) {
      throw httpError("Không thể thay đổi định danh hoặc xóa cột hệ thống.", 400);
    }
    if (input.label !== undefined) column.label = String(input.label).trim().slice(0, 100);
    if (input.required !== undefined) column.required = Boolean(input.required);
    if (input.options !== undefined) column.options = input.options.map(String).slice(0, 100);
    if (input.fieldPolicy !== undefined) column.fieldPolicy = input.fieldPolicy;
    if (input.archived !== undefined && column.kind === "custom") column.archived = Boolean(input.archived);
    if (input.ai) column.ai = { ...column.ai, ...input.ai };
    if (input.display) column.display = { ...column.display, ...input.display };
    config.revision += 1;
    await config.save();
    await CampaignSheetRevisionModel.create({
      companyCode,
      campaignId,
      actorType: "user",
      actorId: userId,
      operation: "update_column",
      baseRevision: config.revision - 1,
      changes: [],
    });
    return serializeConfig(config);
  },

  async archiveColumn(companyCode: string, campaignId: string, columnId: string, userId: string) {
    return this.updateColumn(companyCode, campaignId, columnId, userId, { archived: true });
  },

  async updateRow(
    companyCode: string,
    campaignId: string,
    slotId: string,
    userId: string,
    input: {
      expectedRevision: number;
      changes: Array<{
        key: string;
        value?: unknown;
        locked?: boolean;
        references?: ICampaignSheetReference[];
      }>;
    },
    actorType: "user" | "ai" = "user",
    generationId?: string
  ) {
    const campaign = await assertCampaign(companyCode, campaignId);
    const slot = await MarketingCampaignSlotModel.findOne({ _id: slotId, campaignId, companyCode });
    if (!slot) throw httpError("Không tìm thấy bài viết trong chiến dịch.", 404);
    if (READ_ONLY_SLOT_STATUSES.has(slot.status)) {
      throw httpError("Bài viết đã xuất bản hoặc đã hủy nên không thể chỉnh sửa Sheet.", 409, "ROW_READ_ONLY");
    }
    const config = await getOrCreateConfig(companyCode, campaignId);
    const columnMap = new Map(config.columns.filter((column) => !column.archived).map((column) => [column.key, column]));
    const row = await getOrCreateRow(companyCode, campaignId, slotId);
    if (row.revision !== input.expectedRevision) {
      throw httpError("Dòng dữ liệu đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", 409, "REVISION_CONFLICT");
    }
    const currentFields = fieldsToMap(row.fields);
    const nextFields = new Map(currentFields);
    const canonicalUpdates: Record<string, unknown> = {};
    const revisionChanges: Array<{ slotId: string; fieldKey: string; before?: unknown; after?: unknown }> = [];
    const now = new Date();

    for (const change of input.changes) {
      const key = normalizeKey(change.key);
      const column = columnMap.get(key);
      if (!column) throw httpError(`Trường ${key} không tồn tại trong sheet.`, 400, "UNKNOWN_FIELD");
      const existing = currentFields.get(key);
      if (existing?.locked && change.locked !== false && change.value !== existing.value) {
        throw httpError(`Trường ${column.label} đang bị khóa.`, 409, "FIELD_LOCKED");
      }
      const value = normalizeValue(column, change.value);
      revisionChanges.push({ slotId, fieldKey: key, before: existing?.value, after: value });

      if (EDITABLE_CANONICAL_FIELDS.has(key)) {
        canonicalUpdates[key] = value;
        nextFields.set(key, {
          key,
          value,
          source: actorType === "ai" ? "ai" : "user",
          locked: change.locked ?? existing?.locked ?? false,
          updatedBy: userId,
          updatedAt: now,
          generationId,
          references: change.references ?? existing?.references ?? [],
        });
      } else if (!["scheduledAt", "platform", "page", "status"].includes(key)) {
        nextFields.set(key, {
          key,
          value,
          source: actorType === "ai" ? "ai" : "user",
          locked: change.locked ?? existing?.locked ?? false,
          updatedBy: userId,
          updatedAt: now,
          generationId,
          references: change.references ?? existing?.references ?? [],
        });
      } else {
        throw httpError(`Cột ${column.label} hiện chỉ được xem.`, 400, "FIELD_READ_ONLY");
      }
    }

    const hasScheduleChange = "scheduledAt" in canonicalUpdates;
    const hasConfigurationChange = ["scheduledAt", "platform", "mediaType", "mediaSource"].some((key) => key in canonicalUpdates);
    if (hasConfigurationChange) {
      if (!CONFIGURABLE_SLOT_STATUSES.has(slot.status)) {
        throw httpError("Slot configuration is locked after approval or publishing begins.", 409, "SLOT_CONFIGURATION_LOCKED");
      }
      const nextPlatform = String(canonicalUpdates.platform || slot.platform);
      const nextMediaType = String(canonicalUpdates.mediaType || slot.mediaType);
      const nextMediaSource = String(canonicalUpdates.mediaSource || slot.mediaSource || "drive");
      const schedule = hasScheduleChange
        ? parseCampaignScheduleValue(canonicalUpdates.scheduledAt, campaign.timezone)
        : null;
      const nextScheduledAt = schedule?.scheduledAt || slot.scheduledAt;
      if (schedule && (schedule.date < campaign.startDate || schedule.date > campaign.endDate)) {
        throw httpError("Schedule must stay within the campaign date range.", 400, "SCHEDULE_OUTSIDE_CAMPAIGN_RANGE");
      }
      if (nextPlatform !== "Facebook" && nextPlatform !== "TikTok") {
        throw httpError("Invalid platform.", 400, "INVALID_PLATFORM");
      }
      if (!campaign.platforms.includes(nextPlatform as "Facebook" | "TikTok")) {
        throw httpError("Platform is not enabled for this campaign.", 400, "PLATFORM_NOT_ENABLED");
      }
      if (nextPlatform === "TikTok" && !["video", "human-video"].includes(nextMediaType)) {
        throw httpError("TikTok accepts video or human-video only.", 400, "TIKTOK_VIDEO_ONLY");
      }
      if (nextMediaType === "text" && nextMediaSource !== "none") {
        throw httpError("Text-only posts must use media source none.", 400, "INVALID_MEDIA_SOURCE");
      }
      if (nextMediaType !== "text" && nextMediaSource === "none") {
        throw httpError("Posts with media must select a valid media source.", 400, "INVALID_MEDIA_SOURCE");
      }
      if (hasScheduleChange || nextPlatform !== slot.platform) {
        const duplicate = await MarketingCampaignSlotModel.exists({
          companyCode,
          campaignId,
          _id: { $ne: slot._id },
          platform: nextPlatform,
          scheduledAt: nextScheduledAt,
        });
        if (duplicate) {
          throw httpError("Another post is already scheduled for this platform at that time.", 409, "DUPLICATE_SLOT_SCHEDULE");
        }
      }
      if (schedule) {
        canonicalUpdates.scheduledAt = schedule.scheduledAt;
        canonicalUpdates.prepareAt = resolveMonthlyPrepareAt({
          campaignStartDate: campaign.startDate,
          slotDate: schedule.date,
          timezone: campaign.timezone,
          campaignCreatedAt: campaign.createdAt,
          leadDays: campaign.monthlyPreparationLeadDays || 10,
        });
        canonicalUpdates.verifyAt = new Date(schedule.scheduledAt.getTime() - campaign.verificationLeadMinutes * 60_000);
      }
      if (nextPlatform !== slot.platform) {
        if (slot.marketingContentId) throw httpError("Cannot change platform after final content exists.", 409, "PLATFORM_CHANGE_REQUIRES_RESET");
        canonicalUpdates.integrationId = campaign.integrationIds?.[nextPlatform as "Facebook" | "TikTok"] || null;
        canonicalUpdates.publishIdempotencyKey = `${campaignId}:${slot._id}:${nextPlatform}`;
        canonicalUpdates.tiktokPublishOptions = null;
        canonicalUpdates.approvedBy = null;
        canonicalUpdates.approvedAt = null;
      }
    }

    const updatedRow = await CampaignSheetRowModel.findOneAndUpdate(
      { _id: row._id, companyCode, campaignId, slotId, revision: input.expectedRevision },
      {
        $set: {
          fields: Array.from(nextFields.values()),
          lastEditedBy: userId,
          lastEditedAt: now,
        },
        $inc: { revision: 1 },
      },
      { returnDocument: "after" }
    );
    if (!updatedRow) {
      throw httpError("Dòng dữ liệu đã được cập nhật ở nơi khác. Hãy tải lại trước khi lưu.", 409, "REVISION_CONFLICT");
    }
    if (Object.keys(canonicalUpdates).length > 0) {
      await MarketingCampaignSlotModel.updateOne(
        { _id: slotId, campaignId, companyCode, status: { $nin: ["published", "cancelled"] } },
        { $set: canonicalUpdates }
      );
    }
    await CampaignSheetRevisionModel.create({
      companyCode,
      campaignId,
      actorType,
      actorId: userId,
      operation: actorType === "ai" ? "apply_ai_proposal" : "update_row",
      baseRevision: input.expectedRevision,
      changes: revisionChanges,
      generationJobId: generationId && mongoose.isValidObjectId(generationId) ? generationId : undefined,
    });
    return {
      slotId,
      revision: updatedRow.revision,
      system: projectSystemValues({ ...slot.toObject(), ...canonicalUpdates }, null),
      fields: Object.fromEntries(updatedRow.fields.map((field) => [field.key, field])),
      campaignStatus: campaign.status,
    };
  },

  async updateCells(
    companyCode: string,
    campaignId: string,
    userId: string,
    input: {
      rows: Array<{
        slotId: string;
        expectedRevision: number;
        changes: Array<{ key: string; value?: unknown; locked?: boolean }>;
      }>;
    }
  ) {
    await assertCampaign(companyCode, campaignId);
    const totalCells = input.rows.reduce((sum, row) => sum + row.changes.length, 0);
    if (!input.rows.length || input.rows.length > MAX_ROWS || totalCells > MAX_BULK_CELLS) {
      throw httpError(
        `Mỗi lần dán được tối đa ${MAX_ROWS} dòng và ${MAX_BULK_CELLS} ô.`,
        400,
        "BULK_CELL_LIMIT"
      );
    }
    const results: Array<Awaited<ReturnType<typeof this.updateRow>>> = [];
    const conflicts: Array<{ slotId: string; code?: string; message: string }> = [];
    let updatedCells = 0;
    const batchSize = 5;
    for (let index = 0; index < input.rows.length; index += batchSize) {
      const batch = input.rows.slice(index, index + batchSize);
      const settled = await Promise.all(batch.map(async (rowInput) => {
        try {
          const result = await this.updateRow(
            companyCode,
            campaignId,
            rowInput.slotId,
            userId,
            {
              expectedRevision: rowInput.expectedRevision,
              changes: rowInput.changes,
            }
          );
          return { result, updatedCells: rowInput.changes.length };
        } catch (error) {
          return {
            conflict: {
              slotId: rowInput.slotId,
              code: (error as { code?: string })?.code,
              message: error instanceof Error ? error.message : "Không thể lưu dữ liệu đã dán.",
            },
          };
        }
      }));
      for (const item of settled) {
        if ("result" in item && item.result) {
          results.push(item.result);
          updatedCells += item.updatedCells || 0;
        }
        if ("conflict" in item && item.conflict) conflicts.push(item.conflict);
      }
    }
    return { results, conflicts, updatedCells };
  },

  async createAIPreview(
    companyCode: string,
    campaignId: string,
    userId: string,
    input: {
      slotId: string;
      targetFieldKeys: string[];
      expectedRevision: number;
      overwritePolicy?: "empty_only" | "suggest_only" | "replace_selected";
      instruction?: string;
      idempotencyKey: string;
    }
  ) {
    const campaign = await assertCampaign(companyCode, campaignId);
    const slot = await MarketingCampaignSlotModel.findOne({ _id: input.slotId, campaignId, companyCode })
      .populate("integrationId", "username")
      .lean();
    if (!slot) throw httpError("Không tìm thấy bài viết trong chiến dịch.", 404);
    const config = await getOrCreateConfig(companyCode, campaignId);
    const row = await getOrCreateRow(companyCode, campaignId, input.slotId);
    if (row.revision !== input.expectedRevision) {
      throw httpError("Dòng dữ liệu đã thay đổi. Hãy tải lại trước khi dùng AI.", 409, "REVISION_CONFLICT");
    }
    const fields = fieldsToMap(row.fields);
    const system = projectSystemValues(slot, null);
    const targetColumns = input.targetFieldKeys.map((rawKey) => {
      const key = normalizeKey(rawKey);
      const column = config.columns.find((item) => item.key === key && !item.archived);
      if (!column || !column.ai.enabled) throw httpError(`AI không được bật cho trường ${key}.`, 400);
      const current = fields.get(key);
      if (current?.locked) throw httpError(`Trường ${column.label} đang bị khóa.`, 409, "FIELD_LOCKED");
      const currentValue = current?.value ?? system[key as keyof typeof system];
      if ((input.overwritePolicy || "empty_only") === "empty_only" && currentValue) {
        throw httpError(`Trường ${column.label} đã có dữ liệu.`, 409, "FIELD_NOT_EMPTY");
      }
      return column;
    });
    const existingJob = await CampaignSheetAIJobModel.findOne({ companyCode, idempotencyKey: input.idempotencyKey }).lean();
    if (existingJob) return existingJob;

    const query = [
      campaign.sourceBrief,
      slot.pillar,
      slot.objective,
      slot.topicBrief,
      ...Array.from(fields.values()).map((field) => `${field.key}: ${String(field.value || "")}`),
    ].filter(Boolean).join("\n");
    const needsKnowledge = targetColumns.some((column) =>
      column.ai.sensitiveBusinessField || column.ai.allowedSources.includes("knowledge")
    );
    const knowledge = needsKnowledge
      ? await aiKnowledgeService.searchRelevantContext({
          companyCode,
          query,
          channel: slot.platform === "TikTok" ? "tiktok" : "facebook",
          purpose: "marketing",
          topK: 5,
          pageId: getKnowledgePageId(slot.integrationId),
          documentTypes: Array.from(
            new Set(targetColumns.flatMap((column) => column.ai.knowledgeDocumentTypes || []))
          ) as KnowledgeDocumentType[],
        })
      : { contextText: "", items: [], matches: 0 };

    const warnings: string[] = [];
    const allowedColumns = targetColumns.filter((column) => {
      if (column.ai.sensitiveBusinessField && !knowledge.matches) {
        warnings.push(`${column.label}: chưa có bằng chứng phù hợp trong kho tri thức.`);
        return false;
      }
      return true;
    });
    const rowContext = Object.fromEntries(Array.from(fields.values()).map((field) => [field.key, field.value]));
    let generatedFields: Record<string, { value: unknown; confidence?: number }> = {};

    if (allowedColumns.length > 0) {
      const model = campaign.qualityMode === "budget"
        ? (process.env.CAMPAIGN_BUDGET_MODEL || "qwen/qwen-3.6-flash")
        : (process.env.CAMPAIGN_PREMIUM_MODEL || "google/gemini-3.5-flash");
      const result = await openrouterChat({
        model,
        temperature: 0.65,
        jsonMode: true,
        responseSchema: {
          type: "object",
          properties: Object.fromEntries(allowedColumns.map((column) => [
            column.key,
            {
              type: "object",
              properties: {
                value: { type: column.dataType === "number" || column.dataType === "currency" ? "number" : "string" },
                confidence: { type: "number" },
              },
              required: ["value", "confidence"],
            },
          ])),
          required: allowedColumns.map((column) => column.key),
        },
        messages: [
          {
            role: "system",
            content: "Bạn là trợ lý điền dữ liệu Campaign Content Sheet. Chỉ tạo các trường được yêu cầu. Không bịa giá, ưu đãi, chính sách, tồn kho, liên hệ hoặc cam kết. Trả JSON đúng schema.",
          },
          {
            role: "user",
            content: `CHIẾN DỊCH:\n${campaign.sourceBrief}\n\nDỮ LIỆU SLOT:\n${JSON.stringify(system)}\n\nDỮ LIỆU NGƯỜI DÙNG:\n${JSON.stringify(rowContext)}\n\nKHO TRI THỨC:\n${knowledge.contextText || "Không có"}\n\nTRƯỜNG CẦN TẠO:\n${allowedColumns.map((column) => `- ${column.key} (${column.label}): ${column.ai.instruction || "Điền phù hợp dữ liệu hiện có"}`).join("\n")}\n\nYÊU CẦU THÊM:\n${input.instruction || "Không có"}`,
          },
        ],
      });
      try {
        generatedFields = JSON.parse(result.text);
      } catch {
        throw httpError("AI trả về dữ liệu không hợp lệ.", 502, "INVALID_AI_RESPONSE");
      }
    }

    const references: ICampaignSheetReference[] = (knowledge.items || []).slice(0, 5).flatMap((item: any) => [
      {
        kind: "knowledge_document" as const,
        id: item.documentId,
        title: item.title,
        version: item.version,
        excerpt: String(item.text || "").slice(0, 300),
      },
      {
        kind: "knowledge_chunk" as const,
        id: item.chunkId,
        title: item.title,
        version: item.version,
        excerpt: String(item.text || "").slice(0, 300),
      },
    ]);
    const proposalFields = allowedColumns.map((column) => ({
      key: column.key,
      value: normalizeValue(column, generatedFields[column.key]?.value ?? ""),
      confidence: Math.max(0, Math.min(1, Number(generatedFields[column.key]?.confidence || 0))),
      references: column.ai.allowedSources.includes("knowledge") ? references : [],
    }));
    const estimatedCost = campaign.qualityMode === "budget" ? 0.5 : 2.5;
    const job = await CampaignSheetAIJobModel.create({
      companyCode,
      campaignId,
      createdBy: userId,
      operation: targetColumns.length === 1 ? "cell" : "row",
      overwritePolicy: input.overwritePolicy || "empty_only",
      targetSlotIds: [slot._id],
      targetFieldKeys: targetColumns.map((column) => column.key),
      status: "awaiting_review",
      totalItems: targetColumns.length,
      completedItems: proposalFields.length,
      failedItems: targetColumns.length - proposalFields.length,
      conflictedItems: 0,
      progress: 100,
      modelName: campaign.qualityMode || "premium",
      estimatedCost,
      actualCost: estimatedCost,
      idempotencyKey: input.idempotencyKey,
      proposals: [{
        slotId: slot._id,
        expectedRevision: row.revision,
        fields: proposalFields,
        warnings,
        status: proposalFields.length > 0 ? "proposed" : "failed",
      }],
      completedAt: new Date(),
    });
    return job.toObject();
  },

  async applyAIProposal(companyCode: string, campaignId: string, jobId: string, userId: string, fieldKeys?: string[]) {
    const job = await CampaignSheetAIJobModel.findOne({ _id: jobId, companyCode, campaignId });
    if (!job) throw httpError("Không tìm thấy đề xuất AI.", 404);
    if (!["awaiting_review", "partial"].includes(job.status)) {
      throw httpError("Đề xuất AI không còn ở trạng thái có thể áp dụng.", 409);
    }
    job.status = "applying";
    await job.save();
    let applied = 0;
    let conflicted = 0;
    for (const proposal of job.proposals) {
      const selectedFields = proposal.fields.filter((field) => !fieldKeys?.length || fieldKeys.includes(field.key));
      try {
        await this.updateRow(
          companyCode,
          campaignId,
          String(proposal.slotId),
          userId,
          {
            expectedRevision: proposal.expectedRevision,
            changes: selectedFields.map((field) => ({
              key: field.key,
              value: field.value,
              references: field.references,
            })),
          },
          "ai",
          String(job._id)
        );
        proposal.status = "applied";
        applied += selectedFields.length;
      } catch (error: any) {
        proposal.status = error?.code === "REVISION_CONFLICT" ? "conflict" : "failed";
        if (proposal.status === "conflict") conflicted += 1;
      }
    }
    job.conflictedItems = conflicted;
    job.status = conflicted > 0 ? "partial" : "completed";
    job.completedAt = new Date();
    await job.save();
    return { job: job.toObject(), applied, conflicted };
  },

  async createBulkAIJob(
    companyCode: string,
    campaignId: string,
    userId: string,
    input: {
      slotIds: string[];
      targetFieldKeys: string[];
      overwritePolicy?: "empty_only" | "suggest_only" | "replace_selected";
      idempotencyKey: string;
    }
  ) {
    const campaign = await assertCampaign(companyCode, campaignId);
    const slotIds = Array.from(new Set(input.slotIds.map(String)));
    if (slotIds.length === 0 || slotIds.length > MAX_AI_ROWS) {
      throw httpError(`Mỗi lượt AI hàng loạt xử lý từ 1 đến ${MAX_AI_ROWS} dòng.`, 400);
    }
    const config = await getOrCreateConfig(companyCode, campaignId);
    const targetFieldKeys = Array.from(new Set(input.targetFieldKeys.map(normalizeKey)));
    const availableKeys = new Set(
      config.columns.filter((column) => !column.archived && column.ai.enabled).map((column) => column.key)
    );
    if (!targetFieldKeys.length || targetFieldKeys.some((key) => !availableKeys.has(key))) {
      throw httpError("Có trường không tồn tại hoặc chưa được phép dùng AI.", 400);
    }
    const validSlots = await MarketingCampaignSlotModel.countDocuments({
      _id: { $in: slotIds },
      companyCode,
      campaignId,
      status: { $nin: ["published", "cancelled"] },
    });
    if (validSlots !== slotIds.length) {
      throw httpError("Một số dòng không thuộc chiến dịch hoặc không còn được chỉnh sửa.", 400);
    }
    const existing = await CampaignSheetAIJobModel.findOne({
      companyCode,
      idempotencyKey: input.idempotencyKey,
    }).lean();
    if (existing) return existing;
    const unitCost = campaign.qualityMode === "budget" ? 0.5 : 2.5;
    const job = await CampaignSheetAIJobModel.create({
      companyCode,
      campaignId,
      createdBy: userId,
      operation: targetFieldKeys.length === 1 ? "column" : "selection",
      overwritePolicy: input.overwritePolicy || "empty_only",
      targetSlotIds: slotIds,
      targetFieldKeys,
      status: "queued",
      totalItems: slotIds.length,
      completedItems: 0,
      failedItems: 0,
      conflictedItems: 0,
      progress: 0,
      modelName: campaign.qualityMode || "premium",
      estimatedCost: unitCost * slotIds.length,
      actualCost: 0,
      idempotencyKey: input.idempotencyKey,
      proposals: [],
      attemptCount: 0,
    });
    return job.toObject();
  },

  async processBulkAIJob(jobId: string) {
    const lockId = crypto.randomUUID();
    const now = new Date();
    const lockExpiresAt = new Date(now.getTime() + 20 * 60_000);
    const job = await CampaignSheetAIJobModel.findOneAndUpdate(
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
        $set: { status: "processing", lockId, lockedAt: now, lockExpiresAt, startedAt: now, errorMessage: "" },
        $inc: { attemptCount: 1 },
      },
      { returnDocument: "after" }
    );
    if (!job) return null;

    const campaign = await MarketingCampaignModel.findOne({ _id: job.campaignId, companyCode: job.companyCode }).lean();
    if (!campaign) throw httpError("Chiến dịch của AI job không còn tồn tại.", 404);
    const unitCost = campaign.qualityMode === "budget" ? 0.5 : 2.5;
    const existingProposalSlots = new Set(job.proposals.map((proposal) => String(proposal.slotId)));
    const pendingSlotIds = job.targetSlotIds.filter((slotId) => !existingProposalSlots.has(String(slotId)));
    const batchSize = 2;

    for (let index = 0; index < pendingSlotIds.length; index += batchSize) {
      const latest = await CampaignSheetAIJobModel.findById(job._id).select("cancelRequestedAt status").lean();
      if (latest?.cancelRequestedAt || latest?.status === "cancelled") {
        await CampaignSheetAIJobModel.updateOne(
          { _id: job._id, lockId },
          { $set: { status: "cancelled", completedAt: new Date(), progress: Math.round((job.completedItems / Math.max(job.totalItems, 1)) * 100) }, $unset: { lockId: 1, lockExpiresAt: 1 } }
        );
        return CampaignSheetAIJobModel.findById(job._id).lean();
      }

      const batch = pendingSlotIds.slice(index, index + batchSize);
      const batchResults = await Promise.all(batch.map(async (slotId) => {
        try {
          const row = await getOrCreateRow(job.companyCode, String(job.campaignId), String(slotId));
          const childKey = `${job.idempotencyKey}:${String(slotId)}`.slice(0, 200);
          const child = await this.createAIPreview(
            job.companyCode,
            String(job.campaignId),
            job.createdBy,
            {
              slotId: String(slotId),
              targetFieldKeys: job.targetFieldKeys,
              expectedRevision: row.revision,
              overwritePolicy: job.overwritePolicy,
              idempotencyKey: childKey,
            }
          );
          await walletService.deductBalance(
            job.createdBy,
            Number(child.actualCost || unitCost),
            "Chi phí AI hàng loạt Campaign Content Sheet",
            `campaign-sheet-ai:${job.companyCode}:${childKey}`
          );
          return {
            proposal: child.proposals?.[0] || {
              slotId,
              expectedRevision: row.revision,
              fields: [],
              warnings: ["AI không trả về đề xuất."],
              status: "failed",
            },
            failed: child.proposals?.[0]?.fields?.length ? 0 : 1,
            cost: Number(child.actualCost || unitCost),
          };
        } catch (error) {
          return {
            proposal: {
              slotId,
              expectedRevision: 0,
              fields: [],
              warnings: [error instanceof Error ? error.message : "AI xử lý dòng thất bại."],
              status: "failed" as const,
            },
            failed: 1,
            cost: 0,
          };
        }
      }));

      const completed = job.completedItems + Math.min(index + batch.length, pendingSlotIds.length);
      const failedDelta = batchResults.reduce((sum, result) => sum + result.failed, 0);
      const costDelta = batchResults.reduce((sum, result) => sum + result.cost, 0);
      await CampaignSheetAIJobModel.updateOne(
        { _id: job._id, lockId },
        {
          $push: { proposals: { $each: batchResults.map((result) => result.proposal) } },
          $set: {
            completedItems: completed,
            progress: Math.round((completed / Math.max(job.totalItems, 1)) * 100),
            lockExpiresAt: new Date(Date.now() + 20 * 60_000),
          },
          $inc: { failedItems: failedDelta, actualCost: costDelta },
        }
      );
    }

    const finalJob = await CampaignSheetAIJobModel.findById(job._id);
    if (!finalJob) return null;
    const proposedCount = finalJob.proposals.filter((proposal) => proposal.fields.length > 0).length;
    finalJob.status = proposedCount === 0 ? "failed" : finalJob.failedItems > 0 ? "partial" : "awaiting_review";
    finalJob.progress = 100;
    finalJob.completedAt = new Date();
    finalJob.lockId = undefined;
    finalJob.lockExpiresAt = undefined;
    await finalJob.save();
    return finalJob.toObject();
  },

  async failBulkAIJob(jobId: string, error: unknown) {
    const message = error instanceof Error ? error.message : "AI job hàng loạt thất bại.";
    return CampaignSheetAIJobModel.findByIdAndUpdate(
      jobId,
      {
        $set: { status: "failed", errorMessage: message.slice(0, 1000), completedAt: new Date() },
        $unset: { lockId: 1, lockExpiresAt: 1 },
      },
      { returnDocument: "after" }
    );
  },

  async getAIJob(companyCode: string, campaignId: string, jobId: string) {
    await assertCampaign(companyCode, campaignId);
    const job = await CampaignSheetAIJobModel.findOne({ _id: jobId, companyCode, campaignId }).lean();
    if (!job) throw httpError("Không tìm thấy AI job.", 404);
    return job;
  },

  async cancelAIJob(companyCode: string, campaignId: string, jobId: string) {
    await assertCampaign(companyCode, campaignId);
    const job = await CampaignSheetAIJobModel.findOneAndUpdate(
      { _id: jobId, companyCode, campaignId, status: { $in: ["queued", "processing"] } },
      [
        {
          $set: {
            cancelRequestedAt: "$$NOW",
            status: { $cond: [{ $eq: ["$status", "queued"] }, "cancelled", "$status"] },
            completedAt: { $cond: [{ $eq: ["$status", "queued"] }, "$$NOW", "$completedAt"] },
          },
        },
      ],
      { returnDocument: "after" }
    );
    if (!job) throw httpError("AI job không còn ở trạng thái có thể hủy.", 409);
    return job.toObject();
  },

  async retryAIJob(companyCode: string, campaignId: string, jobId: string) {
    await assertCampaign(companyCode, campaignId);
    const job = await CampaignSheetAIJobModel.findOne({
      _id: jobId,
      companyCode,
      campaignId,
      status: { $in: ["failed", "partial", "cancelled"] },
    });
    if (!job) throw httpError("AI job không thể thử lại ở trạng thái hiện tại.", 409);
    job.proposals = job.proposals.filter((proposal) =>
      proposal.status !== "failed" && proposal.fields.length > 0
    ) as typeof job.proposals;
    job.completedItems = job.proposals.length;
    job.failedItems = 0;
    job.conflictedItems = 0;
    job.progress = Math.round((job.completedItems / Math.max(job.totalItems, 1)) * 100);
    job.status = "queued";
    job.errorMessage = "";
    job.cancelRequestedAt = undefined;
    job.completedAt = undefined;
    job.lockId = undefined;
    job.lockedAt = undefined;
    job.lockExpiresAt = undefined;
    await job.save();
    return job.toObject();
  },

  async recoverStaleAIJobs() {
    const now = new Date();
    const staleJobs = await CampaignSheetAIJobModel.find({
      status: "processing",
      lockExpiresAt: { $lte: now },
    }).select("_id").lean();
    if (staleJobs.length) {
      await CampaignSheetAIJobModel.updateMany(
        { _id: { $in: staleJobs.map((job) => job._id) } },
        { $set: { status: "queued" }, $unset: { lockId: 1, lockExpiresAt: 1 } }
      );
    }
    return staleJobs.map((job) => String(job._id));
  },

  async getWorkerInput(companyCode: string, campaignId: string, slotId: string) {
    const [config, row] = await Promise.all([
      CampaignSheetConfigModel.findOne({ companyCode, campaignId }).lean(),
      CampaignSheetRowModel.findOne({ companyCode, campaignId, slotId }).lean(),
    ]);
    if (!config || !row) {
      return {
        contextText: "",
        titleOverride: "",
        bodyOverride: "",
        rowRevision: 0,
        configRevision: config?.revision || 0,
      };
    }
    const columnMap = new Map(config.columns.filter((column) => !column.archived).map((column) => [column.key, column]));
    const contextLines: string[] = [];
    let titleOverride = "";
    let bodyOverride = "";

    for (const field of row.fields) {
      const column = columnMap.get(field.key);
      if (!column || field.value === "" || field.value === null || field.value === undefined) continue;
      const value = Array.isArray(field.value) ? field.value.join(", ") : String(field.value);
      const source = field.references?.length
        ? ` | Nguồn: ${field.references.map((reference) => reference.title || reference.id).filter(Boolean).slice(0, 3).join(", ")}`
        : "";
      contextLines.push(`- ${column.label} [${column.fieldPolicy}${field.locked ? ", đã khóa" : ""}]: ${value}${source}`);
      if (field.locked && column.fieldPolicy === "approved_override") {
        if (field.key === "title") titleOverride = value;
        if (field.key === "bodyText") bodyOverride = value;
      }
    }

    return {
      contextText: contextLines.length
        ? `DỮ LIỆU CONTENT SHEET ĐÃ ĐƯỢC NGƯỜI DÙNG CHẤP NHẬN (phải tôn trọng, không tự thêm dữ kiện trái ngược):\n${contextLines.join("\n")}`
        : "",
      titleOverride,
      bodyOverride,
      rowRevision: row.revision,
      configRevision: config.revision,
    };
  },

  async listRevisions(companyCode: string, campaignId: string, limit = 50) {
    await assertCampaign(companyCode, campaignId);
    return CampaignSheetRevisionModel.find({ companyCode, campaignId })
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean();
  },

  async revertRevision(companyCode: string, campaignId: string, revisionId: string, userId: string) {
    await assertCampaign(companyCode, campaignId);
    const revision = await CampaignSheetRevisionModel.findOne({ _id: revisionId, companyCode, campaignId }).lean();
    if (!revision) throw httpError("Không tìm thấy phiên bản cần hoàn tác.", 404);
    const alreadyReverted = await CampaignSheetRevisionModel.exists({
      companyCode,
      campaignId,
      operation: `revert:${revisionId}`,
    });
    if (alreadyReverted) throw httpError("Phiên bản này đã được hoàn tác trước đó.", 409);
    const grouped = new Map<string, Array<{ key: string; value: unknown }>>();
    for (const change of revision.changes) {
      const slotId = String(change.slotId);
      const changes = grouped.get(slotId) || [];
      changes.push({ key: change.fieldKey, value: change.before ?? "" });
      grouped.set(slotId, changes);
    }
    let revertedRows = 0;
    const conflicts: string[] = [];
    for (const [slotId, changes] of grouped) {
      try {
        const row = await getOrCreateRow(companyCode, campaignId, slotId);
        await this.updateRow(
          companyCode,
          campaignId,
          slotId,
          userId,
          { expectedRevision: row.revision, changes },
          "user"
        );
        revertedRows += 1;
      } catch (error) {
        conflicts.push(`${slotId}: ${error instanceof Error ? error.message : "Không thể hoàn tác"}`);
      }
    }
    await CampaignSheetRevisionModel.create({
      companyCode,
      campaignId,
      actorType: "user",
      actorId: userId,
      operation: `revert:${revisionId}`,
      baseRevision: revision.baseRevision,
      changes: [],
    });
    return { revertedRows, conflicts };
  },
};
