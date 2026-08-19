import { model, Schema } from "mongoose";
import { IBulkTemplate } from "../interface/bulk-create.interface";

const BulkLayerSchema = new Schema(
  {
    id: { type: String, required: true },
    type: { type: String, enum: ["text", "image"], required: true },
    layerKind: {
      type: String,
      enum: ["text", "shape", "badge", "cta", "icon"],
      default: undefined,
    },
    groupId: { type: String, maxlength: 100 },
    fieldName: { type: String, required: true },
    x: { type: Number, required: true, min: -50, max: 150 },
    y: { type: Number, required: true, min: -50, max: 150 },
    width: { type: Number, required: true, min: 0.1, max: 300 },
    height: { type: Number, required: true, min: 0.1, max: 300 },
    rotation: { type: Number, default: 0, min: -360, max: 360 },
    zIndex: { type: Number, default: 0 },
    locked: { type: Boolean, default: false },
    fit: { type: String, enum: ["cover", "contain"], default: "contain" },
    fontSize: { type: Number, min: 8, max: 300 },
    fontFamily: { type: String, default: "Arial" },
    fontWeight: { type: Number, min: 100, max: 900, default: 700 },
    fontStyle: { type: String, enum: ["normal", "italic"], default: "normal" },
    color: { type: String, default: "#ffffff" },
    textAlign: { type: String, enum: ["left", "center", "right"], default: "left" },
    textDecoration: { type: String, enum: ["none", "underline", "line-through"], default: "none" },
    textTransform: { type: String, enum: ["none", "uppercase", "lowercase", "capitalize"], default: "none" },
    letterSpacing: { type: Number, min: -5, max: 30, default: 0 },
    lineHeight: { type: Number, min: 0.8, max: 3, default: 1.22 },
    autoFit: { type: Boolean, default: true },
    minFontSize: { type: Number, min: 8, max: 300, default: 12 },
    maxLines: { type: Number, min: 1, max: 20 },
    fillColor: { type: String },
    borderColor: { type: String },
    borderWidth: { type: Number, min: 0, max: 100, default: 0 },
    borderRadius: { type: Number, min: 0, max: 9999, default: 0 },
    opacity: { type: Number, min: 0.01, max: 1, default: 1 },
    padding: { type: Number, min: 0, max: 500, default: 0 },
    defaultValue: { type: String, default: "" },
    dataBinding: {
      type: new Schema(
        {
          columnKey: { type: String, required: true },
          columnLabel: { type: String, required: true },
        },
        { _id: false }
      ),
      default: undefined,
    },
  },
  { _id: false }
);

const BulkTemplateSchema = new Schema<IBulkTemplate>(
  {
    sceneVersion: { type: Number, min: 1, default: 1 },
    companyCode: { type: String, required: true, index: true },
    createdBy: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    canvas: {
      width: { type: Number, required: true, min: 320, max: 4096 },
      height: { type: Number, required: true, min: 320, max: 4096 },
    },
    background: {
      type: { type: String, enum: ["color", "gradient", "image"], required: true },
      color: { type: String },
      colors: { type: [String], default: [] },
      imageUrl: { type: String },
    },
    layers: { type: [BulkLayerSchema], default: [] },
    thumbnailUrl: { type: String },
    visibility: { type: String, enum: ["private", "public"], default: "private", index: true },
    publishedAt: { type: Date },
    useCount: { type: Number, default: 0, min: 0 },
    version: { type: Number, default: 1, min: 1 },
    status: { type: String, enum: ["active", "archived"], default: "active", index: true },
  },
  { timestamps: true }
);

BulkTemplateSchema.index({ companyCode: 1, status: 1, updatedAt: -1 });
BulkTemplateSchema.index({ companyCode: 1, name: 1 });
BulkTemplateSchema.index({ visibility: 1, status: 1, publishedAt: -1 });

export const BulkTemplateModel = model<IBulkTemplate>("BulkTemplate", BulkTemplateSchema);
