export const geminiSwagger = {
  paths: {
    "/api/v1/gemini/chat": {
      post: {
        summary: "Chat AI Trợ lý CRM Omni-Inbox",
        tags: ["Gemini"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  message: { type: "string", example: "Giá thiết bị đeo thông minh X1?" },
                  history: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        sender: { type: "string", enum: ["user", "ai", "agent"] },
                        text: { type: "string" }
                      },
                      required: ["sender", "text"]
                    }
                  },
                  aiConfig: {
                    type: "object",
                    properties: {
                      autoClassify: { type: "boolean" },
                      autoCloseDeal: { type: "boolean" },
                      autoFeedback: { type: "boolean" },
                      replyDelay: { type: "number" },
                      advancedInstructions: { type: "string" }
                    },
                    required: ["autoClassify", "autoCloseDeal", "autoFeedback", "replyDelay"]
                  }
                },
                required: ["message", "history", "aiConfig"]
              }
            }
          }
        },
        responses: {
          200: {
            description: "Trả lời thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    isMock: { type: "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/gemini/marketing-pillars": {
      post: {
        summary: "Phân tích chủ đề chiến dịch và đề xuất Content Pillars",
        tags: ["Gemini"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  campaignTopic: { type: "string", example: "Chiến dịch tri ân khách hàng" }
                },
                required: ["campaignTopic"]
              }
            }
          }
        },
        responses: {
          200: {
            description: "Thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    pillars: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          title: { type: "string" },
                          ratio: { type: "string" },
                          description: { type: "string" }
                        }
                      }
                    },
                    isMock: { type: "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/gemini/marketing-ideas": {
      post: {
        summary: "Phát sinh các bản nháp ý tưởng chiến dịch kèm hashtags",
        tags: ["Gemini"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  campaignTopic: { type: "string" },
                  selectedPillars: { type: "array", items: { type: "string" } }
                },
                required: ["campaignTopic", "selectedPillars"]
              }
            }
          }
        },
        responses: {
          200: {
            description: "Thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    concepts: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          matchPercent: { type: "integer" },
                          summary: { type: "string" },
                          channels: { type: "array", items: { type: "string" } },
                          suggestedContent: { type: "string" },
                          hashtags: { type: "array", items: { type: "string" } }
                        }
                      }
                    },
                    isMock: { type: "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/gemini/marketing-develop": {
      post: {
        summary: "Lập dàn ý và viết bản nháp nội dung chi tiết đa kênh",
        tags: ["Gemini"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  summary: { type: "string" },
                  suggestedContent: { type: "string" },
                  channels: { type: "array", items: { type: "string" } }
                },
                required: ["title", "summary", "suggestedContent", "channels"]
              }
            }
          }
        },
        responses: {
          200: {
            description: "Thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    posts: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          channel: { type: "string" },
                          contentType: { type: "string" },
                          bodyText: { type: "string" }
                        }
                      }
                    },
                    isMock: { type: "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/gemini/marketing-suggestions": {
      get: {
        summary: "Lấy 3 chủ đề gợi ý chiến dịch chung cho nhiều doanh nghiệp",
        tags: ["Gemini"],
        responses: {
          200: {
            description: "Thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    suggestions: { type: "array", items: { type: "string" } }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/gemini/analyze-video-style": {
      post: {
        summary: "Phân tích phong cách dựng và trích xuất kịch bản từ video mẫu",
        tags: ["Gemini"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  videoUrl: { type: "string", example: "https://res.cloudinary.com/.../video.mp4" },
                  duration: { type: "number", example: 15, description: "Thời lượng của video mẫu tính bằng giây" },
                  targetVideoUrl: { type: "string", example: "https://res.cloudinary.com/.../video2.mp4", description: "Đường dẫn video đầu vào cần chỉnh sửa" },
                  targetDuration: { type: "number", example: 10, description: "Thời lượng video đầu vào cần chỉnh sửa tính bằng giây" }
                },
                required: ["videoUrl"]
              }
            }
          }
        },
        responses: {
          200: {
            description: "Thành công",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string" },
                    extractedPrompt: { type: "string" }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
};
