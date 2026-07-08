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

export const SEO_BASE_URL = "https://erp.igentechsolutions.com";
export const SEO_DEFAULT_IMAGE = BRAND_LOGO_URL;
export const SEO_DEFAULT_LOCALE = "vi_VN";

export function buildDocumentTitle(title: string) {
  const normalized = title.trim();
  return normalized.includes(BRAND_NAME) ? normalized : `${normalized} | ${BRAND_NAME}`;
}

export const DEFAULT_SEO: SeoMeta = {
  title: "Marketing & Sales Workspace tich hop AI",
  description:
    "Workspace tach rieng cho Marketing va Sales CRM cua iGen, ho tro sang tao noi dung, quan ly chien dich va omni-inbox ban hang.",
  keywords:
    "marketing AI, sales crm, omni inbox, tao noi dung AI, quan ly chien dich, iGen workspace",
  path: "/",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "1.0",
  changeFrequency: "weekly",
};

export const AUTH_SEO: SeoMeta = {
  title: "Dang nhap - Marketing & Sales Workspace",
  description:
    "Dang nhap vao workspace Marketing va Sales CRM de quan ly chien dich, noi dung va hoi thoai khach hang.",
  keywords: "dang nhap marketing workspace, sales crm, omni inbox, iGen",
  path: "/dang-nhap",
  image: SEO_DEFAULT_IMAGE,
  robots: "noindex, nofollow",
  type: "website",
  priority: "0.3",
  changeFrequency: "monthly",
};

export const PRIVACY_SEO: SeoMeta = {
  title: "Chinh sach bao mat",
  description: "Chinh sach bao mat thong tin nguoi dung va du lieu cua workspace Marketing iGen.",
  keywords: "chinh sach bao mat, bao mat du lieu, iGen marketing",
  path: "/privacy-policy",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "0.5",
  changeFrequency: "monthly",
};

export const TERMS_SEO: SeoMeta = {
  title: "Dieu khoan dich vu",
  description: "Dieu khoan dich vu va thoa thuan su dung workspace Marketing & Sales iGen.",
  keywords: "dieu khoan dich vu, thoa thuan su dung, iGen marketing",
  path: "/terms-of-service",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "0.5",
  changeFrequency: "monthly",
};

export const DELETION_SEO: SeoMeta = {
  title: "Yeu cau xoa du lieu nguoi dung",
  description: "Huong dan xoa du lieu nguoi dung va tra cuu trang thai yeu cau tren workspace Marketing iGen.",
  keywords: "xoa du lieu nguoi dung, bao mat du lieu, user data deletion, iGen marketing",
  path: "/user-data-deletion",
  image: SEO_DEFAULT_IMAGE,
  robots: "index, follow",
  type: "website",
  priority: "0.5",
  changeFrequency: "monthly",
};

export const TAB_SEO_MAP: Partial<Record<TabType, SeoMeta>> = {
  MARKETING: {
    title: "Marketing AI - Sang tao noi dung, san xuat video AI",
    description:
      "Tang toc chien dich tiep thi so voi bo cong cu Marketing AI tu dong tao y tuong bai viet, len ke hoach noi dung va san xuat video quang cao AI.",
    keywords: "marketing AI, tao noi dung AI, tao video AI, lap ke hoach marketing, chien dich so, heygen video",
    path: "/marketing",
    priority: "0.9",
    changeFrequency: "daily",
  },
  "SALES CRM": {
    title: "Sales CRM - Quan ly khach hang, hoi thoai Omni-Inbox",
    description:
      "Cham soc khach hang tap trung voi tinh nang chat da kenh Omni-Inbox, AI tu dong phan hoi va quan ly pheu ban hang CRM hieu qua.",
    keywords: "sales crm, quan ly khach hang, omni channel crm, cham soc khach hang, crm doanh nghiep, omni inbox",
    path: "/sales-crm",
    priority: "0.8",
    changeFrequency: "weekly",
  },
  "QUẢN TRỊ USER": {
    title: "Quan tri user - Tai khoan, vai tro va phan quyen",
    description:
      "Quan ly tai khoan nguoi dung, doanh nghiep, so du vi va cau hinh phan quyen cho workspace Marketing va Sales CRM.",
    keywords: "quan tri user, phan quyen, role permission, quan ly tai khoan, doanh nghiep, vi nguoi dung",
    path: "/quan-tri-user",
    robots: "noindex, nofollow",
    priority: "0.3",
    changeFrequency: "monthly",
  },
  "CÀI ĐẶT": {
    title: "Cai dat he thong - Ho so, tich hop va cau hinh nen tang",
    description:
      "Thiet lap thong tin ho so doanh nghiep, cau hinh tuy chinh hien thi, ket noi mang xa hoi va tich hop phuc vu Marketing, Sales.",
    keywords: "cai dat ERP, cau hinh he thong, tich hop AI, settings workspace",
    path: "/cai-dat",
    robots: "noindex, nofollow",
    priority: "0.2",
    changeFrequency: "monthly",
  },
  "VÍ & NẠP TIỀN": {
    title: "Vi & Nap tien - Nap tien tai khoan qua PayOS",
    description:
      "Quan ly vi tai khoan ca nhan, xem so du va nap tien nhanh chong bang QR Code qua cong thanh toan PayOS.",
    keywords: "vi tai khoan, nap tien workspace, payos nap tien, vietqr, so du vi",
    path: "/vi-nap-tien",
    robots: "noindex, nofollow",
    priority: "0.5",
    changeFrequency: "weekly",
  },
};

export const PUBLIC_SEO_PAGES: SeoMeta[] = [
  DEFAULT_SEO,
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
