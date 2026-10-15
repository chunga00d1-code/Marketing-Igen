import assert from "node:assert/strict";
import test from "node:test";
import { getCakePriceRule } from "../cake-order-pricing";

test("maps every supported guest boundary to the configured cake price", () => {
  assert.deepEqual(getCakePriceRule(2), { sizeLabel: "2–3 người", priceOptions: [100_000] });
  assert.deepEqual(getCakePriceRule(3), { sizeLabel: "2–3 người", priceOptions: [100_000] });
  assert.deepEqual(getCakePriceRule(4), { sizeLabel: "4–5 người", priceOptions: [180_000] });
  assert.deepEqual(getCakePriceRule(5), { sizeLabel: "4–5 người", priceOptions: [180_000] });
  assert.deepEqual(getCakePriceRule(6), { sizeLabel: "6–7 người", priceOptions: [270_000] });
  assert.deepEqual(getCakePriceRule(7), { sizeLabel: "6–7 người", priceOptions: [270_000] });
  assert.deepEqual(getCakePriceRule(8), { sizeLabel: "8 người", priceOptions: [330_000] });
  assert.deepEqual(getCakePriceRule(9), { sizeLabel: "9–11 người", priceOptions: [380_000, 400_000] });
  assert.deepEqual(getCakePriceRule(11), { sizeLabel: "9–11 người", priceOptions: [380_000, 400_000] });
  assert.deepEqual(getCakePriceRule(12), { sizeLabel: "12–15 người", priceOptions: [500_000, 600_000] });
  assert.deepEqual(getCakePriceRule(15), { sizeLabel: "12–15 người", priceOptions: [500_000, 600_000] });
});

test("requires human pricing outside the supported range", () => {
  assert.equal(getCakePriceRule(1), null);
  assert.equal(getCakePriceRule(16), null);
});

