import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { enqueueVideoCaptionJob } from "../queue/video-caption-queue";
import {
  getVideoCaptionHttpStatus,
  VideoCaptionError,
} from "../service/video-caption-error";
import { videoCaptionService } from "../service/video-caption.service";
import { videoCaptionContextService } from "../service/video-caption-context.service";

function getIdentity(req: AuthenticatedRequest) {
  const userId = req.user?.id;
  let companyCode = req.user?.companyCode;

  if (req.user?.role === "superadmin") {
    companyCode = String(
      req.body?.companyCode ||
        req.query?.companyCode ||
        companyCode ||
        "SYSTEM"
    );
  }

  if (!userId || !companyCode) {
    throw new VideoCaptionError(
      "Không xác định được người dùng hoặc doanh nghiệp.",
      "CAPTION_IDENTITY_REQUIRED",
      "authentication",
      false,
      401
    );
  }
  return { userId, companyCode };
}

function sendError(res: Response, error: unknown) {
  const statusCode = getVideoCaptionHttpStatus(error);
  const message =
    error instanceof Error
      ? error.message
      : "Đã xảy ra lỗi khi xử lý caption video.";
  if (statusCode >= 500) {
    console.error("[Video Caption API]", error);
  }
  return res.status(statusCode).json({
    status: "error",
    message,
    code:
      error instanceof VideoCaptionError
        ? error.code
        : "UNEXPECTED_ERROR",
  });
}

export const videoCaptionController = {
  async create(req: AuthenticatedRequest, res: Response) {
    try {
      const { userId, companyCode } = getIdentity(req);
      const result = await videoCaptionService.createProject(
        companyCode,
        userId,
        req.body
      );

      let analysisJob;
      if (req.body.autoAnalyze !== false) {
        analysisJob = await videoCaptionService.prepareAnalysisJob(
          companyCode,
          result.project.id,
          userId
        );
        await enqueueVideoCaptionJob(analysisJob.id);
      }

      const detail = await videoCaptionService.getProjectDetail(
        companyCode,
        result.project.id
      );
      return res.status(result.created ? 201 : 200).json({
        status: "success",
        data: detail,
        meta: {
          created: result.created,
          analysisQueued: Boolean(analysisJob),
        },
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async list(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await videoCaptionService.listProjects(companyCode, {
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 20),
        status: req.query.status as never,
        mode:
          typeof req.query.mode === "string"
            ? req.query.mode
            : undefined,
      });
      return res.status(200).json({ status: "success", data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async contextOptions(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await videoCaptionContextService.listOptions(
        companyCode.trim().toUpperCase()
      );
      return res.status(200).json({ status: "success", data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async detail(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const data = await videoCaptionService.getProjectDetail(
        companyCode,
        req.params.id
      );
      return res.status(200).json({ status: "success", data });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async update(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const project = await videoCaptionService.updateProject(
        companyCode,
        req.params.id,
        userId,
        req.body
      );
      return res.status(200).json({
        status: "success",
        data: { project },
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async analyze(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const job = await videoCaptionService.prepareAnalysisJob(
        companyCode,
        req.params.id,
        userId
      );
      await enqueueVideoCaptionJob(job.id, true);
      return res.status(202).json({
        status: "success",
        data: { job },
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async transcribe(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const job = await videoCaptionService.prepareTranscriptionJob(
        companyCode,
        req.params.id,
        userId
      );
      await enqueueVideoCaptionJob(job.id, true);
      return res.status(202).json({
        status: "success",
        data: { job },
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async generateContext(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const job = await videoCaptionService.prepareContextJob(
        companyCode,
        req.params.id,
        userId
      );
      await enqueueVideoCaptionJob(job.id, true);
      return res.status(202).json({
        status: "success",
        data: { job },
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async render(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const job = await videoCaptionService.prepareRenderJob(
        companyCode,
        req.params.id,
        userId,
        req.body.preview === true
      );
      await enqueueVideoCaptionJob(job.id, true);
      return res.status(202).json({
        status: "success",
        data: { job },
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async downloadSubtitles(
    req: AuthenticatedRequest,
    res: Response
  ) {
    try {
      const { companyCode } = getIdentity(req);
      const format = req.params.format as "srt" | "vtt";
      const result = await videoCaptionService.exportSubtitles(
        companyCode,
        req.params.id,
        format
      );
      res.setHeader(
        "Content-Type",
        format === "srt"
          ? "application/x-subrip; charset=utf-8"
          : "text/vtt; charset=utf-8"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`
      );
      return res.status(200).send(result.content);
    } catch (error) {
      return sendError(res, error);
    }
  },

  async cancel(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const project = await videoCaptionService.cancelProject(
        companyCode,
        req.params.id,
        userId
      );
      return res.status(200).json({
        status: "success",
        data: { project },
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async retry(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode, userId } = getIdentity(req);
      const job = await videoCaptionService.retryProject(
        companyCode,
        req.params.id,
        userId
      );
      await enqueueVideoCaptionJob(job.id, true);
      return res.status(202).json({
        status: "success",
        data: { job },
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async jobs(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      const jobs = await videoCaptionService.listJobs(
        companyCode,
        req.params.id
      );
      return res.status(200).json({
        status: "success",
        data: { jobs },
      });
    } catch (error) {
      return sendError(res, error);
    }
  },

  async replaceSegments(req: AuthenticatedRequest, res: Response) {
    try {
      const { companyCode } = getIdentity(req);
      await videoCaptionService.replaceSegments(
        companyCode,
        req.params.id,
        req.body
      );
      const data = await videoCaptionService.getProjectDetail(
        companyCode,
        req.params.id
      );
      return res.status(200).json({ status: "success", data });
    } catch (error) {
      return sendError(res, error);
    }
  },
};
