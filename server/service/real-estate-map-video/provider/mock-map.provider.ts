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

type MockLocationItem = {
  name: string;
  address: string;
  location: RealEstateMapCoordinate;
  pois: Array<{ name: string; category: string; offsetLat: number; offsetLng: number; distanceMeters: number; durationMinutes: number }>;
};

const MOCK_LOCATIONS: MockLocationItem[] = [
  {
    name: "Khu đô thị Thủ Thiêm",
    address: "Phường An Khánh, TP. Thủ Đức, TP. Hồ Chí Minh",
    location: { lat: 10.7719, lng: 106.7212 },
    pois: [
      { name: "Cầu Ba Son (Thủ Thiêm 2)", category: "transport", offsetLat: 0.005, offsetLng: -0.012, distanceMeters: 1200, durationMinutes: 3 },
      { name: "Trung tâm Thương mại Thiso Mall", category: "shopping", offsetLat: -0.003, offsetLng: 0.004, distanceMeters: 600, durationMinutes: 2 },
      { name: "Bệnh viện Quốc tế Mỹ (AIH)", category: "hospital", offsetLat: 0.012, offsetLng: 0.025, distanceMeters: 3100, durationMinutes: 7 },
      { name: "Trường Quốc tế Úc (AIS)", category: "school", offsetLat: 0.008, offsetLng: 0.018, distanceMeters: 2200, durationMinutes: 5 },
      { name: "Công viên Bờ sông Sài Gòn", category: "park", offsetLat: -0.004, offsetLng: -0.008, distanceMeters: 900, durationMinutes: 3 },
    ],
  },
  {
    name: "Vinhomes Central Park",
    address: "208 Nguyễn Hữu Cảnh, Phường 22, Bình Thạnh, TP. Hồ Chí Minh",
    location: { lat: 10.7937, lng: 106.7217 },
    pois: [
      { name: "Tòa tháp Landmark 81", category: "shopping", offsetLat: 0.001, offsetLng: 0.001, distanceMeters: 150, durationMinutes: 1 },
      { name: "Bệnh viện Đa khoa Quốc tế Vinmec", category: "hospital", offsetLat: -0.002, offsetLng: -0.002, distanceMeters: 400, durationMinutes: 2 },
      { name: "Trường Vinschool Central Park", category: "school", offsetLat: 0.003, offsetLng: -0.001, distanceMeters: 350, durationMinutes: 2 },
      { name: "Ga Metro Tân Cảng", category: "transport", offsetLat: 0.006, offsetLng: -0.005, distanceMeters: 850, durationMinutes: 3 },
      { name: "Công viên ven sông 14ha", category: "park", offsetLat: -0.004, offsetLng: 0.003, distanceMeters: 300, durationMinutes: 1 },
    ],
  },
  {
    name: "Vinhomes Grand Park",
    address: "Đường Nguyễn Xiển, Phường Long Thạnh Mỹ, TP. Thủ Đức, TP. Hồ Chí Minh",
    location: { lat: 10.8402, lng: 106.8403 },
    pois: [
      { name: "Đại công viên 36ha Grand Park", category: "park", offsetLat: 0.002, offsetLng: 0.003, distanceMeters: 300, durationMinutes: 1 },
      { name: "Vincom Mega Mall Grand Park", category: "shopping", offsetLat: -0.002, offsetLng: -0.002, distanceMeters: 400, durationMinutes: 2 },
      { name: "Trường liên cấp Vinschool Grand Park", category: "school", offsetLat: 0.004, offsetLng: 0.001, distanceMeters: 500, durationMinutes: 2 },
      { name: "Bệnh viện Đa khoa Quốc tế Vinmec Grand Park", category: "hospital", offsetLat: -0.005, offsetLng: 0.004, distanceMeters: 800, durationMinutes: 3 },
      { name: "Bến xe Miền Đông mới & Ga Metro Bến Thành - Suối Tiên", category: "transport", offsetLat: 0.025, offsetLng: -0.015, distanceMeters: 4200, durationMinutes: 8 },
    ],
  },
  {
    name: "Khu đô thị Sala Đại Quang Minh",
    address: "10 Mai Chí Thọ, Phường An Lợi Đông, TP. Thủ Đức, TP. Hồ Chí Minh",
    location: { lat: 10.7686, lng: 106.7198 },
    pois: [
      { name: "Công viên sinh thái Sala", category: "park", offsetLat: 0.002, offsetLng: -0.003, distanceMeters: 350, durationMinutes: 2 },
      { name: "Tòa nhà Socar Sala Mall", category: "shopping", offsetLat: -0.001, offsetLng: 0.002, distanceMeters: 200, durationMinutes: 1 },
      { name: "Trường Quốc tế Việt Úc (VAS Sala)", category: "school", offsetLat: 0.004, offsetLng: 0.003, distanceMeters: 500, durationMinutes: 2 },
      { name: "Hầm vượt sông Sài Gòn (Hầm Thủ Thiêm)", category: "transport", offsetLat: -0.008, offsetLng: -0.014, distanceMeters: 1800, durationMinutes: 4 },
    ],
  },
  {
    name: "The Global City",
    address: "Đỗ Xuân Hợp, Phường An Phú, TP. Thủ Đức, TP. Hồ Chí Minh",
    location: { lat: 10.7958, lng: 106.7725 },
    pois: [
      { name: "Kênh đào nhạc nước The Canal of Lights", category: "park", offsetLat: 0.002, offsetLng: 0.002, distanceMeters: 250, durationMinutes: 1 },
      { name: "Khu thương mại SOHO The Global City", category: "shopping", offsetLat: -0.001, offsetLng: -0.002, distanceMeters: 300, durationMinutes: 1 },
      { name: "Nút giao cao tốc TP.HCM - Long Thành - Dầu Giây", category: "transport", offsetLat: 0.008, offsetLng: 0.006, distanceMeters: 1200, durationMinutes: 3 },
      { name: "Bệnh viện Quốc tế Mỹ (AIH)", category: "hospital", offsetLat: -0.015, offsetLng: -0.022, distanceMeters: 3200, durationMinutes: 7 },
    ],
  },
  {
    name: "Khu đô thị Phú Mỹ Hưng",
    address: "Đại lộ Nguyễn Văn Linh, Phường Tân Phong, Quận 7, TP. Hồ Chí Minh",
    location: { lat: 10.7289, lng: 106.7092 },
    pois: [
      { name: "Trung tâm Thương mại Crescent Mall", category: "shopping", offsetLat: 0.002, offsetLng: 0.008, distanceMeters: 900, durationMinutes: 3 },
      { name: "Hồ Bán Nguyệt & Cầu Ánh Sao", category: "park", offsetLat: 0.004, offsetLng: 0.006, distanceMeters: 800, durationMinutes: 3 },
      { name: "Bệnh viện Quốc tế FV", category: "hospital", offsetLat: -0.005, offsetLng: 0.012, distanceMeters: 1400, durationMinutes: 4 },
      { name: "Trường Quốc tế Nam Sài Gòn (SSIS)", category: "school", offsetLat: 0.003, offsetLng: 0.004, distanceMeters: 600, durationMinutes: 2 },
    ],
  },
  {
    name: "Masteri Thảo Điền",
    address: "159 Xa lộ Hà Nội, Phường Thảo Điền, TP. Thủ Đức, TP. Hồ Chí Minh",
    location: { lat: 10.8016, lng: 106.7418 },
    pois: [
      { name: "Vincom Mega Mall Thảo Điền", category: "shopping", offsetLat: 0.001, offsetLng: 0.001, distanceMeters: 100, durationMinutes: 1 },
      { name: "Ga Metro An Phú (Tuyến số 1)", category: "transport", offsetLat: 0.002, offsetLng: -0.001, distanceMeters: 150, durationMinutes: 1 },
      { name: "Bệnh viện Quốc tế Thảo Điền", category: "hospital", offsetLat: 0.006, offsetLng: -0.005, distanceMeters: 900, durationMinutes: 3 },
      { name: "Trường Quốc tế BIS (British International School)", category: "school", offsetLat: 0.008, offsetLng: 0.002, distanceMeters: 1100, durationMinutes: 4 },
    ],
  },
  {
    name: "Vinhomes Ocean Park 1",
    address: "Đa Tốn, Huyện Gia Lâm, TP. Hà Nội",
    location: { lat: 20.9922, lng: 105.9425 },
    pois: [
      { name: "Biển hồ nước mặn Crystal Lagoon", category: "park", offsetLat: 0.002, offsetLng: 0.004, distanceMeters: 500, durationMinutes: 2 },
      { name: "Vincom Mega Mall Ocean Park", category: "shopping", offsetLat: -0.004, offsetLng: -0.002, distanceMeters: 800, durationMinutes: 3 },
      { name: "Đại học Quốc tế VinUni", category: "school", offsetLat: -0.006, offsetLng: 0.003, distanceMeters: 1100, durationMinutes: 4 },
      { name: "Bệnh viện Đa khoa Quốc tế Vinmec Ocean Park", category: "hospital", offsetLat: 0.005, offsetLng: -0.003, distanceMeters: 950, durationMinutes: 3 },
      { name: "Nút giao Cổ Linh - Cao tốc Hà Nội - Hải Phòng", category: "transport", offsetLat: 0.015, offsetLng: -0.02, distanceMeters: 3500, durationMinutes: 6 },
    ],
  },
  {
    name: "Vinhomes Smart City",
    address: "Đại lộ Thăng Long, Phường Tây Mỗ, Quận Nam Từ Liêm, TP. Hà Nội",
    location: { lat: 20.9984, lng: 105.7483 },
    pois: [
      { name: "Vườn Nhật Zen Park lớn nhất Đông Nam Á", category: "park", offsetLat: 0.003, offsetLng: 0.002, distanceMeters: 400, durationMinutes: 2 },
      { name: "Vincom Mega Mall Smart City", category: "shopping", offsetLat: -0.002, offsetLng: -0.003, distanceMeters: 450, durationMinutes: 2 },
      { name: "Trường liên cấp Vinschool Smart City", category: "school", offsetLat: 0.004, offsetLng: -0.001, distanceMeters: 550, durationMinutes: 2 },
      { name: "Trung tâm Hội nghị Quốc gia & Mỹ Đình", category: "transport", offsetLat: 0.022, offsetLng: 0.035, distanceMeters: 4500, durationMinutes: 8 },
    ],
  },
  {
    name: "Khu đô thị Ecopark",
    address: "Xuân Quan, Huyện Văn Giang, Tỉnh Hưng Yên (Giáp ranh Hà Nội)",
    location: { lat: 20.9634, lng: 105.9329 },
    pois: [
      { name: "Công viên Hồ Thiên Nga Swan Lake", category: "park", offsetLat: 0.002, offsetLng: -0.003, distanceMeters: 350, durationMinutes: 2 },
      { name: "Đại học Y khoa Tokyo & BUV (British University Vietnam)", category: "school", offsetLat: 0.008, offsetLng: 0.005, distanceMeters: 1200, durationMinutes: 3 },
      { name: "Khu thương mại Vịnh Đảo Ecopark", category: "shopping", offsetLat: -0.004, offsetLng: 0.002, distanceMeters: 600, durationMinutes: 2 },
      { name: "Cầu Bắc Hưng Hải & Cầu Vĩnh Tuy 2", category: "transport", offsetLat: 0.018, offsetLng: -0.015, distanceMeters: 3800, durationMinutes: 7 },
    ],
  },
  {
    name: "Starlake Tây Hồ Tây",
    address: "Khu đô thị Tây Hồ Tây, Phường Xuân La, Quận Tây Hồ, TP. Hà Nội",
    location: { lat: 21.0558, lng: 105.7992 },
    pois: [
      { name: "Hồ điều hòa trung tâm Starlake", category: "park", offsetLat: 0.002, offsetLng: 0.002, distanceMeters: 300, durationMinutes: 1 },
      { name: "Tổ hợp Lotte Mall West Lake Hà Nội", category: "shopping", offsetLat: 0.012, offsetLng: 0.015, distanceMeters: 1800, durationMinutes: 4 },
      { name: "Khu hành chính các Bộ ngành Trung ương", category: "other", offsetLat: -0.004, offsetLng: -0.003, distanceMeters: 700, durationMinutes: 2 },
      { name: "Đường vành đai 2.5 và đường Võ Chí Công", category: "transport", offsetLat: 0.005, offsetLng: 0.008, distanceMeters: 1100, durationMinutes: 3 },
    ],
  },
  {
    name: "Khu đô thị Aqua City",
    address: "Xã Long Hưng, TP. Biên Hòa, Tỉnh Đồng Nai",
    location: { lat: 10.8872, lng: 106.8624 },
    pois: [
      { name: "Quảng trường Aqua Marina & Bến du thuyền", category: "park", offsetLat: 0.003, offsetLng: -0.004, distanceMeters: 500, durationMinutes: 2 },
      { name: "Trung tâm thương mại Aqua Central Mall", category: "shopping", offsetLat: -0.002, offsetLng: 0.002, distanceMeters: 400, durationMinutes: 2 },
      { name: "Bệnh viện Quốc tế Aqua Care", category: "hospital", offsetLat: 0.006, offsetLng: 0.005, distanceMeters: 900, durationMinutes: 3 },
      { name: "Sân bay Quốc tế Long Thành", category: "transport", offsetLat: 0.045, offsetLng: 0.082, distanceMeters: 14000, durationMinutes: 18 },
    ],
  },
  {
    name: "SwanBay Đảo Đại Phước",
    address: "Cù lao Ông Cồn, Huyện Nhơn Trạch, Tỉnh Đồng Nai",
    location: { lat: 10.7423, lng: 106.8285 },
    pois: [
      { name: "Sân Golf Quốc tế Jeongsan 18 lỗ", category: "park", offsetLat: 0.006, offsetLng: 0.005, distanceMeters: 800, durationMinutes: 3 },
      { name: "Bến du thuyền SwanBay Marina", category: "transport", offsetLat: -0.003, offsetLng: -0.004, distanceMeters: 450, durationMinutes: 2 },
      { name: "Công viên ven sông 4 mặt giáp nước", category: "park", offsetLat: 0.004, offsetLng: -0.006, distanceMeters: 650, durationMinutes: 2 },
      { name: "Nút giao Vành đai 3 & Cầu Nhơn Trạch", category: "transport", offsetLat: 0.025, offsetLng: -0.035, distanceMeters: 4800, durationMinutes: 9 },
    ],
  },
  {
    name: "Sun Cosmo Residence",
    address: "Trần Thị Lý, Bắc Mỹ Phú, Ngũ Hành Sơn, TP. Đà Nẵng",
    location: { lat: 16.0528, lng: 108.2325 },
    pois: [
      { name: "Cầu Rồng & Cầu Trần Thị Lý", category: "transport", offsetLat: 0.008, offsetLng: -0.007, distanceMeters: 1400, durationMinutes: 4 },
      { name: "Bãi biển Mỹ Khê", category: "park", offsetLat: 0.002, offsetLng: 0.015, distanceMeters: 1800, durationMinutes: 5 },
      { name: "Bệnh viện Đa khoa Quốc tế Vinmec Đà Nẵng", category: "hospital", offsetLat: -0.015, offsetLng: -0.012, distanceMeters: 2600, durationMinutes: 7 },
      { name: "Sân bay Quốc tế Đà Nẵng", category: "transport", offsetLat: 0.003, offsetLng: -0.035, distanceMeters: 4200, durationMinutes: 10 },
    ],
  },
];

function calculateDistanceMeters(coord1: RealEstateMapCoordinate, coord2: RealEstateMapCoordinate): number {
  const earthRadius = 6371000;
  const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((coord1.lat * Math.PI) / 180) *
      Math.cos((coord2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(earthRadius * c);
}

function generateInterpolatedRoute(from: RealEstateMapCoordinate, to: RealEstateMapCoordinate): number[][] {
  const steps = 8;
  const points: number[][] = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    // Thêm một chút độ cong giả lập mạng lưới đường phố
    const curve = Math.sin(ratio * Math.PI) * 0.0008 * (i % 2 === 0 ? 1 : -0.8);
    const lat = from.lat + (to.lat - from.lat) * ratio + curve;
    const lng = from.lng + (to.lng - from.lng) * ratio + curve * 0.7;
    points.push([Number(lng.toFixed(6)), Number(lat.toFixed(6))]);
  }
  return points;
}

export class MockMapProvider implements RealEstateMapProvider {
  readonly providerName = "mock" as const;

  async geocode(query: string): Promise<MapLocationResult[]> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const matches = MOCK_LOCATIONS.filter(
      (item) =>
        item.name.toLowerCase().includes(normalized) ||
        item.address.toLowerCase().includes(normalized)
    );

    if (matches.length > 0) {
      return matches.map((item) => ({
        name: item.name,
        address: item.address,
        location: { ...item.location },
        sourceRef: `mock-geocode:${encodeURIComponent(item.name)}`,
      }));
    }

    // Nếu không khớp chính xác, sinh toạ độ giả lập gần TP.HCM hoặc Hà Nội
    const fallbackCoord = normalized.includes("hà nội") || normalized.includes("ha noi")
      ? { lat: 21.0285, lng: 105.8542 }
      : normalized.includes("đà nẵng") || normalized.includes("da nang")
        ? { lat: 16.0544, lng: 108.2022 }
        : { lat: 10.7769, lng: 106.7009 };

    return [
      {
        name: query.trim(),
        address: `${query.trim()}, Việt Nam`,
        location: fallbackCoord,
        sourceRef: `mock-geocode-fallback:${encodeURIComponent(query.trim())}`,
      },
    ];
  }

  async reverseGeocode(location: RealEstateMapCoordinate): Promise<MapLocationResult> {
    // Tìm điểm gần nhất trong danh sách
    let closest = MOCK_LOCATIONS[0];
    let minDistance = Infinity;

    for (const item of MOCK_LOCATIONS) {
      const distance = calculateDistanceMeters(location, item.location);
      if (distance < minDistance) {
        minDistance = distance;
        closest = item;
      }
    }

    const address = minDistance < 3000
      ? `Gần ${closest.name}, ${closest.address}`
      : `Tọa độ ${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}, Việt Nam`;

    return {
      name: minDistance < 1000 ? closest.name : "Vị trí đã chọn",
      address,
      location: { ...location },
      sourceRef: `mock-reverse:${location.lat.toFixed(6)},${location.lng.toFixed(6)}`,
    };
  }

  async searchPlaces(input: PlaceSearchInput): Promise<RealEstateMapPoi[]> {
    const radius = input.radiusMeters || 5000;
    const limit = input.limit || 5;

    // Tìm xem toạ độ có gần fixture nào không
    let matchedFixture = MOCK_LOCATIONS.find(
      (loc) => calculateDistanceMeters(input.location, loc.location) < 8000
    );

    if (!matchedFixture) matchedFixture = MOCK_LOCATIONS[0];

    const pois: RealEstateMapPoi[] = matchedFixture.pois.map((poi, idx) => {
      const poiLocation: RealEstateMapCoordinate = {
        lat: Number((input.location.lat + poi.offsetLat).toFixed(6)),
        lng: Number((input.location.lng + poi.offsetLng).toFixed(6)),
      };
      const distance = calculateDistanceMeters(input.location, poiLocation);
      const durationMinutes = Math.max(1, Math.round(distance / 450)); // ~27km/h nội đô

      return {
        id: `mock-poi-${idx + 1}`,
        name: poi.name,
        category: poi.category,
        location: poiLocation,
        distanceMeters: distance,
        durationMinutes,
        sourceRef: `mock-poi:${matchedFixture.name}:${poi.name}`,
        confirmedByUser: true,
      };
    });

    return pois
      .filter((poi) => (poi.distanceMeters || 0) <= radius)
      .slice(0, limit);
  }

  async getRoute(input: RouteInput): Promise<RealEstateMapRoute> {
    const distanceMeters = calculateDistanceMeters(input.from, input.to);
    const durationSeconds = Math.max(60, Math.round((distanceMeters / 1000) * 120)); // ~30km/h
    const coordinates = generateInterpolatedRoute(input.from, input.to);

    return {
      id: `route-${Date.now()}`,
      fromId: input.fromId || "origin",
      toId: input.toId || "destination",
      toName: input.toName || "Điểm đến",
      geometry: {
        type: "LineString",
        coordinates,
      },
      distanceMeters,
      durationSeconds,
      sourceRef: `mock-route:${input.from.lat.toFixed(4)},${input.from.lng.toFixed(4)}->${input.to.lat.toFixed(4)},${input.to.lng.toFixed(4)}`,
      confirmedByUser: true,
    };
  }

  async getStyle(): Promise<MapStyleDescriptor> {
    return {
      provider: "mock",
      attribution: ["© Bản đồ mô phỏng GIS"],
      minZoom: 1,
      maxZoom: 19,
    };
  }
}
