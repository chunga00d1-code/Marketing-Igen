import test from "node:test";
import assert from "node:assert/strict";
import { CakeCatalogCategory, findMatchingCategory, parseGoogleDriveFolderId } from "../company-cake-catalog.service";

const categories: CakeCatalogCategory[] = [
  { id: "birthday", name: "Bánh sinh nhật", images: [] },
  { id: "wedding", name: "Bánh cưới", images: [] },
];

test("parseGoogleDriveFolderId accepts a shared folder URL", () => {
  assert.equal(
    parseGoogleDriveFolderId("https://drive.google.com/drive/folders/abcDEF_1234567890?usp=sharing"),
    "abcDEF_1234567890",
  );
});

test("cake catalog matches the specific folder name without generic cake words", () => {
  assert.equal(findMatchingCategory(categories, "Cho mình xem mẫu sinh nhật")?.id, "birthday");
  assert.equal(findMatchingCategory(categories, "Có bánh cưới không shop?")?.id, "wedding");
  assert.equal(findMatchingCategory(categories, "Cho mình hỏi giá bánh")?.id, undefined);
});

test("cake catalog accepts a partial but meaningful customer description", () => {
  const detailedCategories: CakeCatalogCategory[] = [
    { id: "boy", name: "Bánh sinh nhật bé trai", images: [] },
    { id: "girl", name: "Bánh sinh nhật bé gái", images: [] },
  ];
  assert.equal(findMatchingCategory(detailedCategories, "Cho mình xem mẫu cho bé trai")?.id, "boy");
});
