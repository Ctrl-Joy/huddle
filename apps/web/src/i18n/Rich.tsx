import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

/** Inline markup from translation strings: [label](href) and **bold**. Nothing else is interpreted. */
export function Rich({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      const href = m[2];
      if (href.startsWith('/')) out.push(<Link key={i++} to={href}>{m[1]}</Link>);
      else if (/^https:\/\//.test(href)) out.push(<a key={i++} href={href} target="_blank" rel="noopener noreferrer">{m[1]}</a>);
      else out.push(m[1]);
    } else {
      out.push(<strong key={i++}>{m[3]}</strong>);
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}

/** Long-form body: blank lines separate paragraphs; a block of "- " lines is a list. */
export function Blocks({ text }: { text: string }) {
  return (
    <>
      {text.split(/\n{2,}/).map((block, bi) => {
        const lines = block.split('\n').filter((l) => l.trim() !== '');
        if (lines.length && lines.every((l) => l.startsWith('- '))) {
          return <ul key={bi}>{lines.map((l, li) => <li key={li}><Rich text={l.slice(2)} /></li>)}</ul>;
        }
        // a paragraph followed by a list in the same block
        const firstItem = lines.findIndex((l) => l.startsWith('- '));
        if (firstItem > 0 && lines.slice(firstItem).every((l) => l.startsWith('- '))) {
          return (
            <div key={bi}>
              <p><Rich text={lines.slice(0, firstItem).join(' ')} /></p>
              <ul>{lines.slice(firstItem).map((l, li) => <li key={li}><Rich text={l.slice(2)} /></li>)}</ul>
            </div>
          );
        }
        return <p key={bi}><Rich text={lines.join(' ')} /></p>;
      })}
    </>
  );
}

/** "Line one\nLine two" → one <span> per line (display headings). */
export function Lines({ text, gradLast }: { text: string; gradLast?: boolean }) {
  const lines = text.split('\n');
  return <>{lines.map((l, i) => <span key={i} className={gradLast && i === lines.length - 1 ? 'grad' : undefined}>{l}</span>)}</>;
}
