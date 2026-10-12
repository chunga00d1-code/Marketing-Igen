import type { CakeCheckoutDetails, CakeCheckoutSnapshot } from "../model/cake-checkout.model";
import { normalizeCakeText } from "./cake-price-catalog";

/** A structured knowledge row is evaluated locally; no customer data leaves this resolver. */
export function quoteCakeShipping(details: CakeCheckoutDetails, policy: string, subtotal: number) {
  if (details.fulfillmentMethod !== "delivery") return { fee: 0, evidence: "" };
  if (!details.deliveryAddress || !details.pickupAt) return undefined;
  const address = ` ${normalizeCakeText(details.deliveryAddress).replace(/[^a-z0-9]+/g, " ")} `;
  const candidates: { fee: number; evidence: string }[] = [];
  for (const line of policy.split(/\r?\n/)) {
    const fields = Object.fromEntries(line.replace(/^\s*Dòng\s+\d+\s*:\s*/, "").split(/\s*\|\s*/).map(part => {
      const index = part.indexOf(":");
      return index < 0 ? ["", ""] : [normalizeCakeText(part.slice(0, index)), part.slice(index + 1).trim()];
    }));
    if (!fields["khu vuc giao"] || !fields["phi giao (vnd)"]) continue;
    // Reject unimplemented conditions instead of silently omitting them.
    const allowed = new Set(["khu vuc giao", "phi giao (vnd)", "don toi thieu (vnd)", "mien phi tu (vnd)", "gio giao tu", "gio giao den", "hieu luc tu", "hieu luc den"]);
    if (Object.entries(fields).some(([key, value]) => value && !allowed.has(key))) continue;
    const regions = fields["khu vuc giao"].split(";").map(value => normalizeCakeText(value).replace(/[^a-z0-9]+/g, " ").trim());
    const matched = regions.filter(region => region && (region === "tat ca" || address.includes(` ${region} `)));
    if (!matched.length) continue;
    const numeric = (key: string) => fields[key] ? (/^\d+$/.test(fields[key]) ? Number(fields[key]) : NaN) : 0;
    let fee = numeric("phi giao (vnd)");
    const min = numeric("don toi thieu (vnd)"); const free = numeric("mien phi tu (vnd)");
    if (![fee, min, free].every(value => Number.isSafeInteger(value) && value >= 0) || subtotal < min) continue;
    const day = details.pickupAt.slice(0, 10); const time = details.pickupAt.slice(11, 16);
    if (["hieu luc tu", "hieu luc den"].some(key => fields[key] && !/^\d{4}-\d{2}-\d{2}$/.test(fields[key]))) continue;
    if (["gio giao tu", "gio giao den"].some(key => fields[key] && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(fields[key]))) continue;
    if (fields["gio giao tu"] && fields["gio giao den"] && fields["gio giao tu"] > fields["gio giao den"]) continue;
    if ((fields["hieu luc tu"] && day < fields["hieu luc tu"]) || (fields["hieu luc den"] && day > fields["hieu luc den"])
      || (fields["gio giao tu"] && time < fields["gio giao tu"]) || (fields["gio giao den"] && time > fields["gio giao den"])) continue;
    if (free > 0 && subtotal >= free) fee = 0;
    candidates.push({ fee, evidence: line });
  }
  if (!candidates.length || new Set(candidates.map(row => row.fee)).size !== 1) return undefined;
  return candidates[0];
}

export function cakePaidMessage(snapshot: CakeCheckoutSnapshot) {
  const d = snapshot.details;
  const money = (value: number) => `${value.toLocaleString("vi-VN")}đ`;
  return [`Dạ ${snapshot.sellerAddress || "em"} nhận được ${money(snapshot.deposit)} tiền cọc rồi ạ.`,
    `Bánh: ${snapshot.variant.name}${d.cakeType ? `, ${d.cakeType}` : ""}${snapshot.variant.size ? `, size ${snapshot.variant.size}cm` : ""}${snapshot.variant.height ? `, cao ${snapshot.variant.height}cm` : ""}; số lượng: ${d.quantity}.`,
    d.imageUrl ? `Mẫu bánh: ${d.imageUrl}` : `Trang trí: ${d.decoration}`,
    `Chữ trên bánh: ${d.inscription}`, `Người nhận: ${d.customerName} — ${d.customerPhone}`,
    `${d.fulfillmentMethod === "delivery" ? "Giao đến" : "Nhận tại"}: ${d.fulfillmentMethod === "delivery" ? d.deliveryAddress : d.pickupLocation}`,
    `Ngày giờ nhận: ${d.pickupAt.replace("T", " ")} (giờ Việt Nam)`,
    ...(d.fulfillmentMethod === "delivery" ? [`Phí giao: ${money(snapshot.shippingFee || 0)}`] : []),
    `Tổng tiền: ${money(snapshot.total)}. Còn lại ${money(snapshot.balance)} thanh toán khi nhận bánh nhé.`,
    "Cảm ơn đã đặt bánh ạ!"].join("\n");
}
