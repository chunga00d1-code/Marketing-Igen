import { getAccessToken } from "./authService";

export type KnowledgeChannelScope =
  | "facebook"
  | "zalo"
  | "tiktok"
  | "all";
export type KnowledgePurposeScope =
  | "sales"
  | "support"
  | "marketing"
  | "caption"
  | "all";
export type KnowledgePageScope = "all" | "selected";
export type KnowledgeDocumentType =
  | "company_profile"
  | "product"
  | "service"
  | "policy"
  | "pricing"
  | "promotion"
  | "faq"
  | "brand_guideline"
  | "general";

export type KnowledgeScopes = {
  channelScope: KnowledgeChannelScope[];
  purposeScope: KnowledgePurposeScope[];
  pageScope: KnowledgePageScope;
  pageIds: string[];
  documentType: KnowledgeDocumentType;
};

export type KnowledgeConflict = {
  id: string;
  type: "pricing" | "contact" | "policy" | "duplicate";
  severity: "warning" | "error";
  title: string;
  description: string;
  documentA: { id: string; title: string; documentType?: string };
  documentB: { id: string; title: string; documentType?: string };
  conflictingValues: { a: string; b: string };
};

export type CompanyKnowledgeHealth = {
  companyCode: string;
  mode: "trained" | "default";
  documentsCount: number;
  chunksCount: number;
  warnings: string[];
  conflicts?: KnowledgeConflict[];
  latestSyncAt?: string | null;
};

export type CompanyKnowledgeDocument = {
  id: string;
  title: string;
  sourceType: "manual" | "google_doc";
  sourceUrl?: string;
  status: "active" | "syncing" | "failed";
  version: number;
  channelScope: KnowledgeChannelScope[];
  purposeScope: KnowledgePurposeScope[];
  pageScope: KnowledgePageScope;
  pageIds: string[];
  documentType: KnowledgeDocumentType;
  chunksCount: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
};

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
      ...options?.headers,
    },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      result.message || "Không thể xử lý kho tri thức doanh nghiệp."
    );
  }
  return result as T;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(new Error("Không thể đọc tệp đã chọn."));
    reader.readAsDataURL(file);
  });
}

export const companyKnowledgeService = {
  health() {
    return requestJson<CompanyKnowledgeHealth>(
      "/api/v1/company-knowledge/health"
    );
  },

  async listDocuments() {
    const result = await requestJson<{
      companyCode: string;
      documents: CompanyKnowledgeDocument[];
    }>("/api/v1/company-knowledge/documents");
    return result.documents;
  },

  async upload(
    file: File,
    scopes: KnowledgeScopes
  ) {
    return requestJson<{
      status: "success";
      title: string;
      chunksCount: number;
    }>("/api/v1/company-knowledge/documents/upload", {
      method: "POST",
      body: JSON.stringify({
        fileName: file.name,
        fileBase64: await fileToBase64(file),
        mimeType: file.type || "application/octet-stream",
        ...scopes,
      }),
    });
  },

  syncDrive(
    docLink: string,
    scopes: KnowledgeScopes
  ) {
    return requestJson<{
      status: "success";
      title: string;
      documentsCount: number;
      chunksCount: number;
    }>("/api/v1/company-knowledge/sync-drive", {
      method: "POST",
      body: JSON.stringify({ docLink, ...scopes }),
    });
  },

  updateScopes(
    documentId: string,
    scopes: KnowledgeScopes
  ) {
    return requestJson(`/api/v1/company-knowledge/documents/${documentId}/scopes`, {
      method: "PATCH",
      body: JSON.stringify(scopes),
    });
  },

  deleteDocument(documentId: string) {
    return requestJson<{ status: "success"; message: string }>(
      `/api/v1/company-knowledge/documents/${documentId}`,
      { method: "DELETE" }
    );
  },

  getConflicts() {
    return requestJson<{ status: "success"; conflicts: KnowledgeConflict[] }>(
      "/api/v1/company-knowledge/conflicts"
    );
  },

  testSearch(query: string, options?: { channel?: string; topK?: number; pageId?: string }) {
    return requestJson<TestSearchResult>("/api/v1/company-knowledge/test-search", {
      method: "POST",
      body: JSON.stringify({ query, ...options }),
    });
  },
};

export interface TestSearchResult {
  status: "success" | "error";
  query: string;
  detectedDocumentTypes: string[];
  matches: number;
  bestScore: number;
  items: Array<{
    title: string;
    documentType: string;
    score: number;
    text: string;
    sourceUrl?: string;
  }>;
  simulatedAnswer: string;
}
