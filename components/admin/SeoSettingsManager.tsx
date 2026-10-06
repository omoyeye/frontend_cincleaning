import React, { useEffect, useMemo, useState } from 'react';
import { Download, RotateCcw, Save, Search, Sparkles, Loader2, Eye, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useFlyer } from '../Flyer';
import type { SiteSeoSettings, SeoPageMeta } from '../../types';
import { buildRobotsTxt, buildSitemapXml, defaultSiteSeo, deepMergePages } from '../../src/seo/seoStorage';
import { apiAdmin, apiUrl } from '../../services/api';
import type { SeoPageId } from '../../src/seo/routePaths';
import { SITEMAP_CUSTOMER_PATHS } from '../../src/seo/routePaths';

const PAGE_LABELS: Record<SeoPageId, string> = {
  home: 'Homepage (/)',
  residential: 'Residential cleaning',
  standardCleaning: 'General / standard cleaning (/standard-cleaning)',
  deepCleaning: 'Deep cleaning (/deep-cleaning)',
  endOfTenancy: 'End of tenancy cleaning (/end-of-tenancy-cleaning)',
  commercial: 'Commercial cleaning',
  airbnbShortLet: 'Airbnb / short-let cleaning (/airbnb-short-let-cleaning)',
  about: 'About us',
  gallery: 'Gallery (/cleaning-gallery)',
  blog: 'Blog index (/cleaning-blog)',
  pricing: 'Pricing',
  contact: 'Contact',
  faq: 'FAQ (/cleaning-faq)',
  terms: 'Terms & conditions (/terms-and-conditions)',
  book: 'Book a clean',
  area: 'Area landing pages (/cleaning-in-…)',
  portal: 'Client account (noindex)',
  admin: 'Admin console (noindex)',
  staff: 'Staff portal (noindex)',
};

const PAGE_ORDER: SeoPageId[] = [
  'home',
  'residential',
  'standardCleaning',
  'deepCleaning',
  'endOfTenancy',
  'commercial',
  'airbnbShortLet',
  'about',
  'gallery',
  'blog',
  'pricing',
  'contact',
  'faq',
  'terms',
  'book',
  'portal',
  'admin',
  'staff',
];

function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const emptyMeta: SeoPageMeta = { title: '', description: '', keywords: '', ogImageUrl: '' };

const TITLE_IDEAL = 60;
const DESC_IDEAL = 160;

function CharBar({ value, ideal, label }: { value: number; ideal: number; label: string }) {
  const pct = Math.min(100, (value / ideal) * 100);
  const over = value > ideal;
  const good = value > 0 && value <= ideal;
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : good ? 'bg-emerald-500' : 'bg-slate-300'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`text-[10px] font-bold tabular-nums ${over ? 'text-red-600' : 'text-slate-400'}`}>
        {value}/{ideal} {label}
      </span>
    </div>
  );
}

function GooglePreview({ title, description, url }: { title: string; description: string; url: string }) {
  if (!title && !description) return null;
  const displayTitle = title || 'Page Title';
  const displayDesc = description || 'No description set — Google may auto-generate one from page content.';
  const displayUrl = url || 'https://example.com';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 mt-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 flex items-center gap-1.5">
        <Eye className="w-3 h-3" /> Google search preview
      </p>
      <div className="space-y-0.5">
        <p className="text-sm text-emerald-800 truncate">{displayUrl}</p>
        <p className="text-[#1a0dab] text-lg font-medium leading-snug line-clamp-1 hover:underline cursor-default">{displayTitle}</p>
        <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">{displayDesc}</p>
      </div>
    </div>
  );
}

function SeoScoreIndicator({ title, description }: { title: string; description: string }) {
  const checks = [
    { ok: title.length >= 30 && title.length <= TITLE_IDEAL, label: 'Title length' },
    { ok: description.length >= 80 && description.length <= DESC_IDEAL, label: 'Description length' },
    { ok: title.length > 0, label: 'Title set' },
    { ok: description.length > 0, label: 'Description set' },
  ];
  const score = checks.filter((c) => c.ok).length;
  const color = score === 4 ? 'text-emerald-600' : score >= 2 ? 'text-amber-600' : 'text-red-500';
  return (
    <span className={`text-xs font-black ${color} flex items-center gap-1`}>
      {score === 4 ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
      {score}/4
    </span>
  );
}

const SeoSettingsManager: React.FC = () => {
  const { showFlyer } = useFlyer();
  const [draft, setDraft] = useState<SiteSeoSettings>(defaultSiteSeo());
  const [expanded, setExpanded] = useState<SeoPageId | null>('home');
  const [isLoading, setIsLoading] = useState(true);
  const [generatingPage, setGeneratingPage] = useState<SeoPageId | null>(null);

  useEffect(() => {
    let mounted = true;
    apiAdmin.getBusinessSettings().then((raw) => {
      if (!mounted) return;
      const settings = raw as Record<string, unknown>;
      const seoRaw = settings.seo_settings;
      if (seoRaw && typeof seoRaw === 'object') {
        const parsed = seoRaw as Partial<SiteSeoSettings>;
        const defaults = defaultSiteSeo();
        setDraft({
          ...defaults,
          ...parsed,
          pages: deepMergePages(defaults.pages, parsed.pages),
        });
      }
      setIsLoading(false);
    }).catch((err) => {
      console.error(err);
      if (mounted) setIsLoading(false);
    });
    return () => { mounted = false; };
  }, []);

  const effectiveSiteUrl = useMemo(() => {
    const s = draft.siteUrl.trim().replace(/\/$/, '');
    if (s) return s;
    if (typeof window !== 'undefined') return window.location.origin;
    return 'https://example.com';
  }, [draft.siteUrl]);

  const updatePage = (id: SeoPageId, patch: Partial<SeoPageMeta>) => {
    setDraft((prev) => ({
      ...prev,
      pages: {
        ...prev.pages,
        [id]: { ...(prev.pages[id] || emptyMeta), ...patch },
      },
    }));
  };

  const handleSave = async () => {
    try {
      await apiAdmin.updateBusinessSettings({ seo_settings: draft });
      showFlyer('SEO settings saved to database. Meta tags will update on the next page load.', 'success');
    } catch (e: any) {
      showFlyer(e.message || 'Could not save SEO settings.', 'error');
    }
  };

  const handleResetAll = async () => {
    if (!window.confirm('Reset all SEO fields to defaults?')) return;
    const next = defaultSiteSeo();
    setDraft(next);
    try {
      await apiAdmin.updateBusinessSettings({ seo_settings: next });
      showFlyer('SEO reset to defaults.', 'success');
    } catch {
      showFlyer('Could not save after reset.', 'error');
    }
  };

  const handleResetPage = async (id: SeoPageId) => {
    const defs = defaultSiteSeo();
    const next: SiteSeoSettings = {
      ...draft,
      pages: {
        ...draft.pages,
        [id]: { ...(defs.pages[id] || emptyMeta) },
      },
    };
    setDraft(next);
    try {
      await apiAdmin.updateBusinessSettings({ seo_settings: next });
      showFlyer(`“${PAGE_LABELS[id]}” reset to defaults and saved.`, 'success');
    } catch {
      showFlyer('Could not save after reset.', 'error');
    }
  };

  const handleAiGenerate = async (id: SeoPageId) => {
    setGeneratingPage(id);
    try {
      const res = await fetch(apiUrl('/ai/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: `Generate SEO metadata for a UK cleaning company page: "${PAGE_LABELS[id]}".
Return ONLY a JSON object with these fields:
- "title": page title (max 60 chars, include brand if room)
- "description": meta description (max 160 chars, compelling, include call to action)
- "keywords": comma-separated keywords (6-10 relevant terms)

Business: ${draft.organizationName || 'CiN Cleaning'}, website: ${effectiveSiteUrl}
The page is about: ${PAGE_LABELS[id]}. It's a UK-based professional cleaning service.
Return ONLY the JSON object, no markdown, no explanation.`,
          brandName: draft.organizationName || 'CiN Cleaning',
        }),
      });
      const data = await res.json();
      const raw = (data.response || '').trim();
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<SeoPageMeta>;
        updatePage(id, {
          ...(parsed.title ? { title: parsed.title } : {}),
          ...(parsed.description ? { description: parsed.description } : {}),
          ...(parsed.keywords ? { keywords: parsed.keywords } : {}),
        });
        showFlyer(`AI-generated SEO for "${PAGE_LABELS[id]}" — review and save.`, 'success');
      } else {
        showFlyer('AI returned unexpected format. Please try again.', 'error');
      }
    } catch (e: any) {
      showFlyer(e.message || 'AI generation failed.', 'error');
    } finally {
      setGeneratingPage(null);
    }
  };

  if (isLoading) {
    return <div className="p-8">Loading SEO settings...</div>;
  }

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100/50 p-8 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Search className="w-5 h-5 text-emerald-600" />
            SEO &amp; analytics
          </h4>
          <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest max-w-xl">
            Meta tags, Open Graph, Google Tag Manager, GA4, verification, and per-page titles. Build sets{' '}
            <code className="text-slate-600">sitemap.xml</code> and <code className="text-slate-600">robots.txt</code> from your site URL (also generated at build via{' '}
            <code className="text-slate-600">VITE_SITE_URL</code>).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              window.open('/sitemap.xml', '_blank');
              downloadText('sitemap.xml', buildSitemapXml(effectiveSiteUrl, SITEMAP_CUSTOMER_PATHS));
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-800 font-bold text-sm hover:bg-slate-200"
          >
            <Download className="w-4 h-4" />
            Sitemap
          </button>
          <button
            type="button"
            onClick={() => window.open('/robots.txt', '_blank')}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-800 font-bold text-sm hover:bg-slate-200"
          >
            <Download className="w-4 h-4" />
            Robots
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <label className="block space-y-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Canonical site URL</span>
          <input
            className="w-full p-3 rounded-xl border border-slate-200"
            placeholder="https://www.yourdomain.com"
            value={draft.siteUrl}
            onChange={(e) => setDraft((p) => ({ ...p, siteUrl: e.target.value }))}
          />
          <span className="text-xs text-slate-500">No trailing slash. Used for canonical links, OG URLs, and downloadable sitemap.</span>
        </label>
        <label className="block space-y-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Organization name (schema &amp; fallback titles)</span>
          <input
            className="w-full p-3 rounded-xl border border-slate-200"
            value={draft.organizationName}
            onChange={(e) => setDraft((p) => ({ ...p, organizationName: e.target.value }))}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Google Tag Manager container ID</span>
          <input
            className="w-full p-3 rounded-xl border border-slate-200 font-mono text-sm"
            placeholder="GTM-XXXXXXX"
            value={draft.gtmContainerId}
            onChange={(e) => setDraft((p) => ({ ...p, gtmContainerId: e.target.value }))}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Google Analytics 4 measurement ID (optional)</span>
          <input
            className="w-full p-3 rounded-xl border border-slate-200 font-mono text-sm"
            placeholder="G-XXXXXXXXXX"
            value={draft.googleAnalytics4Id}
            onChange={(e) => setDraft((p) => ({ ...p, googleAnalytics4Id: e.target.value }))}
          />
          <span className="text-xs text-slate-500">Can be omitted if you load GA4 only through GTM.</span>
        </label>
        <label className="block space-y-2 md:col-span-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Google Search Console verification (meta content)</span>
          <input
            className="w-full p-3 rounded-xl border border-slate-200 font-mono text-sm"
            placeholder="Paste verification token content only"
            value={draft.googleSiteVerification}
            onChange={(e) => setDraft((p) => ({ ...p, googleSiteVerification: e.target.value }))}
          />
        </label>
        <label className="block space-y-2 md:col-span-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Default Open Graph / Twitter image URL</span>
          <input
            className="w-full p-3 rounded-xl border border-slate-200 text-sm"
            placeholder="https://…/og-image.jpg"
            value={draft.defaultOgImageUrl}
            onChange={(e) => setDraft((p) => ({ ...p, defaultOgImageUrl: e.target.value }))}
          />
        </label>
        <label className="block space-y-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Twitter / X @handle</span>
          <input
            className="w-full p-3 rounded-xl border border-slate-200"
            placeholder="YourBrand"
            value={draft.twitterSite}
            onChange={(e) => setDraft((p) => ({ ...p, twitterSite: e.target.value }))}
          />
        </label>
      </div>

      <label className="block space-y-2">
        <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Custom meta tags (one per line: name|content)</span>
        <textarea
          className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs min-h-[88px]"
          placeholder={'alternate|en-GB\nother-meta|value'}
          value={draft.customMetaLines}
          onChange={(e) => setDraft((p) => ({ ...p, customMetaLines: e.target.value }))}
        />
      </label>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <label className="block space-y-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Head scripts</span>
          <textarea
            className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs min-h-[120px]"
            placeholder="Paste <script>...</script> or other head tags"
            value={draft.scriptHead || ''}
            onChange={(e) => setDraft((p) => ({ ...p, scriptHead: e.target.value }))}
          />
          <span className="text-[10px] text-slate-500 block">Injected inside &lt;head&gt;</span>
        </label>
        <label className="block space-y-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Body Start scripts</span>
          <textarea
            className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs min-h-[120px]"
            placeholder="Paste <script>...</script> here"
            value={draft.scriptBodyStart || ''}
            onChange={(e) => setDraft((p) => ({ ...p, scriptBodyStart: e.target.value }))}
          />
          <span className="text-[10px] text-slate-500 block">Injected after &lt;body&gt; tag</span>
        </label>
        <label className="block space-y-2">
          <span className="text-[11px] font-black uppercase tracking-widest text-slate-400">Body End scripts</span>
          <textarea
            className="w-full p-3 rounded-xl border border-slate-200 font-mono text-xs min-h-[120px]"
            placeholder="Paste <script>...</script> here"
            value={draft.scriptBodyEnd || ''}
            onChange={(e) => setDraft((p) => ({ ...p, scriptBodyEnd: e.target.value }))}
          />
          <span className="text-[10px] text-slate-500 block">Injected before &lt;/body&gt; tag</span>
        </label>
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Per-page meta (CRUD)</p>
        <div className="divide-y divide-slate-100 border border-slate-100 rounded-2xl overflow-hidden">
          {PAGE_ORDER.map((id) => {
            const pm = draft.pages[id] || emptyMeta;
            const open = expanded === id;
            const isGenerating = generatingPage === id;
            return (
              <div key={id} className="bg-slate-50/50">
                <button
                  type="button"
                  className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                  onClick={() => setExpanded(open ? null : id)}
                >
                  <span className="font-black text-slate-900 flex items-center gap-2">
                    {PAGE_LABELS[id]}
                    <SeoScoreIndicator title={pm.title} description={pm.description} />
                  </span>
                  <span className="text-xs font-bold text-slate-400">{open ? 'Hide' : 'Edit'}</span>
                </button>
                {open && (
                  <div className="px-4 pb-4 pt-0 space-y-3 bg-white border-t border-slate-100">
                    <label className="block space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400">Title</span>
                      <input
                        className={`w-full p-2 rounded-lg border text-sm ${pm.title.length > TITLE_IDEAL ? 'border-red-300 bg-red-50/50' : 'border-slate-200'}`}
                        value={pm.title}
                        onChange={(e) => updatePage(id, { title: e.target.value })}
                      />
                      <CharBar value={pm.title.length} ideal={TITLE_IDEAL} label="chars" />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400">Meta description</span>
                      <textarea
                        className={`w-full p-2 rounded-lg border text-sm min-h-[72px] ${pm.description.length > DESC_IDEAL ? 'border-red-300 bg-red-50/50' : 'border-slate-200'}`}
                        value={pm.description}
                        onChange={(e) => updatePage(id, { description: e.target.value })}
                      />
                      <CharBar value={pm.description.length} ideal={DESC_IDEAL} label="chars" />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400">Keywords</span>
                      <input
                        className="w-full p-2 rounded-lg border border-slate-200 text-sm"
                        value={pm.keywords}
                        onChange={(e) => updatePage(id, { keywords: e.target.value })}
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400">OG image override (optional)</span>
                      <input
                        className="w-full p-2 rounded-lg border border-slate-200 text-sm"
                        placeholder="Leave blank to use default image above"
                        value={pm.ogImageUrl}
                        onChange={(e) => updatePage(id, { ogImageUrl: e.target.value })}
                      />
                    </label>

                    <GooglePreview
                      title={pm.title}
                      description={pm.description}
                      url={effectiveSiteUrl + (SITEMAP_CUSTOMER_PATHS.find((p) => p.id === id)?.path || '/')}
                    />

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={() => handleAiGenerate(id)}
                        disabled={isGenerating}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-700 font-bold text-xs hover:bg-violet-100 disabled:opacity-50 transition-colors"
                      >
                        {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        {isGenerating ? 'Generating...' : 'AI Generate'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleResetPage(id)}
                        className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset defaults
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={handleResetAll}
          className="px-4 py-3 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 text-sm"
        >
          Reset all SEO to defaults
        </button>
        <button
          type="button"
          onClick={() => {
            handleSave();
          }}
          className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-emerald-600 text-white font-black hover:bg-emerald-700 shadow-lg"
        >
          <Save className="w-5 h-5" />
          Save SEO settings
        </button>
      </div>
    </div>
  );
};

export default SeoSettingsManager;
