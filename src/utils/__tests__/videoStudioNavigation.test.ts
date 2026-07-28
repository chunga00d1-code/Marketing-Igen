import assert from "node:assert/strict";
import test from "node:test";
import { VIDEO_STUDIO_SEO_MAP } from "../../seo/seo-config";
import {
  VIDEO_STUDIO_ROUTES,
  openVideoStudio,
  readVideoStudioLaunchParams,
  videoStudioPathToTool,
} from "../videoStudioNavigation";

test("maps the templates tool to its Video Studio route", () => {
  assert.equal(VIDEO_STUDIO_ROUTES.templates, "/video-studio/templates");
  assert.equal(VIDEO_STUDIO_SEO_MAP.templates.path, "/video-studio/templates");
  assert.equal(videoStudioPathToTool("/video-studio/templates"), "templates");
  assert.equal(videoStudioPathToTool("/video-studio/templates/"), "templates");
});

test("round-trips a templates launch through session storage", () => {
  const values = new Map<string, string>();
  const originalSessionStorage = globalThis.sessionStorage;
  const originalWindow = globalThis.window;

  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      history: {
        pushState: (_state: unknown, _title: string, path: string) => values.set("path", path),
      },
      dispatchEvent: () => true,
    },
  });

  try {
    openVideoStudio({ tool: "templates" });
    assert.equal(values.get("path"), "/video-studio/templates");
    assert.deepEqual(readVideoStudioLaunchParams(), { tool: "templates" });
  } finally {
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: originalSessionStorage,
    });
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
});
