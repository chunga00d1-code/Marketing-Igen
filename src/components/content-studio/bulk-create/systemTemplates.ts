import type { BulkLayer } from '../../../services/bulkCreateService';

export interface BulkMarketingPreset {
  id: string;
  name: string;
  description: string;
  accent: string;
  backgroundId: string;
  canvas: { width: number; height: number };
  layers: BulkLayer[];
}

type TextOptions = Pick<BulkLayer, 'color' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'textAlign' | 'textTransform' | 'letterSpacing' | 'lineHeight'>;

function text(id: string, fieldName: string, defaultValue: string, x: number, y: number, width: number, height: number, zIndex: number, options: TextOptions = {}): BulkLayer {
  return {
    id,
    type: 'text',
    fieldName,
    defaultValue,
    x,
    y,
    width,
    height,
    rotation: 0,
    zIndex,
    color: '#ffffff',
    fontFamily: 'Be Vietnam Pro',
    fontSize: 52,
    fontWeight: 700,
    lineHeight: 1.15,
    ...options,
  };
}

function image(id: string, fieldName: string, x: number, y: number, width: number, height: number, zIndex: number): BulkLayer {
  return { id, type: 'image', fieldName, x, y, width, height, rotation: 0, zIndex, fit: 'cover' };
}

const square = { width: 1080, height: 1080 };
const brand = (value = 'YOUR BRAND', color = '#ffffff') => text('brand', 'Thương hiệu', value, 7, 6, 55, 7, 5, { color, fontSize: 28, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase' });
const cta = (value = 'KHÁM PHÁ NGAY') => text('cta', 'Nút kêu gọi', value, 7, 84, 43, 7, 5, { color: '#ffffff', fontSize: 30, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.6 });

export const BULK_MARKETING_PRESETS: BulkMarketingPreset[] = [
  {
    id: 'product-promo', name: 'Khuyến mãi sản phẩm', description: 'Giá, ưu đãi và ảnh sản phẩm', accent: '#f97316', backgroundId: 'sale', canvas: square,
    layers: [brand(), text('headline', 'Tiêu đề', 'GIẢM GIÁ ĐẾN 40%', 7, 19, 57, 18, 3, { fontSize: 76, fontWeight: 900, textTransform: 'uppercase' }), text('subheadline', 'Mô tả ngắn', 'Ưu đãi đặc biệt chỉ trong hôm nay', 7, 39, 48, 10, 3, { fontSize: 34, fontWeight: 500 }), text('price', 'Giá ưu đãi', '499.000đ', 7, 55, 45, 12, 3, { color: '#fef08a', fontSize: 72, fontWeight: 900 }), cta('ĐẶT HÀNG NGAY'), image('product-image', 'Ảnh sản phẩm', 63, 15, 30, 73, 2)],
  },
  {
    id: 'product-showcase', name: 'Giới thiệu sản phẩm', description: 'Ra mắt sản phẩm với lợi ích chính', accent: '#2563eb', backgroundId: 'fresh', canvas: square,
    layers: [brand(), text('headline', 'Tên sản phẩm', 'SẢN PHẨM MỚI', 7, 20, 48, 17, 3, { fontSize: 72, fontWeight: 900, textTransform: 'uppercase' }), text('subheadline', 'Lợi ích', 'Thiết kế tinh tế. Trải nghiệm khác biệt mỗi ngày.', 7, 39, 44, 14, 3, { fontSize: 36, fontWeight: 500 }), cta(), image('product-image', 'Ảnh sản phẩm', 57, 18, 35, 64, 2)],
  },
  {
    id: 'quote-card', name: 'Quote & kiến thức', description: 'Trích dẫn, thông điệp và mẹo hay', accent: '#7c3aed', backgroundId: 'business', canvas: square,
    layers: [brand(), text('quote-mark', 'Biểu tượng', '“', 7, 17, 15, 17, 2, { color: '#c4b5fd', fontFamily: 'Playfair Display', fontSize: 180, fontWeight: 900 }), text('headline', 'Câu trích dẫn', 'Điều tạo nên khác biệt không phải là ý tưởng, mà là hành động mỗi ngày.', 12, 35, 76, 28, 3, { fontFamily: 'Playfair Display', fontSize: 56, fontWeight: 700, textAlign: 'center' }), text('subheadline', 'Tác giả / ghi chú', '— iGen Marketing', 15, 70, 70, 8, 3, { color: '#cbd5e1', fontSize: 30, fontWeight: 600, textAlign: 'center' })],
  },
  {
    id: 'event-announcement', name: 'Thông báo sự kiện', description: 'Sự kiện, ra mắt hoặc chương trình mới', accent: '#0f766e', backgroundId: 'nature', canvas: square,
    layers: [brand(), text('label', 'Nhãn sự kiện', 'SAVE THE DATE', 7, 18, 42, 7, 3, { color: '#d9f99d', fontSize: 30, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }), text('headline', 'Tên sự kiện', 'SỰ KIỆN ĐẶC BIỆT', 7, 29, 57, 18, 3, { fontSize: 70, fontWeight: 900, textTransform: 'uppercase' }), text('subheadline', 'Thời gian / địa điểm', 'Đăng ký ngay để giữ chỗ cùng chúng tôi', 7, 50, 48, 13, 3, { fontSize: 34, fontWeight: 500 }), cta('ĐĂNG KÝ NGAY'), image('event-image', 'Ảnh sự kiện', 63, 16, 30, 66, 2)],
  },
  {
    id: 'flash-sale', name: 'Flash Sale', description: 'Ưu đãi giới hạn thời gian', accent: '#e11d48', backgroundId: 'sale', canvas: square,
    layers: [brand(), text('label', 'Nhãn ưu đãi', '⚡ CHỈ HÔM NAY', 7, 16, 42, 8, 3, { color: '#fef08a', fontSize: 32, fontWeight: 900, textTransform: 'uppercase' }), text('headline', 'Tiêu đề', 'FLASH SALE 24H', 7, 27, 54, 15, 3, { fontSize: 78, fontWeight: 900, textTransform: 'uppercase' }), text('price', 'Giá ưu đãi', '299.000đ', 7, 49, 45, 13, 3, { color: '#ffffff', fontSize: 76, fontWeight: 900 }), text('subheadline', 'Thời hạn', 'Kết thúc lúc 23:59 hôm nay', 7, 65, 48, 7, 3, { color: '#ffe4e6', fontSize: 30, fontWeight: 600 }), cta('MUA NGAY'), image('product-image', 'Ảnh sản phẩm', 62, 20, 31, 61, 2)],
  },
  {
    id: 'combo-deal', name: 'Ưu đãi combo', description: 'Gói sản phẩm có giá trị cao', accent: '#ea580c', backgroundId: 'luxury', canvas: square,
    layers: [brand('YOUR BRAND', '#fde68a'), text('headline', 'Tiêu đề', 'COMBO TIẾT KIỆM', 7, 20, 56, 17, 3, { color: '#ffffff', fontSize: 72, fontWeight: 900, textTransform: 'uppercase' }), text('subheadline', 'Mô tả ngắn', 'Chọn trọn bộ, nhận ưu đãi tốt hơn', 7, 40, 47, 10, 3, { color: '#fde68a', fontSize: 34, fontWeight: 600 }), text('price', 'Giá combo', '899.000đ', 7, 55, 45, 12, 3, { color: '#fef3c7', fontSize: 70, fontWeight: 900 }), cta('NHẬN ƯU ĐÃI'), image('product-image', 'Ảnh combo', 63, 18, 29, 64, 2)],
  },
  {
    id: 'new-arrival', name: 'Sản phẩm mới', description: 'Bộ sưu tập hoặc sản phẩm vừa ra mắt', accent: '#4f46e5', backgroundId: 'pastel', canvas: square,
    layers: [brand('YOUR BRAND', '#312e81'), text('label', 'Nhãn ra mắt', 'NEW ARRIVAL', 7, 18, 45, 8, 3, { color: '#4f46e5', fontSize: 35, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase' }), text('headline', 'Tiêu đề', 'BỘ SƯU TẬP MỚI', 7, 29, 51, 18, 3, { color: '#1e1b4b', fontSize: 70, fontWeight: 900, textTransform: 'uppercase' }), text('subheadline', 'Mô tả ngắn', 'Dành cho phong cách của bạn', 7, 51, 44, 10, 3, { color: '#4338ca', fontSize: 34, fontWeight: 600 }), text('cta', 'Nút kêu gọi', 'KHÁM PHÁ NGAY', 7, 84, 43, 7, 3, { color: '#312e81', fontSize: 30, fontWeight: 900, textTransform: 'uppercase' }), image('product-image', 'Ảnh sản phẩm', 61, 16, 32, 67, 2)],
  },
  {
    id: 'member-offer', name: 'Ưu đãi thành viên', description: 'Đặc quyền khách hàng thân thiết', accent: '#be123c', backgroundId: 'sale', canvas: square,
    layers: [brand(), text('label', 'Nhãn thành viên', 'MEMBERS ONLY', 7, 17, 45, 8, 3, { color: '#fef08a', fontSize: 30, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase' }), text('headline', 'Tiêu đề', 'ĐẶC QUYỀN THÀNH VIÊN', 7, 28, 57, 19, 3, { fontSize: 66, fontWeight: 900, textTransform: 'uppercase' }), text('price', 'Ưu đãi', 'TẶNG 20%', 7, 54, 45, 12, 3, { color: '#fef08a', fontSize: 68, fontWeight: 900 }), cta('THAM GIA NGAY'), image('member-image', 'Ảnh thành viên', 63, 18, 30, 64, 2)],
  },
  {
    id: 'customer-review', name: 'Đánh giá khách hàng', description: 'Social proof từ phản hồi tích cực', accent: '#0891b2', backgroundId: 'night', canvas: square,
    layers: [brand(), text('rating', 'Đánh giá sao', '★★★★★', 7, 19, 45, 8, 3, { color: '#fef08a', fontSize: 38, fontWeight: 800 }), text('headline', 'Đánh giá', 'Sản phẩm đẹp hơn mong đợi, đội ngũ hỗ trợ rất nhanh và tận tâm!', 8, 33, 61, 27, 3, { fontSize: 50, fontWeight: 700 }), text('subheadline', 'Khách hàng', '— Minh Anh, Hà Nội', 8, 66, 51, 8, 3, { color: '#bae6fd', fontSize: 30, fontWeight: 600 }), image('avatar-image', 'Ảnh khách hàng', 72, 58, 18, 18, 2)],
  },
  {
    id: 'quick-tip', name: 'Mẹo nhanh', description: 'Kiến thức marketing dễ lưu lại', accent: '#16a34a', backgroundId: 'nature', canvas: square,
    layers: [brand(), text('number', 'Số thứ tự', '01', 7, 17, 25, 20, 2, { color: '#d9f99d', fontSize: 132, fontWeight: 900 }), text('label', 'Nhãn', 'MẸO NHANH', 36, 21, 45, 7, 3, { color: '#d9f99d', fontSize: 34, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }), text('headline', 'Nội dung mẹo', 'Tập trung vào lợi ích khách hàng nhận được, không chỉ tính năng sản phẩm.', 9, 41, 80, 27, 3, { fontSize: 52, fontWeight: 800 }), text('subheadline', 'Ghi chú', 'Lưu lại để áp dụng ngay', 9, 76, 62, 7, 3, { color: '#d9f99d', fontSize: 30, fontWeight: 600 })],
  },
  {
    id: 'recruitment', name: 'Tuyển dụng', description: 'Mời ứng viên gia nhập đội ngũ', accent: '#334155', backgroundId: 'business', canvas: square,
    layers: [brand(), text('headline', 'Tiêu đề', 'WE ARE HIRING', 7, 21, 58, 17, 3, { fontSize: 80, fontWeight: 900, textTransform: 'uppercase' }), text('subheadline', 'Mô tả vị trí', 'Gia nhập đội ngũ để cùng tạo ra khác biệt', 7, 42, 48, 12, 3, { color: '#cbd5e1', fontSize: 35, fontWeight: 600 }), text('cta', 'Nút kêu gọi', 'ỨNG TUYỂN NGAY', 7, 84, 43, 7, 3, { color: '#bae6fd', fontSize: 30, fontWeight: 900, textTransform: 'uppercase' }), image('recruitment-image', 'Ảnh tuyển dụng', 61, 17, 32, 67, 2)],
  },
  {
    id: 'countdown-event', name: 'Đếm ngược sự kiện', description: 'Tạo chú ý trước ngày diễn ra', accent: '#7c3aed', backgroundId: 'business', canvas: square,
    layers: [brand(), text('countdown', 'Thời gian đếm ngược', 'CÒN 03 NGÀY', 7, 19, 83, 21, 3, { color: '#ddd6fe', fontSize: 86, fontWeight: 900, textAlign: 'center', textTransform: 'uppercase' }), text('headline', 'Tên sự kiện', 'SỰ KIỆN ĐẶC BIỆT', 9, 48, 80, 13, 3, { fontSize: 58, fontWeight: 900, textAlign: 'center', textTransform: 'uppercase' }), text('subheadline', 'Thông tin sự kiện', 'Sắp diễn ra — đừng bỏ lỡ', 12, 65, 74, 8, 3, { color: '#cbd5e1', fontSize: 32, fontWeight: 600, textAlign: 'center' }), text('cta', 'Nút kêu gọi', 'ĐĂNG KÝ NGAY', 27, 84, 46, 7, 3, { color: '#ddd6fe', fontSize: 30, fontWeight: 900, textAlign: 'center', textTransform: 'uppercase' })],
  },
];
