import React, { useState, useEffect, useCallback } from 'react';
import { Star, Filter, ChevronLeft, ChevronRight, Users, MessageSquare, Calendar, TrendingUp } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Review {
  id: number;
  bookingId: string | null;
  customerName: string;
  serviceType: string;
  date: string;
  rating: number;
  feedback: string | null;
  staffNames: string[];
}

interface ReviewsData {
  reviews: Review[];
  total: number;
  page: number;
  limit: number;
  avgRating: number | null;
  distribution: Record<number, number>;
}

interface ReviewsPanelProps {
  /** 'admin' uses apiAdmin; 'staff' uses apiStaff */
  role: 'admin' | 'staff';
  /** The api object (apiAdmin or apiStaff) passed in — avoids a hard import */
  api: { getReviews: (params?: { page?: number; limit?: number; rating?: number; sort?: string }) => Promise<ReviewsData> };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const StarRating: React.FC<{ value: number; max?: number; size?: 'sm' | 'md' | 'lg' }> = ({ value, max = 5, size = 'md' }) => {
  const dim = size === 'lg' ? 'w-7 h-7' : size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5';
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }, (_, i) => {
        const filled = i + 1 <= value;
        return (
          <Star
            key={i}
            className={`${dim} transition-colors ${filled ? 'fill-amber-400 text-amber-400' : 'fill-slate-100 text-slate-300'}`}
          />
        );
      })}
    </div>
  );
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');
}

function formatDate(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

const SERVICE_PALETTE: Record<string, string> = {
  standard: 'bg-blue-100 text-blue-700',
  deep: 'bg-violet-100 text-violet-700',
  end_of_tenancy: 'bg-rose-100 text-rose-700',
  airbnb: 'bg-cyan-100 text-cyan-700',
  commercial: 'bg-amber-100 text-amber-700',
  jet_washing: 'bg-teal-100 text-teal-700',
};

function serviceLabel(type: string): string {
  const map: Record<string, string> = {
    standard: 'Standard Clean',
    deep: 'Deep Clean',
    end_of_tenancy: 'End of Tenancy',
    airbnb: 'Airbnb / Short-let',
    commercial: 'Commercial',
    jet_washing: 'Jet Washing',
  };
  return map[type?.toLowerCase()] ?? type?.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) ?? 'Cleaning';
}

function serviceColorClass(type: string): string {
  return SERVICE_PALETTE[type?.toLowerCase()] ?? 'bg-slate-100 text-slate-600';
}

const AVATAR_COLORS = [
  'from-violet-500 to-indigo-500',
  'from-emerald-500 to-teal-500',
  'from-rose-500 to-pink-500',
  'from-amber-500 to-yellow-400',
  'from-cyan-500 to-sky-500',
  'from-fuchsia-500 to-purple-500',
];

function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// ─── Sub-components ───────────────────────────────────────────────────────────
const StatBar: React.FC<{ avgRating: number | null; total: number; distribution: Record<number, number> }> = ({ avgRating, total, distribution }) => {
  const pct = (n: number) => (total > 0 ? Math.round(((distribution[n] ?? 0) / total) * 100) : 0);
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0B1120] to-[#1a2340] p-6 md:p-8 shadow-2xl mb-8">
      {/* Decorative blur orbs */}
      <div className="pointer-events-none absolute -top-16 -left-16 h-64 w-64 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-12 -right-12 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />

      <div className="relative z-10 flex flex-col gap-6 md:flex-row md:items-center md:gap-12">
        {/* Average score */}
        <div className="flex flex-col items-center justify-center rounded-2xl bg-white/5 border border-white/10 px-8 py-6 shrink-0 text-center backdrop-blur-sm">
          <div className="text-6xl font-black text-white leading-none tracking-tight">
            {avgRating !== null ? avgRating.toFixed(1) : '—'}
          </div>
          <div className="mt-2">
            <StarRating value={avgRating ?? 0} size="md" />
          </div>
          <div className="mt-2 text-[10px] font-black uppercase tracking-widest text-white/50">
            {total} review{total !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Distribution bars */}
        <div className="flex-1 space-y-2.5">
          {[5, 4, 3, 2, 1].map(star => {
            const count = distribution[star] ?? 0;
            const percent = pct(star);
            return (
              <div key={star} className="flex items-center gap-3">
                <div className="flex items-center gap-1 shrink-0 w-8">
                  <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                  <span className="text-[11px] font-black text-white/70">{star}</span>
                </div>
                <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-yellow-300 transition-all duration-700"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="text-[11px] font-bold text-white/50 w-7 text-right">{count}</span>
              </div>
            );
          })}
        </div>

        {/* Quick stats */}
        <div className="hidden lg:flex flex-col gap-3 shrink-0">
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-5 py-4">
            <TrendingUp className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-white">{pct(5)}% five-star</div>
              <div className="text-[10px] text-white/40 font-medium">of all reviews</div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-5 py-4">
            <MessageSquare className="w-5 h-5 text-sky-400 shrink-0" />
            <div>
              <div className="text-xs font-bold text-white">{total} total</div>
              <div className="text-[10px] text-white/40 font-medium">reviews collected</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const ReviewCard: React.FC<{ review: Review }> = ({ review }) => {
  const grad = avatarGradient(review.customerName || 'C');
  return (
    <article className="group relative overflow-hidden rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300 animate-in fade-in slide-in-from-bottom-4">
      {/* Left accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-3xl"
        style={{
          background: review.rating >= 4
            ? 'linear-gradient(to bottom, #f59e0b, #fbbf24)'
            : review.rating === 3
              ? 'linear-gradient(to bottom, #64748b, #94a3b8)'
              : 'linear-gradient(to bottom, #f87171, #ef4444)',
        }}
      />

      <div className="pl-5 pr-5 pt-5 pb-5">
        {/* Header row */}
        <div className="flex items-start gap-3 mb-4">
          {/* Avatar */}
          <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${grad} flex items-center justify-center text-white font-black text-sm shrink-0 shadow-sm`}>
            {getInitials(review.customerName || 'Customer')}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-black text-slate-900 text-sm truncate leading-tight">{review.customerName || 'Anonymous'}</h3>
              {review.bookingId && (
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5">
                  #{review.bookingId}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <StarRating value={review.rating} size="sm" />
              <span className="text-[10px] font-black text-amber-600">{review.rating}/5</span>
            </div>
          </div>
        </div>

        {/* Feedback quote */}
        {review.feedback ? (
          <div className="relative mb-4">
            <div className="absolute -top-1 -left-0.5 text-5xl leading-none text-amber-200 font-serif select-none">"</div>
            <blockquote className="pl-5 text-sm text-slate-700 font-medium leading-relaxed italic line-clamp-4">
              {review.feedback}
            </blockquote>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 italic mb-4">No written feedback left.</p>
        )}

        {/* Footer meta */}
        <div className="flex flex-wrap gap-2 items-center pt-3 border-t border-slate-50">
          <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest rounded-full px-2.5 py-1 ${serviceColorClass(review.serviceType)}`}>
            {serviceLabel(review.serviceType)}
          </span>

          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
            <Calendar className="w-3 h-3 shrink-0" />
            {formatDate(review.date)}
          </div>

          {review.staffNames.length > 0 && (
            <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 ml-auto">
              <Users className="w-3 h-3 shrink-0" />
              <span className="truncate max-w-[140px]">{review.staffNames.join(', ')}</span>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

const EmptyState: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center animate-in fade-in">
      <div className="w-20 h-20 rounded-3xl bg-amber-50 flex items-center justify-center mb-6 shadow-sm">
        <Star className="w-9 h-9 text-amber-300" />
      </div>
      <h3 className="text-lg font-black text-slate-800 mb-2">No reviews yet</h3>
      <p className="text-sm text-slate-500 max-w-xs font-medium">
        Reviews will appear here once clients rate their completed bookings.
      </p>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const ReviewsPanel: React.FC<ReviewsPanelProps> = ({ api }) => {
  const LIMIT = 12;
  const [data, setData] = useState<ReviewsData | null>(null);
  const [page, setPage] = useState(1);
  const [ratingFilter, setRatingFilter] = useState<number | undefined>(undefined);
  const [sort, setSort] = useState<string>('newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReviews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getReviews({ page, limit: LIMIT, rating: ratingFilter, sort });
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load reviews');
    } finally {
      setLoading(false);
    }
  }, [api, page, ratingFilter, sort]);

  useEffect(() => { void fetchReviews(); }, [fetchReviews]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  const handleRatingFilter = (r: number | undefined) => {
    setRatingFilter(r);
    setPage(1);
  };

  const handleSort = (s: string) => {
    setSort(s);
    setPage(1);
  };

  return (
    <div className="min-h-0 w-full max-w-6xl mx-auto px-0 md:px-8 pt-8 pb-24">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-black text-slate-900 flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-10 h-10 rounded-2xl bg-amber-100 text-amber-600 shrink-0">
            <Star className="w-5 h-5 fill-amber-400" />
          </span>
          Customer Reviews
        </h1>
        <p className="text-slate-500 text-sm font-medium mt-1">Ratings and feedback from completed bookings.</p>
      </div>

      {/* Stats Bar */}
      {data && (
        <StatBar
          avgRating={data.avgRating}
          total={data.total}
          distribution={data.distribution}
        />
      )}

      {/* Filter & Sort bar */}
      <div className="flex flex-wrap items-center gap-1 md:gap-2 mb-6">
        <div className="flex items-center gap-1 md:gap-1.5 text-slate-400 shrink-0">
          <Filter className="w-4 h-4" />
          <span className="text-[10px] font-black uppercase tracking-widest">Filter</span>
        </div>

        {/* Star filters */}
        {[undefined, 5, 4, 3, 2, 1].map(r => (
          <button
            key={r ?? 'all'}
            type="button"
            onClick={() => handleRatingFilter(r)}
            className={`inline-flex items-center gap-1 rounded-xl px-2 md:px-3 py-1.5 text-[11px] font-black uppercase tracking-widest border-2 transition-all ${ratingFilter === r
              ? 'border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-200'
              : 'border-slate-100 bg-white text-slate-500 hover:border-amber-200 hover:bg-amber-50'
              }`}
          >
            {r === undefined ? 'All' : (
              <>
                {r}
                <Star className={`w-3 h-3 ${ratingFilter === r ? 'fill-white text-white' : 'fill-amber-400 text-amber-400'}`} />
              </>
            )}
          </button>
        ))}

        {/* Sort select */}
        <div className="ml-auto">
          <select
            value={sort}
            onChange={e => handleSort(e.target.value)}
            className="rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-widest text-slate-600 outline-none focus:border-amber-400 cursor-pointer transition-colors"
          >
            <option value="newest">Newest first</option>
            <option value="highest">Highest rated</option>
            <option value="lowest">Lowest rated</option>
          </select>
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-44 rounded-3xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div className="rounded-3xl bg-red-50 border border-red-100 p-6 text-sm text-red-600 font-bold">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && data && data.reviews.length === 0 && <EmptyState />}

      {/* Review cards grid */}
      {!loading && !error && data && data.reviews.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.reviews.map(review => (
              <ReviewCard key={review.id} review={review} />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-10">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1.5 rounded-xl border-2 border-slate-100 bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-600 hover:border-amber-400 hover:text-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft className="w-4 h-4" /> Prev
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                  .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                    if (idx > 0 && (arr[idx - 1] as number) < p - 1) acc.push('...');
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === '...'
                      ? <span key={`ellipsis-${i}`} className="px-1 text-slate-400 font-bold text-sm">…</span>
                      : (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setPage(p as number)}
                          className={`w-10 h-10 rounded-xl text-[11px] font-black uppercase tracking-widest border-2 transition-all ${page === p
                            ? 'border-amber-500 bg-amber-500 text-white shadow-md shadow-amber-200'
                            : 'border-slate-100 bg-white text-slate-500 hover:border-amber-300'
                            }`}
                        >
                          {p}
                        </button>
                      )
                  )
                }
              </div>

              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1.5 rounded-xl border-2 border-slate-100 bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-widest text-slate-600 hover:border-amber-400 hover:text-amber-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Page info */}
          <p className="text-center text-[11px] text-slate-400 font-bold mt-4">
            Showing {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, data.total)} of {data.total} review{data.total !== 1 ? 's' : ''}
          </p>
        </>
      )}
    </div>
  );
};

export default ReviewsPanel;
