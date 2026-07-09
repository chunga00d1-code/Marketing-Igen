/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useState } from "react";
import { authService } from "../services/authService";
import { UserProfile, FacebookIntegration, TikTokIntegration, ZaloIntegration, AIChatConfig } from "../types";
import { toast } from "../pages/Toast";
import { parseAppError } from "../utils/errorParser";

interface AuthContextType {
  user: UserProfile | null;
  userProfile: UserProfile | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName: string, rememberMe?: boolean) => Promise<void>;
  loginWithGoogle: (rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  updateProfileInfo: (displayName: string, photoURL: string) => Promise<void>;
  uploadAvatar: (file: File) => Promise<string>;
  saveFacebookIntegration: (integration: FacebookIntegration) => Promise<void>;
  removeFacebookIntegration: () => Promise<void>;
  saveTikTokIntegration: (integration: TikTokIntegration) => Promise<void>;
  removeTikTokIntegration: () => Promise<void>;
  saveZaloIntegration: (integration: ZaloIntegration) => Promise<void>;
  removeZaloIntegration: () => Promise<void>;
  updateAiAutoReplyConfig: (config: AIChatConfig) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const profile = await authService.getMe();
        if (profile) {
          setUser(profile);
          setUserProfile(profile);
        } else {
          setUser(null);
          setUserProfile(null);
        }
      } catch (error) {
        console.error("Loi khi khoi phuc phien dang nhap JWT:", error);
        setUser(null);
        setUserProfile(null);
      } finally {
        setLoading(false);
      }
    };

    initAuth();

    const refreshInterval = setInterval(async () => {
      const token = localStorage.getItem("accessToken");
      if (token) {
        try {
          await authService.getMe();
        } catch (error) {
          console.error("Loi lam moi token dinh ky:", error);
        }
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(refreshInterval);
  }, []);

  const loginWithEmail = async (email: string, password: string, _rememberMe = true) => {
    setLoading(true);
    try {
      const result = await authService.loginWithEmail(email, password);
      setUser(result.user);
      setUserProfile(result.user);
      toast.success("Dang nhap tai khoan thanh cong!");
    } catch (error: unknown) {
      console.error("[loginWithEmail] Error:", error);
      toast.error(parseAppError(error, "Dang nhap that bai. Vui long kiem tra lai thong tin."));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const registerWithEmail = async (email: string, password: string, displayName: string, rememberMe = true) => {
    setLoading(true);
    try {
      await authService.registerWithEmail(email, password, displayName);
      await loginWithEmail(email, password, rememberMe);
    } catch (error: unknown) {
      console.error("[registerWithEmail] Error:", error);
      toast.error(parseAppError(error, "Dang ky that bai. Vui long thu lai."));
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async (_rememberMe = true) => {
    try {
      await authService.loginWithGoogle();
    } catch (error: unknown) {
      toast.error(parseAppError(error, "Dang nhap that bai."));
      throw error;
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await authService.logout();
      setUser(null);
      setUserProfile(null);
      toast.success("Da dang xuat tai khoan thanh cong!");
    } catch (error) {
      console.error("[logout] Error:", error);
      toast.error("Loi khi dang xuat.");
    } finally {
      setLoading(false);
    }
  };

  const updateProfileInfo = async (displayName: string, photoURL: string) => {
    if (!userProfile) return;
    try {
      const updatedProfile = await authService.updateProfile({ displayName, photoURL });
      setUser(updatedProfile);
      setUserProfile(updatedProfile);
      toast.success("Cap nhat thong tin tai khoan thanh cong!");
    } catch (error: unknown) {
      console.error("[updateProfileInfo] Error:", error);
      toast.error(parseAppError(error, "Cap nhat thong tin that bai."));
      throw error;
    }
  };

  const uploadAvatar = async (file: File): Promise<string> => {
    if (!userProfile) throw new Error("Chua dang nhap");
    try {
      const downloadURL = await authService.uploadAvatar(userProfile.uid, file);
      const updatedProfile = await authService.updateProfile({ photoURL: downloadURL });
      setUser(updatedProfile);
      setUserProfile(updatedProfile);
      toast.success("Tai len anh dai dien thanh cong!");
      return downloadURL;
    } catch (error: unknown) {
      console.error("Loi upload avatar:", error);
      toast.error(parseAppError(error, "Tai len anh dai dien that bai."));
      throw error;
    }
  };

  const refreshProfile = async () => {
    if (!userProfile) return;
    try {
      const profile = await authService.getMe();
      if (profile) {
        setUser(profile);
        setUserProfile(profile);
      }
    } catch (error) {
      console.error("Loi khi lam moi ho so:", error);
    }
  };

  const saveFacebookIntegration = async (integration: FacebookIntegration) => {
    if (!userProfile) return;
    try {
      const updatedProfile = await authService.updateProfile({
        facebookIntegration: { ...integration },
      });
      setUser(updatedProfile);
      setUserProfile(updatedProfile);
      toast.success("Ket noi Facebook Page thanh cong!");
    } catch (error: unknown) {
      console.error("[FB Connect] Loi ket noi:", error);
      toast.error(parseAppError(error, "Khong the ket noi Facebook Page. Vui long kiem tra lai."));
      throw error;
    }
  };

  const removeFacebookIntegration = async () => {
    if (!userProfile) return;
    try {
      const updatedProfile = await authService.updateProfile({ facebookIntegration: null });
      setUser(updatedProfile);
      setUserProfile(updatedProfile);
      toast.success("Da huy lien ket Facebook Page.");
    } catch (error: unknown) {
      console.error("Loi xoa Facebook integration:", error);
      toast.error("Loi khi huy lien ket Facebook.");
      throw error;
    }
  };

  const saveTikTokIntegration = async (integration: TikTokIntegration) => {
    if (!userProfile) return;
    const finalIntegration = { ...integration };

    try {
      if (!integration.accessToken) {
        finalIntegration.isConnected = false;
      }

      const updatedProfile = await authService.updateProfile({
        tiktokIntegration: finalIntegration,
      });
      setUser(updatedProfile);
      setUserProfile(updatedProfile);
      toast.success(integration.accessToken ? "Ket noi TikTok thanh cong!" : "Da luu cau hinh app TikTok.");
    } catch (error: unknown) {
      console.error("[TikTok Connect] Loi ket noi:", error);
      toast.error(parseAppError(error, "Khong the ket noi TikTok. Vui long kiem tra lai."));
      throw error;
    }
  };

  const removeTikTokIntegration = async () => {
    if (!userProfile) return;
    try {
      const updatedProfile = await authService.updateProfile({ tiktokIntegration: null });
      setUser(updatedProfile);
      setUserProfile(updatedProfile);
      toast.success("Da huy lien ket TikTok.");
    } catch (error: unknown) {
      console.error("Loi xoa TikTok integration:", error);
      toast.error("Loi khi huy lien ket TikTok.");
      throw error;
    }
  };

  const saveZaloIntegration = async (integration: ZaloIntegration) => {
    if (!userProfile) return;
    try {
      const updatedProfile = await authService.updateProfile({
        zaloIntegration: { ...integration },
      });
      setUser(updatedProfile);
      setUserProfile(updatedProfile);
      toast.success("Ket noi Zalo OA thanh cong!");
    } catch (error: unknown) {
      console.error("[Zalo Connect] Loi ket noi:", error);
      toast.error(parseAppError(error, "Khong the ket noi Zalo OA. Vui long kiem tra lai."));
      throw error;
    }
  };

  const removeZaloIntegration = async () => {
    if (!userProfile) return;
    try {
      await fetch("/api/v1/zalo/integration", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("accessToken")}`,
        },
      });

      const updatedProfile = await authService.updateProfile({ zaloIntegration: null });
      setUser(updatedProfile);
      setUserProfile(updatedProfile);
      toast.success("Da huy lien ket Zalo OA.");
    } catch (error: unknown) {
      console.error("Loi xoa Zalo integration:", error);
      toast.error("Loi khi huy lien ket Zalo.");
      throw error;
    }
  };

  const updateAiAutoReplyConfig = async (config: AIChatConfig) => {
    if (!userProfile) return;
    try {
      const updatedProfile = await authService.updateProfile({ aiAutoReplyConfig: config });
      setUser(updatedProfile);
      setUserProfile(updatedProfile);
    } catch (error: unknown) {
      console.error("[updateAiAutoReplyConfig] Error:", error);
      toast.error(parseAppError(error, "Loi khi luu cau hinh AI."));
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        loginWithEmail,
        registerWithEmail,
        loginWithGoogle,
        logout,
        refreshProfile,
        updateProfileInfo,
        uploadAvatar,
        saveFacebookIntegration,
        removeFacebookIntegration,
        saveTikTokIntegration,
        removeTikTokIntegration,
        saveZaloIntegration,
        removeZaloIntegration,
        updateAiAutoReplyConfig,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth phai duoc su dung trong mot AuthProvider");
  }
  return context;
};
