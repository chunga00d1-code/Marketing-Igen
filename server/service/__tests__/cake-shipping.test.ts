import test from "node:test";
import assert from "node:assert/strict";
import { quoteCakeShipping } from "../cake-shipping";
import type { CakeCheckoutDetails } from "../../model/cake-checkout.model";

const details: CakeCheckoutDetails = { groupId: "TIM", name: "", size: "18", height: 10, budget: null, packQuantity: null,
  customerName: "Test", customerPhone: "0900000000", pickupLocation: "", pickupAt: "2099-10-20T17:30", inscription: "", decoration: "",
  quantity: 1, imageUrl: "", fulfillmentMethod: "delivery", deliveryAddress: "1 Đường thử, phường thử A" };
const row = "Dòng 2: Khu vực giao: phường thử A | Phí giao (VND): 30000 | Đơn tối thiểu (VND): 100000 | Miễn phí từ (VND): 500000 | Giờ giao từ: 08:00 | Giờ giao đến: 20:00";

test("delivery fees and free thresholds use only structured policy data", () => {
  assert.equal(quoteCakeShipping(details, row, 330000)?.fee, 30000);
  assert.equal(quoteCakeShipping(details, row, 500000)?.fee, 0);
  assert.equal(quoteCakeShipping(details, row, 90000), undefined);
});
test("missing area, conflicting fees, invalid amounts and unknown conditions fail closed", () => {
  assert.equal(quoteCakeShipping({ ...details, deliveryAddress: "1 Đường thử" }, row, 330000), undefined);
  assert.equal(quoteCakeShipping(details, `${row}\n${row.replace("30000", "40000")}`, 330000), undefined);
  assert.equal(quoteCakeShipping(details, row.replace("30000", "tùy khoảng cách"), 330000), undefined);
  assert.equal(quoteCakeShipping(details, `${row} | Ngoại lệ: ngày lễ phụ thu`, 330000), undefined);
  assert.equal(quoteCakeShipping(details, "Có ship, phí sẽ báo sau", 330000), undefined);
});
test("time windows and explicit free shipping are enforced", () => {
  assert.equal(quoteCakeShipping({ ...details, pickupAt: "2099-10-20T21:30" }, row, 330000), undefined);
  assert.equal(quoteCakeShipping(details, "Khu vực giao: phường thử A | Phí giao (VND): 0", 330000)?.fee, 0);
  assert.equal(quoteCakeShipping({ ...details, fulfillmentMethod: "pickup" }, "", 330000)?.fee, 0);
});
