import test from "node:test";
import assert from "node:assert/strict";
import { buildCatalogOverview, ProductCatalogCategory, findMatchingCategory, isGenericVisualRequest, parseGoogleDriveFolderId, resolveCatalogConfig } from "../company-product-catalog.service";

const categories: ProductCatalogCategory[] = [
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
  const detailedCategories: ProductCatalogCategory[] = [
    { id: "boy", name: "Bánh sinh nhật bé trai", images: [] },
    { id: "girl", name: "Bánh sinh nhật bé gái", images: [] },
  ];
  assert.equal(findMatchingCategory(detailedCategories, "Cho mình xem mẫu cho bé trai")?.id, "boy");
});

test("cake catalog overview takes representative images from multiple categories", () => {
  const withImages: ProductCatalogCategory[] = [
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

test("product catalog matches fruit and material categories with company aliases", () => {
  const productCategories: ProductCatalogCategory[] = [
    { id: "apple", name: "Táo nhập khẩu", images: [] },
    { id: "marble", name: "Đá marble", images: [] },
  ];
  assert.equal(findMatchingCategory(productCategories, "Cho xem apple Mỹ", {
    genericTerms: ["trái cây"],
    categoryAliases: { "Táo nhập khẩu": ["apple Mỹ", "táo Mỹ"] },
  })?.id, "apple");
  assert.equal(findMatchingCategory(productCategories, "Tôi cần mẫu đá cẩm thạch", {
    genericTerms: ["vật liệu"],
    categoryAliases: { "Đá marble": ["đá cẩm thạch"] },
  })?.id, "marble");
});

test("legacy cake configuration keeps cake wording until saved as a product catalog", () => {
  const config = resolveCatalogConfig({
    productCatalogConfig: { enabled: false, rootFolderUrl: "", itemLabel: "sản phẩm", catalogName: "Thư viện sản phẩm" },
    cakeCatalogConfig: { enabled: true, rootFolderUrl: "https://drive.google.com/drive/folders/abcDEF_1234567890", maxImagesPerReply: 4 },
  });
  assert.equal(config.migratedFromLegacy, true);
  assert.equal(config.itemLabel, "bánh");
  assert.equal(config.catalogName, "Thư viện ảnh mẫu bánh");
});
