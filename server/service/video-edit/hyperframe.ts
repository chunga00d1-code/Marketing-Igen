import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { spawn } from "child_process";
import { cloudinaryService } from "../cloudinary.service";
import { normalizeMediaUrl } from "./remotion";

export function resolveLocalPathForRender(src: string): string {
  if (!src) return "";
  if (src.startsWith("http://") || src.startsWith("https://")) return src;
  const relativePath = src.startsWith("/") ? src.slice(1) : src;
  const absolutePath = path.join(process.cwd(), "public", relativePath);
  const fileUrl = `file:///${absolutePath.replace(/\\/g, "/")}`;
  console.log(`[Hyperframe] Resolving local asset: ${src} -> ${fileUrl}`);
  return fileUrl;
}

export const hyperframeService = {
  /**
   * Biên dịch JSON Blueprint sang HTML tương thích với Hyperframe CLI.
   */
  compileBlueprintToHtml(blueprint: any): string {
    const rawTimeline = blueprint?.timeline || [];
    const timeline = rawTimeline.map((item: any) =>
      item.src ? { ...item, src: normalizeMediaUrl(item.src) } : item
    );
    const aspect = blueprint?.aspectRatio || "16:9";
    const resolution = blueprint?.resolution || "720p";
    const is1080p = resolution === "1080p";

    let width = 1280;
    let height = 720;
    if (aspect === "9:16") { width = 720; height = 1280; }
    else if (aspect === "1:1") { width = 720; height = 720; }

    // Nâng lên 1080p nếu được yêu cầu
    if (is1080p) {
      if (aspect === "16:9") { width = 1920; height = 1080; }
      else if (aspect === "9:16") { width = 1080; height = 1920; }
      else if (aspect === "1:1") { width = 1080; height = 1080; }
    }

    const rawVideoClips = timeline.filter((item: any) => item.type === "video");
    const textElements = timeline.filter((item: any) => item.type === "text");
    const imageElements = timeline.filter((item: any) => item.type === "image");
    const audioElements = timeline.filter((item: any) => item.type === "audio");
    const captionElements = timeline.filter((item: any) => item.type === "caption");
    const motionGraphicElements = timeline.filter((item: any) => item.type === "motion_graphic");
    const gradientBgElements = timeline.filter((item: any) => item.type === "gradient_bg");
    const animatedSceneElements = timeline.filter((item: any) => item.type === "animated_scene");

    let currentTimelineOffset = 0;
    const videoClips = rawVideoClips.map((item: any) => {
      const start = item.start ?? 0;
      const end = item.end ?? 5;
      const rate = item.playbackRate ?? 1;
      const clipDuration = (end - start) / rate;
      const startInTimeline = currentTimelineOffset;
      currentTimelineOffset += clipDuration;
      return { ...item, startInTimeline, duration: clipDuration };
    });

    // Duration (seconds) for each transition type during the overlap period
    const TRANS_DURATIONS: Record<string, number> = {
      fade: 0.2667, "slide-left": 0.4, "slide-right": 0.4,
      "slide-up": 0.4, "slide-down": 0.4,
      "zoom-in": 0.35, "zoom-out": 0.35, flash: 0.15,
    };

    const videoClipsWithTransitions = videoClips.map((clip: any, idx: number) => {
      const hasNextClip = idx < videoClips.length - 1;
      const nextClip = hasNextClip ? videoClips[idx + 1] : null;
      const isContinuous = nextClip && nextClip.src === clip.src && Math.abs((clip.end ?? 0) - (nextClip.start ?? 0)) < 0.1;
      const exitTransType: string = clip.effects?.transition || "none";
      const hasExitTransition = hasNextClip && exitTransType !== "none" && !isContinuous;
      const baseDur = TRANS_DURATIONS[exitTransType] ?? 0.2667;
      const exitTransitionTime = hasExitTransition ? Math.min(baseDur, clip.duration / 3) : 0;
      return { ...clip, hasExitTransition, exitTransType, transTime: exitTransitionTime, renderDuration: clip.duration + exitTransitionTime, hasNextClip };
    });

    // Build entry/exit keyframe values based on transition type
    interface AnimFrame { pct: number; opacity: number; blurVal: number; zoomScale: number; tx: number; ty: number; tScale: number; }

    function entryStartFrame(type: string, blur: number, zs: number): Omit<AnimFrame, "pct"> {
      switch (type) {
        case "slide-left":  return { opacity: 1, blurVal: blur, zoomScale: zs, tx: 100,  ty: 0,    tScale: 1 };
        case "slide-right": return { opacity: 1, blurVal: blur, zoomScale: zs, tx: -100, ty: 0,    tScale: 1 };
        case "slide-up":    return { opacity: 1, blurVal: blur, zoomScale: zs, tx: 0,    ty: 100,  tScale: 1 };
        case "slide-down":  return { opacity: 1, blurVal: blur, zoomScale: zs, tx: 0,    ty: -100, tScale: 1 };
        case "zoom-in":     return { opacity: 0, blurVal: blur, zoomScale: zs, tx: 0,    ty: 0,    tScale: 1.3 };
        case "zoom-out":    return { opacity: 0, blurVal: blur, zoomScale: zs, tx: 0,    ty: 0,    tScale: 0.7 };
        case "flash":       return { opacity: 0, blurVal: blur, zoomScale: zs, tx: 0,    ty: 0,    tScale: 1 };
        default:            return { opacity: 0, blurVal: blur + 12, zoomScale: zs * 1.15, tx: 0,  ty: 0, tScale: 1 };
      }
    }

    function exitEndFrame(type: string, blur: number, zs: number): Omit<AnimFrame, "pct"> {
      switch (type) {
        case "slide-left":  return { opacity: 1, blurVal: blur, zoomScale: zs, tx: -100, ty: 0,   tScale: 1 };
        case "slide-right": return { opacity: 1, blurVal: blur, zoomScale: zs, tx: 100,  ty: 0,   tScale: 1 };
        case "slide-up":    return { opacity: 1, blurVal: blur, zoomScale: zs, tx: 0,    ty: -100, tScale: 1 };
        case "slide-down":  return { opacity: 1, blurVal: blur, zoomScale: zs, tx: 0,    ty: 100, tScale: 1 };
        case "zoom-in":     return { opacity: 0, blurVal: blur, zoomScale: zs, tx: 0,    ty: 0,   tScale: 1.3 };
        case "zoom-out":    return { opacity: 0, blurVal: blur, zoomScale: zs, tx: 0,    ty: 0,   tScale: 0.7 };
        case "flash":       return { opacity: 0, blurVal: blur, zoomScale: zs, tx: 0,    ty: 0,   tScale: 1 };
        default:            return { opacity: 0, blurVal: blur + 12, zoomScale: zs * 1.15, tx: 0, ty: 0, tScale: 1 };
      }
    }

    let elementsHtml = "";
    let stylesHtml = "";

    // 1. Video Elements
    videoClipsWithTransitions.forEach((clip: any, idx: number) => {
      const filters = clip.filters || {};
      const effects = clip.effects || {};
      const brightness = filters.brightness ?? 1;
      const grayscale = filters.grayscale ?? 0;
      const blur = filters.blur ?? 0;
      const sepia = filters.sepia ?? 0;
      const invert = filters.invert ?? 0;
      const contrast = filters.contrast ?? 1;
      const saturate = filters.saturate ?? 1;
      const hueRotate = filters.hueRotate ?? 0;
      const zoom = effects.zoom ?? "none";
      const rotate = effects.rotate ?? 0;
      const objectFit = effects.objectFit || "contain";

      const D_render = clip.renderDuration;
      const D_orig = clip.duration;
      const T_exit = clip.transTime;
      const exitTransType: string = clip.exitTransType || "none";
      const prevClip = idx > 0 ? videoClipsWithTransitions[idx - 1] : null;
      const T_entry = prevClip ? prevClip.transTime : 0;
      const entryTransType: string = prevClip ? (prevClip.exitTransType || "none") : "none";

      const staticFilters = `brightness(${brightness}) grayscale(${grayscale}) sepia(${sepia}) invert(${invert}) contrast(${contrast}) saturate(${saturate}) hue-rotate(${hueRotate}deg)`;

      const getZoomScale = (t: number) => {
        if (D_orig <= 0) return 1.0;
        const ratio = Math.min(1, Math.max(0, t / D_orig));
        if (zoom === "in") return 1.0 + ratio * 0.25;
        if (zoom === "out") return 1.25 - ratio * 0.25;
        return 1.0;
      };

      const normalFrame = (pct: number, t: number): AnimFrame =>
        ({ pct, opacity: 1, blurVal: blur, zoomScale: getZoomScale(t), tx: 0, ty: 0, tScale: 1 });

      const points: AnimFrame[] = [];
      if (T_entry > 0) {
        points.push({ pct: 0, ...entryStartFrame(entryTransType, blur, getZoomScale(0)) });
        points.push(normalFrame((T_entry / D_render) * 100, T_entry));
      } else {
        points.push(normalFrame(0, 0));
      }
      if (T_exit > 0) {
        points.push(normalFrame((D_orig / D_render) * 100, D_orig));
        points.push({ pct: 100, ...exitEndFrame(exitTransType, blur, getZoomScale(D_render)) });
      } else {
        points.push(normalFrame(100, D_render));
      }
      points.sort((a, b) => a.pct - b.pct);

      let keyframesText = `@keyframes anim-clip-${idx} {\n`;
      points.forEach((pt) => {
        const combinedScale = (pt.zoomScale * pt.tScale).toFixed(4);
        keyframesText += `    ${pt.pct.toFixed(2)}% { opacity: ${pt.opacity}; filter: ${staticFilters} blur(${pt.blurVal}px); transform: translateX(${pt.tx}%) translateY(${pt.ty}%) scale(${combinedScale}) rotate(${rotate}deg); }\n`;
      });
      keyframesText += `  }\n`;

      stylesHtml += `\n  ${keyframesText}  .clip-anim-${idx} { animation: anim-clip-${idx} ${D_render.toFixed(4)}s linear forwards; animation-delay: ${clip.startInTimeline.toFixed(4)}s; }\n`;

      const speed = clip.playbackRate ?? 1.0;
      const clipVolume = clip.volume ?? 1.0;

      elementsHtml += `
    <video
      src="${resolveLocalPathForRender(clip.src)}"
      data-start="${clip.startInTimeline}"
      data-duration="${clip.renderDuration}"
      data-media-start="${clip.start}"
      data-volume="${clipVolume}"
      data-track-index="${idx}"
      class="clip-anim-${idx}"
      onplay="this.playbackRate=${speed}"
      oncanplay="this.volume=${clipVolume}"
      style="width: 100%; height: 100%; object-fit: ${objectFit}; position: absolute; top: 0; left: 0;"
      playsinline
    ></video>`;
    });

    // 2. Text Elements
    textElements.forEach((textItem: any, idx: number) => {
      const style = textItem.style || {};
      const color = style.color || "white";
      const duration = (textItem.end ?? 5) - (textItem.start ?? 0);
      const fontSize = style.fontSize || "36px";
      const fontWeight = style.fontWeight || "bold";
      const fontFamily = style.fontFamily || "Arial, sans-serif";
      const letterSpacing = style.letterSpacing || "normal";
      const textTransform = style.textTransform || "none";
      const opacity = style.opacity !== undefined ? style.opacity : 1.0;
      const bgColor = style.background === "none" ? "transparent" : (style.background || "rgba(0,0,0,0.6)");
      const animation = style.animation || "none";
      const hasBg = bgColor !== "transparent";
      const textShadow = hasBg ? "none" : "2px 2px 8px rgba(0,0,0,0.9), 0 0 4px rgba(0,0,0,0.7)";
      const padding = hasBg ? "8px 18px" : "4px 8px";
      const borderRadius = hasBg ? "12px" : "0";
      const animId = `text_anim_${idx}`;
      const safeContent = String(textItem.content || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");

      let positionStyles = "";
      if (style.x !== undefined || style.y !== undefined) {
        const xVal = style.x !== undefined ? (typeof style.x === "number" ? `${style.x}px` : style.x) : "0";
        const yVal = style.y !== undefined ? (typeof style.y === "number" ? `${style.y}px` : style.y) : "auto";
        positionStyles = `left: ${xVal}; top: ${yVal}; right: auto; bottom: auto; align-items: flex-start;`;
        if (style.width) {
          positionStyles += ` width: ${typeof style.width === "number" ? `${style.width}px` : style.width};`;
        }
      } else {
        if (style.position?.startsWith("top-")) positionStyles += "top: 40px;";
        else if (style.position === "center") positionStyles += "top: 0; bottom: 0; align-items: center;";
        else positionStyles += "bottom: 80px;";

        if (style.position?.endsWith("-left")) positionStyles += "left: 40px;";
        else if (style.position?.endsWith("-right")) positionStyles += "right: 40px;";
        else positionStyles += "left: 0; right: 0; justify-content: center;";

        if (style.position === "center") positionStyles = "top: 0; bottom: 0; left: 0; right: 0; align-items: center; justify-content: center;";
      }

      // CSS keyframes — hỗ trợ thêm: slide-up, slide-down, scale-in, typewriter
      let animCss = "";
      let animStyle = "";
      const fadeDur = Math.min(0.5, duration / 3);
      if (animation === "fade-in") {
        animCss = `@keyframes ${animId} { from { opacity: 0; } to { opacity: ${opacity}; } }`;
        animStyle = `animation: ${animId} ${fadeDur}s ease-out forwards;`;
      } else if (animation === "fade-out") {
        animCss = `@keyframes ${animId} { from { opacity: ${opacity}; } to { opacity: 0; } }`;
        animStyle = `animation: ${animId} ${fadeDur}s ease-in ${Math.max(0, duration - fadeDur)}s forwards;`;
      } else if (animation === "fade-in-out") {
        animCss = `@keyframes ${animId} { 0% { opacity: 0; } ${Math.round(fadeDur / duration * 100)}% { opacity: ${opacity}; } ${Math.round((1 - fadeDur / duration) * 100)}% { opacity: ${opacity}; } 100% { opacity: 0; } }`;
        animStyle = `animation: ${animId} ${duration}s linear forwards;`;
      } else if (animation === "slide-up") {
        const slideDur = Math.min(0.5, duration / 3);
        animCss = `@keyframes ${animId} { from { opacity: 0; transform: translateY(30px); } to { opacity: ${opacity}; transform: translateY(0); } }`;
        animStyle = `animation: ${animId} ${slideDur}s cubic-bezier(0.25,0.46,0.45,0.94) forwards;`;
      } else if (animation === "slide-down") {
        const slideDur = Math.min(0.5, duration / 3);
        animCss = `@keyframes ${animId} { from { opacity: 0; transform: translateY(-30px); } to { opacity: ${opacity}; transform: translateY(0); } }`;
        animStyle = `animation: ${animId} ${slideDur}s cubic-bezier(0.25,0.46,0.45,0.94) forwards;`;
      } else if (animation === "scale-in") {
        const scaleDur = Math.min(0.4, duration / 3);
        animCss = `@keyframes ${animId} { from { opacity: 0; transform: scale(0.6); } to { opacity: ${opacity}; transform: scale(1); } }`;
        animStyle = `animation: ${animId} ${scaleDur}s cubic-bezier(0.34,1.56,0.64,1) forwards;`;
      } else if (animation === "typewriter") {
        animCss = `@keyframes ${animId} { from { width: 0; } to { width: 100%; } } @keyframes ${animId}_cursor { from, to { border-right-color: transparent; } 50% { border-right-color: ${color}; } }`;
        animStyle = `animation: ${animId} ${Math.min(2, duration * 0.6)}s steps(${safeContent.length || 10}, end) forwards, ${animId}_cursor 0.75s step-end infinite; overflow: hidden; white-space: nowrap; border-right: 2px solid transparent;`;
      }
      if (animCss) stylesHtml += animCss + "\n";

      const initialOpacity = ["fade-in", "fade-in-out", "slide-up", "slide-down", "scale-in"].includes(animation) ? 0 : opacity;

      elementsHtml += `
    <div data-start="${textItem.start}" data-duration="${duration}" data-track-index="10"
      style="position: absolute; display: flex; pointer-events: none; z-index: 10; ${positionStyles}">
      <span style="background-color: ${bgColor}; padding: ${padding}; border-radius: ${borderRadius}; color: ${color}; font-size: ${fontSize}; font-weight: ${fontWeight}; font-family: ${fontFamily}; letter-spacing: ${letterSpacing}; text-transform: ${textTransform}; text-shadow: ${textShadow}; text-align: center; opacity: ${initialOpacity}; ${animStyle}">
        ${safeContent}
      </span>
    </div>`;
    });

    // 3. Image Elements
    imageElements.forEach((imgItem: any, imgIdx: number) => {
      const style = imgItem.style || {};
      const duration = (imgItem.end ?? 5) - (imgItem.start ?? 0);
      const imgOpacity = style.opacity ?? 1;
      const imgWidth = style.width || 100;
      const animId = `img_anim_${imgIdx}`;
      const imgAnimation = style.animation || "none";
      let imgAnimCss = "";
      let imgAnimStyle = "";

      if (imgAnimation === "fade-in") {
        const fadeDur = Math.min(0.5, duration / 3);
        imgAnimCss = `@keyframes ${animId} { from { opacity: 0; } to { opacity: ${imgOpacity}; } }`;
        imgAnimStyle = `animation: ${animId} ${fadeDur}s ease-out forwards;`;
      } else if (imgAnimation === "slide-up") {
        const slideDur = Math.min(0.4, duration / 3);
        imgAnimCss = `@keyframes ${animId} { from { opacity: 0; transform: translateY(20px); } to { opacity: ${imgOpacity}; transform: translateY(0); } }`;
        imgAnimStyle = `animation: ${animId} ${slideDur}s ease-out forwards;`;
      }
      if (imgAnimCss) stylesHtml += imgAnimCss + "\n";

      let positionStyles = "top: 20px; right: 20px;";
      if (style.position === "top-left") positionStyles = "top: 20px; left: 20px;";
      else if (style.position === "bottom-left") positionStyles = "bottom: 20px; left: 20px;";
      else if (style.position === "bottom-right") positionStyles = "bottom: 20px; right: 20px;";
      else if (style.position === "center") positionStyles = "top: 50%; left: 50%; transform: translate(-50%,-50%);";

      elementsHtml += `
    <img src="${resolveLocalPathForRender(imgItem.src)}" data-start="${imgItem.start}" data-duration="${duration}" data-track-index="20"
      style="position: absolute; z-index: 20; width: ${imgWidth}px; opacity: ${imgOpacity}; object-fit: contain; ${positionStyles} ${imgAnimStyle}" />`;
    });

    // 4. Audio Elements
    audioElements.forEach((audioItem: any) => {
      const duration = (audioItem.end ?? 5) - (audioItem.start ?? 0);
      elementsHtml += `
    <audio src="${resolveLocalPathForRender(audioItem.src)}" data-start="${audioItem.start}" data-duration="${duration}" data-volume="${audioItem.volume ?? 0.5}" data-track-index="5"></audio>`;
    });

    // 5. Gradient Background / Overlay Elements (z-index: 3, above video, below text)
    gradientBgElements.forEach((gradItem: any) => {
      const duration = (gradItem.end ?? 5) - (gradItem.start ?? 0);
      const from = gradItem.from || "rgba(0,0,0,0.8)";
      const to = gradItem.to || "transparent";
      const direction = gradItem.direction || "to top";
      const opacity = gradItem.opacity ?? 0.7;
      elementsHtml += `
    <div data-start="${gradItem.start}" data-duration="${duration}" data-track-index="3"
      style="position:absolute; inset:0; background:linear-gradient(${direction}, ${from}, ${to}); opacity:${opacity}; z-index:3; pointer-events:none;"></div>`;
    });

    // 6. Motion Graphic Elements (z-index: 15, between text and image layers)
    motionGraphicElements.forEach((mgItem: any, mgIdx: number) => {
      const duration = (mgItem.end ?? 5) - (mgItem.start ?? 0);
      const accentColor = mgItem.accentColor || "#FFD700";
      const template = mgItem.template || "lower_third";
      const safeTitle = String(mgItem.title || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const safeSubtitle = mgItem.subtitle ? String(mgItem.subtitle).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "";
      const animId = `mg_anim_${mgIdx}`;

      stylesHtml += `@keyframes ${animId} { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  .mg-el-${mgIdx} { animation: ${animId} 0.4s cubic-bezier(0.25,0.46,0.45,0.94) forwards; }\n`;

      if (template === "lower_third") {
        elementsHtml += `
    <div data-start="${mgItem.start}" data-duration="${duration}" data-track-index="15"
      style="position:absolute; bottom:60px; left:0; right:0; display:flex; padding:0 40px; pointer-events:none; z-index:15;">
      <div class="mg-el-${mgIdx}" style="background:rgba(0,0,0,0.88); border-left:4px solid ${accentColor}; padding:12px 20px; border-radius:0 8px 8px 0; max-width:65%; backdrop-filter:blur(6px);">
        <div style="font-size:20px; font-weight:700; color:#fff; margin-bottom:${safeSubtitle ? "4px" : "0"};">${safeTitle}</div>
        ${safeSubtitle ? `<div style="font-size:13px; color:rgba(255,255,255,0.68); line-height:1.3;">${safeSubtitle}</div>` : ""}
      </div>
    </div>`;
      } else if (template === "badge") {
        const badgePos = mgItem.position || "top-right";
        const badgePosStyle = badgePos === "top-left" ? "top:20px; left:20px;" :
          badgePos === "bottom-right" ? "bottom:20px; right:20px;" :
          badgePos === "bottom-left" ? "bottom:20px; left:20px;" :
          "top:20px; right:20px;";
        elementsHtml += `
    <div data-start="${mgItem.start}" data-duration="${duration}" data-track-index="15"
      class="mg-el-${mgIdx}" style="position:absolute; ${badgePosStyle} background:${accentColor}; color:#000; padding:7px 16px; border-radius:24px; font-size:13px; font-weight:800; pointer-events:none; z-index:15; white-space:nowrap; letter-spacing:0.5px;">${safeTitle}</div>`;
      } else if (template === "title_card") {
        elementsHtml += `
    <div data-start="${mgItem.start}" data-duration="${duration}" data-track-index="15"
      style="position:absolute; bottom:0; left:0; right:0; background:linear-gradient(transparent, rgba(0,0,0,0.93)); padding:64px 40px 36px; pointer-events:none; z-index:15;">
      <div class="mg-el-${mgIdx}">
        <div style="font-size:36px; font-weight:800; color:${accentColor}; line-height:1.15; margin-bottom:${safeSubtitle ? "10px" : "0"};">${safeTitle}</div>
        ${safeSubtitle ? `<div style="font-size:16px; color:rgba(255,255,255,0.72); line-height:1.4;">${safeSubtitle}</div>` : ""}
      </div>
    </div>`;
      } else if (template === "highlight_box") {
        elementsHtml += `
    <div data-start="${mgItem.start}" data-duration="${duration}" data-track-index="15"
      style="position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; z-index:15;">
      <div class="mg-el-${mgIdx}" style="background:rgba(0,0,0,0.78); border:2px solid ${accentColor}; border-radius:16px; padding:28px 40px; text-align:center; backdrop-filter:blur(6px); max-width:70%;">
        <div style="font-size:44px; font-weight:900; color:${accentColor}; line-height:1.1; margin-bottom:${safeSubtitle ? "12px" : "0"};">${safeTitle}</div>
        ${safeSubtitle ? `<div style="font-size:16px; color:rgba(255,255,255,0.78); line-height:1.4;">${safeSubtitle}</div>` : ""}
      </div>
    </div>`;
      }
    });

    // 7. Caption Elements — auto-styled subtitles (z-index: 11, just above regular text)
    captionElements.forEach((captionItem: any) => {
      const duration = (captionItem.end ?? 3) - (captionItem.start ?? 0);
      const captionColor = captionItem.style?.color || "#FFFFFF";
      const captionFontSize = captionItem.style?.fontSize || "22px";
      const captionBg = captionItem.style?.background || "rgba(0,0,0,0.78)";
      const safeContent = String(captionItem.content || "")
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      elementsHtml += `
    <div data-start="${captionItem.start}" data-duration="${duration}" data-track-index="11"
      style="position:absolute; bottom:28px; left:0; right:0; display:flex; justify-content:center; padding:0 60px; pointer-events:none; z-index:11;">
      <span style="background:${captionBg}; color:${captionColor}; font-size:${captionFontSize}; font-weight:500; padding:7px 18px; border-radius:6px; text-align:center; line-height:1.45; max-width:82%; display:inline-block;">${safeContent}</span>
    </div>`;
    });

    // 8. Animated Scene Elements — full-screen overlays that replace video (z-index: 50)
    animatedSceneElements.forEach((scene: any, sIdx: number) => {
      const duration = (scene.end ?? 5) - (scene.start ?? 0);
      const template = scene.template || "chapter_title";
      const accentColor = scene.accentColor || "#FFD700";
      const bgGradient = scene.bgGradient || "linear-gradient(135deg, #0a0a0a 0%, #111827 100%)";
      const safe = (v: any) => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const p = `as_${sIdx}`;

      if (template === "chapter_title") {
        const label = safe(scene.label || "CHƯƠNG");
        const chapter = safe(scene.chapter || "01");
        const title = safe(scene.title || "");
        const subtitle = safe(scene.subtitle || "");
        stylesHtml += `
  @keyframes ${p}_lbl { from { opacity:0; transform:translateY(-12px); } to { opacity:0.7; transform:translateY(0); } }
  @keyframes ${p}_ttl { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
  @keyframes ${p}_sub { from { opacity:0; } to { opacity:1; } }
  @keyframes ${p}_ln  { from { width:0; } to { width:72px; } }
  .${p}_lbl { animation: ${p}_lbl 0.4s ease-out forwards; }
  .${p}_ttl { animation: ${p}_ttl 0.55s cubic-bezier(0.25,0.46,0.45,0.94) 0.18s both; }
  .${p}_sub { animation: ${p}_sub 0.4s ease-out 0.38s both; }
  .${p}_ln  { animation: ${p}_ln  0.4s ease-out 0.35s both; display:block; height:3px; background:${accentColor}; margin-top:20px; }\n`;
        elementsHtml += `
    <div data-start="${scene.start}" data-duration="${duration}" data-track-index="50"
      style="position:absolute; inset:0; background:${bgGradient}; z-index:50; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden;">
      <div style="position:absolute; top:0; left:0; right:0; height:3px; background:${accentColor};"></div>
      <div class="${p}_lbl" style="font-size:11px; letter-spacing:5px; color:${accentColor}; font-family:monospace; text-transform:uppercase; margin-bottom:14px;">${label} ${chapter}</div>
      <div class="${p}_ttl" style="font-size:62px; font-weight:900; color:#fff; text-align:center; line-height:1.1; max-width:80%;">${title}</div>
      ${subtitle ? `<div class="${p}_sub" style="font-size:17px; color:rgba(255,255,255,0.58); margin-top:14px; text-align:center;">${subtitle}</div>` : ""}
      <span class="${p}_ln"></span>
    </div>`;

      } else if (template === "stat_reveal") {
        const value = safe(scene.value || "0");
        const label = safe(scene.label || "");
        const sublabel = safe(scene.sublabel || "");
        stylesHtml += `
  @keyframes ${p}_val  { from { opacity:0; transform:scale(0.45); } to { opacity:1; transform:scale(1); } }
  @keyframes ${p}_lbl  { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  @keyframes ${p}_glow { from { opacity:0; transform:scale(0.6); } to { opacity:0.15; transform:scale(1); } }
  .${p}_val  { animation: ${p}_val  0.55s cubic-bezier(0.34,1.56,0.64,1) forwards; }
  .${p}_lbl  { animation: ${p}_lbl  0.4s ease-out 0.32s both; }
  .${p}_glow { animation: ${p}_glow 0.6s ease-out 0.1s both; }\n`;
        elementsHtml += `
    <div data-start="${scene.start}" data-duration="${duration}" data-track-index="50"
      style="position:absolute; inset:0; background:${bgGradient}; z-index:50; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden;">
      <div class="${p}_glow" style="position:absolute; width:320px; height:320px; border-radius:50%; background:${accentColor}; filter:blur(60px);"></div>
      <div class="${p}_val" style="font-size:110px; font-weight:900; color:${accentColor}; line-height:1; position:relative;">${value}</div>
      <div class="${p}_lbl" style="font-size:18px; font-weight:700; color:#fff; letter-spacing:3px; text-transform:uppercase; margin-top:10px; position:relative;">${label}</div>
      ${sublabel ? `<div class="${p}_lbl" style="font-size:13px; color:rgba(255,255,255,0.5); letter-spacing:2px; text-transform:uppercase; margin-top:6px; position:relative; animation-delay:0.42s;">${sublabel}</div>` : ""}
    </div>`;

      } else if (template === "kinetic_text") {
        const rawWords: string[] = Array.isArray(scene.words) ? scene.words : String(scene.title || "").split(" ");
        const directions = ["translateX(-80px)", "translateX(80px)", "translateY(40px)", "translateX(-60px)", "translateX(60px)"];
        let wordCss = "";
        let wordHtml = "";
        rawWords.slice(0, 8).forEach((word: string, wi: number) => {
          const dir = directions[wi % directions.length];
          const color = wi % 3 === 1 ? accentColor : "#fff";
          const delay = (wi * 0.12).toFixed(2);
          wordCss += `@keyframes ${p}_w${wi} { from { opacity:0; transform:${dir}; } to { opacity:1; transform:none; } } .${p}_w${wi} { animation: ${p}_w${wi} 0.45s cubic-bezier(0.25,0.46,0.45,0.94) ${delay}s both; }\n  `;
          wordHtml += `<span class="${p}_w${wi}" style="display:block; font-size:54px; font-weight:900; color:${color}; line-height:1.15; text-align:center;">${safe(word)}</span>`;
        });
        stylesHtml += `  ${wordCss}\n`;
        elementsHtml += `
    <div data-start="${scene.start}" data-duration="${duration}" data-track-index="50"
      style="position:absolute; inset:0; background:${bgGradient}; z-index:50; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; padding:40px;">
      ${wordHtml}
    </div>`;

      } else if (template === "quote_card") {
        const quote = safe(scene.quote || scene.title || "");
        const author = safe(scene.author || "");
        stylesHtml += `
  @keyframes ${p}_qm   { from { opacity:0; transform:scale(0.7); } to { opacity:0.28; transform:scale(1); } }
  @keyframes ${p}_qt   { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
  @keyframes ${p}_auth { from { opacity:0; } to { opacity:1; } }
  .${p}_qm   { animation: ${p}_qm   0.5s ease-out forwards; }
  .${p}_qt   { animation: ${p}_qt   0.55s ease-out 0.2s both; }
  .${p}_auth { animation: ${p}_auth 0.4s ease-out 0.45s both; }\n`;
        elementsHtml += `
    <div data-start="${scene.start}" data-duration="${duration}" data-track-index="50"
      style="position:absolute; inset:0; background:${bgGradient}; z-index:50; display:flex; flex-direction:column; align-items:center; justify-content:center; overflow:hidden; padding:60px;">
      <div class="${p}_qm" style="font-size:140px; color:${accentColor}; line-height:0.6; margin-bottom:24px; font-family:Georgia,serif;">"</div>
      <div class="${p}_qt" style="font-size:26px; color:#fff; text-align:center; line-height:1.65; max-width:78%; font-style:italic;">${quote}</div>
      ${author ? `<div class="${p}_auth" style="margin-top:28px; font-size:13px; color:${accentColor}; letter-spacing:3px; text-transform:uppercase;">— ${author}</div>` : ""}
    </div>`;
      }
    });

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Hyperframe Render</title>
  <style>
    body { margin: 0; background-color: black; overflow: hidden; font-family: Arial, sans-serif; }
    #root { position: relative; width: ${width}px; height: ${height}px; overflow: hidden; }
    video { opacity: 0; }
    ${stylesHtml}
  </style>
</head>
<body>
  <div id="root" data-composition-id="video-edit" data-width="${width}" data-height="${height}" data-resolution="${resolution}">
    ${elementsHtml}
  </div>
</body>
</html>`;
  },

  /**
   * Kết xuất video bằng Hyperframe CLI và upload lên Cloudinary.
   */
  async renderVideo(
    blueprint: any,
    options?: { aspectRatio?: string; resolution?: string },
    onProgress?: (progress: number, logMessage?: string) => void
  ): Promise<string> {
    const renderJobId = `hyperframe_render_${Date.now()}`;
    // HyperFrames CLI requires files inside the project directory
    const tmpDir = path.join(process.cwd(), ".hyperframe-tmp");
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const tempHtmlPath = path.join(tmpDir, `hyperframe_comp_${Date.now()}.html`);
    const outputPath = path.join(tmpDir, `hyperframe_out_${Date.now()}.mp4`);
    const resolution = options?.resolution || "720p";

    console.log(`\n${"=".repeat(60)}`);
    console.log(`[Hyperframe] ▶ BẤT ĐẦU RENDER | Job: ${renderJobId}`);
    console.log(`[Hyperframe] OutputPath: ${outputPath} | Resolution: ${resolution}`);

    // Preflight / pre-warm CDN cache
    const timeline = blueprint?.timeline || [];
    const normalizedTimeline = timeline.map((item: any) =>
      item.src ? { ...item, src: normalizeMediaUrl(item.src) } : item
    );
    const normalizedBlueprint = {
      ...blueprint,
      timeline: normalizedTimeline,
      resolution,                              // truyền resolution vào blueprint cho compileBlueprintToHtml
    };

    const allMediaUrls = normalizedTimeline
      .filter((t: any) => t.src)
      .map((t: any) => t.src)
      .filter(Boolean);

    for (const mediaUrl of allMediaUrls) {
      if (!mediaUrl.startsWith("http") || mediaUrl.includes("localhost") || mediaUrl.includes("127.0.0.1")) continue;
      try {
        const startPrewarm = Date.now();
        const res = await fetch(mediaUrl, { method: "GET", signal: AbortSignal.timeout(90000) });
        if (!res.ok) {
          console.error(`  [❌ HTTP ${res.status}] ${mediaUrl}`);
        } else {
          const buffer = await res.arrayBuffer();
          console.log(`  [✅ READY] ${mediaUrl} | ${(buffer.byteLength / 1024 / 1024).toFixed(2)} MB | ${Date.now() - startPrewarm}ms`);
        }
      } catch (fetchErr: any) {
        console.error(`  [❌ FETCH_ERROR] ${mediaUrl} → ${fetchErr.message}`);
      }
    }

    if (onProgress) onProgress(45, "[Hyperframe Engine] Đang biên dịch Blueprint sang HTML...");
    const htmlContent = this.compileBlueprintToHtml(normalizedBlueprint);
    fs.writeFileSync(tempHtmlPath, htmlContent);

    if (onProgress) onProgress(55, "[Hyperframe Engine] Khởi chạy Hyperframe CLI...");

    const aspect = options?.aspectRatio || "16:9";
    let resolutionPreset = "landscape";
    if (aspect === "9:16") resolutionPreset = "portrait";
    else if (aspect === "1:1") resolutionPreset = "square";

    return new Promise<string>((resolve, reject) => {
      // Quote paths to handle spaces on Windows (shell:true concats args without escaping)
      const cmd = `npx hyperframes render -c "${tempHtmlPath}" -o "${outputPath}" --resolution ${resolutionPreset} --strict`;
      console.log(`[Hyperframe] Executing: ${cmd}`);

      const child = spawn(cmd, [], { shell: true });
      let stderrAccumulator = "";

      child.stdout.on("data", (data) => {
        const line = data.toString().trim();
        console.log(`[Hyperframe CLI Out] ${line}`);
        if ((line.includes("Rendered") || line.includes("Rendering")) && onProgress) {
          onProgress(70, `[Hyperframe CLI] ${line}`);
        }
      });

      child.stderr.on("data", (data) => {
        const line = data.toString().trim();
        stderrAccumulator += line + "\n";
        console.warn(`[Hyperframe CLI Err] ${line}`);
      });

      child.on("close", async (code) => {
        console.log(`[Hyperframe] CLI exited with code ${code}`);
        try { fs.unlinkSync(tempHtmlPath); } catch {}

        if (code !== 0) {
          reject(new Error(`Hyperframe render failed with code ${code}. Details: ${stderrAccumulator}`));
          return;
        }
        if (!fs.existsSync(outputPath)) {
          reject(new Error("Hyperframe render completed but output file not found."));
          return;
        }

        if (onProgress) onProgress(85, "[Hyperframe Engine] Đang tải lên Cloudinary...");
        try {
          const outputBuffer = fs.readFileSync(outputPath);
          const secureUrl = await cloudinaryService.uploadMediaBuffer(outputBuffer, "igen_erp/marketing/video");
          console.log(`[Hyperframe] Upload Cloudinary thành công -> ${secureUrl}`);
          try { fs.unlinkSync(outputPath); } catch {}
          resolve(secureUrl);
        } catch (uploadErr: any) {
          reject(new Error(`Failed to upload rendered video: ${uploadErr.message}`));
        }
      });
    });
  }
};
