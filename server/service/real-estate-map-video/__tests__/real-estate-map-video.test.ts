import assert from "node:assert/strict";
import test from "node:test";
import { MockMapProvider } from "../provider/mock-map.provider";
import { VietmapProvider } from "../provider/vietmap.provider";
import {
  buildRealEstateMapProjectSnapshot,
  composeRealEstateMapSnapshot,
} from "../map-scene-engine.service";
import {
  createRenderBodySchema,
  geocodeBodySchema,
  getRouteBodySchema,
  listRendersQuerySchema,
  saveRealEstateMapVideoDraftBodySchema,
} from "../../../router/real-estate-map-video.schemas";

test("MockMapProvider geocodes known locations and fallbacks", async () => {
  const provider = new MockMapProvider();
  const results = await provider.geocode("Thủ Thiêm");
  assert.ok(results.length > 0);
  assert.ok(results[0].name.includes("Thủ Thiêm"));
  assert.ok(results[0].location.lat > 10 && results[0].location.lng > 106);

  const fallback = await provider.geocode("Dự án tương lai ABC");
  assert.ok(fallback.length > 0);
  assert.equal(fallback[0].name, "Dự án tương lai ABC");
});

test("MockMapProvider reverseGeocode returns formatted address", async () => {
  const provider = new MockMapProvider();
  const result = await provider.reverseGeocode({ lat: 10.7719, lng: 106.7212 });
  assert.ok(result.address.length > 5);
  assert.equal(result.location.lat, 10.7719);
});

test("MockMapProvider searchPlaces returns POIs with distance and duration", async () => {
  const provider = new MockMapProvider();
  const pois = await provider.searchPlaces({
    location: { lat: 10.7719, lng: 106.7212 },
    radiusMeters: 5000,
    limit: 5,
  });
  assert.ok(pois.length > 0);
  assert.ok(pois[0].distanceMeters !== undefined && pois[0].distanceMeters >= 0);
  assert.ok(pois[0].durationMinutes !== undefined && pois[0].durationMinutes >= 1);
  assert.ok(pois[0].name.length > 0);
});

test("MockMapProvider getRoute returns valid LineString geometry and travel stats", async () => {
  const provider = new MockMapProvider();
  const route = await provider.getRoute({
    from: { lat: 10.7719, lng: 106.7212 },
    to: { lat: 10.7937, lng: 106.7217 },
    toName: "Landmark 81",
  });
  assert.equal(route.geometry.type, "LineString");
  assert.ok(route.geometry.coordinates.length >= 2);
  assert.ok(route.distanceMeters > 0);
  assert.ok(route.durationSeconds > 0);
});

test("VietmapProvider gracefully falls back to mock when unconfigured", async () => {
  const provider = new VietmapProvider("");
  const results = await provider.geocode("Vinhomes Central Park");
  assert.ok(results.length > 0);
  assert.ok(results[0].location.lat > 0);
});

test("map-scene-engine builds snapshot and composes valid HTML/CSS/voice", () => {
  const snapshot = buildRealEstateMapProjectSnapshot({
    name: "Khu đô thị SwanBay",
    address: "Đảo Đại Phước, Nhơn Trạch, Đồng Nai",
    location: { lat: 10.7258, lng: 106.8425 },
    boundary: [
      [106.84, 10.72],
      [106.85, 10.72],
      [106.85, 10.73],
      [106.84, 10.73],
      [106.84, 10.72],
    ],
    pois: [
      {
        id: "poi-1",
        name: "Sân Golf Jeongsun",
        category: "park",
        location: { lat: 10.728, lng: 106.845 },
        distanceMeters: 500,
        durationMinutes: 2,
        sourceRef: "mock",
        confirmedByUser: true,
      },
    ],
    branding: {
      hotline: "0909 123 456",
      ctaText: "Đăng ký nhận ưu đãi VIP SwanBay",
    },
    vfxConfig: {
      boundaryTheme: "gold-luxury",
      showRadiusPulse: true,
      showAnimatedRoutes: true,
      show3DBillboards: true,
    },
  });

  assert.equal(snapshot.name, "Khu đô thị SwanBay");
  assert.equal(snapshot.scenes.length, 4);
  assert.ok(snapshot.verifiedFields.includes("pois"));
  assert.ok(snapshot.verifiedFields.includes("boundary"));
  assert.equal(snapshot.vfxConfig?.boundaryTheme, "gold-luxury");

  const composition = composeRealEstateMapSnapshot(snapshot);
  assert.ok(composition.html.includes("Khu đô thị SwanBay"));
  assert.ok(composition.css.includes("@keyframes map-camera-1"));
  assert.ok(composition.css.includes("--vfx-primary: #ffd700"));
  assert.ok(composition.voiceScript.includes("SwanBay"));
  assert.ok(composition.voiceScript.includes("0909 123 456") || composition.voiceScript.includes("Đăng ký nhận"));
  assert.equal(composition.scenePlan.length, 4);
});

test("Joi validation accepts valid draft with vfxConfig and rejects invalid coordinates", () => {
  const validDraft = {
    name: "Dự án Grand Garden",
    address: "Quận 2, TP. Thủ Đức",
    location: { lat: 10.78, lng: 106.74 },
    boundary: [
      [106.74, 10.78],
      [106.75, 10.78],
      [106.75, 10.79],
      [106.74, 10.78],
    ],
    pois: [
      {
        id: "p1",
        name: "Trường Quốc tế",
        category: "school",
        location: { lat: 10.785, lng: 106.745 },
      },
    ],
    vfxConfig: {
      boundaryTheme: "cyan-neon",
      showRadiusPulse: true,
    },
  };

  const { error: validErr } = saveRealEstateMapVideoDraftBodySchema.validate(validDraft);
  assert.equal(validErr, undefined);

  const invalidDraft = {
    name: "Dự án lỗi",
    location: { lat: 195, lng: 106.74 }, // lat > 90
    boundary: [],
  };

  const { error: invalidErr } = saveRealEstateMapVideoDraftBodySchema.validate(invalidDraft);
  assert.ok(invalidErr !== undefined);

  const { error: geocodeErr } = geocodeBodySchema.validate({ query: "A" }); // min 2
  assert.ok(geocodeErr !== undefined);

  const { error: routeErr } = getRouteBodySchema.validate({
    from: { lat: 10.7, lng: 106.7 },
    to: { lat: 10.8, lng: 106.8 },
  });
  assert.equal(routeErr, undefined);

  const { error: renderErr } = createRenderBodySchema.validate({
    idempotencyKey: "test_key_123",
  });
  assert.equal(renderErr, undefined);

  const { error: listErr } = listRendersQuerySchema.validate({
    page: 2,
    pageSize: 15,
    status: "completed",
  });
  assert.equal(listErr, undefined);
});
