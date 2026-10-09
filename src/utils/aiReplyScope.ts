type ReplyChannel = "facebook" | "zalo" | "tiktok";

/** Resolve the same account for loading, editing and saving its AI configuration. */
export function resolveAiReplyScope(params: {
  customer?: { channel?: string; pageId?: string } | null;
  activeChannel: string;
  facebookId: string;
  zaloId?: string;
  tiktokId?: string;
}): { channel: ReplyChannel; platform: string; accountId: string; key: string } {
  const selectedChannel = params.customer?.channel || params.activeChannel;
  const channel = selectedChannel === "zalo" || selectedChannel === "tiktok" ? selectedChannel : "facebook";
  const accountId = params.customer?.pageId || (channel === "zalo" ? params.zaloId : channel === "tiktok" ? params.tiktokId : params.facebookId) || "";
  const platform = channel === "zalo" ? "Zalo" : channel === "tiktok" ? "TikTok" : "Facebook";
  return { channel, platform, accountId, key: `${channel}:${accountId}` };
}
