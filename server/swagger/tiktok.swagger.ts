export const tiktokSwagger = {
  paths: {
    "/api/v1/tiktok/publish": {
      post: {
        summary: "Đăng video lên TikTok (Blotato API / TikTok Direct API)",
        description:
          "Hệ thống tự động chọn phương thức phù hợp:\n" +
          "1. **Blotato API** (Khuyên dùng khi chưa có app TikTok được duyệt): Tự động kích hoạt khi có cấu hình `BLOTATO_API_KEY` và `BLOTATO_TIKTOK_ACCOUNT_ID` trong file `.env`. Hỗ trợ đăng ngay hoặc lên lịch bằng `scheduledTime`.\n" +
          "2. **TikTok Direct API**: Kích hoạt khi không có Blotato API và truyền `accessToken`. Sử dụng cơ chế PULL_FROM_URL của TikTok API v2.\n" +
          "Lưu ý: Video đăng tải phải ở định dạng MP4/H.264, kích thước ≤ 500MB và có thể truy cập qua URL công khai.",
        tags: ["TikTok"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["cardId", "videoUrl"],
                properties: {
                  cardId: {
                    type: "string",
                    description: "ID của bài đăng/card trong hệ thống (định dạng MongoDB ObjectId)",
                    example: "60d5ec49f83c2c2f7823f81e",
                  },
                  caption: {
                    type: "string",
                    description: "Nội dung caption cho video TikTok (tối đa 2200 ký tự)",
                    example: "Video hướng dẫn sử dụng iGen ERP thông minh #igen #erp",
                  },
                  videoUrl: {
                    type: "string",
                    description:
                      "URL công khai trỏ đến file video MP4/H.264 (TikTok/Blotato sẽ tự kéo về)",
                    example: "https://example.com/videos/tutorial.mp4",
                  },
                  privacyLevel: {
                    type: "string",
                    description: "Mức quyền riêng tư của video (chỉ áp dụng cho TikTok Direct API)",
                    enum: [
                      "PUBLIC_TO_EVERYONE",
                      "MUTUAL_FOLLOW_FRIENDS",
                      "FOLLOWER_OF_ACTIVE_USER",
                      "SELF_ONLY",
                    ],
                    default: "SELF_ONLY",
                    example: "SELF_ONLY",
                  },
                  accessToken: {
                    type: "string",
                    description:
                      "Access Token OAuth2 của tài khoản TikTok (bắt buộc nếu không dùng Blotato)",
                    example: "act.example_access_token_here",
                  },
                  username: {
                    type: "string",
                    description: "Username TikTok (dùng để tạo share URL cho Direct API)",
                    example: "igen_tech",
                  },
                  scheduledTime: {
                    type: "string",
                    format: "date-time",
                    description: "Thời gian lên lịch đăng bài (ISO string, ví dụ: 2026-06-12T10:00:00Z). Chỉ hỗ trợ qua Blotato API.",
                    example: "2026-06-12T10:00:00Z",
                  },
                  blotatoAccountId: {
                    type: "string",
                    description: "ID tài khoản TikTok cụ thể trên Blotato. Nếu không truyền, hệ thống sẽ sử dụng BLOTATO_TIKTOK_ACCOUNT_ID từ .env.",
                    example: "acc_60d5ec...",
                  },
                  blotatoApiKey: {
                    type: "string",
                    description: "API Key Blotato của bạn. Nếu không truyền, hệ thống sử dụng BLOTATO_API_KEY từ .env.",
                    example: "blotato_api_...",
                  },
                  integrationId: {
                    type: "string",
                    description: "Mã ID tài khoản kết nối từ bảng SocialIntegration. Nếu truyền vào, hệ thống tự động nạp tất cả cấu hình token/API Key từ DB.",
                    example: "60d5ec49f83c2c2f7823f81e",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description:
              "Gửi yêu cầu đăng video thành công hoặc đang xử lý",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                      enum: ["success", "pending"],
                      example: "success",
                    },
                    message: {
                      type: "string",
                      example: "Đăng video lên TikTok qua Blotato thành công",
                    },
                    provider: {
                      type: "string",
                      enum: ["blotato", "tiktok_direct"],
                      example: "blotato",
                    },
                    data: {
                      type: "object",
                      properties: {
                        postSubmissionId: {
                          type: "string",
                          description: "ID bài post do Blotato trả về (hoặc publishId của TikTok)",
                          example: "post_12345abcdef",
                        },
                        publishId: {
                          type: "string",
                          description: "Mã publish_id nếu dùng TikTok Direct",
                          example: "v_pub_url~v3-123456789",
                        },
                        shareUrl: {
                          type: "string",
                          description:
                            "Link video TikTok sau khi đăng thành công (chỉ có khi dùng TikTok Direct và polling hoàn tất)",
                          example: "https://www.tiktok.com/@igen_tech/video/123456",
                        },
                        publishStatus: {
                          type: "string",
                          enum: [
                            "PUBLISH_COMPLETE",
                            "PROCESSING",
                            "SCHEDULED",
                            "SUBMITTED",
                          ],
                          example: "SUBMITTED",
                        },
                        success: { type: "boolean", example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: "Dữ liệu đầu vào không hợp lệ (Joi validation)",
          },
          401: {
            description: "Chưa đăng nhập hoặc không có quyền",
          },
          500: {
            description: "Lỗi hệ thống, lỗi kết nối Blotato hoặc TikTok API từ chối",
          },
        },
      },
    },

    "/api/v1/tiktok/validate-token": {
      post: {
        summary: "Xác thực kết nối TikTok",
        description:
          "Xác thực kết nối theo thứ tự:\n" +
          "1. Kiểm tra qua Blotato API nếu có cấu hình `BLOTATO_API_KEY`.\n" +
          "2. Kiểm tra trực tiếp bằng Creator Info Query API nếu có truyền `accessToken`.\n" +
          "3. Fallback qua n8n Webhook nếu `N8N_TT_VALIDATE_URL` đã cấu hình.",
        tags: ["TikTok"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  username: {
                    type: "string",
                    description: "Username TikTok (tuỳ chọn)",
                    example: "igen_tech",
                  },
                  accessToken: {
                    type: "string",
                    description: "Access Token TikTok (tuỳ chọn)",
                    example: "act.example_access_token_here",
                  },
                  blotatoApiKey: {
                    type: "string",
                    description: "API Key Blotato để xác thực tài khoản. Nếu không truyền, hệ thống sử dụng BLOTATO_API_KEY từ .env.",
                    example: "blotato_api_...",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Xác thực thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: {
                      type: "string",
                      example: "Kết nối TikTok qua Blotato hợp lệ",
                    },
                    valid: { type: "boolean", example: true },
                    provider: { type: "string", enum: ["blotato", "tiktok_direct", "n8n"], example: "blotato" },
                    displayName: { type: "string", example: "iGen Tech Official" },
                    avatarUrl: {
                      type: "string",
                      example: "https://p16-sign.tiktokcdn-us.com/...",
                    },
                    privacyLevelOptions: {
                      type: "array",
                      items: { type: "string" },
                      example: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
                    },
                  },
                },
              },
            },
          },
          400: { description: "Dữ liệu đầu vào không hợp lệ" },
          401: { description: "Chưa đăng nhập hoặc không có quyền" },
          500: { description: "Lỗi hệ thống hoặc xác thực thất bại" },
        },
      },
    },

    "/api/v1/tiktok/creator-info": {
      post: {
        summary: "Lấy thông tin creator TikTok",
        description:
          "Gọi `/v2/post/publish/creator_info/query/` để lấy avatar, nickname, danh sách privacy options và các cài đặt mặc định của tài khoản TikTok. Chỉ hoạt động với TikTok Direct API.",
        tags: ["TikTok"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["accessToken"],
                properties: {
                  accessToken: {
                    type: "string",
                    description: "Access Token TikTok (scope: video.publish)",
                    example: "act.example_access_token_here",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Lấy thông tin creator thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: {
                      type: "string",
                      example: "Lấy thông tin creator TikTok thành công",
                    },
                    data: {
                      type: "object",
                      properties: {
                        creatorAvatarUrl: { type: "string" },
                        creatorNickname: { type: "string", example: "iGen Tech" },
                        creatorUsername: { type: "string", example: "igen_tech" },
                        privacyLevelOptions: {
                          type: "array",
                          items: { type: "string" },
                          example: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
                        },
                        commentDisabled: { type: "boolean", example: false },
                        duetDisabled: { type: "boolean", example: false },
                        stitchDisabled: { type: "boolean", example: false },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Dữ liệu đầu vào không hợp lệ" },
          401: { description: "Chưa đăng nhập hoặc không có quyền" },
          500: { description: "Lỗi hệ thống hoặc TikTok API từ chối" },
        },
      },
    },

    "/api/v1/tiktok/blotato-accounts": {
      get: {
        summary: "Lấy danh sách tài khoản TikTok từ Blotato",
        description:
          "Truy vấn API Blotato để lấy toàn bộ các tài khoản TikTok đã kết nối dưới API Key hiện tại. Dùng để lấy `accountId` dùng cho cấu hình môi trường.",
        tags: ["TikTok"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "blotatoApiKey",
            in: "query",
            description: "API Key Blotato. Nếu không truyền, hệ thống sử dụng BLOTATO_API_KEY từ .env.",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Lấy tài khoản thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Lấy danh sách tài khoản TikTok từ Blotato thành công" },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "acc_12345" },
                          name: { type: "string", example: "iGen Tech" },
                          platform: { type: "string", example: "tiktok" },
                          avatarUrl: { type: "string", example: "https://..." },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "Chưa đăng nhập hoặc không có quyền" },
          500: { description: "Lỗi kết nối Blotato API hoặc cấu hình thiếu" },
        },
      },
    },
  },
};

