# 💰 Chi Phí Test Campaign – iGen Marketing ERP

> **Stack AI:** Gemini 2.5 Flash (phân tích/scoring) · Gemini 3.5 Flash (render nội dung) · Qwen3-6B Flash via OpenRouter (fallback miễn phí)
> **Media:** Ảnh lấy từ **Google Drive** (không phát sinh chi phí gen ảnh)
> **Cơ sở tính:** 1 campaign = 30 slots, mỗi slot sinh 3 candidates
> **Thời điểm giá:** Tháng 7/2026

---

## Luồng Campaign & Chi Phí Từng Bước

```
[1] Tạo Campaign & Đọc Drive
        ↓
[2] Research từng Slot (Apify)
        ↓
[3] AI Phân tích & Xây dựng Brief (Gemini)
        ↓
[4] AI Sinh nội dung – Multi Candidates (Gemini / Qwen fallback)
        ↓
[5] AI Validation & Duplicate Check (Gemini)
        ↓
[6] AI Scoring & Chọn Winner (Gemini)
        ↓
[7] Director Duyệt nội dung (manual)
        ↓
[8] Publish lên Facebook / TikTok
```

---

## Bước 1 – Tạo Campaign & Đọc Google Drive

| Hành động | Công cụ | Chi phí |
|---|---|---|
| Tạo campaign, nhập Drive folder URL | ERP UI | $0 |
| Parse cấu trúc Drive folder, map ảnh vào slots | Google Drive API (public folder, không cần auth) | **$0** |
| Upload ảnh từ Drive lên Cloudinary CDN để dùng ổn định | Cloudinary (free tier: 25GB, 25K transforms/tháng) | **$0** |

**Chi phí bước 1:** $0

---

## Bước 2 – Research Từng Slot (Apify)

| Actor | Mục đích | Số lần gọi | Đơn giá | Chi phí |
|---|---|---|---|---|
| `apify/google-search-scraper` | Tìm keyword, trend, intent cho chủ đề slot | 30 runs (1/slot) | ~$0.05/run | ~$1.50 |
| `powerai/facebook-post-search-scraper` | Phân tích bài đăng đối thủ trên Facebook | 30 runs | ~$0.05/run | ~$1.50 |
| `clockworks/tiktok-scraper` | Phân tích video trending TikTok theo chủ đề | 30 runs | ~$0.05/run | ~$1.50 |

> **Hard cap hệ thống:** `$0.25/slot` · `$3.00/campaign`
> **Cache:** 12h mặc định, tăng lên 24h khi test để tái sử dụng dữ liệu

**Chi phí bước 2:** tối đa **$3.00**

---

## Bước 3 – AI Phân Tích & Xây Dựng Brief (Researcher Agent)

| Model | Mục đích | Số request | Token/req | Đơn giá | Chi phí |
|---|---|---|---|---|---|
| `gemini-2.5-flash` | Đọc kết quả Apify → phân tích insight → viết slot brief | 30 req (1/slot) | ~3,000 input + 800 output | $0.00015/1K in + $0.0006/1K out | **~$0.014** |
| `qwen/qwen3-6b` (OpenRouter – free) | Fallback phân tích khi Gemini rate-limit | ~5 req | ~3,000 tokens | $0 | **$0** |

**Chi phí bước 3:** ~**$0.014**

---

## Bước 4 – AI Render Nội Dung – Multi Candidates

> Mỗi slot sinh **3 candidates** caption + hashtag + CTA để tăng chất lượng tuyển chọn.
> **Tác vụ render nội dung dùng Gemini 3.5 Flash** (tốc độ cao, chi phí thấp).

| Model | Mục đích | Số request | Token/req | Đơn giá | Chi phí |
|---|---|---|---|---|---|
| `gemini-3.5-flash` | **Render caption chính** cho tất cả candidates | 90 req (3 × 30 slots) | ~1,200 output | ~$0.00007/1K output | **~$0.008** |
| `qwen/qwen3-6b` (OpenRouter – free) | Fallback render khi Gemini 3.5 bị rate-limit | ~15 req | ~1,000 tokens | $0 | **$0** |

**Chi phí bước 4:** ~**$0.078**

---

## Bước 5 – AI Validation & Duplicate Detection

| Model | Mục đích | Số request | Token/req | Đơn giá | Chi phí |
|---|---|---|---|---|---|
| `gemini-2.5-flash` | Kiểm tra hard rules: độ dài, ngôn ngữ, spam, trùng lặp | 90 req (3 candidates/slot) | ~500 input | $0.00015/1K input | **~$0.007** |

**Chi phí bước 5:** ~**$0.007**

---

## Bước 6 – AI Scoring & Chọn Candidate Tốt Nhất

| Model | Mục đích | Số request | Token/req | Đơn giá | Chi phí |
|---|---|---|---|---|---|
| `gemini-2.5-flash` | Chấm điểm candidates (relevance, engagement, brand fit) → chọn winner | 30 req (1/slot) | ~2,000 input | $0.00015/1K input | **~$0.009** |
| `qwen/qwen3-6b` (OpenRouter – free) | Fallback scoring | ~3 req | ~2,000 tokens | $0 | **$0** |

**Chi phí bước 6:** ~**$0.009**

---

## Bước 7 – Director Duyệt Nội Dung

| Hành động | Công cụ | Chi phí |
|---|---|---|
| Xem bài viết + ảnh từ Drive trên UI | ERP Internal | $0 |
| Sửa caption thủ công nếu cần | ERP Editor | $0 |
| Approve / Reject slot | ERP Button | $0 |
| Nhận thông báo qua Telegram Bot | Telegram API | $0 |

**Chi phí bước 7:** $0

---

## Bước 8 – Publish lên Nền Tảng

| Nền tảng | API | Chi phí |
|---|---|---|
| Facebook Fanpage | Graph API | $0 |
| TikTok (video đã quay sẵn) | Content Posting API | $0 |

**Chi phí bước 8:** $0

---

## 📊 Tổng Hợp Chi Phí / Campaign

| Bước | Hành động | Model | Chi phí |
|---|---|---|---|
| 1 | Tạo campaign + đọc Google Drive | — | **$0.00** |
| 2 | Research Apify (3 actor × 30 slots) | Apify | tối đa **$3.00** |
| 3 | Phân tích & xây dựng brief | Gemini 2.5 Flash + Qwen3-6B fallback | **~$0.014** |
| 4 | **Render nội dung** – 3 candidates/slot | **Gemini 3.5 Flash** + Qwen3-6B fallback | **~$0.008** |
| 5 | Validation & duplicate check | Gemini 2.5 Flash | **~$0.007** |
| 6 | Scoring & chọn winner | Gemini 2.5 Flash + Qwen3-6B fallback | **~$0.009** |
| 7 | Director duyệt (manual) | — | **$0.00** |
| 8 | Publish Facebook / TikTok | — | **$0.00** |
| | **Tổng / 1 Campaign (30 slots)** | | **~$3.04** |

---

## 🧪 Chi Phí Giai Đoạn Test & Develop

| Giai đoạn | Số campaign | Chi phí | Ghi chú |
|---|---|---|---|
| Integration test từng bước | 2–3 | ~$6–9 | `APIFY_BILLING_MODE=test` để không trừ thật |
| End-to-end full flow | 3–5 | ~$9–16 | Apify live, cache 12h |
| Demo / Staging final | 1–2 | ~$3–6 | Cache 24h, tái dùng research |
| **Tổng** | **~6–10 campaigns** | **~$18–31** | |

---

## 💡 Gợi Ý Tiết Kiệm

| Tip | Tiết kiệm ước tính |
|---|---|
| `APIFY_BILLING_MODE=test` khi develop | Không trừ credit Apify thật |
| `APIFY_RESEARCH_CACHE_HOURS=24` | Giảm ~60–70% chi phí scraping |
| Gemini 3.5 Flash cho render (rẻ hơn 2.5) | Tiết kiệm ~$0.05/campaign |
| Qwen3-6B làm fallback free | $0 cho mọi request overflow |
| Giảm candidate từ 3 xuống 2 | Giảm ~33% chi phí render |

---

*Tài liệu tạo ngày 16/07/2026.*
