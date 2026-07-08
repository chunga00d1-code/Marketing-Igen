import { Request, Response } from "express";
import mongoose from "mongoose";
import { geminiService } from "../service/gemini.service";
import { videoBlueprintService } from "../service/video-blueprint.service";
import { AuthenticatedRequest } from "../middleware/auth";
import { aiKnowledgeService } from "../service/ai-knowledge.service";
import { walletService, API_COSTS } from "../service/wallet.service";
import { AIMediaModel } from "../model/ai-media.model";
import { broadcastEvent } from "../socket";
import * as XLSX from "xlsx";
import { openrouterChat } from "../service/openrouter.service";

function handleGeminiError(res: Response, error: any, defaultMessage: string) {
  const isPiApiError = String(error.message || "").toUpperCase().includes("PIAPI");
  const details = isPiApiError ? "Lỗi nội bộ dịch vụ tạo media AI." : error.message || String(error);
  const status = error.status || error.statusCode;

  if (status === 402 && !String(error.message || "").toUpperCase().includes("PIAPI")) {
    return res.status(402).json({
      status: "error",
      message: error.message || "Số dư ví không đủ. Vui lòng nạp thêm tiền.",
    });
  }

  let errMsg = defaultMessage;
  let statusCode = 500;
  const errStr = String(error.message || "").toUpperCase();

  // Pass through user-friendly overload message directly
  const isOverloadMsg = (error.message || "").includes("Mô hình AI quá tải");
  if (isOverloadMsg) {
    return res.status(503).json({
      status: "error",
      message: error.message,
    });
  }

  if (
    isPiApiError &&
    (status === 402 ||
      errStr.includes("INSUFFICIENT_CREDITS") ||
      errStr.includes("OUT OF CREDITS") ||
      errStr.includes("NO CREDIT") ||
      errStr.includes("PAYMENT REQUIRED") ||
      errStr.includes("BALANCE"))
  ) {
    errMsg = "PiAPI het credit hoac so du khong du de tao media.";
    statusCode = 402;
  } else if (
    isPiApiError &&
    (status === 429 ||
      errStr.includes("RESOURCE_EXHAUSTED") ||
      errStr.includes("RATE LIMIT") ||
      errStr.includes("TOO MANY REQUESTS") ||
      errStr.includes("QUOTA"))
  ) {
    errMsg = "PiAPI da vuot quota hoac rate limit.";
    statusCode = 429;
  } else if (
    isPiApiError &&
    (status === 401 ||
      status === 403 ||
      errStr.includes("UNAUTHORIZED") ||
      errStr.includes("FORBIDDEN") ||
      errStr.includes("INVALID API KEY"))
  ) {
    errMsg = "PiAPI tu choi truy cap hoac API key khong hop le.";
    statusCode = status === 401 ? 401 : 403;
  } else if (isPiApiError && status === 400) {
    errMsg = "PiAPI tu choi yeu cau tao media do du lieu dau vao khong hop le hoac task bi fail.";
    statusCode = 400;
  } else if (status === 503 || errStr.includes("503") || errStr.includes("UNAVAILABLE")) {
    errMsg = "Dịch vụ AI của Gemini hiện đang quá tải hoặc tạm thời không khả dụng. Vui lòng thử lại sau ít phút.";
    statusCode = 503;
  } else if (status === 429 || errStr.includes("429") || errStr.includes("RESOURCE_EXHAUSTED")) {
    errMsg = "Yêu cầu vượt quá giới hạn tần suất (Rate Limit) cho phép của API Key. Vui lòng đợi và thử lại sau.";
    statusCode = 429;
  } else if (status === 400 || errStr.includes("400") || errStr.includes("INVALID_ARGUMENT")) {
    errMsg = "Tham số yêu cầu không hợp lệ hoặc bị từ chối bởi quy tắc an toàn nội dung của Google AI.";
    statusCode = 400;
  } else if (status === 403 || errStr.includes("403") || errStr.includes("PERMISSION_DENIED")) {
    errMsg = "API Key không hợp lệ hoặc không có quyền truy cập vào mô hình AI.";
    statusCode = 403;
  }

  return res.status(statusCode).json({
    status: "error",
    message: errMsg,
    details: details,
  });
}

const DRIVE_PDF_PRIMARY_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";
const DRIVE_PDF_FALLBACK_MODEL = "gemini-2.5-flash";

function isGeminiModelNotFound(error: any): boolean {
  const errorMsg = error?.message || String(error);
  return error?.status === 404 || errorMsg.includes("is not found for API version") || errorMsg.includes("\"status\":\"NOT_FOUND\"");
}

async function extractPdfTextWithModelFallback(pdfBase64: string): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const model = DRIVE_PDF_PRIMARY_MODEL;
  console.log(`[AI AutoReply] Dang goi OpenRouter trich xuat van ban tu PDF (model: ${model})...`);

  const result = await openrouterChat({
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfBase64}` } },
          { type: "text", text: "Bạn là trợ lý trích xuất văn bản. Hãy trích xuất và trả về toàn bộ nội dung văn bản có trong file PDF này theo đúng thứ tự đọc. Chỉ trả về văn bản thuần, không thêm giải thích hay markdown." },
        ],
      },
    ],
    temperature: 0.1,
  });

  return result.text;
}

function getTextModelCost(aiConfig: any): number {
  const model = String(aiConfig?.model || "").toLowerCase();
  if (model.includes("pro")) return 10;
  if (model.includes("lite")) return 1.5;
  return 2.5; // Default flash
}

function isProbablyHtml(text: string) {
  const sample = String(text || "").trim().slice(0, 500).toLowerCase();
  return sample.includes("<!doctype html") || sample.includes("<html");
}

function isTextLikeContentType(contentType: string) {
  const normalized = String(contentType || "").toLowerCase();
  return [
    "text/plain",
    "text/csv",
    "text/markdown",
    "text/html",
    "text/xml",
    "application/json",
    "application/xml",
    "application/rtf",
  ].some((type) => normalized.includes(type));
}

function extractWorkbookText(buffer: Buffer) {
  try {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    return workbook.SheetNames.map((sheetName) => {
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(worksheet, {
        header: 1,
        raw: false,
        defval: "",
      });

      if (!rows.length) return "";

      const normalizedRows = rows
        .map((row) => row.map((cell) => String(cell ?? "").trim()))
        .filter((row) => row.some((cell) => cell.length > 0));

      if (!normalizedRows.length) return "";

      const headerKeywords = /(ten|tên|san pham|sản phẩm|sku|ma|mã|gia|giá|don gia|đơn giá|price|model|size|mau|màu|so luong|số lượng|tên hàng|tên hàng hóa|mã hàng|giá bán|giá lẻ|nhóm hàng|loại sản phẩm)/i;
      const headerIndex = normalizedRows.findIndex((row) => row.filter(Boolean).some((cell) => headerKeywords.test(cell)));
      const safeHeaderIndex = headerIndex >= 0 ? headerIndex : 0;

      const headers = normalizedRows[safeHeaderIndex];
      const bodyRows = normalizedRows.slice(safeHeaderIndex + 1);

      const structuredLines = bodyRows
        .map((row, rowIndex) => {
          const pairs = row
            .map((cell, index) => {
              const header = headers[index] || `Cot ${index + 1}`;
              return cell ? `${header}: ${cell}` : "";
            })
            .filter(Boolean);
          if (pairs.length === 0) return "";

          const rowMap = new Map<string, string>();
          row.forEach((cell, index) => {
            const header = String(headers[index] || `Cot ${index + 1}`).trim();
            const value = String(cell || "").trim();
            if (header && value) {
              rowMap.set(header.toLowerCase(), value);
            }
          });

          const productName =
            rowMap.get("tên sản phẩm") ||
            rowMap.get("ten san pham") ||
            rowMap.get("tên hàng") ||
            rowMap.get("ten hang") ||
            rowMap.get("tên hàng hóa") ||
            rowMap.get("ten hang hoa") ||
            rowMap.get("sản phẩm") ||
            rowMap.get("san pham") ||
            rowMap.get("product") ||
            "";

          const category =
            rowMap.get("danh mục") ||
            rowMap.get("danh muc") ||
            rowMap.get("nhóm hàng") ||
            rowMap.get("nhom hang") ||
            rowMap.get("loại sản phẩm") ||
            rowMap.get("loai san pham") ||
            rowMap.get("category") ||
            "";

          const price =
            rowMap.get("giá tham khảo (vnđ)") ||
            rowMap.get("gia tham khao (vnd)") ||
            rowMap.get("giá bán") ||
            rowMap.get("gia ban") ||
            rowMap.get("giá lẻ") ||
            rowMap.get("gia le") ||
            rowMap.get("đơn giá") ||
            rowMap.get("don gia") ||
            rowMap.get("giá") ||
            rowMap.get("gia") ||
            rowMap.get("price") ||
            "";

          if (productName) {
            const detailStr = pairs.join(" | ");
            return `Sản phẩm ${rowIndex + 1}: ${productName}${category ? ` (Danh mục: ${category})` : ""}${price ? ` - Giá: ${price}` : ""} | Chi tiết: ${detailStr}`;
          }

          return `Dòng ${rowIndex + 1}: ${pairs.join(" | ")}`;
        })
        .filter(Boolean);

      const sections = [
        `Sheet: ${sheetName}`,
        headers.filter(Boolean).length > 0 ? `Tiêu đề cột: ${headers.filter(Boolean).join(" | ")}` : "",
        structuredLines.join("\n\n"),
      ].filter(Boolean);

      return sections.join("\n\n");
    }).filter(Boolean).join("\n\n");
  } catch (error) {
    console.warn("[AI AutoReply] Khong the doc file bang xlsx:", error);
    return "";
  }
}

function extractStructuredSheetTextFromString(rawText: string, fileLabel: string) {
  try {
    const workbook = XLSX.read(rawText, { type: "string" });
    return extractWorkbookText(Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })));
  } catch (error) {
    console.warn(`[AI AutoReply] Khong the parse bang du lieu dang chuoi cho ${fileLabel}:`, error);
    return rawText;
  }
}

const COMMON_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
};

async function fetchDirectDriveFile(fileId: string): Promise<{ buffer: Buffer; contentType: string }> {
  const directUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
  
  let res = await fetch(directUrl, { headers: COMMON_HEADERS });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  
  let contentType = res.headers.get("content-type") || "";
  let arrayBuffer = await res.arrayBuffer();
  let buffer = Buffer.from(arrayBuffer);
  
  // Check if we got a Google Drive virus scan warning HTML page
  if (contentType.toLowerCase().includes("text/html")) {
    const htmlText = buffer.toString("utf-8");
    const confirmMatch = htmlText.match(/confirm=([a-zA-Z0-9-_]+)/);
    if (confirmMatch) {
      const confirmToken = confirmMatch[1];
      const confirmUrl = `https://drive.google.com/uc?export=download&confirm=${confirmToken}&id=${fileId}`;
      const confirmRes = await fetch(confirmUrl, { headers: COMMON_HEADERS });
      if (confirmRes.ok) {
        contentType = confirmRes.headers.get("content-type") || "";
        const confirmBuffer = await confirmRes.arrayBuffer();
        buffer = Buffer.from(confirmBuffer);
      }
    }
  }
  
  return { buffer, contentType };
}

async function parseUploadedDocument(base64Data: string, mimeType: string, fileName: string): Promise<string> {
  const normMime = mimeType.toLowerCase();

  // 1. Text files (.txt, .md, .csv)
  if (
    normMime.includes("text/plain") ||
    normMime.includes("text/markdown") ||
    normMime.includes("text/csv") ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md")
  ) {
    return Buffer.from(base64Data, "base64").toString("utf-8");
  }

  // 2. Spreadsheets (XLS, XLSX, CSV)
  const isSpreadsheet =
    normMime.includes("spreadsheetml") ||
    normMime.includes("ms-excel") ||
    normMime.includes("officedocument.spreadsheetml") ||
    fileName.endsWith(".xlsx") ||
    fileName.endsWith(".xls") ||
    fileName.endsWith(".csv");

  if (isSpreadsheet) {
    const buffer = Buffer.from(base64Data, "base64");
    const workbookText = extractWorkbookText(buffer);
    if (workbookText) {
      return workbookText;
    }
  }

  // 3. PDFs, DOCX, PPTX using Gemini
  const isPdf = normMime.includes("pdf") || fileName.endsWith(".pdf");
  const isDocx =
    normMime.includes("wordprocessingml") ||
    normMime.includes("msword") ||
    fileName.endsWith(".docx") ||
    fileName.endsWith(".doc");
  const isPptx =
    normMime.includes("presentationml") ||
    normMime.includes("powerpoint") ||
    fileName.endsWith(".pptx") ||
    fileName.endsWith(".ppt");

  if (isPdf || isDocx || isPptx) {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }
    const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

    console.log(`[AI AutoReply] Đang gọi OpenRouter trích xuất văn bản từ file upload (${fileName})...`);

    let cleanMime = mimeType;
    if (isPdf) cleanMime = "application/pdf";
    else if (isDocx) cleanMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    else if (isPptx) cleanMime = "application/vnd.openxmlformats-officedocument.presentationml.presentation";

    const result = await openrouterChat({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${cleanMime};base64,${base64Data}` } },
            { type: "text", text: "Bạn là trợ lý trích xuất văn bản. Hãy trích xuất và trả về toàn bộ nội dung văn bản có trong tài liệu này theo đúng thứ tự đọc. Chỉ trả về văn bản thuần của tài liệu, không thêm giải thích hay định dạng markdown." },
          ],
        },
      ],
      temperature: 0.1,
    });

    return result.text;
  }

  // Fallback to text
  try {
    return Buffer.from(base64Data, "base64").toString("utf-8");
  } catch (e) {
    throw new Error("Định dạng file không được hỗ trợ để trích xuất văn bản.");
  }
}

async function fetchDriveFileContent(fileId: string): Promise<{ text: string; title: string }> {
  // 1. Google Doc Text Export
  try {
    const docUrl = `https://docs.google.com/document/d/${fileId}/export?format=txt`;
    const res = await fetch(docUrl, { headers: COMMON_HEADERS });
    if (res.ok) {
      const text = await res.text();
      if (text && !isProbablyHtml(text) && text.length > 50) {
        return { text, title: `Google Doc (${fileId})` };
      }
    }
  } catch (e) {
    console.warn(`Doc export failed for ${fileId}:`, e);
  }

  // 2. Google Sheet CSV Export
  try {
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${fileId}/export?format=csv`;
    const res = await fetch(sheetUrl, { headers: COMMON_HEADERS });
    if (res.ok) {
      const text = await res.text();
      if (text && !isProbablyHtml(text) && text.length > 50) {
        return {
          text: extractStructuredSheetTextFromString(text, `Google Sheet (${fileId})`),
          title: `Google Sheet (${fileId})`
        };
      }
    }
  } catch (e) {
    console.warn(`Sheet export failed for ${fileId}:`, e);
  }

  // 3. Google Slides text export
  try {
    const slideUrl = `https://docs.google.com/presentation/d/${fileId}/export/txt`;
    const res = await fetch(slideUrl, { headers: COMMON_HEADERS });
    if (res.ok) {
      const text = await res.text();
      if (text && !isProbablyHtml(text) && text.length > 20) {
        return { text, title: `Google Slides (${fileId})` };
      }
    }
  } catch (e) {
    console.warn(`Slides export failed for ${fileId}:`, e);
  }

  // 4. Direct File Download (e.g. for text files, spreadsheets or PDFs)
  try {
    const { buffer, contentType } = await fetchDirectDriveFile(fileId);

    // Check if it is a PDF file by content-type or magic bytes (%PDF)
    const isPdf = contentType.toLowerCase().includes("pdf") || 
      (buffer.length >= 4 && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46);

    if (isPdf) {
      console.log(`[AI AutoReply] Phát hiện file PDF (${fileId}). Tiến hành trích xuất văn bản qua Gemini...`);
      const base64 = buffer.toString("base64");
      const extractedText = await extractPdfTextWithModelFallback(base64);
      if (extractedText && extractedText.trim().length > 0) {
        return { text: extractedText, title: `PDF File (${fileId})` };
      }
    }

    const normalizedContentType = contentType.toLowerCase();
    const isSpreadsheet =
      normalizedContentType.includes("spreadsheetml") ||
      normalizedContentType.includes("ms-excel") ||
      normalizedContentType.includes("officedocument.spreadsheetml");
    if (isSpreadsheet) {
      const workbookText = extractWorkbookText(buffer);
      if (workbookText) {
        return { text: workbookText, title: `Spreadsheet File (${fileId})` };
      }
    }

    if (isTextLikeContentType(normalizedContentType)) {
      const text = buffer.toString("utf-8");
      if (text && !isProbablyHtml(text) && text.length > 10) {
        return { text, title: `Drive File (${fileId})` };
      }
    }
  } catch (e) {
    console.warn(`Direct download failed for ${fileId}:`, e);
  }

  return { text: "", title: "" };
}

async function fetchDriveFolderFileIds(folderId: string): Promise<string[]> {
  try {
    const embeddedUrl = `https://drive.google.com/embeddedfolderview?id=${folderId}`;
    let res = await fetch(embeddedUrl, { headers: COMMON_HEADERS });
    let html = "";
    if (res.ok) {
      html = await res.text();
    } else {
      console.warn(`Failed to fetch embedded folder view, trying public folder view for ${folderId}`);
      const publicUrl = `https://drive.google.com/drive/folders/${folderId}`;
      res = await fetch(publicUrl, { headers: COMMON_HEADERS });
      if (res.ok) {
        html = await res.text();
      }
    }

    if (!html) {
      console.warn(`Could not retrieve folder HTML for ${folderId}`);
      return [];
    }

    const fileIdMatches = [
      ...html.matchAll(/\/document\/d\/([a-zA-Z0-9-_]{25,50})/g),
      ...html.matchAll(/\/file\/d\/([a-zA-Z0-9-_]{25,50})/g),
      ...html.matchAll(/\/spreadsheets\/d\/([a-zA-Z0-9-_]{25,50})/g),
      ...html.matchAll(/\/presentation\/d\/([a-zA-Z0-9-_]{25,50})/g),
      ...html.matchAll(/\/open\?id=([a-zA-Z0-9-_]{25,50})/g),
      ...html.matchAll(/data-id="([a-zA-Z0-9-_]{28,45})"/g),
      ...html.matchAll(/"id"\s*:\s*"([a-zA-Z0-9-_]{28,45})"/g),
      ...html.matchAll(/\\x22([a-zA-Z0-9-_]{28,45})\\x22/g),
      ...html.matchAll(/\\u0022([a-zA-Z0-9-_]{28,45})\\u0022/g)
    ];
    const docIds = Array.from(new Set(fileIdMatches.map(m => m[1]).filter(id => id !== folderId)));
    console.log(`[AI AutoReply] Đã phân tích thư mục ${folderId}, tìm thấy ${docIds.length} files:`, docIds);
    return docIds;
  } catch (err) {
    console.error(`Error listing folder ${folderId}:`, err);
    return [];
  }
}

function normalizeDriveDocText(rawText: string) {
  return String(rawText || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const geminiController = {
  /**
   * POST /api/v1/gemini/chat
   */
  async chat(req: Request, res: Response) {
    try {
      const { message, history, aiConfig } = req.body;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      const cost = getTextModelCost(aiConfig);
      await walletService.checkBalance(userId, cost);
      const companyCode = (req as any).user?.companyCode;
      const result = await geminiService.chat(message, history, aiConfig, { companyCode });
      await walletService.deductBalance(userId    , cost, "Chi phí sử dụng Trợ lý AI Chatbot");
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.chat] Error:", error);
      return handleGeminiError(res, error, "Lỗi kết nối Trợ lý AI Chatbot");
    }
  },

  /**
   * GET /api/v1/gemini/knowledge-health
   */
  async getKnowledgeHealth(req: AuthenticatedRequest, res: Response) {
    try {
      const result = await aiKnowledgeService.getKnowledgeHealth(req.user?.companyCode);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.getKnowledgeHealth] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể kiểm tra trạng thái tri thức AI",
        details: error.message,
      });
    }
  },

  /**
   * POST /api/v1/gemini/clear-knowledge
   */
  async clearKnowledge(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode = req.user?.companyCode || "SYSTEM";
      await aiKnowledgeService.clearKnowledge(companyCode);
      return res.status(200).json({
        status: "success",
        message: "Đã xóa toàn bộ tài liệu tri thức AI của doanh nghiệp thành công."
      });
    } catch (error: any) {
      console.error("[geminiController.clearKnowledge] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể xóa tài liệu tri thức",
        details: error.message,
      });
    }
  },

  /**
   * POST /api/v1/gemini/test-reply
   */
  async testReply(req: AuthenticatedRequest, res: Response) {
    try {
      const { message, aiConfig } = req.body;
      const companyCode = req.user?.companyCode || "SYSTEM";
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      const cost = getTextModelCost(aiConfig);
      await walletService.checkBalance(userId, cost);
      const startedAt = Date.now();
      const ragContext = await aiKnowledgeService.searchRelevantContext({
        companyCode,
        query: message,
        channel: "facebook",
        topK: 5,
      });

      const effectiveRagContext = aiKnowledgeService.buildEffectiveRagContext({
        companyCode,
        ragContext,
        trainingKnowledge: aiConfig?.trainingKnowledge,
      });
      const effectiveRagContextDebug = aiKnowledgeService.describeEffectiveRagContext(effectiveRagContext as any);
      console.log("[geminiController.testReply] Context diagnostics:", JSON.stringify({
        companyCode,
        messageLength: String(message || "").length,
        ...effectiveRagContextDebug,
      }));

      const result = await geminiService.chat(message, [], aiConfig || {}, effectiveRagContext);
      const log = await aiKnowledgeService.createReplyLog({
        companyCode,
        channel: "test",
        customerMessage: message,
        aiResponse: result.text,
        contextText: effectiveRagContext.contextText,
        contextMatches: effectiveRagContext.matches,
        latencyMs: Date.now() - startedAt,
        status: "preview",
      });

      await walletService.deductBalance(userId, cost, "Chi phí test câu trả lời tự động AI");
      return res.status(200).json({
        ...result,
        mode: effectiveRagContext.contextText ? "trained" : "default",
        contextMatches: effectiveRagContext.matches || 0,
        logId: log._id,
      });
    } catch (error: any) {
      console.error("[geminiController.testReply] Error:", error);
      return handleGeminiError(res, error, "Không thể tạo câu trả lời thử");
    }
  },

  /**
   * GET /api/v1/gemini/ai-reply-logs
   */
  async listAIReplyLogs(req: AuthenticatedRequest, res: Response) {
    try {
      const logs = await aiKnowledgeService.listReplyLogs(req.user?.companyCode, Number(req.query.limit || 20));
      return res.status(200).json({ logs });
    } catch (error: any) {
      console.error("[geminiController.listAIReplyLogs] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể tải log phản hồi AI",
        details: error.message,
      });
    }
  },

  /**
   * PATCH /api/v1/gemini/ai-reply-logs/:id/feedback
   */
  async updateAIReplyFeedback(req: AuthenticatedRequest, res: Response) {
    try {
      const { feedback, note } = req.body;
      const log = await aiKnowledgeService.updateReplyFeedback(req.user?.companyCode, req.params.id, feedback, note);
      if (!log) {
        return res.status(404).json({ status: "error", message: "Không tìm thấy log phản hồi AI." });
      }
      return res.status(200).json({ status: "success", log });
    } catch (error: any) {
      console.error("[geminiController.updateAIReplyFeedback] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể lưu feedback phản hồi AI",
        details: error.message,
      });
    }
  },

  /**
   * GET /api/v1/gemini/marketing-suggestions
   */
  async getMarketingSuggestions(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      await walletService.checkBalance(userId, API_COSTS.GEMINI_MARKETING);
      const suggestions = await geminiService.getMarketingSuggestions();
      await walletService.deductBalance(userId, API_COSTS.GEMINI_MARKETING, "Chi phí tạo gợi ý chủ đề Marketing AI");
      return res.status(200).json({ suggestions });
    } catch (error: any) {
      console.error("[geminiController.getMarketingSuggestions] Error:", error);
      return handleGeminiError(res, error, "Lỗi tạo gợi ý chủ đề marketing");
    }
  },

  /**
   * POST /api/v1/gemini/marketing-pillars
   */
  async analyzeMarketingPillars(req: Request, res: Response) {
    try {
      const { campaignTopic, images } = req.body;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      const startTime = Date.now();
      console.log(`[geminiController.analyzeMarketingPillars] START | userId=${userId} | topic="${String(campaignTopic).slice(0, 80)}" | images=${images?.length || 0}`);
      await walletService.checkBalance(userId, API_COSTS.GEMINI_MARKETING);
      const result = await geminiService.analyzeMarketingPillars(campaignTopic, images);
      const elapsed = Date.now() - startTime;
      console.log(`[geminiController.analyzeMarketingPillars] DONE | ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s) | pillars=${result?.pillars?.length || 0} | isMock=${result?.isMock}`);
      await walletService.deductBalance(userId, API_COSTS.GEMINI_MARKETING, "Chi phí phân tích Content Pillars bằng AI");
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.analyzeMarketingPillars] Error:", error);
      return handleGeminiError(res, error, "Lỗi phân tích khung nội dung content pillars");
    }
  },

  /**
   * POST /api/v1/gemini/marketing-pillars/swap
   */
  async swapMarketingPillar(req: Request, res: Response) {
    try {
      const { campaignTopic, currentPillars, pillarIdToReplace, images } = req.body;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      await walletService.checkBalance(userId, API_COSTS.GEMINI_MARKETING);
      const result = await geminiService.swapMarketingPillar(campaignTopic, currentPillars, pillarIdToReplace, images);
      await walletService.deductBalance(userId, API_COSTS.GEMINI_MARKETING, "Chi phí thay đổi Content Pillar bằng AI");
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.swapMarketingPillar] Error:", error);
      return handleGeminiError(res, error, "Lỗi thay đổi Content Pillar");
    }
  },

  /**
   * POST /api/v1/gemini/marketing-ideas
   */
  async generateMarketingIdeas(req: Request, res: Response) {
    try {
      const { campaignTopic, selectedPillars, channels, mediaType, images } = req.body;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      const startTime = Date.now();
      const promptLen = String(campaignTopic || "").length;
      console.log(`[geminiController.generateMarketingIdeas] START | userId=${userId} | promptLen=${promptLen} | pillars=${selectedPillars?.length || 0} | channels=${channels?.join(",") || "auto"} | mediaType=${mediaType || "none"} | images=${images?.length || 0}`);
      await walletService.checkBalance(userId, API_COSTS.GEMINI_MARKETING);
      const result = await geminiService.generateMarketingIdeas(campaignTopic, selectedPillars, channels, mediaType, images);
      const elapsed = Date.now() - startTime;
      console.log(`[geminiController.generateMarketingIdeas] DONE | ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s) | concepts=${result?.concepts?.length || 0} | isMock=${result?.isMock}`);
      await walletService.deductBalance(userId, API_COSTS.GEMINI_MARKETING, "Chi phí phát sinh ý tưởng chiến dịch AI");
      return res.status(200).json(result);
    } catch (error: any) {
      const elapsed = Date.now() - (req as any)._startTime || 0;
      console.error(`[geminiController.generateMarketingIdeas] FAILED after ~${elapsed}ms |`, error);
      return handleGeminiError(res, error, "Lỗi phát sinh ý tưởng chiến dịch AI");
    }
  },

  /**
   * POST /api/v1/gemini/marketing-develop
   */
  async developMarketingIdea(req: Request, res: Response) {
    try {
      const {
        title,
        summary,
        suggestedContent,
        channels,
        mediaType,
        imageModel,
        imageResolution,
        imageAspectRatio,
        videoModel,
        videoQuality,
        videoDuration,
        videoAspectRatio,
        mediaPrompt,
        humanVoiceId,
        humanVoiceModel,
        humanDurationSeconds
      } = req.body;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      const startTime = Date.now();
      console.log(`[geminiController.developMarketingIdea] START | userId=${userId} | title="${String(title).slice(0, 60)}" | channels=${channels?.join(",") || "auto"} | mediaType=${mediaType || "none"}`);
      await walletService.checkBalance(userId, API_COSTS.GEMINI_MARKETING);
      const result = await geminiService.developMarketingIdea(title, summary, suggestedContent, channels, {
        mediaType,
        imageModel,
        imageResolution,
        imageAspectRatio,
        videoModel,
        videoQuality,
        videoDuration,
        videoAspectRatio,
        mediaPrompt,
        humanVoiceId,
        humanVoiceModel,
        humanDurationSeconds: humanDurationSeconds ? Number(humanDurationSeconds) : undefined,
      });
      const elapsed = Date.now() - startTime;
      console.log(`[geminiController.developMarketingIdea] DONE | ${elapsed}ms (${(elapsed / 1000).toFixed(1)}s) | posts=${result?.posts?.length || 0} | isMock=${result?.isMock}`);
      await walletService.deductBalance(userId, API_COSTS.GEMINI_MARKETING, "Chi phí viết bài và lập dàn ý Marketing AI");
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.developMarketingIdea] Error:", error);
      return handleGeminiError(res, error, "Lỗi lập dàn ý và phát triển bài đăng chi tiết");
    }
  },

  /**
   * POST /api/v1/gemini/generate-image
   */
  async generateImage(req: Request, res: Response) {
    try {
      const { prompt, aspectRatio, modelName, resolution, existingImageUris } = req.body;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      const model = String(modelName || "gemini-3.1-flash-image-preview").toLowerCase();
      const cost = model.includes("pro") ? 57 : 27.5;

      await walletService.checkBalance(userId, cost);
      const result = await geminiService.generateImage(prompt, {
        aspectRatio,
        modelName,
        resolution,
        existingImageUris,
      });

      let record = null;
      if (userId && result.url) {
        record = await geminiService.saveGeneratedMediaRecord(userId, "image", result.url, prompt, {
          aspectRatio,
          resolution,
          modelName,
        });
      }

      await walletService.deductBalance(userId, cost, "Chi phí sinh ảnh minh họa AI");
      return res.status(200).json({
        ...result,
        url: record ? record.url : result.url,
        record,
      });
    } catch (error: any) {
      console.error("[geminiController.generateImage] Error:", error);
      return handleGeminiError(res, error, "Lỗi sinh ảnh AI");
    }
  },

  /**
   * POST /api/v1/gemini/generate-video
   */
  async generateVideo(req: Request, res: Response) {
    try {
      const { prompt, durationSeconds, aspectRatio, modelName, resolution, referenceVideoUri, referenceImageUris, frameMode, activeCardId } = req.body;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      // Calculate video cost based on model, resolution, duration
      const isLite = String(modelName).toLowerCase().includes("lite");
      const is1080p = String(resolution).toLowerCase().includes("1080");
      const duration = Number(durationSeconds) || 8;

      let cost = 324; // default iGen Veo 3.1 Fast 720p 8s
      if (isLite) {
        if (is1080p) {
          cost = duration <= 4 ? 129.6 : duration <= 6 ? 194.4 : 259.2;
        } else {
          cost = duration <= 4 ? 81.0 : duration <= 6 ? 121.5 : 162.0;
        }
      } else {
        // Fast
        if (is1080p) {
          cost = duration <= 4 ? 194.4 : duration <= 6 ? 291.6 : 388.8;
        } else {
          cost = duration <= 4 ? 162.0 : duration <= 6 ? 243.0 : 324.0;
        }
      }

      await walletService.checkBalance(userId, cost);
      const result = await geminiService.generateVideo(prompt, durationSeconds, {
        aspectRatio,
        modelName,
        resolution,
        referenceVideoUri,
        referenceImageUris,
        frameMode,
      });

      let record = null;
      if (userId && result.url) {
        const isPending = result.url.startsWith("pending://");
        record = await geminiService.saveGeneratedMediaRecord(userId, "video", result.url, prompt, {
          aspectRatio,
          resolution,
          modelName,
          durationSeconds,
          originalVeoUrl: referenceVideoUri,
          activeCardId,
          piapiTaskId: (result as any).taskId,
          status: isPending ? "processing" : "completed",
          progress: isPending ? 1 : 100,
        });
        if (isPending && (result as any).taskId) {
          geminiService.pollPiAPIVideoStatusBackground(record._id.toString(), (result as any).taskId, userId);
        }
      }

      await walletService.deductBalance(userId, cost, "Chi phí sinh video AI");
      return res.status(200).json({
        ...result,
        url: record ? record.url : result.url,
        record,
      });
    } catch (error: any) {
      console.error("[geminiController.generateVideo] Error:", error);
      return handleGeminiError(res, error, "Lỗi sinh video AI");
    }
  },

  /**
   * POST /api/v1/gemini/edit-video
   */
  async editVideo(req: Request, res: Response) {
    try {
      const {
        videoUrl, prompt, modelName, aspectRatio, resolution, duration, videoDurations,
        blueprint, renderMode, renderEngine, referenceVideoUrl, referenceVideoDuration,
        // Professional mode
        outline, scenes, scenesContent, brandName, bgMusicUrl,
      } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      const result = await geminiService.editVideo(userId, videoUrl, prompt || "", {
        modelName,
        aspectRatio,
        resolution,
        duration,
        videoDurations,
        blueprint,
        renderMode,
        renderEngine,
        referenceVideoUrl,
        referenceVideoDuration,
        outline,
        scenes,
        scenesContent,
        brandName,
        bgMusicUrl,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.editVideo] Error:", error);
      return handleGeminiError(res, error, "Lỗi biên tập video bằng AI");
    }
  },

  /**
   * POST /api/v1/gemini/analyze-video-style
   */
  async analyzeVideoStyle(req: Request, res: Response) {
    try {
      const { videoUrl, duration, targetVideoUrl, targetDuration, prompt } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      console.log(`[geminiController.analyzeVideoStyle] Starting style extraction for videoUrl: ${videoUrl}, duration: ${duration}, targetVideoUrl: ${targetVideoUrl}, targetDuration: ${targetDuration}, userPrompt: ${prompt}`);
      
      // Kiểm tra số dư ví
      await walletService.checkBalance(userId, API_COSTS.GEMINI_OPTIMIZE);

      const promptResult = await videoBlueprintService.extractVideoStyle(videoUrl, duration, targetVideoUrl, targetDuration, prompt);

      await walletService.deductBalance(userId, API_COSTS.GEMINI_OPTIMIZE, "Chi phí phân tích và trích xuất kịch bản video AI");

      return res.status(200).json({
        status: "success",
        extractedPrompt: promptResult
      });
    } catch (error: any) {
      console.error("[geminiController.analyzeVideoStyle] Error:", error);
      return handleGeminiError(res, error, "Lỗi phân tích phong cách video");
    }
  },

  /**
   * POST /api/v1/gemini/upload-document
   */
  async uploadLocalDocument(req: AuthenticatedRequest, res: Response) {
    try {
      const { fileName, fileBase64, mimeType } = req.body;
      if (!fileName || !fileBase64 || !mimeType) {
        return res.status(400).json({
          status: "error",
          message: "Thiếu thông tin file (tên, dữ liệu base64, mimeType)."
        });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      await walletService.checkBalance(userId, API_COSTS.GEMINI_FAQ);
      console.log(`[AI AutoReply] Bắt đầu xử lý file upload: ${fileName} (${mimeType})`);

      const extractedText = await parseUploadedDocument(fileBase64, mimeType, fileName);

      if (!extractedText || extractedText.trim().length === 0) {
        return res.status(400).json({
          status: "error",
          message: "Không thể trích xuất văn bản từ tài liệu này. Vui lòng kiểm tra lại định dạng file."
        });
      }

      const companyCode = req.user?.companyCode || "SYSTEM";
      const sourceUrl = `uploaded://${fileName}_${Date.now()}`;

      const syncResult = await aiKnowledgeService.upsertKnowledgeFromText({
        companyCode,
        sourceType: "manual",
        sourceTitle: fileName,
        sourceUrl,
        text: extractedText,
        createdBy: req.user?.id,
        channelScope: ["all"],
      });

      await walletService.deductBalance(userId, API_COSTS.GEMINI_FAQ, `Chi phí trích xuất & nạp tài liệu upload (${fileName})`);

      return res.status(200).json({
        status: "success",
        title: fileName,
        text: extractedText,
        companyCode,
        chunksCount: syncResult.chunksCount,
      });
    } catch (error: any) {
      console.error("[geminiController.uploadLocalDocument] Error:", error);
      return handleGeminiError(res, error, "Lỗi xử lý file tài liệu tải lên");
    }
  },

  /**
   * POST /api/v1/gemini/sync-drive
   */
  async syncGoogleDrive(req: AuthenticatedRequest, res: Response) {
    try {
      const { docLink } = req.body;
      if (!docLink) {
        return res.status(400).json({
          status: "error",
          message: "Thiếu đường dẫn tài liệu Google Drive."
        });
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      await walletService.checkBalance(userId, API_COSTS.GEMINI_FAQ);
      console.log(`[AI AutoReply] Bắt đầu đồng bộ tài liệu từ Google Drive/Doc link: ${docLink}`);

      const folderMatch = docLink.match(/folders\/([a-zA-Z0-9-_]{25,50})/);
      const folderId = folderMatch ? folderMatch[1] : null;

      let docIds: string[] = [];
      let isFolder = false;

      if (folderId) {
        console.log(`[AI AutoReply] Phát hiện đường dẫn thư mục Google Drive. Folder ID: ${folderId}`);
        isFolder = true;
        docIds = await fetchDriveFolderFileIds(folderId);
      } else {
        const matches = [...docLink.matchAll(/\/document\/d\/([a-zA-Z0-9-_]+)/g)];
        docIds = matches.map(m => m[1]).filter(Boolean);
      }

      let extractedText = "";
      let isMocked = true;
      let docTitle = isFolder ? "Thu muc Google Drive" : "Tai lieu Google Drive";
      const companyCode = req.user?.companyCode || "SYSTEM";
      const syncedDocuments: Array<{ title: string; fileId: string; chars: number; chunksCount: number }> = [];

      if (docIds.length > 0) {
        console.log(`[AI AutoReply] Bắt đầu tải nội dung từ ${docIds.length} tài liệu...`);
        const filesContent = await Promise.all(
          docIds.map(async (fileId) => {
            const fileData = await fetchDriveFileContent(fileId);
            return {
              fileId,
              title: fileData.title || `Drive File (${fileId})`,
              text: normalizeDriveDocText(fileData.text || ""),
            };
          })
        );

        const validFiles = filesContent.filter((file) => file.text.length > 0);
        extractedText = validFiles
          .map((file) => `--- BAT DAU TAI LIEU (${file.title}) ---\n${file.text}\n--- KET THUC TAI LIEU (${file.title}) ---`)
          .join("\n\n");

        if (validFiles.length > 0) {
          isMocked = false;
          docTitle = isFolder
            ? `Thu muc Google Drive (ID: ${folderId}, ${validFiles.length} files)`
            : (validFiles.length === 1 ? validFiles[0].title : `Bo tai lieu Google Drive (${validFiles.length} files)`);
          console.log(`[AI AutoReply] Đồng bộ thành công từ các links thật! Độ dài ký tự: ${extractedText.length}`);

          for (const file of validFiles) {
            const syncResult = await aiKnowledgeService.upsertKnowledgeFromText({
              companyCode,
              sourceType: "google_doc",
              sourceTitle: file.title,
              sourceUrl: `https://drive.google.com/open?id=${file.fileId}`,
              text: file.text,
              createdBy: req.user?.id,
              channelScope: ["all"],
            });

            syncedDocuments.push({
              title: file.title,
              fileId: file.fileId,
              chars: file.text.length,
              chunksCount: syncResult.chunksCount,
            });
          }
        }
      }

      // Return error if fetch failed or no valid text could be extracted
      if (isMocked) {
        return res.status(400).json({
          status: "error",
          message: "Không thể tải hoặc trích xuất văn bản từ Google Drive. Vui lòng kiểm tra lại quyền chia sẻ công khai (Bất kỳ ai có liên kết đều có thể Xem/Viewer) và đảm bảo thư mục hoặc các file bên trong thuộc định dạng được hỗ trợ (PDF, Google Doc, Google Sheet, File văn bản)."
        });
      }

      await walletService.deductBalance(userId, API_COSTS.GEMINI_FAQ, `Chi phí đồng bộ Drive & FAQ AI (${docTitle})`);
      return res.status(200).json({
        status: "success",
        title: docTitle,
        text: extractedText,
        isMocked,
        companyCode,
        documentsCount: syncedDocuments.length,
        chunksCount: syncedDocuments.reduce((sum, item) => sum + item.chunksCount, 0),
        documents: syncedDocuments,
      });
    } catch (error: any) {
      console.error("[geminiController.syncGoogleDrive] Error:", error);
      return handleGeminiError(res, error, "Lỗi đồng bộ dữ liệu từ Google Drive");
    }
  },

  /**
   * POST /api/v1/gemini/generate-voice
   */
  async generateVoice(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      const textToSpeak = req.body.textToSpeak || "";
      const charCount = textToSpeak.length;
      const model = String(req.body.model || "").toLowerCase();

      let cost = 0;
      if (model.includes("flash") || model.includes("pro")) {
        const seconds = Math.max(1, Math.ceil(charCount / 13));
        const rate = model.includes("pro") ? 0.255 : 0.128;
        cost = Number((seconds * rate).toFixed(3));
      } else {
        cost = Math.max(API_COSTS.ELEVENLABS_MIN, charCount * API_COSTS.ELEVENLABS_TTS_CHAR);
      }

      await walletService.checkBalance(userId, cost);
      const record = await geminiService.generateVoice(userId, req.body);
      await walletService.deductBalance(userId, cost, `Chi phí tạo giọng nói AI ElevenLabs (${charCount} ký tự)`);
      return res.status(200).json({
        status: "success",
        record,
      });
    } catch (error: any) {
      console.error("[geminiController.generateVoice] Error:", error);
      return handleGeminiError(res, error, "Lỗi tạo giọng nói AI");
    }
  },

  /**
   * POST /api/v1/gemini/optimize-script
   */
  async optimizeScript(req: Request, res: Response) {
    try {
      const { text, readingStyle, model } = req.body;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      await walletService.checkBalance(userId, API_COSTS.GEMINI_OPTIMIZE);
      const result = await geminiService.optimizeScript(text, readingStyle, model);
      await walletService.deductBalance(userId, API_COSTS.GEMINI_OPTIMIZE, "Chi phí tối ưu kịch bản bằng AI");
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.optimizeScript] Error:", error);
      return handleGeminiError(res, error, "Lỗi tối ưu kịch bản");
    }
  },

  /**
   * POST /api/v1/gemini/optimize-prompt
   */
  async optimizeImagePrompt(req: Request, res: Response) {
    try {
      const { description, imageUris, modelName } = req.body;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      await walletService.checkBalance(userId, API_COSTS.GEMINI_OPTIMIZE);
      const result = await geminiService.optimizeImagePrompt(description, imageUris, modelName);
      await walletService.deductBalance(userId, API_COSTS.GEMINI_OPTIMIZE, "Phí tối ưu prompt sinh ảnh AI");
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.optimizeImagePrompt] Error:", error);
      return handleGeminiError(res, error, "Lỗi tối ưu prompt ảnh");
    }
  },

  async optimizeVideoPrompt(req: Request, res: Response) {
    try {
      const { description, imageUris } = req.body;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      console.log(`[geminiController.optimizeVideoPrompt] Incoming description to optimize: "${description}"`);
      await walletService.checkBalance(userId, API_COSTS.GEMINI_OPTIMIZE);
      const result = await geminiService.optimizeVideoPrompt(description, imageUris);
      await walletService.deductBalance(userId, API_COSTS.GEMINI_OPTIMIZE, "Phí tối ưu prompt sinh video AI");
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.optimizeVideoPrompt] Error:", error);
      return handleGeminiError(res, error, "Lỗi tối ưu prompt video");
    }
  },

  /**
   * POST /api/v1/gemini/optimize-edit-prompt
   * Tối ưu prompt dành riêng cho chỉnh sửa video (Remotion)
   */
  async optimizeEditPrompt(req: Request, res: Response) {
    try {
      const { description } = req.body;
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }

      console.log(`[geminiController.optimizeEditPrompt] Incoming: "${description}"`);
      const result = await geminiService.optimizeEditPrompt(description);
      console.log(`[geminiController.optimizeEditPrompt] Result: "${result.optimized_prompt?.slice(0, 100)}..."`);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.optimizeEditPrompt] Error:", error);
      return handleGeminiError(res, error, "Lỗi tối ưu prompt chỉnh sửa");
    }
  },

  /**
   * GET /api/v1/gemini/media-history
   */
  async getMediaHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { type } = req.query;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }
      const history = await geminiService.getMediaHistory(userId, type as any);
      return res.status(200).json({ status: "success", history });
    } catch (error: any) {
      console.error("[geminiController.getMediaHistory] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi lấy lịch sử sinh đa phương tiện",
        details: error.message,
      });
    }
  },

  /**
   * DELETE /api/v1/gemini/media-history/:id
   */
  async deleteMediaHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { id } = req.params;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }
      const result = await geminiService.deleteMediaHistory(userId, id);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.deleteMediaHistory] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi xóa bản ghi lịch sử",
        details: error.message,
      });
    }
  },

  /**
   * GET /api/v1/gemini/elevenlabs-voices
   */
  async getElevenLabsVoices(req: Request, res: Response) {
    try {
      const result = await geminiService.getElevenLabsVoices();
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.getElevenLabsVoices] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể lấy danh sách giọng nói ElevenLabs",
        details: error.message
      });
    }
  },

  /**
   * POST /api/v1/gemini/elevenlabs-custom-voice-preview
   */
  async generateCustomVoicePreview(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }
      const { gender, accent, age, accentStrength, text } = req.body;
      const result = await geminiService.generateCustomVoicePreview(userId, { gender, accent, age, accentStrength, text });
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.generateCustomVoicePreview] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể thiết kế giọng nói thử nghiệm",
        details: error.message
      });
    }
  },

  /**
   * POST /api/v1/gemini/elevenlabs-create-voice
   */
  async createCustomVoice(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }
      const { voiceName, voiceDescription, generatedVoiceId } = req.body;
      const result = await geminiService.createCustomVoice(userId, { voiceName, voiceDescription, generatedVoiceId });
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.createCustomVoice] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể lưu giọng nói cá nhân vào ElevenLabs",
        details: error.message
      });
    }
  },

  /**
   * POST /api/v1/gemini/elevenlabs-add-voice
   */
  async addElevenLabsVoice(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }
      const { name, description, files } = req.body;
      const result = await geminiService.addElevenLabsVoice(userId, name, description, files);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.addElevenLabsVoice] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể nhân bản giọng nói ElevenLabs",
        details: error.message
      });
    }
  },

  /**
   * DELETE /api/v1/gemini/elevenlabs-delete-voice/:voiceId
   */
  async deleteElevenLabsVoice(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }
      const { voiceId } = req.params;
      const result = await geminiService.deleteElevenLabsVoice(userId, voiceId);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[geminiController.deleteElevenLabsVoice] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể xóa giọng nói ElevenLabs",
        details: error.message
      });
    }
  },

  /**
   * POST /api/v1/gemini/hermes-webhook
   */
  async hermesWebhook(req: Request, res: Response) {
    try {
      const recordId = req.query.recordId as string;
      const { session_id, response, message, content, output, status, error } = req.body;

      console.log("[Hermes Webhook] Received payload:", {
        recordId,
        session_id,
        status,
        hasResponse: Boolean(response || message || content || output),
        error
      });

      let record = null;
      if (recordId && mongoose.Types.ObjectId.isValid(recordId)) {
        record = await AIMediaModel.findById(recordId);
      }

      if (!record && session_id) {
        record = await AIMediaModel.findOne({ "metadata.hermesSessionId": session_id });
      }

      if (!record) {
        console.error(`[Hermes Webhook] Record not found. recordId: ${recordId}, session_id: ${session_id}`);
        return res.status(404).json({ status: "error", message: "Không tìm thấy bản ghi video tương ứng." });
      }

      const fullText = response || message || content || output || "";

      if (status === "failed" || error) {
        const errorMsg = error || "Hermes Agent báo lỗi xử lý.";
        record.metadata = {
          ...(record.metadata || {}),
          status: "failed",
          progress: 100,
          error: errorMsg,
          description: `Thất bại: ${errorMsg}`,
          renderLogs: [
            ...(record.metadata?.renderLogs || []),
            `[Webhook] Nhận thông báo thất bại: ${errorMsg}`
          ]
        };
        await record.save();

        broadcastEvent("video_status_updated", {
          videoId: record.metadata.heygenVideoId || record._id.toString(),
          status: "failed",
          updates: [record.toObject()]
        });

        return res.status(200).json({ status: "success", message: "Đã cập nhật trạng thái lỗi thành công." });
      }

      const cloudinaryRegex = /(https:\/\/res\.cloudinary\.com\/[^\s\)\"\`\'\>]+)/i;
      const match = String(fullText).match(cloudinaryRegex);
      const extractedUrl = match ? match[1] : null;

      if (extractedUrl) {
        record.url = extractedUrl;
        record.metadata = {
          ...(record.metadata || {}),
          status: "completed",
          progress: 100,
          description: "Biên tập video hoàn tất.",
          renderLogs: [
            ...(record.metadata?.renderLogs || []),
            `[Webhook] Nhận kết quả hoàn thành.`,
            `[Webhook] Tìm thấy URL video đã upload: ${extractedUrl}`
          ]
        };
        await record.save();
      } else {
        const anyUrlRegex = /(https?:\/\/[^\s\)\"\`\'\>]+)/i;
        const fallbackMatch = String(fullText).match(anyUrlRegex);
        const fallbackUrl = fallbackMatch ? fallbackMatch[1] : null;

        if (fallbackUrl) {
          record.url = fallbackUrl;
          record.metadata = {
            ...(record.metadata || {}),
            status: "completed",
            progress: 100,
            description: "Biên tập video hoàn tất (URL fallback).",
            renderLogs: [
              ...(record.metadata?.renderLogs || []),
              `[Webhook] Không tìm thấy URL Cloudinary nhưng phát hiện URL thay thế: ${fallbackUrl}`
            ]
          };
          await record.save();
        } else {
          record.metadata = {
            ...(record.metadata || {}),
            status: "failed",
            progress: 100,
            error: "Không tìm thấy URL video trong phản hồi của Hermes Agent.",
            description: "Thất bại: Không tìm thấy URL video trong phản hồi.",
            renderLogs: [
              ...(record.metadata?.renderLogs || []),
              `[Webhook] Lỗi: Không trích xuất được URL video từ phản hồi.`,
              `[Webhook] Phản hồi thô: ${fullText}`
            ]
          };
          await record.save();
        }
      }

      broadcastEvent("video_status_updated", {
        videoId: record.metadata.heygenVideoId || record._id.toString(),
        status: record.metadata.status,
        updates: [record.toObject()]
      });

      return res.status(200).json({ status: "success", message: "Đã xử lý webhook thành công." });
    } catch (error: any) {
      console.error("[Hermes Webhook] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi nội bộ server khi xử lý webhook",
        details: error.message
      });
    }
  },

  /**
   * POST /api/v1/gemini/generate-edit-script
   * Phân tích video và tạo kịch bản biên tập chi tiết theo từng đoạn
   */
  async generateEditScript(req: Request, res: Response) {
    try {
      const { videoUrl, duration, prompt } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      if (!videoUrl) return res.status(400).json({ status: "error", message: "Thiếu videoUrl" });

      await walletService.checkBalance(userId, API_COSTS.GEMINI_OPTIMIZE);

      const { generateEditScript } = await import("../service/video-edit/script.service");
      const script = await generateEditScript(videoUrl, Number(duration || 30), prompt || "");

      await walletService.deductBalance(userId, API_COSTS.GEMINI_OPTIMIZE, "Chi phí tạo kịch bản biên tập video AI");

      return res.status(200).json({ status: "success", script });
    } catch (error: any) {
      console.error("[geminiController.generateEditScript] Error:", error);
      return handleGeminiError(res, error, "Lỗi tạo kịch bản biên tập video");
    }
  },

  /**
   * POST /api/v1/gemini/render-from-edit-script
   * Chuyển đổi kịch bản biên tập thành blueprint và xếp hàng kết xuất
   */
  async renderFromEditScript(req: Request, res: Response) {
    try {
      const { script, aspectRatio, resolution } = req.body;
      const userId = (req as any).user?.id;

      if (!userId) return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      if (!script?.videoUrl) return res.status(400).json({ status: "error", message: "Thiếu script hoặc videoUrl trong script" });

      const { blueprintFromEditScript } = await import("../service/video-edit/script.service");
      const { editVideo } = await import("../service/video-edit");

      const finalScript = {
        ...script,
        globalSettings: {
          ...script.globalSettings,
          aspectRatio: aspectRatio || script.globalSettings?.aspectRatio || "16:9",
          resolution: resolution || script.globalSettings?.resolution || "720p",
        },
      };

      const blueprint = blueprintFromEditScript(finalScript);

      const result = await editVideo(userId, script.videoUrl, "Kết xuất từ kịch bản biên tập", {
        blueprint,
        aspectRatio: finalScript.globalSettings.aspectRatio,
        resolution: finalScript.globalSettings.resolution,
        duration: script.totalDuration,
        renderEngine: "hyperframe",
      });

      return res.status(200).json({ ...result, blueprint });
    } catch (error: any) {
      console.error("[geminiController.renderFromEditScript] Error:", error);
      return handleGeminiError(res, error, "Lỗi kết xuất video từ kịch bản");
    }
  },
};
