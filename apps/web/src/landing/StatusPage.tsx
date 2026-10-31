import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocale, useT, type Key } from '../i18n';
import { Rich } from '../i18n/Rich';
import { InfoLayout } from './InfoLayout';
import { I, ICONS } from './icons';

/** Shape of GET /api/status (apps/server/src/routes/site.ts). */
interface Status {
  ok: boolean;
  api: boolean;
  realtime: boolean;
  call_relay: boolean;
  email: boolean;
  gifs: boolean;
  uptime_seconds: number;
  version: string;
  time: string;
}

type Level = 'ok' | 'off' | 'down';
const REFRESH_MS = 30_000;

const ROWS: { id: string; name: Key; desc: Key; level: (s: Status) => Level }[] = [
  { id: 'api', name: 'status.row.api', desc: 'status.row.api.d', level: (s) => (s.api ? 'ok' : 'down') },
  { id: 'realtime', name: 'status.row.realtime', desc: 'status.row.realtime.d', level: (s) => (s.realtime ? 'ok' : 'down') },
  // optional services: "not configured" is amber, not an outage
  { id: 'relay', name: 'status.row.relay', desc: 'status.row.relay.d', level: (s) => (s.call_relay ? 'ok' : 'off') },
  { id: 'email', name: 'status.row.email', desc: 'status.row.email.d', level: (s) => (s.email ? 'ok' : 'off') },
  { id: 'gifs', name: 'status.row.gifs', desc: 'status.row.gifs.d', level: (s) => (s.gifs ? 'ok' : 'off') },
];

const STATE_KEY: Record<Level, Key> = { ok: 'status.state.ok', off: 'status.state.off', down: 'status.state.down' };

/** Live status: polls /api/status every 30 s and measures the round trip from this browser. */
export function StatusPage() {
  const t = useT();
  const locale = useLocale();
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [busy, setBusy] = useState(false);
  const inflight = useRef<AbortController | null>(null);

  const check = useCallback(async () => {
    inflight.current?.abort();
    const ctl = new AbortController();
    inflight.current = ctl;
    const timeout = window.setTimeout(() => ctl.abort(), 10_000);
    setBusy(true);
    const start = performance.now();
    try {
      const r = await fetch('/api/status', { cache: 'no-store', signal: ctl.signal });
      const ms = Math.round(performance.now() - start);
      if (!r.ok) throw new Error(String(r.status));
      setStatus((await r.json()) as Status);
      setLatency(ms);
      setFailed(false);
    } catch {
      if (ctl.signal.aborted && inflight.current !== ctl) return; // superseded
      setFailed(true);
      setLatency(null);
    } finally {
      window.clearTimeout(timeout);
      if (inflight.current === ctl) { setBusy(false); setCheckedAt(new Date()); }
    }
  }, []);

  useEffect(() => {
    void check();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void check(); }, REFRESH_MS);
    const onVis = () => { if (document.visibilityState === 'visible') void check(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVis); inflight.current?.abort(); };
  }, [check]);

  const levels = status ? ROWS.map((r) => r.level(status)) : [];
  const overall: Level | 'checking' = failed ? 'down' : !status ? 'checking'
    : levels.includes('down') ? 'down' : levels.includes('off') ? 'off' : 'ok';
  const summary: Key = overall === 'checking' ? 'status.checking'
    : failed ? 'status.down' : overall === 'down' ? 'status.degraded' : overall === 'off' ? 'status.partial' : 'status.allOk';

  const time = (d: Date) => d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit', second: '2-digit' });
  const uptime = (secs: number) => {
    const d = Math.floor(secs / 86400), h = Math.floor((secs % 86400) / 3600), m = Math.floor((secs % 3600) / 60);
    return t('status.uptimeFmt', { d, h, m });
  };

  return (
    <InfoLayout title="status.title" kicker="status.kicker" h1="status.h1" lead="status.lead" wide>
      <div className={'status-summary lvl-' + overall} role="status" aria-live="polite">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <h2>{t(summary)}</h2>
          {checkedAt && <p>{t('status.lastChecked', { time: time(checkedAt) })}</p>}
        </div>
        <button type="button" className="btn ghost-w status-refresh" onClick={() => void check()} disabled={busy}>
          <I d={ICONS.refresh} />{t('status.refresh')}
        </button>
      </div>

      <ul className="status-rows">
        {ROWS.map((r) => {
          const lvl: Level | 'checking' = failed ? 'down' : status ? r.level(status) : 'checking';
          return (
            <li key={r.id} className={'status-row lvl-' + lvl}>
              <span className="status-dot" aria-hidden="true" />
              <div className="status-name">
                <b>{t(r.name)}</b>
                <small>{t(r.desc)}</small>
              </div>
              <span className="status-state">{lvl === 'checking' ? t('status.checking') : t(STATE_KEY[lvl])}</span>
            </li>
          );
        })}
      </ul>

      <dl className="status-meta">
        <div><dt>{t('status.latency')}</dt><dd>{latency !== null ? t('status.ms', { n: latency.toLocaleString(locale) }) : '—'}</dd></div>
        <div><dt>{t('status.uptime')}</dt><dd>{status && !failed ? uptime(status.uptime_seconds) : '—'}</dd></div>
        <div><dt>{t('status.version')}</dt><dd><code>{status && !failed ? status.version : '—'}</code></dd></div>
        <div><dt>{t('status.serverTime')}</dt><dd>{status && !failed ? time(new Date(status.time)) : '—'}</dd></div>
      </dl>
      <p className="status-foot"><Rich text={t('status.trouble')} /></p>
    </InfoLayout>
  );
}
