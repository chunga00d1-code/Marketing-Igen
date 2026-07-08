import React, { useState, useRef, useEffect } from 'react';
import { useProgress } from '../../hooks/use-progress';
import { geminiApi } from '../../api/gemini';
import { elevenlabsApi } from '../../api/elevenlabs';
import { toast } from '../../pages/Toast';
import {
   Loader2, Mic, Play, Download, Volume2, Pause, Wand2,
   Trash2, Clock, MicOff, Headphones, Library, Settings2,
   Check, Search, ChevronRight, X, Sparkles, Diamond, Shuffle,
   Upload, ChevronLeft, ArrowLeft, Plus, VolumeX, AlertCircle,
   FileAudio, Laptop, RefreshCw, BookOpen, Volume1
} from 'lucide-react';
import { estimateAudioDuration } from '../../utils/usage-tracker';
import { getAccessToken } from '../../services/authService';
import { marketingService, sanitizeHumanVideoVoiceScript, stripHumanVideoOutlineSections } from '../../services/marketingService';

const VOICE_STYLE_TEMPLATES = [
   { id: 'none', label: 'Tùy chỉnh (Tự nhập)', prompt: '' },
   { id: 'news', label: '🎙️ BTV thời sự', prompt: 'Đọc dõng dạc, nghiêm túc, rõ ràng và mạch lạc như một biên tập viên truyền hình.' },
   { id: 'story', label: '🌙 Kể chuyện', prompt: 'Đọc chậm rãi, ấm áp, truyền cảm như đang kể chuyện cho trẻ em nghe.' },
   { id: 'excited', label: '🎉 Hào hứng', prompt: 'Đọc thật hào hứng, bùng nổ, vui tươi và tràn diện nhiệt huyết.' },
   { id: 'prof', label: '📊 Chuyên gia', prompt: 'Đọc điềm đạm, tốc độ vừa phải, chuyên nghiệp và đầy tính thuyết phục.' },
   { id: 'sad', label: '🥀 Sâu lắng', prompt: 'Đọc với giọng trầm buồn, nghẹn ngào, tốc độ chậm rãi thể hiện sự đồng cảm.' },
   { id: 'urgent', label: '🚨 Khẩn cấp', prompt: 'Đọc dứt khoát, nhanh, âm lượng lớn và tập trung vào sự quan trọng của thông tin.' },
];

const ALL_VOICES = [
   { id: 'Aoede', gender: 'female', age: 'young', label: 'Cô gái (~25t)', description: 'Nhẹ nhàng, truyền cảm (Bella)' },
   { id: 'Kore', gender: 'female', age: 'child', label: 'Bé gái (~12t)', description: 'Trong trẻo, dễ thương (Rachel)' },
   { id: 'Puck', gender: 'male', age: 'child', label: 'Bé trai (~12t)', description: 'Năng động, hoạt bát (Josh)' },
   { id: 'Charon', gender: 'male', age: 'adult', label: 'Đàn ông (~45t)', description: 'Trầm ấm, mạnh mẽ (Charlie)' },
   { id: 'Fenrir', gender: 'male', age: 'young', label: 'Chàng trai (~25t)', description: 'Sắc sảo, rõ ràng (Arnold)' },
   { id: 'Leda', gender: 'female', age: 'young', label: 'Thanh niên', description: 'Trong trẻo, tự nhiên (Emily)' },
   { id: 'Orus', gender: 'male', age: 'adult', label: 'Trung niên', description: 'Trầm ấm, vang (George)' },
   { id: 'Callirrhoe', gender: 'female', age: 'adult', label: 'Trung niên', description: 'Mềm mại, ấm áp (Domi)' },
   { id: 'Autonoe', gender: 'female', age: 'young', label: 'Thanh niên', description: 'Thanh thoát, rõ lời (Ellie)' },
   { id: 'Enceladus', gender: 'male', age: 'young', label: 'Thanh niên', description: 'Mạnh mẽ, dứt khoát (Callum)' },
   { id: 'Iapetus', gender: 'male', age: 'adult', label: 'Trung niên', description: 'Sâu trầm, chững chạc (Patrick)' },
   { id: 'Umbriel', gender: 'male', age: 'young', label: 'Thanh niên', description: 'Nhẹ nhàng, từ tốn (Harry)' },
   { id: 'Algieba', gender: 'female', age: 'adult', label: 'Trung niên', description: 'Dày, sang trọng (Dorothy)' },
   { id: 'Despina', gender: 'female', age: 'young', label: 'Thanh niên', description: 'Cao, nhí nhảnh (Mimi)' },
   { id: 'Sadaltager', gender: 'male', age: 'adult', label: 'Trung niên', description: 'Trầm ấm, độc đáo (Adam)' }
];

const ELEVENLABS_VOICE_MAP_LOCAL: Record<string, string> = {
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

const DEFAULT_FALLBACK_VOICE_ID = '';

const MODEL_OPTIONS = [
   {
      key: 'eleven_flash_v2_5',
      modelId: 'eleven_flash_v2_5',
      title: 'iGen Audio Flash v2.5',
      description: 'Mô hình độ trễ cực thấp, tối ưu cho hội thoại nhanh.',
      badges: ['Low Latency', 'Flash'],
   },
   {
      key: 'eleven_turbo_v2_5',
      modelId: 'eleven_turbo_v2_5',
      title: 'iGen Audio Turbo v2.5',
      description: 'Mô hình tốc độ nhanh, tối ưu chi phí phát sinh.',
      badges: ['Fast', 'Turbo'],
   },
] as const;

const getActiveModelId = (voiceModel: 'eleven_flash_v2_5' | 'eleven_turbo_v2_5') => {
   return voiceModel;
};

function getModelDetails(modelId: string, availableModels: any[]) {
   const apiModel = availableModels.find((model: any) => model.model_id === modelId);
   const languages =
      apiModel?.supported_languages ||
      apiModel?.languages ||
      apiModel?.language_support ||
      [];

   const languageNames = Array.isArray(languages)
      ? languages
         .map((item: any) => (typeof item === 'string' ? item : item?.name || item?.language || item?.language_name))
         .filter(Boolean)
      : [];

   return {
      apiModel,
      languageNames,
      languageSummary:
         languageNames.length > 0
            ? languageNames.slice(0, 8).join(', ')
            : 'Chưa có metadata ngôn ngữ từ ElevenLabs API',
   };
}

const TapeIcon = ({ className = "h-5 w-5" }: { className?: string }) => (
   <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="6.5" cy="12" r="3.5" />
      <circle cx="17.5" cy="12" r="3.5" />
      <line x1="6.5" y1="15.5" x2="17.5" y2="15.5" />
      <line x1="6.5" y1="8.5" x2="17.5" y2="8.5" />
   </svg>
);

// Removed heavy client-side WAV encoder function audioBufferToWav to optimize memory and CPU usage.

interface VoiceGenerationWorkspaceProps {
   initialText?: string;
   initialTitle?: string;
   initialDescription?: string;
   onNavigateToHumanVideo?: () => void;
   cardId?: string;
   autoTrigger?: boolean;
   onMediaSaved?: (cardId: string, mediaUrl: string, type: 'image' | 'video' | 'audio') => void;
}

export function VoiceGenerationWorkspace({
   initialText = '',
   initialTitle = '',
   initialDescription = '',
   onNavigateToHumanVideo,
   cardId,
   autoTrigger,
   onMediaSaved,
}: VoiceGenerationWorkspaceProps) {
   const [text, setText] = useState(initialText);

   useEffect(() => {
      if (initialText) {
         setText(initialText);
      }
   }, [initialText]);

   // Custom states
   
   const [activeCardId, setActiveCardId] = useState<string | undefined>(cardId);
   const [selectedStylePrompt, setSelectedStylePrompt] = useState('');
   const [selectedRegionPrompt, setSelectedRegionPrompt] = useState('');
   const [mode, setMode] = useState<'single' | 'multi'>('single');
   const [temperature, setTemperature] = useState(1.0);

   // Archive Metadata (Optional fields from mockup)
   const [archiveTitle, setArchiveTitle] = useState(initialTitle || '');
   const [archiveDescription, setArchiveDescription] = useState(initialDescription || '');

   useEffect(() => {
      if (cardId) {
         setActiveCardId(cardId);
      }
   }, [cardId]);

   useEffect(() => {
      if (initialTitle) {
         setArchiveTitle(initialTitle);
      }
   }, [initialTitle]);

   useEffect(() => {
      if (initialDescription) {
         setArchiveDescription(initialDescription);
      }
   }, [initialDescription]);

   useEffect(() => {
      console.log("VoiceGenerationWorkspace - activeCardId:", activeCardId, "initialTitle:", initialTitle, "initialDescription:", initialDescription);
      if (!activeCardId) return;
      if (archiveTitle.trim() && archiveDescription.trim()) return;

      let isMounted = true;
      void marketingService.getCardById(activeCardId)
         .then((card) => {
            console.log("VoiceGenerationWorkspace - Fetched card:", card);
            if (!isMounted || !card) return;

            if (!archiveTitle.trim()) {
               setArchiveTitle(card.voiceTitle || `Voice cho ${card.title || "nội dung marketing"}`);
            }

            if (!archiveDescription.trim()) {
               setArchiveDescription(card.motionText || card.voiceDescription || `Script tạo voice cho bài đăng kênh ${card.channel || ''}.`);
            }

            if (!text.trim()) {
               const sanitizedText = stripHumanVideoOutlineSections(
                  sanitizeHumanVideoVoiceScript(card.voiceScript || card.bodyText || card.outline || "")
               );
               if (sanitizedText) {
                  setText(sanitizedText);
               }
            }
         })
         .catch((error) => {
            console.error("Không thể nạp dữ liệu card cho form voice:", error);
         });

      return () => {
         isMounted = false;
      };
   }, [activeCardId, archiveTitle, archiveDescription, text]);

   // Voice selection states
   const [voiceId, setVoiceId] = useState(DEFAULT_FALLBACK_VOICE_ID);
   const [speakerA, setSpeakerA] = useState('Aoede');
   const [speakerB, setSpeakerB] = useState('Puck');

   const [isGenerating, setIsGenerating] = useState(false);
   const [isOptimizing, setIsOptimizing] = useState(false);
   const [audioUri, setAudioUri] = useState<string | null>(null);

   const optimizeProgress = useProgress(isOptimizing, 4);
   const generateProgress = useProgress(isGenerating, 10);

   // Dictation state (Speech-to-Text)
   const [isListening, setIsListening] = useState(false);
   const recognitionRef = useRef<any>(null);

   // History State
   const [history, setHistory] = useState<any[]>([]);
   const [isLoadingHistory, setIsLoadingHistory] = useState(true);

   // Preview State
   const [isPreviewing, setIsPreviewing] = useState(false);
   const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
   const previewAudioRef = useRef<HTMLAudioElement | null>(null);

   // Custom audio player state
   const audioRef = useRef<HTMLAudioElement | null>(null);
   const [isPlaying, setIsPlaying] = useState(false);
   const [currentTime, setCurrentTime] = useState(0);
   const [duration, setDuration] = useState(0);

   // ElevenLabs custom states
   const [availableVoices, setAvailableVoices] = useState<any[]>([]);
   const [availableModels, setAvailableModels] = useState<any[]>([]);
   const [stability, setStability] = useState<number>(0.50);
   const [similarityBoost, setSimilarityBoost] = useState<number>(0.75);
   const [useSpeakerBoost, setUseSpeakerBoost] = useState<boolean>(true);
   const [useLanguageToggle, setUseLanguageToggle] = useState<boolean>(true);
   const [voiceModel, setVoiceModel] = useState<'eleven_flash_v2_5' | 'eleven_turbo_v2_5'>('eleven_turbo_v2_5');

   // Modals state
   const [isAdvancedModalOpen, setIsAdvancedModalOpen] = useState(false);
   const [isVoicePickerView, setIsVoicePickerView] = useState(false);
   const [isVoiceLibraryHoverOpen, setIsVoiceLibraryHoverOpen] = useState(false);
   const [voiceActiveTab, setVoiceActiveTab] = useState<'my-voices' | 'library'>('my-voices');
   const [searchQuery, setSearchQuery] = useState('');
   const [isSavingVoiceSettings, setIsSavingVoiceSettings] = useState(false);

   // Clone/Create Voice modal states
   const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
   const [createStep, setCreateStep] = useState<'selection' | 'upload' | 'info' | 'finish' | 'design'>('selection');
   const [creationMode, setCreationMode] = useState<'design' | 'instant' | 'professional' | 'remix' | null>(null);

   // Instant voice cloning states
   const [instantFiles, setInstantFiles] = useState<any[]>([]);
   const [isRecordingClone, setIsRecordingClone] = useState(false);
   const [recordingDuration, setRecordingDuration] = useState(0);
   const mediaRecorderRef = useRef<MediaRecorder | null>(null);
   const audioChunksRef = useRef<Blob[]>([]);
   const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);
   const cloneAudioElementRef = useRef<HTMLAudioElement | null>(null);
   const [playingFileIndex, setPlayingFileIndex] = useState<number | null>(null);

   // Voice design states (Thiết kế giọng nói)
   const [designGender, setDesignGender] = useState<'male' | 'female'>('female');
   const [designAge, setDesignAge] = useState<'young' | 'middle_aged' | 'old'>('young');
   const [designAccent, setDesignAccent] = useState<string>('american');
   const [designAccentStrength, setDesignAccentStrength] = useState<number>(1.0);
   const [designText, setDesignText] = useState<string>('Xin chào! Đây là bản nghe thử giọng nói mới thiết kế của bạn.');
   const [isGeneratingDesignPreview, setIsGeneratingDesignPreview] = useState(false);
   const [designPreviewVoiceId, setDesignPreviewVoiceId] = useState<string | null>(null);
   const [designPreviewUrl, setDesignPreviewUrl] = useState<string | null>(null);

   // Save voice details
   const [newVoiceName, setNewVoiceName] = useState('');
   const [newVoiceDescription, setNewVoiceDescription] = useState('');
   const [isSavingVoice, setIsSavingVoice] = useState(false);

   // Auto-calculated styleInstructions
   const styleInstructions = [
      selectedStylePrompt,
      selectedRegionPrompt,
      archiveDescription
   ].filter(Boolean).join(', ');

   useEffect(() => {
      loadHistory();
      loadCustomVoices();
      loadModels();
      // Cleanup speech recognition and audios on unmount
      return () => {
         if (recognitionRef.current && isListening) {
            recognitionRef.current.stop();
         }
         if (previewAudioRef.current) previewAudioRef.current.pause();
         if (audioRef.current) audioRef.current.pause();
         if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };
   }, []);

   useEffect(() => {
      if (!voiceId) return;
      loadVoiceSettings(voiceId);
   }, [voiceId]);

   const loadHistory = async () => {
      try {
         setIsLoadingHistory(true);
         const data = await elevenlabsApi.getVoiceHistory();
         setHistory(data.history || []);
      } catch (e: any) {
         toast.error(`Lỗi đồng bộ lịch sử: ${e.message}`);
      } finally {
         setIsLoadingHistory(false);
      }
   };

   const loadCustomVoices = async () => {
      try {
         const response = await elevenlabsApi.getVoices();
         if (response && response.voices) {
            const mappedVoices = response.voices.map((voice: any) => ({
               ...voice,
               id: voice.voice_id,
               label: voice.name || 'ElevenLabs Voice',
               gender: voice.labels?.gender || 'female',
               description: voice.description || voice.category || 'ElevenLabs voice',
            }));
            setAvailableVoices(mappedVoices);
            setVoiceId((currentVoiceId) => {
               const hasCurrentVoice = mappedVoices.some((voice: any) => voice.voice_id === currentVoiceId);
               if (hasCurrentVoice) return currentVoiceId;
               return mappedVoices[0]?.voice_id || currentVoiceId;
            });
         }
      } catch (e) {
         console.error("Lỗi lấy danh sách giọng nói cá nhân:", e);
      }
   };

   const loadModels = async () => {
      try {
         const response = await elevenlabsApi.getModels();
         if (response && response.models) {
            setAvailableModels(response.models);
         }
      } catch (e) {
         console.error("Lỗi lấy danh sách model ElevenLabs:", e);
      }
   };

   const loadVoiceSettings = async (targetVoiceId: string) => {
      if (!targetVoiceId) return;
      try {
         const settings = await elevenlabsApi.getVoiceSettings(targetVoiceId);
         if (typeof settings?.stability === 'number') {
            setStability(settings.stability);
         }
         if (typeof settings?.similarity_boost === 'number') {
            setSimilarityBoost(settings.similarity_boost);
         }
         if (typeof settings?.use_speaker_boost === 'boolean') {
            setUseSpeakerBoost(settings.use_speaker_boost);
         }
      } catch (e) {
         console.error('Lỗi lấy voice settings ElevenLabs:', e);
         setStability(0.5);
         setSimilarityBoost(0.75);
         setUseSpeakerBoost(true);
      }
   };

   const getVoiceDetails = (id: string) => {
      const standardVoice = availableVoices.find(v => v.voice_id === id);
      if (standardVoice) {
         return {
            id: standardVoice.voice_id,
            label: standardVoice.name || 'ElevenLabs Voice',
            gender: standardVoice.labels?.gender || 'female',
            description: standardVoice.description || standardVoice.category || 'ElevenLabs voice',
            tags: `${standardVoice.gender === 'male' ? 'Nam' : 'Nữ'} • ${standardVoice.description}`
         };
      }
      const customVoice = availableVoices.find(v => v.voice_id === id);
      if (customVoice) {
         return {
            id: customVoice.voice_id,
            label: customVoice.name,
            gender: customVoice.labels?.gender || 'female',
            description: customVoice.description || 'Giọng đã nhân bản',
            tags: `${customVoice.labels?.gender === 'male' ? 'Nam' : 'Nữ'} • Giọng cá nhân`
         };
      }
      return {
         id: availableVoices[0]?.voice_id || '',
         label: availableVoices[0]?.name || 'ElevenLabs Voice',
         gender: availableVoices[0]?.labels?.gender || 'male',
         description: availableVoices[0]?.description || 'Default ElevenLabs voice',
         tags: 'Nam • iGen Audio v3'
      };
   };

      const getVoiceDisplayName = (voiceIdOrName: string) => {
      if (!voiceIdOrName) return 'Roger - Laid-Back, Casual, Resonant';

      // 1. Try to find in preset voices (ALL_VOICES) using the preset ID (e.g. 'Aoede')
      const preset = ALL_VOICES.find(v => v.id === voiceIdOrName);
      if (preset) {
         return `${preset.label} (${voiceIdOrName})`;
      }

      // 2. Try to find in availableVoices (which has ElevenLabs voices, e.g. "Bella" with ID "EXAVITQu4vr4xnSDxMaL")
      const avVoice = availableVoices.find(v => v.voice_id === voiceIdOrName || v.id === voiceIdOrName);
      if (avVoice) {
         const voiceName = avVoice.name || avVoice.label || 'ElevenLabs Voice';
         return `${voiceName} (${voiceIdOrName})`;
      }

      // 3. Let's check if the ID corresponds to any preset's mapped ID in ELEVENLABS_VOICE_MAP_LOCAL
      const presetVoiceKey = Object.keys(ELEVENLABS_VOICE_MAP_LOCAL).find(
         key => ELEVENLABS_VOICE_MAP_LOCAL[key] === voiceIdOrName
      );
      if (presetVoiceKey) {
         const presetByMappedId = ALL_VOICES.find(v => v.id === presetVoiceKey);
         if (presetByMappedId) {
            return `${presetByMappedId.label} (${voiceIdOrName})`;
         }
      }

      // 4. Fallback: just return the voiceIdOrName itself
      return voiceIdOrName;
   };

const getSelectedVoice = () => {
      return getVoiceDetails(voiceId);
   };

   const playPreviewAudio = (url: string) => {
      if (previewAudioRef.current) {
         previewAudioRef.current.pause();
      }
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.play();
   };

   const handlePreviewVoice = async (id?: string) => {
      const targetId = id || voiceId;
      const currentVoice = getVoiceDetails(targetId);

      // Check cache
      if (previewCache[targetId]) {
         playPreviewAudio(previewCache[targetId]);
         return;
      }

      setIsPreviewing(true);
      try {
         const previewText = currentVoice.gender === 'female'
            ? `Xin chào, đây là giọng nói của tôi. Rất vui được gặp bạn.`
            : `Xin chào, đây là giọng nói của tôi. Chúc bạn một ngày tốt lành.`;

         const result = await elevenlabsApi.generateVoice({
            textToSpeak: previewText,
            mode: 'single',
            temperature: 1.0,
            speakerA: 'Aoede',
            speakerB: 'Puck',
            modelName: 'eleven_multilingual_v2',
            voiceName: targetId,
            saveToHistory: false,
         });

         const previewUrl = result.url || result.record?.url;
         if (previewUrl) {
            setPreviewCache(prev => ({ ...prev, [targetId]: previewUrl }));
            playPreviewAudio(previewUrl);
         }
      } catch (e: any) {
         toast.error(`Lỗi phát thử: ${e.message}`);
      } finally {
         setIsPreviewing(false);
      }
   };

   // Speech to text integration
   const toggleDictation = () => {
      if (isListening) {
         if (recognitionRef.current) {
            recognitionRef.current.stop();
         }
         setIsListening(false);
         return;
      }

      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
         toast.warning('Trình duyệt của bạn không hỗ trợ nhận diện giọng nói (Speech Recognition).');
         return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'vi-VN';
      recognitionRef.current = recognition;

      const startText = text;

      recognition.onstart = () => {
         setIsListening(true);
         toast.success('Đang lắng nghe... Hãy nói vào Microphone.');
      };

      recognition.onresult = (event: any) => {
         let currentTranscript = '';
         for (let i = event.resultIndex; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
         }
         setText(startText + currentTranscript);
      };

      recognition.onerror = (e: any) => {
         console.error(e);
         setIsListening(false);
      };

      recognition.onend = () => setIsListening(false);

      try { recognition.start(); } catch (e) { setIsListening(false); }
   };

   const handleOptimizeScript = async () => {
      if (!text.trim()) {
         toast.warning('Vui lòng nhập kịch bản cần tối ưu.');
         return;
      }
      setIsOptimizing(true);
      try {
         toast.success('AI đang tối ưu hóa kịch bản...');
         const selectedTextModel = localStorage.getItem('selected_ai_model') || 'gemini-3.5-flash';
         const result = await geminiApi.optimizeScript(
            text,
            styleInstructions || 'hấp dẫn, lôi cuốn',
            selectedTextModel
         );
         if (result.optimizedText) {
            setText(result.optimizedText);
            toast.success('Tối ưu hóa kịch bản thành công!');
         }
      } catch (error: any) {
         toast.error(`Lỗi: ${error.message}`);
      } finally {
         setIsOptimizing(false);
      }
   };

   const handleGenerate = async () => {
      if (!text.trim()) {
         toast.warning('Vui lòng nhập văn bản cần đọc.');
         return;
      }

      setIsGenerating(true);
      setAudioUri(null);
      setIsPlaying(false);

      try {
         toast.success('Đang bắt đầu tạo giọng nói AI...');

         // Map frontend model name to actual ElevenLabs model ID
         const modelId = voiceModel;

         const result = await elevenlabsApi.generateVoice({
            textToSpeak: text,
            styleInstructions,
            mode,
            temperature,
            modelName: modelId,
            voiceName: voiceId,
            speakerA,
            speakerB,
            title: archiveTitle.trim() || undefined,
            description: archiveDescription.trim() || undefined,
            stability: stability,
            similarityBoost: similarityBoost,
            useSpeakerBoost: useSpeakerBoost,
         });

         if (result.record?.url) {
            setAudioUri(result.record.url);
            toast.success('Tạo giọng nói thành công!');
            loadHistory(); // Reload history

            if (activeCardId) {
               toast.info('Đang đồng bộ audio lên Cloudinary...');
               try {
                  const filename = `voice_${Date.now()}.mp3`;
                  const cloudinaryUrl = await marketingService.uploadMediaToStorage(result.record.url, filename, 'video');
                  await marketingService.updateCard(activeCardId, {
                     audioUrl: cloudinaryUrl,
                     voiceScript: text,
                     audioRecordId: result.record?._id || result.record?.id,
                     voiceTitle: archiveTitle.trim() || undefined,
                     voiceDescription: archiveDescription.trim() || undefined
                  });
                  if (onMediaSaved) {
                     onMediaSaved(activeCardId, cloudinaryUrl, 'audio');
                  }
                                    toast.success('Đã lưu trữ và đồng bộ hóa audio thành công!');
                  try {
                     const card = await marketingService.getCardById(activeCardId);
                     if (card && card.mediaType === 'human-video' && onNavigateToHumanVideo) {
                        toast.info('Đang tự động chuyển sang Xưởng Video để tạo video người thật...');
                        onNavigateToHumanVideo();
                     }
                  } catch (cardErr) {
                     console.error('Lỗi khi nạp thông tin card để chuyển tab:', cardErr);
                  }
               } catch (uploadError: any) {
                  console.error('Cloudinary audio error:', uploadError);
                  toast.error('Tạo audio thành công nhưng không thể đồng bộ hóa lưu trữ.');
               }
            }
         }
      } catch (error: any) {
         console.error(error);
         toast.error(`Lỗi sinh giọng nói: ${error.message}`);
      } finally {
         setIsGenerating(false);
      }
   };

   useEffect(() => {
       const cacheKey = `autotrigger_voice_${activeCardId}`;
       if (autoTrigger && text.trim() && !isGenerating && !audioUri && !sessionStorage.getItem(cacheKey)) {
          sessionStorage.setItem(cacheKey, 'true');
          void handleGenerate();
       }
    }, [autoTrigger, text, activeCardId]);

   const handleDeleteHistory = async (id: string) => {
      if (!confirm("Bạn có chắc chắn muốn xóa bản thu âm này?")) return;
      try {
         await elevenlabsApi.deleteVoiceHistory(id);
         toast.success('Đã xóa bản thu âm khỏi lịch sử.');
         setHistory(prev => prev.filter(r => r._id !== id && r.id !== id));
      } catch (e: any) {
         toast.error(`Lỗi khi xóa: ${e.message}`);
         loadHistory();
      }
   };

   const handleDeleteCustomVoice = async (e: React.MouseEvent, voiceIdToDelete: string) => {
      e.stopPropagation();
      if (!confirm("Bạn có chắc chắn muốn xóa giọng nói nhân bản này?")) return;
      try {
         await elevenlabsApi.deleteVoice(voiceIdToDelete);
         toast.success('Đã xóa giọng nói thành công.');
         if (voiceId === voiceIdToDelete) {
            setVoiceId(availableVoices.find(v => v.voice_id !== voiceIdToDelete)?.voice_id || '');
         }
         loadCustomVoices();
      } catch (e: any) {
         toast.error(`Lỗi khi xóa giọng nói: ${e.message}`);
      }
   };

   const handleSaveVoiceSettings = async () => {
      try {
         setIsSavingVoiceSettings(true);
         await elevenlabsApi.updateVoiceSettings(voiceId, {
            stability,
            similarity_boost: similarityBoost,
            use_speaker_boost: useSpeakerBoost,
         });
         toast.success('đã lưu voice settings lên ElevenLabs.');
      } catch (e: any) {
         toast.error(`Không thể lưu voice settings: ${e.message}`);
      } finally {
         setIsSavingVoiceSettings(false);
      }
   };

   const handleResetVoiceSettings = () => {
      setVoiceId(availableVoices[0]?.voice_id || '');
      setStability(0.50);
      setSimilarityBoost(0.75);
      setUseSpeakerBoost(true);
      setVoiceModel('eleven_turbo_v2_5');
      setUseLanguageToggle(true);
      toast.success('Đã khôi phục cài đặt mặc định.');
   };

   const handlePlayHistory = (url: string) => {
      setAudioUri(url);
      setIsPlaying(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => { if (audioRef.current) audioRef.current.play(); }, 100);
   };

   const togglePlay = () => {
      if (!audioRef.current) return;
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
   };

   const handleDownload = async (uri?: string, customName?: string) => {
      const targetUri = uri || audioUri;
      if (!targetUri) return;
      toast.info("Đang tải xuống tệp âm thanh...");
      try {
         const fileName = customName || `igen-voice-${Date.now()}.wav`;
         const proxyUrl = `/api/v1/media/download?url=${encodeURIComponent(targetUri)}&filename=${encodeURIComponent(fileName)}`;
         
         const response = await fetch(proxyUrl, {
            headers: {
               "Authorization": `Bearer ${getAccessToken()}`,
            },
         });

         if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
         const blob = await response.blob();
         const blobUrl = window.URL.createObjectURL(blob);
         const link = document.createElement('a');
         link.href = blobUrl;
         link.download = fileName;
         document.body.appendChild(link);
         link.click();
         document.body.removeChild(link);
         window.URL.revokeObjectURL(blobUrl);
         toast.success("Tải xuống thành công!");
      } catch (error) {
         console.error("Direct audio download failed, falling back:", error);
         const link = document.createElement('a');
         link.href = targetUri;
         link.target = '_blank';
         link.click();
         toast.warning("Mở tệp âm thanh trong tab mới để tải về.");
      }
   };

   const handleTimeUpdate = () => {
      if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
   };

   const handleLoadedMetadata = () => {
      if (audioRef.current) setDuration(audioRef.current.duration);
   };

   const formatTime = (time: number) => {
      if (isNaN(time)) return '0:00';
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      return `${minutes}:${seconds.toString().padStart(2, '0')}`;
   };



   // Instant cloning wizard helper
   const processCloneFile = async (file: File) => {
      if (!file.type.startsWith('audio/') && !file.type.startsWith('video/')) {
         toast.error('Vui l\u00f2ng t\u1ea3i l\u00ean \u0111\u1ecbnh d\u1ea1ng file \u00e2m thanh ho\u1eb7c video!');
         return;
      }
      try {
         // Get audio duration using HTML5 Audio
         const getDuration = (): Promise<number> => {
            return new Promise((resolve) => {
               const audio = new Audio();
               audio.src = URL.createObjectURL(file);
               audio.addEventListener('loadedmetadata', () => {
                  resolve(audio.duration);
                  URL.revokeObjectURL(audio.src);
               });
               audio.addEventListener('error', () => {
                  resolve(0);
               });
            });
         };

         const duration = await getDuration();

         const reader = new FileReader();
         reader.readAsDataURL(file);
         reader.onload = () => {
            const base64Data = reader.result as string;
            setInstantFiles(prev => [...prev, {
               file: base64Data,
               name: file.name,
               size: file.size,
               duration: duration
            }]);
         };
      } catch (err: any) {
         console.error("L\u1ed7i x\u1eed l\u00fd file \u00e2m thanh:", err);
         toast.error(`Kh\u00f4ng th\u1ec3 x\u1eed l\u00fd file \u00e2m thanh: ${err.message || err}`);
      }
   };

   const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
         Array.from(e.target.files).forEach((file: any) => {
            processCloneFile(file);
         });
      }
   };

   const handleStartRecordingClone = async () => {
      try {
         const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
         const mediaRecorder = new MediaRecorder(stream);
         mediaRecorderRef.current = mediaRecorder;
         audioChunksRef.current = [];

         mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) audioChunksRef.current.push(event.data);
         };

         mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
            const file = new File([blob], `ghi-am-${Date.now()}.webm`, { type: 'audio/webm' });
            processCloneFile(file);
         };

         mediaRecorder.start();
         setIsRecordingClone(true);
         setRecordingDuration(0);
         recordingTimerRef.current = setInterval(() => {
            setRecordingDuration(prev => prev + 1);
         }, 1000);
      } catch (e: any) {
         toast.error('Không thể kết nối Microphone: ' + e.message);
      }
   };

   const handleStopRecordingClone = () => {
      if (mediaRecorderRef.current && isRecordingClone) {
         mediaRecorderRef.current.stop();
         setIsRecordingClone(false);
         if (recordingTimerRef.current) {
            clearInterval(recordingTimerRef.current);
         }
      }
   };

   const removeCloneFile = (idx: number) => {
      setInstantFiles(prev => prev.filter((_, i) => i !== idx));
   };

   const togglePlayCloneFile = (idx: number) => {
      if (playingFileIndex === idx) {
         cloneAudioElementRef.current?.pause();
         setPlayingFileIndex(null);
         return;
      }
      if (cloneAudioElementRef.current) {
         cloneAudioElementRef.current.pause();
      }
      const audio = new Audio(instantFiles[idx].file);
      cloneAudioElementRef.current = audio;
      audio.play();
      audio.onended = () => setPlayingFileIndex(null);
      setPlayingFileIndex(idx);
   };

   const totalCloneDuration = instantFiles.reduce((sum, f) => sum + (f.duration || 0), 0);

   // Submit Instant Cloning
   const handleSaveInstantClone = async () => {
      if (!newVoiceName.trim()) {
         toast.warning('Vui lòng nhập tên giọng nói');
         return;
      }
      if (instantFiles.length === 0) {
         toast.warning('Vui lòng cung cấp ít nhất 1 file audio mẫu');
         return;
      }

      setIsSavingVoice(true);
      try {
         const response = await elevenlabsApi.addVoice({
            name: newVoiceName,
            description: newVoiceDescription,
            files: instantFiles.map(f => f.file)
         });
         if (response && response.voice_id) {
            toast.success('Nhân bản giọng nói thành công!');
            setVoiceId(response.voice_id);
            loadCustomVoices();
            setCreateStep('finish');
         }
      } catch (e: any) {
         toast.error('Lỗi khi nhân bản giọng nói: ' + e.message);
      } finally {
         setIsSavingVoice(false);
      }
   };

   // Custom voice design flow (Thiết kế giọng nói)
   const handleGenerateDesignPreview = async () => {
      setIsGeneratingDesignPreview(true);
      setDesignPreviewUrl(null);
      try {
         const res = await elevenlabsApi.generateCustomVoicePreview({
            gender: designGender,
            age: designAge,
            accent: designAccent,
            accentStrength: designAccentStrength,
            text: designText
         });
         if (res && res.url) {
            setDesignPreviewVoiceId(res.generatedVoiceId);
            setDesignPreviewUrl(res.url);
            toast.success('Tạo bản nghe thử thành công! Nhấn phát để nghe.');
         }
      } catch (e: any) {
         toast.error('Lỗi thiết kế nghe thử: ' + e.message);
      } finally {
         setIsGeneratingDesignPreview(false);
      }
   };

   const handleSaveDesignedVoice = async () => {
      if (!newVoiceName.trim()) {
         toast.warning('Vui lòng nhập tên giọng nói để lưu.');
         return;
      }
      if (!designPreviewVoiceId) {
         toast.warning('Vui lòng bấm nghe thử giọng nói trước khi lưu.');
         return;
      }

      setIsSavingVoice(true);
      try {
         const res = await elevenlabsApi.createCustomVoice({
            voiceName: newVoiceName,
            voiceDescription: newVoiceDescription || `Giọng tự thiết kế (${designGender}, ${designAge}, ${designAccent})`,
            generatedVoiceId: designPreviewVoiceId
         });
         if (res && res.voice_id) {
            toast.success('Lưu giọng thiết kế thành công!');
            setVoiceId(res.voice_id);
            loadCustomVoices();
            setCreateStep('finish');
         }
      } catch (e: any) {
         toast.error('Lỗi lưu giọng nói: ' + e.message);
      } finally {
         setIsSavingVoice(false);
      }
   };

   const selectedVoice = getSelectedVoice();
   const myVoicesList = availableVoices.filter(v => v.category === 'cloned' || v.category === 'generated' || v.category === 'custom');
   const libraryVoicesList = availableVoices.filter(v => !['cloned', 'generated', 'custom'].includes(v.category));
   const quickLibraryVoices = libraryVoicesList.slice(0, 8);
   const activeModelInfo = availableModels.find((model: any) => model.model_id === getActiveModelId(voiceModel));
   const activeModelLabel = MODEL_OPTIONS.find((opt) => opt.key === voiceModel)?.title || activeModelInfo?.name;
   const multilingualModelDetails = getModelDetails('eleven_multilingual_v2', availableModels);
   const flashModelDetails = getModelDetails('eleven_flash_v2_5', availableModels);
   const turboModelDetails = getModelDetails('eleven_turbo_v2_5', availableModels);

   return (
      <div className="space-y-6 max-w-[1400px] mx-auto w-full pb-12 font-sans text-slate-800" id="voice_workspace_wrapper">

         <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* LEFT COLUMN: Input Form */}
            <div className="lg:col-span-5 flex flex-col gap-6">
               <div className="border border-slate-200 bg-white rounded-2xl shadow-xs p-5 flex flex-col gap-4">

                  {/* Chosen Voice Panel */}
                  <div className="flex flex-col gap-2">
                     <div className="flex items-center justify-between gap-3">
                        <label className="text-xs font-bold text-slate-700">Giọng nói đã chọn</label>
                        <div className="flex items-center gap-2">
                           <button
                              onClick={() => {
                                 setIsVoicePickerView(true);
                                 setVoiceActiveTab('library');
                                 setIsAdvancedModalOpen(true);
                              }}
                              className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[11px] font-bold border flex items-center gap-1.5 transition-all"
                           >
                              <BookOpen className="h-3.5 w-3.5 text-slate-500" />
                              Thư viện giọng nói
                           </button>
                        </div>
                     </div>

                     <div className="border border-slate-200 rounded-xl p-4 flex flex-col gap-1 bg-slate-50/50">
                        <span className="text-xs font-bold text-slate-950 truncate">
                           {selectedVoice.label}{selectedVoice.description ? ` - ${selectedVoice.description}` : ''}
                        </span>
                     </div>

                  </div>

                  {/* Direct Voice Settings */}
                  <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/40 flex flex-col gap-4">

                     <div className="flex flex-col gap-2">
                        <span className="text-xs font-bold text-slate-700">Model AI</span>
                        {activeModelLabel && (
                           <span className="text-[10px] text-slate-400">Đang sử dụng model iGen Audio: {activeModelLabel}</span>
                        )}
                        <select
                           value={voiceModel}
                           onChange={(e) => setVoiceModel(e.target.value as 'eleven_flash_v2_5' | 'eleven_turbo_v2_5')}
                           className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-cyan-500/20 focus:border-cyan-500 outline-none cursor-pointer"
                        >
                           {MODEL_OPTIONS.map((opt) => (
                              <option key={opt.key} value={opt.key}>
                                 {opt.title}
                              </option>
                           ))}
                        </select>
                     </div>
                  </div>



                  {/* Mẫu phong cách đọc */}
                  <div className="flex flex-col gap-2">
                     <div className="flex justify-between items-center">
                        <label className="text-xs font-bold text-slate-700">Mẫu phong cách đọc</label>
                        <select
                           value={VOICE_STYLE_TEMPLATES.find(t => t.prompt === selectedStylePrompt)?.id || 'none'}
                           onChange={(e) => {
                              const t = VOICE_STYLE_TEMPLATES.find(x => x.id === e.target.value);
                              setSelectedStylePrompt(t ? t.prompt : '');
                           }}
                           className="text-[11px] font-bold text-slate-650 border border-slate-200 rounded-lg p-1.5 px-2 bg-white focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                        >
                           {VOICE_STYLE_TEMPLATES.map(t => (
                              <option key={t.id} value={t.id}>{t.label}</option>
                           ))}
                        </select>
                     </div>
                  </div>

                  {/* TEXT AREA INPUT */}
                  <div className="flex flex-col gap-2">
                     <div className="flex justify-between items-center">
                        <h4 className="font-bold text-slate-700 text-xs">Văn bản cần đọc</h4>
                        <div className="text-[10px] text-slate-400 font-mono">
                           {text.length} ký tự
                        </div>
                     </div>

                     <div className="relative">
                        <textarea
                            placeholder="Nhập văn bản bạn muốn chuyển thành giọng nói... Ví dụ: Xin chào, tôi là trợ lý ảo AI của bạn!"
                            className="w-full text-xs p-4 pr-32 border border-slate-200 rounded-xl h-44 focus:ring-1 focus:ring-cyan-500 focus:outline-none leading-relaxed font-sans resize-none"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            disabled={isGenerating}
                         />
                         <button
                            type="button"
                            onClick={handleOptimizeScript}
                            disabled={isOptimizing || isGenerating || !text.trim()}
                            className="absolute bottom-3 right-3 px-3 py-1.5 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg text-[10px] font-bold transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
                         >
                            {isOptimizing ? (
                               <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span>Đang tối ưu...</span>
                               </>
                            ) : (
                               <>
                                  <Sparkles className="h-3 w-3" />
                                  <span>Tối ưu kịch bản (AI)</span>
                               </>
                            )}
                         </button>
                     </div>
                  </div>

                  {/* Archive Title & Description Inputs */}
                  <div className="grid grid-cols-2 gap-4">
                     <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-700">Tiêu đề lưu trữ <span className="text-slate-400 font-normal">(Tùy chọn)</span></label>
                        <input
                           type="text"
                           placeholder="Ví dụ: Đoạn mở đầu Video"
                           value={archiveTitle}
                           onChange={(e) => setArchiveTitle(e.target.value)}
                           className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                     </div>
                     <div className="flex flex-col gap-1">
                        <label className="text-xs font-bold text-slate-700">Mô tả / Ghi chú <span className="text-slate-400 font-normal">(Tùy chọn)</span></label>
                        <input
                           type="text"
                           placeholder="Ví dụ: Đọc nhấn nhá đoạn kết"
                           value={archiveDescription}
                           onChange={(e) => setArchiveDescription(e.target.value)}
                           className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-cyan-500"
                        />
                     </div>
                  </div>

                  {/* Progress simulated bar and Action Button */}
                  <div className="flex flex-col gap-3 mt-1">
                     {(isGenerating || isOptimizing) && (
                        <div className="flex flex-col gap-1.5 p-3.5 bg-slate-50 border border-slate-100 rounded-xl animate-pulse">
                           <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 font-mono">
                              <span>{isOptimizing ? 'AI ĐANG BIÊN SOẠN LẠI VĂN BẢN...' : 'AI ĐANG MÃ HÓA GIỌNG ĐỌC...'}</span>
                              <span>{isOptimizing ? optimizeProgress : generateProgress}%</span>
                           </div>
                           <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                              <div
                                 className="bg-cyan-500 h-full transition-all duration-300 rounded-full"
                                 style={{ width: `${isOptimizing ? optimizeProgress : generateProgress}%` }}
                              />
                           </div>
                        </div>
                     )}

                     <button
                        onClick={handleGenerate}
                        disabled={isGenerating || isOptimizing || !text.trim()}
                        className={`w-full py-3 rounded-xl text-xs font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-2 ${isGenerating || isOptimizing || !text.trim()
                           ? "bg-slate-100 text-slate-450 cursor-not-allowed"
                           : "bg-cyan-500 hover:bg-cyan-600 text-white active:scale-[0.99] shadow-md shadow-cyan-500/10"
                           }`}
                     >
                        {isGenerating ? <Loader2 className="h-4.5 w-4.5 animate-spin" /> : <TapeIcon className="h-4.5 w-4.5" />}
                        Tạo Giọng Nói
                     </button>
                  </div>

               </div>
            </div>

            {/* RIGHT COLUMN: Player & History */}
            <div className="lg:col-span-7 flex flex-col gap-6">

               {/* AUDIO OUTPUT BOX */}
               <div className="border border-slate-200 bg-white rounded-2xl shadow-xs p-5 min-h-[220px] flex flex-col justify-center">
                  {!audioUri ? (
                     <div className="flex flex-col items-center justify-center text-slate-400 text-center py-6">
                        <div className="p-4 bg-cyan-50/50 text-cyan-500 rounded-full mb-3 shadow-xs">
                           <TapeIcon className="h-8 w-8 text-cyan-500/70" />
                        </div>
                        <span className="text-xs font-bold text-slate-700">Audio sẽ xuất hiện ở đây</span>
                        <span className="text-[10px] text-slate-450 mt-1">Chọn giọng nói, nhập văn bản và nhấn &quot;Tạo Giọng Nói&quot;</span>
                     </div>
                  ) : (
                     <div className="bg-white border border-slate-100 p-4 rounded-xl flex flex-col gap-3 shadow-xs">
                        <audio
                           ref={audioRef}
                           src={audioUri}
                           onTimeUpdate={handleTimeUpdate}
                           onLoadedMetadata={handleLoadedMetadata}
                           onEnded={() => setIsPlaying(false)}
                           className="hidden"
                        />
                        <div className="flex items-center gap-4">
                           <button
                              onClick={togglePlay}
                              className="w-12 h-12 rounded-full bg-cyan-500 hover:bg-cyan-600 text-white flex items-center justify-center shrink-0 shadow-md cursor-pointer transition-transform active:scale-95"
                           >
                              {isPlaying ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white ml-0.5" />}
                           </button>

                           <div className="flex-1 flex flex-col gap-1">
                              <span className="text-[10px] font-bold tracking-wide uppercase text-cyan-600 font-mono">Bản thu phát âm mới nhất</span>
                              <div className="flex items-center gap-2">
                                 <span className="text-[10px] font-mono text-slate-400">{formatTime(currentTime)}</span>
                                 <div className="flex-1 relative group cursor-pointer h-1.5 bg-slate-100 rounded-full">
                                    <div
                                       className="absolute left-0 top-0 h-full bg-cyan-500 rounded-full"
                                       style={{ width: `${(currentTime / (duration || 1)) * 100}%` }}
                                    />
                                 </div>
                                 <span className="text-[10px] font-mono text-slate-400">{formatTime(duration)}</span>
                              </div>
                           </div>

                           <button
                              onClick={() => handleDownload()}
                              className="p-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-slate-600 hover:text-slate-800 transition-colors"
                              title="Tải âm thanh WAV về máy"
                           >
                              <Download className="h-4.5 w-4.5" />
                           </button>
                        </div>
                        {onNavigateToHumanVideo && (
                           <div className="mt-2 pt-3 border-t border-slate-100 flex justify-end">
                              <button
                                 type="button"
                                 onClick={onNavigateToHumanVideo}
                                 className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                              >
                                 <Sparkles className="h-3.5 w-3.5 text-purple-250 animate-pulse" />
                                 <span>Chuyển sang tạo Video người thật</span>
                                 <ChevronRight className="h-4 w-4" />
                              </button>
                           </div>
                        )}
                     </div>
                  )}
               </div>

               {/* Audio library list */}
               <div className="border border-slate-200 bg-white rounded-2xl shadow-xs p-5 flex flex-col gap-4">
                  <h4 className="font-bold text-slate-800 text-xs tracking-wider uppercase flex items-center gap-1.5 border-b pb-3">
                     <Clock className="h-4.5 w-4.5 text-cyan-650" />
                     Lịch sử tạo giọng nói <span className="ml-1.5 px-2 py-0.5 bg-slate-100 rounded-full text-[10px] text-slate-500 font-mono font-bold">{history.length}</span>
                  </h4>

                  {isLoadingHistory ? (
                     <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                        <Loader2 className="h-8 w-8 text-cyan-500 animate-spin mb-2" />
                        <span className="text-xs font-semibold uppercase tracking-wider font-mono">Đang đồng bộ dữ liệu...</span>
                     </div>
                  ) : history.length === 0 ? (
                     <div className="flex flex-col items-center justify-center py-12 text-slate-400 border border-dashed rounded-xl">
                        <TapeIcon className="h-10 w-10 text-slate-350 mb-2" />
                        <span className="text-xs font-semibold">Chưa có lịch sử tạo giọng nói nào</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">Nhập kịch bản ở trên để lưu bản thu của bạn</span>
                     </div>
                  ) : (
                     <div className="flex flex-col gap-3 max-h-[380px] overflow-y-auto pr-1">
                        {history.map((record) => {
                           const id = record._id || record.id;
                           return (
                              <div
                                 key={id}
                                 className="bg-white border border-slate-150 p-3.5 rounded-xl hover:shadow-xs transition-all flex items-center justify-between gap-4"
                              >
                                 <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <button
                                       onClick={() => handlePlayHistory(record.url)}
                                       className="h-8 w-8 rounded-full bg-white hover:bg-slate-50 border flex items-center justify-center shrink-0 shadow-xs text-slate-500 hover:text-slate-700"
                                    >
                                       <Play className="h-4 w-4 ml-0.5 text-slate-400 fill-slate-400" />
                                    </button>
                                    <div className="min-w-0 flex-1">
                                       <p className="text-xs font-bold text-slate-900 truncate">
                                          {record.metadata?.title || record.prompt}
                                       </p>
                                       {record.metadata?.title && (
                                          <p className="text-[10px] text-slate-500 truncate mt-0.5">
                                             {record.prompt}
                                          </p>
                                       )}
                                       <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                          {getVoiceDisplayName(record.metadata?.voiceName)}
                                       </p>
                                    </div>
                                 </div>

                                 <div className="flex items-center gap-1">
                                    <button
                                       onClick={() => handleDownload(record.url, `igen-voice-${id}.wav`)}
                                       className="p-2 text-slate-500 hover:bg-slate-50 rounded-md transition-colors"
                                       title="Tải về file WAV"
                                    >
                                       <Download className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                       onClick={() => handleDeleteHistory(id)}
                                       className="p-2 text-red-500 hover:bg-red-50 rounded-md transition-colors"
                                       title="Xóa bản thu"
                                    >
                                       <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                 </div>
                              </div>
                           );
                        })}
                     </div>
                  )}
               </div>
            </div>


         </div>

         {/* MODAL 1: VOICE PICKER */}
         {isAdvancedModalOpen && isVoicePickerView && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
               <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">

                  {/* Modal Header */}
                  <div className="flex justify-between items-center border-b p-5 shrink-0">
                     <div>
                        <h3 className="font-bold text-slate-900 text-sm">Cài đặt giọng nói nâng cao</h3>
                        <p className="text-[11px] text-slate-400 mt-1">Tinh chỉnh model, giọng và các thông số khác để có kết quả tốt nhất.</p>
                     </div>
                     <button
                        onClick={() => {
                           setIsAdvancedModalOpen(false);
                           setIsVoicePickerView(false);
                        }}
                        className="p-1 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                     >
                        <X className="h-4.5 w-4.5" />
                     </button>
                  </div>

                  {/* Modal Body */}
                  <div className="p-6 overflow-y-auto flex-1 space-y-5">

                     {isVoicePickerView ? (
                        // VIEW: VOICE PICKER LIST
                        <div className="space-y-4">
                           <div className="flex items-center gap-2 border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
                              <Search className="h-4 w-4 text-slate-400 shrink-0" />
                              <input
                                 type="text"
                                 placeholder="Tìm kiếm giọng nói..."
                                 value={searchQuery}
                                 onChange={(e) => setSearchQuery(e.target.value)}
                                 className="text-xs bg-transparent border-none focus:outline-none w-full"
                              />
                           </div>

                           {/* Tabs */}
                           <div className="flex border-b border-slate-100">
                              <button
                                 onClick={() => setVoiceActiveTab('my-voices')}
                                 className={`flex-1 pb-2 text-xs font-bold border-b-2 text-center transition-all ${voiceActiveTab === 'my-voices' ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-400'
                                    }`}
                              >
                                 Giọng của tôi ({myVoicesList.length})
                              </button>
                              <button
                                 onClick={() => setVoiceActiveTab('library')}
                                 className={`flex-1 pb-2 text-xs font-bold border-b-2 text-center transition-all ${voiceActiveTab === 'library' ? 'border-cyan-500 text-cyan-600' : 'border-transparent text-slate-400'
                                    }`}
                              >
                                 Thư viện ({libraryVoicesList.length})
                              </button>
                           </div>

                           {/* List voices */}
                           <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                              {voiceActiveTab === 'my-voices' ? (
                                 myVoicesList.length === 0 ? (
                                    <div className="text-center py-8 text-slate-400 text-xs">
                                       Chưa có giọng nói nhân bản nào. Bấm &quot;Thêm giọng nói mới&quot; ở trang chính để nhân bản.
                                    </div>
                                 ) : (
                                    myVoicesList.filter(v => v.name.toLowerCase().includes(searchQuery.toLowerCase())).map(v => {
                                       const isSelected = voiceId === v.voice_id;
                                       return (
                                          <div
                                             key={v.voice_id}
                                             onClick={() => {
                                                setVoiceId(v.voice_id);
                                                setIsVoicePickerView(false);
                                             }}
                                             className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-cyan-50/50 border-cyan-300' : 'hover:bg-slate-50 border-slate-100'
                                                }`}
                                          >
                                             <div className="flex items-center gap-3">
                                                <button
                                                   onClick={(e) => {
                                                      e.stopPropagation();
                                                      handlePreviewVoice(v.voice_id);
                                                   }}
                                                   className="h-8 w-8 rounded-full bg-white border flex items-center justify-center text-slate-700 shadow-xs shrink-0"
                                                >
                                                   <Play className="h-4 w-4 ml-0.5" />
                                                </button>
                                                <div>
                                                   <p className="text-xs font-bold text-slate-900">{v.name}</p>
                                                   <p className="text-[10px] text-slate-450 mt-0.5">Giọng đã nhân bản</p>
                                                </div>
                                             </div>
                                             <button
                                                onClick={(e) => handleDeleteCustomVoice(e, v.voice_id)}
                                                className="p-1.5 hover:bg-red-50 text-red-500 rounded-md transition-colors"
                                                title="Xóa giọng nhân bản"
                                             >
                                                <Trash2 className="h-4 w-4" />
                                             </button>
                                          </div>
                                       );
                                    })
                                 )
                              ) : (
                                 libraryVoicesList.filter(v => (v.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || (v.description || '').toLowerCase().includes(searchQuery.toLowerCase())).map(v => {
                                    const isSelected = voiceId === v.voice_id;
                                    return (
                                       <div
                                          key={v.voice_id}
                                          onClick={() => {
                                             setVoiceId(v.voice_id);
                                             setIsVoicePickerView(false);
                                          }}
                                          className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-cyan-50/50 border-cyan-300' : 'hover:bg-slate-50 border-slate-100'
                                             }`}
                                       >
                                          <div className="flex items-center gap-3">
                                             <button
                                                onClick={(e) => {
                                                   e.stopPropagation();
                                                   handlePreviewVoice(v.voice_id);
                                                }}
                                                className="h-8 w-8 rounded-full bg-white border flex items-center justify-center text-slate-700 shadow-xs shrink-0"
                                             >
                                                <Play className="h-4 w-4 ml-0.5" />
                                             </button>
                                             <div>
                                                <p className="text-xs font-bold text-slate-900">{v.label} ({v.gender === 'male' ? 'Nam' : 'Nữ'})</p>
                                                <p className="text-[10px] text-slate-450 mt-0.5">{v.description}</p>
                                             </div>
                                          </div>
                                          {isSelected && (
                                             <Check className="h-4 w-4 text-cyan-600 mr-2" />
                                          )}
                                       </div>
                                    );
                                 })
                              )}
                           </div>

                           <button
                              onClick={() => setIsVoicePickerView(false)}
                              className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                           >
                              Quay lại
                           </button>
                        </div>
                     ) : (
                        // VIEW: ADVANCED SETTINGS CONTROLS
                        <div className="space-y-5">

                           {/* Selector field */}
                           <div className="flex flex-col gap-1.5">
                              <span className="text-xs font-bold text-slate-700">Giọng nói (Voice)</span>
                              <div className="flex items-center gap-2">
                                 <div
                                    onClick={() => setIsVoicePickerView(true)}
                                    className="flex-1 flex items-center justify-between border border-slate-200 rounded-xl p-3.5 bg-slate-50/50 cursor-pointer hover:bg-slate-50 transition-all"
                                 >
                                    <div className="flex items-center gap-2">
                                       <span className="text-xs font-bold text-slate-900">{selectedVoice.label}</span>
                                       <span className="text-[10px] text-slate-400 font-medium truncate max-w-[200px]">({selectedVoice.description})</span>
                                    </div>
                                    <ChevronRight className="h-4.5 w-4.5 text-slate-400" />
                                 </div>

                                 <div
                                    className="relative"
                                    onMouseEnter={() => setIsVoiceLibraryHoverOpen(true)}
                                    onMouseLeave={() => setIsVoiceLibraryHoverOpen(false)}
                                 >
                                    <button
                                       type="button"
                                       className="flex h-[50px] w-[50px] items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-900"
                                       title="Hover de xem thư viện giọng nói"
                                    >
                                       <BookOpen className="h-4.5 w-4.5" />
                                    </button>

                                    {isVoiceLibraryHoverOpen && (
                                       <div className="absolute right-0 top-[calc(100%+10px)] z-30 w-[320px] rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl">
                                          <div className="mb-2 flex items-center justify-between gap-3 px-1">
                                             <div>
                                                <p className="text-xs font-bold text-slate-900">Thư viện giọng nói</p>
                                                <p className="text-[10px] text-slate-400">Giữ nhanh để chọn giọng nói iGen Audio</p>
                                             </div>
                                             <button
                                                type="button"
                                                onClick={() => {
                                                   setVoiceActiveTab('library');
                                                   setIsVoicePickerView(true);
                                                   setIsVoiceLibraryHoverOpen(false);
                                                }}
                                                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600 transition hover:bg-slate-100"
                                             >
                                                Xem tất cả
                                             </button>
                                          </div>

                                          <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                                             {quickLibraryVoices.map((voice) => {
                                                const isSelected = voiceId === voice.voice_id;
                                                return (
                                                   <button
                                                      key={voice.voice_id}
                                                      type="button"
                                                      onClick={() => {
                                                         setVoiceId(voice.voice_id);
                                                         setIsVoiceLibraryHoverOpen(false);
                                                      }}
                                                      className={`flex w-full items-center justify-between rounded-xl border p-3 text-left transition-all ${
                                                         isSelected ? "border-cyan-300 bg-cyan-50/60" : "border-slate-100 hover:bg-slate-50"
                                                      }`}
                                                   >
                                                      <div className="flex min-w-0 items-center gap-3">
                                                         <button
                                                            type="button"
                                                            onClick={(event) => {
                                                               event.stopPropagation();
                                                               handlePreviewVoice(voice.voice_id);
                                                            }}
                                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-xs"
                                                         >
                                                            <Play className="ml-0.5 h-3.5 w-3.5" />
                                                         </button>
                                                         <div className="min-w-0">
                                                            <p className="truncate text-xs font-bold text-slate-900">{voice.label || voice.name}</p>
                                                            <p className="truncate text-[10px] text-slate-400">{voice.description || "ElevenLabs voice"}</p>
                                                         </div>
                                                      </div>
                                                      {isSelected ? <Check className="h-4 w-4 shrink-0 text-cyan-600" /> : null}
                                                   </button>
                                                );
                                             })}
                                          </div>
                                       </div>
                                    )}
                                 </div>
                              </div>
                           </div>

                           {/* Model AI selection cards */}
                           <div className="flex flex-col gap-2">
                              <span className="text-xs font-bold text-slate-700">Model AI</span>
                              {activeModelLabel && (
                                <span className="text-[10px] text-slate-400">Đang sử dụng model iGen Audio: {activeModelLabel}</span>
                              )}
                              <span className="text-[10px] text-slate-400 font-medium leading-relaxed">Chọn mô hình phù hợp với mục tiêu tạo giọng nói của bạn.</span>
                              <div className="flex flex-col gap-2.5">
                                 {MODEL_OPTIONS.map((opt) => {
                                    const isSelected = voiceModel === opt.key;
                                    const modelDetails = opt.key === 'eleven_flash_v2_5' ? flashModelDetails : turboModelDetails;
                                    return (
                                       <div
                                          key={opt.key}
                                          onClick={() => setVoiceModel(opt.key)}
                                          title={`Ngôn ngữ hỗ trợ: ${modelDetails.languageSummary}`}
                                          className={`border-2 rounded-xl p-4 cursor-pointer transition-all relative ${isSelected ? 'border-cyan-500 bg-cyan-50/10' : 'border-slate-150 hover:bg-slate-50'
                                             }`}
                                       >
                                          <div className="flex justify-between items-start">
                                             <span className="text-xs font-bold text-slate-900">{opt.title}</span>
                                             {isSelected && <Check className="h-4 w-4 text-cyan-600" />}
                                          </div>
                                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">
                                             {opt.description}
                                          </p>
                                          <div className="flex gap-1.5 mt-2.5">
                                             {opt.badges.map((badge, bIdx) => (
                                                <span key={bIdx} className={`px-2 py-0.5 rounded text-[9px] font-bold ${
                                                   badge === 'Low Latency' || badge === 'Low latency'
                                                      ? 'bg-cyan-50 border border-cyan-100 text-cyan-700'
                                                      : badge === 'Balanced'
                                                      ? 'bg-emerald-50 border border-emerald-100 text-emerald-700'
                                                      : 'bg-slate-100 text-slate-600'
                                                }`}>
                                                   {badge}
                                                </span>
                                             ))}
                                          </div>
                                       </div>
                                    );
                                 })}
                              </div>
                           </div>

                           {/* Stability slider */}
                           <div className="flex flex-col gap-2">
                              <div className="flex justify-between text-xs font-bold text-slate-700">
                                 <span>Sự ổn định</span>
                                 <span className="font-mono text-cyan-600">{stability.toFixed(2)}</span>
                              </div>
                              <input
                                 type="range"
                                 min="0.0"
                                 max="1.0"
                                 step="0.05"
                                 value={stability}
                                 onChange={(e) => setStability(parseFloat(e.target.value))}
                                 className="w-full accent-cyan-500 cursor-pointer"
                              />
                              <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                 <span>Creative</span>
                                 <span>Robust</span>
                              </div>
                              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-[10px] text-slate-500 leading-relaxed">
                                 <span className="font-bold text-slate-700">Tóm tắt hỗ trợ ngôn ngữ:</span>{' '}
                                 {voiceModel === 'eleven_turbo_v2_5' && (turboModelDetails.languageNames.length > 0
                                    ? turboModelDetails.languageNames.slice(0, 8).join(', ')
                                    : 'Chưa có metadata ngôn ngữ từ ElevenLabs API')}
                                 {voiceModel === 'eleven_flash_v2_5' && (flashModelDetails.languageNames.length > 0
                                    ? flashModelDetails.languageNames.slice(0, 8).join(', ')
                                    : 'Chưa có metadata ngôn ngữ từ ElevenLabs API')}
                              </div>
                           </div>

                           <div className="flex flex-col gap-2">
                              <div className="flex justify-between text-xs font-bold text-slate-700">
                                 <span>Similarity Boost</span>
                                 <span className="font-mono text-cyan-600">{similarityBoost.toFixed(2)}</span>
                              </div>
                              <input
                                 type="range"
                                 min="0.0"
                                 max="1.0"
                                 step="0.05"
                                 value={similarityBoost}
                                 onChange={(e) => setSimilarityBoost(parseFloat(e.target.value))}
                                 className="w-full accent-cyan-500 cursor-pointer"
                              />
                              <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                                 <span>Creative</span>
                                 <span>Consistent</span>
                              </div>
                           </div>

                           <div className="flex items-center justify-between border-t pt-4">
                              <div>
                                 <span className="text-xs font-bold text-slate-800">Speaker Boost</span>
                                 <p className="text-[10px] text-slate-400 mt-0.5">Sử dụng voice setting gốc của giọng nói.</p>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                 <input
                                    type="checkbox"
                                    checked={useSpeakerBoost}
                                    onChange={(e) => setUseSpeakerBoost(e.target.checked)}
                                    className="sr-only peer"
                                 />
                                 <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                              </label>
                           </div>

                           {/* Switch language detection */}
                           <div className="flex items-center justify-between border-t pt-4">
                              <div>
                                 <span className="text-xs font-bold text-slate-800">Chọn ngôn ngữ đọc</span>
                                 <p className="text-[10px] text-slate-400 mt-0.5">Bật khi tự nhận diện sai tiếng hoặc văn bản có dấu tiếng Việt.</p>
                              </div>
                              <label className="relative inline-flex items-center cursor-pointer">
                                 <input
                                    type="checkbox"
                                    checked={useLanguageToggle}
                                    onChange={(e) => setUseLanguageToggle(e.target.checked)}
                                    className="sr-only peer"
                                 />
                                 <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                              </label>
                           </div>
                        </div>
                     )}

                  </div>

                  {/* Modal Footer */}
                  <div className="border-t p-4 flex justify-between items-center bg-slate-50 shrink-0">
                      <button
                         onClick={handleResetVoiceSettings}
                         className="text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
                      >
                         Reset
                      </button>
                     <button
                        onClick={handleSaveVoiceSettings}
                        disabled={isSavingVoiceSettings}
                        className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                     >
                        {isSavingVoiceSettings ? 'Đang lưu...' : 'Lưu settings'}
                     </button>
                     <button
                        onClick={() => {
                           setIsAdvancedModalOpen(false);
                           setIsVoicePickerView(false);
                        }}
                        className="px-5 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-cyan-500/10"
                     >
                        Đóng
                     </button>
                  </div>

               </div>
            </div>
         )}

         {/* MODAL 2: CREATE/CLONE VOICE DIALOG */}
         {isCreateModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
               <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">

                  {/* Modal Header */}
                  <div className="flex justify-between items-center border-b p-5 shrink-0">
                     <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-[#e0f7fc] text-[#0891b2] flex items-center justify-center rounded-xl shrink-0">
                           <Sparkles className="h-5 w-5 fill-[#0891b2]/10" />
                        </div>
                        <span className="font-semibold text-slate-800 text-base">
                           {createStep === 'selection' && 'Tạo giọng nói mới'}
                           {creationMode === 'instant' && 'Nhân bản Giọng nói Tức thì'}
                           {creationMode === 'design' && 'Thiết kế Giọng nói'}
                           {createStep === 'finish' && 'Nhân bản Giọng nói Tức thì'}
                        </span>
                     </div>
                     <button
                        onClick={() => setIsCreateModalOpen(false)}
                        className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                     >
                        <X className="h-4.5 w-4.5" />
                     </button>
                  </div>

                  {/* Step indicators */}
                  {createStep !== 'selection' && createStep !== 'design' && (
                     <div className="flex items-center justify-between px-16 py-6 border-b bg-slate-50/40 shrink-0">
                        {/* Step 1 */}
                        <div className="flex flex-col items-center gap-1.5 flex-1">
                           <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${createStep === 'upload'
                              ? 'bg-[#e0f7fc] border border-[#22d3ee] text-[#0891b2] shadow-xs'
                              : 'bg-[#e0f7fc] border border-[#22d3ee] text-[#0891b2]'
                              }`}>
                              1
                           </div>
                           <span className={`text-[11px] font-bold transition-all duration-300 ${createStep === 'upload' ? 'text-[#0891b2]' : 'text-slate-400'
                              }`}>
                              Tải lên Audio
                           </span>
                        </div>

                        {/* Divider */}
                        <div className="h-0.5 bg-slate-100 flex-1 -mt-4" />

                        {/* Step 2 */}
                        <div className="flex flex-col items-center gap-1.5 flex-1">
                           <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${createStep === 'info'
                              ? 'bg-[#e0f7fc] border border-[#22d3ee] text-[#0891b2] shadow-xs'
                              : createStep === 'finish'
                                 ? 'bg-emerald-50 border border-emerald-400 text-emerald-600'
                                 : 'bg-slate-100 border border-slate-200 text-slate-400'
                              }`}>
                              2
                           </div>
                           <span className={`text-[11px] font-bold transition-all duration-300 ${createStep === 'info' ? 'text-[#0891b2]' : 'text-slate-400'
                              }`}>
                              Thông tin giọng nói
                           </span>
                        </div>

                        {/* Divider */}
                        <div className="h-0.5 bg-slate-100 flex-1 -mt-4" />

                        {/* Step 3 */}
                        <div className="flex flex-col items-center gap-1.5 flex-1">
                           <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${createStep === 'finish'
                              ? 'bg-[#e0f7fc] border border-[#22d3ee] text-[#0891b2] shadow-xs'
                              : 'bg-slate-100 border border-slate-200 text-slate-400'
                              }`}>
                              3
                           </div>
                           <span className={`text-[11px] font-bold transition-all duration-300 ${createStep === 'finish' ? 'text-[#0891b2]' : 'text-slate-400'
                              }`}>
                              Hoàn tất
                           </span>
                        </div>
                     </div>
                  )}

                  {/* Modal Body */}
                  <div className="p-6 overflow-y-auto flex-1">

                     {/* STEP: SELECTION */}
                     {createStep === 'selection' && (
                        <div className="flex flex-col gap-3">
                           {/* Option 1: Thiết kế Giọng nói */}
                           <div
                              onClick={() => {
                                 setCreationMode('design');
                                 setCreateStep('design');
                              }}
                              className="p-4 rounded-xl border border-slate-200 hover:border-cyan-500 hover:bg-cyan-50/5 cursor-pointer transition-all flex justify-between items-center group"
                           >
                              <div className="flex items-start gap-4">
                                 <div className="p-2.5 bg-slate-50 rounded-lg text-slate-700 group-hover:text-cyan-600 group-hover:bg-cyan-50 transition-colors">
                                    <Wand2 className="h-5 w-5" />
                                 </div>
                                 <div>
                                    <h4 className="font-bold text-xs text-slate-900">Thiết kế Giọng nói</h4>
                                    <p className="text-[10px] text-slate-450 mt-0.5">Thiết kế một giọng nói hoàn toàn mới từ văn bản.</p>
                                    <span className="inline-block px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500 mt-2">Dưới 1 phút</span>
                                 </div>
                              </div>
                              <ChevronRight className="h-4.5 w-4.5 text-slate-400" />
                           </div>

                           {/* Option 2: Nhân bản Giọng nói Tức thì */}
                           <div
                              onClick={() => {
                                 toast.info('Tính năng Nhân bản Giọng nói Tức thì đang được phát triển!');
                              }}
                              className="p-4 rounded-xl border border-slate-200 opacity-60 cursor-pointer hover:border-cyan-500 hover:bg-cyan-50/5 transition-all flex justify-between items-center group"
                           >
                              <div className="flex items-start gap-4">
                                 <div className="p-2.5 bg-slate-50 rounded-lg text-slate-700 group-hover:text-cyan-600 group-hover:bg-cyan-50 transition-colors">
                                    <Sparkles className="h-5 w-5" />
                                 </div>
                                 <div>
                                    <div className="flex items-center gap-1.5">
                                       <h4 className="font-bold text-xs text-slate-900">Nhân bản Giọng nói Tức thì (Instant)</h4>
                                       <span className="px-1 py-0.5 bg-cyan-50 text-[8px] font-bold text-cyan-600 rounded">Đang phát triển</span>
                                    </div>
                                    <p className="text-[10px] text-slate-450 mt-0.5">Nhân bản giọng nói của bạn chỉ với 10 giây âm thanh.</p>
                                    <span className="inline-block px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-500 mt-2">~2 phút</span>
                                 </div>
                              </div>
                              <ChevronRight className="h-4.5 w-4.5 text-slate-400" />
                           </div>

                           {/* Option 3: Nhân bản Giọng nói Chuyên nghiệp */}
                           <div
                              className="p-4 rounded-xl border border-slate-200 opacity-60 cursor-not-allowed flex justify-between items-center"
                              title="Gói hiện tại không hỗ trợ chức năng này"
                           >
                              <div className="flex items-start gap-4">
                                 <div className="p-2.5 bg-slate-50 rounded-lg text-slate-400">
                                    <Diamond className="h-5 w-5" />
                                 </div>
                                 <div>
                                    <h4 className="font-bold text-xs text-slate-900">Nhân bản Giọng nói Chuyên nghiệp</h4>
                                    <p className="text-[10px] text-slate-450 mt-0.5">Tạo bản sao kỹ thuật số chân thực nhất. Yêu cầu 30 phút âm thanh sạch.</p>
                                    <span className="inline-block px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-400 mt-2">~4 giờ</span>
                                 </div>
                              </div>
                              <X className="h-4 w-4 text-slate-350" />
                           </div>

                           {/* Option 4: Phối lại Giọng nói */}
                           <div
                              className="p-4 rounded-xl border border-slate-200 opacity-60 cursor-not-allowed flex justify-between items-center"
                              title="Gói hiện tại không hỗ trợ chức năng này"
                           >
                              <div className="flex items-start gap-4">
                                 <div className="p-2.5 bg-slate-50 rounded-lg text-slate-400">
                                    <Shuffle className="h-5 w-5" />
                                 </div>
                                 <div>
                                    <h4 className="font-bold text-xs text-slate-900">Phối lại Giọng nói</h4>
                                    <p className="text-[10px] text-slate-450 mt-0.5">Biến đổi các giọng nói hiện có bằng văn bản để tạo ra giọng nói mới.</p>
                                    <span className="inline-block px-1.5 py-0.5 bg-slate-100 rounded text-[9px] font-bold text-slate-400 mt-2">Dưới 1 phút</span>
                                 </div>
                              </div>
                              <X className="h-4 w-4 text-slate-350" />
                           </div>
                        </div>
                     )}

                     {/* STEP: UPLOAD (INSTANT MODE) */}
                     {createStep === 'upload' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                           <div className="grid grid-cols-3 gap-3">
                              <div className="flex flex-col items-center text-center p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                                 <VolumeX className="h-5 w-5 text-slate-500 mb-2" />
                                 <span className="text-[11px] font-bold text-slate-800">Tránh tiếng ồn</span>
                                 <span className="text-[10px] text-slate-400 mt-1 leading-relaxed">Âm thanh nền ảnh hưởng chất lượng</span>
                              </div>
                              <div className="flex flex-col items-center text-center p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                                 <Headphones className="h-5 w-5 text-slate-500 mb-2" />
                                 <span className="text-[11px] font-bold text-slate-800">Chất lượng micro</span>
                                 <span className="text-[10px] text-slate-400 mt-1 leading-relaxed">Dùng mic ngoài để thu tốt hơn</span>
                              </div>
                              <div className="flex flex-col items-center text-center p-3.5 bg-slate-50 border border-slate-100 rounded-2xl">
                                 <Laptop className="h-5 w-5 text-slate-500 mb-2" />
                                 <span className="text-[11px] font-bold text-slate-800">Thiết bị nhất quán</span>
                                 <span className="text-[10px] text-slate-400 mt-1 leading-relaxed">Không đổi micro giữa các mẫu</span>
                              </div>
                           </div>

                           {/* Upload dashed zone */}
                           <div className="border-2 border-dashed border-slate-200 hover:border-[#22d3ee]/80 hover:bg-[#e0f7fc]/5 rounded-2xl p-7 flex flex-col items-center justify-center text-center relative transition-all duration-300">
                              <Upload className="h-9 w-9 text-slate-400 mb-2.5" />
                              <label className="text-xs font-bold text-slate-800 cursor-pointer hover:text-cyan-600 transition-colors">
                                 Nhấn để tải lên hoặc kéo thả
                                 <input
                                    type="file"
                                    accept="audio/*,video/*"
                                    multiple
                                    onChange={handleFileUpload}
                                    className="hidden"
                                 />
                              </label>
                              <p className="text-[10px] text-slate-400 mt-1">File audio hoặc video, tối đa 10MB mỗi file</p>

                              <div className="flex items-center gap-2 my-3">
                                 <span className="text-[10px] text-slate-400">hoặc</span>
                              </div>

                              <button
                                 onClick={isRecordingClone ? handleStopRecordingClone : handleStartRecordingClone}
                                 className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all duration-300 border border-slate-200 bg-white ${isRecordingClone
                                    ? 'border-red-400 text-red-500 hover:bg-red-50/50 animate-pulse'
                                    : 'text-slate-800 hover:bg-slate-50 hover:border-slate-300'
                                    }`}
                              >
                                 {isRecordingClone ? <MicOff className="h-3.5 w-3.5 text-red-500" /> : <Mic className="h-3.5 w-3.5 text-slate-500" />}
                                 <span>{isRecordingClone ? `Ghi âm trực tiếp... (${recordingDuration}s)` : 'Ghi âm trực tiếp'}</span>
                              </button>
                           </div>

                           {/* List of uploaded/recorded samples */}
                           {instantFiles.length > 0 && (
                              <div className="space-y-2">
                                 <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">File đã tải lên ({instantFiles.length})</span>
                                 <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
                                    {instantFiles.map((file, i) => (
                                       <div key={i} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                             <button
                                                onClick={() => togglePlayCloneFile(i)}
                                                className="h-6 w-6 rounded-full bg-white hover:bg-slate-150 flex items-center justify-center shrink-0 border text-slate-650"
                                             >
                                                {playingFileIndex === i ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3 ml-0.5" />}
                                             </button>
                                             <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-bold text-slate-800 truncate">{file.name}</p>
                                                <p className="text-[9px] text-slate-400">
                                                   {(file.size / 1024).toFixed(1)} KB {file.duration ? `• ${file.duration.toFixed(1)}s` : ''}
                                                </p>
                                             </div>
                                          </div>
                                          <button
                                             onClick={() => removeCloneFile(i)}
                                             className="p-1 text-slate-450 hover:text-red-500 hover:bg-red-50 rounded"
                                          >
                                             <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                       </div>
                                    ))}
                                 </div>
                              </div>
                           )}

                           {/* Progress Bar & requirement */}
                           <div className="flex items-center justify-between gap-4 border-t pt-3.5">
                              <div className="flex-1 bg-slate-150 h-2 rounded-full overflow-hidden">
                                 <div
                                    className="bg-cyan-500 h-full transition-all duration-300"
                                    style={{ width: `${Math.min(100, (totalCloneDuration / 10) * 100)}%` }}
                                 />
                              </div>
                              <span className={`text-[10px] font-mono font-bold shrink-0 ${totalCloneDuration >= 10 ? 'text-emerald-600' : 'text-slate-450'}`}>
                                 {totalCloneDuration.toFixed(1)}s / 10s tối thiểu
                              </span>
                           </div>

                           {totalCloneDuration < 10 && instantFiles.length > 0 && (
                              <div className="flex items-start gap-1.5 p-3.5 bg-amber-50 rounded-xl border border-amber-200">
                                 <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                 <span className="text-[10px] text-amber-700 leading-relaxed">
                                    Tổng thời gian của các mẫu audio phải đạt ít nhất 10 giây. Vui lòng ghi âm thêm hoặc tải lên thêm file mẫu.
                                 </span>
                              </div>
                           )}

                        </div>
                     )}

                     {/* STEP: VOICE INFO (INSTANT CLONING) */}
                     {createStep === 'info' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                           <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-slate-700">Tên giọng nói <span className="text-red-500">*</span></label>
                              <input
                                 type="text"
                                 placeholder="Ví dụ: Giọng thương hiệu của tôi"
                                 value={newVoiceName}
                                 onChange={(e) => setNewVoiceName(e.target.value)}
                                 className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              />
                              <p className="text-[10px] text-slate-400">Tên này giúp bạn nhận diện giọng nói trong thư viện sau khi clone.</p>
                           </div>

                           <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-slate-700">Mô tả giọng đọc <span className="text-slate-400 font-normal">(tùy chọn)</span></label>
                              <textarea
                                 placeholder="Mô tả cho giọng nói, ví dụ: Giọng nam, ấm áp, chuyên nghiệp..."
                                 value={newVoiceDescription}
                                 onChange={(e) => setNewVoiceDescription(e.target.value)}
                                 className="w-full text-xs p-3 border border-slate-200 rounded-xl h-20 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
                              />
                           </div>

                           {/* Confirmation summary */}
                           <div className="border border-slate-150 rounded-xl p-4 bg-slate-50/50 space-y-2">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Chi tiết mẫu nhân bản</span>
                              <div className="grid grid-cols-2 gap-3 text-xs">
                                 <div>
                                    <span className="text-slate-400 block text-[10px]">Số file mẫu:</span>
                                    <span className="font-bold text-slate-800">{instantFiles.length} file</span>
                                 </div>
                                 <div>
                                    <span className="text-slate-400 block text-[10px]">Tổng thời lượng mẫu:</span>
                                    <span className="font-bold text-slate-800">{totalCloneDuration.toFixed(1)} giây</span>
                                 </div>
                              </div>
                           </div>

                           <div className="flex items-start gap-1.5 p-3.5 bg-blue-50 rounded-xl border border-blue-200">
                              <AlertCircle className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" />
                              <span className="text-[10px] text-blue-700 leading-relaxed">
                                 Nhấn &quot;Bắt đầu nhân bản&quot; bên dưới để tải lên dữ liệu. Quá trình này sẽ mất từ 10 đến 30 giây để ElevenLabs phân tích.
                              </span>
                           </div>
                        </div>
                     )}

                     {/* STEP: DESIGN VOICE (THIẾT KẾ GIỌNG NÓI) */}
                     {createStep === 'design' && (
                        <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                           <div className="grid grid-cols-3 gap-3">
                              {/* Gender */}
                              <div className="flex flex-col gap-1.5">
                                 <span className="text-xs font-bold text-slate-700">Giới tính</span>
                                 <select
                                    value={designGender}
                                    onChange={(e) => setDesignGender(e.target.value as any)}
                                    className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-white"
                                 >
                                    <option value="female">Nữ (Female)</option>
                                    <option value="male">Nam (Male)</option>
                                 </select>
                              </div>

                              {/* Age */}
                              <div className="flex flex-col gap-1.5">
                                 <span className="text-xs font-bold text-slate-700">Tuổi tác</span>
                                 <select
                                    value={designAge}
                                    onChange={(e) => setDesignAge(e.target.value as any)}
                                    className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-white"
                                 >
                                    <option value="young">Trẻ (Young)</option>
                                    <option value="middle_aged">Trung niên (Middle)</option>
                                    <option value="old">Cao tuổi (Old)</option>
                                 </select>
                              </div>

                              {/* Accent */}
                              <div className="flex flex-col gap-1.5">
                                 <span className="text-xs font-bold text-slate-700">Quốc gia / Accent</span>
                                 <select
                                    value={designAccent}
                                    onChange={(e) => setDesignAccent(e.target.value)}
                                    className="w-full text-xs p-2.5 border border-slate-200 rounded-lg bg-white"
                                 >
                                    <option value="american">Mỹ (American)</option>
                                    <option value="british">Anh (British)</option>
                                    <option value="african">Phi (African)</option>
                                    <option value="australian">Úc (Australian)</option>
                                    <option value="indian">Ấn Độ (Indian)</option>
                                 </select>
                              </div>
                           </div>

                           {/* Accent Strength Slider */}
                           <div className="flex flex-col gap-1.5">
                              <div className="flex justify-between text-xs font-bold text-slate-700">
                                 <span>Tỷ trọng giọng địa phương (Accent Strength)</span>
                                 <span className="font-mono text-cyan-600">{designAccentStrength.toFixed(2)}</span>
                              </div>
                              <input
                                 type="range"
                                 min="0.3"
                                 max="2.0"
                                 step="0.05"
                                 value={designAccentStrength}
                                 onChange={(e) => setDesignAccentStrength(parseFloat(e.target.value))}
                                 className="w-full accent-cyan-500 cursor-pointer"
                              />
                           </div>

                           {/* Preview script */}
                           <div className="flex flex-col gap-1.5">
                              <label className="text-xs font-bold text-slate-700">Văn bản nghe thử</label>
                              <textarea
                                 value={designText}
                                 onChange={(e) => setDesignText(e.target.value)}
                                 className="w-full text-xs p-3 border border-slate-200 rounded-xl h-20 focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none"
                              />
                           </div>

                           {/* Actions for preview */}
                           <div className="flex gap-2 justify-end">
                              <button
                                 onClick={handleGenerateDesignPreview}
                                 disabled={isGeneratingDesignPreview || !designText.trim()}
                                 className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                              >
                                 {isGeneratingDesignPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Tạo bản nghe thử'}
                              </button>

                              {designPreviewUrl && (
                                 <button
                                    onClick={() => playPreviewAudio(designPreviewUrl)}
                                    className="px-4 py-2 bg-cyan-50 hover:bg-cyan-100 text-cyan-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                                 >
                                    <Play className="h-3.5 w-3.5" />
                                    Phát nghe thử
                                 </button>
                              )}
                           </div>

                           {/* Save custom designed voice name */}
                           {designPreviewVoiceId && (
                              <div className="border-t pt-4 space-y-3">
                                 <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-700">Đặt tên giọng nói để lưu</label>
                                    <input
                                       type="text"
                                       placeholder="Ví dụ: Giọng thiết kế trẻ trung Mỹ"
                                       value={newVoiceName}
                                       onChange={(e) => setNewVoiceName(e.target.value)}
                                       className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                    />
                                 </div>
                                 <div className="flex flex-col gap-1.5">
                                    <label className="text-xs font-bold text-slate-700">Mô tả giọng nói</label>
                                    <input
                                       type="text"
                                       placeholder="Ví dụ: Giọng đọc trẻ trung, năng động"
                                       value={newVoiceDescription}
                                       onChange={(e) => setNewVoiceDescription(e.target.value)}
                                       className="w-full text-xs p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                    />
                                 </div>
                              </div>
                           )}

                        </div>
                     )}

                     {/* STEP: FINISH */}
                     {createStep === 'finish' && (
                        <div className="flex flex-col items-center text-center p-6 space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
                           <div className="h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xl shadow-sm">
                              <Check className="h-6 w-6" />
                           </div>
                           <h4 className="font-bold text-slate-900 text-sm">Giọng nói đã được tạo thành công!</h4>
                           <p className="text-xs text-slate-400 max-w-xs leading-relaxed">
                              Giọng &quot;{newVoiceName}&quot; đã sẵn sàng hoạt động. Bây giờ bạn có thể đóng hộp thoại này và sử dụng nó để chuyển văn bản thành giọng nói.
                           </p>
                        </div>
                     )}

                  </div>

                  {/* Modal Footer */}
                  <div className="border-t p-4 flex justify-between items-center bg-slate-50 shrink-0">
                     {createStep !== 'finish' ? (
                        <>
                           <button
                              onClick={() => {
                                 if (createStep === 'upload' || createStep === 'design') {
                                    setCreateStep('selection');
                                 } else if (createStep === 'info') {
                                    setCreateStep('upload');
                                 } else {
                                    setIsCreateModalOpen(false);
                                 }
                              }}
                              className="px-2 py-2 text-slate-700 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1 active:scale-95 cursor-pointer"
                           >
                              <ChevronLeft className="h-3.5 w-3.5" />
                              Quay lại
                           </button>

                           {/* Action Submit/Next */}
                           {createStep === 'upload' && (
                              <button
                                 onClick={() => setCreateStep('info')}
                                 disabled={totalCloneDuration < 10}
                                 className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${totalCloneDuration >= 10
                                    ? 'bg-[#78d2e6] hover:bg-[#64c0d4] text-white shadow-xs active:scale-95'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                                    }`}
                              >
                                 Tiếp theo
                                 <ChevronRight className="h-3.5 w-3.5" />
                              </button>
                           )}

                           {createStep === 'info' && (
                              <button
                                 onClick={handleSaveInstantClone}
                                 disabled={isSavingVoice || !newVoiceName.trim()}
                                 className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${!isSavingVoice && newVoiceName.trim()
                                    ? 'bg-[#78d2e6] hover:bg-[#64c0d4] text-white shadow-xs active:scale-95'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                                    }`}
                              >
                                 {isSavingVoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Bắt đầu nhân bản'}
                              </button>
                           )}

                           {createStep === 'design' && (
                              <button
                                 onClick={handleSaveDesignedVoice}
                                 disabled={isSavingVoice || !newVoiceName.trim() || !designPreviewVoiceId}
                                 className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${!isSavingVoice && newVoiceName.trim() && designPreviewVoiceId
                                    ? 'bg-[#78d2e6] hover:bg-[#64c0d4] text-white shadow-xs active:scale-95'
                                    : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                                    }`}
                              >
                                 {isSavingVoice ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Lưu giọng nói'}
                              </button>
                           )}
                        </>
                     ) : (
                        <button
                           onClick={() => setIsCreateModalOpen(false)}
                           className="w-full py-2.5 bg-[#78d2e6] hover:bg-[#64c0d4] text-white rounded-xl text-xs font-bold transition-all shadow-xs active:scale-95 cursor-pointer"
                        >
                           Đóng và sử dụng
                        </button>
                     )}
                  </div>

               </div>
            </div>
         )}

      </div>
   );
}
