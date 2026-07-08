import { Request, Response } from "express";
import { geminiService } from "../service/gemini.service";
import { elevenlabsService } from "../service/elevenlabs.service";
import { walletService, API_COSTS } from "../service/wallet.service";

export const elevenlabsController = {
  async generateVoice(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yeu cau dang nhap" });
      }

      const textToSpeak = req.body.textToSpeak || "";
      const charCount = textToSpeak.length;
      const cost = Math.max(API_COSTS.ELEVENLABS_MIN, charCount * API_COSTS.ELEVENLABS_TTS_CHAR);

      await walletService.checkBalance(userId, cost);
      const result = await elevenlabsService.generateVoice(userId, req.body);
      await walletService.deductBalance(userId, cost, `Chi phí tạo giọng nói AI ElevenLabs (${charCount} ký tự)`);

      if ((result as any)?.preview) {
        return res.status(200).json({ status: "success", url: (result as any).url, preview: true });
      }
      return res.status(200).json({ status: "success", record: result });
    } catch (error: any) {
      console.error("[elevenlabsController.generateVoice] Error:", error);
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({ status: "error", message: error.message || "Loi tao giong noi ElevenLabs", details: error.message });
    }
  },

  async getVoiceHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yeu cau dang nhap" });
      }
      const history = await geminiService.getMediaHistory(userId, "voice");
      return res.status(200).json({ status: "success", history });
    } catch (error: any) {
      console.error("[elevenlabsController.getVoiceHistory] Error:", error);
      return res.status(500).json({ status: "error", message: "Lỗi lấy lịch sử voice", details: error.message });
    }
  },

  async deleteVoiceHistory(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Yêu cầu đăng nhập" });
      }
      const result = await geminiService.deleteMediaHistory(userId, req.params.id);
      return res.status(200).json(result);
    } catch (error: any) {
      console.error("[elevenlabsController.deleteVoiceHistory] Error:", error);
      return res.status(500).json({ status: "error", message: "Lỗi xóa lịch sử voice", details: error.message });
    }
  },

  async getVoices(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      return res.status(200).json(await elevenlabsService.getVoices(userId));
    } catch (error: any) {
      console.error("[elevenlabsController.getVoices] Error:", error);
      return res.status(500).json({ status: "error", message: "Không thể lấy danh sách giọng nói ElevenLabs", details: error.message });
    }
  },

  async getVoice(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      return res.status(200).json(await elevenlabsService.getVoice(userId, req.params.voiceId));
    } catch (error: any) {
      console.error("[elevenlabsController.getVoice] Error:", error);
      return res.status(500).json({ status: "error", message: "Không thể lấy chi tiết voice ElevenLabs", details: error.message });
    }
  },

  async getModels(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      return res.status(200).json(await elevenlabsService.getModels(userId));
    } catch (error: any) {
      console.error("[elevenlabsController.getModels] Error:", error);
      return res.status(500).json({ status: "error", message: "Không thể lấy danh sách model ElevenLabs", details: error.message });
    }
  },

  async getVoiceSettings(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      return res.status(200).json(await elevenlabsService.getVoiceSettings(userId, req.params.voiceId));
    } catch (error: any) {
      console.error("[elevenlabsController.getVoiceSettings] Error:", error);
      return res.status(500).json({ status: "error", message: "Không thể lấy voice settings ElevenLabs", details: error.message });
    }
  },

  async updateVoiceSettings(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      return res.status(200).json(await elevenlabsService.updateVoiceSettings(userId, req.params.voiceId, req.body));
    } catch (error: any) {
      console.error("[elevenlabsController.updateVoiceSettings] Error:", error);
      return res.status(500).json({ status: "error", message: "Không thể cập nhật voice settings ElevenLabs", details: error.message });
    }
  },

  async generateCustomVoicePreview(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      return res.status(200).json(await elevenlabsService.generateCustomVoicePreview(userId, req.body));
    } catch (error: any) {
      console.error("[elevenlabsController.generateCustomVoicePreview] Error:", error);
      return res.status(500).json({ status: "error", message: "Không thể thiết kế giọng nói thử nghiệm", details: error.message });
    }
  },

  async createCustomVoice(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      return res.status(200).json(await elevenlabsService.createCustomVoice(userId, req.body));
    } catch (error: any) {
      console.error("[elevenlabsController.createCustomVoice] Error:", error);
      return res.status(500).json({ status: "error", message: "Không thể lưu giọng nói cá nhân vào ElevenLabs", details: error.message });
    }
  },

  async addVoice(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      const { name, description, files } = req.body;
      return res.status(200).json(await elevenlabsService.addVoice(userId, name, description, files));
    } catch (error: any) {
      console.error("[elevenlabsController.addVoice] Error:", error);
      return res.status(500).json({ status: "error", message: "Không thể thêm giọng nói ElevenLabs", details: error.message });
    }
  },

  async deleteVoice(req: Request, res: Response) {
    try {
      const userId = (req as any).user?.id;
      return res.status(200).json(await elevenlabsService.deleteVoice(userId, req.params.voiceId));
    } catch (error: any) {
      console.error("[elevenlabsController.deleteVoice] Error:", error);
      return res.status(500).json({ status: "error", message: "Không thể xóa giọng nói ElevenLabs", details: error.message });
    }
  },
};
