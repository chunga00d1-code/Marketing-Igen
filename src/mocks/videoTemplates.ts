import { VideoTemplateCategory, VideoTemplateDetail } from '../types/video-template';

export const MOCK_VIDEO_CATEGORIES: VideoTemplateCategory[] = [
  { id: 'all', name: 'Dành cho bạn' },
  { id: 'new', name: 'Mới' },
  { id: 'popular', name: 'Phổ biến' },
  { id: 'tiktok', name: 'TikTok' },
  { id: 'sales', name: 'Bán hàng' },
  { id: 'product_review', name: 'Review sản phẩm' },
  { id: 'education', name: 'Giáo dục' },
  { id: 'vlog', name: 'Vlog' },
  { id: 'promo', name: 'Khuyến mãi' },
];

function createGradientThumbnail(title: string, category: string, color1: string, color2: string, ratio: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color1}"/>
        <stop offset="100%" stop-color="${color2}"/>
      </linearGradient>
      <linearGradient id="overlay" x1="0%" y1="100%" x2="0%" y2="0%">
        <stop offset="0%" stop-color="#071629" stop-opacity="0.85"/>
        <stop offset="60%" stop-color="#071629" stop-opacity="0.1"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.2"/>
      </linearGradient>
    </defs>
    <rect width="600" height="800" fill="url(#g)"/>
    <circle cx="500" cy="150" r="180" fill="#ffffff" fill-opacity="0.08"/>
    <circle cx="100" cy="650" r="220" fill="#000000" fill-opacity="0.12"/>
    <rect width="600" height="800" fill="url(#overlay)"/>
    <g transform="translate(40, 60)">
      <rect x="0" y="0" width="80" height="28" rx="14" fill="rgba(255,255,255,0.25)"/>
      <text x="40" y="19" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle">${ratio}</text>
    </g>
    <g transform="translate(40, 640)">
      <rect x="0" y="0" width="120" height="26" rx="13" fill="#00aeca"/>
      <text x="60" y="17" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff" text-anchor="middle">${category.toUpperCase()}</text>
      <text x="0" y="65" font-family="system-ui, sans-serif" font-size="28" font-weight="bold" fill="#ffffff">${title.length > 25 ? title.substring(0, 25) + '...' : title}</text>
    </g>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const MOCK_VIDEO_TEMPLATES: VideoTemplateDetail[] = [
  {
    id: 'tmpl-001',
    title: 'TikTok Flash Sale 15s Sôi Động',
    description: 'Mẫu video ngắn 15s chuẩn xu hướng TikTok, giật nhịp nhanh, hiển thị giá ưu đãi bùng nổ thích hợp cho chiến dịch Flash Sale.',
    thumbnailUrl: createGradientThumbnail('TikTok Flash Sale 15s', 'Bán hàng', '#ff4b2b', '#ff416c', '9:16'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    duration: 15,
    aspectRatio: '9:16',
    category: { id: 'sales', name: 'Bán hàng' },
    tags: ['TikTok', 'Flash Sale', 'Giảm giá', 'Chuyển cảnh nhanh'],
    usageCount: 14200,
    isFavorite: true,
    ownerType: 'system',
    canEdit: true,
    badges: ['popular', 'new'],
    slots: [
      { key: 'product_video', type: 'video', label: 'Video quay cận cảnh sản phẩm', required: true },
      { key: 'product_image', type: 'image', label: 'Ảnh banner sản phẩm', required: true },
      { key: 'title_text', type: 'text', label: 'Tiêu đề khuyến mãi (VD: SIÊU SALE 50%)', required: true, maxLength: 30 },
      { key: 'price_text', type: 'text', label: 'Giá ưu đãi (VD: Chỉ 199K)', required: true, maxLength: 20 },
      { key: 'cta_text', type: 'text', label: 'Lời kêu gọi hành động (VD: Mua Ngay Nút Bên Dưới)', required: true, maxLength: 35 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: false },
  },
  {
    id: 'tmpl-002',
    title: 'Review Sản Phẩm Công Nghệ Unboxing',
    description: 'Phong cách mở hộp hiện đại với hiệu ứng Zoom chi tiết, phụ đề hiển thị thông số nổi bật và âm thanh whoosh ấn tượng.',
    thumbnailUrl: createGradientThumbnail('Unboxing Tech Review', 'Review sản phẩm', '#0f2027', '#2c5364', '9:16'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    duration: 30,
    aspectRatio: '9:16',
    category: { id: 'product_review', name: 'Review sản phẩm' },
    tags: ['Unboxing', 'Công nghệ', 'Review', 'Reels'],
    usageCount: 8930,
    isFavorite: false,
    ownerType: 'system',
    canEdit: true,
    badges: ['popular'],
    slots: [
      { key: 'unboxing_video', type: 'video', label: 'Video góc nhìn mở hộp', required: true },
      { key: 'feature_image_1', type: 'image', label: 'Ảnh cận cảnh tính năng 1', required: true },
      { key: 'feature_image_2', type: 'image', label: 'Ảnh cận cảnh tính năng 2', required: false },
      { key: 'product_name', type: 'text', label: 'Tên sản phẩm đầy đủ', required: true, maxLength: 40 },
      { key: 'highlight_spec', type: 'text', label: 'Điểm ăn tiền nhất', required: true, maxLength: 50 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: false },
  },
  {
    id: 'tmpl-003',
    title: 'Before & After Lột Xác Mỹ Phẩm',
    description: 'So sánh tương phản Trước & Sau rõ rệt giúp khách hàng thấy ngay hiệu quả thần kỳ của sản phẩm chăm sóc da / spa.',
    thumbnailUrl: createGradientThumbnail('Before & After Glow Up', 'Bán hàng', '#ec008c', '#fc6767', '9:16'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    duration: 20,
    aspectRatio: '9:16',
    category: { id: 'sales', name: 'Bán hàng' },
    tags: ['Before After', 'Mỹ phẩm', 'Spa', 'Skincare'],
    usageCount: 11500,
    isFavorite: true,
    ownerType: 'system',
    canEdit: true,
    badges: ['popular'],
    slots: [
      { key: 'before_video', type: 'video', label: 'Video tình trạng trước khi dùng', required: true },
      { key: 'after_video', type: 'video', label: 'Video kết quả ấn tượng sau khi dùng', required: true },
      { key: 'product_photo', type: 'image', label: 'Ảnh chai/hũ sản phẩm', required: true },
      { key: 'headline', type: 'text', label: 'Tiêu đề bài biến hình', required: true, maxLength: 30 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: false },
  },
  {
    id: 'tmpl-004',
    title: 'Mẫu Giới Thiệu Dịch Vụ Doanh Nghiệp Pro',
    description: 'Mẫu video 16:9 tỷ lệ ngang chuẩn nhận diện thương hiệu, dành cho chạy quảng cáo Facebook / YouTube giới thiệu công ty & dịch vụ.',
    thumbnailUrl: createGradientThumbnail('Doanh Nghiệp Premium', 'Khuyến mãi', '#1a2a6c', '#b21f1f', '16:9'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyflights.mp4',
    duration: 45,
    aspectRatio: '16:9',
    category: { id: 'promo', name: 'Khuyến mãi' },
    tags: ['Doanh nghiệp', 'YouTube', 'Facebook Ads', '16:9'],
    usageCount: 6400,
    isFavorite: false,
    ownerType: 'system',
    canEdit: true,
    badges: ['new'],
    slots: [
      { key: 'intro_clip', type: 'video', label: 'Video văn phòng / Đội ngũ', required: true },
      { key: 'logo_img', type: 'image', label: 'Logo doanh nghiệp dạng PNG', required: true },
      { key: 'company_name', type: 'text', label: 'Tên thương hiệu', required: true, maxLength: 30 },
      { key: 'slogan', type: 'text', label: 'Thông điệp chính / Slogan', required: true, maxLength: 60 },
      { key: 'contact_info', type: 'text', label: 'Hotline / Website', required: true, maxLength: 40 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: false },
  },
  {
    id: 'tmpl-005',
    title: '3 Mẹo Đột Phá Doanh Số TikTok',
    description: 'Mẫu video kiến thức giáo dục ngắn, dạng danh sách 3 bước đơn giản kết hợp hiệu ứng text đếm ngược lôi cuốn người xem.',
    thumbnailUrl: createGradientThumbnail('3 Mẹo Tăng Doanh Số', 'Giáo dục', '#11998e', '#38ef7d', '9:16'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
    duration: 25,
    aspectRatio: '9:16',
    category: { id: 'education', name: 'Giáo dục' },
    tags: ['Mẹo', 'TikTok', 'Giáo dục', 'Tips'],
    usageCount: 7800,
    isFavorite: false,
    ownerType: 'system',
    canEdit: true,
    badges: [],
    slots: [
      { key: 'speaker_video', type: 'video', label: 'Video diễn thuyết / quay mặt', required: true },
      { key: 'tip1', type: 'text', label: 'Mẹo số 1 ngắn gọn', required: true, maxLength: 45 },
      { key: 'tip2', type: 'text', label: 'Mẹo số 2 ngắn gọn', required: true, maxLength: 45 },
      { key: 'tip3', type: 'text', label: 'Mẹo số 3 ngắn gọn', required: true, maxLength: 45 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: false },
  },
  {
    id: 'tmpl-006',
    title: 'Vlog Đời Sống Chill Aesthetic 1:1',
    description: 'Khung hình vuông 1:1 phong cách màu nhẹ nhàng, nhạc lofi cuốn hút cho Feed Instagram và Fanpage cá nhân.',
    thumbnailUrl: createGradientThumbnail('Aesthetic Life Vlog', 'Vlog', '#8a2387', '#e94057', '1:1'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4',
    duration: 20,
    aspectRatio: '1:1',
    category: { id: 'vlog', name: 'Vlog' },
    tags: ['Vlog', 'Instagram', 'Lofi', 'Chill', '1:1'],
    usageCount: 5200,
    isFavorite: false,
    ownerType: 'system',
    canEdit: true,
    badges: [],
    slots: [
      { key: 'vlog_video', type: 'video', label: 'Video đời sống / quán cafe', required: true },
      { key: 'caption', type: 'text', label: 'Dòng caption cảm xúc', required: true, maxLength: 50 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: false },
  },
  {
    id: 'tmpl-007',
    title: 'Promo Sự Kiện Grand Opening 9:16',
    description: 'Chữ chạy sôi động kết hợp ánh sáng Neon hoành tráng dành riêng cho thông báo khai trương cửa hàng, chi nhánh mới.',
    thumbnailUrl: createGradientThumbnail('Grand Opening Neon', 'Khuyến mãi', '#f12711', '#f5af19', '9:16'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/SubaruOutbackComplexity.mp4',
    duration: 15,
    aspectRatio: '9:16',
    category: { id: 'promo', name: 'Khuyến mãi' },
    tags: ['Khai trương', 'Sự kiện', 'Promo', 'Neon'],
    usageCount: 9100,
    isFavorite: true,
    ownerType: 'system',
    canEdit: true,
    badges: ['popular'],
    slots: [
      { key: 'event_video', type: 'video', label: 'Video không gian cửa hàng', required: true },
      { key: 'event_name', type: 'text', label: 'Tên sự kiện / Khai trương', required: true, maxLength: 30 },
      { key: 'date_location', type: 'text', label: 'Thời gian & Địa chỉ', required: true, maxLength: 50 },
      { key: 'special_offer', type: 'text', label: 'Quà tặng khai trương', required: true, maxLength: 40 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: false },
  },
  {
    id: 'tmpl-008',
    title: 'Showcase Thời Trang Mùa Hè 9:16',
    description: 'Beat sync giật nhạc mượt mà tôn vinh chất liệu và phom dáng thời trang mới nhất. Lý tưởng cho shop thời trang.',
    thumbnailUrl: createGradientThumbnail('Summer Fashion Lookbook', 'TikTok', '#654ea3', '#eaafc8', '9:16'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    duration: 18,
    aspectRatio: '9:16',
    category: { id: 'tiktok', name: 'TikTok' },
    tags: ['Thời trang', 'Lookbook', 'Beat sync', 'Outfit'],
    usageCount: 13100,
    isFavorite: false,
    ownerType: 'system',
    canEdit: true,
    badges: ['new', 'popular'],
    slots: [
      { key: 'model_video', type: 'video', label: 'Video mẫu mặc trang phục', required: true },
      { key: 'outfit_name', type: 'text', label: 'Tên bộ sưu tập', required: true, maxLength: 30 },
      { key: 'price', type: 'text', label: 'Giá sản phẩm', required: true, maxLength: 20 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: false },
  },
  {
    id: 'tmpl-009',
    title: 'Top 5 Lý Do Chọn Sản Phẩm Này',
    description: 'Thiết kế liệt kê đếm số lồng ghép đồ họa hiện đại giúp người xem dễ dàng ghi nhớ ưu điểm sản phẩm.',
    thumbnailUrl: createGradientThumbnail('Top 5 Lý Do Chọn', 'Review sản phẩm', '#3a1c71', '#d76d77', '9:16'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WeAreGoingOnBullrun.mp4',
    duration: 35,
    aspectRatio: '9:16',
    category: { id: 'product_review', name: 'Review sản phẩm' },
    tags: ['Top 5', 'Review', 'Lý do', 'Thuyết phục'],
    usageCount: 4700,
    isFavorite: false,
    ownerType: 'system',
    canEdit: true,
    badges: [],
    slots: [
      { key: 'product_demo', type: 'video', label: 'Video trải nghiệm thực tế', required: true },
      { key: 'reason_1', type: 'text', label: 'Lý do 1 (Ví dụ: Thiết kế nhỏ gọn)', required: true, maxLength: 35 },
      { key: 'reason_2', type: 'text', label: 'Lý do 2 (Ví dụ: Pin dùng 3 ngày)', required: true, maxLength: 35 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: false },
  },

  // Templates owned by current User ("Mẫu của tôi")
  {
    id: 'tmpl-mine-001',
    title: 'Mẫu Quảng Cáo Mỹ Phẩm Cá Nhân iGen',
    description: 'Mẫu video riêng tôi thiết kế cho chuỗi bài post mỹ phẩm mùa hè 2026. Đã lưu cấu hình preset màu sắc và font chữ.',
    thumbnailUrl: createGradientThumbnail('Mẫu Mỹ Phẩm iGen', 'Bán hàng', '#4568dc', '#b06ab3', '9:16'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/WhatCarCanYouGetForAGrand.mp4',
    duration: 20,
    aspectRatio: '9:16',
    category: { id: 'sales', name: 'Bán hàng' },
    tags: ['Mẫu của tôi', 'Mỹ phẩm', 'Personal'],
    usageCount: 42,
    isFavorite: true,
    ownerType: 'user',
    canEdit: true,
    badges: ['mine'],
    slots: [
      { key: 'product_video', type: 'video', label: 'Video sản phẩm mỹ phẩm', required: true },
      { key: 'product_image', type: 'image', label: 'Ảnh góc chụp cận cảnh', required: true },
      { key: 'discount_tag', type: 'text', label: 'Voucher giảm giá', required: true, maxLength: 25 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: true },
  },
  {
    id: 'tmpl-mine-002',
    title: 'Chiến Dịch Khai Trương Chi Nhánh 3',
    description: 'Mẫu tùy chỉnh cho chiến dịch mở rộng cửa hàng tháng 7. Đã set sẵn font chữ thương hiệu iGen.',
    thumbnailUrl: createGradientThumbnail('Khai Trương CN3', 'Khuyến mãi', '#000000', '#434343', '16:9'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
    duration: 30,
    aspectRatio: '16:9',
    category: { id: 'promo', name: 'Khuyến mãi' },
    tags: ['Mẫu của tôi', 'Event', 'CN3'],
    usageCount: 18,
    isFavorite: false,
    ownerType: 'user',
    canEdit: true,
    badges: ['mine'],
    slots: [
      { key: 'store_clip', type: 'video', label: 'Video chi nhánh mới', required: true },
      { key: 'brand_logo', type: 'image', label: 'Logo PNG', required: true },
      { key: 'address', type: 'text', label: 'Địa chỉ chi nhánh 3', required: true, maxLength: 50 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: true },
  },
  {
    id: 'tmpl-mine-003',
    title: 'TikTok Mini Vlog Daily Update 9:16',
    description: 'Template nhật ký làm việc hàng ngày dành cho Founder iGen. Nhạc lofi ấm áp và chữ gõ nhịp gõ chữ typewriter.',
    thumbnailUrl: createGradientThumbnail('Mini Vlog Founder', 'Vlog', '#2193b0', '#6dd5ed', '9:16'),
    previewVideoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
    duration: 15,
    aspectRatio: '9:16',
    category: { id: 'vlog', name: 'Vlog' },
    tags: ['Mẫu của tôi', 'Founder', 'Daily Vlog'],
    usageCount: 65,
    isFavorite: true,
    ownerType: 'user',
    canEdit: true,
    badges: ['mine'],
    slots: [
      { key: 'daily_video', type: 'video', label: 'Video quay không gian làm việc', required: true },
      { key: 'thought_text', type: 'text', label: 'Trích dẫn hay trong ngày', required: true, maxLength: 60 },
    ],
    actions: { canUse: true, canEditTemplate: true, canArchive: true },
  },
];
