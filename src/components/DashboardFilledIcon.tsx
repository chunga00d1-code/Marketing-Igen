import type { ReactNode } from "react";
import { SidebarFilledIcon } from "./SidebarFilledIcon";

export type DashboardFilledIconName =
  | "marketing"
  | "processing"
  | "leads"
  | "priority"
  | "cold"
  | "warm"
  | "hot"
  | "won"
  | "upsell"
  | "content"
  | "calendar"
  | "pipeline"
  | "inbox"
  | "channel";

const sharedIcons: Partial<Record<DashboardFilledIconName, "marketing" | "users" | "content" | "crm">> = {
  marketing: "marketing",
  leads: "users",
  content: "content",
  pipeline: "crm",
  inbox: "crm",
};

const artwork: Partial<Record<DashboardFilledIconName, ReactNode>> = {
  processing: (
    <>
      <path d="m12 2 1.9 6.1L20 10l-6.1 1.9L12 18l-1.9-6.1L4 10l6.1-1.9L12 2Z" />
      <path d="m20 16 .8 2.2L23 19l-2.2.8L20 22l-.8-2.2L17 19l2.2-.8L20 16ZM4 17l.6 1.4L6 19l-1.4.6L4 21l-.6-1.4L2 19l1.4-.6L4 17Z" />
    </>
  ),
  priority: (
    <>
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6.8" fill="white" />
      <circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1.8" fill="white" />
    </>
  ),
  cold: (
    <>
      <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2l2 11v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3L4 5Z" />
      <path d="M3 15h5l1.5 2h5l1.5-2h5M6.5 7h11" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  warm: <path d="M13.3 2 4 13h6.2L9.7 22 20 10.5h-6.3L13.3 2Z" />,
  hot: (
    <>
      <path d="M13.2 2c.7 4.3-2.1 5.7-2.2 8.8C9.4 9.5 9 8.4 9 6.7 5.5 9.5 3.8 12.2 3.8 15.3a8.2 8.2 0 0 0 16.4 0c0-4.3-2.1-7.8-7-13.3Z" />
      <path d="M12.2 11.5c.4 2-2.7 3.5-2.7 5.5a2.6 2.6 0 0 0 5.2 0c0-2-1.2-3.8-2.5-5.5Z" fill="white" />
    </>
  ),
  won: (
    <>
      <path d="M6 2h5l1 6-4 3-2-9ZM13 2h5l-2 9-4-3 1-6Z" />
      <circle cx="12" cy="13" r="6" />
      <path d="m9.2 17-1.1 5 3.9-2 3.9 2-1.1-5" />
      <path d="m12 9.7 1 2 2.2.3-1.6 1.6.4 2.2-2-1-2 1 .4-2.2-1.6-1.6 2.2-.3 1-2Z" fill="white" />
    </>
  ),
  upsell: <path d="M11 21V8.7l-5 5L3.8 11.5 12 3.3l8.2 8.2-2.2 2.2-5-5V21h-2Z" />,
  calendar: (
    <>
      <rect x="2.5" y="4" width="19" height="18" rx="2.5" />
      <path d="M2.5 9.5h19M7 2v4M17 2v4" fill="none" stroke="white" strokeWidth="1.7" strokeLinecap="round" />
      <path d="m8 15 2.3 2.3L16 12" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  channel: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M6.3 4.4a10 10 0 0 0 0 15.2l1.9-2a7.3 7.3 0 0 1 0-11.2l-1.9-2ZM17.7 4.4l-1.9 2a7.3 7.3 0 0 1 0 11.2l1.9 2a10 10 0 0 0 0-15.2Z" />
      <path d="M3.4 1.7a13.8 13.8 0 0 0 0 20.6l1.8-2a11 11 0 0 1 0-16.6l-1.8-2ZM20.6 1.7l-1.8 2a11 11 0 0 1 0 16.6l1.8 2a13.8 13.8 0 0 0 0-20.6Z" />
    </>
  ),
};

export function DashboardFilledIcon({ name, className }: { name: DashboardFilledIconName; className?: string }) {
  const sharedName = sharedIcons[name];
  if (sharedName) return <SidebarFilledIcon name={sharedName} className={className} />;

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      {artwork[name]}
    </svg>
  );
}
