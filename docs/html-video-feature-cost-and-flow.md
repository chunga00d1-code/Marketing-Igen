# Hướng dẫn tính năng Tạo video từ HTML

## Tính năng này dùng để làm gì?

Tính năng giúp bạn biến một yêu cầu bằng chữ thành video marketing. Bạn chỉ cần chọn kiểu video, nhập nội dung cần nói và có thể đính kèm tài liệu thương hiệu, bảng giá, ảnh hoặc video mẫu.

Video không nên được xem là “nhập một prompt là xong”. Bản đầu tiên là **bản nháp để xem hướng đi**. Sau đó bạn tiếp tục nhắn yêu cầu chỉnh sửa cho đến khi đúng ý.

## Cách dùng đơn giản

### Bước 1: Cài đặt video

Trước khi nhập nội dung, chọn:

- **Preset nền tảng**: TikTok/Reels, Facebook/Instagram hoặc YouTube ngang.
- **Khung hình**: dọc 9:16, vuông 1:1 hoặc ngang 16:9.
- **Thời lượng**: từ 1 đến 180 giây.
- **Độ phân giải**: 720p (nhẹ hơn) hoặc 1080p (rõ hơn).

Mặc định là TikTok/Reels: **9:16, 45 giây, 1080p**.

### Bước 2: Tạo bản nháp đầu tiên

Nhập mục tiêu video, ví dụ:

> Video 45 giây giới thiệu bánh mây, nhấn mạnh nguyên liệu tự nhiên, ưu đãi khai trương 30% và CTA “Đặt ngay hôm nay”.

Nếu có tài liệu thương hiệu hoặc bảng giá, đính kèm ngay dưới ô prompt. AI sẽ dùng chúng làm nguồn tham khảo.

### Bước 3: Xem bản nháp

Hệ thống tạo giao diện video để bạn xem trước, sau đó render thành MP4. Bản đầu tiên thường cần chỉnh về:

- Câu chữ hoặc CTA.
- Màu sắc, nhịp độ, thứ tự cảnh.
- Phần ưu đãi, giá hoặc logo.
- Độ dài một đoạn cụ thể.

### Bước 4: Prompt để chỉnh sửa

Chọn video đang xem rồi nhập yêu cầu tiếp theo, ví dụ:

> Đổi CTA cuối thành “Đặt hàng ngay”, đưa ưu đãi 30% lên trong 5 giây đầu và dùng nền đỏ ấm hơn ở cảnh 2.

AI sẽ dùng **HTML/CSS của video hiện tại** để sửa, không dựng lại hoàn toàn từ số 0. Mỗi lần sửa tạo một phiên bản mới; video cũ vẫn được lưu để quay lại khi cần.

## Luồng hoạt động dễ hiểu

```text
Chọn cài đặt → nhập yêu cầu → xem bản nháp → góp ý bằng prompt
                                      ↓
                            tạo phiên bản mới
                                      ↓
                         render MP4 và lưu lịch sử
```

Phía sau, AI tạo bố cục video bằng HTML/CSS; HyperFrames chuyển bố cục đó thành MP4. Bạn không cần biết HTML/CSS để sử dụng.

## Chi phí AI ước tính

Chi phí AI dựa vào lượng chữ trong prompt/tài liệu và lượng nội dung AI phải tạo, **không tính thẳng theo số giây video**. Video dài hơn có thể mất thời gian render lâu hơn, nhưng không tự động làm chi phí AI tăng tương ứng.

| Tình huống | Chi phí AI ước tính |
| --- | ---: |
| Bản nháp prompt ngắn | $0.05–$0.08 |
| Video 45 giây thông thường | $0.08–$0.12 |
| Có 1–3 tài liệu tham khảo | $0.10–$0.18 |
| Prompt/tài liệu rất dài hoặc phải tạo lại | $0.15–$0.25 |

Ví dụ video TikTok 45 giây: lần tạo đầu khoảng **$0.08–$0.12**. Nếu cần 2–3 vòng chỉnh sửa để hoàn thiện, nên dự trù **$0.25–$0.40/video hoàn chỉnh**.

HyperFrames chạy trên máy/server nên không có phí HeyGen theo giây. Ngoài AI, hệ thống còn có chi phí nhỏ cho máy render và lưu file video.

## Ngân sách test để hoàn thiện tính năng

Để test đúng cách, không chỉ test “tạo được video” mà cần test các vòng chỉnh sửa:

| Việc cần test | Số lần gợi ý | Ngân sách AI |
| --- | ---: | ---: |
| Tạo bản nháp với các khung hình/thời lượng khác nhau | 20 | $1.5–$2.5 |
| Test tài liệu thật, CTA, màu sắc và logo | 15 | $1.5–$3.0 |
| Test chỉnh sửa nhiều vòng trên cùng video | 20 | $2.0–$4.0 |
| Test lỗi, retry và video dài | 10 | $1.0–$2.5 |
| **Tổng nên dự trù** | **65 lần** | **$6–$12** |

Nên dành thêm 30–50% dự phòng cho các bản sửa ngoài kế hoạch. Ngân sách test an toàn để hoàn thiện trước khi đưa người dùng sử dụng là **$10–$18**, chưa gồm dung lượng lưu video.

## Lưu ý quan trọng

- Hãy mô tả rõ mục tiêu, khách hàng, ưu đãi và CTA trong prompt đầu tiên.
- Dùng prompt tiếp theo để sửa từng điểm cụ thể; không cần viết lại toàn bộ yêu cầu.
- Luôn xem preview trước khi render/tải video cuối.
- Video dài hoặc có nhiều tài liệu thường cần nhiều vòng chỉnh hơn video ngắn.

## Thông tin giá tham khảo

Model chính là Gemini 3.5 Flash qua OpenRouter. Giá tham khảo: $1.50/1 triệu token input và $9/1 triệu token output. Xem giá mới nhất tại [OpenRouter](https://openrouter.ai/google/gemini-3.5-flash/pricing).
