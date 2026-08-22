import type {
  HtmlVideoPipelineMetadata,
  HtmlVideoPlan,
} from "../../interface/html-video-pipeline.interface";
import type { HtmlVideoDraftInput } from "./html-video-draft.service";

export type HtmlVideoRevisionIntent = {
  visual: boolean;
  voice: boolean;
  content: boolean;
  timing: boolean;
  spec: boolean;
  fullRedesign: boolean;
  affectedSceneIds: string[];
};

function normalizedPrompt(prompt: string) {
  return prompt.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function classifyHtmlVideoRevisionIntent(
  prompt: string,
  pipeline?: HtmlVideoPipelineMetadata
): HtmlVideoRevisionIntent {
  const source = normalizedPrompt(prompt);
  const fullRedesign = /(?:dung|lam|tao|thiet ke)\s+lai\s+(?:toan bo|hoan toan)|full\s+redesign|rebuild\s+(?:the\s+)?(?:whole|entire)/i.test(source);
  const voice = /\b(?:voice|narrat\w*|audio|tts|giong|doc|thuyet minh|loi thoai|phat am)\b/i.test(source);
  const visual = /\b(?:animation|animate|hieu ung|chuyen dong|mau|font|phong chu|bo cuc|vi tri|kich thuoc|highlight|nen|background|style|visual|can le)\b/i.test(source);
  const timing = /\b(?:timeline|timing|scene|slide|canh|thu tu|dong bo|sync|synchroni[sz]e|bat dau|ket thuc)\b/i.test(source)
    || /(?:keo dai|rut ngan|tang|giam)\s+(?:thoi gian|thoi luong)\s+(?:canh|scene|slide)/i.test(source);
  const durationSpecMatch = source.match(/(?:thoi luong|duration|video|clip).{0,36}\b\d+(?:[.,]\d+)?\s*(?:s|sec|second|seconds|giay|phut|minute|minutes|min)\b/i);
  const durationSpec = Boolean(durationSpecMatch) && (
    !/(?:animation|animate|hieu ung|transition|delay|chuyen canh)/i.test(durationSpecMatch![0])
    || /(?:thoi luong|duration|video\s+dai|clip\s+dai)/i.test(durationSpecMatch![0])
  );
  const spec = durationSpec
    || /\b(?:9\s*[:x/]\s*16|16\s*[:x/]\s*9|1\s*[:x/]\s*1|portrait|landscape|square)\b/i.test(source)
    || /\b(?:video|clip|khung|ty le|aspect).{0,16}\b(?:doc|ngang|vuong)\b/i.test(source);
  const contentNoun = /\b(?:noi dung|text|chu|tieu de|headline|caption|cta|tu|cum tu|cau|thong tin|ten|nhan)\b/i.test(source);
  const contentVerb = /\b(?:doi|thay|sua|them|xoa|bo|viet lai|replace|change|edit|add|remove|delete|rewrite)\b/i.test(source);
  const quotedReplacement = /["“”'][^"“”']+["“”']\s*(?:thanh|to|->|=>)\s*["“”'][^"“”']+["“”']/i.test(prompt);
  const content = quotedReplacement || (contentVerb && contentNoun);
  const affectedSceneIds = (pipeline?.scenePlan || [])
    .filter((scene) => source.includes(normalizedPrompt(scene.id)))
    .map((scene) => scene.id);

  const inferredVisual = !fullRedesign && !voice && !content && !timing && !spec;
  return {
    visual: visual || inferredVisual,
    voice,
    content,
    timing,
    spec,
    fullRedesign,
    affectedSceneIds,
  };
}

export function isVisualOnlyRevision(intent: HtmlVideoRevisionIntent) {
  return intent.visual
    && !intent.voice
    && !intent.content
    && !intent.timing
    && !intent.spec
    && !intent.fullRedesign;
}

export function isVoiceOnlyRevision(intent: HtmlVideoRevisionIntent) {
  return intent.voice
    && !intent.visual
    && !intent.content
    && !intent.timing
    && !intent.spec
    && !intent.fullRedesign;
}

export function planFromExistingPipeline(
  pipeline: HtmlVideoPipelineMetadata,
  input: HtmlVideoDraftInput
): HtmlVideoPlan {
  return {
    videoBrief: {
      ...pipeline.videoBrief,
      videoSpec: {
        ...pipeline.videoBrief.videoSpec,
        durationSeconds: input.durationSeconds,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
      },
    },
    contentUnits: pipeline.contentUnits.map((unit) => ({ ...unit })),
    scenePlan: pipeline.scenePlan.map((scene) => ({
      ...scene,
      sourceUnitIds: [...scene.sourceUnitIds],
      onScreenText: [...scene.onScreenText],
      assetIds: [...scene.assetIds],
    })),
  };
}
