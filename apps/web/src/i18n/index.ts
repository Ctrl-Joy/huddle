// Tiny i18n for the public website and sign-in screens: a zustand store with the chosen language, English
// built in, other languages loaded on demand. Missing keys fall back to English.
import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { en, type Dict, type Key } from './en';

export type { Key, Dict } from './en';

export const LANGS = [
  { code: 'en', name: 'English', html: 'en' },
  { code: 'hi', name: 'हिन्दी', html: 'hi' },
  { code: 'bn', name: 'বাংলা', html: 'bn' },
  { code: 'es', name: 'Español', html: 'es' },
  { code: 'fr', name: 'Français', html: 'fr' },
  { code: 'de', name: 'Deutsch', html: 'de' },
  { code: 'pt-BR', name: 'Português (Brasil)', html: 'pt-BR' },
  { code: 'ja', name: '日本語', html: 'ja' },
] as const;

export type Lang = (typeof LANGS)[number]['code'];
export type Vars = Record<string, string | number>;

const STORAGE_KEY = 'huddle.lang';

const LOADERS: Record<Exclude<Lang, 'en'>, () => Promise<{ default: Partial<Dict> }>> = {
  hi: () => import('./hi'),
  bn: () => import('./bn'),
  es: () => import('./es'),
  fr: () => import('./fr'),
  de: () => import('./de'),
  'pt-BR': () => import('./pt-BR'),
  ja: () => import('./ja'),
};

const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v);

function readStored(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

/** Browser languages → the first one we support ('pt' and 'pt-PT' map to Brazilian Portuguese). */
function fromBrowser(): Lang {
  const prefs = typeof navigator !== 'undefined' ? (navigator.languages?.length ? navigator.languages : [navigator.language]) : [];
  for (const raw of prefs) {
    if (!raw) continue;
    const base = raw.toLowerCase().split('-')[0];
    if (base === 'pt') return 'pt-BR';
    const hit = LANGS.find((l) => l.code === base);
    if (hit) return hit.code;
  }
  return 'en';
}

interface LangState {
  lang: Lang;
  /** Strings for `lang` (empty for English or while loading: English shows meanwhile). */
  dict: Partial<Dict>;
  setLang: (lang: Lang) => void;
}

const loaded = new Map<Lang, Partial<Dict>>([['en', {}]]);

export const useLang = create<LangState>((set, get) => ({
  lang: 'en',
  dict: {},
  setLang: (lang) => {
    if (!isLang(lang)) return;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* storage unavailable */ }
    applyHtmlLang(lang);
    const ready = loaded.get(lang);
    if (ready) { set({ lang, dict: ready }); return; }
    set({ lang });
    void LOADERS[lang as Exclude<Lang, 'en'>]().then((m) => {
      loaded.set(lang, m.default);
      if (get().lang === lang) set({ dict: m.default });
    }).catch(() => { /* offline: keep English */ });
  },
}));

function applyHtmlLang(lang: Lang) {
  if (typeof document !== 'undefined') document.documentElement.lang = LANGS.find((l) => l.code === lang)?.html ?? 'en';
}

/** Picks the stored language, else the browser's, else English. Call once at startup. */
export function installLang(): void {
  useLang.getState().setLang(readStored() ?? fromBrowser());
}

const warned = new Set<string>();

function format(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

export function translate(dict: Partial<Dict>, lang: Lang, key: Key, vars?: Vars): string {
  let s = dict[key];
  if (s === undefined) {
    if (lang !== 'en' && import.meta.env.DEV && loaded.has(lang) && !warned.has(`${lang}:${key}`)) {
      warned.add(`${lang}:${key}`);
      console.warn(`[i18n] missing "${key}" in ${lang}; using English`);
    }
    s = en[key];
  }
  return format(s, vars);
}

export type T = (key: Key, vars?: Vars) => string;

/** t() for the current language; re-renders when it changes. */
export function useT(): T {
  const lang = useLang((s) => s.lang);
  const dict = useLang((s) => s.dict);
  return useCallback((key: Key, vars?: Vars) => translate(dict, lang, key, vars), [dict, lang]);
}

/** Outside React (rare). */
export const tNow: T = (key, vars) => {
  const { dict, lang } = useLang.getState();
  return translate(dict, lang, key, vars);
};

/** Sets document.title from a key while mounted (and on language change). */
export function useDocTitle(key: Key, suffix = true): void {
  const t = useT();
  const title = t(key);
  useEffect(() => {
    const prev = document.title;
    document.title = suffix && !title.includes('Huddle') ? `${title} — Huddle` : title;
    return () => { document.title = prev; };
  }, [title, suffix]);
}

/** BCP 47 tag for Intl formatting. */
export const useLocale = (): string => useLang((s) => LANGS.find((l) => l.code === s.lang)?.html ?? 'en');
