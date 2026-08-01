import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureKnowledgeContactFooter,
  extractKnowledgeContactDetails,
  mergePageContactDetails,
} from "../agents/campaign-contact-footer";

test("extracts labeled hotline, address and website from knowledge", () => {
  const details = extractKnowledgeContactDetails(`
Hotline: 0867 355 171
Địa chỉ: Thôn Mạo Độc, Phường Liễu, Bắc Ninh
Website: https://kingda.vn
  `);

  assert.deepEqual(details, {
    phones: ["0867 355 171"],
    addresses: ["Thôn Mạo Độc, Phường Liễu, Bắc Ninh"],
    websites: ["https://kingda.vn"],
  });
});

test("page-specific contact fields override shared fields independently", () => {
  const merged = mergePageContactDetails(
    {
      phones: ["0901 234 567"],
      addresses: [],
      websites: [],
    },
    {
      phones: ["0867 355 171"],
      addresses: ["Bắc Ninh"],
      websites: ["https://example.vn"],
    }
  );

  assert.deepEqual(merged, {
    phones: ["0901 234 567"],
    addresses: ["Bắc Ninh"],
    websites: ["https://example.vn"],
  });
});

test("appends effective contact data to the end of generated content", () => {
  const body = ensureKnowledgeContactFooter(
    "Nội dung bài viết.\n\n#Kingda",
    `KHO LIÊN HỆ HIỆU LỰC (bắt buộc đặt ở cuối bài):
Hotline: 0867355171
Địa chỉ: Thôn Mạo Độc, Phường Liễu, Bắc Ninh`
  );

  assert.match(body, /☎️ Hotline: 0867355171/);
  assert.match(body, /📍 Địa chỉ: Thôn Mạo Độc, Phường Liễu, Bắc Ninh$/);
});

test("keeps content unchanged when effective knowledge has no contact data", () => {
  const original = "Nội dung bài viết bình thường.";
  const body = ensureKnowledgeContactFooter(
    original,
    "KHO LIÊN HỆ HIỆU LỰC: Không có hotline, địa chỉ hoặc website phù hợp; không thêm footer liên hệ."
  );

  assert.equal(body, original);
});

test("extracts contact details using SDT and dc/đ/c abbreviations", () => {
  const details = extractKnowledgeContactDetails(`
Tên thương hiệu TUNA
SDT: 0123456789
dc: 123 Thanh xuân Hà Nội
  `);

  assert.deepEqual(details, {
    phones: ["0123456789"],
    addresses: ["123 Thanh xuân Hà Nội"],
    websites: [],
  });
});

