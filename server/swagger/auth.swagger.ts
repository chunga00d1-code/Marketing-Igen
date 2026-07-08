export const authSwagger = {
  paths: {
    "/api/v1/auth/register": {
      post: {
        summary: "Đăng ký tài khoản người dùng mới",
        tags: ["Xác thực (Auth)"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", example: "test@igen.com" },
                  password: { type: "string", example: "123456" },
                  displayName: { type: "string", example: "Nguyễn Văn A" },
                  photoURL: { type: "string", example: "https://example.com/avatar.jpg" },
                  role: { type: "string", enum: ["user", "manager", "admin", "superadmin"], example: "user" },
                  companyCode: { type: "string", example: "COMPA" },
                  companyName: { type: "string", example: "Công ty A" },
                  jobTitle: { type: "string", example: "Nhân viên" },
                  department: { type: "string", example: "Nhân sự" },
                  phone: { type: "string", example: "0987654321" },
                },
                required: ["email", "password", "displayName"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Đăng ký thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Đăng ký tài khoản thành công" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
          400: {
            description: "Dữ liệu yêu cầu không hợp lệ hoặc email đã được sử dụng",
          },
        },
      },
    },
    "/api/v1/auth/login": {
      post: {
        summary: "Đăng nhập hệ thống",
        tags: ["Xác thực (Auth)"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string", example: "test@igen.com" },
                  password: { type: "string", example: "123456" },
                },
                required: ["email", "password"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Đăng nhập thành công. Trả về Access Token ở body và lưu Refresh Token vào HTTPOnly Cookie",
            headers: {
              "Set-Cookie": {
                schema: {
                  type: "string",
                  example: "refreshToken=abc...; Path=/; HttpOnly; Max-Age=604800",
                },
              },
            },
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
                    user: { type: "object" },
                  },
                },
              },
            },
          },
          401: {
            description: "Email hoặc mật khẩu không chính xác",
          },
        },
      },
    },
    "/api/v1/auth/refresh-token": {
      post: {
        summary: "Làm mới JWT Access Token",
        tags: ["Xác thực (Auth)"],
        responses: {
          200: {
            description: "Làm mới Access Token thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
                  },
                },
              },
            },
          },
          400: {
            description: "Thiếu Refresh Token",
          },
          401: {
            description: "Mã làm mới không hợp lệ hoặc đã hết hạn",
          },
        },
      },
    },
    "/api/v1/auth/logout": {
      post: {
        summary: "Đăng xuất tài khoản (Xóa Refresh Token Cookie)",
        tags: ["Xác thực (Auth)"],
        responses: {
          200: {
            description: "Đăng xuất thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Đăng xuất tài khoản thành công" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/v1/auth/me": {
      get: {
        summary: "Lấy thông tin tài khoản đang đăng nhập",
        tags: ["Xác thực (Auth)"],
        security: [
          {
            BearerAuth: [],
          },
        ],
        responses: {
          200: {
            description: "Lấy thông tin tài khoản thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    user: { type: "object" },
                  },
                },
              },
            },
          },
          401: {
            description: "Mã xác thực không hợp lệ hoặc đã hết hạn",
          },
        },
      },
    },
    "/api/v1/auth/register-company": {
      post: {
        summary: "Đăng ký doanh nghiệp và tài khoản Admin mặc định (Superadmin only)",
        tags: ["Xác thực (Auth)"],
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  companyName: { type: "string", example: "Tập đoàn ABC" },
                  companyCode: { type: "string", example: "ABC" },
                  ownerName: { type: "string", example: "Nguyễn Văn Admin" },
                  ownerEmail: { type: "string", example: "admin@abc.com" },
                  ownerPassword: { type: "string", example: "123456" },
                },
                required: ["companyName", "companyCode", "ownerName", "ownerEmail", "ownerPassword"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Đăng ký doanh nghiệp thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Đăng ký doanh nghiệp và tài khoản Admin thành công" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
          400: {
            description: "Mã doanh nghiệp hoặc Email đã được sử dụng",
          },
          403: {
            description: "Bạn không có quyền truy cập tài nguyên này (Yêu cầu vai trò superadmin)",
          },
        },
      },
    },
    "/api/v1/auth/register-user": {
      post: {
        summary: "Đăng ký thành viên mới của doanh nghiệp (Superadmin/Admin only)",
        tags: ["Xác thực (Auth)"],
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  displayName: { type: "string", example: "Nguyễn Văn Nhân Viên" },
                  email: { type: "string", example: "staff@abc.com" },
                  password: { type: "string", example: "123456" },
                  role: { type: "string", enum: ["user", "manager", "admin"], example: "user" },
                  companyCode: { type: "string", example: "ABC" },
                  companyName: { type: "string", example: "Tập đoàn ABC" },
                  parentId: { type: "string", example: "admin_user_id" },
                  level: { type: "integer", example: 4 },
                  department: { type: "string", example: "Nhân sự" },
                  division: { type: "string", example: "Nhân sự" },
                  phone: { type: "string", example: "0987654321" },
                },
                required: ["displayName", "email", "password", "role"],
              },
            },
          },
        },
        responses: {
          201: {
            description: "Đăng ký thành viên thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Đăng ký thành viên doanh nghiệp thành công" },
                    data: { type: "object" },
                  },
                },
              },
            },
          },
          400: {
            description: "Mã doanh nghiệp hoặc Email đã được sử dụng",
          },
          403: {
            description: "Bạn không có quyền truy cập tài nguyên này (Yêu cầu vai trò superadmin hoặc admin)",
          },
        },
      },
    },
    "/api/v1/auth/users/bulk": {
      patch: {
        summary: "Cập nhật hàng loạt cấu trúc/thành viên (kéo thả sơ đồ tổ chức)",
        tags: ["Xác thực (Auth)"],
        security: [
          {
            BearerAuth: [],
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  updates: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", example: "6472f85fa32490bb4ca15f8e" },
                        parentId: { type: "string", nullable: true, example: "6472f85fa32490bb4ca15f8d" },
                        level: { type: "integer", example: 2 },
                        role: { type: "string", example: "user" },
                        department: { type: "string", example: "Phòng Kho Vận" },
                        division: { type: "string", example: "Khối Vận Hành" },
                        jobTitle: { type: "string", example: "Chuyên viên Vận chuyển" },
                      },
                      required: ["id"],
                    },
                  },
                },
                required: ["updates"],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Cập nhật thành công",
          },
          400: {
            description: "Lỗi định dạng đầu vào hoặc thiếu quyền hạn",
          },
        },
      },
    },
    "/api/v1/auth/users/{id}": {
      patch: {
        summary: "Cập nhật thông tin/vai trò chi tiết một thành viên",
        tags: ["Xác thực (Auth)"],
        security: [
          {
            BearerAuth: [],
          },
        ],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "ID người dùng (ObjectId)",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  role: { type: "string", enum: ["user", "manager", "admin", "superadmin"] },
                  parentId: { type: "string", nullable: true },
                  level: { type: "integer" },
                  department: { type: "string" },
                  division: { type: "string" },
                  jobTitle: { type: "string" },
                  displayName: { type: "string" },
                  phone: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Cập nhật thành công",
          },
          400: {
            description: "Lỗi định dạng đầu vào hoặc thiếu quyền hạn",
          },
        },
      },
      delete: {
        summary: "Xóa thành viên và tự động tái sắp xếp cấp dưới",
        tags: ["Xác thực (Auth)"],
        security: [
          {
            BearerAuth: [],
          },
        ],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "ID người dùng cần xóa",
          },
        ],
        responses: {
          200: {
            description: "Xóa thành công",
          },
          400: {
            description: "Lỗi hoặc thiếu quyền hạn",
          },
        },
      },
    },
  },
};
