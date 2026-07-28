import mongoose from "mongoose";
import { v2 as cloudinary } from "cloudinary";
import type {
  NormalizedVideoTemplateListQuery,
  VideoTemplateAspectRatio,
  VideoTemplateIdentity,
} from "../interface/video-template.interface";
import { VideoProjectModel } from "../model/video-project.model";
import { VideoTemplateModel } from "../model/video-template.model";
import { VideoTemplateVersionModel } from "../model/video-template-version.model";
import { VideoProjectRenderModel } from "../model/video-project-render.model";
import { buildVideoTemplateVisibilityFilter } from "./video-template-policy";
import {
  buildVideoProjectMediaFolder,
  validateVideoProjectMedia,
  type VideoProjectMediaInput,
} from "./video-project-media-policy";
import { reconcileActiveShotstackRenders } from "./shotstack-render.service";
import { requestVideoTemplatePreview } from "./video-template-preview.service";

export class UncertainPreviewSubmissionError extends Error {
  constructor(message = "Trạng thái gửi Shotstack chưa chắc chắn. Hãy kiểm tra My Renders trước khi thử lại.") {
    super(message);
    this.name = "UncertainPreviewSubmissionError";
  }
}

type SnapshotInput = {
  title: string;
  aspectRatio: VideoTemplateAspectRatio;
  sourceMediaUrl?: string;
  blueprint: Record<string, unknown>;
  defaultValues: Record<string, unknown>;
};

type TemplateVersionSnapshotInput = {
  title: string;
  description?: string;
  thumbnailUrl: string;
  previewVideoUrl?: string;
  duration: number;
  aspectRatio: VideoTemplateAspectRatio;
  categoryId?: string;
  tags?: string[];
};

type EditorProjectInput = {
  title: string;
  description?: string;
  categoryId?: string;
  tags?: string[];
  aspectRatio: VideoTemplateAspectRatio;
  duration: number;
  mode: "edit-project" | "create-template";
  tracks: Array<Record<string, unknown>>;
  items: Array<Record<string, unknown>>;
  coverUrl?: string;
};

function defaultTracks() {
  return [
    { id: "track-video", type: "video", name: "Track Video" },
    { id: "track-text", type: "text", name: "Track chữ" },
    { id: "track-audio", type: "audio", name: "Track âm thanh" },
  ];
}

function editorStateFromTemplate(template: Record<string, unknown>) {
  const duration = Number(template.duration) || 10;
  const sourceUrl = String(template.previewVideoUrl || template.thumbnailUrl || "");
  return {
    description: String(template.description || ""),
    categoryId: String(template.categoryId || ""),
    tags: Array.isArray(template.tags) ? template.tags : [],
    mode: "edit-project" as const,
    tracks: defaultTracks(),
    items: sourceUrl ? [{
      id: "item-v1",
      trackId: "track-video",
      type: "video",
      start: 0,
      duration,
      sourceUrl,
      thumbnailUrl: String(template.thumbnailUrl || sourceUrl),
      replaceable: true,
      volume: 1,
      fitMode: "cover",
      rotation: 0,
      label: String(template.title || "Video"),
      order: 1,
    }] : [],
  };
}

function serializeProject(project: Record<string, unknown>) {
  const editorState = (project.editorState || {}) as Record<string, unknown>;
  return {
    id: String(project._id),
    sourceTemplateId: project.sourceTemplateId ? String(project.sourceTemplateId) : undefined,
    sourceTemplateVersionId: project.sourceTemplateVersionId ? String(project.sourceTemplateVersionId) : undefined,
    title: project.title,
    status: project.status,
    aspectRatio: project.aspectRatio,
    duration: Number(editorState.duration || 10),
    description: editorState.description || "",
    categoryId: editorState.categoryId,
    tags: editorState.tags || [],
    mode: editorState.mode || "edit-project",
    tracks: editorState.tracks || defaultTracks(),
    items: editorState.items || [],
    coverUrl: editorState.coverUrl,
    revision: Number(project.revision || 0),
    updatedAt: project.updatedAt,
    blueprint: project.blueprint,
    slotValues: project.slotValues,
    sourceMediaUrl: project.sourceMediaUrl,
  };
}

export const DEFAULT_SYSTEM_VIDEO_TEMPLATES: Array<Record<string, unknown>> = [];

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createProjectSnapshot(input: SnapshotInput) {
  return {
    title: input.title,
    aspectRatio: input.aspectRatio,
    sourceMediaUrl: input.sourceMediaUrl,
    blueprint: deepClone(input.blueprint),
    slotValues: deepClone(input.defaultValues),
  };
}

export function createProjectSnapshotFromVersion(
  template: TemplateVersionSnapshotInput,
  version: Record<string, unknown>
) {
  const normalized = isRecord(version.normalizedEditorState)
    ? version.normalizedEditorState
    : undefined;
  const normalizedSettings = normalized && isRecord(normalized.settings)
    ? normalized.settings
    : undefined;
  const normalizedDuration = normalizedSettings?.duration;
  const hasNormalizedTimeline = normalized
    && Array.isArray(normalized.tracks)
    && Array.isArray(normalized.items);
  const blueprint = isRecord(version.sourceEdit)
    ? version.sourceEdit
    : isRecord(version.blueprint)
      ? version.blueprint
      : {};
  const defaultValues = isRecord(version.defaultValues)
    ? version.defaultValues
    : {};
  const base = createProjectSnapshot({
    title: template.title,
    aspectRatio: template.aspectRatio,
    sourceMediaUrl: template.previewVideoUrl || template.thumbnailUrl,
    blueprint,
    defaultValues,
  });

  return {
    ...base,
    editorState: hasNormalizedTimeline
      ? {
          description: template.description || "",
          categoryId: template.categoryId || "",
          tags: template.tags || [],
          mode: "edit-project" as const,
          tracks: deepClone(normalized.tracks),
          items: deepClone(normalized.items),
          coverUrl: template.thumbnailUrl,
          duration: typeof normalizedDuration === "number" && Number.isFinite(normalizedDuration)
            ? normalizedDuration
            : template.duration,
        }
      : {
          ...editorStateFromTemplate(template as unknown as Record<string, unknown>),
          duration: template.duration,
        },
  };
}

async function ensureDefaultSystemTemplates() {
  if (DEFAULT_SYSTEM_VIDEO_TEMPLATES.length === 0) return;
}

export function shouldUseVideoTemplateSeedFallback(
  environment: Readonly<Record<string, string | undefined>> = process.env
) {
  return environment.VIDEO_TEMPLATE_SEED_FALLBACK === "true"
    && !environment.SHOTSTACK_API_KEY?.trim();
}

function toSummary(
  template: Record<string, unknown>,
  identity: VideoTemplateIdentity,
  renderStatus?: string
) {
  const id = String(template._id);
  const ownerUserId = template.ownerUserId ? String(template.ownerUserId) : undefined;
  const isShotstack = template.sourceProvider === "shotstack";
  const rawPreview = typeof template.previewVideoUrl === "string" ? template.previewVideoUrl.trim() : "";
  const isCloudinaryPreview = rawPreview.length > 0 && rawPreview.includes("res.cloudinary.com");
  const hasPreview = isShotstack ? isCloudinaryPreview : rawPreview.length > 0;

  let previewStatus: "pending" | "ready" | "failed";
  if (!isShotstack) {
    previewStatus = "ready";
  } else if (hasPreview) {
    previewStatus = "ready";
  } else if (renderStatus === "failed") {
    previewStatus = "failed";
  } else {
    previewStatus = "pending";
  }

  return {
    id,
    title: template.title,
    description: template.description,
    thumbnailUrl: template.thumbnailUrl,
    previewVideoUrl: hasPreview ? rawPreview : undefined,
    previewStatus,
    duration: template.duration,
    aspectRatio: template.aspectRatio,
    category: { id: template.categoryId, name: template.categoryName },
    tags: template.tags ?? [],
    usageCount: template.usageCount ?? 0,
    isFavorite: false,
    ownerType: template.visibility === "system" ? "system" : "user",
    canEdit: ownerUserId === identity.userId,
    badges: template.badges ?? [],
  };
}

function assertObjectId(id: string, label: string) {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw new Error(`${label} không hợp lệ.`);
  }
}

export const videoTemplateService = {
  async createTemplate(identity: VideoTemplateIdentity, input: {
    title: string;
    description?: string;
    thumbnailUrl: string;
    previewVideoUrl?: string;
    duration: number;
    aspectRatio: VideoTemplateAspectRatio;
    categoryId: string;
    categoryName: string;
    tags?: string[];
  }) {
    const visibility = identity.role === "superadmin" ? "system" : "tenant";
    const template = await VideoTemplateModel.create({
      title: input.title,
      description: input.description || "",
      thumbnailUrl: input.thumbnailUrl,
      previewVideoUrl: input.previewVideoUrl || undefined,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
      categoryId: input.categoryId,
      categoryName: input.categoryName,
      tags: input.tags || [],
      badges: ["new"],
      usageCount: 0,
      visibility,
      status: "draft",
      ownerUserId: identity.userId,
      companyCode: identity.companyCode,
    });
    const version = await VideoTemplateVersionModel.create({
      templateId: template._id,
      version: 1,
      blueprint: {
        timeline: [{
          id: "main-video",
          type: "video",
          src: input.previewVideoUrl,
          start: 0,
          end: input.duration,
        }],
      },
      slots: [],
      defaultValues: {},
      createdBy: identity.userId,
    });
    return { id: String(template._id), versionId: String(version._id), status: template.status };
  },

  async updateTemplate(identity: VideoTemplateIdentity, templateId: string, input: Record<string, unknown>) {
    assertObjectId(templateId, "ID mẫu");
    const access = identity.role === "superadmin"
      ? { _id: templateId }
      : { _id: templateId, ownerUserId: identity.userId, companyCode: identity.companyCode };
    const template = await VideoTemplateModel.findOne(access);
    if (!template) throw new Error("Không tìm thấy mẫu video.");
    if (template.status === "published") throw new Error("Mẫu đã xuất bản cần tạo phiên bản mới.");
    const allowedMetadata = ["title", "description", "thumbnailUrl", "previewVideoUrl", "duration", "aspectRatio", "categoryId", "categoryName", "tags"];
    for (const key of allowedMetadata) {
      if (input[key] !== undefined) template.set(key, input[key]);
    }
    await template.save();
    return { id: String(template._id), status: template.status };
  },

  async publishTemplate(identity: VideoTemplateIdentity, templateId: string) {
    assertObjectId(templateId, "ID mẫu");
    const access = identity.role === "superadmin"
      ? { _id: templateId }
      : { _id: templateId, ownerUserId: identity.userId, companyCode: identity.companyCode };
    const template = await VideoTemplateModel.findOne(access);
    if (!template) throw new Error("Không tìm thấy mẫu video.");
    const version = await VideoTemplateVersionModel.findOne({ templateId: template._id }).sort({ version: -1 });
    if (!version) throw new Error("Mẫu video chưa có phiên bản khả dụng.");
    template.status = "published";
    template.publishedVersionId = version._id;
    await template.save();
    return { id: String(template._id), versionId: String(version._id), status: template.status };
  },

  async listTemplates(identity: VideoTemplateIdentity, query: NormalizedVideoTemplateListQuery) {
    void reconcileActiveShotstackRenders().catch(() => undefined);
    if (shouldUseVideoTemplateSeedFallback()) {
      await ensureDefaultSystemTemplates();
    }
    const filter: Record<string, unknown> = {
      ...buildVideoTemplateVisibilityFilter(identity, query.scope),
    };
    if (query.category !== "all") {
      if (query.category === "new" || query.category === "popular") {
        filter.badges = query.category;
      } else {
        filter.categoryId = query.category;
      }
    }
    if (query.aspectRatio !== "all") filter.aspectRatio = query.aspectRatio;
    if (query.durationMin !== undefined || query.durationMax !== undefined) {
      filter.duration = {
        ...(query.durationMin !== undefined ? { $gte: query.durationMin } : {}),
        ...(query.durationMax !== undefined ? { $lte: query.durationMax } : {}),
      };
    }
    if (query.search) {
      const escaped = query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        { title: { $regex: escaped, $options: "i" } },
        { description: { $regex: escaped, $options: "i" } },
        { tags: { $regex: escaped, $options: "i" } },
      ];
    }
    const sort = query.sort === "newest" ? { createdAt: -1 as const } : { usageCount: -1 as const, createdAt: -1 as const };
    const total = await VideoTemplateModel.countDocuments(filter);
    const templates = await VideoTemplateModel.find(filter)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean();

    const unreadyShotstackVersionIds = Array.from(
      new Set(
        templates
          .filter((t) => {
            const isShotstack = (t as unknown as Record<string, unknown>).sourceProvider === "shotstack";
            const rawPreview = typeof (t as unknown as Record<string, unknown>).previewVideoUrl === "string"
              ? String((t as unknown as Record<string, unknown>).previewVideoUrl).trim()
              : "";
            const isCloudinary = rawPreview.length > 0 && rawPreview.includes("res.cloudinary.com");
            return isShotstack && !isCloudinary && (t as unknown as Record<string, unknown>).publishedVersionId;
          })
          .map((t) => String((t as unknown as Record<string, unknown>).publishedVersionId))
      )
    );

    const renderStatusMap = new Map<string, string>();
    if (unreadyShotstackVersionIds.length > 0) {
      const activeRenders = await VideoProjectRenderModel.find({
        purpose: "template-preview",
        templateVersionId: { $in: unreadyShotstackVersionIds },
      })
        .select({ templateVersionId: 1, status: 1 })
        .lean();

      for (const render of activeRenders) {
        if (render.templateVersionId) {
          renderStatusMap.set(String(render.templateVersionId), String(render.status));
        }
      }
    }

    const items = templates.map((t) => {
      const versionId = (t as unknown as Record<string, unknown>).publishedVersionId
        ? String((t as unknown as Record<string, unknown>).publishedVersionId)
        : undefined;
      const renderStatus = versionId ? renderStatusMap.get(versionId) : undefined;
      return toSummary(t as unknown as Record<string, unknown>, identity, renderStatus);
    });

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit) || 1,
      },
    };
  },

  async getTemplateDetail(identity: VideoTemplateIdentity, templateId: string) {
    assertObjectId(templateId, "Mã mẫu video");
    const template = await VideoTemplateModel.findById(templateId).lean();
    if (!template) {
      throw new Error("Không tìm thấy mẫu video.");
    }
    const isShotstack = (template as unknown as Record<string, unknown>).sourceProvider === "shotstack";
    const rawPreview = typeof (template as unknown as Record<string, unknown>).previewVideoUrl === "string"
      ? String((template as unknown as Record<string, unknown>).previewVideoUrl).trim()
      : "";
    const isCloudinary = rawPreview.length > 0 && rawPreview.includes("res.cloudinary.com");

    let renderStatus: string | undefined;
    if (isShotstack && !isCloudinary && (template as unknown as Record<string, unknown>).publishedVersionId) {
      const render = await VideoProjectRenderModel.findOne({
        purpose: "template-preview",
        templateVersionId: String((template as unknown as Record<string, unknown>).publishedVersionId),
      })
        .select({ status: 1 })
        .lean();

      if (render) {
        renderStatus = String(render.status);
      }
    }

    const summary = toSummary(template as unknown as Record<string, unknown>, identity, renderStatus);
    const isOwner = summary.canEdit;

    return {
      ...summary,
      actions: {
        canUse: true,
        canEditTemplate: isOwner,
        canArchive: isOwner,
      },
    };
  },

  async retryTemplatePreview(
    identity: VideoTemplateIdentity,
    templateId: string,
    options: { force?: boolean } = {}
  ) {
    assertObjectId(templateId, "Mã mẫu video");
    const template = await VideoTemplateModel.findById(templateId).lean();
    if (!template) {
      throw new Error("Không tìm thấy mẫu video.");
    }
    if (template.sourceProvider !== "shotstack") {
      throw new Error("Chỉ hỗ trợ tạo lại bản xem trước cho mẫu Shotstack.");
    }
    if (!template.publishedVersionId) {
      throw new Error("Mẫu video chưa có phiên bản xuất bản.");
    }

    const rawPreview = typeof template.previewVideoUrl === "string" ? template.previewVideoUrl.trim() : "";
    if (rawPreview.length > 0 && rawPreview.includes("res.cloudinary.com")) {
      throw new Error("Mẫu đã có bản xem trước hoàn chỉnh.");
    }

    const version = await VideoTemplateVersionModel.findById(template.publishedVersionId).lean();
    if (!version) {
      throw new Error("Không tìm thấy phiên bản mẫu video.");
    }

    const existingRender = await VideoProjectRenderModel.findOne({
      purpose: "template-preview",
      templateVersionId: String(version._id),
      templateSourceHash: version.sourceHash,
    }).lean();

    if (existingRender && String(existingRender.status) === "failed") {
      const isUncertain =
        existingRender.providerSubmissionState === "uncertain" ||
        existingRender.errorCode === "VIDEO_PROJECT_RENDER_SUBMISSION_UNCERTAIN" ||
        Boolean(existingRender.providerRenderId);

      if (isUncertain && !options.force) {
        throw new UncertainPreviewSubmissionError();
      }
    }

    const result = await requestVideoTemplatePreview(
      {
        templateId: String(template._id),
        templateVersionId: String(version._id),
        sourceHash: version.sourceHash,
        title: template.title,
        aspectRatio: template.aspectRatio,
        duration: template.duration,
        normalizedEditorState: version.normalizedEditorState as Record<string, unknown>,
        sourceEdit: version.sourceEdit as Record<string, unknown>,
      },
      { force: options.force }
    );

    console.log(
      `[Admin Preview Retry] templateId=${templateId}, versionId=${template.publishedVersionId}, actorId=${identity.userId}, force=${Boolean(options.force)}, timestamp=${new Date().toISOString()}`
    );

    return {
      templateId: String(template._id),
      renderId: result.renderId,
      forced: Boolean(options.force),
      ...(options.force
        ? {
            warning:
              "Đã buộc thử lại tạo bản xem trước. Lưu ý: Thao tác này có thể phát sinh thêm chi phí credit nếu Shotstack đã nhận render trước đó.",
          }
        : {}),
    };
  },

  async useTemplate(identity: VideoTemplateIdentity, templateId: string, _mode: "quick" | "editor") {
    assertObjectId(templateId, "ID mẫu");
    const template = await VideoTemplateModel.findOne({
      _id: templateId,
      $or: [
        buildVideoTemplateVisibilityFilter(identity, "discover"),
        buildVideoTemplateVisibilityFilter(identity, "mine"),
      ],
    }).lean();
    if (!template) throw new Error("Không tìm thấy mẫu video.");
    const version = template.publishedVersionId
      ? await VideoTemplateVersionModel.findById(template.publishedVersionId).lean()
      : await VideoTemplateVersionModel.findOne({ templateId: template._id }).sort({ version: -1 }).lean();
    if (!version) throw new Error("Mẫu video chưa có phiên bản khả dụng.");
    const snapshot = createProjectSnapshotFromVersion(
      template as unknown as TemplateVersionSnapshotInput,
      version as unknown as Record<string, unknown>
    );
    const project = await VideoProjectModel.create({
      ...snapshot,
      userId: identity.userId,
      companyCode: identity.companyCode,
      sourceTemplateId: template._id,
      sourceTemplateVersionId: version._id,
      status: "draft",
      revision: 0,
    });
    await VideoTemplateModel.updateOne({ _id: template._id }, { $inc: { usageCount: 1 } });
    return {
      project: {
        id: String(project._id),
        sourceTemplateId: String(template._id),
        status: "draft" as const,
        slotValues: project.slotValues,
      },
      nextStep: "editor" as const,
    };
  },

  async getProject(identity: VideoTemplateIdentity, projectId: string) {
    assertObjectId(projectId, "ID dự án");
    const project = await VideoProjectModel.findOne({
      _id: projectId,
      userId: identity.userId,
      companyCode: identity.companyCode,
    }).lean();
    if (!project) throw new Error("Không tìm thấy dự án video.");
    return serializeProject(project as unknown as Record<string, unknown>);
  },

  async listProjects(identity: VideoTemplateIdentity) {
    const projects = await VideoProjectModel.find({
      userId: identity.userId,
      companyCode: identity.companyCode,
    }).sort({ updatedAt: -1 }).limit(50).lean();
    return { items: projects.map((project) => serializeProject(project as unknown as Record<string, unknown>)) };
  },

  async createProject(identity: VideoTemplateIdentity, input: EditorProjectInput) {
    const { title, aspectRatio, duration, ...editorState } = input;
    const project = await VideoProjectModel.create({
      userId: identity.userId,
      companyCode: identity.companyCode,
      title,
      status: "draft",
      aspectRatio,
      blueprint: { timeline: [] },
      slotValues: {},
      editorState: { ...editorState, duration },
      revision: 0,
    });
    return serializeProject(project.toObject() as unknown as Record<string, unknown>);
  },

  async signProjectMediaUpload(identity: VideoTemplateIdentity, input: VideoProjectMediaInput) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error("Cấu hình Cloudinary chưa đầy đủ trên server.");
    }
    const validated = validateVideoProjectMedia(input);
    const timestamp = Math.floor(Date.now() / 1000);
    const folder = buildVideoProjectMediaFolder(identity, validated.mediaType);
    const signature = cloudinary.utils.api_sign_request({ timestamp, folder }, apiSecret);
    return {
      cloudName,
      apiKey,
      signature,
      timestamp,
      folder,
      resourceType: validated.resourceType,
    };
  },

  async updateProject(
    identity: VideoTemplateIdentity,
    projectId: string,
    input: Partial<EditorProjectInput> & { expectedRevision: number }
  ) {
    assertObjectId(projectId, "ID dự án");
    const { expectedRevision, title, aspectRatio, duration, ...editorPatch } = input;
    const set: Record<string, unknown> = {};
    if (title !== undefined) set.title = title;
    if (aspectRatio !== undefined) set.aspectRatio = aspectRatio;
    if (duration !== undefined) set["editorState.duration"] = duration;
    Object.entries(editorPatch).forEach(([key, value]) => {
      if (value !== undefined) set[`editorState.${key}`] = value;
    });
    const project = await VideoProjectModel.findOneAndUpdate(
      {
        _id: projectId,
        userId: identity.userId,
        companyCode: identity.companyCode,
        revision: expectedRevision,
      },
      { $set: set, $inc: { revision: 1 } },
      { new: true }
    ).lean();
    if (!project) {
      const exists = await VideoProjectModel.exists({
        _id: projectId,
        userId: identity.userId,
        companyCode: identity.companyCode,
      });
      if (!exists) throw new Error("Không tìm thấy dự án video.");
      throw new Error("Dự án đã có phiên bản mới hơn. Vui lòng tải lại trước khi lưu.");
    }
    return serializeProject(project as unknown as Record<string, unknown>);
  },
};
