import type {
  MapLocationResult,
  MapStyleDescriptor,
  PlaceSearchInput,
  RealEstateMapCoordinate,
  RealEstateMapPoi,
  RealEstateMapProvider,
  RealEstateMapRoute,
  RouteInput,
} from "../../../interface/real-estate-map-video.interface";
import { MockMapProvider } from "./mock-map.provider";

export class VietmapProvider implements RealEstateMapProvider {
  readonly providerName = "vietmap" as const;
  private readonly apiKey: string;
  private readonly fallbackMock: MockMapProvider;
  private readonly timeoutMs = 8000;

  constructor(apiKey?: string) {
    this.apiKey = (apiKey || process.env.VIETMAP_API_KEY || process.env.VIETMAP_SERVER_API_KEY || "").trim();
    this.fallbackMock = new MockMapProvider();
  }

  private isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.length > 5);
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async geocode(query: string): Promise<MapLocationResult[]> {
    if (!this.isConfigured()) {
      return this.fallbackMock.geocode(query);
    }

    try {
      const url = `https://maps.vietmap.vn/api/autocomplete/v3?apikey=${encodeURIComponent(this.apiKey)}&text=${encodeURIComponent(query)}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return this.fallbackMock.geocode(query);
      }

      const data = (await response.json()) as Array<{
        name?: string;
        address?: string;
        display?: string;
        lat?: number;
        lng?: number;
        ref_id?: string;
      }>;

      if (Array.isArray(data) && data.length > 0) {
        return data
          .filter((item) => typeof item.lat === "number" && typeof item.lng === "number")
          .map((item) => ({
            name: item.name || item.display || query,
            address: item.address || item.display || `${query}, Việt Nam`,
            location: { lat: item.lat as number, lng: item.lng as number },
            sourceRef: `vietmap-geocode:${item.ref_id || `${item.lat},${item.lng}`}`,
          }));
      }

      return this.fallbackMock.geocode(query);
    } catch {
      return this.fallbackMock.geocode(query);
    }
  }

  async reverseGeocode(location: RealEstateMapCoordinate): Promise<MapLocationResult> {
    if (!this.isConfigured()) {
      return this.fallbackMock.reverseGeocode(location);
    }

    try {
      const url = `https://maps.vietmap.vn/api/reverse/v3?apikey=${encodeURIComponent(this.apiKey)}&lat=${location.lat}&lng=${location.lng}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return this.fallbackMock.reverseGeocode(location);
      }

      const data = (await response.json()) as Array<{
        name?: string;
        address?: string;
        display?: string;
        ref_id?: string;
      }> | { name?: string; address?: string; display?: string; ref_id?: string };

      const item = Array.isArray(data) ? data[0] : data;
      if (item) {
        return {
          name: item.name || item.display || "Vị trí đã chọn",
          address: item.address || item.display || `Tọa độ ${location.lat}, ${location.lng}`,
          location: { ...location },
          sourceRef: `vietmap-reverse:${item.ref_id || `${location.lat},${location.lng}`}`,
        };
      }

      return this.fallbackMock.reverseGeocode(location);
    } catch {
      return this.fallbackMock.reverseGeocode(location);
    }
  }

  async searchPlaces(input: PlaceSearchInput): Promise<RealEstateMapPoi[]> {
    if (!this.isConfigured()) {
      return this.fallbackMock.searchPlaces(input);
    }

    try {
      const radius = input.radiusMeters || 3000;
      const url = `https://maps.vietmap.vn/api/place/v3?apikey=${encodeURIComponent(this.apiKey)}&point=${input.location.lat},${input.location.lng}&radius=${radius}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return this.fallbackMock.searchPlaces(input);
      }

      const data = (await response.json()) as Array<{
        name?: string;
        category?: string;
        lat?: number;
        lng?: number;
        distance?: number;
        ref_id?: string;
      }>;

      if (Array.isArray(data) && data.length > 0) {
        return data.slice(0, input.limit || 5).map((item, idx) => ({
          id: `poi-${item.ref_id || idx + 1}`,
          name: item.name || `Tiện ích ${idx + 1}`,
          category: item.category || input.category || "other",
          location: { lat: item.lat || input.location.lat, lng: item.lng || input.location.lng },
          distanceMeters: item.distance || 500,
          durationMinutes: Math.max(1, Math.round((item.distance || 500) / 450)),
          sourceRef: `vietmap-place:${item.ref_id || `${item.lat},${item.lng}`}`,
          confirmedByUser: true,
        }));
      }

      return this.fallbackMock.searchPlaces(input);
    } catch {
      return this.fallbackMock.searchPlaces(input);
    }
  }

  async getRoute(input: RouteInput): Promise<RealEstateMapRoute> {
    if (!this.isConfigured()) {
      return this.fallbackMock.getRoute(input);
    }

    try {
      const url = `https://maps.vietmap.vn/api/route/v2?apikey=${encodeURIComponent(this.apiKey)}&point=${input.from.lat},${input.from.lng}&point=${input.to.lat},${input.to.lng}&vehicle=car`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        return this.fallbackMock.getRoute(input);
      }

      const data = (await response.json()) as {
        paths?: Array<{
          distance?: number;
          time?: number;
          points?: {
            coordinates?: number[][];
          };
        }>;
      };

      const path = data.paths?.[0];
      if (path && Array.isArray(path.points?.coordinates) && path.points.coordinates.length > 1) {
        return {
          id: `vietmap-route-${Date.now()}`,
          fromId: input.fromId || "origin",
          toId: input.toId || "destination",
          toName: input.toName || "Điểm đến",
          geometry: {
            type: "LineString",
            coordinates: path.points.coordinates,
          },
          distanceMeters: Math.round(path.distance || 1000),
          durationSeconds: Math.round((path.time || 180000) / 1000),
          sourceRef: `vietmap-route:${input.from.lat},${input.from.lng}->${input.to.lat},${input.to.lng}`,
          confirmedByUser: true,
        };
      }

      return this.fallbackMock.getRoute(input);
    } catch {
      return this.fallbackMock.getRoute(input);
    }
  }

  async getStyle(): Promise<MapStyleDescriptor> {
    if (this.isConfigured()) {
      return {
        provider: "vietmap",
        styleUrl: `https://maps.vietmap.vn/api/maps/light/styles.json?apikey=${this.apiKey}`,
        attribution: ["© VIETMAP", "© OpenStreetMap contributors"],
        minZoom: 1,
        maxZoom: 19,
      };
    }
    return this.fallbackMock.getStyle();
  }
}
