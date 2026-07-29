import type { CreativeImageCanvas, CreativeImageProjectData, CreativeImageTemplate } from "../creative-image/types";

export type CreativeProject = {
  _id: string;
  templateId: string;
  templateVersion: number;
  canvas: CreativeImageCanvas;
  data: CreativeImageProjectData;
  mode?: "template" | "ai_html";
  prompt?: string;
  html?: string;
  conversation?: Array<{
    role: "user" | "assistant";
    content: string;
    html?: string;
    attachments?: AiHtmlAttachment[];
    createdAt?: string;
  }>;
};

export type AiHtmlAttachment = {
  type: "image" | "document";
  name: string;
  url?: string;
  text?: string;
};

export type CreativeRender = {
  _id: string;
  projectId: string;
  status: "queued" | "rendering" | "completed" | "failed";
  outputUrl: string;
  error: string;
  createdAt: string;
};

function headers() {
  const token = localStorage.getItem("accessToken");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`/api/v1/creative-image${path}`, { ...init, headers: { ...headers(), ...(init?.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Không thể xử lý yêu cầu thiết kế.");
  return body.data as T;
}

let aiHtmlProjectsInFlight: Promise<CreativeProject[]> | null = null;
let aiHtmlProjectsCache: { expiresAt: number; items: CreativeProject[] } | null = null;

function invalidateAiHtmlProjectsCache() {
  aiHtmlProjectsCache = null;
}

function listAiHtmlProjects() {
  if (aiHtmlProjectsCache && aiHtmlProjectsCache.expiresAt > Date.now()) {
    return Promise.resolve(aiHtmlProjectsCache.items);
  }
  if (aiHtmlProjectsInFlight) return aiHtmlProjectsInFlight;
  aiHtmlProjectsInFlight = request<CreativeProject[]>("/ai-html/projects")
    .then((items) => {
      aiHtmlProjectsCache = { items, expiresAt: Date.now() + 30_000 };
      return items;
    })
    .finally(() => {
      aiHtmlProjectsInFlight = null;
    });
  return aiHtmlProjectsInFlight;
}

export const creativeImageApi = {
  listTemplates: () => request<CreativeImageTemplate[]>("/templates"),
  createProject: (input: { templateId: string; canvas: CreativeImageCanvas; data: CreativeImageProjectData }) => request<CreativeProject>("/projects", { method: "POST", body: JSON.stringify(input) }),
  createAiHtmlProject: (input: { canvas: CreativeImageCanvas; prompt: string; attachments?: AiHtmlAttachment[] }) => request<CreativeProject>("/ai-html/projects", { method: "POST", body: JSON.stringify(input) }).then((project) => {
    invalidateAiHtmlProjectsCache();
    return project;
  }),
  listAiHtmlProjects,
  sendAiHtmlMessage: (projectId: string, message: string, attachments?: AiHtmlAttachment[]) => request<CreativeProject>(`/ai-html/projects/${projectId}/messages`, { method: "POST", body: JSON.stringify({ message, attachments }) }).then((project) => {
    invalidateAiHtmlProjectsCache();
    return project;
  }),
  updateProject: (id: string, input: { templateId: string; canvas: CreativeImageCanvas; data: CreativeImageProjectData }) => request<CreativeProject>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  createRender: (projectId: string, idempotencyKey: string) => request<CreativeRender>(`/projects/${projectId}/renders`, { method: "POST", body: JSON.stringify({ idempotencyKey }) }),
  getRender: (id: string) => request<CreativeRender>(`/renders/${id}`),
  listRenders: () => request<CreativeRender[]>("/renders"),
};
