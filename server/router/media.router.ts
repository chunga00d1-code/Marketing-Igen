import { Router } from "express";
import Joi from "joi";
import { mediaController } from "../controller/media.controller";
import { validateRequest } from "../middleware/validation";
import { requireAuth } from "../middleware/auth";
import https from "https";
import http from "http";

export const mediaRouter = Router();

const uploadSchema = {
  body: Joi.object({
    file: Joi.string().required().messages({
      "any.required": "Trường 'file' là bắt buộc và không thể thiếu.",
      "string.empty": "Nội dung 'file' không được để trống.",
    }),
    folder: Joi.string().optional().allow("").messages({
      "string.base": "Trường 'folder' phải là kiểu văn bản (string).",
    }),
  }),
};

// Route tải lên đa phương tiện tới Cloudinary qua Backend Relay (Yêu cầu đăng nhập)
mediaRouter.post(
  "/upload",
  requireAuth as any,
  validateRequest(uploadSchema),
  mediaController.upload as any
);

// Route ký tham số tải lên trực tiếp lên Cloudinary từ Client (Bảo mật)
mediaRouter.post(
  "/sign-upload",
  requireAuth as any,
  async (req, res) => {
    try {
      const { paramsToSign } = req.body;
      if (!paramsToSign) {
        return res.status(400).json({ error: "Thiếu tham số cần ký 'paramsToSign'." });
      }
      
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      if (!apiSecret) {
        return res.status(500).json({ error: "Chưa cấu hình CLOUDINARY_API_SECRET trên server." });
      }

      const { v2: cloudinary } = await import("cloudinary");
      const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);
      
      return res.status(200).json({
        signature,
        apiKey: process.env.CLOUDINARY_API_KEY,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      });
    } catch (err: any) {
      console.error("[Media Sign Upload Error]:", err);
      res.status(500).json({ error: "Lỗi tạo chữ ký upload.", details: err.message });
    }
  }
);

// Route download proxy để giải quyết vấn đề CORS ở phía Client
mediaRouter.get(
  "/download",
  requireAuth as any,
  async (req, res) => {
    const fileUrl = req.query.url as string;
    const filename = (req.query.filename as string) || "igen-download";
    if (!fileUrl) {
      return res.status(400).json({ error: "Missing url parameter" });
    }
    try {
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const contentType = response.headers.get("content-type");
      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
      
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      res.send(buffer);
    } catch (err: any) {
      console.error("[Media Proxy Download Error]:", err);
      res.status(500).json({ error: "Failed to download file", details: err.message });
    }
  }
);

/**
 * Audio proxy endpoint — phục vụ audio từ URL bên ngoài qua server nội bộ.
 * Giải quyết lỗi 403 Forbidden trên Safari do thiếu CORS headers từ domain bên ngoài.
 * Hỗ trợ Range requests (cần thiết cho HTML5 audio/video streaming).
 */
mediaRouter.get(
  "/audio-proxy",
  async (req, res) => {
    const audioUrl = req.query.url as string;
    if (!audioUrl) {
      return res.status(400).json({ error: "Thiếu tham số 'url'." });
    }

    // Chỉ cho phép proxy các domain audio đã được whitelist
    const allowedDomains = [
      "cdn.pixabay.com",
      "www.soundhelix.com",
      "assets.mixkit.co",
      "freesound.org",
      "res.cloudinary.com",
    ];

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(audioUrl);
    } catch {
      return res.status(400).json({ error: "URL không hợp lệ." });
    }

    const isAllowed = allowedDomains.some((domain) => parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`));
    if (!isAllowed) {
      return res.status(403).json({ error: "Domain không được phép proxy." });
    }

    try {
      const upstreamHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (compatible; IgenERP/1.0)",
      };

      // Chuyển tiếp Range header nếu có (để hỗ trợ seek/streaming)
      if (req.headers.range) {
        upstreamHeaders["Range"] = req.headers.range as string;
      }

      const protocol = parsedUrl.protocol === "https:" ? https : http;
      const proxyReq = protocol.get(
        audioUrl,
        { headers: upstreamHeaders },
        (proxyRes) => {
          // Gán CORS headers để Safari chấp nhận
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          res.setHeader("Accept-Ranges", "bytes");

          // Chuyển tiếp status và headers từ upstream
          const statusCode = proxyRes.statusCode || 200;
          res.status(statusCode);

          const headersToForward = ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"];
          for (const header of headersToForward) {
            const val = proxyRes.headers[header];
            if (val) res.setHeader(header, val);
          }

          proxyRes.pipe(res);
        }
      );

      proxyReq.on("error", (err) => {
        console.error("[Audio Proxy Error]:", err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: "Không thể kết nối đến nguồn audio.", details: err.message });
        }
      });
    } catch (err: any) {
      console.error("[Audio Proxy Unexpected Error]:", err);
      res.status(500).json({ error: "Lỗi không xác định khi proxy audio.", details: err.message });
    }
  }
);

/**
 * Video proxy endpoint — phục vụ video từ URL bên ngoài qua server nội bộ.
 * Giải quyết lỗi url_ownership_unverified của TikTok khi gọi video từ Cloudinary.
 * Hỗ trợ Range requests (cần thiết cho HTML5 video streaming).
 */
mediaRouter.get(
  "/video-proxy",
  async (req, res) => {
    const videoUrl = req.query.url as string;
    if (!videoUrl) {
      return res.status(400).json({ error: "Thiếu tham số 'url'." });
    }

    const allowedDomains = [
      "res.cloudinary.com",
    ];

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(videoUrl);
    } catch {
      return res.status(400).json({ error: "URL không hợp lệ." });
    }

    const isAllowed = allowedDomains.some((domain) => parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`));
    if (!isAllowed) {
      return res.status(403).json({ error: "Domain không được phép proxy." });
    }

    try {
      const upstreamHeaders: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (compatible; IgenERP/1.0)",
      };

      // Chuyển tiếp Range header nếu có (để hỗ trợ seek/streaming)
      if (req.headers.range) {
        upstreamHeaders["Range"] = req.headers.range as string;
      }

      const protocol = parsedUrl.protocol === "https:" ? https : http;
      const proxyReq = protocol.get(
        videoUrl,
        { headers: upstreamHeaders },
        (proxyRes) => {
          // Gán CORS headers
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
          res.setHeader("Accept-Ranges", "bytes");

          // Chuyển tiếp status và headers từ upstream
          const statusCode = proxyRes.statusCode || 200;
          res.status(statusCode);

          const headersToForward = ["content-type", "content-length", "content-range", "accept-ranges", "cache-control"];
          for (const header of headersToForward) {
            const val = proxyRes.headers[header];
            if (val) res.setHeader(header, val);
          }

          proxyRes.pipe(res);
        }
      );

      proxyReq.on("error", (err) => {
        console.error("[Video Proxy Error]:", err.message);
        if (!res.headersSent) {
          res.status(502).json({ error: "Không thể kết nối đến nguồn video.", details: err.message });
        }
      });
    } catch (err: any) {
      console.error("[Video Proxy Unexpected Error]:", err);
      res.status(500).json({ error: "Lỗi không xác định khi proxy video.", details: err.message });
    }
  }
);

