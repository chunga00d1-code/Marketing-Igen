import type { RealEstateMapCoordinate } from "../../../services/realEstateMapVideoService";

export type MapTheme = "street" | "satellite" | "dark";
export type DrawMode = "none" | "draw-polygon" | "select-edit";
export type BoundaryTheme = "cyan-neon" | "gold-luxury" | "emerald" | "ruby";
export type BoundaryStrokeType = "solid" | "dashed" | "glow";
export type AspectRatioType = "16:9" | "9:16";
export type GisToolTab = "polygon" | "route-ab" | "marker" | "text" | "settings" | "history";

export type GisMapLayerType = "polygon" | "route" | "marker" | "text-billboard";

export interface GisMapLayer {
  id: string;
  name: string;
  type: GisMapLayerType;
  visible: boolean;
  color: string;
  strokeWidth?: number;
  opacity?: number;
  coordinates?: number[][]; // Polygon ring hoặc LineString coordinates
  point?: RealEstateMapCoordinate; // Tọa độ điểm marker hoặc nhãn 3D
  metadata?: {
    areaM2?: number;
    perimeterM?: number;
    distanceMeters?: number;
    durationSeconds?: number;
    fromName?: string;
    toName?: string;
    text?: string;
  };
}

export interface GisSceneKeyframe {
  id: string;
  order: number;
  durationSeconds: number;
  camera: {
    center: RealEstateMapCoordinate;
    zoom: number;
    pitch: number;
    bearing: number;
  };
  activeLayerIds: string[];
  caption?: string;
  voiceover?: string;
}

export const DEFAULT_LOCATION: RealEstateMapCoordinate = { lat: 21.0285, lng: 105.8542 };

export const POPULAR_SUGGESTIONS = [
  "Thủ Thiêm",
  "Vinhomes Central Park",
  "Vinhomes Grand Park",
  "KĐT Sala",
  "The Global City",
  "Phú Mỹ Hưng",
  "Ecopark",
  "Ocean Park 1",
  "Smart City",
  "Aqua City",
  "SwanBay",
];

export const GIS_NEON_COLORS = [
  { id: "cyan", name: "Cyan Neon", hex: "#00f2fe", border: "#00c6ff" },
  { id: "gold", name: "Gold Luxury", hex: "#ffd700", border: "#ffae00" },
  { id: "emerald", name: "Emerald", hex: "#10b981", border: "#059669" },
  { id: "ruby", name: "Ruby Red", hex: "#f43f5e", border: "#e11d48" },
  { id: "purple", name: "Cyber Purple", hex: "#a855f7", border: "#7e22ce" },
  { id: "blue", name: "Electric Blue", hex: "#3b82f6", border: "#1d4ed8" },
];
