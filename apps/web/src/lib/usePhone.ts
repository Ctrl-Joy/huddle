import { useEffect, useState } from 'react';

// Must match the phone breakpoint in styles/layout.css.
const PHONE_QUERY = '(max-width: 800px)';

export const isPhone = () => typeof window !== 'undefined' && window.matchMedia(PHONE_QUERY).matches;

/** True while the viewport uses the phone layout (full-screen chat with slide-in panels). */
export function usePhone(): boolean {
  const [phone, setPhone] = useState(isPhone);
  useEffect(() => {
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

/** iOS never fires `contextmenu` on long-press, so long-press menus are synthesized there. */
export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
