/* eslint-disable @typescript-eslint/no-explicit-any */
import sharp from "sharp";
import { cloudinaryService } from "../cloudinary.service";
import { openrouterGenerateImage } from "../openrouter.service";
import { clampRegion, readImageBuffer } from "./core";
import type { NormalizedImageRegion } from "./types";

export class GeminiImageService {
  /**
   * Sinh ảnh AI bằng model Nano-Banana (PiAPI), Gemini Banana Pro (Google Imagen), hoặc Imagen 4
   */
  async generateImage(
    prompt: string,
    options?: {
      aspectRatio?: string;
      modelName?: string;
      resolution?: string;
      negativePrompt?: string;
      existingImageUris?: string[];
      referenceImageRoles?: Array<"source" | "supporting" | "annotation">;
    }
  ): Promise<{ url: string; isMock: boolean }> {
    if (!process.env.OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY chưa được cấu hình trong file .env.");
    }

    return this._generateImageWithOpenRouter(prompt, options);
  }

  /**
   * Tạo ảnh qua OpenRouter chat/completions + modalities: ["image","text"]
   * Ảnh được trả về trong message.images[0].image_url.url (field non-standard của OpenRouter)
   */
  async _generateImageWithOpenRouter(
    prompt: string,
    options?: {
      aspectRatio?: string;
      resolution?: string;
      negativePrompt?: string;
      existingImageUris?: string[];
      referenceImageRoles?: Array<"source" | "supporting" | "annotation">;
      modelName?: string;
    }
  ): Promise<{ url: string; isMock: boolean }> {
    const requestedModel = String(options?.modelName || "").trim();
    const model = requestedModel === "gemini-banana-pro"
      ? "google/gemini-3-pro-image"
      : requestedModel === "gemini-banana-flash"
        ? "google/gemini-3.1-flash-image"
        : requestedModel || (process.env.OPENROUTER_IMAGE_MODEL || "google/gemini-3.1-flash-image");
    const negativePrompt = String(options?.negativePrompt || "").trim();
    const finalPrompt = negativePrompt
      ? `${prompt}\n\nAvoid the following: ${negativePrompt}`
      : prompt;
    console.log(`[OpenRouter Image] Generating | model=${model} | promptLen=${prompt.length}`);

    try {
      const result = await openrouterGenerateImage({
        prompt: finalPrompt,
        model,
        aspectRatio: options?.aspectRatio,
        resolution: options?.resolution,
        referenceImages: options?.existingImageUris,
        referenceImageRoles: options?.referenceImageRoles,
      });
      let imageUrl = result.url;

      if (!imageUrl.includes("res.cloudinary.com")) {
        console.log("[OpenRouter Image] Persisting generated image to Cloudinary...");
        imageUrl = await cloudinaryService.uploadMedia(imageUrl, "igen_erp/generated_images");
      }

      console.log(`[OpenRouter Image] Done: ${imageUrl}`);
      return { url: imageUrl, isMock: false };
    } catch (error: any) {
      console.error("[OpenRouter Image] Error:", error);
      throw error;
    }
  }

  /**
   * Composite only the selected edit region over the original source. This
   * makes "preserve outside the marked area" deterministic after generation.
   * If source/output aspect ratios differ, return the generated image unchanged
   * instead of distorting the source image.
   */
  async compositeEditedRegion(
    sourceUrl: string,
    generatedUrl: string,
    region: NormalizedImageRegion
  ): Promise<string> {
    const sourceBuffer = await readImageBuffer(sourceUrl);
    const generatedBuffer = await readImageBuffer(generatedUrl);
    const sourceImage = sharp(sourceBuffer).rotate();
    const generatedImage = sharp(generatedBuffer).rotate();
    const [sourceMetadata, generatedMetadata] = await Promise.all([
      sourceImage.metadata(),
      generatedImage.metadata(),
    ]);
    if (!sourceMetadata.width || !sourceMetadata.height || !generatedMetadata.width || !generatedMetadata.height) {
      return generatedUrl;
    }

    const sourceRatio = sourceMetadata.width / sourceMetadata.height;
    const generatedRatio = generatedMetadata.width / generatedMetadata.height;
    if (Math.abs(sourceRatio - generatedRatio) > 0.02) {
      console.warn("[geminiService.compositeEditedRegion] Skipping composite because source/output aspect ratios differ.");
      return generatedUrl;
    }

    const width = generatedMetadata.width;
    const height = generatedMetadata.height;
    const bounded = clampRegion(region);
    const left = Math.min(width - 1, Math.max(0, Math.round(bounded.x * width)));
    const top = Math.min(height - 1, Math.max(0, Math.round(bounded.y * height)));
    const patchWidth = Math.min(width - left, Math.max(1, Math.round(bounded.width * width)));
    const patchHeight = Math.min(height - top, Math.max(1, Math.round(bounded.height * height)));
    const patch = await generatedImage
      .resize(width, height, { fit: "fill" })
      .extract({ left, top, width: patchWidth, height: patchHeight })
      .png()
      .toBuffer();
    const composed = await sourceImage
      .resize(width, height, { fit: "fill" })
      .composite([{ input: patch, left, top }])
      .png()
      .toBuffer();
    return cloudinaryService.uploadMediaBuffer(composed, "igen_erp/generated_images");
  }

  /** Apply the requested normalized crop to the generated result with pixels. */
  async cropImageToRegion(generatedUrl: string, region: NormalizedImageRegion): Promise<string> {
    const generatedBuffer = await readImageBuffer(generatedUrl);
    const generatedImage = sharp(generatedBuffer).rotate();
    const metadata = await generatedImage.metadata();
    if (!metadata.width || !metadata.height) return generatedUrl;

    const width = metadata.width;
    const height = metadata.height;
    const bounded = clampRegion(region);
    const left = Math.min(width - 1, Math.max(0, Math.round(bounded.x * width)));
    const top = Math.min(height - 1, Math.max(0, Math.round(bounded.y * height)));
    const cropWidth = Math.min(width - left, Math.max(1, Math.round(bounded.width * width)));
    const cropHeight = Math.min(height - top, Math.max(1, Math.round(bounded.height * height)));
    const cropped = await generatedImage
      .extract({ left, top, width: cropWidth, height: cropHeight })
      .png()
      .toBuffer();
    return cloudinaryService.uploadMediaBuffer(cropped, "igen_erp/generated_images");
  }
}

export const geminiImageService = new GeminiImageService();
