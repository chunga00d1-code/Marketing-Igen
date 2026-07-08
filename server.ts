import express from "express";
import path from "path";
import fs from "fs";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { connectDB } from "./server/config/database";
import { apiRouter } from "./server/router";
import { swaggerRouter } from "./server/swagger";
import { initSocketServer } from "./server/socket";
import { remotionQueueService } from "./server/service/remotion-queue.service";
import { tiktokController } from "./server/controller/tiktok.controller";
import { buildDocumentTitle, getSeoForPath, resolveSeoUrl } from "./src/seo/seo-config";
import { BRAND_NAME, BRAND_TAGLINE, BRAND_LOGO_URL, SERVICE_WEBSITE_URL } from "./src/config/brand";
import { telegramService } from "./server/service/telegram.service";

dotenv.config();

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

function shouldSkipRoutineApiLog(method: string, url: string) {
  const normalizedMethod = String(method || "").toUpperCase();
  const normalizedUrl = String(url || "");

  if (normalizedMethod !== "GET" && normalizedMethod !== "POST") {
    return false;
  }

  const noisyPrefixes = [
    "/api/v1/crud/marketing-contents",
    "/api/v1/crud/crm-tickets",
    "/api/v1/crud/products",
    "/api/v1/wallet/balance",
    "/api/v1/gemini/media-history",
  ];

  return noisyPrefixes.some((prefix) => normalizedUrl.startsWith(prefix));
}

function injectSeoMeta(html: string, requestPath: string): string {
  try {
    const seo = getSeoForPath(requestPath);
    const canonicalUrl = resolveSeoUrl(seo.path);
    const imageUrl = seo.image || BRAND_LOGO_URL;

    let output = html;

    // Robots
    if (seo.robots) {
      output = output.replace(
        /<meta\s+name="robots"\s+content="[\s\S]*?"\s*\/?>/i,
        `<meta name="robots" content="${seo.robots}" />`
      );
    }

    // Title
    output = output.replace(/<title>[\s\S]*?<\/title>/i, `<title>${buildDocumentTitle(seo.title)}</title>`);

    // Description
    output = output.replace(
      /<meta\s+name="description"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="description" content="${seo.description}" />`
    );

    // Keywords
    output = output.replace(
      /<meta\s+name="keywords"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="keywords" content="${seo.keywords}" />`
    );

    // Canonical link
    output = output.replace(
      /<link\s+rel="canonical"\s+href="[\s\S]*?"\s*\/?>/i,
      `<link rel="canonical" href="${canonicalUrl}" />`
    );
    output = output.replace(
      /<link\s+rel="alternate"\s+hreflang="vi-VN"\s+href="[\s\S]*?"\s*\/?>/i,
      `<link rel="alternate" hreflang="vi-VN" href="${canonicalUrl}" />`
    );
    output = output.replace(
      /<link\s+rel="alternate"\s+hreflang="x-default"\s+href="[\s\S]*?"\s*\/?>/i,
      `<link rel="alternate" hreflang="x-default" href="${canonicalUrl}" />`
    );

    // OpenGraph Tags
    output = output.replace(
      /<meta\s+property="og:title"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta property="og:title" content="${seo.title}" />`
    );
    output = output.replace(
      /<meta\s+property="og:description"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta property="og:description" content="${seo.description}" />`
    );
    output = output.replace(
      /<meta\s+property="og:url"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta property="og:url" content="${canonicalUrl}" />`
    );
    output = output.replace(
      /<meta\s+property="og:image"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta property="og:image" content="${imageUrl}" />`
    );
    output = output.replace(
      /<meta\s+property="og:image:secure_url"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta property="og:image:secure_url" content="${imageUrl}" />`
    );
    output = output.replace(
      /<meta\s+property="og:image:alt"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta property="og:image:alt" content="${seo.title}" />`
    );

    // Twitter Tags
    output = output.replace(
      /<meta\s+name="twitter:title"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="twitter:title" content="${seo.title}" />`
    );
    output = output.replace(
      /<meta\s+name="twitter:description"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="twitter:description" content="${seo.description}" />`
    );
    output = output.replace(
      /<meta\s+name="twitter:image"\s+content="[\s\S]*?"\s*\/?>/i,
      `<meta name="twitter:image" content="${imageUrl}" />`
    );

    // Schema.org JSON-LD structured data
    const jsonLdData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": `${SERVICE_WEBSITE_URL}/#organization`,
          "name": BRAND_NAME,
          "url": SERVICE_WEBSITE_URL,
          "logo": {
            "@type": "ImageObject",
            "url": BRAND_LOGO_URL
          }
        },
        {
          "@type": "WebSite",
          "@id": `${SERVICE_WEBSITE_URL}/#website`,
          "name": BRAND_NAME,
          "url": SERVICE_WEBSITE_URL,
          "inLanguage": "vi-VN",
          "description": BRAND_TAGLINE,
          "publisher": {
            "@id": `${SERVICE_WEBSITE_URL}/#organization`
          }
        },
        {
          "@type": "WebApplication",
          "@id": `${canonicalUrl}/#webapplication`,
          "name": BRAND_NAME,
          "url": canonicalUrl,
          "applicationCategory": "BusinessApplication",
          "operatingSystem": "Web",
          "description": seo.description,
          "image": imageUrl,
          "inLanguage": "vi-VN"
        },
        {
          "@type": "WebPage",
          "@id": `${canonicalUrl}/#webpage`,
          "name": seo.title,
          "url": canonicalUrl,
          "description": seo.description,
          "inLanguage": "vi-VN",
          "isPartOf": {
            "@id": `${SERVICE_WEBSITE_URL}/#website`
          },
          "primaryImageOfPage": {
            "@type": "ImageObject",
            "url": imageUrl
          }
        }
      ]
    };

    const jsonLdScript = `
    <script type="application/ld+json" id="igen-seo-jsonld">
      ${JSON.stringify(jsonLdData)}
    </script>
  </head>`;

    output = output.replace(/<\/head>/i, jsonLdScript);
    return output;
  } catch (err) {
    console.error("Lỗi injectSeoMeta:", err);
    return html;
  }
}

async function startServer() {
  // Kết nối cơ sở dữ liệu MongoDB
  await connectDB();

  // Khởi động hàng đợi xử lý Remotion
  remotionQueueService.initWorker();



  const app = express();
  app.set("trust proxy", true);
  app.use(cookieParser());
  app.use(
    express.json({
      limit: "300mb",
      verify: (req: any, res, buf) => {
        req.rawBody = buf.toString();
      },
    })
  );
  app.use(express.urlencoded({ limit: "300mb", extended: true }));

  // 1. Cấu hình CORS bảo mật sử dụng allowedOrigins từ biến môi trường LINK_COR
  const allowedOrigins = process.env.LINK_COR
    ? process.env.LINK_COR.split(",")
    : ["http://localhost:5173", "http://localhost:3000"];

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Range");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
    // Safari requires Cross-Origin-Resource-Policy to allow cross-origin media requests
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    // Do NOT set COEP to require-corp — it blocks cross-origin media in Safari
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // 2. Tài liệu API Swagger tại đường dẫn /api-docs
  app.use("/api-docs", swaggerRouter);

  // Đảm bảo thư mục uploads tồn tại
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Phục vụ tĩnh thư mục uploads
  app.use("/uploads", express.static(uploadsDir));

  // Global Request Logger - Log tất cả API requests để dễ debug
  app.use("/api", (req, res, next) => {
    if (shouldSkipRoutineApiLog(req.method, req.originalUrl)) {
      return next();
    }
    const timestamp = new Date().toLocaleTimeString("vi-VN");
    console.log(`[Server ${timestamp}] ${req.method} ${req.originalUrl} - IP: ${req.ip}`);
    next();
  });

  // 3. Đăng ký Versioned API Router với tiền tố /api/v1/
  app.get("/webhooks/tiktok", (req, res) => {
    return res.status(200).json({
      status: "ok",
      path: "/webhooks/tiktok",
      message: "TikTok webhook endpoint is reachable",
      timestamp: new Date().toISOString(),
    });
  });
  app.post("/webhooks/tiktok", tiktokController.receiveWebhook as any);

  app.use("/api/v1", apiRouter);

  // Bộ xử lý lỗi dung lượng yêu cầu quá lớn (Payload Too Large)
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err.type === "entity.too.large" || err.status === 413 || err.name === "PayloadTooLargeError") {
      return res.status(413).json({
        status: "error",
        message: "Dung lượng dữ liệu yêu cầu vượt quá giới hạn cho phép của hệ thống (tối đa 300MB)."
      });
    }
    next(err);
  });

  // 4. Cấu hình phục vụ tệp tĩnh (Vite Dev Server hoặc Static production files)
  if (process.env.NODE_ENV !== "production") {
    // Dynamic import để tránh require vite trong production bundle
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);

    app.use("*", async (req, res, next) => {
      if (req.method !== "GET") {
        return next();
      }

      const requestPath = req.path.toLowerCase();
      if (requestPath.startsWith("/api") || requestPath.startsWith("/uploads")) {
        return next();
      }

      try {
        const indexHtmlPath = path.join(process.cwd(), "index.html");
        const template = await fs.promises.readFile(indexHtmlPath, "utf-8");
        const transformedTemplate = await vite.transformIndexHtml(req.originalUrl, template);
        const personalizedHtml = injectSeoMeta(transformedTemplate, req.path);

        res.status(200).set({ "Content-Type": "text/html" }).end(personalizedHtml);
      } catch (err) {
        vite.ssrFixStacktrace(err as Error);
        next(err);
      }
    });
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath, {
      index: false,
      setHeaders: (res, filePath) => {
        // Cache hashed assets from the assets directory forever (immutable)
        if (/[\\/]assets[\\/]/.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        } else {
          // Other static assets (e.g. site.webmanifest, favicons) cache for 1 hour
          res.setHeader("Cache-Control", "public, max-age=3600");
        }
      }
    }));
    
    let indexHtmlCached: string | null = null;

    app.get("*", (req, res) => {
      try {
        const indexHtmlPath = path.join(distPath, "index.html");
        if (!indexHtmlCached) {
          indexHtmlCached = fs.readFileSync(indexHtmlPath, "utf-8");
        }

        const personalizedHtml = injectSeoMeta(indexHtmlCached, req.path);
        res.setHeader("Content-Type", "text/html");
        res.send(personalizedHtml);
      } catch (err) {
        console.error("Lỗi khi xử lý server SEO fallback:", err);
        res.sendFile(path.join(distPath, "index.html"));
      }
    });
  }

  // Tạo HTTP Server bọc Express để hỗ trợ cả HTTP & Socket.IO
  const httpServer = createServer(app);
  initSocketServer(httpServer);

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Express and Socket.IO server running on http://localhost:${PORT}`);
    console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    
    // Khởi chạy Telegram Bot long-polling để xử lý lệnh /image, /video
    telegramService.startPolling().catch((err) => {
      console.error("[Telegram Bot] Khởi động polling thất bại:", err);
    });
  });
}

startServer();

