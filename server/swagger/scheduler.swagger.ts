export const schedulerSwagger = {
  paths: {
    "/api/v1/scheduler/check-and-publish": {
      post: {
        summary: "Kích hoạt tác vụ quét và tự động đăng bài viết đến hạn (gọi từ n8n)",
        tags: ["Scheduler"],
        parameters: [
          {
            in: "header",
            name: "X-Webhook-Token",
            schema: {
              type: "string",
            },
            required: false,
            description: "Khóa bảo mật webhook được cấu hình trong biến môi trường N8N_WEBHOOK_SECRET",
          },
        ],
        responses: {
          200: {
            description: "Thực thi tác vụ quét thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: {
                      type: "string",
                      example: "Thực thi tác vụ kiểm tra bài đăng định kỳ thành công",
                    },
                    data: {
                      type: "object",
                      properties: {
                        processedCount: { type: "number", example: 1 },
                        successCount: { type: "number", example: 1 },
                        failedCount: { type: "number", example: 0 },
                        details: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              cardId: { type: "string", example: "card_123" },
                              title: { type: "string", example: "Bài viết test" },
                              channel: { type: "string", example: "Facebook" },
                              status: { type: "string", example: "success" },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: {
            description: "Không có quyền truy cập do Token không chính xác",
          },
          500: {
            description: "Lỗi hệ thống trong quá trình thực thi",
          },
        },
      },
    },
    "/api/v1/scheduler/schedule-post": {
      post: {
        summary: "Đăng ký lịch hẹn đăng bài viết chuyển tiếp sang n8n Webhook",
        tags: ["Scheduler"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  cardId: { type: "string", example: "mod-1" },
                  channel: { type: "string", enum: ["Facebook", "TikTok"], example: "Facebook" },
                  title: { type: "string", example: "Bài viết mẫu" },
                  bodyText: { type: "string", example: "Nội dung bài viết hay..." },
                  imageUrl: { type: "string", example: "https://example.com/image.png" },
                  videoUrl: { type: "string", example: "https://example.com/video.mp4" },
                  scheduledDate: { type: "string", example: "2026-10-15" },
                  scheduledTime: { type: "string", example: "12:00" },
                  integration: {
                    type: "object",
                    description: "Thông tin liên kết MXH tương ứng",
                    properties: {
                      pageId: { type: "string", example: "123456" },
                      pageAccessToken: { type: "string", example: "EAAGmx..." },
                    },
                  },
                },
                required: ["cardId", "channel", "title", "bodyText", "scheduledDate", "scheduledTime", "integration"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Đăng ký lịch hẹn thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Gửi yêu cầu lên lịch bài đăng sang n8n thành công" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
          400: {
            description: "Dữ liệu yêu cầu không hợp lệ",
          },
          500: {
            description: "Lỗi kết nối máy chủ hoặc n8n",
          },
        },
      },
    },
  },
};
