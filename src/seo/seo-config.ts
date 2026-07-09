import { BRAND_LOGO_URL, BRAND_NAME } from "../config/brand";
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

export const SEO_BASE_URL = "https://marketing.igentechsolutions.com";
export const SEO_DEFAULT_IMAGE = BRAND_LOGO_URL;
export const SEO_DEFAULT_LOCALE = "vi_VN";

export function buildDocumentTitle(title: string) {
  const normalized = title.trim();
  return normalized.includes(BRAND_NAME) ? normalized : `${normalized} | ${BRAND_NAME}`;
}

export const DEFAULT_SEO: SeoMeta = {
  title: "Marketing & Sales Workspace tích hợp AI",
  description:
    "Workspace tách riêng cho Marketing và Sales CRM của iGen, hỗ trợ sáng tạo nội dung, quản lý chiến dịch và omni-inbox bán hàng.",
  keywords:
    "marketing AI, sales crm, omni inbox, tạo nội dung AI, quản lý chiến dịch, iGen workspace",
  path: "/",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "1.0",
  changeFrequency: "weekly",
};

export const AUTH_SEO: SeoMeta = {
  title: "Đăng nhập - Marketing & Sales Workspace",
  description:
    "Đăng nhập vào workspace Marketing và Sales CRM để quản lý chiến dịch, nội dung và hội thoại khách hàng.",
  keywords: "đăng nhập marketing workspace, sales crm, omni inbox, iGen",
  path: "/dang-nhap",
  image: SEO_DEFAULT_IMAGE,
  robots: "noindex, nofollow",
  type: "website",
  priority: "0.3",
  changeFrequency: "monthly",
};

export const PRIVACY_SEO: SeoMeta = {
  title: "Chính sách bảo mật",
  description: "Chính sách bảo mật thông tin người dùng và dữ liệu của workspace Marketing iGen.",
  keywords: "chính sách bảo mật, bảo mật dữ liệu, iGen marketing",
  path: "/privacy-policy",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "0.5",
  changeFrequency: "monthly",
};

export const TERMS_SEO: SeoMeta = {
  title: "Điều khoản dịch vụ",
  description: "Điều khoản dịch vụ và thỏa thuận sử dụng workspace Marketing & Sales iGen.",
  keywords: "điều khoản dịch vụ, thỏa thuận sử dụng, iGen marketing",
  path: "/terms-of-service",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "0.5",
  changeFrequency: "monthly",
};

export const DELETION_SEO: SeoMeta = {
  title: "Yêu cầu xóa dữ liệu người dùng",
  description: "Hướng dẫn xóa dữ liệu người dùng và tra cứu trạng thái yêu cầu trên workspace Marketing iGen.",
  keywords: "xóa dữ liệu người dùng, bảo mật dữ liệu, user data deletion, iGen marketing",
  path: "/user-data-deletion",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "0.5",
  changeFrequency: "monthly",
};

export const TAB_SEO_MAP: Partial<Record<TabType, SeoMeta>> = {
  "TONG QUAN": {
    title: "Dashboard Sales & Marketing",
    description:
      "Tổng quan vận hành cho sales và marketing: theo dõi content, publishing, lead CRM và trạng thái kênh bán hàng trên một màn hình.",
    keywords: "dashboard sales marketing, tổng quan crm, tổng quan content, dashboard omni inbox, igen workspace",
    path: "/tong-quan",
    priority: "0.9",
    changeFrequency: "daily",
  },
  MARKETING: {
    title: "Marketing AI - Sáng tạo nội dung, sản xuất video AI",
    description:
      "Tăng tốc chiến dịch tiếp thị số với bộ công cụ Marketing AI tự động tạo ý tưởng bài viết, lên kế hoạch nội dung và sản xuất video quảng cáo AI.",
    keywords: "marketing AI, tạo nội dung AI, tạo video AI, lập kế hoạch marketing, chiến dịch số, heygen video",
    path: "/marketing",
    priority: "0.9",
    changeFrequency: "daily",
  },
  "SALES CRM": {
    title: "Sales CRM - Quản lý khách hàng, hội thoại Omni-Inbox",
    description:
      "Chăm sóc khách hàng tập trung với tính năng chat đa kênh Omni-Inbox, AI tự động phản hồi và quản lý phễu bán hàng CRM hiệu quả.",
    keywords: "sales crm, quản lý khách hàng, omni channel crm, chăm sóc khách hàng, crm doanh nghiệp, omni inbox",
    path: "/sales-crm",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  "QUAN TRI USER": {
    title: "Quản trị user - Tài khoản, vai trò và phân quyền",
    description:
      "Quản lý tài khoản người dùng, doanh nghiệp, số dư ví và cấu hình phân quyền cho workspace Marketing và Sales CRM.",
    keywords: "quản trị user, phân quyền, role permission, quản lý tài khoản, doanh nghiệp, ví người dùng",
    path: "/quan-tri-user",
    robots: "noindex, nofollow",
    priority: "0.3",
    changeFrequency: "monthly",
  },
  "CAI DAT": {
    title: "Cài đặt hệ thống - Hồ sơ, tích hợp và cấu hình nền tảng",
    description:
      "Thiết lập thông tin hồ sơ doanh nghiệp, cấu hình tùy chỉnh hiển thị, kết nối mạng xã hội và tích hợp phục vụ Marketing, Sales.",
    keywords: "cài đặt marketing, cấu hình hệ thống, tích hợp AI, settings workspace",
    path: "/cai-dat",
    robots: "noindex, nofollow",
    priority: "0.2",
    changeFrequency: "monthly",
  },
  "VI & NAP TIEN": {
    title: "Ví & Nạp tiền - Nạp tiền tài khoản qua PayOS",
    description:
      "Quản lý ví tài khoản cá nhân, xem số dư và nạp tiền nhanh chóng bằng QR Code qua cổng thanh toán PayOS.",
    keywords: "ví tài khoản, nạp tiền workspace, payos nạp tiền, vietqr, số dư ví",
    path: "/vi-nap-tien",
    robots: "noindex, nofollow",
    priority: "0.5",
    changeFrequency: "weekly",
  },
};

export const PUBLIC_SEO_PAGES: SeoMeta[] = [
  DEFAULT_SEO,
  TAB_SEO_MAP["TONG QUAN"],
  TAB_SEO_MAP.MARKETING,
  TAB_SEO_MAP["SALES CRM"],
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
  const normalized = requestPath.startsWith("/") ? requestPath.toLowerCase() : `/${requestPath.toLowerCase()}`;
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
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
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
