import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { aiKnowledgeService } from "../service/ai-knowledge.service";

function getTargetCompanyCode(req: AuthenticatedRequest) {
  if (req.user?.role === "superadmin" && (req.query?.companyCode || req.headers["x-company-code"] || req.body?.companyCode)) {
    return String(req.query?.companyCode || req.headers["x-company-code"] || req.body?.companyCode).trim().toUpperCase();
  }
  return req.user?.companyCode;
}

export const companyKnowledgeController = {
  async listDocuments(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = getTargetCompanyCode(req);
      const result = await aiKnowledgeService.listKnowledgeDocuments(companyCode);
      return res.status(200).json(result);
    } catch (error: unknown) {
      console.error("[CompanyKnowledge] listDocuments error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể tải danh sách tài liệu doanh nghiệp.",
      });
    }
  },

  async updateScopes(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = getTargetCompanyCode(req);
      const result = await aiKnowledgeService.updateKnowledgeDocumentScopes({
        companyCode,
        documentId: req.params.id,
        channelScope: req.body.channelScope,
        purposeScope: req.body.purposeScope,
        pageScope: req.body.pageScope,
        pageIds: req.body.pageIds,
        documentType: req.body.documentType,
      });
      if (!result) {
        return res.status(404).json({
          status: "error",
          message: "Không tìm thấy tài liệu trong doanh nghiệp.",
        });
      }
      return res.status(200).json({ status: "success", document: result });
    } catch (error: unknown) {
      console.error("[CompanyKnowledge] updateScopes error:", error);
      const status = typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : 500;
      return res.status(status).json({
        status: "error",
        message: error instanceof Error
          ? error.message
          : "Không thể cập nhật phạm vi sử dụng tài liệu.",
      });
    }
  },

  async deleteDocument(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = getTargetCompanyCode(req);
      const result = await aiKnowledgeService.deleteKnowledgeDocument(
        companyCode,
        req.params.id
      );
      if (!result) {
        return res.status(404).json({
          status: "error",
          message: "Không tìm thấy tài liệu trong doanh nghiệp.",
        });
      }
      return res.status(200).json({
        status: "success",
        message: `Đã xóa tài liệu “${result.title}”.`,
        document: result,
      });
    } catch (error: unknown) {
      console.error("[CompanyKnowledge] deleteDocument error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể xóa tài liệu doanh nghiệp.",
      });
    }
  },

  async getConflicts(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = getTargetCompanyCode(req);
      const conflicts = await aiKnowledgeService.detectKnowledgeConflicts(companyCode);
      return res.status(200).json({ status: "success", conflicts });
    } catch (error: unknown) {
      console.error("[CompanyKnowledge] getConflicts error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể kiểm tra mâu thuẫn tri thức.",
      });
    }
  },

  async testSearch(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = getTargetCompanyCode(req);
      const { query, channel, pageId, topK } = req.body || {};
      const result = await aiKnowledgeService.testSearchKnowledge({
        companyCode,
        query: String(query || "").trim(),
        channel,
        pageId,
        topK: typeof topK === "number" ? topK : 5,
      });
      return res.status(200).json({ status: "success", ...result });
    } catch (error: unknown) {
      console.error("[CompanyKnowledge] testSearch error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể thử nghiệm tìm kiếm tri thức.",
      });
    }
  },
};
