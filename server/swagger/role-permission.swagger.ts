export const rolePermissionSwagger = {
  paths: {
    "/api/v1/role-permissions": {
      post: {
        summary: "Thiết lập/Cập nhật phân quyền cho Role (Dành cho Superadmin hoặc Admin)",
        tags: ["Role Permissions"],
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  companyCode: { type: "string", example: "COMPA", description: "Mã doanh nghiệp (Bắt buộc đối với Superadmin, Admin tự động dùng companyCode của mình)" },
                  role: { type: "string", enum: ["admin", "manager", "user"], example: "manager", description: "Vai trò cần gán quyền" },
                  permissions: {
                    type: "array",
                    items: { type: "string" },
                    example: ["crm:read", "crm:manage", "marketing:post"],
                    description: "Mảng danh sách các mã quyền gán cho vai trò này"
                  }
                },
                required: ["role", "permissions"]
              }
            }
          }
        },
        responses: {
          200: {
            description: "Cập nhật cấu hình phân quyền vai trò thành công"
          },
          400: {
            description: "Dữ liệu yêu cầu không hợp lệ"
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
        summary: "Lấy danh sách cấu hình phân quyền vai trò (Yêu cầu đăng nhập)",
        tags: ["Role Permissions"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", minimum: 1 }, description: "Số trang" },
          { name: "limit", in: "query", schema: { type: "integer", minimum: 1 }, description: "Số bản ghi trên trang" },
          { name: "role", in: "query", schema: { type: "string", enum: ["admin", "manager", "user"] }, description: "Lọc theo vai trò" },
          { name: "companyCode", in: "query", schema: { type: "string" }, description: "Lọc theo mã doanh nghiệp (Chỉ Superadmin mới lọc được doanh nghiệp khác, các vai trò khác mặc định lấy doanh nghiệp của mình)" }
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
    "/api/v1/role-permissions/{role}": {
      get: {
        summary: "Lấy chi tiết cấu hình phân quyền của vai trò (Yêu cầu đăng nhập)",
        tags: ["Role Permissions"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "role", in: "path", required: true, schema: { type: "string", enum: ["admin", "manager", "user"] }, description: "Vai trò cần xem" },
          { name: "companyCode", in: "query", schema: { type: "string" }, description: "Mã doanh nghiệp (Bắt buộc đối với Superadmin, các vai trò khác mặc định lấy doanh nghiệp của mình)" }
        ],
        responses: {
          200: {
            description: "Lấy chi tiết thành công"
          },
          404: {
            description: "Không tìm thấy cấu hình vai trò"
          }
        }
      },
      delete: {
        summary: "Xóa cấu hình phân quyền vai trò (Chỉ dành cho Superadmin hoặc Admin)",
        tags: ["Role Permissions"],
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: "role", in: "path", required: true, schema: { type: "string", enum: ["admin", "manager", "user"] }, description: "Vai trò cần xóa" },
          { name: "companyCode", in: "query", schema: { type: "string" }, description: "Mã doanh nghiệp (Bắt buộc đối với Superadmin, các vai trò khác mặc định lấy doanh nghiệp của mình)" }
        ],
        responses: {
          200: {
            description: "Xóa cấu hình thành công"
          },
          404: {
            description: "Không tìm thấy cấu hình vai trò"
          }
        }
      }
    }
  }
};
