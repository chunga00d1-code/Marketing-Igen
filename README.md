<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/c9f16f0c-380d-4f8a-bd87-6bcf8a623f13

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

---

## 🚀 Hướng dẫn cấu hình CI/CD (GitHub Actions)

Dự án này sử dụng GitHub Actions để tự động hóa toàn bộ quá trình Tích hợp liên tục (CI) và Triển khai liên tục (CD) lên Firebase cùng máy chủ VPS chạy Docker.

### 1. Cấu hình GitHub Secrets
Để kích hoạt luồng triển khai tự động (CD), bạn cần truy cập vào Repo GitHub của mình -> **Settings** -> **Secrets and variables** -> **Actions** và tạo mới các **Repository Secrets** sau:

| Tên Secret | Mô tả chi tiết | Cách lấy thông tin |
| :--- | :--- | :--- |
| `GCP_SA_KEY` | Khóa tài khoản dịch vụ (JSON Key) để xác thực và deploy Rules & Functions lên Firebase. | Tạo Service Account với vai trò Editor trong GCP IAM Console và tải file JSON Key về. |
| `SSH_HOST` | Địa chỉ IP hoặc tên miền của máy chủ VPS đích. | Địa chỉ máy chủ VPS của bạn. |
| `SSH_USER` | Tên tài khoản đăng nhập SSH của VPS. | Thường là `root`, `ubuntu`, hoặc `centos`. |
| `SSH_KEY` | Nội dung khóa Private Key SSH dùng để xác thực kết nối. | Khóa SSH Private tương ứng với Public Key được thêm vào `authorized_keys` của VPS. |
| `SSH_PORT` | Cổng kết nối SSH (tùy chọn). | Mặc định là `22` nếu không thiết lập. |

### 2. Quy trình kiểm tra tích hợp (CI)
Mỗi khi bạn thực hiện **Push** hoặc **Tạo Pull Request** hướng về nhánh `develop` hoặc `main`, GitHub Actions sẽ tự động chạy:
1. **Kiểm tra kiểu dữ liệu (Type check & Lint)**: Chạy `yarn lint` (`tsc --noEmit`) trên toàn bộ dự án.
2. **Kiểm tra biên dịch**: Chạy thử build dự án (`yarn build`).
3. **Kiểm tra Cloud Functions**: Cài đặt và build thử TypeScript cho Firebase Functions.
4. **Kiểm thử Security Rules**: Chạy test suite `node scratch/permission_test.mjs` trực tiếp để bảo vệ quy tắc bảo mật Firestore.

### 3. Quy trình triển khai tự động (CD)
Khi mã nguồn được merge thành công vào các nhánh chỉ định, CD sẽ tự động triển khai tương ứng:
* **Nhánh `develop`**: Triển khai lên môi trường **Staging** trên VPS (đường dẫn `/opt/igen-erp/staging`).
* **Nhánh `main`**: Triển khai lên môi trường **Production** trên VPS (đường dẫn `/opt/igen-erp/production`).
* Cả hai môi trường đều tự động cập nhật Firebase Cloud Functions, Firestore & Storage Security Rules.
