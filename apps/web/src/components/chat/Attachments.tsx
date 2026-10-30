import { useState } from 'react';
import type { Attachment } from '@huddle/shared';
import type { ClientMessage } from '../../stores/messages';
import { openModal } from '../../stores/ui';
import { formatBytes } from '../../lib/format';
import { IconDownload, IconFile } from '../common/icons';

const MAX_W = 420;
const MAX_H = 320;

function fit(w: number | null, h: number | null): { width?: number; height?: number } {
  if (!w || !h) return {};
  const scale = Math.min(1, MAX_W / w, MAX_H / h);
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

export function Attachments({ message }: { message: ClientMessage }) {
  const pending = !!message._state;
  return (
    <div className="attachments">
      {message.attachments.map((a) => <AttachmentView key={a.id} a={a} pending={pending} />)}
    </div>
  );
}

function AttachmentView({ a, pending }: { a: Attachment; pending: boolean }) {
  const spoiler = a.filename.startsWith('SPOILER_');
  const [revealed, setRevealed] = useState(!spoiler);
  const name = spoiler ? a.filename.slice(8) : a.filename;
  const type = a.content_type || '';

  if (pending || !a.url) {
    return (
      <div className="file-card pending">
        <IconFile size={30} />
        <div className="file-meta"><span className="file-name truncate">{name}</span><span className="file-size">{formatBytes(a.size)}</span></div>
      </div>
    );
  }

  if (type.startsWith('image/')) {
    const dims = fit(a.width, a.height);
    return (
      <div className={'media-attachment' + (spoiler && !revealed ? ' spoilered' : '')} style={dims.width ? { width: dims.width, aspectRatio: `${dims.width} / ${dims.height}` } : undefined}>
        <img
          src={a.url}
          alt={name}
          loading="lazy"
          width={dims.width}
          height={dims.height}
          onClick={() => (revealed ? openModal('lightbox', { url: a.url, filename: name, size: a.size, type }) : setRevealed(true))}
        />
        {spoiler && !revealed && <button className="spoiler-label" onClick={() => setRevealed(true)}>SPOILER</button>}
      </div>
    );
  }

  if (type.startsWith('video/')) {
    const dims = fit(a.width, a.height);
    return (
      <div className={'media-attachment video' + (spoiler && !revealed ? ' spoilered' : '')} style={dims.width ? { width: dims.width } : { width: MAX_W }}>
        <video src={a.url} controls preload="metadata" style={dims.height ? { maxHeight: MAX_H } : undefined} />
        {spoiler && !revealed && <button className="spoiler-label" onClick={() => setRevealed(true)}>SPOILER</button>}
      </div>
    );
  }

  return (
    <div className="file-card">
      <IconFile size={30} />
      <div className="file-meta">
        <a className="file-name truncate" href={a.url} target="_blank" rel="noopener noreferrer" download={name}>{name}</a>
        <span className="file-size">{formatBytes(a.size)}</span>
        {type.startsWith('audio/') && <audio src={a.url} controls preload="none" />}
      </div>
      <a className="icon-btn" href={a.url} download={name} aria-label={`Download ${name}`}><IconDownload size={20} /></a>
    </div>
  );
}
