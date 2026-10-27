import { strict as assert } from "node:assert";
import { generateKeyPairSync } from "node:crypto";
import { test } from "node:test";
import { googleLeadSheetService, LEAD_HEADERS, parseLeadSpreadsheetId, validateLeadSheetName } from "../google-lead-sheet.service";

test("validates lead Sheet links and tab names", () => {
  assert.equal(parseLeadSpreadsheetId("https://docs.google.com/spreadsheets/d/abcDEF_12345678901234567890/edit"),
    "abcDEF_12345678901234567890");
  assert.equal(validateLeadSheetName("Khách quan tâm"), "Khách quan tâm");
  assert.throws(() => parseLeadSpreadsheetId("https://example.com/spreadsheets/d/abcDEF_12345678901234567890"));
  assert.throws(() => validateLeadSheetName("Orders/Leads"));
});

test("updates the same lead row instead of appending a duplicate", async (context) => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const previous = {
    projectId: process.env.GOOGLE_SHEETS_PROJECT_ID,
    email: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL,
    privateKey: process.env.GOOGLE_SHEETS_PRIVATE_KEY,
  };
  process.env.GOOGLE_SHEETS_PROJECT_ID = "test-project";
  process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = "test@example.iam.gserviceaccount.com";
  process.env.GOOGLE_SHEETS_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  context.after(() => {
    if (previous.projectId === undefined) delete process.env.GOOGLE_SHEETS_PROJECT_ID;
    else process.env.GOOGLE_SHEETS_PROJECT_ID = previous.projectId;
    if (previous.email === undefined) delete process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL;
    else process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL = previous.email;
    if (previous.privateKey === undefined) delete process.env.GOOGLE_SHEETS_PRIVATE_KEY;
    else process.env.GOOGLE_SHEETS_PRIVATE_KEY = previous.privateKey;
  });

  const writes: Array<{ method: string; path: string; body: unknown }> = [];
  let leadAlreadyExists = true;
  let header: string[] = [...LEAD_HEADERS];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const path = decodeURIComponent(String(input));
    if (path.includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "test-token", expires_in: 3600 }), { status: 200 });
    }
    if (init?.method === "PUT" || init?.method === "POST") {
      writes.push({ method: init.method, path, body: JSON.parse(String(init.body)) });
      return new Response("{}", { status: 200 });
    }
    if (path.includes("?fields=properties.title,sheets.properties")) return new Response(JSON.stringify({
      properties: { title: "Lead test" },
      sheets: [{ properties: { title: "Leads", sheetId: 123, gridProperties: { columnCount: 26 } } }],
    }), { status: 200 });
    if (path.includes("!1:1")) return new Response(JSON.stringify({ values: [header] }), { status: 200 });
    if (path.includes("!D:D") || path.includes("!F:F")) return new Response(JSON.stringify({ values: leadAlreadyExists
      ? [[LEAD_HEADERS[3]], ["ABC:test:session-1"]] : [[LEAD_HEADERS[3]]] }), { status: 200 });
    throw new Error(`Unexpected request: ${path}`);
  };
  context.after(() => { globalThis.fetch = originalFetch; });

  const result = await googleLeadSheetService.upsert("test-sheet", "Leads", {
    key: "ABC:test:session-1", name: "Nam", phone: "0900000000", summary: "Khách cần sơn nhà mới",
  });
  assert.deepEqual(result, { rowNumber: 2, created: false });
  assert.equal(writes.length, 1);
  assert.equal(writes[0].method, "POST");
  assert.match(writes[0].path, /values:batchUpdate/);
  assert.deepEqual(writes[0].body, { valueInputOption: "RAW", data: [
    { range: "'Leads'!A2", majorDimension: "ROWS", values: [["Nam"]] },
    { range: "'Leads'!B2", majorDimension: "ROWS", values: [["0900000000"]] },
    { range: "'Leads'!C2", majorDimension: "ROWS", values: [["Khách cần sơn nhà mới"]] },
    { range: "'Leads'!D2", majorDimension: "ROWS", values: [["ABC:test:session-1"]] },
  ] });

  leadAlreadyExists = false;
  const appended = await googleLeadSheetService.upsert("test-sheet", "Leads", {
    key: "ABC:test:session-2", name: "Lan", phone: "0911111111", summary: "Khách hỏi về màu sơn",
  });
  assert.deepEqual(appended, { created: true });
  assert.equal(writes[1].method, "POST");
  assert.match(writes[1].path, /A:D:append/);
  assert.deepEqual(writes[1].body, { majorDimension: "ROWS",
    values: [["Lan", "0911111111", "Khách hỏi về màu sơn", "ABC:test:session-2"]] });

  await googleLeadSheetService.prepare("test-sheet", "Leads");
  assert.equal(writes.length, 3);
  assert.equal(writes[2].method, "POST");
  assert.deepEqual(writes[2].body, { requests: [{ updateDimensionProperties: {
    range: { sheetId: 123, dimension: "COLUMNS", startIndex: 3, endIndex: 4 },
    properties: { hiddenByUser: true }, fields: "hiddenByUser",
  } }] });

  // Extra columns before/between/after the lead columns must not be touched on updates.
  header = ["Ghi chú", " số điện thoại ", "Người phụ trách", "Tên khách hàng", "Tóm tắt hội thoại", "Mã cuộc hội thoại", "Công thức"];
  assert.equal((await googleLeadSheetService.test("test-sheet", "Leads")).title, "Lead test");
  leadAlreadyExists = true;
  const start = writes.length;
  await googleLeadSheetService.upsert("test-sheet", "Leads", {
    key: "ABC:test:session-1", name: "Nam", phone: "0900000000", summary: "Nhà hai tầng",
  });
  assert.deepEqual(writes[start].body, { valueInputOption: "RAW", data: [
    { range: "'Leads'!D2", majorDimension: "ROWS", values: [["Nam"]] },
    { range: "'Leads'!B2", majorDimension: "ROWS", values: [["0900000000"]] },
    { range: "'Leads'!E2", majorDimension: "ROWS", values: [["Nhà hai tầng"]] },
    { range: "'Leads'!F2", majorDimension: "ROWS", values: [["ABC:test:session-1"]] },
  ] });
  leadAlreadyExists = false;
  await googleLeadSheetService.upsert("test-sheet", "Leads", {
    key: "ABC:test:new", name: "=test", phone: "0900000001", summary: "Mới",
  });
  assert.match(writes[start + 1].path, /A:G:append/);
  assert.deepEqual(writes[start + 1].body, { majorDimension: "ROWS",
    values: [["", "0900000001", "", "'=test", "Mới", "ABC:test:new", ""]] });
  await googleLeadSheetService.prepare("test-sheet", "Leads");
  assert.deepEqual(writes[start + 2].body, { requests: [{ updateDimensionProperties: {
    range: { sheetId: 123, dimension: "COLUMNS", startIndex: 5, endIndex: 6 },
    properties: { hiddenByUser: true }, fields: "hiddenByUser",
  } }] });

  header = ["Tên khách hàng", "Ghi chú", "Số điện thoại", "Tóm tắt hội thoại"];
  await googleLeadSheetService.test("test-sheet", "Leads");
  const prepareStart = writes.length;
  await googleLeadSheetService.prepare("test-sheet", "Leads");
  assert.match(writes[prepareStart + 1].path, /AA1/);
  assert.deepEqual(writes[prepareStart + 1].body, { majorDimension: "ROWS", values: [["Mã cuộc hội thoại"]] });
  assert.deepEqual(writes[prepareStart + 2].body, { requests: [{ updateDimensionProperties: {
    range: { sheetId: 123, dimension: "COLUMNS", startIndex: 26, endIndex: 27 },
    properties: { hiddenByUser: true }, fields: "hiddenByUser",
  } }] });

  const beforeInvalid = writes.length;
  header = ["Tên khách hàng", "Ghi chú"];
  await assert.rejects(googleLeadSheetService.test("test-sheet", "Leads"), /thiếu cột "Số điện thoại"/);
  await assert.rejects(googleLeadSheetService.prepare("test-sheet", "Leads"), /thiếu cột/);
  header = [...LEAD_HEADERS, "Số điện thoại"];
  await assert.rejects(googleLeadSheetService.test("test-sheet", "Leads"), /nhiều cột "Số điện thoại"/);
  await assert.rejects(googleLeadSheetService.upsert("test-sheet", "Leads", {
    key: "ABC:test:new", name: "Nam", phone: "0900000000", summary: "",
  }), /nhiều cột/);
  assert.equal(writes.length, beforeInvalid);
});
