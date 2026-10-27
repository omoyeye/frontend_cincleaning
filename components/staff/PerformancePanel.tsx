import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Calendar,
  ClipboardCheck,
  Clock,
  PoundSterling,
  RefreshCw,
  Star,
  ThumbsDown,
  ThumbsUp,
  Timer,
  TrendingUp,
  AlarmClock,
} from 'lucide-react';
import type { StaffPerformance } from '../../types';
import { apiStaff } from '../../services/api';
import { Badge, Callout, Card, cx, EmptyState, Segmented, Spinner } from './StaffUi';

const money = (n: number) => `£${Number(n || 0).toFixed(2)}`;

function hoursLabel(h: number): string {
  const total = Math.round((h || 0) * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return mm ? `${hh}h ${mm}min` : `${hh}h`;
}

function prettyDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function Stars({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={cx('h-3.5 w-3.5', i < Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-slate-200')} />
      ))}
    </span>
  );
}

/** Green / amber / red for a 0-100 score. */
function scoreTone(pct: number | null): string {
  if (pct === null) return 'text-slate-400';
  if (pct >= 90) return 'text-emerald-600';
  if (pct >= 75) return 'text-amber-600';
  return 'text-red-500';
}

function ScoreBar({ label, value }: { label: string; value: number | null }) {
  const pct = value ? (value / 5) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold tabular-nums text-slate-900">{value ? value.toFixed(1) : '-'}</span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-slate-100">
        <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Stacked tile that stays readable two-up on a phone. */
function Tile({ label, value, hint, icon, accent }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: React.ReactNode; accent: string }) {
  return (
    <Card className="!p-4">
      <div className={cx('mb-2 inline-flex h-9 w-9 items-center justify-center rounded-xl', accent)}>{icon}</div>
      <p className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      {hint ? <p className="mt-0.5 text-xs text-slate-500">{hint}</p> : null}
    </Card>
  );
}

type Section = 'overview' | 'reviews' | 'assessments' | 'jobs';

/** "My performance" for cleaners: the same figures the office sees on your profile. */
const PerformancePanel: React.FC = () => {
  const [data, setData] = useState<StaffPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('overview');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await apiStaff.getMyPerformance());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your performance');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-6 w-6" />}
        title="Performance unavailable"
        body={error || 'Please try again in a moment.'}
        action={
          <button type="button" onClick={() => void load()} className="text-sm font-semibold text-primary">
            Try again
          </button>
        }
      />
    );
  }

  const s = data.summary;
  const since = data.staff.joinedAt
    ? new Date(data.staff.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;
  const maxEarned = Math.max(1, ...data.months.map((m) => m.earned));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {since ? `With CiN since ${since}. ` : ''}These are the same figures the office sees.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
          aria-label="Refresh"
        >
          <RefreshCw className={cx('h-4 w-4', loading && 'animate-spin')} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="Jobs completed" value={s.completed} hint={`${s.upcoming} upcoming · ${s.cancelled} cancelled`} icon={<Award className="h-4 w-4" />} accent="bg-emerald-50 text-emerald-600" />
        <Tile label="Client rating" value={s.avgClientRating ? s.avgClientRating.toFixed(1) : '-'} hint={`${s.reviewCount} review${s.reviewCount === 1 ? '' : 's'}`} icon={<Star className="h-4 w-4" />} accent="bg-amber-50 text-amber-600" />
        <Tile
          label="On-time arrivals"
          value={<span className={scoreTone(s.punctualityPercent)}>{s.punctualityPercent === null ? '-' : `${s.punctualityPercent}%`}</span>}
          hint={s.timedJobs ? `from ${s.timedJobs} timed job${s.timedJobs === 1 ? '' : 's'}` : 'clock in to start tracking'}
          icon={<Clock className="h-4 w-4" />}
          accent="bg-sky-50 text-sky-600"
        />
        <Tile label="Supervisor score" value={s.supervisorScore ? s.supervisorScore.toFixed(1) : '-'} hint={`${s.assessmentCount} assessment${s.assessmentCount === 1 ? '' : 's'}`} icon={<ClipboardCheck className="h-4 w-4" />} accent="bg-teal-50 text-teal-600" />
        <Tile label="Hours worked" value={hoursLabel(s.hoursWorked)} hint="completed jobs" icon={<Timer className="h-4 w-4" />} accent="bg-indigo-50 text-indigo-600" />
        <Tile label="This week" value={money(s.weekEarned)} hint="completed Mon to Sun" icon={<Calendar className="h-4 w-4" />} accent="bg-purple-50 text-purple-600" />
        <Tile label="This month" value={money(s.monthEarned)} hint={s.todayScheduled > 0 ? `+ ${money(s.todayScheduled)} booked today` : `${money(s.todayEarned)} today`} icon={<PoundSterling className="h-5 w-5" />} accent="bg-amber-50 text-amber-600" />
        <Tile label="Total earned" value={money(s.totalEarned)} hint={`at ${money(data.staff.hourlyRate)}/hr`} icon={<PoundSterling className="h-4 w-4" />} accent="bg-slate-100 text-slate-700" />
      </div>

      <div className="-mx-1 overflow-x-auto px-1 no-scrollbar">
        <Segmented<Section>
          className="min-w-max"
          value={section}
          onChange={setSection}
          items={[
            { id: 'overview', label: 'Overview' },
            { id: 'reviews', label: 'Reviews', count: data.reviews.length },
            { id: 'assessments', label: 'Assessments', count: data.assessments.length },
            { id: 'jobs', label: 'Jobs' },
          ]}
        />
      </div>

      {section === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="font-semibold text-slate-900">Last six months</p>
            <p className="text-sm text-slate-500">Earnings from completed jobs</p>
            <div className="mt-5 flex items-end gap-2 sm:gap-3">
              {data.months.map((m) => (
                <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
                  <span className="text-[11px] font-semibold tabular-nums text-slate-500">{m.earned ? `£${Math.round(m.earned)}` : ' '}</span>
                  {/* Pixel heights: percentage heights do not resolve inside flex columns. */}
                  <div
                    className={cx('w-full max-w-[2.5rem] rounded-t-lg', m.earned ? 'bg-primary/80' : 'bg-slate-100')}
                    style={{ height: `${Math.round(m.earned ? Math.max(8, (m.earned / maxEarned) * 120) : 4)}px` }}
                    title={`${m.jobs} job${m.jobs === 1 ? '' : 's'}, ${hoursLabel(m.hours)}`}
                  />
                  <span className="text-xs font-medium text-slate-500">{m.label}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="space-y-4">
            <p className="font-semibold text-slate-900">How you are doing</p>
            <div className="grid grid-cols-3 gap-2 text-center sm:gap-3">
              <div className="rounded-xl bg-emerald-50 px-1 py-3">
                <ThumbsUp className="mx-auto h-4 w-4 text-emerald-600" />
                <p className="mt-1 text-xl font-semibold text-emerald-700">{s.compliments}</p>
                <p className="text-[11px] leading-tight text-emerald-700">Compliments</p>
              </div>
              <div className="rounded-xl bg-red-50 px-1 py-3">
                <ThumbsDown className="mx-auto h-4 w-4 text-red-500" />
                <p className="mt-1 text-xl font-semibold text-red-600">{s.complaints}</p>
                <p className="text-[11px] leading-tight text-red-600">Complaints</p>
              </div>
              <div className="rounded-xl bg-amber-50 px-1 py-3">
                <AlarmClock className="mx-auto h-4 w-4 text-amber-600" />
                <p className="mt-1 text-xl font-semibold text-amber-700">{s.lateNotices}</p>
                <p className="text-[11px] leading-tight text-amber-700">Late notices</p>
              </div>
            </div>
            <div className="space-y-3">
              <ScoreBar label="Punctuality (supervisor)" value={s.supervisorBreakdown.punctuality} />
              <ScoreBar label="Quality of work" value={s.supervisorBreakdown.quality} />
              <ScoreBar label="Professionalism" value={s.supervisorBreakdown.professionalism} />
            </div>
            {s.completionRate !== null ? (
              <p className="text-sm text-slate-600">
                You completed <span className="font-semibold text-slate-900">{s.completionRate}%</span> of your finished jobs (the rest were cancelled).
              </p>
            ) : null}
          </Card>

          {s.punctualityPercent !== null && s.punctualityPercent < 90 ? (
            <Callout tone="warning" icon={<Clock className="h-4 w-4" />} title="Tip: arrive a few minutes early" className="lg:col-span-2">
              Arrivals up to 5 minutes after the start count as on time. Tap Start travel when you leave so clients know you are on the way, and use Running late if you are delayed.
            </Callout>
          ) : null}
        </div>
      )}

      {section === 'reviews' && (
        data.reviews.length === 0 ? (
          <EmptyState icon={<Star className="h-6 w-6" />} title="No client reviews yet" body="Ratings appear here after clients review a completed clean." />
        ) : (
          <div className="space-y-3">
            {data.reviews.map((r) => (
              <Card key={r.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars value={r.rating || 0} />
                    <span className="text-sm font-semibold text-slate-900">{r.client}</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {prettyDate(r.date)}
                    {r.ref ? ` · ${r.ref}` : ''}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{r.service}</p>
                {r.feedback ? <p className="mt-2 text-sm leading-relaxed text-slate-700">"{r.feedback}"</p> : null}
              </Card>
            ))}
          </div>
        )
      )}

      {section === 'assessments' && (
        data.assessments.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="h-6 w-6" />} title="No assessments yet" body="When a supervisor reviews your work, their scores and comments appear here." />
        ) : (
          <div className="space-y-3">
            {data.assessments.map((a) => (
              <Card key={a.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Stars value={a.rating} />
                    <span className="text-sm font-semibold text-slate-900">{a.assessorName}</span>
                  </div>
                  <span className="text-xs text-slate-500">
                    {a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {a.punctuality ? <Badge>Punctuality {a.punctuality}/5</Badge> : null}
                  {a.quality ? <Badge>Quality {a.quality}/5</Badge> : null}
                  {a.professionalism ? <Badge>Professionalism {a.professionalism}/5</Badge> : null}
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">{a.remark}</p>
              </Card>
            ))}
          </div>
        )
      )}

      {section === 'jobs' && (
        data.recentJobs.length === 0 ? (
          <EmptyState icon={<Calendar className="h-6 w-6" />} title="No finished jobs yet" body="Completed and cancelled jobs appear here." />
        ) : (
          <Card padded={false} className="divide-y divide-slate-100">
            {data.recentJobs.map((j) => (
              <div key={j.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
                <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {j.client} · {j.service}
                  </p>
                  <p className="text-xs text-slate-500">
                    {prettyDate(j.date)} {j.time}
                    {j.ref ? ` · ${j.ref}` : ''}
                  </p>
                </div>
                {j.onTime === true ? <Badge tone="success">On time</Badge> : null}
                {j.onTime === false && j.minutesLate !== null ? <Badge tone="warning">{j.minutesLate} min late</Badge> : null}
                {j.rating ? <Stars value={j.rating} /> : null}
                <div className="ml-auto text-right">
                  {j.status === 'Cancelled' ? (
                    <Badge tone="danger">Cancelled</Badge>
                  ) : (
                    <>
                      <p className="text-sm font-semibold tabular-nums text-slate-900">{money(j.pay)}</p>
                      <p className="text-xs text-slate-500">{hoursLabel(j.hours)}</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Card>
        )
      )}
    </div>
  );
};

export default PerformancePanel;
