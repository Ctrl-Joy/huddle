import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LIMITS, Permissions, type Channel } from '@huddle/shared';
import { useUIStore, toast } from '../../stores/ui';
import { useComposerStore } from '../../stores/composer';
import { useMessageStore } from '../../stores/messages';
import { useCan } from '../../lib/permissions';
import { isPrivateChannel } from '../../stores/guilds';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { Composer } from './Composer';
import { MemberList } from '../members/MemberList';
import { DMProfilePanel } from '../members/DMProfilePanel';
import { SearchPanel } from './SearchPanel';
import { IconUpload } from '../common/icons';
import { formatBytes } from '../../lib/format';
import { useVoiceStore, voiceActions } from '../../stores/voice';
import { CallStage, CallControls } from '../voice/VoiceView';

export function addFilesChecked(channelId: string, files: File[]) {
  const ok: File[] = [];
  for (const f of files) {
    if (f.size > LIMITS.ATTACHMENT_BYTES) toast(`${f.name} is larger than ${formatBytes(LIMITS.ATTACHMENT_BYTES)}`, 'error');
    else ok.push(f);
  }
  const existing = useComposerStore.getState().files[channelId]?.length ?? 0;
  if (existing + ok.length > LIMITS.ATTACHMENTS_PER_MESSAGE) toast(`You can attach up to ${LIMITS.ATTACHMENTS_PER_MESSAGE} files per message`, 'error');
  if (ok.length) useComposerStore.getState().addFiles(channelId, ok);
}

export function ChatView({ channel }: { channel: Channel }) {
  const memberListOpen = useUIStore((s) => s.memberListOpen);
  const searchOpen = useUIStore((s) => s.searchOpen);
  const canAttachPerm = useCan(channel.id, Permissions.ATTACH_FILES);
  const canSend = useCan(channel.id, Permissions.SEND_MESSAGES);
  const canAttach = canAttachPerm && canSend;
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [params, setParams] = useSearchParams();
  const isDM = isPrivateChannel(channel);

  // deep link: ?m=<messageId>
  useEffect(() => {
    const mid = params.get('m');
    if (mid) {
      void useMessageStore.getState().jumpTo(channel.id, mid);
      params.delete('m');
      setParams(params, { replace: true });
    }
  }, [params, setParams, channel.id]);

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  const onDragEnter = (e: DragEvent) => { if (!hasFiles(e) || !canAttach) return; e.preventDefault(); dragDepth.current++; setDragging(true); };
  const onDragLeave = (e: DragEvent) => { if (!hasFiles(e)) return; dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); };
  const onDragOver = (e: DragEvent) => { if (hasFiles(e) && canAttach) e.preventDefault(); };
  const onDrop = (e: DragEvent) => {
    if (!hasFiles(e) || !canAttach) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    addFilesChecked(channel.id, Array.from(e.dataTransfer.files));
  };

  const side = searchOpen && channel.guild_id ? <SearchPanel guildId={channel.guild_id} />
    : memberListOpen ? (isDM ? <DMProfilePanel channel={channel} /> : <MemberList guildId={channel.guild_id!} channelId={channel.id} />)
    : null;

  return (
    <div className="chat-view" onDragEnter={onDragEnter} onDragLeave={onDragLeave} onDragOver={onDragOver} onDrop={onDrop}>
      <ChatHeader channel={channel} />
      {isDM && <DMCallArea channelId={channel.id} />}
      <div className="chat-body">
        <div className="chat-column">
          <MessageList channel={channel} />
          <Composer channel={channel} />
        </div>
        {side}
      </div>
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card">
            <div className="drop-icons"><IconUpload size={40} /></div>
            <h3>Upload to {isDM ? 'this conversation' : '#' + channel.name}</h3>
            <p>Drop up to {LIMITS.ATTACHMENTS_PER_MESSAGE} files, {formatBytes(LIMITS.ATTACHMENT_BYTES)} each.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function DMCallArea({ channelId }: { channelId: string }) {
  const active = useVoiceStore((s) => Object.values(s.states).some((v) => v.channel_id === channelId));
  const connected = useVoiceStore((s) => s.connection?.channelId === channelId);
  if (!active && !connected) return null;
  return (
    <div className="dm-call">
      <CallStage channelId={channelId} guildId={null} compact />
      {connected ? <CallControls /> : (
        <div className="call-controls"><button className="btn btn-success" onClick={() => voiceActions.join(channelId, null)}>Join Call</button></div>
      )}
    </div>
  );
}
