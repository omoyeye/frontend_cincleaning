import React from 'react';
import { Mail, Phone, Facebook, Instagram } from 'lucide-react';
import type { WebsiteContent } from '../types';
import { type CustomerPageKey, customerPageFromPath } from '../src/seo/routePaths';
import { useBusinessSettings } from '../src/context/BusinessSettingsContext';
import BrandLogoMark from './BrandLogoMark';

interface MarketingFooterProps {
  content: WebsiteContent;
  onNavigate: (page: CustomerPageKey, opts?: { blogSlug?: string | null }) => void;
  onBookNow: () => void;
}

function normalizeSocialUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

function TikTokFooterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64V9.39a6.34 6.34 0 0 0-1-.09A6.32 6.32 0 0 0 5 20.94a6.32 6.32 0 0 0 10.86-4.43V9.07a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.5z" />
    </svg>
  );
}

const MarketingFooter: React.FC<MarketingFooterProps> = ({ content, onNavigate, onBookNow }) => {
  const brand = useBusinessSettings();
  const brandPhone = (brand.phone ?? '').trim();
  const brandEmail = (brand.email ?? '').trim();
  const brandAddress = (brand.address ?? '').trim();
  const brandCompanyName = (brand.companyName ?? '').trim() || 'CiN Cleaning';
  const fbUrl = (brand.socialLinks?.facebook ?? '').trim();
  const ttUrl = (brand.socialLinks?.tiktok ?? '').trim();
  const igUrl = (brand.socialLinks?.instagram ?? '').trim();
  const year = new Date().getFullYear();

  const goHref = (href: string) => {
    if (!href || href === '#') return;
    const normalized = href.replace(/\/$/, '') || '/';
    const key = customerPageFromPath(normalized);
    if (key) onNavigate(key);
    else window.location.href = href;
  };

  const footerLinkClass = 'text-left hover:text-white hover:underline underline-offset-2 transition-colors';

  return (
    <footer className="relative w-full mt-16 sm:mt-20 bg-slate-950 text-slate-100 pt-12 pb-[calc(3rem+env(safe-area-inset-bottom,0px))] px-4 sm:px-6 md:px-10 lg:px-16 border-t border-slate-800/80">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10 lg:gap-12">
          <div className="sm:col-span-2 lg:col-span-1 lg:max-w-sm space-y-4">
            <div>
              <BrandLogoMark className="h-14 w-auto max-w-[200px] object-contain object-left brightness-0 invert opacity-95" />
            </div>
            <p className="text-xl font-black tracking-tight text-white">{brandCompanyName}</p>
            <p className="text-sm text-slate-400 leading-relaxed">{content.footerBlurb}</p>
            {(brandEmail || brandPhone) && (
              <ul className="space-y-2 text-sm text-slate-300">
                {brandEmail && brandEmail.includes('@') ? (
                  <li>
                    <a
                      href={`mailto:${brandEmail}`}
                      className="inline-flex items-center gap-2 hover:text-white transition-colors"
                    >
                      <Mail className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                      <span>{brandEmail}</span>
                    </a>
                  </li>
                ) : null}
                {brandPhone ? (
                  <li>
                    <a
                      href={`tel:${brandPhone.replace(/\s/g, '')}`}
                      className="inline-flex items-center gap-2 hover:text-white transition-colors"
                    >
                      <Phone className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                      <span>{brandPhone}</span>
                    </a>
                  </li>
                ) : null}
              </ul>
            )}
            {brandAddress ? <p className="text-sm text-slate-500 leading-relaxed whitespace-pre-line">{brandAddress}</p> : null}
            {(fbUrl || ttUrl || igUrl) && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {fbUrl ? (
                  <a
                    href={normalizeSocialUrl(fbUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-[#1877F2] transition-colors"
                    aria-label="Facebook"
                  >
                    <Facebook className="h-5 w-5" strokeWidth={1.75} />
                  </a>
                ) : null}
                {ttUrl ? (
                  <a
                    href={normalizeSocialUrl(ttUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-white transition-colors"
                    aria-label="TikTok"
                  >
                    <TikTokFooterIcon className="h-5 w-5" />
                  </a>
                ) : null}
                {igUrl ? (
                  <a
                    href={normalizeSocialUrl(igUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-slate-400 hover:text-pink-400 transition-colors"
                    aria-label="Instagram"
                  >
                    <Instagram className="h-5 w-5" strokeWidth={1.75} />
                  </a>
                ) : null}
              </div>
            )}
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest font-black text-slate-500">Services</p>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('home')}>
                  Home
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('residential')}>
                  Residential
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('standardCleaning')}>
                  General / standard cleaning
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('deepCleaning')}>
                  Deep cleaning
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('endOfTenancy')}>
                  End of tenancy cleaning
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('commercial')}>
                  Commercial
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('airbnbShortLet')}>
                  Airbnb / short-let cleaning
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('book')}>
                  Deep cleaning &amp; bookings
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('pricing')}>
                  Pricing
                </button>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest font-black text-slate-500">Company &amp; resources</p>
            <ul className="mt-4 space-y-2.5 text-sm text-slate-300">
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('about')}>
                  About us
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('gallery')}>
                  Gallery
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('blog')}>
                  Blog
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('faq')}>
                  FAQ
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('terms')}>
                  Terms &amp; conditions
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('terms')}>
                  Privacy policy
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('terms')}>
                  Cookie policy
                </button>
              </li>
              <li>
                <button type="button" className={footerLinkClass} onClick={() => onNavigate('contact')}>
                  Contact
                </button>
              </li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest font-black text-slate-500">Get started</p>
            <p className="text-sm text-slate-400 mt-4 leading-relaxed">Need a fast quote or an urgent slot? Book online in minutes.</p>
            <button
              type="button"
              onClick={onBookNow}
              className="mt-5 inline-flex px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm transition-colors"
            >
              Book now
            </button>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-4 text-xs text-slate-500">
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {content.footerLinks.map((l) => (
              <button
                key={l.id}
                type="button"
                className="whitespace-nowrap hover:text-slate-300"
                onClick={() => goHref(l.href)}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div className="text-slate-600 space-y-1">
            <p>
              © {year} {brandCompanyName}. A trading name of{' '}
              <a
                href="https://surpluslink.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-300 underline underline-offset-2"
              >
                Surpluslink &amp; Co LTD
              </a>
              , a registered company in England &amp; Wales.
            </p>
            <p className="text-slate-700">
              Design &amp; development by{' '}
              <a
                href="https://surpluslink.co.uk"
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-500 hover:text-slate-300 underline underline-offset-2"
              >
                Surpluslink &amp; Co
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default MarketingFooter;
