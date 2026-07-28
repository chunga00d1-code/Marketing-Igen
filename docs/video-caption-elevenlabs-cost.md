# Chi phí phụ đề video với ElevenLabs

> Cập nhật: 27/07/2026  
> Phạm vi: phụ đề theo lời nói trong Video Studio (`speech`) và phần lời nói của chế độ `combined`.

## 1. Kết luận nhanh

Với phụ đề lời nói cơ bản, ElevenLabs Scribe v2 có chi phí API là **0,22 USD/giờ audio**.

- 1 phút audio: **0,00367 USD**, xấp xỉ **93 đồng**.
- Video 90 giây: **0,0055 USD**, xấp xỉ **139 đồng**.
- Video 10 phút: **0,0367 USD**, xấp xỉ **926 đồng**.
- 1.000 video, mỗi video 1 phút: **3,67 USD**, xấp xỉ **92.620 đồng**.

Các con số trên chỉ là chi phí nhận diện lời nói (STT). Thuế, chi phí gói thuê bao, Cloudinary, máy chủ render và AI tạo chữ theo ngữ cảnh được tách riêng ở các phần bên dưới.

## 2. Phạm vi của chi phí ElevenLabs

### Có tính phí

ElevenLabs tính tiền theo **thời lượng audio/video gửi sang Scribe v2**, không theo số câu phụ đề, số từ, số lần người dùng xem preview hay số lần sửa chữ.

Trong Video Studio, một lần tạo phụ đề lời nói gồm:

1. Gửi file hoặc URL video sang endpoint Speech-to-Text.
2. Nhận transcript và mốc thời gian theo từ.
3. Chuyển transcript thành các đoạn phụ đề trên timeline.

Chỉ bước 1 phát sinh chi phí ElevenLabs. Sửa nội dung, font, cỡ chữ, màu, nền, vị trí hay kéo-thả mốc trên timeline không được phép gửi lại STT.

### Không thuộc chi phí ElevenLabs

- Upload, lưu trữ, proxy và băng thông video tại Cloudinary.
- CPU/RAM/ổ đĩa VPS cho worker, FFmpeg và render video gắn phụ đề.
- MongoDB, Redis và logging.
- Gemini hoặc nhà cung cấp AI khác khi tạo **chữ theo AI/ngữ cảnh**.
- Thuế VAT, phí thanh toán, hoặc phí vượt quota của gói Cloudinary/VPS.

## 3. Đơn giá Scribe v2

| Hạng mục | Giá niêm yết |
|---|---:|
| Scribe v2 batch (phù hợp upload video/caption) | 0,22 USD/giờ |
| Scribe v2 batch theo phút | 0,0036667 USD/phút |
| Scribe v2 Realtime | 0,39 USD/giờ |
| Keyterm prompting | +0,05 USD/giờ |
| Entity detection | +0,07 USD/giờ |

Video Studio nên dùng **Scribe v2 batch**, không dùng bản Realtime. Caption là tác vụ hậu kỳ; Realtime đắt hơn nhưng không đem lại lợi ích đáng kể cho luồng upload video.

Nguồn giá và giới hạn API:

- [ElevenLabs API Pricing](https://elevenlabs.io/pricing/api)
- [ElevenLabs Speech-to-Text documentation](https://elevenlabs.io/docs/overview/capabilities/speech-to-text/)
- [Scribe v2 API reference](https://elevenlabs.io/docs/api-reference/speech-to-text/convert)

## 4. Công thức dự toán

### 4.1. Caption lời nói cơ bản

```text
Chi phí USD = thời lượng audio (giây) / 3.600 × 0,22
Chi phí VND = chi phí USD × tỷ giá USD/VND
```

Tài liệu này quy đổi tham khảo theo **25.260 VND/USD**. Đây là tỷ giá tham chiếu, không phải tỷ giá thanh toán thẻ thực tế.

Nguồn tham khảo tỷ giá: [NCB Exchange Rates](https://www.ncb-bank.vn/en/exchange-rates).

### 4.2. Khi bật tính năng nâng cao

```text
Scribe cơ bản                 = 0,22 USD/giờ
Scribe + keyterms             = 0,27 USD/giờ
Scribe + entity detection     = 0,29 USD/giờ
Scribe + cả hai               = 0,34 USD/giờ
```

Keyterm prompting có ích cho tên thương hiệu, SKU, tên thuốc, địa danh hoặc thuật ngữ dễ sai. Entity detection chỉ nên bật khi thật sự cần nhận diện thông tin có cấu trúc; không phù hợp làm mặc định cho caption marketing.

## 5. Bảng dự toán theo độ dài video

| Thời lượng | Scribe cơ bản (USD) | Scribe cơ bản (VND, tham khảo) | Keyterms (VND) | Entity detection (VND) | Cả hai (VND) |
|---:|---:|---:|---:|---:|---:|
| 30 giây | 0,00183 | ~46đ | ~57đ | ~61đ | ~72đ |
| 1 phút | 0,00367 | ~93đ | ~114đ | ~122đ | ~143đ |
| 1 phút 29 giây | 0,00544 | ~137đ | ~168đ | ~181đ | ~212đ |
| 2 phút | 0,00733 | ~185đ | ~227đ | ~244đ | ~286đ |
| 5 phút | 0,01833 | ~463đ | ~568đ | ~610đ | ~715đ |
| 10 phút | 0,03667 | ~926đ | ~1.136đ | ~1.221đ | ~1.431đ |
| 30 phút | 0,11000 | ~2.779đ | ~3.410đ | ~3.663đ | ~4.284đ |
| 60 phút | 0,22000 | ~5.557đ | ~6.820đ | ~7.325đ | ~8.588đ |

Làm tròn đến đồng; số tiền thực tế có thể thay đổi theo tỷ giá, thuế và chính sách thanh toán của ElevenLabs.

## 6. Ví dụ vận hành

### Ví dụ A — Video TikTok 89 giây, chỉ phụ đề theo lời nói

```text
89 / 3.600 × 0,22 = 0,00544 USD
≈ 137 đồng/video
```

100 video cùng độ dài:

```text
0,544 USD
≈ 13.737 đồng
```

### Ví dụ B — 1.000 video Reel, mỗi video 1 phút

```text
1.000 × 0,00367 USD = 3,67 USD
≈ 92.620 đồng
```

Nếu mọi video đều bật keyterms:

```text
1.000 × 0,00450 USD = 4,50 USD
≈ 113.670 đồng
```

### Ví dụ C — 100 video hướng dẫn, mỗi video 10 phút

```text
100 × 0,03667 USD = 3,67 USD
≈ 92.620 đồng
```

Đây là lý do chi phí chính cần quản lý không phải là số video, mà là **tổng số phút audio được nhận diện lại**.

## 7. Gói thuê bao và quota

Trang giá ElevenLabs hiện hiển thị quota Scribe v2 theo từng gói:

| Gói | Giá niêm yết/tháng | Thời lượng Scribe v2 gồm trong gói |
|---|---:|---:|
| Free / Pay as you go | 0 USD | 4,5 giờ |
| Starter | 6 USD | 27 giờ |
| Creator | 22 USD | 100 giờ |
| Pro | 99 USD | 450 giờ |
| Scale | 299 USD | 1.359 giờ |

Khi chọn gói, cần kiểm tra trực tiếp trong workspace ElevenLabs trước khi thanh toán, vì quota và thuế có thể được ElevenLabs thay đổi theo khu vực hoặc thời điểm.

## 8. Cấu hình đề xuất cho Video Studio

### Mặc định nên bật

```text
model_id: scribe_v2
timestamps_granularity: word
language_code: vi (khi người dùng chọn tiếng Việt)
no_verbatim: true
tag_audio_events: false
diarize: false
```

### Chỉ bật khi có nhu cầu rõ ràng

```text
keyterm prompting: tên thương hiệu, SKU, tên riêng quan trọng
entity detection: quy trình bắt buộc trích xuất hoặc che dữ liệu nhạy cảm
diarization: video phỏng vấn/nhiều người nói cần phân biệt speaker
```

### Ngôn ngữ

Scribe v2 hỗ trợ tiếng Việt (`vie`/mã ISO theo API). Nếu không chắc ngôn ngữ audio, để tự nhận diện. Với video marketing tiếng Việt, nên truyền ngôn ngữ rõ ràng để kết quả ổn định hơn.

## 9. Chính sách chống phát sinh chi phí ngoài ý muốn

1. **Không nhận diện lại khi chỉnh style.** Thay font, màu, nền, vị trí, kéo-thả timeline và sửa text chỉ lưu project/segment.
2. **Không nhận diện lại khi render lại.** Render preview hoặc xuất video dùng transcript đã lưu.
3. **Có idempotency key.** Bấm nút liên tiếp hoặc browser retry không được tạo nhiều job STT cho cùng một yêu cầu.
4. **Chỉ “Nhận diện lại” khi người dùng chủ động bấm.** Hiển thị cảnh báo thời lượng và chi phí ước tính trước khi tạo job mới.
5. **Giới hạn retry.** Retry do lỗi mạng có thể gửi lại audio và tạo thêm chi phí; giới hạn số lần và lưu provider request ID để đối soát.
6. **Tái sử dụng transcript theo video fingerprint.** Cùng một video, cùng ngôn ngữ và cùng phiên bản transcript không nên gọi ElevenLabs lần thứ hai.
7. **Log chi phí trên từng job.** Lưu provider, model, audio duration, request ID, trạng thái, lần thử và `estimatedCost`/`actualCost`.

## 10. Các khoản hạ tầng ngoài STT

### Cloudinary

Cloudinary tính quota theo credit cho lưu trữ, băng thông, transformations và xử lý video. Một credit có thể tương đương 500 giây SD hoặc 250 giây HD video processing; việc tạo proxy, biến đổi video và băng thông xem preview có thể tiêu hao quota riêng.

Không thể gán một giá tiền cố định cho một video nếu chưa biết:

- dung lượng và độ phân giải video gốc;
- có tạo proxy/biến thể HD hay không;
- có lưu video gắn caption hay không;
- số lượt xem preview/tải video;
- gói Cloudinary hiện có và quota còn lại.

Nguồn: [Cloudinary pricing](https://cloudinary.com/pricing/compare-plans) và [Cloudinary billing overview](https://cloudinary.com/documentation/billing_and_plans).

### Render và worker

Nếu render bằng FFmpeg/Remotion trên VPS, không có phí API theo video, nhưng có chi phí hạ tầng gián tiếp: CPU, RAM, disk I/O và dung lượng lưu output. Cần theo dõi thời gian render, dung lượng output và tải worker để phân bổ chi phí nội bộ khi quy mô tăng.

### Chữ theo AI/ngữ cảnh

Chế độ `combined` có thêm phần chữ theo AI/ngữ cảnh. Phần đó không phải Speech-to-Text và có chi phí Gemini/AI riêng theo token, ảnh/video đầu vào và model được cấu hình. Vì vậy không gộp nó vào đơn giá Scribe ở tài liệu này.

## 11. Checklist trước khi bật lại ElevenLabs

- [ ] Hoàn tất hóa đơn hoặc xử lý lỗi thanh toán của workspace ElevenLabs.
- [ ] Đặt lại API key hợp lệ tại user/company hoặc biến môi trường theo thiết kế triển khai.
- [ ] Chuyển provider caption từ Whisper VPS về ElevenLabs Scribe v2.
- [ ] Gửi `language_code` đúng với lựa chọn giao diện; tiếng Việt là mặc định.
- [ ] Kiểm tra video mẫu tiếng Việt 30–90 giây, video không tiếng nói và video nhiều người nói.
- [ ] Xác nhận timeline dùng word timestamps và preview hiển thị đúng.
- [ ] Kiểm tra một lần retry có tạo thêm usage hay không.
- [ ] Theo dõi usage/analytics trong ElevenLabs sau bài test đầu tiên.

## 12. Quyết định khuyến nghị

Với nhu cầu caption tiếng Việt cho video marketing, ưu tiên:

1. **ElevenLabs Scribe v2 batch** cho phần phụ đề lời nói.
2. Tiếng Việt là lựa chọn mặc định; chỉ dùng tự nhận diện cho audio đa ngôn ngữ.
3. Tắt keyterms, entities và diarization mặc định để giữ mức khoảng **93đ/phút**.
4. Chỉ bật keyterms cho một số video có brand/SKU/tên riêng quan trọng.
5. Tách chi phí STT ra khỏi chi phí render và AI ngữ cảnh trong dashboard để không đánh giá sai chi phí trên một video.
