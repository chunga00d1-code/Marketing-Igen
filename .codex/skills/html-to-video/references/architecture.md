# HTML-to-video architecture and production acceptance contract

HTML/CSS is the renderer input. The production output is a verified MP4 with the requested voice track, not an image, screenshot, iframe, or raw HTML document.

## Data flow

Keep the pipeline explicit and inspectable:

```text
user prompt + attachments + brand/knowledge context
        -> normalized source context
        -> ordered content units
        -> scene plan + audio plan
        -> structured HTML/CSS/voice draft
        -> security and visual validation
        -> immutable render snapshot
        -> TTS + HTML renderer + audio mux
        -> verified MP4 with audio + history/provenance
```

Do not skip the normalized content-unit or scene-plan stages by asking a model to jump directly from raw prompt to a page.

## Production output contract

Treat a render as complete only when all of the following are true:

- the backend worker has rendered the immutable sanitized snapshot;
- the output file exists and is uploaded to the intended tenant-scoped storage;
- the final MP4 contains a video stream at the requested dimensions and duration;
- the final MP4 contains the generated voice stream when narration is required;
- no browser UI, localhost banner, fullscreen hint, debug label, source markup, or provider diagnostic is present in the media;
- the render record has terminal status, bounded progress, attempt count, provider/renderer error category, output asset metadata, and idempotency key;
- the client exposes the output only through the completed-render contract.

Do not treat a successful HTML preview, TTS API response, temporary file, or queued job as a completed video.

## Recommended contracts

Use the repository's existing TypeScript types and API names where they already exist. The following shape describes the information that must remain available, not a mandate to add a new API field in every change.

```ts
type VideoSpec = {
  aspectRatio: "9:16" | "16:9" | "1:1";
  resolution: "720p" | "1080p";
  durationSeconds: number;
  language: string;
  platform?: "tiktok" | "reels" | "shorts" | "facebook" | "generic";
  audience?: string;
  cta?: string;
};

type ContentUnit = {
  id: string;
  order: number;
  sourceText: string;
  normalizedText: string;
  facts: string[];
  requiredVerbatim?: boolean;
  sourceRefs: string[];
};

type ScenePlanItem = {
  id: string;
  order: number;
  purpose: "opening" | "content" | "closing";
  sourceUnitIds: string[];
  onScreenText: string[];
  narration: string;
  startSeconds: number;
  endSeconds: number;
  transition: "crossfade" | "slide-left" | "slide-right";
};

type RenderSnapshot = {
  sourcePrompt: string;
  sourceContextRefs: string[];
  contentUnits: ContentUnit[];
  scenePlan: ScenePlanItem[];
  html: string;
  css: string;
  voiceScript: string;
  voiceModel: string;
  voiceName: string;
  audioFormat: string;
  audioSampleRate: number;
  audioChannels: number;
  videoSpec: VideoSpec;
};
```

Keep secrets, provider tokens, and renderer credentials outside this snapshot. Store only safe model/voice identifiers and bounded diagnostic categories.

## Source fidelity rules

- Treat the primary prompt or prompt file as authoritative.
- Preserve exact wording when the user requests a phrase, title, translation, pronunciation, product name, or legal copy.
- Separate source facts from generated connective narration. Generated connective text must not add claims.
- Record source references for every content unit used in a scene.
- Keep context bounded without truncating the primary request. Bound history and auxiliary reference text first.
- If context conflicts, prefer explicit current user instructions, then the authoritative prompt file, then selected source data, then verified company knowledge, then visual inference.

## Scene and timing rules

### Scene structure

Use a structure equivalent to:

```html
<main class="scene-deck">
  <section class="scene scene-1">...</section>
  <section class="scene scene-2">...</section>
</main>
```

The exact semantic tags may vary within the security allowlist, but scene boundaries must be represented in HTML. The deck must occupy the fixed canvas; each scene must occupy the same canvas and be isolated from normal document flow.

### Timing

Use one animation duration equal to the requested video duration. Convert each scene's time range into percentages:

```text
startPercent = startSeconds / durationSeconds * 100
endPercent   = endSeconds / durationSeconds * 100
```

Give each scene an entrance, a readable hold, and an exit only when another scene follows. Avoid gaps where no scene is readable. Avoid multiple independent clocks or per-element delays because they make seeking and final rendering disagree.

Allocate time using content complexity. As a practical starting point, keep spoken narration near a natural 130–160 words per minute and reserve transition time outside the readable hold. Recalculate when the requested language or voice cadence differs.

### Visual system

For fixed 1080×1920 portrait output, use a minimum scale of approximately 86px for a dominant phrase, 38px for supporting text, and 27px for labels. Derive equivalent values from the canvas height for other resolutions. Keep essential text within 8%–12% safe margins and make the primary phrase occupy enough width to read on a phone.

Use three coordinated layers:

1. background treatment: multi-stop gradient, tonal field, or contextual CSS pattern;
2. content surface/frame: card, panel, border, or controlled contrast region;
3. accent layer: geometric shape, glow, band, dot field, or other restrained decoration.

Avoid flat white backgrounds, default browser typography, tiny centered text, giant empty cards, and visual elements that compete with the source content. Use CSS-only accents because external URLs, images, fonts, SVG, and scripts are prohibited by the security boundary unless an approved media slot is used.

## Audio contract

Use one narrator and one continuous script unless the user explicitly requests multiple voices. Keep the script in scene order. Do not put timestamps, speaker labels, sound effects, or production directions in `voiceScript`.

Pass the TTS output format metadata through every layer. For raw PCM, pass the correct sample format, sample rate, and channel count to FFmpeg before muxing. Verify the final MP4 contains an audio stream; a successful TTS response alone is not sufficient.

The audio stream must be part of the final uploaded MP4. Do not publish a separate audio URL and assume social platforms will combine it. Keep one stable narrator by default, and make voice, language, timing, and script provenance auditable.

## Validation matrix

Reject and retry a draft when any of these fail:

| Area | Required check |
|---|---|
| structure | response parses; HTML/CSS are within size and allowlists |
| fidelity | every required source unit is represented once and in order |
| scene | fixed deck; no scroll; no vertical page stack; no unsafe overlap |
| timing | scene intervals cover the duration without accidental gaps |
| typography | dominant text and supporting text meet canvas-derived minimums |
| theme | background, surface, and accent layers form one coherent visual system |
| narration | one contextual script matches the scene order and duration |
| security | no scripts, URLs, external assets, event handlers, or unsanitized input |
| render | immutable snapshot; tenant scope; idempotency; bounded retry state |
| audio | TTS bytes are converted/muxed and the final file has an audio stream |
| production | final response exposes only a verified MP4 asset; no browser/debug overlay or HTML-only result |

Return a stable, safe error category to the user. Log only bounded provider/renderer diagnostics server-side and never return keys or raw provider payloads.

## Verification scenarios

Before considering a change complete, test at least:

1. A multi-item educational prompt with exact foreign-language phrases and one continuous voice.
2. A product prompt with source-attached facts and no invented price/specification.
3. A long prompt file plus reference context, verifying primary context preservation.
4. A portrait render with readable text at first, middle, and final scene.
5. A malformed or visually weak model draft, verifying bounded retry and no charge before valid output.
6. A renderer/TTS failure, verifying cleanup, terminal state, and no duplicate job.
