import type { SiteSeoSettings } from '../../types';
import type { SeoPageId } from './routePaths';
import { pathForSeoPageId, SERVICE_AREAS } from './routePaths';
import { buildJsonLdForPage } from './schemaJsonLd';

const NN_ATTR = 'data-nn-seo';

function effectiveOrigin(settings: SiteSeoSettings): string {
  const s = settings.siteUrl?.trim().replace(/\/$/, '');
  if (s) return s;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

function absoluteUrl(settings: SiteSeoSettings, urlOrPath: string): string {
  const origin = effectiveOrigin(settings);
  if (!urlOrPath.trim()) return '';
  const u = urlOrPath.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('//')) return `${window.location.protocol}${u}`;
  const path = u.startsWith('/') ? u : `/${u}`;
  return origin ? `${origin}${path}` : `${window.location.origin}${path}`;
}

function stripNn() {
  document.querySelectorAll(`[${NN_ATTR}]`).forEach((el) => el.remove());
}

function appendJsonLd(id: string, json: object) {
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const script = document.createElement('script');
  script.id = id;
  script.type = 'application/ld+json';
  script.setAttribute(NN_ATTR, '1');
  script.textContent = JSON.stringify(json);
  document.head.appendChild(script);
}

let gtmInjected = false;
let ga4InjectedId = '';

export function injectGtm(containerId: string) {
  const id = containerId.trim();
  if (!id || typeof document === 'undefined') return;
  if (gtmInjected) return;
  gtmInjected = true;

  const w = window as Window & { dataLayer?: unknown[] };
  w.dataLayer = w.dataLayer || [];
  w.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);

  const noscript = document.createElement('noscript');
  noscript.innerHTML = `<iframe src="https://www.googletagmanager.com/ns.html?id=${encodeURIComponent(id)}" height="0" width="0" style="display:none;visibility:hidden" title="Google Tag Manager"></iframe>`;
  document.body.prepend(noscript);
}

export function injectGa4(measurementId: string) {
  const id = measurementId.trim();
  if (!id || typeof document === 'undefined') return;
  if (ga4InjectedId === id) return;
  ga4InjectedId = id;

  const script1 = document.createElement('script');
  script1.async = true;
  script1.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script1);

  const script2 = document.createElement('script');
  script2.textContent = `
    window.dataLayer = window.dataLayer || [];
    function gtag(){dataLayer.push(arguments);}
    gtag('js', new Date());
    gtag('config', '${id.replace(/'/g, "\\'")}');
  `;
  document.head.appendChild(script2);
}

export function resetGtmInjectionFlagForTests() {
  gtmInjected = false;
  ga4InjectedId = '';
}

export function applyDocumentSeo(
  settings: SiteSeoSettings,
  pageId: SeoPageId,
  options: { brandFallback?: string; areaSlug?: string | null } = {}
): void {
  if (typeof document === 'undefined') return;

  const areaSlug = pageId === 'area' ? options.areaSlug || '' : '';
  const areaName = areaSlug ? SERVICE_AREAS[areaSlug] : '';

  const meta = settings.pages[pageId];
  const path = areaSlug ? `/cleaning-in-${areaSlug}` : pathForSeoPageId(pageId);
  const origin = effectiveOrigin(settings);
  const canonicalHref = origin ? `${origin}${path === '/' ? '/' : path}` : '';

  const noindex =
    pageId === 'admin' ||
    pageId === 'staff' ||
    pageId === 'portal' ||
    // Unknown area slugs are thin pages — keep them out of the index.
    (pageId === 'area' && !areaName);

  const brand =
    options.brandFallback?.trim() ||
    settings.organizationName?.trim() ||
    'Site';
  const title = areaName
    ? `Cleaning Services in ${areaName} | ${settings.organizationName?.trim() || brand}`
    : meta?.title?.trim() || `${brand} - Professional cleaning services`;
  const description = areaName
    ? `Professional, insured cleaners in ${areaName}. Deep cleans, end-of-tenancy, regular and commercial cleaning. Book online in under two minutes.`
    : meta?.description?.trim() || '';
  const keywords = areaName
    ? `cleaners ${areaName}, cleaning services ${areaName}, end of tenancy cleaning ${areaName}, deep cleaning ${areaName}, domestic cleaner ${areaName}`
    : meta?.keywords?.trim() || '';

  const ogImageRaw = meta?.ogImageUrl?.trim() || settings.defaultOgImageUrl?.trim() || '';
  const ogImage = ogImageRaw ? absoluteUrl(settings, ogImageRaw) : '';

  document.title = title;

  stripNn();

  const metaEl = (name: string, content: string, prop = false) => {
    if (!content) return;
    const m = document.createElement('meta');
    m.setAttribute(NN_ATTR, '1');
    if (prop) m.setAttribute('property', name);
    else m.setAttribute('name', name);
    m.setAttribute('content', content);
    document.head.appendChild(m);
  };

  if (description) metaEl('description', description);
  if (keywords) metaEl('keywords', keywords);

  if (settings.googleSiteVerification.trim()) {
    metaEl('google-site-verification', settings.googleSiteVerification.trim());
  }

  metaEl('robots', noindex ? 'noindex, nofollow' : 'index, follow');

  metaEl('og:title', title, true);
  if (description) metaEl('og:description', description, true);
  metaEl('og:type', 'website', true);
  if (canonicalHref) metaEl('og:url', canonicalHref, true);
  if (ogImage) {
    metaEl('og:image', ogImage, true);
    metaEl('og:image:alt', title, true);
  }

  metaEl('twitter:card', ogImage ? 'summary_large_image' : 'summary');
  metaEl('twitter:title', title);
  if (description) metaEl('twitter:description', description);
  if (settings.twitterSite.trim()) metaEl('twitter:site', `@${settings.twitterSite.trim().replace(/^@/, '')}`);
  if (ogImage) metaEl('twitter:image', ogImage);

  if (canonicalHref) {
    const link = document.createElement('link');
    link.setAttribute(NN_ATTR, '1');
    link.rel = 'canonical';
    link.href = canonicalHref;
    document.head.appendChild(link);
  }

  const custom = settings.customMetaLines || '';
  custom.split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const pipe = t.indexOf('|');
    if (pipe < 1) return;
    const name = t.slice(0, pipe).trim();
    const content = t.slice(pipe + 1).trim();
    if (name && content) metaEl(name, content);
  });

  const existingLd = document.getElementById('nn-ld-org');
  if (existingLd) existingLd.remove();

  if (!noindex && pageId === 'home' && origin) {
    appendJsonLd('nn-ld-org', {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: settings.organizationName || 'Business',
      url: origin,
      ...(ogImage ? { logo: ogImage } : {}),
    });
  }

  // Inject JSON-LD structured data for all pages
  if (!noindex && origin) {
    const jsonLdHtml = buildJsonLdForPage(pageId, origin, areaSlug || undefined);
    if (jsonLdHtml) {
      const temp = document.createElement('div');
      temp.innerHTML = jsonLdHtml;
      const scripts = temp.querySelectorAll('script');
      scripts.forEach(s => {
        const el = document.createElement('script');
        el.type = 'application/ld+json';
        el.setAttribute(NN_ATTR, '');
        el.textContent = s.textContent;
        document.head.appendChild(el);
      });
    }
  }
}
