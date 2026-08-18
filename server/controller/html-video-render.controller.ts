import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import {
  htmlVideoRenderService,
  type HtmlVideoActor,
} from "../service/html-video/html-video-render.service";
import { htmlVideoPromptHistoryService } from "../service/html-video/html-video-prompt-history.service";
import {
  HtmlVideoDraftError,
  htmlVideoDraftService,
  type HtmlVideoDraftErrorCode,
} from "../service/html-video/html-video-draft.service";
import { buildSafeHtmlVideoComposition } from "../service/html-video/html-video-security.service";
import { enqueueHtmlVideoRender } from "../queue/html-video-render-queue";

type ControllerRender = { id: string; status: string };

type HtmlVideoRenderServiceContract = {
  createRender(
    ...args: Parameters<typeof htmlVideoRenderService.createRender>
  ): Promise<{ render: ControllerRender; created: boolean }>;
  getRender(
    ...args: Parameters<typeof htmlVideoRenderService.getRender>
  ): Promise<unknown>;
  listRenders(
    ...args: Parameters<typeof htmlVideoRenderService.listRenders>
  ): Promise<unknown>;
};

type HtmlVideoPromptHistoryServiceContract = {
  createHistory(
    ...args: Parameters<typeof htmlVideoPromptHistoryService.createHistory>
  ): Promise<unknown>;
  listHistory(
    ...args: Parameters<typeof htmlVideoPromptHistoryService.listHistory>
  ): Promise<unknown>;
  attachRender?: (
    ...args: Parameters<typeof htmlVideoPromptHistoryService.attachRender>
  ) => Promise<unknown>;
};

type HtmlVideoDraftServiceContract = Pick<
  typeof htmlVideoDraftService,
  "generate"
>;

export type HtmlVideoRenderControllerDependencies = {
  service: HtmlVideoRenderServiceContract;
  promptHistoryService: HtmlVideoPromptHistoryServiceContract;
  draftService: HtmlVideoDraftServiceContract;
  enqueue: typeof enqueueHtmlVideoRender;
};

function actorFrom(req: AuthenticatedRequest): HtmlVideoActor {
  if (!req.user?.id) {
    throw new Error("Bạn cần đăng nhập để tạo video từ HTML.");
  }
  const requestedCompany = req.headers["x-company-code"];
  const candidate = Array.isArray(requestedCompany)
    ? requestedCompany[0]
    : requestedCompany;
  const companyCode = (
    req.user.role === "superadmin"
      ? candidate || req.user.companyCode || "SYSTEM"
      : req.user.companyCode || ""
  )
    .trim()
    .toUpperCase();
  if (!companyCode) {
    throw new Error("Tài khoản chưa được gán doanh nghiệp.");
  }
  return { id: req.user.id, companyCode };
}

function respondError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const status = /không tìm thấy|không có quyền/i.test(message) ? 404 : 400;
  return res.status(status).json({ success: false, message });
}

const draftErrorResponses: Record<
  HtmlVideoDraftErrorCode,
  { status: number; message: string }
> = {
  INSUFFICIENT_BALANCE: {
    status: 402,
    message: "Số dư ví không đủ. Vui lòng nạp thêm tiền để tiếp tục.",
  },
  MODEL_ACCESS_DENIED: {
    status: 503,
    message:
      "Model HTML-to-Video chưa được cấp quyền trên OpenRouter. Vui lòng kiểm tra OPENROUTER_API_KEY hoặc quyền truy cập model.",
  },
  MODEL_REQUEST_REJECTED: {
    status: 422,
    message:
      "OpenRouter đã từ chối yêu cầu HTML-to-Video. Vui lòng thử lại với prompt ngắn hơn hoặc kiểm tra model đang cấu hình.",
  },
  AI_UNAVAILABLE: {
    status: 503,
    message: "Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau.",
  },
  INVALID_OUTPUT: {
    status: 422,
    message: "AI không tạo được HTML/CSS video hợp lệ. Vui lòng thử lại.",
  },
  INTERNAL: {
    status: 500,
    message:
      "Không thể tạo HTML/CSS video lúc này. Vui lòng thử lại sau.",
  },
};

function respondDraftError(res: Response, error: unknown) {
  const statusCode =
    typeof error === "object" && error !== null
      ? Number((error as { statusCode?: unknown }).statusCode)
      : 0;
  const response =
    statusCode === 402
      ? draftErrorResponses.INSUFFICIENT_BALANCE
      : error instanceof HtmlVideoDraftError
        ? draftErrorResponses[error.code] || draftErrorResponses.INTERNAL
        : draftErrorResponses.INTERNAL;
  return res
    .status(response.status)
    .json({ success: false, message: response.message });
}

export function createHtmlVideoRenderController(
  dependencies: HtmlVideoRenderControllerDependencies
) {
  return {
    async preview(req: AuthenticatedRequest, res: Response) {
      try {
        actorFrom(req);
        const safe = buildSafeHtmlVideoComposition(req.body);
        return res.json({
          success: true,
          data: {
            compositionHtml: safe.compositionHtml,
            width: safe.width,
            height: safe.height,
          },
        });
      } catch (error) {
        return respondError(res, error);
      }
    },

    async generateDraft(req: AuthenticatedRequest, res: Response) {
      try {
        const draft = await dependencies.draftService.generate(
          actorFrom(req),
          req.body
        );
        return res.json({ success: true, data: draft });
      } catch (error) {
        return respondDraftError(res, error);
      }
    },

    async create(req: AuthenticatedRequest, res: Response) {
      try {
        const result = await dependencies.service.createRender(
          actorFrom(req),
          req.body
        );
        if (req.body.promptHistoryId && dependencies.promptHistoryService.attachRender) {
          await dependencies.promptHistoryService.attachRender(
            actorFrom(req), req.body.promptHistoryId, result.render.id
          );
        }
        if (result.created || result.render.status === "queued") {
          await dependencies.enqueue(result.render.id);
        }
        return res.status(result.created ? 202 : 200).json({
          success: true,
          data: result.render,
        });
      } catch (error) {
        return respondError(res, error);
      }
    },

    async get(req: AuthenticatedRequest, res: Response) {
      try {
        const render = await dependencies.service.getRender(
          actorFrom(req),
          req.params.renderId
        );
        return res.json({ success: true, data: render });
      } catch (error) {
        return respondError(res, error);
      }
    },

    async list(req: AuthenticatedRequest, res: Response) {
      try {
        const renders = await dependencies.service.listRenders(actorFrom(req));
        return res.json({ success: true, data: renders });
      } catch (error) {
        return respondError(res, error);
      }
    },

    async listPromptHistory(req: AuthenticatedRequest, res: Response) {
      try {
        const histories = await dependencies.promptHistoryService.listHistory(
          actorFrom(req)
        );
        return res.json({ success: true, data: histories });
      } catch (error) {
        return respondError(res, error);
      }
    },

    async createPromptHistory(req: AuthenticatedRequest, res: Response) {
      try {
        const history = await dependencies.promptHistoryService.createHistory(
          actorFrom(req),
          req.body
        );
        return res.status(201).json({ success: true, data: history });
      } catch (error) {
        return respondError(res, error);
      }
    },
  };
}

export const htmlVideoRenderController = createHtmlVideoRenderController({
  service: htmlVideoRenderService,
  promptHistoryService: htmlVideoPromptHistoryService,
  draftService: htmlVideoDraftService,
  enqueue: enqueueHtmlVideoRender,
});
