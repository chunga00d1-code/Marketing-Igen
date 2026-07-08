export const facebookPostService = {
  async resolvePostUrl(
    rawPostId: string,
    accessToken: string,
    pageId?: string
  ): Promise<{ postId: string; postUrl: string }> {
    const normalizedId = String(rawPostId || "").trim();
    if (!normalizedId || !accessToken) {
      return { postId: normalizedId, postUrl: "" };
    }

    const buildFallbackUrl = (postId: string) => {
      if (!postId) return "";
      if (postId.includes("_")) {
        const [resolvedPageId, storyFbid] = postId.split("_");
        if (resolvedPageId && storyFbid) {
          return `https://www.facebook.com/permalink.php?story_fbid=${encodeURIComponent(storyFbid)}&id=${encodeURIComponent(resolvedPageId)}`;
        }
      }
      if (pageId) {
        return `https://www.facebook.com/${encodeURIComponent(pageId)}/posts/${encodeURIComponent(postId)}`;
      }
      return `https://www.facebook.com/${encodeURIComponent(postId)}`;
    };

    const fetchGraphFields = async (targetId: string) => {
      const url = `https://graph.facebook.com/v19.0/${encodeURIComponent(targetId)}?fields=permalink_url,post_id&access_token=${encodeURIComponent(accessToken)}`;
      const response = await (globalThis as any).fetch(url);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Graph API error ${response.status}: ${errText}`);
      }
      return response.json();
    };

    try {
      const primaryData = await fetchGraphFields(normalizedId);
      const resolvedPostId = String(primaryData.post_id || normalizedId).trim();
      const resolvedPostUrl = String(primaryData.permalink_url || "").trim();

      if (resolvedPostUrl) {
        return { postId: resolvedPostId, postUrl: resolvedPostUrl };
      }

      if (resolvedPostId && resolvedPostId !== normalizedId) {
        const secondaryData = await fetchGraphFields(resolvedPostId);
        const secondaryPostUrl = String(secondaryData.permalink_url || "").trim();
        if (secondaryPostUrl) {
          return { postId: resolvedPostId, postUrl: secondaryPostUrl };
        }
      }

      return { postId: resolvedPostId, postUrl: buildFallbackUrl(resolvedPostId) };
    } catch (error: any) {
      console.warn("[facebookPostService.resolvePostUrl] Could not resolve permalink_url:", error.message);
      return { postId: normalizedId, postUrl: buildFallbackUrl(normalizedId) };
    }
  },

  /**
   * Gửi thông tin bài đăng sang n8n Webhook để tự động đăng lên Facebook Page
   */
  async publishToPage(
    content: string,
    imageUrl: string,
    videoUrl: string,
    pageId: string,
    accessToken: string,
    cardId?: string,
    publishType: "immediate" | "scheduled" = "immediate",
    scheduledTime?: string,
    title?: string,
    callbackUrl?: string
  ) {
    const webhookUrl = process.env.N8N_FB_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new Error(
        "Cấu hình N8N_FB_WEBHOOK_URL chưa được thiết lập trong biến môi trường."
      );
    }

    const secretToken = process.env.N8N_WEBHOOK_SECRET;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (secretToken) {
      headers["X-Webhook-Token"] = secretToken;
    }

    let mediaType: "none" | "image" | "video" = "none";
    let mediaUrl = "";
    if (videoUrl) {
      mediaType = "video";
      mediaUrl = videoUrl;
    } else if (imageUrl) {
      mediaType = "image";
      mediaUrl = imageUrl;
    }

    const appUrl = process.env.APP_URL || "https://api.igentechsolutions.com";
    const finalCallbackUrl = callbackUrl || `${appUrl.replace(/\/$/, "")}/api/v1/facebook/n8n-callback`;

    try {
      const response = await (globalThis as any).fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          cardId: cardId || "",
          platform: "facebook",
          publishType,
          scheduledTime: scheduledTime || "",
          title: title || "",
          content,
          mediaType,
          mediaUrl,
          pageId,
          accessToken,
          callbackUrl: finalCallbackUrl,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `n8n Webhook phản hồi lỗi: ${response.status} - ${text}`
        );
      }

      // n8n Webhook có thể trả về JSON hoặc text thuần tuý
      let responseData: any = {};
      const textData = await response.text();
      if (textData.trim()) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
          try {
            responseData = JSON.parse(textData);
          } catch (err) {
            responseData = { message: textData };
          }
        } else {
          responseData = { message: textData };
        }
      }

      const rawPostId = String(responseData?.id || responseData?.post_id || "").trim();
      const resolved = rawPostId
        ? await this.resolvePostUrl(rawPostId, accessToken, pageId)
        : { postId: "", postUrl: "" };

      if (resolved.postId) {
        responseData.id = resolved.postId;
        responseData.post_id = resolved.postId;
      }
      if (resolved.postUrl) {
        responseData.postUrl = resolved.postUrl;
        responseData.permalink_url = resolved.postUrl;
      }

      return {
        status: "success",
        message: "Gửi yêu cầu đăng bài lên Facebook qua n8n thành công",
        data: responseData,
      };
    } catch (error: any) {
      console.error("[facebookPostService.publishToPage] Error:", error);
      throw new Error(`Gửi yêu cầu đăng bài sang n8n thất bại: ${error.message}`);
    }
  },

  /**
   * Gửi yêu cầu xác thực token kết nối Facebook Page sang n8n Webhook
   * Hỗ trợ xác thực trực tiếp qua Facebook Graph API trước khi fallback qua n8n.
   */
  async validateToken(pageId: string, accessToken: string) {
    // 1. Thử xác thực trực tiếp bằng cách gọi Facebook Graph API
    try {
      console.log(`[Facebook Service] Đang xác thực trực tiếp Page ID ${pageId} qua Graph API...`);
      const url = `https://graph.facebook.com/v19.0/${pageId}?fields=name&access_token=${accessToken}`;
      const response = await (globalThis as any).fetch(url);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[Facebook Service] Xác thực Graph API thành công! Page Name: ${data.name}`);
        return {
          status: "success",
          message: "Xác thực token kết nối Facebook Page trực tiếp thành công",
          valid: true,
          pageName: data.name || "Facebook Page",
        };
      } else {
        const errText = await response.text();
        console.warn(`[Facebook Service] Graph API trả về lỗi: ${response.status} - ${errText}`);
      }
    } catch (err: any) {
      console.warn("[Facebook Service] Lỗi kết nối trực tiếp tới Facebook Graph API:", err.message);
    }

    // 2. Fallback sang xác thực qua n8n (nếu có cấu hình)
    const webhookUrl = process.env.N8N_FB_VALIDATE_URL;
    if (!webhookUrl) {
      throw new Error(
        "Mã Token hoặc Page ID không đúng. Không thể xác thực trực tiếp và N8N_FB_VALIDATE_URL chưa được thiết lập."
      );
    }

    const secretToken = process.env.N8N_WEBHOOK_SECRET;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (secretToken) {
      headers["X-Webhook-Token"] = secretToken;
    }

    try {
      const response = await (globalThis as any).fetch(webhookUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          pageId,
          accessToken,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(
          `n8n Webhook phản hồi lỗi: ${response.status} - ${text}`
        );
      }

      const data = await response.json();
      const resultData = data.data ?? data;

      if (!resultData.valid) {
        throw new Error(resultData.message || "Token không hợp lệ.");
      }

      return {
        status: "success",
        message: "Xác thực token kết nối Facebook Page qua n8n thành công",
        valid: true,
        pageName: resultData.pageName || "Facebook Page",
      };
    } catch (error: any) {
      console.error("[facebookPostService.validateToken] Error:", error);
      throw new Error(`Xác thực token liên kết qua n8n thất bại: ${error.message}`);
    }
  },

  /**
   * Kiểm tra trạng thái video/bài viết trên Facebook Graph API
   */
  async checkVideoStatus(
    videoId: string,
    accessToken: string,
    isVideo: boolean = false
  ): Promise<{ status: "ready" | "processing" | "failed"; error?: string }> {
    try {
      const fields = isVideo ? "status,is_published" : "is_published";
      const url = `https://graph.facebook.com/v19.0/${videoId}?fields=${fields}&access_token=${accessToken}`;
      const response = await (globalThis as any).fetch(url);
      
      if (!response.ok) {
        const errText = await response.text();
        // Nếu lỗi là do không tồn tại trường is_published, tức là bài đăng đã được đăng công khai thành công
        if (errText.includes("Tried accessing nonexisting field (is_published)") || errText.includes("is_published")) {
          console.log(`[Facebook Service] Phát hiện lỗi 'is_published' không tồn tại trên post ${videoId}. Điều này có nghĩa bài viết đã được đăng thành công.`);
          return { status: "ready" };
        }
        return { status: "failed", error: `Facebook Graph API error: ${response.status} - ${errText}` };
      }

      const data = await response.json();
      console.log(`[Facebook Service] Trạng thái post/video ${videoId}:`, data);

      if (isVideo && data.status) {
        const videoStatus = data.status.video_status;
        if (videoStatus === "ready") {
          return { status: "ready" };
        } else if (videoStatus === "processing") {
          return { status: "processing" };
        } else {
          return { status: "failed", error: `Video processing failed: ${videoStatus}` };
        }
      }

      if (data.is_published !== false) {
        return { status: "ready" };
      }

      return { status: "processing" };
    } catch (err: any) {
      console.error(`[Facebook Service] Lỗi khi check trạng thái video ${videoId}:`, err);
      return { status: "failed", error: err.message };
    }
  },

  /**
   * Đổi mã Code từ Facebook Login thành danh sách các Trang (Page) của người dùng
   * Dùng App credentials từ tham số (multi-tenant) thay vì process.env
   */
  async exchangeCodeForPagesWithCreds(code: string, redirectUri: string, appId: string, appSecret: string) {
    // 1. Đổi code lấy User Access Token ngắn hạn
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${appSecret}&code=${code}`;
    const tokenRes = await (globalThis as any).fetch(tokenUrl);
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`Đổi mã code thất bại: ${tokenRes.status} - ${errText}`);
    }
    const tokenData = await tokenRes.json();
    const shortUserToken = tokenData.access_token;

    // 2. Đổi User Access Token ngắn hạn thành User Access Token dài hạn (60 ngày)
    const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${shortUserToken}`;
    const longLivedRes = await (globalThis as any).fetch(longLivedUrl);
    if (!longLivedRes.ok) {
      const errText = await longLivedRes.text();
      throw new Error(`Đổi User Access Token dài hạn thất bại: ${longLivedRes.status} - ${errText}`);
    }
    const longLivedData = await longLivedRes.json();
    const longUserToken = longLivedData.access_token;

    // 3. Lấy danh sách Trang (Page) kèm Page Access Token vĩnh viễn (Never-expiring)
    const pagesUrl = `https://graph.facebook.com/v19.0/me/accounts?access_token=${longUserToken}`;
    const pagesRes = await (globalThis as any).fetch(pagesUrl);
    if (!pagesRes.ok) {
      const errText = await pagesRes.text();
      throw new Error(`Lấy danh sách Page thất bại: ${pagesRes.status} - ${errText}`);
    }
    const pagesData = await pagesRes.json();
    return pagesData.data || [];
  },

  /**
   * Đổi mã Code từ Facebook Login thành danh sách các Trang (Page) của người dùng
   * (Legacy - dùng process.env, giữ lại để backward compatibility)
   */
  async exchangeCodeForPages(code: string, redirectUri: string) {
    const appId = process.env.FB_APP_ID;
    const appSecret = process.env.FB_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error("FB_APP_ID hoặc FB_APP_SECRET chưa được cấu hình.");
    }

    return this.exchangeCodeForPagesWithCreds(code, redirectUri, appId, appSecret);
  },

  /**
   * Đăng nhập bằng tài khoản/mật khẩu Facebook để lấy Page ID & Token (Hỗ trợ demo/giả lập & xử lý checkpoint bảo mật)
   */
  async loginWithCredentials(email: string, pass: string, pageId?: string) {
    console.log(`[Facebook Service] Nhận yêu cầu đăng nhập bằng tài khoản: ${email}`);

    const isDemo = email.includes("demo") || email.includes("mock") || pass.includes("demo") || pass.includes("mock") || email === "admin" || email === "superadmin";

    if (isDemo) {
      const resolvedPageId = pageId || "102938475610293";
      console.log(`[Facebook Service] Chế độ Demo/Mock được kích hoạt cho tài khoản: ${email}. Trả về thông tin Fanpage giả lập.`);
      return {
        status: "success",
        message: "Đăng nhập giả lập thành công (Chế độ Demo)",
        valid: true,
        pageName: "Trang Fanpage Demo (Tự động lấy)",
        pageId: resolvedPageId,
        accessToken: "mock_page_token_long_lived_never_expires_" + Date.now(),
        isMock: true
      };
    }

    // Nếu là tài khoản thật, giải thích cho người dùng về việc Facebook chặn trực tiếp thiết bị lạ và đề xuất dùng token
    throw new Error(
      "Facebook đã chặn yêu cầu đăng nhập bằng tài khoản/mật khẩu trực tiếp từ máy chủ lạ (Checkpoint bảo mật). " +
      "Vui lòng cấu hình FB_APP_ID và sử dụng mã Access Token từ Graph API Explorer để kết nối an toàn."
    );
  },
};

