import { createHmac, timingSafeEqual } from "crypto";
import { Request, Response } from "express";
import { videoCaptionService } from "../service/video-caption.service";
import { getVideoCaptionHttpStatus } from "../service/video-caption-error";

const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function logWebhook(event: string, data: Record<string, unknown>) {
  console.info(
    `[Video Caption STT Webhook] ${event}`,
    JSON.stringify(data)
  );
}

type ElevenLabsSttWebhook = {
  type?: string;
  data?: {
    request_id?: string;
    requestId?: string;
    status?: string;
    webhook_metadata?: Record<string, unknown> | string;
    webhookMetadata?: Record<string, unknown> | string;
    transcription?: {
      language_code?: string;
      text?: string;
      words?: Array<{
        text?: string;
        start?: number;
        end?: number;
        type?: "word" | "spacing" | "audio_event";
        logprob?: number;
      }>;
    };
  };
};

export function verifyElevenLabsWebhookSignature(
  rawBody: string,
  signatureHeader: string
) {
  const secrets = [
    process.env.ELEVENLABS_STT_WEBHOOK_SECRET,
    ...(process.env.ELEVENLABS_STT_WEBHOOK_SECRETS || "").split(","),
  ]
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));
  if (!secrets.length) {
    throw new Error("ELEVENLABS_STT_WEBHOOK_SECRET chưa được cấu hình.");
  }
  const values = Object.fromEntries(
    signatureHeader.split(",").map((item) => {
      const [key, ...rest] = item.trim().split("=");
      return [key, rest.join("=")];
    })
  );
  const timestamp = Number(values.t);
  const signature = values.v0;
  if (!Number.isFinite(timestamp) || !signature) return false;
  if (
    Math.abs(Math.floor(Date.now() / 1000) - timestamp) >
    SIGNATURE_TOLERANCE_SECONDS
  ) {
    return false;
  }

  const signatureBuffer = Buffer.from(signature, "utf8");
  return secrets.some((secret) => {
    const expected = createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");
    const expectedBuffer = Buffer.from(expected, "utf8");
    return (
      expectedBuffer.length === signatureBuffer.length &&
      timingSafeEqual(expectedBuffer, signatureBuffer)
    );
  });
}

function parseMetadata(value: unknown) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export const elevenLabsSttWebhookController = {
  async receive(req: Request, res: Response) {
    const rawBody = String(
      (req as Request & { rawBody?: string }).rawBody || ""
    );
    const signature = String(req.headers["elevenlabs-signature"] || "");
    logWebhook("received", {
      rawBodyBytes: Buffer.byteLength(rawBody),
      signaturePresent: Boolean(signature),
      contentType: req.headers["content-type"] || null,
      userAgent: req.headers["user-agent"] || null,
    });
    if (
      !process.env.ELEVENLABS_STT_WEBHOOK_SECRET?.trim() &&
      !process.env.ELEVENLABS_STT_WEBHOOK_SECRETS?.trim()
    ) {
      logWebhook("configuration_missing", {
        rawBodyBytes: Buffer.byteLength(rawBody),
      });
      return res.status(503).json({
        status: "error",
        message: "Webhook ElevenLabs chưa được cấu hình secret.",
      });
    }
    if (
      !rawBody ||
      !signature ||
      !verifyElevenLabsWebhookSignature(rawBody, signature)
    ) {
      logWebhook("signature_rejected", {
        rawBodyPresent: Boolean(rawBody),
        signaturePresent: Boolean(signature),
      });
      return res.status(401).json({
        status: "error",
        message: "Chữ ký webhook ElevenLabs không hợp lệ.",
      });
    }

    const event = req.body as ElevenLabsSttWebhook;
    logWebhook("signature_verified", {
      eventType: event.type || null,
    });
    if (
      !["speech_to_text_transcription", "speech_to_text.completed"].includes(
        String(event.type)
      )
    ) {
      logWebhook("event_ignored", {
        eventType: event.type || null,
      });
      return res.status(200).json({ received: true, ignored: true });
    }

    const data = event.data || {};
    const metadata = parseMetadata(
      data.webhook_metadata || data.webhookMetadata
    );
    const providerRequestId = String(
      data.request_id || data.requestId || ""
    );
    logWebhook("event_parsed", {
      eventType: event.type || null,
      providerRequestId: providerRequestId || null,
      jobId: metadata.jobId || null,
      projectId: metadata.projectId || null,
      companyCode: metadata.companyCode || null,
      status: data.status || null,
      transcriptionPresent: Boolean(data.transcription),
      wordCount: data.transcription?.words?.length || 0,
    });
    if (
      !providerRequestId ||
      !data.transcription ||
      !metadata.jobId ||
      !metadata.projectId ||
      !metadata.companyCode
    ) {
      logWebhook("payload_rejected", {
        providerRequestId: providerRequestId || null,
        jobId: metadata.jobId || null,
        projectId: metadata.projectId || null,
        companyCode: metadata.companyCode || null,
        transcriptionPresent: Boolean(data.transcription),
      });
      return res.status(400).json({
        status: "error",
        message: "Webhook ElevenLabs thiếu dữ liệu transcription hoặc metadata.",
      });
    }

    try {
      const result = await videoCaptionService.completeTranscriptionWebhook({
        jobId: String(metadata.jobId),
        projectId: String(metadata.projectId),
        companyCode: String(metadata.companyCode),
        providerRequestId,
        transcription: data.transcription,
      });
      logWebhook("processed", {
        providerRequestId,
        jobId: String(metadata.jobId),
        projectId: String(metadata.projectId),
        duplicate: result.duplicate,
      });
      return res.status(200).json({
        received: true,
        duplicate: result.duplicate,
      });
    } catch (error) {
      const statusCode = getVideoCaptionHttpStatus(error);
      console.error(
        "[Video Caption STT Webhook] processing_failed",
        JSON.stringify({
          providerRequestId,
          jobId: String(metadata.jobId),
          projectId: String(metadata.projectId),
          statusCode,
          error: error instanceof Error ? error.message : String(error),
        })
      );
      return res.status(statusCode).json({
        status: "error",
        message: "Không thể xử lý kết quả webhook ElevenLabs.",
      });
    }
  },
};
