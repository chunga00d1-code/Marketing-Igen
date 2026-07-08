import { getAccessToken } from "./authService";

export interface TransactionInfo {
  _id: string;
  userId: string;
  orderCode: number;
  amount: number;
  type: "deposit" | "payment" | "withdraw";
  status: "pending" | "success" | "failed";
  paymentLinkId?: string;
  checkoutUrl?: string;
  description?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AdminUserBalance {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  companyCode: string;
  companyName: string;
  balance: number;
  currency: string;
  updatedAt?: string;
}

export interface AdminTransactionInfo extends TransactionInfo {}

async function parseApiResponse<T>(res: Response, fallbackMessage: string): Promise<T> {
  const contentType = res.headers.get("content-type") || "";
  const rawBody = await res.text();
  const isJson = contentType.includes("application/json");

  if (!rawBody) {
    if (!res.ok) {
      throw new Error(fallbackMessage);
    }
    return {} as T;
  }

  if (!isJson) {
    const shortBody = rawBody.slice(0, 120).trim();
    throw new Error(
      `${fallbackMessage}. API trả về dữ liệu không phải JSON (${res.status} ${res.statusText}). Preview: ${shortBody}`
    );
  }

  let data: any;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error(`${fallbackMessage}. Không parse được JSON từ server.`);
  }

  if (!res.ok) {
    throw new Error(data.message || fallbackMessage);
  }

  return data as T;
}

export const walletService = {
  async getWalletBalance(): Promise<number> {
    const res = await fetch("/api/v1/wallet/balance", {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseApiResponse<{ balance: number }>(res, "Không thể lấy số dư ví");
    return result.balance ?? 0;
  },

  async getTransactionHistory(): Promise<TransactionInfo[]> {
    const res = await fetch("/api/v1/wallet/transactions", {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseApiResponse<{ data?: TransactionInfo[] }>(
      res,
      "Không thể tải lịch sử giao dịch"
    );
    return result.data || [];
  },

  async getAdminBalances(companyCode?: string): Promise<AdminUserBalance[]> {
    const query = companyCode ? `?companyCode=${encodeURIComponent(companyCode)}` : "";
    const res = await fetch(`/api/v1/wallet/admin/balances${query}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseApiResponse<{ data?: AdminUserBalance[] }>(
      res,
      "Không thể tải danh sách số dư người dùng"
    );
    return result.data || [];
  },

  async updateUserBalance(userId: string, balance: number, note?: string): Promise<AdminUserBalance> {
    const res = await fetch("/api/v1/wallet/admin/balance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ userId, balance, note }),
    });

    const result = await parseApiResponse<{ data: AdminUserBalance }>(
      res,
      "Không thể cập nhật số dư người dùng"
    );
    return result.data;
  },

  async getAdminUserTransactions(userId: string, limit = 20): Promise<AdminTransactionInfo[]> {
    const res = await fetch(`/api/v1/wallet/admin/transactions/${userId}?limit=${limit}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseApiResponse<{ data?: AdminTransactionInfo[] }>(
      res,
      "Không thể tải lịch sử giao dịch người dùng"
    );
    return result.data || [];
  },

  async createDepositLink(amount: number, description?: string): Promise<{
    checkoutUrl: string;
    orderCode: number;
    paymentLinkId: string;
    isMock: boolean;
  }> {
    const res = await fetch("/api/v1/wallet/deposit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ amount, description }),
    });

    const result = await parseApiResponse<{
      data: {
        checkoutUrl: string;
        orderCode: number;
        paymentLinkId: string;
        isMock: boolean;
      };
    }>(res, "Không thể tạo liên kết nạp tiền");
    return result.data;
  },

  async confirmMockPayment(orderCode: number): Promise<any> {
    const res = await fetch("/api/v1/wallet/webhook-mock", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ orderCode }),
    });

    return await parseApiResponse<any>(res, "Lỗi khi xác nhận thanh toán giả lập");
  },

  async checkTransactionStatus(orderCode: number): Promise<{
    transactionStatus: "pending" | "success" | "failed";
    amount?: number;
  }> {
    const res = await fetch(`/api/v1/wallet/check/${orderCode}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    return await parseApiResponse<{
      transactionStatus: "pending" | "success" | "failed";
      amount?: number;
    }>(res, "Không thể kiểm tra trạng thái giao dịch");
  },
};
