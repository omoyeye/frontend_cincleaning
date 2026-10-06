import React from 'react';
import { Mail, Phone, Facebook, Instagram } from 'lucide-react';
import { useBusinessSettings } from '../src/context/BusinessSettingsContext';

const contactLinkClass =
  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-muted-foreground hover:text-primary transition-colors';

const socialIconWrap =
  'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary';

function TikTokGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64V9.39a6.34 6.34 0 0 0-1-.09A6.32 6.32 0 0 0 5 20.94a6.32 6.32 0 0 0 10.86-4.43V9.07a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.5z" />
    </svg>
  );
}

function normalizeSocialUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

/**
 * Slim strip under the main marketing nav: Facebook · TikTok · Instagram (from brand), then email · phone.
 */
const MarketingContactBar: React.FC = () => {
  const { email, phone, socialLinks } = useBusinessSettings();
  const fb = socialLinks?.facebook?.trim();
  const tt = socialLinks?.tiktok?.trim();
  const ig = socialLinks?.instagram?.trim();

  const contactParts: React.ReactNode[] = [];
  if (email && email.includes('@')) {
    contactParts.push(
      <a key="email" href={`mailto:${email}`} className={contactLinkClass}>
        <Mail className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
        <span className="font-semibold">{email}</span>
      </a>
    );
  }
  if (phone) {
    contactParts.push(
      <a key="phone" href={`tel:${phone.replace(/\s/g, '')}`} className={contactLinkClass}>
        <Phone className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
        <span className="font-semibold">{phone}</span>
      </a>
    );
  }

  const socialIcons: React.ReactNode[] = [];
  if (fb) {
    const href = normalizeSocialUrl(fb);
    socialIcons.push(
      <a
        key="fb"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${socialIconWrap} hover:text-[#1877F2]`}
        aria-label="Facebook"
      >
        <Facebook className="h-4 w-4" strokeWidth={1.75} />
      </a>
    );
  }
  if (tt) {
    const href = normalizeSocialUrl(tt);
    socialIcons.push(
      <a
        key="tt"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${socialIconWrap} hover:text-slate-900 dark:hover:text-white`}
        aria-label="TikTok"
      >
        <TikTokGlyph className="h-4 w-4" />
      </a>
    );
  }
  if (ig) {
    const href = normalizeSocialUrl(ig);
    socialIcons.push(
      <a
        key="ig"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${socialIconWrap} hover:text-pink-600`}
        aria-label="Instagram"
      >
        <Instagram className="h-4 w-4" strokeWidth={1.75} />
      </a>
    );
  }

  if (!contactParts.length && !socialIcons.length) return null;

  const contactWithSep = contactParts.reduce<React.ReactNode[]>((acc, el, i) => {
    if (i > 0) {
      acc.push(
        <span key={`csep-${i}`} className="shrink-0 text-border/90 select-none px-1" aria-hidden>
          ·
        </span>
      );
    }
    acc.push(el);
    return acc;
  }, []);

  return (
    <div
      className="block relative border-b border-border/45 bg-gradient-to-r from-primary/[0.03] via-card/30 to-primary/[0.03] backdrop-blur-sm"
      role="navigation"
      aria-label="Company contact"
    >
      <div className="overflow-x-auto no-scrollbar">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 flex min-w-max flex-nowrap items-center gap-x-2 py-0.5 sm:gap-x-3 text-[11px] leading-tight sm:text-xs">
          {socialIcons.length > 0 && (
            <div className="flex flex-nowrap items-center gap-1 sm:gap-0.5">{socialIcons}</div>
          )}
          {socialIcons.length > 0 && contactWithSep.length > 0 ? (
            <span className="shrink-0 text-border/90 select-none px-1 sm:px-2" aria-hidden>
              ·
            </span>
          ) : null}
          {contactWithSep.length > 0 && <div className="flex flex-nowrap items-center">{contactWithSep}</div>}
        </div>
      </div>
    </div>
  );
};

export default MarketingContactBar;
