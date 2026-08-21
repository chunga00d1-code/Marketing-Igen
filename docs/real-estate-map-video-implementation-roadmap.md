# Roadmap Video Bất Động Sản từ Bản Đồ

## 1. Mục tiêu

Xây tính năng tạo video giới thiệu bất động sản từ địa chỉ hoặc tọa độ, có cảnh map bay/zoom/xoay, ranh giới dự án, tiện ích xung quanh, tuyến đường, nhãn thông tin, giọng đọc và MP4 hoàn chỉnh.

Video mẫu được tách thành ba lớp:

~~~text
Dữ liệu bản đồ/GIS
    + camera và hiệu ứng chuyển động
    + overlay thương hiệu, nội dung, voice
    = video MP4
~~~

Polygon chỉ là một lớp GIS. Giá trị hình ảnh chính đến từ camera choreography, route animation, label bám tọa độ, thiết kế overlay và nhịp dựng video.

## 2. Phạm vi MVP

MVP chỉ cần tạo video 20–30 giây, ưu tiên khung 9:16 1080p.

Người dùng có thể:

- nhập địa chỉ hoặc chọn điểm trên bản đồ;
- vẽ hoặc chỉnh polygon ranh giới dự án;
- chọn tối đa 5 POI và 3 tuyến đường;
- nhập thông tin, logo, CTA và chọn template;
- xem preview, xác nhận dữ liệu và render MP4;
- theo dõi trạng thái, retry lỗi hợp lệ và xem lịch sử.

Ba preset video đầu tiên:

1. **Zoom vào dự án:** từ khu vực rộng đến vị trí dự án.
2. **Ranh giới dự án:** polygon, marker, diện tích hoặc thông tin chính.
3. **Kết nối tiện ích:** route chạy tới trường học, bệnh viện, trung tâm hoặc trục đường.

Chưa đưa vào MVP: photorealistic 3D, mô hình tòa nhà riêng, dữ liệu quy hoạch tự động, batch lớn, campaign automation và After Effects automation.

## 3. Quyết định về nguồn bản đồ

### Provider ưu tiên

**VIETMAP** là phương án đầu tiên cho thị trường Việt Nam vì có tile/map style, satellite/hybrid, geocoding, POI và routing.

Trước khi dùng production, cần có xác nhận bằng văn bản cho đúng use-case:

- render tự động/headless trong worker;
- capture map frame và ghép thành MP4;
- lưu trữ và phân phối video;
- dùng cho video quảng cáo bất động sản;
- attribution bắt buộc;
- quota, giá và điều kiện cache.

Đăng ký API key thông thường không tự động đồng nghĩa với quyền bán video dẫn xuất.

### Provider dự phòng

**MapTiler** có thể là phương án thay thế nếu có thỏa thuận video/material license phù hợp. OpenStreetMap chỉ phù hợp làm dữ liệu/vector fallback khi tự host hoặc dùng nhà cung cấp thương mại; không dùng public tile/Nominatim cho production renderer.

### Không dùng làm nền production mặc định

Không dùng Google Earth/Earth Studio cho video quảng cáo BĐS nếu chưa có quyền phù hợp. Chính sách Google có giới hạn rõ với mục đích commercial/promotional, bao gồm ví dụ liên quan bất động sản.

### Licensing gate

Không chuyển sang satellite/3D production khi licensing gate chưa đạt. Trong lúc chờ vendor, chỉ làm với mock data hoặc vector/2.5D không cam kết chất lượng satellite.

## 4. Stack tích hợp

~~~text
VIETMAP APIs
  ├── satellite/hybrid tile hoặc map style
  ├── geocoding và reverse geocoding
  ├── POI/place search
  └── routing/matrix
          ↓
RealEstateMapProvider ở backend
          ↓
MapLibre GL JS + Turf.js + Terra Draw
          ↓
React workspace + Remotion Player
          ↓
BullMQ/Redis worker + Remotion Renderer
          ↓
FFmpeg mux/verify → Cloudinary → MP4
~~~

### Công cụ mới

| Công cụ | Vai trò | Ưu tiên |
| --- | --- | --- |
| VIETMAP API | Nền map, geocode, POI, route | P0 |
| MapLibre GL JS | WebGL map, camera, GeoJSON, marker, projection | P0 |
| GeoJSON | Định dạng lưu point, polygon, route, radius | P0 |
| Turf.js | Bbox, buffer, centroid, route progress | P0 |
| Terra Draw | Editor vẽ/chỉnh point, line, polygon | P1 |

Dependency dự kiến:

~~~bash
npm install maplibre-gl \
  @turf/bbox \
  @turf/buffer \
  @turf/centroid \
  @turf/length \
  @turf/along \
  @watergis/maplibre-gl-terradraw
~~~

Không cần thêm Axios hoặc React wrapper cho MapLibre trong MVP. Backend dùng fetch; frontend quản lý map instance bằng useRef.

### Công cụ có sẵn trong repository

| Công cụ hiện có | Dùng cho |
| --- | --- |
| React + Vite | Workspace, form, map editor, preview, history |
| Remotion Player | Play/pause/seek preview theo frame |
| Remotion Renderer/Bundler | Render composition trong Chromium |
| ffmpeg-static | Encode MP4, mux voice/nhạc, thumbnail, verify |
| BullMQ + Redis | Queue, progress, retry, idempotency, recovery |
| MongoDB/Mongoose | Project, snapshot, attempts, provenance, cost |
| Cloudinary | MP4, thumbnail, logo, media và audio |
| HTML-to-video TTS | Voice script, voice metadata, audio mux |

Chưa dùng Three.js, deck.gl, CesiumJS, PostGIS, GeoServer, QGIS Server hoặc GSAP. Chỉ đánh giá Three.js/Cesium sau khi 2D/2.5D ổn định và có nhu cầu 3D thật.

## 5. Trách nhiệm từng lớp

### Provider API

| Nhu cầu | Dữ liệu cần lấy/lưu |
| --- | --- |
| Tìm dự án | Query, tọa độ được chọn, xác nhận người dùng |
| Hiển thị địa chỉ | Reverse-geocode source reference |
| Hiển thị map | Provider, style/tile version, attribution, viewport |
| Chọn tiện ích | Tên, loại, tọa độ, provider ID, xác nhận |
| Vẽ tuyến đường | LineString, khoảng cách, thời gian, source reference |

Geocoding, POI, routing phải đi qua backend để bảo vệ service key, áp quota, rate limit, tenant scope và log chi phí. Tile/style render dùng key bị giới hạn theo domain/quota đúng chính sách provider.

### MapLibre GL JS

- Render raster/vector tile, satellite/hybrid style.
- Đặt camera bằng center, zoom, pitch, bearing.
- Render polygon bằng fill, line, fill-extrusion.
- Render route, marker và symbol layer.
- Dùng map.project() để HTML label bám tọa độ.
- Dùng jumpTo() và triggerRepaint() trong final render.

### Turf.js

- bbox: fit camera theo polygon/route.
- buffer: tạo vòng 1 km, 3 km, 5 km.
- centroid: tìm tâm khu vực.
- length: tính độ dài route.
- along: xác định đầu sáng, xe hoặc marker chạy theo tuyến.

### Terra Draw

Chỉ chạy trong editor để vẽ/chỉnh GeoJSON. Người dùng xác nhận geometry trước render; toolbar editor không bao giờ xuất hiện trong video.

## 6. Cấu trúc một video

Một template 25 giây có thể gồm:

| Thời lượng | Cảnh | Nội dung |
| --- | --- | --- |
| 0–4s | Opening | Toàn khu vực, headline dự án |
| 4–10s | Project focus | Zoom vào dự án, marker, polygon |
| 10–18s | Connectivity | Route chạy tới POI, thời gian/khoảng cách |
| 18–22s | Key facts | 2–3 điểm nổi bật, ảnh dự án nếu có |
| 22–25s | Closing | Logo, CTA, contact đã được xác minh |

Overlay có thể là HTML/CSS/React:

- logo, title, CTA;
- label dự án và POI;
- bảng khoảng cách/thời gian;
- glow, pulse, line progress, gradient;
- subtitle hoặc voice-led copy.

Map chỉ render vị trí và dữ liệu không gian; không dùng map để thay thế layout marketing.

## 7. Camera và timeline

Timeline phải xác định theo frame để preview và MP4 giống nhau. Không dùng map.flyTo(), setTimeout() hoặc CSS timer độc lập cho final render.

~~~text
currentFrame / fps
        ↓
tính camera giữa các keyframe
        ↓
map.jumpTo({ center, zoom, pitch, bearing })
        ↓
cập nhật GeoJSON polygon/route progress/marker
        ↓
map.triggerRepaint()
        ↓
đợi tile/map ready
        ↓
render overlay và capture frame
~~~

currentFrame của Remotion là clock duy nhất cho camera, route, polygon, label, transition, voice và nhạc. Preview và final render phải dùng cùng immutable snapshot.

## 8. Kiến trúc an toàn

Map renderer là code React/TypeScript tin cậy, tách khỏi HTML/CSS do AI sinh.

- Không nới html-video-security.service để chấp nhận script, canvas, SDK map hoặc tile URL tùy ý.
- AI chỉ tạo scene plan, narration, text và preset từ enum cho phép.
- Geometry, camera, route và provider response phải validate bằng schema.
- URL ngoài đi qua allowlist provider/media.
- API key, raw provider error, URL tạm và đường dẫn nội bộ không xuất hiện trong MP4 hoặc client response.
- Attribution là layer cố định, không cho CTA/template che hoặc xóa.

## 9. Data contract tối thiểu

~~~ts
type RealEstateMapProject = {
  projectId: string;
  companyCode: string;
  property: {
    name: string;
    address: string;
    location: { lat: number; lng: number };
    boundary?: GeoJsonPolygon;
    verifiedFields: string[];
  };
  pois: Array<{
    id: string;
    name: string;
    category: string;
    location: { lat: number; lng: number };
    sourceRef: string;
    confirmedByUser: boolean;
  }>;
  routes: Array<{
    fromId: string;
    toId: string;
    geometry: GeoJsonLineString;
    distanceMeters: number;
    durationSeconds: number;
    sourceRef: string;
    confirmedByUser: boolean;
  }>;
  scenes: MapScene[];
  providerSnapshot: {
    provider: string;
    product: string;
    styleVersion?: string;
    attribution: string[];
    requestCount?: number;
  };
  videoSpec: {
    aspectRatio: 9:16 | 1:1 | 16:9;
    resolution: 720p | 1080p;
    durationSeconds: number;
  };
};
~~~

MapScene phải chứa camera keyframe, overlay preset, scene timing và source references. Final render snapshot phải bất biến, có provider/version, geometry, voice/audio config, render config, attempts, cost và output metadata.

## 10. Luồng render

~~~text
Nhập dự án + chọn location/polygon/POI
        ↓
Xác nhận dữ liệu không gian
        ↓
Tạo scene plan + voice script
        ↓
Persist immutable snapshot + idempotency key
        ↓
Queue map-video render worker
        ↓
Map render + overlay + TTS
        ↓
FFmpeg mux audio/encode
        ↓
Verify video stream, audio stream, resolution, duration
        ↓
Upload và chỉ publish MP4 khi completed
~~~

Queue nên tách riêng: real-estate-map-video-render. Lỗi tile/WebGL/quota không được làm nghẽn queue HTML-to-video hiện có.

Retry phải có giới hạn. Không retry vô hạn với lỗi license, permission, dữ liệu không hợp lệ, quota/budget cạn hoặc thiếu coverage.

## 11. Ưu tiên và độ khó

| Thứ tự | Hạng mục | Ưu tiên | Độ khó |
| --- | --- | --- | --- |
| 1 | Xác nhận quyền provider | P0 | Cao |
| 2 | Provider adapter + mock data | P0 | Trung bình |
| 3 | Map renderer chạy được trong worker | P0 | Cao |
| 4 | Camera preset + polygon/route/label | P0 | Cao |
| 5 | Snapshot, queue, FFmpeg, verify | P0 | Cao |
| 6 | Map editor, POI/route confirmation | P1 | Trung bình |
| 7 | Template, brand, voice, history | P1 | Trung bình |
| 8 | Quota, metrics, golden frames, hardening | P1 | Cao |
| 9 | 3D riêng, batch, campaign integration | Later | Rất cao |

Critical path:

~~~text
Provider quyền hợp lệ
    → renderer WebGL ổn định
    → camera/overlay đúng tọa độ
    → worker tạo MP4 đã verify
    → workspace và pilot
~~~

## 12. Kế hoạch triển khai

Mục tiêu là có MVP chạy được trong 2–3 ngày và hoàn thiện end-to-end trong 3–4 ngày. Estimate giả định sử dụng AI coding agents để triển khai song song provider, backend/queue, map renderer và UI/preview sau khi chốt contract. Việc xác nhận license với provider chạy song song và là điều kiện bật satellite/hybrid cho production.

| Lane | Task chính | Thời lượng task |
| --- | --- | ---: |
| Nền tảng | Contract, fixture, module scaffold | 2 giờ |
| Provider | Adapter, geocode, POI, route, key policy | 3–4 giờ |
| Backend | Model, schema, API, queue, idempotency | 7–10 giờ |
| Renderer | MapLibre, readiness, camera và geo layers | 9–12 giờ |
| Frontend | Workspace, Terra Draw, preview và history | 7–9 giờ |
| Video/QA | Remotion, TTS, FFmpeg, verify và E2E | 8–10 giờ |

Các task trên có phần chồng lấn; không cộng các hàng thành thời gian lịch.

### 12.1. Nguyên tắc triển khai

1. Chốt contract và mock provider trước khi làm UI.
2. Chứng minh renderer tạo được frame ổn định trước khi nối toàn bộ queue.
3. Preview và final render dùng cùng scene data, camera function và timeline.
4. Map renderer là code hệ thống tin cậy; không đưa SDK map vào HTML do AI sinh.
5. Chỉ đánh dấu completed sau khi MP4 được kiểm tra video/audio stream.
6. Mỗi bước phải có fixture và test độc lập, không phụ thuộc API vendor thật.

### 12.2. Ngày 1 — Foundation và provider

**P0 — Cài dependency và tạo module riêng**

- Thêm MapLibre GL JS và các module Turf cần thiết.
- Thêm Terra Draw cho editor; không import vào backend worker.
- Tạo namespace/module real-estate-map-video, không nhét logic map vào html-video-security.

**P0 — Chốt TypeScript contract**

- Project: thông tin dự án, địa chỉ, location, boundary và verified fields.
- POI: tên, category, location, sourceRef, confirmedByUser.
- Route: LineString, distance, duration, sourceRef, confirmedByUser.
- Scene: type, time range, camera keyframes, visible layers và overlay preset.
- Provider snapshot: provider, product/style version, attribution và request count.
- Render snapshot: project data, scenes, voice, video spec, attempts và cost.

**P0 — Tạo provider adapter**

~~~ts
interface RealEstateMapProvider {
  geocode(query: string): Promise<MapLocation[]>;
  reverseGeocode(location: Coordinate): Promise<MapAddress>;
  searchPlaces(input: PlaceSearchInput): Promise<MapPlace[]>;
  getRoute(input: RouteInput): Promise<MapRoute>;
  getStyle(input: MapStyleInput): Promise<MapStyleDescriptor>;
}
~~~

- Tạo MockMapProvider với fixture cố định để test không gọi mạng.
- Tạo VietmapProvider nhưng đặt sau interface.
- Chuẩn hóa error category: permission, quota, timeout, invalid-data, coverage và unavailable.
- Không trả raw provider payload hoặc key cho client.

**P1 — Persistence và validation**

- Tạo project model và render model riêng, luôn có userId/companyCode.
- Unique idempotency index cho render.
- Joi schema giới hạn polygon points, POI, route, duration, zoom, pitch và bearing.
- Lưu geometry đã dùng vào snapshot, không chỉ lưu query.

**Đầu ra ngày 1**

- Contract compile được.
- Mock provider vượt contract tests.
- Có fixture cho ít nhất 3 địa chỉ.
- Validation chặn geometry, camera và input vượt giới hạn.

### 12.3. Ngày 2 — Renderer, backend và UI song song

**P0 — MapSceneEngine**

- Khởi tạo MapLibre từ style descriptor của provider.
- Render project marker, polygon fill/outline, radius, POI và route.
- Project geographic coordinate sang screen coordinate cho HTML label.
- Có tile readiness gate, timeout và missing-tile state.
- Attribution luôn nằm trong safe area.

**P0 — Camera engine**

- Implement zoom-to-project.
- Implement orbit nhẹ quanh project.
- Implement route-follow.
- Nội suy center, zoom, pitch và bearing từ currentFrame.
- Dùng jumpTo()/triggerRepaint(), không dùng flyTo() trong final render.

**P0 — Overlay engine**

- Project title, location label và CTA.
- POI label kèm khoảng cách/thời gian đã xác nhận.
- Polygon reveal, route progress, marker pulse và transition.
- Layout 9:16 1080p với safe area.

**P0 — Prototype render**

- Tạo một Remotion composition riêng cho map video.
- Đợi map/style/tile sẵn sàng trước khi tiếp tục render.
- Tạo voice bằng TTS hiện có.
- Mux và encode bằng FFmpeg hiện có.
- Kiểm tra đầu, giữa, cuối video và audio stream.

**Đầu ra ngày 2**

- Một MP4 20–30 giây từ fixture.
- Camera, polygon, route và label không trôi.
- Không có black frame hoặc toolbar/editor trong video.
- Render lại cùng snapshot cho kết quả timeline tương đương.

### 12.4. Ngày 3 — Tích hợp end-to-end

**P0 — API**

- Tạo project, cập nhật project và lấy project.
- Geocode/reverse-geocode qua backend.
- Search POI và tạo route qua backend.
- Preview normalized snapshot.
- Create render, get render status, list history và retry lỗi cho phép.

Route đề xuất:

~~~text
POST   /api/v1/real-estate-map-video/projects
GET    /api/v1/real-estate-map-video/projects/:projectId
PATCH  /api/v1/real-estate-map-video/projects/:projectId
POST   /api/v1/real-estate-map-video/geocode
POST   /api/v1/real-estate-map-video/places
POST   /api/v1/real-estate-map-video/routes
POST   /api/v1/real-estate-map-video/renders
GET    /api/v1/real-estate-map-video/renders/:renderId
POST   /api/v1/real-estate-map-video/renders/:renderId/retry
~~~

**P0 — Queue riêng**

- Dùng queue real-estate-map-video-render.
- Các stage: validate → prepare map → render → TTS → mux → upload → verify.
- Atomic lease hoặc cơ chế claim/recovery tương đương HTML-to-video.
- Capped retry theo error category.
- Idempotency ngăn duplicate render và duplicate charge.

**P0 — Status**

~~~text
draft
  → queued
  → preparing
  → rendering
  → muxing
  → uploading
  → verifying
  → completed | failed
~~~

- Status, progress, attempt và error category phải tenant-scoped.
- completed chỉ được set sau khi output tồn tại, upload thành công và media verification đạt.

**P1 — Cost và provenance**

- Ghi request count/cost provider, TTS, render và storage.
- Lưu style/provider version, attribution, geometry và scene plan.
- Log chẩn đoán có giới hạn; không log key hoặc raw payload nhạy cảm.

**Đầu ra ngày 3**

- Render tiếp tục khi đóng trình duyệt.
- Retry không tạo job/output/charge trùng.
- Worker restart có thể recover job hợp lệ.
- API tests phủ tenant scope, validation, idempotency và terminal errors.

### 12.5. Ngày 4 — Hardening, pilot ngắn và release

**P0 — Workspace Video BĐS**

- Thêm entry riêng trong Video Studio.
- Form thông tin dự án, địa chỉ, logo, CTA và video spec.
- Bản đồ chọn point, vẽ/chỉnh polygon bằng Terra Draw.
- Danh sách POI, route và trạng thái confirmedByUser.
- Chọn ba scene preset và màu thương hiệu.

**P0 — Preview**

- Remotion Player dùng đúng normalized snapshot.
- Play, pause và seek điều khiển cùng frame clock với final render.
- Có trạng thái loading tile, invalid location và provider unavailable.
- Không hiển thị key, raw error hoặc URL nội bộ.

**P0 — Render UX**

- Tạo render với idempotency key.
- Poll/realtime progress theo status backend.
- Hiển thị lỗi có thể sửa và retry khi được phép.
- History chỉ hiển thị output URL của render completed.

**P1 — Nghiệm thu**

- Chạy 3 fixture đại diện: nội đô, vùng ven và tỉnh.
- Kiểm tra frame đầu/giữa/cuối.
- Kiểm tra 9:16 1080p, duration, video/audio stream và attribution.
- Kiểm tra address/POI/route sai phải được người dùng xác nhận lại.

**Đầu ra ngày 4**

- Tạo được video end-to-end mà không sửa code hoặc HTML.
- Preview và MP4 đồng nhất về scene/camera.
- Render history, retry và output hoạt động đúng.
- MVP đạt toàn bộ tiêu chí trong mục 13.

### 12.6. Thứ tự file/module dự kiến

| Thứ tự | Nhóm file | Mục đích |
| --- | --- | --- |
| 1 | server/interface/real-estate-map-video.interface.ts | Contract dùng chung phía backend |
| 2 | server/service/real-estate-map-video/provider/ | Provider interface, mock và VIETMAP adapter |
| 3 | server/model/real-estate-map-video-*.model.ts | Project và render snapshot |
| 4 | server/service/real-estate-map-video/ | Project, scene, render và verification service |
| 5 | server/queue/real-estate-map-video-render-queue.ts | Worker lifecycle và recovery |
| 6 | server/router + server/controller | API và Joi validation |
| 7 | server/remotion/real-estate-map-video/ | Trusted Remotion composition |
| 8 | src/services/realEstateMapVideoService.ts | Client API |
| 9 | src/components/content-studio/real-estate-map-video/ | Workspace, map editor, timeline, preview |
| 10 | tests cạnh từng module | Contract, API, worker và frame fixtures |

Tên file có thể điều chỉnh theo convention thực tế khi code, nhưng ranh giới provider, renderer, persistence và UI phải giữ nguyên.

### 12.7. Việc sau ngày 4

- Mở rộng pilot lên 20–30 video để đo P50/P95 chính xác hơn; việc này không chặn hoàn thiện tính năng.
- Quota/budget theo tenant và cảnh báo chi phí.
- Golden-frame test cho camera preset.
- Metrics render success, P50/P95 và cost/video.
- Provider fallback và runbook outage.
- Batch/campaign integration chỉ làm khi render đơn ổn định.
- Three.js/Cesium chỉ đánh giá khi có yêu cầu 3D cụ thể.

Không mở rộng sang 3D riêng hoặc batch trước khi prototype chứng minh được quyền sử dụng, tile readiness, chất lượng map và chi phí/video.

## 13. Tiêu chí nghiệm thu

### Prototype

- Có MP4 20–30 giây, 9:16, có map, polygon, route, label và audio.
- Camera/polygon/route không trôi vị trí.
- Tile tải đủ hoặc lỗi rõ ràng; không có black frame.
- Có attribution đúng yêu cầu provider.
- Render lại cùng snapshot cho timeline/camera tương đương.
- Thử ít nhất 3 địa chỉ đại diện.

### MVP

- Người dùng tạo video mà không sửa code/HTML.
- Có geocode, manual point, polygon editor, POI/route confirmation và preset scene.
- Đóng trình duyệt không làm mất render.
- Retry không tạo job, output hoặc charge trùng.
- MP4 chỉ completed khi có cả video/audio stream, đúng duration/resolution.
- Tenant isolation, provider cost, attribution, attempts và provenance được lưu.
- Không lộ API key, raw provider payload hay debug text.

### Pilot

- Render thử 20–30 video thật tại nhiều khu vực.
- Đo render success rate, P50/P95 render time, cost/video và tỷ lệ phải sửa location/POI.
- Kiểm tra lỗi coverage, attribution, label overlap, missing tile và audio.
- Chỉ mở rộng sau khi chi phí và chất lượng đạt ngưỡng kinh doanh.

## 14. Rủi ro và fallback

| Rủi ro | Xử lý |
| --- | --- |
| Vendor không cấp quyền video | Dừng satellite automation; dùng vector/2.5D hoặc media hợp lệ do khách cung cấp |
| Địa chỉ/POI sai hoặc thiếu | Cho chọn điểm thủ công, buộc xác nhận trước render |
| Satellite thiếu/không đẹp | Dùng hybrid/vector preset thay vì cam kết 3D |
| WebGL thiếu tile/black frame | Tile readiness gate, timeout, bounded retry, fallback 2D |
| Tile cost cao | Giới hạn zoom, camera path, scene duration, route/POI và budget |
| Overlay che attribution | Attribution fixed layer + automated frame check |
| AI thêm thông tin sai | Chỉ dùng dữ liệu đã xác nhận; không để AI tự bịa khoảng cách/tiện ích/giá |

## 15. Nguồn tham khảo

- [VIETMAP Maps API](https://maps.vietmap.vn/docs/vi/map-api/overview/)
- [VIETMAP Tilemap](https://maps.vietmap.vn/docs/vi/map-api/tilemap/)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs)
- [MapLibre + Terra Draw](https://maplibre.org/maplibre-gl-js/docs/examples/draw-geometries-with-terra-draw/)
- [Turf.js buffer](https://turfjs.org/docs/api/buffer)
- [MapTiler video licensing](https://docs.maptiler.com/guides/maps-apis/maps-platform/how-to-use-maptiler-maps-in-geolayers/)
- [OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
- [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/)
- [Google Geo Guidelines](https://about.google/brand-resource-center/products-and-services/geo-guidelines/)

## 16. Quyết định đề xuất

Đi theo hướng **VIETMAP + MapLibre + Turf + Terra Draw**, tái sử dụng React, Remotion, FFmpeg, BullMQ và Cloudinary đang có.

Điều kiện bắt đầu production là vendor xác nhận quyền tạo và phân phối MP4 thương mại. Khi chưa có xác nhận, vẫn làm prototype bằng mock/vector data, nhưng không đưa satellite/Google Earth vào cam kết sản phẩm.
