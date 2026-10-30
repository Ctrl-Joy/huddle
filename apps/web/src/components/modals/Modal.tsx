import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconClose } from '../common/icons';
import { errorMessage } from '../../api/client';

export function Modal({ close, title, subtitle, children, footer, size = 'sm', className, hideClose }: {
  close: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'full'; className?: string; hideClose?: boolean;
}) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  // play the short exit animation (.closing, 150ms) before actually closing
  const dismiss = () => {
    if (timer.current) return;
    setClosing(true);
    timer.current = setTimeout(close, 150);
  };
  return createPortal(
    <div className={'modal-backdrop' + (closing ? ' closing' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) dismiss(); }}>
      <div className={`modal modal-${size}` + (className ? ' ' + className : '') + (closing ? ' closing' : '')} role="dialog" aria-modal="true">
        {!hideClose && <button className="modal-close icon-btn" aria-label="Close" onClick={dismiss}><IconClose size={22} /></button>}
        {(title || subtitle) && (
          <div className="modal-head">
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmModal({ close, title, body, confirmLabel = 'Confirm', danger, onConfirm }: {
  close: () => void; title: string; body: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => Promise<void> | void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const go = async () => {
    setBusy(true); setError('');
    try { await onConfirm(); close(); } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return (
    <Modal close={close} title={title} footer={
      <>
        <button className="btn btn-ghost" onClick={close}>Cancel</button>
        <button className={'btn ' + (danger ? 'btn-danger' : 'btn-primary')} disabled={busy} onClick={go} autoFocus>{busy ? 'Working…' : confirmLabel}</button>
      </>
    }>
      <div className="confirm-body">{body}</div>
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}

export function Field({ label, error, children, hint }: { label: ReactNode; error?: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <label className={'field' + (error ? ' has-error' : '')}>
      <span className="field-label">{label}{error && <em> — {error}</em>}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function Toggle({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={'toggle' + (checked ? ' on' : '')}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle-knob">{checked ? '✓' : '✕'}</span>
    </button>
  );
}
