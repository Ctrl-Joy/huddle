import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChannelType, LIMITS, Permissions } from '@huddle/shared';
import { Modal, Field, Toggle } from './Modal';
import { useGuildStore } from '../../stores/guilds';
import { createChannel, setOverwrite } from '../../lib/actions';
import { errorMessage } from '../../api/client';
import { IconHash, IconLock, IconSpeaker } from '../common/icons';

function normalizeName(name: string, type: number) {
  return type === ChannelType.GUILD_TEXT ? name.toLowerCase().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, LIMITS.CHANNEL_NAME) : name.slice(0, LIMITS.CHANNEL_NAME);
}

export function CreateChannelModal({ close, guildId, parentId, channelType }: { close: () => void; guildId: string; parentId?: string; channelType?: number }) {
  const parent = useGuildStore((s) => (parentId ? s.channels[parentId] : undefined));
  const [type, setType] = useState<number>(channelType ?? ChannelType.GUILD_TEXT);
  const [name, setName] = useState('');
  const [priv, setPriv] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const submit = async () => {
    const n = type === ChannelType.GUILD_TEXT ? normalizeName(name, type).replace(/^-+|-+$/g, '') : name.trim();
    if (!n) { setError('Channel name is required.'); return; }
    setBusy(true); setError('');
    try {
      const c = await createChannel(guildId, {
        name: n, type, parent_id: parentId ?? null,
        ...(priv ? { permission_overwrites: [{ id: guildId, type: 0, allow: '0', deny: Permissions.VIEW_CHANNEL.toString() }] } : {}),
      });
      // ensure the private overwrite exists even if the server ignores it on create
      if (priv && !c.permission_overwrites?.some((o) => o.id === guildId)) {
        await setOverwrite(c.id, guildId, 0, 0n, Permissions.VIEW_CHANNEL);
      }
      close();
      nav(`/channels/${guildId}/${c.id}`);
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };

  return (
    <Modal close={close} title="Create Channel" subtitle={parent ? `in ${parent.name}` : undefined}
      footer={<><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy || !name.trim()} onClick={submit}>Create Channel</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="field-label">Channel type</div>
        <div className="radio-cards">
          {[
            { t: ChannelType.GUILD_TEXT, icon: <IconHash size={22} />, label: 'Text', desc: 'Send messages, images, files, opinions and puns' },
            { t: ChannelType.GUILD_VOICE, icon: <IconSpeaker size={22} />, label: 'Voice', desc: 'Hang out with voice, video and screen share' },
          ].map((o) => (
            <button type="button" key={o.t} className={'radio-card' + (type === o.t ? ' selected' : '')} onClick={() => setType(o.t)}>
              <span className="radio-card-icon">{o.icon}</span>
              <span className="radio-card-text"><strong>{o.label}</strong><small>{o.desc}</small></span>
              <span className="radio-dot" />
            </button>
          ))}
        </div>
        <Field label="Channel name" error={error}>
          <div className="input-with-icon">
            {type === ChannelType.GUILD_TEXT ? <IconHash size={16} /> : <IconSpeaker size={16} />}
            <input autoFocus value={name} placeholder={type === ChannelType.GUILD_TEXT ? 'new-channel' : 'Lounge'} onChange={(e) => setName(type === ChannelType.GUILD_TEXT ? normalizeName(e.target.value, type) : e.target.value)} />
          </div>
        </Field>
        <div className="setting-row">
          <div>
            <div className="setting-title"><IconLock size={14} /> Private channel</div>
            <div className="setting-desc">Only selected members and roles will be able to view this channel. You can grant access in channel settings.</div>
          </div>
          <Toggle checked={priv} onChange={setPriv} label="Private channel" />
        </div>
      </form>
    </Modal>
  );
}

export function CreateCategoryModal({ close, guildId }: { close: () => void; guildId: string }) {
  const [name, setName] = useState('');
  const [priv, setPriv] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) { setError('Category name is required.'); return; }
    setBusy(true);
    try {
      await createChannel(guildId, {
        name: name.trim(), type: ChannelType.GUILD_CATEGORY,
        ...(priv ? { permission_overwrites: [{ id: guildId, type: 0, allow: '0', deny: Permissions.VIEW_CHANNEL.toString() }] } : {}),
      });
      close();
    } catch (e) { setError(errorMessage(e)); setBusy(false); }
  };
  return (
    <Modal close={close} title="Create Category"
      footer={<><button className="btn btn-ghost" onClick={close}>Cancel</button><button className="btn btn-primary" disabled={busy || !name.trim()} onClick={submit}>Create Category</button></>}>
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <Field label="Category name" error={error}>
          <input autoFocus value={name} placeholder="New Category" onChange={(e) => setName(e.target.value)} maxLength={LIMITS.CHANNEL_NAME} />
        </Field>
        <div className="setting-row">
          <div>
            <div className="setting-title"><IconLock size={14} /> Private category</div>
            <div className="setting-desc">Only selected members and roles will be able to view this category.</div>
          </div>
          <Toggle checked={priv} onChange={setPriv} label="Private category" />
        </div>
      </form>
    </Modal>
  );
}
