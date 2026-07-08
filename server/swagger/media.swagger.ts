export const mediaSwagger = {
  paths: {
    "/api/v1/media/upload": {
      post: {
        summary: "Tải ảnh hoặc video lên Cloudinary thông qua Backend Relay",
        tags: ["Media"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  file: {
                    type: "string",
                    description: "Dữ liệu tệp tin cần tải lên (Chuỗi Base64 Data URL hoặc link URL công khai)",
                    example: "data:image/png;base64,iVBORw0KGgo...",
                  },
                  folder: {
                    type: "string",
                    description: "Thư mục lưu trữ trên Cloudinary (tùy chọn)",
                    example: "igen_erp/marketing",
                  },
                },
                required: ["file"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Tải lên Cloudinary thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    url: {
                      type: "string",
                      example: "https://res.cloudinary.com/your_cloud/image/upload/v123456/igen_erp/marketing/xyz.png",
                    },
                  },
                },
              },
            },
          },
          400: {
            description: "Dữ liệu yêu cầu không hợp lệ",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "error" },
                    message: { type: "string", example: "Dữ liệu yêu cầu không hợp lệ" },
                    errors: { type: "object" },
                  },
                },
              },
            },
          },
          500: {
            description: "Lỗi kết nối máy chủ Cloudinary",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "error" },
                    message: { type: "string", example: "Lỗi kết nối hoặc xử lý tải lên đa phương tiện tới Cloudinary" },
                    details: { type: "string" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};
