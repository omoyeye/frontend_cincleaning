import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Loader2, Mail, Phone, Facebook, Instagram } from 'lucide-react';
import type { BlogPost, Extra, GalleryItem, WebsiteContent } from '../types';
import { getSiteSeo } from '../src/seo/seoStorage';
import { getWebsiteContent, normalizeWebsiteContent, saveWebsiteContent } from '../src/cms/content';
import { subscribeNnSync } from '../services/realtime';
import { type CustomerPageKey, customerPageFromPath } from '../src/seo/routePaths';
import { apiClient } from '../services/api';
import { mergePricingPageConfig, computePricingEstimate } from '../src/pricing/pricingPageConfig';
import { useBusinessSettings } from '../src/context/BusinessSettingsContext';
import { sanitizeHtml } from '../src/utils/sanitizeHtml';
import BrandLogoMark from './BrandLogoMark';
import CleaningFaq from './CleaningFaq';
import MarketingFooter from './MarketingFooter';
import QuoteWidget from './QuoteWidget';
import TermsAndConditionsPage from './TermsAndConditionsPage';


/** Marketing pages only - booking uses `BookingWizard` in App. */
type MarketingPageKey = Exclude<CustomerPageKey, 'book'>;

/** Full-bleed bg image + caption on a very light glass card (residential + service submenu pages). */
const SUBMENU_HERO_SECTION =
  'relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 overflow-hidden min-h-[min(85dvh,560px)] md:min-h-[520px] bg-slate-900';
const SUBMENU_HERO_CAPTION_CARD =
  'rounded-2xl border border-white/20 bg-slate-950/[0.22] backdrop-blur-sm px-6 py-6 sm:px-8 sm:py-8 md:px-10 md:py-10 shadow-sm text-white space-y-5 w-full max-w-4xl xl:max-w-5xl';

/** Copy for the /cleaning-in-<slug> local SEO landing pages. Slugs mirror SERVICE_AREAS in routePaths. */
const AREA_DATA: Record<string, { name: string; description: string; highlights: string[] }> = {
  'manchester': {
    name: 'Manchester',
    description: 'Professional cleaning across Greater Manchester, from the city centre to the suburbs.',
    highlights: ['Coverage across all Manchester postcodes', 'Same-day availability', 'Local cleaners who know your area'],
  },
  'south-manchester': {
    name: 'South Manchester',
    description: 'Expert cleaning in Didsbury, Chorlton, Withington, Fallowfield and across South Manchester.',
    highlights: ['Serving Didsbury, Chorlton and Withington', 'Weekly, fortnightly and monthly plans', 'Deep cleans, end-of-tenancy and regular cleans'],
  },
  'north-manchester': {
    name: 'North Manchester',
    description: 'Reliable cleaning across Prestwich, Whitefield, Bury and North Manchester.',
    highlights: ['Covering Prestwich, Whitefield and Bury', 'Background-checked, insured cleaners', 'Flexible evening and weekend slots'],
  },
  'east-manchester': {
    name: 'East Manchester',
    description: 'Top-rated cleaning in Ashton, Tameside, Droylsden and across East Manchester.',
    highlights: ['Serving Ashton, Droylsden and Tameside', 'Competitive rates with no hidden fees', 'Quick response for last-minute bookings'],
  },
  'west-manchester': {
    name: 'West Manchester',
    description: 'Dependable cleaning across Salford, Eccles, Trafford and West Manchester.',
    highlights: ['Covering Salford, Trafford and Eccles', 'Commercial and residential', 'Fully insured, uniformed team'],
  },
  'central-manchester': {
    name: 'Central Manchester',
    description: 'Cleaning for Manchester city centre, Ancoats, Northern Quarter and Deansgate.',
    highlights: ['Same-day service available', 'Apartment and office cleaning', 'Serving M1, M2, M3 and M4 postcodes'],
  },
  'london': {
    name: 'London',
    description: 'Professional cleaning across London, from central to the outer boroughs.',
    highlights: ['Coverage across all London boroughs', 'Same-day availability in central London', 'Local cleaners who know your area'],
  },
  'central-london': {
    name: 'Central London',
    description: 'Cleaning for the City, Westminster, Camden, Kensington and across Central London.',
    highlights: ['Serving EC, WC, W1 and SW1 postcodes', 'Apartment, office and short-let cleaning', 'Discreet teams for concierge and serviced buildings'],
  },
  'north-london': {
    name: 'North London',
    description: 'Reliable cleaning across Islington, Camden Town, Highgate, Finchley and North London.',
    highlights: ['Covering Islington, Highbury and Finchley', 'Weekly, fortnightly and monthly plans', 'Background-checked, insured cleaners'],
  },
  'south-london': {
    name: 'South London',
    description: 'Expert cleaning in Clapham, Brixton, Battersea, Wimbledon and across South London.',
    highlights: ['Serving Clapham, Brixton and Battersea', 'Deep cleans, end-of-tenancy and regular cleans', 'Flexible evening and weekend slots'],
  },
  'east-london': {
    name: 'East London',
    description: 'Top-rated cleaning in Hackney, Shoreditch, Stratford, Canary Wharf and across East London.',
    highlights: ['Covering Hackney to Newham and Canary Wharf', 'End-of-tenancy specialists for month-end move-outs', 'Quick response for last-minute bookings'],
  },
  'west-london': {
    name: 'West London',
    description: 'Dependable cleaning across Ealing, Hammersmith, Chiswick, Fulham and West London.',
    highlights: ['Serving Ealing, Hammersmith and Chiswick', 'Commercial and residential', 'Fully insured, uniformed team'],
  },
};

const BEFORE_AFTER_ITEMS: Array<{ label: string; before: string; after: string }> = [
  {
    label: 'Kitchen',
    before: 'Grease film on the hob and extractor, crumbs under appliances, streaked splashback.',
    after: 'Degreased hob and extractor, appliances moved and cleaned behind, splashback and sink polished.',
  },
  {
    label: 'Bathroom',
    before: 'Limescale on taps and screens, discoloured grout, soap residue in the tray.',
    after: 'Descaled taps and glass, grout scrubbed back, every surface sanitised and buffed dry.',
  },
  {
    label: 'End of tenancy',
    before: 'Dusty skirting, marked walls, cupboards left with crumbs, windows smeared.',
    after: 'Cupboards emptied and wiped inside, skirting and frames dusted, windows cleaned to inventory standard.',
  },
];

const AREA_SERVICE_LINKS: Array<{ name: string; desc: string; page: MarketingPageKey }> = [
  { name: 'Standard Cleaning', desc: 'Regular home cleaning, weekly or fortnightly.', page: 'standardCleaning' },
  { name: 'Deep Cleaning', desc: 'Thorough top-to-bottom deep clean.', page: 'deepCleaning' },
  { name: 'End of Tenancy', desc: 'Move-out cleaning to protect your deposit.', page: 'endOfTenancy' },
  { name: 'Residential', desc: 'Complete residential cleaning packages.', page: 'residential' },
  { name: 'Commercial', desc: 'Office and workplace cleaning contracts.', page: 'commercial' },
  { name: 'Airbnb / Short Let', desc: 'Fast turnaround cleaning between guests.', page: 'airbnbShortLet' },
];

const MarketingSite: React.FC<{
  page: MarketingPageKey;
  blogSlug: string | null;
  onBookNow: () => void;
  onNavigate: (page: CustomerPageKey, opts?: { blogSlug?: string | null }) => void;
  onOpenBlogPost: (slug: string) => void;
}> = ({ page, blogSlug, onBookNow, onNavigate, onOpenBlogPost }) => {
  const brand = useBusinessSettings();
  const brandPhone = (brand.phone ?? '').trim();
  const brandEmail = (brand.email ?? '').trim();
  const brandAddress = (brand.address ?? '').trim();
  const [content, setContent] = useState<WebsiteContent>(() => getWebsiteContent());
  const [pricingCfg, setPricingCfg] = useState(() => mergePricingPageConfig(null));
  const [frequencyId, setFrequencyId] = useState<string>('weekly');
  const [serviceLength, setServiceLength] = useState(() => mergePricingPageConfig(null).calculator.serviceLengthDefault);
  const [hoursPerVisit, setHoursPerVisit] = useState(() => mergePricingPageConfig(null).calculator.hoursPerVisitDefault);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactServiceType, setContactServiceType] = useState('Residential Cleaning');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSent, setContactSent] = useState(false);
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogListLoading, setBlogListLoading] = useState(true);
  const [blogArticle, setBlogArticle] = useState<BlogPost | null>(null);
  const [blogArticleLoading, setBlogArticleLoading] = useState(false);
  const [blogArticleErr, setBlogArticleErr] = useState<string | null>(null);
  const [extraServiceSamples, setExtraServiceSamples] = useState<Extra[]>([]);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  const [blogListError, setBlogListError] = useState<string | null>(null);

  const submitSupportContact = async (payload: {
    name: string;
    email: string;
    serviceType?: string;
    message: string;
  }): Promise<boolean> => {
    setContactError(null);
    setContactSubmitting(true);
    try {
      await apiClient.submitContactInquiry(payload);
      return true;
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Unable to send your message right now.';
      setContactError(message);
      return false;
    } finally {
      setContactSubmitting(false);
    }
  };

  useEffect(() => {
    let live = true;
    void apiClient
      .getBusinessSettings()
      .then((s: Record<string, unknown>) => {
        if (!live) return;
        const wc = s?.websiteContent;
        if (wc != null) {
          const n = normalizeWebsiteContent(wc);
          setContent(n);
          saveWebsiteContent(n);
        }
      })
      .catch(() => { });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const sync = () => setContent(getWebsiteContent());
    window.addEventListener('nn_website_content_updated', sync);
    return () => window.removeEventListener('nn_website_content_updated', sync);
  }, []);

  useEffect(() => {
    return subscribeNnSync((scope) => {
      if (scope !== 'all') return;
      void apiClient
        .getBusinessSettings()
        .then((s: Record<string, unknown>) => {
          const wc = s?.websiteContent;
          if (wc != null) {
            const n = normalizeWebsiteContent(wc);
            setContent(n);
            saveWebsiteContent(n);
          }
        })
        .catch(() => { });
      if (page === 'gallery') void apiClient.getGallery().then(setGalleryItems).catch(() => { });
      if (page === 'blog' && !blogSlug) void apiClient.getBlogPosts().then(setBlogPosts).catch(() => { });
    });
  }, [page, blogSlug]);

  useEffect(() => {
    if (page !== 'pricing') return;
    let live = true;
    (async () => {
      try {
        const s = (await apiClient.getBusinessSettings()) as { pricingPage?: unknown };
        if (!live) return;
        const cfg = mergePricingPageConfig(s?.pricingPage);
        setPricingCfg(cfg);
        const c = cfg.calculator;
        setServiceLength(c.serviceLengthDefault);
        setHoursPerVisit(c.hoursPerVisitDefault);
        setFrequencyId(c.frequencies[0]?.id ?? 'weekly');
      } catch {
        if (!live) return;
        const cfg = mergePricingPageConfig(null);
        setPricingCfg(cfg);
        const c = cfg.calculator;
        setServiceLength(c.serviceLengthDefault);
        setHoursPerVisit(c.hoursPerVisitDefault);
        setFrequencyId(c.frequencies[0]?.id ?? 'weekly');
      }
    })();
    return () => {
      live = false;
    };
  }, [page]);

  useEffect(() => {
    const onBiz = (e: Event) => {
      const d = (e as CustomEvent<{ pricingPage?: unknown; websiteContent?: unknown }>).detail;
      if (d?.pricingPage != null) setPricingCfg(mergePricingPageConfig(d.pricingPage));
      if (d?.websiteContent != null) {
        const n = normalizeWebsiteContent(d.websiteContent);
        setContent(n);
        saveWebsiteContent(n);
      }
    };
    window.addEventListener('nn_business_settings_updated', onBiz);
    return () => window.removeEventListener('nn_business_settings_updated', onBiz);
  }, []);

  useEffect(() => {
    const ids = pricingCfg.calculator.frequencies.map((f) => f.id);
    if (ids.length && !ids.includes(frequencyId)) setFrequencyId(ids[0]);
  }, [pricingCfg, frequencyId]);

  useEffect(() => {
    if (page !== 'residential') return;
    let live = true;
    void apiClient
      .getExtraServices()
      .then((rows) => {
        if (live) setExtraServiceSamples(rows.slice(0, 8));
      })
      .catch(() => {
        if (live) setExtraServiceSamples([]);
      });
    return () => {
      live = false;
    };
  }, [page]);

  useEffect(() => {
    if (page !== 'gallery') return;
    let live = true;
    setGalleryLoading(true);
    setGalleryError(null);
    void apiClient
      .getGallery()
      .then((rows) => {
        if (live) setGalleryItems(rows);
      })
      .catch((err: unknown) => {
        if (live) {
          setGalleryItems([]);
          setGalleryError(
            err instanceof Error
              ? err.message
              : 'Could not load the gallery. Make sure the API is running (npm run server on port 3002) and restart it after updates.'
          );
        }
      })
      .finally(() => {
        if (live) setGalleryLoading(false);
      });
    return () => {
      live = false;
    };
  }, [page]);

  useEffect(() => {
    if (page !== 'blog' || blogSlug) return;
    let live = true;
    setBlogListLoading(true);
    setBlogListError(null);
    void apiClient
      .getBlogPosts()
      .then((rows) => {
        if (live) setBlogPosts(rows);
      })
      .catch((err: unknown) => {
        if (live) {
          setBlogPosts([]);
          setBlogListError(
            err instanceof Error
              ? err.message
              : 'Could not load blog posts. Make sure the API is running (npm run server on port 3002) and restart it after updates.'
          );
        }
      })
      .finally(() => {
        if (live) setBlogListLoading(false);
      });
    return () => {
      live = false;
    };
  }, [page, blogSlug]);

  useEffect(() => {
    if (page !== 'blog' || !blogSlug) {
      setBlogArticle(null);
      setBlogArticleErr(null);
      return;
    }
    let live = true;
    setBlogArticleLoading(true);
    setBlogArticleErr(null);
    void apiClient
      .getBlogPostBySlug(blogSlug)
      .then((post) => {
        if (live) setBlogArticle(post);
      })
      .catch(() => {
        if (live) {
          setBlogArticle(null);
          setBlogArticleErr('This article could not be loaded.');
        }
      })
      .finally(() => {
        if (live) setBlogArticleLoading(false);
      });
    return () => {
      live = false;
    };
  }, [page, blogSlug]);

  useEffect(() => {
    if (!blogArticle || page !== 'blog' || !blogSlug) return;
    const site = getSiteSeo();
    const origin = site.siteUrl?.trim().replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : '');
    const path = `/cleaning-blog/${encodeURIComponent(blogArticle.slug)}`;
    const title = blogArticle.metaTitle?.trim() || blogArticle.title;
    const desc = blogArticle.metaDescription?.trim() || blogArticle.excerpt?.trim() || '';
    const canonical = `${origin}${path}`;
    document.title = title;

    const setMeta = (name: string, content: string) => {
      let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('name', name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    const setOg = (prop: string, content: string) => {
      let el = document.querySelector(`meta[property="${prop}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', prop);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    if (desc) setMeta('description', desc);
    const kws = blogArticle.metaKeywords?.trim();
    if (kws) setMeta('keywords', kws);
    setOg('og:title', title);
    if (desc) setOg('og:description', desc);
    setOg('og:type', 'article');
    setOg('og:url', canonical);
    if (blogArticle.heroImageUrl) {
      const raw = blogArticle.heroImageUrl.trim();
      const ogImg = raw.startsWith('http') ? raw : `${origin}${raw.startsWith('/') ? '' : '/'}${raw}`;
      setOg('og:image', ogImg);
    }
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = canonical;

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: blogArticle.title,
      description: desc || undefined,
      datePublished: blogArticle.publishedAt || undefined,
      dateModified: blogArticle.updatedAt || blogArticle.publishedAt || undefined,
      author: { '@type': 'Organization', name: site.organizationName || 'CiN Cleaning' },
      publisher: { '@type': 'Organization', name: site.organizationName || 'CiN Cleaning' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    };
    let script = document.getElementById('nn-blog-jsonld') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'nn-blog-jsonld';
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(jsonLd);

    return () => {
      document.getElementById('nn-blog-jsonld')?.remove();
    };
  }, [blogArticle, page, blogSlug]);

  const hero = useMemo(
    () => content.heroes.find((h) => h.page === page) ?? content.heroes[0],
    [content.heroes, page]
  );


  if (page === 'gallery') {
    return (
      <>
        <div className="max-w-7xl mx-auto px-4 lg:px-8 space-y-10 pb-8 pt-12">
          <header className="max-w-3xl">
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-teal-700">Gallery</span>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 mt-2">Our work</h1>
            <p className="text-slate-600 mt-3 text-lg leading-relaxed">
              Real results from residential and commercial cleans.
            </p>
          </header>
          {galleryError && (
            <div
              role="alert"
              className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 max-w-3xl"
            >
              <p className="font-bold">Gallery unavailable</p>
              <p className="mt-1 text-amber-900/90">{galleryError}</p>
            </div>
          )}
          {/* What changes after a clean — before / after breakdown */}
          <section className="max-w-7xl mx-auto px-4 lg:px-8 mb-14">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">What changes after a clean</h2>
            <p className="mt-2 text-slate-600">The difference a professional team makes, room by room.</p>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 md:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1 gap-6">
              {BEFORE_AFTER_ITEMS.map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
                  <div className="px-6 pt-6">
                    <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-50 text-teal-700">
                      {item.label}
                    </span>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <div className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-slate-400">Before</div>
                      <p className="mt-1 text-sm text-slate-600 leading-relaxed">{item.before}</p>
                    </div>
                    <div className="border-t border-slate-100 pt-4">
                      <div className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-teal-600">After</div>
                      <p className="mt-1 text-sm text-slate-800 font-medium leading-relaxed">{item.after}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {galleryLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {galleryItems.map((item) => (
                <article key={item.id} className="group rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-sm hover:shadow-lg transition-shadow">
                  <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                    <img src={item.imageUrl} alt="" className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500" />
                  </div>
                  <div className="p-6">
                    <h2 className="font-black text-lg text-slate-900">{item.title}</h2>
                    {item.caption && <p className="text-sm text-slate-600 mt-2 leading-relaxed">{item.caption}</p>}
                  </div>
                </article>
              ))}
            </div>
          )}
          {!galleryLoading && !galleryError && galleryItems.length === 0 && (
            <p className="text-slate-600 text-center py-8">No images yet. Add gallery items in Admin → Marketing → Gallery.</p>
          )}
        </div>
        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </>
    );
  }

  if (page === 'blog' && blogSlug) {
    if (blogArticleLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
          <p className="text-slate-600 font-bold">Loading article…</p>
        </div>
      );
    }
    if (blogArticleErr || !blogArticle) {
      return (
        <div className="max-w-lg mx-auto text-center py-16 space-y-4">
          <p className="text-slate-600">{blogArticleErr || 'Article not found.'}</p>
          <button type="button" onClick={() => onNavigate('blog')} className="px-6 py-3 rounded-xl bg-teal-700 text-white font-bold">
            Back to blog
          </button>
        </div>
      );
    }
    const post = blogArticle;
    return (
      <>
        <article className="max-w-7xl mx-auto px-4 lg:px-8 safe-area-px space-y-0 pb-8">
          {post.heroImageUrl && (
            <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 bg-slate-900">
              <img src={post.heroImageUrl} alt="" className="w-full max-h-[min(55vh,480px)] object-cover opacity-95" />
            </div>
          )}
          <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-10 space-y-6">
            <header>
              <nav aria-label="Breadcrumb">
                <ol className="flex flex-wrap gap-2 text-sm text-slate-500">
                  <li>
                    <button type="button" className="hover:text-teal-700 font-bold" onClick={() => onNavigate('blog')}>
                      Blog
                    </button>
                  </li>
                  <li aria-hidden>/</li>
                  <li className="text-slate-800 font-bold truncate">{post.title}</li>
                </ol>
              </nav>
              {post.publishedAt && (
                <time className="block text-xs font-black uppercase tracking-widest text-slate-400 mt-4" dateTime={post.publishedAt}>
                  {new Date(post.publishedAt).toLocaleDateString('en-GB', { dateStyle: 'long' })}
                </time>
              )}
              <h1 className="text-4xl md:text-5xl font-black text-slate-900 mt-2 leading-tight">{post.title}</h1>
              {post.excerpt && <p className="text-xl text-slate-600 mt-4 leading-relaxed">{post.excerpt}</p>}
            </header>
            <div
              className="blog-content space-y-4 text-slate-700 [&_article]:contents [&_h2]:text-2xl [&_h2]:font-black [&_h2]:text-slate-900 [&_h2]:mt-10 [&_h2]:mb-3 [&_p]:leading-relaxed [&_a]:text-teal-700 [&_a]:font-bold [&_a]:underline"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.bodyHtml) }}
            />
          </div>
        </article>
        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </>
    );
  }

  if (page === 'blog') {
    return (
      <>
        <div className="space-y-10 pb-8 pt-12">
          <header className="max-w-7xl mx-auto px-4 lg:px-8">
            <span className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-teal-700">CiN Journal</span>
            <h1 className="text-4xl md:text-5xl font-black text-slate-900 mt-2">Cleaning tips &amp; insights</h1>
            <p className="text-slate-600 mt-3 text-lg leading-relaxed">
              Practical guides for homes and businesses.
            </p>
          </header>
          {blogListError && (
            <div
              role="alert"
              className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 max-w-3xl"
            >
              <p className="font-bold">Blog unavailable</p>
              <p className="mt-1 text-amber-900/90">{blogListError}</p>
            </div>
          )}
          {blogListLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-10 h-10 animate-spin text-teal-600" />
            </div>
          ) : (
            <div className="max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-1 md:grid-cols-2 gap-8">
              {blogPosts.map((post) => (
                <article
                  key={post.id}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col"
                >
                  {post.heroImageUrl && (
                    <button type="button" onClick={() => onOpenBlogPost(post.slug)} className="block w-full aspect-[16/9] overflow-hidden bg-slate-100 text-left">
                      <img src={post.heroImageUrl} alt="" className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-500" />
                    </button>
                  )}
                  <div className="p-6 flex-1 flex flex-col">
                    {post.publishedAt && (
                      <time className="text-xs font-bold text-slate-400" dateTime={post.publishedAt}>
                        {new Date(post.publishedAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                      </time>
                    )}
                    <h2 className="text-xl font-black text-slate-900 mt-2 leading-snug">
                      <button type="button" className="text-left hover:text-teal-700 transition-colors" onClick={() => onOpenBlogPost(post.slug)}>
                        {post.title}
                      </button>
                    </h2>
                    {post.excerpt && <p className="text-slate-600 mt-3 text-sm leading-relaxed flex-1">{post.excerpt}</p>}
                    <button
                      type="button"
                      onClick={() => onOpenBlogPost(post.slug)}
                      className="mt-4 text-teal-700 font-bold text-sm hover:underline text-left"
                    >
                      Read article
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {!blogListLoading && !blogListError && blogPosts.length === 0 && (
            <p className="text-slate-600 text-center py-8">No posts yet. Add articles in Admin → Marketing → Blog.</p>
          )}
        </div>
        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </>
    );
  }

  if (page === 'home') {
    const h = content.heroes.find((x) => x.page === 'home') ?? hero;
    const heroImg = h?.imageUrl || '/siteshots/home-reference-final.jpg';
    const homeAdverts = content.adverts.filter((ad) => ad.active !== false).slice(0, 2);
    return (
      <>
        <div className="space-y-0">
          <section className="relative w-full px-4 lg:px-8 overflow-hidden min-h-[min(82dvh,580px)] md:min-h-[540px] bg-slate-950 nn-marketing-hero-glow">
            <img src={heroImg} alt="" className="absolute inset-0 z-0 h-full w-full object-cover" />
            <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 safe-area-px py-14 md:py-24">
              <div className="max-w-2xl rounded-2xl border border-white/15 bg-slate-950/45 p-6 sm:p-8 md:p-10 shadow-2xl shadow-black/30 backdrop-blur-md text-white space-y-5">
                <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase text-teal-300">
                  {h?.eyebrow ?? 'CiN Cleaning'}
                </span>
                <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.02] sm:leading-[0.95]">
                  {h?.title ?? 'Clean It Neatly.'}
                </h1>
                <p className="text-base sm:text-lg text-white/90 max-w-xl leading-relaxed">
                  {h?.subtitle ??
                    'Professional cleaning across London and Manchester, built on one idea: your space should feel calm, fresh, and finished - not half-done.'}
                </p>
                <p className="text-sm text-teal-100/95 font-semibold tracking-wide">
                  <span className="text-teal-300 font-black">C</span>lean · <span className="text-teal-300 font-black">I</span>t ·{' '}
                  <span className="text-teal-300 font-black">N</span>eatly - the meaning behind CiN.
                </p>
                <div className="flex flex-wrap gap-3 pt-1">
                  <button
                    type="button"
                    onClick={onBookNow}
                    className="px-5 py-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm sm:text-base"
                  >
                    {h?.ctaPrimary ?? 'Book a clean'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('residential')}
                    className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold text-sm sm:text-base ring-1 ring-white/25"
                  >
                    {h?.ctaSecondary ?? 'Residential services'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate('contact')}
                    className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold text-sm sm:text-base ring-1 ring-white/25"
                  >
                    {(h?.ctaTertiary ?? 'Contact us').trim() || 'Contact us'}
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* Instant quote — lead capture, not a real booking */}
          <section id="instant-quote" className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-10 items-start">
              <div className="lg:col-span-2 space-y-4">
                <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-50 text-teal-700">
                  Free quote · takes 60 seconds
                </span>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                  Get your price now.{' '}
                  <span className="text-teal-600">We&apos;ll take it from there.</span>
                </h2>
                <p className="text-slate-600 leading-relaxed">
                  Tell us the service and the size of your home and your price appears straight away. Then a friendly member
                  of our customer care team will <strong className="font-semibold text-slate-800">call or email you</strong> to
                  answer your questions and find a time that suits you.
                </p>
                <ul className="space-y-2 text-sm text-slate-700">
                  {[
                    'Your price on screen in under a minute',
                    'A real person calls or emails you, no chasing needed',
                    'No payment details and no obligation',
                    '10% off your first clean with code FIRST10',
                  ].map((line) => (
                    <li key={line} className="flex gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-600 mt-0.5" aria-hidden />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
                {brandPhone ? (
                  <a
                    href={`tel:${brandPhone.replace(/\s/g, '')}`}
                    className="inline-flex items-center gap-3 rounded-xl border border-teal-200 bg-white px-4 py-3 text-sm shadow-sm transition-colors hover:border-teal-300 hover:bg-teal-50/60"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-white">
                      <Phone className="h-4 w-4" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-slate-500">Prefer to talk now?</span>
                      <span className="block font-bold text-slate-900">Call us on {brandPhone}</span>
                    </span>
                  </a>
                ) : null}
              </div>
              <div className="lg:col-span-3 rounded-2xl border border-slate-100 bg-white p-6 sm:p-8 shadow-sm">
                <QuoteWidget onBookNow={onBookNow} />
              </div>
            </div>
          </section>

          {/* Referral Banner */}
          <section className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
            <div className="rounded-2xl border border-teal-200/80 bg-teal-50/60 p-6 sm:p-8 md:p-10 flex flex-col md:flex-row md:items-center gap-6">
              <div className="flex-1">
                <h3 className="text-2xl font-black text-slate-900">Refer a friend, earn 5%</h3>
                <p className="mt-2 text-slate-700 text-base leading-relaxed">
                  Love our service? Share your referral code and earn 5% credit for every friend who books their first clean.
                </p>
              </div>
              <button
                type="button"
                onClick={onBookNow}
                className="shrink-0 px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm"
              >
                Book &amp; get your code
              </button>
            </div>
          </section>

          {/* Areas we serve — internal links for local SEO */}
          <section className="max-w-7xl mx-auto px-4 lg:px-8 py-12">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Areas we serve</h2>
            <p className="mt-2 text-slate-600">
              Professional, insured cleaners across London and Greater Manchester. Enter your postcode when you book and we will confirm coverage.
            </p>
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { city: 'London', blurb: 'From the City and Westminster to Hackney, Clapham, Ealing and Islington.', match: 'london' },
                { city: 'Manchester', blurb: 'From the city centre and Salford to Didsbury, Chorlton, Prestwich and Ashton.', match: 'manchester' },
              ].map((group) => (
                <div key={group.city} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <h3 className="text-lg font-black text-slate-900">Cleaning in {group.city}</h3>
                  <p className="mt-1 text-sm text-slate-600">{group.blurb}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {Object.entries(AREA_DATA)
                      .filter(([slug]) => slug.endsWith(group.match))
                      .map(([slug, area]) => (
                        <a
                          key={slug}
                          href={`/cleaning-in-${slug}`}
                          className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 hover:border-teal-300 hover:text-teal-700 transition-colors"
                        >
                          {area.name}
                        </a>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {homeAdverts.length > 0 && (
            <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10 md:py-14">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {homeAdverts.map((ad) => {
                  const href = (ad.ctaHref || '').trim() || '/contact-us';
                  const isExternal = /^https?:\/\//i.test(href);
                  return (
                    <article
                      key={ad.id}
                      className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow min-h-[260px] flex flex-col"
                    >
                      {ad.imageUrl?.trim() ? (
                        <div className="h-32 bg-slate-100">
                          <img src={ad.imageUrl} alt="" className="h-full w-full object-cover" />
                        </div>
                      ) : null}
                      <div className="p-6 flex-1 flex flex-col">
                        <h3 className="text-xl font-black text-slate-900 leading-tight">{ad.title}</h3>
                        <p className="mt-3 text-slate-600 text-sm sm:text-base leading-relaxed flex-1">{ad.description}</p>
                        <div className="pt-5">
                          <a
                            href={href}
                            target={isExternal ? '_blank' : undefined}
                            rel={isExternal ? 'noreferrer' : undefined}
                            className="inline-flex items-center rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold px-4 py-2.5 text-sm"
                          >
                            {(ad.ctaLabel || 'Learn more').trim() || 'Learn more'}
                          </a>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}

          <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
            <div className="max-w-3xl">
              <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight">Professional Cleaning You Can Trust</h2>
              <p className="text-slate-600 mt-4 text-base sm:text-lg leading-relaxed">
                At <strong className="text-teal-700">CiN Cleaning</strong>, we provide a full spectrum of cleaning services designed to enhance the appearance of your property and keep your investment in pristine condition. Our fully insured and vetted operatives bring years of experience to every job.
              </p>
              <p className="text-slate-600 mt-4 leading-relaxed">
                We believe in clear communication, eco-friendly industry-tested products, and a 100% satisfaction guarantee. Whether it is a family home, a rental turnover, or a front-of-house that represents your brand, we treat cleanliness as part of how your space feels.
              </p>
            </div>
          </section>

          <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20 bg-slate-50 border-y border-slate-100">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 md:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1 gap-10 md:gap-12">
              {[
                {
                  title: 'Trained & Vetted Operatives',
                  body: 'Our cleaning professionals have extensive experience and are continuously trained to the highest industry standards, ensuring meticulous results every time.',
                },
                {
                  title: 'Agency & Owner Approved',
                  body: 'Our first-class service has built a loyal clientele of homeowners, businesses, and estate agents who trust our end-to-end reliability.',
                },
                {
                  title: 'Cleaned With Confidence',
                  body: 'We arrive with eco-friendly and industry-tested tools in hand. Paired with our absolute satisfaction guarantee, we are fully committed to earning your trust.',
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="p-6 bg-white rounded-2xl shadow-sm border border-slate-100/80 nn-card-lift"
                >
                  <h3 className="text-xl font-black text-slate-900">{item.title}</h3>
                  <p className="text-slate-600 mt-3 leading-relaxed text-sm sm:text-base">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
            <div className="rounded-2xl bg-gradient-to-r from-slate-800 via-slate-800 to-teal-900 text-white p-6 sm:p-8 md:p-12 text-center max-w-4xl mx-auto nn-cta-glow transition-transform duration-500 hover:scale-[1.01]">
              <h3 className="text-2xl md:text-3xl font-black">Ready for a neater space?</h3>
              <p className="text-white/85 mt-3 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
                Start with a booking or compare plans - CiN Cleaning is here to Clean It Neatly, on your schedule.
              </p>
              <div className="flex flex-col sm:flex-row flex-wrap justify-center gap-3 mt-8">
                <button
                  type="button"
                  onClick={onBookNow}
                  className="px-6 py-3 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-bold"
                >
                  Book now
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('pricing')}
                  className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/15 font-bold ring-1 ring-white/35"
                >
                  View pricing
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('contact')}
                  className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/15 font-bold ring-1 ring-white/35"
                >
                  Contact us
                </button>
              </div>
            </div>
          </section>
        </div>
        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </>
    );
  }

  if (page === 'residential') {
    const pillars = [
      { title: 'Residential', desc: 'Bespoke home care with transparent pricing and consistent quality.' },
      { title: 'Commercial', desc: 'Presentation-grade maintenance for offices and client-facing spaces.' },
      { title: 'Specialist', desc: 'Deep, end-of-tenancy, and short-let programmes when standards must be absolute.' },
    ];

    const resHero = content.heroes.find((x) => x.page === 'residential') ?? hero;
    const resHeroImg = resHero?.imageUrl || '/siteshots/residential-a.jpg';

    return (
      <div className="space-y-0">
        <section className={`${SUBMENU_HERO_SECTION} w-full`}>
          <img src={resHeroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 lg:px-8 py-12 md:py-20">
            <div className={SUBMENU_HERO_CAPTION_CARD}>
              <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-400/20 text-teal-200">
                Restoration first
              </span>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.02] sm:leading-[0.95] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                Restore the <span className="text-teal-300">sparkle</span> in your space.
              </h1>
              <p className="text-base sm:text-lg text-white/90 max-w-3xl">
                Meticulous, premium cleaning for homes and workplaces - built around your schedule and your standards.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={onBookNow}
                  className="px-5 py-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm sm:text-base"
                >
                  Schedule a clean
                </button>
                <button
                  type="button"
                  onClick={onBookNow}
                  className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold text-sm sm:text-base ring-1 ring-white/25"
                >
                  View pricing
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="py-14 md:py-20 max-w-7xl mx-auto px-4 lg:px-8">
          <div className="max-w-3xl">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
              Flawless precision tailored for you.
            </h2>
            <p className="text-slate-600 mt-4 text-base sm:text-lg leading-relaxed">
              Our service pillars are meticulously designed to seamlessly fit into your lifestyle and maintain the pristine beauty of your property.
            </p>
          </div>
          <div className="mt-12 divide-y divide-slate-200 border-y border-slate-200">
            {pillars.map((pillar) => (
              <div
                key={pillar.title}
                className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8 py-10 md:py-12 items-start hover:bg-slate-50 transition-colors p-4 -mx-4 rounded-xl"
              >
                <div className="md:col-span-4">
                  <h3 className="text-2xl sm:text-3xl font-black text-slate-900">{pillar.title}</h3>
                </div>
                <div className="md:col-span-8 space-y-4">
                  <p className="text-slate-600 leading-relaxed">{pillar.desc}</p>
                  <ul className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-x-8 text-sm text-slate-800">
                    <li className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-600" aria-hidden />
                      Eco-friendly processes
                    </li>
                    <li className="flex items-center gap-2 font-medium">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-600" aria-hidden />
                      Fully insured teams
                    </li>
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="py-14 md:py-20 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <h2 className="text-3xl sm:text-4xl font-black text-slate-900 tracking-tight max-w-3xl">
              Home cleaning for every stage - standard, deep, and end of tenancy
            </h2>
            <p className="text-slate-600 mt-4 text-base sm:text-lg max-w-3xl leading-relaxed">
              Whether you need a reliable weekly reset, a full-property deep clean, or a checkout-ready handover, we scope the visit to match your property and your deadline.
            </p>
            <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 md:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1 gap-8">
              <article className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
                <h3 className="text-lg font-black text-slate-900">Standard &amp; general cleaning</h3>
                <p className="text-slate-600 mt-3 text-sm leading-relaxed">
                  Regular upkeep for busy households: kitchens and bathrooms sanitised, surfaces dusted, floors vacuumed and mopped, bins emptied, and high-traffic areas kept guest-ready. Ideal for weekly, fortnightly, or monthly visits when you want consistency without the admin.
                </p>
              </article>
              <article className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
                <h3 className="text-lg font-black text-slate-900">Deep cleaning</h3>
                <p className="text-slate-600 mt-3 text-sm leading-relaxed">
                  A detail-led reset when the property needs more than a surface tidy - think skirting boards, inside cupboards, appliances, bathroom limescale, and those corners that rarely get attention. Perfect before guests, after renovations, or when you want the space to feel truly refreshed.
                </p>
              </article>
              <article className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
                <h3 className="text-lg font-black text-slate-900">End of tenancy</h3>
                <p className="text-slate-600 mt-3 text-sm leading-relaxed">
                  Structured to support inventory and deposit handovers: kitchens, ovens, bathrooms, floors, and fixtures brought up to a fair, documented standard. Tell us your checkout date - we will align the team and the hours to your agency or landlord requirements.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Add extras to any visit</h2>
            <p className="text-slate-600 mt-3 max-w-3xl leading-relaxed">
              When you book online, you can layer <strong className="text-slate-800">extra cleaning tasks</strong> on top of your core service - picked from the same catalogue our team uses every day. Below is a sample of what is often available (your live booking flow always shows current options and prices).
            </p>
            {extraServiceSamples.length > 0 ? (
              <ul className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {extraServiceSamples.map((ex) => (
                  <li
                    key={ex.id}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 flex flex-col justify-between shadow-sm"
                  >
                    <span className="font-bold text-slate-900 text-sm">{ex.name}</span>
                    <span className="text-teal-700 font-black text-sm mt-2">
                      {ex.type === 'hourly' ? 'From ' : ''}£{Number(ex.price).toFixed(2)}
                      {ex.type === 'hourly' ? '/hr' : ex.type === 'range' ? '+' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="mt-8 flex flex-wrap gap-3 text-sm text-slate-700">
                {['Oven cleaning', 'Inside fridge', 'Interior windows', 'Ironing bundle', 'Carpet spot treatment', 'After-party reset'].map((label) => (
                  <li key={label} className="rounded-full border border-slate-200 bg-white px-4 py-2 font-semibold">
                    {label}
                  </li>
                ))}
              </ul>
            )}
            <p className="text-slate-500 text-sm mt-6">
              Extras are subject to availability and property access. Combine them with standard, deep, or end-of-tenancy visits in the booking flow.
            </p>
            <button
              type="button"
              onClick={onBookNow}
              className="mt-6 px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm"
            >
              Start a booking &amp; choose extras
            </button>
          </div>
        </section>

        <section className="relative w-full bg-[#4f678b] text-white py-14 md:py-20 px-4 sm:px-6 md:px-10">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <h3 className="text-3xl sm:text-4xl font-black">What our clients feel.</h3>
              <blockquote className="mt-6 text-lg sm:text-xl text-white/90 leading-relaxed border-l-4 border-teal-300 pl-6">
                CiN Cleaning transformed our residence with gallery-worthy sparkle. Their attention to detail can be seen and felt.
              </blockquote>
              <p className="mt-6 text-sm font-bold uppercase tracking-widest text-white/70">Johnson family, Urban Residences</p>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <img
                src="/siteshots/residential-a.jpg"
                alt=""
                className="w-full aspect-[4/3] object-cover"
              />
              <img
                src="/siteshots/residential-b.jpg"
                alt=""
                className="w-full aspect-[4/3] object-cover"
              />
            </div>
          </div>
        </section>

        <section className="py-14 md:py-20 bg-slate-50">
          <div className="max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-start">
            <div>
              <h3 className="text-3xl sm:text-4xl font-black text-slate-900">Reach out.</h3>
              <p className="text-slate-600 mt-4 text-base leading-relaxed max-w-md">
                Ready for an architectural refresh? Tell us about your property and timeline - we will follow up with next steps.
              </p>
              <dl className="mt-8 space-y-4 text-sm sm:text-base text-slate-800">
                {brandPhone ? (
                  <div>
                    <dt className="text-[11px] font-black uppercase tracking-widest text-slate-500">Direct line</dt>
                    <dd className="mt-1 font-semibold">
                      <a href={`tel:${brandPhone.replace(/\s/g, '')}`} className="hover:text-teal-700 transition-colors">
                        {brandPhone}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {brandEmail ? (
                  <div>
                    <dt className="text-[11px] font-black uppercase tracking-widest text-slate-500">Email</dt>
                    <dd className="mt-1 font-semibold">
                      <a href={`mailto:${encodeURIComponent(brandEmail)}`} className="hover:text-teal-700 transition-colors break-all">
                        {brandEmail}
                      </a>
                    </dd>
                  </div>
                ) : null}
                {brandAddress ? (
                  <div>
                    <dt className="text-[11px] font-black uppercase tracking-widest text-slate-500">Headquarters</dt>
                    <dd className="mt-1 font-semibold whitespace-pre-line">{brandAddress}</dd>
                  </div>
                ) : null}
                {!brandPhone && !brandEmail && !brandAddress ? (
                  <p className="text-slate-500 text-sm">Contact details from your business profile will appear here when available.</p>
                ) : null}
              </dl>
            </div>
            <form
              className="space-y-4 max-w-xl lg:max-w-none"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const fd = new FormData(form);
                const ok = await submitSupportContact({
                  name: String(fd.get('name') ?? '').trim(),
                  email: String(fd.get('email') ?? '').trim(),
                  serviceType: String(fd.get('serviceType') ?? '').trim(),
                  message: String(fd.get('message') ?? '').trim(),
                });
                if (ok) {
                  form.reset();
                  setContactSent(true);
                  setTimeout(() => setContactSent(false), 4000);
                }
              }}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <input name="name" required className="w-full p-3 rounded-lg border border-slate-200 bg-white text-slate-900" placeholder="Full name" />
                <input
                  name="email"
                  required
                  type="email"
                  className="w-full p-3 rounded-lg border border-slate-200 bg-white text-slate-900"
                  placeholder="Email address"
                />
              </div>
              <input name="serviceType" className="w-full p-3 rounded-lg border border-slate-200 bg-white text-slate-900" placeholder="Service type" />
              <textarea
                name="message"
                required
                className="w-full p-3 rounded-lg border border-slate-200 bg-white text-slate-900 min-h-[120px] resize-y"
                placeholder="Your message"
              />
              {contactError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700" role="alert">
                  {contactError}
                </div>
              )}
              {contactSent && !contactError && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">
                  Thanks! Your message has been sent — our team will get back to you shortly.
                </div>
              )}
              <button
                type="submit"
                disabled={contactSubmitting}
                className="w-full sm:w-auto px-8 py-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {contactSubmitting ? 'Sending…' : contactSent ? 'Message sent' : 'Request my bespoke quote'}
              </button>
            </form>
          </div>
        </section>

        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  if (page === 'standardCleaning') {
    const stdHeroImg = content.heroes.find((x) => x.page === 'residential')?.imageUrl || '/siteshots/residential-a.jpg';
    const included = [
      'Vacuuming and mopping all floors',
      'Kitchen surfaces, sink, and hob wiped down',
      'Bathroom cleaned and sanitised',
      'Dusting all surfaces and accessible areas',
      'Bins emptied and relined',
      'Mirrors and glass surfaces polished',
      'Beds made and cushions straightened',
      'Tidying and general organisation',
    ];

    return (
      <div className="space-y-0">
        <section className={SUBMENU_HERO_SECTION}>
          <img src={stdHeroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-10 py-12 md:py-20">
            <div className={SUBMENU_HERO_CAPTION_CARD}>
              <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-400/20 text-teal-200">
                Regular service
              </span>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black leading-[1.05] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                General / Standard Cleaning
              </h1>
              <p className="text-xl sm:text-2xl md:text-3xl font-black text-teal-200 max-w-3xl leading-tight">
                &ldquo;Consistent, reliable cleaning - so you don&apos;t have to think about it.&rdquo;
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={onBookNow}
                  className="px-5 py-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm sm:text-base"
                >
                  Book a clean
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('pricing')}
                  className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold text-sm sm:text-base ring-1 ring-white/25"
                >
                  View pricing
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="max-w-3xl space-y-4">
            <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
              Sometimes all you need is a dependable, thorough clean to keep your home or workspace fresh. CiN Cleaning&apos;s standard cleaning service is perfect for regular weekly, fortnightly, or monthly upkeep - maintaining the cleanliness you deserve without the hassle of doing it yourself.
            </p>
            <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
              Our cleaners are friendly, vetted, and punctual. They arrive with everything needed to get the job done properly, and work through a structured routine so nothing is ever missed. Over time, your regular cleaner gets to know your home and your preferences - building a relationship built on trust, consistency, and care.
            </p>
          </div>
        </section>

        <section className="py-14 md:py-20 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">What&apos;s included</h2>
            <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {included.map((line) => (
                <li key={line} className="flex gap-3 text-slate-800">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-teal-600 mt-0.5" aria-hidden />
                  <span className="font-medium leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="max-w-3xl rounded-2xl border border-teal-200/80 bg-teal-50/60 p-6 sm:p-8 md:p-10">
            <p className="text-slate-700 text-base sm:text-lg leading-relaxed">
              Book a one-off clean or set up a recurring schedule. Discounts available for regular bookings. Serving London and Manchester.
            </p>
            <button
              type="button"
              onClick={onBookNow}
              className="mt-6 px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm"
            >
              Start a booking
            </button>
          </div>
        </section>

        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  if (page === 'deepCleaning') {
    const deepHeroImg = content.heroes.find((x) => x.page === 'residential')?.imageUrl || '/siteshots/residential-a.jpg';
    const inclusions = [
      'Skirting boards, door frames, and radiators dusted and finished',
      'Kitchen degrease: hobs, splashbacks, cupboard fronts, and appliance exteriors',
      'Bathrooms: limescale removal, silicone and grout lines, fixtures polished',
      'Inside cupboards and wardrobes where emptied or agreed in advance',
      'Floors vacuumed and mopped; carpets edged and detailed',
      'Interior glass, sills, and high-touch surfaces sanitised',
    ];

    return (
      <div className="space-y-0">
        <section className={SUBMENU_HERO_SECTION}>
          <img src={deepHeroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-10 py-12 md:py-20">
            <div className={SUBMENU_HERO_CAPTION_CARD}>
              <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-400/20 text-teal-200">
                Residential · Deep clean
              </span>
              <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[1.02] sm:leading-[0.95] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                Below the surface. <span className="text-teal-300">Above the standard.</span>
              </h1>
              <p className="text-base sm:text-lg text-white/90 max-w-3xl">
                When your home needs more than a surface tidy - move-ins, post-renovation dust, or a full reset before guests - we clean with a checklist mindset, not a stopwatch shortcut.
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={onBookNow}
                  className="px-5 py-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm sm:text-base"
                >
                  Book a deep clean
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('residential')}
                  className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold text-sm sm:text-base ring-1 ring-white/25"
                >
                  All residential services
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="max-w-3xl">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight">
              Detail-led cleaning that reaches the corners a routine visit can miss.
            </h2>
            <p className="text-slate-600 mt-4 text-base sm:text-lg leading-relaxed">
              <strong className="text-slate-800">CiN Cleaning</strong> deep cleans are for homes that need a thorough reset: kitchens degreased, bathrooms descaled, and every ledge and fitting brought to a consistent finish. We align hours and team size to your floor plan so the job is never rushed.
            </p>
            <p className="text-slate-600 mt-4 text-base sm:text-lg leading-relaxed">
              You get the same vetted, insured operatives we deploy across our residential programme - with clear confirmation of scope before we arrive, and products suited to your surfaces.
            </p>
          </div>
        </section>

        <section className="py-14 md:py-20 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Tailored inclusions</h2>
            <p className="text-slate-600 mt-3 max-w-2xl leading-relaxed">
              Exact tasks follow your property and booking notes - this is how we think about a CiN deep clean.
            </p>
            <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {inclusions.map((line) => (
                <li key={line} className="flex gap-3 text-slate-800">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-teal-600 mt-0.5" aria-hidden />
                  <span className="font-medium leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="max-w-3xl rounded-2xl border border-teal-200/80 bg-teal-50/60 p-6 sm:p-8 md:p-10">
            <h3 className="text-xl font-black text-slate-900">London &amp; Manchester coverage</h3>
            <p className="text-slate-600 mt-3 leading-relaxed">
              CiN Cleaning serves homes across the capital and Greater Manchester - with routing designed to keep arrival times dependable. Share your postcode when you book and we will confirm service area and access expectations.
            </p>
          </div>
        </section>

        <section className="py-14 md:py-20 bg-slate-900 text-white">
          <div className="max-w-3xl mx-auto px-4 lg:px-8">
            <p className="text-[11px] font-black uppercase tracking-widest text-teal-300">Trust</p>
            <h3 className="text-2xl sm:text-3xl font-black mt-2">We stand behind every deep clean</h3>
            <p className="text-white/85 mt-4 leading-relaxed">
              If something was missed against the agreed scope, tell us within <strong className="text-white">72 hours</strong> and we will put it right. Your space should feel unmistakably refreshed - not &ldquo;almost done.&rdquo;
            </p>
          </div>
        </section>

        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  if (page === 'endOfTenancy') {
    const eotHeroImg = content.heroes.find((x) => x.page === 'residential')?.imageUrl || '/siteshots/residential-a.jpg';
    const included = [
      'Full kitchen deep clean including all appliances',
      'Oven, grill, and extractor professionally degreased',
      'Bathroom and en-suite sanitisation and descaling',
      'All cupboards and drawers cleaned inside and out',
      'Skirting boards, doors, and switches wiped down',
      'Windows, sills, and tracks cleaned throughout',
      'Carpets vacuumed; carpet steam cleaning available',
      'Walls spot-cleaned for marks and scuffs',
    ];

    return (
      <div className="space-y-0">
        <section className={SUBMENU_HERO_SECTION}>
          <img src={eotHeroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-10 py-12 md:py-20">
            <div className={SUBMENU_HERO_CAPTION_CARD}>
              <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-400/20 text-teal-200">
                Residential · End of tenancy
              </span>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black leading-[1.05] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                End of Tenancy Cleaning
              </h1>
              <p className="text-xl sm:text-2xl md:text-3xl font-black text-teal-200 max-w-3xl leading-tight">
                &ldquo;Leave without a trace - and take your full deposit with you.&rdquo;
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={onBookNow}
                  className="px-5 py-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm sm:text-base"
                >
                  Book end of tenancy clean
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('residential')}
                  className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold text-sm sm:text-base ring-1 ring-white/25"
                >
                  All residential services
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="max-w-3xl space-y-4">
            <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
              Moving out is stressful enough. The last thing you need is a deduction from your deposit over a dirty oven or a grimy bathroom. CiN Cleaning&apos;s end of tenancy service is specifically designed to meet - and exceed - the standards required by landlords and letting agents across London and Manchester.
            </p>
            <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
              We follow a comprehensive, industry-standard checklist that covers every room from ceiling to floor. Our teams are experienced with inventory clerk expectations and understand exactly what inspectors look for. We work efficiently to fit around your move-out schedule, leaving the property immaculate and ready for its next occupants.
            </p>
          </div>
        </section>

        <section className="py-14 md:py-20 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">What&apos;s included</h2>
            <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {included.map((line) => (
                <li key={line} className="flex gap-3 text-slate-800">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-teal-600 mt-0.5" aria-hidden />
                  <span className="font-medium leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="max-w-3xl rounded-2xl border border-teal-200/80 bg-teal-50/60 p-6 sm:p-8 md:p-10">
            <h3 className="text-xl font-black text-slate-900">London &amp; Manchester</h3>
            <p className="text-slate-600 mt-3 leading-relaxed">
              We route teams across the capital and Greater Manchester so your checkout slot stays realistic. Tell us your address, key collection, and deadline when you book - we align the hours to your handover.
            </p>
          </div>
        </section>

        <section className="py-14 md:py-20 bg-slate-900 text-white">
          <div className="max-w-3xl mx-auto px-4 lg:px-8">
            <p className="text-[11px] font-black uppercase tracking-widest text-teal-300">Trust</p>
            <h3 className="text-2xl sm:text-3xl font-black mt-2">72-hour re-clean guarantee</h3>
            <p className="text-white/85 mt-4 leading-relaxed">
              If an item on the agreed end-of-tenancy scope was missed, contact us within <strong className="text-white">72 hours</strong> of completion and we will return to address it - so you can hand back keys with confidence.
            </p>
          </div>
        </section>

        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  if (page === 'pricing') {
    const pc = pricingCfg;
    const calc = pc.calculator;
    const estimate = computePricingEstimate(calc, frequencyId, serviceLength, hoursPerVisit);
    const perks = ['Insured & Vetted', 'Quality Guaranteed', 'Flexible Booking'];
    const unit = calc.durationUnitLabel || 'Hours';
    const freqCols = Math.min(3, Math.max(1, calc.frequencies.length));
    const showCommitmentSlider =
      calc.formula !== 'cin_tiered_hourly' || frequencyId === 'fortnightly';

    return (
      <div className="space-y-12 pt-12">
        <section className="space-y-3 max-w-7xl mx-auto px-4 lg:px-8">
          <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-50 text-teal-700">
            {pc.eyebrow}
          </span>
          <h1 className="text-5xl md:text-6xl font-black tracking-tight text-slate-900">{pc.title}</h1>
          <p className="text-slate-600 max-w-2xl whitespace-pre-wrap">{pc.subtitle}</p>
        </section>

        <section className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start max-w-7xl mx-auto px-4 lg:px-8">
          <div className="xl:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {pc.plans.map((p) => (
              <article
                key={p.id}
                className={`bg-white rounded-2xl border p-5 min-h-[210px] flex flex-col ${p.popular ? 'border-teal-500 shadow-md' : 'border-slate-100'}`}
              >
                {p.popular ? (
                  <div className="self-start text-[11px] sm:text-xs font-black uppercase tracking-widest px-2 py-1 rounded-full bg-teal-600 text-white mb-2">
                    {pc.popularBadgeLabel}
                  </div>
                ) : <div className="h-5" />}
                <p className="text-[11px] sm:text-xs text-slate-400 font-black uppercase tracking-widest">{p.label}</p>
                <p className="text-5xl leading-none font-black text-slate-900 mt-2">£{p.price}</p>
                <p className="text-sm text-slate-500 mt-3 flex-1">{p.note}</p>
                <button onClick={onBookNow} className={`mt-4 py-3 rounded-xl font-bold ${p.popular ? 'bg-teal-700 text-white hover:bg-teal-800' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                  {pc.selectPlanButtonLabel}
                </button>
              </article>
            ))}
          </div>

          <aside className="bg-teal-800 text-white rounded-2xl p-6 border border-teal-700 shadow-xl">
            <h3 className="text-2xl font-black mb-5">{calc.title}</h3>

            <div className="space-y-2 mb-5">
              <p className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-teal-100">{calc.frequencySectionLabel}</p>
              <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${freqCols}, minmax(0, 1fr))` }}>
                {calc.frequencies.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setFrequencyId(f.id);
                      if (f.id === 'fortnightly' && calc.formula === 'cin_tiered_hourly') {
                        setServiceLength(calc.serviceLengthDefault);
                      }
                    }}
                    className={`py-2 rounded-lg text-xs font-black ${frequencyId === f.id ? 'bg-white text-teal-800' : 'bg-teal-700 text-white'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-5">
              {showCommitmentSlider && (
                <div>
                  <div className="flex justify-between text-sm font-bold mb-2">
                    <span>{calc.serviceLengthLabel}</span>
                    <span>
                      {calc.formula === 'cin_tiered_hourly' && frequencyId === 'fortnightly'
                        ? `${serviceLength} months`
                        : `${serviceLength} ${unit}`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={calc.serviceLengthMin}
                    max={calc.serviceLengthMax}
                    step={calc.serviceLengthStep}
                    value={Math.min(calc.serviceLengthMax, Math.max(calc.serviceLengthMin, serviceLength))}
                    onChange={(e) => setServiceLength(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              )}
              <div>
                <div className="flex justify-between text-sm font-bold mb-2">
                  <span>{calc.hoursPerVisitLabel}</span>
                  <span>{hoursPerVisit.toFixed(1)} {unit}</span>
                </div>
                <input
                  type="range"
                  min={calc.hoursPerVisitMin}
                  max={calc.hoursPerVisitMax}
                  step={calc.hoursPerVisitStep}
                  value={Math.min(calc.hoursPerVisitMax, Math.max(calc.hoursPerVisitMin, hoursPerVisit))}
                  onChange={(e) => setHoursPerVisit(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            <div className="mt-7 text-center">
              <p className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-teal-100">{calc.estimateLabel}</p>
              <p className="text-5xl font-black mt-2">
                {calc.estimatePrefix}
                {estimate.toFixed(calc.decimalPlaces)}
              </p>
              <p className="text-xs text-teal-100">{calc.estimateSuffix}</p>
            </div>

            <button type="button" onClick={onBookNow} className="w-full mt-6 py-3 rounded-xl bg-white text-teal-800 font-black hover:bg-teal-50">
              {calc.bookButtonLabel}
            </button>
          </aside>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 rounded-[1.75rem] bg-gradient-to-r from-slate-600 to-blue-700 text-white p-6 md:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-5">
          <div>
            <h3 className="text-3xl font-black">Short-Let Cleaning</h3>
            <p className="text-white/85 mt-2 max-w-2xl">Airbnb, Booking.com, or private rentals? We provide rapid turnover services, laundry management, and professional restocking.</p>
            <button onClick={onBookNow} className="mt-4 px-5 py-3 rounded-xl bg-white text-slate-800 font-bold hover:bg-slate-100">Custom Quote</button>
          </div>
          <div className="bg-white/10 border border-white/20 rounded-xl p-4 min-w-[220px]">
            <p className="font-bold">Guest Management</p>
            <p className="font-bold mt-2">Linen Services</p>
          </div>
        </section>

        <section className="text-center max-w-7xl mx-auto px-4 lg:px-8">
          <h3 className="text-5xl font-black text-slate-900">Why choose CiN?</h3>
          <div className="w-16 h-1 bg-teal-700 mx-auto mt-3 rounded-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 md:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1 gap-8 mt-10">
            {perks.map((p) => (
              <div key={p} className="space-y-2">
                <div className="w-10 h-10 rounded-full bg-teal-50 text-teal-700 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <h4 className="font-black text-xl text-slate-900">{p}</h4>
                <p className="text-slate-500 text-sm">Every cleaner is vetted and our service quality is continuously monitored.</p>
              </div>
            ))}
          </div>
        </section>

        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  if (page === 'airbnbShortLet') {
    const heroImg = '/siteshots/airbnb-short-let-hero.jpg';
    const included = [
      'Full property clean and refresh between guests',
      'Fresh linen changeover (linen supply available)',
      'Bathroom and kitchen deep sanitisation',
      'Restocking of guest essentials (toiletries, tea, coffee)',
      'Dishes washed and kitchen reset',
      'Rubbish removed and bins emptied',
      'Damage and inventory check with photo report',
      'Welcome setup (optional) for arriving guests',
    ];

    return (
      <div className="space-y-0">
        <section className={SUBMENU_HERO_SECTION}>
          <img src={heroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="relative z-10 max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 safe-area-px py-12 md:py-20">
            <div className={SUBMENU_HERO_CAPTION_CARD}>
              <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-400/20 text-teal-200">
                Commercial · Short-let
              </span>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black leading-[1.05] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                Airbnb &amp; Short-Let Cleaning
              </h1>
              <p className="text-xl sm:text-2xl md:text-3xl font-black text-teal-200 max-w-3xl leading-tight">
                &ldquo;Five-star reviews start with a five-star clean.&rdquo;
              </p>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={onBookNow}
                  className="px-5 py-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm sm:text-base"
                >
                  Book a turnover
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('commercial')}
                  className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold text-sm sm:text-base ring-1 ring-white/25"
                >
                  All commercial services
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="max-w-3xl space-y-4">
            <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
              As an Airbnb host or short-let landlord, your reviews live and die by the presentation of your property. Guests notice everything - a smear on the mirror, a hair in the shower, a stain on the cushion cover. CiN Cleaning takes the pressure off you entirely, delivering hotel-quality turnarounds between every stay.
            </p>
            <p className="text-slate-600 text-base sm:text-lg leading-relaxed">
              We understand the time-sensitive nature of short-let hosting. Our teams are available 7 days a week, including bank holidays, and work to your check-in and check-out schedule. We&apos;ll have your property guest-ready before your next booking - fresh, fragrant, and flawless.
            </p>
          </div>
        </section>

        <section className="py-14 md:py-20 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">What&apos;s included</h2>
            <ul className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {included.map((line) => (
                <li key={line} className="flex gap-3 text-slate-800">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-teal-600 mt-0.5" aria-hidden />
                  <span className="font-medium leading-relaxed">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="max-w-3xl rounded-2xl border border-teal-200/80 bg-teal-50/60 p-6 sm:p-8 md:p-10">
            <p className="text-slate-700 text-base sm:text-lg leading-relaxed">
              We integrate with your hosting calendar - just share your check-in/check-out dates and we handle the rest. Available across London and Manchester.
            </p>
            <button
              type="button"
              onClick={onBookNow}
              className="mt-6 px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm"
            >
              Schedule a turnover
            </button>
          </div>
        </section>

        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  if (page === 'commercial') {
    const sectors = [
      {
        eyebrow: 'Office & corporate',
        title: 'High-performance workspaces',
        desc: 'From startup suites to enterprise premises, our processes maintain professional-grade presentation.',
        bullets: ['After-hours service windows', 'Compliance-focused checklists'],
      },
      {
        eyebrow: 'Hospitality & food',
        title: 'Clinical kitchens. Elegant dining.',
        desc: 'Food-safe cleaning and polished front-of-house detailing for venues where first impressions matter.',
        bullets: ['Kitchen deep protocols', 'Guest-facing polish'],
      },
      {
        eyebrow: 'Mixed-use & public',
        title: 'Lobby to loft excellence',
        desc: 'Visual-first maintenance for high-traffic public areas and multi-tenant sites.',
        bullets: ['Reception & circulation', 'Scheduled quality audits'],
      },
    ];
    const detailTags = ['Air quality', 'Desk detailing', 'Washrooms', 'Floor care'];

    const commercialProgrammes = [
      {
        title: 'Airbnb, Booking.com & short-lets',
        body:
          'Guest-ready turnovers between stays: full reset cleans, kitchen and bathroom sanitation, linen hand-offs where agreed, and a repeatable checklist so reviews stay consistent. We align with your check-in and check-out windows and coordinate secure access.',
      },
      {
        title: 'Offices & workplaces',
        body:
          'Presentation-grade care for desk areas, meeting rooms, kitchens, and washrooms - scheduled around your team. Choose early mornings, evenings, or weekends; we support single sites or multi-location contracts with clear points of contact.',
      },
      {
        title: 'Events, retail & venue reset',
        body:
          'Pre-event polish and post-event clear-down for launches, conferences, pop-ups, and seasonal peaks. We work to your run-of-show timings so spaces are ready for doors-open, and safely reset once guests have left.',
      },
    ];

    const commercialHeroImage =
      (hero.imageUrl && String(hero.imageUrl).trim()) || '/siteshots/commercial-reference-new.jpg';

    const commercialH1 = (() => {
      const t =
        hero.title?.trim() ||
        'Immaculate spaces that inspire confidence.';
      const hi = hero.highlight?.trim();
      if (hi && t.includes(hi)) {
        const i = t.indexOf(hi);
        return (
          <>
            {t.slice(0, i)}
            <span className="text-teal-700">{hi}</span>
            {t.slice(i + hi.length)}
          </>
        );
      }
      return t;
    })();

    return (
      <div className="space-y-0">
        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10 md:py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="space-y-6 order-2 lg:order-1">
            <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase text-blue-700">
              {hero.eyebrow?.trim() || 'Commercial Professionalism'}
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.02] sm:leading-[0.95] text-slate-900">
              {commercialH1}
            </h1>
            <p className="text-slate-600 text-base sm:text-lg max-w-xl leading-relaxed">
              {hero.subtitle?.trim() ||
                'Reflect the quality of your brand with fully insured, DBS-checked operatives - from short-let apartments and corporate offices to event venues and high-street retail. Tell us how you operate; we will match the schedule, scope, and reporting you need.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="px-5 py-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm sm:text-base"
              >
                {hero.ctaPrimary?.trim() || 'Onsite quote'}
              </button>
              <button
                type="button"
                onClick={onBookNow}
                className="px-5 py-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm sm:text-base"
              >
                {hero.ctaSecondary?.trim() || 'Book online'}
              </button>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <img
              src={commercialHeroImage}
              alt=""
              className="w-full aspect-[4/3] lg:aspect-auto lg:h-[min(420px,50vh)] object-cover rounded-2xl shadow-2xl hover:scale-[1.02] transition-transform duration-500"
            />
          </div>
        </section>

        <section className="py-14 md:py-20 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 max-w-3xl">
              Short-lets, desks, and events - one team, scoped to your site
            </h2>
            <p className="text-slate-600 mt-3 max-w-3xl leading-relaxed">
              Below are three of the ways businesses use CiN every week. If your footprint is larger, split across sites, or tied to a fixed event date, we will still scope it properly - start online or ask us for an <strong className="text-slate-800">onsite visit</strong> so we can measure access, risk, and hours accurately.
            </p>
            <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 md:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1 gap-8">
              {commercialProgrammes.map((prog) => (
                <article key={prog.title} className="rounded-2xl bg-white border border-slate-200 p-6 shadow-sm">
                  <h3 className="text-lg font-black text-slate-900 leading-snug">{prog.title}</h3>
                  <p className="text-slate-600 mt-3 text-sm leading-relaxed">{prog.body}</p>
                </article>
              ))}
            </div>
            <div className="mt-10 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="px-5 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm"
              >
                Contact us for an onsite quote
              </button>
              <button type="button" onClick={onBookNow} className="px-5 py-3 rounded-xl bg-white border border-slate-200 text-slate-800 font-bold text-sm hover:bg-slate-50">
                Start with an online booking
              </button>
            </div>
          </div>
        </section>

        <section className="py-14 md:py-20 border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <div className="max-w-3xl mx-auto text-center lg:mx-0 lg:text-left lg:max-w-none mb-12 md:mb-16">
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900">Tailored solutions for every sector</h2>
              <p className="text-slate-600 mt-4 text-base sm:text-lg max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                Every operation demands unique attention. With a 24/7 support framework and our unwavering excellence, we seamlessly integrate into your workflow to preserve your commercial investment.
              </p>
            </div>
          </div>

          <div className="space-y-16 md:space-y-24">
            <div className="max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">{sectors[0].eyebrow}</p>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">{sectors[0].title}</h3>
                <p className="text-slate-600 mt-4 leading-relaxed">{sectors[0].desc}</p>
                <ul className="mt-6 space-y-3 text-sm text-slate-800">
                  {sectors[0].bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-700 mt-0.5" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
              </div>
              <img src="/siteshots/commercial.jpg" alt="" className="w-full aspect-[16/10] object-cover" />
            </div>

            <div className="relative w-full bg-[#4b678f] text-white py-14 md:py-20 px-4 sm:px-6 md:px-10">
              <div className="max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-widest text-teal-100/90">{sectors[1].eyebrow}</p>
                  <h3 className="text-2xl sm:text-3xl font-black mt-2">{sectors[1].title}</h3>
                  <p className="text-white/85 mt-4 leading-relaxed">{sectors[1].desc}</p>
                  <ul className="mt-6 space-y-3 text-sm text-white/90">
                    {sectors[1].bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" aria-hidden />
                        {b}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={onBookNow}
                    className="mt-8 px-5 py-3 rounded-lg bg-white text-[#4b678f] font-bold hover:bg-teal-50"
                  >
                    Hospitality plan
                  </button>
                </div>
                <img src="/siteshots/residential-b.jpg" alt="" className="w-full aspect-[4/3] object-cover opacity-95" />
              </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-start">
              <img src="/siteshots/residential-c.jpg" alt="" className="w-full aspect-[4/3] object-cover" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">{sectors[2].eyebrow}</p>
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900 mt-2">{sectors[2].title}</h3>
                <p className="text-slate-600 mt-4 leading-relaxed">{sectors[2].desc}</p>
                <ul className="mt-6 space-y-3 text-sm text-slate-800">
                  {sectors[2].bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-teal-700 mt-0.5" aria-hidden />
                      {b}
                    </li>
                  ))}
                </ul>
                <div className="mt-8 pt-8 border-t border-slate-200">
                  <h4 className="text-xl font-black text-slate-900">Precision details</h4>
                  <p className="text-slate-600 mt-2 text-sm sm:text-base leading-relaxed">
                    From HQ receptions to multi-floor offices, we run a repeatable system that protects brand presentation.
                  </p>
                  <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-slate-800">
                    {detailTags.map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-teal-600" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => onNavigate('contact')}
                    className="mt-8 px-5 py-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold"
                  >
                    Request an onsite visit &amp; quote
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative bg-[#4b678f] text-white py-14 md:py-20 text-center">
          <div className="max-w-3xl mx-auto px-4 lg:px-8">
            <h3 className="text-3xl sm:text-4xl font-black">Ready to elevate your environment?</h3>
            <p className="text-white/85 mt-4 text-base sm:text-lg leading-relaxed">
              Prefer a fixed price you can take to the board? <strong className="text-white">Contact us for an onsite quote</strong> - we will walk the site, note access and risk, then send a proposal. You can still book routine services online anytime.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
              <button
                type="button"
                onClick={() => onNavigate('contact')}
                className="px-6 py-3 rounded-lg bg-teal-500 hover:bg-teal-400 text-white font-bold"
              >
                Request an onsite quote
              </button>
              <button type="button" onClick={onBookNow} className="px-6 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold ring-1 ring-white/35">
                Book online
              </button>
            </div>
          </div>
        </section>

        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  if (page === 'about') {
    const aboutHeroImage =
      (hero.imageUrl && String(hero.imageUrl).trim()) || '/siteshots/about-reference-new.jpg';

    const aboutH1 = (() => {
      const t = hero.title?.trim() || 'Your vision, perfectly clean';
      const hi = hero.highlight?.trim();
      if (hi && t.includes(hi)) {
        const i = t.indexOf(hi);
        return (
          <>
            {t.slice(0, i)}
            <span className="text-teal-700">{hi}</span>
            {t.slice(i + hi.length)}
          </>
        );
      }
      return t;
    })();

    return (
      <div className="space-y-0">
        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10 md:py-16 lg:py-20 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div className="space-y-6 order-2 lg:order-1">
            <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase text-teal-700">
              {hero.eyebrow?.trim() || 'Trusted Experts'}
            </span>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black leading-[1.02] sm:leading-[0.95] text-slate-900">{aboutH1}</h1>
            <p className="text-slate-600 text-base sm:text-lg max-w-xl leading-relaxed">
              {hero.subtitle?.trim() ||
                'Started from a passion for pristine environments, CiN Cleaning is a family-ethos business providing professional, accountable, and guaranteed cleaning services.'}
            </p>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={onBookNow} className="px-5 py-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold">
                {hero.ctaPrimary?.trim() || 'Book your refresh'}
              </button>
              <button type="button" onClick={onBookNow} className="px-5 py-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold">
                {hero.ctaSecondary?.trim() || 'View more'}
              </button>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <img
              src={aboutHeroImage}
              alt=""
              className="w-full aspect-[4/3] lg:aspect-auto lg:h-[min(420px,50vh)] object-cover rounded-2xl shadow-xl hover:-translate-y-2 transition-transform duration-500"
            />
          </div>
        </section>

        <section className="py-14 md:py-20 border-t border-slate-200">
          <div className="max-w-7xl mx-auto px-4 lg:px-8 flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-12 md:mb-16">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 max-w-xl">A complete clean for every space</h2>
            <p className="text-slate-600 text-base max-w-md md:text-right">Whether it is your family home or a client-facing office, we deliver uncompromising quality driven by our core company values.</p>
          </div>

          <div className="divide-y divide-slate-200 border-t border-slate-200">
            <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12 md:py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
              <div className="lg:col-span-5">
                <h3 className="text-2xl sm:text-3xl font-black text-slate-900">Regular residential cleaning</h3>
                <p className="text-slate-600 mt-4 leading-relaxed">
                  Weekly, fortnightly, and monthly programmes built around your home routine - not ours.
                </p>
                <p className="mt-6 text-sm font-semibold text-slate-800">
                  <span className="text-slate-400 font-normal">Cadence: </span>
                  Weekly · Fortnightly · Monthly
                </p>
                <button type="button" onClick={onBookNow} className="mt-8 px-5 py-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold">
                  Book now
                </button>
              </div>
              <div className="lg:col-span-7 lg:pl-8 lg:border-l border-slate-200">
                <img src="/siteshots/residential-a.jpg" alt="" className="w-full aspect-[16/10] object-cover" />
              </div>
            </div>

            <div className="relative bg-[#4b678f] text-white py-12 md:py-16 px-4 sm:px-6 md:px-10">
              <div className="max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
                <div>
                  <h3 className="text-2xl sm:text-3xl font-black">Professional ironing</h3>
                  <p className="text-white/85 mt-4 leading-relaxed">
                    Structured fabric care with premium finishing - ideal for busy households and professionals.
                  </p>
                  <ul className="mt-6 space-y-3 text-sm text-white/90">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
                      Shirts and uniforms
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
                      Bed linen pressing
                    </li>
                  </ul>
                  <button
                    type="button"
                    onClick={onBookNow}
                    className="mt-8 px-5 py-3 rounded-lg bg-white text-[#4b678f] font-bold hover:bg-teal-50"
                  >
                    Book ironing
                  </button>
                </div>
                <img src="/siteshots/residential-b.jpg" alt="" className="w-full aspect-[4/3] object-cover opacity-95" />
              </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 lg:px-8 py-12 md:py-16 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14">
              <div>
                <h4 className="text-2xl sm:text-3xl font-black text-slate-900">End of tenancy & deep cleaning</h4>
                <p className="text-slate-600 mt-4 leading-relaxed">
                  A comprehensive restoration package for move-in, move-out, or when the space needs a full reset.
                </p>
                <button type="button" onClick={onBookNow} className="mt-8 px-5 py-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold">
                  Request quote
                </button>
              </div>
              <div className="lg:pl-8 lg:border-l border-slate-200 space-y-10">
                <div>
                  <h4 className="text-2xl sm:text-3xl font-black text-slate-900">Commercial & office</h4>
                  <p className="text-slate-600 mt-4 leading-relaxed">
                    Evening and weekend windows so your team arrives to a composed, client-ready workplace.
                  </p>
                  <button
                    type="button"
                    onClick={onBookNow}
                    className="mt-8 px-5 py-3 rounded-lg ring-1 ring-slate-300 text-slate-800 font-bold hover:bg-slate-50"
                  >
                    LED service
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative w-full bg-teal-800 text-white py-14 md:py-20 px-4 sm:px-6">
          <div className="max-w-3xl mx-auto lg:px-8">
            <h2 className="text-[11px] sm:text-xs font-black uppercase tracking-[0.2em] text-teal-200/90 mb-6">Company information</h2>
            <div className="space-y-5 text-base sm:text-lg leading-relaxed text-white/95">
              <p>
                <strong className="font-black text-white">CiN Cleaning</strong> operates under the registered company{' '}
                <strong className="font-black text-white">Surpluslink &amp; Co Ltd</strong>, with company registration number{' '}
                <strong className="font-black text-white tabular-nums">16563935</strong>.
              </p>
              <p>
                We have been in operation for more than three years, built on thorough workmanship and a track record of satisfied customers. We are now
                expanding our presence to set a higher bar for how professional cleaning is delivered—clear standards, dependable teams, and service you can
                trust every time.
              </p>
            </div>
          </div>
        </section>

        <section className="py-14 md:py-20 text-center max-w-3xl mx-auto px-4 sm:px-6">
          <h3 className="text-3xl sm:text-4xl font-black text-slate-900">Ready to rediscover your home&apos;s clarity?</h3>
          <p className="text-slate-600 mt-4 text-base sm:text-lg leading-relaxed">
            Join thousands of homeowners who trust us for consistent, precision-led cleaning standards.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
            <button type="button" onClick={onBookNow} className="px-6 py-3 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold">
              Book a clean
            </button>
            <button type="button" onClick={onBookNow} className="px-6 py-3 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold">
              Contact us
            </button>
          </div>
        </section>

        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  if (page === 'terms') {
    return (
      <div className="space-y-0">
        <TermsAndConditionsPage onBookNow={onBookNow} />
        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  if (page === 'faq') {
    return (
      <div className="space-y-0">
        <section className="py-10 md:py-14 max-w-3xl mx-auto px-4 lg:px-8">
          <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-50 text-teal-700">
            Help
          </span>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-900 tracking-tight mt-4">FAQ</h1>
          <p className="text-slate-600 mt-4 text-base sm:text-lg leading-relaxed max-w-2xl">
            Answers about deep cleaning, booking, and working with CiN Cleaning.
          </p>
        </section>
        <CleaningFaq showSectionTitle={false} />
        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  if (page === 'area') {
    const areaSlug = blogSlug || '';
    const areaInfo = AREA_DATA[areaSlug];
    const areaName =
      areaInfo?.name ||
      areaSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ||
      'Your Area';
    const areaBlurb =
      areaInfo?.description ||
      `Professional cleaning services in ${areaName}. Vetted, insured cleaners, all supplies included, and online booking in under two minutes.`;
    const areaHighlights = areaInfo?.highlights || [
      'Vetted, background-checked cleaners',
      'Flexible weekly, fortnightly or one-off cleans',
      'All products and equipment included',
    ];
    const areaHeroImg = content.heroes.find((x) => x.page === 'residential')?.imageUrl || '/siteshots/residential-a.jpg';

    return (
      <div className="space-y-0">
        <section className={SUBMENU_HERO_SECTION}>
          <img src={areaHeroImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 lg:px-10 py-12 md:py-20">
            <div className={SUBMENU_HERO_CAPTION_CARD}>
              <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-400/20 text-teal-200">
                Local cleaning services
              </span>
              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black leading-[1.05] [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">
                Cleaning Services in {areaName}
              </h1>
              <p className="text-lg sm:text-xl md:text-2xl font-bold text-teal-100 max-w-3xl leading-snug">{areaBlurb}</p>
              <div className="flex flex-wrap gap-3 pt-1">
                <button
                  type="button"
                  onClick={onBookNow}
                  className="px-5 py-3 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm sm:text-base"
                >
                  Book a clean in {areaName}
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate('pricing')}
                  className="px-5 py-3 rounded-lg bg-white/10 hover:bg-white/15 text-white font-bold text-sm sm:text-base ring-1 ring-white/25"
                >
                  View pricing
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 md:[&>*:last-child:nth-child(odd)]:col-span-2 lg:[&>*:last-child:nth-child(odd)]:col-span-1 gap-6">
            {areaHighlights.map((line) => (
              <div key={line} className="rounded-2xl border border-slate-100 bg-white p-6">
                <CheckCircle2 className="w-6 h-6 text-teal-600" aria-hidden />
                <p className="mt-3 font-bold text-slate-800 leading-relaxed">{line}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-14 md:py-20 bg-slate-50 border-y border-slate-100">
          <div className="max-w-7xl mx-auto px-4 lg:px-8">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Our services in {areaName}</h2>
            <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {AREA_SERVICE_LINKS.map((svc) => (
                <button
                  key={svc.page}
                  type="button"
                  onClick={() => onNavigate(svc.page)}
                  className="text-left rounded-2xl border border-slate-100 bg-white p-6 hover:border-teal-300 transition-colors"
                >
                  <div className="font-black text-slate-900">{svc.name}</div>
                  <div className="mt-1 text-sm text-slate-600 leading-relaxed">{svc.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
          <div className="max-w-3xl rounded-2xl border border-teal-200/80 bg-teal-50/60 p-6 sm:p-8 md:p-10">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900">Ready for a spotless home in {areaName}?</h2>
            <p className="mt-3 text-slate-700 text-base sm:text-lg leading-relaxed">
              Book online in under two minutes. We bring everything we need, and every clean is backed by our satisfaction
              guarantee.
            </p>
            <button
              type="button"
              onClick={onBookNow}
              className="mt-6 px-6 py-3 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-sm"
            >
              Get an instant quote
            </button>
          </div>
        </section>

        <CleaningFaq showSectionTitle />
        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  if (page === 'contact') {
    return (
      <div className="space-y-12 pt-12">
        <section className="max-w-7xl mx-auto px-4 lg:px-8 space-y-4">
          <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-50 text-teal-700">
            GET IN TOUCH
          </span>
          <h1 className="text-5xl md:text-7xl font-black leading-[1.02] sm:leading-[0.95] text-slate-900">
            Let’s restore your <span className="text-teal-700">space together.</span>
          </h1>
          <p className="text-slate-600 text-lg max-w-3xl">
            Whether it’s a sanctuary at home or a hub of productivity at work, our experts are ready to bring the sparkle back.
          </p>
        </section>

        <section className="max-w-7xl mx-auto px-4 lg:px-8 grid grid-cols-1 lg:grid-cols-5 gap-6">
          <form
            className="lg:col-span-3 bg-white rounded-2xl border border-slate-100 p-6 md:p-8 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await submitSupportContact({
                name: contactName.trim(),
                email: contactEmail.trim(),
                serviceType: contactServiceType.trim(),
                message: contactMessage.trim(),
              });
              if (ok) {
                setContactSent(true);
                setContactName('');
                setContactEmail('');
                setContactServiceType('Residential Cleaning');
                setContactMessage('');
                setTimeout(() => setContactSent(false), 6000);
              }
            }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-slate-400">Full Name</label>
                <input value={contactName} onChange={(e) => setContactName(e.target.value)} required className="mt-2 w-full p-3 rounded-xl border border-slate-200" placeholder="John Doe" />
              </div>
              <div>
                <label className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-slate-400">Email Address</label>
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} required className="mt-2 w-full p-3 rounded-xl border border-slate-200" placeholder="john@example.com" />
              </div>
            </div>
            <div>
              <label className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-slate-400">Service Type</label>
              <select value={contactServiceType} onChange={(e) => setContactServiceType(e.target.value)} className="mt-2 w-full p-3 rounded-xl border border-slate-200">
                <option>Residential Cleaning</option>
                <option>Commercial Cleaning</option>
                <option>Deep Cleaning</option>
                <option>End of Tenancy</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] sm:text-xs font-black uppercase tracking-widest text-slate-400">Your Message</label>
              <textarea value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} required className="mt-2 w-full p-3 rounded-xl border border-slate-200 h-28" placeholder="Tell us about your space and requirements..." />
            </div>
            {contactError && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700" role="alert">
                {contactError}
              </div>
            )}
            {contactSent && !contactError && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700" role="status">
                Thanks! Your message has been sent — our team will reply to the email you provided shortly.
              </div>
            )}
            <button
              type="submit"
              disabled={contactSubmitting}
              className="px-8 py-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-bold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {contactSubmitting ? 'Sending…' : contactSent ? 'Message Sent' : 'Send Inquiry'}
            </button>
          </form>

          <div className="lg:col-span-2 space-y-5">
            <article className="bg-[#4b678f] text-white rounded-2xl p-6 md:p-8 border border-[#405a81]">
              <div className="space-y-5">
                {brandPhone ? (
                  <div>
                    <p className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-blue-100">Direct line</p>
                    <p className="text-3xl font-black">
                      <a href={`tel:${brandPhone.replace(/\s/g, '')}`} className="hover:text-teal-100 transition-colors">
                        {brandPhone}
                      </a>
                    </p>
                  </div>
                ) : null}
                {brandEmail ? (
                  <div>
                    <p className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-blue-100">Inquiries</p>
                    <p className="text-2xl font-black break-all">
                      <a href={`mailto:${encodeURIComponent(brandEmail)}`} className="hover:text-teal-100 transition-colors">
                        {brandEmail}
                      </a>
                    </p>
                  </div>
                ) : null}
                {brandAddress ? (
                  <div>
                    <p className="text-[11px] sm:text-xs uppercase tracking-widest font-black text-blue-100">Headquarters</p>
                    <p className="text-2xl font-black whitespace-pre-line leading-snug">{brandAddress}</p>
                  </div>
                ) : null}
                {!brandPhone && !brandEmail && !brandAddress ? (
                  <p className="text-sm text-white/85 leading-relaxed">
                    Contact details from your business profile will appear here when available.
                  </p>
                ) : null}
              </div>
            </article>
            <div className="w-full h-[240px] rounded-2xl border border-slate-100 overflow-hidden bg-slate-200">
              <iframe
                title="CiN Cleaning HQ map"
                className="w-full h-full"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                src="https://www.openstreetmap.org/export/embed.html?bbox=-0.146%2C51.500%2C-0.098%2C51.528&layer=mapnik&marker=51.514%2C-0.122"
              />
            </div>
          </div>
        </section>

        <MarketingFooter content={content} onNavigate={onNavigate} onBookNow={onBookNow} />
      </div>
    );
  }

  return (
    <div className="space-y-8 py-16 text-center max-w-lg mx-auto">
      <p className="text-slate-600">This page could not be loaded.</p>
      <button
        type="button"
        onClick={() => onNavigate('home')}
        className="px-6 py-3 rounded-xl bg-teal-700 text-white font-bold hover:bg-teal-800"
      >
        Back to home
      </button>
    </div>
  );
};

export default MarketingSite;
