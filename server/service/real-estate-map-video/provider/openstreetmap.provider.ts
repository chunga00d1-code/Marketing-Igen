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

export class OpenStreetMapProvider implements RealEstateMapProvider {
  readonly providerName = "openstreetmap" as const;
  private readonly fallbackMock: MockMapProvider;
  private readonly timeoutMs = 6000;

  constructor() {
    this.fallbackMock = new MockMapProvider();
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await fetch(url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "iGenMarketingWorkspace/1.0 (contact@igen.vn)",
          "Accept-Language": "vi,en;q=0.9",
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }

  async geocode(query: string): Promise<MapLocationResult[]> {
    const trimmed = query.trim();
    if (!trimmed) return [];

    try {
      // 1. Thử tìm kiếm qua Nominatim OpenStreetMap với countrycode VN
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=json&addressdetails=1&countrycodes=vn&limit=8`;
      const res = await this.fetchWithTimeout(url);

      if (res.ok) {
        const data = (await res.json()) as Array<{
          place_id?: number;
          lat?: string;
          lon?: string;
          display_name?: string;
          name?: string;
          type?: string;
          address?: Record<string, string>;
        }>;

        if (Array.isArray(data) && data.length > 0) {
          const results: MapLocationResult[] = data
            .filter((item) => item.lat && item.lon)
            .map((item) => {
              const lat = parseFloat(item.lat!);
              const lng = parseFloat(item.lon!);
              const addr = item.address || {};
              const road = addr.road || addr.suburb || addr.neighbourhood || "";
              const district = addr.city_district || addr.district || addr.county || "";
              const city = addr.city || addr.state || addr.province || "Việt Nam";
              const formattedAddress = [road, district, city].filter(Boolean).join(", ") || item.display_name || trimmed;

              return {
                name: item.name || road || trimmed,
                address: formattedAddress,
                location: { lat, lng },
                sourceRef: `osm-nominatim:${item.place_id || `${lat},${lng}`}`,
              };
            });

          if (results.length > 0) {
            return results;
          }
        }
      }

      // 2. Thử Photon Geocoding nếu Nominatim không phản hồi
      const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(trimmed)}&limit=6&lat=10.77&lon=106.70`;
      const photonRes = await this.fetchWithTimeout(photonUrl);
      if (photonRes.ok) {
        const photonData = (await photonRes.json()) as {
          features?: Array<{
            geometry?: { coordinates?: [number, number] };
            properties?: { name?: string; street?: string; city?: string; state?: string; country?: string };
          }>;
        };

        if (photonData.features && photonData.features.length > 0) {
          const results: MapLocationResult[] = photonData.features
            .filter((f) => f.geometry?.coordinates && f.geometry.coordinates.length >= 2)
            .map((f) => {
              const [lng, lat] = f.geometry!.coordinates!;
              const p = f.properties || {};
              const name = p.name || p.street || trimmed;
              const formattedAddress = [p.street, p.city, p.state, p.country || "Việt Nam"].filter(Boolean).join(", ");

              return {
                name,
                address: formattedAddress || `${name}, Việt Nam`,
                location: { lat, lng },
                sourceRef: `photon:${lat},${lng}`,
              };
            });

          if (results.length > 0) {
            return results;
          }
        }
      }

      // 3. Fallback vào Mock Database (chứa hơn 40 dự án BĐS lớn)
      return this.fallbackMock.geocode(query);
    } catch {
      return this.fallbackMock.geocode(query);
    }
  }

  async reverseGeocode(location: RealEstateMapCoordinate): Promise<MapLocationResult> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${location.lat}&lon=${location.lng}&format=json&addressdetails=1`;
      const res = await this.fetchWithTimeout(url);

      if (res.ok) {
        const item = (await res.json()) as {
          name?: string;
          display_name?: string;
          address?: Record<string, string>;
        };

        if (item && item.display_name) {
          const addr = item.address || {};
          const road = addr.road || addr.suburb || addr.neighbourhood || item.name || "Vị trí đã chọn";
          const district = addr.city_district || addr.district || addr.county || "";
          const city = addr.city || addr.state || addr.province || "Việt Nam";
          const formattedAddress = [road, district, city].filter(Boolean).join(", ") || item.display_name;

          return {
            name: item.name || road,
            address: formattedAddress,
            location: { ...location },
            sourceRef: `osm-reverse:${location.lat.toFixed(6)},${location.lng.toFixed(6)}`,
          };
        }
      }

      return this.fallbackMock.reverseGeocode(location);
    } catch {
      return this.fallbackMock.reverseGeocode(location);
    }
  }

  async searchPlaces(input: PlaceSearchInput): Promise<RealEstateMapPoi[]> {
    return this.fallbackMock.searchPlaces(input);
  }

  async getRoute(input: RouteInput): Promise<RealEstateMapRoute> {
    return this.fallbackMock.getRoute(input);
  }

  async getStyle(): Promise<MapStyleDescriptor> {
    return {
      provider: "openstreetmap",
      attribution: ["© OpenStreetMap contributors"],
      minZoom: 1,
      maxZoom: 22,
    };
  }
}
