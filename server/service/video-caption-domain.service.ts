import { createHash } from "crypto";
import {
  canTransitionVideoCaptionStatus,
  DEFAULT_VIDEO_CAPTION_STYLE,
  VideoCaptionJobOperation,
  VideoCaptionMode,
  VideoCaptionProjectStatus,
  VideoCaptionStyle,
} from "../../shared/video-caption.contract";
import { VideoCaptionError } from "./video-caption-error";

export function normalizeCaptionCompanyCode(companyCode: string) {
  const normalized = String(companyCode || "").trim().toUpperCase();
  if (!normalized) {
    throw new VideoCaptionError(
      "Không xác định được doanh nghiệp.",
      "COMPANY_REQUIRED",
      "authentication",
      false,
      401
    );
  }
  return normalized;
}

export function normalizeCaptionStyle(
  style?: Partial<VideoCaptionStyle>
): VideoCaptionStyle {
  return {
    ...DEFAULT_VIDEO_CAPTION_STYLE,
    ...(style || {}),
  };
}

export function hashCaptionInput(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function buildCaptionJobIdempotencyKey(input: {
  companyCode: string;
  projectId: string;
  fingerprint: string;
  mode: VideoCaptionMode;
  inputVersion: number;
  settingsHash: string;
  operation: VideoCaptionJobOperation;
}) {
  return [
    normalizeCaptionCompanyCode(input.companyCode),
    input.projectId,
    input.fingerprint,
    input.mode,
    input.inputVersion,
    input.settingsHash,
    input.operation,
  ].join(":");
}

export function assertCaptionStatusTransition(
  from: VideoCaptionProjectStatus,
  to: VideoCaptionProjectStatus
) {
  if (!canTransitionVideoCaptionStatus(from, to)) {
    throw new VideoCaptionError(
      `Không thể chuyển trạng thái dự án caption từ ${from} sang ${to}.`,
      "INVALID_STATUS_TRANSITION",
      "validation",
      false,
      409
    );
  }
}
