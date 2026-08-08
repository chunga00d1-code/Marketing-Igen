import { BRAND_LOGO_URL, BRAND_NAME, SERVICE_WEBSITE_URL } from "../config/brand";
import type { TabType } from "../types";
import type { ContentStudioTab } from "../utils/contentStudioNavigation";
import type { VideoStudioTool } from "../utils/videoStudioNavigation";

export type SeoMeta = {
  title: string;
  description: string;
  keywords: string;
  path: string;
  image?: string;
  robots?: string;
  type?: "website" | "article";
  priority?: string;
  changeFrequency?: "daily" | "weekly" | "monthly";
};

export const SEO_BASE_URL = SERVICE_WEBSITE_URL;
export const SEO_DEFAULT_IMAGE = BRAND_LOGO_URL;
export const SEO_DEFAULT_LOCALE = "vi_VN";

export function buildDocumentTitle(title: string) {
  const normalized = title.trim();
  return normalized.includes(BRAND_NAME) ? normalized : `${normalized} | ${BRAND_NAME}`;
}

export const DEFAULT_SEO: SeoMeta = {
  title: BRAND_NAME,
  description:
    "iGen Marketing là workspace Marketing & Sales tích hợp AI, hỗ trợ sáng tạo nội dung, sản xuất video, quản lý chiến dịch và chăm sóc khách hàng đa kênh.",
  keywords:
    "iGen Marketing, marketing AI, sales CRM, omni inbox, tạo nội dung AI, tạo video AI, quản lý chiến dịch, đăng video TikTok",
  path: "/",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "1.0",
  changeFrequency: "weekly",
};

export const LANDING_FAQS = [
  {
    question: "iGen Marketing kết nối với TikTok bằng cách nào và có an toàn không?",
    answer: "iGen Marketing kết nối trực tiếp với TikTok thông qua API chính thức của TikTok Open Platform và xác thực OAuth 2.0. Hệ thống không yêu cầu người dùng cung cấp mật khẩu TikTok.",
  },
  {
    question: "Quyền user.info.basic và video.publish được sử dụng vào mục đích gì?",
    answer: "user.info.basic dùng để hiển thị tài khoản TikTok đã kết nối. video.publish dùng để đăng video sau khi người dùng tạo nội dung, kiểm duyệt và chủ động bấm xuất bản trong iGen Marketing.",
  },
  {
    question: "Tôi có thể hủy liên kết tài khoản TikTok bất cứ lúc nào không?",
    answer: "Có. Người dùng có thể ngắt kết nối tài khoản TikTok trong phần cài đặt kết nối của workspace. Sau khi ngắt kết nối, iGen Marketing ngừng truy xuất dữ liệu từ API TikTok cho tài khoản đó.",
  },
  {
    question: "Làm cách nào để yêu cầu xóa dữ liệu đã đồng bộ?",
    answer: "Người dùng có thể truy cập trang User Data Deletion ở chân trang để gửi yêu cầu xóa dữ liệu. Hệ thống xử lý dữ liệu tài khoản kết nối, nội dung và lịch sử tác vụ liên quan theo chính sách bảo mật đã công bố.",
  },
] as const;

export const AUTH_SEO: SeoMeta = {
  title: "Đăng nhập Marketing & Sales Workspace",
  description:
    "Đăng nhập iGen Marketing để quản lý chiến dịch, nội dung, kênh đăng tải và hội thoại khách hàng trong Sales CRM.",
  keywords: "đăng nhập iGen Marketing, marketing workspace, sales CRM, omni inbox",
  path: "/dang-nhap",
  image: SEO_DEFAULT_IMAGE,
  robots: "noindex, nofollow",
  type: "website",
  priority: "0.3",
  changeFrequency: "monthly",
};

export const PRIVACY_SEO: SeoMeta = {
  title: `${BRAND_NAME} Privacy Policy`,
  description:
    "Chính sách bảo mật của iGen Marketing cho dữ liệu tài khoản, tích hợp nền tảng, nội dung marketing và quyền xóa dữ liệu.",
  keywords: "iGen Marketing privacy policy, chính sách bảo mật, bảo mật dữ liệu, TikTok video publishing",
  path: "/privacy-policy",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "0.5",
  changeFrequency: "monthly",
};

export const TERMS_SEO: SeoMeta = {
  title: `${BRAND_NAME} Terms of Service`,
  description:
    "Điều khoản dịch vụ iGen Marketing cho workspace Marketing & Sales, tính năng AI và các tích hợp nền tảng được người dùng cấp quyền.",
  keywords: "iGen Marketing terms of service, điều khoản dịch vụ, marketing AI, sales CRM",
  path: "/terms-of-service",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "0.5",
  changeFrequency: "monthly",
};

export const DELETION_SEO: SeoMeta = {
  title: `${BRAND_NAME} User Data Deletion`,
  description:
    "Hướng dẫn ngắt kết nối nền tảng và yêu cầu xóa dữ liệu người dùng khỏi iGen Marketing.",
  keywords: "iGen Marketing user data deletion, xóa dữ liệu người dùng, ngắt kết nối TikTok, bảo mật dữ liệu",
  path: "/user-data-deletion",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "0.5",
  changeFrequency: "monthly",
};

export const TAB_SEO_MAP: Partial<Record<TabType, SeoMeta>> = {
  "TONG QUAN": {
    title: "Dashboard Marketing & Sales",
    description:
      "Tổng quan hiệu suất Marketing & Sales: nội dung, lịch đăng, kênh social, lead CRM và hội thoại khách hàng trên một màn hình.",
    keywords: "dashboard marketing sales, tổng quan CRM, tổng quan content, omni inbox, iGen Marketing",
    path: "/tong-quan",
    priority: "0.9",
    changeFrequency: "daily",
  },
  MARKETING: {
    title: "Marketing AI - Nội dung, video và lịch đăng",
    description:
      "Tăng tốc chiến dịch với Marketing AI: tạo ý tưởng, viết nội dung, sản xuất hình ảnh/video, duyệt nội dung và lên lịch đăng đa kênh.",
    keywords: "marketing AI, tạo nội dung AI, tạo video AI, lịch đăng nội dung, chiến dịch marketing, TikTok video",
    path: "/marketing",
    priority: "0.9",
    changeFrequency: "daily",
  },
  "XUONG NOI DUNG": {
    title: "Xưởng nội dung - Hình ảnh và thiết kế hàng loạt",
    description:
      "Tạo hình ảnh và thiết kế hàng loạt từ dữ liệu bảng tính trong một workspace trực quan.",
    keywords: "xưởng nội dung, tạo hình ảnh AI, thiết kế hàng loạt, bulk create",
    path: "/xuong-noi-dung",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  "VIDEO STUDIO": {
    title: "Video Studio - Tạo và chỉnh sửa video",
    description:
      "Tạo video AI, video người dẫn, giọng đọc, chuyển động, video ngắn và phụ đề trong một không gian làm việc dễ sử dụng.",
    keywords:
      "Video Studio, tạo video AI, tạo giọng đọc, chỉnh sửa video, video người dẫn AI, phụ đề video, video ngắn",
    path: "/video-studio",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  "KHO TRI THUC": {
    title: "Kho tri thức doanh nghiệp",
    description:
      "Quản lý tài liệu dùng chung cho Sale, Reply AI, Marketing và Caption video theo phạm vi doanh nghiệp.",
    keywords:
      "kho tri thức doanh nghiệp, RAG, tài liệu AI, company knowledge, caption AI",
    path: "/kho-tri-thuc",
    robots: "noindex, nofollow",
    priority: "0.3",
    changeFrequency: "weekly",
  },
  "SALES CRM": {
    title: "Sales CRM - Lead, hội thoại và chăm sóc khách hàng",
    description:
      "Quản lý khách hàng tập trung với Sales CRM, omni-inbox Facebook/Zalo/TikTok, AI gợi ý phản hồi và pipeline bán hàng.",
    keywords: "sales CRM, quản lý khách hàng, omni inbox, chăm sóc khách hàng, pipeline bán hàng, AI trả lời",
    path: "/sales-crm",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  "QUAN TRI USER": {
    title: "Quản trị tài khoản",
    description:
      "Quản lý người dùng, công ty, quyền truy cập và cấu hình vận hành cho workspace iGen Marketing.",
    keywords: "quản trị tài khoản, phân quyền, iGen Marketing admin",
    path: "/quan-tri-user",
    robots: "noindex, nofollow",
    priority: "0.3",
    changeFrequency: "monthly",
  },
  "CAI DAT": {
    title: "Cài đặt Marketing & Sales Workspace",
    description:
      "Thiết lập hồ sơ, bảo mật, tài khoản mạng xã hội và tích hợp phục vụ Marketing & Sales.",
    keywords: "cài đặt iGen Marketing, tích hợp mạng xã hội, cấu hình TikTok, cấu hình Facebook, cấu hình Zalo",
    path: "/cai-dat",
    robots: "noindex, nofollow",
    priority: "0.2",
    changeFrequency: "monthly",
  },
  "VI & NAP TIEN": {
    title: "Ví & Nạp tiền",
    description:
      "Quản lý số dư ví và nạp tiền cho các tác vụ AI, tạo nội dung và sản xuất media trong iGen Marketing.",
    keywords: "ví tài khoản, nạp tiền iGen Marketing, PayOS, VietQR",
    path: "/vi-nap-tien",
    robots: "noindex, nofollow",
    priority: "0.5",
    changeFrequency: "weekly",
  },
  "HUONG DAN SU DUNG": {
    title: "Hướng dẫn sử dụng Marketing & Sales Workspace",
    description:
      "Cẩm nang hướng dẫn chi tiết dành cho người dùng non-tech, giải thích từng tính năng và quy trình vận hành hệ thống Marketing AI.",
    keywords: "hướng dẫn sử dụng, cẩm nang iGen Marketing, user guide, hướng dẫn nontech",
    path: "/huong-dan-su-dung",
    priority: "0.6",
    changeFrequency: "monthly",
  },
};

export const CONTENT_STUDIO_SEO_MAP: Record<ContentStudioTab, SeoMeta> = {
  image: {
    title: "Tạo hình ảnh AI",
    description: "Tạo và chỉnh sửa hình ảnh phục vụ bài đăng mạng xã hội, quảng cáo và chiến dịch marketing bằng AI.",
    keywords: "tạo hình ảnh AI, ảnh marketing, thiết kế bài đăng, AI image generator",
    path: "/xuong-noi-dung/tao-hinh-anh",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  template: {
    title: "Thiết kế ảnh từ mẫu",
    description: "Tạo ảnh marketing PNG từ các mẫu thiết kế có sẵn, tùy chỉnh nội dung, màu sắc và hình ảnh sản phẩm.",
    keywords: "thiết kế ảnh từ mẫu, HTML to image, tạo ảnh marketing, template social media",
    path: "/xuong-noi-dung/thiet-ke-tu-mau",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  bulk: {
    title: "Thiết kế hàng loạt từ Excel và Google Sheets",
    description: "Tạo hàng loạt hình ảnh từ template và dữ liệu Excel hoặc Google Sheets, hỗ trợ trường chữ và trường ảnh.",
    keywords: "bulk create, thiết kế hàng loạt, tạo ảnh từ Excel, template dữ liệu, Canva bulk create",
    path: "/xuong-noi-dung/thiet-ke-hang-loat",
    priority: "0.8",
    changeFrequency: "weekly",
  },
};

export const VIDEO_STUDIO_SEO_MAP: Record<VideoStudioTool, SeoMeta> = {
  home: {
    title: "Video Studio",
    description:
      "Chọn nhanh công cụ tạo video, chỉnh sửa, cắt video ngắn hoặc thêm phụ đề theo mục tiêu sử dụng.",
    keywords: "Video Studio, tạo video AI, chỉnh sửa video, phụ đề video",
    path: "/video-studio",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  templates: {
    title: "Mẫu video",
    description: "Chọn mẫu video có sẵn và tùy chỉnh thành nội dung phù hợp với thương hiệu.",
    keywords: "mẫu video, template video, chỉnh sửa mẫu video, video marketing",
    path: "/video-studio/templates",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  "html-video": {
    title: "Tạo video từ HTML",
    description:
      "Thiết kế video bằng HTML và CSS, xem trước an toàn và kết xuất MP4 trong Video Studio.",
    keywords: "HTML to video, CSS animation, tạo video từ HTML, video marketing",
    path: "/video-studio/html-to-video",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  "ai-video": {
    title: "Tạo video từ nội dung",
    description: "Tạo video marketing bằng AI từ nội dung mô tả hoặc hình ảnh.",
    keywords: "tạo video từ nội dung, tạo video AI, video marketing",
    path: "/video-studio/tao-video-ai",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  "human-video": {
    title: "Tạo video người dẫn AI",
    description: "Tạo video người dẫn AI từ kịch bản, nhân vật và giọng nói đã chọn.",
    keywords: "video người dẫn AI, avatar AI, video thuyết trình",
    path: "/video-studio/video-nguoi-dan",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  motion: {
    title: "Tạo chuyển động từ hình ảnh",
    description: "Điều khiển chuyển động nhân vật trong ảnh bằng video chuyển động mẫu.",
    keywords: "motion control, tạo chuyển động từ ảnh, video AI",
    path: "/video-studio/tao-chuyen-dong",
    priority: "0.7",
    changeFrequency: "weekly",
  },
  "edit-video": {
    title: "Chỉnh sửa video",
    description: "Cắt ghép và hoàn thiện video trong Video Studio.",
    keywords: "chỉnh sửa video, cắt ghép video, video marketing",
    path: "/video-studio/chinh-sua",
    priority: "0.7",
    changeFrequency: "weekly",
  },
  "long-to-short": {
    title: "Cắt video dài thành video ngắn",
    description: "Tạo các phiên bản video ngắn từ nội dung video dài.",
    keywords: "long to short, cắt video ngắn, video mạng xã hội",
    path: "/video-studio/video-ngan",
    priority: "0.7",
    changeFrequency: "weekly",
  },
  voice: {
    title: "Tạo giọng đọc cho video",
    description: "Chuyển kịch bản thành giọng đọc AI để lồng tiếng hoặc tạo video người dẫn.",
    keywords: "tạo giọng đọc, text to speech, lồng tiếng video, voice AI tiếng Việt",
    path: "/video-studio/giong-doc",
    priority: "0.7",
    changeFrequency: "weekly",
  },
  caption: {
    title: "Thêm phụ đề vào video",
    description: "Nhận diện lời nói, chỉnh timeline và xuất video có phụ đề.",
    keywords: "phụ đề video, speech to text, timeline caption",
    path: "/video-studio/phu-de",
    priority: "0.8",
    changeFrequency: "weekly",
  },
};

export const PUBLIC_SEO_PAGES: SeoMeta[] = [
  DEFAULT_SEO,
  TAB_SEO_MAP["TONG QUAN"],
  TAB_SEO_MAP.MARKETING,
  TAB_SEO_MAP["XUONG NOI DUNG"],
  ...Object.values(CONTENT_STUDIO_SEO_MAP),
  TAB_SEO_MAP["VIDEO STUDIO"],
  ...Object.values(VIDEO_STUDIO_SEO_MAP),
  TAB_SEO_MAP["SALES CRM"],
  PRIVACY_SEO,
  TERMS_SEO,
  DELETION_SEO,
].filter(Boolean) as SeoMeta[];

export function getSeoForTab(tab: TabType): SeoMeta {
  const tabMeta = TAB_SEO_MAP[tab];
  if (!tabMeta) {
    return DEFAULT_SEO;
  }

  return {
    ...DEFAULT_SEO,
    ...tabMeta,
    image: tabMeta.image || SEO_DEFAULT_IMAGE,
    type: tabMeta.type || "website",
  };
}

export function getSeoForPath(requestPath: string): SeoMeta {
  let normalized = requestPath.startsWith("/") ? requestPath.toLowerCase() : `/${requestPath.toLowerCase()}`;
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  if (normalized === AUTH_SEO.path.toLowerCase()) {
    return AUTH_SEO;
  }
  if (normalized === "/privacy-policy" || normalized === "/privacy-policy.html") {
    return PRIVACY_SEO;
  }
  if (normalized === "/terms-of-service" || normalized === "/terms-of-service.html") {
    return TERMS_SEO;
  }
  if (normalized === "/user-data-deletion" || normalized === "/user-data-deletion.html") {
    return DELETION_SEO;
  }
  const contentStudioMeta = Object.values(CONTENT_STUDIO_SEO_MAP).find((meta) => meta.path === normalized);
  if (contentStudioMeta) return contentStudioMeta;
  const videoStudioMeta = Object.values(VIDEO_STUDIO_SEO_MAP).find((meta) => meta.path === normalized);
  if (videoStudioMeta) return videoStudioMeta;
  const tab = pathToTab(normalized);
  return tab ? getSeoForTab(tab) : DEFAULT_SEO;
}

export function resolveSeoUrl(path: string) {
  return new URL(path, SEO_BASE_URL).toString();
}

export function tabToPath(tab: TabType): string {
  return TAB_SEO_MAP[tab]?.path || "/";
}

export function pathToTab(pathname: string): TabType | null {
  let normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (normalized.length > 1 && normalized.endsWith("/")) {
    normalized = normalized.slice(0, -1);
  }
  if (
    normalized.toLowerCase() === "/xuong-noi-dung/tao-video" ||
    normalized.toLowerCase() === "/xuong-noi-dung/tao-giong-noi" ||
    normalized.toLowerCase() === "/video-studio" ||
    normalized.toLowerCase().startsWith("/video-studio/")
  ) {
    return "VIDEO STUDIO";
  }
  if (normalized.toLowerCase().startsWith("/xuong-noi-dung/")) return "XUONG NOI DUNG";
  const matched = (Object.entries(TAB_SEO_MAP) as Array<[TabType, SeoMeta | undefined]>).find(
    ([, meta]) => meta?.path.toLowerCase() === normalized.toLowerCase()
  );
  return matched?.[0] || null;
}

export function tabToHash(tab: TabType): string {
  return tabToPath(tab);
}

export function hashToTab(hash: string): TabType | null {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  return pathToTab(normalized);
}
