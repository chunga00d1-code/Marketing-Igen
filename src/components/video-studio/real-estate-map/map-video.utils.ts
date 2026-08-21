import type * as maplibregl from "maplibre-gl";
import {
  Building2,
  GraduationCap,
  Hospital,
  MapPin,
  Navigation,
  ShoppingBag,
  Trees,
} from "lucide-react";
import type { RealEstateMapCoordinate } from "../../../services/realEstateMapVideoService";

// Bản đồ tổng hợp cả 3 nguồn: Đường phố (Carto), Vệ tinh (Esri), Tối (Carto Dark)
export const UNIFIED_MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "carto-voyager": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
      maxzoom: 19,
    },
    "esri-satellite": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri, Maxar, Earthstar Geographics",
      maxzoom: 18,
    },
    "carto-dark": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap © CARTO",
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: "background-layer",
      type: "background",
      paint: { "background-color": "#f1f5f9" },
    },
    {
      id: "esri-satellite-layer",
      type: "raster",
      source: "esri-satellite",
      layout: { visibility: "none" },
      minzoom: 0,
      maxzoom: 24,
    },
    {
      id: "carto-dark-layer",
      type: "raster",
      source: "carto-dark",
      layout: { visibility: "none" },
      minzoom: 0,
      maxzoom: 24,
    },
    {
      id: "carto-voyager-layer",
      type: "raster",
      source: "carto-voyager",
      layout: { visibility: "visible" },
      minzoom: 0,
      maxzoom: 24,
    },
  ],
};

// Tính diện tích đa giác thực tế theo độ cong trái đất (m²)
export function calculatePolygonAreaMeters(coordinates: number[][]): number {
  if (!coordinates || coordinates.length < 3) return 0;
  const kEarthRadius = 6378137;
  let area = 0;
  const len = coordinates.length;
  for (let i = 0; i < len; i++) {
    const p1 = coordinates[i];
    const p2 = coordinates[(i + 1) % len];
    const lat1 = (p1[1] * Math.PI) / 180;
    const lat2 = (p2[1] * Math.PI) / 180;
    const lng1 = (p1[0] * Math.PI) / 180;
    const lng2 = (p2[0] * Math.PI) / 180;
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  area = (Math.abs(area) * kEarthRadius * kEarthRadius) / 2;
  return Math.round(area);
}

// Tính chu vi đa giác (m)
export function calculatePolygonPerimeterMeters(coordinates: number[][]): number {
  if (!coordinates || coordinates.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < coordinates.length - 1; i++) {
    const [lng1, lat1] = coordinates[i];
    const [lng2, lat2] = coordinates[i + 1];
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    perimeter += 6378137 * c;
  }
  return Math.round(perimeter);
}

export function formatArea(areaM2: number): string {
  if (areaM2 <= 0) return "0 m²";
  if (areaM2 >= 10000) {
    const ha = (areaM2 / 10000).toFixed(2);
    return `${areaM2.toLocaleString("vi-VN")} m² (${ha} ha)`;
  }
  return `${areaM2.toLocaleString("vi-VN")} m²`;
}

export function formatPerimeter(perimeterM: number): string {
  if (perimeterM <= 0) return "0 m";
  if (perimeterM >= 1000) {
    return `${(perimeterM / 1000).toFixed(2)} km`;
  }
  return `${perimeterM.toLocaleString("vi-VN")} m`;
}

export function createBoundary({ lat, lng }: RealEstateMapCoordinate) {
  const delta = 0.002;
  return [
    [lng - delta, lat - delta],
    [lng + delta, lat - delta],
    [lng + delta, lat + delta],
    [lng - delta, lat + delta],
    [lng - delta, lat - delta],
  ];
}

export function createRectangleBoundary(
  { lat, lng }: RealEstateMapCoordinate,
  widthMeters = 220,
  heightMeters = 220
) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const deltaLat = heightMeters / 2 / metersPerDegLat;
  const deltaLng = widthMeters / 2 / metersPerDegLng;
  return [
    [lng - deltaLng, lat - deltaLat],
    [lng + deltaLng, lat - deltaLat],
    [lng + deltaLng, lat + deltaLat],
    [lng - deltaLng, lat + deltaLat],
    [lng - deltaLng, lat - deltaLat],
  ];
}

export function createCirclePolygon(
  { lat, lng }: RealEstateMapCoordinate,
  radiusMeters = 160,
  points = 24
) {
  const metersPerDegLat = 111320;
  const metersPerDegLng = 111320 * Math.cos((lat * Math.PI) / 180);
  const coords: number[][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (i * (360 / points) * Math.PI) / 180;
    const pLng = lng + (radiusMeters * Math.cos(angle)) / metersPerDegLng;
    const pLat = lat + (radiusMeters * Math.sin(angle)) / metersPerDegLat;
    coords.push([pLng, pLat]);
  }
  return coords;
}

export const CATEGORY_ICONS: Record<string, typeof MapPin> = {
  school: GraduationCap,
  hospital: Hospital,
  shopping: ShoppingBag,
  park: Trees,
  transport: Navigation,
  other: Building2,
};
