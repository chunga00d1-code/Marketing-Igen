import { Response } from "express";
import { payOS, isPayOSConfigured } from "../config/payos";
import { AuthenticatedRequest } from "../middleware/auth";
import { TransactionModel } from "../model/transaction.model";
import { WalletModel } from "../model/wallet.model";
import { walletService } from "../service/wallet.service";

// Ty gia quy doi co dinh: 1 USD = 25,400 VND
const EXCHANGE_RATE = 25400;

export const walletController = {
  async getBalance(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Người dùng chưa xác thực." });
      }

      const wallet = await walletService.getOrCreateWallet(userId);

      return res.status(200).json({
        status: "success",
        balance: wallet.balance,
      });
    } catch (error: any) {
      console.error("[walletController.getBalance] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể lấy số dư ví",
        details: error.message,
      });
    }
  },

  async getTransactionHistory(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Người dùng chưa xác thực." });
      }

      const transactions = await TransactionModel.find({ userId }).sort({ createdAt: -1 });

      return res.status(200).json({
        status: "success",
        data: transactions,
      });
    } catch (error: any) {
      console.error("[walletController.getTransactionHistory] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể lấy lịch sử giao dịch",
        details: error.message,
      });
    }
  },

  async getAdminBalances(req: AuthenticatedRequest, res: Response) {
    try {
      const companyCode =
        typeof req.query.companyCode === "string" ? req.query.companyCode : undefined;
      const data = await walletService.getAdminBalanceList({ companyCode });

      return res.status(200).json({
        status: "success",
        data,
      });
    } catch (error: any) {
      console.error("[walletController.getAdminBalances] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể tải danh sách số dư người dùng",
        details: error.message,
      });
    }
  },

  async getAdminUserTransactions(req: AuthenticatedRequest, res: Response) {
    try {
      const userId =
        typeof req.params.userId === "string" ? req.params.userId : "";
      const limit = Number(req.query.limit || 20);

      if (!userId) {
        return res.status(400).json({ status: "error", message: "Thiếu userId cần truy vấn." });
      }

      const data = await walletService.getAdminTransactionHistory({
        targetUserId: userId,
        limit,
      });

      return res.status(200).json({
        status: "success",
        data,
      });
    } catch (error: any) {
      console.error("[walletController.getAdminUserTransactions] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể tải lịch sử giao dịch người dùng",
        details: error.message,
      });
    }
  },

  async adminSetBalance(req: AuthenticatedRequest, res: Response) {
    try {
      const actorUserId = req.user?.id;
      if (!actorUserId) {
        return res.status(401).json({ status: "error", message: "Người dùng chưa xác thực." });
      }

      const { userId, balance, note } = req.body || {};
      if (!userId) {
        return res.status(400).json({ status: "error", message: "Thiếu userId cần cập nhật." });
      }

      const normalizedBalance = Number(balance);
      if (!Number.isFinite(normalizedBalance) || normalizedBalance < 0) {
        return res.status(400).json({
          status: "error",
          message: "Số dư mới phải là số hợp lệ và không âm.",
        });
      }

      const data = await walletService.adminSetBalance({
        targetUserId: userId,
        balance: normalizedBalance,
        actorUserId,
        actorEmail: req.user?.email,
        note,
      });

      return res.status(200).json({
        status: "success",
        message: "Cập nhật số dư thành công.",
        data,
      });
    } catch (error: any) {
      console.error("[walletController.adminSetBalance] Error:", error);
      const statusCode = error.statusCode || 500;
      return res.status(statusCode).json({
        status: "error",
        message: error.message || "Không thể cập nhật số dư người dùng  ",
      });
    }
  },

  async createDepositLink(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ status: "error", message: "Người dùng chưa xác thực." });
      }

      const amountVND = Math.round(parseFloat(req.body.amount));
      if (isNaN(amountVND) || amountVND < 2000) {
        return res.status(400).json({
          status: "error",
          message: "Số tiền nạp tối thiểu là 2,000 VND.",
        });
      }

      const amountCredits = amountVND / 100; // 100 VND = 1 Credit

      let orderCode: number;
      let existing: any;
      do {
        orderCode = Math.floor(10000000 + Math.random() * 90000000);
        existing = await TransactionModel.findOne({ orderCode });
      } while (existing);

      const description = req.body.description || `Nap tien iGen: ${orderCode}`;
      const origin = req.headers.origin || req.headers.referer || "http://localhost:3000";
      const clientOrigin = origin.endsWith("/") ? origin.slice(0, -1) : origin;

      const cancelUrl = `${clientOrigin}/vi-nap-tien?status=cancelled&orderCode=${orderCode}`;
      const returnUrl = `${clientOrigin}/vi-nap-tien?status=success&orderCode=${orderCode}`;

      let checkoutUrl = "";
      let paymentLinkId = "";

      if (isPayOSConfigured && payOS) {
        try {
          const paymentResult = await payOS.paymentRequests.create({
            orderCode,
            amount: amountVND,
            description: `Nap ${orderCode}`,
            cancelUrl,
            returnUrl,
          });
          checkoutUrl = paymentResult.checkoutUrl;
          paymentLinkId = paymentResult.paymentLinkId;
        } catch (payosErr: any) {
          console.error("[PayOS SDK Error] Khong the tao link thanh toan:", payosErr);
          return res.status(500).json({
            status: "error",
            message: "Lỗi kết nối với cổng thanh toán PayOS. Vui lòng thử lại sau.",
            details: payosErr.message,
          });
        }
      } else {
        checkoutUrl = `${clientOrigin}/vi-nap-tien?mock=1&orderCode=${orderCode}&amount=${amountCredits}&amountVND=${amountVND}`;
        paymentLinkId = `mock_link_${orderCode}`;
      }

      const transaction = new TransactionModel({
        userId,
        orderCode,
        amount: amountCredits,
        type: "deposit",
        status: "pending",
        paymentLinkId,
        checkoutUrl,
        description,
      });

      await transaction.save();

      return res.status(200).json({
        status: "success",
        data: {
          orderCode,
          amount: amountCredits,
          checkoutUrl,
          paymentLinkId,
          isMock: !isPayOSConfigured,
        },
      });
    } catch (error: any) {
      console.error("[walletController.createDepositLink] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Không thể tạo yêu cầu nạp tiền",
        details: error.message,
      });
    }
  },

  async handlePayOSWebhook(req: AuthenticatedRequest, res: Response) {
    try {
      const webhookData = req.body;
      console.log("[PayOS Webhook] Nhan request:", JSON.stringify(webhookData));

      if (!isPayOSConfigured || !payOS) {
        return res.status(400).json({ status: "error", message: "PayOS chưa được cấu hình." });
      }

      let verifiedData: any;
      try {
        verifiedData = await payOS.webhooks.verify(webhookData);
      } catch (verifyErr: any) {
        console.error("[PayOS Webhook] Xac thuc chu ky that bai:", verifyErr);
        return res.status(400).json({ status: "error", message: "Chữ ký webhook không hợp lệ." });
      }

      // PayOS gửi code "00" khi thanh toán thành công.
      // Các code khác (CANCELLED, EXPIRED...) không cộng tiền.
      const payosCode = String(webhookData.code || "");
      if (payosCode !== "00") {
        console.log(`[PayOS Webhook] Webhook code=${payosCode}, bo qua khong cap nhat vi.`);
        return res.status(200).json({ status: "success", message: "Webhook received." });
      }

      const { orderCode, amount } = verifiedData;

      // PayOS gửi test request khi xác nhận webhook URL, orderCode=0 hoặc không có trong DB.
      const transaction = await TransactionModel.findOne({ orderCode });
      if (!transaction) {
        console.log(`[PayOS Webhook] orderCode=${orderCode} khong tim thay (co the la test request). Tra 200 OK.`);
        return res.status(200).json({ status: "success", message: "Webhook received." });
      }

      if (transaction.status === "success") {
        console.log(`[PayOS Webhook] Giao dich ${orderCode} da duoc cap nhat thanh cong truoc do.`);
        return res.status(200).json({ status: "success", message: "Giao dịch đã hoàn tất." });
      }

      transaction.status = "success";
      transaction.completedAt = new Date();
      await transaction.save();

      await WalletModel.findOneAndUpdate(
        { userId: transaction.userId },
        { $inc: { balance: transaction.amount }, $set: { updatedAt: new Date() } },
        { upsert: true, returnDocument: "after" }
      );

      console.log(
        `[PayOS Webhook] Nap tien thanh cong cho User ID: ${transaction.userId}, So tien: +${transaction.amount} Credit (${amount} VND)`
      );

      return res.status(200).json({
        status: "success",
        message: "Cộng tiền ví thành công",
      });
    } catch (error: any) {
      console.error("[walletController.handlePayOSWebhook] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi xử lý webhook nạp tiền",
        details: error.message,
      });
    }
  },

  async handleMockWebhook(req: AuthenticatedRequest, res: Response) {
    try {
      const { orderCode } = req.body;
      if (!orderCode) {
        return res.status(400).json({ status: "error", message: "Thiếu orderCode." });
      }

      const transaction = await TransactionModel.findOne({ orderCode });
      if (!transaction) {
        return res.status(404).json({ status: "error", message: "Không tìm thấy giao dịch." });
      }

      if (transaction.status === "success") {
        return res.status(200).json({ status: "success", message: "Giao dịch đã được thanh toán trước đó." });
      }

      transaction.status = "success";
      transaction.completedAt = new Date();
      await transaction.save();

      await WalletModel.findOneAndUpdate(
        { userId: transaction.userId },
        { $inc: { balance: transaction.amount }, $set: { updatedAt: new Date() } },
        { upsert: true, returnDocument: "after" }
      );

      console.log(`[Mock Webhook] Cong tien gia lap thanh cong: +${transaction.amount} Credit cho User ${transaction.userId}`);

      return res.status(200).json({
        status: "success",
        message: "Xác nhận thanh toán giả lập thành công",
      });
    } catch (error: any) {
      console.error("[walletController.handleMockWebhook] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi xử lý giả lập thanh toán",
        details: error.message,
      });
    }
  },

  async checkTransactionStatus(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const orderCode = parseInt(req.params.orderCode, 10);

      if (!userId) {
        return res.status(401).json({ status: "error", message: "Người dùng chưa xác thực." });
      }

      const transaction = await TransactionModel.findOne({ orderCode, userId });
      if (!transaction) {
        return res.status(404).json({ status: "error", message: "Giao dịch không tồn tại." });
      }

      if (transaction.status === "success") {
        return res.status(200).json({
          status: "success",
          transactionStatus: "success",
          amount: transaction.amount,
        });
      }

      if (isPayOSConfigured && payOS) {
        try {
          const payosStatus: any = await payOS.paymentRequests.get(transaction.orderCode);
          if (payosStatus.status === "PAID") {
            transaction.status = "success";
            transaction.completedAt = new Date();
            await transaction.save();

            await WalletModel.findOneAndUpdate(
              { userId: transaction.userId },
              { $inc: { balance: transaction.amount }, $set: { updatedAt: new Date() } },
              { upsert: true, returnDocument: "after" }
            );

            return res.status(200).json({
              status: "success",
              transactionStatus: "success",
              amount: transaction.amount,
            });
          }

          if (payosStatus.status === "CANCELLED") {
            transaction.status = "failed";
            await transaction.save();
            return res.status(200).json({
              status: "success",
              transactionStatus: "failed",
            });
          }
        } catch (checkErr) {
          console.error(`[PayOS Status Query Err] orderCode: ${orderCode}`, checkErr);
        }
      }

      return res.status(200).json({
        status: "success",
        transactionStatus: transaction.status,
      });
    } catch (error: any) {
      console.error("[walletController.checkTransactionStatus] Error:", error);
      return res.status(500).json({
        status: "error",
        message: "Lỗi khi kiểm tra trạng thái giao dịch",
        details: error.message,
      });
    }
  },
};
