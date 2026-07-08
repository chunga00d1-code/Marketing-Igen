import { AIMediaModel } from "../model/ai-media.model";
import { cloudinaryService } from "./cloudinary.service";
import { UserModel } from "../model/user.model";
import { CompanyModel } from "../model/company.model";

const ELEVENLABS_VOICE_MAP: Record<string, string> = {
  Sadaltager: "pNInz6obpgqjGQJe7v5C",
  Puck: "onwK4e9ZLuTAKqWW03F9",
  Fenrir: "VR6A4UBqILHN73idDuEx",
  Enceladus: "N2lVS1w4EtoT3sAHBSz1",
  Iapetus: "ODq5FpeHgnsMrZsnXCw8",
  Umbriel: "SOYhlJg1783U4EcYUPgl",
  Algenib: "TX329t22vkzCsaeeH8ui",
  Rasalgethi: "CYw3moM5B48wqvQUxxTL",
  Achernar: "GBv7mTt0atIp3u8bJvhg",
  Zephyr: "D38z5qw23EIviwc77s33",
  Alnilam: "2EiwXtPIZgojA6xnRghf",
  Gacrux: "2EiwXtPIZgojA6xnRghf",
  Achird: "pNInz6obpgqjGQJe7v5C",
  Zubenelgenubi: "pNInz6obpgqjGQJe7v5C",
  Sulafat: "pNInz6obpgqjGQJe7v5C",
  Aoede: "EXAVITQu4vr4xnSDxMaL",
  Callirrhoe: "AZnzlk1XvdvUeBnXmlld",
  Kore: "21m00Tcm4TlvDq8ikWAM",
  Leda: "Lcfc5O6IFm67RCg5pQA1",
  Autonoe: "MF3mGyEYCl7XYWbV9VbO",
  Algieba: "ThT50A1aJnqfgCzz94ks",
  Despina: "zrHiDhphv9RcmhlC3AEg",
  Erinome: "EXAVITQu4vr4xnSDxMaL",
  Laomedeia: "EXAVITQu4vr4xnSDxMaL",
  Schedar: "EXAVITQu4vr4xnSDxMaL",
  Pulcherrima: "EXAVITQu4vr4xnSDxMaL",
  Vindemiatrix: "EXAVITQu4vr4xnSDxMaL",
  Sadachbia: "EXAVITQu4vr4xnSDxMaL",
};

async function getElevenLabsApiKey(userId?: string): Promise<string> {
  if (!userId) {
    return process.env.ELEVENLABS_API_KEY?.trim() || "";
  }
  try {
    const user = await UserModel.findById(userId).select("elevenlabsAccess companyCode").lean();
    if (user) {
      if (user.elevenlabsAccess?.apiKey?.trim()) {
        return user.elevenlabsAccess.apiKey.trim();
      }
      if (user.companyCode && user.companyCode !== "SYSTEM") {
        const company = await CompanyModel.findOne({ code: user.companyCode.toUpperCase() }).select("elevenlabsConfig").lean();
        if (company?.elevenlabsConfig?.apiKey?.trim()) {
          return company.elevenlabsConfig.apiKey.trim();
        }
      }
    }
  } catch (err) {
    console.error("[getElevenLabsApiKey] Lỗi phân giải API key ElevenLabs:", err);
  }
  return process.env.ELEVENLABS_API_KEY?.trim() || "";
}

function resolveElevenLabsVoiceId(voiceId?: string) {
  if (!voiceId) return "pNInz6obpgqjGQJe7v5C";
  return ELEVENLABS_VOICE_MAP[voiceId] || voiceId;
}

export const elevenlabsService = {
  async generateVoice(userId: string, input: any) {
    const {
      textToSpeak,
      mode,
      modelName,
      voiceName,
      speakerA,
      speakerB,
      title,
      description,
      stability,
      similarityBoost,
      useSpeakerBoost,
      saveToHistory,
    } = input;

    let cloudinaryUrl = "";
    const apiKey = await getElevenLabsApiKey(userId);

    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API Key ElevenLabs chưa được cấu hình cho tài khoản hoặc doanh nghiệp.");
    }

    try {
      const targetVoice = mode === "multi" ? speakerA || "Aoede" : voiceName || "Aoede";
      const mappedVoiceId = resolveElevenLabsVoiceId(targetVoice);
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${mappedVoiceId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey.trim(),
        },
        body: JSON.stringify({
          text: textToSpeak,
          model_id: modelName || "eleven_v3",
          voice_settings: {
            stability: typeof stability === "number" ? stability : 0.5,
            similarity_boost: typeof similarityBoost === "number" ? similarityBoost : 0.75,
            use_speaker_boost: typeof useSpeakerBoost === "boolean" ? useSpeakerBoost : true,
          },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      cloudinaryUrl = await cloudinaryService.uploadMediaBuffer(buffer, "igen_erp/marketing/voice");
    } catch (err: any) {
      console.error("[elevenlabsService.generateVoice] Failed to generate voice via ElevenLabs API", err);
      throw err;
    }

    const shouldSaveToHistory = saveToHistory !== false;

    if (!shouldSaveToHistory) {
      return {
        url: cloudinaryUrl,
        preview: true,
      };
    }

    return AIMediaModel.create({
      userId,
      mediaType: "voice",
      url: cloudinaryUrl,
      prompt: textToSpeak,
      metadata: {
        voiceName: mode === "multi" ? `Multi (${speakerA} & ${speakerB})` : voiceName,
        duration: estimateAudioDuration(textToSpeak),
        resolution: modelName || "eleven_v3",
        title: title || undefined,
        description: description || undefined,
      },
    });
  },

  async getVoices(userId?: string) {
    const apiKey = await getElevenLabsApiKey(userId);

    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API Key ElevenLabs chưa được cấu hình cho tài khoản hoặc doanh nghiệp.");
    }

    try {
      const response = await fetch("https://api.elevenlabs.io/v1/voices", {
        headers: {
          "xi-api-key": apiKey.trim(),
        },
      });
      if (!response.ok) {
        throw new Error(`ElevenLabs error: ${response.status}`);
      }
      const data = await response.json();
      return { status: "success", voices: data.voices || [] };
    } catch (err: any) {
      console.error("[elevenlabsService.getVoices] Failed to fetch ElevenLabs voices", err);
      throw err;
    }
  },

  async getVoice(userId: string, voiceId: string) {
    const apiKey = await getElevenLabsApiKey(userId);

    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API Key ElevenLabs chưa được cấu hình cho tài khoản hoặc doanh nghiệp.");
    }

    try {
      const resolvedVoiceId = resolveElevenLabsVoiceId(voiceId);
      const response = await fetch(`https://api.elevenlabs.io/v1/voices/${resolvedVoiceId}`, {
        headers: {
          "xi-api-key": apiKey.trim(),
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs voice details error: ${response.status} - ${errText}`);
      }

      return response.json();
    } catch (err: any) {
      console.error(`[elevenlabsService.getVoice] Failed to fetch voice details for ${voiceId}`, err);
      throw err;
    }
  },

  async getVoiceSettings(userId: string, voiceId: string) {
    const apiKey = await getElevenLabsApiKey(userId);

    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API Key ElevenLabs chưa được cấu hình cho tài khoản hoặc doanh nghiệp.");
    }

    try {
      const resolvedVoiceId = resolveElevenLabsVoiceId(voiceId);
      const response = await fetch(`https://api.elevenlabs.io/v1/voices/${resolvedVoiceId}/settings`, {
        headers: {
          "xi-api-key": apiKey.trim(),
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs voice settings error: ${response.status} - ${errText}`);
      }

      return response.json();
    } catch (err: any) {
      console.error(`[elevenlabsService.getVoiceSettings] Failed to fetch settings for ${voiceId}`, err);
      throw err;
    }
  },

  async updateVoiceSettings(
    userId: string,
    voiceId: string,
    settings: { stability?: number; similarity_boost?: number; style?: number; use_speaker_boost?: boolean }
  ) {
    const apiKey = await getElevenLabsApiKey(userId);
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API Key ElevenLabs chưa được cấu hình cho tài khoản hoặc doanh nghiệp.");
    }

    const resolvedVoiceId = resolveElevenLabsVoiceId(voiceId);
    const response = await fetch(`https://api.elevenlabs.io/v1/voices/${resolvedVoiceId}/settings/edit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey.trim(),
      },
      body: JSON.stringify(settings),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`ElevenLabs update voice settings error: ${response.status} - ${errText}`);
    }

    return response.json();
  },

  async getModels(userId?: string) {
    const apiKey = await getElevenLabsApiKey(userId);

    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API Key ElevenLabs chưa được cấu hình cho tài khoản hoặc doanh nghiệp.");
    }

    try {
      const response = await fetch("https://api.elevenlabs.io/v1/models", {
        headers: {
          "xi-api-key": apiKey.trim(),
        },
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs models error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      const models = (data || []).filter((model: any) => model.can_do_text_to_speech);
      return { status: "success", models };
    } catch (err: any) {
      console.error("[elevenlabsService.getModels] Failed to fetch ElevenLabs models", err);
      throw err;
    }
  },

  async generateCustomVoicePreview(userId: string, input: { gender: string; accent: string; age: string; accentStrength: number; text: string }) {
    const apiKey = await getElevenLabsApiKey(userId);

    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API Key ElevenLabs chưa được cấu hình cho tài khoản hoặc doanh nghiệp.");
    }

    try {
      const response = await fetch("https://api.elevenlabs.io/v1/voice-generation/generate-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey.trim(),
        },
        body: JSON.stringify({
          gender: input.gender,
          accent: input.accent,
          age: input.age,
          accent_strength: input.accentStrength,
          text: input.text,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs preview error: ${response.status} - ${errText}`);
      }

      const generatedVoiceId = response.headers.get("generated_voice_id");
      if (!generatedVoiceId) {
        throw new Error("No generated_voice_id found in headers");
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const mediaUrl = await cloudinaryService.uploadMediaBuffer(buffer, "igen_erp/marketing/voice_previews");
      return { generatedVoiceId, url: mediaUrl };
    } catch (err: any) {
      console.error("[elevenlabsService.generateCustomVoicePreview] Failed to generate custom voice preview", err);
      throw err;
    }
  },

  async createCustomVoice(userId: string, input: { voiceName: string; voiceDescription: string; generatedVoiceId: string }) {
    const apiKey = await getElevenLabsApiKey(userId);

    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API Key ElevenLabs chưa được cấu hình cho tài khoản hoặc doanh nghiệp.");
    }

    try {
      const response = await fetch("https://api.elevenlabs.io/v1/voice-generation/create-voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey.trim(),
        },
        body: JSON.stringify({
          voice_name: input.voiceName,
          voice_description: input.voiceDescription,
          generated_voice_id: input.generatedVoiceId,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs create-voice error: ${response.status} - ${errText}`);
      }

      const result = await response.json();
      return { voice_id: result.voice_id };
    } catch (err: any) {
      console.error("[elevenlabsService.createCustomVoice] Failed to create custom voice", err);
      throw err;
    }
  },

  async addVoice(userId: string, name: string, description: string, files: string[]) {
    const apiKey = await getElevenLabsApiKey(userId);

    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API Key ElevenLabs chưa được cấu hình cho tài khoản hoặc doanh nghiệp.");
    }

    try {
      const formData = new FormData();
      formData.append("name", name);
      formData.append("description", description);
      if (userId) {
        formData.append("labels", JSON.stringify({ userId }));
      }

      for (let i = 0; i < files.length; i += 1) {
        const matches = files[i].match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
        if (!matches) {
          throw new Error("Invalid file format");
        }
        const mimeType = matches[1];
        const buffer = Buffer.from(matches[2], "base64");
        const blob = new Blob([buffer], { type: mimeType });
        formData.append("files", blob, `file-${i}.${mimeType.split("/")[1]}`);
      }

      const response = await fetch("https://api.elevenlabs.io/v1/voices/add", {
        method: "POST",
        headers: {
          "xi-api-key": apiKey.trim(),
        },
        body: formData,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorBody}`);
      }

      return response.json();
    } catch (err: any) {
      console.error("[elevenlabsService.addVoice] Failed to clone/add voice", err);
      throw err;
    }
  },

  async deleteVoice(userId: string, voiceId: string) {
    const apiKey = await getElevenLabsApiKey(userId);
    if (!apiKey || apiKey.trim() === "") {
      throw new Error("API Key ElevenLabs chưa được cấu hình cho tài khoản hoặc doanh nghiệp.");
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
        method: "DELETE",
        headers: {
          "xi-api-key": apiKey.trim(),
        },
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorBody}`);
      }

      return { success: true };
    } catch (err: any) {
      console.error(`[elevenlabsService.deleteVoice] Failed to delete voice ${voiceId}`, err);
      throw err;
    }
  },
};

function estimateAudioDuration(text: string): number {
  return Math.max(1, Math.ceil(text.length / 13));
}
