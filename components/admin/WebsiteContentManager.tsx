import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  CloudOff,
  ExternalLink,
  Eye,
  EyeOff,
  LayoutTemplate,
  Link2,
  Loader2,
  PanelBottom,
  Plus,
  Trash2,
  Image as ImageIcon,
} from 'lucide-react';
import type { CmsAdvertCard, CmsHeroSlide, WebsiteContent } from '../../types';
import { apiAdmin } from '../../services/api';
import { subscribeNnSync } from '../../services/realtime';
import { getWebsiteContent, normalizeWebsiteContent, saveWebsiteContent } from '../../src/cms/content';
import CmsImageInput from './CmsImageInput';
import { useFlyer } from '../Flyer';
import { BTN_PRIMARY, BTN_SECONDARY, Card, EmptyState, Field, INPUT, Segmented, Switch } from './marketing/MarketingUi';

const SERVER_SAVE_DEBOUNCE_MS = 750;

type Tab = 'heroes' | 'cards' | 'footer';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const PAGE_LABEL: Record<CmsHeroSlide['page'], string> = {
  home: 'Home',
  residential: 'Residential',
  commercial: 'Commercial',
  about: 'About us',
  pricing: 'Pricing',
  contact: 'Contact',
};

function move<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const j = index + dir;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

function SaveIndicator({ state }: { state: SaveState }) {
  if (state === 'saving')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
      </span>
    );
  if (state === 'error')
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-red-600">
        <CloudOff className="h-3.5 w-3.5" /> Not saved, check your connection
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
      <Check className="h-3.5 w-3.5" /> {state === 'saved' ? 'All changes saved' : 'Changes save automatically'}
    </span>
  );
}

function HeroPreview({ hero }: { hero: CmsHeroSlide }) {
  const title = hero.title?.trim() || 'Your headline';
  const hi = hero.highlight?.trim();
  const titleNode =
    hi && title.includes(hi) ? (
      <>
        {title.slice(0, title.indexOf(hi))}
        <span className="text-teal-300">{hi}</span>
        {title.slice(title.indexOf(hi) + hi.length)}
      </>
    ) : (
      title
    );
  return (
    <div className="relative overflow-hidden rounded-2xl bg-slate-900">
      {hero.imageUrl ? <img src={hero.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" /> : null}
      <div className="relative p-4 sm:p-6">
        <div className="max-w-md space-y-2.5 rounded-xl border border-white/15 bg-slate-950/55 p-4 text-white backdrop-blur-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-teal-300">{hero.eyebrow?.trim() || 'CiN Cleaning'}</p>
          <p className="text-xl font-black leading-tight sm:text-2xl">{titleNode}</p>
          <p className="line-clamp-3 text-xs leading-relaxed text-white/85">{hero.subtitle?.trim() || 'A short line that explains the page.'}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <span className="rounded-md bg-teal-600 px-3 py-1.5 text-[11px] font-bold">{hero.ctaPrimary?.trim() || 'Main button'}</span>
            <span className="rounded-md bg-white/10 px-3 py-1.5 text-[11px] font-bold ring-1 ring-white/25">{hero.ctaSecondary?.trim() || 'Second button'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const WebsiteContentManager: React.FC = () => {
  const { showFlyer } = useFlyer();
  const [content, setContent] = useState<WebsiteContent>(() => getWebsiteContent());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('heroes');
  const [page, setPage] = useState<CmsHeroSlide['page']>('home');
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<WebsiteContent | null>(null);

  useEffect(() => {
    let live = true;
    apiAdmin
      .getBusinessSettings()
      .then((s: Record<string, unknown>) => {
        if (!live) return;
        const wc = s?.websiteContent;
        if (wc != null) {
          const n = normalizeWebsiteContent(wc);
          setContent(n);
          saveWebsiteContent(n);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    return subscribeNnSync((scope) => {
      if (scope !== 'all' || pendingRef.current) return;
      void apiAdmin.getBusinessSettings().then((s: Record<string, unknown>) => {
        const wc = s?.websiteContent;
        if (wc != null && !pendingRef.current) {
          const n = normalizeWebsiteContent(wc);
          setContent(n);
          saveWebsiteContent(n);
        }
      });
    });
  }, []);

  const flushServerSave = useCallback(async () => {
    const next = pendingRef.current;
    pendingRef.current = null;
    if (!next) return;
    try {
      await apiAdmin.updateBusinessSettings({ websiteContent: next });
      window.dispatchEvent(new CustomEvent('nn_business_settings_updated', { detail: { websiteContent: next } }));
      setSaveState(pendingRef.current ? 'saving' : 'saved');
    } catch (e) {
      setSaveState('error');
      showFlyer(e instanceof Error ? e.message : 'Failed to save website content', 'error');
    }
  }, [showFlyer]);

  const scheduleServerSave = useCallback(
    (next: WebsiteContent) => {
      pendingRef.current = next;
      setSaveState('saving');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null;
        void flushServerSave();
      }, SERVER_SAVE_DEBOUNCE_MS);
    },
    [flushServerSave]
  );

  const update = (next: WebsiteContent) => {
    setContent(next);
    saveWebsiteContent(next);
    scheduleServerSave(next);
  };

  const patchHero = (id: string, patch: Partial<CmsHeroSlide>) =>
    update({ ...content, heroes: content.heroes.map((x) => (x.id === id ? { ...x, ...patch } : x)) });
  const patchAd = (id: string, patch: Partial<CmsAdvertCard>) =>
    update({ ...content, adverts: content.adverts.map((x) => (x.id === id ? { ...x, ...patch } : x)) });

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-10 w-72 animate-pulse rounded-xl bg-slate-100" />
        <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />
      </div>
    );
  }

  const hero = content.heroes.find((h) => h.page === page) ?? content.heroes[0];
  const visibleCards = content.adverts.filter((a) => a.active !== false).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          ariaLabel="Website content sections"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'heroes', label: 'Page headers' },
            { id: 'cards', label: 'Homepage cards', count: content.adverts.length },
            { id: 'footer', label: 'Footer' },
          ]}
        />
        <div className="flex items-center gap-4">
          <SaveIndicator state={saveState} />
          <a href="/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800">
            View website <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>

      {/* Page headers */}
      {tab === 'heroes' && hero && (
        <div className="space-y-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {content.heroes.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setPage(h.page)}
                className={`flex shrink-0 items-center gap-2 rounded-xl border px-2 py-1.5 pr-3 text-sm font-bold transition ${
                  h.page === page ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                <span className="h-7 w-10 overflow-hidden rounded-md bg-slate-200">
                  {h.imageUrl ? <img src={h.imageUrl} alt="" className="h-full w-full object-cover" /> : null}
                </span>
                {PAGE_LABEL[h.page] ?? h.page}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
            <Card className="space-y-4 p-4 sm:p-6">
              <div>
                <p className="font-black text-slate-900">{PAGE_LABEL[hero.page]} page header</p>
                <p className="text-sm text-slate-500">The big banner at the top of the page. Changes appear on the website straight away.</p>
              </div>
              <Field label="Small label above the headline">
                <input className={INPUT} value={hero.eyebrow || ''} onChange={(e) => patchHero(hero.id, { eyebrow: e.target.value })} placeholder="CiN Cleaning" />
              </Field>
              <Field label="Headline" counter={{ value: (hero.title || '').length, max: 70 }}>
                <input className={`${INPUT} font-bold`} value={hero.title} onChange={(e) => patchHero(hero.id, { title: e.target.value })} />
              </Field>
              <Field label="Coloured words (optional)" hint="Type words exactly as they appear in the headline to show them in colour.">
                <input className={INPUT} value={hero.highlight || ''} onChange={(e) => patchHero(hero.id, { highlight: e.target.value })} />
              </Field>
              <Field label="Supporting text" counter={{ value: (hero.subtitle || '').length, max: 220 }}>
                <textarea className={`${INPUT} min-h-[88px]`} value={hero.subtitle} onChange={(e) => patchHero(hero.id, { subtitle: e.target.value })} />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Main button text">
                  <input className={INPUT} value={hero.ctaPrimary || ''} onChange={(e) => patchHero(hero.id, { ctaPrimary: e.target.value })} placeholder="Book a clean" />
                </Field>
                <Field label="Second button text">
                  <input className={INPUT} value={hero.ctaSecondary || ''} onChange={(e) => patchHero(hero.id, { ctaSecondary: e.target.value })} />
                </Field>
              </div>
              <Field label="Background photo">
                <CmsImageInput inputId={`hero-${hero.id}`} value={hero.imageUrl} onChange={(imageUrl) => patchHero(hero.id, { imageUrl })} />
              </Field>
            </Card>

            <div className="xl:sticky xl:top-4 xl:self-start">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
                <Eye className="h-3.5 w-3.5" /> Preview
              </p>
              <HeroPreview hero={hero} />
              <p className="mt-2 text-[11px] text-slate-400">Layout is simplified. Some pages place the photo beside the text.</p>
            </div>
          </div>
        </div>
      )}

      {/* Homepage cards */}
      {tab === 'cards' && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Promo cards shown under the homepage header. The first two visible cards are shown. {visibleCards} visible now.
            </p>
            <button
              type="button"
              className={BTN_PRIMARY}
              onClick={() => {
                const id = `ad-${Date.now()}`;
                update({
                  ...content,
                  adverts: [
                    ...content.adverts,
                    { id, title: 'New card', description: 'A short message for this card.', ctaLabel: 'Learn more', ctaHref: '/contact-us', imageUrl: '', active: true },
                  ],
                });
                setOpenCard(id);
              }}
            >
              <Plus className="h-4 w-4" /> Add card
            </button>
          </div>

          {content.adverts.length === 0 ? (
            <EmptyState icon={<LayoutTemplate className="h-6 w-6" />} title="No homepage cards" text="Add a card to promote an offer or a service on the homepage." />
          ) : (
            <div className="space-y-3">
              {content.adverts.map((ad, i) => {
                const open = openCard === ad.id;
                return (
                  <Card key={ad.id} className={`overflow-hidden ${ad.active === false ? 'opacity-75' : ''}`}>
                    <div className="flex items-center gap-3 p-3 sm:p-4">
                      <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 text-slate-300">
                        {ad.imageUrl ? <img src={ad.imageUrl} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5" />}
                      </div>
                      <button type="button" onClick={() => setOpenCard(open ? null : ad.id)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-black text-slate-900">{ad.title || 'Untitled card'}</p>
                        <p className="truncate text-xs text-slate-500">{ad.description}</p>
                      </button>
                      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                        <span className="hidden items-center gap-1 text-[11px] font-bold text-slate-500 sm:inline-flex">
                          {ad.active === false ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          {ad.active === false ? 'Hidden' : 'Visible'}
                        </span>
                        <Switch checked={ad.active !== false} onChange={(v) => patchAd(ad.id, { active: v })} label={`Show ${ad.title} on the homepage`} />
                        <button
                          type="button"
                          disabled={i === 0}
                          onClick={() => update({ ...content, adverts: move(content.adverts, i, -1) })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          disabled={i === content.adverts.length - 1}
                          onClick={() => update({ ...content, adverts: move(content.adverts, i, 1) })}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setOpenCard(open ? null : ad.id)}
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                          aria-label={open ? 'Close editor' : 'Edit card'}
                          aria-expanded={open}
                        >
                          <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                        </button>
                      </div>
                    </div>
                    {open && (
                      <div className="space-y-4 border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
                        <Field label="Title">
                          <input className={`${INPUT} font-bold`} value={ad.title} onChange={(e) => patchAd(ad.id, { title: e.target.value })} />
                        </Field>
                        <Field label="Message" counter={{ value: (ad.description || '').length, max: 160 }}>
                          <textarea className={`${INPUT} min-h-[80px]`} value={ad.description} onChange={(e) => patchAd(ad.id, { description: e.target.value })} />
                        </Field>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <Field label="Button text">
                            <input className={INPUT} value={ad.ctaLabel} onChange={(e) => patchAd(ad.id, { ctaLabel: e.target.value })} />
                          </Field>
                          <Field label="Button link" hint="A page like /contact-us or a full https:// link.">
                            <input className={`${INPUT} font-mono text-xs`} value={ad.ctaHref} onChange={(e) => patchAd(ad.id, { ctaHref: e.target.value })} />
                          </Field>
                        </div>
                        <Field label="Photo (optional)">
                          <CmsImageInput inputId={`ad-${ad.id}`} value={ad.imageUrl || ''} onChange={(imageUrl) => patchAd(ad.id, { imageUrl })} />
                        </Field>
                        <div className="flex justify-end">
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-50"
                            onClick={() => {
                              if (!window.confirm(`Delete the card "${ad.title}"?`)) return;
                              update({ ...content, adverts: content.adverts.filter((x) => x.id !== ad.id) });
                            }}
                          >
                            <Trash2 className="h-4 w-4" /> Delete card
                          </button>
                        </div>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      {tab === 'footer' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <PanelBottom className="h-4 w-4 text-slate-400" />
              <p className="font-black text-slate-900">About text</p>
            </div>
            <Field label="Short description shown in the footer of every page" counter={{ value: (content.footerBlurb || '').length, max: 240 }}>
              <textarea className={`${INPUT} min-h-[120px]`} value={content.footerBlurb} onChange={(e) => update({ ...content, footerBlurb: e.target.value })} />
            </Field>
          </Card>

          <Card className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-slate-400" />
                <p className="font-black text-slate-900">Bottom bar links</p>
              </div>
              <button
                type="button"
                className={`${BTN_SECONDARY} px-3 py-2 text-xs`}
                onClick={() => update({ ...content, footerLinks: [...content.footerLinks, { id: `fl-${Date.now()}`, label: 'New link', href: '/' }] })}
              >
                <Plus className="h-3.5 w-3.5" /> Add link
              </button>
            </div>
            {content.footerLinks.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No links yet.</p>
            ) : (
              <div className="space-y-2">
                {content.footerLinks.map((fl, i) => (
                  <div key={fl.id} className="flex flex-col gap-2 rounded-xl border border-slate-100 bg-slate-50/60 p-2 sm:flex-row sm:items-center">
                    <input
                      className={`${INPUT} sm:w-40`}
                      aria-label="Link text"
                      value={fl.label}
                      onChange={(e) => update({ ...content, footerLinks: content.footerLinks.map((x) => (x.id === fl.id ? { ...x, label: e.target.value } : x)) })}
                    />
                    <input
                      className={`${INPUT} min-w-0 flex-1 font-mono text-xs`}
                      aria-label="Link address"
                      placeholder="/privacy or https://…"
                      value={fl.href}
                      onChange={(e) => update({ ...content, footerLinks: content.footerLinks.map((x) => (x.id === fl.id ? { ...x, href: e.target.value } : x)) })}
                    />
                    <div className="flex shrink-0 items-center gap-1 self-end sm:self-auto">
                      <button
                        type="button"
                        disabled={i === 0}
                        onClick={() => update({ ...content, footerLinks: move(content.footerLinks, i, -1) })}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30"
                        aria-label="Move up"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={i === content.footerLinks.length - 1}
                        onClick={() => update({ ...content, footerLinks: move(content.footerLinks, i, 1) })}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-30"
                        aria-label="Move down"
                      >
                        <ArrowDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => update({ ...content, footerLinks: content.footerLinks.filter((x) => x.id !== fl.id) })}
                        className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                        aria-label={`Delete ${fl.label}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="rounded-xl bg-slate-900 px-4 py-3">
              <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">Preview</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-300">
                {content.footerLinks.map((fl) => (
                  <span key={fl.id}>{fl.label}</span>
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
};

export default WebsiteContentManager;
