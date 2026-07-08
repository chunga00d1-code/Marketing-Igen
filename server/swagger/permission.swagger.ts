export const permissionSwagger = {
  paths: {
    "/api/v1/permissions": {
      post: {
        summary: "Tạo mới một mã quyền hệ thống (Chỉ dành cho Superadmin)",
        tags: ["Permissions"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  code: { type: "string", example: "crm:manage", description: "Mã quyền duy nhất" },
                  name: { type: "string", example: "Quản trị CRM", description: "Tên mã quyền tiếng Việt" },
                  module: { type: "string", example: "crm", description: "Module thuộc về mã quyền này" },
                  description: { type: "string", example: "Cho phép thêm, sửa, xóa các ticket CRM", description: "Mô tả chi tiết" }
                },
                required: ["code", "name", "module"]
              }
            }
          }
        },
        responses: {
          201: {
            description: "Tạo mã quyền thành công"
          },
          400: {
            description: "Dữ liệu yêu cầu không hợp lệ hoặc mã quyền đã tồn tại"
          },
          401: {
            description: "Chưa đăng nhập"
          },
          403: {
            description: "Không có quyền thực hiện thao tác này"
          }
        }
      },
      get: {
        summary: "Lấy danh sách mã quyền trong hệ thống (Yêu cầu đăng nhập)",
        tags: ["Permissions"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "Số trang" },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1 }, description: "Số bản ghi trên trang" },
          { name: "module", in: "query", schema: { type: "string" }, description: "Lọc theo module" },
          { name: "search", in: "query", schema: { type: "string" }, description: "Tìm kiếm theo mã hoặc tên quyền" }
        ],
        responses: {
          200: {
            description: "Lấy danh sách thành công"
          },
          401: {
            description: "Chưa đăng nhập"
          }
        }
      }
    },
    "/api/v1/permissions/{code}": {
      get: {
        summary: "Lấy chi tiết mã quyền theo code (Yêu cầu đăng nhập)",
        tags: ["Permissions"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "code", in: "path", required: true, schema: { type: "string" }, description: "Mã quyền cần xem" }
        ],
        responses: {
          200: {
            description: "Lấy chi tiết thành công"
          },
          404: {
            description: "Không tìm thấy mã quyền"
          }
        }
      },
      patch: {
        summary: "Cập nhật thông tin mã quyền (Chỉ dành cho Superadmin)",
        tags: ["Permissions"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "code", in: "path", required: true, schema: { type: "string" }, description: "Mã quyền cần cập nhật" }
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", example: "Quản trị CRM cập nhật" },
                  module: { type: "string", example: "crm" },
                  description: { type: "string", example: "Mô tả mới" }
                }
              }
            }
          }
        },
        responses: {
          200: {
            description: "Cập nhật thành công"
          },
          404: {
            description: "Không tìm thấy mã quyền"
          }
        }
      },
      delete: {
        summary: "Xóa mã quyền khỏi hệ thống (Chỉ dành cho Superadmin)",
        tags: ["Permissions"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "code", in: "path", required: true, schema: { type: "string" }, description: "Mã quyền cần xóa" }
        ],
        responses: {
          200: {
            description: "Xóa thành công"
          },
          404: {
            description: "Không tìm thấy mã quyền"
          }
        }
      }
    }
  }
};
