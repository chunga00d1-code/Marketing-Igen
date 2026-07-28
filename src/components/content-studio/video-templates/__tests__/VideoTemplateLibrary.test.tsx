import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthProvider } from "../../../../context/AuthContext";
import type {
  ShotstackSyncStatus,
  ShotstackSyncSummary,
} from "../../../../types/video-template";
import * as libraryModule from "../VideoTemplateLibrary";
import { runShotstackTemplateSync } from "../shotstackTemplateSync";
import * as syncModule from "../shotstackTemplateSync";
import { TemplateEditorProperties } from "../../../template-editor/TemplateEditorProperties";
import { TemplateEditorTopbar } from "../../../template-editor/TemplateEditorTopbar";
import type { TemplateEditorProject } from "../../../template-editor/types";
import { VideoTemplateCard } from "../VideoTemplateCard";

type LibraryContract = {
  ShotstackSyncControl: React.ComponentType<{
    canManageTemplates: boolean;
    isSyncing: boolean;
    status: ShotstackSyncStatus | null;
    latestSummary?: ShotstackSyncSummary | null;
    statusError?: string | null;
    onSync: () => void;
  }>;
};

const subject = libraryModule as unknown as LibraryContract;
const syncSubject = syncModule as unknown as {
  canManageShotstackTemplates: (role?: string) => boolean;
};

const summary: ShotstackSyncSummary = {
  created: 1,
  updated: 2,
  unchanged: 3,
  archived: 4,
  failedCount: 2,
  failed: [
    { externalId: "template-1", message: "Không tương thích." },
    { externalId: "template-2", message: "Thiếu media." },
  ],
};

const syncStatus = {
  configured: true,
  environment: "stage",
  status: "partial",
  lastAttemptAt: "2026-07-24T01:00:00.000Z",
  lastSuccessAt: "2026-07-24T00:59:00.000Z",
  summary: { ...summary, failedCount: 2, failed: [] },
} as unknown as ShotstackSyncStatus;

test("allows only admin and superadmin roles to manage Shotstack synchronization", () => {
  assert.equal(typeof syncSubject.canManageShotstackTemplates, "function");
  assert.equal(syncSubject.canManageShotstackTemplates("admin"), true);
  assert.equal(syncSubject.canManageShotstackTemplates("superadmin"), true);
  assert.equal(syncSubject.canManageShotstackTemplates("user"), false);
  assert.equal(syncSubject.canManageShotstackTemplates(undefined), false);
});

test("shows Shotstack synchronization and diagnostics to admins only", () => {
  assert.equal(typeof subject.ShotstackSyncControl, "function");
  const Control = subject.ShotstackSyncControl;

  const normalUserMarkup = renderToStaticMarkup(createElement(Control, {
    canManageTemplates: false,
    isSyncing: false,
    status: syncStatus,
    latestSummary: summary,
    onSync: () => undefined,
  }));
  assert.equal(normalUserMarkup, "");

  const adminMarkup = renderToStaticMarkup(createElement(Control, {
    canManageTemplates: true,
    isSyncing: false,
    status: syncStatus,
    latestSummary: summary,
    onSync: () => undefined,
  }));
  assert.match(adminMarkup, /Đồng bộ Shotstack/);
  assert.match(adminMarkup, /Lần đồng bộ gần nhất/);
  assert.match(adminMarkup, /2 mẫu lỗi/);
});

test("disables the Shotstack synchronization control and shows a loading label while running", () => {
  assert.equal(typeof subject.ShotstackSyncControl, "function");
  const markup = renderToStaticMarkup(createElement(subject.ShotstackSyncControl, {
    canManageTemplates: true,
    isSyncing: true,
    status: syncStatus,
    onSync: () => undefined,
  }));

  assert.match(markup, /disabled=""/);
  assert.match(markup, /Đang đồng bộ/);
});

test("shows the persisted safe failure count after a status reload", () => {
  const markup = renderToStaticMarkup(createElement(subject.ShotstackSyncControl, {
    canManageTemplates: true,
    isSyncing: false,
    status: syncStatus,
    onSync: () => undefined,
  }));

  assert.match(markup, /2 mẫu lỗi/);
  assert.doesNotMatch(markup, /template-1|template-2|Không tương thích|Thiếu media/);
});

test("refreshes the catalogue and status after a successful synchronization", async () => {
  const events: string[] = [];

  const result = await runShotstackTemplateSync({
    sync: async () => {
      events.push("sync");
      return summary;
    },
    refreshCatalogue: async () => {
      events.push("catalogue");
    },
    refreshStatus: async () => {
      events.push("status");
    },
    setSyncing: (value) => {
      events.push(value ? "loading" : "idle");
    },
    onSuccess: (value) => {
      events.push(`success:${value.failed.length}`);
    },
    onError: (message) => {
      events.push(`error:${message}`);
    },
  });

  assert.deepEqual(result, summary);
  assert.deepEqual(events, [
    "loading",
    "sync",
    "catalogue",
    "status",
    "success:2",
    "idle",
  ]);
});

test("restores the synchronization control and reports only the safe service error", async () => {
  const events: string[] = [];

  const result = await runShotstackTemplateSync({
    sync: async () => {
      throw new Error("Đồng bộ mẫu Shotstack đang được thực hiện. Vui lòng thử lại sau.");
    },
    refreshCatalogue: async () => {
      events.push("catalogue");
    },
    refreshStatus: async () => {
      events.push("status");
    },
    setSyncing: (value) => {
      events.push(value ? "loading" : "idle");
    },
    onSuccess: () => {
      events.push("success");
    },
    onError: (message) => {
      events.push(`error:${message}`);
    },
  });

  assert.equal(result, null);
  assert.deepEqual(events, [
    "loading",
    "error:Đồng bộ mẫu Shotstack đang được thực hiện. Vui lòng thử lại sau.",
    "idle",
  ]);
});

test("keeps export but omits create-template save and submission actions", () => {
  const topbar = TemplateEditorTopbar as unknown as React.ComponentType<Record<string, unknown>>;
  const topbarMarkup = renderToStaticMarkup(createElement(topbar, {
    title: "Dự án",
    mode: "create-template",
    aspectRatio: "9:16",
    zoomLevel: 100,
    canUndo: false,
    canRedo: false,
    onSetTitle: () => undefined,
    onSetAspectRatio: () => undefined,
    onSetZoomLevel: () => undefined,
    onUndo: () => undefined,
    onRedo: () => undefined,
    onOpenExport: () => undefined,
    onOpenSubmission: () => undefined,
    onBack: () => undefined,
  }));
  assert.match(topbarMarkup, />Xuất</);
  assert.doesNotMatch(topbarMarkup, /Gửi mẫu|Xuất bản mẫu|Lưu bản nháp/);

  const project: TemplateEditorProject = {
    id: "project-1",
    title: "Dự án",
    aspectRatio: "9:16",
    duration: 15,
    mode: "create-template",
    tracks: [],
    items: [],
  };
  const properties = TemplateEditorProperties as unknown as React.ComponentType<Record<string, unknown>>;
  const propertiesMarkup = renderToStaticMarkup(
    createElement(AuthProvider, null, createElement(properties, {
      project,
      selectedItem: null,
      onUpdateItem: () => undefined,
      onRemoveItem: () => undefined,
      onToggleReplaceable: () => undefined,
      onSetProjectTitle: () => undefined,
      onSetProjectDescription: () => undefined,
      onOpenSubmissionModal: () => undefined,
      onClose: () => undefined,
    }))
  );
  assert.doesNotMatch(propertiesMarkup, /Gửi mẫu|Xuất bản mẫu|Lưu bản nháp|Thông Tin Mẫu/);
});

test("has no active create-template navigation or submission modal wiring", () => {
  const activeSources = [
    "src/pages/VideoStudioPage.tsx",
    "src/components/content-studio/video-templates/VideoTemplateLibrary.tsx",
    "src/components/content-studio/video-templates/VideoTemplateCard.tsx",
    "src/components/template-editor/TemplateEditorWorkspace.tsx",
  ].map((path) => readFileSync(path, "utf8")).join("\n");

  assert.doesNotMatch(
    activeSources,
    /onCreateTemplate|mode:\s*['"]create-template['"]|TemplateSubmissionModal|onOpenSubmission/
  );
});

test("does not render personal-template authoring copy or the mine badge", () => {
  const markup = renderToStaticMarkup(createElement(VideoTemplateCard, {
    template: {
      id: "template-1",
      title: "System template",
      description: "Description",
      thumbnailUrl: "https://cdn.example.com/template.jpg",
      duration: 15,
      aspectRatio: "9:16",
      category: { id: "sales", name: "Sales" },
      tags: [],
      usageCount: 10,
      isFavorite: false,
      ownerType: "system",
      canEdit: false,
      badges: ["mine"],
    },
    onClick: () => undefined,
  }));

  assert.doesNotMatch(markup, /Mẫu của tôi/);
  assert.doesNotMatch(
    readFileSync("src/components/content-studio/video-templates/VideoTemplateCard.tsx", "utf8"),
    /badges\?\.includes\(['"]mine['"]\)|Mẫu của tôi/
  );
});
