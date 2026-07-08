import { TransactionModel } from "../model/transaction.model";
import { UserModel } from "../model/user.model";
import { WalletModel } from "../model/wallet.model";

// Bang gia dich vu API (don vi: Credit)
export const API_COSTS = {
  GEMINI_CHAT: 2.5,
  GEMINI_MARKETING: 2.5,
  GEMINI_IMAGE: 27.5,
  GEMINI_VIDEO: 324,
  GEMINI_OPTIMIZE: 2.5,
  GEMINI_FAQ: 2.5,
  ELEVENLABS_TTS_CHAR: 0.005,
  ELEVENLABS_MIN: 1.0,
  HEYGEN_VIDEO: 100,
};

type AdminBalanceFilters = {
  companyCode?: string;
};

type AdminSetBalanceInput = {
  targetUserId: string;
  balance: number;
  actorUserId: string;
  actorEmail?: string;
  note?: string;
};

type AdminTransactionFilters = {
  targetUserId: string;
  limit?: number;
};

export const walletService = {
  async getOrCreateWallet(userId: string) {
    let wallet = await WalletModel.findOne({ userId });
    if (!wallet) {
      wallet = new WalletModel({ userId, balance: 0 });
      await wallet.save();
    }
    return wallet;
  },

  /**
   * Kiem tra xem nguoi dung co du so du vi de thuc hien yeu cau khong
   */
  async checkBalance(userId: string, amount: number): Promise<void> {
    if (amount <= 0) return;

    const wallet = await this.getOrCreateWallet(userId);

    if (wallet.balance < amount) {
      const error: any = new Error(
        "Số dư ví không đủ. Vui lòng nạp thêm tiền vào ví để tiếp tục sử dụng dịch vụ."
      );
      error.statusCode = 402;
      throw error;
    }
  },

  /**
   * Khau tru so du vi nguoi dung sau khi API thuc hien thanh cong
   */
  async deductBalance(userId: string, amount: number, description: string): Promise<any> {
    if (amount <= 0) return null;

    const wallet = await WalletModel.findOneAndUpdate(
      { userId },
      { $inc: { balance: -amount }, $set: { updatedAt: new Date() } },
      { upsert: true, returnDocument: "after" }
    );

    let orderCode: number;
    let existing: any;
    do {
      orderCode = Math.floor(10000000 + Math.random() * 90000000);
      existing = await TransactionModel.findOne({ orderCode });
    } while (existing);

    const transaction = new TransactionModel({
      userId,
      orderCode,
      amount,
      type: "payment",
      status: "success",
      description,
      createdAt: new Date(),
      completedAt: new Date(),
    });
    await transaction.save();

    console.log(
      `[Wallet Service] Khau tru thanh cong ${amount} Credit tu User ID: ${userId} (${description}). So du moi: ${wallet.balance} Credit.`
    );
    return { wallet, transaction };
  },

  async getAdminBalanceList(filters: AdminBalanceFilters = {}) {
    const userQuery: Record<string, any> = {};
    if (filters.companyCode && filters.companyCode !== "all") {
      userQuery.companyCode = filters.companyCode;
    }

    const users = await UserModel.find(userQuery)
      .select("displayName email role companyCode companyName createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const userIds = users.map((user) => String(user._id));
    const wallets = userIds.length > 0 ? await WalletModel.find({ userId: { $in: userIds } }).lean() : [];
    const walletMap = new Map(wallets.map((wallet) => [wallet.userId, wallet]));

    return users.map((user) => {
      const userId = String(user._id);
      const wallet = walletMap.get(userId);
      return {
        userId,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        companyCode: user.companyCode || "",
        companyName: user.companyName || "",
        balance: wallet?.balance ?? 0,
        currency: wallet?.currency || "USD",
        updatedAt: wallet?.updatedAt || user.createdAt,
      };
    });
  },

  async getAdminTransactionHistory(filters: AdminTransactionFilters) {
    const limit = Math.max(1, Math.min(filters.limit || 20, 100));
    return await TransactionModel.find({ userId: filters.targetUserId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  },

  async adminSetBalance(input: AdminSetBalanceInput) {
    const { targetUserId, balance, actorUserId, actorEmail, note } = input;

    if (!Number.isFinite(balance) || balance < 0) {
      const error: any = new Error("Số dư mới không hợp lệ.");
      error.statusCode = 400;
      throw error;
    }

    const targetUser = await UserModel.findById(targetUserId).select("displayName email");
    if (!targetUser) {
      const error: any = new Error("Không tìm thấy người dùng cần cập nhật số dư.");
      error.statusCode = 404;
      throw error;
    }

    const wallet = await this.getOrCreateWallet(targetUserId);
    const previousBalance = wallet.balance ?? 0;
    const normalizedBalance = Number(balance.toFixed(2));
    const delta = Number((normalizedBalance - previousBalance).toFixed(2));

    wallet.balance = normalizedBalance;
    wallet.updatedAt = new Date();
    await wallet.save();

    if (delta !== 0) {
      let orderCode: number;
      let existing: any;
      do {
        orderCode = Math.floor(10000000 + Math.random() * 90000000);
        existing = await TransactionModel.findOne({ orderCode });
      } while (existing);

      const actorLabel = actorEmail || actorUserId;
      const descriptionParts = [
        `Superadmin ${actorLabel} đã chỉnh sửa số dư ví`,
        `từ ${previousBalance.toFixed(2)} Credit thành ${normalizedBalance.toFixed(2)} Credit`,
      ];
      if (note?.trim()) {
        descriptionParts.push(`Ghi chú: ${note.trim()}`);
      }

      const transaction = new TransactionModel({
        userId: targetUserId,
        orderCode,
        amount: Math.abs(delta),
        type: delta > 0 ? "deposit" : "withdraw",
        status: "success",
        description: descriptionParts.join(". "),
        createdAt: new Date(),
        completedAt: new Date(),
      });
      await transaction.save();
    }

    return {
      userId: targetUserId,
      displayName: targetUser.displayName,
      email: targetUser.email,
      balance: wallet.balance,
      currency: wallet.currency,
      updatedAt: wallet.updatedAt,
    };
  },
};
