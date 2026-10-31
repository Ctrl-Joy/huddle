// Scheduled events: the card used in lists / the create preview, the server's events modal and an event's detail view.
import { useEffect, useState, type ReactNode } from 'react';
import { Permissions, has, type PublicUser, type ScheduledEvent } from '@huddle/shared';
import { Modal } from '../modals/Modal';
import { Avatar } from '../common/Avatar';
import { IconArrowLeft, IconCalendar, IconLink, IconPin, IconSpeaker, IconUsers } from '../common/icons';
import { useGuildStore, displayName, userDisplayName } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useEventStore, useGuildEvents } from '../../stores/scheduledEvents';
import { usePrefs } from '../../stores/prefs';
import { confirmDialog, openModal, toast, useUIStore } from '../../stores/ui';
import { voiceActions } from '../../stores/voice';
import { useGuildPermissions } from '../../lib/permissions';
import { copyText, pluralize } from '../../lib/format';
import { navigate } from '../../lib/nav';
import { api, errorMessage } from '../../api/client';
import {
  deleteEvent, eventLink, eventWhenLabel, fetchInterested, formatEventRange, loadGuildEvents, setEventStatus, toggleInterested,
} from '../../lib/scheduledEvents';

type EventLike = Pick<ScheduledEvent, 'name' | 'description' | 'start_time' | 'end_time' | 'location_type' | 'channel_id' | 'location' | 'image' | 'status'>
  & Partial<Pick<ScheduledEvent, 'id' | 'user_count' | 'user_interested'>>;

function useEventLocation(e: Pick<EventLike, 'location_type' | 'channel_id' | 'location'>): { icon: ReactNode; text: string } {
  const channel = useGuildStore((s) => (e.channel_id ? s.channels[e.channel_id] : undefined));
  if (e.location_type === 'voice') return { icon: <IconSpeaker size={16} />, text: channel?.name ?? 'Voice channel' };
  return { icon: <IconPin size={16} />, text: e.location ?? '' };
}

/** What the viewer may do with an event: edit/cancel need Manage Events; the creator can also start / end it. */
function useEventRights(e: ScheduledEvent) {
  const perms = useGuildPermissions(e.guild_id);
  const me = useAuthStore((s) => s.user?.id);
  const manage = has(perms, Permissions.MANAGE_EVENTS);
  return { manage, run: manage || e.creator_id === me };
}

function guarded(fn: () => Promise<unknown>) {
  return () => { fn().catch((err) => toast(errorMessage(err), 'error')); };
}

/** Start / End / Edit / Cancel / Join, Share and the Interested toggle. */
function EventActions({ e, onEdit }: { e: ScheduledEvent; onEdit?: () => void }) {
  const { manage, run } = useEventRights(e);
  const live = e.status === 'active';
  const join = () => {
    if (!e.channel_id) return;
    voiceActions.join(e.channel_id, e.guild_id);
    navigate(`/channels/${e.guild_id}/${e.channel_id}`);
    useUIStore.getState().closeAllModals();
  };
  return (
    <div className="event-actions" onClick={(ev) => ev.stopPropagation()}>
      <button className="icon-btn" aria-label="Copy event link" title="Copy event link"
        onClick={() => { void copyText(eventLink(e)); toast('Event link copied', 'success'); }}>
        <IconLink size={18} />
      </button>
      <span className="event-actions-spacer" />
      {manage && !live && <button className="btn btn-ghost btn-small" onClick={onEdit ?? (() => openModal('createEvent', { guildId: e.guild_id, eventId: e.id }))}>Edit</button>}
      {manage && !live && (
        <button className="btn btn-ghost btn-small danger-text" onClick={() => confirmDialog({
          title: 'Cancel Event', danger: true, confirmLabel: 'Cancel Event',
          body: <>Cancel <strong>{e.name}</strong>? Everyone interested will see it's off.</>,
          onConfirm: () => setEventStatus(e, 'cancel'),
        })}>Cancel</button>
      )}
      {run && !live && <button className="btn btn-success btn-small" onClick={guarded(() => setEventStatus(e, 'start'))}>Start</button>}
      {run && live && <button className="btn btn-danger btn-small" onClick={guarded(() => setEventStatus(e, 'end'))}>End Event</button>}
      {live && e.channel_id && <button className="btn btn-primary btn-small" onClick={join}>Join</button>}
      {!live && (
        <button className={'btn btn-small ' + (e.user_interested ? 'btn-secondary event-interested on' : 'btn-secondary event-interested')}
          aria-pressed={e.user_interested} onClick={() => void toggleInterested(e)}>
          {e.user_interested ? '✓ Interested' : 'Interested'}
        </button>
      )}
    </div>
  );
}

/** One event as a card. Without `event` (a draft in the create flow) it renders without actions. */
export function EventCard({ draft, event, onOpen }: { draft?: EventLike; event?: ScheduledEvent; onOpen?: () => void }) {
  usePrefs((s) => s.clock); // re-render when the 12/24h preference changes
  const e = (event ?? draft)!;
  const loc = useEventLocation(e);
  const live = e.status === 'active';
  const when = event ? eventWhenLabel(event) : formatEventRange(e);
  return (
    <article className={'event-card' + (live ? ' live' : '') + (onOpen ? ' clickable' : '')} onClick={onOpen}
      onKeyDown={(k) => { if (onOpen && (k.key === 'Enter' || k.key === ' ') && k.target === k.currentTarget) { k.preventDefault(); onOpen(); } }}
      tabIndex={onOpen ? 0 : undefined} role={onOpen ? 'button' : undefined} aria-label={onOpen ? `${e.name}, ${when}` : undefined}>
      {e.image && <div className="event-cover"><img src={e.image} alt="" /></div>}
      <div className="event-card-body">
        <div className="event-when-row">
          <span className={'event-when' + (live ? ' live' : '')}>
            {live ? <span className="event-live-dot" /> : <IconCalendar size={15} />}
            {when}
          </span>
          {e.user_count !== undefined && (
            <span className="event-count" title={pluralize(e.user_count, 'person', 'people') + ' interested'}>
              <IconUsers size={14} /> {e.user_count}
            </span>
          )}
        </div>
        <h3 className="event-name">{e.name}</h3>
        {e.description && <p className="event-desc">{e.description}</p>}
        <div className="event-location">{loc.icon}<span className="truncate">{loc.text}</span></div>
      </div>
      {event && <div className="event-card-foot"><EventActions e={event} /></div>}
    </article>
  );
}

function EventDetail({ e, back }: { e: ScheduledEvent; back?: () => void }) {
  usePrefs((s) => s.clock);
  const loc = useEventLocation(e);
  const { manage } = useEventRights(e);
  const [people, setPeople] = useState<PublicUser[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchInterested(e).then((u) => { if (live) setPeople(u); }).catch(() => { if (live) setPeople([]); });
    return () => { live = false; };
  }, [e.id, e.user_count]); // eslint-disable-line react-hooks/exhaustive-deps
  const statusText = e.status === 'active' ? 'Happening now' : e.status === 'scheduled' ? 'Upcoming' : e.status === 'cancelled' ? 'Cancelled' : 'Ended';
  return (
    <div className="event-detail">
      {back && <button className="btn-link event-back" onClick={back}><IconArrowLeft size={16} /> All events</button>}
      {e.image && <div className="event-cover large"><img src={e.image} alt="" /></div>}
      <div className={'event-status-tag ' + e.status}>{statusText}</div>
      <h2 className="event-detail-name">{e.name}</h2>
      <ul className="event-facts">
        <li><IconCalendar size={16} /><span>{formatEventRange(e)}</span></li>
        <li>{loc.icon}<span>{loc.text}</span></li>
        <li><IconUsers size={16} /><span>{pluralize(e.user_count, 'person', 'people')} interested</span></li>
        {e.creator && <li><Avatar user={e.creator} size={16} /><span>Created by {displayName(e.creator.id, e.guild_id) || userDisplayName(e.creator)}</span></li>}
      </ul>
      {e.description && <p className="event-detail-desc">{e.description}</p>}
      {(e.status === 'scheduled' || e.status === 'active') && <EventActions e={e} />}
      <div className="field-label event-people-head">Interested</div>
      {people === null ? <div className="event-muted">Loading…</div> : people.length === 0 ? <div className="event-muted">No one yet. Be the first!</div> : (
        <ul className="event-people">
          {people.map((u) => (
            <li key={u.id}><Avatar user={u} size={28} /><span className="truncate">{displayName(u.id, e.guild_id) || userDisplayName(u)}</span></li>
          ))}
        </ul>
      )}
      {manage && (e.status === 'scheduled' || e.status === 'active') && (
        <button className="btn-link danger-text event-delete" onClick={() => confirmDialog({
          title: 'Delete Event', danger: true, confirmLabel: 'Delete',
          body: <>Delete <strong>{e.name}</strong> for everyone? This can't be undone.</>,
          onConfirm: async () => { await deleteEvent(e); back?.(); },
        })}>Delete event</button>
      )}
    </div>
  );
}

/** The server's events (list ⇄ detail). Opened from the channel list's "Events" row or an event link. */
export function EventsModal({ close, guildId, eventId }: { close: () => void; guildId: string; eventId?: string }) {
  const events = useGuildEvents(guildId);
  const [selected, setSelected] = useState<string | null>(eventId ?? null);
  const picked = useEventStore((s) => (selected ? s.byId[selected] : undefined));
  const perms = useGuildPermissions(guildId);
  const canCreate = has(perms, Permissions.MANAGE_EVENTS);
  const [missing, setMissing] = useState(false);

  useEffect(() => { void loadGuildEvents(guildId); }, [guildId]);
  // a shared link to an event that isn't in the list (ended, or not loaded yet): fetch it directly
  useEffect(() => {
    if (!selected || picked) return;
    let live = true;
    api.get<ScheduledEvent>(`/guilds/${guildId}/scheduled-events/${selected}`)
      .then((ev) => { if (live) useEventStore.getState().upsert(ev); })
      .catch(() => { if (live) setMissing(true); });
    return () => { live = false; };
  }, [selected, picked, guildId]);

  const create = () => openModal('createEvent', { guildId });
  const title = picked ? undefined : events.length ? pluralize(events.length, 'Event') : 'Events';
  return (
    <Modal close={close} size="md" className="events-modal" title={title}
      footer={!picked && canCreate ? <button className="btn btn-primary" onClick={create}>Create Event</button> : undefined}>
      {picked ? (
        <EventDetail e={picked} back={() => setSelected(null)} />
      ) : selected && !missing ? (
        <div className="event-muted">Loading…</div>
      ) : (
        <>
          {missing && <div className="form-error">That event doesn't exist any more, or you can't see it.</div>}
          {events.length === 0 ? (
            <div className="events-empty">
              <div className="events-empty-icon"><IconCalendar size={28} /></div>
              <strong>No upcoming events</strong>
              <p>{canCreate ? 'Plan a game night, a watch party or a meetup and let people mark themselves interested.' : 'When someone plans something here, it shows up in this list.'}</p>
            </div>
          ) : (
            <div className="event-list">
              {events.map((e) => <EventCard key={e.id} event={e} onOpen={() => { setMissing(false); setSelected(e.id); }} />)}
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
