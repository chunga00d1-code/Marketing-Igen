import type { CakeCheckoutSnapshot } from "../model/cake-checkout.model";

export function cakePaidMessage(snapshot: CakeCheckoutSnapshot) {
  const d = snapshot.details;
  const money = (value: number) => `${value.toLocaleString("vi-VN")}đ`;
  return [`Dạ ${snapshot.sellerAddress || "em"} nhận được ${money(snapshot.deposit)} tiền cọc rồi ạ.`,
    `Bánh: ${snapshot.variant.name}${d.cakeType ? `, ${d.cakeType}` : ""}${snapshot.variant.size ? `, size ${snapshot.variant.size}cm` : ""}${snapshot.variant.height ? `, cao ${snapshot.variant.height}cm` : ""}; số lượng: ${d.quantity}.`,
    d.imageUrl ? `Mẫu bánh: ${d.imageUrl}` : `Trang trí: ${d.decoration}`,
    `Chữ trên bánh: ${d.inscription}`, `Người nhận: ${d.customerName} — ${d.customerPhone}`,
    `${d.fulfillmentMethod === "delivery" ? "Giao đến" : "Nhận tại"}: ${d.fulfillmentMethod === "delivery" ? d.deliveryAddress : d.pickupLocation}`,
    `Ngày giờ nhận: ${d.pickupAt.replace("T", " ")} (giờ Việt Nam)`,
    ...(d.fulfillmentMethod === "delivery" ? [snapshot.shippingFee
      ? `Phí giao đã ghi nhận trong đơn cũ: ${money(snapshot.shippingFee)}`
      : "Phí vận chuyển khách thanh toán riêng, không nằm trong tiền bánh/cọc."] : []),
    `Tổng tiền: ${money(snapshot.total)}. Còn lại ${money(snapshot.balance)} thanh toán khi nhận bánh nhé.`,
    "Cảm ơn đã đặt bánh ạ!"].join("\n");
}
