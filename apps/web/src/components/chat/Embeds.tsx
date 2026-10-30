import type { Embed, Message } from '@huddle/shared';
import { usePrefs } from '../../stores/prefs';
import { suppressEmbeds } from '../../lib/actions';
import { IconClose } from '../common/icons';
import { Tooltip } from '../common/Avatar';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** Link preview cards. Images are hot-linked (never proxied) and follow the "Show images & videos inline" preference. */
export function Embeds({ message, embeds, canSuppress }: { message: Message; embeds: Embed[]; canSuppress: boolean }) {
  const inline = usePrefs((s) => s.inlineMedia);
  return (
    <div className="embeds">
      {embeds.map((e, i) => (
        <article key={e.url + i} className="embed" style={e.color !== null ? { borderLeftColor: hex(e.color) } : undefined}>
          <div className="embed-text">
            {e.site_name && <div className="embed-site truncate">{e.site_name}</div>}
            {e.title && <a className="embed-title" href={e.url} target="_blank" rel="noopener noreferrer nofollow">{e.title}</a>}
            {e.description && <p className="embed-desc">{e.description}</p>}
          </div>
          {e.image && (inline
            ? <a className="embed-image" href={e.url} target="_blank" rel="noopener noreferrer nofollow" tabIndex={-1}>
                <img src={e.image.url} alt="" loading="lazy" referrerPolicy="no-referrer" width={e.image.width ?? undefined} height={e.image.height ?? undefined}
                  onError={(ev) => { (ev.currentTarget.parentElement as HTMLElement).hidden = true; }} />
              </a>
            : <a className="embed-image-link" href={e.image.url} target="_blank" rel="noopener noreferrer nofollow">View image</a>)}
          {canSuppress && (
            <Tooltip label="Remove embeds">
              <button className="embed-remove icon-btn tiny" aria-label="Remove embeds" onClick={() => void suppressEmbeds(message, true)}><IconClose size={14} /></button>
            </Tooltip>
          )}
        </article>
      ))}
    </div>
  );
}
