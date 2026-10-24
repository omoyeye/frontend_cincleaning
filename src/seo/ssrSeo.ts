/**
 * ssrSeo.ts — Server-safe SEO head HTML builder.
 * No document, no window, no localStorage. Returns raw HTML strings.
 */
import type { SiteSeoSettings } from '../../types';
import { defaultSiteSeo, tidySeoTitle } from './seoStorage';
import type { BlogPost } from '../../types';
import { pathForSeoPageId, parseCustomerRoute, getViewFromPathname, seoPageIdForRoute, SERVICE_AREAS } from './routePaths';
import type { SeoPageId } from './routePaths';
import { buildJsonLdForPage } from './schemaJsonLd';

function effectiveOrigin(settings: SiteSeoSettings): string {
  const s = settings.siteUrl?.trim().replace(/\/$/, '');
  return s || '';
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function metaName(name: string, content: string): string {
  return `<meta name="${escapeAttr(name)}" content="${escapeAttr(content)}">`;
}

function metaProp(prop: string, content: string): string {
  return `<meta property="${escapeAttr(prop)}" content="${escapeAttr(content)}">`;
}

function resolveAbsoluteUrl(settings: SiteSeoSettings, urlOrPath: string): string {
  const origin = effectiveOrigin(settings);
  if (!urlOrPath.trim()) return '';
  const u = urlOrPath.trim();
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  const path = u.startsWith('/') ? u : `/${u}`;
  return origin ? `${origin}${path}` : '';
}

/**
 * Build the HTML string of <head> SEO tags for a given URL.
 * Pass custom settings (e.g. loaded from DB) or leave undefined to use defaults.
 */
export function buildSsrHeadHtml(
  url: string,
  settings?: SiteSeoSettings,
  blogPost?: BlogPost | null
): string {
  const seo = settings ?? defaultSiteSeo();
  if (blogPost) return buildBlogPostHead(seo, blogPost);

  // Determine which page this URL maps to
  const pathname = url.split('?')[0];
  const view = getViewFromPathname(pathname);
  const { page: customerPage, blogSlug } = parseCustomerRoute(pathname);
  /** Reset-password is not a `SeoPageId`; reuse portal (noindex) meta slot for SSR head. */
  const pageId: SeoPageId =
    view === 'reset-password' ? 'portal' : seoPageIdForRoute(view, customerPage);

  /** Area routes carry their slug in blogSlug (see parseCustomerRoute). */
  const areaSlug = pageId === 'area' ? blogSlug || '' : '';
  const areaName = areaSlug ? SERVICE_AREAS[areaSlug] : '';

  const meta = seo.pages[pageId];
  const path = areaSlug ? `/cleaning-in-${areaSlug}` : pathForSeoPageId(pageId);
  const origin = effectiveOrigin(seo);
  const canonicalHref = origin ? `${origin}${path === '/' ? '/' : path}` : '';

  const noindex =
    pageId === 'admin' ||
    pageId === 'staff' ||
    pageId === 'portal' ||
    // Unknown area slugs are thin pages — keep them out of the index.
    (pageId === 'area' && !areaName);

  const brand = seo.organizationName?.trim() || 'CiN Cleaning';
  const title = tidySeoTitle(
    areaName ? `Cleaning Services in ${areaName} | ${brand}` : meta?.title?.trim() || `${brand} - Professional cleaning services`
  );
  const description = areaName
    ? `Professional, insured cleaners in ${areaName}. Deep cleans, end-of-tenancy, regular and commercial cleaning. Book online in under two minutes.`
    : meta?.description?.trim() || '';
  const keywords = areaName
    ? `cleaners ${areaName}, cleaning services ${areaName}, end of tenancy cleaning ${areaName}, deep cleaning ${areaName}, domestic cleaner ${areaName}`
    : meta?.keywords?.trim() || '';

  const ogImageRaw = meta?.ogImageUrl?.trim() || seo.defaultOgImageUrl?.trim() || '';
  const ogImage = ogImageRaw ? resolveAbsoluteUrl(seo, ogImageRaw) : '';

  const lines: string[] = [];

  lines.push(`<title>${escapeAttr(title)}</title>`);

  if (description) lines.push(metaName('description', description));
  if (keywords) lines.push(metaName('keywords', keywords));
  if (seo.googleSiteVerification?.trim()) {
    lines.push(metaName('google-site-verification', seo.googleSiteVerification.trim()));
  }
  lines.push(metaName('robots', noindex ? 'noindex, nofollow' : 'index, follow'));

  // Open Graph
  lines.push(metaProp('og:title', title));
  if (description) lines.push(metaProp('og:description', description));
  lines.push(metaProp('og:type', 'website'));
  if (canonicalHref) lines.push(metaProp('og:url', canonicalHref));
  if (ogImage) {
    lines.push(metaProp('og:image', ogImage));
    lines.push(metaProp('og:image:alt', title));
  }

  // Twitter
  lines.push(metaName('twitter:card', ogImage ? 'summary_large_image' : 'summary'));
  lines.push(metaName('twitter:title', title));
  if (description) lines.push(metaName('twitter:description', description));
  if (seo.twitterSite?.trim()) {
    lines.push(metaName('twitter:site', `@${seo.twitterSite.trim().replace(/^@/, '')}`));
  }
  if (ogImage) lines.push(metaName('twitter:image', ogImage));

  // Canonical
  if (canonicalHref) {
    lines.push(`<link rel="canonical" href="${escapeAttr(canonicalHref)}">`);
  }

  // Custom meta lines
  const custom = seo.customMetaLines || '';
  custom.split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const pipe = t.indexOf('|');
    if (pipe < 1) return;
    const name = t.slice(0, pipe).trim();
    const content = t.slice(pipe + 1).trim();
    if (name && content) lines.push(metaName(name, content));
  });

  // JSON-LD structured data (LocalBusiness, Service, FAQ, Breadcrumbs)
  if (!noindex && origin) {
    const jsonLd = buildJsonLdForPage(pageId, origin, areaSlug || undefined);
    if (jsonLd) lines.push(jsonLd);
  }

  return lines.join('\n');
}

function customMetaLines(seo: SiteSeoSettings): string[] {
  const out: string[] = [];
  (seo.customMetaLines || '').split('\n').forEach((line) => {
    const t = line.trim();
    if (!t || t.startsWith('#')) return;
    const pipe = t.indexOf('|');
    if (pipe < 1) return;
    const name = t.slice(0, pipe).trim();
    const content = t.slice(pipe + 1).trim();
    if (name && content) out.push(metaName(name, content));
  });
  return out;
}

/** Head tags for a prerendered blog article (same values MarketingSite sets in the browser). */
function buildBlogPostHead(seo: SiteSeoSettings, post: BlogPost): string {
  const origin = effectiveOrigin(seo);
  const brand = seo.organizationName?.trim() || 'CiN Cleaning';
  const canonical = origin ? `${origin}/cleaning-blog/${encodeURIComponent(post.slug)}` : '';
  const title = tidySeoTitle(post.metaTitle?.trim() || post.title);
  const description = (post.metaDescription?.trim() || post.excerpt?.trim() || '').slice(0, 300);
  const heroRaw = post.heroImageUrl?.trim() || '';
  const hero = heroRaw && !heroRaw.startsWith('data:') ? resolveAbsoluteUrl(seo, heroRaw) : '';
  const ogImage = hero || (seo.defaultOgImageUrl?.trim() ? resolveAbsoluteUrl(seo, seo.defaultOgImageUrl.trim()) : '');
  const lines: string[] = [`<title>${escapeAttr(title)}</title>`];
  if (description) lines.push(metaName('description', description));
  if (post.metaKeywords?.trim()) lines.push(metaName('keywords', post.metaKeywords.trim()));
  lines.push(metaName('robots', 'index, follow'));
  lines.push(metaProp('og:title', title));
  if (description) lines.push(metaProp('og:description', description));
  lines.push(metaProp('og:type', 'article'));
  if (canonical) lines.push(metaProp('og:url', canonical));
  if (ogImage) lines.push(metaProp('og:image', ogImage));
  lines.push(metaName('twitter:card', ogImage ? 'summary_large_image' : 'summary'));
  lines.push(metaName('twitter:title', title));
  if (description) lines.push(metaName('twitter:description', description));
  if (ogImage) lines.push(metaName('twitter:image', ogImage));
  if (canonical) lines.push(`<link rel="canonical" href="${escapeAttr(canonical)}">`);
  lines.push(...customMetaLines(seo));
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: description || undefined,
    image: ogImage || undefined,
    datePublished: post.publishedAt || undefined,
    dateModified: post.updatedAt || post.publishedAt || undefined,
    author: { '@type': 'Organization', name: brand },
    publisher: { '@type': 'Organization', name: brand },
    mainEntityOfPage: canonical ? { '@type': 'WebPage', '@id': canonical } : undefined,
  };
  // Same id MarketingSite uses, so the browser updates this script instead of adding a second one.
  lines.push(`<script type="application/ld+json" id="nn-blog-jsonld">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>`);
  return lines.join('\n');
}
