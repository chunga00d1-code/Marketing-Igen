import { UserProfile, CompanyProfile, TelegramLinkStatus, CompanyHeyGenConfig, CompanyTelegramOrderConfig, CompanySepayConfig, CompanyProductCatalogConfig } from "../types";

export function getAccessToken(): string | null {
  return localStorage.getItem("accessToken");
}

type ApiErrorResponse = {
  message?: string;
  details?: string;
};

type UserRecord = UserProfile & { _id?: string; id?: string };
type CompanyRecord = CompanyProfile & { _id?: string };
type AuthResult = {
  accessToken?: string;
  user: UserRecord;
};

function normalizeUserProfile(user: UserRecord): UserProfile {
  return {
    ...user,
    uid: String(user._id || user.id || user.uid),
  };
}

function normalizeCompanyProfile(company: CompanyRecord): CompanyProfile {
  return {
    ...company,
    id: String(company._id || company.id),
  };
}

async function parseErrorResponse(res: Response, fallbackMessage: string): Promise<never> {
  const data = (await res.json().catch(() => ({}))) as ApiErrorResponse;
  throw new Error(data.message || data.details || fallbackMessage);
}

async function parseJson<T>(res: Response, fallbackMessage: string): Promise<T> {
  if (!res.ok) {
    return parseErrorResponse(res, fallbackMessage);
  }
  return (await res.json()) as T;
}

export const authService = {
  async registerWithEmail(email: string, password: string, displayName: string): Promise<UserProfile> {
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, displayName }),
    });

    const result = await parseJson<{ data: UserRecord }>(res, "Dang ky that bai");
    return normalizeUserProfile(result.data);
  },

  async loginWithEmail(email: string, password: string): Promise<{ accessToken?: string; user: UserProfile }> {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const result = await parseJson<AuthResult>(res, "Dang nhap that bai");
    if (result.accessToken) {
      localStorage.setItem("accessToken", result.accessToken);
    }
    return {
      accessToken: result.accessToken,
      user: normalizeUserProfile(result.user),
    };
  },

  async loginWithGoogle(): Promise<never> {
    throw new Error("Dang nhap bang Google hien khong kha dung. Vui long su dung tai khoan Email.");
  },

  async logout(): Promise<void> {
    localStorage.removeItem("accessToken");
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
      });
    } catch (error) {
      console.error("Loi khi goi API dang xuat phia server:", error);
    }
  },

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const res = await fetch("/api/v1/auth/me", {
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });
      if (!res.ok) return null;

      const data = (await res.json()) as { user?: UserRecord };
      if (!data.user) return null;

      const profile = normalizeUserProfile(data.user);
      return profile.uid === uid ? profile : null;
    } catch (error) {
      console.error("Loi khi lay thong tin nguoi dung tu backend:", error);
      return null;
    }
  },

  async getMe(): Promise<UserProfile | null> {
    try {
      const token = getAccessToken();
      if (!token) return null;

      const res = await fetch("/api/v1/auth/me", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const refreshRes = await fetch("/api/v1/auth/refresh-token", {
          method: "POST",
        });
        if (!refreshRes.ok) return null;

        const refreshData = (await refreshRes.json()) as { accessToken?: string };
        if (!refreshData.accessToken) return null;

        localStorage.setItem("accessToken", refreshData.accessToken);
        const retryRes = await fetch("/api/v1/auth/me", {
          headers: {
            Authorization: `Bearer ${refreshData.accessToken}`,
          },
        });
        if (!retryRes.ok) return null;

        const retryData = (await retryRes.json()) as { user: UserRecord };
        return normalizeUserProfile(retryData.user);
      }

      const data = (await res.json()) as { user: UserRecord };
      return normalizeUserProfile(data.user);
    } catch (error) {
      console.error("Loi khi tu dong lay thong tin phien lam viec getMe:", error);
      return null;
    }
  },

  async getAllUsers(): Promise<UserProfile[]> {
    const res = await fetch("/api/v1/auth/users", {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseJson<{ data?: UserRecord[] }>(res, "Khong the lay danh sach nguoi dung");
    return (result.data || []).map(normalizeUserProfile);
  },

  async getUsersByCompany(companyCode: string): Promise<UserProfile[]> {
    const res = await fetch(`/api/v1/auth/users?companyCode=${encodeURIComponent(companyCode)}`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseJson<{ data?: UserRecord[] }>(res, "Khong the lay danh sach nguoi dung doanh nghiep");
    return (result.data || []).map(normalizeUserProfile);
  },

  async updateUserRole(uid: string, newRole: UserProfile["role"]): Promise<void> {
    const res = await fetch(`/api/v1/auth/users/${uid}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ role: newRole }),
    });

    if (!res.ok) {
      await parseErrorResponse(res, "Cap nhat vai tro that bai");
    }
  },

  async getAllCompanies(): Promise<CompanyProfile[]> {
    const res = await fetch("/api/v1/auth/companies", {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseJson<{ data?: CompanyRecord[] }>(res, "Khong the lay danh sach doanh nghiep");
    return (result.data || []).map(normalizeCompanyProfile);
  },

  async updateCompany(companyId: string, updateData: { name?: string; code?: string; ownerEmail?: string }): Promise<CompanyProfile> {
    const res = await fetch(`/api/v1/auth/companies/${companyId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(updateData),
    });

    const result = await parseJson<{ data: CompanyRecord }>(res, "Khong the cap nhat doanh nghiep");
    return normalizeCompanyProfile(result.data);
  },

  async updateUser(uid: string, updateData: Partial<UserProfile>): Promise<void> {
    const res = await fetch(`/api/v1/auth/users/${uid}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(updateData),
    });

    if (!res.ok) {
      await parseErrorResponse(res, "Cap nhat thong tin nhan su that bai");
    }
  },

  async bulkUpdateUsers(updates: Array<{ uid: string; updateData: Partial<UserProfile> }>): Promise<void> {
    const res = await fetch("/api/v1/auth/users/bulk", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ updates }),
    });

    if (!res.ok) {
      await parseErrorResponse(res, "Cap nhat cau truc so do to chuc that bai");
    }
  },

  async deleteUser(uid: string): Promise<void> {
    const res = await fetch(`/api/v1/auth/users/${uid}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      await parseErrorResponse(res, "Xoa nhan su that bai");
    }
  },

  async registerCompanyAndAdmin(
    companyName: string,
    companyCode: string,
    ownerName: string,
    ownerEmail: string,
    ownerPassword: string
  ): Promise<void> {
    const res = await fetch("/api/v1/auth/register-company", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({
        companyName,
        companyCode,
        ownerName,
        ownerEmail,
        ownerPassword,
      }),
    });

    if (!res.ok) {
      await parseErrorResponse(res, "Dang ky doanh nghiep that bai");
    }
  },

  async registerUserForCompany(
    displayName: string,
    email: string,
    password: string,
    role: "user" | "manager" | "admin",
    companyCode: string,
    companyName: string,
    parentId?: string,
    managerLevel?: number,
    department?: string,
    division?: string,
    phone?: string,
    heygenAccess?: {
      avatarIds?: string[];
      avatarId?: string;
      voiceId?: string;
      apiKey?: string;
    },
    elevenlabsAccess?: {
      apiKey?: string;
    }
  ): Promise<string> {
    const res = await fetch("/api/v1/auth/register-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({
        displayName,
        email,
        password,
        role,
        companyCode,
        companyName,
        parentId,
        level: parentId && managerLevel ? managerLevel + 1 : undefined,
        department,
        division,
        phone,
        heygenAccess,
        elevenlabsAccess,
      }),
    });

    const result = await parseJson<{ data: UserRecord }>(res, "Dang ky thanh vien that bai");
    return String(result.data._id || result.data.uid || result.data.id);
  },

  async updateProfileInfo(_uid: string, displayName: string, photoURL: string): Promise<void> {
    await this.updateProfile({ displayName, photoURL });
  },

  async updateProfile(updateData: Partial<UserProfile>): Promise<UserProfile> {
    const res = await fetch("/api/v1/auth/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(updateData),
    });

    const result = await parseJson<{ user: UserRecord }>(res, "Cap nhat ho so that bai");
    return normalizeUserProfile(result.user);
  },

  async getCompanyHeyGenConfig(companyCode: string): Promise<{
    companyCode: string;
    companyName: string;
    heygenConfig: CompanyHeyGenConfig;
  }> {
    const res = await fetch(`/api/v1/auth/companies/${encodeURIComponent(companyCode)}/heygen`, {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseJson<{ data: { companyCode: string; companyName: string; heygenConfig: CompanyHeyGenConfig } }>(
      res,
      "Khong the lay cau hinh HeyGen doanh nghiep"
    );
    return result.data;
  },

  async updateCompanyHeyGenConfig(companyCode: string, updateData: Partial<CompanyHeyGenConfig>): Promise<{
    companyCode: string;
    companyName: string;
    heygenConfig: CompanyHeyGenConfig;
  }> {
    const res = await fetch(`/api/v1/auth/companies/${encodeURIComponent(companyCode)}/heygen`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(updateData),
    });

    const result = await parseJson<{ data: { companyCode: string; companyName: string; heygenConfig: CompanyHeyGenConfig } }>(
      res,
      "Khong the cap nhat cau hinh HeyGen doanh nghiep"
    );
    return result.data;
  },

  async testCompanyHeyGenConfig(companyCode: string, apiKey?: string): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/v1/auth/companies/${encodeURIComponent(companyCode)}/heygen/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ apiKey }),
    });

    const result = await parseJson<{ data: Record<string, unknown> }>(res, "Khong the kiem tra ket noi HeyGen");
    return result.data;
  },

  async syncCompanyHeyGenLibrary(companyCode: string): Promise<Record<string, unknown>> {
    const res = await fetch(`/api/v1/auth/companies/${encodeURIComponent(companyCode)}/heygen/sync`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseJson<{ data: Record<string, unknown> }>(res, "Khong the dong bo thu vien HeyGen");
    return result.data;
  },

  async getCompanyTelegramOrderConfig(): Promise<CompanyTelegramOrderConfig> {
    const res = await fetch("/api/v1/company-telegram-order", {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    const result = await parseJson<{ data: CompanyTelegramOrderConfig }>(res, "Khong the lay cau hinh Telegram");
    return result.data;
  },

  async updateCompanyTelegramOrderConfig(updateData: {
    enabled: boolean;
    notifyNewOrder: boolean;
    botToken?: string;
    groupChatId: string;
    messageThreadId: number | null;
  }): Promise<CompanyTelegramOrderConfig> {
    const res = await fetch("/api/v1/company-telegram-order", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken()}` },
      body: JSON.stringify(updateData),
    });
    const result = await parseJson<{ data: CompanyTelegramOrderConfig }>(res, "Khong the luu cau hinh Telegram");
    return result.data;
  },

  async testCompanyTelegramOrderConfig(input: { botToken?: string; groupChatId: string; messageThreadId: number | null }) {
    const res = await fetch("/api/v1/company-telegram-order/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken()}` },
      body: JSON.stringify(input),
    });
    return (await parseJson<{ data: { ok: boolean; botUsername: string; chatTitle: string } }>(res, "Khong the kiem tra Telegram")).data;
  },

  async getCompanySepayConfig(): Promise<CompanySepayConfig> {
    const res = await fetch("/api/v1/company-sepay", {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    return (await parseJson<{ data: CompanySepayConfig }>(res, "Không thể tải cấu hình SePay")).data;
  },

  async updateCompanySepayConfig(input: {
    enabled: boolean;
    webhookSecret?: string;
    accountNumbers: string[];
    paymentCodePrefix: string;
    depositEnabled: boolean;
    depositPercent: number;
    qrBankId: string;
    qrAccountNumber: string;
    qrAccountName: string;
  }): Promise<CompanySepayConfig> {
    const res = await fetch("/api/v1/company-sepay", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken()}` },
      body: JSON.stringify(input),
    });
    return (await parseJson<{ data: CompanySepayConfig }>(res, "Không thể lưu cấu hình SePay")).data;
  },

  async getCompanyProductCatalogConfig(): Promise<CompanyProductCatalogConfig> {
    const res = await fetch("/api/v1/company-product-catalog", {
      headers: { Authorization: `Bearer ${getAccessToken()}` },
    });
    return (await parseJson<{ data: CompanyProductCatalogConfig }>(res, "Không thể tải cấu hình thư viện ảnh sản phẩm.")).data;
  },

  async updateCompanyProductCatalogConfig(input: {
    enabled: boolean;
    rootFolderUrl: string;
    maxImagesPerReply: number;
    catalogName: string;
    itemLabel: string;
    selectionMessage: string;
    businessDescription: string;
    categoryAliases: Record<string, string[]>;
  }): Promise<CompanyProductCatalogConfig> {
    const res = await fetch("/api/v1/company-product-catalog", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken()}` },
      body: JSON.stringify(input),
    });
    return (await parseJson<{ data: CompanyProductCatalogConfig }>(res, "Không thể lưu cấu hình thư viện ảnh sản phẩm.")).data;
  },

  async testCompanyProductCatalogConfig(input: { rootFolderUrl: string; catalogName: string }) {
    const res = await fetch("/api/v1/company-product-catalog/test", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAccessToken()}` },
      body: JSON.stringify(input),
    });
    return (await parseJson<{ data: { categoryCount: number; imageCount: number; categories: Array<{ name: string; imageCount: number }>; previewImageUrl: string } }>(res, "Không thể đọc thư mục Google Drive.")).data;
  },

  async getCompanyCakeCatalogConfig(): Promise<CompanyProductCatalogConfig> {
    return this.getCompanyProductCatalogConfig();
  },

  async updateCompanyCakeCatalogConfig(input: {
    enabled: boolean;
    rootFolderUrl: string;
    maxImagesPerReply: number;
    catalogName: string;
    itemLabel: string;
    selectionMessage: string;
    businessDescription: string;
    categoryAliases: Record<string, string[]>;
  }) {
    return this.updateCompanyProductCatalogConfig(input);
  },

  async testCompanyCakeCatalogConfig(rootFolderUrl: string) {
    return this.testCompanyProductCatalogConfig({ rootFolderUrl, catalogName: "Thư viện sản phẩm" });
  },

  async getTelegramLinkStatus(): Promise<TelegramLinkStatus> {
    const res = await fetch("/api/v1/auth/telegram-link", {
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseJson<{ data: TelegramLinkStatus }>(res, "Khong the lay trang thai lien ket Telegram");
    return result.data;
  },

  async createTelegramLinkCode(): Promise<TelegramLinkStatus> {
    const res = await fetch("/api/v1/auth/telegram-link", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseJson<{ data: TelegramLinkStatus }>(res, "Khong the tao ma lien ket Telegram");
    return result.data;
  },

  async unlinkTelegram(): Promise<TelegramLinkStatus> {
    const res = await fetch("/api/v1/auth/telegram-link", {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${getAccessToken()}`,
      },
    });

    const result = await parseJson<{ data: TelegramLinkStatus }>(res, "Khong the go lien ket Telegram");
    return result.data;
  },

  async changePassword(password: string): Promise<void> {
    const res = await fetch("/api/v1/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      await parseErrorResponse(res, "Thay doi mat khau that bai");
    }
  },

  async uploadAvatar(_uid: string, file: File): Promise<string> {
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });

      const response = await fetch("/api/v1/media/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({
          file: base64Data,
          folder: "igen_erp/avatars",
        }),
      });

      const data = await parseJson<{ url: string }>(response, `Loi tai len Cloudinary: ${response.statusText}`);
      return data.url;
    } catch (error) {
      console.error("[authService.uploadAvatar] Error:", error);
      throw error;
    }
  },
};
