import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from '../common/icons';

export interface SettingsNavItem { id: string; label: ReactNode; danger?: boolean; hidden?: boolean }
export interface SettingsNavSection { header?: ReactNode; items: SettingsNavItem[] }

export function SettingsLayout({ close, sections, active, onSelect, children }: {
  close: () => void; sections: SettingsNavSection[]; active: string; onSelect: (id: string) => void; children: ReactNode;
}) {
  return createPortal(
    <div className="settings-layer" role="dialog" aria-modal="true">
      <nav className="settings-nav scroll-thin">
        <div className="settings-nav-inner">
          {sections.map((s, i) => {
            const items = s.items.filter((it) => !it.hidden);
            if (!items.length) return null;
            return (
              <div key={i} className="settings-nav-section">
                {s.header && <div className="settings-nav-header">{s.header}</div>}
                {items.map((it) => (
                  <button key={it.id} className={'settings-nav-item' + (active === it.id ? ' active' : '') + (it.danger ? ' danger' : '')} onClick={() => onSelect(it.id)}>
                    {it.label}
                  </button>
                ))}
                {i < sections.length - 1 && <div className="settings-nav-sep" />}
              </div>
            );
          })}
        </div>
      </nav>
      <div className="settings-content scroll-thin">
        <div className="settings-content-inner">{children}</div>
        <div className="settings-close">
          <button className="settings-close-btn" aria-label="Close settings" onClick={close}><IconClose size={20} /></button>
          <span>ESC</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function UnsavedBar({ onReset, onSave, busy, error }: { onReset: () => void; onSave: () => void; busy?: boolean; error?: string }) {
  return (
    <div className="unsaved-bar" role="status">
      <span>{error ? <span className="danger-text">{error}</span> : 'Careful — you have unsaved changes!'}</span>
      <span className="spacer" />
      <button className="btn btn-link-plain" onClick={onReset}>Reset</button>
      <button className="btn btn-success" disabled={busy} onClick={onSave}>{busy ? 'Saving…' : 'Save Changes'}</button>
    </div>
  );
}
