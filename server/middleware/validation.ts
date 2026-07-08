import { Request, Response, NextFunction } from "express";
import { Schema } from "joi";

interface ValidationSchema {
  body?: Schema;
  query?: Schema;
  params?: Schema;
}

/**
 * Dịch thông báo lỗi Joi sang Tiếng Việt
 */
function translateJoiError(message: string, label: string, type: string): string {
  const cleanLabel = label.replace(/['"]/g, "");
  switch (type) {
    case "any.required":
      return `Trường "${cleanLabel}" là bắt buộc và không thể thiếu.`;
    case "string.empty":
      return `Trường "${cleanLabel}" không được để trống.`;
    case "string.base":
      return `Trường "${cleanLabel}" phải là kiểu văn bản (string).`;
    case "array.base":
      return `Trường "${cleanLabel}" phải là một danh sách (array).`;
    case "number.base":
      return `Trường "${cleanLabel}" phải là kiểu số (number).`;
    case "number.integer":
      return `Trường "${cleanLabel}" phải là một số nguyên.`;
    case "object.base":
      return `Trường "${cleanLabel}" phải là một đối tượng (object).`;
    default:
      return message.replace(/['"]/g, '"');
  }
}

/**
 * Middleware xác thực dữ liệu đầu vào sử dụng Joi
 */
export function validateRequest(schema: ValidationSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const errorDetails: Record<string, string[]> = {};

    for (const key of ["body", "query", "params"] as const) {
      const partSchema = schema[key];
      if (partSchema) {
        const { error, value } = partSchema.validate(req[key], {
          abortEarly: false,
          allowUnknown: true,
          stripUnknown: false,
        });

        if (error) {
          errorDetails[key] = error.details.map((detail) =>
            translateJoiError(detail.message, detail.context?.label || detail.path.join("."), detail.type)
          );
        } else {
          req[key] = value;
        }
      }
    }

    if (Object.keys(errorDetails).length > 0) {
      return res.status(400).json({
        status: "error",
        message: "Dữ liệu yêu cầu không hợp lệ",
        errors: errorDetails,
      });
    }

    return next();
  };
}
