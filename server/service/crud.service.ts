/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import { ProductModel } from "../model/product.model";
import { CategoryModel } from "../model/category.model";
import { CRMTicketModel } from "../model/crm-ticket.model";
import { MarketingContentModel } from "../model/marketing-content.model";
import { UserModel } from "../model/user.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { SupportedModelName, ICRUDQueryOptions } from "../interface/crud.interface";
import mongoose from "mongoose";
import { facebookPostService } from "./facebook-post.service";
import { zaloMessengerService } from "./zalo-messenger.service";
import { telegramService } from "./telegram.service";

const DEMO_VIDEO_URL_PATTERNS = [
  "w3schools.com/html/mov_bbb.mp4",
  "example.com/video.mp4",
  "example.com/videos/",
];

function stripDemoVideoUrl(videoUrl?: string | null) {
  const value = String(videoUrl || "").trim();
  if (!value) return videoUrl;
  const normalized = value.toLowerCase();
  return DEMO_VIDEO_URL_PATTERNS.some((pattern) => normalized.includes(pattern)) ? "" : videoUrl;
}

function sanitizeMarketingPayload(modelName: string, payload: any) {
  if (modelName !== "marketing-contents" || !payload || typeof payload !== "object") {
    return payload;
  }
  if (!Object.prototype.hasOwnProperty.call(payload, "videoUrl")) {
    return payload;
  }
  return {
    ...payload,
    videoUrl: stripDemoVideoUrl(payload.videoUrl),
  };
}

function sanitizeCatalogPayload(modelName: string, payload: any) {
  if (!payload || typeof payload !== "object") {
    return payload;
  }

  if (modelName === "products") {
    return {
      ...payload,
      sku: typeof payload.sku === "string" ? payload.sku.trim().toUpperCase() : payload.sku,
      name: typeof payload.name === "string" ? payload.name.trim() : payload.name,
      category: typeof payload.category === "string" ? payload.category.trim() : payload.category,
      brand: typeof payload.brand === "string" ? payload.brand.trim() : payload.brand ?? "",
      unit: typeof payload.unit === "string" ? payload.unit.trim() : payload.unit,
      description: typeof payload.description === "string" ? payload.description.trim() : payload.description ?? "",
      imageUrl: typeof payload.imageUrl === "string" ? payload.imageUrl.trim() : payload.imageUrl ?? "",
    };
  }

  if (modelName === "categories") {
    return {
      ...payload,
      name: typeof payload.name === "string" ? payload.name.trim() : payload.name,
      code: typeof payload.code === "string" ? payload.code.trim().toUpperCase() : payload.code,
      description: typeof payload.description === "string" ? payload.description.trim() : payload.description,
    };
  }

  return payload;
}

function sanitizeCatalogResult(modelName: string, item: any) {
  if (!item) {
    return item;
  }

  const plainItem = typeof item.toObject === "function" ? item.toObject() : item;

  if (modelName === "products") {
    return {
      ...plainItem,
      sku: typeof plainItem.sku === "string" ? plainItem.sku.trim().toUpperCase() : plainItem.sku,
      name: typeof plainItem.name === "string" ? plainItem.name.trim() : plainItem.name,
      category: typeof plainItem.category === "string" ? plainItem.category.trim() : plainItem.category,
      brand: typeof plainItem.brand === "string" ? plainItem.brand.trim() : "",
      unit: typeof plainItem.unit === "string" ? plainItem.unit.trim() : plainItem.unit,
      description: typeof plainItem.description === "string" ? plainItem.description.trim() : "",
      imageUrl: typeof plainItem.imageUrl === "string" ? plainItem.imageUrl.trim() : "",
    };
  }

  if (modelName === "categories") {
    return {
      ...plainItem,
      name: typeof plainItem.name === "string" ? plainItem.name.trim() : plainItem.name,
      code: typeof plainItem.code === "string" ? plainItem.code.trim().toUpperCase() : plainItem.code,
      description: typeof plainItem.description === "string" ? plainItem.description.trim() : "",
      colorClass: typeof plainItem.colorClass === "string" ? plainItem.colorClass.trim() : "bg-blue-50 text-blue-700 border-blue-100",
      status: typeof plainItem.status === "string" ? plainItem.status.trim() : "Äang dÃ¹ng",
    };
  }

  return plainItem;
}

function sanitizeMarketingResult(modelName: string, item: any) {
  if (modelName !== "marketing-contents" || !item) {
    return item;
  }
  const plainItem = typeof item.toObject === "function" ? item.toObject() : item;
  return sanitizeMarketingPayload(modelName, plainItem);
}

function sanitizeCrudResult(modelName: string, item: any) {
  const catalogItem = sanitizeCatalogResult(modelName, item);
  return sanitizeMarketingResult(modelName, catalogItem);
}

async function handlePendingVideoUrl(item: any, modelName: string) {
  if (modelName === "marketing-contents" && item && item.videoUrl && item.videoUrl.startsWith("pending://piapi/")) {
    const taskId = item.videoUrl.replace("pending://piapi/", "");
    try {
      const { AIMediaModel } = require("../model/ai-media.model");
      const { geminiService } = require("./gemini.service");

      const existingRecord = await AIMediaModel.findOne({ url: item.videoUrl });
      if (!existingRecord) {
        const record = await AIMediaModel.create({
          userId: item.authorUid,
          mediaType: "video",
          url: item.videoUrl,
          prompt: item.mediaPrompt || item.title,
          metadata: {
            status: "processing",
            progress: 10,
            provider: "piapi",
            title: `Video Auto-pilot: ${item.title}`,
            description: `Äang káº¿t xuáº¥t video tá»± Ä‘á»™ng báº±ng PiAPI.`,
            aspectRatio: "16:9",
            activeCardId: item._id.toString(),
          },
        });

        geminiService.pollPiAPIVideoStatusBackground(record._id.toString(), taskId, item.authorUid);
      }
    } catch (err) {
      console.error("[crudService] Failed to register pending video poll:", err);
    }
  }
}

async function validateSocialIntegrationPayload(payload: any) {
  if (!payload || typeof payload !== "object" || payload.isConnected === false || payload.isMock === true) {
    return;
  }

  const platform = String(payload.platform || "").trim();
  const username = String(payload.username || "").trim();
  const accessToken = String(payload.accessToken || "").trim();

  if (accessToken.startsWith("mock_") || accessToken === "EAA...") {
    return;
  }

  if (platform === "Facebook") {
    if (!username || !accessToken) {
      throw new Error("Facebook company integration yeu cau Page ID va Page Access Token.");
    }
    await facebookPostService.validateToken(username, accessToken);
    return;
  }

  if (platform === "Zalo") {
    if (!username || !accessToken) {
      throw new Error("Zalo company integration yeu cau OA ID va Access Token.");
    }
    await zaloMessengerService.validateIntegrationToken({
      oaId: username,
      oaName: payload.displayName,
      accessToken,
    });
  }
}

const MODEL_MAPPING: Record<SupportedModelName, mongoose.Model<any>> = {
  products: ProductModel,
  categories: CategoryModel,
  "crm-tickets": CRMTicketModel,
  "marketing-contents": MarketingContentModel,
  "social-integrations": SocialIntegrationModel,
  users: UserModel,
};

export const crudService = {
  async getList(modelName: SupportedModelName, companyCode: string, options: ICRUDQueryOptions, userRole: string) {
    const model = MODEL_MAPPING[modelName];
    if (!model) {
      throw new Error(`Model '${modelName}' khong duoc ho tro.`);
    }

    const query: any = {};
    if (options.filters) {
      Object.assign(query, options.filters);
    }

    if (userRole !== "superadmin" || (companyCode && companyCode !== "SYSTEM")) {
      query.companyCode = companyCode;
    }

    if (options.search) {
      const searchRegex = new RegExp(options.search, "i");
      query.$or = [{ name: searchRegex }, { title: searchRegex }, { customerName: searchRegex }, { sku: searchRegex }];
    }

    const page = options.page || 1;
    const limit = options.limit || 1000;
    const skip = (page - 1) * limit;
    const sort = options.sort || "-_id";

    const items = await model.find(query).sort(sort).skip(skip).limit(limit).lean();
    const total = await model.countDocuments(query);

    return {
      items: items.map((item) => sanitizeCrudResult(modelName, item)),
      total,
      page,
      limit,
    };
  },

  async getById(modelName: SupportedModelName, id: string, companyCode: string, userRole: string) {
    const model = MODEL_MAPPING[modelName];
    if (!model) {
      throw new Error(`Model '${modelName}' khong duoc ho tro.`);
    }

    const query: any = { _id: id };
    if (userRole !== "superadmin" || (companyCode && companyCode !== "SYSTEM")) {
      query.companyCode = companyCode;
    }

    const item = await model.findOne(query).lean();
    if (!item) {
      throw new Error("Khong tim thay tai nguyen hoac ban khong co quyen truy cap.");
    }
    return sanitizeCrudResult(modelName, item);
  },

  async create(modelName: SupportedModelName, data: any, companyCode: string) {
    const model = MODEL_MAPPING[modelName];
    if (!model) {
      throw new Error(`Model '${modelName}' khong duoc ho tro.`);
    }

    const payload = sanitizeMarketingPayload(modelName, {
      ...sanitizeCatalogPayload(modelName, data),
      companyCode,
    });

    if (modelName === "users") {
      delete payload.role;
      delete payload.permissions;
    }

    if (modelName === "social-integrations") {
      await validateSocialIntegrationPayload(payload);
    }

    const newItem = new model(payload);
    await newItem.save();

    if (modelName === "crm-tickets" && newItem.status === "won") {
      telegramService.sendLeadWonNotification(newItem).catch((err) => {
        console.error("[crudService.create] Error sending Telegram notification:", err);
      });
    }

    if (modelName === "products" && newItem) {
      const stock = Number(newItem.stock || 0);
      const minStockAlert = Number(newItem.minStockAlert || 15);
      if (stock <= minStockAlert) {
        telegramService.sendLowStockAlert(newItem).catch((err) => {
          console.error("[crudService.create] Error sending low stock alert:", err);
        });
      }
    }

    handlePendingVideoUrl(newItem, modelName).catch((err) => {
      console.error("[crudService.create] error in handlePendingVideoUrl:", err);
    });

    return sanitizeCrudResult(modelName, newItem);
  },

  async update(modelName: SupportedModelName, id: string, data: any, companyCode: string, userRole: string) {
    const model = MODEL_MAPPING[modelName];
    if (!model) {
      throw new Error(`Model '${modelName}' khong duoc ho tro.`);
    }

    const query: any = { _id: id };
    if (userRole !== "superadmin" || (companyCode && companyCode !== "SYSTEM")) {
      query.companyCode = companyCode;
    }

    const { companyCode: _cCode, _id: _itemId, id: _plainId, ...rawUpdatePayload } = data;
    let updatePayload = sanitizeMarketingPayload(modelName, sanitizeCatalogPayload(modelName, rawUpdatePayload));

    if (modelName === "users") {
      updatePayload = { ...updatePayload };
      delete updatePayload.role;
      delete updatePayload.permissions;
      delete updatePayload.password;
    }

    if (modelName === "social-integrations") {
      const existingItem = await model.findOne(query).lean();
      if (!existingItem) {
        throw new Error("Khong tim thay tai nguyen hoac ban khong co quyen chinh sua.");
      }
      await validateSocialIntegrationPayload({
        ...existingItem,
        ...updatePayload,
      });
    }

    let oldStatus = "";
    if (modelName === "crm-tickets" && updatePayload.status === "won") {
      const oldItem = await model.findOne(query).select("status").lean();
      if (oldItem) {
        oldStatus = oldItem.status;
      }
    }

    const updatedItem = await model.findOneAndUpdate(query, updatePayload, { new: true });
    if (!updatedItem) {
      throw new Error("Khong tim thay tai nguyen hoac ban khong co quyen chinh sua.");
    }

    if (modelName === "crm-tickets" && updatePayload.status === "won" && oldStatus !== "won") {
      telegramService.sendLeadWonNotification(updatedItem).catch((err) => {
        console.error("[crudService.update] Error sending Telegram notification:", err);
      });
    }

    if (modelName === "products" && updatedItem) {
      const stock = Number(updatedItem.stock || 0);
      const minStockAlert = Number(updatedItem.minStockAlert || 15);
      if (stock <= minStockAlert) {
        telegramService.sendLowStockAlert(updatedItem).catch((err) => {
          console.error("[crudService.update] Error sending low stock alert:", err);
        });
      }
    }

    handlePendingVideoUrl(updatedItem, modelName).catch((err) => {
      console.error("[crudService.update] error in handlePendingVideoUrl:", err);
    });

    return sanitizeCrudResult(modelName, updatedItem);
  },

  async delete(modelName: SupportedModelName, id: string, companyCode: string, userRole: string) {
    const model = MODEL_MAPPING[modelName];
    if (!model) {
      throw new Error(`Model '${modelName}' khong duoc ho tro.`);
    }

    const query: any = { _id: id };
    if (userRole !== "superadmin" || (companyCode && companyCode !== "SYSTEM")) {
      query.companyCode = companyCode;
    }

    const deletedItem = await model.findOneAndDelete(query);
    if (!deletedItem) {
      throw new Error("Khong tim thay tai nguyen hoac ban khong co quyen xoa.");
    }
    return deletedItem;
  },
};
