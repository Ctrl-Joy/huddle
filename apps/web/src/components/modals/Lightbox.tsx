import { createPortal } from 'react-dom';
import { IconClose, IconExternal } from '../common/icons';
import { formatBytes } from '../../lib/format';

export function Lightbox({ close, url, filename, size, type }: { close: () => void; url: string; filename: string; size?: number; type?: string }) {
  const video = type?.startsWith('video/');
  return createPortal(
    <div className="lightbox" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="lightbox-inner">
        {video ? <video src={url} controls autoPlay /> : <img src={url} alt={filename} onClick={close} />}
        <div className="lightbox-bar">
          <span className="truncate">{filename}{size ? ` · ${formatBytes(size)}` : ''}</span>
          <a href={url} target="_blank" rel="noopener noreferrer" className="btn-link"><IconExternal size={14} /> Open original</a>
        </div>
      </div>
      <button className="lightbox-close icon-btn" aria-label="Close" onClick={close}><IconClose size={24} /></button>
    </div>,
    document.body,
  );
}
