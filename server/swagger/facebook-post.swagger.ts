export const facebookPostSwagger = {
  paths: {
    "/api/v1/facebook/publish": {
      post: {
        summary: "Đăng bài viết lên Facebook Page thông qua n8n workflow",
        tags: ["Facebook"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  content: {
                    type: "string",
                    description: "Nội dung bài viết đăng lên Facebook Page",
                    example: "Chào mừng các bạn đến với hệ thống ERP thế hệ mới iGen!",
                  },
                  imageUrl: {
                    type: "string",
                    description: "Đường dẫn URL hình ảnh đi kèm bài đăng (tùy chọn)",
                    example: "https://picsum.photos/800/600",
                  },
                  videoUrl: {
                    type: "string",
                    description: "Đường dẫn URL video đi kèm bài đăng (tùy chọn)",
                    example: "https://example.com/video.mp4",
                  },
                  pageId: {
                    type: "string",
                    description: "ID của trang Facebook mục tiêu",
                    example: "123456789012345",
                  },
                  accessToken: {
                    type: "string",
                    description: "Token quyền hạn (Page Access Token) dùng để đăng bài",
                    example: "EAAGmx...",
                  },
                },
                required: ["content", "pageId", "accessToken"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Gửi yêu cầu đăng bài thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: {
                      type: "string",
                      example: "Gửi yêu cầu đăng bài lên Facebook qua n8n thành công",
                    },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
          400: {
            description: "Dữ liệu đầu vào không hợp lệ",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "error" },
                    message: {
                      type: "string",
                      example: "Dữ liệu yêu cầu không hợp lệ",
                    },
                    errors: { type: "object" },
                  },
                },
              },
            },
          },
          500: {
            description: "Lỗi kết nối máy chủ hoặc n8n",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "error" },
                    message: {
                      type: "string",
                      example: "Lỗi kết nối hoặc xử lý đăng bài lên Facebook qua n8n",
                    },
                    details: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/facebook/validate-token": {
      post: {
        summary: "Xác thực token liên kết Facebook Page qua n8n",
        tags: ["Facebook"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  pageId: {
                    type: "string",
                    description: "ID của trang Facebook",
                    example: "123456789012345",
                  },
                  accessToken: {
                    type: "string",
                    description: "Token quyền hạn (Page Access Token) cần kiểm tra",
                    example: "EAAGmx...",
                  },
                },
                required: ["pageId", "accessToken"],
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
                      example: "Xác thực token kết nối Facebook Page qua n8n thành công",
                    },
                    valid: { type: "boolean", example: true },
                    pageName: { type: "string", example: "My Facebook Page" },
                  },
                },
              },
            },
          },
          400: {
            description: "Dữ liệu đầu vào không hợp lệ",
          },
          500: {
            description: "Lỗi hệ thống hoặc token không hợp lệ",
          },
        },
      },
    },
    "/api/v1/facebook/n8n-callback": {
      post: {
        summary: "Tiếp nhận callback từ n8n sau khi đăng bài thành công lên Facebook Page",
        tags: ["Facebook"],
        parameters: [
          {
            in: "header",
            name: "X-Webhook-Token",
            schema: { type: "string" },
            required: false,
            description: "Khóa bảo mật webhook được cấu hình trong biến môi trường N8N_WEBHOOK_SECRET",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  cardId: {
                    type: "string",
                    description: "ID của bài đăng trong hệ thống (MongoDB ObjectId)",
                    example: "6a28d41f81a842356b329269",
                  },
                  postId: {
                    type: "string",
                    description: "ID của bài đăng nhận được từ Facebook",
                    example: "123456789012345_67890",
                  },
                  postUrl: {
                    type: "string",
                    description: "Đường dẫn URL bài viết thật (permalink_url)",
                    example: "https://www.facebook.com/123456789012345/posts/67890",
                  },
                },
                required: ["cardId", "postId", "postUrl"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Cập nhật trạng thái bài đăng thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: {
                      type: "string",
                      example: "Cập nhật trạng thái bài viết từ n8n callback thành công",
                    },
                  },
                },
              },
            },
          },
          401: {
            description: "Không có quyền truy cập endpoint (Token xác thực không hợp lệ)",
          },
          404: {
            description: "Không tìm thấy bài viết tương ứng",
          },
          500: {
            description: "Lỗi hệ thống khi cập nhật trạng thái bài viết",
          },
        },
      },
    },
  },
};
