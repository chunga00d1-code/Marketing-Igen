import type { CreativeImageTemplate } from "./types";

const PROMO_FIELDS = [
  { key: "headline", label: "Tiêu đề", type: "textarea" as const, maxLength: 80 },
  { key: "subheadline", label: "Mô tả ngắn", type: "textarea" as const, maxLength: 120 },
  { key: "price", label: "Giá hoặc ưu đãi", type: "text" as const, maxLength: 30 },
  { key: "cta", label: "Nút kêu gọi", type: "text" as const, maxLength: 36 },
  { key: "imageUrl", label: "Ảnh minh họa", type: "image" as const },
  { key: "brandName", label: "Tên thương hiệu", type: "text" as const, maxLength: 36 },
  { key: "primaryColor", label: "Màu chủ đạo", type: "color" as const },
];

const STORY_FIELDS = [
  { key: "headline", label: "Nội dung chính", type: "textarea" as const, maxLength: 190 },
  { key: "subheadline", label: "Ghi chú", type: "text" as const, maxLength: 70 },
  { key: "imageUrl", label: "Ảnh minh họa", type: "image" as const },
  { key: "brandName", label: "Tên thương hiệu", type: "text" as const, maxLength: 36 },
  { key: "primaryColor", label: "Màu chủ đạo", type: "color" as const },
];

export const CREATIVE_IMAGE_TEMPLATES: CreativeImageTemplate[] = [
  {
    id: "product-promo-v1", version: 1, name: "Khuyến mãi sản phẩm", description: "Nổi bật ưu đãi, giá và lời kêu gọi hành động.", accent: "#f97316",
    fields: [
      { key: "headline", label: "Tiêu đề", type: "textarea", maxLength: 80, placeholder: "Ưu đãi hôm nay" },
      { key: "subheadline", label: "Mô tả ngắn", type: "textarea", maxLength: 120, placeholder: "Số lượng có hạn" },
      { key: "price", label: "Giá ưu đãi", type: "text", maxLength: 30, placeholder: "499.000đ" },
      { key: "cta", label: "Nút kêu gọi", type: "text", maxLength: 36, placeholder: "Đặt hàng ngay" },
      { key: "imageUrl", label: "Ảnh sản phẩm", type: "image" },
      { key: "brandName", label: "Tên thương hiệu", type: "text", maxLength: 36, placeholder: "Thương hiệu của bạn" },
      { key: "primaryColor", label: "Màu chủ đạo", type: "color" },
    ],
    defaults: { headline: "GIẢM GIÁ ĐẾN 40%", subheadline: "Ưu đãi đặc biệt chỉ trong hôm nay", price: "499.000đ", cta: "ĐẶT HÀNG NGAY", imageUrl: "", brandName: "YOUR BRAND", primaryColor: "#f97316" },
  },
  {
    id: "product-showcase-v1", version: 1, name: "Giới thiệu sản phẩm", description: "Trình bày một sản phẩm cùng các lợi ích chính.", accent: "#2563eb",
    fields: [
      { key: "headline", label: "Tên sản phẩm", type: "textarea", maxLength: 70, placeholder: "Tên sản phẩm" },
      { key: "subheadline", label: "Lợi ích", type: "textarea", maxLength: 140, placeholder: "Mô tả nổi bật" },
      { key: "cta", label: "Nút kêu gọi", type: "text", maxLength: 36, placeholder: "Khám phá ngay" },
      { key: "imageUrl", label: "Ảnh sản phẩm", type: "image" },
      { key: "brandName", label: "Tên thương hiệu", type: "text", maxLength: 36, placeholder: "Thương hiệu của bạn" },
      { key: "primaryColor", label: "Màu chủ đạo", type: "color" },
    ],
    defaults: { headline: "SẢN PHẨM MỚI", subheadline: "Thiết kế tinh tế. Trải nghiệm khác biệt mỗi ngày.", cta: "KHÁM PHÁ NGAY", imageUrl: "", brandName: "YOUR BRAND", primaryColor: "#2563eb" },
  },
  {
    id: "quote-card-v1", version: 1, name: "Quote & kiến thức", description: "Chia sẻ trích dẫn, mẹo hay và thông điệp thương hiệu.", accent: "#7c3aed",
    fields: [
      { key: "headline", label: "Câu trích dẫn", type: "textarea", maxLength: 190, placeholder: "Thông điệp bạn muốn chia sẻ" },
      { key: "subheadline", label: "Tác giả / ghi chú", type: "text", maxLength: 70, placeholder: "— Tên tác giả" },
      { key: "brandName", label: "Tên thương hiệu", type: "text", maxLength: 36, placeholder: "Thương hiệu của bạn" },
      { key: "primaryColor", label: "Màu chủ đạo", type: "color" },
    ],
    defaults: { headline: "Điều tạo nên khác biệt không phải là ý tưởng, mà là hành động mỗi ngày.", subheadline: "— iGen Marketing", brandName: "YOUR BRAND", primaryColor: "#7c3aed" },
  },
  {
    id: "event-announcement-v1", version: 1, name: "Thông báo sự kiện", description: "Thông báo ra mắt, sự kiện hoặc chương trình mới.", accent: "#0f766e",
    fields: [
      { key: "headline", label: "Tên sự kiện", type: "textarea", maxLength: 80, placeholder: "Tên sự kiện" },
      { key: "subheadline", label: "Thời gian / địa điểm", type: "textarea", maxLength: 120, placeholder: "Thời gian và địa điểm" },
      { key: "cta", label: "Nút kêu gọi", type: "text", maxLength: 36, placeholder: "Đăng ký ngay" },
      { key: "imageUrl", label: "Ảnh nền", type: "image" },
      { key: "brandName", label: "Tên thương hiệu", type: "text", maxLength: 36, placeholder: "Thương hiệu của bạn" },
      { key: "primaryColor", label: "Màu chủ đạo", type: "color" },
    ],
    defaults: { headline: "SỰ KIỆN ĐẶC BIỆT", subheadline: "Đăng ký ngay để giữ chỗ cùng chúng tôi", cta: "ĐĂNG KÝ NGAY", imageUrl: "", brandName: "YOUR BRAND", primaryColor: "#0f766e" },
  },
  {
    id: "flash-sale-v1", version: 1, name: "Flash Sale", description: "Ưu đãi giới hạn thời gian với giá bán nổi bật.", accent: "#e11d48", fields: PROMO_FIELDS,
    defaults: { headline: "FLASH SALE 24H", subheadline: "Kết thúc lúc 23:59 hôm nay", price: "299.000đ", cta: "MUA NGAY", imageUrl: "", brandName: "YOUR BRAND", primaryColor: "#e11d48" },
  },
  {
    id: "combo-deal-v1", version: 1, name: "Ưu đãi combo", description: "Đẩy giá trị đơn hàng bằng gói sản phẩm hoặc dịch vụ.", accent: "#ea580c", fields: PROMO_FIELDS,
    defaults: { headline: "COMBO TIẾT KIỆM", subheadline: "Chọn trọn bộ, nhận ưu đãi tốt hơn", price: "899.000đ", cta: "NHẬN ƯU ĐÃI", imageUrl: "", brandName: "YOUR BRAND", primaryColor: "#ea580c" },
  },
  {
    id: "new-arrival-v1", version: 1, name: "Sản phẩm mới", description: "Giới thiệu sản phẩm hoặc bộ sưu tập vừa ra mắt.", accent: "#4f46e5", fields: PROMO_FIELDS,
    defaults: { headline: "NEW ARRIVAL", subheadline: "Bộ sưu tập mới dành cho phong cách của bạn", price: "", cta: "KHÁM PHÁ NGAY", imageUrl: "", brandName: "YOUR BRAND", primaryColor: "#4f46e5" },
  },
  {
    id: "member-offer-v1", version: 1, name: "Ưu đãi thành viên", description: "Thông báo đặc quyền khách hàng thân thiết.", accent: "#be123c", fields: PROMO_FIELDS,
    defaults: { headline: "ĐẶC QUYỀN THÀNH VIÊN", subheadline: "Mở khóa ưu đãi dành riêng cho bạn", price: "TẶNG 20%", cta: "THAM GIA NGAY", imageUrl: "", brandName: "YOUR BRAND", primaryColor: "#be123c" },
  },
  {
    id: "customer-review-v1", version: 1, name: "Đánh giá khách hàng", description: "Tạo social proof từ phản hồi tích cực.", accent: "#0891b2", fields: STORY_FIELDS,
    defaults: { headline: "Sản phẩm đẹp hơn mong đợi, đội ngũ hỗ trợ rất nhanh và tận tâm!", subheadline: "— Minh Anh, Hà Nội", imageUrl: "", brandName: "YOUR BRAND", primaryColor: "#0891b2" },
  },
  {
    id: "quick-tip-v1", version: 1, name: "Mẹo nhanh", description: "Chia sẻ kiến thức, mẹo hữu ích và content giáo dục.", accent: "#16a34a", fields: STORY_FIELDS,
    defaults: { headline: "MẸO NHỎ: Tập trung vào lợi ích khách hàng nhận được, không chỉ tính năng sản phẩm.", subheadline: "Lưu lại để áp dụng ngay", imageUrl: "", brandName: "YOUR BRAND", primaryColor: "#16a34a" },
  },
  {
    id: "recruitment-v1", version: 1, name: "Tuyển dụng", description: "Đăng tin tìm thành viên mới cho đội ngũ.", accent: "#334155", fields: PROMO_FIELDS,
    defaults: { headline: "WE ARE HIRING", subheadline: "Gia nhập đội ngũ để cùng tạo ra khác biệt", price: "", cta: "ỨNG TUYỂN NGAY", imageUrl: "", brandName: "YOUR COMPANY", primaryColor: "#334155" },
  },
  {
    id: "countdown-event-v1", version: 1, name: "Đếm ngược sự kiện", description: "Tạo sự chú ý trước ngày ra mắt hoặc sự kiện.", accent: "#7c3aed", fields: PROMO_FIELDS,
    defaults: { headline: "CÒN 03 NGÀY", subheadline: "Sự kiện đặc biệt sắp diễn ra", price: "", cta: "ĐĂNG KÝ NGAY", imageUrl: "", brandName: "YOUR BRAND", primaryColor: "#7c3aed" },
  },
];

export function getCreativeImageTemplate(templateId: string) {
  return CREATIVE_IMAGE_TEMPLATES.find((template) => template.id === templateId) || null;
}
