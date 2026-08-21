import { model, Schema, type Types } from "mongoose";
import type {
  RealEstateMapBranding,
  RealEstateMapCoordinate,
  RealEstateMapPoi,
  RealEstateMapRoute,
  RealEstateMapScenePreset,
  RealEstateMapVideoSpec,
} from "../interface/real-estate-map-video.interface";

export type RealEstateMapVideoDraftDocument = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  companyCode: string;
  name: string;
  address: string;
  location: RealEstateMapCoordinate;
  boundary: number[][];
  pois: RealEstateMapPoi[];
  routes: RealEstateMapRoute[];
  branding?: RealEstateMapBranding;
  templatePreset?: RealEstateMapScenePreset | "all";
  videoSpec: RealEstateMapVideoSpec;
  createdAt: Date;
  updatedAt: Date;
};

const CoordinateSubSchema = new Schema(
  {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
  },
  { _id: false }
);

const PoiSubSchema = new Schema(
  {
    id: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: "other" },
    location: { type: CoordinateSubSchema, required: true },
    distanceMeters: { type: Number, default: 0 },
    durationMinutes: { type: Number, default: 0 },
    sourceRef: { type: String, default: "" },
    confirmedByUser: { type: Boolean, default: true },
  },
  { _id: false }
);

const RouteSubSchema = new Schema(
  {
    id: { type: String, required: true },
    fromId: { type: String, required: true },
    toId: { type: String, required: true },
    toName: { type: String, trim: true },
    geometry: {
      type: { type: String, enum: ["LineString"], default: "LineString" },
      coordinates: { type: [[Number]], default: [] },
    },
    distanceMeters: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    sourceRef: { type: String, default: "" },
    confirmedByUser: { type: Boolean, default: true },
  },
  { _id: false }
);

const BrandingSubSchema = new Schema(
  {
    logoUrl: { type: String, trim: true },
    ctaText: { type: String, trim: true, maxlength: 120 },
    hotline: { type: String, trim: true, maxlength: 50 },
    brandColor: { type: String, trim: true, maxlength: 20 },
  },
  { _id: false }
);

const VideoSpecSubSchema = new Schema(
  {
    aspectRatio: { type: String, enum: ["9:16", "16:9", "1:1"], default: "9:16" },
    resolution: { type: String, enum: ["720p", "1080p"], default: "1080p" },
    durationSeconds: { type: Number, min: 15, max: 60, default: 24 },
  },
  { _id: false }
);

const DraftSchema = new Schema<RealEstateMapVideoDraftDocument>(
  {
    userId: { type: Schema.Types.ObjectId, required: true, index: true },
    companyCode: { type: String, required: true, index: true },
    name: { type: String, trim: true, maxlength: 180, default: "" },
    address: { type: String, trim: true, maxlength: 300, default: "" },
    location: { type: CoordinateSubSchema, required: true },
    boundary: { type: [[Number]], default: [] },
    pois: { type: [PoiSubSchema], default: [] },
    routes: { type: [RouteSubSchema], default: [] },
    branding: { type: BrandingSubSchema, default: () => ({}) },
    templatePreset: { type: String, default: "zoom-to-project" },
    videoSpec: { type: VideoSpecSubSchema, default: () => ({ aspectRatio: "9:16", resolution: "1080p", durationSeconds: 24 }) },
  },
  { timestamps: true }
);

DraftSchema.index({ userId: 1, companyCode: 1 }, { unique: true });

export const RealEstateMapVideoDraftModel = model<RealEstateMapVideoDraftDocument>(
  "RealEstateMapVideoDraft",
  DraftSchema
);
