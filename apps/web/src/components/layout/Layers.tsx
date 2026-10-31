import { useEffect, type ComponentType } from 'react';
import { useUIStore, type ModalType } from '../../stores/ui';
import { ContextMenu } from '../menus/ContextMenu';
import { UserPopout } from '../members/UserPopout';
import { ConfirmModal } from '../modals/Modal';
import { CreateServerModal } from '../modals/CreateServerModal';
import { CreateChannelModal, CreateCategoryModal } from '../modals/CreateChannelModal';
import { InviteModal } from '../modals/InviteModal';
import { NotificationSettingsModal } from '../modals/NotificationSettingsModal';
import { CreateGroupDMModal } from '../modals/CreateGroupDMModal';
import { QuickSwitcher } from '../modals/QuickSwitcher';
import { NicknameModal, TimeoutModal, BanModal, CustomStatusModal } from '../modals/MemberModals';
import { Lightbox } from '../modals/Lightbox';
import { CreatePollModal } from '../modals/CreatePollModal';
import { ForwardModal } from '../modals/ForwardModal';
import { CreateEventModal } from '../events/CreateEventModal';
import { EventsModal } from '../events/Events';
import { UserSettings } from '../settings/UserSettings';
import { ServerSettings } from '../settings/ServerSettings';
import { ChannelSettings } from '../settings/ChannelSettings';

export interface ModalProps { close: () => void; [k: string]: any }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Record<ModalType, ComponentType<any>> = {
  createServer: CreateServerModal,
  joinServer: (p: ModalProps) => <CreateServerModal close={p.close} initialStep="join" />,
  createChannel: CreateChannelModal,
  createCategory: CreateCategoryModal,
  invite: InviteModal,
  userSettings: UserSettings,
  serverSettings: ServerSettings,
  channelSettings: ChannelSettings,
  notificationSettings: NotificationSettingsModal,
  confirm: ConfirmModal,
  createGroupDM: CreateGroupDMModal,
  quickSwitcher: QuickSwitcher,
  nickname: NicknameModal,
  timeout: TimeoutModal,
  ban: BanModal,
  lightbox: Lightbox,
  customStatus: CustomStatusModal,
  createPoll: CreatePollModal,
  forwardMessage: ForwardModal,
  createEvent: CreateEventModal,
  events: EventsModal,
};

export function Layers() {
  const modals = useUIStore((s) => s.modals);
  const toasts = useUIStore((s) => s.toasts);

  // Esc closes the top-most modal (context menus/popouts handle their own Esc first)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const ui = useUIStore.getState();
      if (ui.contextMenu) { ui.closeContextMenu(); return; }
      if (ui.popout) { ui.closePopout(); return; }
      const top = ui.modals[ui.modals.length - 1];
      if (top) { e.preventDefault(); ui.closeModal(top.key); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <>
      {modals.map((m) => {
        const C = REGISTRY[m.type];
        return <C key={m.key} {...m.props} close={() => useUIStore.getState().closeModal(m.key)} />;
      })}
      <UserPopout />
      <ContextMenu />
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={'toast toast-' + (t.kind || 'info')}>{t.text}</div>)}
      </div>
    </>
  );
}
