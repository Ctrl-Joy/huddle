// Server banner at the top of the channel list: the header floats over the image, which fades as the list
// scrolls; once it's gone the header turns solid. No banner → the plain header (nothing here applies).
import { useLayoutEffect, useRef, type UIEvent } from 'react';
import { useGuildStore } from '../../stores/guilds';

const FADE_PX = 96; // scroll distance over which the image fades out
const SOLID_PX = 84; // header becomes opaque past this

function paint(sidebar: HTMLElement, scrollTop: number) {
  sidebar.style.setProperty('--banner-fade', String(Math.min(1, scrollTop / FADE_PX)));
  sidebar.classList.toggle('banner-scrolled', scrollTop > SOLID_PX);
}

export function useGuildBanner(guildId: string) {
  const banner = useGuildStore((s) => s.guilds[guildId]?.banner ?? null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // re-sync when switching servers (the list element is reused and may already be scrolled)
  useLayoutEffect(() => {
    if (banner && sidebarRef.current) paint(sidebarRef.current, listRef.current?.scrollTop ?? 0);
  }, [guildId, banner]);

  return {
    banner,
    sidebarRef,
    listRef,
    sidebarClass: banner ? ' has-banner' : '',
    onListScroll: banner ? (e: UIEvent<HTMLDivElement>) => { if (sidebarRef.current) paint(sidebarRef.current, e.currentTarget.scrollTop); } : undefined,
    bannerEl: banner ? <div className="guild-banner" style={{ backgroundImage: `url(${banner})` }} aria-hidden="true" /> : null,
  };
}
