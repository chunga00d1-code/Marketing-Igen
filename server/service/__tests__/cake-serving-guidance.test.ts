import test from "node:test";
import assert from "node:assert/strict";
import { cakeServingCapacityReply, cakeServingRecommendationReply, isCakeServingQuestion, parseCakeServingRules } from "../cake-serving-guidance";
import { parseCakePriceCatalog } from "../cake-price-catalog";

const guidance = "nếu có 2 đến 3 người bánh 100k. có 4 đến 5 người bánh 180k. có 6 đến 7 người thì 270k. "
  + "có 7 đến 8 người thì đặt bánh 330k. có 9 đến 11 người thì bánh 380k hoặc bánh 400k. có 12 đến 15 người bánh 500k hoặc 600k.";
const catalog = parseCakePriceCatalog("Dòng 2: Mã nhóm: ROUND | Nhóm bánh: Bánh tròn | Nội dung báo giá nguyên văn: "
  + "Size 10cm giá 100k, size 14cm cao 7cm giá 180k, size 18cm cao 7cm giá 270k, size 18cm cao 10cm giá 330k, "
  + "size 22cm cao 7cm giá 380k, size 22cm cao 10cm giá 400k, size 24cm cao 10cm giá 500k.");

test("serving counts are read from configurable Page guidance, including alternative prices", () => {
  assert.deepEqual(parseCakeServingRules(guidance), [
    { minGuests: 2, maxGuests: 3, prices: [100000] }, { minGuests: 4, maxGuests: 5, prices: [180000] },
    { minGuests: 6, maxGuests: 7, prices: [270000] }, { minGuests: 7, maxGuests: 8, prices: [330000] },
    { minGuests: 9, maxGuests: 11, prices: [380000, 400000] }, { minGuests: 12, maxGuests: 15, prices: [500000, 600000] },
  ]);
  assert.deepEqual(parseCakeServingRules("4–5 người: bánh 180.000đ; 9-11 người: bánh 380.000 VND hoặc 400.000đ"), [
    { minGuests: 4, maxGuests: 5, prices: [180000] }, { minGuests: 9, maxGuests: 11, prices: [380000, 400000] },
  ]);
  assert.deepEqual(parseCakeServingRules("4-5 người bánh 200k", guidance).find(rule => rule.minGuests === 4)?.prices, [200000]);
});

test("the selected size answers capacity directly without repeating price or asking the guest count", () => {
  const selected = catalog.filter(variant => variant.size === "18" && variant.height === 10);
  const reply = cakeServingCapacityReply(selected, parseCakeServingRules(guidance));
  assert.equal(reply, "Size 18cm, cao 10cm phù hợp khoảng 7–8 người ăn nhé.");
  assert.doesNotMatch(reply!, /330|bao nhiêu người|dự kiến/);
  assert.equal(isCakeServingQuestion("Size đó mấy người ăn nhỉ"), true);
  assert.equal(cakeServingCapacityReply(selected, []), undefined);
});

test("height ambiguity retains both valid capacities and overlapping rules do not silently pick one price", () => {
  const reply = cakeServingCapacityReply(catalog.filter(variant => variant.size === "18"), parseCakeServingRules(guidance));
  assert.match(reply!, /cao 7cm.*6–7 người/); assert.match(reply!, /cao 10cm.*7–8 người/);
  const recommendation = cakeServingRecommendationReply(7, catalog, parseCakeServingRules(guidance));
  assert.match(recommendation!, /270.000đ/); assert.match(recommendation!, /330.000đ/);
  assert.doesNotMatch(recommendation!, /100.000đ|180.000đ/);
});

test("guest recommendations only use prices and sizes that exist in the Page catalog", () => {
  assert.match(cakeServingRecommendationReply(5, catalog, parseCakeServingRules(guidance))!, /size 14cm, cao 7cm — 180.000đ/);
  const recommendation = cakeServingRecommendationReply(15, catalog, parseCakeServingRules(guidance));
  assert.match(recommendation!, /500.000đ/); assert.doesNotMatch(recommendation!, /600.000đ/);
  assert.equal(cakeServingRecommendationReply(20, catalog, parseCakeServingRules(guidance)), undefined);
});
