import Joi from "joi";

const coordinateSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
});

const poiSchema = Joi.object({
  id: Joi.string().required(),
  name: Joi.string().trim().max(180).required(),
  category: Joi.string().trim().max(50).default("other"),
  location: coordinateSchema.required(),
  distanceMeters: Joi.number().min(0).optional(),
  durationMinutes: Joi.number().min(0).optional(),
  sourceRef: Joi.string().allow("").optional(),
  confirmedByUser: Joi.boolean().default(true),
});

const routeSchema = Joi.object({
  id: Joi.string().required(),
  fromId: Joi.string().required(),
  toId: Joi.string().required(),
  toName: Joi.string().trim().max(180).allow("").optional(),
  geometry: Joi.object({
    type: Joi.string().valid("LineString").required(),
    coordinates: Joi.array().items(Joi.array().items(Joi.number()).length(2)).min(2).max(1000).required(),
  }).required(),
  distanceMeters: Joi.number().min(0).required(),
  durationSeconds: Joi.number().min(0).required(),
  sourceRef: Joi.string().allow("").optional(),
  confirmedByUser: Joi.boolean().default(true),
});

const brandingSchema = Joi.object({
  logoUrl: Joi.string().uri().allow("").optional(),
  ctaText: Joi.string().trim().max(120).allow("").optional(),
  hotline: Joi.string().trim().max(50).allow("").optional(),
  brandColor: Joi.string().trim().max(20).allow("").optional(),
});

const videoSpecSchema = Joi.object({
  aspectRatio: Joi.string().valid("9:16", "16:9", "1:1").default("9:16"),
  resolution: Joi.string().valid("720p", "1080p").default("1080p"),
  durationSeconds: Joi.number().min(15).max(60).default(24),
});

const vfxConfigSchema = Joi.object({
  boundaryTheme: Joi.string().valid("cyan-neon", "gold-luxury", "emerald", "ruby").optional(),
  boundaryGlowIntensity: Joi.number().min(1).max(10).optional(),
  boundaryLedSpeed: Joi.number().min(1).max(10).optional(),
  showRadiusPulse: Joi.boolean().optional(),
  radiusMeters: Joi.number().min(100).max(50000).optional(),
  showAnimatedRoutes: Joi.boolean().optional(),
  cameraTrajectory: Joi.string().valid("cinematic-flyin-orbit", "dynamic-tilt", "smooth-glide").optional(),
  show3DBillboards: Joi.boolean().optional(),
});

export const saveRealEstateMapVideoDraftBodySchema = Joi.object({
  name: Joi.string().trim().max(180).allow("").required(),
  address: Joi.string().trim().max(300).allow("").optional(),
  location: coordinateSchema.required(),
  boundary: Joi.array().items(Joi.array().items(Joi.number()).length(2)).min(0).max(500).required(),
  pois: Joi.array().items(poiSchema).max(10).optional(),
  routes: Joi.array().items(routeSchema).max(5).optional(),
  branding: brandingSchema.optional(),
  vfxConfig: vfxConfigSchema.optional(),
  templatePreset: Joi.string().valid("zoom-to-project", "project-boundary", "route-follow", "all").optional(),
  videoSpec: videoSpecSchema.optional(),
});

export const geocodeBodySchema = Joi.object({
  query: Joi.string().trim().min(2).max(300).required(),
});

export const reverseGeocodeBodySchema = Joi.object({
  location: coordinateSchema.required(),
});

export const searchPlacesBodySchema = Joi.object({
  location: coordinateSchema.required(),
  radiusMeters: Joi.number().min(100).max(20000).default(5000),
  category: Joi.string().trim().max(50).optional(),
  limit: Joi.number().min(1).max(10).default(5),
});

export const getRouteBodySchema = Joi.object({
  from: coordinateSchema.required(),
  to: coordinateSchema.required(),
  fromId: Joi.string().optional(),
  toId: Joi.string().optional(),
  toName: Joi.string().optional(),
});

export const createRenderBodySchema = Joi.object({
  idempotencyKey: Joi.string().trim().max(120).optional(),
  draftId: Joi.string().optional(),
  snapshot: Joi.object().optional(),
});

export const listRendersQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  pageSize: Joi.number().integer().min(1).max(50).default(10),
  status: Joi.string().valid("all", "queued", "preparing", "rendering", "muxing", "uploading", "verifying", "completed", "failed").default("all"),
});
