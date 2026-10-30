import { isIOS } from './usePhone';

const HOLD_MS = 450;
const SLOP = 10;

/**
 * Long-press opens the same menus as right-click. Android browsers already turn a long-press
 * into a `contextmenu` event; iOS Safari does not, so there it is synthesized at the touch point.
 */
export function installLongPress() {
  if (!isIOS()) return;
  let timer = 0, x = 0, y = 0, target: Element | null = null, fired = false;

  const cancel = () => { window.clearTimeout(timer); timer = 0; };
  document.addEventListener('touchstart', (e) => {
    cancel();
    fired = false;
    if (e.touches.length !== 1) return;
    target = e.target as Element;
    if (target.closest('input, textarea, [contenteditable="true"]')) return;
    ({ clientX: x, clientY: y } = e.touches[0]);
    timer = window.setTimeout(() => {
      timer = 0;
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window });
      fired = !target!.dispatchEvent(ev); // a handler called preventDefault, so a menu opened
      if (fired) navigator.vibrate?.(10);
    }, HOLD_MS);
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (timer && (Math.abs(t.clientX - x) > SLOP || Math.abs(t.clientY - y) > SLOP)) cancel();
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    cancel();
    // the finger lifting after a menu opened must not also "click" what was under it
    if (fired) { e.preventDefault(); fired = false; }
  });
  document.addEventListener('touchcancel', cancel, { passive: true });
}
