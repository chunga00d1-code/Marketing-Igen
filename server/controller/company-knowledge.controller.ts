import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { aiKnowledgeService } from "../service/ai-knowledge.service";

export const companyKnowledgeController = {
  async listDocuments(req: AuthenticatedRequest, res: Response) {
    try {
      const result = await aiKnowledgeService.listKnowledgeDocuments(
        req.user?.companyCode
      );
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
      const result = await aiKnowledgeService.updateKnowledgeDocumentScopes({
        companyCode: req.user?.companyCode,
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
      const result = await aiKnowledgeService.deleteKnowledgeDocument(
        req.user?.companyCode,
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
};
