import type { CreativeImageCanvas, CreativeImageProjectData, CreativeImageTemplate } from "../creative-image/types";

export type CreativeProject = {
  _id: string;
  templateId: string;
  templateVersion: number;
  canvas: CreativeImageCanvas;
  data: CreativeImageProjectData;
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

export const creativeImageApi = {
  listTemplates: () => request<CreativeImageTemplate[]>("/templates"),
  createProject: (input: { templateId: string; canvas: CreativeImageCanvas; data: CreativeImageProjectData }) => request<CreativeProject>("/projects", { method: "POST", body: JSON.stringify(input) }),
  updateProject: (id: string, input: { templateId: string; canvas: CreativeImageCanvas; data: CreativeImageProjectData }) => request<CreativeProject>(`/projects/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
  createRender: (projectId: string, idempotencyKey: string) => request<CreativeRender>(`/projects/${projectId}/renders`, { method: "POST", body: JSON.stringify({ idempotencyKey }) }),
  getRender: (id: string) => request<CreativeRender>(`/renders/${id}`),
  listRenders: () => request<CreativeRender[]>("/renders"),
};
