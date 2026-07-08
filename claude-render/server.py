#!/usr/bin/env python3
"""
Claude Render Server — Professional Video Pipeline
===================================================
Standalone HTTP server chạy trên VPS.
Hoàn toàn KHÔNG phụ thuộc vào Hermes hoặc bất kỳ tool nào khác.

Pipeline:
  1. Nhận job qua POST /render
  2. Worker thread gọi Anthropic Claude API để sinh HTML+GSAP cho từng scene
  3. HyperFrames render HTML → MP4 per scene
  4. FFmpeg concat tất cả scene
  5. Upload Cloudinary → trả URL qua webhook

Requirements (cài trên VPS):
  pip3 install anthropic cloudinary

Environment variables:
  ANTHROPIC_API_KEY     — bắt buộc
  CLAUDE_RENDER_KEY     — API key để xác thực client (default: igen-render-2024)
  CLAUDE_RENDER_PORT    — port server (default: 8644)
  CLOUDINARY_CLOUD_NAME — mặc định: dgaofuhmv
  CLOUDINARY_API_KEY    — mặc định: 784587127497449
  CLOUDINARY_API_SECRET — mặc định: GSQvrcPRPuGdIYWw2zESpj2z0Qw
"""

import os, sys, json, time, re, subprocess, threading, traceback, urllib.request, ssl
from pathlib import Path
from datetime import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler

# ─── Thư mục làm việc ────────────────────────────────────────────────────────
RENDER_HOME = os.environ.get("CLAUDE_RENDER_HOME", str(Path.home() / ".claude-render"))
QUEUE_DIR   = f"{RENDER_HOME}/queue"
LOG_DIR     = f"{RENDER_HOME}/logs"

for d in [QUEUE_DIR, LOG_DIR]:
    Path(d).mkdir(parents=True, exist_ok=True)

# ─── Config ──────────────────────────────────────────────────────────────────
API_KEY       = os.environ.get("CLAUDE_RENDER_KEY") or os.environ.get("CLAUDE_RENDER_API_KEY") or "igen-render-2024"
PORT          = int(os.environ.get("CLAUDE_RENDER_PORT", "8644"))
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLD_NAME      = os.environ.get("CLOUDINARY_CLOUD_NAME", "dgaofuhmv")
CLD_KEY       = os.environ.get("CLOUDINARY_API_KEY", "784587127497449")
CLD_SECRET    = os.environ.get("CLOUDINARY_API_SECRET", "GSQvrcPRPuGdIYWw2zESpj2z0Qw")

SCENE_DURATIONS = {
    "hook": 8, "story": 12, "insight": 12,
    "pipeline": 15, "before_after": 12, "cta": 10,
}

# ─── Logging ─────────────────────────────────────────────────────────────────
def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line, flush=True)
    with open(f"{RENDER_HOME}/server.log", "a") as f:
        f.write(line + "\n")

# ─── Job queue (file-based) ───────────────────────────────────────────────────
def _job_path(tid: str, status: str) -> Path:
    return Path(f"{QUEUE_DIR}/{status}_{tid}.json")

def create_job(tid: str, payload: dict):
    payload["id"] = tid
    payload["status"] = "pending"
    payload["created_at"] = time.time()
    payload["result_url"] = None
    payload["error"] = None
    _job_path(tid, "pending").write_text(json.dumps(payload, indent=2))
    log(f"Job {tid} queued")

def get_job(tid: str) -> dict | None:
    for s in ["pending", "running", "done", "failed"]:
        p = _job_path(tid, s)
        if p.exists():
            return json.loads(p.read_text())
    return None

def _move_job(tid: str, from_s: str, to_s: str, update: dict = {}):
    old = _job_path(tid, from_s)
    if old.exists():
        job = json.loads(old.read_text())
        job.update(update)
        job["status"] = to_s
        _job_path(tid, to_s).write_text(json.dumps(job, indent=2))
        old.unlink(missing_ok=True)
    else:
        # tìm trong bất kỳ status nào
        for s in ["pending", "running", "done", "failed"]:
            p = _job_path(tid, s)
            if p.exists():
                job = json.loads(p.read_text())
                job.update(update)
                job["status"] = to_s
                _job_path(tid, to_s).write_text(json.dumps(job, indent=2))
                p.unlink(missing_ok=True)
                break

def pick_pending_job() -> dict | None:
    files = sorted(Path(QUEUE_DIR).glob("pending_*.json"))
    if not files:
        return None
    p = files[0]
    tid = p.name.removeprefix("pending_").removesuffix(".json")
    job = json.loads(p.read_text())
    # atomic move: pending → running
    _move_job(tid, "pending", "running")
    return job

def complete_job(tid: str, result_url: str):
    _move_job(tid, "running", "done", {"result_url": result_url, "completed_at": time.time()})
    log(f"Job {tid} done: {result_url}")

def fail_job(tid: str, error: str):
    _move_job(tid, "running", "failed", {"error": error, "failed_at": time.time()})
    log(f"Job {tid} failed: {error}")

# ─── Webhook ─────────────────────────────────────────────────────────────────
def call_webhook(url: str, payload: dict):
    if not url:
        return
    try:
        ctx = ssl._create_unverified_context()
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=10, context=ctx)
        log(f"Webhook sent → {url}")
    except Exception as e:
        log(f"Webhook failed → {url}: {e}")

# ─── Claude API: sinh HTML per scene ─────────────────────────────────────────
def call_claude(prompt: str, max_tokens: int = 8192) -> str:
    """Gọi Anthropic Claude API, trả về text response."""
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)
        msg = client.messages.create(
            model="claude-opus-4-5-20251101",
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        )
        return msg.content[0].text
    except ImportError:
        raise RuntimeError("anthropic SDK chưa cài. Chạy: pip3 install anthropic")

def extract_html(text: str) -> str:
    """Trích xuất HTML từ response Claude."""
    m = re.search(r"```html\s*([\s\S]+?)\s*```", text, re.IGNORECASE)
    if m:
        return m.group(1).strip()
    if text.strip().lower().startswith("<!doctype") or text.strip().startswith("<html"):
        return text.strip()
    raise ValueError("Claude không trả về HTML hợp lệ")

def get_scene_spec(scene_type: str, outline: str) -> str:
    specs = {
        "hook": f"""
Scene HOOK — Mở đầu kịch tính (8 giây)
Nội dung từ outline: {outline[:200]}
Layout left panel:
  - Tag nhỏ monospace: "AI × VIDEO EDITING" (hoặc tag phù hợp nội dung)
  - Tiêu đề lớn 2 dòng (52px bold): dòng 1 trắng, dòng 2 màu GOLD #F5C842
  - Subtitle 13px mô tả ngắn
  - Tagline nhỏ glow effect
GSAP: title scale(0.85→1) + opacity(0→1) 0.8s ease-back, subtitle slide-in từ left delay 0.4s""",

        "story": f"""
Scene STORY — Vấn đề cũ / Pain points (12 giây)
Nội dung từ outline: {outline[:200]}
Layout left panel:
  - Section title "TRƯỚC ĐÂY" + subtitle nhỏ
  - 2-3 card vấn đề: border rgba(239,68,68,0.4) + glow đỏ nhạt
  - Mỗi card: icon ❌ hoặc ⚠️ + title bold + mô tả 1 dòng
GSAP: stagger .card từng card 0.3s delay""",

        "insight": f"""
Scene INSIGHT — Giải pháp (12 giây)
Nội dung từ outline: {outline[:200]}
Layout left panel:
  - Section title "GIẢI PHÁP ⚡" + subtitle
  - 2-3 card giải pháp: border rgba(34,197,94,0.4) + glow xanh lá
  - Mỗi card: icon ✅ + title bold + mô tả
GSAP: stagger .card từng card 0.3s delay""",

        "pipeline": f"""
Scene PIPELINE — Quy trình (15 giây)
Nội dung từ outline: {outline[:200]}
Layout left panel:
  - Section title "QUY TRÌNH TỰ ĐỘNG"
  - 5 box flow NẰNG NGANG với arrow ▶ giữa mỗi box
  - Box 1: [Prompt] tag input xanh
  - Box 2: [Claude API] tag ai xanh dương
  - Box 3: [HTML+GSAP] tag anim teal
  - Box 4: [HyperFrames] tag render tím
  - Box 5: [Video MP4] tag output gold
  - Mỗi box: icon + label + tag màu
GSAP: box xuất hiện trái→phải stagger 0.35s, sau đó arrow fade in""",

        "before_after": f"""
Scene BEFORE_AFTER — So sánh (12 giây)
Nội dung từ outline: {outline[:200]}
Layout left panel:
  - Section title "TRƯỚC vs SAU"
  - 2 cột: LEFT "TRƯỚC" header bg đỏ #7F1D1D | RIGHT "SAU" header bg gold #78350F
  - Mỗi cột: 2-3 bullet điểm khác nhau (trước: vấn đề, sau: kết quả)
  - 3 stat bên dưới: Thời gian | Chi phí | Chất lượng (số green)
GSAP: 2 cột translateX(±40px→0) slide in, stat stagger""",

        "cta": f"""
Scene CTA — Kêu gọi hành động (10 giây)
Nội dung từ outline: {outline[:200]}
Layout left panel:
  - Tiêu đề 2 dòng (white + gold)
  - 3 bullet benefit: icon + title + mô tả ngắn
  - Nút CTA lớn: background gradient gold, text đen, border-radius 8px
  - 3 stat dưới: số lớn gold + label nhỏ
GSAP: bullet stagger 0.2s, CTA scale(0.9→1) + elastic bounce""",
    }
    return specs.get(scene_type, f"Scene {scene_type} — nội dung từ outline: {outline[:300]}")

def build_scene_prompt(
    scene_type: str,
    outline: str,
    idx: int,
    total: int,
    facecam_path: str,
    brand_name: str,
) -> str:
    counter = f"SCENE {idx:02d} / {total:02d} — {scene_type.upper()}"
    duration = SCENE_DURATIONS.get(scene_type, 10)

    return f"""Tạo file HTML hoàn chỉnh cho scene "{scene_type}" trong professional video.

OUTLINE NỘI DUNG:
{outline}

THÔNG TIN SCENE:
- Loại scene: {scene_type}
- Scene counter: "{counter}"
- Thời lượng: {duration} giây
- Brand: {brand_name}
- Facecam path: {facecam_path}

BẮT BUỘC — LAYOUT & DESIGN:
Canvas: body {{width:1280px;height:720px;overflow:hidden;display:flex;background:#080808}}
Left panel: flex 0 0 55%, padding 36px 40px, z-index 1, flex-direction column, justify-content center
Right panel: flex 0 0 45%, position relative, overflow hidden

Right panel HTML (PHẢI dùng chính xác):
<div style="flex:0 0 45%;position:relative;overflow:hidden;">
  <video src="file://{facecam_path}" autoplay muted loop playsinline
         style="width:100%;height:100%;object-fit:cover;"></video>
  <div style="position:absolute;inset:0;background:linear-gradient(to right,rgba(8,8,8,0.45) 0%,transparent 28%);"></div>
</div>

Scene counter (PHẢI có):
<div style="position:fixed;top:10px;left:14px;z-index:99;font:600 9px/1 'JetBrains Mono','Courier New',monospace;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.3);">{counter}</div>

Star particles (PHẢI có, dùng JS canvas):
120 hạt trắng, opacity ngẫu nhiên 0.1-0.9, kích thước 0.3-1.5px, vị trí ngẫu nhiên, animate opacity lên xuống liên tục với requestAnimationFrame. Position fixed, inset 0, z-index 0, pointer-events none.

Màu sắc:
- Background: #080808 (KHÔNG dùng màu sáng)
- Title: #FFFFFF, Accent/Gold: #F5C842, Green: #22C55E, Red: #EF4444
- Card bg: rgba(255,255,255,0.04), border: rgba(255,255,255,0.08)

GSAP từ CDN (BẮT BUỘC):
<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>

Footer brand:
<div style="position:fixed;bottom:12px;left:40px;font:600 9px/1 monospace;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.15);z-index:2;">{brand_name} • AI Tools</div>

SPEC CHO SCENE NÀY:
{get_scene_spec(scene_type, outline)}

ANIMATION:
- Tất cả elements left panel phải có opacity:0 ban đầu, animate bằng GSAP
- Chạy trong window.onload hoặc DOMContentLoaded
- GSAP standard: gsap.from(el, {{opacity:0, y:30, duration:0.5, ease:"power2.out", stagger:0.25}})

QUAN TRỌNG:
- Trả về DUY NHẤT code HTML trong block ```html ... ```
- KHÔNG giải thích, KHÔNG thêm markdown khác
- HTML phải standalone hoàn chỉnh (<!DOCTYPE html> → </html>)
- KHÔNG dùng CDN khác ngoài GSAP ở trên
- KHÔNG external font (dùng system fonts: Inter, Segoe UI, sans-serif)"""

def generate_scene_html(
    scene_type: str,
    outline: str,
    idx: int,
    total: int,
    facecam_path: str,
    brand_name: str,
) -> str:
    """Gọi Claude để sinh HTML cho 1 scene. Retry 2 lần nếu fail."""
    prompt = build_scene_prompt(scene_type, outline, idx, total, facecam_path, brand_name)
    for attempt in range(3):
        try:
            raw = call_claude(prompt)
            return extract_html(raw)
        except Exception as e:
            log(f"  [HTML gen] scene={scene_type} attempt={attempt+1} error={e}")
            if attempt == 2:
                raise

# ─── HyperFrames render ───────────────────────────────────────────────────────
def render_scene_video(html_path: str, out_path: str, duration: int) -> None:
    """Render 1 scene HTML → MP4 via HyperFrames (hoặc fallback wkhtmltopdf)."""
    log(f"  [Render] {Path(html_path).name} → {Path(out_path).name} ({duration}s)")

    # Try 1: npx hyperframes
    try:
        subprocess.run([
            "npx", "hyperframes", "render",
            "--input", html_path,
            "--output", out_path,
            "--duration", str(duration),
            "--fps", "30",
            "--width", "1280",
            "--height", "720",
            "--wait", "600",
        ], timeout=300, check=True, capture_output=True)
        return
    except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired) as e:
        log(f"  [Render] HyperFrames failed: {e}. Thử fallback...")

    # Try 2: puppeteer screenshot loop + ffmpeg
    work_dir = str(Path(out_path).parent)
    scene_name = Path(html_path).stem
    frames_dir = f"{work_dir}/frames_{scene_name}"
    Path(frames_dir).mkdir(exist_ok=True)

    frame_count = duration * 30
    capture_script = f"""
const puppeteer = require('puppeteer');
const path = require('path');
(async () => {{
  const b = await puppeteer.launch({{args:['--no-sandbox','--disable-setuid-sandbox']}});
  const p = await b.newPage();
  await p.setViewport({{width:1280,height:720}});
  await p.goto('file://{html_path}',{{waitUntil:'networkidle0',timeout:15000}});
  await new Promise(r=>setTimeout(r,600));
  for(let i=0;i<{frame_count};i++){{
    await p.screenshot({{path:path.join('{frames_dir}',`frame_${{String(i).padStart(4,'0')}}.png`)}});
    await new Promise(r=>setTimeout(r,{round(1000/30)}));
  }}
  await b.close();
}})();
"""
    script_path = f"{work_dir}/capture_{scene_name}.js"
    Path(script_path).write_text(capture_script)

    try:
        subprocess.run(["node", script_path], timeout=duration*10+60, check=True)
        subprocess.run([
            "ffmpeg", "-r", "30",
            "-i", f"{frames_dir}/frame_%04d.png",
            "-c:v", "libx264", "-preset", "fast", "-crf", "20",
            "-pix_fmt", "yuv420p",
            out_path, "-y",
        ], timeout=120, check=True, capture_output=True)
        return
    except Exception as e:
        log(f"  [Render] Puppeteer fallback failed: {e}")
        raise RuntimeError(f"Không thể render scene {scene_name}")

# ─── FFmpeg concat ────────────────────────────────────────────────────────────
def concat_videos(scene_paths: list[str], out_path: str) -> None:
    concat_file = str(Path(out_path).parent / "concat_list.txt")
    with open(concat_file, "w") as f:
        for p in scene_paths:
            f.write(f"file '{p}'\n")

    subprocess.run([
        "ffmpeg", "-f", "concat", "-safe", "0",
        "-i", concat_file,
        "-c:v", "libx264", "-preset", "fast", "-crf", "20",
        "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart",
        out_path, "-y",
    ], timeout=300, check=True, capture_output=True)
    log(f"  [Concat] done → {out_path}")

# ─── Cloudinary upload ────────────────────────────────────────────────────────
def upload_cloudinary(video_path: str) -> str:
    try:
        import cloudinary
        import cloudinary.uploader
    except ImportError:
        subprocess.run(["pip3", "install", "cloudinary", "-q"], timeout=60)
        import cloudinary
        import cloudinary.uploader

    cloudinary.config(cloud_name=CLD_NAME, api_key=CLD_KEY, api_secret=CLD_SECRET)
    result = cloudinary.uploader.upload(
        video_path,
        resource_type="video",
        folder="igen_erp/claude_render",
        overwrite=True,
    )
    url = result["secure_url"]
    log(f"  [Upload] Cloudinary: {url}")
    return url

# ─── Main job runner ──────────────────────────────────────────────────────────
def run_job(job: dict):
    tid         = job["id"]
    facecam_url = job.get("facecam_url", "")
    outline     = job.get("outline", "")
    scene_list  = job.get("scenes", list(SCENE_DURATIONS.keys()))
    brand_name  = job.get("brand_name", "iGen Tech")
    bg_music    = job.get("bg_music_url", "")
    webhook_url = job.get("webhook_url", "")

    work_dir   = f"/tmp/cr_{tid}"
    scenes_dir = f"{work_dir}/scenes"
    output_dir = f"{work_dir}/output"
    Path(scenes_dir).mkdir(parents=True, exist_ok=True)
    Path(output_dir).mkdir(parents=True, exist_ok=True)

    log(f"[Job {tid}] Start — {len(scene_list)} scenes")

    def update(progress: int, msg: str):
        call_webhook(webhook_url, {
            "task_id": tid,
            "status": "running",
            "progress": progress,
            "log": msg,
        })

    try:
        # ── Bước 1: Download facecam ─────────────────────────────────────────
        facecam_path = f"{work_dir}/facecam.mp4"
        log(f"[Job {tid}] Download facecam...")
        update(5, "Đang tải facecam video...")
        subprocess.run(
            ["curl", "-L", "--retry", "3", "--retry-delay", "2",
             facecam_url, "-o", facecam_path],
            timeout=300, check=True, capture_output=True,
        )

        # ── Bước 2: Sinh HTML+GSAP cho từng scene ────────────────────────────
        html_files = []
        for i, scene in enumerate(scene_list, 1):
            progress = 10 + int((i / len(scene_list)) * 35)
            log(f"[Job {tid}] Generating HTML: {scene} ({i}/{len(scene_list)})...")
            update(progress, f"Claude đang viết HTML cho scene {scene}...")

            html_path = f"{scenes_dir}/{scene}.html"
            html = generate_scene_html(scene, outline, i, len(scene_list), facecam_path, brand_name)
            Path(html_path).write_text(html, encoding="utf-8")
            html_files.append((scene, html_path))
            log(f"[Job {tid}] HTML saved: {html_path} ({len(html)} chars)")

        # ── Bước 3: Render từng scene → MP4 ─────────────────────────────────
        mp4_files = []
        for i, (scene, html_path) in enumerate(html_files, 1):
            progress = 45 + int((i / len(html_files)) * 35)
            update(progress, f"HyperFrames render scene {scene}...")
            out_mp4 = f"{output_dir}/{scene}.mp4"
            render_scene_video(html_path, out_mp4, SCENE_DURATIONS.get(scene, 10))
            mp4_files.append(out_mp4)

        # ── Bước 4: Concat ───────────────────────────────────────────────────
        update(82, "FFmpeg đang nối tất cả scene...")
        final_path = f"{output_dir}/final.mp4"
        concat_videos(mp4_files, final_path)

        # Mix nhạc nền nếu có
        if bg_music:
            music_path = f"{work_dir}/bgmusic.mp3"
            subprocess.run(["curl", "-L", bg_music, "-o", music_path],
                           timeout=120, check=True, capture_output=True)
            mixed = f"{output_dir}/final_mixed.mp4"
            subprocess.run([
                "ffmpeg", "-i", final_path, "-i", music_path,
                "-filter_complex", "[1:a]volume=0.12[bg];[0:a][bg]amix=inputs=2:duration=first",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
                mixed, "-y",
            ], timeout=300, check=True, capture_output=True)
            final_path = mixed

        # ── Bước 5: Upload Cloudinary ────────────────────────────────────────
        update(90, "Đang upload lên Cloudinary...")
        result_url = upload_cloudinary(final_path)

        complete_job(tid, result_url)
        call_webhook(webhook_url, {
            "task_id": tid,
            "status": "done",
            "progress": 100,
            "result_url": result_url,
        })

    except Exception as e:
        err = f"{type(e).__name__}: {e}\n{traceback.format_exc()[-500:]}"
        log(f"[Job {tid}] FAILED: {err}")
        fail_job(tid, err)
        call_webhook(webhook_url, {"task_id": tid, "status": "failed", "error": err})

# ─── Worker thread pool ───────────────────────────────────────────────────────
_shutdown = threading.Event()

def worker_loop(worker_id: int):
    log(f"Worker-{worker_id} started")
    while not _shutdown.is_set():
        job = pick_pending_job()
        if job:
            log(f"Worker-{worker_id} picked job {job['id']}")
            run_job(job)
        else:
            time.sleep(2)

def start_workers(count: int = 2):
    for i in range(count):
        t = threading.Thread(target=worker_loop, args=(i,), daemon=True)
        t.start()
    log(f"{count} workers started")

# ─── HTTP Server ──────────────────────────────────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # suppress default HTTP logs

    def _json(self, data: dict, code: int = 200):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self) -> dict:
        n = int(self.headers.get("Content-Length", 0))
        return json.loads(self.rfile.read(n)) if n else {}

    def _auth(self) -> bool:
        k = self.headers.get("X-API-Key", "")
        if k != API_KEY:
            self._json({"error": "Unauthorized: thiếu hoặc sai X-API-Key"}, 401)
            return False
        return True

    def do_GET(self):
        if self.path == "/health":
            pending = len(list(Path(QUEUE_DIR).glob("pending_*.json")))
            running = len(list(Path(QUEUE_DIR).glob("running_*.json")))
            self._json({
                "status": "ok",
                "service": "claude-render",
                "queue": {"pending": pending, "running": running},
                "anthropic_key_set": bool(ANTHROPIC_KEY),
            })

        elif self.path.startswith("/status/"):
            if not self._auth():
                return
            tid = self.path.removeprefix("/status/").strip("/")
            job = get_job(tid)
            if not job:
                self._json({"error": "Job not found"}, 404)
                return
            self._json({
                "task_id": tid,
                "status": job.get("status"),
                "progress": job.get("progress", 0),
                "result_url": job.get("result_url"),
                "error": job.get("error"),
                "created_at": job.get("created_at"),
            })
        else:
            self._json({"error": "Not found"}, 404)

    def do_POST(self):
        if self.path == "/render":
            if not self._auth():
                return
            try:
                b = self._read_body()
            except Exception:
                self._json({"error": "Invalid JSON"}, 400)
                return

            facecam_url = b.get("facecam_url", "")
            outline     = b.get("outline", "")
            if not facecam_url or not outline:
                self._json({"error": "Thiếu facecam_url hoặc outline"}, 400)
                return
            if not ANTHROPIC_KEY:
                self._json({"error": "ANTHROPIC_API_KEY chưa được set trên VPS"}, 503)
                return

            tid = f"cr_{int(time.time())}_{os.urandom(4).hex()}"
            create_job(tid, {
                "facecam_url": facecam_url,
                "outline": outline,
                "scenes": b.get("scenes", list(SCENE_DURATIONS.keys())),
                "brand_name": b.get("brand_name", "iGen Tech"),
                "bg_music_url": b.get("bg_music_url", ""),
                "webhook_url": b.get("webhook_url", ""),
                "user_id": b.get("user_id", "api"),
                "record_id": b.get("record_id", ""),
            })
            self._json({"task_id": tid, "status": "queued"})

        else:
            self._json({"error": "Not found"}, 404)

# ─── Entry point ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    if not ANTHROPIC_KEY:
        print("WARNING: ANTHROPIC_API_KEY không được set!", file=sys.stderr)

    start_workers(count=2)

    server = HTTPServer(("0.0.0.0", PORT), Handler)
    log(f"Claude Render Server listening on :{PORT}")
    log(f"  Health: http://localhost:{PORT}/health")
    log(f"  Render: POST http://localhost:{PORT}/render  (X-API-Key: {API_KEY})")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        _shutdown.set()
        log("Server stopped")
