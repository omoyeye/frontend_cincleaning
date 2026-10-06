/**
 * schemaJsonLd.ts — Structured data (JSON-LD) for CiN Cleaning service pages.
 * Called from ssrSeo.ts to inject schema into the SSR <head>.
 */
import type { SeoPageId } from './routePaths';
import { SERVICE_AREAS } from './routePaths';

const BUSINESS = {
  name: 'CiN Cleaning',
  legalName: 'Clean It Neatly',
  phone: '07909565925',
  email: 'hello@cleanitneatly.com',
  url: 'https://cleanitneatly.com',
  priceRange: '££',
  openingHours: ['Mo-Sa 08:00-18:00'],
  areaServed: [
    { '@type': 'City', name: 'Manchester' },
    { '@type': 'City', name: 'London' },
  ],
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Manchester',
    addressCountry: 'GB',
  },
  aggregateRating: {
    '@type': 'AggregateRating',
    ratingValue: '4.9',
    bestRating: '5',
    reviewCount: '127',
  },
};

function localBusiness(origin: string) {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'CleaningService'],
    '@id': `${origin}/#organization`,
    name: BUSINESS.name,
    alternateName: BUSINESS.legalName,
    url: BUSINESS.url,
    telephone: BUSINESS.phone,
    email: BUSINESS.email,
    priceRange: BUSINESS.priceRange,
    openingHours: BUSINESS.openingHours,
    address: BUSINESS.address,
    areaServed: BUSINESS.areaServed,
    aggregateRating: BUSINESS.aggregateRating,
    sameAs: [],
  };
}

interface ServiceSchema {
  name: string;
  description: string;
  path: string;
}

function cleaningService(origin: string, svc: ServiceSchema) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CleaningService',
    name: svc.name,
    description: svc.description,
    url: `${origin}${svc.path}`,
    telephone: BUSINESS.phone,
    email: BUSINESS.email,
    areaServed: BUSINESS.areaServed,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: BUSINESS.aggregateRating.ratingValue,
      bestRating: BUSINESS.aggregateRating.bestRating,
      reviewCount: BUSINESS.aggregateRating.reviewCount,
    },
    provider: { '@id': `${origin}/#organization` },
  };
}

function faqPage(items: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.question,
      acceptedAnswer: { '@type': 'Answer', text: i.answer },
    })),
  };
}

function breadcrumb(origin: string, crumbs: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((c, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: c.name,
      item: `${origin}${c.path}`,
    })),
  };
}

const SERVICE_DEFS: Record<string, ServiceSchema> = {
  deepCleaning: {
    name: 'Deep Cleaning Service Manchester and London',
    description: 'Professional deep cleaning service covering every room from top to bottom. DBS-checked teams, eco-friendly products, 72-hour re-clean guarantee.',
    path: '/deep-cleaning',
  },
  endOfTenancy: {
    name: 'End of Tenancy Cleaning Manchester and London',
    description: 'Comprehensive end of tenancy cleaning to get your full deposit back. Fully insured, 72-hour re-clean guarantee, available 7 days a week.',
    path: '/end-of-tenancy-cleaning',
  },
  airbnbShortLet: {
    name: 'Airbnb and Short-Let Cleaning Turnaround Service',
    description: 'Fast, reliable Airbnb and short-let turnaround cleaning. Fresh linen, restocking, same-day availability in Manchester and London.',
    path: '/airbnb-short-let-cleaning',
  },
  commercial: {
    name: 'Commercial and Office Cleaning Manchester and London',
    description: 'Professional commercial and office cleaning services. Flexible contracts, DBS-vetted staff, tailored cleaning schedules for your business.',
    path: '/commercial-cleaning',
  },
  standardCleaning: {
    name: 'Regular Domestic Cleaning Service',
    description: 'Reliable weekly, fortnightly, or one-off standard house cleaning. Trusted local teams across Manchester and London.',
    path: '/standard-cleaning',
  },
  residential: {
    name: 'Residential Cleaning Services Manchester and London',
    description: 'Complete residential cleaning services for homes of all sizes. DBS-checked cleaners, fully insured, satisfaction guaranteed.',
    path: '/residential-cleaning',
  },
};

const PAGE_FAQS: Record<string, { question: string; answer: string }[]> = {
  deepCleaning: [
    { question: 'What is the difference between a deep clean and a standard clean?', answer: 'A deep clean covers areas not included in a regular clean — inside ovens, behind appliances, limescale removal, skirting boards, light fixtures, and detailed scrubbing of all surfaces. It is more intensive and takes longer than a standard maintenance clean.' },
    { question: 'How long does a deep clean take?', answer: 'A typical deep clean takes 4 to 8 hours depending on the size of the property and its condition. We provide an estimated duration when you book based on bedrooms and bathrooms.' },
    { question: 'Do you bring your own products?', answer: 'Yes, our teams bring all professional-grade, eco-friendly cleaning products and equipment. If you have specific products you prefer, just let us know and we are happy to use them.' },
    { question: 'How often should I book a deep clean?', answer: 'We recommend a deep clean every 3 to 6 months alongside regular standard cleaning. Properties that have not been cleaned recently, or after events or building work, benefit from an initial deep clean.' },
  ],
  endOfTenancy: [
    { question: 'Do I need a professional end of tenancy clean?', answer: 'Most landlords and letting agents require a professional clean to return your deposit. Our end of tenancy service meets inventory clerk standards and comes with a 72-hour re-clean guarantee if anything is flagged.' },
    { question: 'What does your 72-hour re-clean guarantee cover?', answer: 'If your landlord or inventory clerk raises any cleaning issues within 72 hours of our visit, we return and re-clean the flagged areas at no extra cost. We stand behind the quality of our work.' },
    { question: 'How much does end of tenancy cleaning cost?', answer: 'Pricing depends on property size and condition. A studio starts from around £150, while larger properties are priced per room. Get an instant estimate using our quote calculator or call us for a bespoke quote.' },
    { question: 'Do you clean in my area?', answer: 'CiN Cleaning covers all areas of Greater Manchester and London. Enter your postcode in our quote widget to confirm coverage instantly.' },
  ],
  airbnbShortLet: [
    { question: 'How quickly can you turn around an Airbnb clean?', answer: 'We can complete most Airbnb turnarounds in 2 to 4 hours. Same-day bookings are available subject to team availability — call us for urgent requests.' },
    { question: 'Do you provide linen and restocking services?', answer: 'Yes, we offer linen changes and basic restocking (toiletries, tea, coffee) as add-ons. Let us know your requirements when booking and we will include everything.' },
    { question: 'Can I set up regular recurring cleans for my short-let?', answer: 'Absolutely. Most of our Airbnb hosts set up ongoing arrangements where we clean between every guest. You can manage bookings through your CiN customer portal.' },
    { question: 'Are your cleaners insured for short-let properties?', answer: 'Yes, all our teams are fully insured with public liability cover and DBS-checked. We understand the importance of protecting your property and your guests.' },
  ],
  commercial: [
    { question: 'Do you offer contracts for regular office cleaning?', answer: 'Yes, we offer flexible daily, weekly, and fortnightly commercial cleaning contracts. We tailor the schedule and scope to your business requirements.' },
    { question: 'Can you clean outside normal business hours?', answer: 'Absolutely. Most of our commercial clients prefer early morning or evening cleans so there is no disruption to their work day. We work around your schedule.' },
    { question: 'What types of commercial premises do you clean?', answer: 'We clean offices, retail spaces, medical practices, gyms, restaurants, co-working spaces, and more across Manchester and London. Contact us for a bespoke quote.' },
    { question: 'Are your commercial cleaners DBS-checked?', answer: 'Yes, every member of our team is DBS-vetted and fully insured. We take security and trust seriously, especially in commercial environments.' },
  ],
  standardCleaning: [
    { question: 'What does a standard clean include?', answer: 'A standard clean covers all living areas: vacuuming and mopping floors, dusting surfaces, cleaning bathrooms and toilets, wiping kitchen surfaces, and general tidying. It is designed to maintain a clean home between deeper cleans.' },
    { question: 'How often should I book a standard clean?', answer: 'Most customers book weekly or fortnightly. The right frequency depends on household size, pets, and personal preference. We are happy to adjust your schedule at any time.' },
    { question: 'Can I book a one-off standard clean?', answer: 'Yes, we offer both regular and one-off standard cleans. One-off cleans are perfect before or after events, when moving, or whenever your home needs a refresh.' },
    { question: 'What is the minimum booking duration?', answer: 'The minimum booking for a standard clean is 2 hours. This is usually enough for a studio or small one-bedroom flat. Larger properties typically need 3 to 4 hours.' },
  ],
  faq: [
    { question: 'How much does a professional clean cost?', answer: 'Our prices start from £15/hour for standard cleaning. Deep cleans, end-of-tenancy, and commercial cleans are quoted based on property size. Visit our pricing page or book online for an instant quote.' },
    { question: 'Do I need to be home during the clean?', answer: 'No. Many clients leave a key or provide access instructions. We are fully insured and all staff are background-checked.' },
    { question: 'What cleaning products do you use?', answer: 'We bring all supplies and equipment. We use professional-grade, eco-friendly products. If you have specific product preferences, let us know when booking.' },
    { question: 'How far in advance should I book?', answer: 'We recommend booking at least 48 hours in advance, though we often accommodate same-day or next-day requests depending on availability.' },
    { question: 'Can I reschedule or cancel my booking?', answer: 'Yes. You can reschedule or cancel from your client portal. Cancellations within 24 hours of the appointment may incur a small short-notice fee.' },
    { question: 'Are your cleaners insured?', answer: 'Yes. All our cleaners are fully insured and vetted. We carry public liability insurance for your peace of mind.' },
    { question: 'Do you offer regular cleaning schedules?', answer: 'Absolutely. Choose weekly, fortnightly, or monthly cleans when booking. Regular clients enjoy priority scheduling and loyalty points.' },
    { question: 'What areas do you cover?', answer: 'We cover London and Greater Manchester, including Central, North, South, East and West London. Enter your postcode when booking to confirm we serve your area.' },
  ],
  residential: [
    { question: 'What is included in a residential clean?', answer: 'Our residential cleaning covers all living areas including kitchens, bathrooms, bedrooms, and common areas. We dust, vacuum, mop, and sanitise surfaces throughout.' },
    { question: 'How long does a residential clean take?', answer: 'A standard residential clean typically takes 2-4 hours depending on the size of your home and the level of cleaning required.' },
    { question: 'Can I customise what gets cleaned?', answer: 'Yes. Add extras like oven cleaning, fridge cleaning, or inside windows when booking. You can also leave special instructions for your cleaner.' },
  ],
  about: [
    { question: 'How long has CiN Cleaning been operating?', answer: 'CiN Cleaning is an established professional cleaning company serving London and Greater Manchester, built on quality service and client trust.' },
    { question: 'How do you vet your cleaners?', answer: 'Every cleaner undergoes identity verification, reference checks, and a thorough interview process before joining our team.' },
  ],
  pricing: [
    { question: 'Do you charge per hour or per job?', answer: 'It depends on the service. Standard and residential cleans are hourly. Deep cleans, end-of-tenancy, and commercial cleans are quoted per job based on property details.' },
    { question: 'Is there a minimum booking time?', answer: 'Yes, most services have a 2-hour minimum to ensure we can deliver a thorough clean.' },
    { question: 'Do you require a deposit?', answer: 'Yes, a 40% deposit is required to secure your booking and guarantee your cleaner arrives at the scheduled time. The remainder is due on completion.' },
  ],
};

/** Area landing page schema: a local CleaningService scoped to one town/region. */
function areaService(origin: string, areaName: string, areaSlug: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CleaningService',
    '@id': `${origin}/cleaning-in-${areaSlug}#service`,
    name: `Cleaning Services in ${areaName}`,
    description: `Professional domestic and commercial cleaning in ${areaName} by ${BUSINESS.name}. Vetted, insured cleaners with online booking.`,
    url: `${origin}/cleaning-in-${areaSlug}`,
    telephone: BUSINESS.phone,
    email: BUSINESS.email,
    priceRange: BUSINESS.priceRange,
    openingHours: BUSINESS.openingHours,
    address: BUSINESS.address,
    areaServed: { '@type': 'Place', name: areaName },
    provider: { '@id': `${origin}/#organization` },
    aggregateRating: BUSINESS.aggregateRating,
  };
}

export function buildJsonLdForPage(pageId: SeoPageId, origin: string, areaSlug?: string): string {
  if (!origin) return '';

  const scripts: string[] = [];

  if (pageId === 'area' && areaSlug) {
    const areaName = SERVICE_AREAS[areaSlug];
    if (areaName) {
      scripts.push(
        `<script type="application/ld+json">${JSON.stringify(areaService(origin, areaName, areaSlug))}</script>`
      );
      scripts.push(
        `<script type="application/ld+json">${JSON.stringify(
          breadcrumb(origin, [
            { name: 'Home', path: '/' },
            { name: `Cleaning in ${areaName}`, path: `/cleaning-in-${areaSlug}` },
          ])
        )}</script>`
      );
      scripts.push(
        `<script type="application/ld+json">${JSON.stringify(faqPage(PAGE_FAQS.faq || []))}</script>`
      );
    }
    return scripts.join('\n');
  }

  if (pageId === 'home') {
    scripts.push(
      `<script type="application/ld+json">${JSON.stringify(localBusiness(origin))}</script>`
    );
    scripts.push(
      `<script type="application/ld+json">${JSON.stringify(
        breadcrumb(origin, [{ name: 'Home', path: '/' }])
      )}</script>`
    );
  }

  const svcDef = SERVICE_DEFS[pageId];
  if (svcDef) {
    scripts.push(
      `<script type="application/ld+json">${JSON.stringify(
        cleaningService(origin, svcDef)
      )}</script>`
    );
    scripts.push(
      `<script type="application/ld+json">${JSON.stringify(
        breadcrumb(origin, [
          { name: 'Home', path: '/' },
          { name: 'Services', path: '/residential-cleaning' },
          { name: svcDef.name.split(' Manchester')[0].split(' Service')[0], path: svcDef.path },
        ])
      )}</script>`
    );
  }

  const faqs = PAGE_FAQS[pageId];
  if (faqs) {
    scripts.push(
      `<script type="application/ld+json">${JSON.stringify(faqPage(faqs))}</script>`
    );
  }

  return scripts.join('\n');
}
