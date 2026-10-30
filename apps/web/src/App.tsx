import { useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { setNavigator } from './lib/nav';
import { useAuthStore } from './stores/auth';
import { startSession } from './lib/session';
import { AuthPage } from './pages/AuthPage';
import { InvitePage } from './pages/InvitePage';
import { Splash } from './pages/Splash';
import { AppShell } from './components/layout/AppShell';

function NavBridge() {
  const nav = useNavigate();
  useEffect(() => { setNavigator((to) => nav(to)); }, [nav]);
  return null;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const status = useAuthStore((s) => s.status);
  const loc = useLocation();
  useEffect(() => { if (token) startSession(); }, [token]);
  if (!token) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (status !== 'ready') return <Splash />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <NavBridge />
      <Routes>
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/register" element={<AuthPage mode="register" />} />
        <Route path="/invite/:code" element={<InvitePage />} />
        <Route path="/channels/:guildId/:channelId?" element={<RequireAuth><AppShell /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/channels/@me" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
