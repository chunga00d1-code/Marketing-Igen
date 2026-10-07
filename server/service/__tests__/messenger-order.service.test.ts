import test from "node:test";
import assert from "node:assert/strict";
import { parseGoogleSpreadsheetId } from "../google-order-sheet.service";
import { messengerOrderService } from "../messenger-order.service";

test("parseGoogleSpreadsheetId accepts a Google Sheets URL", () => {
  assert.equal(
    parseGoogleSpreadsheetId("https://docs.google.com/spreadsheets/d/abcDEF_12345678901234567890/edit#gid=0"),
    "abcDEF_12345678901234567890"
  );
});

test("parseGoogleSpreadsheetId rejects unrelated links", () => {
  assert.throws(() => parseGoogleSpreadsheetId("https://example.com/orders.xlsx"));
});

test("Messenger order capture requires an explicit confirmation phrase", () => {
  assert.equal(messengerOrderService.isConfirmationMessage("Mình xác nhận chốt đơn nhé"), true);
  assert.equal(messengerOrderService.isConfirmationMessage("ok chốt giúp mình"), true);
  assert.equal(messengerOrderService.isConfirmationMessage("đồng ý nha"), true);
  assert.equal(messengerOrderService.isConfirmationMessage("đặt hàng ạ"), true);
  assert.equal(messengerOrderService.isConfirmationMessage("lên đơn nhé"), true);
  assert.equal(messengerOrderService.isConfirmationMessage("Cho mình hỏi giá bánh này"), false);
  assert.equal(messengerOrderService.isConfirmationMessage("Mình đang cân nhắc"), false);
});
