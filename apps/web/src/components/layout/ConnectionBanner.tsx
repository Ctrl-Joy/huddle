import { useGatewayStatus } from './useAppEffects';

export function ConnectionBanner() {
  const status = useGatewayStatus();
  if (status === 'ready' || status === 'idle') return null;
  return (
    <div className="connection-banner" role="status">
      <span className="spinner small" />
      {status === 'closed' ? 'Disconnected from Huddle.' : 'Connection lost — reconnecting…'}
    </div>
  );
}
