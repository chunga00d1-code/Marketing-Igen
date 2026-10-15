# Luồng n8n đặt bánh qua Marketing

Marketing là nguồn dữ liệu chính. n8n chỉ nhận sự kiện, yêu cầu Marketing xác định hành động tiếp theo và gọi Marketing gửi tin cho khách.

## Cấu hình

1. Import `cake-order-marketing-bridge.workflow.json` vào n8n.
2. Workflow đã dùng trực tiếp URL Marketing `https://marketing.igentechnology.net`, không cần cấu hình biến môi trường trong n8n.
3. Activate workflow và lấy production webhook URL.
4. Quản trị viên của từng doanh nghiệp gọi `PUT /api/v1/company-order-automation` để lưu URL, secret riêng và bật luồng:

```json
{
  "enabled": true,
  "webhookUrl": "https://n8n.example.com/webhook/marketing-cake-order",
  "webhookSecret": "secret-rieng-cua-doanh-nghiep-toi-thieu-24-ky-tu"
}
```

Trong giao diện, cấu hình tương ứng nằm tại **Cài đặt → Tích hợp doanh nghiệp → n8n tự động hóa đơn hàng**. Nút **Kiểm tra** gọi `POST /api/v1/company-order-automation/test` với sự kiện `configuration.test`; workflow chỉ xác nhận kết nối và không chạy AI hoặc gửi tin cho khách.

`companyCode` được lấy từ JWT của quản trị viên, không nhận từ `.env` hoặc body cấu hình. Secret được mã hóa trong MongoDB bằng `ORDER_AUTOMATION_CONFIG_ENCRYPTION_KEY`.

Nếu n8n không phản hồi HTTP 2xx trong 8 giây, Marketing tự động quay về cơ chế AI auto-reply hiện tại để không làm mất hội thoại.

## API Marketing dành cho n8n

- `POST /api/v1/automation/n8n/conversations/next-action`
- `GET /api/v1/automation/n8n/orders/:orderId?companyCode=...`
- `POST /api/v1/automation/n8n/orders/:orderId/dispatch`
- `POST /api/v1/automation/n8n/orders/:orderId/transitions`

Tất cả request phải gửi `companyCode` và `x-n8n-secret` tương ứng với chính doanh nghiệp đó. Workflow chuyển tiếp secret nhận từ Marketing về API; Marketing xác thực lại theo tenant. Các thao tác ghi cần `eventId`; chuyển trạng thái và gửi tin cần `expectedVersion` để tránh ghi đè thay đổi mới hơn.

## Quy tắc vận hành

- Giá được Marketing tính từ số người, không lấy từ văn bản RAG.
- RAG chỉ cung cấp kiến thức tư vấn và cách trả lời.
- Đơn ngoài khoảng 2–15 người chuyển `MANUAL_REVIEW`.
- Đơn yêu cầu đặt cọc không thể chuyển sản xuất trước khi SePay hoặc nhân viên xác minh.
- Bếp phải gửi ảnh khi chuyển `PRODUCTION_COMPLETED`.
- Ship phải gửi ảnh khi chuyển `DELIVERED`.
- Các yêu cầu trùng `eventId` trả lại kết quả cũ; cùng `eventId` nhưng khác payload bị từ chối HTTP 409.

