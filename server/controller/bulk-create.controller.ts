import { Response } from "express";
import * as archiverModule from "archiver";
import { AuthenticatedRequest } from "../middleware/auth";
import { bulkCreateService } from "../service/bulk-create.service";
import { enqueueBulkCreateJob } from "../queue/bulk-create-queue";
import { bulkCreateAiService } from "../service/bulk-create-ai.service";

interface ZipArchive {
  on(event: "error", listener: (error: Error) => void): void;
  pipe(destination: Response): void;
  append(source: Buffer, options: { name: string }): void;
  finalize(): Promise<void>;
}

type ArchiverFactory = (format: "zip", options: { zlib: { level: number } }) => ZipArchive;

const createArchive = ((archiverModule as unknown as { default?: ArchiverFactory }).default || archiverModule) as unknown as ArchiverFactory;
const MAX_ZIP_IMAGE_BYTES = 20 * 1024 * 1024;
const ZIP_FETCH_CONCURRENCY = 4;

function actorFrom(req: AuthenticatedRequest) {
  if (!req.user?.id) throw new Error("Không xác định được tài khoản.");
  const requestedCompany = req.headers["x-company-code"];
  const companyCode = req.user.role === "superadmin"
    ? String(Array.isArray(requestedCompany) ? requestedCompany[0] : requestedCompany || req.user.companyCode || "SYSTEM").trim().toUpperCase()
    : req.user.companyCode?.trim().toUpperCase();
  if (!companyCode) throw new Error("Tài khoản chưa được gán doanh nghiệp.");
  return { id: req.user.id, companyCode, role: req.user.role };
}

function statusFor(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /không tìm thấy|không có quyền/i.test(message) ? 404 : 400;
}

function handleError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return res.status(statusFor(error)).json({ status: "error", message });
}

function safeFilePart(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

async function fetchZipImage(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com") {
    throw new Error("URL kết quả không thuộc kho ảnh được phép.");
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_ZIP_IMAGE_BYTES) throw new Error("Ảnh vượt quá 20 MB.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_ZIP_IMAGE_BYTES) throw new Error("Ảnh vượt quá 20 MB.");
  return buffer;
}

export const bulkCreateController = {
  async updateSceneWithAi(req: AuthenticatedRequest, res: Response) {
    try {
      const result = await bulkCreateAiService.updateScene(actorFrom(req), req.body);
      return res.json({ status: "success", data: result });
    } catch (error) { return handleError(res, error); }
  },

  async previewGoogleSheet(req: AuthenticatedRequest, res: Response) {
    try {
      const preview = await bulkCreateService.previewPublicGoogleSheet(actorFrom(req), req.body);
      return res.json({ status: "success", data: preview });
    } catch (error) { return handleError(res, error); }
  },

  async previewWorkbook(req: AuthenticatedRequest, res: Response) {
    try {
      const preview = await bulkCreateService.previewWorkbook(actorFrom(req), req.body);
      return res.json({ status: "success", data: preview });
    } catch (error) { return handleError(res, error); }
  },

  async uploadAsset(req: AuthenticatedRequest, res: Response) {
    try {
      const asset = await bulkCreateService.uploadAsset(actorFrom(req), req.body);
      return res.status(201).json({ status: "success", data: asset });
    } catch (error) { return handleError(res, error); }
  },

  async listAssets(req: AuthenticatedRequest, res: Response) {
    try {
      const assets = await bulkCreateService.listAssets(actorFrom(req), Number(req.query.limit || 60));
      return res.json({ status: "success", data: assets });
    } catch (error) { return handleError(res, error); }
  },

  async archiveAsset(req: AuthenticatedRequest, res: Response) {
    try {
      await bulkCreateService.archiveAsset(actorFrom(req), req.params.id);
      return res.json({ status: "success" });
    } catch (error) { return handleError(res, error); }
  },

  async createTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      const template = await bulkCreateService.createTemplate(actorFrom(req), req.body);
      return res.status(201).json({ status: "success", data: template });
    } catch (error) { return handleError(res, error); }
  },

  async listTemplates(req: AuthenticatedRequest, res: Response) {
    try {
      const templates = await bulkCreateService.listTemplates(actorFrom(req));
      return res.json({ status: "success", data: templates });
    } catch (error) { return handleError(res, error); }
  },

  async listCommunityTemplates(req: AuthenticatedRequest, res: Response) {
    try {
      const templates = await bulkCreateService.listCommunityTemplates();
      return res.json({ status: "success", data: templates });
    } catch (error) { return handleError(res, error); }
  },

  async publishTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      const template = await bulkCreateService.publishTemplate(actorFrom(req), req.params.id);
      return res.json({ status: "success", data: template });
    } catch (error) { return handleError(res, error); }
  },

  async unpublishTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      const template = await bulkCreateService.unpublishTemplate(actorFrom(req), req.params.id);
      return res.json({ status: "success", data: template });
    } catch (error) { return handleError(res, error); }
  },

  async useCommunityTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      const template = await bulkCreateService.useCommunityTemplate(actorFrom(req), req.params.id);
      return res.status(201).json({ status: "success", data: template });
    } catch (error) { return handleError(res, error); }
  },

  async getTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      const template = await bulkCreateService.getTemplate(actorFrom(req), req.params.id);
      return res.json({ status: "success", data: template });
    } catch (error) { return handleError(res, error); }
  },

  async updateTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      const template = await bulkCreateService.updateTemplate(actorFrom(req), req.params.id, req.body);
      return res.json({ status: "success", data: template });
    } catch (error) { return handleError(res, error); }
  },

  async archiveTemplate(req: AuthenticatedRequest, res: Response) {
    try {
      await bulkCreateService.archiveTemplate(actorFrom(req), req.params.id);
      return res.json({ status: "success" });
    } catch (error) { return handleError(res, error); }
  },

  async preview(req: AuthenticatedRequest, res: Response) {
    try {
      const output = await bulkCreateService.preview(actorFrom(req), req.body);
      res.setHeader("Content-Type", "image/png");
      res.setHeader("Cache-Control", "no-store");
      return res.send(output);
    } catch (error) { return handleError(res, error); }
  },

  async createJob(req: AuthenticatedRequest, res: Response) {
    try {
      const job = await bulkCreateService.createJob(actorFrom(req), req.body);
      if (job.status === "queued") await enqueueBulkCreateJob(String(job._id));
      return res.status(202).json({ status: "success", data: job });
    } catch (error) { return handleError(res, error); }
  },

  async listJobs(req: AuthenticatedRequest, res: Response) {
    try {
      const jobs = await bulkCreateService.listJobs(actorFrom(req), Number(req.query.limit || 20));
      return res.json({ status: "success", data: jobs });
    } catch (error) { return handleError(res, error); }
  },

  async getJob(req: AuthenticatedRequest, res: Response) {
    try {
      const job = await bulkCreateService.getJob(actorFrom(req), req.params.id);
      return res.json({ status: "success", data: job });
    } catch (error) { return handleError(res, error); }
  },

  async listItems(req: AuthenticatedRequest, res: Response) {
    try {
      const items = await bulkCreateService.listItems(actorFrom(req), req.params.id);
      return res.json({ status: "success", data: items });
    } catch (error) { return handleError(res, error); }
  },

  async retry(req: AuthenticatedRequest, res: Response) {
    try {
      const job = await bulkCreateService.retryFailed(actorFrom(req), req.params.id);
      await enqueueBulkCreateJob(String(job._id), true);
      return res.status(202).json({ status: "success", data: job });
    } catch (error) { return handleError(res, error); }
  },

  async cancel(req: AuthenticatedRequest, res: Response) {
    try {
      const job = await bulkCreateService.cancel(actorFrom(req), req.params.id);
      return res.json({ status: "success", data: job });
    } catch (error) { return handleError(res, error); }
  },

  async downloadZip(req: AuthenticatedRequest, res: Response) {
    try {
      const actor = actorFrom(req);
      const [job, items] = await Promise.all([
        bulkCreateService.getJob(actor, req.params.id),
        bulkCreateService.listItems(actor, req.params.id),
      ]);
      const completed = items.filter((item) => item.status === "completed" && item.outputUrl);
      if (completed.length === 0) return res.status(400).json({ status: "error", message: "Job chưa có ảnh hoàn thành để tải." });
      const safeName = job.templateName.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "bulk-create";
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}.zip"`);
      const archive = createArchive("zip", { zlib: { level: 6 } });
      archive.on("error", (error) => {
        console.error(`[Bulk Create ZIP] Job ${job._id} lỗi:`, error);
        if (!res.headersSent) res.status(500).json({ status: "error", message: "Không thể tạo file ZIP." });
        else res.destroy(error);
      });
      archive.pipe(res);
      const usedNames = new Set<string>();
      const skipped: string[] = [];
      for (let index = 0; index < completed.length; index += ZIP_FETCH_CONCURRENCY) {
        const chunk = completed.slice(index, index + ZIP_FETCH_CONCURRENCY);
        const downloaded = await Promise.all(chunk.map(async (item) => {
          const label = Object.values(item.values)
            .find((value) => value && !/^data:|^https?:\/\//i.test(value));
          const base = safeFilePart(label || "") ||
            `${safeName}-${String(item.rowIndex + 1).padStart(3, "0")}`;
          let fileName = `${base}.png`;
          if (usedNames.has(fileName)) {
            fileName = `${base}-${String(item.rowIndex + 1).padStart(3, "0")}.png`;
          }
          usedNames.add(fileName);
          try {
            return { fileName, buffer: await fetchZipImage(String(item.outputUrl)) };
          } catch (error) {
            skipped.push(
              `Ảnh ${item.rowIndex + 1}: ${error instanceof Error ? error.message : String(error)}`
            );
            return null;
          }
        }));
        downloaded.forEach((result) => {
          if (result) archive.append(result.buffer, { name: result.fileName });
        });
      }
      if (skipped.length > 0) {
        archive.append(
          Buffer.from(
            `Một số ảnh không thể tải tại thời điểm tạo ZIP:\n${skipped.join("\n")}\n`,
            "utf8"
          ),
          { name: "anh-khong-tai-duoc.txt" }
        );
      }
      await archive.finalize();
    } catch (error) {
      if (!res.headersSent) return handleError(res, error);
      res.end();
    }
  },
};
