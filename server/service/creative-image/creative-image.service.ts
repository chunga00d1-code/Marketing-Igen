import mongoose from "mongoose";
import { broadcastEvent } from "../../socket";
import { CreativeImageProjectModel } from "../../model/creative-image-project.model";
import { CreativeImageRenderModel } from "../../model/creative-image-render.model";
import { assertSafeBulkImageSource } from "../bulk-create-renderer.service";
import { getCreativeImageTemplate } from "../../../src/creative-image/template-registry";
import { CREATIVE_IMAGE_CANVASES, type CreativeImageFormat } from "../../../src/creative-image/types";
import { renderCreativeImage } from "./render.service";

export type CreativeActor = { id: string; companyCode: string };
type CanvasInput = { format: CreativeImageFormat; width: number; height: number };
type ProjectInput = { templateId: string; canvas: CanvasInput; data: Record<string, string> };
type Snapshot = { templateId: string; templateVersion: number; canvas: CanvasInput; data: Record<string, string> };

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

function serialize(value: unknown) {
  if (value && typeof value === "object" && "toObject" in value && typeof value.toObject === "function") {
    return value.toObject();
  }
  return value;
}

export const creativeImageService = {
  listTemplates() {
    return ["product-promo-v1", "product-showcase-v1", "quote-card-v1", "event-announcement-v1"].map((templateId) => getCreativeImageTemplate(templateId)).filter(Boolean);
  },

  async createProject(actor: CreativeActor, input: ProjectInput) {
    const canvas = normalizeCanvas(input.canvas);
    const { template, data } = normalizeData(input.templateId, input.data);
    return CreativeImageProjectModel.create({ userId: actor.id, companyCode: actor.companyCode, templateId: template.id, templateVersion: template.version, canvas, data });
  },

  async getProject(actor: CreativeActor, projectId: string) {
    assertObjectId(projectId, "Project");
    const project = await CreativeImageProjectModel.findOne({ _id: projectId, userId: actor.id, companyCode: actor.companyCode }).lean();
    if (!project) throw new Error("Không tìm thấy bản thiết kế hoặc bạn không có quyền truy cập.");
    return project;
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
      const outputUrl = await renderCreativeImage({ renderId, companyCode: render.companyCode, templateId: snapshot.templateId, canvas: snapshot.canvas, data: snapshot.data });
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
