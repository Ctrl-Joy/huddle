import { useEffect, useState } from 'react';
import { gateway, type GatewayStatus } from '../api/gateway';
import { LogoMark } from '../components/common/icons';
import { logout } from '../lib/session';

const TIPS = [
  'Press Ctrl+K to jump to any channel, DM or server.',
  'Press ↑ in an empty message box to edit your last message.',
  'Wrap text in ||double bars|| to hide it behind a spoiler.',
  'Right-click almost anything for more options.',
  'Shift+Enter adds a new line without sending.',
];

export function Splash() {
  const [status, setStatus] = useState<GatewayStatus>(gateway.status);
  const [tip] = useState(() => TIPS[Math.floor(Math.random() * TIPS.length)]);
  const [slow, setSlow] = useState(false);
  useEffect(() => gateway.onStatus((s) => setStatus(s)), []);
  useEffect(() => { const t = setTimeout(() => setSlow(true), 6000); return () => clearTimeout(t); }, []);
  return (
    <div className="splash">
      <div className="splash-logo"><LogoMark size={72} /></div>
      <div className="splash-title">{status === 'reconnecting' ? 'Reconnecting…' : status === 'identifying' ? 'Loading your huddles…' : 'Connecting…'}</div>
      <div className="splash-tip"><span>Did you know</span>{tip}</div>
      {slow && (
        <div className="splash-slow">
          Taking longer than usual. Make sure the server is running.
          <button className="btn btn-link" onClick={logout}>Log out</button>
        </div>
      )}
    </div>
  );
}
