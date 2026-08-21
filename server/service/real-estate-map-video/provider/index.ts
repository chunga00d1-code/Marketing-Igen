import type { RealEstateMapProvider } from "../../../interface/real-estate-map-video.interface";
import { MockMapProvider } from "./mock-map.provider";
import { VietmapProvider } from "./vietmap.provider";

let defaultProvider: RealEstateMapProvider | null = null;

export function getMapProvider(): RealEstateMapProvider {
  if (!defaultProvider) {
    if (process.env.VIETMAP_API_KEY || process.env.VIETMAP_SERVER_API_KEY) {
      defaultProvider = new VietmapProvider();
    } else {
      defaultProvider = new MockMapProvider();
    }
  }
  return defaultProvider;
}

export { MockMapProvider, VietmapProvider };
