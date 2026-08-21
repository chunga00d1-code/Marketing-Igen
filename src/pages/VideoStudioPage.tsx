import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Captions,
  Clapperboard,
  Film,
  LayoutTemplate,
  MapPinned,
  Mic,
  Presentation,
  Scissors,
  Sparkles,
  Wand2,
} from "lucide-react";
import { SEOHead } from "../seo/SEOHead";
import { VIDEO_STUDIO_SEO_MAP } from "../seo/seo-config";
import {
  clearVideoStudioLaunchParams,
  LEGACY_VIDEO_STUDIO_PATH,
  LEGACY_VOICE_STUDIO_PATH,
  readVideoStudioLaunchParams,
  VIDEO_STUDIO_ROUTES,
  videoStudioPathToTool,
  type VideoStudioTool,
} from "../utils/videoStudioNavigation";
import type {
  AspectRatioType,
  TemplateEditorProject,
} from "../components/template-editor/types";

const SimpleVideoWorkspace = lazy(() =>
  import("../components/content-studio/SimpleVideoWorkspace").then((module) => ({
    default: module.SimpleVideoWorkspace,
  }))
);

const EditVideoWorkspace = lazy(() =>
  import("../components/content-studio/EditVideoWorkspace").then((module) => ({
    default: module.EditVideoWorkspace,
  }))
);

const LongToShortTab = lazy(() => import("./LongToShortTab"));

const VoiceGenerationWorkspace = lazy(() =>
  import("../components/content-studio/VoiceGenerationWorkspace").then((module) => ({
    default: module.VoiceGenerationWorkspace,
  }))
);

const HeyGenWorkspace = lazy(() =>
  import("../components/content-studio/HeyGenWorkspace").then((module) => ({
    default: module.HeyGenWorkspace,
  }))
);

const KlingMotionWorkspace = lazy(() =>
  import("../components/content-studio/KlingMotionWorkspace").then((module) => ({
    default: module.KlingMotionWorkspace,
  }))
);

const VideoCaptionWorkspace = lazy(() =>
  import("../components/content-studio/VideoCaptionWorkspace").then((module) => ({
    default: module.VideoCaptionWorkspace,
  }))
);

const VideoTemplateLibrary = lazy(() =>
  import("../components/content-studio/video-templates/VideoTemplateLibrary").then((module) => ({
    default: module.VideoTemplateLibrary,
  }))
);

const TemplateEditorWorkspace = lazy(() =>
  import("../components/template-editor/TemplateEditorWorkspace").then((module) => ({
    default: module.TemplateEditorWorkspace,
  }))
);

const HtmlVideoWorkspace = lazy(() =>
  import("../components/content-studio/HtmlVideoWorkspace").then((module) => ({
    default: module.HtmlVideoWorkspace,
  }))
);

const RealEstateMapVideoWorkspace = lazy(() =>
  import("../components/video-studio/RealEstateMapVideoWorkspace").then((module) => ({
    default: module.RealEstateMapVideoWorkspace,
  }))
);

type ToolDefinition = {
  id: Exclude<VideoStudioTool, "home">;
  title: string;
  description: string;
  requirement: string;
  group: "create" | "edit" | "audio";
  icon: typeof Sparkles;
  tone: string;
  iconTone: string;
};

const VIDEO_TOOLS: ToolDefinition[] = [
  {
    id: "templates",
    title: "Mẫu video",
    description: "Chọn mẫu có sẵn và tùy chỉnh thành video của bạn.",
    requirement: "Bắt đầu nhanh từ thư viện mẫu video",
    group: "create",
    icon: LayoutTemplate,
    tone: "from-blue-50 to-white hover:border-blue-300",
    iconTone: "bg-blue-600 text-white",
  },
  {
    id: "html-video",
    title: "Tạo video slide tự động",
    description: "Nhập nội dung, AI tự chia thành từng slide, chuyển cảnh mượt và lồng giọng đọc.",
    requirement: "Cần: Một chủ đề hoặc dàn ý ngắn",
    group: "create",
    icon: Presentation,
    tone: "from-sky-50 to-white hover:border-sky-300",
    iconTone: "bg-sky-600 text-white",
  },
  {
    id: "real-estate-map-video",
    title: "Video BĐS bản đồ",
    description: "Tạo video vị trí dự án, ranh khu đất và tiện ích xung quanh.",
    requirement: "Cần: Địa chỉ hoặc toạ độ dự án",
    group: "create",
    icon: MapPinned,
    tone: "from-teal-50 to-white hover:border-teal-300",
    iconTone: "bg-teal-600 text-white",
  },
  {
    id: "ai-video",
    title: "Tạo video từ nội dung",
    description: "Biến mô tả hoặc hình ảnh thành video marketing bằng AI.",
    requirement: "Cần: Nội dung mô tả hoặc một hình ảnh",
    group: "create",
    icon: Sparkles,
    tone: "from-indigo-50 to-white hover:border-indigo-300",
    iconTone: "bg-indigo-600 text-white",
  },
  {
    id: "human-video",
    title: "Tạo video người dẫn AI",
    description: "Chọn nhân vật, giọng nói và tạo video thuyết trình tự nhiên.",
    requirement: "Cần: Kịch bản muốn nhân vật trình bày",
    group: "create",
    icon: Clapperboard,
    tone: "from-cyan-50 to-white hover:border-cyan-300",
    iconTone: "bg-cyan-600 text-white",
  },
  {
    id: "motion",
    title: "Tạo chuyển động từ hình ảnh",
    description: "Dùng video mẫu để điều khiển chuyển động cho nhân vật trong ảnh.",
    requirement: "Cần: Một ảnh nhân vật và video chuyển động mẫu",
    group: "create",
    icon: Film,
    tone: "from-violet-50 to-white hover:border-violet-300",
    iconTone: "bg-violet-600 text-white",
  },
  {
    id: "edit-video",
    title: "Chỉnh sửa video",
    description: "Cắt ghép, thay đổi nội dung và hoàn thiện video có sẵn.",
    requirement: "Cần: Một video muốn chỉnh sửa",
    group: "edit",
    icon: Wand2,
    tone: "from-emerald-50 to-white hover:border-emerald-300",
    iconTone: "bg-emerald-600 text-white",
  },
  {
    id: "long-to-short",
    title: "Cắt video dài thành video ngắn",
    description: "Tìm các đoạn nổi bật và tạo phiên bản ngắn phù hợp mạng xã hội.",
    requirement: "Cần: Một video dài",
    group: "edit",
    icon: Scissors,
    tone: "from-amber-50 to-white hover:border-amber-300",
    iconTone: "bg-amber-500 text-white",
  },
  {
    id: "caption",
    title: "Thêm phụ đề vào video",
    description: "Nhận diện lời nói, chỉnh timeline và xuất video có phụ đề.",
    requirement: "Cần: Một video có âm thanh",
    group: "edit",
    icon: Captions,
    tone: "from-blue-50 to-white hover:border-blue-300",
    iconTone: "bg-blue-600 text-white",
  },
  {
    id: "voice",
    title: "Tạo giọng đọc",
    description: "Biến kịch bản thành giọng đọc để lồng tiếng hoặc tạo video người dẫn.",
    requirement: "Cần: Nội dung muốn chuyển thành giọng đọc",
    group: "audio",
    icon: Mic,
    tone: "from-rose-50 to-white hover:border-rose-300",
    iconTone: "bg-rose-600 text-white",
  },
];

const TOOL_BY_ID = Object.fromEntries(
  VIDEO_TOOLS.map((tool) => [tool.id, tool])
) as Record<Exclude<VideoStudioTool, "home">, ToolDefinition>;

export default function VideoStudioPage() {
  const [initialParams] = useState(readVideoStudioLaunchParams);
  const clearParamsRef = useRef(clearVideoStudioLaunchParams);
  const [activeTool, setActiveTool] = useState<VideoStudioTool>(
    () => initialParams?.tool || videoStudioPathToTool(window.location.pathname) || "home"
  );
  const [editVideoSourceUrl, setEditVideoSourceUrl] = useState<string | null>(null);
  const [templateEditorConfig, setTemplateEditorConfig] = useState<{
    initialData?: Partial<TemplateEditorProject>;
  } | null>(null);

  const navigate = useCallback((tool: VideoStudioTool, options?: { replace?: boolean }) => {
    const nextPath = VIDEO_STUDIO_ROUTES[tool];
    if (window.location.pathname !== nextPath) {
      if (options?.replace) window.history.replaceState(null, "", nextPath);
      else window.history.pushState(null, "", nextPath);
    }
    setActiveTool(tool);
  }, []);

  useEffect(() => {
    const normalizedPath = window.location.pathname.toLowerCase().replace(/\/$/, "");
    const pathTool = videoStudioPathToTool(window.location.pathname);
    if (normalizedPath === LEGACY_VIDEO_STUDIO_PATH) {
      navigate("home", { replace: true });
    } else if (normalizedPath === LEGACY_VOICE_STUDIO_PATH) {
      navigate("voice", { replace: true });
    } else if (!pathTool) {
      navigate("home", { replace: true });
    }

    const handlePopState = () => {
      setActiveTool(videoStudioPathToTool(window.location.pathname) || "home");
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [navigate]);

  useEffect(() => {
    clearParamsRef.current();
  }, []);

  useEffect(() => {
    if (activeTool !== "templates") setTemplateEditorConfig(null);
  }, [activeTool]);

  const handleMediaSaved = useCallback(
    async (cardId: string, mediaUrl: string, type: "image" | "video" | "audio") => {
      if (!cardId || !mediaUrl || type !== "video") return;
      const { marketingService } = await import("../services/marketingService");
      const { toast } = await import("./Toast");
      try {
        await marketingService.updateCard(cardId, {
          videoUrl: mediaUrl,
          mediaType: "video",
        });
        toast.success("Đã gắn video vừa tạo vào bài marketing.");
      } catch (error) {
        console.error("Không thể lưu video vào card marketing:", error);
        toast.error("Video đã tạo xong nhưng chưa thể gắn vào bài marketing.");
      }
    },
    []
  );

  const activeMeta =
    activeTool === "home" ? VIDEO_STUDIO_SEO_MAP.home : VIDEO_STUDIO_SEO_MAP[activeTool];

  return (
    <>
      <SEOHead meta={activeMeta} />
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <h1 className="sr-only">{activeMeta.title}</h1>

        {activeTool === "home" ? (
          <VideoStudioHome onSelect={navigate} />
        ) : (
          <>
            <VideoToolHeader tool={TOOL_BY_ID[activeTool]} onBack={() => navigate("home")} />
            <div
              className={`min-h-0 flex-1 bg-[linear-gradient(180deg,#fcfdfd_0%,#f4f8fb_100%)] ${
                activeTool === "caption" || activeTool === "real-estate-map-video"
                  ? "overflow-hidden p-0"
                  : "overflow-y-auto p-4 md:p-6"
              }`}
            >
              <VideoToolContent
                tool={activeTool}
                initialParams={initialParams}
                editVideoSourceUrl={editVideoSourceUrl}
                onClearEditVideoSource={() => setEditVideoSourceUrl(null)}
                onEditVideo={(url) => {
                  setEditVideoSourceUrl(url);
                  navigate("edit-video");
                }}
                onNavigateToTool={navigate}
                onMediaSaved={handleMediaSaved}
                templateEditorConfig={templateEditorConfig}
                setTemplateEditorConfig={setTemplateEditorConfig}
              />
            </div>
          </>
        )}
      </div>
    </>
  );
}

export function VideoStudioHome({
  onSelect,
}: {
  onSelect: (tool: VideoStudioTool) => void;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,#eef2ff_0%,#f8fafc_38%,#ffffff_72%)]">
      <div className="mx-auto w-full max-w-7xl px-4 py-5 md:px-6 md:py-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
            <Clapperboard className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-950">
              Bạn muốn làm gì với video?
            </h2>
          </div>
        </div>

        <ToolGroup
          title="Tạo video mới"
          tools={VIDEO_TOOLS.filter((tool) => tool.group === "create")}
          onSelect={onSelect}
        />
        <ToolGroup
          title="Chỉnh video có sẵn"
          tools={VIDEO_TOOLS.filter((tool) => tool.group === "edit")}
          onSelect={onSelect}
        />
        <ToolGroup
          title="Âm thanh & giọng đọc"
          tools={VIDEO_TOOLS.filter((tool) => tool.group === "audio")}
          onSelect={onSelect}
        />
      </div>
    </div>
  );
}

function ToolGroup({
  title,
  tools,
  onSelect,
}: {
  title: string;
  tools: ToolDefinition[];
  onSelect: (tool: VideoStudioTool) => void;
}) {
  return (
    <section className="mt-8">
      <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
      <div className="mt-4 grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {tools.map((tool) => {
          const Icon = tool.icon;
          return (
            <button
              key={tool.id}
              type="button"
              onClick={() => onSelect(tool.id)}
              className="group relative flex aspect-square flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-sm transition-all hover:scale-[1.02] hover:border-indigo-200 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-indigo-100"
            >
              <div
                className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${tool.tone} opacity-0 transition-opacity group-hover:opacity-100`}
                aria-hidden="true"
              />
              <span
                className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl shadow-sm ${tool.iconTone} transition-transform group-hover:scale-110`}
              >
                <Icon className="h-7 w-7" />
              </span>
              <span className="relative w-full px-2">
                <span className="block text-sm font-bold text-slate-800 transition-colors group-hover:text-indigo-900">
                  {tool.title}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function VideoToolHeader({
  tool: _tool,
  onBack,
}: {
  tool: ToolDefinition;
  onBack: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center border-b border-slate-200 bg-white px-4 py-2 md:px-6">
      <button
        type="button"
        onClick={onBack}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
        aria-label="Quay lại Video Studio"
        title="Quay lại Video Studio"
      >
        <ArrowLeft className="h-4 w-4" />
      </button>
    </header>
  );
}

function VideoToolContent({
  tool,
  initialParams,
  editVideoSourceUrl,
  onClearEditVideoSource,
  onEditVideo,
  onNavigateToTool,
  onMediaSaved,
  templateEditorConfig,
  setTemplateEditorConfig,
}: {
  tool: Exclude<VideoStudioTool, "home">;
  initialParams: ReturnType<typeof readVideoStudioLaunchParams>;
  editVideoSourceUrl: string | null;
  onClearEditVideoSource: () => void;
  onEditVideo: (url: string) => void;
  onNavigateToTool: (tool: VideoStudioTool) => void;
  onMediaSaved: (
    cardId: string,
    mediaUrl: string,
    type: "image" | "video" | "audio"
  ) => void;
  templateEditorConfig: {
    initialData?: Partial<TemplateEditorProject>;
  } | null;
  setTemplateEditorConfig: React.Dispatch<
    React.SetStateAction<{
      initialData?: Partial<TemplateEditorProject>;
    } | null>
  >;
}) {
  if (tool === "templates") {
    if (templateEditorConfig) {
      return (
        <Suspense fallback={<VideoToolLoader label="Đang mở trình chỉnh sửa mẫu..." />}>
          <TemplateEditorWorkspace
            initialProjectData={templateEditorConfig.initialData}
            onBackToLibrary={() => setTemplateEditorConfig(null)}
          />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<VideoToolLoader label="Đang mở thư viện mẫu video..." />}>
        <VideoTemplateLibrary
          onSelectEditTab={(projectId, mediaUrl, title, aspectRatio, duration) => {
            setTemplateEditorConfig({
              initialData: {
                id: projectId,
                title: title || "Dự án từ mẫu TikTok",
                aspectRatio: (aspectRatio as AspectRatioType) || "9:16",
                duration,
                previewVideoUrl: mediaUrl,
                thumbnailUrl: mediaUrl,
              },
            });
          }}
        />
      </Suspense>
    );
  }

  if (tool === "html-video") {
    return (
      <Suspense fallback={<VideoToolLoader label="Đang mở công cụ tạo video slide..." />}>
        <HtmlVideoWorkspace />
      </Suspense>
    );
  }

  if (tool === "real-estate-map-video") {
    return (
      <Suspense fallback={<VideoToolLoader label="Đang mở công cụ video bản đồ..." />}>
        <RealEstateMapVideoWorkspace onBack={() => onNavigateToTool("home")} />
      </Suspense>
    );
  }

  if (tool === "ai-video") {
    return (
      <Suspense fallback={<VideoToolLoader label="Đang mở công cụ tạo video..." />}>
        <SimpleVideoWorkspace
          initialPrompt={initialParams?.prompt}
          cardId={initialParams?.cardId}
          onMediaSaved={onMediaSaved}
          onEditVideo={onEditVideo}
          initialImage={initialParams?.image}
          autoTrigger={initialParams?.autoTrigger}
        />
      </Suspense>
    );
  }

  if (tool === "human-video") {
    return (
      <Suspense fallback={<VideoToolLoader label="Đang mở công cụ tạo video người dẫn..." />}>
        <HeyGenWorkspace
          initialPrompt={initialParams?.prompt}
          cardId={initialParams?.cardId}
          onEditVideo={onEditVideo}
          onMediaSaved={onMediaSaved}
          autoTrigger={initialParams?.autoTrigger}
          engineType={initialParams?.engineType}
          usePersonalVoice={initialParams?.usePersonalVoice}
        />
      </Suspense>
    );
  }

  if (tool === "motion") {
    return (
      <Suspense fallback={<VideoToolLoader label="Đang mở công cụ tạo chuyển động..." />}>
        <KlingMotionWorkspace cardId={initialParams?.cardId} onMediaSaved={onMediaSaved} />
      </Suspense>
    );
  }

  if (tool === "edit-video") {
    return (
      <Suspense fallback={<VideoToolLoader label="Đang mở trình chỉnh sửa video..." />}>
        <EditVideoWorkspace
          initialVideoUrl={editVideoSourceUrl}
          onClearInitialVideoUrl={onClearEditVideoSource}
        />
      </Suspense>
    );
  }

  if (tool === "long-to-short") {
    return (
      <Suspense fallback={<VideoToolLoader label="Đang mở công cụ tạo video ngắn..." />}>
        <LongToShortTab />
      </Suspense>
    );
  }

  if (tool === "voice") {
    return (
      <Suspense fallback={<VideoToolLoader label="Đang mở công cụ tạo giọng đọc..." />}>
        <VoiceGenerationWorkspace
          initialText={initialParams?.prompt}
          initialTitle={initialParams?.title}
          initialDescription={initialParams?.description}
          cardId={initialParams?.cardId}
          autoTrigger={initialParams?.autoTrigger}
          onMediaSaved={onMediaSaved}
          onNavigateToHumanVideo={() => onNavigateToTool("human-video")}
        />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<VideoToolLoader label="Đang mở công cụ phụ đề..." />}>
      <VideoCaptionWorkspace />
    </Suspense>
  );
}

function VideoToolLoader({ label }: { label: string }) {
  return (
    <div className="flex min-h-96 items-center justify-center rounded-3xl border border-slate-200 bg-white text-sm font-semibold text-slate-500 shadow-sm">
      {label}
    </div>
  );
}
