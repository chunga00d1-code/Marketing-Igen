import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { exec, spawn as spawnProc } from "child_process";
import { cloudinaryService } from "../cloudinary.service";

export interface FFmpegRenderOptions {
  aspectRatio: string;
  resolution: string;
  targetWidth: number;
  targetHeight: number;
}

/**
 * FFmpeg fallback renderer.
 * Trả về URL video đã render (Cloudinary, Cloudinary transform, hoặc URL gốc nếu không có FFmpeg).
 */
export async function runFFmpegFallback(
  recordId: string,
  videoUrl: string,
  blueprint: any,
  options: FFmpegRenderOptions,
  updateLogs: (progress: number, msg?: string) => Promise<void>
): Promise<string> {
  const { targetWidth, targetHeight } = options;
  const timeline = blueprint?.timeline || [];
  const videoClips = timeline.filter((item: any) => item.type === "video");
  const textElements = timeline.filter((item: any) => item.type === "text");
  const imageElements = timeline.filter((item: any) => item.type === "image");
  const audioElements = timeline.filter((item: any) => item.type === "audio");

  let finalVideoUrl = videoUrl; // default: return original video if all fails

  await updateLogs(40, "[Render Engine Fallback] Đang kiểm tra môi trường FFMPEG...");

  const hasFfmpeg = await new Promise<boolean>((resolve) => {
    exec("ffmpeg -version", (error) => resolve(!error));
  });

  await updateLogs(45, `[Render Engine Fallback] FFMPEG: ${hasFfmpeg ? "Đã cài đặt" : "Chưa cài đặt"}`);

  if (hasFfmpeg) {
    const cacheDir = path.join(process.cwd(), "server/cache/videos");
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

    // Collect unique source video URLs
    let uniqueVideoUrls: string[] = Array.from(
      new Set(videoClips.map((clip: any) => clip.src).filter(Boolean))
    ) as string[];
    if (uniqueVideoUrls.length === 0) {
      uniqueVideoUrls = videoUrl.split(/,\s*(?=https?:\/\/)/).map((u: string) => u.trim()).filter(Boolean);
    }

    const videoTempPaths: string[] = [];
    const urlToInputIdx: { [url: string]: number } = {};

    for (let i = 0; i < uniqueVideoUrls.length; i++) {
      const url = uniqueVideoUrls[i];
      const tempInput = path.join(os.tmpdir(), `input_${recordId}_${i}.mp4`);
      const urlParts = url.split("/");
      const filename = urlParts[urlParts.length - 1];
      const localCachePath = path.join(cacheDir, filename);

      console.log(`[FFMPEG Fallback] Xử lý video nguồn ${i + 1}/${uniqueVideoUrls.length}: ${url}`);

      if (filename && filename.match(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/) && fs.existsSync(localCachePath)) {
        await updateLogs(50, `[Render Engine Cache] Video nguồn ${i + 1} tìm thấy trong cache. Sao chép...`);
        fs.copyFileSync(localCachePath, tempInput);
      } else {
        await updateLogs(50, `[Render Engine Fallback] Đang tải video gốc ${i + 1}/${uniqueVideoUrls.length}...`);
        let response: Response;
        try {
          response = await fetch(url);
        } catch (fetchErr: any) {
          const is403 = fetchErr?.message?.includes("403");
          const isExpired = url.includes("Expires=") || url.includes("Signature=");
          if (is403 && isExpired) {
            throw new Error(`URL video nguồn đã hết hạn (403 Forbidden). Vui lòng tạo lại video hoặc upload lên Cloudinary trước khi render.`);
          }
          throw fetchErr;
        }
        if (!response.ok) {
          const errBody = await response.text().catch(() => "(không đọc được body)");
          throw new Error(`Tải video gốc ${i + 1} thất bại: HTTP ${response.status} - ${errBody.slice(0, 200)}`);
        }
        const buffer = Buffer.from(await response.arrayBuffer());
        fs.writeFileSync(tempInput, buffer);
        console.log(`[FFMPEG Fallback] ✅ Video ${i + 1} → ${tempInput} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);
      }
      videoTempPaths.push(tempInput);
      urlToInputIdx[url] = i;
    }

    // Detect audio streams
    await updateLogs(55, "[Render Engine Fallback] Đang phát hiện luồng âm thanh...");
    const hasAudioMap: { [idx: number]: boolean } = {};
    for (let i = 0; i < videoTempPaths.length; i++) {
      hasAudioMap[i] = await new Promise<boolean>((resolve) => {
        exec(`ffmpeg -i "${videoTempPaths[i]}"`, (_error, stdout, stderr) => {
          resolve((stderr || stdout || "").includes("Audio:"));
        });
      });
    }
    await updateLogs(60, `[Render Engine Fallback] Âm thanh: ${videoTempPaths.map((_, i) => `Video ${i + 1}: ${hasAudioMap[i] ? "Có" : "Không"}`).join(", ")}`);
    await updateLogs(65, "[Render Engine Fallback] Đang xử lý các tài nguyên overlay...");

    // Download image overlays
    const imageTempPaths: string[] = [];
    for (let i = 0; i < imageElements.length; i++) {
      const img = imageElements[i];
      const tempImgPath = path.join(os.tmpdir(), `overlay_img_${recordId}_${i}${path.extname(img.src || ".png")}`);
      try {
        const imgRes = await fetch(img.src);
        if (imgRes.ok) {
          const buf = Buffer.from(await imgRes.arrayBuffer());
          fs.writeFileSync(tempImgPath, buf);
          imageTempPaths.push(tempImgPath);
        } else {
          imageTempPaths.push("");
        }
      } catch {
        imageTempPaths.push("");
      }
    }

    // Download audio overlays
    const audioTempPaths: string[] = [];
    for (let i = 0; i < audioElements.length; i++) {
      const aud = audioElements[i];
      const tempAudPath = path.join(os.tmpdir(), `overlay_aud_${recordId}_${i}${path.extname(aud.src || ".mp3")}`);
      try {
        const audRes = await fetch(aud.src);
        if (audRes.ok) {
          const buf = Buffer.from(await audRes.arrayBuffer());
          fs.writeFileSync(tempAudPath, buf);
          audioTempPaths.push(tempAudPath);
        } else {
          audioTempPaths.push("");
        }
      } catch {
        audioTempPaths.push("");
      }
    }

    // Build FFMPEG filter graph
    let filterComplex = "";
    let inputArgs: string[] = [];
    let currentInputIdx = videoTempPaths.length;

    const imageInputMappings: { [key: number]: number } = {};
    const audioInputMappings: { [key: number]: number } = {};

    imageElements.forEach((_img: any, idx: number) => {
      const localPath = imageTempPaths[idx];
      if (localPath) {
        inputArgs.push(`-i "${localPath}"`);
        imageInputMappings[idx] = currentInputIdx++;
      }
    });

    audioElements.forEach((_aud: any, idx: number) => {
      const localPath = audioTempPaths[idx];
      if (localPath) {
        inputArgs.push(`-i "${localPath}"`);
        audioInputMappings[idx] = currentInputIdx++;
      }
    });

    const inputClipCounts: { [inputIdx: number]: number } = {};
    const inputSplitCounters: { [inputIdx: number]: number } = {};
    videoClips.forEach((clip: any) => {
      const inputIdx = urlToInputIdx[clip.src] ?? 0;
      inputClipCounts[inputIdx] = (inputClipCounts[inputIdx] || 0) + 1;
    });
    Object.keys(inputClipCounts).forEach((idxStr) => {
      const inputIdx = parseInt(idxStr);
      const count = inputClipCounts[inputIdx];
      inputSplitCounters[inputIdx] = 0;
      if (count > 1) {
        const splitOutputs = Array.from({ length: count }, (_, i) => `[vsplit_${inputIdx}_${i}]`).join("");
        filterComplex += `[${inputIdx}:v]split=${count}${splitOutputs};`;
      }
    });

    const inputAudioSplitCounters: { [inputIdx: number]: number } = {};
    Object.keys(inputClipCounts).forEach((idxStr) => {
      const inputIdx = parseInt(idxStr);
      const count = inputClipCounts[inputIdx];
      inputAudioSplitCounters[inputIdx] = 0;
      if (count > 1 && hasAudioMap[inputIdx]) {
        const splitOutputs = Array.from({ length: count }, (_, i) => `[asplit_${inputIdx}_${i}]`).join("");
        filterComplex += `[${inputIdx}:a]asplit=${count}${splitOutputs};`;
      }
    });

    const silenceInputIdxMap: { [clipIdx: number]: number } = {};
    let silenceCount = 0;
    let concatInputs = "";

    videoClips.forEach((clip: any, idx: number) => {
      const start = clip.start ?? 0;
      const end = clip.end ?? 5;
      const rate = clip.playbackRate ?? 1;
      const clipDuration = (end - start) / rate;
      const inputIdx = urlToInputIdx[clip.src] ?? 0;
      const hasAudio = hasAudioMap[inputIdx] ?? false;
      const usesSplit = inputClipCounts[inputIdx] > 1;

      let vSrcLabel: string;
      if (usesSplit) {
        const splitI = inputSplitCounters[inputIdx];
        vSrcLabel = `[vsplit_${inputIdx}_${splitI}]`;
        inputSplitCounters[inputIdx] = splitI + 1;
      } else {
        vSrcLabel = `[${inputIdx}:v]`;
      }

      let vFilter = `${vSrcLabel}trim=start=${start}:end=${end},setpts=PTS-STARTPTS`;
      if (clip.filters?.grayscale !== undefined && clip.filters.grayscale > 0) vFilter += `,hue=s=${1 - clip.filters.grayscale}`;
      if (clip.filters?.brightness !== undefined && clip.filters.brightness !== 1) vFilter += `,eq=brightness=${clip.filters.brightness - 1}`;
      if (clip.effects?.rotate !== undefined && clip.effects.rotate !== 0) vFilter += `,rotate=${(clip.effects.rotate * Math.PI) / 180}`;
      if (clip.effects?.transition === "fade") {
        const fadeDur = Math.min(0.5, clipDuration / 2);
        vFilter += `,fade=in:st=0:d=${fadeDur},fade=out:st=${clipDuration - fadeDur}:d=${fadeDur}`;
      }
      if (rate !== 1) vFilter += `,setpts=${1 / rate}*(PTS-STARTPTS)`;
      vFilter += `,scale=w='min(${targetWidth},iw*${targetHeight}/ih)':h='min(${targetHeight},ih*${targetWidth}/iw)',pad=w=${targetWidth}:h=${targetHeight}:x='(${targetWidth}-iw)/2':y='(${targetHeight}-ih)/2':color=black,setsar=1,fps=fps=30`;
      vFilter += `[v_proc_${idx}];`;
      filterComplex += vFilter;
      concatInputs += `[v_proc_${idx}]`;

      if (hasAudio) {
        const usesSplitA = inputClipCounts[inputIdx] > 1;
        let aSrcLabel: string;
        if (usesSplitA) {
          const splitAi = inputAudioSplitCounters[inputIdx];
          aSrcLabel = `[asplit_${inputIdx}_${splitAi}]`;
          inputAudioSplitCounters[inputIdx] = splitAi + 1;
        } else {
          aSrcLabel = `[${inputIdx}:a]`;
        }
        let aFilter = `${aSrcLabel}atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS`;
        if (rate !== 1) aFilter += `,atempo=${Math.max(0.5, Math.min(2.0, rate))}`;
        aFilter += `[a_proc_${idx}];`;
        filterComplex += aFilter;
        concatInputs += `[a_proc_${idx}]`;
      } else {
        silenceInputIdxMap[idx] = currentInputIdx + silenceCount;
        silenceCount++;
        concatInputs += `[a_proc_${idx}]`;
      }
    });

    const silenceInputArgs: string[] = [];
    videoClips.forEach((clip: any, idx: number) => {
      const inputIdx = urlToInputIdx[clip.src] ?? 0;
      if (!hasAudioMap[inputIdx]) {
        const start = clip.start ?? 0;
        const end = clip.end ?? 5;
        const rate = clip.playbackRate ?? 1;
        const clipDuration = (end - start) / rate;
        const silenceInputIdx = silenceInputIdxMap[idx];
        silenceInputArgs.push(`-f lavfi -i anullsrc=sample_rate=44100:channel_layout=stereo`);
        filterComplex = filterComplex + `[${silenceInputIdx}:a]atrim=duration=${clipDuration}[a_proc_${idx}];`;
      }
    });

    if (silenceInputArgs.length > 0) {
      inputArgs = [...silenceInputArgs, ...inputArgs];
      const remappedImageMappings: { [k: number]: number } = {};
      const remappedAudioMappings: { [k: number]: number } = {};
      Object.keys(imageInputMappings).forEach((k) => {
        const ki = parseInt(k);
        remappedImageMappings[ki] = imageInputMappings[ki] + silenceCount;
      });
      Object.keys(audioInputMappings).forEach((k) => {
        const ki = parseInt(k);
        remappedAudioMappings[ki] = audioInputMappings[ki] + silenceCount;
      });
      Object.keys(imageInputMappings).forEach((k) => {
        const ki = parseInt(k);
        filterComplex = filterComplex.replaceAll(`[${imageInputMappings[ki]}:v]`, `[${remappedImageMappings[ki]}:v]`);
      });
      Object.keys(audioInputMappings).forEach((k) => {
        const ki = parseInt(k);
        filterComplex = filterComplex.replaceAll(`[${audioInputMappings[ki]}:a]`, `[${remappedAudioMappings[ki]}:a]`);
      });
      Object.assign(imageInputMappings, remappedImageMappings);
      Object.assign(audioInputMappings, remappedAudioMappings);
    }

    filterComplex += `${concatInputs}concat=n=${videoClips.length}:v=1:a=1[concatv][concata];`;
    let currentVideoOut = "[concatv]";
    const isWin = os.platform() === "win32";
    const fontfileArg = isWin ? "fontfile='C\\:/Windows/Fonts/arial.ttf':" : "";

    // Convert any CSS color to FFmpeg RRGGBBAA hex string
    function cssToFfmpegColor(color: string, opacityOverride?: number): string {
      const alpha = opacityOverride !== undefined
        ? Math.round(opacityOverride * 255).toString(16).padStart(2, "0")
        : "ff";
      if (!color) return "ffffff" + alpha;
      // #RGB or #RRGGBB
      if (color.startsWith("#")) return color.replace("#", "").padEnd(6, "0").slice(0, 6) + alpha;
      // rgba(r,g,b,a)
      const rgbaMatch = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
      if (rgbaMatch) {
        const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0");
        const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0");
        const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0");
        const a = rgbaMatch[4] !== undefined
          ? Math.round(parseFloat(rgbaMatch[4]) * 255).toString(16).padStart(2, "0")
          : alpha;
        return r + g + b + a;
      }
      // Named colors FFmpeg understands — pass through directly (no 0x prefix needed)
      const namedColors: Record<string, string> = {
        white: "ffffff" + alpha, black: "000000" + alpha, red: "ff0000" + alpha,
        green: "00ff00" + alpha, blue: "0000ff" + alpha, yellow: "ffff00" + alpha,
      };
      return namedColors[color.toLowerCase()] || "ffffff" + alpha;
    }

    // Strip emoji and non-BMP characters FFmpeg drawtext can't render
    function stripEmoji(text: string): string {
      return text
        .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")   // emoji block
        .replace(/[\u{2600}-\u{27BF}]/gu, "")       // misc symbols
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, "")     // emoticons
        .replace(/\s{2,}/g, " ")
        .trim();
    }

    textElements.forEach((textItem: any, idx: number) => {
      const start = textItem.start ?? 0;
      const end = textItem.end ?? 5;
      const rawContent = stripEmoji(textItem.content || "");
      const content = rawContent.replace(/'/g, "'\\\\''").replace(/:/g, "\\:");
      const style = textItem.style || {};
      const color = style.color || "white";
      const opacity = style.opacity !== undefined ? style.opacity : undefined;
      const fontcolorArg = cssToFfmpegColor(color, opacity);
      let fontSizeNum = 32;
      if (style.fontSize) {
        const matched = String(style.fontSize).match(/(\d+)/);
        if (matched) fontSizeNum = parseInt(matched[1]);
      }
      let x = "(w-text_w)/2";
      let y = "h-text_h-80";
      if (style.position?.startsWith("top-")) y = "40";
      else if (style.position === "center") y = "(h-text_h)/2";
      if (style.position?.endsWith("-left")) x = "40";
      else if (style.position?.endsWith("-right")) x = "w-text_w-40";
      else if (style.position?.endsWith("-center") || style.position === "center") x = "(w-text_w)/2";

      // FFmpeg drawtext: fontcolor supports RRGGBBAA hex for opacity
      const shadowArg = style.background === "none" ? ":shadowcolor=black@0.8:shadowx=2:shadowy=2" : ":box=1:boxcolor=black@0.6:boxborderw=8";
      const nextVideoOut = `[textv_${idx}]`;
      filterComplex += `${currentVideoOut}drawtext=${fontfileArg}text='${content}':x=${x}:y=${y}:fontsize=${fontSizeNum}:fontcolor=0x${fontcolorArg}${shadowArg}:enable='between(t,${start},${end})'${nextVideoOut};`;
      currentVideoOut = nextVideoOut;
    });

    imageElements.forEach((imgItem: any, idx: number) => {
      const start = imgItem.start ?? 0;
      const end = imgItem.end ?? 5;
      const style = imgItem.style || {};
      const mappedInputIdx = imageInputMappings[idx];
      if (mappedInputIdx === undefined) return;
      let x = "w-overlay_w-20";
      let y = "20";
      if (style.position === "top-left") { x = "20"; y = "20"; }
      else if (style.position === "bottom-left") { x = "20"; y = "h-overlay_h-20"; }
      else if (style.position === "bottom-right") { x = "w-overlay_w-20"; y = "h-overlay_h-20"; }
      const nextVideoOut = `[imgv_${idx}]`;
      filterComplex += `${currentVideoOut}[${mappedInputIdx}:v]overlay=x=${x}:y=${y}:enable='between(t,${start},${end})'${nextVideoOut};`;
      currentVideoOut = nextVideoOut;
    });

    filterComplex = filterComplex.replace(/;$/, "");

    let currentAudioOut = "[concata]";
    const activeAudioOverlays = audioElements.filter((_: any, idx: number) => audioInputMappings[idx] !== undefined);
    if (activeAudioOverlays.length > 0) {
      let mixInputs = "[concata]";
      let audioMixFilter = "";
      audioElements.forEach((aud: any, idx: number) => {
        const mappedInputIdx = audioInputMappings[idx];
        if (mappedInputIdx === undefined) return;
        const start = aud.start ?? 0;
        const volume = aud.volume ?? 1;
        audioMixFilter += `[${mappedInputIdx}:a]adelay=${Math.round(start * 1000)}|${Math.round(start * 1000)},volume=${volume}[aud_delay_${idx}];`;
        mixInputs += `[aud_delay_${idx}]`;
      });
      audioMixFilter += `${mixInputs}amix=inputs=${activeAudioOverlays.length + 1}:duration=first[outa]`;
      filterComplex += `;${audioMixFilter}`;
      currentAudioOut = "[outa]";
    }

    const videoInputsStr = videoTempPaths.map((p) => `-i "${p}"`).join(" ");
    const inputsStr = `${videoInputsStr} ` + inputArgs.join(" ");
    const tempOutput = path.join(os.tmpdir(), `output_${recordId}.mp4`);

    // Tính tổng thời lượng video để báo progress chính xác
    const totalDuration = videoClips.reduce((sum: number, clip: any) => {
      return sum + ((clip.end ?? 5) - (clip.start ?? 0)) / (clip.playbackRate ?? 1);
    }, 0);

    // Preset fast để encode nhanh hơn mà không mất chất lượng đáng kể
    const ffmpegCmd = `ffmpeg -y ${inputsStr} -filter_complex "${filterComplex}" -map "${currentVideoOut}" -map "${currentAudioOut}" -c:v libx264 -preset fast -c:a aac -b:a 192k -pix_fmt yuv420p -r 30 -vsync cfr "${tempOutput}"`;

    await updateLogs(70, "[Render Engine Fallback] Đang thực thi lệnh FFMPEG...");

    await new Promise<void>((resolve, reject) => {
      // Dùng spawn thay exec để đọc stderr real-time và báo progress
      const args = ffmpegCmd.split(" ").slice(1);
      const child = spawnProc("ffmpeg", args, { shell: true });
      let stderrBuf = "";
      let lastProgressUpdate = Date.now();

      child.stderr.on("data", (chunk: Buffer) => {
        const line = chunk.toString();
        stderrBuf += line;

        // Parse time= từ FFmpeg progress output
        const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
        if (timeMatch && totalDuration > 0) {
          const now = Date.now();
          if (now - lastProgressUpdate < 2000) return; // throttle to once per 2s
          lastProgressUpdate = now;
          const currentSec =
            parseInt(timeMatch[1]) * 3600 +
            parseInt(timeMatch[2]) * 60 +
            parseInt(timeMatch[3]) +
            parseInt(timeMatch[4]) / 100;
          const pct = Math.min(0.98, currentSec / totalDuration);
          const reportProgress = Math.round(70 + pct * 12); // 70-82%
          void updateLogs(reportProgress, `[FFmpeg] ${currentSec.toFixed(1)}s / ${totalDuration.toFixed(1)}s đã xử lý...`);
        }
      });

      child.on("close", (code) => {
        if (code !== 0) {
          console.error("FFMPEG execution failed:", stderrBuf.slice(-1000));
          reject(new Error(`FFMPEG render failed (exit ${code}): ${stderrBuf.slice(-300)}`));
        } else {
          resolve();
        }
      });

      child.on("error", (err) => {
        reject(new Error(`FFMPEG spawn error: ${err.message}`));
      });
    });

    await updateLogs(85, "[Render Engine Fallback] Đang tải video thành phẩm lên Cloudinary...");
    const outputBuffer = fs.readFileSync(tempOutput);
    finalVideoUrl = await cloudinaryService.uploadMediaBuffer(outputBuffer, "igen_erp/marketing/video");

    // Cache rendered output locally
    try {
      const outUrlParts = finalVideoUrl.split("/");
      const outFilename = outUrlParts[outUrlParts.length - 1];
      if (outFilename && outFilename.match(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/)) {
        fs.copyFileSync(tempOutput, path.join(cacheDir, outFilename));
      }
    } catch {}

    // Cleanup temp files
    try {
      videoTempPaths.forEach((p) => { if (p) fs.unlinkSync(p); });
      fs.unlinkSync(tempOutput);
      imageTempPaths.forEach((p) => { if (p) fs.unlinkSync(p); });
      audioTempPaths.forEach((p) => { if (p) fs.unlinkSync(p); });
    } catch {}

  } else if (videoUrl.includes("res.cloudinary.com")) {
    // No FFmpeg: use Cloudinary URL transformation as light fallback
    await updateLogs(60, "[Render Engine Fallback] Không có FFMPEG. Dùng Cloudinary URL transform...");
    const firstUrl = videoUrl.split(/,\s*(?=https?:\/\/)/)[0];
    const parts = firstUrl.split("/upload/");
    let transformString = "";

    if (videoClips.length > 0) {
      const minStart = Math.min(...videoClips.map((item: any) => item.start ?? 0));
      const maxEnd = Math.max(...videoClips.map((item: any) => item.end ?? 5));
      transformString += `so_${minStart},eo_${maxEnd}/`;
    }
    for (const textItem of textElements) {
      const contentEscaped = encodeURIComponent(textItem.content).replace(/%/g, "%25");
      transformString += `l_text:Arial_36_bold:${contentEscaped},g_center,so_${textItem.start},eo_${textItem.end}/`;
    }
    finalVideoUrl = `${parts[0]}/upload/${transformString}${parts[1]}`;
    await updateLogs(80, `[Render Engine Fallback] Cloudinary URL transform: ${finalVideoUrl}`);

  } else {
    await updateLogs(70, "[Render Engine Fallback] Không phát hiện FFMPEG và không phải Cloudinary. Trả về video gốc.");
  }

  return finalVideoUrl;
}
