import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { installVoiceEngine } from './voice';
import './styles/base.css';
import './styles/layout.css';
import './styles/chat.css';
import './styles/components.css';
import './styles/modals.css';
import './styles/voice.css';

// WebRTC media engine (voice / video / screen share) — hooks into stores/voice.ts
installVoiceEngine();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
