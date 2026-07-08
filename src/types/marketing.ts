export type MarketingSubTabType = "LÊN Ý TƯỞNG AI" | "DUYỆT NỘI DUNG" | "LỊCH ĐĂNG CONTENT" | "XƯỞNG NỘI DUNG";

export interface MarketingConcept {
  title: string;
  matchPercent: number;
  summary: string;
  channels: string[];
  suggestedContent: string;
  hashtags: string[];
  mediaType?: "image" | "video" | "human-video";
  mediaPrompt?: string;
}

export interface ContentApprovalCard {
  id: string;
  title: string;
  channel: "Facebook" | "TikTok" | "LinkedIn" | "Instagram" | "Zalo";
  contentType: string;
  status: "draft" | "pending" | "approved" | "scheduled" | "published" | "failed" | "processing";
  bodyText: string;
  outline?: string;
  imageUrl?: string;
  videoUrl?: string;
  mediaPrompt?: string;
  voiceScript?: string;
  voiceTitle?: string;
  voiceDescription?: string;
  humanDurationSeconds?: number;
  motionText?: string;
  audioUrl?: string;
  audioRecordId?: string;
  videoProvider?: string;
  generatedAt: string;
  feedback?: string;
  isNew?: boolean; // Đánh dấu card vừa được phát triển
  scheduledDate?: string;
  scheduledTime?: string;
  authorUid?: string;
  publishedAt?: string;
  facebookPostId?: string;
  postUrl?: string;
  tiktokPostId?: string;
  tiktokShareUrl?: string;
  integrationId?: string;
  publishError?: string;
  mediaType?: "image" | "video" | "human-video";
  referenceImage?: string;
  sourceBrief?: string;
  engineType?: string;
  avatarId?: string;
  voiceId?: string;
  inputText?: string;
  usePersonalVoice?: boolean;
}

export interface PublishEvent {
  id: string;
  date: number; // day in October 2026
  title: string;
  type: string;
  channel: string;
  status: "Draft" | "Approved" | "Published";
}
