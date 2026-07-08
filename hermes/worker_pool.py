import os, sys, json, time, subprocess, re, urllib.request, ssl
from pathlib import Path
from datetime import datetime
from typing import Optional, Dict

HERMES_HOME = os.environ.get("HERMES_HOME", str(Path.home() / ".hermes"))
MAX_WORKERS = 3
QUEUE_DIR = f"{HERMES_HOME}/worker_queue"
RESULT_DIR = f"{HERMES_HOME}/worker_results"
LOG_DIR = f"{HERMES_HOME}/logs/workers"

for d in [QUEUE_DIR, RESULT_DIR, LOG_DIR]:
    Path(d).mkdir(parents=True, exist_ok=True)

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)
    with open(f"{HERMES_HOME}/logs/pool.log", "a") as f:
        f.write(f"[{ts}] {msg}\n")

def call_webhook(webhook_url, payload):
    if not webhook_url:
        return
    try:
        context = ssl._create_unverified_context()
        data = json.dumps(payload).encode()
        req = urllib.request.Request(
            webhook_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10, context=context) as resp:
            log(f"Webhook OK: {resp.status} -> {webhook_url}")
    except Exception as e:
        log(f"Webhook FAIL: {e} -> {webhook_url}")

def submit_task(video_url, prompt, user_id="anon", webhook_url="", sample_url=""):
    tid = f"task_{int(time.time())}_{os.urandom(4).hex()}"
    task = {
        "id": tid,
        "video_url": video_url,
        "prompt": prompt,
        "sample_url": sample_url,
        "user_id": user_id,
        "webhook_url": webhook_url,
        "status": "pending",
        "created_at": time.time(),
        "result_url": None,
        "error": None
    }
    Path(f"{QUEUE_DIR}/pending_{tid}.json").write_text(json.dumps(task, indent=2))
    log(f"Task {tid} queued (sample={'yes' if sample_url else 'no'})")
    return tid



def get_task(tid):
    for p in ["pending", "running", "done", "failed"]:
        f = Path(f"{QUEUE_DIR}/{p}_{tid}.json")
        if f.exists():
            return json.loads(f.read_text())
    return None

def get_task_val(tid, key):
    task = get_task(tid)
    if task and key in task:
        print(task[key], end="")
    else:
        print("", end="")

def complete_task(tid, result_url):
    task = get_task(tid)
    if not task:
        log(f"complete_task: Task {tid} not found")
        return

    clean_url = result_url.strip().split('\\n')[0].split('\n')[0].strip()

    task["status"] = "done"
    task["result_url"] = clean_url
    task["completed_at"] = time.time()

    Path(f"{QUEUE_DIR}/done_{tid}.json").write_text(json.dumps(task, indent=2))

    running_file = Path(f"{QUEUE_DIR}/running_{tid}.json")
    if running_file.exists():
        running_file.unlink()

    log(f"Task {tid} completed with result: {clean_url}")

    if task.get("webhook_url"):
        call_webhook(task["webhook_url"], {
            "content": clean_url,
            "status": "done",
            "result_url": clean_url
        })

def fail_task(tid, error_msg=""):
    task = get_task(tid)
    if not task:
        log(f"fail_task: Task {tid} not found")
        return

    if not error_msg:
        log_path = Path(f"{LOG_DIR}/task_{tid}.log")
        if log_path.exists():
            error_msg = log_path.read_text()[-300:]
        else:
            error_msg = "Unknown worker failure"

    task["status"] = "failed"
    task["error"] = error_msg
    task["failed_at"] = time.time()

    Path(f"{QUEUE_DIR}/failed_{tid}.json").write_text(json.dumps(task, indent=2))

    running_file = Path(f"{QUEUE_DIR}/running_{tid}.json")
    if running_file.exists():
        running_file.unlink()

    log(f"Task {tid} failed: {error_msg}")

    if task.get("webhook_url"):
        call_webhook(task["webhook_url"], {
            "status": "failed",
            "error": error_msg
        })

def run_task(tid):
    task = get_task(tid)
    if not task:
        log(f"run_task: Task {tid} not found")
        return

    vu         = task.get("video_url", "")
    pr         = task.get("prompt", "")
    sample_url = task.get("sample_url", "")

    # ── Xác định kịch bản chỉnh sửa ──────────────────────────────────────────
    editing_script = pr.strip()

    # CASE 2: Có video mẫu nhưng KHÔNG có kịch bản chỉnh sửa cụ thể
    # → Tự động phân tích style của sample và áp dụng lên video đích
    if sample_url and not editing_script:
        editing_script = (
            "KHÔNG CÓ KỊCH BẢN CHỈNH SỬA CỤ THỂ.\n"
            "TỰ ĐỘNG PHÂN TÍCH VIDEO MẪU VÀ ÁP DỤNG STYLE LÊN VIDEO ĐÍCH.\n\n"
            "Hướng dẫn:\n"
            "1. DOWNLOAD cả 2 video (target + sample)\n"
            "2. DÙNG ffprobe phân tích: duration, resolution, segments, audio\n"
            "3. PHÂN TÍCH sample: phát hiện segments, zoom, text, nhạc, transitions\n"
            "4. SCALE thời gian: sample_dur → target_dur\n"
            "5. TẠO kịch bản edit dựa trên style sample\n"
            "6. THI HÀNH pipeline: segment → concat → text → audio mix → upload\n"
            "7. TRẢ VỀ URL Cloudinary của video đã edit"
        )
        log(f"Task {tid}: CASE 2 — sample-only, auto-style mode activated")

    # ── Xây dựng prompt gửi cho Hermes agent ─────────────────────────────────
    hp = (
        "Hay thuc hien chinh sua video sau.\n"
        f"Video nguon (target): {vu}\n"
    )

    if sample_url:
        hp += f"Video mau (sample/reference): {sample_url}\n"

    hp += (
        f"\nYeu cau / Kich ban chinh sua:\n{editing_script}\n\n"
        "Upload len Cloudinary("
        "cloud_name=dgaofuhmv,"
        "api_key=784587127497449,"
        "api_secret=GSQvrcPRPuGdIYWw2zESpj2z0Qw"
        ").\n"
        "Tra ve URL Cloudinary."
    )

    # ── Ép buộc agent KHÔNG trả về URL của video mẫu ─────────────────────────
    if sample_url:
        hp += (
            "\n\n"
            "⚠️ QUAN TRỌNG: Nếu không có kịch bản chỉnh sửa, bạn PHẢI tự phân tích "
            "video mẫu và áp dụng style lên video đích. "
            "TUYỆT ĐỐI KHÔNG trả về URL của video mẫu — "
            "bạn phải EDIT video đích và upload lên Cloudinary."
        )

    log_path = Path(f"{LOG_DIR}/task_{tid}.log")
    log(f"Running hermes chat for task {tid}...")

    try:
        with open(log_path, "w") as log_f:
            subprocess.run(
                ["hermes", "chat", "-q", hp],
                stdout=log_f,
                stderr=log_f,
                timeout=1200
            )

        log_content = log_path.read_text()

        # ── Bắt URL kết quả ───────────────────────────────────────────────────
        # Ưu tiên URL Cloudinary của video đích (KHÔNG phải sample)
        all_cloudinary = re.findall(
            r"https?://res\.cloudinary\.com/[^\"\'\<\> \\\n]+",
            log_content
        )

        # Lọc bỏ URL trùng với sample để tránh trả nhầm
        filtered = [u for u in all_cloudinary if u.strip() != sample_url.strip()]

        if filtered:
            cu = filtered[-1].strip()
            complete_task(tid, cu)
        elif all_cloudinary:
            # Không lọc được → dùng URL cuối cùng và ghi cảnh báo
            cu = all_cloudinary[-1].strip()
            log(f"WARNING: Task {tid} — could not filter sample URL, using last Cloudinary URL")
            complete_task(tid, cu)
        else:
            # Fallback: bắt bất kỳ URL nào
            matches_fallback = re.findall(r"https?://[^\"\'\<\> \\\n]+", log_content)
            if matches_fallback:
                cu = matches_fallback[-1].strip()
                complete_task(tid, cu)
            else:
                fail_task(tid, "Khong tim thay URL video ket qua trong logs.")

    except subprocess.TimeoutExpired:
        log(f"Task {tid} timeout (> 20 mins)")
        fail_task(tid, "Timeout: Tien trinh xu ly qua 20 phut.")
    except Exception as e:
        log(f"Task {tid} error: {e}")
        fail_task(tid, f"Loi thuc thi: {str(e)}")

def start_pool():
    log(f"Starting {MAX_WORKERS} workers...")
    subprocess.run("tmux kill-server 2>/dev/null; tmux start-server", shell=True)
    for i in range(MAX_WORKERS):
        sname = f"hermes-worker-{i}"
        script_path = f"/tmp/hermes_w{i}.sh"
        script = f'''#!/bin/bash
log() {{ echo "[$(date '+%H:%M:%S')] W{i}: $1" >> {LOG_DIR}/worker_{i}.log; }}
log "Ready"
while true; do
  f=$(ls {QUEUE_DIR}/pending_*.json 2>/dev/null | sort | head -1)
  [ -z "$f" ] && sleep 2 && continue
  tid=$(basename "$f" | sed 's/pending_//;s/\\.json//')
  log "Task $tid"
  mv "$f" {QUEUE_DIR}/running_$tid.json 2>/dev/null || continue

  # Chạy tác vụ trực tiếp bằng Python để loại bỏ các lỗi escape của Shell
  python3 /root/.hermes/scripts/worker_pool.py run_task $tid
done'''
        Path(script_path).write_text(script)
        os.chmod(script_path, 0o755)
        subprocess.run(
            f"tmux new-session -d -s {sname} -x 120 -y 40 'bash {script_path}'",
            shell=True
        )
        log(f"  Worker {i} started")
    log("Pool ready!")

def stop_pool():
    for i in range(MAX_WORKERS):
        subprocess.run(f"tmux kill-session -t hermes-worker-{i} 2>/dev/null", shell=True)
    subprocess.run("tmux kill-server 2>/dev/null", shell=True)
    log("Stopped")

def pool_status():
    r = subprocess.run("tmux list-sessions 2>/dev/null", shell=True, capture_output=True, text=True)
    print(f"Workers: {r.stdout.strip() or 'None'}")
    for s in ["pending", "running", "done", "failed"]:
        c = len(list(Path(QUEUE_DIR).glob(f"{s}_*.json")))
        print(f"  {s}: {c}")
    for f in sorted(Path(QUEUE_DIR).glob("done_*.json"), reverse=True)[:3]:
        t = json.loads(f.read_text())
        print(f"  -> {t.get('result_url', '')}")

def run_api(port=8643):
    from http.server import HTTPServer, BaseHTTPRequestHandler

    class H(BaseHTTPRequestHandler):
        def _json(self, data, code=200):
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps(data).encode("utf-8"))

        def do_GET(self):
            if self.path == "/health":
                r = subprocess.run(
                    "tmux list-sessions 2>/dev/null",
                    shell=True, capture_output=True, text=True
                )
                workers_count = len(re.findall(r"hermes-worker-\d+", r.stdout))
                self._json({"status": "ok", "workers": workers_count})
            else:
                self._json({"error": "not found"}, 404)

        def do_POST(self):
            try:
                content_length = int(self.headers.get('Content-Length', 0))
                body_data = self.rfile.read(content_length)
                b = json.loads(body_data.decode('utf-8')) if content_length > 0 else {}
            except Exception as e:
                self._json({"error": f"Invalid JSON: {str(e)}"}, 400)
                return

            if self.path == "/submit":
                if "video_url" not in b or "prompt" not in b:
                    self._json({"error": "Missing video_url or prompt"}, 400)
                    return
                tid = submit_task(
                    b["video_url"],
                    b["prompt"],
                    b.get("user_id", "anon"),
                    b.get("webhook_url", ""),
                    b.get("sample_url", b.get("reference_video_url", ""))  # hỗ trợ cả 2 tên field
                )
                self._json({"task_id": tid, "status": "queued"})

            elif self.path == "/status":
                if "task_id" not in b:
                    self._json({"error": "Missing task_id"}, 400)
                    return
                task = get_task(b["task_id"])
                if task:
                    self._json(task)
                else:
                    self._json({"error": "not found"}, 404)

            elif self.path == "/test_webhook":
                call_webhook(b.get("webhook_url", ""), {
                    "task_id": "test",
                    "status": "test",
                    "message": "Webhook test from Hermes Worker Pool"
                })
                self._json({"status": "test_sent"})

            else:
                self._json({"error": "not found"}, 404)

    server = HTTPServer(("0.0.0.0", port), H)
    log(f"API listening on :{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log("API server stopping...")
        server.server_close()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Commands: start|stop|restart|status|api|run_task|complete|fail")
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "start":
        start_pool()
    elif cmd == "stop":
        stop_pool()
    elif cmd == "restart":
        stop_pool()
        time.sleep(1)
        start_pool()
    elif cmd == "status":
        pool_status()
    elif cmd == "api":
        run_api(int(sys.argv[2]) if len(sys.argv) > 2 else 8643)
    elif cmd == "run_task":
        run_task(sys.argv[2])
    elif cmd == "complete":
        complete_task(sys.argv[2], sys.argv[3])
    elif cmd == "fail":
        fail_task(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "")
    else:
        print("Commands: start|stop|restart|status|api|run_task|complete|fail")
