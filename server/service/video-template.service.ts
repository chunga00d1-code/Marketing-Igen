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
import { buildVideoTemplateVisibilityFilter } from "./video-template-policy";
import {
  buildVideoProjectMediaFolder,
  validateVideoProjectMedia,
  type VideoProjectMediaInput,
} from "./video-project-media-policy";

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

const SAMPLE_VIDEO_URLS = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4",
];

function gradientThumbnail(title: string, from: string, to: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1067"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="600" height="1067" fill="url(#g)"/><rect y="650" width="600" height="417" fill="#020617" opacity=".58"/><text x="40" y="880" fill="white" font-family="Arial" font-size="42" font-weight="700">${title}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const DEFAULT_SYSTEM_VIDEO_TEMPLATES = [
  { systemKey: "flash-sale", title: "TikTok Flash Sale", categoryId: "sales", categoryName: "Bán hàng", duration: 15, colors: ["#ef4444", "#db2777"], tags: ["TikTok", "Flash Sale"], badges: ["popular", "new"] },
  { systemKey: "product-review", title: "Review sản phẩm", categoryId: "product_review", categoryName: "Review sản phẩm", duration: 30, colors: ["#0f172a", "#0891b2"], tags: ["Review", "Unboxing"], badges: ["popular"] },
  { systemKey: "before-after", title: "Before & After", categoryId: "sales", categoryName: "Bán hàng", duration: 20, colors: ["#7c3aed", "#ec4899"], tags: ["Before After", "Làm đẹp"], badges: ["popular"] },
  { systemKey: "education-tips", title: "3 mẹo hữu ích", categoryId: "education", categoryName: "Giáo dục", duration: 25, colors: ["#059669", "#0e7490"], tags: ["Tips", "Giáo dục"], badges: ["new"] },
  { systemKey: "event-promo", title: "Promo sự kiện", categoryId: "promo", categoryName: "Khuyến mãi", duration: 15, colors: ["#ea580c", "#ca8a04"], tags: ["Sự kiện", "Promo"], badges: ["new"] },
].map((template, index) => {
  const sourceUrl = SAMPLE_VIDEO_URLS[index];
  return {
    ...template,
    aspectRatio: "9:16" as const,
    description: `${template.title} có thể thay video, tiêu đề và lời kêu gọi hành động.`,
    thumbnailUrl: gradientThumbnail(template.title, template.colors[0], template.colors[1]),
    previewVideoUrl: sourceUrl,
    blueprint: {
      timeline: [
        { id: "main-video", type: "video", src: sourceUrl, start: 0, end: template.duration },
        { id: "headline", type: "text", text: template.title, start: 0, end: 4, position: "center" },
        { id: "cta", type: "text", text: "Khám phá ngay", start: Math.max(0, template.duration - 3), end: template.duration, position: "bottom" },
      ],
    },
    slots: [
      { key: "main_video", type: "video" as const, label: "Video chính", required: true, bindings: [{ timelineItemId: "main-video", property: "src" }] },
      { key: "headline", type: "text" as const, label: "Tiêu đề", required: true, maxLength: 40, bindings: [{ timelineItemId: "headline", property: "text" }] },
      { key: "cta", type: "text" as const, label: "Kêu gọi hành động", required: false, maxLength: 30, bindings: [{ timelineItemId: "cta", property: "text" }] },
    ],
    defaultValues: { main_video: sourceUrl, headline: template.title, cta: "Khám phá ngay" },
  };
});

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
  for (const definition of DEFAULT_SYSTEM_VIDEO_TEMPLATES) {
    const template = await VideoTemplateModel.findOneAndUpdate(
      { systemKey: definition.systemKey },
      {
        $setOnInsert: {
          systemKey: definition.systemKey,
          title: definition.title,
          description: definition.description,
          thumbnailUrl: definition.thumbnailUrl,
          previewVideoUrl: definition.previewVideoUrl,
          duration: definition.duration,
          aspectRatio: definition.aspectRatio,
          categoryId: definition.categoryId,
          categoryName: definition.categoryName,
          tags: definition.tags,
          badges: definition.badges,
          usageCount: 0,
          visibility: "system",
          status: "draft",
        },
      },
      { upsert: true, new: true }
    );
    let version = await VideoTemplateVersionModel.findOne({ templateId: template._id, version: 1 });
    if (!version) {
      version = await VideoTemplateVersionModel.create({
        templateId: template._id,
        version: 1,
        blueprint: definition.blueprint,
        slots: definition.slots,
        defaultValues: definition.defaultValues,
        createdBy: "system",
      });
    }
    if (template.status !== "published" || String(template.publishedVersionId || "") !== String(version._id)) {
      await VideoTemplateModel.updateOne(
        { _id: template._id },
        { $set: { status: "published", publishedVersionId: version._id } }
      );
    }
  }
}

export function shouldUseVideoTemplateSeedFallback(
  environment: Readonly<Record<string, string | undefined>> = process.env
) {
  return environment.VIDEO_TEMPLATE_SEED_FALLBACK === "true"
    && !environment.SHOTSTACK_API_KEY?.trim();
}

function toSummary(template: Record<string, unknown>, identity: VideoTemplateIdentity) {
  const id = String(template._id);
  const ownerUserId = template.ownerUserId ? String(template.ownerUserId) : undefined;
  return {
    id,
    title: template.title,
    description: template.description,
    thumbnailUrl: template.thumbnailUrl,
    previewVideoUrl: template.previewVideoUrl,
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
    const [rows, total] = await Promise.all([
      VideoTemplateModel.find(filter)
        .sort(sort)
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .lean(),
      VideoTemplateModel.countDocuments(filter),
    ]);
    return {
      items: rows.map((row) => toSummary(row as unknown as Record<string, unknown>, identity)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        hasMore: query.page * query.limit < total,
      },
    };
  },

  async getTemplateDetail(identity: VideoTemplateIdentity, templateId: string) {
    assertObjectId(templateId, "ID mẫu");
    const visibility = buildVideoTemplateVisibilityFilter(identity, "discover");
    const mine = buildVideoTemplateVisibilityFilter(identity, "mine");
    const template = await VideoTemplateModel.findOne({
      _id: templateId,
      $or: [visibility, mine],
    }).lean();
    if (!template) throw new Error("Không tìm thấy mẫu video.");
    const version = template.publishedVersionId
      ? await VideoTemplateVersionModel.findById(template.publishedVersionId).lean()
      : await VideoTemplateVersionModel.findOne({ templateId: template._id }).sort({ version: -1 }).lean();
    if (!version) throw new Error("Mẫu video chưa có phiên bản khả dụng.");
    return {
      ...toSummary(template as unknown as Record<string, unknown>, identity),
      versionId: String(version._id),
      actions: {
        canUse: template.status === "published" || String(template.ownerUserId || "") === identity.userId,
        canEditTemplate: String(template.ownerUserId || "") === identity.userId,
        canArchive: String(template.ownerUserId || "") === identity.userId,
      },
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
