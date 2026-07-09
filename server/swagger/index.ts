/* eslint-disable @typescript-eslint/no-explicit-any */
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
    title: "iGen Marketing Smart AI API Docs",
    version: "1.0.0",
    description: "TÃ i liá»‡u API Swagger cho cÃ¡c tÃ­nh nÄƒng AI Marketing vÃ  Chatbot CRM cá»§a iGen Marketing.",
  },
  servers: [
    {
      url: "http://localhost:3005",
      description: "CÆ¡ sá»Ÿ phá»¥c vá»¥ cá»¥c bá»™",
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
        description: "Äiá»n JWT Access Token vÃ o Ã´ dÆ°á»›i Ä‘Ã¢y dáº¡ng: eyJhbG...",
      },
    },
  },
};

export const swaggerRouter = Router();

// Phá»¥c vá»¥ tÃ i liá»‡u Swagger UI táº¡i Ä‘Æ°á»ng dáº«n /api-docs
swaggerRouter.use("/", swaggerUi.serve as any, swaggerUi.setup(swaggerDocument) as any);


