// Safe markdown renderer → React elements (never dangerouslySetInnerHTML).
// Supports: **bold** *italic* _italic_ __underline__ ~~strike~~ `code` ```fenced``` > quote ||spoiler||,
// auto-links, <@user> <@&role> <#channel> @everyone @here, backslash escapes.
import { Fragment, useState, type ReactNode, type MouseEvent } from 'react';
import { useGuildStore, intToHex } from '../stores/guilds';
import { useUIStore } from '../stores/ui';
import { navigate, channelPath } from './nav';
import { ChannelType } from '@huddle/shared';

interface Ctx { guildId: string | null; key: number }

type Rule = { name: string; re: RegExp };
const RULES: Rule[] = [
  { name: 'escape', re: /\\([*_~`|\\<>#@:])/ },
  { name: 'code2', re: /``([^`][\s\S]*?)``/ },
  { name: 'code', re: /`([^`\n]+)`/ },
  { name: 'angleurl', re: /<(https?:\/\/[^\s>]+)>/ },
  { name: 'url', re: /https?:\/\/[^\s<]+[^\s<.,:;"')\]!?*_~|]/ },
  { name: 'user', re: /<@!?(\d+)>/ },
  { name: 'role', re: /<@&(\d+)>/ },
  { name: 'channel', re: /<#(\d+)>/ },
  { name: 'everyone', re: /@(everyone|here)\b/ },
  { name: 'spoiler', re: /\|\|([\s\S]+?)\|\|/ },
  { name: 'bold', re: /\*\*([\s\S]+?)\*\*(?!\*)/ },
  { name: 'underline', re: /__([\s\S]+?)__(?!_)/ },
  { name: 'italic', re: /\*(?![\s*])([\s\S]*?[^\s\\])\*(?!\*)/ },
  { name: 'italic_', re: /(?<![A-Za-z0-9])_(?![\s_])([\s\S]*?[^\s\\])_(?![A-Za-z0-9])/ },
  { name: 'strike', re: /~~([\s\S]+?)~~/ },
];

function parseInline(text: string, ctx: Ctx, depth = 0): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  while (rest.length) {
    let best: { rule: Rule; m: RegExpExecArray } | null = null;
    for (const rule of RULES) {
      const m = rule.re.exec(rest);
      if (m && (!best || m.index < best.m.index)) best = { rule, m };
      if (best && best.m.index === 0) break;
    }
    if (!best) { pushText(out, rest, ctx); break; }
    const { rule, m } = best;
    if (m.index > 0) pushText(out, rest.slice(0, m.index), ctx);
    rest = rest.slice(m.index + m[0].length);
    const k = ctx.key++;
    const inner = (s: string) => (depth > 12 ? s : parseInline(s, ctx, depth + 1));
    switch (rule.name) {
      case 'escape': out.push(m[1]); break;
      case 'code': case 'code2': out.push(<code key={k} className="md-inline-code">{m[1].trim() || m[1]}</code>); break;
      case 'angleurl': case 'url': {
        const href = rule.name === 'url' ? m[0] : m[1];
        out.push(<a key={k} href={href} target="_blank" rel="noopener noreferrer nofollow" className="md-link">{href}</a>);
        break;
      }
      case 'user': out.push(<UserMention key={k} userId={m[1]} guildId={ctx.guildId} />); break;
      case 'role': out.push(<RoleMention key={k} roleId={m[1]} guildId={ctx.guildId} />); break;
      case 'channel': out.push(<ChannelMention key={k} channelId={m[1]} />); break;
      case 'everyone': out.push(<span key={k} className="mention">@{m[1]}</span>); break;
      case 'spoiler': out.push(<Spoiler key={k}>{inner(m[1])}</Spoiler>); break;
      case 'bold': out.push(<strong key={k}>{inner(m[1])}</strong>); break;
      case 'underline': out.push(<u key={k}>{inner(m[1])}</u>); break;
      case 'italic': case 'italic_': out.push(<em key={k}>{inner(m[1])}</em>); break;
      case 'strike': out.push(<s key={k}>{inner(m[1])}</s>); break;
    }
  }
  return out;
}

function pushText(out: ReactNode[], s: string, ctx: Ctx) {
  // keep newlines as <br>
  const parts = s.split('\n');
  parts.forEach((p, i) => {
    if (i > 0) out.push(<br key={ctx.key++} />);
    if (p) out.push(p);
  });
}

type Block = { kind: 'text'; text: string } | { kind: 'code'; lang: string; text: string } | { kind: 'quote'; text: string };

function splitBlocks(src: string): Block[] {
  const blocks: Block[] = [];
  const fence = /```([a-zA-Z0-9_+-]*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  const pushProse = (s: string) => {
    if (!s) return;
    const lines = s.split('\n');
    let buf: string[] = [];
    let quote: string[] = [];
    const flushBuf = () => { if (buf.length) { blocks.push({ kind: 'text', text: buf.join('\n') }); buf = []; } };
    const flushQuote = () => { if (quote.length) { blocks.push({ kind: 'quote', text: quote.join('\n') }); quote = []; } };
    for (const line of lines) {
      const qm = /^>\s(.*)$/.exec(line) || (line === '>' ? ['', ''] : null);
      if (qm) { flushBuf(); quote.push(qm[1]); }
      else { flushQuote(); buf.push(line); }
    }
    flushBuf(); flushQuote();
  };
  while ((m = fence.exec(src))) {
    pushProse(trimNewlines(src.slice(last, m.index)));
    blocks.push({ kind: 'code', lang: m[1], text: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  pushProse(trimNewlines(src.slice(last)));
  return blocks;
}

function trimNewlines(s: string) { return s.replace(/^\n+|\n+$/g, ''); }

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}(?:️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*|\p{Regional_Indicator}{2}|\s)+$/u;

export function isEmojiOnly(content: string): boolean {
  const t = content.trim();
  if (!t || t.length > 60) return false;
  return EMOJI_ONLY.test(t) && !/\d/.test(t);
}

export function Markdown({ content, guildId = null }: { content: string; guildId?: string | null }) {
  const ctx: Ctx = { guildId, key: 0 };
  const blocks = splitBlocks(content);
  const jumbo = blocks.length === 1 && blocks[0].kind === 'text' && isEmojiOnly(content);
  return (
    <div className={'markdown' + (jumbo ? ' md-jumbo' : '')}>
      {blocks.map((b, i) => {
        if (b.kind === 'code') return <pre key={i} className="md-codeblock" data-lang={b.lang || undefined}><code>{b.text}</code></pre>;
        if (b.kind === 'quote') return <blockquote key={i} className="md-quote">{parseInline(b.text, ctx)}</blockquote>;
        return <Fragment key={i}>{parseInline(b.text, ctx)}{i < blocks.length - 1 && blocks[i + 1].kind === 'text' ? <br /> : null}</Fragment>;
      })}
    </div>
  );
}

/** Inline-only rendering (for reply previews, topics, search results). */
export function InlineMarkdown({ content, guildId = null }: { content: string; guildId?: string | null }) {
  const ctx: Ctx = { guildId, key: 0 };
  return <>{parseInline(content.replace(/```[a-z]*\n?/g, '').replace(/\n/g, ' '), ctx)}</>;
}

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  return (
    <span
      className={'md-spoiler' + (shown ? ' shown' : '')}
      role="button"
      tabIndex={0}
      aria-label={shown ? undefined : 'Spoiler, click to reveal'}
      onClick={(e) => { if (!shown) { e.stopPropagation(); setShown(true); } }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setShown(true); }}
    >
      <span className="md-spoiler-inner">{children}</span>
    </span>
  );
}

function UserMention({ userId, guildId }: { userId: string; guildId: string | null }) {
  const member = useGuildStore((s) => (guildId ? s.members[guildId]?.[userId] : undefined));
  const user = useGuildStore((s) => s.users[userId]);
  const name = member?.nick || member?.user.display_name || user?.display_name || member?.user.username || user?.username;
  const open = (e: MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    useUIStore.getState().openPopout({ kind: 'user', userId, guildId, rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } });
  };
  return <span className="mention interactive" onClick={open}>@{name ?? 'unknown-user'}</span>;
}

function RoleMention({ roleId, guildId }: { roleId: string; guildId: string | null }) {
  const role = useGuildStore((s) => (guildId ? s.roles[guildId]?.[roleId] : undefined));
  if (!role) return <span className="mention">@deleted-role</span>;
  const color = role.color ? intToHex(role.color) : undefined;
  return (
    <span className="mention role-mention" style={color ? { color, background: color + '26' } : undefined}>@{role.name}</span>
  );
}

function ChannelMention({ channelId }: { channelId: string }) {
  const channel = useGuildStore((s) => s.channels[channelId]);
  if (!channel) return <span className="mention">#deleted-channel</span>;
  const voice = channel.type === ChannelType.GUILD_VOICE;
  return (
    <span className="mention interactive" onClick={(e) => { e.stopPropagation(); navigate(channelPath(channel)); }}>
      {voice ? '🔊' : '#'}{channel.name}
    </span>
  );
}
