import { useEffect, type RefObject } from 'react';
import { useUIStore } from '../../stores/ui';
import { isPhone } from '../../lib/usePhone';

const MIN_DX = 56;

/** Element the gesture should belong to instead: text fields and things that scroll sideways. */
function claimsHorizontal(el: Element | null): boolean {
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.matches('input, textarea, [contenteditable="true"], video, .no-swipe')) return true;
    const s = getComputedStyle(n);
    if (/(auto|scroll)/.test(s.overflowX) && n.scrollWidth > n.clientWidth + 1) return true;
  }
  return false;
}

/**
 * Phone gestures on the app body: swipe right to reveal servers and channels, swipe left for
 * members (or search results), and the opposite swipe to close whichever panel is open.
 */
export function useSwipePanels(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let x0 = 0, y0 = 0, t0 = 0, tracking = false, horizontal: boolean | null = null;

    const start = (e: TouchEvent) => {
      tracking = isPhone() && e.touches.length === 1 && !claimsHorizontal(e.target as Element);
      if (!tracking) return;
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now(); horizontal = null;
    };
    const move = (e: TouchEvent) => {
      if (!tracking || horizontal !== null) return;
      const dx = e.touches[0].clientX - x0, dy = e.touches[0].clientY - y0;
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) horizontal = Math.abs(dx) > Math.abs(dy) * 1.4;
    };
    const end = (e: TouchEvent) => {
      if (!tracking || !horizontal) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - x0;
      const fast = Math.abs(dx) > 30 && Date.now() - t0 < 250;
      if (Math.abs(dx) < MIN_DX && !fast) return;
      const ui = useUIStore.getState();
      if (ui.mobileNavOpen) { if (dx < 0) ui.setMobileNav(false); return; }
      if (ui.mobileMembersOpen) { if (dx > 0) ui.setMobileMembers(false); return; }
      if (dx > 0) ui.setMobileNav(true);
      else if (document.querySelector('.chat-view')) ui.setMobileMembers(true);
    };

    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', move, { passive: true });
    el.addEventListener('touchend', end, { passive: true });
    return () => {
      el.removeEventListener('touchstart', start);
      el.removeEventListener('touchmove', move);
      el.removeEventListener('touchend', end);
    };
  }, [ref]);
}
