import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import type { TabType, UserProfile } from "../types";

export type LazyPageComponent = LazyExoticComponent<ComponentType<object>>;

export type AppRoute = {
  tab: TabType;
  component: LazyPageComponent;
  canAccess?: (userProfile: UserProfile) => boolean;
};

export const APP_ROUTES: AppRoute[] = [
  {
    tab: "TONG QUAN",
    component: lazy(() => import("../pages/DashboardTab")),
  },
  {
    tab: "MARKETING",
    component: lazy(() => import("../pages/MarketingTab")),
  },
  {
    tab: "SALES CRM",
    component: lazy(() => import("../pages/CRMTab")),
  },
  {
    tab: "QUAN TRI USER",
    component: lazy(() => import("../pages/UserAdminTab")),
    canAccess: (userProfile) => userProfile.role === "superadmin" || userProfile.role === "admin",
  },
  {
    tab: "CAI DAT",
    component: lazy(() => import("../pages/SettingsTab")),
  },
  {
    tab: "VI & NAP TIEN",
    component: lazy(() => import("../pages/WalletTab")),
  },
];

export const DEFAULT_APP_TAB: TabType = "TONG QUAN";

export function getRouteByTab(tab: TabType) {
  return APP_ROUTES.find((route) => route.tab === tab) || APP_ROUTES[0];
}
