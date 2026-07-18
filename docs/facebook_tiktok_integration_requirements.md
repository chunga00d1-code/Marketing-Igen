# Tài liệu Hướng dẫn Tích hợp Facebook & TikTok API (Publishing & Ads)

Tài liệu này tổng hợp toàn bộ các quyền (permissions/scopes) cần thiết, hồ sơ tài liệu cần chuẩn bị, và quy trình xác minh để tích hợp ứng dụng ERP của bạn với hệ thống API của **Facebook (Meta)** và **TikTok** nhằm phục vụ cho mục đích đăng bài tự động (Organic Publishing) và quản lý quảng cáo (Ads Management).

---

## 1. TÍCH HỢP FACEBOOK (META DEVELOPER)

Để tích hợp tính năng tự động đăng bài lên Trang (Page) và quản lý chiến dịch quảng cáo Facebook, bạn cần tạo một ứng dụng trên cổng thông tin nhà phát triển của Meta.

### A. Tài khoản & Hồ sơ cần chuẩn bị
1. **Tài khoản Cá nhân Meta (Facebook):** Phải được xác minh danh tính cá nhân và đã bật xác thực 2 yếu tố (2FA). Tài khoản này sẽ dùng để đăng nhập vào trang [Meta for Developers](https://developers.facebook.com/).
2. **Trang Facebook (Fanpage):** Trang đích để đăng bài viết hoặc chạy chiến dịch quảng cáo.
3. **Trình quản lý Doanh nghiệp (Meta Business Manager - BM):** Bắt buộc phải có BM để liên kết với ứng dụng (App) nhằm tiến hành xác minh doanh nghiệp.
4. **Tài khoản Quảng cáo (Ad Account):** Nằm trong BM để thực hiện tạo và quản lý quảng cáo qua API.
5. **Website doanh nghiệp:** Cần có tên miền riêng (domain) có chứa trang **Chính sách Quyền riêng tư (Privacy Policy)** và **Điều khoản sử dụng (Terms of Service)** bằng tiếng Anh/tiếng Việt. Tên miền này cũng cần được xác minh (Domain Verification) trong phần Cài đặt Doanh nghiệp của BM.

### B. Các quyền (Permissions/Scopes) Graph API cần xin

Meta chia quyền thành 2 mức độ: **Standard Access** (quyền thử nghiệm chỉ dùng được với các tài khoản nội bộ có vai trò trong App) và **Advanced Access** (quyền chính thức cho phép tương tác với mọi tài khoản người dùng khác sau khi đã duyệt App).

#### Mức độ 1: Đăng tải & Quản lý Trang tự động (Organic Posting)
*   **`pages_show_list`**: Cho phép ứng dụng lấy danh sách các Trang Facebook mà người dùng đang quản lý.
*   **`pages_manage_posts`**: Cho phép ứng dụng tạo, chỉnh sửa, lên lịch và xóa các bài viết trên Trang dưới danh nghĩa Fanpage.
*   **`pages_read_engagement`**: Cho phép đọc các chỉ số tương tác bài viết (lượt thích, bình luận, chia sẻ) để phục vụ mục đích thống kê/báo cáo.
*   **`pages_manage_metadata`**: Cho phép đăng ký các cổng Webhook để nhận thông báo thời gian thực khi có người dùng bình luận hoặc nhắn tin trên Trang.
*   *Lưu ý (Instagram):* Nếu cần đăng bài tự động lên Instagram liên kết với Trang, bạn cần xin thêm các quyền: `instagram_basic`, `instagram_content_publish`, và `instagram_manage_comments`.

#### Mức độ 2: Quản lý Quảng cáo (Facebook Ads Manager)
*   **`ads_management`**: Quyền cao nhất để tạo, sửa, xóa, chạy/tạm dừng các chiến dịch quảng cáo (Campaigns), nhóm quảng cáo (Ad Sets), và mẫu quảng cáo (Ads/Creatives).
*   **`ads_read`**: Đọc báo cáo thống kê chi phí, hiệu suất quảng cáo (CPM, CPC, CTR, v.v.).
*   **`business_management`**: Cho phép đọc và quản lý các tài sản của doanh nghiệp (như tài khoản quảng cáo, trang, pixel) thông qua API.
*   **`pages_manage_ads`**: Cho phép tạo và quản lý các bài viết ẩn (dark posts) dùng riêng cho mục đích quảng cáo trên Trang.

### C. Hồ sơ & Tài liệu xác minh Doanh nghiệp (Meta Business Verification)
Để chuyển trạng thái các quyền Ads và Page từ *Standard* sang *Advanced Access*, Meta yêu cầu doanh nghiệp phải gửi hồ sơ xác minh. Các tài liệu cần scan hoặc chụp ảnh rõ nét:
1. **Giấy tờ pháp lý doanh nghiệp:**
   * Giấy chứng nhận Đăng ký Kinh doanh (ĐKKD) / Quyết định thành lập doanh nghiệp.
   * Giấy chứng nhận đăng ký thuế hoặc tờ khai thuế doanh nghiệp gần nhất (có dấu của cơ quan thuế).
2. **Giấy tờ chứng minh địa chỉ hoạt động và số điện thoại:**
   * Hóa đơn tiện ích (điện, nước, cước internet) mang tên công ty và địa chỉ trùng với ĐKKD.
   * Sao kê tài khoản ngân hàng của công ty (không quá 3 tháng gần nhất) hiển thị rõ tên và địa chỉ công ty trùng với ĐKKD.
3. **Chính sách không phân biệt đối xử (Non-Discrimination Policy):**
   * Đối với quyền quảng cáo (`ads_management`), nhà quảng cáo cần truy cập Trình quản lý quảng cáo và click xác nhận chấp nhận Chính sách không phân biệt đối xử của Meta. Nếu không xác nhận, API sẽ trả về lỗi `Certification Required (Error 100/2859024)`.

### D. Quy trình Duyệt App (Meta App Review)
*   Quay một video ngắn (Screencast) hướng dẫn người dùng kết nối Facebook (OAuth) trên hệ thống ERP của bạn và cách hệ thống tự động đăng bài/quản lý quảng cáo hoạt động.
*   Cung cấp tài khoản thử nghiệm kèm theo dữ liệu test để nhân viên Meta có thể đăng nhập vào hệ sinh thái ERP của bạn để kiểm thử.

---

## 2. TÍCH HỢP TIKTOK (TIKTOK DEVELOPER & TIKTOK FOR BUSINESS)

TikTok phân tách rõ ràng cổng phát triển ứng dụng thông thường (TikTok for Developers - dùng để đăng tải video, lấy thông tin hồ sơ) và cổng phát triển quảng cáo (TikTok for Business Developer - dùng để chạy chiến dịch quảng cáo).

### A. Tài khoản & Hồ sơ cần chuẩn bị
1. **Tài khoản nhà phát triển TikTok (TikTok Developer Account):** Đăng ký tại [TikTok for Developers](https://developers.tiktok.com/).
2. **Tài khoản TikTok cá nhân hoặc doanh nghiệp:** Để liên kết test.
3. **Tài khoản TikTok Business Center (Trung tâm doanh nghiệp):** Để quản lý tài sản quảng cáo và xin quyền truy cập vào Marketing API.
4. **Website doanh nghiệp:** Phải có trang **Privacy Policy** hoạt động và bắt buộc phải xác minh quyền sở hữu tên miền bằng cách tải tệp cấu hình của TikTok lên thư mục root của Server Web.

### B. Các quyền (Permissions/Scopes) cần xin

#### Mức độ 1: Đăng tải video tự động lên kênh TikTok (Organic API)
Để đăng tải video tự động qua API của TikTok, ứng dụng của bạn cần được phê duyệt các scope sau:
*   **`user.info.basic`**: Lấy thông tin cơ bản của kênh liên kết (Avatar, Username, Nickname).
*   **`video.publish`**: Quyền cốt lõi cho phép hệ thống đăng video trực tiếp (Direct Post) lên kênh của người dùng. Video sẽ hiển thị công khai trên kênh TikTok ngay lập tức.
*   **`video.upload`**: Cho phép đẩy video vào mục Nháp (Drafts) trên ứng dụng điện thoại của người dùng, người dùng sẽ tự vào kiểm tra và nhấn nút đăng bằng tay.
*   **`video.list`**: Lấy danh sách các video đã đăng để cập nhật lượt xem, lượt like, bình luận và phân tích hiệu quả chiến dịch.

#### Mức độ 2: Quản lý Quảng cáo (TikTok Marketing API)
Để tích hợp các chức năng tạo chiến dịch quảng cáo, tạo nhóm đối tượng và đọc báo cáo, bạn cần xin các quyền tại cổng [TikTok for Business Developer Portal](https://business-api.tiktok.com/portal/apps):
*   **`ad_account.read` / `ad_account.write`**: Quản lý tài khoản quảng cáo TikTok.
*   **`campaign.read` / `campaign.write`**: Đọc và thiết lập các chiến dịch quảng cáo.
*   **`adgroup.read` / `adgroup.write`**: Cài đặt target đối tượng, vị trí hiển thị, ngân sách và lịch trình chạy.
*   **`ad.read` / `ad.write`**: Tạo mẫu quảng cáo, thiết lập lời kêu gọi hành động (CTA), liên kết video.
*   **`creative.read` / `creative.write`**: Quản lý kho tư liệu media (tải video quảng cáo lên hệ thống của TikTok).
*   **`report.read`**: Lấy dữ liệu báo cáo hiệu suất quảng cáo (số lượt click, chuyển đổi, chi phí tiêu hao theo ngày/giờ).

### C. Hồ sơ & Tài liệu xác minh Doanh nghiệp (TikTok Business Verification)
TikTok yêu cầu xác minh nghiêm ngặt thông tin doanh nghiệp trước khi cho phép ứng dụng của bạn gọi các API quảng cáo hoặc đăng video công khai:
1. **Giấy tờ đăng ký doanh nghiệp:**
   * Giấy đăng ký kinh doanh (ĐKKD) / Giấy chứng nhận thành lập doanh nghiệp bản gốc (hoặc bản công chứng dịch thuật nếu yêu cầu).
2. **Giấy tờ tùy thân người đại diện:**
   * Scan 2 mặt Căn cước công dân (CCCD), Chứng minh thư hoặc Hộ chiếu của người đại diện pháp luật ghi tên trên ĐKKD.
3. **Giấy ủy quyền (Letter of Authorization):**
   * Nếu người tạo tài khoản Developer hoặc thực hiện xác minh không phải là người đại diện pháp luật trên ĐKKD, TikTok yêu cầu một văn bản ủy quyền có chữ ký của người đại diện và con dấu đỏ của công ty.
4. **Xác minh chủ sở hữu tên miền (Domain ownership verification):**
   * Đưa chuỗi xác minh (Verification Token) do TikTok cung cấp dưới dạng bản ghi TXT trong DNS hoặc upload file HTML xác minh lên Hosting của Website.

### D. Quy trình Phê duyệt App (TikTok App Audit)
Quy trình duyệt quyền đăng video của TikTok (`video.publish`) được đánh giá là khắt khe nhất:
1. **Chế độ Staging (Thử nghiệm):**
   * Khi mới cấu hình App, bạn chỉ có quyền đăng bài lên các tài khoản được chuyển sang chế độ **Tài khoản Riêng tư (Private Account)** trên điện thoại và tài khoản đó phải được add vào mục **Sandbox Accounts** trong TikTok Developer Portal của bạn.
   * Nếu đăng bài lên tài khoản Công khai (Public) hoặc tài khoản chưa khai báo sandbox, TikTok API sẽ trả về lỗi từ chối (`unaudited_client_can_only_post_to_private_accounts`).
2. **Gửi duyệt (App Audit) lên Live Mode:**
   * Ứng dụng phải có tài liệu mô tả rõ kiến trúc hệ thống và quy trình lưu trữ Access Token/Refresh Token.
   * Cung cấp một video Screencast chi tiết từ lúc người dùng nhấn nút kết nối tài khoản trên Web ERP của bạn -> màn hình xin quyền của TikTok (hiển thị rõ Client ID trên thanh URL) -> người dùng tích chọn quyền -> trả lại trang ERP -> người dùng đăng video thành công.
   * Các video đăng thử nghiệm phải tuân thủ nghiêm ngặt tiêu chuẩn kỹ thuật (định dạng MP4/WebM, tỉ lệ 9:16, độ phân giải tối thiểu 720p, thời lượng từ 3s - 10 phút).

---

## 3. BẢNG TỔNG HỢP SO SÁNH & CHUẨN BỊ NHANH

| Tiêu chí | Facebook (Meta Developer) | TikTok (TikTok Developer & Business) |
| :--- | :--- | :--- |
| **Quyền đăng bài tự động** | `pages_manage_posts`, `pages_show_list` | `video.publish`, `user.info.basic` |
| **Quyền quản lý quảng cáo** | `ads_management`, `ads_read`, `business_management` | `ad_account.read`/`write`, `campaign.read`/`write`, `report.read` |
| **Xác minh tên miền** | Có (Meta Business Settings -> Brand Safety) | Có (Thông qua tải file HTML xác minh hoặc DNS TXT) |
| **Hồ sơ Pháp lý cần** | Giấy phép ĐKKD, Hóa đơn tiện ích doanh nghiệp / Sao kê ngân hàng công ty | Giấy phép ĐKKD, CCCD/Hộ chiếu người đại diện pháp luật, Giấy ủy quyền (nếu có) |
| **Đặc điểm duyệt App** | Cần quay video demo các bước sử dụng quyền để gửi Meta App Review | Rất khắt khe. Ở Staging chỉ được đăng lên TK private đã khai báo Sandbox. Cần Audit mới lên được Live. |
| **Tài khoản trung tâm** | Meta Business Manager (BM) | TikTok Business Center (Trung tâm Doanh nghiệp) |
