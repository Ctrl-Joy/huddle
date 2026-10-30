import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { setNavigator } from './lib/nav';
import { useAuthStore } from './stores/auth';
import { startSession } from './lib/session';
import { AuthPage } from './pages/AuthPage';
import { InvitePage } from './pages/InvitePage';
import { Splash } from './pages/Splash';
import { AppShell } from './components/layout/AppShell';

// Public marketing site — lazy so it stays out of the app bundle.
const LandingLayout = lazy(() => import('./landing/LandingLayout'));
const HomePage = lazy(() => import('./landing/HomePage'));
const DownloadPage = lazy(() => import('./landing/DownloadPage'));
const SafetyPage = lazy(() => import('./landing/SafetyPage'));
const SupportPage = lazy(() => import('./landing/SupportPage'));
const BlogIndexPage = lazy(() => import('./landing/BlogPages').then((m) => ({ default: m.BlogIndexPage })));
const BlogPostPage = lazy(() => import('./landing/BlogPages').then((m) => ({ default: m.BlogPostPage })));
const NotFoundPage = lazy(() => import('./landing/NotFoundPage'));

function Landing() {
  return <Suspense fallback={<div style={{ height: '100%', background: '#070b14' }} />}><LandingLayout /></Suspense>;
}

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
        <Route path="/channels" element={<Navigate to="/channels/@me" replace />} />
        <Route element={<Landing />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/download" element={<DownloadPage />} />
          <Route path="/safety" element={<SafetyPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/blog" element={<BlogIndexPage />} />
          <Route path="/blog/:slug" element={<BlogPostPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
