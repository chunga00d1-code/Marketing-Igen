import {
  VideoCaptionClassifiedError,
  VideoCaptionErrorType,
} from "../../shared/video-caption.contract";

export class VideoCaptionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly type: VideoCaptionErrorType,
    public readonly retryable: boolean,
    public readonly statusCode = 500
  ) {
    super(message);
    this.name = "VideoCaptionError";
  }
}

export function classifyVideoCaptionError(
  error: unknown
): VideoCaptionClassifiedError {
  if (error instanceof VideoCaptionError) {
    return {
      type: error.type,
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      occurredAt: new Date().toISOString(),
    };
  }

  const message =
    error instanceof Error ? error.message : "Đã xảy ra lỗi không xác định.";

  return {
    type: "transient",
    code: "UNEXPECTED_ERROR",
    message,
    retryable: true,
    occurredAt: new Date().toISOString(),
  };
}

export function getVideoCaptionHttpStatus(error: unknown): number {
  return error instanceof VideoCaptionError ? error.statusCode : 500;
}
