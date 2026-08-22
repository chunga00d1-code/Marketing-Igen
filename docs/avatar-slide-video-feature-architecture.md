# TÀI LIỆU TÍNH NĂNG: VIDEO AVATAR THUYẾT TRÌNH KÈM SLIDE TRƯỢT TỰ ĐỘNG
*(Avatar Slide & Livestream Studio)*

---

## 1. Giới thiệu tính năng

### 1.1. Tính năng này là gì?
**Video Avatar Slide** là công cụ giúp bạn tạo ra các video thuyết trình, bán hàng hoặc video bản tin chuyên nghiệp chỉ trong vài phút. 

Tính năng này là sự kết hợp trực tiếp giữa hai sức mạnh cốt lõi:
1. **Video Người Nói (HeyGen Avatar):** Nhân vật AI người thật đứng nói tự nhiên với biểu cảm sống động và giọng đọc truyền cảm.
2. **Engine HTML-to-Video Hiện Có:** Bộ máy AI tự động sinh bố cục slide, chữ nổi bật, hình ảnh, màu sắc và hiệu ứng chuyển động theo kịch bản.
3. **Cơ chế Khớp Tuần Tự Thông Minh:** Video HeyGen được tạo trước $\rightarrow$ Sau đó Engine HTML-to-Video mới dựa vào độ dài thực tế của HeyGen và Prompt của người dùng để render Slide $\rightarrow$ Ghép lại thành video hoàn chỉnh khớp 100%.

---

## 2. Điểm đột phá: Cơ chế Xử lý Tuần tự (Sequential Pipeline)

Toàn bộ quá trình tạo video không chạy song song hay tạo slide trước, mà chạy theo **quy trình tuần tự 4 bước chặt chẽ**:

```
[ Bước 1: Người dùng nhập Prompt kịch bản & Chọn Avatar/Voice ]
                          │
                          ▼
[ Bước 2: Gọi HeyGen tạo Video Avatar Người Nói trước ]
  • HeyGen xuất ra file: `avatar.mp4` (Có sẵn người nói + giọng đọc tự nhiên)
  • Hệ thống bóc tách mốc thời gian thực tế:
    - Câu 1 dứt lời ở: giây 4.2
    - Câu 2 dứt lời ở: giây 10.1
    - Câu 3 dứt lời ở: giây 14.5
                          │
                          ▼
[ Bước 3: Đưa Prompt + Mốc thời gian HeyGen vào Engine HTML-to-Video ]
  • Bây giờ mới kích hoạt Engine HTML-to-Video để sinh mã HTML/CSS.
  • AI tự động phân bổ layout slide và thiết lập hiệu ứng trượt khớp đúng
    từng giây mà HeyGen đã nói ở Bước 2.
  • Render ra video nền: `html_slides.mp4`
                          │
                          ▼
[ Bước 4: Ghép nối Video Hoàn Chỉnh ]
  • Đè video Avatar lên trên Video nền HTML-to-Video.
  • Xuất bản file MP4 cuối cùng: Khớp khẩu hình, khớp chuyển cảnh 100%!
```

👉 **Ưu điểm vượt trội:**
* Không cần tạo slide trước rồi phải sửa lại.
* Engine HTML-to-Video chỉ cần render **đúng 1 lần duy nhất** dựa trên số liệu thực tế đã có từ HeyGen, đảm bảo độ chính xác tuyệt đối mà không gây lãng phí tài nguyên.

---

## 3. Các phong cách hiển thị Video (Layouts)

Hệ thống hỗ trợ 3 kiểu bố cục video phổ biến nhất trên mạng xã hội hiện nay:

### Kiểu 1: Khung tròn góc dưới (Picture-in-Picture)
* **Bố cục:** Toàn màn hình là Slide do Engine HTML-to-Video render (chữ to rõ, hình ảnh sắc nét, đồ họa chuyển động). Người dẫn chuyện xuất hiện trong một khung tròn nhỏ gọn gàng ở góc dưới màn hình.
* **Phù hợp cho:** Video review sản phẩm, video đào tạo, hướng dẫn sử dụng, giới thiệu tính năng phần mềm.

### Kiểu 2: Màn hình chia đôi (Split Screen 60/40)
* **Bố cục:** 60% nửa trên màn hình là Slide HTML sản phẩm; 40% nửa dưới là hình ảnh nhân vật người thật đang đứng thuyết trình tự tin.
* **Phù hợp cho:** Video bán hàng thời trang, mỹ phẩm, bất động sản, video chia sẻ kiến thức chuyên sâu.

### Kiểu 3: Giả lập Livestream bán hàng (TikTok / Shopee Live)
* **Bố cục:** Engine HTML-to-Video mô phỏng chân thực một buổi livestream đang phát sóng với các hiệu ứng: bình luận người mua nhảy liên tục, giỏ hàng nhấp nháy, biểu tượng tim bay và đồng hồ đếm ngược Flash Sale.
* **Phù hợp cho:** Video chạy quảng cáo TikTok Shop, Facebook Reels, Shopee Video nhằm kích thích mua sắm ngay lập tức.

---

## 4. Hướng dẫn 4 bước thao tác cho người dùng

Giao diện làm việc được thiết kế trực quan, chia thành 3 phần rõ ràng từ trái qua phải:

```
┌─────────────────────────┬──────────────────────────────┬───────────────────────────────┐
│ CỘT 1: THIẾT LẬP NGƯỜI DẪN│ CỘT 2: KỊCH BẢN PHÂN CẢNH    │ CỘT 3: TIẾN TRÌNH & XUẤT BẢN  │
│                         │                              │                               │
│ • Chọn gương mặt Avatar │ • Bấm "AI Viết Kịch Bản"     │ • Hiển thị trạng thái render: │
│ • Chọn giọng đọc tiếng  │   (hoặc tự nhập tay)         │   1. Đang tạo Avatar HeyGen...│
│   Việt ấm áp / truyền   │ • Chia thành Cảnh 1, 2, 3... │   2. Đang tạo Slide HTML...   │
│   cảm                   │ • Mỗi cảnh gồm: Nội dung     │   3. Đang ghép video...       │
│ • Chọn kiểu hiển thị    │   trên slide + Lời nhân vật  │ • Tải video MP4 hoàn chỉnh    │
│   (Khung tròn / Chia đôi│   sẽ nói                     │   chất lượng cao về máy       │
│   / Livestream)         │                              │                               │
└─────────────────────────┴──────────────────────────────┴───────────────────────────────┘
```

### Chi tiết các bước:
1. **Bước 1: Chọn Nhân vật & Giọng đọc**
   * Chọn người dẫn nam/nữ phù hợp với ngành hàng của bạn.
   * Chọn giọng đọc tự nhiên (Bắc, Trung, Nam) của HeyGen.
   * Chọn tỷ lệ khung hình: **9:16** (Video dọc cho TikTok/Reels/Shorts) hoặc **16:9** (Video ngang cho YouTube/Website).

2. **Bước 2: Chuẩn bị Kịch bản**
   * Bạn chỉ cần nhập một chủ đề ngắn (Ví dụ: *"Giới thiệu áo khoác chống nước giảm giá 30%"*), AI sẽ tự động phân bổ thành 3 đến 5 cảnh hoàn chỉnh.
   * Bạn có thể bấm vào từng cảnh để sửa lại từ ngữ, thêm ảnh sản phẩm hoặc đổi màu sắc chủ đạo.

3. **Bước 3: Bấm "Tạo Video"**
   * Hệ thống tự động gửi kịch bản sang HeyGen để render Avatar trước $\rightarrow$ Nhận diện thời lượng từng cảnh $\rightarrow$ Tự động kích hoạt Engine HTML-to-Video để vẽ slide tương ứng $\rightarrow$ Ghép nối hoàn chỉnh.

4. **Bước 4: Tải Video Hoàn Chỉnh**
   * Xem video thành phẩm trực tiếp trên trình duyệt và tải file MP4 sắc nét về máy để đăng lên các nền tảng mạng xã hội.

---

## 5. Kịch bản mẫu minh họa

Dưới đây là ví dụ một kịch bản bán hàng 3 phân cảnh tiêu chuẩn (Tổng thời lượng ~30 giây):

| Phân Cảnh | Lời Thoại HeyGen Nói Thực Tế | Slide do HTML-to-Video Sinh Ra | Hiệu Ứng Chuyển Cảnh |
| :--- | :--- | :--- | :--- |
| **Cảnh 1: Mở đầu (~8s)** | *"Xin chào mọi người! Hôm nay shop vừa về mẫu áo Polo công nghệ Nano cực kỳ thoáng mát."* | • Tiêu đề: Áo Polo Nano 2026<br>• Hình ảnh: Mẫu áo thực tế<br>• Dòng chữ: Siêu Phẩm Mùa Hè | Slide 1 xuất hiện, nhân vật mở lời chào. |
| **Cảnh 2: Tính năng (~12s)** | *"Điểm đặc biệt là chất vải co giãn 4 chiều mềm mịn, giặt máy thoải mái không bao giờ lo nhăn hay bai dão."* | • Điểm 1: Kháng khuẩn, chống mùi<br>• Điểm 2: Co giãn 4 chiều mềm mịn<br>• Điểm 3: Không nhăn khi giặt | Đúng lúc HeyGen nói xong câu 1, Slide 1 trượt đi, Slide 2 trượt vào. |
| **Cảnh 3: Kêu gọi (~10s)** | *"Duy nhất trong hôm nay, shop giảm giá ngay 35%. Mọi người hãy bấm vào link bên dưới để nhận ưu đãi nhé!"* | • Giá gốc: ~~450.000đ~~<br>• Ưu đãi: **289.000đ** (Giảm 35%)<br>• Nút: Đặt Hàng Ngay Hôm Nay | Slide 3 trượt vào hiển thị bảng giá và nút ưu đãi cho đến hết video. |

---

## 6. Lợi ích vượt trội cho công việc Marketing

1. **Sản xuất video hàng loạt không cần quay dựng:** Không cần thuê người mẫu, không cần chuẩn bị phòng quay, ánh sáng hay thiết bị đắt tiền.
2. **Đồ họa tự động không giới hạn sáng tạo:** Tận dụng engine HTML-to-Video AI tự động vẽ layout, màu sắc, phông chữ và hiệu ứng chuyển động riêng biệt cho từng chủ đề.
3. **Nội dung rõ ràng, dễ nhớ:** Người xem vừa nghe nhân vật thuyết trình, vừa nhìn thấy thông số/bảng giá hiển thị trực quan trên màn hình.
4. **Tiết kiệm 95% chi phí & thời gian:** Một video hoàn chỉnh có thể hoàn thành trong 3 - 5 phút thay vì mất nửa ngày quay và chỉnh sửa video.

---

## 7. Kế hoạch & Thời gian Triển khai (2 – 3 Ngày Làm Việc)

| Giai đoạn | Hạng mục công việc chi tiết | Thời gian thực hiện |
| :--- | :--- | :--- |
| **Ngày 1: Lõi Xử lý Tuần tự & Ghép Video** | • Tích hợp luồng gọi HeyGen tạo Avatar trước $\rightarrow$ Bóc tách mốc thời gian dứt câu thực tế.<br>• Kết nối Engine HTML-to-Video nhận mốc thời gian HeyGen để sinh slide và render background.<br>• Xây dựng bộ ghép nối video tự động (FFmpeg Overlay). | **1 ngày** |
| **Ngày 2: Xây dựng Giao diện Workspace** | • Tạo màn hình làm việc 3 cột `AvatarSlideWorkspace.tsx` (chọn Avatar, nhập kịch bản, theo dõi tiến trình render).<br>• Kết nối tiến trình tạo video và thông báo trạng thái qua Socket. | **1 ngày** |
| **Ngày 3: Kiểm thử E2E Toàn diện & Tối ưu** | • Chạy chuỗi 25 – 35 bài test thực tế trên nhiều ngành hàng, nhiều giọng đọc và layout.<br>• Tinh chỉnh độ mượt chuyển cảnh, kiểm tra độ sắc nét và hoàn thiện sản phẩm. | **1 ngày** |
| **TỔNG CỘNG** | **Toàn bộ tính năng hoàn chỉnh và sẵn sàng vận hành** | **2 – 3 ngày làm việc** |

---

## 8. Chi tiết Chi phí Tính theo Đơn giá HeyGen Digital Twin

Đơn giá chính thức của HeyGen cho gói **Digital Twin Avatar** là: **0.0667 USD / giây**.

### 8.1. Chi phí Vận hành trên mỗi Video Thực tế (Production)

| Độ dài Video | Đơn giá HeyGen ($0.0667/s) | Thành tiền (USD) | Thành tiền (VNĐ) *(Tỷ giá 25.500)* |
| :--- | :--- | :--- | :--- |
| **Video Ngắn (15 giây)** | $15\text{s} \times \$0.0667$ | **$1.00** | **~ 25.500 VNĐ** |
| **Video Tiêu chuẩn (30 giây)** | $30\text{s} \times \$0.0667$ | **$2.00** | **~ 51.000 VNĐ** |
| **Video Đầy đủ (60 giây)** | $60\text{s} \times \$0.0667$ | **$4.00** | **~ 102.000 VNĐ** |

* **Lưu ý:**
  * Toàn bộ phần **Đồ họa Slide HTML chuyển động** và **Bộ ghép video FFmpeg** chạy hoàn toàn trên máy chủ nội bộ $\rightarrow$ **0đ (Miễn phí)**.
  * Phần AI viết kịch bản (Gemini) chi phí cực thấp (~20đ - 50đ/lần).

### 8.2. Ngân sách Kiểm thử Toàn diện trong Quá trình Phát triển (Testing & QA Budget)

| Hạng mục kiểm thử | Số lần test | Thời lượng mỗi lần | Chi phí ước tính (USD) | Chi phí ước tính (VNĐ) |
| :--- | :--- | :--- | :--- | :--- |
| **1. Kiểm thử Core API & Bóc tách SRT ban đầu** | 8 – 10 lần | 15 giây | $8.00 – $10.00 | ~ 204.000đ – 255.000đ |
| **2. Kiểm thử 3 Kiểu Bố cục (PiP, Split, Livestream)** | 12 – 15 lần | 30 giây | $24.00 – $30.00 | ~ 612.000đ – 765.000đ |
| **3. Kiểm thử Đa Giọng đọc & Các ngành hàng khác nhau** | 6 – 8 lần | 30 giây | $12.00 – $16.00 | ~ 306.000đ – 408.000đ |
| **4. Kiểm thử Nghiệm thu E2E Video đầy đủ (UAT)** | 3 – 5 lần | 45s – 60s | $9.00 – $15.00 | ~ 229.000đ – 382.000đ |
| **TỔNG NGÂN SÁCH KIỂM THỬ** | **25 – 35 lần test** | | **$53.00 – $71.00** | **~ 1.350.000đ – 1.810.000 VNĐ** |

---

## 9. Các câu hỏi thường gặp (FAQ)

* **Hỏi: Video có bị hiện tượng tiếng chạy trước hình không?**
  * *Trả lời:* Không. Vì HeyGen render trước $\rightarrow$ Lấy được thời lượng chính xác của từng câu rồi mới đưa vào sinh Slide HTML, nên đảm bảo khớp 100%.
* **Hỏi: Tôi có thể chèn logo hoặc hình ảnh sản phẩm riêng của công ty vào slide không?**
  * *Trả lời:* Có. Bạn hoàn toàn có thể tải ảnh sản phẩm hoặc logo thương hiệu lên để hiển thị trực tiếp trong từng slide.
* **Hỏi: Tôi có thể chọn nhiều người dẫn khác nhau trong cùng một dự án không?**
  * *Trả lời:* Có. Thư viện có hàng trăm nhân vật nam, nữ với trang phục công sở, thường ngày hoặc thể thao để bạn thoải mái lựa chọn theo từng sản phẩm.
