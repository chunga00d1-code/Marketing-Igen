import { Router } from "express";
import { realEstateMapVideoController } from "../controller/real-estate-map-video.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validation";
import {
  createRenderBodySchema,
  geocodeBodySchema,
  getRouteBodySchema,
  listRendersQuerySchema,
  reverseGeocodeBodySchema,
  saveRealEstateMapVideoDraftBodySchema,
  searchPlacesBodySchema,
} from "./real-estate-map-video.schemas";

export const realEstateMapVideoRouter = Router();

realEstateMapVideoRouter.get(
  "/real-estate-map-video/draft",
  requireAuth as never,
  realEstateMapVideoController.getDraft as never
);

realEstateMapVideoRouter.put(
  "/real-estate-map-video/draft",
  requireAuth as never,
  validateRequest({ body: saveRealEstateMapVideoDraftBodySchema }),
  realEstateMapVideoController.saveDraft as never
);

realEstateMapVideoRouter.post(
  "/real-estate-map-video/geocode",
  requireAuth as never,
  validateRequest({ body: geocodeBodySchema }),
  realEstateMapVideoController.geocode as never
);

realEstateMapVideoRouter.post(
  "/real-estate-map-video/reverse-geocode",
  requireAuth as never,
  validateRequest({ body: reverseGeocodeBodySchema }),
  realEstateMapVideoController.reverseGeocode as never
);

realEstateMapVideoRouter.post(
  "/real-estate-map-video/places",
  requireAuth as never,
  validateRequest({ body: searchPlacesBodySchema }),
  realEstateMapVideoController.searchPlaces as never
);

realEstateMapVideoRouter.post(
  "/real-estate-map-video/routes",
  requireAuth as never,
  validateRequest({ body: getRouteBodySchema }),
  realEstateMapVideoController.getRoute as never
);

realEstateMapVideoRouter.post(
  "/real-estate-map-video/scene-snapshot",
  requireAuth as never,
  realEstateMapVideoController.createSceneSnapshot as never
);

realEstateMapVideoRouter.post(
  "/real-estate-map-video/renders",
  requireAuth as never,
  validateRequest({ body: createRenderBodySchema }),
  realEstateMapVideoController.createRender as never
);

realEstateMapVideoRouter.get(
  "/real-estate-map-video/renders",
  requireAuth as never,
  validateRequest({ query: listRendersQuerySchema }),
  realEstateMapVideoController.listRenders as never
);

realEstateMapVideoRouter.get(
  "/real-estate-map-video/renders/:renderId",
  requireAuth as never,
  realEstateMapVideoController.getRender as never
);

realEstateMapVideoRouter.post(
  "/real-estate-map-video/renders/:renderId/retry",
  requireAuth as never,
  realEstateMapVideoController.retryRender as never
);
