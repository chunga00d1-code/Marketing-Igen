import { UserProfile, CompanyProfile, TelegramLinkStatus, CompanyHeyGenConfig } from "../types";

// Helper để lấy token từ localStorage
export function getAccessToken(): string | null {
  return localStorage.getItem("accessToken");
}

export const authService = {
  // Đăng ký bằng Email & Mật khẩu
  async registerWithEmail(email: string, password: string, displayName: string): Promise<any> {
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password, displayName }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Đăng ký thất bại");
    }

    const result = await res.json();
    return result.data;
  },

  // Đăng nhập bằng Email & Mật khẩu
  async loginWithEmail(email: string, password: string): Promise<any> {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Đăng nhập thất bại");
    }

    const result = await res.json();
    // Lưu token truy cập vào localStorage
    if (result.accessToken) {
      localStorage.setItem("accessToken", result.accessToken);
    }
    return result;
  },

  // Đăng nhập bằng Google (Chuyển sang JWT nên tạm thời báo không hỗ trợ)
  async loginWithGoogle(): Promise<any> {
    throw new Error("Đăng nhập bằng Google hiện không khả dụng. Vui lòng sử dụng tài khoản Email.");
  },

  // Đăng xuất
  async logout(): Promise<void> {
    localStorage.removeItem("accessToken");
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
      });
    } catch (err) {
      console.error("Lỗi khi gọi API đăng xuất phía server:", err);
    }
  },

  // Lấy chi tiết hồ sơ người dùng từ backend
  async getUserProfile(uid: string): Promise<UserProfile | null> {
    try {
      const res = await fetch("/api/v1/auth/me", {
        headers: {
          "Authorization": `Bearer ${getAccessToken()}`,
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user && (data.user._id === uid || data.user.uid === uid)) {
          return {
            ...data.user,
            uid: data.user._id,
          };
        }
      }
      return null;
    } catch (error) {
      console.error("Lỗi khi lấy thông tin người dùng từ Backend:", error);
      return null;
    }
  },

  // Lấy thông tin người dùng hiện tại thông qua JWT Token
  async getMe(): Promise<UserProfile | null> {
    try {
      const token = getAccessToken();
      if (!token) return null;

      const res = await fetch("/api/v1/auth/me", {
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        // Nếu token hết hạn, thử làm mới bằng refresh-token (cookie)
        const refreshRes = await fetch("/api/v1/auth/refresh-token", {
          method: "POST",
        });

        if (refreshRes.ok) {
          const refreshData = await refreshRes.json();
          if (refreshData.accessToken) {
            localStorage.setItem("accessToken", refreshData.accessToken);
            
            // Gọi lại API me với access token mới
            const retryRes = await fetch("/api/v1/auth/me", {
              headers: {
                "Authorization": `Bearer ${refreshData.accessToken}`,
              },
            });
            if (retryRes.ok) {
              const retryData = await retryRes.json();
              return {
                ...retryData.user,
                uid: retryData.user._id,
              };
            }
          }
        }
        return null;
      }

      const data = await res.json();
      return {
        ...data.user,
        uid: data.user._id,
      };
    } catch (error) {
      console.error("Lỗi khi tự động lấy thông tin phiên làm việc getMe:", error);
      return null;
    }
  },

  // Lấy danh sách toàn bộ người dùng
  async getAllUsers(): Promise<UserProfile[]> {
    const res = await fetch("/api/v1/auth/users", {
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể lấy danh sách người dùng");
    }

    const result = await res.json();
    return (result.data || []).map((u: any) => ({
      ...u,
      uid: u._id,
    }));
  },

  // Lấy danh sách người dùng theo Doanh nghiệp
  async getUsersByCompany(companyCode: string): Promise<UserProfile[]> {
    const res = await fetch(`/api/v1/auth/users?companyCode=${encodeURIComponent(companyCode)}`, {
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể lấy danh sách người dùng doanh nghiệp");
    }

    const result = await res.json();
    return (result.data || []).map((u: any) => ({
      ...u,
      uid: u._id,
    }));
  },

  // Cập nhật vai trò người dùng
  async updateUserRole(uid: string, newRole: "user" | "manager" | "admin" | "superadmin"): Promise<void> {
    const res = await fetch(`/api/v1/auth/users/${uid}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ role: newRole }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Cập nhật vai trò thất bại");
    }
  },

  // Lấy danh sách tất cả doanh nghiệp
  async getAllCompanies(): Promise<CompanyProfile[]> {
    const res = await fetch("/api/v1/auth/companies", {
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể lấy danh sách doanh nghiệp");
    }

    const result = await res.json();
    return (result.data || []).map((item: any) => ({
      ...item,
      id: item._id || item.id,
    }));
  },

  async updateCompany(companyId: string, updateData: { name?: string; code?: string; ownerEmail?: string }): Promise<CompanyProfile> {
    const res = await fetch(`/api/v1/auth/companies/${companyId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(updateData),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể cập nhật doanh nghiệp");
    }

    const result = await res.json();
    return {
      ...result.data,
      id: result.data._id || result.data.id,
    };
  },

  // Cập nhật chi tiết thông tin một nhân sự
  async updateUser(uid: string, updateData: any): Promise<void> {
    const res = await fetch(`/api/v1/auth/users/${uid}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(updateData),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Cập nhật thông tin nhân sự thất bại");
    }
  },

  // Cập nhật hàng loạt thông tin cấu trúc sơ đồ tổ chức
  async bulkUpdateUsers(updates: any[]): Promise<void> {
    const res = await fetch("/api/v1/auth/users/bulk", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ updates }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Cập nhật cấu trúc sơ đồ tổ chức thất bại");
    }
  },

  // Xóa nhân sự
  async deleteUser(uid: string): Promise<void> {
    const res = await fetch(`/api/v1/auth/users/${uid}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Xóa nhân sự thất bại");
    }
  },

  // Đăng ký doanh nghiệp mới và tạo tài khoản Admin tương ứng qua REST API
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
        "Authorization": `Bearer ${getAccessToken()}`,
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
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Đăng ký doanh nghiệp thất bại");
    }
  },

  // Đăng ký người dùng mới cho doanh nghiệp qua REST API
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
    }
  ): Promise<string> {
    const res = await fetch("/api/v1/auth/register-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
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
      }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Đăng ký thành viên thất bại");
    }

    const result = await res.json();
    return result.data._id; // Trả về ID của user vừa tạo
  },

  // Cập nhật thông tin hồ sơ cá nhân
  async updateProfileInfo(uid: string, displayName: string, photoURL: string): Promise<void> {
    await this.updateProfile({ displayName, photoURL });
  },

  // Cập nhật một hoặc nhiều trường trong hồ sơ qua REST API
  async updateProfile(updateData: any): Promise<UserProfile> {
    const res = await fetch("/api/v1/auth/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(updateData),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Cập nhật hồ sơ thất bại");
    }

    const result = await res.json();
    return {
      ...result.user,
      uid: result.user._id,
    };
  },

  async getCompanyHeyGenConfig(companyCode: string): Promise<{
    companyCode: string;
    companyName: string;
    heygenConfig: CompanyHeyGenConfig;
  }> {
    const res = await fetch(`/api/v1/auth/companies/${encodeURIComponent(companyCode)}/heygen`, {
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể lấy cấu hình HeyGen doanh nghiệp");
    }

    const result = await res.json();
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
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify(updateData),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể cập nhật cấu hình HeyGen doanh nghiệp");
    }

    const result = await res.json();
    return result.data;
  },

  async testCompanyHeyGenConfig(companyCode: string, apiKey?: string): Promise<any> {
    const res = await fetch(`/api/v1/auth/companies/${encodeURIComponent(companyCode)}/heygen/test`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ apiKey }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể kiểm tra kết nối HeyGen");
    }

    const result = await res.json();
    return result.data;
  },

  async syncCompanyHeyGenLibrary(companyCode: string): Promise<any> {
    const res = await fetch(`/api/v1/auth/companies/${encodeURIComponent(companyCode)}/heygen/sync`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể đồng bộ thư viện HeyGen");
    }

    const result = await res.json();
    return result.data;
  },

  async getTelegramLinkStatus(): Promise<TelegramLinkStatus> {
    const res = await fetch("/api/v1/auth/telegram-link", {
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể lấy trạng thái liên kết Telegram");
    }

    const result = await res.json();
    return result.data;
  },

  async createTelegramLinkCode(): Promise<TelegramLinkStatus> {
    const res = await fetch("/api/v1/auth/telegram-link", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể tạo mã liên kết Telegram");
    }

    const result = await res.json();
    return result.data;
  },

  async unlinkTelegram(): Promise<TelegramLinkStatus> {
    const res = await fetch("/api/v1/auth/telegram-link", {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${getAccessToken()}`,
      },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Không thể gỡ liên kết Telegram");
    }

    const result = await res.json();
    return result.data;
  },

  // Thay đổi mật khẩu người dùng qua REST API
  async changePassword(password: string): Promise<void> {
    const res = await fetch("/api/v1/auth/change-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({ password }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || "Thay đổi mật khẩu thất bại");
    }
  },

  // Tải ảnh đại diện lên Cloudinary thông qua Relay API trên server
  async uploadAvatar(uid: string, file: File): Promise<string> {
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = (error) => reject(error);
      });

      const response = await fetch('/api/v1/media/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${getAccessToken()}`
        },
        body: JSON.stringify({
          file: base64Data,
          folder: `igen_erp/avatars`,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Lỗi tải lên Cloudinary: ${response.statusText}`);
      }

      const data = await response.json();
      return data.url;
    } catch (e) {
      console.error("[authService.uploadAvatar] Error:", e);
      throw e;
    }
  }
};
