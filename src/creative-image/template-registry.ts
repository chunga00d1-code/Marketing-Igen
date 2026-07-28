import type { CreativeImageTemplate } from "./types";

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
];

export function getCreativeImageTemplate(templateId: string) {
  return CREATIVE_IMAGE_TEMPLATES.find((template) => template.id === templateId) || null;
}
