# Video bat dong san tu ban do - Huong dan de hieu

## Tom tat de phe duyet

### De xuat

Phe duyet hoan thien MVP Video BDS ban do trong **3-4 ngay ky thuat** va cho phep lam viec voi 1 nha cung cap map de lay bao gia/license phu hop cho video thuong mai.

### Gia tri mang lai

- Bien thong tin du an thanh video ngan de dang Facebook, TikTok, Zalo hoac gui sale.
- Giam thao tac lam video thu cong: chon vi tri, ve ranh, chon noi dung va tao video trong mot noi.
- Du lieu polygon, POI va route co the tai su dung cho nhieu video cua cung mot du an.
- Tao asset marketing nhat quan: logo, CTA, template va giong doc duoc kiem soat.

### Quyet dinh can sep phe duyet

| Quyet dinh | De xuat | Ly do |
| --- | --- | --- |
| Pham vi phien ban dau | MVP map 2D/2.5D, video 9:16 20-30 giay | Nhanh co ket qua, du de pilot |
| Ngan sach ky thuat | Dung ha tang hien co + 0.5-1 trieu VND test API | Khong mua 3D/4K o giai doan dau |
| Ngan sach map production | Chua chot; doi quote/license vendor | Tranh mua goi khong co quyen dua vao MP4 |
| Vendor uu tien | VIETMAP; MapTiler chi la phuong an du phong | Phu hop du lieu Viet Nam, nhung can van ban xac nhan quyen video |
| Cach rollout | Noi bo -> pilot nho -> mo rong | Kiem soat rui ro chi phi va phap ly |

### Khong can phe duyet luc nay

- Google Earth, 3D photorealistic, mo hinh toa nha rieng, 4K.
- Batch hang tram video va tu dong hoa campaign.
- Mua license 3D hoac hop dong vendor dai han cho den khi pilot co so lieu.

### Dieu kien dung/mo

**Dung:** hoan thien UI, polygon, draft, mock preview va pipeline MP4 noi bo ngay bay gio.

**Chi mo video map that cho khach hang khi:** vendor xac nhan bang van ban quyen render headless, ghep MP4 va phan phoi thuong mai.

### Tieu chi pilot thanh cong

- 3 du an that tao duoc video 20-30 giay khong loi.
- Nguoi dung khong ranh GIS tu chon duoc vi tri va ve ranh trong 5 phut.
- MP4 co ca hinh va am thanh; preview va MP4 khong lech canh.
- Co du lieu chi phi trung binh/video va attribution dung yeu cau.
- Khong co API key, du lieu tenant khac hay thong tin chua xac nhan trong video.

## 1. Tinh nang nay dung de lam gi?

Day la mot tab rieng trong Video Studio. Nguoi dung nhap du an, chon vi tri tren ban do, khoanh ranh dat va chon cac diem tien ich. He thong se dung du lieu da xac nhan de tao video MP4 gioi thieu du an.

Mot video hoan chinh co 4 lop:

1. Nen ban do: duong, khu vuc, anh ve tinh hoac hybrid.
2. Du an: ghim vi tri, ranh polygon, ten du an.
3. Noi dung: tieu de, logo, diem manh, CTA.
4. Video: canh zoom/di chuyen, giong doc va file MP4.

Khong can biet GIS. Thao tac chinh chi la bam chon vi tri va bam cac goc de ve ranh du an.

## 2. Nguoi dung se lam nhu the nao?

1. Nhap ten du an va toa do, hoac bam tren ban do.
2. Bam `Bat dau ve ranh`, bam cac goc khu dat va ket thuc polygon.
3. Chon mot mau video, them logo/tieu de/CTA va cac tien ich can hien.
4. Xem truoc, xac nhan du lieu, roi bam tao video.
5. Cho he thong xu ly. Khi hoan tat, tai MP4 hoac xem lai trong lich su.

Du lieu chua chac chan nhu gia, phap ly, thoi gian di chuyen hoac ten tien ich phai duoc nguoi dung xac nhan truoc khi dua vao video.

## 3. Tinh trang hien tai

Da co tab rieng, nhap du an/toa do, dat ghim, preview MapLibre va ve/chinh polygon bang Terra Draw. Du lieu dang co the luu tam trong trinh duyet.

Dang hoan thien: luu draft tren server, tim dia chi/POI/tuyen duong, preset camera, overlay, preview theo timeline, render queue va MP4 co am thanh.

Chua duoc bat: map ve tinh/hybrid va render MP4 tu map that. Hai phan nay phai cho nha cung cap cap quyen su dung video thuong mai.

## 4. Thoi gian hoan thien

Gia dinh da co ha tang hien tai cua he thong va dung AI coding agents de lam song song.

| Moc | Thoi gian ky thuat | Ket qua |
| --- | ---: | --- |
| Hoan thien draft, API va luu lich su | 0.5 ngay | Mo lai du an khong mat du lieu |
| Tim vi tri, POI, route va xac nhan du lieu | 0.5 ngay | Du lieu ban do dung lam video |
| Preset camera, layer va overlay | 0.5-1 ngay | Preview 20-30 giay |
| Queue render, giong doc, FFmpeg va kiem tra MP4 | 0.5-1 ngay | MP4 co am thanh |
| Test, gioi han chi phi va pilot | 0.5-1 ngay | San sang dung noi bo |
| **Tong MVP** | **3-4 ngay** | Video map 2D/2.5D 9:16 |

Thoi gian tren khong tinh thoi gian cho nha cung cap phan hoi ve license. Viec do thuong la nut that duy nhat khong do team ky thuat quyet dinh.

## 5. San pham MVP se co gi?

- Video doc 9:16, 1080p, khoang 20-30 giay.
- Zoom tu khu vuc rong vao du an.
- Polygon ranh dat, ghim du an, ten du an va logo.
- Toi da 5 diem tien ich va 3 tuyen ket noi.
- 3 kieu canh: zoom vao du an, hien ranh du an, ket noi tien ich.
- Giong doc, nhac neu da co nguon hop phap, MP4 va lich su render.

Chua nam trong MVP: 3D giong Google Earth, mo hinh 3D toa nha rieng, 4K, batch hang tram video va tu dong lay du lieu quy hoach.

## 6. Can mua hay dang ky dich vu nao?

| Dich vu | Dung de lam gi | Co bat buoc? | Ghi chu |
| --- | --- | --- | --- |
| VIETMAP | Nen ban do Viet Nam, tim dia chi, POI, route | Co, neu chay production tai VN | Can hop dong cho phep render tu dong va dua map vao MP4 thuong mai |
| MapTiler | Phuong an du phong map/anh ve tinh | Khong | Chi dung khi co license phu hop cho video/SaaS |
| TTS hien co | Tao giong doc | Tuy chon | Dung lai pipeline giong doc cua he thong |
| Cloudinary | Luu MP4, thumbnail, logo | Da co trong he thong | Chi phat sinh neu vuot quota hien co |
| Redis/BullMQ, MongoDB, FFmpeg | Hang doi, luu draft, xu ly MP4 | Da co trong he thong | Khong mua API map |

MapLibre, Turf, Terra Draw va GeoJSON la thu vien ma nguon mo: khong co phi API.

### Dieu can hoi vendor truoc khi mua

Gui dung cau hoi nay cho VIETMAP hoac vendor duoc chon:

> Chung toi cung cap SaaS tao video bat dong san. He thong headless render map, chup frame va ghep thanh MP4 cho khach hang. Xin xac nhan quyen su dung satellite/hybrid, geocoding, POI va routing cho use-case nay; quy dinh attribution, cache, quota va bao gia.

Khong nen mua goi API thong thuong roi mac dinh la duoc phep ban/phan phoi video. Quyen render, luu tru va phan phoi MP4 can duoc xac nhan bang van ban.

## 7. Chi phi du kien

Chi phi duoi day chi la API/license, khong tinh nhan cong phat trien, may chu hay thiet bi. Gia vendor co the thay doi, can xin bao gia truoc khi ky.

| Khoan | MVP noi bo | Production nho | Ghi chu |
| --- | ---: | ---: | --- |
| Thu vien map editor | 0 VND | 0 VND | MapLibre, Turf, Terra Draw |
| Map provider | 0 VND khi mock | Bao gia rieng | VIETMAP chua co bang gia video cong khai; phai xin quote/license |
| MapTiler Flex tham khao | khoang 30 USD/thang | khoang 30 USD/thang + vuot muc | Gia cong khai hien tai; khong du de tu dong resale/video neu chua co thoa thuan rieng |
| TTS, Cloudinary, Redis, MongoDB | co the 0 VND | Theo quota hien co | Chi tang khi luong video tang |
| Quy du phong API/test | 0.5-1 trieu VND | 1-3 trieu VND/thang | De test map, voice va luu tru |

### Cach hieu ngan sach

- **Lam va demo noi bo:** co the gan nhu 0 VND API map, dung nen mock/vector va quota hien co.
- **Pilot co video that:** can ngan sach toi thieu 1 trieu VND de test, nhung chi phi map co the cao hon neu vendor yeu cau license video.
- **Ban cho khach hang:** khong dua ra gia cam ket truoc khi co quote tu vendor. Day la khoan chi phi quan trong nhat.

MapTiler cong khai goi Flex 30 USD/thang va co muc phi vuot quota; trang gia cua ho dong thoi ghi ro xuat video/game can lien he de dung thuong mai, va resale chi co o Custom plan. Tham khao: [MapTiler pricing](https://www.maptiler.com/cloud/pricing/) va [MapTiler video licensing](https://www.maptiler.com/cloud/geolayers/).

## 8. Thu tu nen lam de tranh ton tien sai

1. Gui yeu cau license cho VIETMAP va lay bao gia.
2. Hoan thien MVP bang mock/vector trong khi cho phan hoi.
3. Dung provider that render mot video mau 20-30 giay.
4. Kiem tra attribution, quota, chi phi/video va MP4 co ca video + am thanh.
5. Chi sau do moi mo cho nguoi dung tao video hang loat.

## 9. Ket luan ngan gon

Phan mem co the hoan thien MVP trong 3-4 ngay ky thuat. Thu vien va ha tang chinh da co; khoan can mua quan trong nhat la du lieu map co quyen dua vao video thuong mai. Neu vendor chua chap nhan, van co the hoan thien UI, polygon, du lieu du an va render mock, nhung khong nen mo ban video map that.

## 10. Ranking: cai gi quan trong va kho nhat?

Quy uoc do kho: **1** = de, **3** = can ky thuat chuyen mon, **5** = rui ro cao hoac phu thuoc ben ngoai.

Quy uoc uu tien:

- **P0:** khong co thi khong the mo tinh nang.
- **P1:** can co de nguoi dung dung tot, co the lam sau P0.
- **P2:** lam sau khi da pilot va co nhu cau that.

| Thu tu | Hang muc | Uu tien | Do kho | Tai sao quan trong | Phu thuoc |
| ---: | --- | --- | ---: | --- | --- |
| 1 | Quyen dung du lieu map trong MP4 | P0 | 5 | Khong co quyen thi khong duoc ban/phan phoi video | Vendor |
| 2 | Provider adapter va bao ve API key | P0 | 4 | Mot diem ket noi an toan cho geocode, POI, route, style map | Vendor key/license |
| 3 | Render map on dinh trong worker | P0 | 5 | Final MP4 phai giong preview, tile phai tai du va khong co UI browser | Provider + Chromium |
| 4 | Render snapshot bat bien + idempotency | P0 | 4 | Dam bao render lai ra dung ban da xac nhan, khong tao trung video | Model/API |
| 5 | Queue, TTS, FFmpeg va kiem tra MP4 | P0 | 4 | MP4 phai co ca hinh va am thanh truoc khi bao hoan tat | Worker/hang doi |
| 6 | Camera preset theo frame | P0 | 4 | Tao cam giac bay map; preview va MP4 phai dong bo | Map renderer |
| 7 | Draft du an va polygon tenant-scoped | P0 | 3 | Nguoi dung khong mat du lieu va khong thay du lieu cua nhau | Auth + MongoDB |
| 8 | Geocode, POI, route va xac nhan du lieu | P1 | 3 | Giam nhap tay; tranh dua sai du lieu vao video | Provider adapter |
| 9 | Workspace low-tech | P1 | 3 | Nguoi dung khong can biet GIS van dung duoc | Draft + map editor |
| 10 | Overlay, logo, title, CTA, subtitle | P1 | 3 | Bien ban do thanh video marketing thay vi anh ky thuat | Scene plan |
| 11 | History, retry, cost/quota | P1 | 3 | Van hanh an toan va biet chi phi moi video | Queue + model |
| 12 | Fallback provider | P2 | 4 | Giam rui ro mot vendor, nhung khong can cho pilot dau | Adapter on dinh |
| 13 | 3D photorealistic / mo hinh toa nha | P2 | 5 | Dep hon nhung tang manh chi phi, license va do phuc tap | Du lieu 3D + GPU |
| 14 | Batch render va tu dong hoa campaign | P2 | 4 | Chi nen lam khi da co luong video va gia thanh ro rang | MVP on dinh |

### Ba viec kho nhat

1. **License map/video:** day la kho vi no la van de phap ly-va-thuong-mai, khong phai code. Phai co email/hop dong ro rang.
2. **Map render trong MP4:** browser preview co the chay, nhung worker headless can xu ly tile chua tai, timeout, font, camera va attribution dung cach.
3. **Dong bo preview voi MP4:** camera, polygon, route animation, overlay va voice phai dung cung mot timeline; khong dung animation ngau nhien hoac `flyTo()` cho final render.

## 11. Thu tu lam bat buoc

```text
License + provider
        -> provider adapter
        -> draft va render snapshot
        -> map renderer + camera
        -> queue/TTS/FFmpeg/verify MP4
        -> UI day du + history/cost
        -> pilot
        -> batch/3D sau nay
```

Ly do: giao dien co the lam song song, nhung khong nen dau tu vao video map that neu chua chung minh duoc provider cho phep render va worker co the tao MP4 on dinh.

## 12. Ke hoach chi tiet theo tung ngay

### Ngay 1 - chot nen tang

**Muc tieu:** co du an map co the luu va mo lai; khong dung API map that neu license chua duoc chap nhan.

- Gui yeu cau license va quote cho VIETMAP.
- Hoan thien provider interface: mock va VIETMAP adapter.
- Hoan thien model draft, validation, API luu/tai draft theo user + company.
- Noi nut Luu tam vao API, tai draft khi mo tab.
- Kiem tra polygon khong tu cat, toa do hop le va gioi han so diem.

**Xong ngay 1 khi:** nguoi dung dong/mo lai van thay dung ten du an, toa do va ranh dat; khong co API key o frontend.

### Ngay 2 - lam canh map

**Muc tieu:** co preview video mau 20-30 giay tu du lieu da luu.

- Them tim dia chi, reverse geocode, POI va route qua backend.
- Them 3 preset camera: zoom, ranh dat, ket noi tien ich.
- Them marker, polygon, route, label va attribution.
- Tao scene plan co dinh; camera chay theo frame, khong chay theo timer.
- Them logo, tieu de va CTA theo template.

**Xong ngay 2 khi:** preview co the chay tu dau den cuoi va dung du lieu du an da xac nhan.

### Ngay 3 - tao MP4 that

**Muc tieu:** mot nut tao video dua vao queue va tra ve MP4 co am thanh.

- Tao immutable render snapshot tu draft da xac nhan.
- Chay renderer trong worker, cho map/tile san sang truoc khi capture frame.
- Tao mot voice track, mux bang FFmpeg.
- Kiem tra stream video, stream audio, kich thuoc 1080p va thoi luong.
- Upload MP4, luu trang thai queued/rendering/completed/failed.

**Xong ngay 3 khi:** render lai cung snapshot khong tao task trung; video completed moi co URL tai xuong.

### Ngay 4 - hardening va pilot

**Muc tieu:** dung duoc noi bo tren mot so dia chi that.

- Them gioi han quota theo tenant va log chi phi/video.
- Xu ly loi provider, tile timeout, khong tim thay dia chi, route fail va TTS fail.
- Retry co gioi han; khong retry loi license, input sai hay het ngan sach.
- Test it nhat 3 dia chi, 2 ty le khung hinh va cac frame dau/giua/cuoi.
- Chot attribution va thong bao loi don gian cho nguoi dung.

**Xong ngay 4 khi:** tao duoc video mau on dinh, khong lo key, khong tra URL video chua verify.

## 13. Checklist de quyet dinh mo production

Chi bat nut tao video cho nguoi dung that khi tat ca muc P0 sau dat:

- [ ] Vendor xac nhan quyen render headless va phan phoi MP4 thuong mai.
- [ ] API key chi nam o server, co quota/rate limit va khong xuat hien trong browser hay video.
- [ ] Moi video co snapshot bat bien: du an, polygon, POI, route, camera, provider, attribution, scene va voice.
- [ ] Preview va MP4 dung cung camera/timeline.
- [ ] MP4 da duoc kiem tra co video stream va audio stream truoc khi hien link.
- [ ] Retry khong tao video trung; loi license/quota/input sai co trang thai ket thuc ro rang.
- [ ] Attribution cua provider hien dung theo hop dong.
- [ ] Da test tren du lieu that va kiem tra khong co gia, phap ly hay claim bi tu them vao video.

Neu con thieu license, he thong chi nen cho phep preview/mock noi bo; khong mo xuat MP4 map that cho khach hang.

## 14. Phan vai tro de video chinh xac nhu HTML-to-video

Khong dung mot AI hay mot module tu quyet dinh tat ca. Moi vai tro chi lam mot viec va ban giao du lieu co cau truc cho vai tro sau. Nho vay he thong de kiem tra, sua loi va khong tu them thong tin bat dong san.

```text
Nguoi dung xac nhan du lieu
        -> Vai tro 1: Kiem du lieu map
        -> Vai tro 2: Lap kich ban video
        -> Vai tro 3: Thiet ke canh map
        -> Vai tro 4: Tao voice va overlay
        -> Vai tro 5: Render MP4
        -> Vai tro 6: Kiem tra truoc khi xuat
```

| Vai tro | Nhiem vu duy nhat | Dau vao | Dau ra bat buoc | Khong duoc tu lam |
| --- | --- | --- | --- | --- |
| 1. Kiem du lieu map | Kiem toa do, polygon, POI, route va nguon du lieu | Draft nguoi dung + provider response | Du lieu map da xac nhan, source reference, attribution | Tu viet kịch ban, tu them tien ich/gia/phap ly |
| 2. Lap kich ban video | Chia video thanh cac canh va noi dung moi canh | Du lieu map da xac nhan + brief | Scene plan: thu tu, muc dich, text, narration, thoi gian | Tu goi SDK map, tu sua toa do |
| 3. Thiet ke canh map | Doi scene plan thanh camera, layer va hieu ung | Scene plan + geometry | Camera keyframe, polygon/route progress, layer config | Tu doi script, tu them claim marketing |
| 4. Voice va overlay | Tao voice script lien mach va layout logo/title/CTA | Scene plan + brand rules | Voice script, overlay config, voice settings | Tu them so dien thoai, gia hay uu dai chua duoc xac nhan |
| 5. Render worker | Render snapshot, TTS, mux audio va upload MP4 | Snapshot bat bien | MP4 tam, metadata, attempt/progress | Doc draft dang thay doi hoac dung key o frontend |
| 6. QA gate | Kiem tra dung du lieu, hinh, am thanh, attribution | MP4 + snapshot | Pass/Fail va ly do cu the | Tu sua am tham video da render |

### Vai tro cua AI va vai tro cua code

| Viec | AI duoc lam | Code bat buoc kiem soat |
| --- | --- | --- |
| Kich ban | De xuat cau chuyen va cau noi | Chi dung fact da xac nhan; gioi han do dai va scene order |
| Camera | Chon preset trong danh sach | Noi suy keyframe theo frame, khong dung random/flyTo cho final |
| Overlay | De xuat text ngan | Validate brand, safe area, khong chen claim khong co nguon |
| Du lieu map | Khong tu suy doan | Provider/backend + xac nhan nguoi dung |
| Render | Khong tu chay tren browser | Worker, queue, idempotency, FFmpeg va verify stream |

### Contract ban giao giua cac vai tro

1. **Map facts:** chi gom du lieu da xac nhan: toa do, polygon, POI, route, attribution va source reference.
2. **Scene plan:** moi canh co `id`, thoi gian bat dau/ket thuc, fact su dung, text hien thi, narration va camera preset.
3. **Render snapshot:** khoa lai map facts, scene plan, voice settings, provider/style version, video spec va idempotency key.
4. **QA result:** kiem tra MP4 co video stream, audio stream, dung kich thuoc, attribution va khong co browser/debug text.

Neu mot vai tro khong tra du dau ra bat buoc, pipeline dung o do va bao loi de sua; khong tu bo qua sang render. Day la cach giu video dung du lieu va de truy vet khi co van de.

### Thu tu implement cac vai tro

1. Vai tro 1 - data map va provider adapter.
2. Contract scene plan va snapshot.
3. Vai tro 3 - trusted MapSceneEngine/camera.
4. Vai tro 5 - queue, TTS, FFmpeg va verify MP4.
5. Vai tro 2 va 4 - AI script/overlay, sau khi da co cac contract de validate.
6. Vai tro 6 - QA gate, history, retry va cost controls.

Ly do de AI script/overlay sau: video dep nhung sai du lieu hoac render khong on dinh thi khong co gia tri. Data, camera va render la nen truoc; AI chi lam nhanh phan sang tao tren nen do.
