import jwt from "jsonwebtoken";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const ORDER_HEADERS = [
  "order_id", "created_at", "confirmed_at", "source_channel", "source_account",
  "conversation_id", "customer_name", "customer_phone", "delivery_address",
  "items_summary", "subtotal", "shipping_fee", "discount_amount", "total_amount",
  "payment_method", "payment_status", "order_status", "customer_note",
  "internal_note", "source_message_id", "fulfillment_method",
  "fulfillment_location", "requested_fulfillment_time",
];

export const ORDER_ITEM_HEADERS = [
  "order_id", "line_number", "product_code", "product_name", "variant_summary",
  "quantity", "unit_price", "line_total", "attributes_json",
];

export interface SheetOrderItem {
  productCode?: string;
  productName: string;
  variantSummary?: string;
  quantity: number;
  unitPrice?: number;
  lineTotal?: number;
  attributes?: Record<string, string>;
}

export interface SheetOrder {
  orderId: string;
  createdAt: Date;
  confirmedAt: Date;
  sourceAccount: string;
  conversationId: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: SheetOrderItem[];
  subtotal?: number;
  shippingFee?: number;
  discountAmount?: number;
  totalAmount?: number;
  paymentMethod?: string;
  fulfillmentMethod?: "pickup" | "delivery";
  fulfillmentLocation?: string;
  requestedFulfillmentTime?: string;
  paymentStatus?: string;
  orderStatus?: string;
  customerNote?: string;
  internalNote?: string;
  sourceMessageId: string;
}

let cachedToken: { value: string; expiresAt: number } | null = null;

function credentials() {
  const projectId = String(process.env.GOOGLE_SHEETS_PROJECT_ID || "").trim();
  const email = String(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(process.env.GOOGLE_SHEETS_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!projectId) {
    throw new Error("GOOGLE_SHEETS_PROJECT_ID chua duoc cau hinh tren server.");
  }
  if (!email || !privateKey) {
    throw new Error("Google Sheets Service Account chua duoc cau hinh tren server.");
  }
  return { projectId, email, privateKey };
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const { email, privateKey } = credentials();
  const assertion = jwt.sign({ scope: SHEETS_SCOPE }, privateKey, {
    algorithm: "RS256",
    issuer: email,
    audience: TOKEN_URL,
    expiresIn: "1h",
  });
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) {
    throw new Error(result.error_description || "Khong the xac thuc Google Sheets.");
  }
  cachedToken = {
    value: result.access_token,
    expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000,
  };
  return cachedToken.value;
}

async function sheetsFetch(path: string, init?: RequestInit) {
  const token = await accessToken();
  const { projectId } = credentials();
  const response = await fetch(`${SHEETS_API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
      "X-Goog-User-Project": projectId,
    },
  });
  const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(result.error?.message || `Google Sheets API tra ve loi ${response.status}.`);
  }
  return result as Record<string, unknown>;
}

function safeSheetName(value: string, fallback: string) {
  const name = String(value || fallback).trim().slice(0, 80);
  const invalidCharacters = ["\\", "/", "?", "*", "[", "]", ":"];
  if (!name || invalidCharacters.some((character) => name.includes(character))) throw new Error("Ten tab Google Sheet khong hop le.");
  return name;
}

function a1SheetName(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

function safeCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function parseGoogleSpreadsheetId(value: string) {
  const input = String(value || "").trim();
  const match = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;
  throw new Error("Link Google Sheet khong hop le.");
}

async function metadata(spreadsheetId: string) {
  return sheetsFetch(`${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties`);
}

async function ensureTabs(spreadsheetId: string, tabNames: string[]) {
  const info = await metadata(spreadsheetId) as {
    sheets?: Array<{ properties?: { title?: string } }>;
  };
  const existing = new Set((info.sheets || []).map((item) => item.properties?.title).filter(Boolean));
  const missing = tabNames.filter((name) => !existing.has(name));
  if (missing.length) {
    await sheetsFetch(`${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title } } })) }),
    });
  }
}

async function writeHeader(spreadsheetId: string, sheetName: string, headers: string[]) {
  const range = `${a1SheetName(sheetName)}!A1:${String.fromCharCode(64 + headers.length)}1`;
  await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ range, majorDimension: "ROWS", values: [headers] }),
  });
}

async function appendRows(spreadsheetId: string, sheetName: string, rows: unknown[][]) {
  if (!rows.length) return;
  const range = `${a1SheetName(sheetName)}!A:Z`;
  await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ majorDimension: "ROWS", values: rows.map((row) => row.map(safeCell)) }),
  });
}

export const googleOrderSheetService = {
  serviceAccountEmail() {
    return credentials().email;
  },

  async test(spreadsheetId: string) {
    const info = await metadata(spreadsheetId) as {
      properties?: { title?: string };
      sheets?: Array<{ properties?: { title?: string } }>;
    };
    return {
      title: info.properties?.title || "Google Sheet",
      sheetNames: (info.sheets || []).map((item) => item.properties?.title || "").filter(Boolean),
      serviceAccountEmail: credentials().email,
    };
  },

  async initializeTemplate(spreadsheetId: string, ordersName: string, itemsName: string) {
    const ordersSheetName = safeSheetName(ordersName, "Orders");
    const itemsSheetName = safeSheetName(itemsName, "OrderItems");
    await ensureTabs(spreadsheetId, [ordersSheetName, itemsSheetName]);
    await Promise.all([
      writeHeader(spreadsheetId, ordersSheetName, ORDER_HEADERS),
      writeHeader(spreadsheetId, itemsSheetName, ORDER_ITEM_HEADERS),
    ]);
  },

  async appendOrder(spreadsheetId: string, ordersName: string, itemsName: string, order: SheetOrder) {
    const ordersSheetName = safeSheetName(ordersName, "Orders");
    const itemsSheetName = safeSheetName(itemsName, "OrderItems");
    await this.initializeTemplate(spreadsheetId, ordersSheetName, itemsSheetName);

    const lookupRange = `${a1SheetName(ordersSheetName)}!A:A`;
    const existing = await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(lookupRange)}`) as { values?: unknown[][] };
    if ((existing.values || []).some((row) => String(row?.[0] || "") === order.orderId)) {
      return { duplicate: true };
    }

    const itemSummary = order.items.map((item) => `${item.productName}${item.variantSummary ? ` (${item.variantSummary})` : ""} x${item.quantity}`).join("; ");
    await appendRows(spreadsheetId, ordersSheetName, [[
      order.orderId, order.createdAt.toISOString(), order.confirmedAt.toISOString(), "facebook_messenger",
      order.sourceAccount, order.conversationId, order.customerName, order.customerPhone,
      order.deliveryAddress, itemSummary, order.subtotal, order.shippingFee, order.discountAmount,
      order.totalAmount, order.paymentMethod, order.paymentStatus || "unpaid", order.orderStatus || "new",
      order.customerNote, order.internalNote, order.sourceMessageId, order.fulfillmentMethod,
      order.fulfillmentLocation, order.requestedFulfillmentTime,
    ]]);
    await appendRows(spreadsheetId, itemsSheetName, order.items.map((item, index) => [
      order.orderId, index + 1, item.productCode, item.productName, item.variantSummary,
      item.quantity, item.unitPrice, item.lineTotal,
      Object.keys(item.attributes || {}).length ? JSON.stringify(item.attributes) : "",
    ]));
    return { duplicate: false };
  },
};
