import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalogOverview, CakeCatalogCategory, findMatchingCategory, isGenericVisualRequest, parseGoogleDriveFolderId } from "../company-cake-catalog.service";

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

test("cake catalog overview takes representative images from multiple categories", () => {
  const withImages: CakeCatalogCategory[] = [
    {
      id: "birthday",
      name: "Bánh sinh nhật",
      images: [
        { id: "birthday-1", name: "1.jpg", imageUrl: "1", driveUrl: "1" },
        { id: "birthday-2", name: "2.jpg", imageUrl: "2", driveUrl: "2" },
      ],
    },
    {
      id: "wedding",
      name: "Bánh cưới",
      images: [{ id: "wedding-1", name: "3.jpg", imageUrl: "3", driveUrl: "3" }],
    },
  ];
  assert.deepEqual(buildCatalogOverview(withImages, 3).map((image) => image.id), ["birthday-1", "wedding-1", "birthday-2"]);
});

test("generic visual requests are recognized without treating specific requests as generic", () => {
  assert.equal(isGenericVisualRequest("Cho tôi xem các hình ảnh về mẫu bánh"), true);
  assert.equal(isGenericVisualRequest("Cho mình xem mẫu bánh cho bé trai"), false);
});
