import type { MessageSnapshot } from '@huddle/shared';
import type { ClientMessage } from '../../stores/messages';
import { useGuildStore, userDisplayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { channelVisible } from '../../lib/permissionsCore';
import { Markdown } from '../../lib/markdown';
import { navigate, channelPath } from '../../lib/nav';
import { formatFull, formatTimestamp } from '../../lib/format';
import { Avatar, Tooltip } from '../common/Avatar';
import { IconForward } from '../common/icons';
import { Attachments } from './Attachments';
import { Embeds } from './Embeds';
import { MessageStickers } from './Sticker';

/** The quoted copy inside a forwarded message: "Forwarded" header, original content + files, and where it came from. */
export function ForwardedMessage({ message, snap }: { message: ClientMessage; snap: MessageSnapshot }) {
  const me = useAuthStore((s) => s.user!.id);
  const channel = useGuildStore((s) => s.channels[snap.channel_id]);
  const guild = useGuildStore((s) => (snap.guild_id ? s.guilds[snap.guild_id] : undefined));
  // only offer the jump (and name the channel) when the viewer can actually open the source
  const canSee = !!channel && channelVisible(channel, me);
  const where = canSee
    ? (channel.guild_id ? `#${channel.name}${guild ? ` · ${guild.name}` : ''}` : 'Direct Message')
    : snap.guild_id ? (guild ? guild.name : 'another server') : 'a private conversation';
  const jump = () => navigate(`${channelPath({ id: snap.channel_id, guild_id: snap.guild_id })}?m=${snap.message_id}`);

  return (
    <div className="forwarded">
      <div className="forwarded-head"><IconForward size={14} /> <em>Forwarded</em></div>
      <div className="forwarded-body">
        <div className="forwarded-author">
          <Avatar user={snap.author} size={18} />
          <span>{userDisplayName(snap.author)}</span>
        </div>
        {snap.content && <div className="message-content"><Markdown content={snap.content} guildId={snap.guild_id} /></div>}
        {!!snap.sticker_items?.length && <MessageStickers items={snap.sticker_items} />}
        {snap.attachments.length > 0 && <Attachments message={message} list={snap.attachments} />}
        {snap.embeds.length > 0 && <Embeds message={message} embeds={snap.embeds} canSuppress={false} />}
        <div className="forwarded-meta">
          <span className="truncate">{where}</span>
          <span>·</span>
          <Tooltip label={formatFull(snap.created_at)}><time dateTime={snap.created_at}>{formatTimestamp(snap.created_at)}</time></Tooltip>
          {canSee && <button className="btn-link" onClick={jump}>Jump to original</button>}
        </div>
      </div>
    </div>
  );
}
