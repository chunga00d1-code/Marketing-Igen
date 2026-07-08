export const crudSwagger = {
  paths: {
    "/api/v1/crud/{modelName}": {
      get: {
        summary: "Lay danh sach tai nguyen",
        tags: ["Generic CRUD"],
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "modelName",
            in: "path",
            required: true,
            schema: {
              type: "string",
              enum: ["products", "categories", "crm-tickets", "marketing-contents", "social-integrations", "users"],
            },
          },
        ],
        responses: {
          200: { description: "Thanh cong" },
          401: { description: "Chua xac thuc" },
          500: { description: "Loi may chu" },
        },
      },
      post: {
        summary: "Tao moi tai nguyen",
        tags: ["Generic CRUD"],
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: "modelName",
            in: "path",
            required: true,
            schema: {
              type: "string",
              enum: ["products", "categories", "crm-tickets", "marketing-contents", "social-integrations", "users"],
            },
          },
        ],
        responses: {
          201: { description: "Tao moi thanh cong" },
          401: { description: "Chua xac thuc" },
          500: { description: "Loi may chu" },
        },
      },
    },
    "/api/v1/crud/{modelName}/{id}": {
      get: {
        summary: "Lay chi tiet tai nguyen theo ID",
        tags: ["Generic CRUD"],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: "Thanh cong" },
          401: { description: "Chua xac thuc" },
          404: { description: "Khong tim thay" },
          500: { description: "Loi may chu" },
        },
      },
      patch: {
        summary: "Cap nhat tai nguyen theo ID",
        tags: ["Generic CRUD"],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: "Cap nhat thanh cong" },
          401: { description: "Chua xac thuc" },
          404: { description: "Khong tim thay" },
          500: { description: "Loi may chu" },
        },
      },
      delete: {
        summary: "Xoa tai nguyen theo ID",
        tags: ["Generic CRUD"],
        security: [{ BearerAuth: [] }],
        responses: {
          200: { description: "Xoa thanh cong" },
          401: { description: "Chua xac thuc" },
          404: { description: "Khong tim thay" },
          500: { description: "Loi may chu" },
        },
      },
    },
  },
};
