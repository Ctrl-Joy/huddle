import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { setNavigator } from './lib/nav';
import { useAuthStore } from './stores/auth';
import { startSession } from './lib/session';
import { AuthPage } from './pages/AuthPage';
import { InvitePage } from './pages/InvitePage';
import { Splash } from './pages/Splash';
import { VerifyEmailPage } from './pages/VerifyEmailPage';
import { AppShell } from './components/layout/AppShell';

// Public home page — lazy so it stays out of the app bundle.
const HeroHome = lazy(() => import('./landing/HeroHome'));
const NotFound = lazy(() => import('./landing/NotFound'));
// Footer pages (status, about, policies, …): one shared lazy chunk.
const info = () => import('./landing/InfoPages');
const INFO_PAGES = {
  status: lazy(() => info().then((m) => ({ default: m.StatusPage }))),
  about: lazy(() => info().then((m) => ({ default: m.AboutPage }))),
  brand: lazy(() => info().then((m) => ({ default: m.BrandPage }))),
  careers: lazy(() => info().then((m) => ({ default: m.CareersPage }))),
  guidelines: lazy(() => info().then((m) => ({ default: m.GuidelinesPage }))),
  developers: lazy(() => info().then((m) => ({ default: m.DevelopersPage }))),
  feedback: lazy(() => info().then((m) => ({ default: m.FeedbackPage }))),
  terms: lazy(() => info().then((m) => ({ default: m.TermsPage }))),
  privacy: lazy(() => info().then((m) => ({ default: m.PrivacyPage }))),
  cookies: lazy(() => info().then((m) => ({ default: m.CookiesPage }))),
  licenses: lazy(() => info().then((m) => ({ default: m.LicensesPage }))),
};

function Lazy({ children }: { children: ReactNode }) {
  return <Suspense fallback={<div style={{ height: '100%', background: '#000' }} />}>{children}</Suspense>;
}

function NavBridge() {
  const nav = useNavigate();
  useEffect(() => { setNavigator((to) => nav(to)); }, [nav]);
  return null;
}

function RequireAuth({ children }: { children: ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const status = useAuthStore((s) => s.status);
  // An unverified account stays on the "check your email" screen; the gateway isn't started until it's verified.
  const unverified = useAuthStore((s) => s.user?.verified === false);
  const loc = useLocation();
  useEffect(() => { if (token && !unverified) startSession(); }, [token, unverified]);
  if (!token) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (unverified) return <VerifyEmailPage />;
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
        <Route path="/forgot-password" element={<AuthPage mode="forgot" />} />
        <Route path="/invite/:code" element={<InvitePage />} />
        <Route path="/channels/:guildId/:channelId?" element={<RequireAuth><AppShell /></RequireAuth>} />
        <Route path="/channels" element={<Navigate to="/channels/@me" replace />} />
        <Route path="/" element={<Lazy><HeroHome /></Lazy>} />
        {/* old marketing pages now live as sections of the home page */}
        {['features', 'safety', 'support', 'blog'].map((id) => (
          <Route key={id} path={`/${id}`} element={<Navigate to={`/#${id}`} replace />} />
        ))}
        {Object.entries(INFO_PAGES).map(([path, Page]) => (
          <Route key={path} path={`/${path}`} element={<Lazy><Page /></Lazy>} />
        ))}
        <Route path="/download" element={<Navigate to="/" replace />} />
        <Route path="/blog/:slug" element={<Navigate to="/#blog" replace />} />
        <Route path="*" element={<Lazy><NotFound /></Lazy>} />
      </Routes>
    </BrowserRouter>
  );
}
