export const opusclipSwagger = {
  paths: {
    "/api/v1/opusclip/projects": {
      post: {
        summary: "Khởi tạo dự án cắt ghép video dài thành ngắn",
        tags: ["OpusClip AI"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  videoUrl: {
                    type: "string",
                    description: "Đường dẫn video dài (YouTube, Google Drive, direct MP4 link, ...)",
                    example: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
                  },
                  name: {
                    type: "string",
                    description: "Tên hiển thị dự án (tùy chọn)",
                    example: "My short clipping project",
                  },
                  lengthOption: {
                    type: "string",
                    enum: ["auto", "<30s", "30s-60s", "60s-90s", "90s-3m"],
                    description: "Độ dài mong muốn của các video ngắn kết quả",
                    example: "auto",
                  },
                  sourceLang: {
                    type: "string",
                    description: "Ngôn ngữ chính nói trong video (Auto hoặc mã ISO-639 như 'vi', 'en')",
                    example: "auto",
                  },
                  brandTemplateId: {
                    type: "string",
                    description: "Mã mẫu giao diện/phụ đề tùy chỉnh (tùy chọn)",
                    example: "",
                  },
                },
                required: ["videoUrl"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Khởi tạo dự án thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Tạo dự án OpusClip thành công, đang tiến hành xử lý." },
                    data: {
                      type: "object",
                      properties: {
                        userId: { type: "string" },
                        projectId: { type: "string" },
                        videoUrl: { type: "string" },
                        name: { type: "string" },
                        status: { type: "string", example: "processing" },
                        clips: { type: "array", items: { type: "object" } },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: "Dữ liệu yêu cầu không hợp lệ",
          },
          401: {
            description: "Chưa xác thực hoặc không có quyền truy cập",
          },
          500: {
            description: "Lỗi hệ thống hoặc API OpusClip gặp sự cố",
          },
        },
      },
      get: {
        summary: "Lấy danh sách dự án Long-to-Short của người dùng hiện tại",
        tags: ["OpusClip AI"],
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "projectId",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Mã dự án cần kiểm tra",
          },
          {
            name: "pageNum",
            in: "query",
            schema: { type: "integer", default: 1 },
          },
          {
            name: "pageSize",
            in: "query",
            schema: { type: "integer", default: 50 },
          },
        ],
        responses: {
          200: {
            description: "Lấy danh sách thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    data: {
                      type: "object",
                      properties: {
                        list: { type: "array", items: { type: "object" } },
                        total: { type: "integer" },
                        page: { type: "integer" },
                        limit: { type: "integer" },
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
    "/api/v1/opusclip/projects/{projectId}": {
      get: {
        summary: "Lấy chi tiết dự án và danh sách các clips kết quả",
        tags: ["OpusClip AI"],
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "projectId",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Mã dự án OpusClip",
          },
        ],
        responses: {
          200: {
            description: "Trả về chi tiết dự án",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    data: {
                      type: "object",
                      properties: {
                        projectId: { type: "string" },
                        videoUrl: { type: "string" },
                        status: { type: "string", example: "completed" },
                        clips: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              clipId: { type: "string" },
                              videoUrl: { type: "string" },
                              title: { type: "string" },
                              description: { type: "string" },
                              hashtags: { type: "string" },
                              viralityScore: { type: "number" },
                              viralReason: { type: "string" },
                              duration: { type: "number" },
                              startTime: { type: "number" },
                              endTime: { type: "number" },
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
        },
      },
    },
    "/api/v1/opusclip/webhook": {
      post: {
        summary: "Nhận kết quả xử lý từ OpusClip qua cơ chế Webhook",
        tags: ["OpusClip AI Webhook Callback"],
        description: "OpusClip sẽ gửi yêu cầu này đến hệ thống khi dự án chuyển trạng thái. Request chứa các tiêu đề bảo mật X-Opus-Signature, X-Opus-Salt, X-Opus-Timestamp.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  projectId: { type: "string" },
                  stage: { type: "string", example: "COMPLETE" },
                  error: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Webhook xử lý thành công",
          },
          401: {
            description: "Xác thực chữ ký thất bại",
          },
        },
      },
    },
  },
};
