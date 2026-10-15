import jwt from "jsonwebtoken";

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export const ORDER_HEADERS = [
  "Tên khách", "SĐT", "Sản phẩm", "Size", "Thời gian nhận hàng", "Số tiền",
  "Địa điểm nhận hàng", "Yêu cầu đặt cọc", "Số tiền đặt cọc",
  "Link biên lai thanh toán", "Link ảnh sản phẩm khách chọn", "Còn lại trả tại quán",
];
const ORDER_STATUS_HEADER = "Trạng thái đơn hàng";

// The order ID is kept in a hidden column so retries and later updates find the same row.
const ORDER_ID_COLUMN = "M";

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
  depositPercent?: number;
  remainingBalance?: number;
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
  depositRequired?: boolean;
  depositAmount?: number;
  depositStatus?: "not_required" | "awaiting_receipt" | "receipt_received" | "verified";
  receiptUrl?: string;
  receiptReceivedAt?: Date;
  paymentCode?: string;
  sepayTransactionId?: string;
  sepayTransferAmount?: number;
  sepayVerifiedAt?: Date;
  selectedProductImageUrl?: string;
  selectedProductSelectedAt?: Date;
  selectedProductCategory?: string;
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
    signal: AbortSignal.timeout(30_000),
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
    signal: AbortSignal.timeout(30_000),
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

function columnLetters(columnNumber: number) {
  let value = columnNumber;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function safeCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return value;
  const text = String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function itemSize(item: SheetOrderItem) {
  const size = Object.entries(item.attributes || {}).find(([key]) => /^(size|cỡ|kích thước)$/i.test(key.trim()))?.[1];
  return String(size || item.variantSummary?.match(/\b\d+(?:[.,]\d+)?\s*(?:cm|mm|inch)\b/i)?.[0] || "").trim();
}

function depositStatusLabel(status: SheetOrder["depositStatus"]) {
  if (status === "verified") return "Đã xác nhận qua SePay";
  if (status === "receipt_received") return "Đã nhận biên lai - chờ đối soát";
  if (status === "awaiting_receipt") return "Chờ khách gửi biên lai";
  return "Không yêu cầu";
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
    sheets?: Array<{ properties?: { title?: string; sheetId?: number; gridProperties?: { columnCount?: number } } }>;
  };
  const existing = new Set((info.sheets || []).map((item) => item.properties?.title).filter(Boolean));
  const missing = tabNames.filter((name) => !existing.has(name));
  const resize = (info.sheets || []).filter(sheet => tabNames.includes(sheet.properties?.title || "")
    && sheet.properties?.sheetId !== undefined && (sheet.properties?.gridProperties?.columnCount || 0) < ORDER_HEADERS.length + 2)
    .map(sheet => ({ updateSheetProperties: { properties: { sheetId: sheet.properties!.sheetId,
      gridProperties: { columnCount: ORDER_HEADERS.length + 2 } }, fields: "gridProperties.columnCount" } }));
  if (missing.length || resize.length) {
    await sheetsFetch(`${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests: [...missing.map((title) => ({ addSheet: { properties: { title,
        gridProperties: { columnCount: ORDER_HEADERS.length + 2 } } } })), ...resize] }),
    });
  }
}

async function ordersTab(spreadsheetId: string, configuredName: string) {
  const name = safeSheetName(configuredName, "Orders");
  const info = await metadata(spreadsheetId) as { sheets?: Array<{ properties?: { title?: string } }> };
  if (!(info.sheets || []).some(sheet => sheet.properties?.title === name)) return name;
  const range = `${a1SheetName(name)}!A1:L1`;
  const result = await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`) as { values?: unknown[][] };
  const header = result.values?.[0] || [];
  if (!header.length || ORDER_HEADERS.every((value, index) => header[index] === value)) return name;
  // Preserve existing rows in a tab built with the former, wider template.
  const compactName = safeSheetName(`${name.slice(0, 62)} - 12 cột`, "Orders - 12 cột");
  if ((info.sheets || []).some(sheet => sheet.properties?.title === compactName)) {
    const compactRange = `${a1SheetName(compactName)}!A1:L1`;
    const compact = await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(compactRange)}`) as { values?: unknown[][] };
    const compactHeader = compact.values?.[0] || [];
    if (compactHeader.length && !ORDER_HEADERS.every((value, index) => compactHeader[index] === value)) {
      throw new Error(`Tab ${compactName} đã có dữ liệu với mẫu cột khác.`);
    }
  }
  return compactName;
}

async function findOrderRow(spreadsheetId: string, configuredName: string, orderId: string, errorMessage: string) {
  const ordersSheetName = await ordersTab(spreadsheetId, configuredName);
  const originalName = safeSheetName(configuredName, "Orders");
  for (const [sheetName, column, legacy] of [[ordersSheetName, ORDER_ID_COLUMN, false], [originalName, "A", true]] as const) {
    if (legacy && sheetName === ordersSheetName) continue;
    const range = `${a1SheetName(sheetName)}!${column}:${column}`;
    const result = await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`) as { values?: unknown[][] };
    const rowIndex = (result.values || []).findIndex(row => String(row?.[0] || "") === orderId);
    if (rowIndex >= 1) return { sheetName, rowNumber: rowIndex + 1, legacy };
  }
  throw new Error(errorMessage);
}

async function hideOrderIdColumn(spreadsheetId: string, sheetName: string) {
  const info = await metadata(spreadsheetId) as { sheets?: Array<{ properties?: { title?: string; sheetId?: number } }> };
  const sheetId = info.sheets?.find(sheet => sheet.properties?.title === sheetName)?.properties?.sheetId;
  if (sheetId === undefined) throw new Error(`Không tìm thấy tab ${sheetName}.`);
  await sheetsFetch(`${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ updateDimensionProperties: {
      range: { sheetId, dimension: "COLUMNS", startIndex: ORDER_HEADERS.length, endIndex: ORDER_HEADERS.length + 1 },
      properties: { hiddenByUser: true }, fields: "hiddenByUser",
    } }] }),
  });
}

function legacySize(value: unknown) {
  const text = String(value || "");
  return text.match(/(?:size|cỡ|kích thước)\s*[:=-]?\s*([A-Z0-9]+(?:[.,]\d+)?(?:\s*(?:cm|mm|inch))?)/i)?.[1]
    || text.match(/\b\d+(?:[.,]\d+)?\s*(?:cm|mm|inch)\b/i)?.[0]
    || "";
}

async function migrateLegacyOrders(spreadsheetId: string, originalName: string, compactName: string, itemsName: string) {
  if (originalName === compactName) return;
  const info = await metadata(spreadsheetId) as { sheets?: Array<{ properties?: { title?: string; sheetId?: number; hidden?: boolean } }> };
  const original = info.sheets?.find(sheet => sheet.properties?.title === originalName)?.properties;
  if (!original || original.hidden) return;
  const oldRange = `${a1SheetName(originalName)}!A1:AK`;
  const oldResult = await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(oldRange)}`) as { values?: unknown[][] };
  const oldRows = oldResult.values || [];
  if (oldRows[0]?.[0] !== "Mã đơn hàng" || oldRows[0]?.[6] !== "Tên khách hàng" || oldRows[0]?.[13] !== "Tổng thanh toán") {
    throw new Error(`Không thể tự chuyển dữ liệu tab ${originalName}: tiêu đề cột cũ không khớp mẫu đơn hàng.`);
  }

  const itemSizes = new Map<string, string[]>();
  const itemTab = info.sheets?.find(sheet => sheet.properties?.title === itemsName)?.properties;
  if (itemTab) {
    const itemRange = `${a1SheetName(itemsName)}!A1:I`;
    const itemResult = await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(itemRange)}`) as { values?: unknown[][] };
    for (const row of (itemResult.values || []).slice(1)) {
      const orderId = String(row[0] || "");
      let size = "";
      try {
        const attributes = JSON.parse(String(row[8] || "{}")) as Record<string, unknown>;
        size = String(Object.entries(attributes).find(([key]) => /^(size|cỡ|kích thước)$/i.test(key.trim()))?.[1] || "");
      } catch { /* Keep the variant text as a fallback. */ }
      size ||= legacySize(row[4]);
      if (orderId && size) itemSizes.set(orderId, [...(itemSizes.get(orderId) || []), size]);
    }
  }

  const idRange = `${a1SheetName(compactName)}!${ORDER_ID_COLUMN}:${ORDER_ID_COLUMN}`;
  const existing = await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(idRange)}`) as { values?: unknown[][] };
  const written = new Set((existing.values || []).map(row => String(row?.[0] || "")));
  const migrated = oldRows.slice(1).flatMap((row, index) => {
    if (!row.some(value => value !== null && value !== undefined && String(value).trim())) return [];
    const orderId = String(row[0] || `legacy-row-${index + 2}`);
    if (written.has(orderId)) return [];
    written.add(orderId);
    return [[
      row[6], row[7], row[9], (itemSizes.get(orderId) || []).join("; ") || legacySize(row[9]),
      row[22], row[13], row[21] || row[8], row[23], row[24], row[26], row[32], row[36], orderId,
    ]];
  });
  for (let index = 0; index < migrated.length; index += 100) {
    await appendRows(spreadsheetId, compactName, migrated.slice(index, index + 100));
  }
  const hideRequests = [original, itemTab].filter((sheet): sheet is { title?: string; sheetId: number; hidden?: boolean } =>
    sheet?.sheetId !== undefined && !sheet.hidden).map(sheet => ({ updateSheetProperties: {
      properties: { sheetId: sheet.sheetId, hidden: true }, fields: "hidden",
    } }));
  if (hideRequests.length) await sheetsFetch(`${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST", body: JSON.stringify({ requests: hideRequests }),
  });
}

async function writeHeader(spreadsheetId: string, sheetName: string, headers: string[]) {
  const range = `${a1SheetName(sheetName)}!A1:${columnLetters(headers.length)}1`;
  await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ range, majorDimension: "ROWS", values: [headers] }),
  });
}

async function ensureOrderStatusColumn(spreadsheetId: string, sheetName: string) {
  const headerRange = `${a1SheetName(sheetName)}!1:1`;
  const headerResult = await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(headerRange)}`) as { values?: unknown[][] };
  const headers = headerResult.values?.[0] || [];
  let columnIndex = headers.findIndex((value, index) => index > ORDER_HEADERS.length
    && String(value || "").trim() === ORDER_STATUS_HEADER);
  if (columnIndex >= 0) return columnIndex;

  columnIndex = headers.findIndex((value, index) => index > ORDER_HEADERS.length && !String(value || "").trim());
  if (columnIndex < 0) columnIndex = Math.max(headers.length, ORDER_HEADERS.length + 1);
  const column = columnLetters(columnIndex + 1);
  const range = `${a1SheetName(sheetName)}!${column}1:${column}1`;
  await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: "PUT",
    body: JSON.stringify({ range, majorDimension: "ROWS", values: [[ORDER_STATUS_HEADER]] }),
  });
  return columnIndex;
}

async function appendRows(spreadsheetId: string, sheetName: string, rows: unknown[][]) {
  if (!rows.length) return;
  const width = Math.max(...rows.map((row) => row.length), 1);
  const range = `${a1SheetName(sheetName)}!A:${columnLetters(width)}`;
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

  async initializeTemplate(spreadsheetId: string, ordersName: string, _itemsName: string) {
    const ordersSheetName = await ordersTab(spreadsheetId, ordersName);
    await ensureTabs(spreadsheetId, [ordersSheetName]);
    await writeHeader(spreadsheetId, ordersSheetName, [...ORDER_HEADERS, "Mã đơn hàng"]);
    await ensureOrderStatusColumn(spreadsheetId, ordersSheetName);
    await hideOrderIdColumn(spreadsheetId, ordersSheetName);
    await migrateLegacyOrders(spreadsheetId, safeSheetName(ordersName, "Orders"), ordersSheetName,
      safeSheetName(_itemsName, "OrderItems"));
    return ordersSheetName;
  },

  async appendOrder(spreadsheetId: string, ordersName: string, itemsName: string, order: SheetOrder) {
    const ordersSheetName = await this.initializeTemplate(spreadsheetId, ordersName, itemsName);
    const lookupRange = `${a1SheetName(ordersSheetName)}!${ORDER_ID_COLUMN}:${ORDER_ID_COLUMN}`;
    const existing = await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(lookupRange)}`) as { values?: unknown[][] };
    const duplicate = (existing.values || []).some((row) => String(row?.[0] || "") === order.orderId);

    const itemSummary = order.items.map((item) => `${item.productName} x${item.quantity}`).join("; ");
    const sizeSummary = order.items.map(itemSize).filter(Boolean).join("; ");
    const row: unknown[] = [
      order.customerName, order.customerPhone, itemSummary, sizeSummary,
      order.requestedFulfillmentTime, order.totalAmount,
      order.fulfillmentLocation || order.deliveryAddress, order.depositRequired ? "Có" : "Không",
      order.depositAmount, order.receiptUrl, order.selectedProductImageUrl,
      order.remainingBalance, order.orderId,
    ];
    const statusColumnIndex = await ensureOrderStatusColumn(spreadsheetId, ordersSheetName);
    while (row.length <= statusColumnIndex) row.push("");
    row[statusColumnIndex] = order.orderStatus || "";
    if (!duplicate) await appendRows(spreadsheetId, ordersSheetName, [row]);
    return { duplicate };
  },

  async getOrderStatus(spreadsheetId: string, ordersName: string, orderId: string) {
    const { sheetName, rowNumber } = await findOrderRow(spreadsheetId, ordersName, orderId,
      "Không tìm thấy đơn hàng trong Google Sheet để tra cứu trạng thái.");
    const statusColumnIndex = await ensureOrderStatusColumn(spreadsheetId, sheetName);
    const column = columnLetters(statusColumnIndex + 1);
    const statusRange = `${a1SheetName(sheetName)}!${column}${rowNumber}:${column}${rowNumber}`;
    const statusResult = await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(statusRange)}`) as { values?: unknown[][] };
    const status = [...String(statusResult.values?.[0]?.[0] || "")]
      .map(character => {
        const codePoint = character.codePointAt(0) || 0;
        return codePoint <= 0x1f || codePoint === 0x7f ? " " : character;
      })
      .join("").trim().slice(0, 500);
    return { status, hasStatusColumn: true };
  },

  async updatePaymentReceipt(
    spreadsheetId: string,
    ordersName: string,
    orderId: string,
    receipt: { depositAmount?: number; receiptUrl: string; receiptReceivedAt: Date },
  ) {
    const { sheetName, rowNumber, legacy } = await findOrderRow(spreadsheetId, ordersName, orderId,
      "Không tìm thấy đơn hàng trong Google Sheet để cập nhật biên lai.");
    const receiptRange = legacy
      ? `${a1SheetName(sheetName)}!X${rowNumber}:AB${rowNumber}`
      : `${a1SheetName(sheetName)}!H${rowNumber}:J${rowNumber}`;
    const values = legacy
      ? [["Có", receipt.depositAmount ?? "", depositStatusLabel("receipt_received"), safeCell(receipt.receiptUrl), receipt.receiptReceivedAt.toISOString()]]
      : [["Có", receipt.depositAmount ?? "", safeCell(receipt.receiptUrl)]];
    await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(receiptRange)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ range: receiptRange, majorDimension: "ROWS", values }),
    });
    if (legacy) {
      const paymentRange = `${a1SheetName(sheetName)}!P${rowNumber}:P${rowNumber}`;
      await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(paymentRange)}?valueInputOption=RAW`, {
        method: "PUT",
        body: JSON.stringify({ range: paymentRange, majorDimension: "ROWS", values: [["Đã nhận biên lai - chờ đối soát"]] }),
      });
    }
  },

  async updateSepayPayment(
    spreadsheetId: string,
    ordersName: string,
    orderId: string,
    payment: { transactionId: string; transferAmount: number; verifiedAt: Date },
  ) {
    const { sheetName, rowNumber, legacy } = await findOrderRow(spreadsheetId, ordersName, orderId,
      "Không tìm thấy đơn hàng trong Google Sheet để xác nhận SePay.");
    if (legacy) {
      const values = [
        { range: `${a1SheetName(sheetName)}!P${rowNumber}:P${rowNumber}`, values: [["Đã thanh toán cọc"]] },
        { range: `${a1SheetName(sheetName)}!Z${rowNumber}:Z${rowNumber}`, values: [[depositStatusLabel("verified")]] },
        { range: `${a1SheetName(sheetName)}!AD${rowNumber}:AF${rowNumber}`,
          values: [[payment.transactionId, payment.transferAmount, payment.verifiedAt.toISOString()]] },
      ];
      await Promise.all(values.map(({ range, values: rowValues }) => sheetsFetch(
        `${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
        { method: "PUT", body: JSON.stringify({ range, majorDimension: "ROWS", values: rowValues }) },
      )));
      return;
    }
    const amountRange = `${a1SheetName(sheetName)}!I${rowNumber}:I${rowNumber}`;
    await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(amountRange)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ range: amountRange, majorDimension: "ROWS", values: [[payment.transferAmount]] }),
    });
  },

  async updateProductSelection(
    spreadsheetId: string,
    ordersName: string,
    orderId: string,
    selection: { imageUrl: string; selectedAt: Date; categoryName: string },
  ) {
    const { sheetName, rowNumber, legacy } = await findOrderRow(spreadsheetId, ordersName, orderId,
      "Không tìm thấy đơn hàng trong Google Sheet để cập nhật ảnh sản phẩm.");
    const range = legacy
      ? `${a1SheetName(sheetName)}!AG${rowNumber}:AI${rowNumber}`
      : `${a1SheetName(sheetName)}!K${rowNumber}:K${rowNumber}`;
    const values = legacy
      ? [[safeCell(selection.imageUrl), selection.selectedAt.toISOString(), safeCell(selection.categoryName)]]
      : [[safeCell(selection.imageUrl)]];
    await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: "PUT",
      body: JSON.stringify({ range, majorDimension: "ROWS", values }),
    });
  },
};
