import type { SiteSeoSettings, SeoPageMeta } from '../../types';
import type { SeoPageId } from './routePaths';

const STORAGE_KEY = 'nn_site_seo_v1';

const PAGE_IDS: SeoPageId[] = [
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
  'area',
  'portal',
  'admin',
  'staff',
];

function defaultMeta(brand: string, titleSuffix: string, description: string, keywords: string): SeoPageMeta {
  return {
    title: `${brand} - ${titleSuffix}`,
    description,
    keywords,
    ogImageUrl: '',
  };
}

export function defaultSiteSeo(brand = 'CiN'): SiteSeoSettings {
  const pages: SiteSeoSettings['pages'] = {
    home: defaultMeta(
      brand,
      'Professional Cleaners in London & Manchester',
      'Insured, vetted cleaners across London and Manchester. Regular, deep, end-of-tenancy, Airbnb and office cleaning. Instant online quote and booking.',
      'cleaners London, cleaning services London, cleaners Manchester, cleaning services Manchester, end of tenancy cleaning London, deep cleaning Manchester, CiN Cleaning, clean it neatly'
    ),
    residential: defaultMeta(
      brand,
      'Residential cleaning',
      'Bespoke home cleaning - weekly, fortnightly, or deep cleans. Vetted teams and clear pricing.',
      'residential cleaning, house cleaning, domestic cleaner, deep clean home'
    ),
    standardCleaning: defaultMeta(
      brand,
      'General & standard cleaning',
      'Weekly, fortnightly, or monthly home cleaning - consistent, vetted CiN teams in London and Manchester.',
      'regular cleaning, standard cleaning, domestic cleaning UK, weekly cleaner'
    ),
    deepCleaning: defaultMeta(
      brand,
      'Deep cleaning',
      'Detail-led deep cleans for homes - skirtings, appliances, bathrooms, and forgotten corners. CiN Cleaning across London and Manchester.',
      'deep cleaning UK, spring clean, intensive house clean, London Manchester cleaning'
    ),
    endOfTenancy: defaultMeta(
      brand,
      'End of tenancy cleaning',
      'Checkout-ready end of tenancy cleaning for London and Manchester - inventory-standard checklist, ovens, bathrooms, and deposit peace of mind.',
      'end of tenancy cleaning, move out clean, deposit cleaning, London Manchester EOT'
    ),
    commercial: defaultMeta(
      brand,
      'Commercial cleaning',
      'Office, retail, and hospitality cleaning across London and Manchester with compliance-focused checklists and after-hours availability.',
      'commercial cleaning London, office cleaning London, office cleaning Manchester, contract cleaning, workplace cleaning'
    ),
    airbnbShortLet: defaultMeta(
      brand,
      'Airbnb & short-let cleaning',
      'Guest-ready turnovers for Airbnb and short-lets in London and Manchester - linen, restock, and calendar-aligned service.',
      'Airbnb cleaning, short let turnover, holiday rental cleaning, London Manchester'
    ),
    about: defaultMeta(
      brand,
      'About us',
      'Our story, standards, and the team behind premium cleaning and restoration-first service.',
      'cleaning company, about, team, standards'
    ),
    gallery: defaultMeta(
      brand,
      'Cleaning gallery',
      'See real residential and commercial cleaning results from CiN Cleaning - professional, insured teams across the UK.',
      'cleaning gallery, before after cleaning, professional cleaning photos'
    ),
    blog: defaultMeta(
      brand,
      'Cleaning blog',
      'Expert tips on deep cleaning, eco-friendly products, commercial cleaning, and end-of-tenancy checklists from CiN Cleaning.',
      'cleaning tips UK, house cleaning blog, commercial cleaning advice, end of tenancy tips'
    ),
    pricing: defaultMeta(
      brand,
      'Cleaning pricing',
      'Straightforward hourly rates and membership-style plans. Get a live estimate and book online.',
      'cleaning prices, hourly cleaning rate, cleaning quote'
    ),
    contact: defaultMeta(
      brand,
      'Contact',
      'Reach our team for quotes, scheduling, and account support. Phone, email, and message.',
      'contact cleaning company, cleaning quote contact'
    ),
    faq: defaultMeta(
      brand,
      'FAQ',
      'Frequently asked questions about CiN Cleaning - deep vs standard cleans, products, insurance, London and Manchester.',
      'cleaning FAQ, deep clean questions, CiN Cleaning help'
    ),
    terms: defaultMeta(
      brand,
      'Terms & conditions',
      'Booking rules, deposits, payments, cancellations, short-notice fees, and how to book with CiN Cleaning.',
      'booking terms, cleaning cancellation policy, deposit terms, CiN Cleaning'
    ),
    book: defaultMeta(
      brand,
      'Book a clean',
      'Start your booking: choose service, property details, and time. Secure checkout available.',
      'book cleaner online, schedule cleaning'
    ),
    area: defaultMeta(
      brand,
      'Cleaning services in your area',
      'Professional, insured cleaners covering London and Greater Manchester. Book a local cleaning team online in under two minutes.',
      'local cleaners, cleaning services near me, cleaning company london, cleaning company manchester'
    ),
    portal: defaultMeta(
      brand,
      'Client account',
      'Sign in to view bookings, invoices, and loyalty rewards.',
      'client login, cleaning account'
    ),
    admin: defaultMeta(
      brand,
      'Admin',
      'Staff administration console.',
      ''
    ),
    staff: defaultMeta(
      brand,
      'Staff portal',
      'Rota, jobs, and team tools.',
      ''
    ),
  };

  return {
    siteUrl: '',
    organizationName: brand,
    gtmContainerId: '',
    googleAnalytics4Id: '',
    googleSiteVerification: '',
    defaultOgImageUrl: '',
    twitterSite: '',
    customMetaLines: '',
    pages,
    scriptHead: '',
    scriptBodyStart: '',
    scriptBodyEnd: '',
  };
}

export function deepMergePages(
  base: SiteSeoSettings['pages'],
  partial?: SiteSeoSettings['pages']
): SiteSeoSettings['pages'] {
  const out = { ...base };
  if (!partial) return out;
  for (const id of PAGE_IDS) {
    const p = partial[id];
    if (p && typeof p === 'object') {
      out[id] = {
        ...base[id],
        ...p,
        title: typeof p.title === 'string' ? p.title : base[id].title,
        description: typeof p.description === 'string' ? p.description : base[id].description,
        keywords: typeof p.keywords === 'string' ? p.keywords : base[id].keywords,
        ogImageUrl: typeof p.ogImageUrl === 'string' ? p.ogImageUrl : base[id].ogImageUrl,
      };
    }
  }
  return out;
}

export function getSiteSeo(): SiteSeoSettings {
  try {
    const raw = typeof window !== 'undefined' ? (window as any).__NN_SEO_SETTINGS__ : null;
    const defaults = defaultSiteSeo();
    if (!raw) return defaults;
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return {
      ...defaults,
      ...parsed,
      pages: deepMergePages(defaults.pages, parsed.pages || {}),
    };
  } catch {
    return defaultSiteSeo();
  }
}

export function buildSitemapXml(siteUrl: string, paths: string[]): string {
  const base = siteUrl.replace(/\/$/, '');
  const urls = paths
    .map((path) => {
      const loc = path === '/' ? `${base}/` : `${base}${path}`;
      return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>${path === '/' ? '1.0' : '0.8'}</priority>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">\n${urls}\n</urlset>\n`;
}

export function buildRobotsTxt(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  return [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
