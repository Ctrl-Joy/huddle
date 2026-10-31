// Create / edit a scheduled event in three steps: where → details → review.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChannelType, EVENT_LIMITS, type ScheduledEventCreate, type ScheduledEventLocationType } from '@huddle/shared';
import { Modal, Field } from '../modals/Modal';
import { IconImage, IconPin, IconSpeaker, IconTrash } from '../common/icons';
import { useGuildStore, sortChannels } from '../../stores/guilds';
import { useAuthStore } from '../../stores/auth';
import { useEventStore } from '../../stores/scheduledEvents';
import { usePrefs } from '../../stores/prefs';
import { channelVisible } from '../../lib/permissionsCore';
import { formatBytes, formatTime } from '../../lib/format';
import { fromDateTimeInputs, saveEvent, toDateTimeInputs } from '../../lib/scheduledEvents';
import { errorMessage } from '../../api/client';
import { EventCard } from './Events';

const STEPS = ['Location', 'Event Info', 'Review'];

/** Quarter-hour slots, labelled in the viewer's 12/24h style. */
function useTimeOptions(): { value: string; label: string }[] {
  const clock = usePrefs((s) => s.clock);
  return useMemo(() => {
    const out: { value: string; label: string }[] = [];
    const d = new Date(2000, 0, 1, 0, 0);
    for (let m = 0; m < 24 * 60; m += 15) {
      d.setHours(Math.floor(m / 60), m % 60);
      out.push({ value: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, label: formatTime(d) });
    }
    return out;
  }, [clock]);
}

/** Next round hour (at least 30 minutes away). */
function defaultStart(): string {
  const d = new Date(Date.now() + 30 * 60_000);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return d.toISOString();
}

function TimePick({ date, time, onDate, onTime, label, options }: {
  date: string; time: string; onDate: (v: string) => void; onTime: (v: string) => void; label: string;
  options: { value: string; label: string }[];
}) {
  // keep an off-grid time (an event edited from elsewhere) selectable
  const opts = options.some((o) => o.value === time) || !time ? options
    : [...options, { value: time, label: formatTime(new Date(`2000-01-01T${time}`)) }].sort((a, b) => a.value.localeCompare(b.value));
  return (
    <div className="event-datetime">
      <input type="date" aria-label={`${label} date`} value={date} onChange={(e) => onDate(e.target.value)} />
      <select aria-label={`${label} time`} value={time} onChange={(e) => onTime(e.target.value)}>
        {!time && <option value="">Time</option>}
        {opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function CreateEventModal({ close, guildId, eventId }: { close: () => void; guildId: string; eventId?: string }) {
  const editing = useEventStore((s) => (eventId ? s.byId[eventId] : undefined));
  const me = useAuthStore((s) => s.user!.id);
  const channels = useGuildStore((s) => s.channels);
  const voiceChannels = useMemo(
    () => Object.values(channels).filter((c) => c.guild_id === guildId && c.type === ChannelType.GUILD_VOICE && channelVisible(c, me)).sort(sortChannels),
    [channels, guildId, me],
  );
  const times = useTimeOptions();

  const init = editing ?? null;
  const start0 = toDateTimeInputs(init?.start_time ?? defaultStart());
  const end0 = init?.end_time ? toDateTimeInputs(init.end_time) : { date: '', time: '' };
  const [step, setStep] = useState(0);
  const [type, setType] = useState<ScheduledEventLocationType>(init?.location_type ?? (voiceChannels.length ? 'voice' : 'external'));
  const [channelId, setChannelId] = useState(init?.channel_id ?? voiceChannels[0]?.id ?? '');
  const [location, setLocation] = useState(init?.location ?? '');
  const [name, setName] = useState(init?.name ?? '');
  const [description, setDescription] = useState(init?.description ?? '');
  const [startDate, setStartDate] = useState(start0.date);
  const [startTime, setStartTime] = useState(start0.time);
  const [hasEnd, setHasEnd] = useState(!!init?.end_time);
  const [endDate, setEndDate] = useState(end0.date);
  const [endTime, setEndTime] = useState(end0.time);
  const [cover, setCover] = useState<File | null | undefined>(undefined); // undefined = unchanged
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const coverUrl = useMemo(() => (cover ? URL.createObjectURL(cover) : null), [cover]);
  useEffect(() => () => { if (coverUrl) URL.revokeObjectURL(coverUrl); }, [coverUrl]);
  const shownCover = cover === undefined ? init?.image ?? null : coverUrl;

  const startIso = fromDateTimeInputs(startDate, startTime);
  const endIso = hasEnd ? fromDateTimeInputs(endDate, endTime) : null;
  const startChanged = !init || startIso !== init.start_time;

  const whereError = type === 'voice' ? (!channelId ? 'Pick a voice channel' : '') : (!location.trim() ? 'Add a location' : '');
  const infoError = !name.trim() ? 'Give your event a topic'
    : !startIso ? 'Pick a start date and time'
    : startChanged && Date.parse(startIso) < Date.now() ? 'The start time has to be in the future'
    : hasEnd && !endIso ? 'Pick an end date and time'
    : endIso && startIso && Date.parse(endIso) <= Date.parse(startIso) ? 'The end has to be after the start'
    : '';

  const pickCover = (f: File | undefined) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(f.type)) { setError('Cover images can be PNG, JPEG, GIF or WebP.'); return; }
    if (f.size > EVENT_LIMITS.COVER_BYTES) { setError(`Cover images can be up to ${formatBytes(EVENT_LIMITS.COVER_BYTES)}.`); return; }
    setError('');
    setCover(f);
  };

  const toggleEnd = (on: boolean) => {
    setHasEnd(on);
    if (on && !endDate && startIso) {
      const e = toDateTimeInputs(new Date(Date.parse(startIso) + 2 * 3600_000).toISOString());
      setEndDate(e.date); setEndTime(e.time);
    }
  };

  const draft = {
    name: name.trim() || 'Untitled event', description: description.trim() || null, start_time: startIso ?? new Date().toISOString(),
    end_time: endIso, location_type: type, channel_id: type === 'voice' ? channelId : null,
    location: type === 'external' ? location.trim() : null, image: shownCover, status: 'scheduled' as const,
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true); setError('');
    const body: ScheduledEventCreate = {
      name: name.trim(), description: description.trim() || null, start_time: startIso!, end_time: endIso,
      location_type: type, ...(type === 'voice' ? { channel_id: channelId } : { location: location.trim() }),
    };
    // unchanged start times aren't re-validated (they may be in the past by now)
    if (init && !startChanged) delete (body as Partial<ScheduledEventCreate>).start_time;
    try {
      await saveEvent(guildId, body, cover, init?.id);
      close();
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const next = () => { setError(''); setStep((s) => Math.min(STEPS.length - 1, s + 1)); };
  const blocked = step === 0 ? !!whereError : step === 1 ? !!infoError : false;
  const footer = (
    <>
      {step > 0 ? <button className="btn btn-ghost" onClick={() => { setError(''); setStep(step - 1); }}>Back</button> : <button className="btn btn-ghost" onClick={close}>Cancel</button>}
      {step < STEPS.length - 1
        ? <button className="btn btn-primary" disabled={blocked} title={step === 0 ? whereError : infoError} onClick={next}>Next</button>
        : <button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? 'Saving…' : init ? 'Save Event' : 'Create Event'}</button>}
    </>
  );

  return (
    <Modal close={close} size="md" className="create-event-modal" footer={footer}
      title={step === 0 ? 'Where is your event?' : step === 1 ? 'Tell people about your event' : 'Here’s a preview of your event'}
      subtitle={step === 0 ? "So people know where to show up." : step === 1 ? 'Give it a topic, a time and anything else worth knowing.' : 'This is how it will look in the events list.'}>
      <ol className="event-steps" aria-label="Steps">
        {STEPS.map((s, i) => <li key={s} className={i === step ? 'current' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>{s}</li>)}
      </ol>

      {step === 0 && (
        <div role="radiogroup" aria-label="Location type">
          <button type="button" role="radio" aria-checked={type === 'voice'} className={'event-where' + (type === 'voice' ? ' selected' : '')}
            disabled={!voiceChannels.length} onClick={() => setType('voice')}>
            <span className="event-where-icon"><IconSpeaker size={22} /></span>
            <span className="event-where-text"><strong>Voice Channel</strong><small>{voiceChannels.length ? 'Hang out with voice, video and screen share.' : 'This server has no voice channels you can see.'}</small></span>
          </button>
          <button type="button" role="radio" aria-checked={type === 'external'} className={'event-where' + (type === 'external' ? ' selected' : '')} onClick={() => setType('external')}>
            <span className="event-where-icon"><IconPin size={22} /></span>
            <span className="event-where-text"><strong>Somewhere Else</strong><small>Another site, a stream, or a place in the real world.</small></span>
          </button>
          {type === 'voice' ? (
            <Field label="Channel">
              <select value={channelId} onChange={(e) => setChannelId(e.target.value)}>
                {voiceChannels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Location">
              <input autoFocus value={location} maxLength={EVENT_LIMITS.LOCATION} placeholder="A park, a stream link, a café…" onChange={(e) => setLocation(e.target.value)} />
            </Field>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="event-info">
          <Field label="Event Topic">
            <input autoFocus value={name} maxLength={EVENT_LIMITS.NAME} placeholder="What's your event?" onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="event-time-grid">
            <div className="field">
              <span className="field-label">Start</span>
              <TimePick label="Start" date={startDate} time={startTime} onDate={setStartDate} onTime={setStartTime} options={times} />
            </div>
            <div className="field">
              <label className="event-end-toggle">
                <input type="checkbox" aria-label="Add an end time" checked={hasEnd} onChange={(e) => toggleEnd(e.target.checked)} />
                <span className="field-label">End</span>
              </label>
              {hasEnd ? <TimePick label="End" date={endDate} time={endTime} onDate={setEndDate} onTime={setEndTime} options={times} />
                : <span className="field-hint">Without an end time it wraps up a day after it starts.</span>}
            </div>
          </div>
          <Field label="Description" hint={`${description.length}/${EVENT_LIMITS.DESCRIPTION}`}>
            <textarea rows={4} value={description} maxLength={EVENT_LIMITS.DESCRIPTION} placeholder="Who's it for, what to bring, what you'll do…" onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <div className="field">
            <span className="field-label">Cover Image</span>
            {shownCover ? (
              <div className="event-cover-edit">
                <img src={shownCover} alt="Cover preview" />
                <div className="event-cover-edit-actions">
                  <button type="button" className="btn btn-secondary btn-small" onClick={() => fileRef.current?.click()}>Change</button>
                  <button type="button" className="btn btn-ghost btn-small danger-text" onClick={() => setCover(null)}><IconTrash size={14} /> Remove</button>
                </div>
              </div>
            ) : (
              <button type="button" className="event-cover-drop" onClick={() => fileRef.current?.click()}>
                <IconImage size={22} /><span>Add a cover image</span><small>PNG, JPEG, GIF or WebP, up to {formatBytes(EVENT_LIMITS.COVER_BYTES)}</small>
              </button>
            )}
            <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={(e) => { pickCover(e.target.files?.[0]); e.target.value = ''; }} />
          </div>
        </div>
      )}

      {step === 2 && <EventCard draft={draft} />}
      {error && <div className="form-error">{error}</div>}
    </Modal>
  );
}
