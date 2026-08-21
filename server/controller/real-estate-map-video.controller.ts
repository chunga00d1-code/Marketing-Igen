import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth";
import { RealEstateMapVideoDraftModel, type RealEstateMapVideoDraftDocument } from "../model/real-estate-map-video-draft.model";
import { buildRealEstateMapProjectSnapshot, composeRealEstateMapSnapshot } from "../service/real-estate-map-video/map-scene-engine.service";
import { getMapProvider } from "../service/real-estate-map-video/provider";
import { realEstateMapVideoRenderService } from "../service/real-estate-map-video/real-estate-map-video-render.service";

function identity(req: AuthenticatedRequest) {
  if (!req.user?.id) throw new Error("Authentication required.");
  return {
    userId: req.user.id,
    companyCode: (req.user.companyCode || `personal:${req.user.id}`).toUpperCase(),
  };
}

function view(draft: Partial<RealEstateMapVideoDraftDocument> & { _id?: { toString(): string } }) {
  return {
    id: draft._id?.toString(),
    name: draft.name || "",
    address: draft.address || "",
    location: draft.location || { lat: 10.7769, lng: 106.7009 },
    boundary: draft.boundary || [],
    pois: draft.pois || [],
    routes: draft.routes || [],
    branding: draft.branding || {},
    templatePreset: draft.templatePreset || "zoom-to-project",
    videoSpec: draft.videoSpec || { aspectRatio: "9:16", resolution: "1080p", durationSeconds: 24 },
    updatedAt: draft.updatedAt,
  };
}

export const realEstateMapVideoController = {
  async getDraft(req: AuthenticatedRequest, res: Response) {
    const draft = await RealEstateMapVideoDraftModel.findOne(identity(req)).lean();
    return res.json({ status: "success", data: draft ? view(draft) : null });
  },

  async saveDraft(req: AuthenticatedRequest, res: Response) {
    const draft = await RealEstateMapVideoDraftModel.findOneAndUpdate(
      identity(req),
      { $set: req.body },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    return res.json({ status: "success", data: view(draft) });
  },

  async geocode(req: AuthenticatedRequest, res: Response) {
    try {
      const provider = getMapProvider();
      const results = await provider.geocode(req.body.query);
      return res.json({ status: "success", data: results });
    } catch (error) {
      return res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể tìm kiếm địa chỉ.",
      });
    }
  },

  async reverseGeocode(req: AuthenticatedRequest, res: Response) {
    try {
      const provider = getMapProvider();
      const result = await provider.reverseGeocode(req.body.location);
      return res.json({ status: "success", data: result });
    } catch (error) {
      return res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể xác định địa chỉ từ tọa độ.",
      });
    }
  },

  async searchPlaces(req: AuthenticatedRequest, res: Response) {
    try {
      const provider = getMapProvider();
      const pois = await provider.searchPlaces(req.body);
      return res.json({ status: "success", data: pois });
    } catch (error) {
      return res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể tìm tiện ích lân cận.",
      });
    }
  },

  async getRoute(req: AuthenticatedRequest, res: Response) {
    try {
      const provider = getMapProvider();
      const route = await provider.getRoute(req.body);
      return res.json({ status: "success", data: route });
    } catch (error) {
      return res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể tính lộ trình tuyến đường.",
      });
    }
  },

  async createSceneSnapshot(req: AuthenticatedRequest, res: Response) {
    let draft = await RealEstateMapVideoDraftModel.findOne(identity(req)).lean();
    if (!draft) {
      const created = await RealEstateMapVideoDraftModel.create({
        ...identity(req),
        name: "Khu đô thị Starlake Tây Hồ Tây",
        address: "Phường Xuân La, Quận Tây Hồ, TP. Hà Nội",
        location: { lat: 21.0558, lng: 105.7992 },
        boundary: [],
        pois: [],
        routes: [],
      });
      draft = created.toObject();
    }
    const snapshot = buildRealEstateMapProjectSnapshot(draft);
    const composition = composeRealEstateMapSnapshot(snapshot);

    return res.json({
      status: "success",
      data: {
        snapshot,
        composition,
      },
    });
  },

  async createRender(req: AuthenticatedRequest, res: Response) {
    try {
      const actor = identity(req);
      const render = await realEstateMapVideoRenderService.createRender(actor, req.body);
      return res.status(201).json({ status: "success", data: render });
    } catch (error) {
      return res.status(400).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể tạo tác vụ kết xuất video.",
      });
    }
  },

  async getRender(req: AuthenticatedRequest, res: Response) {
    try {
      const actor = identity(req);
      const render = await realEstateMapVideoRenderService.getRender(actor, req.params.renderId);
      return res.json({ status: "success", data: render });
    } catch (error) {
      return res.status(404).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không tìm thấy thông tin render.",
      });
    }
  },

  async listRenders(req: AuthenticatedRequest, res: Response) {
    try {
      const actor = identity(req);
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const result = await realEstateMapVideoRenderService.listRenders(actor, { page, pageSize, status });
      return res.json({
        status: "success",
        data: {
          items: result.items || [],
          total: result.total || 0,
          page: result.page || 1,
          totalPages: result.totalPages || 1,
        },
        pagination: { total: result.total, page: result.page, totalPages: result.totalPages },
      });
    } catch (error) {
      return res.status(500).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể lấy lịch sử render.",
      });
    }
  },

  async retryRender(req: AuthenticatedRequest, res: Response) {
    try {
      const actor = identity(req);
      const render = await realEstateMapVideoRenderService.retryRender(actor, req.params.renderId);
      return res.json({ status: "success", data: render });
    } catch (error) {
      return res.status(400).json({
        status: "error",
        message: error instanceof Error ? error.message : "Không thể thử lại render.",
      });
    }
  },
};
