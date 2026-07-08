import { Router } from "express";
import swaggerUi from "swagger-ui-express";
import { geminiSwagger } from "./gemini.swagger";
import { facebookPostSwagger } from "./facebook-post.swagger";
import { tiktokSwagger } from "./tiktok.swagger";
import { schedulerSwagger } from "./scheduler.swagger";
import { mediaSwagger } from "./media.swagger";
import { authSwagger } from "./auth.swagger";
import { permissionSwagger } from "./permission.swagger";
import { rolePermissionSwagger } from "./role-permission.swagger";
import { crudSwagger } from "./crud.swagger";
import { opusclipSwagger } from "./opusclip.swagger";

const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "iGen ERP Smart AI API Docs",
    version: "1.0.0",
    description: "Tài liệu API Swagger cho các tính năng AI Marketing và Chatbot CRM của iGen ERP.",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Cơ sở phục vụ cục bộ",
    },
  ],
  paths: {
    ...geminiSwagger.paths,
    ...facebookPostSwagger.paths,
    ...tiktokSwagger.paths,
    ...schedulerSwagger.paths,
    ...mediaSwagger.paths,
    ...authSwagger.paths,
    ...permissionSwagger.paths,
    ...rolePermissionSwagger.paths,
    ...crudSwagger.paths,
    ...opusclipSwagger.paths,
  },
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Điền JWT Access Token vào ô dưới đây dạng: eyJhbG...",
      },
    },
  },
};

export const swaggerRouter = Router();

// Phục vụ tài liệu Swagger UI tại đường dẫn /api-docs
swaggerRouter.use("/", swaggerUi.serve as any, swaggerUi.setup(swaggerDocument) as any);
