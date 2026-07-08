import Joi from "joi";

export const createProjectSchema = {
  body: Joi.object({
    videoUrl: Joi.string().uri().required().messages({
      "any.required": "Đường dẫn video 'videoUrl' là bắt buộc.",
      "string.empty": "Đường dẫn video không được để trống.",
      "string.uri": "Đường dẫn video phải là một URL hợp lệ.",
    }),
    name: Joi.string().optional().allow(""),
    lengthOption: Joi.string()
      .valid("auto", "<30s", "30s-60s", "60s-90s", "90s-3m")
      .optional()
      .default("auto")
      .messages({
        "any.only": "Độ dài video 'lengthOption' phải nằm trong các giá trị: auto, <30s, 30s-60s, 60s-90s, 90s-3m.",
      }),
    sourceLang: Joi.string().optional().allow("").default("auto"),
    brandTemplateId: Joi.string().optional().allow(""),
  }),
};

export const getProjectSchema = {
  params: Joi.object({
    projectId: Joi.string().required().messages({
      "any.required": "Mã dự án 'projectId' là bắt buộc ở đường dẫn.",
      "string.empty": "Mã dự án không được để trống.",
    }),
  }),
};

export const getClipsSchema = {
  query: Joi.object({
    projectId: Joi.string().required().messages({
      "any.required": "Tham số 'projectId' là bắt buộc trong query.",
      "string.empty": "Mã dự án không được để trống.",
    }),
    pageNum: Joi.number().integer().min(1).optional().default(1),
    pageSize: Joi.number().integer().min(1).max(100).optional().default(50),
  }),
};

export const getProjectsSchema = {
  query: Joi.object({
    page: Joi.number().integer().min(1).optional(),
    limit: Joi.number().integer().min(1).max(100).optional(),
    pageNum: Joi.number().integer().min(1).optional(),
    pageSize: Joi.number().integer().min(1).max(100).optional(),
    status: Joi.string().valid("pending", "processing", "completed", "failed").optional(),
  }),
};
