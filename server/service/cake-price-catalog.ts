import { createHash } from "node:crypto";

export interface CakeVariant {
  id: string; groupId: string; name: string; shape: string; size: string;
  height: number | null; packQuantity: number; unit: string; price: number;
  needsApproval: boolean; source: string;
}

export function normalizeCakeText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().trim();
}

/** Read the uploaded data only. No shop prices are embedded in application code. */
export function parseCakePriceCatalog(text: string): CakeVariant[] {
  const detailed: CakeVariant[] = [];
  const legacy: CakeVariant[] = [];
  const add = (values: Omit<CakeVariant, "id">, target: CakeVariant[], id?: string) => {
    if (!values.name || !Number.isSafeInteger(values.price) || values.price <= 0
      || !Number.isSafeInteger(values.packQuantity) || values.packQuantity < 1
      || (values.height !== null && (!Number.isFinite(values.height) || values.height <= 0))) {
      throw new Error(`Dữ liệu giá không hợp lệ cho nhóm ${values.groupId}; cần shop kiểm tra.`);
    }
    const key = [values.groupId, values.name, values.size, values.height, values.packQuantity].join("|");
    target.push({ ...values, id: id || `BV_${createHash("sha256").update(key).digest("hex").slice(0, 14)}` });
  };
  for (const line of text.split(/\r?\n/)) {
    if (!/^\s*Dòng\s+\d+\s*:/.test(line)) continue;
    const fields = Object.fromEntries(line.replace(/^\s*Dòng\s+\d+\s*:\s*/, "").split(/\s*\|\s*/).map(field => {
      const split = field.indexOf(":");
      return [field.slice(0, split).trim(), field.slice(split + 1).trim()];
    }));
    const groupId = fields["Mã nhóm"];
    if (!groupId) continue;
    if (fields["Mã biến thể"]) {
      add({ groupId, name: fields["Loại bánh"], shape: fields["Hình dạng"] || "",
        size: fields["Kích thước (cm)"] || "", height: Number(fields["Chiều cao (cm)"]) || null,
        packQuantity: Number(fields["Số lượng trong set"]) || 1, unit: fields["Đơn vị bán"] || "bánh",
        price: Number(fields["Giá (VND)"]), needsApproval: normalizeCakeText(fields["Cần shop duyệt"] || "") === "co",
        source: line }, detailed, fields["Mã biến thể"]);
      continue;
    }
    const name = fields["Nhóm bánh"];
    const quote = fields["Nội dung báo giá nguyên văn"];
    if (!name || !quote) continue;
    const caution = fields["Khi cần xác nhận"] || "";
    const needsApproval = /thoi gian ap dung|chuong trinh/.test(normalizeCakeText(caution));
    const shape = /trái tim/i.test(name) ? "Trái tim" : /chữ nhật/i.test(name) ? "Chữ nhật"
      : /vuông/i.test(name) ? "Vuông" : /tròn/i.test(name) ? "Tròn" : "";
    const names = name.includes(" & ") ? name.split(" & ") : [name];
    const mousseFlavors = quote.match(/^Mousse\s+(.+?)\s+size/i)?.[1].split(/,\s*/);
    if (mousseFlavors) names.splice(0, names.length, ...mousseFlavors.map(flavor => `Mousse ${flavor}`));
    for (const match of quote.matchAll(/size\s+(\d+(?:x\d+)?)\s*cm(?:\s+cao\s+(\d+)\s*cm)?\s+giá\s+(\d+(?:[.,]\d+)?)\s*(k|tr)/gi)) {
      const price = Math.round(Number(match[3].replace(",", ".")) * (match[4].toLowerCase() === "tr" ? 1_000_000 : 1000));
      for (const variantName of names) add({ groupId, name: variantName, shape, size: match[1], height: Number(match[2]) || null,
        price, packQuantity: 1, unit: "bánh", needsApproval, source: line }, legacy);
    }
    if (!/size\s+\d/i.test(quote)) {
      for (const match of quote.matchAll(/(?:set\s+|Su Singapore\s+)(\d+)\s+(cốc|cái)(.*?)\s+giá\s+(\d+)k/gi)) {
        add({ groupId, name: `${name}${match[3].trim() ? ` - ${match[3].trim()}` : ""}`,
          shape: /tim/i.test(match[3]) ? "Trái tim" : /tròn/i.test(match[3]) ? "Tròn" : "",
          size: "", height: null, packQuantity: Number(match[1]), unit: `set ${match[2]}`,
          price: Number(match[4]) * 1000, needsApproval, source: line }, legacy);
      }
    }
  }
  // A structured sheet replaces its groups only; other groups may still use the original layout.
  const detailedGroups = new Set(detailed.map(variant => variant.groupId));
  const variants = [...detailed, ...legacy.filter(variant => !detailedGroups.has(variant.groupId))];
  const unique = new Map<string, CakeVariant>();
  for (const variant of variants) {
    const prior = unique.get(variant.id);
    if (prior && ["price", "name", "groupId", "shape", "size", "height", "packQuantity", "needsApproval"].some(key =>
      prior[key as keyof CakeVariant] !== variant[key as keyof CakeVariant])) throw new Error(`Bảng giá mâu thuẫn cho mã ${variant.id}; cần shop kiểm tra.`);
    unique.set(variant.id, variant);
  }
  return [...unique.values()];
}

export type CakeChoice = { groupId: string; size: string; height: number | null; budget: number | null; packQuantity: number | null; name: string };
export function matchesCakeType(variant: CakeVariant, cakeType: string) {
  const name = normalizeCakeText(variant.name);
  const type = normalizeCakeText(cakeType);
  if (!type) return true;
  for (const keyword of ["mousse", "tiramisu", "trung muoi", "su singapore"]) {
    if (type.includes(keyword)) return name.includes(keyword);
    if (name.includes(keyword)) return false;
  }
  return /kem tuoi|kem|tron thuong/.test(type) ? !/set|coc/.test(name) : name.includes(type);
}
export function resolveCakeChoice(catalog: CakeVariant[], choice: CakeChoice) {
  if (!choice.groupId) return [];
  return catalog.filter(item => item.groupId === choice.groupId
    && (!choice.size || item.size === choice.size.replace(/\s*cm$/i, "").replace(/\s/g, ""))
    && (!choice.height || item.height === choice.height)
    && (!choice.budget || item.price === choice.budget)
    && (!choice.packQuantity || item.packQuantity === choice.packQuantity)
    && (!choice.name || normalizeCakeText(item.name) === normalizeCakeText(choice.name)));
}

export function calculateCakeDeposit(unitPrice: number, quantity: number, percent: number) {
  if (!Number.isSafeInteger(unitPrice) || unitPrice <= 0 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100
    || !Number.isInteger(percent) || percent < 1 || percent > 100) throw new Error("Thông tin giá, số lượng hoặc tỷ lệ cọc không hợp lệ.");
  const total = unitPrice * quantity;
  if (!Number.isSafeInteger(total)) throw new Error("Tổng tiền không hợp lệ.");
  const deposit = Math.round(total * percent / 100);
  return { total, deposit, balance: total - deposit };
}

export function isCakeSummaryConfirmation(text: string) {
  return /^(?:da\s+)?(?:xac nhan chot don|xac nhan don hang|chot don|dong y chot don)(?:\s+(?:a|nhe|nha))?[.!]*$/.test(normalizeCakeText(text));
}

export function isFutureCakePickup(value: string, now = Date.now()) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return false;
  const time = Date.parse(`${value}+07:00`);
  return Number.isFinite(time) && time > now
    && new Date(time + 7 * 3600_000).toISOString().slice(0, 16) === value;
}
