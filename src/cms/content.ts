import type { CmsAdvertCard, CmsFooterLink, CmsHeroSlide, WebsiteContent } from '../../types';

const STORAGE_KEY = 'nn_website_content_v2';

export const defaultWebsiteContent: WebsiteContent = {
  heroes: [
    {
      id: 'hero-home',
      page: 'home',
      eyebrow: 'CERTIFIED & TRUSTED',
      title: 'Professional Cleaning You Can Trust.',
      highlight: 'Trust',
      subtitle:
        'Serving homes and businesses across London and Manchester. Vetted professionals, eco-friendly products, and a 100% satisfaction guarantee. We do not just clean, we restore your space.',
      ctaPrimary: 'Book a clean',
      ctaSecondary: 'Residential services',
      ctaTertiary: 'Contact us',
      imageUrl: '/siteshots/home-reference-final.jpg',
    },
    {
      id: 'hero-residential',
      page: 'residential',
      eyebrow: 'RESIDENTIAL EXCELLENCE',
      title: 'A Spotless, Healthy Home.',
      highlight: 'Spotless',
      subtitle: 'From regular upkeep to deep transformations, our fully insured teams deliver meticulous cleaning designed around your lifestyle and peace of mind.',
      ctaPrimary: 'Schedule a Clean',
      ctaSecondary: 'View Pricing',
      imageUrl: '/siteshots/residential-a.jpg',
    },
    {
      id: 'hero-commercial',
      page: 'commercial',
      eyebrow: 'COMMERCIAL CLEANING',
      title: 'Immaculate Workspaces.',
      highlight: 'Immaculate',
      subtitle: 'Protect your brand, inspire your team, and welcome clients to a pristine environment. 24/7 support and custom schedules available.',
      ctaPrimary: 'Request Corporate Quote',
      ctaSecondary: 'View Capabilities',
      imageUrl: '/siteshots/commercial.jpg',
    },
    {
      id: 'hero-about',
      page: 'about',
      eyebrow: 'ABOUT CiN CLEANING',
      title: 'Your Premium Cleaning Partner.',
      highlight: 'Partner',
      subtitle: 'A family-ethos business combining years of expertise with industry-tested products to deliver unmatched reliability and care.',
      ctaPrimary: 'Schedule Consultation',
      ctaSecondary: 'See Standards',
      imageUrl: '/siteshots/about-reference-new.jpg',
    },
    {
      id: 'hero-pricing',
      page: 'pricing',
      eyebrow: 'TRANSPARENT PRICING',
      title: 'Our Prices',
      highlight: 'Prices',
      subtitle: 'Straightforward rates and plans with no hidden fees.',
      ctaPrimary: 'Book This Plan',
      ctaSecondary: 'Get a Quote',
      imageUrl: '/siteshots/pricing.jpg',
    },
    {
      id: 'hero-contact',
      page: 'contact',
      eyebrow: 'GET IN TOUCH',
      title: "Let's restore your space together.",
      highlight: 'space together',
      subtitle: 'Tell us about your property and we will recommend the perfect plan.',
      ctaPrimary: 'Send Inquiry',
      ctaSecondary: 'Book Now',
      imageUrl: '/siteshots/contact.jpg',
    },
  ],
  adverts: [
    {
      id: 'ad-home-1',
      title: 'Spring Deep Clean Offer',
      description: 'Book a full deep clean this month and get priority scheduling with trusted, vetted operatives.',
      ctaLabel: 'Book this offer',
      ctaHref: '/contact-us',
      imageUrl: '/siteshots/home-reference-final.jpg',
      active: true,
    },
    {
      id: 'ad-home-2',
      title: 'Commercial Maintenance Plan',
      description: 'Keep your workplace presentation-ready with a flexible recurring plan tailored to your team hours.',
      ctaLabel: 'Request a quote',
      ctaHref: '/commercial',
      imageUrl: '/siteshots/commercial.jpg',
      active: true,
    },
  ],
  footerBlurb:
    'CiN Cleaning - Clean It Neatly. Premium residential and commercial cleaning with transparent pricing and vetted teams.',
  footerLinks: [
    { id: 'f1', label: 'Privacy Policy', href: '#' },
    { id: 'f2', label: 'Terms', href: '#' },
    { id: 'f3', label: 'Gallery', href: '/cleaning-gallery' },
    { id: 'f4', label: 'Blog', href: '/cleaning-blog' },
    { id: 'f5', label: 'Contact', href: '/contact-us' },
  ],
};

const HERO_PAGE_KEYS = new Set<CmsHeroSlide['page']>(['home', 'residential', 'commercial', 'about', 'pricing', 'contact']);

/** Stable order for the six marketing heroes (do not rely on Set iteration). */
const HERO_PAGE_ORDER: CmsHeroSlide['page'][] = [
  'home',
  'residential',
  'commercial',
  'about',
  'pricing',
  'contact',
];

function mergeHeroSlides(saved: CmsHeroSlide[] | undefined): CmsHeroSlide[] {
  const defaults = defaultWebsiteContent.heroes;
  const defaultByPage = new Map(defaults.map((h) => [h.page, h]));
  if (!saved?.length) return defaults;
  const byPage = new Map<CmsHeroSlide['page'], CmsHeroSlide>();
  for (const h of saved) {
    if (HERO_PAGE_KEYS.has(h.page)) byPage.set(h.page, h);
  }
  return HERO_PAGE_ORDER.map((page) => {
    const def = defaultByPage.get(page)!;
    const row = byPage.get(page);
    if (!row) return { ...def };
    return { ...def, ...row };
  });
}

function mergeFooterLinks(saved: CmsFooterLink[] | undefined): CmsFooterLink[] {
  const raw = saved?.length ? saved : defaultWebsiteContent.footerLinks;
  const base = raw.filter((f) => {
    const h = (f.href || '').replace(/\/$/, '') || '/';
    return h !== '/cleaning-tips';
  });
  const ids = new Set(base.map((f) => f.id));
  const additions = defaultWebsiteContent.footerLinks.filter((f) => !ids.has(f.id));
  return additions.length ? [...base, ...additions] : base;
}

function mergeAdvertCards(saved: CmsAdvertCard[] | undefined): CmsAdvertCard[] {
  const defaults = defaultWebsiteContent.adverts;
  if (!saved?.length) return defaults;
  return saved.map((card, idx) => {
    const fallback = defaults[idx] ?? defaults[0];
    return {
      id: card.id || `ad-${idx + 1}`,
      title: card.title ?? fallback.title,
      description: card.description ?? fallback.description,
      ctaLabel: card.ctaLabel ?? fallback.ctaLabel,
      ctaHref: card.ctaHref ?? fallback.ctaHref,
      imageUrl: card.imageUrl ?? fallback.imageUrl,
      active: card.active !== false,
    };
  });
}

/** Normalize API/unknown payload into a full WebsiteContent (fills missing hero pages from defaults). */
export function normalizeWebsiteContent(raw: unknown): WebsiteContent {
  if (!raw || typeof raw !== 'object') return defaultWebsiteContent;
  const parsed = raw as Partial<WebsiteContent>;
  return {
    heroes: mergeHeroSlides(parsed.heroes),
    adverts: mergeAdvertCards(parsed.adverts),
    footerBlurb: typeof parsed.footerBlurb === 'string' ? parsed.footerBlurb : defaultWebsiteContent.footerBlurb,
    footerLinks: mergeFooterLinks(parsed.footerLinks),
  };
}

export function getWebsiteContent(): WebsiteContent {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultWebsiteContent;
    const parsed = JSON.parse(raw) as Partial<WebsiteContent> & Record<string, unknown>;
    return normalizeWebsiteContent(parsed);
  } catch {
    return defaultWebsiteContent;
  }
}

export function saveWebsiteContent(content: WebsiteContent): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(content));
  window.dispatchEvent(new CustomEvent('nn_website_content_updated'));
}
