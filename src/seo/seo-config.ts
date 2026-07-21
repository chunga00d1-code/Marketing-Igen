import { BRAND_LOGO_URL, BRAND_NAME, SERVICE_WEBSITE_URL } from "../config/brand";
import type { TabType } from "../types";

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

export const PUBLIC_SEO_PAGES: SeoMeta[] = [
  DEFAULT_SEO,
  TAB_SEO_MAP["TONG QUAN"],
  TAB_SEO_MAP.MARKETING,
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
