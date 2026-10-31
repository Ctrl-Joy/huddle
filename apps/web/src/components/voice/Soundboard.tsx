// Soundboard: a button (call controls / voice panel) that opens a grid of sounds. Clicking a sound asks
// the server to broadcast it to everyone in the call; playback happens in stores/soundboard.ts.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject, type SVGProps } from 'react';
import { createPortal } from 'react-dom';
import { BUILTIN_SOUNDS, SOUNDBOARD_LIMITS } from '@huddle/shared';
import { useVoiceStore } from '../../stores/voice';
import { useGuildStore } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { playSound, useSoundboardStore } from '../../stores/soundboard';
import { Tooltip } from '../common/Avatar';

export const IconSoundboard = ({ size = 20, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="2" /><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" /><path d="M14.5 17.25h1.5l2-2v4l-2-2M20.5 15.5a2.5 2.5 0 0 1 0 3.5" />
  </svg>
);

const NO_SOUNDS: never[] = [];
const POPOVER_W = 340;

/** Soundboard toggle; variant picks the call-controls or voice-panel button style. */
export function SoundboardButton({ variant }: { variant: 'call' | 'panel' }) {
  const conn = useVoiceStore((s) => s.connection);
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!conn) setOpen(false); }, [conn]);
  if (!conn) return null;
  const button = variant === 'call' ? (
    <button ref={btn} className={'call-btn' + (open ? ' on' : '')} aria-label="Soundboard" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen((o) => !o)}><IconSoundboard size={22} /></button>
  ) : (
    <button ref={btn} className={'vp-btn' + (open ? ' on' : '')} aria-label="Soundboard" aria-haspopup="dialog" aria-expanded={open}
      onClick={() => setOpen((o) => !o)}><IconSoundboard size={18} /><span>Sounds</span></button>
  );
  return (
    <>
      {variant === 'call' ? <Tooltip label="Soundboard">{button}</Tooltip> : button}
      {open && <SoundboardPopover anchor={btn} channelId={conn.channelId} guildId={conn.guildId} close={() => setOpen(false)} />}
    </>
  );
}

function SoundboardPopover({ anchor, channelId, guildId, close }: {
  anchor: RefObject<HTMLButtonElement | null>; channelId: string; guildId: string | null; close: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' });
  const sounds = useSoundboardStore((s) => (guildId ? s.sounds[guildId] : undefined)) ?? NO_SOUNDS;
  const guildName = useGuildStore((s) => (guildId ? s.guilds[guildId]?.name : undefined));
  const me = useAuthStore((s) => s.user!.id);
  const serverMuted = useVoiceStore((s) => !!s.states[me]?.mute);
  const deaf = useVoiceStore((s) => s.selfDeaf || !!s.states[me]?.deaf);
  const [cooling, setCooling] = useState(false);

  useEffect(() => { if (guildId) void useSoundboardStore.getState().fetch(guildId); }, [guildId]);

  // fixed position above the button, kept inside the viewport
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (!r) return;
      const w = Math.min(POPOVER_W, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8));
      setPos({ left, width: w, bottom: window.innerHeight - r.top + 8 });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('.sb-sound:not(:disabled)')?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !anchor.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); anchor.current?.focus(); }
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
  }, [anchor, close]);

  const play = async (id: string) => {
    if (cooling) return;
    setCooling(true);
    const ok = await playSound(channelId, id);
    setTimeout(() => setCooling(false), ok ? SOUNDBOARD_LIMITS.COOLDOWN_MS : 300);
  };

  const tile = (id: string, name: string, emoji: string | null) => (
    <button key={id} className="sb-sound" disabled={serverMuted || cooling} onClick={() => void play(id)} title={name}>
      <span className="sb-emoji" aria-hidden="true">{emoji || '🔊'}</span>
      <span className="sb-name truncate">{name}</span>
    </button>
  );

  return createPortal(
    <div ref={ref} className={'soundboard-popover' + (cooling ? ' cooling' : '')} style={pos} role="dialog" aria-label="Soundboard">
      <div className="sb-head">
        <span>Soundboard</span>
        {cooling && <span className="sb-cooldown" aria-hidden="true" />}
      </div>
      {serverMuted && <div className="sb-note">You've been muted by a moderator, so you can't play sounds here.</div>}
      {!serverMuted && deaf && <div className="sb-note">You're deafened. Others will hear your sounds, but you won't.</div>}
      <div className="sb-body scroll-thin">
        {guildId && (
          <>
            <div className="sb-section">{guildName ?? 'This server'}</div>
            {sounds.length ? <div className="sb-grid">{sounds.map((s) => tile(s.id, s.name, s.emoji))}</div>
              : <div className="sb-empty muted small">No custom sounds yet. Add some in Server Settings → Soundboard.</div>}
          </>
        )}
        <div className="sb-section">Huddle Sounds</div>
        <div className="sb-grid">{BUILTIN_SOUNDS.map((s) => tile(s.id, s.name, s.emoji))}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Floating emoji + sound name over a call tile right after that user played a sound. */
export function SoundPopBubble({ userId }: { userId: string }) {
  const pop = useSoundboardStore((s) => s.pops[userId]);
  if (!pop) return null;
  return (
    <div key={pop.key} className="sound-pop" role="status">
      <span className="sound-pop-emoji" aria-hidden="true">{pop.emoji || '🔊'}</span>
      <span className="sound-pop-name truncate">{pop.name}</span>
    </div>
  );
}
