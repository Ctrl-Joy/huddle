import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconChevronRight, IconClose, IconSearch } from '../common/icons';

export interface SettingsNavItem { id: string; label: ReactNode; danger?: boolean; hidden?: boolean; /** extra search terms, e.g. "password microphone" */ keywords?: string }
export interface SettingsNavSection { header?: ReactNode; items: SettingsNavItem[] }

const labelText = (it: SettingsNavItem) => (typeof it.label === 'string' ? it.label : '');

export function SettingsLayout({ close, sections, active, onSelect, searchable, startOnContent, children }: {
  close: () => void; sections: SettingsNavSection[]; active: string; onSelect: (id: string) => void; children: ReactNode;
  /** show a search box that filters the nav by label and keywords */
  searchable?: boolean;
  /** phones: open straight on the content pane instead of the section list */
  startOnContent?: boolean;
}) {
  const [query, setQuery] = useState('');
  // phones show either the section list or one section, full screen
  const [showContent, setShowContent] = useState(!!startOnContent);
  const q = query.trim().toLowerCase();
  const visible = sections
    .map((s) => ({ ...s, items: s.items.filter((it) => !it.hidden && (!q || `${labelText(it)} ${it.keywords ?? ''}`.toLowerCase().includes(q))) }))
    .filter((s) => s.items.length);
  const activeLabel = sections.flatMap((s) => s.items).find((it) => it.id === active)?.label;

  const select = (it: SettingsNavItem) => {
    onSelect(it.id);
    if (!it.danger) setShowContent(true);
  };

  return createPortal(
    <div className={'settings-layer' + (showContent ? ' show-content' : '')} role="dialog" aria-modal="true">
      <nav className="settings-nav scroll-thin">
        <div className="settings-mobile-bar">
          <h2>Settings</h2>
          <button className="settings-close-btn" aria-label="Close settings" onClick={close}><IconClose size={20} /></button>
        </div>
        <div className="settings-nav-inner">
          {searchable && (
            <div className="search-field settings-search">
              <input
                type="search"
                placeholder="Search settings"
                aria-label="Search settings"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && visible[0]) { e.preventDefault(); select(visible[0].items[0]); } }}
              />
              <IconSearch size={16} />
            </div>
          )}
          {visible.map((s, i) => (
            <div key={i} className="settings-nav-section">
              {s.header && <div className="settings-nav-header">{s.header}</div>}
              {s.items.map((it) => (
                <button key={it.id} className={'settings-nav-item' + (active === it.id ? ' active' : '') + (it.danger ? ' danger' : '')} onClick={() => select(it)}>
                  {it.label}
                </button>
              ))}
              {i < visible.length - 1 && <div className="settings-nav-sep" />}
            </div>
          ))}
          {searchable && q && !visible.length && <div className="settings-no-results">No results</div>}
        </div>
      </nav>
      <div className="settings-content scroll-thin">
        <div className="settings-mobile-bar">
          <button className="settings-back-btn" aria-label="Back to settings list" onClick={() => setShowContent(false)}><IconChevronRight size={20} /></button>
          <h2>{activeLabel}</h2>
          <button className="settings-close-btn" aria-label="Close settings" onClick={close}><IconClose size={20} /></button>
        </div>
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
