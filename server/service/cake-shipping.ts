import type { CakeCheckoutSnapshot } from "../model/cake-checkout.model";

export function cakePaidMessage(snapshot: CakeCheckoutSnapshot) {
  return `Dạ ${snapshot.sellerAddress || "em"} nhận được tiền cọc rồi ạ. Cảm ơn ${snapshot.customerAddress || "bạn"} nhé!`;
}
