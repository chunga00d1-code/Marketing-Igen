import test from "node:test";
import assert from "node:assert/strict";
import { isNewOrderStartMessage, selectCurrentOrderContext } from "../messenger-order-context";

test("detects a new order request without matching a variant answer", () => {
  assert.equal(isNewOrderStartMessage("toi muon dat mot chiec banh"), true);
  assert.equal(isNewOrderStartMessage("dat mot chiec banh"), true);
  assert.equal(isNewOrderStartMessage("dat hang"), false);
  assert.equal(isNewOrderStartMessage("lay loai cao 10cm"), false);
});

test("drops details from an older order when a new order begins", () => {
  const messages = [
    { sender: "user", text: "don truoc giao tan noi" },
    { sender: "model", text: "da ghi nhan dia chi cu" },
    { sender: "user", text: "toi muon dat mot chiec banh moi" },
    { sender: "model", text: "ban muon mau nao" },
    { sender: "user", text: "Elsa" },
  ];

  assert.deepEqual(selectCurrentOrderContext(messages).map((item) => item.text), [
    "toi muon dat mot chiec banh moi",
    "ban muon mau nao",
    "Elsa",
  ]);
});

test("starts with empty history when the current message opens a new order", () => {
  const history = [{ sender: "user", text: "don cu lay tai cua hang" }];
  assert.deepEqual(selectCurrentOrderContext(history, "minh can mua mot san pham moi"), []);
});
