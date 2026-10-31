// Hand-written SVG icon set (24×24, stroke-based, currentColor).
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 20, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      {children}
    </svg>
  );
}

export const IconHash = (p: P) => <Svg {...p}><path d="M5 9h15M4 15h15M10 3 8 21M16 3l-2 18" /></Svg>;
export const IconSpeaker = (p: P) => <Svg {...p}><path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" /></Svg>;
export const IconLock = (p: P) => <Svg {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></Svg>;
export const IconPlus = (p: P) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const IconClose = (p: P) => <Svg {...p}><path d="M18 6 6 18M6 6l12 12" /></Svg>;
export const IconChevronDown = (p: P) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const IconChevronRight = (p: P) => <Svg {...p}><path d="m9 6 6 6-6 6" /></Svg>;
export const IconSettings = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></Svg>;
export const IconMic = (p: P) => <Svg {...p}><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8" /></Svg>;
export const IconMicOff = (p: P) => <Svg {...p}><path d="M2 2l20 20" /><path d="M9 9v2a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" /><path d="M17 16.95A7 7 0 0 1 5 11v-1M19 10v1a7 7 0 0 1-.11 1.23M12 18v4M8 22h8" /></Svg>;
export const IconHeadphones = (p: P) => <Svg {...p}><path d="M3 18v-6a9 9 0 0 1 18 0v6" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></Svg>;
export const IconHeadphonesOff = (p: P) => <Svg {...p}><path d="M2 2l20 20" /><path d="M3 18v-6a9 9 0 0 1 2.6-6.36M8.5 3.7A9 9 0 0 1 21 12v4" /><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" /></Svg>;
export const IconVideo = (p: P) => <Svg {...p}><path d="m23 7-7 5 7 5V7z" /><rect x="1" y="5" width="15" height="14" rx="2" /></Svg>;
export const IconVideoOff = (p: P) => <Svg {...p}><path d="M2 2l20 20M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" /></Svg>;
export const IconScreen = (p: P) => <Svg {...p}><rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4M9 10l3-3 3 3M12 7v6" /></Svg>;
export const IconPhone = (p: P) => <Svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></Svg>;
export const IconPhoneOff = (p: P) => <Svg {...p}><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07M5.17 13.4A19.79 19.79 0 0 1 2.1 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91M23 1 1 23" /></Svg>;
export const IconUsers = (p: P) => <Svg {...p}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></Svg>;
export const IconUserPlus = (p: P) => <Svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="8.5" cy="7" r="4" /><path d="M20 8v6M23 11h-6" /></Svg>;
export const IconPin = (p: P) => <Svg {...p}><path d="M12 17v5M9 10.76V6h6v4.76l2 3.24H7l2-3.24zM8 2h8" /></Svg>;
export const IconSearch = (p: P) => <Svg {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.35-4.35" /></Svg>;
export const IconSmile = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" /></Svg>;
export const IconSmilePlus = (p: P) => <Svg {...p}><path d="M22 11v1a10 10 0 1 1-9-10" /><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01M16 5h6M19 2v6" /></Svg>;
export const IconReply = (p: P) => <Svg {...p}><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></Svg>;
export const IconEdit = (p: P) => <Svg {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></Svg>;
export const IconTrash = (p: P) => <Svg {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></Svg>;
export const IconMore = (p: P) => <Svg {...p}><circle cx="5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="19" cy="12" r="1.2" fill="currentColor" /></Svg>;
export const IconMoreVertical = (p: P) => <Svg {...p}><circle cx="12" cy="5" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="19" r="1.2" fill="currentColor" /></Svg>;
export const IconCopy = (p: P) => <Svg {...p}><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></Svg>;
export const IconLink = (p: P) => <Svg {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></Svg>;
export const IconUpload = (p: P) => <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" /></Svg>;
export const IconDownload = (p: P) => <Svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></Svg>;
export const IconFile = (p: P) => <Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h5" /></Svg>;
export const IconPlusCircle = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" /></Svg>;
export const IconBell = (p: P) => <Svg {...p}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></Svg>;
export const IconBellOff = (p: P) => <Svg {...p}><path d="M13.73 21a2 2 0 0 1-3.46 0M18.63 13A17.89 17.89 0 0 1 18 8M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14M18 8a6 6 0 0 0-9.33-5M1 1l22 22" /></Svg>;
export const IconLogout = (p: P) => <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></Svg>;
export const IconCompass = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="m16.24 7.76-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" /></Svg>;
export const IconMenu = (p: P) => <Svg {...p}><path d="M3 6h18M3 12h18M3 18h18" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><path d="M20 6 9 17l-5-5" /></Svg>;
export const IconSlash = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="m4.93 4.93 14.14 14.14" /></Svg>;
export const IconAt = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" /></Svg>;
export const IconMessage = (p: P) => <Svg {...p}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" /></Svg>;
export const IconShield = (p: P) => <Svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Svg>;
export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></Svg>;
export const IconFolderPlus = (p: P) => <Svg {...p}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2zM12 11v6M9 14h6" /></Svg>;
export const IconImage = (p: P) => <Svg {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></Svg>;
export const IconArrowDown = (p: P) => <Svg {...p}><path d="M12 5v14M19 12l-7 7-7-7" /></Svg>;
export const IconExternal = (p: P) => <Svg {...p}><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3" /></Svg>;
export const IconEye = (p: P) => <Svg {...p}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const IconGrip = (p: P) => <Svg {...p}><circle cx="9" cy="6" r="1" fill="currentColor" /><circle cx="15" cy="6" r="1" fill="currentColor" /><circle cx="9" cy="12" r="1" fill="currentColor" /><circle cx="15" cy="12" r="1" fill="currentColor" /><circle cx="9" cy="18" r="1" fill="currentColor" /><circle cx="15" cy="18" r="1" fill="currentColor" /></Svg>;
export const IconArrowUp = (p: P) => <Svg {...p}><path d="M12 19V5M5 12l7-7 7 7" /></Svg>;
export const IconMoon = (p: P) => <Svg {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></Svg>;
export const IconSun = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></Svg>;
export const IconInbox = (p: P) => <Svg {...p}><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></Svg>;

/** Huddle logo mark: three overlapping speech-bubble circles. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <circle cx="18" cy="20" r="10" fill="currentColor" opacity="0.95" />
      <circle cx="30" cy="20" r="10" fill="currentColor" opacity="0.6" />
      <circle cx="24" cy="30" r="10" fill="currentColor" opacity="0.35" />
      <path d="M12 30 9 38l8-4" fill="currentColor" opacity="0.95" />
    </svg>
  );
}
export const IconApps = (p: P) => <Svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><path d="M17.5 14v7M14 17.5h7" /></Svg>;
export const IconExpand = (p: P) => <Svg {...p}><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></Svg>;
/** Filled rosette with a check (Discover "verified" badge). */
export const IconVerified = ({ size = 16, ...rest }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...rest}>
    <path fill="currentColor" d="M12 1.5l2.6 1.9 3.2-.1 1 3.1 2.6 1.9-1 3.1 1 3.1-2.6 1.9-1 3.1-3.2-.1L12 22.5l-2.6-1.9-3.2.1-1-3.1-2.6-1.9 1-3.1-1-3.1 2.6-1.9 1-3.1 3.2.1z" />
    <path d="m8 12.2 2.7 2.6L16.2 9.3" fill="none" stroke="var(--verified-check, #fff)" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const IconPoll = (p: P) => <Svg {...p}><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></Svg>;
export const IconForward = (p: P) => <Svg {...p}><path d="m15 5 6 6-6 6" /><path d="M21 11H10a6 6 0 0 0-6 6v2" /></Svg>;
export const IconPlay = (p: P) => <Svg {...p}><path d="M7 4.5v15l12-7.5z" fill="currentColor" /></Svg>;
export const IconPause = (p: P) => <Svg {...p}><path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor" /></Svg>;
export const IconSend = (p: P) => <Svg {...p}><path d="m22 2-7 20-4-9-9-4z" /><path d="M22 2 11 13" /></Svg>;
// threads / forums / announcements
export const IconThread = (p: P) => <Svg {...p}><path d="M5 9h12M4 15h8M10 3 8 21M16 3l-1.2 9" /><path d="M14 16.5a2.5 2.5 0 0 1 2.5-2.5H20a2 2 0 0 1 2 2v2.5a2 2 0 0 1-2 2h-.5V22l-2-1.5h-1A2.5 2.5 0 0 1 14 18z" /></Svg>;
export const IconForum = (p: P) => <Svg {...p}><path d="M3 5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H8l-4 3v-3.2A2 2 0 0 1 3 11z" /><path d="M19 8h.5A1.5 1.5 0 0 1 21 9.5V16a1.5 1.5 0 0 1-1.5 1.5H19V20l-3-2.5h-5a1.5 1.5 0 0 1-1.5-1.5V16" /></Svg>;
export const IconMegaphone = (p: P) => <Svg {...p}><path d="M3 10.5v3a1 1 0 0 0 1 1h3l10 5.5V4L7 9.5H4a1 1 0 0 0-1 1z" /><path d="M20 9.5a3 3 0 0 1 0 5" /><path d="M7 14.5V19a1.5 1.5 0 0 0 1.5 1.5h1A1.5 1.5 0 0 0 11 19v-2.5" /></Svg>;
export const IconArchive = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4" /></Svg>;
export const IconArrowLeft = (p: P) => <Svg {...p}><path d="M19 12H5M12 19l-7-7 7-7" /></Svg>;
export const IconCalendar = (p: P) => <Svg {...p}><rect x="3" y="4.5" width="18" height="16.5" rx="2" /><path d="M16 2.5v4M8 2.5v4M3 10h18" /></Svg>;
