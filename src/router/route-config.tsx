import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import type { TabType, UserProfile } from "../types";

export type LazyPageComponent = LazyExoticComponent<ComponentType<any>>;

export type AppRoute = {
  tab: TabType;
  component: LazyPageComponent;
  canAccess?: (userProfile: UserProfile) => boolean;
};

export const APP_ROUTES: AppRoute[] = [
  {
    tab: "MARKETING",
    component: lazy(() => import("../pages/MarketingTab")),
  },
  {
    tab: "SALES CRM",
    component: lazy(() => import("../pages/CRMTab")),
  },
  {
    tab: "QUẢN TRỊ USER",
    component: lazy(() => import("../pages/UserAdminTab")),
    canAccess: (userProfile) => userProfile.role === "superadmin" || userProfile.role === "admin",
  },
  {
    tab: "CÀI ĐẶT",
    component: lazy(() => import("../pages/SettingsTab")),
  },
  {
    tab: "VÍ & NẠP TIỀN",
    component: lazy(() => import("../pages/WalletTab")),
  },
];

export const DEFAULT_APP_TAB: TabType = "MARKETING";

export function getRouteByTab(tab: TabType) {
  return APP_ROUTES.find((route) => route.tab === tab) || APP_ROUTES[0];
}
