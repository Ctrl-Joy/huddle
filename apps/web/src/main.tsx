import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installVoiceEngine } from './voice';
import { installLongPress } from './lib/longPress';
import { installPrefs } from './stores/prefs';
import { installLang } from './i18n';
import './styles/base.css';
import './styles/layout.css';
import './styles/chat.css';
import './styles/components.css';
import './styles/modals.css';
import './styles/voice.css';
import './styles/discover.css';
import './styles/messageFeatures.css';
import './styles/threads.css';
import './styles/events.css';
import './styles/navigation.css';
import './styles/stickers.css';
import './styles/phone.css';

// WebRTC media engine (voice / video / screen share) — hooks into stores/voice.ts
installVoiceEngine();
// long-press = right-click on touch screens
installLongPress();
// chat font size, reduce motion, compact messages, … from localStorage
installPrefs();
// website + sign-in language (stored choice, else the browser's)
installLang();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
