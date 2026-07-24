import type { Response } from "express";
import type {
  VideoTemplateSyncStatus,
  VideoTemplateSyncSummary,
} from "../interface/video-template.interface";
import {
  getShotstackConfig,
  ShotstackUnavailableError,
} from "../integration/shotstack/shotstack.client";
import type { ShotstackEnvironment } from "../integration/shotstack/shotstack.types";
import type { AuthenticatedRequest } from "../middleware/auth";
import { VideoTemplateSyncModel } from "../model/video-template-sync.model";
import {
  ShotstackSyncBusyError,
  synchronizeShotstackTemplates,
} from "../service/shotstack-template-sync.service";
import * as videoProjectRenderService from "../service/video-project-render.service";
import { normalizeVideoTemplateListQuery } from "../service/video-template-policy";
import { videoTemplateService } from "../service/video-template.service";

const VIDEO_TEMPLATE_CATEGORIES = [
  { id: "all", name: "Dành cho bạn" },
  { id: "new", name: "Mới" },
  { id: "popular", name: "Phổ biến" },
  { id: "tiktok", name: "TikTok" },
  { id: "sales", name: "Bán hàng" },
  { id: "product_review", name: "Review sản phẩm" },
  { id: "education", name: "Giáo dục" },
  { id: "vlog", name: "Vlog" },
  { id: "promo", name: "Khuyến mãi" },
];

function getIdentity(req: AuthenticatedRequest) {
  if (!req.user?.id) throw new Error("Người dùng chưa xác thực.");
  return {
    userId: req.user.id,
    companyCode: req.user.companyCode || `personal:${req.user.id}`,
    role: req.user.role,
  };
}

function errorStatus(message: string) {
  if (message.includes("không hợp lệ")) return 400;
  if (message.includes("Không tìm thấy") || message.includes("chưa có phiên bản")) return 404;
  return 500;
}

type ShotstackSyncStateView = {
  status: VideoTemplateSyncStatus;
  lastAttemptAt?: Date;
  lastSuccessAt?: Date;
  summary: VideoTemplateSyncSummary;
};

type ShotstackAdminControllerDependencies = {
  validateConfig: typeof getShotstackConfig;
  getEnvironment: () => ShotstackEnvironment;
  isConfigured: () => boolean;
  synchronizeTemplates: typeof synchronizeShotstackTemplates;
  findSyncState: (environment: ShotstackEnvironment) => Promise<ShotstackSyncStateView | null>;
};

function getShotstackEnvironment(): ShotstackEnvironment {
  const environment = process.env.SHOTSTACK_ENV?.trim() || "stage";
  if (environment !== "stage" && environment !== "v1") {
    throw new ShotstackUnavailableError("SHOTSTACK_ENV must be either stage or v1.");
  }
  return environment;
}

const defaultShotstackAdminDependencies: ShotstackAdminControllerDependencies = {
  validateConfig: getShotstackConfig,
  getEnvironment: getShotstackEnvironment,
  isConfigured: () => Boolean(process.env.SHOTSTACK_API_KEY?.trim()),
  synchronizeTemplates: synchronizeShotstackTemplates,
  async findSyncState(environment) {
    return VideoTemplateSyncModel.findOne({
      provider: "shotstack",
      environment,
    })
      .select({
        status: 1,
        lastAttemptAt: 1,
        lastSuccessAt: 1,
        summary: 1,
      })
      .lean() as unknown as Promise<ShotstackSyncStateView | null>;
  },
};

function emptyShotstackSyncSummary(): VideoTemplateSyncSummary {
  return {
    created: 0,
    updated: 0,
    unchanged: 0,
    archived: 0,
    failed: [],
  };
}

export function createShotstackAdminHandlers(
  overrides: Partial<ShotstackAdminControllerDependencies> = {}
) {
  const dependencies = {
    ...defaultShotstackAdminDependencies,
    ...overrides,
  };

  return {
    async sync(req: AuthenticatedRequest, res: Response) {
      try {
        dependencies.validateConfig();
        const data = await dependencies.synchronizeTemplates(getIdentity(req).userId);
        return res.status(200).json({ status: "success", data });
      } catch (error: unknown) {
        if (error instanceof ShotstackUnavailableError) {
          return res.status(503).json({
            status: "error",
            message: "Dịch vụ Shotstack chưa được cấu hình hợp lệ.",
          });
        }
        if (error instanceof ShotstackSyncBusyError) {
          return res.status(409).json({
            status: "error",
            message: "Đồng bộ mẫu Shotstack đang được thực hiện. Vui lòng thử lại sau.",
          });
        }
        return res.status(500).json({
          status: "error",
          message: "Không thể đồng bộ thư viện mẫu Shotstack. Vui lòng thử lại sau.",
        });
      }
    },

    async status(_req: AuthenticatedRequest, res: Response) {
      try {
        const environment = dependencies.getEnvironment();
        const state = await dependencies.findSyncState(environment);
        const summary = state?.summary || emptyShotstackSyncSummary();
        const data = {
          configured: dependencies.isConfigured(),
          environment,
          status: state?.status ?? null,
          ...(state?.lastAttemptAt ? { lastAttemptAt: state.lastAttemptAt } : {}),
          ...(state?.lastSuccessAt ? { lastSuccessAt: state.lastSuccessAt } : {}),
          summary: {
            created: summary.created,
            updated: summary.updated,
            unchanged: summary.unchanged,
            archived: summary.archived,
            failed: [],
          },
        };
        return res.status(200).json({ status: "success", data });
      } catch (error: unknown) {
        if (error instanceof ShotstackUnavailableError) {
          return res.status(503).json({
            status: "error",
            message: "Dịch vụ Shotstack chưa được cấu hình hợp lệ.",
          });
        }
        return res.status(500).json({
          status: "error",
          message: "Không thể tải trạng thái đồng bộ Shotstack. Vui lòng thử lại sau.",
        });
      }
    },
  };
}

const shotstackAdminHandlers = createShotstackAdminHandlers();

export const videoTemplateController = {
  ...shotstackAdminHandlers,

  async categories(_req: AuthenticatedRequest, res: Response) {
    return res.status(200).json({ status: "success", data: { items: VIDEO_TEMPLATE_CATEGORIES } });
  },

  async list(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoTemplateService.listTemplates(
        getIdentity(req),
        normalizeVideoTemplateListQuery(req.query as Record<string, unknown>)
      );
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tải thư viện mẫu video.";
      return res.status(errorStatus(message)).json({ status: "error", message });
    }
  },

  async detail(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoTemplateService.getTemplateDetail(getIdentity(req), req.params.templateId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tải mẫu video.";
      return res.status(errorStatus(message)).json({ status: "error", message });
    }
  },

  async use(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoTemplateService.useTemplate(
        getIdentity(req),
        req.params.templateId,
        req.body.mode
      );
      return res.status(201).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tạo dự án từ mẫu.";
      return res.status(errorStatus(message)).json({ status: "error", message });
    }
  },

  async create(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoTemplateService.createTemplate(getIdentity(req), req.body);
      return res.status(201).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tạo mẫu video.";
      return res.status(errorStatus(message)).json({ status: "error", message });
    }
  },

  async update(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoTemplateService.updateTemplate(getIdentity(req), req.params.templateId, req.body);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể cập nhật mẫu video.";
      return res.status(errorStatus(message)).json({ status: "error", message });
    }
  },

  async publish(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoTemplateService.publishTemplate(getIdentity(req), req.params.templateId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể xuất bản mẫu video.";
      return res.status(errorStatus(message)).json({ status: "error", message });
    }
  },

  async project(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoTemplateService.getProject(getIdentity(req), req.params.projectId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tải dự án video.";
      return res.status(errorStatus(message)).json({ status: "error", message });
    }
  },

  async projects(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoTemplateService.listProjects(getIdentity(req));
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tải danh sách dự án video.";
      return res.status(errorStatus(message)).json({ status: "error", message });
    }
  },

  async createProject(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoTemplateService.createProject(getIdentity(req), req.body);
      return res.status(201).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tạo dự án video.";
      return res.status(errorStatus(message)).json({ status: "error", message });
    }
  },

  async signProjectMediaUpload(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoTemplateService.signProjectMediaUpload(getIdentity(req), req.body);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể chuẩn bị tải media.";
      const status = message.includes("giới hạn") || message.includes("MIME") || message.includes("để trống")
        ? 400
        : errorStatus(message);
      return res.status(status).json({ status: "error", message });
    }
  },

  async createProjectRender(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoProjectRenderService.createRender(
        getIdentity(req),
        req.params.projectId,
        req.body
      );
      return res.status(202).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tạo bản kết xuất video.";
      const status = videoProjectRenderService.getVideoProjectRenderErrorStatus(error) ?? 500;
      return res.status(status).json({ status: "error", message });
    }
  },

  async projectRenders(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoProjectRenderService.listRenders(getIdentity(req), req.params.projectId);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tải danh sách bản kết xuất video.";
      const status = videoProjectRenderService.getVideoProjectRenderErrorStatus(error) ?? 500;
      return res.status(status).json({ status: "error", message });
    }
  },

  async projectRender(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoProjectRenderService.getRender(
        getIdentity(req),
        req.params.projectId,
        req.params.renderId
      );
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể tải bản kết xuất video.";
      const status = videoProjectRenderService.getVideoProjectRenderErrorStatus(error) ?? 500;
      return res.status(status).json({ status: "error", message });
    }
  },

  async updateProject(req: AuthenticatedRequest, res: Response) {
    try {
      const data = await videoTemplateService.updateProject(getIdentity(req), req.params.projectId, req.body);
      return res.status(200).json({ status: "success", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Không thể lưu dự án video.";
      const status = message.includes("phiên bản mới hơn") ? 409 : errorStatus(message);
      return res.status(status).json({ status: "error", message });
    }
  },
};
