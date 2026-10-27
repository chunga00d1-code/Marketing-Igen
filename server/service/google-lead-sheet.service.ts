import jwt from "jsonwebtoken";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
export const LEAD_HEADERS = ["Tên khách hàng", "Số điện thoại", "Tóm tắt hội thoại", "Mã cuộc hội thoại"];

let cachedToken: { value: string; expiresAt: number } | null = null;

function credentials() {
  const projectId = String(process.env.GOOGLE_SHEETS_PROJECT_ID || "").trim();
  const email = String(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL || "").trim();
  const privateKey = String(process.env.GOOGLE_SHEETS_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  if (!projectId || !email || !privateKey) throw new Error("Google Sheets Service Account chưa được cấu hình trên server.");
  return { projectId, email, privateKey };
}

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const { email, privateKey } = credentials();
  const assertion = jwt.sign({ scope: "https://www.googleapis.com/auth/spreadsheets" }, privateKey, {
    algorithm: "RS256", issuer: email, audience: TOKEN_URL, expiresIn: "1h",
  });
  const response = await fetch(TOKEN_URL, {
    method: "POST", signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const result = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !result.access_token) throw new Error(result.error_description || "Không thể xác thực Google Sheets.");
  cachedToken = { value: result.access_token, expiresAt: Date.now() + Number(result.expires_in || 3600) * 1000 };
  return cachedToken.value;
}

async function sheetsFetch(path: string, init?: RequestInit) {
  const token = await accessToken();
  const response = await fetch(`${SHEETS_API}/${path}`, {
    signal: AbortSignal.timeout(30_000), ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      "X-Goog-User-Project": credentials().projectId, ...(init?.headers || {}) },
  });
  const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message || `Google Sheets API trả về lỗi ${response.status}.`);
  return result as Record<string, unknown>;
}

export function parseLeadSpreadsheetId(value: string) {
  const input = String(value || "").trim();
  const match = input.match(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)(?:\/|$)/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(input)) return input;
  throw new Error("Link Google Sheet không hợp lệ.");
}

export function validateLeadSheetName(value: string) {
  const name = String(value || "Leads").trim();
  if (!name || name.length > 80 || ["\\", "/", "?", "*", "[", "]", ":"].some(character => name.includes(character))) {
    throw new Error("Tên tab Google Sheet không hợp lệ.");
  }
  return name;
}

function a1(name: string) {
  return `'${name.replace(/'/g, "''")}'`;
}

function safeCell(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function columnName(index: number) {
  let result = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    result = String.fromCharCode(65 + (n - 1) % 26) + result;
  }
  return result;
}

function leadColumns(header: unknown[], sheetName: string, requireKey = false) {
  const normalize = (value: unknown) => String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();
  const cells = header.map(normalize);
  return LEAD_HEADERS.map((name, index) => {
    const matches = cells.flatMap((cell, position) => cell === normalize(name) ? [position] : []);
    if (matches.length > 1) throw new Error(`Tab "${sheetName}" có nhiều cột "${name}". Vui lòng giữ một cột để tránh ghi nhầm dữ liệu.`);
    if (!matches.length && (index < 3 || requireKey)) {
      throw new Error(`Tab "${sheetName}" thiếu cột "${name}". Vui lòng kiểm tra lại cấu hình.`);
    }
    return matches[0] ?? -1;
  });
}

async function metadata(spreadsheetId: string) {
  return sheetsFetch(`${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties`) as Promise<{
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string; sheetId?: number; gridProperties?: { columnCount?: number } } }>;
  }>;
}

async function values(spreadsheetId: string, range: string) {
  return sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`) as Promise<{ values?: unknown[][] }>;
}

async function writeValues(spreadsheetId: string, range: string, row: string[], method: "PUT" | "POST") {
  const suffix = method === "POST" ? ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS" : "?valueInputOption=RAW";
  await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}${suffix}`, {
    method, body: JSON.stringify({ majorDimension: "ROWS", values: [row.map(safeCell)] }),
  });
}

export const googleLeadSheetService = {
  serviceAccountEmail() {
    return String(process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL || "").trim();
  },

  async test(spreadsheetId: string, sheetName: string) {
    const info = await metadata(spreadsheetId);
    const sheetNames = (info.sheets || []).map(sheet => sheet.properties?.title || "").filter(Boolean);
    if (sheetNames.includes(sheetName)) {
      const header = (await values(spreadsheetId, `${a1(sheetName)}!1:1`)).values?.[0] || [];
      if (header.length) leadColumns(header, sheetName);
    }
    return { title: info.properties?.title || "Google Sheet", sheetNames };
  },

  async prepare(spreadsheetId: string, sheetName: string) {
    const info = await metadata(spreadsheetId);
    const sheet = (info.sheets || []).find(item => item.properties?.title === sheetName);
    let keyColumn = 3;
    let headerWrite: { range: string; row: string[] } | undefined;
    if (sheet) {
      const header = (await values(spreadsheetId, `${a1(sheetName)}!1:1`)).values?.[0] || [];
      if (header.length) {
        keyColumn = leadColumns(header, sheetName)[3];
        if (keyColumn < 0) {
          // Append beyond the existing grid so an unlabeled custom column is never reused or hidden.
          keyColumn = Math.max(header.length, sheet.properties?.gridProperties?.columnCount || 0);
          headerWrite = { range: `${a1(sheetName)}!${columnName(keyColumn)}1`, row: [LEAD_HEADERS[3]] };
        }
      } else {
        headerWrite = { range: `${a1(sheetName)}!A1:D1`, row: LEAD_HEADERS };
      }
      if ((sheet.properties?.gridProperties?.columnCount || 0) <= keyColumn && sheet.properties?.sheetId !== undefined) {
        await sheetsFetch(`${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
          method: "POST", body: JSON.stringify({ requests: [{ updateSheetProperties: {
            properties: { sheetId: sheet.properties.sheetId, gridProperties: { columnCount: keyColumn + 1 } },
            fields: "gridProperties.columnCount",
          } }] }),
        });
      }
    } else {
      headerWrite = { range: `${a1(sheetName)}!A1:D1`, row: LEAD_HEADERS };
      await sheetsFetch(`${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
        method: "POST", body: JSON.stringify({ requests: [{ addSheet: {
          properties: { title: sheetName, gridProperties: { columnCount: 4 } },
        } }] }),
      });
    }
    if (headerWrite) await writeValues(spreadsheetId, headerWrite.range, headerWrite.row, "PUT");
    const refreshed = await metadata(spreadsheetId);
    const sheetId = refreshed.sheets?.find(item => item.properties?.title === sheetName)?.properties?.sheetId;
    if (sheetId !== undefined) {
      await sheetsFetch(`${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
        method: "POST", body: JSON.stringify({ requests: [{ updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: keyColumn, endIndex: keyColumn + 1 },
          properties: { hiddenByUser: true }, fields: "hiddenByUser",
        } }] }),
      });
    }
  },

  async upsert(spreadsheetId: string, sheetName: string, lead: {
    key: string; name: string; phone: string; summary: string;
  }) {
    const header = (await values(spreadsheetId, `${a1(sheetName)}!1:1`)).values?.[0] || [];
    const columns = leadColumns(header, sheetName, true);
    const keyColumn = columnName(columns[3]);
    const lookup = await values(spreadsheetId, `${a1(sheetName)}!${keyColumn}:${keyColumn}`);
    const rowNumber = (lookup.values || []).findIndex(row => String(row?.[0] || "") === lead.key) + 1;
    const row = [lead.name, lead.phone, lead.summary, lead.key];
    if (rowNumber > 1) {
      await sheetsFetch(`${encodeURIComponent(spreadsheetId)}/values:batchUpdate`, {
        method: "POST", body: JSON.stringify({ valueInputOption: "RAW", data: columns.map((column, index) => ({
          range: `${a1(sheetName)}!${columnName(column)}${rowNumber}`, majorDimension: "ROWS",
          values: [[safeCell(row[index])]],
        })) }),
      });
      return { rowNumber, created: false };
    }
    const mappedRow = Array<string>(header.length).fill("");
    columns.forEach((column, index) => { mappedRow[column] = row[index]; });
    await writeValues(spreadsheetId, `${a1(sheetName)}!A:${columnName(header.length - 1)}`, mappedRow, "POST");
    return { created: true };
  },
};
