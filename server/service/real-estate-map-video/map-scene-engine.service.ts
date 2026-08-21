import type { HtmlVideoPipelineMetadata, HtmlVideoScenePlanItem } from "../../interface/html-video-pipeline.interface";
import type {
  RealEstateMapBranding,
  RealEstateMapCameraKeyframe,
  RealEstateMapCoordinate,
  RealEstateMapPoi,
  RealEstateMapProjectSnapshot,
  RealEstateMapRoute,
  RealEstateMapScene,
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

function normalizedBoundary(snapshot: RealEstateMapProjectSnapshot) {
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
    x: 24 + ((lng - minLng) / lngRange) * 52,
    y: 24 + ((maxLat - lat) / latRange) * 52,
  }));
}

function cameraTransform(frame: RealEstateMapCameraKeyframe, origin: RealEstateMapCoordinate, minimumZoom: number) {
  const x = Math.max(-180, Math.min(180, (origin.lng - frame.center.lng) * 9_000));
  const y = Math.max(-240, Math.min(240, (frame.center.lat - origin.lat) * 9_000));
  const scale = Math.max(1, Math.min(2.2, 1 + (frame.zoom - minimumZoom) * 0.13));
  const skew = Math.max(-8, Math.min(8, frame.pitch * 0.08));
  return `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) scale(${scale.toFixed(3)}) rotate(${frame.bearing.toFixed(2)}deg) skewY(${skew.toFixed(2)}deg)`;
}

function cameraKeyframes(scene: RealEstateMapScene, sceneIndex: number, snapshot: RealEstateMapProjectSnapshot) {
  const duration = snapshot.videoSpec.durationSeconds;
  const frames = scene.camera.length > 0
    ? scene.camera
    : [{ atSeconds: scene.startSeconds, center: snapshot.location, zoom: 12, pitch: 0, bearing: 0 }];
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
    lines.push(`Ranh giới dự án ${snapshot.name} được quy hoạch rõ ràng và làm nổi bật trên bản đồ.`);
  } else {
    lines.push(`Tâm điểm dự án được xác nhận tại tọa độ ${formatLocation(snapshot.location)}.`);
  }

  if (snapshot.pois.length > 0) {
    const topPoiNames = snapshot.pois.slice(0, 3).map((p) => p.name).join(", ");
    lines.push(`Dễ dàng kết nối tới các tiện ích trọng điểm như ${topPoiNames}.`);
  }

  if (snapshot.branding?.ctaText) {
    lines.push(snapshot.branding.ctaText);
  } else if (snapshot.branding?.hotline) {
    lines.push(`Liên hệ ngay hotline ${snapshot.branding.hotline} để nhận thông tin chi tiết.`);
  } else {
    lines.push(`Liên hệ ngay hôm nay để nhận thông tin chi tiết và chính sách ưu đãi.`);
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

  const scenes: RealEstateMapScene[] = [
    {
      id: "overview",
      preset: "overview",
      startSeconds: 0,
      endSeconds: 6,
      camera: [frame(0, 11, 0), frame(6, 13, 20)],
    },
    {
      id: "project",
      preset: "zoom-to-project",
      startSeconds: 6,
      endSeconds: 13,
      camera: [frame(6, 13, 20), frame(13, 15, 45, 10)],
    },
    {
      id: "boundary-and-pois",
      preset: pois.length > 0 ? "route-follow" : "project-boundary",
      startSeconds: 13,
      endSeconds: 19,
      camera: [frame(13, 15, 45, 10), frame(19, 16, 50, -5)],
    },
    {
      id: "closing",
      preset: "zoom-to-project",
      startSeconds: 19,
      endSeconds: durationSeconds,
      camera: [frame(19, 16, 50, -5), frame(durationSeconds, 14, 25, 0)],
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
    provider: {
      provider: "mock",
      product: "local-preview",
      attribution: ["Bản đồ mô phỏng từ dữ liệu GIS đã xác nhận"],
    },
    videoSpec: {
      aspectRatio: input.videoSpec?.aspectRatio || "9:16",
      resolution: input.videoSpec?.resolution || "1080p",
      durationSeconds,
    },
    scenes,
  };
}

function buildTemplateCss(snapshot: RealEstateMapProjectSnapshot, polygon: string) {
  const duration = snapshot.videoSpec.durationSeconds;
  const cameras = snapshot.scenes.map((scene, index) => cameraKeyframes(scene, index, snapshot)).join("");
  const boundary = polygon
    ? `.boundary-halo,.boundary-fill{position:absolute;inset:0;clip-path:polygon(${polygon});transform-origin:center}.boundary-halo{background:#22d3ee;filter:blur(18px);animation:map-boundary-pulse ${duration}s linear both}.boundary-fill{background:linear-gradient(135deg,rgba(34,211,238,.2),rgba(14,165,233,.58));filter:drop-shadow(0 0 14px #67e8f9);animation:map-boundary-fill ${duration}s linear both}`
    : "";

  return [
    ".scene-deck{position:absolute;inset:0;overflow:hidden;background:#06111f;color:#fff}",
    ".scene{position:absolute;inset:0;overflow:hidden;background:radial-gradient(circle at 50% 34%,#164e63 0%,#0b2239 42%,#030712 100%);font-family:Arial,sans-serif}",
    ".map-viewport{position:absolute;inset:0;overflow:hidden;perspective:1400px}",
    `.map-camera{position:absolute;inset:-18%;transform-origin:50% 52%;animation-duration:${duration}s;animation-delay:0s;animation-timing-function:linear;animation-iteration-count:1;animation-fill-mode:both}`,
    ".map-grid{position:absolute;inset:0;background-color:#0b2637;background-image:linear-gradient(32deg,transparent 0 47%,rgba(34,211,238,.12) 48% 50%,transparent 51%),linear-gradient(122deg,transparent 0 47%,rgba(125,211,252,.1) 48% 50%,transparent 51%),linear-gradient(rgba(148,163,184,.08) 2px,transparent 2px),linear-gradient(90deg,rgba(148,163,184,.08) 2px,transparent 2px);background-size:320px 240px,280px 360px,92px 92px,92px 92px}",
    ".road{position:absolute;height:22px;border:3px solid rgba(148,163,184,.2);border-left:0;border-right:0;background:rgba(15,23,42,.68);border-radius:999px}.road-a{width:125%;left:-12%;top:39%;transform:rotate(-18deg)}.road-b{width:110%;left:-5%;top:63%;transform:rotate(23deg)}.road-c{width:88%;left:18%;top:51%;transform:rotate(79deg)}",
    boundary,
    ".project-marker{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px;border:8px solid #fff;border-radius:50% 50% 50% 0;background:#06b6d4;box-shadow:0 0 0 18px rgba(34,211,238,.16),0 18px 40px rgba(0,0,0,.5);transform:rotate(-45deg)}.project-marker span{display:block;width:18px;height:18px;margin:15px;border-radius:50%;background:#082f49}",
    ".poi-badge{position:absolute;padding:8px 16px;border-radius:12px;background:rgba(15,23,42,.85);border:1px solid #38bdf8;color:#e0f2fe;font-size:14px;font-weight:700;box-shadow:0 8px 24px rgba(0,0,0,.4)}",
    ".top-overlay{position:absolute;top:8%;left:9%;right:9%;z-index:4;text-shadow:0 3px 18px rgba(0,0,0,.75)}.eyebrow{display:block;margin-bottom:28px;color:#67e8f9;font-size:29px;font-weight:800;letter-spacing:5px}.top-overlay h1{max-width:880px;margin:0;font-size:84px;line-height:1.05;letter-spacing:-2px}.top-overlay p{margin:20px 0 0;color:#dbeafe;font-size:38px;font-weight:700}",
    ".info-overlay{position:absolute;left:9%;right:9%;bottom:11%;z-index:4;display:flex;flex-direction:column;gap:12px;padding:32px 38px;border:1px solid rgba(103,232,249,.42);border-radius:30px;background:linear-gradient(135deg,rgba(8,47,73,.91),rgba(15,23,42,.88));box-shadow:0 28px 80px rgba(0,0,0,.4)}.info-overlay strong{font-size:40px}.info-overlay span{color:#bae6fd;font-size:26px;line-height:1.35}",
    `.progress{position:absolute;left:9%;right:9%;bottom:7%;height:7px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.18);z-index:4}.progress i{display:block;width:100%;height:100%;background:linear-gradient(90deg,#22d3ee,#38bdf8,#a5f3fc);transform-origin:left;animation:map-progress ${duration}s linear both}`,
    ".camera-1{animation-name:map-camera-1}.camera-2{animation-name:map-camera-2}.camera-3{animation-name:map-camera-3}.camera-4{animation-name:map-camera-4}",
    cameras,
    "@keyframes map-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}@keyframes map-boundary-pulse{0%,70%{opacity:.08;transform:scale(.96)}78%,100%{opacity:.45;transform:scale(1.04)}}@keyframes map-boundary-fill{0%,68%{opacity:.08}76%,100%{opacity:1}}",
  ].join("");
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
          ? `${snapshot.pois.length} tiện ích kết nối`
          : snapshot.boundary
            ? "Ranh giới dự án"
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
      verifiedFields: snapshot.verifiedFields,
      provider: snapshot.provider,
    }),
    sourceContextRefs: [{ id: MAP_SOURCE_REF, type: "reference", label: "Verified real-estate map snapshot" }],
    videoBrief: {
      objective: `Giới thiệu vị trí và tiện ích của ${snapshot.name}`,
      tone: "Rõ ràng, hiện đại, uy tín",
      visualStyle: "Bản đồ 2.5D với camera transition, polygon highlight và overlay thương hiệu",
      voiceRequired: true,
      exactPhrases: [snapshot.name],
      videoSpec: {
        ...snapshot.videoSpec,
        language: "vi",
        audience: "Khách hàng bất động sản",
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
  const boundaryMarkup = snapshot.boundary
    ? '<div class="boundary-halo"></div><div class="boundary-fill"></div>'
    : "";

  const scenes = snapshot.scenes.map((_scene, index) => {
    let title = "Vị trí chiến lược";
    let detail = coordinateText;
    const caption = snapshot.provider.attribution[0] || "Bản đồ mô phỏng GIS";

    if (index === 0) {
      title = snapshot.address ? escapeHtml(snapshot.address) : "Tổng quan dự án";
      detail = "Vị trí trung tâm";
    } else if (index === 1) {
      title = "Tâm điểm dự án";
      detail = coordinateText;
    } else if (index === 2) {
      title = snapshot.pois.length > 0 ? "Kết nối tiện ích xung quanh" : "Ranh giới quy hoạch";
      detail = snapshot.pois.length > 0 ? snapshot.pois.slice(0, 3).map((p) => escapeHtml(p.name)).join(" · ") : "Đã xác nhận";
    } else {
      title = snapshot.branding?.ctaText ? escapeHtml(snapshot.branding.ctaText) : "Đăng ký tư vấn";
      detail = snapshot.branding?.hotline ? `Hotline: ${escapeHtml(snapshot.branding.hotline)}` : "Nhận bảng giá & ưu đãi";
    }

    return `<section class="scene scene-${index + 1}"><div class="map-viewport"><div class="map-camera camera-${index + 1}"><div class="map-grid"></div><div class="road road-a"></div><div class="road road-b"></div><div class="road road-c"></div>${boundaryMarkup}<div class="project-marker"><span></span></div></div></div><div class="top-overlay"><span class="eyebrow">VIDEO BẤT ĐỘNG SẢN · 0${index + 1}</span><h1>${safeName}</h1><p>${escapeHtml(title)}</p></div><div class="info-overlay"><strong>${escapeHtml(detail)}</strong><span>${escapeHtml(caption)}</span></div><div class="progress"><i></i></div></section>`;
  }).join("");

  return `<main class="scene-deck">${scenes}</main>`;
}

export function composeRealEstateMapSnapshot(snapshot: RealEstateMapProjectSnapshot): RealEstateMapComposition {
  const voiceLines = buildVoiceLines(snapshot);
  const scenePlan = buildScenePlan(snapshot, voiceLines);
  const polygon = normalizedBoundary(snapshot)
    .map((point) => `${point.x.toFixed(2)}% ${point.y.toFixed(2)}%`)
    .join(",");

  return {
    html: buildTemplateHtml(snapshot),
    css: buildTemplateCss(snapshot, polygon),
    voiceScript: voiceLines.join(" "),
    scenePlan,
    pipeline: buildPipeline(snapshot, scenePlan),
  };
}
