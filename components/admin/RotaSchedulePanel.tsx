import React, { useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, MessageSquare, UserX, Users, Clock } from 'lucide-react';
import type { Booking, Extra, ServiceConfig, Staff, ChatSummary, WeeklyAvailability } from '../../types';
import {
  getBookingStaffIds,
  getTodayYYYYMMDD,
  getYYYYMMDD,
  normalizeBookingDate,
  pad2,
  parseBookingStartMs,
  staffJobPay,
  type StaffScheduleConflict,
} from '../../src/utils/bookingHelpers';

interface Props {
  bookings: Booking[];
  staffList: Staff[];
  services: ServiceConfig[];
  extras: Extra[];
  conflicts: StaffScheduleConflict[];
  chatSummaryById: Map<string, ChatSummary>;
  isLiveChat: (summary: ChatSummary | undefined) => boolean;
  onOpenBooking: (booking: Booking) => void;
  onOpenAssignment: () => void;
}

const DAY_KEYS: Array<keyof WeeklyAvailability> = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const CARD_STYLES: Record<string, string> = {
  Completed: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  Cancelled: 'bg-slate-50 border-slate-200 text-slate-400 line-through',
  Pending: 'bg-amber-50 border-amber-200 text-amber-900',
  Confirmed: 'bg-blue-50 border-blue-200 text-blue-900',
};

function mondayOf(offsetWeeks: number): Date {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offsetWeeks * 7);
  return d;
}

function findService(b: Booking, services: ServiceConfig[]): ServiceConfig | null {
  const hint = String(b.serviceType || '').trim().toLowerCase();
  return services.find((s) => String(s.name || '').trim().toLowerCase() === hint || String(s.id).toLowerCase() === hint) || null;
}

const hoursLabel = (h: number) => {
  const rounded = Math.round(h * 4) / 4;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(2).replace(/0$/, '')}h`;
};

const weekLabel = (offset: number) =>
  offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : offset > 0 ? `In ${offset} weeks` : `${-offset} weeks ago`;

export default function RotaSchedulePanel({
  bookings,
  staffList,
  services,
  extras,
  conflicts,
  chatSummaryById,
  isLiveChat,
  onOpenBooking,
  onOpenAssignment,
}: Props) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showCancelled, setShowCancelled] = useState(false);

  const today = getTodayYYYYMMDD();
  const days = useMemo(() => {
    const monday = mondayOf(weekOffset);
    return DAY_KEYS.map((key, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        key,
        ymd: getYYYYMMDD(d),
        dayName: d.toLocaleDateString('en-GB', { weekday: 'short' }),
        dayDate: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      };
    });
  }, [weekOffset]);

  const rangeLabel = useMemo(() => {
    const first = new Date(`${days[0].ymd}T00:00:00`);
    const last = new Date(`${days[6].ymd}T00:00:00`);
    const sameMonth = first.getMonth() === last.getMonth();
    const a = first.toLocaleDateString('en-GB', sameMonth ? { day: 'numeric' } : { day: 'numeric', month: 'short' });
    const b = last.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${a} to ${b}`;
  }, [days]);

  /** Each booking this week with its local date, start/end clock and booked hours. */
  const weekJobs = useMemo(() => {
    const inWeek = new Set(days.map((d) => d.ymd));
    return bookings
      .map((b) => ({ b, ymd: normalizeBookingDate(b.date) }))
      .filter(({ b, ymd }) => inWeek.has(ymd) && (showCancelled || b.status !== 'Cancelled'))
      .map(({ b, ymd }) => {
        const svc = findService(b, services);
        const { bookedHours, yourHours } = staffJobPay(b, 0, svc, extras);
        const startMs = parseBookingStartMs(b.date, b.time);
        const start = String(b.time || '').slice(0, 5);
        let end = '';
        if (Number.isFinite(startMs)) {
          const e = new Date(startMs + bookedHours * 3600000);
          end = `${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
        }
        return { b, ymd, start, end, bookedHours, yourHours, staffIds: getBookingStaffIds(b) };
      })
      .sort((x, y) => (x.ymd + x.start).localeCompare(y.ymd + y.start));
  }, [bookings, days, services, extras, showCancelled]);

  const conflictKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of conflicts) {
      set.add(`${c.staffId}:${c.bookingIdA}`);
      set.add(`${c.staffId}:${c.bookingIdB}`);
    }
    return set;
  }, [conflicts]);

  // Active staff always show; inactive staff only when they still have jobs this week.
  const rows = useMemo(() => {
    const withJobs = new Set(weekJobs.flatMap((j) => j.staffIds));
    return staffList
      .filter((s) => s.status !== 'Inactive' || withJobs.has(Number(s.id)))
      .map((s) => {
        const jobs = weekJobs.filter((j) => j.staffIds.includes(Number(s.id)));
        const live = jobs.filter((j) => j.b.status !== 'Cancelled');
        return { staff: s, jobs, hours: live.reduce((sum, j) => sum + j.yourHours, 0), jobCount: live.length };
      })
      .sort((a, b) => a.staff.name.localeCompare(b.staff.name));
  }, [staffList, weekJobs]);

  const unassigned = useMemo(() => weekJobs.filter((j) => j.staffIds.length === 0 && j.b.status !== 'Cancelled'), [weekJobs]);
  const liveJobs = weekJobs.filter((j) => j.b.status !== 'Cancelled');
  const weekConflicts = conflicts.filter((c) => liveJobs.some((j) => Number(j.b.id) === c.bookingIdA || Number(j.b.id) === c.bookingIdB));

  const renderCard = (job: (typeof weekJobs)[number], staffId: number | null) => {
    const { b } = job;
    const clash = staffId != null && conflictKeys.has(`${staffId}:${Number(b.id)}`);
    const chat = isLiveChat(chatSummaryById.get(String(b.id)));
    const style = CARD_STYLES[b.status] || CARD_STYLES.Confirmed;
    const multi = job.staffIds.length > 1;
    return (
      <button
        key={`${b.id}-${staffId ?? 'none'}`}
        type="button"
        onClick={() => onOpenBooking(b)}
        title={`${b.bookingId || ''} ${b.serviceType} · ${b.status}${clash ? ' · overlaps another job' : ''}`}
        className={`relative w-full text-left rounded-lg border px-2 py-1.5 transition-shadow hover:shadow-md ${style} ${
          clash ? 'ring-2 ring-red-500 ring-offset-1' : ''
        }`}
      >
        {chat && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-md bg-emerald-500 text-white ring-2 ring-white" title="Client chat activity">
            <MessageSquare className="w-2.5 h-2.5" strokeWidth={2.5} />
          </span>
        )}
        <div className="text-[11px] font-black leading-tight tabular-nums">
          {job.start}
          {job.end ? `–${job.end}` : ''}
        </div>
        <div className="text-[11px] font-bold leading-tight truncate">{b.contact?.name || 'Client'}</div>
        <div className="text-[10px] font-medium leading-tight opacity-70 truncate">
          {[b.address?.postcode, hoursLabel(job.bookedHours), multi ? `${job.staffIds.length} cleaners` : ''].filter(Boolean).join(' · ')}
        </div>
        {clash && (
          <div className="mt-0.5 text-[10px] font-black text-red-600 no-underline flex items-center gap-0.5" style={{ textDecoration: 'none' }}>
            <AlertTriangle className="w-3 h-3" /> Overlap
          </div>
        )}
      </button>
    );
  };

  const emptyCell = (staff: Staff, dayKey: keyof WeeklyAvailability) => {
    const slot = staff.availability?.[dayKey];
    if (staff.availability && slot && !slot.active) {
      return <span className="text-[10px] font-bold uppercase tracking-wider text-slate-300">Off</span>;
    }
    if (slot?.active && slot.start && slot.end) {
      return <span className="text-[10px] font-medium text-slate-400 tabular-nums">Free {slot.start}–{slot.end}</span>;
    }
    return <span className="text-[10px] font-medium text-slate-300">Free</span>;
  };

  const workingOutsideHours = (staff: Staff, dayKey: keyof WeeklyAvailability, jobs: typeof weekJobs) => {
    const slot = staff.availability?.[dayKey];
    if (!staff.availability || !slot) return false;
    if (!slot.active) return jobs.length > 0;
    return jobs.some((j) => (slot.start && j.start < slot.start) || (slot.end && j.end && j.end > slot.end));
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tight">Rota &amp; Schedule</h3>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Who is working when, {rangeLabel}. Click a job to open it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w - 1)}
            className="p-2.5 bg-white rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50"
            aria-label="Previous week"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset(0)}
            disabled={weekOffset === 0}
            className="px-4 py-2.5 bg-white rounded-xl shadow-sm border border-slate-200 font-bold text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-default disabled:hover:bg-white min-w-[7.5rem]"
            title={weekOffset === 0 ? undefined : 'Back to this week'}
          >
            {weekLabel(weekOffset)}
          </button>
          <button
            type="button"
            onClick={() => setWeekOffset((w) => w + 1)}
            className="p-2.5 bg-white rounded-xl shadow-sm border border-slate-200 hover:bg-slate-50"
            aria-label="Next week"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
          <CalendarDays className="w-4 h-4 text-slate-400" /> {liveJobs.length} {liveJobs.length === 1 ? 'job' : 'jobs'}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-xl bg-white border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700">
          <Clock className="w-4 h-4 text-slate-400" /> {hoursLabel(liveJobs.reduce((s, j) => s + j.bookedHours, 0))} booked
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${
            unassigned.length ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-slate-200 text-slate-700'
          }`}
        >
          <UserX className="w-4 h-4" /> {unassigned.length} unassigned
        </span>
        {weekConflicts.length > 0 && (
          <button
            type="button"
            onClick={onOpenAssignment}
            className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700 hover:bg-red-100"
          >
            <AlertTriangle className="w-4 h-4" /> {weekConflicts.length} schedule {weekConflicts.length === 1 ? 'clash' : 'clashes'}: fix in Job Assignment
          </button>
        )}
        <label className="ml-auto inline-flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer select-none">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} className="rounded" />
          Show cancelled
        </label>
      </div>

      {rows.length === 0 && unassigned.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-black text-slate-700">No staff yet</p>
          <p className="text-sm text-slate-500 mt-1">Add cleaners under Staffing and their jobs will appear here.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full min-w-[960px] border-collapse table-fixed">
            <colgroup>
              <col className="w-32 sm:w-44" />
              {days.map((d) => (
                <col key={d.ymd} />
              ))}
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200">
                <th scope="col" className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Staff
                </th>
                {days.map((d) => {
                  const isToday = d.ymd === today;
                  return (
                    <th key={d.ymd} scope="col" className={`px-2 py-3 text-center ${isToday ? 'bg-blue-50' : 'bg-slate-50'}`}>
                      <div className={`text-[10px] font-black uppercase tracking-widest ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>
                        {d.dayName}
                        {isToday ? ' · Today' : ''}
                      </div>
                      <div className={`text-xs font-bold ${isToday ? 'text-blue-700' : 'text-slate-600'}`}>{d.dayDate}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {unassigned.length > 0 && (
                <tr className="border-b border-slate-100 bg-amber-50/40">
                  <th scope="row" className="sticky left-0 z-10 bg-amber-50 px-4 py-3 text-left align-top">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <UserX className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-black text-amber-900">Unassigned</div>
                        <button type="button" onClick={onOpenAssignment} className="text-[11px] font-bold text-amber-700 underline">
                          Assign cleaners
                        </button>
                      </div>
                    </div>
                  </th>
                  {days.map((d) => {
                    const jobs = unassigned.filter((j) => j.ymd === d.ymd);
                    return (
                      <td key={d.ymd} className={`px-1.5 py-2 align-top ${d.ymd === today ? 'bg-blue-50/40' : ''}`}>
                        <div className="space-y-1.5">{jobs.map((j) => renderCard(j, null))}</div>
                      </td>
                    );
                  })}
                </tr>
              )}
              {rows.map(({ staff, jobs, hours, jobCount }) => (
                <tr key={staff.id} className="border-b border-slate-100 last:border-0">
                  <th scope="row" className="sticky left-0 z-10 bg-white px-4 py-3 text-left align-top">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-slate-100 text-slate-500 font-black flex items-center justify-center shrink-0 overflow-hidden border border-slate-200">
                        {staff.imageUrl || staff.profilePhoto ? (
                          <img src={staff.imageUrl || staff.profilePhoto} alt="" className="w-full h-full object-cover" />
                        ) : (
                          staff.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-slate-800 truncate" title={staff.name}>
                          {staff.name}
                        </div>
                        <div className="text-[11px] font-medium text-slate-400">
                          {jobCount ? `${jobCount} ${jobCount === 1 ? 'job' : 'jobs'} · ${hoursLabel(hours)}` : 'No jobs'}
                          {staff.status === 'Inactive' ? ' · Inactive' : ''}
                        </div>
                      </div>
                    </div>
                  </th>
                  {days.map((d) => {
                    const dayJobs = jobs.filter((j) => j.ymd === d.ymd);
                    const outside = workingOutsideHours(staff, d.key, dayJobs.filter((j) => j.b.status !== 'Cancelled'));
                    return (
                      <td
                        key={d.ymd}
                        className={`px-1.5 py-2 align-top h-20 ${d.ymd === today ? 'bg-blue-50/40' : ''}`}
                      >
                        {dayJobs.length > 0 ? (
                          <div className="space-y-1.5">
                            {dayJobs.map((j) => renderCard(j, Number(staff.id)))}
                            {outside && (
                              <div className="text-[10px] font-bold text-amber-700 flex items-center gap-0.5" title="Outside this cleaner's set availability">
                                <AlertTriangle className="w-3 h-3" /> Outside availability
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-full min-h-[3.5rem] flex items-center justify-center">{emptyCell(staff, d.key)}</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-200" /> Confirmed</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-100 border border-amber-200" /> Pending</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-200" /> Completed</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded ring-2 ring-red-500" /> Overlaps another job</span>
        <span className="inline-flex items-center gap-1.5"><span className="text-slate-300 uppercase">Off</span> Not available that day</span>
      </div>
    </div>
  );
}
