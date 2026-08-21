# Kế hoạch hoàn thiện Video BĐS từ bản đồ 3D

> Cập nhật: 20/08/2026
> Phạm vi chi phí: chỉ tính API, dữ liệu và license có thể phải mua; không tính nhân công, máy chủ, thiết bị hoặc chi phí tổ chức.

## 1. Kết quả dự kiến

Xây một module riêng cho phép tạo video giới thiệu bất động sản từ địa chỉ hoặc tọa độ:

- tìm và xác nhận vị trí dự án;
- vẽ/chỉnh ranh giới polygon;
- hiển thị ảnh nền satellite/hybrid;
- tạo camera zoom, xoay, nghiêng và di chuyển theo preset;
- chọn POI và tuyến đường;
- hiện marker, route, bán kính, nhãn, khoảng cách và thời gian;
- thêm logo, thông tin dự án, CTA, giọng đọc và nhạc;
- preview theo timeline;
- render backend thành MP4 có âm thanh;
- lưu lịch sử, attribution, nguồn dữ liệu, chi phí và trạng thái.

### Mốc hoàn thiện

| Mốc | Thời gian |
| --- | ---: |
| Contract, fixture và provider scaffold | 2–4 giờ |
| Prototype map → MP4 | hết ngày 1 hoặc đầu ngày 2 |
| MVP nội bộ end-to-end | 2–3 ngày |
| Hardening và pilot ngắn | trong ngày 4 |
| **Tổng hoàn thiện tính năng** | **3–4 ngày** |

Estimate này giả định sử dụng AI coding agents để thực hiện song song các nhánh map/renderer, backend/queue và UI/preview, sau đó tích hợp theo contract chung. Vì vậy tổng thời gian lịch là 3–4 ngày dù tổng giờ của từng task cộng lại lớn hơn. Thời gian chờ nhà cung cấp xác nhận quyền tạo video thương mại không nằm trong các mốc trên; trong lúc chờ vẫn hoàn thiện bằng mock data hoặc vector/2.5D.

### Giới hạn quan trọng

Mốc 3–4 ngày áp dụng cho video bản đồ 2D/2.5D có satellite/hybrid, camera nghiêng, polygon, route và overlay. Nó không bao gồm:

- photorealistic 3D giống hoàn toàn Google Earth;
- mô hình 3D riêng của tòa nhà;
- terrain/building coverage cao ở mọi địa chỉ;
- editor camera tự do như phần mềm dựng phim;
- render 4K hoặc hàng trăm video đồng thời.

Nếu yêu cầu hình ảnh đúng mức Google Earth photorealistic 3D, phải bổ sung provider có dữ liệu 3D và quyền video phù hợp; thời gian, chi phí và license sẽ cần estimate lại.

## 2. Phạm vi theo giai đoạn

### MVP bắt buộc

1. Nhập địa chỉ hoặc chọn tọa độ.
2. Vẽ/chỉnh polygon ranh giới dự án.
3. Chọn tối đa 5 POI và 3 route.
4. Ba camera preset:
   - zoom-to-project;
   - orbit nhẹ;
   - route-follow.
5. Các layer:
   - marker dự án;
   - polygon fill/outline;
   - vòng bán kính;
   - route progress;
   - POI marker và label;
   - attribution.
6. Overlay logo, headline, thông tin chính và CTA.
7. Voice bằng pipeline TTS hiện tại.
8. Preview, render queue, progress, retry và history.
9. MP4 9:16 1080p, 20–30 giây, có audio.
10. Kiểm tra video/audio stream trước khi completed.

### Production hardening

- idempotency và recovery sau worker restart;
- capped retry theo loại lỗi;
- timeout/tile readiness/missing coverage;
- quota và budget theo tenant;
- provider attribution không bị che;
- log cost theo video;
- URL allowlist và bảo vệ API key;
- golden-frame test cho camera preset;
- fallback hybrid/vector khi satellite lỗi.

### Để sau

- Three.js/Cesium và mô hình 3D riêng;
- batch render lớn;
- campaign automation;
- cộng tác nhiều người;
- editor camera tự do;
- 4K hoặc video dài trên 90 giây;
- dữ liệu quy hoạch tự động.

## 3. Công cụ cần liên kết

### Công cụ mới

| Công cụ | Công dụng | Loại | Chi phí phần mềm |
| --- | --- | --- | ---: |
| VIETMAP API | Tile/style, satellite/hybrid, geocode, POI, routing | API/provider | Theo transaction hoặc hợp đồng |
| MapLibre GL JS | Render map WebGL, camera, GeoJSON layer | Open source | 0 |
| Turf.js | Bbox, buffer, centroid, length, along | Open source | 0 |
| Terra Draw | Vẽ/chỉnh point, line, polygon | Open source | 0 |
| GeoJSON | Contract geometry | Chuẩn dữ liệu | 0 |

Dependency dự kiến:

~~~bash
npm install maplibre-gl +  @turf/bbox +  @turf/buffer +  @turf/centroid +  @turf/length +  @turf/along +  @watergis/maplibre-gl-terradraw
~~~

### Công cụ đã có trong repository

| Công cụ | Tái sử dụng cho |
| --- | --- |
| React + Vite | Workspace, map editor, preview, history |
| Remotion Player | Preview và seek theo frame |
| Remotion Renderer/Bundler | Render Chromium |
| FFmpeg | Encode MP4, mux audio và verify |
| BullMQ + Redis | Queue, retry, progress và recovery |
| MongoDB/Mongoose | Project, render snapshot và provenance |
| Cloudinary | MP4, thumbnail, logo, ảnh và audio |
| Gemini/TTS hiện tại | Kịch bản và giọng đọc |
| Joi | Validation API, geometry và camera |

Các thành phần này không cần mua API mới nếu tài khoản/hạ tầng hiện tại còn quota.

### Provider dự phòng

MapTiler có thể dùng làm fallback cho map/satellite/terrain. Gói Flex công khai là 25 USD/tháng và gồm 500.000 API requests/tháng. Tuy nhiên, sản phẩm tạo video cho khách hàng có thể bị xem là commercial redistribution/reselling; trường hợp này phải hỏi MapTiler về Custom plan và Video Material License trước khi dùng production.

### Công cụ không đưa vào MVP

| Công cụ | Lý do |
| --- | --- |
| Google Earth/Earth Studio | Quyền promotional/commercial không phù hợp để mặc định bán video BĐS |
| Google Photorealistic 3D Tiles | License video/resale cần xác nhận riêng; tile cost khó dự đoán |
| CesiumJS | Chưa cần cho MVP 2.5D; tăng độ khó WebGL/GPU |
| Three.js | Chỉ cần khi có model/particle/3D riêng |
| deck.gl | Không cần cho số lượng layer nhỏ |
| PostGIS/GeoServer | Chưa có spatial workload lớn |
| After Effects automation | Tạo pipeline render thứ hai, khó chạy backend ổn định |

## 4. Kiến trúc liên kết

~~~text
VIETMAP tile/geocode/POI/route
              ↓
RealEstateMapProvider adapter
              ↓
MapLibre GL JS + Turf.js
              ↓
Terra Draw editor + React workspace
              ↓
Normalized project + immutable render snapshot
              ↓
Remotion frame clock + trusted MapSceneEngine
              ↓
BullMQ worker + TTS + FFmpeg
              ↓
Verify MP4 → Cloudinary → history
~~~

Map renderer phải là React/TypeScript do hệ thống kiểm soát. Không cho AI chèn script, canvas, SDK map hoặc URL tile tùy ý vào HTML-to-video.

## 5. Ưu tiên và độ khó

Thang độ khó: 1 là đơn giản, 5 là khó nhất.

| Thứ tự | Hạng mục | Ưu tiên | Độ khó | Phụ thuộc |
| ---: | --- | --- | ---: | --- |
| 1 | Xác nhận quyền video thương mại | P0 | 5 | Nhà cung cấp |
| 2 | Data contract + mock provider | P0 | 3 | Không |
| 3 | VIETMAP adapter | P0 | 3 | API key |
| 4 | MapLibre renderer trong Chromium | P0 | 5 | Map style/tile |
| 5 | Tile readiness và timeout | P0 | 5 | Renderer |
| 6 | Camera deterministic theo frame | P0 | 5 | Renderer |
| 7 | Polygon/route/radius/marker | P0 | 4 | Turf + MapLibre |
| 8 | Label bám tọa độ màn hình | P0 | 4 | map.project |
| 9 | Render snapshot + idempotency | P0 | 4 | Data contract |
| 10 | Queue, TTS, FFmpeg và verify | P0 | 4 | Renderer |
| 11 | API project/geocode/POI/route | P0 | 3 | Provider adapter |
| 12 | Workspace và polygon editor | P1 | 3 | Terra Draw |
| 13 | Preview và render history | P1 | 3 | API + queue |
| 14 | Cost/quota/attribution/security | P1 | 4 | Provider |
| 15 | Provider fallback | P2 | 4 | Adapter ổn định |
| 16 | Photorealistic 3D riêng | Later | 5 | Dữ liệu/license/GPU |

### Critical path

~~~text
License/provider
    → provider adapter
    → WebGL renderer
    → camera/layers deterministic
    → render worker + MP4 verify
    → workspace
    → pilot
~~~

## 6. Kế hoạch thực hiện chi tiết

### Phân bổ task

| Task | Thời lượng task | Lane | Chạy song song với |
| --- | ---: | --- | --- |
| Contract, fixture và module scaffold | 2 giờ | Nền tảng | Không |
| Provider adapter + API key policy | 3–4 giờ | Provider | Model/API, UI shell |
| Model, Joi schema và idempotency | 3–4 giờ | Backend | Provider, UI shell |
| UI workspace shell | 2–3 giờ | Frontend | Provider, backend |
| MapLibre renderer + tile readiness | 5–7 giờ | Renderer | API/queue, editor |
| Camera, polygon, route và label | 4–5 giờ | Renderer | API/queue, editor |
| Project API + render queue | 4–6 giờ | Backend | Renderer, UI |
| Terra Draw editor + preview | 5–6 giờ | Frontend | Renderer, backend |
| Remotion + TTS + FFmpeg + verify | 3–4 giờ | Video | UI integration, tests |
| E2E, hardening và pilot ngắn | 6–8 giờ | QA/integration | Fix theo từng lane |

Tổng effort khoảng 37–49 giờ nhưng không chạy nối tiếp. Ba lane chính bắt đầu sau khi chốt contract, nên thời gian lịch mục tiêu vẫn là 3–4 ngày.

~~~text
Ngày 1: contract
        ├── provider + backend model/API + UI shell
        └── map renderer scaffold

Ngày 2: renderer/camera
        ├── queue/render lifecycle
        └── editor/preview

Ngày 3: tích hợp end-to-end
        ├── TTS/FFmpeg/verify
        └── contract/API/frame tests

Ngày 4: hardening + pilot ngắn + fix + chốt release
~~~

### Ngày 1 — Foundation và provider (8 giờ)

**P0**

- Thêm dependency MapLibre/Turf/Terra Draw.
- Tạo RealEstateMapProject, POI, Route, MapScene và RenderSnapshot.
- Tạo RealEstateMapProvider interface.
- Tạo MockMapProvider với fixture cho 3 địa chỉ.
- Tạo VietmapProvider cho geocode, place, route và style descriptor.
- Chuẩn hóa lỗi permission, quota, timeout, coverage, invalid-data.
- Tạo Joi validation cho polygon, route, camera và video spec.
- Tạo project/render model có userId, companyCode và idempotency index.

**Đầu ra**

- Contract compile được.
- Mock provider vượt test.
- Không test nào bắt buộc gọi API thật.
- Input vượt giới hạn bị chặn.

### Ngày 2 — Renderer, backend và UI song song (8 giờ)

**P0**

- Tạo trusted MapSceneEngine.
- Render satellite/hybrid style.
- Thêm polygon, route, radius, marker và attribution.
- Dùng Turf để fit bounds và tính route progress.
- Thêm zoom-to-project, orbit và route-follow.
- Camera phụ thuộc currentFrame; dùng jumpTo/triggerRepaint.
- Thêm tile readiness gate, timeout và fallback state.
- Tạo Remotion composition 9:16 1080p.
- Tái sử dụng TTS/FFmpeg để tạo MP4 fixture.

**Các nhánh chạy song song**

- Backend tiếp tục project API, render model và queue skeleton.
- Frontend tạo workspace shell, map container và editor state.
- Renderer chốt camera/layer contract để backend và frontend không phải chờ implementation cuối.

**Đầu ra**

- Một MP4 20–30 giây có map, camera, polygon, route, label và audio.
- Frame đầu/giữa/cuối không đen.
- Label không trôi khỏi tọa độ.
- Attribution luôn nhìn thấy.

### Ngày 3 — Tích hợp end-to-end (8 giờ)

**P0**

- API create/get/update project.
- API geocode, place search và route.
- API preview snapshot.
- API create/get/list/retry render.
- Queue riêng real-estate-map-video-render.
- Các stage validate → prepare → render → TTS → mux → upload → verify.
- Capped retry và recovery sau restart.
- Chỉ completed sau media verification.
- Lưu cost, attempts, provider version và attribution.

**Tích hợp song song**

- Nối Remotion Player với cùng snapshot của final renderer.
- Nối Terra Draw geometry vào project API.
- Nối TTS, FFmpeg, Cloudinary và media verification hiện có.
- Chạy contract test, API test và worker failure test ngay khi từng nhánh hoàn thành.

**Đầu ra**

- Đóng trình duyệt không làm mất render.
- Retry không tạo job/output/charge trùng.
- Tenant không đọc được project/render của nhau.
- Lỗi provider trả category an toàn.

### Ngày 4 — Hardening, pilot ngắn và release (8 giờ)

**P0**

- Hoàn thiện workspace, map picker, polygon editor và POI/route confirmation.
- Hoàn thiện preview, progress, retry và history.
- Chạy 10–20 video từ 3 địa chỉ đại diện.
- Kiểm tra frame đầu/giữa/cuối, audio, attribution và tile readiness.
- Sửa lỗi blocking, label overlap và camera preset.
- Chốt quota tạm, cost log và release checklist.

**Đầu ra**

- Tạo video end-to-end mà không sửa code/HTML.
- Preview và MP4 dùng cùng scene/camera data.
- MP4 đúng duration, resolution và có audio.
- Không lộ provider key, raw payload hoặc debug text.

### Sau ngày 4 — Không chặn hoàn thiện tính năng

- Tiếp tục mở rộng pilot từ 10–20 lên 20–30 video để đo P50/P95 chính xác hơn.
- Theo dõi provider response/license và bật satellite production khi đủ quyền.
- Three.js/Cesium, batch và campaign integration vẫn để sau MVP.

## 7. Chi phí API để hoàn thiện

### Cách tính

Chỉ tính khoản có thể phải trả cho API/license. Không tính:

- công phát triển;
- máy chủ/GPU;
- Redis/MongoDB;
- domain;
- thiết kế;
- QA;
- vận hành nội bộ.

Quy đổi tham khảo trong tài liệu: 1 USD ≈ 26.000 VNĐ. Khi thanh toán phải dùng tỷ giá và thuế thực tế.

### VIETMAP

Thông tin công khai tại thời điểm lập tài liệu:

- tài khoản phát triển được giới thiệu 60.000 transactions/tháng, miễn phí trong 2 tháng;
- tile map: 25 tile requests = 1 transaction;
- geocode, reverse, autocomplete, place thường là 1 request = 1 transaction;
- routing tính theo số waypoint;
- mức công khai đầu tiên là khoảng 50 VNĐ/transaction trong dải 1–500.000 transactions/tháng;
- console hỗ trợ flexible top-up.

Estimate một video 20–30 giây:

| Kịch bản | Tile requests | API khác | Tổng transaction ước tính | Giá theo 50 VNĐ/trans |
| --- | ---: | ---: | ---: | ---: |
| Nhẹ | 250 | 8 | 18 | 900 VNĐ |
| Thông thường | 1.000 | 12 | 52 | 2.600 VNĐ |
| Nặng | 2.500 | 20 | 120 | 6.000 VNĐ |

Đây là mô hình dự toán, không phải số tiêu thụ cam kết. Renderer phải ghi số tile/request thật trong pilot. Cache, camera path, zoom, độ phân giải và style ảnh hưởng trực tiếp đến số request.

Chi phí 30 video pilot theo mô hình trên khoảng 27.000–180.000 VNĐ và có thể nằm hoàn toàn trong free trial.

**Khoản chưa có giá công khai chắc chắn:** quyền headless capture, lưu MP4 và phân phối video BĐS thương mại. Phải nhận xác nhận hoặc báo giá riêng từ VIETMAP; chi phí transaction không thay thế quyền này.

### Gemini TTS

Pipeline hiện có đã dùng Gemini. Giá công khai của Gemini 2.5 Flash Preview TTS:

- paid input: 0,50 USD/1 triệu text tokens;
- paid audio output: 10 USD/1 triệu audio tokens;
- có free tier, nhưng điều kiện dữ liệu khác paid tier.

Do Google tính audio token thay vì công bố giá/phút cố định ở bảng này, chưa nên gán chi phí chính xác cho một video trước khi đo usage metadata.

Ngân sách phát triển/pilot hợp lý: **5–10 USD**, tương đương khoảng **130.000–260.000 VNĐ**. Nếu quota hiện có đủ thì chi phí mua thêm là 0.

### MapTiler fallback

- Flex: 25 USD/tháng, khoảng 650.000 VNĐ trước thuế.
- Gồm 500.000 API requests/tháng.
- Có commercial use và export for videos/games theo bảng giá.
- Reselling chỉ được nêu cho Custom plan.
- Một số trường hợp video yêu cầu thêm Video Material License Agreement.

Vì sản phẩm tạo video cho khách hàng, không đưa MapTiler Flex vào production cho đến khi vendor xác nhận use-case. Nếu chỉ thử kỹ thuật một tháng, có thể dự phòng 25 USD.

### Cloudinary

Repository đã tích hợp Cloudinary:

- Free: 0 USD, 25 credits/tháng.
- Plus: 99 USD/tháng, khoảng 2.574.000 VNĐ trước thuế.

Không cần mua gói mới để code tính năng nếu tài khoản hiện tại còn quota. Chỉ nâng cấp khi pilot chứng minh storage/bandwidth vượt mức hiện tại.

### Thư viện và hạ tầng logic

| Thành phần | Chi phí API/license mới |
| --- | ---: |
| MapLibre GL JS | 0 |
| Turf.js | 0 |
| Terra Draw | 0 |
| Remotion hiện có | 0 chi phí API mới |
| FFmpeg | 0 |
| BullMQ/Redis hiện có | 0 chi phí API mới |
| MongoDB hiện có | 0 chi phí API mới |

### Tổng dự kiến

| Phương án | Khoản mua thêm dự kiến |
| --- | ---: |
| MVP dùng VIETMAP free trial + quota TTS hiện có | **0 VNĐ** |
| MVP có dự phòng TTS paid | **130.000–260.000 VNĐ** |
| MVP thử thêm MapTiler Flex 1 tháng | **khoảng 780.000–910.000 VNĐ** |
| Pilot 20–30 video với VIETMAP + TTS dự phòng | **khoảng 160.000–440.000 VNĐ** |
| Cloudinary Plus nếu thật sự vượt quota | cộng **khoảng 2.574.000 VNĐ/tháng** |
| License video thương mại của provider | **Chờ báo giá, chưa thể cộng chính xác** |

**Ngân sách API nên chuẩn bị để hoàn thiện kỹ thuật:** 1.000.000 VNĐ là đủ cho MVP/pilot nhỏ trong điều kiện free trial hoạt động và không mua Cloudinary mới.

**Ngân sách production chưa thể chốt tuyệt đối** cho đến khi VIETMAP hoặc provider thay thế xác nhận quyền video thương mại. Đây là biến số lớn nhất, không phải MapLibre, TTS hay FFmpeg.

## 8. Câu hỏi phải gửi nhà cung cấp

Gửi cho VIETMAP và provider dự phòng mô tả chính xác:

> Hệ thống SaaS tự động tải tile/style bằng backend renderer, điều khiển camera, chụp frame, ghép polygon/route/label/voice, tạo MP4, lưu file và cho khách hàng doanh nghiệp tải xuống để quảng cáo bất động sản.

Yêu cầu trả lời bằng văn bản:

1. Có cho phép headless/browser automation không?
2. Có cho phép capture frame và encode MP4 không?
3. Có cho phép lưu trữ video lâu dài không?
4. Có cho phép khách hàng tải và đăng mạng xã hội không?
5. Có được bán video như output của SaaS không?
6. Attribution phải hiện thế nào và trong bao lâu?
7. Tile/style/satellite nào được phép dùng?
8. Cache được bao lâu?
9. Giá theo transaction hay cần hợp đồng riêng?
10. Có giới hạn số video, độ phân giải hoặc nền tảng phân phối không?

## 9. Tiêu chí hoàn thành

### Kỹ thuật

- Một project tạo được MP4 9:16 1080p, 20–30 giây.
- Có map, camera, polygon, route, POI, overlay và audio.
- Preview và final render dùng cùng snapshot.
- Render lặp lại không lệch timeline/camera đáng kể.
- Không có black frame hoặc missing tile im lặng.
- Worker restart recover được job.
- Retry không duplicate.
- Output được verify trước completed.

### Dữ liệu

- Location, POI và route có source reference.
- Người dùng xác nhận thông tin quan trọng.
- AI không tự bịa giá, diện tích, khoảng cách hoặc tiện ích.
- Provider/version/attribution được lưu.

### Bảo mật

- Service key không đi vào generated HTML hoặc client response.
- URL/provider được allowlist.
- Không log raw payload nhạy cảm.
- Project/render luôn tenant-scoped.

### Kinh doanh

- Có quyền tạo và phân phối video thương mại.
- Đã đo cost/video trên 20–30 video thật.
- Có fallback khi provider lỗi hoặc thiếu coverage.
- Attribution đáp ứng hợp đồng.

## 10. Rủi ro và cách xử lý

| Rủi ro | Mức | Xử lý |
| --- | --- | --- |
| Provider không cấp quyền video | Rất cao | Dùng vector/2.5D hoặc clip hợp lệ do người dùng cung cấp |
| Satellite/3D thiếu coverage | Cao | Test 3 địa chỉ trước; fallback hybrid/vector |
| WebGL render không ổn định | Cao | Tile readiness, timeout, frame check, capped retry |
| Camera preview khác MP4 | Cao | Một Remotion frame clock; không dùng flyTo |
| Sai POI/route | Cao | Source reference và xác nhận người dùng |
| Tile cost tăng | Trung bình | Giới hạn zoom/path/duration, quota và cost log |
| Attribution bị che | Cao | Fixed safe-area layer và automated check |
| TTS/Map API hết quota | Trung bình | Budget guard và terminal error rõ ràng |

## 11. Quyết định triển khai

Phương án phù hợp nhất:

1. Dùng **VIETMAP + MapLibre + Turf + Terra Draw** cho MVP.
2. Tận dụng **Remotion + FFmpeg + BullMQ + Cloudinary + TTS** hiện có.
3. Giữ **MapTiler** làm fallback, không mua nếu VIETMAP đáp ứng.
4. Có MVP chạy được trong **2–3 ngày**, hoàn thiện end-to-end trong **3–4 ngày**.
5. Dành tối đa **1.000.000 VNĐ** cho API thử nghiệm.
6. Chưa mở production satellite/hybrid nếu chưa có quyền video bằng văn bản.
7. Sau pilot, chốt transaction/video, quota và giá bán theo số liệu thật.

## 12. Nguồn giá và tài liệu chính thức

- [VIETMAP Maps API](https://maps.vietmap.vn/docs/vi/map-api/overview/)
- [VIETMAP pricing](https://maps.vietmap.vn/web)
- [VIETMAP request-to-transaction](https://maps.vietmap.vn/docs/map-api/console/request-to-transaction/)
- [VIETMAP billing/top-up](https://maps.vietmap.vn/docs/map-api/console/payment/)
- [VIETMAP Tilemap](https://maps.vietmap.vn/docs/vi/map-api/tilemap/)
- [MapTiler Cloud pricing](https://www.maptiler.com/cloud/pricing/)
- [MapTiler video license guide](https://docs.maptiler.com/guides/maps-apis/maps-platform/how-to-use-maptiler-maps-in-geolayers/)
- [MapTiler Cloud Terms](https://www.maptiler.com/terms/cloud/)
- [Gemini Developer API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Cloudinary pricing](https://cloudinary.com/pricing)
- [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs)
- [Turf.js](https://turfjs.org/docs/)

> Giá, quota và điều khoản có thể thay đổi. Cần kiểm tra lại tại thời điểm mua và ưu tiên hợp đồng/xác nhận của provider cho đúng use-case.
