import type { ReactNode } from "react";

export type SidebarFilledIconName =
  | "overview"
  | "marketing"
  | "crm"
  | "content"
  | "video"
  | "knowledge"
  | "users"
  | "wallet"
  | "settings"
  | "guide";

const artwork: Record<SidebarFilledIconName, ReactNode> = {
  overview: (
    <>
      <rect x="2.5" y="2.5" width="8" height="8" rx="2" />
      <rect x="13.5" y="2.5" width="8" height="8" rx="2" />
      <rect x="2.5" y="13.5" width="8" height="8" rx="2" />
      <rect x="13.5" y="13.5" width="8" height="8" rx="2" />
    </>
  ),
  marketing: (
    <>
      <path d="M3 9.2a2.2 2.2 0 0 1 2.2-2.2H8l9-4v15l-9-4H5.2A2.2 2.2 0 0 1 3 11.8V9.2Z" />
      <path d="m6.5 14 1.4 6a1.5 1.5 0 0 0 2.9-.7L9.6 14H6.5ZM19 7.2a4 4 0 0 1 0 6.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  crm: (
    <>
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2h11A2.5 2.5 0 0 1 20 4.5v10a2.5 2.5 0 0 1-2.5 2.5H9l-5 4V4.5Z" />
      <path d="M8 7.5h8M8 11h5" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    </>
  ),
  content: (
    <>
      <path d="M12 2.2a9.8 9.8 0 0 0 0 19.6h1a2.7 2.7 0 0 0 2.4-4c-.4-.7-.2-1.3.6-1.3h1.7A4.3 4.3 0 0 0 22 12.2 10 10 0 0 0 12 2.2Z" />
      <circle cx="6.8" cy="11.5" r="1.1" fill="white" />
      <circle cx="9.3" cy="7.2" r="1.1" fill="white" />
      <circle cx="14.3" cy="6.5" r="1.1" fill="white" />
      <circle cx="18" cy="10" r="1.1" fill="white" />
    </>
  ),
  video: (
    <>
      <rect x="2" y="5" width="20" height="16" rx="3" />
      <path d="M2 9h20M7 5l3.5 4M14 5l3.5 4" fill="none" stroke="white" strokeWidth="1.5" />
      <path d="m10 12 5 2.5-5 2.5v-5Z" fill="white" />
    </>
  ),
  knowledge: (
    <>
      <path d="M3 4.5c3.2-1.5 6.4-1.2 9 1v15c-2.6-2.2-5.8-2.5-9-1v-15ZM21 4.5c-3.2-1.5-6.4-1.2-9 1v15c2.6-2.2 5.8-2.5 9-1v-15Z" />
      <path d="M12 5.5v15" fill="none" stroke="white" strokeWidth="1.4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="7" r="3.2" />
      <circle cx="18" cy="8.5" r="2.5" />
      <path d="M2.5 19v-1.5c0-3.1 2.5-5.1 6.5-5.1s6.5 2 6.5 5.1V19a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2ZM17 13c2.8.2 4.5 2 4.5 4.8V19a2 2 0 0 1-2 2h-2.8c.5-.6.8-1.3.8-2v-1.5c0-1.8-.4-3.3-1.2-4.4l.7-.1Z" />
    </>
  ),
  wallet: (
    <>
      <path d="M4.5 4h13A2.5 2.5 0 0 1 20 6.5V8H5a3 3 0 0 1-2-1V5.5A1.5 1.5 0 0 1 4.5 4Z" />
      <path d="M3 7h16a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7Z" />
      <path d="M16.5 12H22v4h-5.5a2 2 0 0 1 0-4Z" fill="white" />
      <circle cx="17.2" cy="14" r=".8" />
    </>
  ),
  settings: (
    <>
      <path d="m10 2 .5 2.1a8 8 0 0 0-1.7.7L6.9 3.7 4.3 6.3l1.1 1.9c-.3.5-.5 1.1-.7 1.7L2.5 10v4l2.2.5c.2.6.4 1.2.7 1.7l-1.1 1.9 2.6 2.6 1.9-1.1c.5.3 1.1.5 1.7.7l.5 2.2h4l.5-2.2c.6-.2 1.2-.4 1.7-.7l1.9 1.1 2.6-2.6-1.1-1.9c.3-.5.5-1.1.7-1.7l2.2-.5v-4l-2.2-.5a8 8 0 0 0-.7-1.7l1.1-1.9-2.6-2.6-1.9 1.1a8 8 0 0 0-1.7-.7L14 2h-4Z" />
      <circle cx="12" cy="12" r="3.2" fill="white" />
    </>
  ),
  guide: (
    <>
      <path d="M3 4.5c3.2-1.5 6.4-1.2 9 1v15c-2.6-2.2-5.8-2.5-9-1v-15ZM21 4.5c-3.2-1.5-6.4-1.2-9 1v15c2.6-2.2 5.8-2.5 9-1v-15Z" />
      <path d="M12 5.5v15M5.5 8c1.2-.2 2.3 0 3.5.6M15 8.6c1.2-.6 2.3-.8 3.5-.6" fill="none" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
};

export function SidebarFilledIcon({ name, className }: { name: SidebarFilledIconName; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      {artwork[name]}
    </svg>
  );
}
