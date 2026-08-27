import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { aiKnowledgeService } from "../service/ai-knowledge.service";
import { aiKnowledgeLearningService } from "../service/ai-knowledge-learning.service";

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

  async listFaqCandidates(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = getTargetCompanyCode(req);
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const result = await aiKnowledgeLearningService.listFaqCandidates(companyCode, status);
      return res.status(200).json({ status: "success", ...result });
    } catch (error: unknown) {
      console.error("[CompanyKnowledge] listFaqCandidates error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể tải danh sách câu hỏi đề xuất.",
      });
    }
  },

  async analyzeFaqs(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = getTargetCompanyCode(req);
      const result = await aiKnowledgeLearningService.analyzeConversationsAndExtractFaqs(companyCode);
      return res.status(200).json({ status: "success", ...result });
    } catch (error: unknown) {
      console.error("[CompanyKnowledge] analyzeFaqs error:", error);
      return res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Lỗi khi quét và phân tích hội thoại.",
      });
    }
  },

  async approveFaqCandidate(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = getTargetCompanyCode(req);
      const candidateId = req.params.id;
      const customAnswer = req.body?.customAnswer;
      const result = await aiKnowledgeLearningService.approveFaqCandidate({
        candidateId,
        customAnswer,
        companyCode,
        userId: req.user?.id,
      });
      return res.status(200).json(result);
    } catch (error: unknown) {
      console.error("[CompanyKnowledge] approveFaqCandidate error:", error);
      return res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể duyệt câu hỏi đề xuất.",
      });
    }
  },

  async rejectFaqCandidate(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = getTargetCompanyCode(req);
      const candidateId = req.params.id;
      const result = await aiKnowledgeLearningService.rejectFaqCandidate({
        candidateId,
        companyCode,
        userId: req.user?.id,
      });
      return res.status(200).json(result);
    } catch (error: unknown) {
      console.error("[CompanyKnowledge] rejectFaqCandidate error:", error);
      return res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể bỏ qua câu hỏi đề xuất.",
      });
    }
  },

  async deleteFaqCandidate(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = getTargetCompanyCode(req);
      const candidateId = req.params.id;
      const result = await aiKnowledgeLearningService.deleteFaqCandidate({
        candidateId,
        companyCode,
        userId: req.user?.id,
      });
      return res.status(200).json(result);
    } catch (error: unknown) {
      console.error("[CompanyKnowledge] deleteFaqCandidate error:", error);
      return res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể xóa đề xuất câu hỏi.",
      });
    }
  },

  async clearAllKnowledge(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = getTargetCompanyCode(req);
      if (!companyCode) {
        return res.status(400).json({ status: "error", message: "Thiếu mã doanh nghiệp." });
      }
      await aiKnowledgeService.clearKnowledge(companyCode);
      return res.status(200).json({
        status: "success",
        message: `Đã xóa sạch toàn bộ kho tri thức của doanh nghiệp ${companyCode}.`,
      });
    } catch (error: unknown) {
      console.error("[CompanyKnowledge] clearAllKnowledge error:", error);
      return res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể xóa kho tri thức.",
      });
    }
  },
};
