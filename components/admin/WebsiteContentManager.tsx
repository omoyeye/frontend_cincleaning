import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { WebsiteContent } from '../../types';
import { apiAdmin } from '../../services/api';
import { subscribeNnSync } from '../../services/realtime';
import { getWebsiteContent, normalizeWebsiteContent, saveWebsiteContent } from '../../src/cms/content';
import CmsImageInput from './CmsImageInput';
import { useFlyer } from '../Flyer';

const SERVER_SAVE_DEBOUNCE_MS = 750;

const WebsiteContentManager: React.FC = () => {
  const { showFlyer } = useFlyer();
  const [content, setContent] = useState<WebsiteContent>(() => getWebsiteContent());
  const [loading, setLoading] = useState(true);
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
      if (scope !== 'all') return;
      void apiAdmin.getBusinessSettings().then((s: Record<string, unknown>) => {
        const wc = s?.websiteContent;
        if (wc != null) {
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
      window.dispatchEvent(
        new CustomEvent('nn_business_settings_updated', { detail: { websiteContent: next } })
      );
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Failed to save website content', 'error');
    }
  }, [showFlyer]);

  const scheduleServerSave = useCallback(
    (next: WebsiteContent) => {
      pendingRef.current = next;
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

  if (loading) {
    return <div className="text-sm font-bold text-slate-500 py-8">Loading website content…</div>;
  }

  return (
    <div className="space-y-8">
      <p className="text-sm text-slate-600 leading-relaxed">
        Hero copy and images apply to each public page (home, residential, commercial, about, pricing, contact). Footer text and
        bottom links appear site-wide. Changes are saved to the server and stay until you update them again (also cached in this
        browser for faster loads).
      </p>

      <section className="bg-white p-6 rounded-2xl border border-slate-100 space-y-4">
        <div>
          <h4 className="font-black text-slate-900">Page heroes</h4>
          <p className="text-xs text-slate-500 mt-1">
            Set image by path/URL, or use <strong>Upload image</strong> (stored on the server with your business settings).
          </p>
        </div>
        {content.heroes.map((h) => (
          <div key={h.id} className="p-4 rounded-xl border border-slate-100 space-y-3 bg-slate-50/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 items-end">
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400">Page</span>
                <input className="w-full p-2 rounded border bg-white text-sm" value={h.page} readOnly />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className="text-[10px] font-black uppercase text-slate-400">Title</span>
                <input
                  className="w-full p-2 rounded border bg-white text-sm"
                  value={h.title}
                  onChange={(e) =>
                    update({
                      ...content,
                      heroes: content.heroes.map((x) => (x.id === h.id ? { ...x, title: e.target.value } : x)),
                    })
                  }
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Subtitle</span>
              <input
                className="w-full p-2 rounded border bg-white text-sm"
                value={h.subtitle}
                onChange={(e) =>
                  update({
                    ...content,
                    heroes: content.heroes.map((x) => (x.id === h.id ? { ...x, subtitle: e.target.value } : x)),
                  })
                }
              />
            </label>
            <div>
              <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Hero image</span>
              <CmsImageInput
                inputId={`hero-${h.id}`}
                value={h.imageUrl}
                onChange={(imageUrl) =>
                  update({
                    ...content,
                    heroes: content.heroes.map((x) => (x.id === h.id ? { ...x, imageUrl } : x)),
                  })
                }
              />
            </div>
          </div>
        ))}
      </section>

      <section className="bg-white p-6 rounded-2xl border border-slate-100 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h4 className="font-black text-slate-900">Homepage advert cards</h4>
            <p className="text-xs text-slate-500 mt-1">
              These cards show below the homepage hero. You can edit, disable, delete, or add as many cards as needed.
            </p>
          </div>
          <button
            type="button"
            className="px-3 py-2 rounded bg-slate-900 text-white text-sm"
            onClick={() =>
              update({
                ...content,
                adverts: [
                  ...content.adverts,
                  {
                    id: `ad-${Date.now()}`,
                    title: 'New advert title',
                    description: 'Short message for this advert card.',
                    ctaLabel: 'Learn more',
                    ctaHref: '/contact-us',
                    imageUrl: '',
                    active: true,
                  },
                ],
              })
            }
          >
            Add advert card
          </button>
        </div>
        {content.adverts.map((ad) => (
          <div key={ad.id} className="p-4 rounded-xl border border-slate-100 space-y-3 bg-slate-50/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 items-end">
              <label className="block space-y-1 lg:col-span-2">
                <span className="text-[10px] font-black uppercase text-slate-400">Title</span>
                <input
                  className="w-full p-2 rounded border bg-white text-sm"
                  value={ad.title}
                  onChange={(e) =>
                    update({
                      ...content,
                      adverts: content.adverts.map((x) => (x.id === ad.id ? { ...x, title: e.target.value } : x)),
                    })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400">CTA label</span>
                <input
                  className="w-full p-2 rounded border bg-white text-sm"
                  value={ad.ctaLabel}
                  onChange={(e) =>
                    update({
                      ...content,
                      adverts: content.adverts.map((x) => (x.id === ad.id ? { ...x, ctaLabel: e.target.value } : x)),
                    })
                  }
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[10px] font-black uppercase text-slate-400">CTA URL</span>
                <input
                  className="w-full p-2 rounded border bg-white text-sm font-mono"
                  placeholder="/contact-us or https://..."
                  value={ad.ctaHref}
                  onChange={(e) =>
                    update({
                      ...content,
                      adverts: content.adverts.map((x) => (x.id === ad.id ? { ...x, ctaHref: e.target.value } : x)),
                    })
                  }
                />
              </label>
            </div>
            <label className="block space-y-1">
              <span className="text-[10px] font-black uppercase text-slate-400">Description</span>
              <textarea
                className="w-full p-2 rounded border bg-white text-sm min-h-[80px]"
                value={ad.description}
                onChange={(e) =>
                  update({
                    ...content,
                    adverts: content.adverts.map((x) => (x.id === ad.id ? { ...x, description: e.target.value } : x)),
                  })
                }
              />
            </label>
            <div>
              <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Advert image (optional)</span>
              <CmsImageInput
                inputId={`ad-${ad.id}`}
                value={ad.imageUrl || ''}
                onChange={(imageUrl) =>
                  update({
                    ...content,
                    adverts: content.adverts.map((x) => (x.id === ad.id ? { ...x, imageUrl } : x)),
                  })
                }
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={ad.active}
                  onChange={(e) =>
                    update({
                      ...content,
                      adverts: content.adverts.map((x) => (x.id === ad.id ? { ...x, active: e.target.checked } : x)),
                    })
                  }
                />
                Visible on homepage
              </label>
              <button
                type="button"
                className="px-3 py-2 rounded bg-red-50 text-red-600 font-bold"
                onClick={() => update({ ...content, adverts: content.adverts.filter((x) => x.id !== ad.id) })}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="bg-white p-6 rounded-2xl border border-slate-100 space-y-3">
        <h4 className="font-black text-slate-900">Footer blurb</h4>
        <textarea
          className="w-full p-2 rounded border min-h-[80px]"
          value={content.footerBlurb}
          onChange={(e) => update({ ...content, footerBlurb: e.target.value })}
        />
      </section>

      <section className="bg-white p-6 rounded-2xl border border-slate-100 space-y-3">
        <div className="flex justify-between items-center">
          <h4 className="font-black text-slate-900">Footer links (bottom bar)</h4>
          <button
            type="button"
            className="px-3 py-2 rounded bg-slate-900 text-white text-sm"
            onClick={() =>
              update({
                ...content,
                footerLinks: [...content.footerLinks, { id: `fl-${Date.now()}`, label: 'New link', href: '/' }],
              })
            }
          >
            Add link
          </button>
        </div>
        {content.footerLinks.map((fl) => (
          <div key={fl.id} className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
            <input
              className="p-2 rounded border"
              value={fl.label}
              onChange={(e) =>
                update({
                  ...content,
                  footerLinks: content.footerLinks.map((x) => (x.id === fl.id ? { ...x, label: e.target.value } : x)),
                })
              }
            />
            <input
              className="p-2 rounded border font-mono text-sm"
              placeholder="/contact-us or https://…"
              value={fl.href}
              onChange={(e) =>
                update({
                  ...content,
                  footerLinks: content.footerLinks.map((x) => (x.id === fl.id ? { ...x, href: e.target.value } : x)),
                })
              }
            />
            <button
              type="button"
              className="px-3 py-2 rounded bg-red-50 text-red-600 font-bold justify-self-start"
              onClick={() => update({ ...content, footerLinks: content.footerLinks.filter((x) => x.id !== fl.id) })}
            >
              Delete
            </button>
          </div>
        ))}
      </section>
    </div>
  );
};

export default WebsiteContentManager;
