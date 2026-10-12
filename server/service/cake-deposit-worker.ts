import { randomUUID } from "node:crypto";
import { MessengerOrderModel } from "../model/messenger-order.model";
import { messengerOrderService } from "./messenger-order.service";
import { companySepayService } from "./company-sepay.service";
import { cakeCustomerMemory } from "./cake-customer-memory";

let running = false;
let timer: NodeJS.Timeout | undefined;

/** Mongo lease coordinates API replicas; the order remains recoverable after a restart. */
export async function processCakeDeposits() {
  if (running) return;
  running = true;
  try {
    for (let count = 0; count < 10; count++) {
      const token = randomUUID();
      const order = await MessengerOrderModel.findOneAndUpdate({
        checkoutFlow: "cake_deposit", depositStatus: "verified", depositSyncCompletedAt: { $exists: false },
        depositSyncAttempts: { $lt: 8 },
        $and: [
          { $or: [{ depositSyncNextAt: { $exists: false } }, { depositSyncNextAt: { $lte: new Date() } }] },
          { $or: [{ depositSyncLeaseUntil: { $exists: false } }, { depositSyncLeaseUntil: { $lt: new Date() } }] },
        ],
      }, { $set: { depositSyncLeaseToken: token, depositSyncLeaseUntil: new Date(Date.now() + 300_000) },
        $inc: { depositSyncAttempts: 1 } }, { new: true, sort: { sepayVerifiedAt: 1 } });
      if (!order) break;
      const lease = { _id: order._id, depositSyncLeaseToken: token };
      const heartbeat = setInterval(() => {
        void MessengerOrderModel.updateOne(lease, { $set: { depositSyncLeaseUntil: new Date(Date.now() + 300_000) } }).catch(() => undefined);
      }, 30_000);
      heartbeat.unref();
      try {
        // Notify independently so a Sheet outage does not hide a successful deposit.
        await cakeCustomerMemory.refreshPurchases({ companyCode: order.companyCode, pageId: order.pageId, conversationId: order.conversationId.toString() });
        await companySepayService.notifyCustomerPayment(order.orderId);
        const synced = await messengerOrderService.syncConfirmedDepositOrder(order.orderId);
        if (synced?.status !== "synced") throw new Error(synced?.lastSyncError || "Sheet chưa sẵn sàng để nhận đơn cọc.");
        const current = await MessengerOrderModel.findById(order._id).lean();
        if (!current?.sepayCustomerNotifiedAt) throw new Error(current?.sepayCustomerNotificationError || "Chưa gửi được xác nhận cọc cho khách.");
        await MessengerOrderModel.updateOne(lease, { $set: { depositSyncCompletedAt: new Date(), depositSyncError: "" } });
      } catch (error) {
        await MessengerOrderModel.updateOne(lease, { $set: {
          depositSyncError: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
          depositSyncNextAt: new Date(Date.now() + Math.min(3_600_000, 30_000 * 2 ** (order.depositSyncAttempts || 1))),
        } });
        console.error(`[CakeDeposit] Cần thử lại đồng bộ đơn ${order.orderId}, lần ${order.depositSyncAttempts}`);
      } finally {
        clearInterval(heartbeat);
        await MessengerOrderModel.updateOne(lease, { $unset: { depositSyncLeaseToken: 1, depositSyncLeaseUntil: 1 } });
      }
    }
  } finally { running = false; }
}

export function startCakeDepositWorker() {
  if (timer) return;
  const tick = () => { void processCakeDeposits().catch(error => console.error("[CakeDeposit] Worker:", error)); };
  timer = setInterval(tick, 15_000);
  timer.unref();
  tick();
}
