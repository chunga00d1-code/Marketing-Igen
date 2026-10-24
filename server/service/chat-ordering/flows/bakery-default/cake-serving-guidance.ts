import { normalizeCakeText, type CakeVariant } from "./cake-price-catalog";

export interface CakeServingRule {
  minGuests: number;
  maxGuests: number;
  prices: number[];
}

/** Read the Page's own guidance; serving counts and prices are never defaults in code. */
export function parseCakeServingRules(...sources: string[]): CakeServingRule[] {
  const rules = new Map<string, CakeServingRule>();
  const people = "(?:nguoi|khach|suat)";
  const range = `\\b(\\d{1,3})(?:\\s*(?:den|toi|[-–—])\\s*(\\d{1,3}))?\\s*${people}\\b`;
  const pattern = new RegExp(`${range}([^\\n;]*?)(?=${range}|[\\n;]|\\.(?:\\s|$)|$)`, "g");
  for (const source of sources) {
    for (const match of normalizeCakeText(source).matchAll(pattern)) {
      const minGuests = Number(match[1]);
      const maxGuests = Number(match[2] || match[1]);
      if (minGuests < 1 || maxGuests < minGuests) continue;
      const prices = [...match[3].matchAll(/(\d+(?:[.,]\d+)*)\s*(k|nghin|ngan|trieu|tr|vnd|d)(?=$|[^\p{L}])/gu)]
        .map(price => {
          const unit = price[2];
          if (unit === "vnd" || unit === "d") return Number(price[1].replace(/[.,]/g, ""));
          return Math.round(Number(price[1].replace(",", ".")) * (/^(?:tr|trieu)$/.test(unit) ? 1_000_000 : 1000));
        }).filter(price => Number.isSafeInteger(price) && price > 0);
      const key = `${minGuests}-${maxGuests}`;
      // Explicit Page rules supplied first take precedence over retrieved documents.
      if (prices.length && !rules.has(key)) rules.set(key, { minGuests, maxGuests, prices: [...new Set(prices)] });
    }
  }
  return [...rules.values()];
}

export function isCakeServingQuestion(message: string) {
  return /\b(?:may|bao nhieu)\s*(?:nguoi|khach|suat)\b|\b(?:nguoi|khach)\s*(?:an|dung)\s*(?:duoc|du|vua)\b/.test(normalizeCakeText(message));
}

export function isCakeServingRecommendation(message: string) {
  const normalized = normalizeCakeText(message);
  return /\b(?:nguoi|khach|suat)\b/.test(normalized)
    && (/\b(?:size|kich thuoc|nen|chon|dat|bao nhieu|du|vua)\b/.test(normalized)
      || /^\d{1,3}(?:\s*(?:den|toi|[-–—])\s*\d{1,3})?\s*nguoi(?:\s+(?:nhe|nha|a|an))?[.!?]*$/.test(normalized));
}

function specification(variant: CakeVariant) {
  return `Size ${variant.size}cm${variant.height ? `, cao ${variant.height}cm` : ""}`;
}

export function cakeServingCapacityReply(selected: CakeVariant[], rules: CakeServingRule[]) {
  if (!selected.length || !rules.length) return undefined;
  const rows = new Map<string, string>();
  for (const variant of selected) {
    if (!variant.size || variant.packQuantity !== 1) continue;
    const matches = rules.filter(rule => rule.prices.includes(variant.price));
    for (const rule of matches) {
      const guests = rule.minGuests === rule.maxGuests ? `${rule.minGuests}` : `${rule.minGuests}–${rule.maxGuests}`;
      rows.set(`${variant.size}|${variant.height}|${guests}`, `${specification(variant)} phù hợp khoảng ${guests} người ăn nhé.`);
    }
  }
  // An ambiguous size gets its relevant alternatives, never the complete price sheet.
  return rows.size && rows.size <= 3 ? [...rows.values()].join("\n") : undefined;
}

export function cakeServingRecommendationReply(guestCount: number, catalog: CakeVariant[], rules: CakeServingRule[]) {
  if (!Number.isSafeInteger(guestCount) || guestCount < 1) return undefined;
  const applicable = rules.filter(rule => guestCount >= rule.minGuests && guestCount <= rule.maxGuests);
  const prices = new Set(applicable.flatMap(rule => rule.prices));
  const variants = catalog.filter(variant => variant.size && variant.packQuantity === 1 && !variant.needsApproval && prices.has(variant.price));
  const rows = new Map<string, string>();
  for (const variant of variants.sort((a, b) => a.price - b.price)) {
    rows.set(`${variant.size}|${variant.height}|${variant.price}`, `${specification(variant)} — ${variant.price.toLocaleString("vi-VN")}đ`);
  }
  if (!rows.size) return undefined;
  const options = [...rows.values()].slice(0, 3);
  return options.length === 1
    ? `Khoảng ${guestCount} người thì ${options[0].replace(/^Size/, "size")} phù hợp nhé.`
    : `Khoảng ${guestCount} người có các lựa chọn phù hợp:\n${options.join("\n")}`;
}
