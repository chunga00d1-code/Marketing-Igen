export interface FacebookIntegration {
  isConnected: boolean;
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  appSecret?: string;
  verifyToken?: string;
  connectedAt: any;
  isMock?: boolean;
}

export interface TikTokIntegration {
  isConnected: boolean;
  /** Username hiển thị (e.g. @igen_tech) */
  username: string;
  /** Tên hiển thị trong UI */
  displayName: string;
  /** URL ảnh đại diện TikTok */
  avatarUrl?: string;
  /** Access Token kết nối API thật */
  accessToken?: string;
  refreshToken?: string;
  tokenExpiredAt?: any;
  clientKey?: string;
  clientSecret?: string;
  scopes?: string[];
  /** Thời điểm kết nối */
  connectedAt: any;
  /** Mộc quyền riêng tư mặc định khi đăng (PUBLIC_TO_EVERYONE / SELF_ONLY) */
  privacyLevel?: 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS' | 'SELF_ONLY';
  /** Chế độ giả lập — không cần API thật */
  isMock?: boolean;
}

export interface ZaloIntegration {
  isConnected: boolean;
  oaId: string;
  oaName: string;
  accessToken: string;
  refreshToken: string;
  connectedAt: any;
  isMock?: boolean;
}
