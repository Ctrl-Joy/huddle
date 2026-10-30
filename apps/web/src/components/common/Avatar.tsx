import { useState, type CSSProperties, type MouseEventHandler, type ReactElement, type ReactNode, cloneElement, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { PresenceStatus, PublicUser } from '@huddle/shared';
import { colorFor, initials } from '../../lib/format';
import { useStatus, STATUS_LABEL } from '../../stores/presences';
import { useGuildStore } from '../../stores/guilds';
import { LogoMark } from './icons';

export function StatusDot({ status, size = 10, ring = 'var(--bg-sidebar)' }: { status: PresenceStatus; size?: number; ring?: string }) {
  const prev = useRef(status);
  const [pulse, setPulse] = useState(0);
  useEffect(() => { if (prev.current !== status) { prev.current = status; setPulse((n) => n + 1); } }, [status]);
  // keyed on pulse so a presence change re-mounts the dot and plays the one-shot pulse
  return <span key={pulse} className={`status-dot status-${status}` + (pulse ? ' pulse' : '')} style={{ width: size, height: size, boxShadow: `0 0 0 3px ${ring}`, ['--ring' as string]: ring } as CSSProperties} title={STATUS_LABEL[status]} />;
}

interface AvatarProps {
  user?: Pick<PublicUser, 'id' | 'username' | 'display_name' | 'avatar'> | null;
  userId?: string;
  size?: number;
  status?: PresenceStatus | 'auto' | null;
  ring?: string;
  speaking?: boolean;
  onClick?: MouseEventHandler;
  className?: string;
}

export function Avatar({ user, userId, size = 40, status, ring, speaking, onClick, className }: AvatarProps) {
  const cached = useGuildStore((s) => (userId ? s.users[userId] : undefined));
  const u = user || cached;
  const id = u?.id || userId || '0';
  const live = useStatus(status === 'auto' ? id : undefined);
  const st = status === 'auto' ? live : status;
  const [broken, setBroken] = useState(false);
  const name = u ? u.display_name || u.username : '?';
  const dot = Math.max(8, Math.round(size * 0.3));
  return (
    <span className={'avatar' + (speaking ? ' speaking' : '') + (className ? ' ' + className : '')} style={{ width: size, height: size }} onClick={onClick}>
      {u?.avatar && !broken ? (
        <img src={u.avatar} alt="" width={size} height={size} onError={() => setBroken(true)} draggable={false} />
      ) : (
        <span className="avatar-fallback" style={{ background: colorFor(id), fontSize: size * 0.4 }}>
          {size >= 28 ? <LogoMark size={Math.round(size * 0.62)} /> : name.slice(0, 1).toUpperCase()}
        </span>
      )}
      {st ? <span className="avatar-status"><StatusDot status={st} size={dot} ring={ring} /></span> : null}
    </span>
  );
}

export function GuildIcon({ guild, size = 48, className, style }: { guild: { id: string; name: string; icon: string | null }; size?: number; className?: string; style?: CSSProperties }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={'guild-icon' + (className ? ' ' + className : '')} style={{ width: size, height: size, ...style }}>
      {guild.icon && !broken
        ? <img src={guild.icon} alt="" onError={() => setBroken(true)} draggable={false} />
        : <span className="guild-initials" style={{ fontSize: Math.max(11, size * (initials(guild.name).length > 2 ? 0.28 : 0.36)) }}>{initials(guild.name)}</span>}
    </span>
  );
}

/** Portal tooltip shown on hover/focus. */
export function Tooltip({ label, side = 'top', children, delay = 150 }: { label: ReactNode; side?: 'top' | 'right' | 'bottom' | 'left'; children: ReactElement<any>; delay?: number }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  if (!label) return children;
  const show = (e: { currentTarget: Element }) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRect(r), delay);
  };
  const hide = () => { if (timer.current) clearTimeout(timer.current); setRect(null); };
  const props = children.props as Record<string, any>;
  const child = cloneElement(children, {
    onMouseEnter: (e: any) => { show(e); props.onMouseEnter?.(e); },
    onMouseLeave: (e: any) => { hide(); props.onMouseLeave?.(e); },
    onFocus: (e: any) => { show(e); props.onFocus?.(e); },
    onBlur: (e: any) => { hide(); props.onBlur?.(e); },
    onMouseDown: (e: any) => { hide(); props.onMouseDown?.(e); },
  });
  let style: CSSProperties = {};
  if (rect) {
    if (side === 'right') style = { left: rect.right + 10, top: rect.top + rect.height / 2, transform: 'translateY(-50%)' };
    else if (side === 'left') style = { left: rect.left - 10, top: rect.top + rect.height / 2, transform: 'translate(-100%, -50%)' };
    else if (side === 'bottom') style = { left: rect.left + rect.width / 2, top: rect.bottom + 8, transform: 'translateX(-50%)' };
    else style = { left: rect.left + rect.width / 2, top: rect.top - 8, transform: 'translate(-50%, -100%)' };
  }
  return (
    <>
      {child}
      {rect && createPortal(<div className={`tooltip tooltip-${side}`} style={style} role="tooltip">{label}</div>, document.body)}
    </>
  );
}

export function Badge({ count, className }: { count: number; className?: string }) {
  if (!count) return null;
  return <span className={'badge' + (className ? ' ' + className : '')}>{count > 99 ? '99+' : count}</span>;
}

export function Spinner({ size = 24 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}
