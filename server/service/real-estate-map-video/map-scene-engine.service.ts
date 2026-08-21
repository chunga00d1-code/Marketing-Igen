import type { HtmlVideoPipelineMetadata, HtmlVideoScenePlanItem } from "../../interface/html-video-pipeline.interface";
import type {
  RealEstateMapBranding,
  RealEstateMapCameraKeyframe,
  RealEstateMapCoordinate,
  RealEstateMapPoi,
  RealEstateMapProjectSnapshot,
  RealEstateMapRoute,
  RealEstateMapScene,
  RealEstateMapVfxConfig,
  RealEstateMapVfxTheme,
  RealEstateMapVideoSpec,
} from "../../interface/real-estate-map-video.interface";

export type RealEstateMapComposition = {
  html: string;
  css: string;
  voiceScript: string;
  scenePlan: HtmlVideoScenePlanItem[];
  pipeline: HtmlVideoPipelineMetadata;
};

const MAP_SOURCE_REF = "verified-map-snapshot";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] || character);
}

function formatCoordinate(value: number) {
  return Number(value.toFixed(6)).toString();
}

function formatLocation(location: RealEstateMapCoordinate) {
  return `${formatCoordinate(location.lat)}, ${formatCoordinate(location.lng)}`;
}

// Chuẩn hóa tọa độ đa giác ranh đất về hệ tọa độ 0-1000 cho SVG & CSS
function normalizedSvgBoundary(snapshot: RealEstateMapProjectSnapshot) {
  const points = snapshot.boundary?.coordinates[0] || [];
  if (points.length < 3) return [];
  const lngValues = points.map((point) => point[0]);
  const latValues = points.map((point) => point[1]);
  const minLng = Math.min(...lngValues);
  const maxLng = Math.max(...lngValues);
  const minLat = Math.min(...latValues);
  const maxLat = Math.max(...latValues);
  const lngRange = Math.max(maxLng - minLng, 0.000001);
  const latRange = Math.max(maxLat - minLat, 0.000001);
  
  return points.map(([lng, lat]) => ({
    x: Math.round(280 + ((lng - minLng) / lngRange) * 440),
    y: Math.round(280 + ((maxLat - lat) / latRange) * 440),
  }));
}

function getThemePalette(theme?: RealEstateMapVfxTheme) {
  switch (theme) {
    case "gold-luxury":
      return {
        primary: "#ffd700",
        secondary: "#f59e0b",
        glow: "rgba(255, 215, 0, 0.6)",
        fill: "rgba(245, 158, 11, 0.28)",
        led: "#ffffff",
        badgeBg: "rgba(30, 20, 0, 0.88)",
      };
    case "emerald":
      return {
        primary: "#10b981",
        secondary: "#059669",
        glow: "rgba(16, 185, 129, 0.6)",
        fill: "rgba(16, 185, 129, 0.28)",
        led: "#d1fae5",
        badgeBg: "rgba(2, 44, 34, 0.88)",
      };
    case "ruby":
      return {
        primary: "#f43f5e",
        secondary: "#e11d48",
        glow: "rgba(244, 63, 94, 0.6)",
        fill: "rgba(244, 63, 94, 0.28)",
        led: "#ffe4e6",
        badgeBg: "rgba(40, 5, 15, 0.88)",
      };
    case "cyan-neon":
    default:
      return {
        primary: "#00f2fe",
        secondary: "#4facfe",
        glow: "rgba(0, 242, 254, 0.6)",
        fill: "rgba(0, 242, 254, 0.25)",
        led: "#ffffff",
        badgeBg: "rgba(3, 20, 36, 0.88)",
      };
  }
}

function cameraTransform(frame: RealEstateMapCameraKeyframe, origin: RealEstateMapCoordinate, minimumZoom: number) {
  const x = Math.max(-180, Math.min(180, (origin.lng - frame.center.lng) * 9_000));
  const y = Math.max(-240, Math.min(240, (frame.center.lat - origin.lat) * 9_000));
  const scale = Math.max(1, Math.min(2.4, 1 + (frame.zoom - minimumZoom) * 0.16));
  const pitch = Math.max(0, Math.min(65, frame.pitch));
  const bearing = frame.bearing;
  return `perspective(1200px) translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0) scale(${scale.toFixed(3)}) rotateX(${pitch.toFixed(1)}deg) rotateZ(${bearing.toFixed(1)}deg)`;
}

function cameraKeyframes(scene: RealEstateMapScene, sceneIndex: number, snapshot: RealEstateMapProjectSnapshot) {
  const duration = snapshot.videoSpec.durationSeconds;
  const frames = scene.camera.length > 0
    ? scene.camera
    : [{ atSeconds: scene.startSeconds, center: snapshot.location, zoom: 12, pitch: 45, bearing: 0 }];
  const minimumZoom = Math.min(...snapshot.scenes.flatMap((item) => item.camera.map((frame) => frame.zoom)));
  const firstTransform = cameraTransform(frames[0], snapshot.location, minimumZoom);
  const lastTransform = cameraTransform(frames[frames.length - 1], snapshot.location, minimumZoom);
  const entries = frames.map((frame) => {
    const percent = Math.max(0, Math.min(100, (frame.atSeconds / duration) * 100));
    return `${percent.toFixed(4)}%{transform:${cameraTransform(frame, snapshot.location, minimumZoom)}}`;
  }).join("");
  return `@keyframes map-camera-${sceneIndex + 1}{0%,${((scene.startSeconds / duration) * 100).toFixed(4)}%{transform:${firstTransform}}${entries}${((scene.endSeconds / duration) * 100).toFixed(4)}%,100%{transform:${lastTransform}}}`;
}

function buildVoiceLines(snapshot: RealEstateMapProjectSnapshot): string[] {
  const lines: string[] = [];
  const addressPart = snapshot.address ? ` tọa lạc tại ${snapshot.address}` : "";
  lines.push(`Khám phá vị trí chiến lược của ${snapshot.name}${addressPart}.`);

  if (snapshot.boundary) {
    lines.push(`Quy hoạch ranh giới dự án ${snapshot.name} được khoanh vùng rõ nét, khẳng định pháp lý minh bạch.`);
  } else {
    lines.push(`Tâm điểm dự án được định vị chính xác tại tọa độ ${formatLocation(snapshot.location)}.`);
  }

  if (snapshot.pois.length > 0) {
    const topPoiNames = snapshot.pois.slice(0, 3).map((p) => p.name).join(", ");
    lines.push(`Hệ thống kết nối giao thông đồng bộ tới các tiện ích trọng điểm như ${topPoiNames}.`);
  } else {
    lines.push(`Vị trí vàng sở hữu hạ tầng kết nối vượt trội và tiềm năng tăng giá bền vững.`);
  }

  if (snapshot.branding?.ctaText) {
    lines.push(snapshot.branding.ctaText);
  } else if (snapshot.branding?.hotline) {
    lines.push(`Liên hệ ngay hotline ${snapshot.branding.hotline} để nhận trọn bộ thông tin và bảng giá ưu đãi.`);
  } else {
    lines.push(`Liên hệ ngay hôm nay để nhận thông tin quy hoạch và chính sách ưu đãi đặc quyền.`);
  }

  return lines;
}

export function buildRealEstateMapProjectSnapshot(input: {
  name: string;
  address?: string;
  location: RealEstateMapCoordinate;
  boundary?: number[][];
  pois?: RealEstateMapPoi[];
  routes?: RealEstateMapRoute[];
  branding?: RealEstateMapBranding;
  vfxConfig?: RealEstateMapVfxConfig;
  videoSpec?: Partial<RealEstateMapVideoSpec>;
}): RealEstateMapProjectSnapshot {
  if (!input.name.trim()) throw new Error("Project name is required.");
  const durationSeconds = input.videoSpec?.durationSeconds || 24;
  const location = { ...input.location };
  const pois = input.pois || [];
  const routes = input.routes || [];

  const frame = (atSeconds: number, zoom: number, pitch: number, bearing = 0): RealEstateMapCameraKeyframe => ({
    atSeconds,
    center: { ...location },
    zoom,
    pitch,
    bearing,
  });

  const boundary =
    input.boundary && input.boundary.length >= 3
      ? { type: "Polygon" as const, coordinates: [input.boundary.map((point) => [...point])] }
      : undefined;

  const verifiedFields: string[] = ["name", "location"];
  if (input.address) verifiedFields.push("address");
  if (boundary) verifiedFields.push("boundary");
  if (pois.length > 0) verifiedFields.push("pois");
  if (routes.length > 0) verifiedFields.push("routes");

  // Cinematic 3D Camera Script: Fly-in -> Orbit Boundary -> Scan POIs & Routes -> Outro
  const scenes: RealEstateMapScene[] = [
    {
      id: "overview-flyin",
      preset: "overview",
      startSeconds: 0,
      endSeconds: 6,
      camera: [frame(0, 11, 20, -10), frame(6, 13.5, 48, 15)],
    },
    {
      id: "project-orbit",
      preset: "zoom-to-project",
      startSeconds: 6,
      endSeconds: 13,
      camera: [frame(6, 13.5, 48, 15), frame(13, 15.5, 56, 35)],
    },
    {
      id: "boundary-and-pois",
      preset: pois.length > 0 ? "route-follow" : "project-boundary",
      startSeconds: 13,
      endSeconds: 19,
      camera: [frame(13, 15.5, 56, 35), frame(19, 14.8, 45, 5)],
    },
    {
      id: "closing-cta",
      preset: "zoom-to-project",
      startSeconds: 19,
      endSeconds: durationSeconds,
      camera: [frame(19, 14.8, 45, 5), frame(durationSeconds, 13.8, 30, 0)],
    },
  ];

  return {
    name: input.name.trim(),
    address: input.address?.trim() || "",
    location,
    boundary,
    verifiedFields,
    pois,
    routes,
    branding: input.branding,
    vfxConfig: input.vfxConfig || {
      boundaryTheme: "cyan-neon",
      boundaryGlowIntensity: 8,
      boundaryLedSpeed: 4,
      showRadiusPulse: true,
      showAnimatedRoutes: true,
      show3DBillboards: true,
    },
    provider: {
      provider: "mock",
      product: "vfx-satellite-3d",
      attribution: ["Bản đồ vệ tinh độ nét cao kết hợp VFX 3D"],
    },
    videoSpec: {
      aspectRatio: input.videoSpec?.aspectRatio || "9:16",
      resolution: input.videoSpec?.resolution || "1080p",
      durationSeconds,
    },
    scenes,
  };
}

function buildTemplateCss(snapshot: RealEstateMapProjectSnapshot) {
  const duration = snapshot.videoSpec.durationSeconds;
  const palette = getThemePalette(snapshot.vfxConfig?.boundaryTheme);
  const cameras = snapshot.scenes.map((scene, index) => cameraKeyframes(scene, index, snapshot)).join("");

  return [
    `@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');`,
    `:root {`,
    `  --vfx-primary: ${palette.primary};`,
    `  --vfx-secondary: ${palette.secondary};`,
    `  --vfx-glow: ${palette.glow};`,
    `  --vfx-fill: ${palette.fill};`,
    `  --vfx-led: ${palette.led};`,
    `  --vfx-badge-bg: ${palette.badgeBg};`,
    `}`,
    `* { box-sizing: border-box; margin: 0; padding: 0; }`,
    `.scene-deck { position: absolute; inset: 0; overflow: hidden; background: #030712; color: #ffffff; font-family: 'Plus Jakarta Sans', sans-serif; }`,
    `.scene { position: absolute; inset: 0; overflow: hidden; background: radial-gradient(circle at 50% 30%, #0f172a 0%, #020617 75%, #000000 100%); }`,
    
    // 3D Map Viewport & Camera Stage
    `.map-viewport { position: absolute; inset: 0; overflow: hidden; perspective: 1200px; }`,
    `.map-stage { position: absolute; inset: -40%; transform-origin: 50% 50%; transform-style: preserve-3d; animation-duration: ${duration}s; animation-delay: 0s; animation-timing-function: cubic-bezier(0.25, 1, 0.5, 1); animation-iteration-count: 1; animation-fill-mode: both; }`,
    
    // Satellite Texture & Grid Base
    `.satellite-surface { position: absolute; inset: 0; background-color: #0b1524; background-image: radial-gradient(circle at 50% 50%, rgba(30, 58, 138, 0.25) 0%, transparent 80%), linear-gradient(rgba(56, 189, 248, 0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(56, 189, 248, 0.08) 1px, transparent 1px); background-size: 100% 100%, 80px 80px, 80px 80px; }`,
    
    // SVG VFX Overlay Canvas
    `.vfx-svg-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }`,
    
    // Animated Neon Boundary & LED Glow
    `.boundary-fill-shape { fill: var(--vfx-fill); filter: drop-shadow(0 0 20px var(--vfx-glow)); animation: pulse-boundary-fill 3s ease-in-out infinite alternate; }`,
    `.boundary-base-stroke { stroke: var(--vfx-primary); stroke-width: 5; fill: none; filter: drop-shadow(0 0 12px var(--vfx-primary)); }`,
    `.boundary-led-runner { stroke: var(--vfx-led); stroke-width: 7; fill: none; stroke-linecap: round; stroke-dasharray: 120 380; filter: drop-shadow(0 0 16px #ffffff) drop-shadow(0 0 24px var(--vfx-primary)); animation: led-running-edge 5s linear infinite; }`,
    
    // Center Project 3D Marker
    `.project-center-pin { position: absolute; left: 50%; top: 50%; width: 56px; height: 56px; margin: -28px; transform: translate3d(0, 0, 40px); }`,
    `.pin-halo { position: absolute; inset: -20px; border-radius: 50%; background: radial-gradient(circle, var(--vfx-glow) 0%, transparent 70%); animation: radar-halo 2.5s infinite; }`,
    `.pin-body { width: 100%; height: 100%; border-radius: 50% 50% 50% 0; background: linear-gradient(135deg, var(--vfx-primary), var(--vfx-secondary)); transform: rotate(-45deg); border: 4px solid #ffffff; box-shadow: 0 0 25px var(--vfx-primary), 0 15px 35px rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; }`,
    `.pin-inner-dot { width: 16px; height: 16px; border-radius: 50%; background: #0f172a; transform: rotate(45deg); }`,
    
    // 3D Billboard & Tag
    `.billboard-3d { position: absolute; left: 50%; top: 40%; transform: translate(-50%, -100%) rotateX(-45deg); transform-style: preserve-3d; background: var(--vfx-badge-bg); border: 2px solid var(--vfx-primary); border-radius: 18px; padding: 12px 24px; box-shadow: 0 0 30px var(--vfx-glow), 0 20px 40px rgba(0,0,0,0.7); backdrop-filter: blur(12px); display: flex; flex-direction: column; align-items: center; white-space: nowrap; z-index: 10; animation: float-billboard 4s ease-in-out infinite alternate; }`,
    `.billboard-tag { font-size: 14px; font-weight: 800; color: var(--vfx-primary); text-transform: uppercase; letter-spacing: 3px; }`,
    `.billboard-title { font-size: 26px; font-weight: 900; color: #ffffff; margin-top: 2px; }`,
    
    // Radar Pulse Zones (Tiện ích xung quanh)
    `.radar-pulse-node { position: absolute; width: 0; height: 0; }`,
    `.radar-ring { position: absolute; width: 340px; height: 340px; margin: -170px; border-radius: 50%; border: 2px dashed rgba(56, 189, 248, 0.6); background: radial-gradient(circle, rgba(56, 189, 248, 0.15) 0%, transparent 70%); animation: radar-pulse-expand 3s cubic-bezier(0.2, 0.8, 0.4, 1) infinite; }`,
    `.radar-ring.ring-2 { animation-delay: 1.2s; }`,
    `.poi-chip-3d { position: absolute; transform: translate(-50%, -50%) rotateX(-45deg); background: rgba(15, 23, 42, 0.92); border: 1.5px solid #38bdf8; border-radius: 12px; padding: 8px 16px; box-shadow: 0 10px 25px rgba(0,0,0,0.6), 0 0 15px rgba(56, 189, 248, 0.4); display: flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 700; color: #f0f9ff; white-space: nowrap; }`,
    
    // Animated Road Connection
    `.vfx-road-base { stroke: rgba(148, 163, 184, 0.3); stroke-width: 8; fill: none; stroke-linecap: round; }`,
    `.vfx-road-glow { stroke: var(--vfx-primary); stroke-width: 4; fill: none; stroke-linecap: round; filter: drop-shadow(0 0 10px var(--vfx-primary)); }`,
    `.vfx-road-pulse { stroke: #ffffff; stroke-width: 5; fill: none; stroke-linecap: round; stroke-dasharray: 40 220; filter: drop-shadow(0 0 15px #ffffff); animation: road-pulse-travel 3s linear infinite; }`,
    
    // Top & Bottom TikTok Safe-Area Overlays
    `.top-header-overlay { position: absolute; top: 7%; left: 8%; right: 8%; z-index: 20; text-shadow: 0 4px 20px rgba(0,0,0,0.85); }`,
    `.top-eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 8px 18px; border-radius: 999px; background: rgba(15, 23, 42, 0.8); border: 1px solid var(--vfx-primary); color: var(--vfx-primary); font-size: 18px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 16px; backdrop-filter: blur(8px); }`,
    `.top-header-overlay h1 { font-size: 52px; font-weight: 900; line-height: 1.15; letter-spacing: -1px; background: linear-gradient(180deg, #ffffff 30%, #cbd5e1 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }`,
    `.top-header-overlay p { margin-top: 10px; color: #94a3b8; font-size: 24px; font-weight: 600; }`,
    
    `.bottom-info-overlay { position: absolute; left: 8%; right: 8%; bottom: 10%; z-index: 20; display: flex; flex-direction: column; gap: 14px; padding: 26px 32px; border-radius: 24px; background: linear-gradient(135deg, rgba(15, 23, 42, 0.94), rgba(2, 6, 23, 0.96)); border: 1.5px solid rgba(56, 189, 248, 0.35); box-shadow: 0 25px 60px rgba(0,0,0,0.6), 0 0 35px rgba(0, 242, 254, 0.15); backdrop-filter: blur(16px); }`,
    `.bottom-info-overlay .highlight-title { font-size: 28px; font-weight: 800; color: #f8fafc; display: flex; align-items: center; gap: 10px; }`,
    `.bottom-info-overlay .highlight-detail { font-size: 20px; font-weight: 600; color: #38bdf8; line-height: 1.4; }`,
    
    `.progress-tracker { position: absolute; left: 8%; right: 8%; bottom: 6%; height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.15); overflow: hidden; z-index: 20; }`,
    `.progress-tracker i { display: block; width: 100%; height: 100%; background: linear-gradient(90deg, var(--vfx-primary), #38bdf8, #a5f3fc); transform-origin: left; animation: map-progress ${duration}s linear both; }`,
    
    // Keyframe Animations
    `.camera-1 { animation-name: map-camera-1; }`,
    `.camera-2 { animation-name: map-camera-2; }`,
    `.camera-3 { animation-name: map-camera-3; }`,
    `.camera-4 { animation-name: map-camera-4; }`,
    cameras,
    `@keyframes map-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }`,
    `@keyframes led-running-edge { from { stroke-dashoffset: 0; } to { stroke-dashoffset: 1000; } }`,
    `@keyframes road-pulse-travel { from { stroke-dashoffset: 260; } to { stroke-dashoffset: 0; } }`,
    `@keyframes pulse-boundary-fill { from { opacity: 0.7; } to { opacity: 1; } }`,
    `@keyframes radar-pulse-expand { 0% { transform: scale(0.2); opacity: 0.9; } 100% { transform: scale(2.2); opacity: 0; } }`,
    `@keyframes radar-halo { 0%, 100% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.6); opacity: 0.9; } }`,
    `@keyframes float-billboard { from { transform: translate(-50%, -100%) rotateX(-45deg) translateZ(0px); } to { transform: translate(-50%, -100%) rotateX(-45deg) translateZ(20px); } }`,
  ].join("\n");
}

function buildScenePlan(snapshot: RealEstateMapProjectSnapshot, voiceLines: string[]): HtmlVideoScenePlanItem[] {
  const coordinateText = formatLocation(snapshot.location);
  return snapshot.scenes.map((scene, index): HtmlVideoScenePlanItem => {
    let purpose: "opening" | "content" | "closing" = "content";
    if (index === 0) purpose = "opening";
    else if (index === snapshot.scenes.length - 1) purpose = "closing";

    let onScreenText: string[] = [snapshot.name];
    if (index === 0) {
      onScreenText = [snapshot.name, snapshot.address || "Vị trí chiến lược"];
    } else if (index === 1) {
      onScreenText = [snapshot.name, coordinateText];
    } else if (index === 2) {
      onScreenText = [
        snapshot.name,
        snapshot.pois.length > 0
          ? `${snapshot.pois.length} tiện ích kết nối trọng điểm`
          : snapshot.boundary
            ? "Ranh giới quy hoạch 3D"
            : "Quy hoạch dự án",
      ];
    } else {
      onScreenText = [
        snapshot.branding?.ctaText || snapshot.name,
        snapshot.branding?.hotline ? `Hotline: ${snapshot.branding.hotline}` : "Thông tin liên hệ",
      ];
    }

    return {
      id: scene.id,
      order: index,
      purpose,
      sourceUnitIds: ["project"],
      onScreenText,
      narration: voiceLines[index] || "",
      startSeconds: scene.startSeconds,
      endSeconds: scene.endSeconds,
      transition: index === 0 ? "crossfade" : "slide-left",
      assetIds: [],
    };
  });
}

function buildPipeline(snapshot: RealEstateMapProjectSnapshot, scenePlan: HtmlVideoScenePlanItem[]): HtmlVideoPipelineMetadata {
  const coordinateText = formatLocation(snapshot.location);
  return {
    version: "2.0",
    sourceText: JSON.stringify({
      name: snapshot.name,
      address: snapshot.address,
      location: snapshot.location,
      boundary: snapshot.boundary || null,
      pois: snapshot.pois,
      routes: snapshot.routes,
      vfxConfig: snapshot.vfxConfig,
      verifiedFields: snapshot.verifiedFields,
      provider: snapshot.provider,
    }),
    sourceContextRefs: [{ id: MAP_SOURCE_REF, type: "reference", label: "Verified real-estate map snapshot with 3D VFX" }],
    videoBrief: {
      objective: `Giới thiệu vị trí và tiện ích của ${snapshot.name} với hiệu ứng VFX bản đồ 3D`,
      tone: "Hiện đại, điện ảnh, sang trọng, uy tín",
      visualStyle: "Bản đồ vệ tinh 3D góc nghiêng, ranh đất viền LED Neon, vòng quét Radar và lộ trình giao thông phát sáng",
      voiceRequired: true,
      exactPhrases: [snapshot.name],
      videoSpec: {
        ...snapshot.videoSpec,
        language: "vi",
        audience: "Khách hàng đầu tư & an cư bất động sản",
        platform: "generic",
        cta: snapshot.branding?.ctaText || "",
      },
    },
    contentUnits: [
      { id: "project", order: 0, sourceText: snapshot.name, normalizedText: snapshot.name, sourceRefs: [MAP_SOURCE_REF], required: true, requiredVerbatim: true },
      { id: "location", order: 1, sourceText: coordinateText, normalizedText: coordinateText, sourceRefs: [MAP_SOURCE_REF], required: true, requiredVerbatim: true },
    ],
    scenePlan,
    findings: [],
  };
}

function buildTemplateHtml(snapshot: RealEstateMapProjectSnapshot) {
  const safeName = escapeHtml(snapshot.name);
  const coordinateText = formatLocation(snapshot.location);
  const boundaryPoints = normalizedSvgBoundary(snapshot);
  const pointsString = boundaryPoints.map((p) => `${p.x},${p.y}`).join(" ");
  const pathD = boundaryPoints.length > 0
    ? `M ${boundaryPoints[0].x} ${boundaryPoints[0].y} ` + boundaryPoints.slice(1).map((p) => `L ${p.x} ${p.y}`).join(" ") + " Z"
    : "";

  // Tạo SVG markup cho ranh đất và viền LED Neon
  const svgBoundaryMarkup = pathD
    ? `
    <polygon points="${pointsString}" class="boundary-fill-shape" />
    <path d="${pathD}" class="boundary-base-stroke" />
    <path d="${pathD}" class="boundary-led-runner" />
    `
    : "";

  // Tạo SVG markup cho các tuyến đường phát sáng nối từ dự án
  const svgRoutesMarkup = (snapshot.routes || []).map((route, i) => {
    const coords = route.geometry.coordinates || [];
    if (coords.length < 2) {
      // Giả lập tuyến đường mẫu nối từ tâm (500, 500)
      const targetX = 500 + ((i % 2 === 0 ? 1 : -1) * (180 + i * 60));
      const targetY = 500 + ((i > 1 ? 1 : -1) * (160 + i * 50));
      const d = `M 500 500 Q ${Math.round((500 + targetX) / 2 + 40)} ${Math.round((500 + targetY) / 2 - 40)} ${targetX} ${targetY}`;
      return `
        <path d="${d}" class="vfx-road-base" />
        <path d="${d}" class="vfx-road-glow" />
        <path d="${d}" class="vfx-road-pulse" />
      `;
    }
    return "";
  }).join("");

  // Tạo markup cho các cụm tiện ích và vòng quét Radar Pulse
  const poisMarkup = (snapshot.pois || []).slice(0, 4).map((poi, index) => {
    const angle = (index * (360 / Math.max(1, snapshot.pois.length))) * (Math.PI / 180);
    const radius = 220 + index * 40;
    const posX = Math.round(500 + Math.cos(angle) * radius);
    const posY = Math.round(500 + Math.sin(angle) * radius);
    const distText = poi.distanceMeters ? `${(poi.distanceMeters / 1000).toFixed(1)} km` : "Gần kề";

    return `
      <div class="radar-pulse-node" style="left: ${posX}px; top: ${posY}px;">
        <div class="radar-ring"></div>
        <div class="radar-ring ring-2"></div>
        <div class="poi-chip-3d">
          <span>📍</span>
          <strong>${escapeHtml(poi.name)}</strong>
          <span style="color: #38bdf8; font-size: 13px;">(${distText})</span>
        </div>
      </div>
    `;
  }).join("");

  const scenes = snapshot.scenes.map((_scene, index) => {
    let title = "Vị trí chiến lược";
    let detail = coordinateText;
    const caption = snapshot.provider.attribution[0] || "Bản đồ vệ tinh độ nét cao kết hợp VFX 3D";

    if (index === 0) {
      title = snapshot.address ? escapeHtml(snapshot.address) : "Tổng quan quy hoạch dự án";
      detail = "Tọa độ vàng kết nối giao thương";
    } else if (index === 1) {
      title = "Ranh giới quy hoạch & Thửa đất";
      detail = snapshot.boundary ? "Ranh giới pháp lý minh bạch" : coordinateText;
    } else if (index === 2) {
      title = snapshot.pois.length > 0 ? "Kết nối tiện ích trọng điểm" : "Hạ tầng liên kết hoàn hảo";
      detail = snapshot.pois.length > 0 ? snapshot.pois.slice(0, 3).map((p) => escapeHtml(p.name)).join(" · ") : "Quy hoạch đồng bộ";
    } else {
      title = snapshot.branding?.ctaText ? escapeHtml(snapshot.branding.ctaText) : "Đăng ký tư vấn & Báo giá";
      detail = snapshot.branding?.hotline ? `Hotline: ${escapeHtml(snapshot.branding.hotline)}` : "Nhận bảng giá & chính sách ưu đãi";
    }

    return `
    <section class="scene scene-${index + 1}">
      <div class="map-viewport">
        <div class="map-stage camera-${index + 1}">
          <div class="satellite-surface"></div>
          <svg class="vfx-svg-canvas" viewBox="0 0 1000 1000">
            ${svgRoutesMarkup}
            ${svgBoundaryMarkup}
          </svg>
          <div class="project-center-pin">
            <div class="pin-halo"></div>
            <div class="pin-body">
              <div class="pin-inner-dot"></div>
            </div>
          </div>
          <div class="billboard-3d">
            <span class="billboard-tag">QUY HOẠCH BĐS</span>
            <h3 class="billboard-title">${safeName}</h3>
          </div>
          ${poisMarkup}
        </div>
      </div>
      
      <div class="top-header-overlay">
        <span class="top-eyebrow">✨ VIDEO BẤT ĐỘNG SẢN 3D · 0${index + 1}</span>
        <h1>${safeName}</h1>
        <p>${escapeHtml(title)}</p>
      </div>
      
      <div class="bottom-info-overlay">
        <strong class="highlight-title">📍 ${escapeHtml(detail)}</strong>
        <span class="highlight-detail">${escapeHtml(caption)}</span>
      </div>
      
      <div class="progress-tracker"><i></i></div>
    </section>
    `;
  }).join("");

  return `<main class="scene-deck">${scenes}</main>`;
}

export function composeRealEstateMapSnapshot(snapshot: RealEstateMapProjectSnapshot): RealEstateMapComposition {
  const voiceLines = buildVoiceLines(snapshot);
  const scenePlan = buildScenePlan(snapshot, voiceLines);

  return {
    html: buildTemplateHtml(snapshot),
    css: buildTemplateCss(snapshot),
    voiceScript: voiceLines.join(" "),
    scenePlan,
    pipeline: buildPipeline(snapshot, scenePlan),
  };
}
