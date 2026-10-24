type SocialPlatform = "facebook" | "zalo" | "tiktok";

const iconPath: Record<SocialPlatform, string> = {
  facebook: "/facebook-logo.svg",
  zalo: "/zalo-logo.svg",
  tiktok: "/tiktok-logo.svg",
};

export function SocialPlatformIcon({ platform, className = "h-4 w-4" }: { platform: SocialPlatform; className?: string }) {
  return <img src={iconPath[platform]} alt="" aria-hidden="true" draggable={false} className={`shrink-0 object-contain ${className}`} />;
}
