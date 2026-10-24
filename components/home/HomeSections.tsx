import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  BadgeCheck,
  CalendarCheck,
  Leaf,
  ShieldCheck,
  Sparkles,
  Star,
  Calculator,
  ThumbsUp,
  Users,
} from 'lucide-react';
import type { GalleryItem } from '../../types';
import { apiClient, getPublicReviews, type PublicReviewsData } from '../../services/api';

/**
 * Homepage building blocks. Everything here renders the same on the server and on first load in the
 * browser; anything fetched (ratings, gallery photos) appears after mount, so hydration stays clean.
 */

/** Promises the site already makes elsewhere (service pages, FAQs, structured data). */
export const TRUST_POINTS = [
  { icon: ShieldCheck, label: 'Fully insured' },
  { icon: BadgeCheck, label: 'Vetted, DBS-checked cleaners' },
  { icon: ThumbsUp, label: '100% satisfaction guarantee' },
];

export function HeroTrustRow() {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-white/90">
      {TRUST_POINTS.map(({ icon: Icon, label }) => (
        <li key={label} className="inline-flex items-center gap-1.5">
          <Icon className="h-4 w-4 text-teal-300" aria-hidden />
          {label}
        </li>
      ))}
    </ul>
  );
}

/** Real star rating once there are enough ratings; renders nothing until then. */
export function HeroRating() {
  const [data, setData] = useState<PublicReviewsData | null>(null);
  useEffect(() => {
    let live = true;
    getPublicReviews()
      .then((d) => live && setData(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (!data || data.averageRating == null || data.reviewCount < 3) return null;
  return (
    <a href="#cin-reviews-title" className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-sm font-bold text-white ring-1 ring-white/20 hover:bg-white/15">
      <span className="inline-flex text-amber-400" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} className="h-4 w-4" fill={i <= Math.round(data.averageRating!) ? 'currentColor' : 'none'} />
        ))}
      </span>
      {data.averageRating.toFixed(1)} from {data.reviewCount} customers
    </a>
  );
}

export function HowItWorks({ onBookNow }: { onBookNow: () => void }) {
  const steps = [
    {
      icon: Calculator,
      title: 'Get your price',
      body: 'Pick a service and the size of your home. Your price appears in under a minute, with no obligation.',
    },
    {
      icon: CalendarCheck,
      title: 'Choose a time',
      body: 'Book online or by phone. Pay a small deposit or the full amount, whichever suits you.',
    },
    {
      icon: Sparkles,
      title: 'Relax, we clean',
      body: 'A vetted, insured cleaner arrives with everything needed. Not happy with anything? We put it right.',
    },
  ];
  return (
    <section className="bg-white border-y border-slate-100">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
        <div className="max-w-2xl">
          <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-50 text-teal-700">
            How it works
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight">A spotless home in three easy steps</h2>
        </div>
        <ol className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-2xl border border-slate-100 bg-slate-50/70 p-6 nn-card-lift">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-white shadow-lg shadow-teal-600/25">
                  <s.icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-sm font-black text-teal-700">Step {i + 1}</span>
              </div>
              <h3 className="mt-4 text-xl font-black text-slate-900">{s.title}</h3>
              <p className="mt-2 text-sm sm:text-base leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={onBookNow}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-teal-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-teal-600/25 hover:bg-teal-500"
        >
          Book your clean <ArrowRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </section>
  );
}

/** Grid and tile sizes for 1 to 4 photos, so the layout never leaves gaps. */
const GRID: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 lg:grid-cols-3 lg:auto-rows-[12rem]',
  4: 'grid-cols-2 lg:grid-cols-4 lg:auto-rows-[12rem]',
};

function tileClass(count: number, i: number): string {
  if (count === 1) return 'h-72 sm:h-96';
  if (count === 2) return 'h-56 sm:h-80';
  if (i === 0) return 'col-span-2 h-56 sm:h-72 lg:row-span-2 lg:h-auto';
  if (count === 4 && i === 3) return 'col-span-2 h-40 lg:h-auto';
  return 'h-40 lg:h-auto';
}

/** Photos from the admin Gallery; hidden when there are none. */
export function RecentWork() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  useEffect(() => {
    let live = true;
    apiClient
      .getGallery()
      .then((rows) => live && setItems((Array.isArray(rows) ? rows : []).filter((r) => r.published !== false).slice(0, 4)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (items.length === 0) return null;
  return (
    <section className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-50 text-teal-700">
            Our work
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl md:text-4xl font-black text-slate-900 tracking-tight">See the difference we make</h2>
        </div>
        <a href="/cleaning-gallery" className="inline-flex items-center gap-1.5 text-sm font-bold text-teal-700 hover:text-teal-800">
          View the full gallery <ArrowRight className="h-4 w-4" aria-hidden />
        </a>
      </div>
      <div className={`mt-8 grid gap-3 sm:gap-4 ${GRID[items.length] ?? GRID[4]}`}>
        {items.map((it, i) => (
          <a key={it.id} href="/cleaning-gallery" className={`group relative overflow-hidden rounded-2xl bg-slate-100 ${tileClass(items.length, i)}`}>
            <img
              src={it.imageUrl}
              alt={it.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/80 to-transparent p-3 pt-10 text-left">
              <span className="block text-sm font-black text-white">{it.title}</span>
              {it.caption && i === 0 ? <span className="mt-0.5 block text-xs text-white/80 line-clamp-1">{it.caption}</span> : null}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}

export function WhyChooseUs() {
  const points = [
    { icon: BadgeCheck, title: 'Vetted & DBS-checked', body: 'Every cleaner is ID-verified, reference-checked and trained to our standard before their first job.' },
    { icon: ShieldCheck, title: 'Fully insured', body: 'Public liability cover on every visit, so your home and belongings are protected.' },
    { icon: Leaf, title: 'Eco-friendly products', body: 'We bring professional, eco-friendly products and equipment. Prefer your own? Just tell us.' },
    { icon: ThumbsUp, title: '100% satisfaction', body: 'If anything is missed, tell us and we will come back and put it right.' },
  ];
  return (
    <section className="bg-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20 grid grid-cols-1 gap-10 lg:grid-cols-5 lg:gap-14 items-center">
        <div className="lg:col-span-2">
          <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-teal-400/10 text-teal-300">
            Why CiN
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl md:text-4xl font-black tracking-tight">Cleaning you never have to check twice</h2>
          <p className="mt-4 text-white/75 leading-relaxed">
            Homeowners, landlords, estate agents and businesses across London and Manchester trust{' '}
            <strong className="text-teal-300">CiN Cleaning</strong> to keep their spaces spotless. Clear communication, reliable teams
            and a finish you can see.
          </p>
          <p className="mt-3 text-sm font-semibold text-teal-200/90">
            <span className="text-teal-300 font-black">C</span>lean · <span className="text-teal-300 font-black">I</span>t ·{' '}
            <span className="text-teal-300 font-black">N</span>eatly: the meaning behind CiN.
          </p>
        </div>
        <div className="lg:col-span-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {points.map((p) => (
            <div key={p.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 transition-colors hover:bg-white/[0.07]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 text-teal-300">
                <p.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 text-lg font-black">{p.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-white/70">{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function ReferralStrip({ onBookNow }: { onBookNow: () => void }) {
  return (
    <section className="max-w-7xl mx-auto px-4 lg:px-8 py-10">
      <div className="flex flex-col gap-4 rounded-2xl border border-teal-200/80 bg-teal-50/60 p-5 sm:flex-row sm:items-center sm:p-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700 shadow-sm">
          <Users className="h-5 w-5" aria-hidden />
        </span>
        <div className="flex-1">
          <h3 className="text-lg font-black text-slate-900">Already a customer? Refer a friend, earn 5%</h3>
          <p className="mt-0.5 text-sm text-slate-700">Share your referral code and earn 5% credit for every friend who books their first clean.</p>
        </div>
        <button type="button" onClick={onBookNow} className="shrink-0 rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-teal-800">
          Book &amp; get your code
        </button>
      </div>
    </section>
  );
}
