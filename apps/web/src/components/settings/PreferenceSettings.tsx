import type { ReactNode } from 'react';
import { usePrefs, FONT_MIN, FONT_MAX, FONT_DEFAULT, type MotionPref, type MessageDisplay, type ClockPref } from '../../stores/prefs';
import { formatTime } from '../../lib/format';
import { Field, Toggle } from '../modals/Modal';
import { Markdown } from '../../lib/markdown';
import { LogoMark } from '../common/icons';

function RadioCards<T extends string>({ value, options, onChange }: { value: T; options: { id: T; title: string; desc: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="radio-cards" role="radiogroup">
      {options.map((o) => (
        <button type="button" key={o.id} role="radio" aria-checked={value === o.id} className={'radio-card' + (value === o.id ? ' selected' : '')} onClick={() => onChange(o.id)}>
          <span className="radio-dot" />
          <span className="radio-card-text"><strong>{o.title}</strong><small>{o.desc}</small></span>
        </button>
      ))}
    </div>
  );
}

/** Two sample messages that pick up the live font size / display mode. */
function PreviewMessages({ children }: { children?: ReactNode }) {
  return (
    <div className="appearance-preview">
      <div className="message first">
        <div className="message-row">
          <div className="message-gutter"><span className="avatar" style={{ width: 40, height: 40 }}><span className="avatar-fallback" style={{ background: '#0f766e' }}><LogoMark size={24} /></span></span></div>
          <div className="message-main">
            <div className="message-header"><span className="author-name" style={{ color: 'var(--accent)' }}>Huddle</span><span className="message-time">Today at {formatTime(new Date(2026, 0, 1, 15, 41))}</span></div>
            <div className="message-content"><Markdown content={'Pizza at **6**? Menu is here: https://huddle.example/menu'} /></div>
          </div>
        </div>
      </div>
      <div className="message grouped">
        <div className="message-row">
          <div className="message-gutter"><span className="hover-time">{formatTime(new Date(2026, 0, 1, 15, 42))}</span></div>
          <div className="message-main"><div className="message-content"><Markdown content={'Count me in.'} /></div></div>
        </div>
      </div>
      {children}
    </div>
  );
}

export function AccessibilityTab() {
  const p = usePrefs();
  return (
    <div>
      <h1 className="settings-title">Accessibility</h1>
      <Field label="Chat Font Size" hint={`${p.fontSize}px${p.fontSize === FONT_DEFAULT ? ' (default)' : ''}`}>
        <input type="range" className="range" min={FONT_MIN} max={FONT_MAX} step={1} value={p.fontSize} onChange={(e) => p.set({ fontSize: Number(e.target.value) })} />
      </Field>
      <div className="range-ticks">{Array.from({ length: FONT_MAX - FONT_MIN + 1 }, (_, i) => <span key={i}>{FONT_MIN + i}</span>)}</div>
      <PreviewMessages />
      <div className="divider" />
      <div className="field-label">Reduce Motion</div>
      <RadioCards<MotionPref>
        value={p.reduceMotion}
        onChange={(v) => p.set({ reduceMotion: v })}
        options={[
          { id: 'auto', title: 'Auto', desc: "Follow your device's reduce-motion setting." },
          { id: 'on', title: 'On', desc: 'Turn off animations and transitions.' },
          { id: 'off', title: 'Off', desc: 'Always play animations.' },
        ]}
      />
      <div className="setting-row">
        <div>
          <div className="setting-title">Underline Links</div>
          <div className="setting-desc">Always underline links so they don't rely on colour alone.</div>
        </div>
        <Toggle checked={p.underlineLinks} onChange={(v) => p.set({ underlineLinks: v })} label="Underline links" />
      </div>
    </div>
  );
}

export function ChatTab() {
  const p = usePrefs();
  return (
    <div>
      <h1 className="settings-title">Chat</h1>
      <div className="field-label">Message Display</div>
      <RadioCards<MessageDisplay>
        value={p.messageDisplay}
        onChange={(v) => p.set({ messageDisplay: v })}
        options={[
          { id: 'cozy', title: 'Cozy', desc: 'Avatars, roomy spacing and names on their own line.' },
          { id: 'compact', title: 'Compact', desc: 'A dense log: name and time inline with the message, no avatars.' },
        ]}
      />
      <PreviewMessages />
      <div className="setting-row">
        <div>
          <div className="setting-title">Show Images &amp; Videos Inline</div>
          <div className="setting-desc">When off, image and video attachments appear as file links instead of previews.</div>
        </div>
        <Toggle checked={p.inlineMedia} onChange={(v) => p.set({ inlineMedia: v })} label="Show images and videos inline" />
      </div>
    </div>
  );
}

const sampleTime = (hour12: boolean) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hour12 }).format(new Date(2026, 0, 1, 15, 41));

export function LanguageTab() {
  const clock = usePrefs((s) => s.clock);
  const set = usePrefs((s) => s.set);
  return (
    <div>
      <h1 className="settings-title">Language &amp; Time</h1>
      <Field label="Language" hint="More languages coming.">
        <select value="en" onChange={() => {}}>
          <option value="en">English</option>
        </select>
      </Field>
      <div className="divider" />
      <div className="field-label">Time Format</div>
      <RadioCards<ClockPref>
        value={clock}
        onChange={(v) => set({ clock: v })}
        options={[
          { id: '12h', title: '12-hour', desc: `Like ${sampleTime(true)}` },
          { id: '24h', title: '24-hour', desc: `Like ${sampleTime(false)}` },
        ]}
      />
    </div>
  );
}
