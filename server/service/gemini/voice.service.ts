/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { AIMediaModel } from "../../model/ai-media.model";
import { cloudinaryService } from "../cloudinary.service";
import { elevenlabsService } from "../elevenlabs.service";
import { estimateAudioDuration } from "./core";

export class GeminiVoiceService {
  /**
   * Tạo giọng nói TTS (Gemini Voice Modality / ElevenLabs)
   */
  async generateVoice(userId: string, input: any) {
    const {
      textToSpeak,
      styleInstructions,
      mode,
      temperature,
      modelName,
      voiceName,
      speakerA,
      speakerB,
      title,
      description,
      stability,
      similarityBoost,
      useSpeakerBoost,
    } = input;

    // ElevenLabs Voice Mapping Table
    const ELEVENLABS_VOICE_MAP: Record<string, string> = {
      // Male voices
      Sadaltager: "pNInz6obpgqjGQJe7v5C", // Adam
      Charon: "IKne3meq5aP759yEl2s8", // Charlie
      Orus: "JBF2zhBk4EKq12v0tw9H", // George
      Puck: "TxGEqn7nUaNZTRXjOFaQ", // Josh
      Fenrir: "VR6A4UBqILHN73idDuEx", // Arnold
      Enceladus: "N2lVS1w4EtoT3sAHBSz1", // Callum
      Iapetus: "ODq5FpeHgnsMrZsnXCw8", // Patrick
      Umbriel: "SOYhlJg1783U4EcYUPgl", // Harry
      Algenib: "TX329t22vkzCsaeeH8ui", // Liam
      Rasalgethi: "CYw3moM5B48wqvQUxxTL", // Dave
      Achernar: "GBv7mTt0atIp3u8bJvhg", // Thomas
      Zephyr: "D38z5qw23EIviwc77s33", // Fin
      Alnilam: "2EiwXtPIZgojA6xnRghf", // Clyde
      Gacrux: "2EiwXtPIZgojA6xnRghf", // Clyde fallback
      Achird: "pNInz6obpgqjGQJe7v5C", // Adam fallback
      Zubenelgenubi: "pNInz6obpgqjGQJe7v5C", // Adam fallback
      Sulafat: "pNInz6obpgqjGQJe7v5C", // Adam fallback

      // Female voices
      Aoede: "EXAVITQu4vr4xnSDxMaL", // Bella
      Callirrhoe: "AZnzlk1XvdvUeBnXmlld", // Domi
      Kore: "21m00Tcm4TlvDq8ikWAM", // Rachel
      Leda: "Lcfc5O6IFm67RCg5pQA1", // Emily
      Autonoe: "MF3mGyEYCl7XYWbV9VbO", // Ellie
      Algieba: "ThT50A1aJnqfgCzz94ks", // Dorothy
      Despina: "zrHiDhphv9RcmhlC3AEg", // Mimi
      Erinome: "EXAVITQu4vr4xnSDxMaL", // Bella fallback
      Laomedeia: "EXAVITQu4vr4xnSDxMaL", // Bella fallback
      Schedar: "EXAVITQu4vr4xnSDxMaL", // Bella fallback
      Pulcherrima: "EXAVITQu4vr4xnSDxMaL", // Bella fallback
      Vindemiatrix: "EXAVITQu4vr4xnSDxMaL", // Bella fallback
      Sadachbia: "EXAVITQu4vr4xnSDxMaL", // Bella fallback
    };

    let audioDataUri = "";
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

    if (!elevenLabsApiKey || elevenLabsApiKey.trim() === "") {
      console.log("[geminiService.generateVoice] ELEVENLABS_API_KEY is not configured. Running in MOCK mode.");
      audioDataUri = "data:audio/wav;base64,UklGRigAAABXQVZFlm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAAG";
    } else {
      try {
        const targetVoice = mode === "multi" ? (speakerA || "Aoede") : (voiceName || "Aoede");
        const mappedVoiceId = ELEVENLABS_VOICE_MAP[targetVoice] || targetVoice || "pNInz6obpgqjGQJe7v5C";

        console.log(`[geminiService.generateVoice] Generating voice using ElevenLabs with voice: ${mappedVoiceId}`);

        const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${mappedVoiceId}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": elevenLabsApiKey.trim(),
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
        const base64Audio = buffer.toString("base64");
        audioDataUri = `data:audio/mpeg;base64,${base64Audio}`;
      } catch (error: any) {
        console.error("[geminiService.generateVoice] ElevenLabs API error:", error);
        throw error;
      }
    }

    // Upload to Cloudinary
    const cloudinaryUrl = await cloudinaryService.uploadMedia(audioDataUri, "igen_erp/marketing/voice");

    // Save to MongoDB
    const record = await AIMediaModel.create({
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

    return record;
  }

  /**
   * Lấy danh sách giọng nói ElevenLabs (delegate to elevenlabsService)
   */
  async getElevenLabsVoices(userId?: string) {
    return elevenlabsService.getVoices(userId);
  }

  /**
   * Thiết kế & phát nghe thử giọng nói ElevenLabs (delegate to elevenlabsService)
   */
  async generateCustomVoicePreview(userId: string, input: { gender: string; accent: string; age: string; accentStrength: number; text: string }) {
    return elevenlabsService.generateCustomVoicePreview(userId, input);
  }

  /**
   * Lưu giọng thiết kế thành giọng chính thức (delegate to elevenlabsService)
   */
  async createCustomVoice(userId: string, input: { voiceName: string; voiceDescription: string; generatedVoiceId: string }) {
    return elevenlabsService.createCustomVoice(userId, input);
  }

  async addElevenLabsVoice(userId: string, name: string, description: string, files: string[]) {
    return elevenlabsService.addVoice(userId, name, description, files);
  }

  async deleteElevenLabsVoice(userId: string, voiceId: string) {
    return elevenlabsService.deleteVoice(userId, voiceId);
  }
}

export const geminiVoiceService = new GeminiVoiceService();
