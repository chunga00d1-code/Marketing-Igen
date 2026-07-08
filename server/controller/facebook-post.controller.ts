import { Request, Response } from "express";
import { facebookPostService } from "../service/facebook-post.service";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { UserDataDeletionModel } from "../model/user-data-deletion.model";
import { MarketingContentModel } from "../model/marketing-content.model";
import crypto from "crypto";

function base64UrlDecode(str: string) {
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64");
}

function parseSignedRequest(signedRequest: string, appSecret: string) {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) {
    throw new Error("Invalid signed request format.");
  }
  const encodedSig = parts[0];
  const payload = parts[1];

  const sig = base64UrlDecode(encodedSig);
  const payloadStr = base64UrlDecode(payload).toString("utf-8");
  const data = JSON.parse(payloadStr);

  if (!data.algorithm || data.algorithm.toUpperCase() !== "HMAC-SHA256") {
    throw new Error("Unknown algorithm. Expected HMAC-SHA256");
  }

  const expectedSig = crypto
    .createHmac("sha256", appSecret)
    .update(payload)
    .digest();

  if (!crypto.timingSafeEqual(sig, expectedSig)) {
    throw new Error("Invalid signature.");
  }

  return data;
}

function buildFacebookPostUrl(postId?: string) {
  const normalizedPostId = String(postId || "").trim();
  if (!normalizedPostId) {
    return "";
  }

  if (normalizedPostId.includes("_")) {
    const [pageId, storyFbid] = normalizedPostId.split("_");
    if (pageId && storyFbid) {
      return `https://www.facebook.com/permalink.php?story_fbid=${encodeURIComponent(storyFbid)}&id=${encodeURIComponent(pageId)}`;
    }
  }

  return `https://www.facebook.com/${encodeURIComponent(normalizedPostId)}`;
}

export const facebookPostController = {
  /**
   * POST /api/v1/facebook/publish
   */
  async publish(req: Request, res: Response) {
    try {
      const { content, imageUrl, videoUrl, pageId, accessToken, cardId, title } = req.body;

      let finalTitle = title || "";
      if (cardId && !finalTitle) {
        const card = await MarketingContentModel.findById(cardId);
        if (card) {
          finalTitle = card.title;
        }
      }

      const result = await facebookPostService.publishToPage(
        content,
        imageUrl,
        videoUrl,
        pageId,
        accessToken,
        cardId,
        "immediate",
        undefined,
        finalTitle
      );
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[facebookPostController.publish] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi kết nối hoặc xử lý đăng bài lên Facebook qua n8n",
        details: error.message,
      });
    }
  },

  /**
   * POST /api/v1/facebook/validate-token
   */
  async validateToken(req: Request, res: Response) {
    try {
      const { pageId, accessToken } = req.body;
      const result = await facebookPostService.validateToken(pageId, accessToken);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[facebookPostController.validateToken] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi kết nối hoặc xử lý xác thực token liên kết Facebook qua n8n",
        details: error.message,
      });
    }
  },

  /**
   * POST /api/v1/facebook/login-credentials
   */
  async loginWithCredentials(req: Request, res: Response) {
    try {
      const { email, password, pageId } = req.body;
      if (!email || !password) {
        return res.status(400).json({
          status: "error",
          message: "Vui lòng nhập đầy đủ tài khoản và mật khẩu Facebook."
        });
      }
      const result = await facebookPostService.loginWithCredentials(email, password, pageId);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[facebookPostController.loginWithCredentials] Error:", error);
      return res.status(500).json({
        status: "error",
        message: error.message || "Gặp lỗi khi xử lý đăng nhập bằng tài khoản Facebook.",
      });
    }
  },

  /**
   * POST /api/v1/facebook/init-oauth
   * Lưu App ID + App Secret vào DB cho công ty này,
   * trả về integrationId để dùng làm state trong OAuth URL.
   * Kiến trúc multi-tenant: mỗi công ty có App riêng.
   */
  async initOAuth(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const { fbAppId, appSecret, displayName } = req.body;

      if (!fbAppId || !appSecret) {
        return res.status(400).json({
          status: "error",
          message: "Vui lòng nhập đầy đủ App ID và App Secret từ Meta Developer."
        });
      }

      const companyCode = user?.companyCode;
      if (!companyCode) {
        return res.status(401).json({ status: "error", message: "Không xác định được công ty." });
      }

      // Tìm hoặc tạo mới bản ghi "pending" để lưu App credentials
      // Sau khi OAuth xong, page token sẽ được cập nhật vào cùng bản ghi này
      let integration = await SocialIntegrationModel.findOne({
        companyCode,
        platform: "Facebook",
        fbAppId,
        username: { $exists: false }, // chưa có page token
      });

      if (!integration) {
        integration = await SocialIntegrationModel.create({
          companyCode,
          platform: "Facebook",
          displayName: displayName || `Facebook App (${fbAppId})`,
          fbAppId,
          appSecret,
          isConnected: false,
          createdBy: user?.email || "system",
          isMock: false,
        });
      } else {
        // Cập nhật secret nếu đã có bản ghi cũ
        integration.appSecret = appSecret;
        integration.fbAppId = fbAppId;
        if (displayName) integration.displayName = displayName;
        await integration.save();
      }

      return res.status(200).json({
        status: "success",
        integrationId: integration._id.toString(),
        fbAppId,
      });
    } catch (error: any) {
      console.error("[facebookPostController.initOAuth] Error:", error);
      return res.status(500).json({
        status: "error",
        message: error.message || "Lỗi khi khởi tạo OAuth session.",
      });
    }
  },

  /**
   * GET /api/v1/facebook/oauth-callback
   * Facebook redirect về đây sau khi user đăng nhập.
   * state = integrationId để biết dùng App credentials nào từ DB.
   */
  async oauthCallback(req: Request, res: Response) {
    const sendErrorHtml = (message: string) => {
      return res.status(500).send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"/><title>Facebook Login Error</title>
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fee2e2; }
          .box { background: white; border-radius: 12px; padding: 30px; max-width: 400px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          h2 { color: #dc2626; margin-bottom: 12px; }
          p { color: #6b7280; font-size: 13px; line-height: 1.5; }
        </style>
        </head>
        <body>
          <div class="box">
            <h2>❌ Lỗi kết nối Facebook</h2>
            <p>${message}</p>
          </div>
          <script>
            localStorage.setItem('fb_oauth_result', JSON.stringify({ type: 'FACEBOOK_OAUTH_FAILED', error: ${JSON.stringify(message)} }));
            if (window.opener) {
              window.opener.postMessage({ type: 'FACEBOOK_OAUTH_FAILED', error: ${JSON.stringify(message)} }, '*');
            }
            setTimeout(() => window.close(), 5000);
          </script>
        </body>
        </html>
      `);
    };

    try {
      const { code, error, error_description, state } = req.query;

      if (error) {
        return sendErrorHtml(String(error_description || error));
      }

      if (!code) {
        return sendErrorHtml("Không tìm thấy mã authorization code từ Facebook.");
      }

      // Lấy App credentials từ DB theo integrationId (state)
      let appId: string;
      let appSecret: string;
      let integrationId: string | null = null;

      if (state && String(state).length === 24) {
        // state là integrationId → lấy credentials từ DB (multi-tenant)
        integrationId = String(state);
        const integration = await SocialIntegrationModel.findById(integrationId);

        if (!integration || !integration.fbAppId || !integration.appSecret) {
          return sendErrorHtml("Không tìm thấy thông tin App Facebook trong hệ thống. Vui lòng thử lại.");
        }

        appId = integration.fbAppId;
        appSecret = integration.appSecret;
        console.log(`[FB OAuth] Dùng App ID từ DB: ${appId} (integration: ${integrationId})`);
      } else {
        // Fallback: dùng .env nếu không có state (backward compatibility)
        appId = process.env.FB_APP_ID || "";
        appSecret = process.env.FB_APP_SECRET || "";

        if (!appId || !appSecret) {
          return sendErrorHtml("App Facebook chưa được cấu hình. Vui lòng nhập App ID và App Secret.");
        }
        console.log(`[FB OAuth] Fallback dùng App ID từ .env: ${appId}`);
      }

      // Build redirect URI
      const host = req.get("host") || "";
      const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("192.168.");
      const protocol = isLocal ? req.protocol : "https";
      const redirectUri = `${protocol}://${host}/api/v1/facebook/oauth-callback`;

      // Đổi code lấy danh sách pages
      const pages = await facebookPostService.exchangeCodeForPagesWithCreds(
        String(code),
        redirectUri,
        appId,
        appSecret
      );

      if (!pages || pages.length === 0) {
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head><meta charset="UTF-8"/><title>Lỗi kết nối Facebook</title></head>
          <body>
            <script>
              alert("Tài khoản Facebook của bạn chưa quản lý Fanpage nào hoặc chưa cấp quyền cho ứng dụng.");
              if (window.opener) {
                window.opener.postMessage({ type: 'FACEBOOK_OAUTH_FAILED', error: "Không tìm thấy Fanpage nào." }, '*');
              }
              window.close();
            </script>
          </body>
          </html>
        `);
      }

      // Tự động kết nối Trang đầu tiên được cấp quyền và đóng popup lập tức
      const page = pages[0];
      return res.send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head>
          <meta charset="UTF-8" />
          <title>Đang kết nối Facebook...</title>
          <style>
            body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f0f2f5; margin: 0; }
            .box { text-align: center; }
            .spinner { border: 4px solid rgba(0, 0, 0, 0.1); width: 36px; height: 36px; border-radius: 50%; border-left-color: #1877f2; animation: spin 1s linear infinite; margin: 0 auto 12px auto; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
            p { color: #65676b; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="box">
            <div class="spinner"></div>
            <p>Đang kết nối Fanpage <strong>${page.name || ""}</strong>...</p>
          </div>
          <script>
            const page = ${JSON.stringify(page)};
            const integrationId = ${JSON.stringify(integrationId)};
            localStorage.setItem('fb_oauth_result', JSON.stringify({
              type: 'FACEBOOK_PAGE_SELECTED',
              page: page,
              integrationId: integrationId
            }));
            if (window.opener) {
              window.opener.postMessage({
                type: 'FACEBOOK_PAGE_SELECTED',
                page: page,
                integrationId: integrationId
              }, '*');
            }
            setTimeout(() => window.close(), 200);
          </script>
        </body>
        </html>
      `);
    } catch (err: any) {
      console.error("[facebookPostController.oauthCallback] Error:", err);
      return res.status(500).send(`
        <!DOCTYPE html>
        <html lang="vi">
        <head><meta charset="UTF-8"/><title>Facebook Login Error</title>
        <style>
          body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #fee2e2; }
          .box { background: white; border-radius: 12px; padding: 30px; max-width: 400px; text-align: center; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
          h2 { color: #dc2626; margin-bottom: 12px; }
          p { color: #6b7280; font-size: 13px; line-height: 1.5; }
        </style>
        </head>
        <body>
          <div class="box">
            <h2>❌ Lỗi hệ thống</h2>
            <p>${err.message}</p>
          </div>
          <script>
            localStorage.setItem('fb_oauth_result', JSON.stringify({ type: 'FACEBOOK_OAUTH_FAILED', error: ${JSON.stringify(err.message)} }));
            if (window.opener) {
              window.opener.postMessage({ type: 'FACEBOOK_OAUTH_FAILED', error: ${JSON.stringify(err.message)} }, '*');
            }
            setTimeout(() => window.close(), 5000);
          </script>
        </body>
        </html>
      `);
    }
  },

  /**
   * POST /api/v1/facebook/data-deletion-callback
   * Facebook gọi webhook này khi user yêu cầu xóa dữ liệu hoặc gỡ ứng dụng.
   */
  async dataDeletionCallback(req: Request, res: Response) {
    try {
      const { signed_request } = req.body;
      if (!signed_request) {
        return res.status(400).json({
          status: "error",
          message: "Thiếu tham số signed_request trong yêu cầu."
        });
      }

      // Lấy danh sách tất cả các App Secrets của Facebook trong DB và .env
      const integrations = await SocialIntegrationModel.find({ platform: "Facebook" });
      const secrets = Array.from(new Set(
        integrations
          .map((i) => i.appSecret)
          .filter((s): s is string => !!s)
          .concat(process.env.FB_APP_SECRET || "")
      ));

      if (secrets.length === 0) {
        return res.status(400).json({
          status: "error",
          message: "Hệ thống chưa cấu hình Facebook App Secret nào."
        });
      }

      let decodedData: any = null;
      let matchingSecret: string | null = null;

      for (const secret of secrets) {
        try {
          decodedData = parseSignedRequest(signed_request, secret);
          matchingSecret = secret;
          break;
        } catch (err) {
          // Thử tiếp secret khác
        }
      }

      if (!decodedData || !matchingSecret) {
        return res.status(400).json({
          status: "error",
          message: "Chữ ký signed_request không hợp lệ hoặc không khớp với App Secret nào."
        });
      }

      const facebookUserId = decodedData.user_id;
      if (!facebookUserId) {
        return res.status(400).json({
          status: "error",
          message: "Không tìm thấy Facebook User ID trong payload."
        });
      }

      console.log(`[FB Data Deletion] Nhận yêu cầu xóa dữ liệu cho FB User ID: ${facebookUserId}`);

      // Tạo mã xác nhận duy nhất
      const confirmationCode = "DEL-" + crypto.randomBytes(8).toString("hex").toUpperCase();

      // Cập nhật trạng thái hủy kết nối (isConnected = false) của các tài khoản Facebook
      // liên quan nếu có (để giải phóng tài nguyên và hủy liên kết tự động)
      await SocialIntegrationModel.updateMany(
        { platform: "Facebook", appSecret: matchingSecret },
        { $set: { isConnected: false } }
      );

      // Ghi nhận yêu cầu vào bảng UserDataDeletionModel
      await UserDataDeletionModel.create({
        facebookUserId,
        confirmationCode,
        status: "completed",
        details: `Đã tự động ngắt kết nối các kênh Facebook cho FB User ID ${facebookUserId}.`
      });

      // Trả về kết quả JSON đúng cấu trúc chuẩn của Meta
      const host = req.get("host") || "";
      const isLocal = host.includes("localhost") || host.includes("127.0.0.1") || host.includes("192.168.");
      const protocol = isLocal ? req.protocol : "https";

      const statusUrl = `${protocol}://${host}/user-data-deletion?code=${confirmationCode}`;

      return res.status(200).json({
        url: statusUrl,
        confirmation_code: confirmationCode
      });
    } catch (error: any) {
      console.error("[facebookPostController.dataDeletionCallback] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi xử lý yêu cầu xóa dữ liệu người dùng từ Facebook.",
        details: error.message
      });
    }
  },

  /**
   * GET /api/v1/facebook/data-deletion-status/:code
   * Kiểm tra trạng thái xóa dữ liệu qua mã xác nhận
   */
  async getDataDeletionStatus(req: Request, res: Response) {
    try {
      const { code } = req.params;
      if (!code) {
        return res.status(400).json({
          status: "error",
          message: "Vui lòng cung cấp mã xác nhận."
        });
      }

      const deletionRecord = await UserDataDeletionModel.findOne({ confirmationCode: code });
      if (!deletionRecord) {
        return res.status(404).json({
          status: "error",
          message: "Không tìm thấy yêu cầu xóa dữ liệu với mã xác nhận đã cung cấp."
        });
      }

      return res.status(200).json({
        status: "success",
        data: {
          code: deletionRecord.confirmationCode,
          facebookUserId: deletionRecord.facebookUserId,
          status: deletionRecord.status,
          requestedAt: deletionRecord.requestedAt,
          completedAt: deletionRecord.completedAt,
          details: deletionRecord.details
        }
      });
    } catch (error: any) {
      console.error("[facebookPostController.getDataDeletionStatus] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi truy vấn trạng thái yêu cầu xóa dữ liệu.",
        details: error.message
      });
    }
  },

  /**
   * GET /api/v1/facebook/config
   * Trả về App ID của công ty từ DB (multi-tenant).
   * Fallback về .env nếu chưa có cấu hình trong DB.
   */
  async getConfig(req: Request, res: Response) {
    try {
      const user = (req as any).user;
      const companyCode = user?.companyCode;

      let appId = process.env.FB_APP_ID || "";

      if (companyCode) {
        // Tìm integration Facebook đang có App ID (chưa cần có page token)
        const integration = await SocialIntegrationModel.findOne({
          companyCode,
          platform: "Facebook",
          fbAppId: { $exists: true, $ne: "" },
        }).sort({ connectedAt: -1 });

        if (integration?.fbAppId) {
          appId = integration.fbAppId;
        }
      }

      return res.status(200).json({
        status: "success",
        appId,
        source: appId === process.env.FB_APP_ID ? "env" : "database",
      });
    } catch (error: any) {
      return res.status(200).json({
        status: "success",
        appId: process.env.FB_APP_ID || "",
        source: "env",
      });
    }
  },

  /**
   * POST /api/v1/facebook/n8n-callback
   * Tiếp nhận callback từ n8n để cập nhật trạng thái bài đăng vào DB.
   * status: "published" | "processing" | "failed"
   */
  async receiveN8nCallback(req: Request, res: Response) {
    try {
      const secretToken = process.env.N8N_WEBHOOK_SECRET;
      const requestToken = req.headers["x-webhook-token"];

      if (secretToken && requestToken !== secretToken) {
        return res.status(401).json({
          status: "error",
          message: "Token xác thực callback không chính xác.",
        });
      }

      const { cardId, postId, postUrl, status, error: publishError } = req.body;

      if (!cardId || typeof cardId !== "string" || !/^[0-9a-fA-F]{24}$/.test(cardId)) {
        return res.status(200).json({
          status: "success",
          message: "Card ID không hợp lệ hoặc rỗng, bỏ qua cập nhật.",
        });
      }

      const card = await MarketingContentModel.findById(cardId);
      if (!card) {
        return res.status(404).json({
          status: "error",
          message: "Không tìm thấy bài viết tương ứng với cardId.",
        });
      }

      const publishStatus = status || "published";

      if (publishStatus === "published") {
        const finalPostUrl = postUrl || buildFacebookPostUrl(postId);
        card.status = "published";
        card.publishedAt = new Date();
        card.facebookPostId = postId || card.facebookPostId;
        card.postUrl = finalPostUrl || card.postUrl;
        card.publishError = undefined;
        console.log(`[n8n Callback] Bài viết ${cardId} đã đăng thành công. Post ID: ${postId}`);
      } else if (publishStatus === "processing") {
        card.status = "processing";
        if (postId) card.facebookPostId = postId;
        card.publishError = undefined;
        console.log(`[n8n Callback] Bài viết ${cardId} đang được Facebook xử lý. Post ID: ${postId}`);
      } else if (publishStatus === "failed") {
        card.status = "failed";
        card.publishError = publishError || "Đăng bài thất bại qua n8n";
        console.log(`[n8n Callback] Bài viết ${cardId} thất bại: ${card.publishError}`);
      }

      await card.save();

      return res.status(200).json({
        status: "success",
        message: `Cập nhật trạng thái bài viết thành công: ${publishStatus}`,
      });
    } catch (error: any) {
      console.error("[facebookPostController.receiveN8nCallback] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi xử lý callback từ n8n",
        details: error.message,
      });
    }
  },
};
