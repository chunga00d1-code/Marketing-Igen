import { useEffect, useState } from "react";
import { pathToTab, tabToPath } from "../seo/seo-config";
import type { TabType } from "../types";
import { DEFAULT_APP_TAB } from "./route-config";

function resolveInitialTab() {
  return pathToTab(window.location.pathname) || DEFAULT_APP_TAB;
}

function isAppTabPath(pathname: string) {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  return normalized === "/" || Boolean(pathToTab(normalized));
}

export function useTabRouter(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const [activeTab, setActiveTab] = useState<TabType>(resolveInitialTab);

  useEffect(() => {
    if (!enabled) return;

    const handlePopState = () => {
      setActiveTab(pathToTab(window.location.pathname) || DEFAULT_APP_TAB);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    if (!isAppTabPath(window.location.pathname)) {
      return;
    }

    const nextPath = tabToPath(activeTab);
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, "", nextPath);
    }
  }, [activeTab, enabled]);

  return {
    activeTab,
    setActiveTab,
  };
}
