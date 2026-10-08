import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  ExternalLink,
  MapPin,
  Search,
  Star,
  UserCheck,
  UserX,
  Users,
  Zap,
} from 'lucide-react';
import type { Booking, Extra, ServiceConfig, Staff, WeeklyAvailability } from '../../types';
import {
  getBookingStaffIds,
  getLocalWeekMondayToSundayRange,
  getOverlapConflictDetailsForPatchedBooking,
  getTodayYYYYMMDD,
  getTomorrowYYYYMMDD,
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
  /** Saves the team (empty array = unassign). `force` allows a known time clash. */
  onSaveTeam: (booking: Booking, staffIds: number[], force: boolean) => Promise<void>;
  onOpenBooking: (booking: Booking) => void;
}

type QueueId = 'needs' | 'assigned' | 'clashes';

const DAY_KEYS: Array<keyof WeeklyAvailability> = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isOpenJob = (b: Booking) => b.status !== 'Cancelled' && b.status !== 'Completed';

function findService(b: Booking, services: ServiceConfig[]): ServiceConfig | null {
  const hint = String(b.serviceType || '').trim().toLowerCase();
  return services.find((s) => String(s.name || '').trim().toLowerCase() === hint || String(s.id).toLowerCase() === hint) || null;
}

/** UK outward code ("M3 2BW" -> "M3", "SW1A1AA" -> "SW1A"), from a postcode or a free-text address. */
function outwardCode(raw: string | null | undefined): string {
  const m = String(raw || '').toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/);
  return m ? m[1] : '';
}
/** Postcode area letters ("M3" -> "M", "SW1A" -> "SW"). */
const areaOf = (outward: string) => outward.replace(/\d.*$/, '');

const hoursLabel = (h: number) => {
  const r = Math.round(h * 4) / 4;
  return `${Number.isInteger(r) ? r : r.toFixed(2).replace(/0$/, '')}h`;
};

function dayLabel(ymd: string, today: string, tomorrow: string): string {
  if (ymd === today) return 'Today';
  if (ymd === tomorrow) return 'Tomorrow';
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

export default function JobAssignmentPanel({ bookings, staffList, services, extras, conflicts, onSaveTeam, onOpenBooking }: Props) {
  const [queue, setQueue] = useState<QueueId>('needs');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [team, setTeam] = useState<number[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [saving, setSaving] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);

  const today = getTodayYYYYMMDD();
  const tomorrow = getTomorrowYYYYMMDD();
  const nowMs = Date.now();

  /** Every open job with its timing worked out once. */
  const jobs = useMemo(() => {
    return bookings
      .filter(isOpenJob)
      .map((b) => {
        const ymd = normalizeBookingDate(b.date);
        const svc = findService(b, services);
        const { bookedHours } = staffJobPay(b, 0, svc, extras);
        const startMs = parseBookingStartMs(b.date, b.time);
        const start = String(b.time || '').slice(0, 5);
        let end = '';
        if (Number.isFinite(startMs)) {
          const e = new Date(startMs + bookedHours * 3600000);
          end = `${pad2(e.getHours())}:${pad2(e.getMinutes())}`;
        }
        const hoursUntil = Number.isFinite(startMs) ? (startMs - nowMs) / 3600000 : Infinity;
        return { b, ymd, start, end, bookedHours, startMs, hoursUntil, staffIds: getBookingStaffIds(b) };
      })
      .sort((x, y) => (x.ymd + x.start).localeCompare(y.ymd + y.start));
    // nowMs changes every render; urgency only needs to be roughly current.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookings, services, extras]);

  const clashIds = useMemo(() => new Set(conflicts.flatMap((c) => [c.bookingIdA, c.bookingIdB])), [conflicts]);

  const queues = useMemo(() => {
    // Jobs that already finished are not dispatchable; a job still running today stays.
    const upcoming = jobs.filter((j) => j.ymd >= today || j.hoursUntil > -12);
    return {
      needs: jobs.filter((j) => j.staffIds.length === 0),
      assigned: upcoming.filter((j) => j.staffIds.length > 0),
      clashes: jobs.filter((j) => clashIds.has(Number(j.b.id))),
    };
  }, [jobs, clashIds, today]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = queues[queue];
    if (!q) return list;
    return list.filter((j) =>
      [j.b.bookingId, j.b.contact?.name, j.b.serviceType, j.b.address?.postcode, j.b.address?.city]
        .some((v) => String(v ?? '').toLowerCase().includes(q)),
    );
  }, [queues, queue, search]);

  const grouped = useMemo(() => {
    const out: Array<{ label: string; tone: 'past' | 'normal'; items: typeof visible }> = [];
    const past = visible.filter((j) => j.ymd < today);
    if (past.length) out.push({ label: 'Past date, still open', tone: 'past', items: past });
    for (const j of visible.filter((x) => x.ymd >= today)) {
      const label = dayLabel(j.ymd, today, tomorrow);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(j);
      else out.push({ label, tone: 'normal', items: [j] });
    }
    return out;
  }, [visible, today, tomorrow]);

  const selected = useMemo(() => jobs.find((j) => Number(j.b.id) === selectedId) ?? null, [jobs, selectedId]);

  // Pick the first job automatically, and keep a valid selection when lists change.
  useEffect(() => {
    if (selected) return;
    const first = queues[queue][0] ?? queues.needs[0];
    setSelectedId(first ? Number(first.b.id) : null);
  }, [selected, queues, queue]);

  // Reset the team picker to the job's current team whenever the job changes.
  useEffect(() => {
    setTeam(selected ? selected.staffIds : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.b.id, selected?.staffIds.join(',')]);

  /** Per-cleaner fit for the selected job: availability, clashes, workload, distance, rating. */
  const candidates = useMemo(() => {
    if (!selected) return [];
    const job = selected;
    const jobOutward = outwardCode(job.b.address?.postcode);
    const dayKey = DAY_KEYS[new Date(`${job.ymd}T00:00:00`).getDay()];
    const week = getLocalWeekMondayToSundayRange(new Date(`${job.ymd}T00:00:00`));
    const openBookings = bookings.filter((b) => b.status !== 'Cancelled');

    return staffList
      .filter((s) => showInactive || s.status !== 'Inactive' || job.staffIds.includes(Number(s.id)))
      .map((s) => {
        const sid = Number(s.id);
        const clashes = getOverlapConflictDetailsForPatchedBooking(
          bookings,
          { ...job.b, assignedStaffId: sid, assignedStaffIds: [sid] },
          services,
          extras,
        ).filter((d) => d.staffId === sid);

        const slot = s.availability?.[dayKey];
        let availability: { label: string; ok: boolean | null } = { label: 'No availability set', ok: null };
        if (s.availability && slot) {
          if (!slot.active) availability = { label: `Off on ${dayKey}`, ok: false };
          else if ((slot.start && job.start < slot.start) || (slot.end && job.end && job.end > slot.end))
            availability = { label: `Works ${slot.start}–${slot.end}`, ok: false };
          else availability = { label: `Available ${slot.start}–${slot.end}`, ok: true };
        }

        const mine = openBookings.filter((b) => getBookingStaffIds(b).includes(sid));
        const sameDay = mine.filter((b) => normalizeBookingDate(b.date) === job.ymd && Number(b.id) !== Number(job.b.id)).length;
        const weekHours = mine
          .filter((b) => {
            const d = normalizeBookingDate(b.date);
            return d >= week.start && d <= week.end && Number(b.id) !== Number(job.b.id);
          })
          .reduce((sum, b) => sum + staffJobPay(b, 0, findService(b, services), extras).yourHours, 0);

        const staffOutward = outwardCode(s.postcode) || outwardCode(s.address);
        let distance: { label: string; score: number } = { label: 'Location not set', score: 3 };
        if (jobOutward && staffOutward) {
          if (staffOutward === jobOutward) distance = { label: `Lives in ${jobOutward}`, score: 0 };
          else if (areaOf(staffOutward) === areaOf(jobOutward)) distance = { label: `Same area (${staffOutward})`, score: 1 };
          else distance = { label: `Based in ${staffOutward}`, score: 2 };
        }

        const rated = mine.filter((b) => b.status === 'Completed' && Number(b.rating) > 0);
        const rating = rated.length ? rated.reduce((sum, b) => sum + Number(b.rating), 0) / rated.length : null;

        // Lower is better: clashes and days off sink, then distance, then lighter week.
        const score =
          (clashes.length ? 1000 : 0) +
          (availability.ok === false ? 200 : 0) +
          (s.status === 'Inactive' ? 500 : 0) +
          distance.score * 20 +
          Math.min(weekHours, 40) -
          (rating ?? 0);

        return { staff: s, sid, clashes, availability, sameDay, weekHours, distance, rating, score };
      })
      .sort((a, b) => a.score - b.score || a.staff.name.localeCompare(b.staff.name));
  }, [selected, staffList, bookings, services, extras, showInactive]);

  const bestId = candidates.find((c) => !c.clashes.length && c.availability.ok !== false && c.staff.status !== 'Inactive')?.sid;
  const teamClashes = candidates.filter((c) => team.includes(c.sid) && c.clashes.length > 0);
  const teamChanged = selected ? [...team].sort().join(',') !== [...selected.staffIds].sort().join(',') : false;

  const selectJob = (id: number) => {
    setSelectedId(id);
    if (window.matchMedia('(max-width: 1279px)').matches) {
      setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  };

  const save = async (ids: number[]) => {
    if (!selected) return;
    let force = false;
    const clashing = candidates.filter((c) => ids.includes(c.sid) && c.clashes.length > 0);
    if (clashing.length) {
      const lines = clashing
        .flatMap((c) => c.clashes.map((d) => `• ${c.staff.name} is already on ${d.otherWindowLabel}`))
        .join('\n');
      if (!window.confirm(`Time clash:\n\n${lines}\n\nAssign anyway?`)) return;
      force = true;
    }
    if (ids.length === 0) {
      const names = candidates.filter((c) => selected.staffIds.includes(c.sid)).map((c) => c.staff.name).join(', ');
      if (!window.confirm(`Remove ${names || 'everyone'} from this job? It goes back to "Needs a cleaner".`)) return;
    }
    setSaving(true);
    const savedId = Number(selected.b.id);
    const wasUnassigned = selected.staffIds.length === 0;
    try {
      await onSaveTeam(selected.b, ids, force);
      // Dispatch flow: after filling a job, move straight on to the next one that needs a cleaner.
      if (wasUnassigned && ids.length > 0 && queue === 'needs') {
        const next = queues.needs.find((j) => Number(j.b.id) !== savedId);
        setSelectedId(next ? Number(next.b.id) : null);
      }
    } catch {
      // The dashboard already showed the error message.
    } finally {
      setSaving(false);
    }
  };

  const urgentCount = queues.needs.filter((j) => j.hoursUntil <= 24).length;
  const staffName = (id: number) => staffList.find((s) => Number(s.id) === id)?.name || `Staff #${id}`;

  const tabs: Array<{ id: QueueId; label: string; count: number; tone: string }> = [
    { id: 'needs', label: 'Needs a cleaner', count: queues.needs.length, tone: 'amber' },
    { id: 'assigned', label: 'Assigned', count: queues.assigned.length, tone: 'blue' },
    { id: 'clashes', label: 'Clashes', count: queues.clashes.length, tone: 'red' },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tight">Job Assignment</h3>
          <p className="text-sm font-medium text-slate-500 mt-1">Pick a job, then choose who does it. Best matches are listed first.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-black ${queues.needs.length ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>
            <UserX className="w-4 h-4" /> {queues.needs.length ? `${queues.needs.length} need a cleaner` : 'Every job has a cleaner'}
          </span>
          {urgentCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700">
              <Zap className="w-4 h-4" /> {urgentCount} within 24h
            </span>
          )}
          {queues.clashes.length > 0 && (
            <button type="button" onClick={() => setQueue('clashes')} className="inline-flex items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-black text-red-700 hover:bg-red-50">
              <AlertTriangle className="w-4 h-4" /> {queues.clashes.length} jobs clash
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] gap-6 items-start">
        {/* Job queue */}
        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden xl:sticky xl:top-20">
          <div className="p-3 border-b border-slate-100 space-y-3">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Job lists">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={queue === t.id}
                  onClick={() => setQueue(t.id)}
                  className={`rounded-lg px-2 py-2 text-[11px] font-black transition-colors ${queue === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {t.label}
                  <span className={`ml-1 tabular-nums ${t.count && t.id !== 'assigned' ? (t.id === 'clashes' ? 'text-red-600' : 'text-amber-600') : 'text-slate-400'}`}>{t.count}</span>
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search client, ref, postcode..."
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="max-h-[50vh] xl:max-h-[calc(100vh-15rem)] overflow-y-auto">
            {grouped.length === 0 ? (
              <div className="p-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-2" />
                <p className="font-black text-slate-700 text-sm">
                  {search ? 'Nothing matches your search' : queue === 'needs' ? 'All caught up' : queue === 'clashes' ? 'No clashes' : 'No upcoming assigned jobs'}
                </p>
              </div>
            ) : (
              grouped.map((g) => (
                <div key={g.label}>
                  <div className={`sticky top-0 z-[1] px-4 py-1.5 text-[10px] font-black uppercase tracking-widest ${g.tone === 'past' ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                    {g.label}
                  </div>
                  {g.items.map((j) => {
                    const active = Number(j.b.id) === selectedId;
                    const urgent = j.staffIds.length === 0 && j.hoursUntil <= 24;
                    return (
                      <button
                        key={j.b.id}
                        type="button"
                        onClick={() => selectJob(Number(j.b.id))}
                        aria-current={active ? 'true' : undefined}
                        className={`w-full text-left px-4 py-3 border-b border-slate-100 transition-colors ${active ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-slate-900 tabular-nums">
                            {j.start}
                            {j.end ? `–${j.end}` : ''}
                          </span>
                          <span className="flex items-center gap-1">
                            {clashIds.has(Number(j.b.id)) && <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[9px] font-black text-red-700">CLASH</span>}
                            {urgent && <span className="rounded-md bg-red-600 px-1.5 py-0.5 text-[9px] font-black text-white">URGENT</span>}
                            {j.b.status === 'Pending' && <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[9px] font-black text-amber-800">PENDING</span>}
                          </span>
                        </div>
                        <div className="text-sm font-bold text-slate-800 truncate mt-0.5">{j.b.contact?.name || 'Client'}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {[j.b.serviceType, hoursLabel(j.bookedHours), j.b.address?.postcode].filter(Boolean).join(' · ')}
                        </div>
                        {j.staffIds.length > 0 && (
                          <div className="text-[11px] font-bold text-blue-700 truncate mt-0.5">
                            <Users className="inline w-3 h-3 -mt-0.5 mr-0.5" /> {j.staffIds.map(staffName).join(', ')}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Selected job + team picker */}
        <section ref={detailRef} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden scroll-mt-20">
          {!selected ? (
            <div className="p-12 text-center">
              <UserCheck className="w-14 h-14 text-slate-200 mx-auto mb-3" />
              <p className="font-black text-slate-800">Pick a job from the list</p>
              <p className="text-sm text-slate-500 mt-1">Its details and the best cleaners for it will show here.</p>
            </div>
          ) : (
            <>
              <div className="p-5 sm:p-6 border-b border-slate-100 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">{selected.b.bookingId || `Booking #${selected.b.id}`}</p>
                    <h4 className="text-2xl font-black text-slate-900 truncate">{selected.b.contact?.name || 'Client'}</h4>
                    <p className="text-sm font-bold text-slate-500">{selected.b.serviceType}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenBooking(selected.b)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Full booking
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><CalendarClock className="w-3 h-3" /> When</div>
                    <div className="text-sm font-black text-slate-800 mt-0.5">{dayLabel(selected.ymd, today, tomorrow)}</div>
                    <div className="text-xs font-bold text-slate-500 tabular-nums">
                      {selected.start}
                      {selected.end ? `–${selected.end}` : ''} · {hoursLabel(selected.bookedHours)}
                    </div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3 min-w-0">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><MapPin className="w-3 h-3" /> Where</div>
                    <div className="text-sm font-black text-slate-800 mt-0.5 truncate">{selected.b.address?.line1 || 'Address not given'}</div>
                    <div className="text-xs font-bold text-slate-500 truncate">{[selected.b.address?.city, selected.b.address?.postcode].filter(Boolean).join(', ')}</div>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-3">
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Job</div>
                    <div className="text-sm font-black text-slate-800 mt-0.5">£{Number(selected.b.totalPrice || 0).toFixed(2)}</div>
                    <div className="text-xs font-bold text-slate-500">
                      {[selected.b.propertyDetails?.bedrooms != null ? `${selected.b.propertyDetails.bedrooms} bed` : '', selected.b.propertyDetails?.bathrooms != null ? `${selected.b.propertyDetails.bathrooms} bath` : '', selected.b.status]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                </div>
                {selected.b.instructions && (
                  <p className="rounded-xl border border-amber-100 bg-amber-50/60 px-3 py-2 text-xs font-medium text-amber-900">
                    <span className="font-black">Client note:</span> {selected.b.instructions}
                  </p>
                )}
              </div>

              <div className="p-5 sm:p-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h5 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Choose cleaners (tap to add or remove)</h5>
                  <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 cursor-pointer select-none">
                    <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
                    Show inactive staff
                  </label>
                </div>

                {candidates.length === 0 ? (
                  <p className="text-sm text-slate-500 rounded-xl bg-slate-50 p-4">No active staff. Add cleaners under Staffing first.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {candidates.map((c) => {
                      const picked = team.includes(c.sid);
                      return (
                        <button
                          key={c.sid}
                          type="button"
                          onClick={() => setTeam((prev) => (prev.includes(c.sid) ? prev.filter((x) => x !== c.sid) : [...prev, c.sid]))}
                          aria-pressed={picked}
                          className={`text-left rounded-2xl border p-3.5 transition-all ${
                            picked ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20' : c.clashes.length ? 'border-red-200 bg-red-50/30 hover:border-red-300' : 'border-slate-200 bg-white hover:border-blue-300'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black shrink-0 overflow-hidden ${picked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                              {picked ? (
                                <CheckCircle2 className="w-5 h-5" />
                              ) : c.staff.imageUrl || c.staff.profilePhoto ? (
                                <img src={c.staff.imageUrl || c.staff.profilePhoto} alt="" className="w-full h-full object-cover" />
                              ) : (
                                c.staff.name.charAt(0).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-black text-sm text-slate-900 truncate">{c.staff.name}</span>
                                {c.sid === bestId && <span className="rounded-md bg-emerald-600 px-1.5 py-0.5 text-[9px] font-black text-white shrink-0">BEST MATCH</span>}
                                {c.staff.status === 'Inactive' && <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[9px] font-black text-slate-600 shrink-0">INACTIVE</span>}
                              </div>
                              <div className="text-[11px] font-medium text-slate-500 flex flex-wrap gap-x-2">
                                <span>{c.staff.role}</span>
                                {c.rating != null && (
                                  <span className="inline-flex items-center gap-0.5"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{c.rating.toFixed(1)}</span>
                                )}
                                <span>£{Number(c.staff.hourlyRate || 0).toFixed(2)}/hr</span>
                              </div>
                            </div>
                          </div>
                          <div className="mt-2.5 flex flex-wrap gap-1.5 text-[10px] font-bold">
                            {c.clashes.length > 0 ? (
                              <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-red-700">
                                <AlertTriangle className="inline w-3 h-3 -mt-0.5" /> Busy: {c.clashes[0].otherWindowLabel.replace(/^\d{4}-\d{2}-\d{2}\s*/, '')}
                              </span>
                            ) : (
                              <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-emerald-700">Free at this time</span>
                            )}
                            <span className={`rounded-md px-1.5 py-0.5 ${c.availability.ok === false ? 'bg-amber-100 text-amber-800' : c.availability.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                              {c.availability.label}
                            </span>
                            <span className={`rounded-md px-1.5 py-0.5 ${c.distance.score <= 1 ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                              <MapPin className="inline w-3 h-3 -mt-0.5" /> {c.distance.label}
                            </span>
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-600">
                              {c.sameDay ? `${c.sameDay} other ${c.sameDay === 1 ? 'job' : 'jobs'} that day · ` : ''}
                              {hoursLabel(c.weekHours)} this week
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur px-5 sm:px-6 py-3 flex flex-wrap items-center gap-3">
                <div className="text-xs font-bold text-slate-600 flex-1 min-w-[10rem]">
                  {team.length === 0 ? (
                    <span className="text-slate-400">No one selected</span>
                  ) : (
                    <>
                      Team: <span className="text-slate-900">{team.map(staffName).join(', ')}</span>
                      {team.length > 1 && <span className="text-slate-400"> · {hoursLabel(selected.bookedHours / team.length)} each</span>}
                    </>
                  )}
                  {teamClashes.length > 0 && (
                    <div className="text-red-600 mt-0.5">
                      <AlertTriangle className="inline w-3 h-3 -mt-0.5" /> {teamClashes.map((c) => c.staff.name).join(', ')} already busy then
                    </div>
                  )}
                </div>
                {selected.staffIds.length > 0 && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void save([])}
                    className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 text-xs font-black hover:bg-red-50 disabled:opacity-50"
                  >
                    Unassign all
                  </button>
                )}
                <button
                  type="button"
                  disabled={saving || team.length === 0 || !teamChanged}
                  onClick={() => void save(team)}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700 disabled:opacity-40 shadow-lg shadow-blue-600/20"
                >
                  {saving
                    ? 'Saving...'
                    : selected.staffIds.length === 0
                      ? `Assign ${team.length || ''} ${team.length === 1 ? 'cleaner' : 'cleaners'}`.replace('  ', ' ')
                      : 'Update team'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
