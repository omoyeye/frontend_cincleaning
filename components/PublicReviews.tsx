import React, { useEffect, useState } from 'react';
import { BadgeCheck, Star } from 'lucide-react';
import { getPublicReviews, type PublicReviewsData } from '../services/api';

/** Below this many ratings the average is not shown (one or two ratings say little). */
const MIN_RATINGS_FOR_AVERAGE = 3;

function Stars({ value, size = 'h-4 w-4' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = Math.max(0, Math.min(1, value - (i - 1)));
        return (
          <span key={i} className={`relative inline-block ${size}`}>
            <Star className={`absolute inset-0 ${size} text-slate-200`} fill="currentColor" strokeWidth={0} />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star className={`${size} text-amber-400`} fill="currentColor" strokeWidth={0} />
            </span>
          </span>
        );
      })}
    </span>
  );
}

const monthYear = (ymd: string | null) => (ymd ? new Date(`${ymd}T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : '');

/**
 * Genuine customer reviews: the average covers every rating left after a clean, and the cards are
 * comments customers agreed to publish (an admin can hide any). Renders nothing until there is
 * something real to show.
 */
export default function PublicReviews({ title = 'What our customers say', className = '' }: { title?: string; className?: string }) {
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

  if (!data) return null;
  const showAverage = data.averageRating != null && data.reviewCount >= MIN_RATINGS_FOR_AVERAGE;
  const cards = data.reviews.slice(0, 6);
  if (!showAverage && cards.length === 0) return null;

  return (
    <section className={`max-w-7xl mx-auto px-4 lg:px-8 py-14 md:py-20 ${className}`} aria-labelledby="cin-reviews-title">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <span className="inline-flex text-[11px] sm:text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full bg-amber-50 text-amber-700">
            Reviews
          </span>
          <h2 id="cin-reviews-title" className="mt-3 text-2xl sm:text-3xl font-black text-slate-900">
            {title}
          </h2>
          <p className="mt-2 text-slate-600 text-sm sm:text-base">Real feedback from customers after their clean.</p>
        </div>
        {showAverage ? (
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-4xl font-black tabular-nums text-slate-900">{data.averageRating!.toFixed(1)}</p>
            <div>
              <Stars value={data.averageRating!} size="h-5 w-5" />
              <p className="mt-1 text-xs font-semibold text-slate-500">
                From {data.reviewCount} customer rating{data.reviewCount === 1 ? '' : 's'}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {cards.length > 0 ? (
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((r) => (
            <figure key={r.id} className="flex flex-col rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
              <Stars value={r.rating} />
              <blockquote className="mt-3 flex-1 text-sm leading-relaxed text-slate-700 sm:text-base">“{r.comment}”</blockquote>
              <figcaption className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-900">{r.name}</p>
                  <p className="truncate text-xs text-slate-500">{[r.service, r.area, monthYear(r.date)].filter(Boolean).join(' · ')}</p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold text-teal-700" title="Left by a customer after a completed booking">
                  <BadgeCheck className="h-4 w-4" /> Verified booking
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </section>
  );
}
