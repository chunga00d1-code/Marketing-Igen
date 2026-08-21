export type RealEstateMapCoordinate = {
  lat: number;
  lng: number;
};

export type RealEstateMapVideoSpec = {
  aspectRatio: "9:16" | "16:9" | "1:1";
  resolution: "720p" | "1080p";
  durationSeconds: number;
};

export type RealEstateMapPolygon = {
  type: "Polygon";
  coordinates: number[][][];
};

export type RealEstateMapPoiCategory =
  | "school"
  | "hospital"
  | "shopping"
  | "park"
  | "transport"
  | "other";

export type RealEstateMapPoi = {
  id: string;
  name: string;
  category: RealEstateMapPoiCategory | string;
  location: RealEstateMapCoordinate;
  distanceMeters?: number;
  durationMinutes?: number;
  sourceRef: string;
  confirmedByUser: boolean;
};

export type RealEstateMapRoute = {
  id: string;
  fromId: string;
  toId: string;
  toName?: string;
  geometry: {
    type: "LineString";
    coordinates: number[][];
  };
  distanceMeters: number;
  durationSeconds: number;
  sourceRef: string;
  confirmedByUser: boolean;
};

export type RealEstateMapCameraKeyframe = {
  atSeconds: number;
  center: RealEstateMapCoordinate;
  zoom: number;
  pitch: number;
  bearing: number;
};

export type RealEstateMapScenePreset =
  | "zoom-to-project"
  | "project-boundary"
  | "route-follow"
  | "overview";

export type RealEstateMapScene = {
  id: string;
  preset: RealEstateMapScenePreset;
  startSeconds: number;
  endSeconds: number;
  camera: RealEstateMapCameraKeyframe[];
};

export type RealEstateMapProviderSnapshot = {
  provider: "vietmap" | "mock";
  product: string;
  styleVersion?: string;
  attribution: string[];
  requestCount?: number;
};

export type RealEstateMapBranding = {
  logoUrl?: string;
  ctaText?: string;
  hotline?: string;
  brandColor?: string;
};

export type RealEstateMapProjectSnapshot = {
  name: string;
  address: string;
  location: RealEstateMapCoordinate;
  boundary?: RealEstateMapPolygon;
  verifiedFields: string[];
  pois: RealEstateMapPoi[];
  routes: RealEstateMapRoute[];
  branding?: RealEstateMapBranding;
  scenes: RealEstateMapScene[];
  provider: RealEstateMapProviderSnapshot;
  videoSpec: RealEstateMapVideoSpec;
};

export type RealEstateMapErrorCategory =
  | "permission"
  | "quota"
  | "timeout"
  | "invalid-data"
  | "coverage"
  | "unavailable";

export type MapLocationResult = {
  address: string;
  name?: string;
  location: RealEstateMapCoordinate;
  sourceRef: string;
};

export type PlaceSearchInput = {
  location: RealEstateMapCoordinate;
  radiusMeters?: number;
  category?: RealEstateMapPoiCategory | string;
  limit?: number;
};

export type RouteInput = {
  from: RealEstateMapCoordinate;
  to: RealEstateMapCoordinate;
  fromId?: string;
  toId?: string;
  toName?: string;
};

export type MapStyleDescriptor = {
  provider: "vietmap" | "mock";
  styleUrl?: string;
  attribution: string[];
  tileSize?: number;
  minZoom?: number;
  maxZoom?: number;
};

export interface RealEstateMapProvider {
  readonly providerName: "vietmap" | "mock";
  geocode(query: string): Promise<MapLocationResult[]>;
  reverseGeocode(location: RealEstateMapCoordinate): Promise<MapLocationResult>;
  searchPlaces(input: PlaceSearchInput): Promise<RealEstateMapPoi[]>;
  getRoute(input: RouteInput): Promise<RealEstateMapRoute>;
  getStyle(): Promise<MapStyleDescriptor>;
}
