import test from "node:test";
import assert from "node:assert/strict";
import XLSX from "xlsx";
import { readFileSync } from "node:fs";
import { calculateCakeDeposit, isCakeSummaryConfirmation, isFutureCakePickup, parseCakePriceCatalog, resolveCakeChoice } from "../cake-price-catalog";

function workbookText(name: string) {
  const workbook = XLSX.read(readFileSync(name), { type: "buffer" });
  return workbook.SheetNames.map(sheet => XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheet])
    .map((row, index) => `Dòng ${index + 2}: ${Object.entries(row).map(([key, value]) => `${key}: ${value}`).join(" | ")}`).join("\n")).join("\n");
}
const original = parseCakePriceCatalog(workbookText("bao-gia-banh-theo-anh.xlsx"));
const normalized = parseCakePriceCatalog(workbookText("bao-gia-banh-chuan-hoa.xlsx"));
const choice = { groupId: "TRAI_TIM", name: "", size: "", height: null, budget: null, packQuantity: null };

test("normalized workbook preserves all 50 original variants and prices", () => {
  assert.equal(original.length, 50);
  assert.equal(normalized.length, 50);
  const comparable = (rows: typeof original) => rows.map(({ source: _source, ...row }) => row).sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(comparable(original), comparable(normalized));
  assert.equal(normalized.filter(row => row.groupId === "MOUSSE").length, 10);
  assert.equal(normalized.filter(row => row.groupId === "SET_20_10" && row.needsApproval).length, 3);
});
test("chosen price resolves a heart cake to its exact size and height", () => {
  const options = resolveCakeChoice(normalized, { ...choice, budget: 330000 });
  assert.equal(options.length, 1);
  assert.equal(options[0].size, "18");
  assert.equal(options[0].height, 10);
});
test("size without height remains ambiguous; unmatched budgets are never substituted", () => {
  assert.equal(resolveCakeChoice(normalized, { ...choice, size: "14" }).length, 2);
  assert.equal(resolveCakeChoice(normalized, { ...choice, budget: 200000 }).length, 0);
  assert.equal(resolveCakeChoice(normalized, { ...choice, groupId: "TRON_BLTM", budget: 180000 }).length, 2);
});
test("deposit comes from price, quantity and configured percentage", () => {
  assert.deepEqual(calculateCakeDeposit(330000, 2, 30), { total: 660000, deposit: 198000, balance: 462000 });
  assert.throws(() => calculateCakeDeposit(330000, 0, 30));
  assert.throws(() => calculateCakeDeposit(330000, 1, 101));
});
test("confirmation must explicitly approve the summary without changes", () => {
  assert.equal(isCakeSummaryConfirmation("xác nhận chốt đơn"), true);
  for (const message of ["ok", "không chốt đơn", "chốt đơn nhưng đổi size 22", "cho mình xin QR"]) {
    assert.equal(isCakeSummaryConfirmation(message), false);
  }
});
test("conflicting uploaded prices fail closed", () => {
  const line = "Dòng 2: Mã nhóm: TIM | Nhóm bánh: Bánh trái tim | Nội dung báo giá nguyên văn: Size 14cm cao 7cm giá 180k";
  assert.throws(() => parseCakePriceCatalog(`${line}\n${line.replace("180k", "200k")}`), /mâu thuẫn/);
});

test("pickup dates reject impossible calendar dates and expired appointments", () => {
  assert.equal(isFutureCakePickup("2099-02-31T17:30"), false);
  assert.equal(isFutureCakePickup("2000-01-01T17:30"), false);
  assert.equal(isFutureCakePickup("2099-10-20T17:30"), true);
});
