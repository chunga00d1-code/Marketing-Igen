# Báo cáo OpenRouter Transcription — Top 10 cho Video Caption

> Cập nhật: 27/07/2026  
> Phạm vi: lựa chọn mô hình speech-to-text (STT) cho timeline phụ đề video, ưu tiên tiếng Việt, pay-as-you-go và không cần subscription tháng.

## 1. Tóm tắt quyết định

OpenRouter có endpoint STT chuyên dụng `POST /api/v1/audio/transcriptions`. Đây là phương án pay-as-you-go phù hợp để thay ElevenLabs cho phụ đề lời nói.

Đối với Video Studio, không nên chọn model chỉ vì thứ hạng request. Điều kiện bắt buộc là:

1. Nhận diện tiếng Việt đủ tốt.
2. Trả được timestamp `start/end` để tạo và kéo-thả caption trên timeline.
3. Có giá theo phút rõ ràng hoặc có thể đo được từ usage.
4. Có fallback khi provider/model lỗi.

**Khuyến nghị ban đầu:**

```text
Primary thử nghiệm:  openai/whisper-large-v3
Candidate nâng cấp:  qwen/qwen3-asr-flash-2026-02-10
Fallback nhanh:      openai/whisper-large-v3-turbo
```

Whisper Large V3 là lựa chọn an toàn nhất để triển khai trước vì OpenRouter ghi rõ hỗ trợ timestamp theo từ và theo đoạn. Qwen3 ASR Flash rất đáng thử cho tiếng Việt, nhưng phải xác minh payload timestamp mà OpenRouter thực sự trả về trước khi dùng làm primary.

## 2. Cách đọc leaderboard

Ảnh leaderboard do người dùng cung cấp xếp hạng theo **số request trong tuần**, không phải bảng benchmark độ chính xác tiếng Việt, khả năng timestamp hay chi phí thấp nhất.

Top 10 trên ảnh:

1. Whisper Large V3
2. Whisper Large V3 Turbo
3. GPT-4o Mini Transcribe
4. Qwen3 ASR Flash
5. MAI-Transcribe 1.5
6. Whisper 1
7. Voxtral Mini Transcribe
8. GPT-4o Transcribe
9. Parakeet TDT 0.6B v3
10. Chirp 3

Nguồn danh mục/leaderboard: [OpenRouter Transcription Models](https://openrouter.ai/models?output_modalities=transcription) và [OpenRouter STT collection](https://openrouter.ai/collections/speech-to-text-models).

## 3. Đơn giá quy đổi

Quy đổi tham khảo dùng tỷ giá **25.260 VND/USD**. Giá thực tế chịu ảnh hưởng bởi tỷ giá thanh toán, thuế và chính sách giá OpenRouter/provider tại thời điểm gọi.

| Model | Giá niêm yết | Ước tính/phút | Ước tính VND/phút | Ghi chú |
|---|---:|---:|---:|---|
| Whisper Large V3 | $0.0015/phút | $0.0015 | ~38đ | Giá cố định theo phút |
| Whisper Large V3 Turbo | $0.04/giờ | $0.000667 | ~17đ | Rất rẻ, ưu tiên tốc độ |
| GPT-4o Mini Transcribe | $1.25/M input, $5/M output | Biến đổi | Cần đo usage | Giá theo token audio/text |
| Qwen3 ASR Flash | $0.000035/giây | $0.0021 | ~53đ | Giá cố định theo giây |
| MAI-Transcribe 1.5 | $0.36/giờ | $0.0060 | ~152đ | Giá cố định theo thời lượng |
| Whisper 1 | $0.006/phút | $0.0060 | ~152đ | Legacy, đắt hơn V3 |
| Voxtral Mini Transcribe | $0.003/phút | $0.0030 | ~76đ | Cần xác minh tiếng Việt |
| GPT-4o Transcribe | $2.50/M input, $10/M output | Biến đổi | Cần đo usage | Dùng cho QA/fallback chất lượng |
| Parakeet TDT 0.6B v3 | $0.0015/phút | $0.0015 | ~38đ | Không ưu tiên tiếng Việt |
| Chirp 3 | $0.016/phút | $0.0160 | ~404đ | Đắt; không lợi thế về chi phí |

Các giá theo phút/giờ lấy từ trang model và danh sách transcription của OpenRouter. Giá token không thể quy đổi chính xác sang một phút audio nếu chưa chạy video mẫu vì phụ thuộc audio tokens, transcript tokens và response format.

## 4. Đánh giá chi tiết từng model

| # | Model | Tiếng Việt | Timestamp cho timeline | Nên dùng | Nhận định |
|---:|---|---|---|---|---|
| 1 | `openai/whisper-large-v3` | Có, 99+ ngôn ngữ | **Có word + segment** | **Primary** | Cân bằng tốt nhất giữa giá, độ ổn định và contract caption. |
| 2 | `openai/whisper-large-v3-turbo` | Có, 99+ ngôn ngữ | Cần test payload OpenRouter | Fallback tốc độ/chi phí | Rẻ nhất top 10; độ chính xác công bố thấp hơn V3. |
| 3 | `openai/gpt-4o-mini-transcribe` | Đa ngôn ngữ | Chưa có cam kết word timestamps trên OpenRouter | QA/fallback transcript | Không dùng làm timeline primary nếu thiếu mốc từ. |
| 4 | `qwen/qwen3-asr-flash-2026-02-10` | **Có `vi`** | Qwen trực tiếp có timestamp; OpenRouter cần test | **Candidate primary** | Giá tốt, hỗ trợ tiếng Việt và nhạc nền; tiềm năng lớn. |
| 5 | `microsoft/mai-transcribe-1.5` | Có auto locale, cần test vi-VN | Chưa xác minh contract timestamp | Fallback chất lượng | Hợp audio khó/noise; không có diarization. |
| 6 | `openai/whisper-1` | 50+ ngôn ngữ | Cần test payload OpenRouter | Không ưu tiên | Đắt hơn V3, không có lý do tốt để làm default. |
| 7 | `mistralai/voxtral-mini-transcribe` | Chưa xác minh | Chưa xác minh | Chỉ benchmark thêm | Giá ổn, nhưng thiếu bằng chứng về tiếng Việt và timestamp. |
| 8 | `openai/gpt-4o-transcribe` | Đa ngôn ngữ | Chưa có cam kết word timestamps | Video quan trọng/QA | Chất lượng cao hơn Mini nhưng chi phí token cao hơn. |
| 9 | `nvidia/parakeet-tdt-0.6b-v3` | Không nên kỳ vọng tiếng Việt | Có segment timestamps | Loại khỏi primary | Trang model mô tả hỗ trợ các ngôn ngữ EU; không phù hợp ưu tiên tiếng Việt. |
| 10 | `google/chirp-3` | Cần test theo provider | Cần test payload OpenRouter | Không ưu tiên | Giá cao hơn nhiều các lựa chọn ở trên. |

### 4.1. Whisper Large V3 — lựa chọn triển khai trước

- Giá khoảng 38đ/phút.
- Hỗ trợ hơn 99 ngôn ngữ.
- OpenRouter ghi rõ có timestamp granularities theo **word** và **segment**.
- Đây là contract phù hợp nhất với pipeline hiện có: chuẩn hóa word time → tách câu → timeline → preview → SRT/VTT → render.

Nguồn: [OpenRouter Whisper Large V3](https://openrouter.ai/openai/whisper-large-v3/).

### 4.2. Whisper Large V3 Turbo — lựa chọn chi phí/tốc độ

- Giá khoảng 17đ/phút, thấp nhất trong top 10.
- Mô tả hỗ trợ hơn 99 ngôn ngữ và ưu tiên throughput/latency.
- OpenRouter công bố WER 12%, trong khi V3 là 10,3%; số liệu này không phải benchmark riêng tiếng Việt.

Chỉ dùng làm fallback sau khi kiểm tra response có timestamp đủ cho timeline. Nếu chỉ trả `text`, không được tự bịa thời gian theo số ký tự.

Nguồn: [OpenRouter Whisper Large V3 Turbo](https://openrouter.ai/openai/whisper-large-v3-turbo/uptime).

### 4.3. Qwen3 ASR Flash — candidate cần benchmark đầu tiên

- Giá khoảng 53đ/phút.
- Qwen xác nhận Qwen3-ASR hỗ trợ tiếng Việt (`vi`) trong danh sách ngôn ngữ.
- Qwen công bố nhận diện được speech, singing voice và audio có nhạc nền.
- Qwen có dịch vụ file transcription hỗ trợ word-level timestamps.

Rủi ro duy nhất: endpoint STT của OpenRouter được chuẩn hóa, tài liệu công khai hiện chỉ chắc chắn trả `text`; phải xác minh `response_format` có trả `segments`/`words` với `start/end` hay không. Nếu không, Qwen vẫn dùng được để transcript nhưng không đủ điều kiện làm primary cho timeline render.

Nguồn: [Qwen3 ASR on OpenRouter](https://openrouter.ai/qwen/qwen3-asr-flash-2026-02-10/pricing), [Qwen3 ASR language/timestamp](https://qwen.ai/blog?id=qwen3asr), [Qwen file transcription timestamps](https://help.aliyun.com/en/model-studio/real-time-speech-recognition-user-guide).

### 4.4. Các model token-priced

GPT-4o Mini Transcribe và GPT-4o Transcribe có thể tốt khi audio khó, nhưng không nên đưa vào routing mặc định vì:

- chi phí thay đổi theo token, khó hiển thị giá trước cho người dùng;
- chưa có contract công khai trên OpenRouter đảm bảo word timestamps tương đương Whisper V3;
- không có lợi thế rõ ràng về cost khi xử lý hàng loạt video marketing ngắn.

Nguồn: [GPT-4o Mini Transcribe](https://openrouter.ai/openai/gpt-4o-mini-transcribe/pricing), [GPT-4o Transcribe](https://openrouter.ai/openai/gpt-4o-transcribe).

### 4.5. Các model không nên đưa vào primary ở giai đoạn đầu

- **Whisper 1:** đắt hơn Whisper V3 nhưng không có lợi thế rõ ràng.
- **Voxtral Mini Transcribe:** cần kiểm chứng tiếng Việt và timestamp.
- **Parakeet TDT 0.6B v3:** mô tả OpenRouter chỉ cam kết nhóm ngôn ngữ EU; loại khỏi ưu tiên tiếng Việt.
- **Chirp 3:** đơn giá cao (~404đ/phút), không cạnh tranh với V3/Qwen cho mục tiêu tiết kiệm.

Nguồn: [Voxtral Mini Transcribe](https://openrouter.ai/mistralai/voxtral-mini-transcribe/providers), [Parakeet](https://openrouter.ai/nvidia/parakeet-tdt-0.6b-v3/uptime), [Chirp 3 list](https://openrouter.ai/models?output_modalities=transcription).

## 5. Kiến trúc tích hợp đề xuất

OpenRouter STT nhận **audio base64**, không nhận audio URL trực tiếp. Vì source của Video Studio là video URL, worker phải thực hiện:

```text
Cloudinary/source video URL
  → tải worker-side
  → FFmpeg tách audio mono, 16 kHz
  → kiểm tra duration và giới hạn dung lượng
  → encode base64
  → POST OpenRouter /api/v1/audio/transcriptions
  → validate transcript + timestamps
  → chuẩn hóa về VideoCaptionSegment
  → lưu project, job, usage và chi phí
```

Không gọi OpenRouter từ browser: API key phải nằm ở backend. Không encode toàn bộ video 1 GB vào JSON; chỉ tách audio nén phù hợp, đặt giới hạn kích thước và timeout.

Nguồn API: [OpenRouter Speech-to-Text](https://openrouter.ai/docs/guides/overview/multimodal/stt), [OpenRouter audio input](https://openrouter.ai/docs/guides/overview/multimodal/audio).

## 6. Contract bắt buộc trước khi chọn primary

Mỗi candidate phải được test thực tế với cùng một audio và pass tất cả tiêu chí:

```json
{
  "text": "...",
  "language": "vi",
  "words": [
    { "text": "...", "startMs": 0, "endMs": 420 }
  ]
}
```

Điều kiện chấp nhận:

- Có transcript không rỗng cho audio có lời nói.
- Có `start/end` hợp lệ cho phần tử dùng dựng caption; không tự nội suy theo số ký tự.
- Timestamp nằm trong thời lượng video và không âm.
- Có nhận diện tiếng Việt chính xác trên mẫu giọng Bắc/Nam.
- Provider trả usage hoặc có thể suy ra chi phí theo duration.
- Lỗi provider được phân loại để retry có giới hạn, không gọi lặp vô hạn.

## 7. Bộ benchmark khuyến nghị

Chạy 20 video tiếng Việt thực tế, mỗi video 30–120 giây:

| Nhóm test | Số video | Mục tiêu |
|---|---:|---|
| Giọng Bắc rõ, không nhạc | 3 | Baseline transcript/timestamp |
| Giọng Nam rõ, không nhạc | 3 | Accent coverage |
| Nhạc nền nhẹ | 3 | Độ bền với BGM |
| Nhiều người nói | 3 | Tách câu và collision timeline |
| Tên thương hiệu/SKU | 3 | Thuật ngữ marketing |
| Âm thanh nhiễu hoặc xa mic | 3 | Robustness |
| Tiếng Việt xen tiếng Anh | 2 | Language handling |

Đo bốn chỉ số:

1. Tỷ lệ từ/cụm sai sau khi đối chiếu transcript chỉnh tay.
2. Độ lệch mốc thời gian trung vị và P95.
3. Tỷ lệ caption xuất hiện đúng trong preview/render.
4. Chi phí thực tế/phút audio từ usage log.

## 8. Chính sách routing và kiểm soát chi phí

### Routing đề xuất sau benchmark

```text
Nếu Whisper V3 pass tốt nhất:
  primary  = Whisper Large V3
  fallback = Whisper Large V3 Turbo

Nếu Qwen trả word timestamps và chất lượng đạt ngưỡng:
  primary  = Qwen3 ASR Flash
  fallback = Whisper Large V3
```

### Guardrail bắt buộc

- Không tạo STT mới khi người dùng chỉ sửa text, font, màu, nền, vị trí hoặc render lại.
- Cache transcript theo `video fingerprint + language + provider model`.
- Có idempotency key và giới hạn retry.
- Lưu `provider`, `model`, duration, usage, estimatedCost, actualCost, provider request ID và lỗi đã được làm sạch.
- Dùng allow-list model; không cho client truyền model slug tùy ý.
- Đặt monthly spend limit ở OpenRouter và alert theo ngày.

## 9. Kết luận

Cho production caption tiếng Việt pay-as-you-go, thứ tự ưu tiên là:

1. **Whisper Large V3** — triển khai trước, 38đ/phút, timestamp contract rõ ràng.
2. **Qwen3 ASR Flash** — benchmark ngay, 53đ/phút, tiềm năng tốt cho tiếng Việt; chỉ chọn primary nếu OpenRouter trả timestamp đủ.
3. **Whisper Large V3 Turbo** — fallback rẻ/nhanh, cần test timestamp.

Gemini nên tiếp tục giữ vai trò tạo chữ theo AI/ngữ cảnh, không dùng làm nguồn timeline STT chính.
