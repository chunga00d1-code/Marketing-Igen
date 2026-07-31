/* eslint-disable react-refresh/only-export-components */
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Code2, Download, LoaderCircle, Play, ShieldCheck } from "lucide-react";
import {
  htmlVideoRenderService,
  type HtmlVideoAspectRatio,
  type HtmlVideoPreview,
  type HtmlVideoRenderDetail,
  type HtmlVideoRenderStatus,
  type HtmlVideoResolution,
} from "../../services/htmlVideoRenderService";

const defaultHtml = `<main class="hero">
  <p class="eyebrow">iGen Marketing</p>
  <h1>Biến ý tưởng thành video</h1>
  <p class="description">Thiết kế bằng HTML và CSS, kết xuất thành MP4.</p>
</main>`;

const defaultCss = `.hero {
  width: 100%;
  height: 100%;
  display: grid;
  place-content: center;
  gap: 20px;
  padding: 80px;
  color: white;
  text-align: center;
  background: linear-gradient(135deg, #0f172a, #2563eb);
}
.eyebrow { color: #93c5fd; font-size: 28px; letter-spacing: 0.2em; }
h1 { margin: 0; font-size: 72px; animation: rise 1s ease-out both; }
.description { margin: 0; font-size: 30px; color: #dbeafe; }
@keyframes rise {
  from { opacity: 0; transform: translateY(40px); }
  to { opacity: 1; transform: translateY(0); }
}`;

type HtmlVideoWorkspaceService = Pick<
  typeof htmlVideoRenderService,
  "preview" | "create" | "get"
>;

type PollHtmlVideoRenderOptions = {
  renderId: string;
  signal: AbortSignal;
  getRender: (renderId: string, signal: AbortSignal) => Promise<HtmlVideoRenderDetail>;
  onUpdate: (detail: HtmlVideoRenderDetail) => void;
  wait?: (signal: AbortSignal) => Promise<void>;
};

function abortError() {
  return new DOMException("Polling aborted.", "AbortError");
}

function defaultPollWait(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, 2_000);
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(abortError());
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

export function isActiveHtmlVideoStatus(status?: HtmlVideoRenderStatus | null) {
  return status === "queued" || status === "rendering" || status === "uploading";
}

export function createHtmlVideoIdempotencyKey() {
  const unique =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `html_video_${unique}`;
}

export async function pollHtmlVideoRender({
  renderId,
  signal,
  getRender,
  onUpdate,
  wait = defaultPollWait,
}: PollHtmlVideoRenderOptions): Promise<HtmlVideoRenderDetail> {
  while (true) {
    await wait(signal);
    if (signal.aborted) throw abortError();
    const detail = await getRender(renderId, signal);
    if (signal.aborted) throw abortError();
    onUpdate(detail);
    if (!isActiveHtmlVideoStatus(detail.status)) return detail;
  }
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function HtmlVideoWorkspace({
  service = htmlVideoRenderService,
}: {
  service?: HtmlVideoWorkspaceService;
}) {
  const [html, setHtml] = useState(defaultHtml);
  const [css, setCss] = useState(defaultCss);
  const [durationSeconds, setDurationSeconds] = useState(5);
  const [aspectRatio, setAspectRatio] =
    useState<HtmlVideoAspectRatio>("16:9");
  const [resolution, setResolution] = useState<HtmlVideoResolution>("720p");
  const [preview, setPreview] = useState<HtmlVideoPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [render, setRender] = useState<HtmlVideoRenderDetail | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const pollControllerRef = useRef<AbortController | null>(null);
  const submissionGenerationRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setPreviewLoading(true);
      void service
        .preview(
          { html, css, durationSeconds, aspectRatio, resolution },
          controller.signal
        )
        .then((nextPreview) => {
          if (controller.signal.aborted) return;
          setPreview(nextPreview);
          setPreviewError("");
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          setPreviewError(
            errorMessage(error, "Không thể tạo bản xem trước an toàn.")
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) setPreviewLoading(false);
        });
    }, 500);
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [aspectRatio, css, durationSeconds, html, resolution, service]);

  useEffect(
    () => () => {
      pollControllerRef.current?.abort();
      submissionGenerationRef.current += 1;
    },
    []
  );

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitting || isActiveHtmlVideoStatus(render?.status)) return;

    pollControllerRef.current?.abort();
    const controller = new AbortController();
    pollControllerRef.current = controller;
    const generation = submissionGenerationRef.current + 1;
    submissionGenerationRef.current = generation;
    setSubmitting(true);
    setSubmitError("");

    try {
      const created = await service.create(
        {
          html,
          css,
          durationSeconds,
          aspectRatio,
          resolution,
          idempotencyKey: createHtmlVideoIdempotencyKey(),
        },
        controller.signal
      );
      if (submissionGenerationRef.current !== generation) return;
      setRender(created);
      if (isActiveHtmlVideoStatus(created.status)) {
        await pollHtmlVideoRender({
          renderId: created.id,
          signal: controller.signal,
          getRender: service.get,
          onUpdate: (detail) => {
            if (submissionGenerationRef.current === generation) {
              setRender(detail);
            }
          },
        });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      if (submissionGenerationRef.current === generation) {
        setSubmitError(errorMessage(error, "Không thể kết xuất video HTML."));
      }
    } finally {
      if (submissionGenerationRef.current === generation) {
        setSubmitting(false);
      }
    }
  };

  const active = isActiveHtmlVideoStatus(render?.status);

  return (
    <form
      data-testid="html-video-workspace"
      className="mx-auto grid w-full max-w-[1500px] gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]"
      onSubmit={handleSubmit}
    >
      <section className="space-y-5 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
            <Code2 className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-extrabold text-slate-950">
              Tạo video từ HTML
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              JavaScript và tài nguyên từ URL không được hỗ trợ trong phiên bản này.
            </p>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <label className="space-y-2 text-sm font-bold text-slate-700">
            <span>Nội dung HTML</span>
            <textarea
              value={html}
              onChange={(event) => setHtml(event.target.value)}
              className="min-h-72 w-full resize-y rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-sky-100 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              spellCheck={false}
              maxLength={100 * 1024}
            />
          </label>
          <label className="space-y-2 text-sm font-bold text-slate-700">
            <span>CSS &amp; animation</span>
            <textarea
              value={css}
              onChange={(event) => setCss(event.target.value)}
              className="min-h-72 w-full resize-y rounded-2xl border border-slate-200 bg-slate-950 p-4 font-mono text-xs leading-6 text-emerald-100 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              spellCheck={false}
              maxLength={100 * 1024}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-2 text-xs font-bold text-slate-600">
            <span>Thời lượng</span>
            <input
              type="number"
              min={1}
              max={60}
              value={durationSeconds}
              onChange={(event) =>
                setDurationSeconds(
                  Math.min(60, Math.max(1, Number(event.target.value) || 1))
                )
              }
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400"
            />
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600">
            <span>Tỷ lệ khung hình</span>
            <select
              value={aspectRatio}
              onChange={(event) =>
                setAspectRatio(event.target.value as HtmlVideoAspectRatio)
              }
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400"
            >
              <option value="16:9">16:9</option>
              <option value="9:16">9:16</option>
              <option value="1:1">1:1</option>
            </select>
          </label>
          <label className="space-y-2 text-xs font-bold text-slate-600">
            <span>Độ phân giải</span>
            <select
              value={resolution}
              onChange={(event) =>
                setResolution(event.target.value as HtmlVideoResolution)
              }
              className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-sky-400"
            >
              <option value="720p">720p</option>
              <option value="1080p">1080p</option>
            </select>
          </label>
        </div>

        {submitError ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
            {submitError}
          </p>
        ) : null}

        {render ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-bold text-slate-800">
                {render.stageMessage}
              </span>
              <span className="font-extrabold text-sky-700">
                {render.progress}%
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-sky-600 transition-[width]"
                style={{ width: `${render.progress}%` }}
              />
            </div>
            {render.status === "failed" && render.error ? (
              <p className="mt-3 text-sm font-semibold text-rose-700">
                {render.error}
              </p>
            ) : null}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting || active || previewLoading || Boolean(previewError)}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky-600 px-5 text-sm font-extrabold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {submitting || active ? (
            <LoaderCircle className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {submitting || active ? "Đang kết xuất..." : "Kết xuất video"}
        </button>
      </section>

      <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-slate-950">Xem trước an toàn</h3>
            <p className="mt-1 text-xs text-slate-500">
              Nội dung được kiểm tra trên server trước khi hiển thị.
            </p>
          </div>
          <ShieldCheck className="h-5 w-5 text-emerald-600" />
        </div>

        <div className="flex min-h-[420px] items-center justify-center overflow-auto rounded-2xl bg-slate-950 p-4">
          {preview ? (
            <iframe
              title="Xem trước video HTML"
              sandbox=""
              srcDoc={preview.compositionHtml}
              style={{
                width: preview.width,
                height: preview.height,
                maxWidth: "100%",
                maxHeight: 620,
                aspectRatio: `${preview.width} / ${preview.height}`,
                transformOrigin: "center",
                border: 0,
                background: "#000",
              }}
            />
          ) : (
            <div className="max-w-sm text-center text-sm text-slate-300">
              {previewLoading
                ? "Đang tạo bản xem trước..."
                : previewError || "Chưa có bản xem trước."}
            </div>
          )}
        </div>

        {previewError ? (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
            {previewError}
          </p>
        ) : null}

        {render?.status === "completed" && render.outputUrl ? (
          <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <video
              controls
              src={render.outputUrl}
              className="w-full rounded-xl bg-black"
            />
            <a
              href={render.outputUrl}
              target="_blank"
              rel="noreferrer"
              download
              className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-extrabold text-white"
            >
              <Download className="h-4 w-4" />
              Mở hoặc tải video
            </a>
          </div>
        ) : null}
      </section>
    </form>
  );
}
