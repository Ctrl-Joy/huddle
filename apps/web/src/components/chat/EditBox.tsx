import { useEffect, useRef, useState } from 'react';
import { LIMITS, type Message } from '@huddle/shared';
import { useUIStore, toast } from '../../stores/ui';
import { editMessage } from '../../lib/actions';
import { encodeCustomEmoji } from '../../lib/emoji';
import { errorMessage } from '../../api/client';
import { confirmDeleteMessage } from '../menus/menus';

export function EditBox({ message }: { message: Message }) {
  const [text, setText] = useState(message.content);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 400) + 'px';
  }, [text]);

  const cancel = () => useUIStore.getState().setEditing(null);
  const save = async () => {
    const t = encodeCustomEmoji(text.trim(), message.guild_id);
    if (!t && !message.attachments.length) { cancel(); confirmDeleteMessage(message); return; }
    if (t === message.content) { cancel(); return; }
    setBusy(true);
    try { await editMessage(message.channel_id, message.id, t); cancel(); }
    catch (e) { toast(errorMessage(e), 'error'); setBusy(false); }
  };

  return (
    <div className="edit-box">
      <textarea
        ref={ref}
        value={text}
        maxLength={LIMITS.MESSAGE_LENGTH}
        disabled={busy}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
          else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void save(); }
        }}
      />
      <div className="edit-hint">escape to <button className="btn-link" onClick={cancel}>cancel</button> • enter to <button className="btn-link" onClick={save}>save</button></div>
    </div>
  );
}
