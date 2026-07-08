import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  Send,
  RefreshCw,
  Zap,
  Facebook,
  Lock,
  Video,
  Image as ImageIcon,
  Paperclip,
  X,
  FileText,
  Trash2
} from "lucide-react";
import { MarketingConcept, ContentApprovalCard } from "../../types";
import { marketingService, extractDraftContent } from "../../services/marketingService";
import { socialIntegrationService } from "../../services/socialIntegrationService";
import { geminiApi } from "../../api/gemini";
import { toast } from "../../pages/Toast";
import HumanVideoSettingsCard from "./HumanVideoSettingsCard";
import { heygenApi, type HeyGenLibraryItem } from "../../api/heygen";
import { elevenlabsApi } from "../../api/elevenlabs";

interface IdeationTabProps {
  userProfile: any;
  setApprovalCards: React.Dispatch<React.SetStateAction<ContentApprovalCard[]>>;
  setSubTab: (tab: any) => void;
}

export default function IdeationTab({ userProfile, setApprovalCards, setSubTab }: IdeationTabProps) {
  const hasFetchedRef = useRef(false);
  const librariesLoadedRef = useRef(false);
  const DEFAULT_HUMAN_VOICE_DURATION_SECONDS = 45;

  // 1. AI Campaign Ideation States
  const [campaignInput, setCampaignInput] = useState("");
  const [uploadedDocName, setUploadedDocName] = useState("");
  const [uploadedDocText, setUploadedDocText] = useState("");
  const [uploadedImageBase64, setUploadedImageBase64] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const buildSourceBriefContext = (baseText?: string) => {
    const primaryText = String(baseText || campaignInput || "").trim();
    const parts = [primaryText];

    if (uploadedDocText) {
      parts.push(
        `TÀI LIỆU ĐÍNH KÈM:\nTên tài liệu: ${uploadedDocName || "Tài liệu tải lên"}\nNội dung tài liệu:\n${uploadedDocText}`
      );
    }

    return parts.filter(Boolean).join("\n\n").trim();
  };

  const loadScript = (src: string, globalVar: string): Promise<any> => {
    return new Promise((resolve, reject) => {
      if ((window as any)[globalVar]) {
        resolve((window as any)[globalVar]);
        return;
      }
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve((window as any)[globalVar]));
        existingScript.addEventListener("error", (e) => reject(e));
        return;
      }
      const script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = () => resolve((window as any)[globalVar]);
      script.onerror = (e) => reject(e);
      document.body.appendChild(script);
    });
  };

  const processFile = async (file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      toast.warning("Dung lượng tệp tin không được vượt quá 10MB!");
      return;
    }

    setUploadedDocName(file.name);
    setLoadingDoc(true);
    setUploadedDocText("");
    setUploadedImageBase64("");

    const fileExt = file.name.split(".").pop()?.toLowerCase();
    const isImage = file.type.startsWith("image/");

    if (isImage) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const base64Data = evt.target?.result as string;
        setUploadedImageBase64(base64Data);
        setLoadingDoc(false);
        toast.success("Đã tải hình ảnh lên thành công!");
      };
      reader.onerror = () => {
        setLoadingDoc(false);
        toast.error("Lỗi khi đọc tệp tin hình ảnh.");
      };
      reader.readAsDataURL(file);
    } else if (fileExt === "txt" || fileExt === "md") {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        setUploadedDocText(text);
        setLoadingDoc(false);
        toast.success("Đã trích xuất nội dung văn bản thành công!");
      };
      reader.onerror = () => {
        setLoadingDoc(false);
        toast.error("Lỗi khi đọc file văn bản.");
      };
      reader.readAsText(file);
    } else if (fileExt === "pdf") {
      try {
        const pdfjs = await loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js", "pdfjsLib");
        pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js";

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let extractedText = "";
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const pageText = textContent.items.map((item: any) => item.str).join(" ");
          extractedText += pageText + "\n";
        }
        if (!extractedText.trim()) {
          throw new Error("Không thể trích xuất văn bản từ PDF (tài liệu rỗng hoặc dạng scan ảnh).");
        }
        setUploadedDocText(extractedText);
        setLoadingDoc(false);
        toast.success(`Đã trích xuất tài liệu PDF (${pdf.numPages} trang) thành công!`);
      } catch (err: any) {
        setLoadingDoc(false);
        console.error(err);
        toast.error(err.message || "Lỗi xử lý file PDF.");
      }
    } else if (fileExt === "docx") {
      try {
        const mammoth = await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js", "mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const extractedText = result.value;
        if (!extractedText.trim()) {
          throw new Error("Tài liệu Word trống hoặc không có văn bản.");
        }
        setUploadedDocText(extractedText);
        setLoadingDoc(false);
        toast.success("Đã trích xuất tài liệu Word thành công!");
      } catch (err: any) {
        setLoadingDoc(false);
        console.error(err);
        toast.error(err.message || "Lỗi xử lý file Word.");
      }
    } else {
      setLoadingDoc(false);
      toast.error("Định dạng file không được hỗ trợ. Vui lòng tải hình ảnh, .txt, .md, .pdf hoặc .docx");
    }
  };

  const handleDocumentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleRemoveDocument = () => {
    setUploadedDocName("");
    setUploadedDocText("");
    setUploadedImageBase64("");
    toast.success("Đã gỡ tệp tin đính kèm.");
  };

  const [analyzedTopic, setAnalyzedTopic] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [quickSuggestions, setQuickSuggestions] = useState<string[]>([
    "Chiến dịch khuyến mãi theo mùa để tăng doanh số và thu hút khách hàng mới.",
    "Chương trình tri ân khách hàng thân thiết nhằm củng cố lòng trung thành và khuyến khích mua sắm lặp lại.",
    "Chiến dịch giới thiệu bạn bè để mở rộng tệp khách hàng tiềm năng thông qua mạng lưới hiện có."
  ]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [developingIdx, setDevelopingIdx] = useState<number | null>(null);

  const [isAutoPilot, setIsAutoPilot] = useState(false);
  const [autoPilotStatus, setAutoPilotStatus] = useState<string>("");
  const [autoPilotBackgroundRunning, setAutoPilotBackgroundRunning] = useState(false);

  // Auto-pilot scheduling & integrations configuration
  const tomorrowStr = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [autoScheduleDate, setAutoScheduleDate] = useState(tomorrowStr);
  const [autoScheduleTime, setAutoScheduleTime] = useState("09:00");
  const [autoPublishMode, setAutoPublishMode] = useState<"scheduled" | "instant">("scheduled");
  const [autoPilotProgress, setAutoPilotProgress] = useState(0);
  const [integrationsList, setIntegrationsList] = useState<any[]>([]);
  const [loadingIntegrations, setLoadingIntegrations] = useState(false);
  const [selectedIntegrations, setSelectedIntegrations] = useState<Record<string, string>>({});

  const autoPilotStageCapRef = useRef(10);

  // Smoothly increment progress simulation during autopilot execution
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (loadingAI && isAutoPilot) {
      interval = setInterval(() => {
        setAutoPilotProgress(prev => {
          const cap = autoPilotStageCapRef.current;
          if (prev < cap) {
            return prev + 1;
          } else if (prev < 99) {
            // Slower tick when cap is reached, to show it's still alive and moving
            return Math.random() > 0.85 ? prev + 1 : prev;
          }
          return prev;
        });
      }, 200);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loadingAI, isAutoPilot]);

  const [selectedChannels, setSelectedChannels] = useState<string[]>(["Facebook"]);
  const [mediaType, setMediaType] = useState<string>("image"); // "none" | "image" | "video"

  // Image Options
  const [imageModel, setImageModel] = useState("gemini-banana-flash");
  const [imageResolution, setImageResolution] = useState("1K");
  const [imageAspectRatio, setImageAspectRatio] = useState("1:1");

  // Video Options
  const [videoModel, setVideoModel] = useState("piapi-veo31-video-fast-audio");
  const [videoQuality, setVideoQuality] = useState("720p");
  const [videoDuration, setVideoDuration] = useState("8");
  const [videoAspectRatio, setVideoAspectRatio] = useState("16:9");
  const [selectedHumanAvatar, setSelectedHumanAvatar] = useState("mc-linh");
  const [selectedHumanVoice, setSelectedHumanVoice] = useState("igen-female-bright");
  const [selectedHumanVoiceModel, setSelectedHumanVoiceModel] = useState("eleven_turbo_v2_5");
  const [estimatedHumanVoiceDuration, setEstimatedHumanVoiceDuration] = useState(String(DEFAULT_HUMAN_VOICE_DURATION_SECONDS));
  const [humanVideoAvatars, setHumanVideoAvatars] = useState<HeyGenLibraryItem[]>([]);
  const [humanVideoVoices, setHumanVideoVoices] = useState<any[]>([]);
  const [isLoadingHumanVideoAvatars, setIsLoadingHumanVideoAvatars] = useState(false);
  const [isLoadingHumanVideoVoices, setIsLoadingHumanVideoVoices] = useState(false);
  const [isPreviewingHumanVoice, setIsPreviewingHumanVoice] = useState(false);
  const [humanVoicePreviewCache, setHumanVoicePreviewCache] = useState<Record<string, string>>({});
  const [selectedEngineType, setSelectedEngineType] = useState<string>("avatar_iv");
  const [heygenVoices, setHeygenVoices] = useState<HeyGenLibraryItem[]>([]);
  const [personalHeygenVoices, setPersonalHeygenVoices] = useState<HeyGenLibraryItem[]>([]);
  const [selectedHumanVoiceSource, setSelectedHumanVoiceSource] = useState<"third-party" | "personal">("third-party");
  const [manualInputText, setManualInputText] = useState("");

  const mediaTypeMeta: Record<string, { label: string; tone: string }> = {
    image: {
      label: "Ảnh AI",
      tone: "bg-sky-50 text-sky-700 border-sky-100"
    },
    video: {
      label: "Video AI",
      tone: "bg-amber-50 text-amber-700 border-amber-100"
    },
    "human-video": {
      label: "Video người thật",
      tone: "bg-emerald-50 text-emerald-700 border-emerald-100"
    }
  };

  const [concepts, setConcepts] = useState<MarketingConcept[]>([]);

  const [selectedPillars, setSelectedPillars] = useState<string[]>([
    "Pillar A: Educate & Guides",
    "Pillar B: Storytelling & Social Proof",
    "Pillar C: Offers & Promotions"
  ]);

  const [loadingPillars, setLoadingPillars] = useState(false);
  const [swappingPillarId, setSwappingPillarId] = useState<string | null>(null);
  const [pillars, setPillars] = useState([
    {
      id: "Pillar A: Educate & Guides",
      title: "Pillar A: Educate & Guides",
      ratio: "35% tỉ trọng",
      description: "Chia sẻ kiến thức bổ ích liên quan đến tư thế ngồi gõ bàn phím, hoặc cách tối ưu hóa vận hành hệ thống.",
      colorClass: "border-red-200 bg-red-50/50 text-red-700",
      selectedColorClass: "border-red-500 bg-red-50 text-red-850 ring-2 ring-red-500/20 shadow-xs",
      bulletColor: "bg-red-500",
    },
    {
      id: "Pillar B: Storytelling & Social Proof",
      title: "Pillar B: Storytelling & Social Proof",
      ratio: "40% tỉ trọng",
      description: "Phỏng vấn thực tế khách hàng cũ trung thành đang nâng hiệu suất cùng iGen ERP.",
      colorClass: "border-blue-200 bg-blue-50/50 text-blue-700",
      selectedColorClass: "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20 shadow-xs",
      bulletColor: "bg-blue-500",
    },
    {
      id: "Pillar C: Offers & Promotions",
      title: "Pillar C: Offers & Promotions",
      ratio: "25% tỉ trọng",
      description: "Tạo sự thúc giục bằng cách công bố giờ vàng flash sale khẩn cấp.",
      colorClass: "border-indigo-200 bg-indigo-50/50 text-indigo-700",
      selectedColorClass: "border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20 shadow-xs",
      bulletColor: "bg-indigo-500",
    },
  ]);

  useEffect(() => {
    if (mediaType !== "human-video" || librariesLoadedRef.current) return;
    librariesLoadedRef.current = true;

    const loadHumanVideoLibraries = async () => {
      setIsLoadingHumanVideoAvatars(true);
      setIsLoadingHumanVideoVoices(true);

      try {
        const [heygenLibrary, voiceLibrary] = await Promise.all([
          heygenApi.getLibrary({ force: true }),
          elevenlabsApi.getVoices()
        ]);

        const nextAvatars = heygenLibrary.avatars || [];
        const nextHeygenVoices = heygenLibrary.voices || [];
        const nextPersonalHeygenVoices = heygenLibrary.personalVoices || [];
        const mappedVoices = (voiceLibrary.voices || []).map((voice: any) => ({
          ...voice,
          id: voice.voice_id,
          label: voice.name || "ElevenLabs Voice",
          description: voice.description || voice.category || "ElevenLabs voice"
        }));

        setHumanVideoAvatars(nextAvatars);
        setHeygenVoices(nextHeygenVoices);
        setPersonalHeygenVoices(nextPersonalHeygenVoices);
        setHumanVideoVoices(mappedVoices);

        if (nextAvatars.length > 0) {
          setSelectedHumanAvatar((current) =>
            nextAvatars.some((avatar) => avatar.id === current)
              ? current
              : heygenLibrary.defaults?.avatarId && nextAvatars.some((avatar) => avatar.id === heygenLibrary.defaults?.avatarId)
                ? heygenLibrary.defaults.avatarId
                : nextAvatars[0].id
          );
        }

        if (selectedEngineType === "avatar_iii") {
          setSelectedHumanVoiceSource("personal");
          if (nextPersonalHeygenVoices.length > 0) {
            setSelectedHumanVoice((current) =>
              nextPersonalHeygenVoices.some((voice) => voice.id === current)
                ? current
                : heygenLibrary.defaults?.voiceId && nextPersonalHeygenVoices.some((voice) => voice.id === heygenLibrary.defaults?.voiceId)
                  ? heygenLibrary.defaults.voiceId
                  : nextPersonalHeygenVoices[0].id
            );
          }
        } else {
          if (mappedVoices.length > 0) {
            setSelectedHumanVoice((current) =>
              mappedVoices.some((voice: any) => (voice.voice_id || voice.id) === current)
                ? current
                : mappedVoices[0].voice_id || mappedVoices[0].id || current
            );
          }
        }
      } catch (error) {
        console.error("Failed to load human video libraries:", error);
        librariesLoadedRef.current = false;
      } finally {
        setIsLoadingHumanVideoAvatars(false);
        setIsLoadingHumanVideoVoices(false);
      }
    };

    loadHumanVideoLibraries();
  }, [mediaType]);

  const handleEngineTypeChange = (engine: string) => {
    setSelectedEngineType(engine);
    if (engine === "avatar_iii") {
      setSelectedHumanVoiceSource("personal");
      if (personalHeygenVoices.length > 0) {
        setSelectedHumanVoice(personalHeygenVoices[0].id);
      }
    } else if (selectedHumanVoiceSource === "personal") {
      if (personalHeygenVoices.length > 0) {
        setSelectedHumanVoice((current) => personalHeygenVoices.some((voice) => voice.id === current) ? current : personalHeygenVoices[0].id);
      }
    } else {
      if (humanVideoVoices.length > 0) {
        const firstVoiceId = humanVideoVoices[0].voice_id || humanVideoVoices[0].id;
        setSelectedHumanVoice(firstVoiceId);
      }
    }
  };

  const humanVoicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);

  const playHumanVoicePreview = (url: string) => {
    if (humanVoicePreviewAudioRef.current) {
      humanVoicePreviewAudioRef.current.pause();
    }
    const audio = new Audio(url);
    humanVoicePreviewAudioRef.current = audio;
    void audio.play();
  };

  const handlePreviewHumanVoice = async (voiceId?: string) => {
    const targetVoiceId = voiceId || selectedHumanVoice;
    if (!targetVoiceId) return;

    if (selectedHumanVoiceSource === "personal" || selectedEngineType === "avatar_iii") {
      const personalVoice = personalHeygenVoices.find((voice) => voice.id === targetVoiceId);
      if (personalVoice?.previewAudioUrl) {
        playHumanVoicePreview(personalVoice.previewAudioUrl);
      }
      return;
    }

    const cachedUrl = humanVoicePreviewCache[targetVoiceId];
    if (cachedUrl) {
      playHumanVoicePreview(cachedUrl);
      return;
    }

    setIsPreviewingHumanVoice(true);
    try {
      const humanVideoVoiceBrief = buildHumanVideoVoiceBrief();
      const result = await elevenlabsApi.generateVoice({
        textToSpeak: "Xin chao, day la ban nghe thu giong doc cho video nguoi that.",
        mode: "single",
        temperature: 1.0,
        speakerA: "Aoede",
        speakerB: "Puck",
        modelName: "eleven_multilingual_v2",
        voiceName: targetVoiceId,
        saveToHistory: false
      });

      const previewUrl = result.url || result.record?.url;
      if (previewUrl) {
        setHumanVoicePreviewCache((prev) => ({ ...prev, [targetVoiceId]: previewUrl }));
        playHumanVoicePreview(previewUrl);
      }
    } catch (error: any) {
      toast.error(error.message || "Khong the nghe thu giong doc.");
    } finally {
      setIsPreviewingHumanVoice(false);
    }
  };

  const buildHumanVideoVoiceBrief = () => {
    if (mediaType !== "human-video") return "";
    const normalizedDuration = Math.max(
      1,
      parseInt(estimatedHumanVoiceDuration, 10) || DEFAULT_HUMAN_VOICE_DURATION_SECONDS
    );
    const targetWordCount = Math.max(80, Math.round(normalizedDuration * 2.6));

    const voiceLabel =
      (selectedHumanVoiceSource === "personal"
        ? personalHeygenVoices.find((voice) => voice.id === selectedHumanVoice)?.name
        : humanVideoVoices.find((voice: any) => (voice.voice_id || voice.id) === selectedHumanVoice)?.label) ||
      humanVideoVoices.find((voice: any) => (voice.voice_id || voice.id) === selectedHumanVoice)?.name ||
      selectedHumanVoice;

    const voiceModelLabel =
      selectedHumanVoiceModel === "eleven_flash_v2_5"
        ? "iGen Audio Flash v2.5"
        : "iGen Audio Turbo v2.5";

    return [
      "YÊU CẦU RIÊNG CHO VIDEO NGƯỜI THẬT:",
      `- Hãy phân tích mô tả chiến dịch và viết thành một đoạn lời thoại hoàn chỉnh, tự nhiên, có thể đem đọc trực tiếp.`,
      `- Giọng đọc được chọn: ${voiceLabel}.`,
      `- Model voice được chọn: ${voiceModelLabel}.`,
      `- Thời lượng đọc mục tiêu: khoảng ${normalizedDuration} giây.`,
      `- Độ dài script voice cần được tối ưu để đọc hết trong khoảng ${normalizedDuration} giây, tương đương xấp xỉ ${targetWordCount} từ với tốc độ đọc tự nhiên.`,
      `- Đầu ra ưu tiên là một đoạn voice script hoàn chỉnh để đưa thẳng vào công cụ tạo voice; không viết dạng dàn ý, không chèn bullet, không thêm nhãn MC/Voiceover.`,
      `- Ưu tiên câu ngắn, nhịp đọc rõ, mở đầu cuốn hút, thông điệp chính rõ ràng và kết bằng CTA ngắn gọn.`,
      `- Đầu ra cần ưu tiên dạng script voice hoàn chỉnh trước, sau đó mới đến gợi ý bối cảnh quay nếu cần.`,
      `- BẮT BUỘC viết bằng tiếng Việt có dấu, không được bỏ dấu tiếng Việt.`
    ].join("\n");
  };

  const getHumanVideoScript = (post: any, fallbackTitle: string, fallbackSummary: string) => {
    const directScript = String(post?.voiceScript || "").trim();
    if (directScript) return directScript;

    const outlineText = String(post?.outline || "").trim();
    const bodyText = String(post?.bodyText || "").trim();
    const fallbackParts = [
      `Xin chào, đây là video giới thiệu cho chiến dịch ${fallbackTitle}.`,
      fallbackSummary,
      bodyText,
      "Liên hệ ngay để nhận tư vấn và nhận ưu đãi phù hợp."
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    return (outlineText || fallbackParts).slice(0, 1200);
  };

  const buildHumanVideoVoiceTitle = (campaignTitle: string, channel: string) => {
    const cleanTitle = String(campaignTitle || "").trim() || "noi dung marketing";
    const cleanChannel = String(channel || "").trim() || "marketing";
    return `Voice ${cleanChannel}: ${cleanTitle}`;
  };

  const buildHumanVideoVoiceDescription = (
    campaignTitle: string,
    campaignSummary: string,
    channel: string,
    durationSeconds: number
  ) => {
    const cleanTitle = String(campaignTitle || "").trim();
    const cleanSummary = String(campaignSummary || "").trim();
    const cleanChannel = String(channel || "").trim() || "marketing";
    const normalizedDuration = Math.max(1, durationSeconds || DEFAULT_HUMAN_VOICE_DURATION_SECONDS);

    return [
      `Đọc bằng tiếng Việt có dấu cho nội dung chiến dịch "${cleanTitle}" trên kênh ${cleanChannel}.`,
      cleanSummary ? `Tóm tắt chiến dịch: ${cleanSummary}.` : "",
      `Mục tiêu đọc tự nhiên, liền mạch, âm rõ từng dấu và đúng nhịp khoảng ${normalizedDuration} giây.`,
      "Ưu tiên cách đọc mềm, có ngữ điệu, tránh tách từng cụm từ như robot.",
      "Cần đọc chuẩn dấu tiếng Việt, xử lý đúng tên riêng, địa danh và thông điệp quảng cáo."
    ]
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  };

  const normalizeConceptChannels = (rawChannels: unknown): string[] => {
    const channels = Array.isArray(rawChannels) ? rawChannels : [];
    const normalized = channels
      .map((channel) => String(channel || "").trim())
      .filter(Boolean)
      .map((channel) => {
        const lower = channel.toLowerCase();
        if (lower.includes("facebook") || lower === "fb") return "Facebook";
        if (lower.includes("tiktok") || lower.includes("tik tok")) return "TikTok";
        if (lower.includes("linkedin") || lower.includes("linked in")) return "LinkedIn";
        if (lower.includes("instagram") || lower === "ig" || lower.includes("insta")) return "Instagram";
        if (lower.includes("zalo")) return "Zalo";
        return channel;
      })
      .filter((channel) => channel !== "TikTok")
      .filter((channel, index, arr) => arr.indexOf(channel) === index);

    return normalized.length > 0 ? normalized : [...selectedChannels];
  };

  const normalizeConceptHashtags = (rawHashtags: unknown, title: string): string[] => {
    const hashtags = Array.isArray(rawHashtags) ? rawHashtags : [];
    const normalized = hashtags
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
      .map((tag) => tag.replace(/\s+/g, ""))
      .filter((tag, index, arr) => arr.indexOf(tag) === index);

    if (normalized.length > 0) {
      return normalized.slice(0, 6);
    }

    const fallback = String(title || "")
      .split(/[^A-Za-z0-9À-ỹ]+/)
      .map((part) => part.trim())
      .filter((part) => part.length >= 3)
      .slice(0, 3)
      .map((part) => `#${part}`);

    return fallback.length > 0 ? fallback : ["#Marketing"];
  };

  const normalizeGeneratedConcept = (concept: MarketingConcept, forcedMediaType: string): MarketingConcept => ({
    ...concept,
    title: String(concept?.title || "").trim(),
    summary: String(concept?.summary || "").trim(),
    suggestedContent: String(concept?.suggestedContent || "").trim(),
    matchPercent: Math.max(50, Math.min(100, Number(concept?.matchPercent || 50))),
    channels: normalizeConceptChannels(concept?.channels),
    hashtags: normalizeConceptHashtags(concept?.hashtags, String(concept?.title || "")),
    mediaType: (concept?.mediaType || forcedMediaType) as MarketingConcept["mediaType"],
    mediaPrompt: String(concept?.mediaPrompt || "").trim(),
  });

  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  const pollStandardVideoBackground = async (card: ContentApprovalCard): Promise<ContentApprovalCard> => {
    let currentCard = card;
    let attempts = 0;
    const maxAttempts = 24;
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    while (attempts < maxAttempts) {
      if (!currentCard.videoUrl || !currentCard.videoUrl.startsWith("pending://piapi/")) {
        return currentCard;
      }
      await delay(10000);
      try {
        const freshCard = await marketingService.getCardById(card.id);
        currentCard = freshCard;
      } catch (e) {
        console.error("[pollStandardVideoBackground] error fetching status:", e);
      }
      attempts++;
    }

    if (currentCard.videoUrl && currentCard.videoUrl.startsWith("pending://piapi/")) {
      throw new Error("Hết thời gian chờ kết xuất video AI.");
    }
    return currentCard;
  };

  const runBackgroundMediaGeneration = async (
    cards: ContentApprovalCard[],
    posts: any[],
    concept: MarketingConcept
  ) => {
    const aspectRatio = (videoAspectRatio === "9:16" ? "9:16" : "16:9") as "16:9" | "9:16";

    const promises = cards.map(async (card, idx) => {
      try {
        let updatedCard = card;
        const targetMediaType = concept.mediaType || mediaType;

        if (targetMediaType === "human-video") {
          const post = posts[idx] || {};
          const voiceScript = selectedHumanVoiceSource === "personal" ? (manualInputText || getHumanVideoScript(post, concept.title, concept.summary)) : getHumanVideoScript(post, concept.title, concept.summary);
          const motionText = String(post?.motionText || "").trim();

          updatedCard = await marketingService.generateHumanVideoForCard(card.id, {
            avatarId: selectedHumanAvatar,
            voiceId: selectedHumanVoice,
            voiceModel: selectedHumanVoiceModel,
            inputText: voiceScript,
            usePersonalVoice: selectedHumanVoiceSource === "personal",
            engineType: selectedEngineType,
            aspectRatio,
            quality: videoQuality === "1080p" ? "1080p" : "720p",
          });
        }
        else if (card.videoUrl && card.videoUrl.startsWith("pending://piapi/")) {
          updatedCard = await pollStandardVideoBackground(card);
        }

        const platform = updatedCard.channel;
        const integrationId = selectedIntegrations[platform] || undefined;
        const integration = integrationsList.find(item => item._id === integrationId);

        if (autoPublishMode === "instant") {
          if (platform === "Facebook") {
            const pageToken = integration?.accessToken;
            const pageId = integration?.username;
            if (!pageToken || !pageId) {
              throw new Error("Không lấy được Page Token hoặc Page ID cho tài khoản được chọn.");
            }
            await marketingService.publishToFacebook(
              updatedCard.id,
              pageToken,
              pageId,
              updatedCard.bodyText,
              !!integration?.isMock,
              updatedCard.imageUrl || undefined,
              updatedCard.videoUrl || undefined
            );
          } else if (platform === "TikTok") {
            if (!updatedCard.videoUrl) {
              throw new Error("Bài đăng TikTok cần có video. Hãy tạo video AI trước.");
            }
            const caption = extractDraftContent(updatedCard.bodyText).slice(0, 2200);
            await marketingService.publishToTikTok(
              updatedCard.id,
              caption,
              updatedCard.videoUrl,
              !!integration?.isMock,
              "SELF_ONLY",
              {
                integrationId: integration?._id,
                accessToken: integration?.accessToken,
                username: integration?.username,
              }
            );
          } else {
            await marketingService.updateCard(updatedCard.id, {
              status: 'published',
              publishedAt: new Date().toISOString(),
              integrationId
            });
          }

          const publishedCard = {
            ...updatedCard,
            status: "published" as const,
            publishedAt: new Date().toISOString(),
            integrationId
          };

          setApprovalCards(prev => prev.map(c => c.id === card.id ? publishedCard : c));
          toast.success(`Đã tự động tạo và đăng bài "${card.title}" lên ${card.channel}!`);

        } else {
          const scheduledDate = autoScheduleDate;
          let scheduledTime = autoScheduleTime;
          try {
            const [hStr, mStr] = autoScheduleTime.split(":");
            const startHour = parseInt(hStr);
            const hour = (startHour + idx) % 24;
            scheduledTime = `${hour.toString().padStart(2, '0')}:${mStr}`;
          } catch (e) {
            console.warn("Lỗi tính toán giờ đăng tự động:", e);
          }

          if (platform === "Facebook" || platform === "TikTok") {
            await marketingService.scheduleCard(updatedCard.id, scheduledDate, scheduledTime, integrationId);
          } else {
            await marketingService.updateCard(updatedCard.id, {
              status: 'scheduled',
              scheduledDate,
              scheduledTime,
              integrationId
            });
          }

          const scheduledCard = {
            ...updatedCard,
            status: "scheduled" as const,
            scheduledDate,
            scheduledTime,
            integrationId
          };

          setApprovalCards(prev => prev.map(c => c.id === card.id ? scheduledCard : c));
          toast.success(`Đã tự động tạo và lên lịch bài đăng "${card.title}" trên ${card.channel}!`);
        }

      } catch (err: any) {
        console.error(`[Background Autopilot Error] for card ${card.id}:`, err);
        await marketingService.updateCard(card.id, { status: "failed" });
        setApprovalCards(prev => prev.map(c => c.id === card.id ? { ...c, status: "failed" as const } : c));
        toast.error(`Không thể tạo phương tiện tự động cho bài "${card.title}": ${err.message || err}`);
      }
    });

    await Promise.all(promises);
  };

  // Quick suggestions are now hardcoded as requested, no remote API call needed.

  // Load connected integrations on mount
  useEffect(() => {
    const loadAllIntegrations = async () => {
      setLoadingIntegrations(true);
      try {
        const list = await socialIntegrationService.getIntegrations();
        setIntegrationsList(list.filter(item => item.isConnected));
      } catch (err) {
        console.error("Lỗi khi tải liên kết mạng xã hội:", err);
      } finally {
        setLoadingIntegrations(false);
      }
    };
    loadAllIntegrations();
  }, []);

  // Set default selected integrations when integrationsList is loaded
  useEffect(() => {
    const initialMapping: Record<string, string> = {};
    const platforms = ["Facebook", "TikTok", "Zalo"];
    platforms.forEach(p => {
      const match = integrationsList.find(item => item.platform === p);
      if (match) {
        initialMapping[p] = match._id || "";
      }
    });
    setSelectedIntegrations(prev => ({ ...initialMapping, ...prev }));
  }, [integrationsList]);

  const handleAnalyzePillars = async (rawTopic?: string) => {
    const topic = (typeof rawTopic === "string" ? rawTopic : campaignInput).trim();
    if (!topic) {
      if (!rawTopic) {
        toast.warning("Vui lòng nhập hoặc chọn một chủ đề/mục tiêu chiến dịch trước!");
      }
      return;
    }

    setLoadingPillars(true);
    try {
      let apiTopic = topic;
      if (uploadedDocText) {
        apiTopic = `${topic}\n\nTÀI LIỆU ĐÍNH KÈM:\nTên tài liệu: ${uploadedDocName}\nNội dung tài liệu:\n${uploadedDocText}`;
      }
      const data = await geminiApi.analyzeMarketingPillars(apiTopic, uploadedImageBase64 ? [uploadedImageBase64] : undefined);
      if (data.pillars && Array.isArray(data.pillars) && data.pillars.length > 0) {
        const styles = [
          {
            colorClass: "border-red-200 bg-red-50/50 text-red-700",
            selectedColorClass: "border-red-500 bg-red-50 text-red-850 ring-2 ring-red-500/20 shadow-xs",
            bulletColor: "bg-red-500"
          },
          {
            colorClass: "border-blue-200 bg-blue-50/50 text-blue-700",
            selectedColorClass: "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20 shadow-xs",
            bulletColor: "bg-blue-500"
          },
          {
            colorClass: "border-indigo-200 bg-indigo-50/50 text-indigo-700",
            selectedColorClass: "border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20 shadow-xs",
            bulletColor: "bg-indigo-500"
          }
        ];

        const mappedPillars = data.pillars.map((p: any, idx: number) => ({
          id: p.id,
          title: p.title,
          ratio: p.ratio || "33% tỉ trọng",
          description: p.description,
          ...styles[idx % styles.length]
        }));

        setPillars(mappedPillars);
        setSelectedPillars(mappedPillars.map((p: any) => p.id));
        setAnalyzedTopic(topic);
      }
    } catch (err: any) {
      console.error("Lỗi phân tích Content Pillars:", err);
      toast.error(err.message || "Lỗi phân tích Content Pillars.");
    } finally {
      setLoadingPillars(false);
    }
  };

  const handleSwapPillar = async (pillarIdToReplace: string) => {
    const topic = campaignInput.trim();
    if (!topic) {
      toast.warning("Vui lòng nhập mục tiêu chiến dịch trước khi đổi trụ cột.");
      return;
    }
    setSwappingPillarId(pillarIdToReplace);
    try {
      const originalPillar = pillars.find(p => p.id === pillarIdToReplace);
      const pillarIndex = pillars.findIndex(p => p.id === pillarIdToReplace);

      // Gọi analyzeMarketingPillars với variation hint để lấy bộ pillars mới
      // Dùng biến thể ngẫu nhiên để AI trả về nội dung khác nhau mỗi lần
      const variants = [
        "góc độ khác biệt",
        "hướng tiếp cận mới",
        "phương án thay thế sáng tạo",
        "quan điểm độc đáo hơn",
        "chiến lược nội dung khác"
      ];
      const randomVariant = variants[Math.floor(Math.random() * variants.length)];

      let apiTopic = `${topic} - tập trung vào ${randomVariant}`;
      if (uploadedDocText) {
        apiTopic = `${apiTopic}\n\nTÀI LIỆU ĐÍNH KÈM:\nTên tài liệu: ${uploadedDocName}\nNội dung tài liệu:\n${uploadedDocText}`;
      }

      const data = await geminiApi.analyzeMarketingPillars(
        apiTopic,
        uploadedImageBase64 ? [uploadedImageBase64] : undefined
      );

      if (data.pillars && Array.isArray(data.pillars) && data.pillars.length > 0) {
        // Lấy pillar ở cùng vị trí index, fallback sang pillar đầu tiên
        const targetIdx = pillarIndex >= 0 && pillarIndex < data.pillars.length
          ? pillarIndex
          : 0;
        const rawPillar = data.pillars[targetIdx];

        const newPillar = {
          id: rawPillar.id || `pillar-swap-${Date.now()}`,
          title: rawPillar.title,
          ratio: rawPillar.ratio || (originalPillar ? originalPillar.ratio : "33% tỉ trọng"),
          description: rawPillar.description,
          // Giữ nguyên màu sắc của pillar cũ để UI nhất quán
          colorClass: originalPillar?.colorClass || "border-gray-200 bg-white text-gray-500",
          selectedColorClass: originalPillar?.selectedColorClass || "border-indigo-500 bg-indigo-50 text-indigo-700",
          bulletColor: originalPillar?.bulletColor || "bg-indigo-500",
        };

        setPillars(prev => prev.map(p => p.id === pillarIdToReplace ? newPillar : p));
        setSelectedPillars(prev => {
          if (prev.includes(pillarIdToReplace)) {
            return prev.map(id => id === pillarIdToReplace ? newPillar.id : id);
          }
          return prev;
        });
        toast.success(`Đã đổi sang trụ cột: ${newPillar.title}`);
      } else {
        toast.error("Không thể thay thế trụ cột nội dung.");
      }
    } catch (err: any) {
      console.error("Lỗi thay đổi content pillar:", err);
      toast.error(err.message || "Lỗi khi thay đổi Content Pillar.");
    } finally {
      setSwappingPillarId(null);
    }
  };

  const togglePillar = (id: string) => {
    if (selectedPillars.includes(id)) {
      if (selectedPillars.length === 1) {
        toast.warning("Cần chọn nhất 1 trụ cột nội dung để trợ lý AI định hướng.");
        return;
      }
      setSelectedPillars(selectedPillars.filter(p => p !== id));
    } else {
      setSelectedPillars([...selectedPillars, id]);
    }
  };

  const handleGenerateIdeas = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const topic = campaignInput.trim();
    if (!topic) return;

    if (mediaType === "video") {
      const durVal = parseInt(videoDuration, 10);
      if (!videoDuration || isNaN(durVal) || durVal <= 0) {
        toast.error("Vui lòng nhập thời lượng video hợp lệ.");
        return;
      }
    } else if (mediaType === "human-video") {
      const durVal = parseInt(estimatedHumanVoiceDuration, 10);
      if (!estimatedHumanVoiceDuration || isNaN(durVal) || durVal <= 0) {
        toast.error("Vui lòng nhập thời lượng video người thật hợp lệ.");
        return;
      }
    }

    setLoadingAI(true);
    setAutoPilotProgress(5);
    autoPilotStageCapRef.current = 10;
    setConcepts([]);
    try {
      let apiTopic = topic;
      if (uploadedDocText) {
        apiTopic = `${topic}\n\nTÀI LIỆU ĐÍNH KÈM:\nTên tài liệu: ${uploadedDocName}\nNội dung tài liệu:\n${uploadedDocText}`;
      }

      const voiceBrief = buildHumanVideoVoiceBrief();
      if (voiceBrief) {
        apiTopic = `${apiTopic}\n\n${voiceBrief}`;
      }

      let pillarsToUse = selectedPillars;
      if (isAutoPilot) {
        if (analyzedTopic === topic && selectedPillars.length > 0) {
          // Sử dụng pillars đã phân tích từ trước để tránh gọi lại API trùng lặp
          pillarsToUse = selectedPillars;
        } else {
          setAutoPilotStatus("Đang phân tích định hướng Content Pillars...");
          setAutoPilotProgress(12);
          autoPilotStageCapRef.current = 25;
          try {
            const pillarsData = await geminiApi.analyzeMarketingPillars(apiTopic, uploadedImageBase64 ? [uploadedImageBase64] : undefined);
            if (pillarsData.pillars && Array.isArray(pillarsData.pillars) && pillarsData.pillars.length > 0) {
              const styles = [
                {
                  colorClass: "border-red-200 bg-red-50/50 text-red-700",
                  selectedColorClass: "border-red-500 bg-red-50 text-red-850 ring-2 ring-red-500/20 shadow-xs",
                  bulletColor: "bg-red-500"
                },
                {
                  colorClass: "border-blue-200 bg-blue-50/50 text-blue-700",
                  selectedColorClass: "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20 shadow-xs",
                  bulletColor: "bg-blue-500"
                },
                {
                  colorClass: "border-indigo-200 bg-indigo-50/50 text-indigo-700",
                  selectedColorClass: "border-indigo-500 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-500/20 shadow-xs",
                  bulletColor: "bg-indigo-500"
                }
              ];
              const mappedPillars = pillarsData.pillars.map((p: any, idx: number) => ({
                id: p.id,
                title: p.title,
                ratio: p.ratio || "33% tỉ trọng",
                description: p.description,
                ...styles[idx % styles.length]
              }));
              setPillars(mappedPillars);
              const activePillars = mappedPillars.map((p: any) => p.id);
              setSelectedPillars(activePillars);
              setAnalyzedTopic(topic);
              pillarsToUse = activePillars;
            }
          } catch (pillarErr: any) {
            console.error("Lỗi phân tích pillars tự động:", pillarErr);
            toast.warning("Lỗi phân tích Content Pillars tự động, đang thử lên ý tưởng trực tiếp...");
          }
        }
      }

      setAutoPilotStatus("Đang lên ý tưởng chiến dịch...");
      setAutoPilotProgress(35);
      autoPilotStageCapRef.current = 55;
      const actualMediaType = mediaType;
      const data = await geminiApi.generateMarketingIdeas(apiTopic, pillarsToUse, selectedChannels, actualMediaType, uploadedImageBase64 ? [uploadedImageBase64] : undefined);
      if (data.isMock) {
        console.warn("[IdeationTab] Marketing ideas fallbacked to mock data.");
        toast.warning("AI đang trả về dữ liệu mẫu. Có thể backend vừa fallback sang mock.");
      }

      const generatedConcepts = (data.concepts || [])
        .map((concept: MarketingConcept) => normalizeGeneratedConcept(concept, actualMediaType))
        .filter((concept: MarketingConcept) => concept.title && concept.summary && concept.suggestedContent);
      if (generatedConcepts.length === 0) {
        throw new Error("AI không thể tạo ý tưởng chiến dịch phù hợp.");
      }

      setConcepts(generatedConcepts);

      if (isAutoPilot) {
        setAutoPilotProgress(55);
        autoPilotStageCapRef.current = 90;

        const sortedConcepts = [...generatedConcepts].sort((a: any, b: any) => (b.matchPercent || 0) - (a.matchPercent || 0));
        const bestConcept = sortedConcepts[0];

        setAutoPilotStatus(`Đang tự động viết nội dung chi tiết cho ý tưởng: "${bestConcept.title}"...`);
        setAutoPilotProgress(65);
        const result = await marketingService.developIdea({
          title: bestConcept.title,
          summary: bestConcept.summary,
          suggestedContent: bestConcept.suggestedContent,
          channels: bestConcept.channels,
          mediaType: actualMediaType,
          imageModel,
          imageResolution,
          imageAspectRatio,
          videoModel,
          videoQuality,
          videoDuration: parseInt(videoDuration),
          videoAspectRatio,
          mediaPrompt: bestConcept.mediaPrompt,
          humanVoiceId: selectedHumanVoice,
          humanVoiceModel: selectedHumanVoiceModel,
          humanDurationSeconds: parseInt(estimatedHumanVoiceDuration, 10) || DEFAULT_HUMAN_VOICE_DURATION_SECONDS,
        });

        if (!result || !result.posts || result.posts.length === 0) {
          throw new Error("AI không thể phát triển chi tiết bài viết.");
        }

        const sourceBriefContext = buildSourceBriefContext(bestConcept.title);
        const newCards: ContentApprovalCard[] = result.posts.map((post: any, index: number) => {
          const cardMediaType = bestConcept.mediaType || (actualMediaType as any);
          const voiceScriptVal = cardMediaType === "human-video" ? getHumanVideoScript(post, bestConcept.title, bestConcept.summary) : (post.voiceScript || "");
          const voiceTitleVal = cardMediaType === "human-video"
            ? buildHumanVideoVoiceTitle(bestConcept.title, post.channel)
            : "";
          const voiceDescriptionVal = cardMediaType === "human-video"
            ? buildHumanVideoVoiceDescription(
              bestConcept.title,
              bestConcept.summary,
              post.channel,
              parseInt(estimatedHumanVoiceDuration, 10) || DEFAULT_HUMAN_VOICE_DURATION_SECONDS
            )
            : "";
          return {
            id: `mod_dev_${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}`,
            title: bestConcept.title,
            channel: post.channel as any,
            contentType: post.contentType,
            status: "processing",
            outline: post.outline || "",
            bodyText: post.bodyText || "",
            imageUrl: post.imageUrl || null,
            videoUrl: post.videoUrl || null,
            mediaPrompt: post.mediaPrompt || "",
            voiceScript: voiceScriptVal,
            voiceTitle: voiceTitleVal,
            voiceDescription: voiceDescriptionVal,
            motionText: post.motionText || "",
            generatedAt: new Date().toISOString(),
            authorUid: userProfile?.uid ?? '',
            mediaType: cardMediaType,
            humanDurationSeconds: parseInt(estimatedHumanVoiceDuration, 10) || DEFAULT_HUMAN_VOICE_DURATION_SECONDS,
            referenceImage: uploadedImageBase64 || undefined,
            sourceBrief: sourceBriefContext,
            engineType: cardMediaType === "human-video" ? selectedEngineType : undefined,
            avatarId: cardMediaType === "human-video" ? selectedHumanAvatar : undefined,
            voiceId: cardMediaType === "human-video" ? selectedHumanVoice : undefined,
            inputText: cardMediaType === "human-video" ? voiceScriptVal : undefined,
            usePersonalVoice: cardMediaType === "human-video" ? selectedHumanVoiceSource === "personal" : undefined,
            isNew: true // Đánh dấu card mới phát triển
          };
        });

        setAutoPilotProgress(85);
        autoPilotStageCapRef.current = 95;
        const savedCards = await marketingService.saveCards(newCards);
        setApprovalCards(prev => [...savedCards, ...prev]);

        setAutoPilotProgress(95);
        autoPilotStageCapRef.current = 100;
        void runBackgroundMediaGeneration(savedCards, result.posts, bestConcept);

        setAutoPilotProgress(100);
        // Chờ 800ms để người dùng nhìn thấy tiến trình đạt 100% trước khi chuyển tab
        await new Promise((resolve) => setTimeout(resolve, 800));

        toast.success("Chiến dịch đã khởi chạy! Đang tự động tạo phương tiện truyền thông chạy nền...");
        setSubTab("DUYỆT NỘI DUNG");
      }
    } catch (err: any) {
      console.error(err);
      setConcepts([]);
      toast.error(err.message || "Tự động hóa thất bại. Vui lòng kiểm tra lại cấu hình hoặc số dư ví.");
    } finally {
      setLoadingAI(false);
      setAutoPilotBackgroundRunning(false);
      setAutoPilotStatus("");
      setAutoPilotProgress(0);
    }
  };

  const handleDevelopConcept = async (concept: MarketingConcept, idx: number) => {
    console.log("[handleDevelopConcept] Starting development for concept:", concept.title);

    if (mediaType === "video") {
      const durVal = parseInt(videoDuration, 10);
      if (!videoDuration || isNaN(durVal) || durVal <= 0) {
        toast.error("Vui lòng nhập thời lượng video hợp lệ.");
        return;
      }
    } else if (mediaType === "human-video") {
      const durVal = parseInt(estimatedHumanVoiceDuration, 10);
      if (!estimatedHumanVoiceDuration || isNaN(durVal) || durVal <= 0) {
        toast.error("Vui lòng nhập thời lượng video người thật hợp lệ.");
        return;
      }
    }

    setDevelopingIdx(idx);
    try {
      console.log("[handleDevelopConcept] Calling marketingService.developIdea...");
      const developMediaType = isAutoPilot ? mediaType : (mediaType === "human-video" ? "human-video" : "none");
      const result = await marketingService.developIdea({
        title: concept.title,
        summary: concept.summary,
        suggestedContent: concept.suggestedContent,
        channels: concept.channels,
        mediaType: developMediaType,
        imageModel,
        imageResolution,
        imageAspectRatio,
        videoModel,
        videoQuality,
        videoDuration: parseInt(videoDuration),
        videoAspectRatio,
        mediaPrompt: concept.mediaPrompt,
        humanVoiceId: selectedHumanVoice,
        humanVoiceModel: selectedHumanVoiceModel,
        humanDurationSeconds: parseInt(estimatedHumanVoiceDuration, 10) || DEFAULT_HUMAN_VOICE_DURATION_SECONDS,
      });
      console.log("[handleDevelopConcept] Received result from API:", result);

      if (!result) {
        console.error("[handleDevelopConcept] API returned null/undefined result");
        toast.error("API không phản hồi. Vui lòng thử lại sau.");
        return;
      }
      if (result && result.posts && result.posts.length > 0) {
        const sourceBriefContext = buildSourceBriefContext(concept.title);
        const newCards: ContentApprovalCard[] = result.posts.map((post: any, index: number) => {
          const cardMediaType = concept.mediaType || (mediaType as any);
          return {
            id: `dev_${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}`,
            title: concept.title,
            channel: post.channel as any || "Facebook",
            contentType: post.contentType || "Bài viết truyền thông",
            status: "pending",
            outline: post.outline || "",
            bodyText: post.bodyText || "",
            imageUrl: post.imageUrl || null,
            videoUrl: post.videoUrl || null,
            mediaPrompt: post.mediaPrompt || "",
            voiceScript: post.voiceScript || "",
            voiceTitle: post.voiceTitle || "",
            voiceDescription: post.voiceDescription || "",
            motionText: post.motionText || "",
            generatedAt: new Date().toISOString(),
            authorUid: userProfile?.uid ?? "",
            mediaType: cardMediaType,
            sourceBrief: sourceBriefContext,
            conceptTitle: concept.title,
            conceptSummary: concept.summary || "",
            engineType: cardMediaType === "human-video" ? selectedEngineType : undefined,
            avatarId: cardMediaType === "human-video" ? selectedHumanAvatar : undefined,
            voiceId: cardMediaType === "human-video" ? selectedHumanVoice : undefined,
            inputText: cardMediaType === "human-video" ? (manualInputText || post.voiceScript || "") : undefined,
            usePersonalVoice: cardMediaType === "human-video" ? selectedHumanVoiceSource === "personal" : undefined,
            isNew: true,
          };
        });

        console.log("[handleDevelopConcept] Saving new cards to MongoDB:", newCards);
        const savedCards = await marketingService.saveCards(newCards);
        console.log("[handleDevelopConcept] Cards saved successfully. Updating local state and switching subTab...");
        setApprovalCards(prev => [...savedCards, ...prev]);
        setSubTab("DUYỆT NỘI DUNG");
      } else {
        console.warn("[handleDevelopConcept] Result has no posts:", result);
        const reason = result?.isMock ? "AI đang dùng dữ liệu mẫu (mock)." : "API Gemini không trả về bài viết nào.";
        toast.error(`Không thể tạo nội dung: ${reason}`);
      }
    } catch (e: any) {
      console.error("Lỗi phát triển ý tưởng đa kênh:", e);
      toast.error(e.message || "Lỗi kết nối Trợ lý AI khi lập dàn ý chi tiết.");
    } finally {
      console.log("[handleDevelopConcept] Resetting developing index.");
      setDevelopingIdx(null);
    }
  };

  return (
    <div className="space-y-6" id="ai_marketing_ideas_tab">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="ideation_grid">

        {/* Creator Form */}
        <div className="lg:col-span-2 bg-slate-50 border border-gray-200 p-6 rounded-2xl flex flex-col justify-between relative" id="ideation_campaign_form">
          {loadingAI && isAutoPilot && (
            <div className="absolute inset-0 bg-white/85 backdrop-blur-md flex flex-col items-center justify-center text-center p-6 z-20 rounded-2xl animate-fadeIn">
              <div className="w-12 h-12 rounded-full bg-purple-50 flex items-center justify-center mb-1.5 border border-purple-100 animate-bounce">
                <Sparkles className="h-6 w-6 text-purple-600" />
              </div>
              <h4 className="font-extrabold text-purple-800 text-[11px] tracking-wide uppercase font-mono">
                🤖 Chế độ Auto-pilot đang vận hành...
              </h4>
              
              {/* Circular Progress Ring */}
              <div className="relative w-20 h-20 mt-4 mb-3 flex items-center justify-center">
                {/* Background Circle */}
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    stroke="#F3E8FF"
                    strokeWidth="4.5"
                    fill="transparent"
                  />
                  {/* Progress Circle */}
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    stroke="#9333EA"
                    strokeWidth="4.5"
                    fill="transparent"
                    strokeDasharray={2 * Math.PI * 32}
                    strokeDashoffset={2 * Math.PI * 32 * (1 - autoPilotProgress / 100)}
                    strokeLinecap="round"
                    className="transition-all duration-300 ease-out"
                  />
                </svg>
                {/* Center text with percentage */}
                <div className="absolute flex flex-col items-center justify-center">
                  <span className="text-[15px] font-black text-purple-700 font-mono leading-none">
                    {autoPilotProgress}%
                  </span>
                  <span className="text-[7px] font-extrabold text-purple-400 mt-0.5 uppercase tracking-wider font-mono">
                    TIẾN ĐỘ
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 font-medium leading-relaxed font-sans max-w-sm">
                {autoPilotStatus}
              </p>
              <p className="text-[10px] text-slate-400 mt-1 font-mono italic">
                Hệ thống đang tự động kết nối API Gemini & n8n Scheduler
              </p>
            </div>
          )}
          <div>
            {autoPilotBackgroundRunning && isAutoPilot && (
              <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-left shadow-sm">
                <div className="flex items-center gap-2 text-indigo-700">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-xs font-bold uppercase tracking-wide">
                    Auto-pilot đang chạy nền
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {autoPilotStatus || "AI đang tiếp tục xử lý lưu nội dung, media và lịch đăng."}
                </p>
              </div>
            )}
            <h4 className="font-bold text-gray-850 text-sm tracking-wide font-sans flex items-center gap-1.5 uppercase">
              <Sparkles className="h-4.5 w-4.5 text-indigo-500 animate-pulse" />
              Khởi tạo ý tưởng chiến dịch marketing
            </h4>

            <form onSubmit={handleGenerateIdeas} className="mt-5 space-y-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center select-none">
                  <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider">
                    Mô tả mục tiêu chiến dịch của bạn:
                  </span>
                  {(campaignInput || uploadedDocName) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCampaignInput("");
                        handleRemoveDocument();
                        toast.success("Đã xóa sạch nội dung prompt!");
                      }}
                      className="text-[10px] font-bold font-mono text-red-600 hover:text-red-750 transition-colors flex items-center gap-1 cursor-pointer bg-red-50 hover:bg-red-100/80 px-2.5 py-0.5 rounded border border-red-200/30"
                    >
                      <Trash2 className="h-3 w-3" />
                      Xóa tất cả
                    </button>
                  )}
                </div>

                {/* Unified AI-style prompt box */}
                <div
                  className={`relative flex flex-col bg-white border rounded-2xl transition-all overflow-hidden ${isDragging
                    ? "border-indigo-400 ring-2 ring-indigo-400/20 shadow-md"
                    : "border-gray-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-400/15 hover:border-gray-300"
                    }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <textarea
                    placeholder="Mô tả mục tiêu của bạn (Ex: Khởi động giới thiệu dòng Bàn phím cơ Workspace V2 phân khúc lập trình viên, chiết khấu 10%)..."
                    className="w-full text-left min-h-[100px] max-h-[200px] p-4 pb-2 bg-transparent text-xs font-sans outline-none resize-none"
                    value={campaignInput}
                    onChange={(e) => setCampaignInput(e.target.value)}
                  />

                  {/* Attached file chip - shows between textarea and toolbar */}
                  {uploadedDocName && (
                    <div className="px-3 pb-1.5">
                      <div className="inline-flex items-center gap-2 pl-1.5 pr-1 py-1 bg-slate-50 border border-slate-200 rounded-lg max-w-xs group">
                        <div className="h-7 w-7 rounded-md bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0 overflow-hidden">
                          {uploadedImageBase64 ? (
                            <img src={uploadedImageBase64} alt="Preview" className="h-full w-full object-cover rounded-sm" />
                          ) : (
                            <FileText className="h-3.5 w-3.5 text-indigo-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-semibold text-gray-700 truncate leading-tight">{uploadedDocName}</p>
                          <p className="text-[9px] text-gray-400 font-mono leading-tight">
                            {loadingDoc
                              ? "Đang xử lý..."
                              : uploadedImageBase64
                                ? "Hình ảnh"
                                : "Tài liệu"
                            }
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveDocument}
                          className="p-0.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                          title="Gỡ tệp đính kèm"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Loading indicator */}
                  {loadingDoc && (
                    <div className="flex items-center gap-1.5 px-3.5 pb-1.5 text-indigo-600 text-[10px] font-bold font-mono select-none">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      <span>Đang xử lý dữ liệu...</span>
                    </div>
                  )}

                  {/* Bottom toolbar with attachment icons */}
                  <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-t border-gray-100 bg-gray-50/40">
                    {/* Attach document */}
                    <label
                      className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer group relative"
                      title="Đính kèm tài liệu (PDF, DOCX, TXT, MD)"
                    >
                      <Paperclip className="h-4 w-4" />
                      <input
                        type="file"
                        accept=".txt,.md,.pdf,.docx"
                        onChange={handleDocumentUpload}
                        className="hidden"
                        disabled={loadingDoc}
                      />
                    </label>

                    {/* Attach image */}
                    <label
                      className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer group relative"
                      title="Đính kèm hình ảnh"
                    >
                      <ImageIcon className="h-4 w-4" />
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleDocumentUpload}
                        className="hidden"
                        disabled={loadingDoc}
                      />
                    </label>

                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={(e) => {
                        if (isAutoPilot) {
                          handleGenerateIdeas(e);
                        } else {
                          handleAnalyzePillars();
                        }
                      }}
                      disabled={isAutoPilot 
                        ? (loadingAI || autoPilotBackgroundRunning || !campaignInput.trim())
                        : (loadingPillars || !campaignInput.trim())
                      }
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-bold transition-all ${
                        isAutoPilot
                          ? (loadingAI || autoPilotBackgroundRunning || !campaignInput.trim()
                            ? "bg-gray-50 text-gray-400 border-gray-250 cursor-not-allowed opacity-75"
                            : "bg-purple-50 hover:bg-purple-100 text-purple-750 border-purple-150 cursor-pointer active:scale-98 shadow-2xs")
                          : (loadingPillars || !campaignInput.trim()
                            ? "bg-gray-50 text-gray-400 border-gray-250 cursor-not-allowed"
                            : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-150 cursor-pointer active:scale-98")
                        }`}
                    >
                      {isAutoPilot ? (
                        <>
                          <Zap className={`h-3.5 w-3.5 text-purple-600 ${loadingAI || autoPilotBackgroundRunning ? "animate-spin" : ""}`} />
                          <span>{loadingAI || autoPilotBackgroundRunning ? "Đang chạy..." : "Khởi chạy Tự động 1-Click"}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className={`h-3.5 w-3.5 text-indigo-500 ${loadingPillars ? "animate-spin" : ""}`} />
                          <span>{loadingPillars ? "Đang phân tích..." : "Phân tích Mục tiêu AI"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              {!isAutoPilot && campaignInput.trim() && campaignInput.trim() !== analyzedTopic.trim() && (
                <p className="text-[10px] text-amber-600 font-bold font-mono tracking-wide animate-pulse mt-1 select-none text-left">
                  ⚠️ Bạn đã thay đổi nội dung mục tiêu. Vui lòng bấm "Phân tích Mục tiêu & Đề xuất Trụ cột AI" ở cột bên phải trước để cập nhật định hướng trước khi phát sinh ý tưởng!
                </p>
              )}

              {/* Quick suggestions chips bubble list */}
              <div className="space-y-1.5 font-sans">
                <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider block">Gợi ý chủ đề nhanh:</span>
                <div className="flex flex-wrap gap-2">
                  {loadingSuggestions ? (
                    <>
                      <div className="px-2.5 py-1 text-[10px] rounded-md border border-gray-100 bg-slate-50 text-gray-400 flex items-center gap-1.5 animate-pulse select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                        <span>Gợi ý 1 đang tải...</span>
                      </div>
                      <div className="px-2.5 py-1 text-[10px] rounded-md border border-gray-100 bg-slate-50 text-gray-400 flex items-center gap-1.5 animate-pulse select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                        <span>Gợi ý 2 đang tải...</span>
                      </div>
                      <div className="px-2.5 py-1 text-[10px] rounded-md border border-gray-100 bg-slate-50 text-gray-400 flex items-center gap-1.5 animate-pulse select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                        <span>Gợi ý 3 đang tải...</span>
                      </div>
                    </>
                  ) : (
                    quickSuggestions.map((s, idx) => {
                      const isMatch = campaignInput === s;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            setCampaignInput(s);
                          }}
                          className={`px-2.5 py-1 text-[10px] rounded-md font-medium transition-all cursor-pointer select-none border ${isMatch
                            ? "bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-xs transform scale-102 font-semibold"
                            : "bg-white hover:bg-slate-100 text-gray-600 border-gray-200"
                            }`}
                        >
                          {s}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Platform Selector */}
              <div className="space-y-2 text-left mt-4">
                <span className="text-xs font-bold text-gray-750 block uppercase tracking-wider font-mono">
                  📢 Chọn nền tảng truyền thông:
                </span>
                <div className="flex flex-wrap gap-2.5">
                  {[
                    { id: "Facebook", icon: <Facebook className="h-3.5 w-3.5" />, disabled: false },
                    { id: "Zalo", icon: <span className="font-bold text-[10px] font-mono leading-none">ZL</span>, disabled: true },
                    { id: "TikTok", icon: <span className="font-bold text-[10px] font-mono leading-none">TT</span>, disabled: false }
                  ].map((chan) => {
                    const isSelected = selectedChannels.includes(chan.id);
                    return (
                      <button
                        key={chan.id}
                        type="button"
                        disabled={chan.disabled}
                        onClick={() => {
                          if (chan.disabled) {
                            toast.warning(`${chan.id} đang được tắt tạm thời.`);
                            return;
                          }
                          if (isSelected) {
                            if (selectedChannels.length === 1) {
                              toast.warning("Bạn phải chọn ít nhất một nền tảng!");
                              return;
                            }
                            setSelectedChannels(selectedChannels.filter(c => c !== chan.id));
                          } else {
                            setSelectedChannels([...selectedChannels, chan.id]);
                          }
                        }}
                        title={chan.disabled ? `${chan.id} tạm thời chưa khả dụng` : undefined}
                        className={`px-3.5 py-2 text-xs font-bold rounded-xl border transition-all flex items-center gap-2 select-none ${chan.disabled
                          ? "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-70"
                          : isSelected
                            ? "border-indigo-650 bg-indigo-50 text-indigo-750 shadow-sm ring-2 ring-indigo-550/15 cursor-pointer hover:bg-indigo-100"
                            : "border-slate-200 bg-white text-gray-500 hover:bg-slate-100 cursor-pointer"
                          }`}
                      >
                        {chan.icon}
                        <span>{chan.id}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Auto-pilot completely automated flow */}
              <div className="flex flex-col gap-3 mt-5 select-none bg-purple-50/40 p-4 border border-purple-150 rounded-2xl">
                <label className="relative flex items-start cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isAutoPilot}
                    onChange={(e) => setIsAutoPilot(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="relative shrink-0 w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-purple-650 peer-checked:bg-purple-600 font-sans mt-[1px]"></div>
                  <span className="ml-2.5 text-xs font-bold text-gray-750 uppercase tracking-wider font-mono text-purple-700 select-none leading-relaxed">
                    🤖 Chế độ Tự động hoàn toàn (Auto-pilot: Ý tưởng → Viết bài → Đặt lịch đăng)
                  </span>
                </label>

                {isAutoPilot && (
                  <div className="mt-2.5 border-t border-purple-200/50 pt-3.5 space-y-3.5 text-left animate-fadeIn">
                    {/* Switch: Lên lịch vs Đăng ngay */}
                    <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-purple-100 shadow-3xs">
                      <span className="text-xs font-bold text-gray-700 font-sans">Chế độ xuất bản:</span>
                      <div className="flex rounded-lg bg-slate-100 p-0.5">
                        <button
                          type="button"
                          onClick={() => setAutoPublishMode("scheduled")}
                          className={`px-3.5 py-1.5 text-[10.5px] font-bold rounded-lg transition-all ${autoPublishMode === "scheduled"
                            ? "bg-white text-purple-700 shadow-xs"
                            : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                          Lên lịch đăng
                        </button>
                        <button
                          type="button"
                          onClick={() => setAutoPublishMode("instant")}
                          className={`px-3.5 py-1.5 text-[10.5px] font-bold rounded-lg transition-all ${autoPublishMode === "instant"
                            ? "bg-white text-purple-700 shadow-xs"
                            : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                          Đăng ngay
                        </button>
                      </div>
                    </div>

                    {autoPublishMode === "scheduled" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                        {/* Scheduled Date */}
                        <div className="space-y-1.5">
                          <label className="block text-gray-500 font-bold text-[10px] uppercase font-mono">Ngày đăng bài *</label>
                          <input
                            type="date"
                            required
                            className="w-full p-2.5 border border-slate-200 bg-white rounded-lg text-xs font-mono focus:ring-1 focus:ring-purple-500 outline-none"
                            value={autoScheduleDate}
                            onChange={(e) => setAutoScheduleDate(e.target.value)}
                          />
                        </div>

                        {/* Scheduled Time */}
                        <div className="space-y-1.5">
                          <label className="block text-gray-500 font-bold text-[10px] uppercase font-mono">Giờ đăng bài *</label>
                          <input
                            type="time"
                            required
                            className="w-full p-2.5 border border-slate-200 bg-white rounded-lg text-xs font-mono focus:ring-1 focus:ring-purple-500 outline-none"
                            value={autoScheduleTime}
                            onChange={(e) => setAutoScheduleTime(e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {/* Integrations Selectors */}
                    <div className="space-y-3">
                      {selectedChannels.map(channel => {
                        if (channel !== "Facebook" && channel !== "TikTok") return null;
                        const platform = channel;
                        const available = integrationsList.filter(item => item.platform === platform);
                        const selectedVal = selectedIntegrations[platform] || "";

                        return (
                          <div key={platform} className="space-y-1.5">
                            <label className="block text-gray-655 font-bold text-[10px] uppercase font-mono">
                              Chọn tài khoản {platform} đăng bài *
                            </label>
                            {loadingIntegrations ? (
                              <div className="p-2 border border-slate-200 rounded-lg text-xs text-gray-400 bg-white">
                                Đang tải danh sách tài khoản...
                              </div>
                            ) : available.length > 0 ? (
                              <select
                                className="w-full p-2.5 border border-slate-200 rounded-lg bg-white text-xs focus:ring-1 focus:ring-purple-500 outline-none font-medium text-gray-750"
                                value={selectedVal}
                                onChange={(e) => setSelectedIntegrations(prev => ({ ...prev, [platform]: e.target.value }))}
                              >
                                {available.map(item => (
                                  <option key={item._id} value={item._id}>
                                    {item.displayName}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <div className="p-2.5 border border-amber-250 bg-amber-50 text-amber-800 rounded-lg text-[10px] leading-normal font-sans">
                                ⚠️ Chưa có tài khoản {platform} nào được liên kết. Vui lòng vào Cài đặt &rarr; Liên kết mạng xã hội để kết nối trước khi đặt lịch.
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Media Type Selection */}
              <div className="space-y-2 text-left mt-4 animate-fadeIn">
                <span className="text-xs font-bold text-gray-750 block uppercase tracking-wider font-mono">
                  🖼️ Chọn loại phương tiện (Media):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { value: "image", label: "Hình ảnh AI", icon: <ImageIcon className="h-3.5 w-3.5" /> },
                    { value: "video", label: "Video AI", icon: <Video className="h-3.5 w-3.5" /> },
                    { value: "human-video", label: "Video người thật", icon: <Video className="h-3.5 w-3.5" /> }
                  ].map((opt) => {
                    const isSelected = mediaType === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMediaType(opt.value)}
                        className={`py-2.5 text-xs font-extrabold rounded-2xl border transition-all flex items-center justify-center gap-2 cursor-pointer select-none ${isSelected
                          ? "border-indigo-500 bg-indigo-50/50 text-indigo-750 shadow-2xs ring-2 ring-indigo-500/10"
                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:border-slate-350"
                          }`}
                      >
                        {opt.icon}
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration selection exposed manually for video tabs */}
              {(mediaType === "video" || mediaType === "human-video") && (
                <div className="space-y-2.5 text-left mt-4 animate-fadeIn p-4 border border-slate-200 bg-white rounded-2xl shadow-2xs">
                  <span className="text-xs font-bold text-gray-750 block uppercase tracking-wider font-mono flex items-center gap-1.5">
                    ⏱️ Thời lượng video (giây):
                  </span>
                  <div className="flex flex-wrap gap-2 items-center">
                    {(mediaType === "video" ? ["8", "16", "24", "32"] : ["4", "6", "8"]).map((dur) => {
                      const isSelected =
                        mediaType === "video"
                          ? (videoDuration === dur)
                          : (estimatedHumanVoiceDuration === dur);
                      return (
                        <button
                          key={dur}
                          type="button"
                          onClick={() => {
                            if (mediaType === "video") {
                              setVideoDuration(dur);
                              if (parseInt(dur) <= 4 && videoQuality === "1080p") {
                                setVideoQuality("720p");
                                toast.warning("1080p yêu cầu tối thiểu 6 giây. Đã tự động chuyển sang 720p.");
                              }
                            } else {
                              setEstimatedHumanVoiceDuration(dur);
                            }
                          }}
                          className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${isSelected
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700 shadow-2xs ring-2 ring-indigo-500/10 font-extrabold"
                            : "border-slate-200 bg-white text-gray-500 hover:bg-slate-50 hover:border-slate-350"
                            }`}
                        >
                          {dur}s
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => {
                        if (mediaType === "video") {
                          if (["8", "16", "24", "32"].includes(videoDuration)) {
                            setVideoDuration("40"); // Default custom value for Video AI
                          }
                        } else {
                          if (["4", "6", "8"].includes(estimatedHumanVoiceDuration)) {
                            setEstimatedHumanVoiceDuration(String(DEFAULT_HUMAN_VOICE_DURATION_SECONDS)); // Default custom value for Human Video
                          }
                        }
                      }}
                      className={`px-4 py-2 text-xs font-bold rounded-xl border transition-all cursor-pointer ${(mediaType === "video" ? !["8", "16", "24", "32"].includes(videoDuration) : !["4", "6", "8"].includes(estimatedHumanVoiceDuration))
                        ? "border-indigo-500 bg-indigo-50 text-indigo-755 shadow-2xs ring-2 ring-indigo-500/10 font-extrabold"
                        : "border-slate-200 bg-white text-gray-500 hover:bg-slate-50 hover:border-slate-350"
                        }`}
                    >
                      Khác
                    </button>

                    {mediaType === "video" && !["8", "16", "24", "32"].includes(videoDuration) && (
                      <div className="flex items-center gap-1.5 ml-2">
                        <input
                          type="number"
                          min="0"
                          step="8"
                          value={videoDuration}
                          onChange={(e) => {
                            let val = e.target.value.replace(/[^0-9]/g, "");
                            if (!val) {
                              setVideoDuration("");
                              return;
                            }
                            let num = parseInt(val, 10);
                            if (num < 1) {
                              num = 1;
                            }
                            setVideoDuration(String(num));
                          }}
                          onBlur={(e) => {
                            let num = parseInt(videoDuration, 10);
                            if (isNaN(num) || num < 1) {
                              setVideoDuration("8");
                            }
                          }}
                          placeholder="Thời lượng"
                          className="w-24 text-xs p-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center font-bold"
                        />
                        <span className="text-xs text-gray-500 font-bold">giây </span>
                      </div>
                    )}

                    {mediaType === "human-video" && !["4", "6", "8"].includes(estimatedHumanVoiceDuration) && (
                      <div className="flex items-center gap-1.5 ml-2">
                        <input
                          type="number"
                          min="1"
                          max={600}
                          value={estimatedHumanVoiceDuration}
                          onChange={(e) => {
                            let val = e.target.value.replace(/[^0-9]/g, "");
                            if (!val) {
                              setEstimatedHumanVoiceDuration("");
                              return;
                            }
                            let num = parseInt(val, 10);
                            if (num > 600) {
                              num = 600;
                              toast.warning("Video người thật chỉ hỗ trợ thời lượng tối đa 600 giây (10 phút).");
                            } else if (num < 1) {
                              num = 1;
                            }
                            setEstimatedHumanVoiceDuration(String(num));
                          }}
                          placeholder="Nhập số giây"
                          className="w-24 text-xs p-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center font-bold"
                        />
                        <span className="text-xs text-gray-500 font-bold">giây (tối đa 600s)</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Image Settings */}
              {isAutoPilot && mediaType === "image" && (
                <div className="p-4 border border-slate-200 bg-white rounded-2xl space-y-4 text-left mt-4 shadow-2xs">
                  <span className="text-xs font-extrabold text-slate-800 block border-b pb-2 uppercase tracking-wide font-mono flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-indigo-500" />
                    Cấu hình hình ảnh AI
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-gray-500 font-mono">Mô hình AI</span>
                      <select
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value)}
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                      >
                        <option value="gemini-banana-flash">iGen Gemini 3 Flash</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-gray-500 font-mono">Độ phân giải</span>
                      <div className="grid grid-cols-1 gap-2">
                        <button
                          type="button"
                          className="py-1.5 text-xs font-bold rounded-lg border border-indigo-500 bg-indigo-50 text-indigo-700 cursor-default"
                        >
                          1K Standard
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <span className="text-xs font-bold text-gray-500 font-mono block">Tỉ lệ khung hình</span>
                    <div className="grid grid-cols-5 gap-2">
                      {["1:1", "4:3", "16:9", "9:16", "3:4"].map((ratio) => (
                        <button
                          key={ratio}
                          type="button"
                          onClick={() => setImageAspectRatio(ratio)}
                          className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${imageAspectRatio === ratio
                            ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                            : "border-slate-200 bg-white text-gray-500 hover:bg-slate-50"
                            }`}
                        >
                          {ratio}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Video Settings */}
              {isAutoPilot && mediaType === "video" && (
                <div className="p-4 border border-slate-200 bg-white rounded-2xl space-y-4 text-left mt-4 shadow-2xs">
                  <span className="text-xs font-extrabold text-slate-800 block border-b pb-2 uppercase tracking-wide font-mono flex items-center gap-1.5">
                    <Video className="h-4 w-4 text-indigo-500" />
                    Cấu hình video AI
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-gray-500 font-mono">Mô hình AI Video</span>
                      <select
                        value={videoModel}
                        onChange={(e) => setVideoModel(e.target.value)}
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                      >
                        <option value="piapi-veo31-video-fast-audio">iGen video 3.1 Fast</option>
                        <option value="piapi-veo31-video-audio">iGen video 3.1</option>
                        <option value="piapi-veo31-video-fast-no-audio">iGen video 3.1 Fast Silent</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-gray-500 font-mono">Chất lượng video</span>
                      <select
                        value={videoQuality}
                        onChange={(e) => {
                          if (e.target.value === "1080p" && parseInt(videoDuration) <= 4) {
                            toast.warning("1080p không hỗ trợ cho video 4 giây. Vui lòng chọn 6 hoặc 8 giây trước.");
                            return;
                          }
                          setVideoQuality(e.target.value);
                        }}
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                      >
                        <option value="720p">720p (HD)</option>
                        <option value="1080p">1080p (Full HD)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-gray-500 font-mono block">Tỉ lệ khung hình</span>
                      <div className="grid grid-cols-2 gap-2">
                        {["16:9", "9:16"].map((ratio) => (
                          <button
                            key={ratio}
                            type="button"
                            onClick={() => setVideoAspectRatio(ratio)}
                            className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer ${videoAspectRatio === ratio
                              ? "border-indigo-500 bg-indigo-50 text-indigo-700 font-extrabold"
                              : "border-slate-200 bg-white text-gray-500 hover:bg-slate-50"
                              }`}
                          >
                            {ratio === "16:9" ? "Ngang 16:9" : "Dọc 9:16"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {/* Human Video Settings */}
              {mediaType === "human-video" && (
                <HumanVideoSettingsCard
                  selectedAvatar={selectedHumanAvatar}
                  selectedVoice={selectedHumanVoice}
                  selectedVoiceModel={selectedHumanVoiceModel}
                  selectedVoiceSource={selectedHumanVoiceSource}
                  estimatedDurationSeconds={estimatedHumanVoiceDuration}
                  avatars={humanVideoAvatars}
                  voices={humanVideoVoices}
                  personalVoices={personalHeygenVoices}
                  heygenVoices={heygenVoices}
                  isLoadingAvatars={isLoadingHumanVideoAvatars}
                  isLoadingVoices={isLoadingHumanVideoVoices}
                  isPreviewingVoice={isPreviewingHumanVoice}
                  onAvatarChange={setSelectedHumanAvatar}
                  onVoiceChange={setSelectedHumanVoice}
                  onVoiceSourceChange={(value) => {
                    setSelectedHumanVoiceSource(value);
                    if (value === "personal") {
                      const allHeygen = [...personalHeygenVoices, ...heygenVoices];
                      if (allHeygen.length > 0) {
                        setSelectedHumanVoice((current) => allHeygen.some((voice) => voice.id === current) ? current : allHeygen[0].id);
                      }
                    } else if (humanVideoVoices.length > 0) {
                      setSelectedHumanVoice((current) => humanVideoVoices.some((voice: any) => (voice.voice_id || voice.id) === current) ? current : (humanVideoVoices[0].voice_id || humanVideoVoices[0].id || current));
                    }
                  }}
                  onVoiceModelChange={setSelectedHumanVoiceModel}
                  onEstimatedDurationChange={(value) => {
                    if (!value.trim()) {
                      setEstimatedHumanVoiceDuration("");
                      return;
                    }
                    const normalizedValue = String(Math.min(600, Math.max(1, parseInt(value, 10) || DEFAULT_HUMAN_VOICE_DURATION_SECONDS)));
                    setEstimatedHumanVoiceDuration(normalizedValue);
                  }}
                  onPreviewVoice={handlePreviewHumanVoice}
                  selectedEngineType={selectedEngineType}
                  onEngineTypeChange={handleEngineTypeChange}
                  isAutoPilot={isAutoPilot}
                  inputText={manualInputText}
                  onInputTextChange={setManualInputText}
                />
              )}
            </form>
          </div>

          <div className="mt-6 pt-4 border-t border-gray-200 flex items-center justify-between gap-4">
            {isAutoPilot && (
              <div className="flex-1 text-left text-[11px] text-purple-750 bg-purple-50 border border-purple-100 p-2 px-3 rounded-xl flex items-center gap-1.5 font-medium animate-fadeIn">
                <span>💡 <b>Quy trình 1-Click:</b> AI sẽ tự động phân tích Pillar, viết nội dung, tạo ảnh/video và tự động xuất bản lên các kênh đã cấu hình.</span>
              </div>
            )}
            <button
              onClick={handleGenerateIdeas}
              disabled={loadingAI || autoPilotBackgroundRunning || !campaignInput.trim() || (!isAutoPilot && campaignInput.trim() !== analyzedTopic.trim())}
              className={`px-5 py-2.5 rounded-xl text-xs font-bold font-sans flex items-center gap-2 select-none shadow-sm transition-all shrink-0 ${loadingAI || autoPilotBackgroundRunning || !campaignInput.trim() || (!isAutoPilot && campaignInput.trim() !== analyzedTopic.trim())
                ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                : isAutoPilot 
                  ? "bg-purple-600 hover:bg-purple-750 text-white cursor-pointer active:scale-95 shadow-md shadow-purple-500/10"
                  : "bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer active:scale-95"
                }`}
            >
              {loadingAI || autoPilotBackgroundRunning ? <RefreshCw className="h-4 w-4 animate-spin" /> : isAutoPilot ? <Zap className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              {loadingAI ? "AI Đang sáng tạo..." : isAutoPilot ? "Khởi chạy Chiến dịch Tự động" : "Phát sinh Ý tưởng từ AI"}
            </button>
          </div>
        </div>

        {/* Content Pillars guidelines panel */}
        <div className="bg-white border p-6 rounded-2xl flex flex-col justify-between" id="content_pillars_advisory">
          <div>
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-gray-850 text-sm tracking-wide font-sans uppercase">
                📚 Content Pillars Đề xuất
              </h4>
              <button
                type="button"
                onClick={() => handleAnalyzePillars()}
                disabled={loadingPillars || !campaignInput.trim()}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${loadingPillars || !campaignInput.trim()
                  ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                  : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 hover:border-indigo-300 active:scale-95 cursor-pointer shadow-xs"
                  }`}
                title="Tạo lại content pillars"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingPillars ? "animate-spin" : ""}`} />
                <span>Tạo lại</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 mb-4">Phân tích mục tiêu để đề xuất ra các trụ cột nội dung cốt lõi của chiến dịch, đảm bảo phân bổ đa dạng:</p>

            <div className="space-y-3 text-xs text-left relative">
              {loadingPillars && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4 z-10 rounded-xl">
                  <RefreshCw className="h-6 w-6 text-indigo-600 animate-spin mb-2" />
                  <span className="text-[11px] text-indigo-800 font-bold font-mono">AI ĐANG PHÂN TÍCH KHUNG NỘI DUNG...</span>
                  <p className="text-[10px] text-gray-400 mt-1">Đảm bảo khung tranh phân phối đa dạng, tránh chỉ đăng tải bán hàng.</p>
                </div>
              )}

              {pillars.map((pillar) => {
                const isSelected = selectedPillars.includes(pillar.id);
                const isSwapping = swappingPillarId === pillar.id;
                return (
                  <div
                    key={pillar.id}
                    onClick={() => {
                      if (isSwapping) return;
                      togglePillar(pillar.id);
                    }}
                    className={`relative p-3.5 border rounded-xl cursor-pointer transition-all ${isSelected
                      ? pillar.selectedColorClass
                      : `${pillar.colorClass} opacity-50 hover:opacity-85`
                      } ${isSwapping ? "pointer-events-none" : ""}`}
                  >
                    {isSwapping && (
                      <div className="absolute inset-0 bg-white/70 backdrop-blur-3xs flex flex-col items-center justify-center text-center p-2 z-10 rounded-xl">
                        <RefreshCw className="h-4 w-4 text-indigo-600 animate-spin" />
                        <span className="text-[9px] text-indigo-850 font-bold mt-1 font-mono uppercase tracking-wide">ĐANG ĐỔI...</span>
                      </div>
                    )}
                    <div className="flex justify-between items-start gap-2 font-bold">
                      <span className="flex items-start gap-1.5 text-xs text-slate-800 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-0.5 ${pillar.bulletColor}`} />
                        <span>{pillar.title}</span>
                      </span>
                      <span className="text-[10px] opacity-80 font-mono font-semibold text-slate-500 whitespace-nowrap shrink-0">{pillar.ratio}</span>
                    </div>
                    <p className="text-[10px] mt-2 leading-relaxed text-slate-500 font-sans pointer-events-none">
                      {pillar.description}
                    </p>
                    <div className="mt-3 flex items-center justify-between text-[9px] font-mono uppercase font-bold tracking-wider">
                      <span className={isSelected ? "text-indigo-650 font-semibold" : "text-gray-400"}>
                        {isSelected ? "● Đang tuyển chọn" : "○ Tạm tắt"}
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSwapping) return;
                          handleSwapPillar(pillar.id);
                        }}
                        className="text-slate-400 hover:text-indigo-600 hover:font-bold transition-all cursor-pointer"
                      >
                        Click để đổi
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 text-center text-[10px] text-gray-400 font-mono">
            Phân tích bởi iGen Marketing Advisor
          </div>
        </div>

      </div>

      {/* Campaign concepts generator list */}
      <div className="space-y-4" id="campaign_draft_concepts_section">
        <span className="text-[10px] font-bold text-gray-500 font-mono uppercase tracking-wider block">Bản nháp ý tưởng sáng tạo ({concepts.length})</span>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" id="concepts_container">
          {concepts.map((concept, idx) => (
            <div key={idx} className="p-3.5 bg-white border border-gray-250/70 hover:border-indigo-300 rounded-2xl transition-all shadow-xs text-left flex flex-col justify-between min-w-0 overflow-hidden" id={`concept_card_${idx}`}>
              {(() => {
                const activeMediaMeta = mediaTypeMeta[concept.mediaType || mediaType] || mediaTypeMeta.image;
                return (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide shrink-0 ${activeMediaMeta.tone}`}>
                      {activeMediaMeta.label}
                    </span>
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-full font-bold font-mono text-[9px] whitespace-nowrap shrink-0">
                      Phù hợp: {concept.matchPercent}%
                    </span>
                  </div>
                );
              })()}
              <div className="min-w-0">
                <span className="text-[11px] font-bold text-slate-800 font-sans tracking-tight leading-snug line-clamp-2 block">{concept.title}</span>

                <p className="text-[11px] text-gray-500 mt-1.5 leading-relaxed line-clamp-3">{concept.summary}</p>

                <div className="flex flex-wrap gap-1 mt-2">
                  {concept.channels.map((chan, cidx) => (
                    <span key={cidx} className="px-1.5 py-0.5 bg-slate-50 border border-gray-150 rounded-sm text-[8px] font-mono text-slate-500 uppercase tracking-wide">
                      {chan}
                    </span>
                  ))}
                </div>

                {concept.hashtags && concept.hashtags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 overflow-hidden max-h-[36px]">
                    {concept.hashtags.map((tag, tidx) => (
                      <span key={tidx} className="text-[9px] font-mono text-indigo-500 font-semibold">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-5 border-t border-slate-100 pt-4 bg-slate-50/50 p-4 rounded-xl border border-dashed border-slate-200">
                <div className="flex items-center gap-1.5 text-indigo-600 font-bold mb-1.5">
                  <Zap className="h-3.5 w-3.5" />
                  <span className="text-[10px] font-mono uppercase">Mẫu Content sinh ra từ AI:</span>
                </div>
                <p className="text-xs text-gray-600 line-clamp-3 italic leading-relaxed font-sans">{concept.suggestedContent}</p>

                <div className="mt-3.5 flex justify-end gap-2 text-xs">
                  <button
                    onClick={() => handleDevelopConcept(concept, idx)}
                    disabled={developingIdx !== null}
                    className={`px-3 py-1.5 text-white rounded-lg font-bold select-none text-[10px] transition-all transform hover:scale-105 active:scale-95 cursor-pointer flex items-center gap-1 ${developingIdx === idx ? "bg-purple-600 hover:bg-purple-700 animate-pulse" : "bg-indigo-600 hover:bg-indigo-750"
                      }`}
                  >
                    {developingIdx === idx ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        <span>Đang viết chi tiết...</span>
                      </>
                    ) : (
                      <>
                        <span>Phát triển tiếp 🚀</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
