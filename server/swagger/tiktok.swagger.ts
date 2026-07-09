export const tiktokSwagger = {
  paths: {
    "/api/v1/tiktok/publish": {
      post: {
        summary: "ÄÄƒng video lÃªn TikTok (Blotato API / TikTok Direct API)",
        description:
          "Há»‡ thá»‘ng tá»± Ä‘á»™ng chá»n phÆ°Æ¡ng thá»©c phÃ¹ há»£p:\n" +
          "1. **Blotato API** (KhuyÃªn dÃ¹ng khi chÆ°a cÃ³ app TikTok Ä‘Æ°á»£c duyá»‡t): Tá»± Ä‘á»™ng kÃ­ch hoáº¡t khi cÃ³ cáº¥u hÃ¬nh `BLOTATO_API_KEY` vÃ  `BLOTATO_TIKTOK_ACCOUNT_ID` trong file `.env`. Há»— trá»£ Ä‘Äƒng ngay hoáº·c lÃªn lá»‹ch báº±ng `scheduledTime`.\n" +
          "2. **TikTok Direct API**: KÃ­ch hoáº¡t khi khÃ´ng cÃ³ Blotato API vÃ  truyá»n `accessToken`. Sá»­ dá»¥ng cÆ¡ cháº¿ PULL_FROM_URL cá»§a TikTok API v2.\n" +
          "LÆ°u Ã½: Video Ä‘Äƒng táº£i pháº£i á»Ÿ Ä‘á»‹nh dáº¡ng MP4/H.264, kÃ­ch thÆ°á»›c â‰¤ 500MB vÃ  cÃ³ thá»ƒ truy cáº­p qua URL cÃ´ng khai.",
        tags: ["TikTok"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["cardId", "videoUrl"],
                properties: {
                  cardId: {
                    type: "string",
                    description: "ID cá»§a bÃ i Ä‘Äƒng/card trong há»‡ thá»‘ng (Ä‘á»‹nh dáº¡ng MongoDB ObjectId)",
                    example: "60d5ec49f83c2c2f7823f81e",
                  },
                  caption: {
                    type: "string",
                    description: "Ná»™i dung caption cho video TikTok (tá»‘i Ä‘a 2200 kÃ½ tá»±)",
                    example: "Video hÆ°á»›ng dáº«n sá»­ dá»¥ng iGen Marketing thÃ´ng minh #igen #erp",
                  },
                  videoUrl: {
                    type: "string",
                    description:
                      "URL cÃ´ng khai trá» Ä‘áº¿n file video MP4/H.264 (TikTok/Blotato sáº½ tá»± kÃ©o vá»)",
                    example: "https://example.com/videos/tutorial.mp4",
                  },
                  privacyLevel: {
                    type: "string",
                    description: "Má»©c quyá»n riÃªng tÆ° cá»§a video (chá»‰ Ã¡p dá»¥ng cho TikTok Direct API)",
                    enum: [
                      "PUBLIC_TO_EVERYONE",
                      "MUTUAL_FOLLOW_FRIENDS",
                      "FOLLOWER_OF_ACTIVE_USER",
                      "SELF_ONLY",
                    ],
                    default: "SELF_ONLY",
                    example: "SELF_ONLY",
                  },
                  accessToken: {
                    type: "string",
                    description:
                      "Access Token OAuth2 cá»§a tÃ i khoáº£n TikTok (báº¯t buá»™c náº¿u khÃ´ng dÃ¹ng Blotato)",
                    example: "act.example_access_token_here",
                  },
                  username: {
                    type: "string",
                    description: "Username TikTok (dÃ¹ng Ä‘á»ƒ táº¡o share URL cho Direct API)",
                    example: "igen_tech",
                  },
                  scheduledTime: {
                    type: "string",
                    format: "date-time",
                    description: "Thá»i gian lÃªn lá»‹ch Ä‘Äƒng bÃ i (ISO string, vÃ­ dá»¥: 2026-06-12T10:00:00Z). Chá»‰ há»— trá»£ qua Blotato API.",
                    example: "2026-06-12T10:00:00Z",
                  },
                  blotatoAccountId: {
                    type: "string",
                    description: "ID tÃ i khoáº£n TikTok cá»¥ thá»ƒ trÃªn Blotato. Náº¿u khÃ´ng truyá»n, há»‡ thá»‘ng sáº½ sá»­ dá»¥ng BLOTATO_TIKTOK_ACCOUNT_ID tá»« .env.",
                    example: "acc_60d5ec...",
                  },
                  blotatoApiKey: {
                    type: "string",
                    description: "API Key Blotato cá»§a báº¡n. Náº¿u khÃ´ng truyá»n, há»‡ thá»‘ng sá»­ dá»¥ng BLOTATO_API_KEY tá»« .env.",
                    example: "blotato_api_...",
                  },
                  integrationId: {
                    type: "string",
                    description: "MÃ£ ID tÃ i khoáº£n káº¿t ná»‘i tá»« báº£ng SocialIntegration. Náº¿u truyá»n vÃ o, há»‡ thá»‘ng tá»± Ä‘á»™ng náº¡p táº¥t cáº£ cáº¥u hÃ¬nh token/API Key tá»« DB.",
                    example: "60d5ec49f83c2c2f7823f81e",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description:
              "Gá»­i yÃªu cáº§u Ä‘Äƒng video thÃ nh cÃ´ng hoáº·c Ä‘ang xá»­ lÃ½",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: {
                      type: "string",
                      enum: ["success", "pending"],
                      example: "success",
                    },
                    message: {
                      type: "string",
                      example: "ÄÄƒng video lÃªn TikTok qua Blotato thÃ nh cÃ´ng",
                    },
                    provider: {
                      type: "string",
                      enum: ["blotato", "tiktok_direct"],
                      example: "blotato",
                    },
                    data: {
                      type: "object",
                      properties: {
                        postSubmissionId: {
                          type: "string",
                          description: "ID bÃ i post do Blotato tráº£ vá» (hoáº·c publishId cá»§a TikTok)",
                          example: "post_12345abcdef",
                        },
                        publishId: {
                          type: "string",
                          description: "MÃ£ publish_id náº¿u dÃ¹ng TikTok Direct",
                          example: "v_pub_url~v3-123456789",
                        },
                        shareUrl: {
                          type: "string",
                          description:
                            "Link video TikTok sau khi Ä‘Äƒng thÃ nh cÃ´ng (chá»‰ cÃ³ khi dÃ¹ng TikTok Direct vÃ  polling hoÃ n táº¥t)",
                          example: "https://www.tiktok.com/@igen_tech/video/123456",
                        },
                        publishStatus: {
                          type: "string",
                          enum: [
                            "PUBLISH_COMPLETE",
                            "PROCESSING",
                            "SCHEDULED",
                            "SUBMITTED",
                          ],
                          example: "SUBMITTED",
                        },
                        success: { type: "boolean", example: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: {
            description: "Dá»¯ liá»‡u Ä‘áº§u vÃ o khÃ´ng há»£p lá»‡ (Joi validation)",
          },
          401: {
            description: "ChÆ°a Ä‘Äƒng nháº­p hoáº·c khÃ´ng cÃ³ quyá»n",
          },
          500: {
            description: "Lá»—i há»‡ thá»‘ng, lá»—i káº¿t ná»‘i Blotato hoáº·c TikTok API tá»« chá»‘i",
          },
        },
      },
    },

    "/api/v1/tiktok/validate-token": {
      post: {
        summary: "XÃ¡c thá»±c káº¿t ná»‘i TikTok",
        description:
          "XÃ¡c thá»±c káº¿t ná»‘i theo thá»© tá»±:\n" +
          "1. Kiá»ƒm tra qua Blotato API náº¿u cÃ³ cáº¥u hÃ¬nh `BLOTATO_API_KEY`.\n" +
          "2. Kiá»ƒm tra trá»±c tiáº¿p báº±ng Creator Info Query API náº¿u cÃ³ truyá»n `accessToken`.\n" +
          "3. Fallback qua n8n Webhook náº¿u `N8N_TT_VALIDATE_URL` Ä‘Ã£ cáº¥u hÃ¬nh.",
        tags: ["TikTok"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  username: {
                    type: "string",
                    description: "Username TikTok (tuá»³ chá»n)",
                    example: "igen_tech",
                  },
                  accessToken: {
                    type: "string",
                    description: "Access Token TikTok (tuá»³ chá»n)",
                    example: "act.example_access_token_here",
                  },
                  blotatoApiKey: {
                    type: "string",
                    description: "API Key Blotato Ä‘á»ƒ xÃ¡c thá»±c tÃ i khoáº£n. Náº¿u khÃ´ng truyá»n, há»‡ thá»‘ng sá»­ dá»¥ng BLOTATO_API_KEY tá»« .env.",
                    example: "blotato_api_...",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "XÃ¡c thá»±c thÃ nh cÃ´ng",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: {
                      type: "string",
                      example: "Káº¿t ná»‘i TikTok qua Blotato há»£p lá»‡",
                    },
                    valid: { type: "boolean", example: true },
                    provider: { type: "string", enum: ["blotato", "tiktok_direct", "n8n"], example: "blotato" },
                    displayName: { type: "string", example: "iGen Tech Official" },
                    avatarUrl: {
                      type: "string",
                      example: "https://p16-sign.tiktokcdn-us.com/...",
                    },
                    privacyLevelOptions: {
                      type: "array",
                      items: { type: "string" },
                      example: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
                    },
                  },
                },
              },
            },
          },
          400: { description: "Dá»¯ liá»‡u Ä‘áº§u vÃ o khÃ´ng há»£p lá»‡" },
          401: { description: "ChÆ°a Ä‘Äƒng nháº­p hoáº·c khÃ´ng cÃ³ quyá»n" },
          500: { description: "Lá»—i há»‡ thá»‘ng hoáº·c xÃ¡c thá»±c tháº¥t báº¡i" },
        },
      },
    },

    "/api/v1/tiktok/creator-info": {
      post: {
        summary: "Láº¥y thÃ´ng tin creator TikTok",
        description:
          "Gá»i `/v2/post/publish/creator_info/query/` Ä‘á»ƒ láº¥y avatar, nickname, danh sÃ¡ch privacy options vÃ  cÃ¡c cÃ i Ä‘áº·t máº·c Ä‘á»‹nh cá»§a tÃ i khoáº£n TikTok. Chá»‰ hoáº¡t Ä‘á»™ng vá»›i TikTok Direct API.",
        tags: ["TikTok"],
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["accessToken"],
                properties: {
                  accessToken: {
                    type: "string",
                    description: "Access Token TikTok (scope: video.publish)",
                    example: "act.example_access_token_here",
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Láº¥y thÃ´ng tin creator thÃ nh cÃ´ng",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: {
                      type: "string",
                      example: "Láº¥y thÃ´ng tin creator TikTok thÃ nh cÃ´ng",
                    },
                    data: {
                      type: "object",
                      properties: {
                        creatorAvatarUrl: { type: "string" },
                        creatorNickname: { type: "string", example: "iGen Tech" },
                        creatorUsername: { type: "string", example: "igen_tech" },
                        privacyLevelOptions: {
                          type: "array",
                          items: { type: "string" },
                          example: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"],
                        },
                        commentDisabled: { type: "boolean", example: false },
                        duetDisabled: { type: "boolean", example: false },
                        stitchDisabled: { type: "boolean", example: false },
                      },
                    },
                  },
                },
              },
            },
          },
          400: { description: "Dá»¯ liá»‡u Ä‘áº§u vÃ o khÃ´ng há»£p lá»‡" },
          401: { description: "ChÆ°a Ä‘Äƒng nháº­p hoáº·c khÃ´ng cÃ³ quyá»n" },
          500: { description: "Lá»—i há»‡ thá»‘ng hoáº·c TikTok API tá»« chá»‘i" },
        },
      },
    },

    "/api/v1/tiktok/blotato-accounts": {
      get: {
        summary: "Láº¥y danh sÃ¡ch tÃ i khoáº£n TikTok tá»« Blotato",
        description:
          "Truy váº¥n API Blotato Ä‘á»ƒ láº¥y toÃ n bá»™ cÃ¡c tÃ i khoáº£n TikTok Ä‘Ã£ káº¿t ná»‘i dÆ°á»›i API Key hiá»‡n táº¡i. DÃ¹ng Ä‘á»ƒ láº¥y `accountId` dÃ¹ng cho cáº¥u hÃ¬nh mÃ´i trÆ°á»ng.",
        tags: ["TikTok"],
        security: [{ bearerAuth: [] }],
        parameters: [
          {
            name: "blotatoApiKey",
            in: "query",
            description: "API Key Blotato. Náº¿u khÃ´ng truyá»n, há»‡ thá»‘ng sá»­ dá»¥ng BLOTATO_API_KEY tá»« .env.",
            required: false,
            schema: { type: "string" },
          },
        ],
        responses: {
          200: {
            description: "Láº¥y tÃ i khoáº£n thÃ nh cÃ´ng",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    status: { type: "string", example: "success" },
                    message: { type: "string", example: "Láº¥y danh sÃ¡ch tÃ i khoáº£n TikTok tá»« Blotato thÃ nh cÃ´ng" },
                    data: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string", example: "acc_12345" },
                          name: { type: "string", example: "iGen Tech" },
                          platform: { type: "string", example: "tiktok" },
                          avatarUrl: { type: "string", example: "https://..." },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          401: { description: "ChÆ°a Ä‘Äƒng nháº­p hoáº·c khÃ´ng cÃ³ quyá»n" },
          500: { description: "Lá»—i káº¿t ná»‘i Blotato API hoáº·c cáº¥u hÃ¬nh thiáº¿u" },
        },
      },
    },
  },
};


