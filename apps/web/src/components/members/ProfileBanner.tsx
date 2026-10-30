// Shared profile-card bits: the banner (uploaded image, chosen colour or an id-derived default) and the
// accent colour that themes the card. Used by UserPopout, DMProfilePanel and the settings preview.
import type { CSSProperties, ReactNode } from 'react';
import type { PublicUser } from '@huddle/shared';
import { colorFor } from '../../lib/format';
import { LogoMark } from '../common/icons';

type ProfileLike = Pick<PublicUser, 'id' | 'banner_color'> & Partial<Pick<PublicUser, 'banner' | 'accent_color'>>;

export function ProfileBanner({ user, children }: { user: ProfileLike; children?: ReactNode }) {
  const color = user.banner_color || colorFor(user.id);
  const style: CSSProperties = user.banner
    ? { backgroundColor: color, backgroundImage: `url(${user.banner})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: color };
  return (
    <div className={'popout-banner' + (user.banner ? ' has-image' : '')} style={style}>
      {!user.banner && <span className="popout-banner-mark"><LogoMark size={46} /></span>}
      {children}
    </div>
  );
}

/** Class + CSS variable that tint a profile card with the user's accent colour. */
export function accentProps(user: ProfileLike | undefined): { className: string; style?: CSSProperties } {
  return user?.accent_color
    ? { className: ' themed', style: { '--profile-accent': user.accent_color } as CSSProperties }
    : { className: '' };
}

export function Pronouns({ value }: { value: string | null | undefined }) {
  return value ? <div className="popout-pronouns">{value}</div> : null;
}
