/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars, prefer-const, react-hooks/exhaustive-deps */
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
        `TÃ€I LIá»†U ÄÃNH KÃˆM:\nTÃªn tÃ i liá»‡u: ${uploadedDocName || "TÃ i liá»‡u táº£i lÃªn"}\nNá»™i dung tÃ i liá»‡u:\n${uploadedDocText}`
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
      toast.warning("Dung lÆ°á»£ng tá»‡p tin khÃ´ng Ä‘Æ°á»£c vÆ°á»£t quÃ¡ 10MB!");
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
        toast.success("ÄÃ£ táº£i hÃ¬nh áº£nh lÃªn thÃ nh cÃ´ng!");
      };
      reader.onerror = () => {
        setLoadingDoc(false);
        toast.error("Lá»—i khi Ä‘á»c tá»‡p tin hÃ¬nh áº£nh.");
      };
      reader.readAsDataURL(file);
    } else if (fileExt === "txt" || fileExt === "md") {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        setUploadedDocText(text);
        setLoadingDoc(false);
        toast.success("ÄÃ£ trÃ­ch xuáº¥t ná»™i dung vÄƒn báº£n thÃ nh cÃ´ng!");
      };
      reader.onerror = () => {
        setLoadingDoc(false);
        toast.error("Lá»—i khi Ä‘á»c file vÄƒn báº£n.");
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
          throw new Error("KhÃ´ng thá»ƒ trÃ­ch xuáº¥t vÄƒn báº£n tá»« PDF (tÃ i liá»‡u rá»—ng hoáº·c dáº¡ng scan áº£nh).");
        }
        setUploadedDocText(extractedText);
        setLoadingDoc(false);
        toast.success(`ÄÃ£ trÃ­ch xuáº¥t tÃ i liá»‡u PDF (${pdf.numPages} trang) thÃ nh cÃ´ng!`);
      } catch (err: any) {
        setLoadingDoc(false);
        console.error(err);
        toast.error(err.message || "Lá»—i xá»­ lÃ½ file PDF.");
      }
    } else if (fileExt === "docx") {
      try {
        const mammoth = await loadScript("https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js", "mammoth");
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        const extractedText = result.value;
        if (!extractedText.trim()) {
          throw new Error("TÃ i liá»‡u Word trá»‘ng hoáº·c khÃ´ng cÃ³ vÄƒn báº£n.");
        }
        setUploadedDocText(extractedText);
        setLoadingDoc(false);
        toast.success("ÄÃ£ trÃ­ch xuáº¥t tÃ i liá»‡u Word thÃ nh cÃ´ng!");
      } catch (err: any) {
        setLoadingDoc(false);
        console.error(err);
        toast.error(err.message || "Lá»—i xá»­ lÃ½ file Word.");
      }
    } else {
      setLoadingDoc(false);
      toast.error("Äá»‹nh dáº¡ng file khÃ´ng Ä‘Æ°á»£c há»— trá»£. Vui lÃ²ng táº£i hÃ¬nh áº£nh, .txt, .md, .pdf hoáº·c .docx");
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
    toast.success("ÄÃ£ gá»¡ tá»‡p tin Ä‘Ã­nh kÃ¨m.");
  };

  const [analyzedTopic, setAnalyzedTopic] = useState("");
  const [loadingAI, setLoadingAI] = useState(false);
  const [quickSuggestions, setQuickSuggestions] = useState<string[]>([
    "Chiáº¿n dá»‹ch khuyáº¿n mÃ£i theo mÃ¹a Ä‘á»ƒ tÄƒng doanh sá»‘ vÃ  thu hÃºt khÃ¡ch hÃ ng má»›i.",
    "ChÆ°Æ¡ng trÃ¬nh tri Ã¢n khÃ¡ch hÃ ng thÃ¢n thiáº¿t nháº±m cá»§ng cá»‘ lÃ²ng trung thÃ nh vÃ  khuyáº¿n khÃ­ch mua sáº¯m láº·p láº¡i.",
    "Chiáº¿n dá»‹ch giá»›i thiá»‡u báº¡n bÃ¨ Ä‘á»ƒ má»Ÿ rá»™ng tá»‡p khÃ¡ch hÃ ng tiá»m nÄƒng thÃ´ng qua máº¡ng lÆ°á»›i hiá»‡n cÃ³."
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
      label: "áº¢nh AI",
      tone: "bg-sky-50 text-sky-700 border-sky-100"
    },
    video: {
      label: "Video AI",
      tone: "bg-amber-50 text-amber-700 border-amber-100"
    },
    "human-video": {
      label: "Video ngÆ°á»i tháº­t",
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
      ratio: "35% tá»‰ trá»ng",
      description: "Chia sáº» kiáº¿n thá»©c bá»• Ã­ch liÃªn quan Ä‘áº¿n tÆ° tháº¿ ngá»“i gÃµ bÃ n phÃ­m, hoáº·c cÃ¡ch tá»‘i Æ°u hÃ³a váº­n hÃ nh há»‡ thá»‘ng.",
      colorClass: "border-red-200 bg-red-50/50 text-red-700",
      selectedColorClass: "border-red-500 bg-red-50 text-red-850 ring-2 ring-red-500/20 shadow-xs",
      bulletColor: "bg-red-500",
    },
    {
      id: "Pillar B: Storytelling & Social Proof",
      title: "Pillar B: Storytelling & Social Proof",
      ratio: "40% tá»‰ trá»ng",
      description: "Phá»ng váº¥n thá»±c táº¿ khÃ¡ch hÃ ng cÅ© trung thÃ nh Ä‘ang nÃ¢ng hiá»‡u suáº¥t cÃ¹ng iGen Marketing.",
      colorClass: "border-blue-200 bg-blue-50/50 text-blue-700",
      selectedColorClass: "border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20 shadow-xs",
      bulletColor: "bg-blue-500",
    },
    {
      id: "Pillar C: Offers & Promotions",
      title: "Pillar C: Offers & Promotions",
      ratio: "25% tá»‰ trá»ng",
      description: "Táº¡o sá»± thÃºc giá»¥c báº±ng cÃ¡ch cÃ´ng bá»‘ giá» vÃ ng flash sale kháº©n cáº¥p.",
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
      "YÃŠU Cáº¦U RIÃŠNG CHO VIDEO NGÆ¯á»œI THáº¬T:",
      `- HÃ£y phÃ¢n tÃ­ch mÃ´ táº£ chiáº¿n dá»‹ch vÃ  viáº¿t thÃ nh má»™t Ä‘oáº¡n lá»i thoáº¡i hoÃ n chá»‰nh, tá»± nhiÃªn, cÃ³ thá»ƒ Ä‘em Ä‘á»c trá»±c tiáº¿p.`,
      `- Giá»ng Ä‘á»c Ä‘Æ°á»£c chá»n: ${voiceLabel}.`,
      `- Model voice Ä‘Æ°á»£c chá»n: ${voiceModelLabel}.`,
      `- Thá»i lÆ°á»£ng Ä‘á»c má»¥c tiÃªu: khoáº£ng ${normalizedDuration} giÃ¢y.`,
      `- Äá»™ dÃ i script voice cáº§n Ä‘Æ°á»£c tá»‘i Æ°u Ä‘á»ƒ Ä‘á»c háº¿t trong khoáº£ng ${normalizedDuration} giÃ¢y, tÆ°Æ¡ng Ä‘Æ°Æ¡ng xáº¥p xá»‰ ${targetWordCount} tá»« vá»›i tá»‘c Ä‘á»™ Ä‘á»c tá»± nhiÃªn.`,
      `- Äáº§u ra Æ°u tiÃªn lÃ  má»™t Ä‘oáº¡n voice script hoÃ n chá»‰nh Ä‘á»ƒ Ä‘Æ°a tháº³ng vÃ o cÃ´ng cá»¥ táº¡o voice; khÃ´ng viáº¿t dáº¡ng dÃ n Ã½, khÃ´ng chÃ¨n bullet, khÃ´ng thÃªm nhÃ£n MC/Voiceover.`,
      `- Æ¯u tiÃªn cÃ¢u ngáº¯n, nhá»‹p Ä‘á»c rÃµ, má»Ÿ Ä‘áº§u cuá»‘n hÃºt, thÃ´ng Ä‘iá»‡p chÃ­nh rÃµ rÃ ng vÃ  káº¿t báº±ng CTA ngáº¯n gá»n.`,
      `- Äáº§u ra cáº§n Æ°u tiÃªn dáº¡ng script voice hoÃ n chá»‰nh trÆ°á»›c, sau Ä‘Ã³ má»›i Ä‘áº¿n gá»£i Ã½ bá»‘i cáº£nh quay náº¿u cáº§n.`,
      `- Báº®T BUá»˜C viáº¿t báº±ng tiáº¿ng Viá»‡t cÃ³ dáº¥u, khÃ´ng Ä‘Æ°á»£c bá» dáº¥u tiáº¿ng Viá»‡t.`
    ].join("\n");
  };

  const getHumanVideoScript = (post: any, fallbackTitle: string, fallbackSummary: string) => {
    const directScript = String(post?.voiceScript || "").trim();
    if (directScript) return directScript;

    const outlineText = String(post?.outline || "").trim();
    const bodyText = String(post?.bodyText || "").trim();
    const fallbackParts = [
      `Xin chÃ o, Ä‘Ã¢y lÃ  video giá»›i thiá»‡u cho chiáº¿n dá»‹ch ${fallbackTitle}.`,
      fallbackSummary,
      bodyText,
      "LiÃªn há»‡ ngay Ä‘á»ƒ nháº­n tÆ° váº¥n vÃ  nháº­n Æ°u Ä‘Ã£i phÃ¹ há»£p."
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
      `Äá»c báº±ng tiáº¿ng Viá»‡t cÃ³ dáº¥u cho ná»™i dung chiáº¿n dá»‹ch "${cleanTitle}" trÃªn kÃªnh ${cleanChannel}.`,
      cleanSummary ? `TÃ³m táº¯t chiáº¿n dá»‹ch: ${cleanSummary}.` : "",
      `Má»¥c tiÃªu Ä‘á»c tá»± nhiÃªn, liá»n máº¡ch, Ã¢m rÃµ tá»«ng dáº¥u vÃ  Ä‘Ãºng nhá»‹p khoáº£ng ${normalizedDuration} giÃ¢y.`,
      "Æ¯u tiÃªn cÃ¡ch Ä‘á»c má»m, cÃ³ ngá»¯ Ä‘iá»‡u, trÃ¡nh tÃ¡ch tá»«ng cá»¥m tá»« nhÆ° robot.",
      "Cáº§n Ä‘á»c chuáº©n dáº¥u tiáº¿ng Viá»‡t, xá»­ lÃ½ Ä‘Ãºng tÃªn riÃªng, Ä‘á»‹a danh vÃ  thÃ´ng Ä‘iá»‡p quáº£ng cÃ¡o."
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
      .split(/[^\p{L}\p{N}]+/u)
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
      throw new Error("Háº¿t thá»i gian chá» káº¿t xuáº¥t video AI.");
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
              throw new Error("KhÃ´ng láº¥y Ä‘Æ°á»£c Page Token hoáº·c Page ID cho tÃ i khoáº£n Ä‘Æ°á»£c chá»n.");
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
              throw new Error("BÃ i Ä‘Äƒng TikTok cáº§n cÃ³ video. HÃ£y táº¡o video AI trÆ°á»›c.");
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
          toast.success(`ÄÃ£ tá»± Ä‘á»™ng táº¡o vÃ  Ä‘Äƒng bÃ i "${card.title}" lÃªn ${card.channel}!`);

        } else {
          const scheduledDate = autoScheduleDate;
          let scheduledTime = autoScheduleTime;
          try {
            const [hStr, mStr] = autoScheduleTime.split(":");
            const startHour = parseInt(hStr);
            const hour = (startHour + idx) % 24;
            scheduledTime = `${hour.toString().padStart(2, '0')}:${mStr}`;
          } catch (e) {
            console.warn("Lá»—i tÃ­nh toÃ¡n giá» Ä‘Äƒng tá»± Ä‘á»™ng:", e);
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
          toast.success(`ÄÃ£ tá»± Ä‘á»™ng táº¡o vÃ  lÃªn lá»‹ch bÃ i Ä‘Äƒng "${card.title}" trÃªn ${card.channel}!`);
        }

      } catch (err: any) {
        console.error(`[Background Autopilot Error] for card ${card.id}:`, err);
        await marketingService.updateCard(card.id, { status: "failed" });
        setApprovalCards(prev => prev.map(c => c.id === card.id ? { ...c, status: "failed" as const } : c));
        toast.error(`KhÃ´ng thá»ƒ táº¡o phÆ°Æ¡ng tiá»‡n tá»± Ä‘á»™ng cho bÃ i "${card.title}": ${err.message || err}`);
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
        console.error("Lá»—i khi táº£i liÃªn káº¿t máº¡ng xÃ£ há»™i:", err);
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
        toast.warning("Vui lÃ²ng nháº­p hoáº·c chá»n má»™t chá»§ Ä‘á»/má»¥c tiÃªu chiáº¿n dá»‹ch trÆ°á»›c!");
      }
      return;
    }

    setLoadingPillars(true);
    try {
      let apiTopic = topic;
      if (uploadedDocText) {
        apiTopic = `${topic}\n\nTÃ€I LIá»†U ÄÃNH KÃˆM:\nTÃªn tÃ i liá»‡u: ${uploadedDocName}\nNá»™i dung tÃ i liá»‡u:\n${uploadedDocText}`;
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
          ratio: p.ratio || "33% tá»‰ trá»ng",
          description: p.description,
          ...styles[idx % styles.length]
        }));

        setPillars(mappedPillars);
        setSelectedPillars(mappedPillars.map((p: any) => p.id));
        setAnalyzedTopic(topic);
      }
    } catch (err: any) {
      console.error("Lá»—i phÃ¢n tÃ­ch Content Pillars:", err);
      toast.error(err.message || "Lá»—i phÃ¢n tÃ­ch Content Pillars.");
    } finally {
      setLoadingPillars(false);
    }
  };

  const handleSwapPillar = async (pillarIdToReplace: string) => {
    const topic = campaignInput.trim();
    if (!topic) {
      toast.warning("Vui lÃ²ng nháº­p má»¥c tiÃªu chiáº¿n dá»‹ch trÆ°á»›c khi Ä‘á»•i trá»¥ cá»™t.");
      return;
    }
    setSwappingPillarId(pillarIdToReplace);
    try {
      const originalPillar = pillars.find(p => p.id === pillarIdToReplace);
      const pillarIndex = pillars.findIndex(p => p.id === pillarIdToReplace);

      // Gá»i analyzeMarketingPillars vá»›i variation hint Ä‘á»ƒ láº¥y bá»™ pillars má»›i
      // DÃ¹ng biáº¿n thá»ƒ ngáº«u nhiÃªn Ä‘á»ƒ AI tráº£ vá» ná»™i dung khÃ¡c nhau má»—i láº§n
      const variants = [
        "gÃ³c Ä‘á»™ khÃ¡c biá»‡t",
        "hÆ°á»›ng tiáº¿p cáº­n má»›i",
        "phÆ°Æ¡ng Ã¡n thay tháº¿ sÃ¡ng táº¡o",
        "quan Ä‘iá»ƒm Ä‘á»™c Ä‘Ã¡o hÆ¡n",
        "chiáº¿n lÆ°á»£c ná»™i dung khÃ¡c"
      ];
      const randomVariant = variants[Math.floor(Math.random() * variants.length)];

      let apiTopic = `${topic} - táº­p trung vÃ o ${randomVariant}`;
      if (uploadedDocText) {
        apiTopic = `${apiTopic}\n\nTÃ€I LIá»†U ÄÃNH KÃˆM:\nTÃªn tÃ i liá»‡u: ${uploadedDocName}\nNá»™i dung tÃ i liá»‡u:\n${uploadedDocText}`;
      }

      const data = await geminiApi.analyzeMarketingPillars(
        apiTopic,
        uploadedImageBase64 ? [uploadedImageBase64] : undefined
      );

      if (data.pillars && Array.isArray(data.pillars) && data.pillars.length > 0) {
        // Láº¥y pillar á»Ÿ cÃ¹ng vá»‹ trÃ­ index, fallback sang pillar Ä‘áº§u tiÃªn
        const targetIdx = pillarIndex >= 0 && pillarIndex < data.pillars.length
          ? pillarIndex
          : 0;
        const rawPillar = data.pillars[targetIdx];

        const newPillar = {
          id: rawPillar.id || `pillar-swap-${Date.now()}`,
          title: rawPillar.title,
          ratio: rawPillar.ratio || (originalPillar ? originalPillar.ratio : "33% tá»‰ trá»ng"),
          description: rawPillar.description,
          // Giá»¯ nguyÃªn mÃ u sáº¯c cá»§a pillar cÅ© Ä‘á»ƒ UI nháº¥t quÃ¡n
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
        toast.success(`ÄÃ£ Ä‘á»•i sang trá»¥ cá»™t: ${newPillar.title}`);
      } else {
        toast.error("KhÃ´ng thá»ƒ thay tháº¿ trá»¥ cá»™t ná»™i dung.");
      }
    } catch (err: any) {
      console.error("Lá»—i thay Ä‘á»•i content pillar:", err);
      toast.error(err.message || "Lá»—i khi thay Ä‘á»•i Content Pillar.");
    } finally {
      setSwappingPillarId(null);
    }
  };

  const togglePillar = (id: string) => {
    if (selectedPillars.includes(id)) {
      if (selectedPillars.length === 1) {
        toast.warning("Cáº§n chá»n nháº¥t 1 trá»¥ cá»™t ná»™i dung Ä‘á»ƒ trá»£ lÃ½ AI Ä‘á»‹nh hÆ°á»›ng.");
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
        toast.error("Vui lÃ²ng nháº­p thá»i lÆ°á»£ng video há»£p lá»‡.");
        return;
      }
    } else if (mediaType === "human-video") {
      const durVal = parseInt(estimatedHumanVoiceDuration, 10);
      if (!estimatedHumanVoiceDuration || isNaN(durVal) || durVal <= 0) {
        toast.error("Vui lÃ²ng nháº­p thá»i lÆ°á»£ng video ngÆ°á»i tháº­t há»£p lá»‡.");
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
        apiTopic = `${topic}\n\nTÃ€I LIá»†U ÄÃNH KÃˆM:\nTÃªn tÃ i liá»‡u: ${uploadedDocName}\nNá»™i dung tÃ i liá»‡u:\n${uploadedDocText}`;
      }

      const voiceBrief = buildHumanVideoVoiceBrief();
      if (voiceBrief) {
        apiTopic = `${apiTopic}\n\n${voiceBrief}`;
      }

      let pillarsToUse = selectedPillars;
      if (isAutoPilot) {
        if (analyzedTopic === topic && selectedPillars.length > 0) {
          // Sá»­ dá»¥ng pillars Ä‘Ã£ phÃ¢n tÃ­ch tá»« trÆ°á»›c Ä‘á»ƒ trÃ¡nh gá»i láº¡i API trÃ¹ng láº·p
          pillarsToUse = selectedPillars;
        } else {
          setAutoPilotStatus("Äang phÃ¢n tÃ­ch Ä‘á»‹nh hÆ°á»›ng Content Pillars...");
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
                ratio: p.ratio || "33% tá»‰ trá»ng",
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
            console.error("Lá»—i phÃ¢n tÃ­ch pillars tá»± Ä‘á»™ng:", pillarErr);
            toast.warning("Lá»—i phÃ¢n tÃ­ch Content Pillars tá»± Ä‘á»™ng, Ä‘ang thá»­ lÃªn Ã½ tÆ°á»Ÿng trá»±c tiáº¿p...");
          }
        }
      }

      setAutoPilotStatus("Äang lÃªn Ã½ tÆ°á»Ÿng chiáº¿n dá»‹ch...");
      setAutoPilotProgress(35);
      autoPilotStageCapRef.current = 55;
      const actualMediaType = mediaType;
      const data = await geminiApi.generateMarketingIdeas(apiTopic, pillarsToUse, selectedChannels, actualMediaType, uploadedImageBase64 ? [uploadedImageBase64] : undefined);
      if (data.isMock) {
        console.warn("[IdeationTab] Marketing ideas fallbacked to mock data.");
        toast.warning("AI Ä‘ang tráº£ vá» dá»¯ liá»‡u máº«u. CÃ³ thá»ƒ backend vá»«a fallback sang mock.");
      }

      const generatedConcepts = (data.concepts || [])
        .map((concept: MarketingConcept) => normalizeGeneratedConcept(concept, actualMediaType))
        .filter((concept: MarketingConcept) => concept.title && concept.summary && concept.suggestedContent);
      if (generatedConcepts.length === 0) {
        throw new Error("AI khÃ´ng thá»ƒ táº¡o Ã½ tÆ°á»Ÿng chiáº¿n dá»‹ch phÃ¹ há»£p.");
      }

      setConcepts(generatedConcepts);

      if (isAutoPilot) {
        setAutoPilotProgress(55);
        autoPilotStageCapRef.current = 90;

        const sortedConcepts = [...generatedConcepts].sort((a: any, b: any) => (b.matchPercent || 0) - (a.matchPercent || 0));
        const bestConcept = sortedConcepts[0];

        setAutoPilotStatus(`Äang tá»± Ä‘á»™ng viáº¿t ná»™i dung chi tiáº¿t cho Ã½ tÆ°á»Ÿng: "${bestConcept.title}"...`);
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
          throw new Error("AI khÃ´ng thá»ƒ phÃ¡t triá»ƒn chi tiáº¿t bÃ i viáº¿t.");
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
            isNew: true // ÄÃ¡nh dáº¥u card má»›i phÃ¡t triá»ƒn
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
        // Chá» 800ms Ä‘á»ƒ ngÆ°á»i dÃ¹ng nhÃ¬n tháº¥y tiáº¿n trÃ¬nh Ä‘áº¡t 100% trÆ°á»›c khi chuyá»ƒn tab
        await new Promise((resolve) => setTimeout(resolve, 800));

        toast.success("Chiáº¿n dá»‹ch Ä‘Ã£ khá»Ÿi cháº¡y! Äang tá»± Ä‘á»™ng táº¡o phÆ°Æ¡ng tiá»‡n truyá»n thÃ´ng cháº¡y ná»n...");
        setSubTab("DUYá»†T Ná»˜I DUNG");
      }
    } catch (err: any) {
      console.error(err);
      setConcepts([]);
      toast.error(err.message || "Tá»± Ä‘á»™ng hÃ³a tháº¥t báº¡i. Vui lÃ²ng kiá»ƒm tra láº¡i cáº¥u hÃ¬nh hoáº·c sá»‘ dÆ° vÃ­.");
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
        toast.error("Vui lÃ²ng nháº­p thá»i lÆ°á»£ng video há»£p lá»‡.");
        return;
      }
    } else if (mediaType === "human-video") {
      const durVal = parseInt(estimatedHumanVoiceDuration, 10);
      if (!estimatedHumanVoiceDuration || isNaN(durVal) || durVal <= 0) {
        toast.error("Vui lÃ²ng nháº­p thá»i lÆ°á»£ng video ngÆ°á»i tháº­t há»£p lá»‡.");
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
        toast.error("API khÃ´ng pháº£n há»“i. Vui lÃ²ng thá»­ láº¡i sau.");
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
            contentType: post.contentType || "BÃ i viáº¿t truyá»n thÃ´ng",
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
        setSubTab("DUYá»†T Ná»˜I DUNG");
      } else {
        console.warn("[handleDevelopConcept] Result has no posts:", result);
        const reason = result?.isMock ? "AI Ä‘ang dÃ¹ng dá»¯ liá»‡u máº«u (mock)." : "API Gemini khÃ´ng tráº£ vá» bÃ i viáº¿t nÃ o.";
        toast.error(`KhÃ´ng thá»ƒ táº¡o ná»™i dung: ${reason}`);
      }
    } catch (e: any) {
      console.error("Lá»—i phÃ¡t triá»ƒn Ã½ tÆ°á»Ÿng Ä‘a kÃªnh:", e);
      toast.error(e.message || "Lá»—i káº¿t ná»‘i Trá»£ lÃ½ AI khi láº­p dÃ n Ã½ chi tiáº¿t.");
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
                ðŸ¤– Cháº¿ Ä‘á»™ Auto-pilot Ä‘ang váº­n hÃ nh...
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
                    TIáº¾N Äá»˜
                  </span>
                </div>
              </div>

              <p className="text-xs text-slate-600 font-medium leading-relaxed font-sans max-w-sm">
                {autoPilotStatus}
              </p>
              <p className="text-[10px] text-slate-400 mt-1 font-mono italic">
                Há»‡ thá»‘ng Ä‘ang tá»± Ä‘á»™ng káº¿t ná»‘i API Gemini & n8n Scheduler
              </p>
            </div>
          )}
          <div>
            {autoPilotBackgroundRunning && isAutoPilot && (
              <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50/80 px-4 py-3 text-left shadow-sm">
                <div className="flex items-center gap-2 text-indigo-700">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  <span className="text-xs font-bold uppercase tracking-wide">
                    Auto-pilot Ä‘ang cháº¡y ná»n
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-600">
                  {autoPilotStatus || "AI Ä‘ang tiáº¿p tá»¥c xá»­ lÃ½ lÆ°u ná»™i dung, media vÃ  lá»‹ch Ä‘Äƒng."}
                </p>
              </div>
            )}
            <h4 className="font-bold text-gray-850 text-sm tracking-wide font-sans flex items-center gap-1.5 uppercase">
              <Sparkles className="h-4.5 w-4.5 text-indigo-500 animate-pulse" />
              Khá»Ÿi táº¡o Ã½ tÆ°á»Ÿng chiáº¿n dá»‹ch marketing
            </h4>

            <form onSubmit={handleGenerateIdeas} className="mt-5 space-y-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between items-center select-none">
                  <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider">
                    MÃ´ táº£ má»¥c tiÃªu chiáº¿n dá»‹ch cá»§a báº¡n:
                  </span>
                  {(campaignInput || uploadedDocName) && (
                    <button
                      type="button"
                      onClick={() => {
                        setCampaignInput("");
                        handleRemoveDocument();
                        toast.success("ÄÃ£ xÃ³a sáº¡ch ná»™i dung prompt!");
                      }}
                      className="text-[10px] font-bold font-mono text-red-600 hover:text-red-750 transition-colors flex items-center gap-1 cursor-pointer bg-red-50 hover:bg-red-100/80 px-2.5 py-0.5 rounded border border-red-200/30"
                    >
                      <Trash2 className="h-3 w-3" />
                      XÃ³a táº¥t cáº£
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
                    placeholder="MÃ´ táº£ má»¥c tiÃªu cá»§a báº¡n (Ex: Khá»Ÿi Ä‘á»™ng giá»›i thiá»‡u dÃ²ng BÃ n phÃ­m cÆ¡ Workspace V2 phÃ¢n khÃºc láº­p trÃ¬nh viÃªn, chiáº¿t kháº¥u 10%)..."
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
                              ? "Äang xá»­ lÃ½..."
                              : uploadedImageBase64
                                ? "HÃ¬nh áº£nh"
                                : "TÃ i liá»‡u"
                            }
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={handleRemoveDocument}
                          className="p-0.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                          title="Gá»¡ tá»‡p Ä‘Ã­nh kÃ¨m"
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
                      <span>Äang xá»­ lÃ½ dá»¯ liá»‡u...</span>
                    </div>
                  )}

                  {/* Bottom toolbar with attachment icons */}
                  <div className="flex items-center gap-0.5 px-2.5 py-1.5 border-t border-gray-100 bg-gray-50/40">
                    {/* Attach document */}
                    <label
                      className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer group relative"
                      title="ÄÃ­nh kÃ¨m tÃ i liá»‡u (PDF, DOCX, TXT, MD)"
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
                      title="ÄÃ­nh kÃ¨m hÃ¬nh áº£nh"
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
                          <span>{loadingAI || autoPilotBackgroundRunning ? "Äang cháº¡y..." : "Khá»Ÿi cháº¡y Tá»± Ä‘á»™ng 1-Click"}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className={`h-3.5 w-3.5 text-indigo-500 ${loadingPillars ? "animate-spin" : ""}`} />
                          <span>{loadingPillars ? "Äang phÃ¢n tÃ­ch..." : "PhÃ¢n tÃ­ch Má»¥c tiÃªu AI"}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
              {!isAutoPilot && campaignInput.trim() && campaignInput.trim() !== analyzedTopic.trim() && (
                <p className="text-[10px] text-amber-600 font-bold font-mono tracking-wide animate-pulse mt-1 select-none text-left">
                  âš ï¸ Báº¡n Ä‘Ã£ thay Ä‘á»•i ná»™i dung má»¥c tiÃªu. Vui lÃ²ng báº¥m "PhÃ¢n tÃ­ch Má»¥c tiÃªu & Äá» xuáº¥t Trá»¥ cá»™t AI" á»Ÿ cá»™t bÃªn pháº£i trÆ°á»›c Ä‘á»ƒ cáº­p nháº­t Ä‘á»‹nh hÆ°á»›ng trÆ°á»›c khi phÃ¡t sinh Ã½ tÆ°á»Ÿng!
                </p>
              )}

              {/* Quick suggestions chips bubble list */}
              <div className="space-y-1.5 font-sans">
                <span className="text-[10px] font-bold text-gray-400 font-mono uppercase tracking-wider block">Gá»£i Ã½ chá»§ Ä‘á» nhanh:</span>
                <div className="flex flex-wrap gap-2">
                  {loadingSuggestions ? (
                    <>
                      <div className="px-2.5 py-1 text-[10px] rounded-md border border-gray-100 bg-slate-50 text-gray-400 flex items-center gap-1.5 animate-pulse select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                        <span>Gá»£i Ã½ 1 Ä‘ang táº£i...</span>
                      </div>
                      <div className="px-2.5 py-1 text-[10px] rounded-md border border-gray-100 bg-slate-50 text-gray-400 flex items-center gap-1.5 animate-pulse select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                        <span>Gá»£i Ã½ 2 Ä‘ang táº£i...</span>
                      </div>
                      <div className="px-2.5 py-1 text-[10px] rounded-md border border-gray-100 bg-slate-50 text-gray-400 flex items-center gap-1.5 animate-pulse select-none">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                        <span>Gá»£i Ã½ 3 Ä‘ang táº£i...</span>
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
                  ðŸ“¢ Chá»n ná»n táº£ng truyá»n thÃ´ng:
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
                            toast.warning(`${chan.id} Ä‘ang Ä‘Æ°á»£c táº¯t táº¡m thá»i.`);
                            return;
                          }
                          if (isSelected) {
                            if (selectedChannels.length === 1) {
                              toast.warning("Báº¡n pháº£i chá»n Ã­t nháº¥t má»™t ná»n táº£ng!");
                              return;
                            }
                            setSelectedChannels(selectedChannels.filter(c => c !== chan.id));
                          } else {
                            setSelectedChannels([...selectedChannels, chan.id]);
                          }
                        }}
                        title={chan.disabled ? `${chan.id} táº¡m thá»i chÆ°a kháº£ dá»¥ng` : undefined}
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
                    ðŸ¤– Cháº¿ Ä‘á»™ Tá»± Ä‘á»™ng hoÃ n toÃ n (Auto-pilot: Ã tÆ°á»Ÿng â†’ Viáº¿t bÃ i â†’ Äáº·t lá»‹ch Ä‘Äƒng)
                  </span>
                </label>

                {isAutoPilot && (
                  <div className="mt-2.5 border-t border-purple-200/50 pt-3.5 space-y-3.5 text-left animate-fadeIn">
                    {/* Switch: LÃªn lá»‹ch vs ÄÄƒng ngay */}
                    <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-purple-100 shadow-3xs">
                      <span className="text-xs font-bold text-gray-700 font-sans">Cháº¿ Ä‘á»™ xuáº¥t báº£n:</span>
                      <div className="flex rounded-lg bg-slate-100 p-0.5">
                        <button
                          type="button"
                          onClick={() => setAutoPublishMode("scheduled")}
                          className={`px-3.5 py-1.5 text-[10.5px] font-bold rounded-lg transition-all ${autoPublishMode === "scheduled"
                            ? "bg-white text-purple-700 shadow-xs"
                            : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                          LÃªn lá»‹ch Ä‘Äƒng
                        </button>
                        <button
                          type="button"
                          onClick={() => setAutoPublishMode("instant")}
                          className={`px-3.5 py-1.5 text-[10.5px] font-bold rounded-lg transition-all ${autoPublishMode === "instant"
                            ? "bg-white text-purple-700 shadow-xs"
                            : "text-slate-500 hover:text-slate-700"
                            }`}
                        >
                          ÄÄƒng ngay
                        </button>
                      </div>
                    </div>

                    {autoPublishMode === "scheduled" && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-fadeIn">
                        {/* Scheduled Date */}
                        <div className="space-y-1.5">
                          <label className="block text-gray-500 font-bold text-[10px] uppercase font-mono">NgÃ y Ä‘Äƒng bÃ i *</label>
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
                          <label className="block text-gray-500 font-bold text-[10px] uppercase font-mono">Giá» Ä‘Äƒng bÃ i *</label>
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
                              Chá»n tÃ i khoáº£n {platform} Ä‘Äƒng bÃ i *
                            </label>
                            {loadingIntegrations ? (
                              <div className="p-2 border border-slate-200 rounded-lg text-xs text-gray-400 bg-white">
                                Äang táº£i danh sÃ¡ch tÃ i khoáº£n...
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
                                âš ï¸ ChÆ°a cÃ³ tÃ i khoáº£n {platform} nÃ o Ä‘Æ°á»£c liÃªn káº¿t. Vui lÃ²ng vÃ o CÃ i Ä‘áº·t &rarr; LiÃªn káº¿t máº¡ng xÃ£ há»™i Ä‘á»ƒ káº¿t ná»‘i trÆ°á»›c khi Ä‘áº·t lá»‹ch.
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
                  ðŸ–¼ï¸ Chá»n loáº¡i phÆ°Æ¡ng tiá»‡n (Media):
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    { value: "image", label: "HÃ¬nh áº£nh AI", icon: <ImageIcon className="h-3.5 w-3.5" /> },
                    { value: "video", label: "Video AI", icon: <Video className="h-3.5 w-3.5" /> },
                    { value: "human-video", label: "Video ngÆ°á»i tháº­t", icon: <Video className="h-3.5 w-3.5" /> }
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
                    â±ï¸ Thá»i lÆ°á»£ng video (giÃ¢y):
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
                                toast.warning("1080p yÃªu cáº§u tá»‘i thiá»ƒu 6 giÃ¢y. ÄÃ£ tá»± Ä‘á»™ng chuyá»ƒn sang 720p.");
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
                      KhÃ¡c
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
                          placeholder="Thá»i lÆ°á»£ng"
                          className="w-24 text-xs p-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center font-bold"
                        />
                        <span className="text-xs text-gray-500 font-bold">giÃ¢y </span>
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
                              toast.warning("Video ngÆ°á»i tháº­t chá»‰ há»— trá»£ thá»i lÆ°á»£ng tá»‘i Ä‘a 600 giÃ¢y (10 phÃºt).");
                            } else if (num < 1) {
                              num = 1;
                            }
                            setEstimatedHumanVoiceDuration(String(num));
                          }}
                          placeholder="Nháº­p sá»‘ giÃ¢y"
                          className="w-24 text-xs p-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center font-bold"
                        />
                        <span className="text-xs text-gray-500 font-bold">giÃ¢y (tá»‘i Ä‘a 600s)</span>
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
                    Cáº¥u hÃ¬nh hÃ¬nh áº£nh AI
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-gray-500 font-mono">MÃ´ hÃ¬nh AI</span>
                      <select
                        value={imageModel}
                        onChange={(e) => setImageModel(e.target.value)}
                        className="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-sans"
                      >
                        <option value="gemini-banana-flash">iGen Gemini 3 Flash</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-gray-500 font-mono">Äá»™ phÃ¢n giáº£i</span>
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
                    <span className="text-xs font-bold text-gray-500 font-mono block">Tá»‰ lá»‡ khung hÃ¬nh</span>
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
                    Cáº¥u hÃ¬nh video AI
                  </span>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <span className="text-xs font-bold text-gray-500 font-mono">MÃ´ hÃ¬nh AI Video</span>
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
                      <span className="text-xs font-bold text-gray-500 font-mono">Cháº¥t lÆ°á»£ng video</span>
                      <select
                        value={videoQuality}
                        onChange={(e) => {
                          if (e.target.value === "1080p" && parseInt(videoDuration) <= 4) {
                            toast.warning("1080p khÃ´ng há»— trá»£ cho video 4 giÃ¢y. Vui lÃ²ng chá»n 6 hoáº·c 8 giÃ¢y trÆ°á»›c.");
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
                      <span className="text-xs font-bold text-gray-500 font-mono block">Tá»‰ lá»‡ khung hÃ¬nh</span>
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
                            {ratio === "16:9" ? "Ngang 16:9" : "Dá»c 9:16"}
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
                <span>ðŸ’¡ <b>Quy trÃ¬nh 1-Click:</b> AI sáº½ tá»± Ä‘á»™ng phÃ¢n tÃ­ch Pillar, viáº¿t ná»™i dung, táº¡o áº£nh/video vÃ  tá»± Ä‘á»™ng xuáº¥t báº£n lÃªn cÃ¡c kÃªnh Ä‘Ã£ cáº¥u hÃ¬nh.</span>
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
              {loadingAI ? "AI Äang sÃ¡ng táº¡o..." : isAutoPilot ? "Khá»Ÿi cháº¡y Chiáº¿n dá»‹ch Tá»± Ä‘á»™ng" : "PhÃ¡t sinh Ã tÆ°á»Ÿng tá»« AI"}
            </button>
          </div>
        </div>

        {/* Content Pillars guidelines panel */}
        <div className="bg-white border p-6 rounded-2xl flex flex-col justify-between" id="content_pillars_advisory">
          <div>
            <div className="flex justify-between items-center">
              <h4 className="font-bold text-gray-850 text-sm tracking-wide font-sans uppercase">
                ðŸ“š Content Pillars Äá» xuáº¥t
              </h4>
              <button
                type="button"
                onClick={() => handleAnalyzePillars()}
                disabled={loadingPillars || !campaignInput.trim()}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border transition-all ${loadingPillars || !campaignInput.trim()
                  ? "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed"
                  : "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200 hover:border-indigo-300 active:scale-95 cursor-pointer shadow-xs"
                  }`}
                title="Táº¡o láº¡i content pillars"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loadingPillars ? "animate-spin" : ""}`} />
                <span>Táº¡o láº¡i</span>
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-1.5 mb-4">PhÃ¢n tÃ­ch má»¥c tiÃªu Ä‘á»ƒ Ä‘á» xuáº¥t ra cÃ¡c trá»¥ cá»™t ná»™i dung cá»‘t lÃµi cá»§a chiáº¿n dá»‹ch, Ä‘áº£m báº£o phÃ¢n bá»• Ä‘a dáº¡ng:</p>

            <div className="space-y-3 text-xs text-left relative">
              {loadingPillars && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-xs flex flex-col items-center justify-center text-center p-4 z-10 rounded-xl">
                  <RefreshCw className="h-6 w-6 text-indigo-600 animate-spin mb-2" />
                  <span className="text-[11px] text-indigo-800 font-bold font-mono">AI ÄANG PHÃ‚N TÃCH KHUNG Ná»˜I DUNG...</span>
                  <p className="text-[10px] text-gray-400 mt-1">Äáº£m báº£o khung tranh phÃ¢n phá»‘i Ä‘a dáº¡ng, trÃ¡nh chá»‰ Ä‘Äƒng táº£i bÃ¡n hÃ ng.</p>
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
                        <span className="text-[9px] text-indigo-850 font-bold mt-1 font-mono uppercase tracking-wide">ÄANG Äá»”I...</span>
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
                        {isSelected ? "â— Äang tuyá»ƒn chá»n" : "â—‹ Táº¡m táº¯t"}
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSwapping) return;
                          handleSwapPillar(pillar.id);
                        }}
                        className="text-slate-400 hover:text-indigo-600 hover:font-bold transition-all cursor-pointer"
                      >
                        Click Ä‘á»ƒ Ä‘á»•i
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 text-center text-[10px] text-gray-400 font-mono">
            PhÃ¢n tÃ­ch bá»Ÿi iGen Marketing Advisor
          </div>
        </div>

      </div>

      {/* Campaign concepts generator list */}
      <div className="space-y-4" id="campaign_draft_concepts_section">
        <span className="text-[10px] font-bold text-gray-500 font-mono uppercase tracking-wider block">Báº£n nhÃ¡p Ã½ tÆ°á»Ÿng sÃ¡ng táº¡o ({concepts.length})</span>

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
                      PhÃ¹ há»£p: {concept.matchPercent}%
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
                  <span className="text-[10px] font-mono uppercase">Máº«u Content sinh ra tá»« AI:</span>
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
                        <span>Äang viáº¿t chi tiáº¿t...</span>
                      </>
                    ) : (
                      <>
                        <span>PhÃ¡t triá»ƒn tiáº¿p ðŸš€</span>
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


