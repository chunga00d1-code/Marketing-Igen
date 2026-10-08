import jwt from "jsonwebtoken";
import { CompanyModel } from "../model/company.model";
import { SocialIntegrationModel } from "../model/social-integration.model";
import { cloudinaryService } from "./cloudinary.service";
import { openrouterChat } from "./openrouter.service";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CATALOG_FILES = 300;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export interface CakeCatalogImage {
  id: string;
  name: string;
  imageUrl: string;
  driveUrl: string;
}

export interface CakeCatalogCategory {
  id: string;
  name: string;
  images: CakeCatalogImage[];
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
}

const cache = new Map<string, { expiresAt: number; categories: CakeCatalogCategory[] }>();
const publicImageCache = new Map<string, { expiresAt: number; url: string }>();
let cachedToken: { value: string; expiresAt: number } | null = null;

function credentials() {
  const projectId = String(process.env.GOOGLE_SHEETS_PROJECT_ID || "").trim();
  const email = String(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(process.env.GOOGLE_SHEETS_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!projectId || !email || !privateKey) {
    throw new Error("Google Service Account chưa được cấu hình đầy đủ trên máy chủ.");
  }
  return { projectId, email, privateKey };
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const { email, privateKey } = credentials();
  const assertion = jwt.sign({ scope: DRIVE_SCOPE }, privateKey, {
    algorithm: "RS256",
    issuer: email,
    audience: TOKEN_URL,
    expiresIn: "1h",
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Không thể xác thực Google Drive.");
  cachedToken = { value: result.access_token, expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

export function parseGoogleDriveFolderId(value: string) {
  const input = String(value || "").trim();
  if (/^[\w-]{10,}$/.test(input)) return input;
  try {
    const url = new URL(input);
    if (url.hostname !== "drive.google.com") throw new Error();
    const id = url.pathname.match(/\/folders\/([\w-]+)/)?.[1] || url.searchParams.get("id");
    if (id && /^[\w-]{10,}$/.test(id)) return id;
  } catch {
    // Fall through to the common validation message.
  }
  throw new Error("Link thư mục Google Drive không hợp lệ.");
}

async function listChildren(folderId: string) {
  const token = await accessToken();
  const { projectId } = credentials();
  const files: DriveFile[] = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      q: `'${folderId.replace(/'/g, "\\'")}' in parents and trashed = false`,
      fields: "nextPageToken,files(id,name,mimeType)",
      pageSize: "1000",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
      ...(pageToken ? { pageToken } : {}),
    });
    const response = await fetch(`${DRIVE_API}/files?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Goog-User-Project": projectId },
    });
    const result = await response.json() as { files?: DriveFile[]; nextPageToken?: string; error?: { message?: string } };
    if (!response.ok) throw new Error(result.error?.message || `Google Drive trả về lỗi ${response.status}.`);
    files.push(...(result.files || []));
    pageToken = result.nextPageToken || "";
  } while (pageToken && files.length < MAX_CATALOG_FILES);
  return files.slice(0, MAX_CATALOG_FILES);
}

async function downloadDriveImage(fileId: string) {
  const token = await accessToken();
  const { projectId } = credentials();
  const response = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}`, "X-Goog-User-Project": projectId },
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Không thể tải ảnh từ Google Drive (${response.status}): ${detail.slice(0, 300)}`);
  }
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_IMAGE_BYTES) throw new Error("Ảnh mẫu trên Google Drive vượt quá giới hạn 15 MB.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) throw new Error("Ảnh mẫu trên Google Drive không có dữ liệu.");
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error("Ảnh mẫu trên Google Drive vượt quá giới hạn 15 MB.");
  return buffer;
}

async function publicImageUrl(companyCode: string, image: CakeCatalogImage) {
  const cacheKey = `${companyCode}:${image.id}`;
  const cached = publicImageCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const safeCompany = companyCode.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80) || "company";
  const safeImageId = image.id.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 120);
  const url = await cloudinaryService.uploadMediaBuffer(
    await downloadDriveImage(image.id),
    `messenger_cake_catalog/${safeCompany}`,
    safeImageId,
  );
  publicImageCache.set(cacheKey, { url, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
  return url;
}

function toImage(file: DriveFile): CakeCatalogImage {
  return {
    id: file.id,
    name: file.name,
    imageUrl: `https://drive.google.com/thumbnail?id=${encodeURIComponent(file.id)}&sz=w1600`,
    driveUrl: `https://drive.google.com/file/d/${encodeURIComponent(file.id)}/view`,
  };
}

function isImage(file: DriveFile) {
  return file.mimeType.startsWith("image/") || /\.(jpe?g|png|webp|gif)$/i.test(file.name);
}

async function collectImages(folderId: string, depth = 0): Promise<CakeCatalogImage[]> {
  const children = await listChildren(folderId);
  const images = children.filter(isImage).map(toImage);
  if (depth >= 2 || images.length >= MAX_CATALOG_FILES) return images.slice(0, MAX_CATALOG_FILES);
  for (const folder of children.filter((file) => file.mimeType === FOLDER_MIME)) {
    images.push(...await collectImages(folder.id, depth + 1));
    if (images.length >= MAX_CATALOG_FILES) break;
  }
  return images.slice(0, MAX_CATALOG_FILES);
}

async function scan(rootFolderUrl: string) {
  const rootId = parseGoogleDriveFolderId(rootFolderUrl);
  const children = await listChildren(rootId);
  const folders = children.filter((file) => file.mimeType === FOLDER_MIME);
  const categories: CakeCatalogCategory[] = [];
  for (const folder of folders) {
    const images = await collectImages(folder.id);
    if (images.length) categories.push({ id: folder.id, name: folder.name, images });
  }
  const rootImages = children.filter(isImage).map(toImage);
  if (rootImages.length) categories.unshift({ id: rootId, name: "Mẫu bánh", images: rootImages });
  return categories;
}

export function normalizeCatalogText(value: string) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function findMatchingCategory(categories: CakeCatalogCategory[], customerText: string) {
  const text = normalizeCatalogText(customerText);
  if (!text) return null;
  const genericWords = new Set(["banh", "mau", "anh", "hinh"]);
  const textWords = new Set(text.split(" ").filter((word) => word.length >= 2));
  return categories.map((category) => {
    const fullKey = normalizeCatalogText(category.name);
    const specificKey = fullKey.split(" ").filter((word) => !genericWords.has(word)).join(" ");
    const matchedKey = [fullKey, specificKey]
      .filter((key) => key.length >= 3)
      .find((key) => text.includes(key)) || "";
    const specificWords = specificKey.split(" ").filter((word) => word.length >= 2);
    const overlap = specificWords.filter((word) => textWords.has(word)).length;
    const overlapScore = specificWords.length ? overlap / specificWords.length : 0;
    return { category, matchedKey, overlap, overlapScore };
  })
    .filter(({ matchedKey, overlap, overlapScore }) => matchedKey || (overlap >= 1 && overlapScore >= 0.5))
    .sort((a, b) => b.matchedKey.length - a.matchedKey.length || b.overlapScore - a.overlapScore)[0]?.category || null;
}

function mayRequestCakeImages(customerText: string) {
  const text = normalizeCatalogText(customerText);
  return ["banh", "mau", "anh", "hinh", "xem", "tham khao", "goi y", "kieu"].some((word) => text.includes(word));
}

function requestsVisualExamples(customerText: string) {
  const text = normalizeCatalogText(customerText);
  return ["mau", "anh", "hinh", "xem", "tham khao", "goi y", "kieu"].some((word) => text.includes(word));
}

export function isGenericVisualRequest(customerText: string) {
  if (!requestsVisualExamples(customerText)) return false;
  const ignoredWords = new Set([
    "cho", "toi", "minh", "em", "anh", "chi", "xem", "cac", "hinh", "ve", "mau", "banh",
    "tham", "khao", "goi", "y", "kieu", "shop", "co", "khong", "duoc", "nao", "voi", "a",
  ]);
  return normalizeCatalogText(customerText).split(" ").filter((word) => word && !ignoredWords.has(word)).length === 0;
}

export function buildCatalogOverview(categories: CakeCatalogCategory[], limit: number) {
  const images: CakeCatalogImage[] = [];
  const maxCategorySize = Math.max(0, ...categories.map((category) => category.images.length));
  for (let imageIndex = 0; imageIndex < maxCategorySize && images.length < limit; imageIndex += 1) {
    for (const category of categories) {
      const image = category.images[imageIndex];
      if (image) images.push(image);
      if (images.length >= limit) break;
    }
  }
  return images;
}

async function selectCategoryWithAi(categories: CakeCatalogCategory[], customerText: string, model: string) {
  if (!mayRequestCakeImages(customerText) || !categories.length) return null;
  try {
    const response = await openrouterChat({
      model,
      temperature: 0,
      maxTokens: 120,
      timeoutMs: 12_000,
      maxRetries: 1,
      jsonMode: true,
      strictJsonSchema: true,
      responseSchema: { categoryIndex: -1 },
      messages: [
        {
          role: "system",
          content: "Chọn loại bánh phù hợp nhất với yêu cầu khách. Trả categoryIndex theo danh sách, hoặc -1 nếu chưa đủ thông tin. Không tự bịa loại bánh.",
        },
        {
          role: "user",
          content: `Yêu cầu khách: ${customerText}\nDanh sách: ${categories.map((category, index) => `${index}: ${category.name}`).join("\n")}`,
        },
      ],
    });
    const index = Number((JSON.parse(response.text) as { categoryIndex?: number }).categoryIndex);
    return Number.isInteger(index) && index >= 0 && index < categories.length ? categories[index] : null;
  } catch (error) {
    console.warn("[CakeCatalog] AI không chọn được loại bánh:", error instanceof Error ? error.message : error);
    return null;
  }
}

async function companyRecord(companyCode: string) {
  const company = await CompanyModel.findOne({ code: String(companyCode || "").trim().toUpperCase() });
  if (!company) throw new Error("Không tìm thấy doanh nghiệp.");
  return company;
}

export const companyCakeCatalogService = {
  async getConfig(companyCode: string) {
    const company = await companyRecord(companyCode);
    const config = company.cakeCatalogConfig;
    return {
      companyCode: company.code,
      companyName: company.name,
      enabled: Boolean(config?.enabled),
      rootFolderUrl: String(config?.rootFolderUrl || ""),
      maxImagesPerReply: Number(config?.maxImagesPerReply || 5),
      serviceAccountEmail: String(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL || "").trim(),
    };
  },

  async updateConfig(companyCode: string, input: { enabled?: boolean; rootFolderUrl?: string; maxImagesPerReply?: number }) {
    const company = await companyRecord(companyCode);
    const current = company.cakeCatalogConfig;
    const rootFolderUrl = String(input.rootFolderUrl ?? current?.rootFolderUrl ?? "").trim();
    if (rootFolderUrl) parseGoogleDriveFolderId(rootFolderUrl);
    const enabled = input.enabled ?? current?.enabled ?? false;
    if (enabled && !rootFolderUrl) throw new Error("Cần nhập link thư mục Google Drive trước khi bật thư viện ảnh bánh.");
    company.cakeCatalogConfig = {
      enabled,
      rootFolderUrl,
      maxImagesPerReply: Math.min(10, Math.max(1, Math.round(Number(input.maxImagesPerReply ?? current?.maxImagesPerReply ?? 5)))),
    };
    await company.save();
    cache.delete(company.code);
    return this.getConfig(company.code);
  },

  async scanCompany(companyCode: string, force = false) {
    const company = await companyRecord(companyCode);
    const config = company.cakeCatalogConfig;
    if (!config?.rootFolderUrl) throw new Error("Chưa cấu hình link thư mục Google Drive.");
    const cached = cache.get(company.code);
    if (!force && cached && cached.expiresAt > Date.now()) return cached.categories;
    const categories = await scan(config.rootFolderUrl);
    cache.set(company.code, { categories, expiresAt: Date.now() + CACHE_TTL_MS });
    return categories;
  },

  async testConfig(companyCode: string, rootFolderUrl?: string) {
    const company = await companyRecord(companyCode);
    const url = String(rootFolderUrl || company.cakeCatalogConfig?.rootFolderUrl || "").trim();
    if (!url) throw new Error("Chưa nhập link thư mục Google Drive.");
    const categories = await scan(url);
    return {
      categoryCount: categories.length,
      imageCount: categories.reduce((sum, category) => sum + category.images.length, 0),
      categories: categories.map((category) => ({ name: category.name, imageCount: category.images.length })),
    };
  },

  async findSuggestionsForPage(pageId: string, customerText: string) {
    const integration = await SocialIntegrationModel.findOne({ platform: "Facebook", username: pageId, isConnected: true }).lean();
    if (!integration?.companyCode) return null;
    const company = await CompanyModel.findOne({ code: integration.companyCode }).lean();
    const config = company?.cakeCatalogConfig;
    if (!config?.enabled || !config.rootFolderUrl) return null;
    const categories = await this.scanCompany(integration.companyCode);
    const imageLimit = Math.min(10, Math.max(1, Number(config.maxImagesPerReply || 5)));
    let category = findMatchingCategory(categories, customerText);
    if (!category && isGenericVisualRequest(customerText)) {
      category = {
        id: "catalog-overview",
        name: "Mẫu bánh tổng hợp",
        images: buildCatalogOverview(categories, imageLimit),
      };
    }
    category ||= await selectCategoryWithAi(
        categories,
        customerText,
        integration.aiAutoReplyConfig?.model || process.env.AI_REPLY_MESSAGE_MODEL || "deepseek-v4-flash-0731",
      );
    if (!category && requestsVisualExamples(customerText)) {
      category = {
        id: "catalog-overview",
        name: "Mẫu bánh tổng hợp",
        images: buildCatalogOverview(categories, imageLimit),
      };
    }
    if (!category) return null;
    const selectedImages = category.images.slice(0, imageLimit);
    const images = [];
    for (const image of selectedImages) {
      try {
        images.push({ ...image, imageUrl: await publicImageUrl(integration.companyCode, image) });
      } catch (error) {
        console.error(`[CakeCatalog] Không thể chuẩn bị ảnh ${image.id} để gửi Messenger:`, error);
      }
    }
    return {
      companyCode: integration.companyCode,
      categoryName: category.name,
      images,
    };
  },
};
