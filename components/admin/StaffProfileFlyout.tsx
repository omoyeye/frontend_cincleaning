import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  X,
  MapPin,
  Mail,
  Phone,
  Star,
  Clock,
  Calendar,
  Briefcase,
  PoundSterling,
  ThumbsUp,
  ThumbsDown,
  Award,
  User,
  ClipboardCheck,
  AlarmClock,
  Navigation,
  LogIn,
  LogOut,
  Trash2,
  Landmark,
  Timer,
} from 'lucide-react';
import type { Staff, Booking, ServiceConfig, Extra, StaffAssessment } from '../../types';
import { apiAdmin } from '../../services/api';
import { useFlyer } from '../Flyer';
import {
  getLocalWeekMondayToSundayRange,
  getTodayYYYYMMDD,
  normalizeBookingDate,
  staffJobPay,
} from '../../src/utils/bookingHelpers';

interface Props {
  staff: Staff;
  bookings: Booking[];
  services: ServiceConfig[];
  extras: Extra[];
  onClose: () => void;
  onViewClient?: (email: string) => void;
}

/** Arrivals up to this many minutes after the booked start count as on time. */
const ON_TIME_GRACE_MIN = 5;

type HistoryFilter = 'all' | 'completed' | 'upcoming' | 'cancelled';

const money = (n: number) => `£${n.toFixed(2)}`;

function bookingStartMs(b: Booking): number | null {
  const date = normalizeBookingDate(b.date);
  const m = String(b.time || '').match(/^(\d{1,2}):(\d{2})/);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !m) return null;
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, Number(m[1]), Number(m[2])).getTime();
}

/** Clock time from the staff app: prefer the ISO timestamp, else parse "10:05" / "10:05 AM" on the job date. */
function clockMs(iso: string | undefined, label: string | undefined, b: Booking): number | null {
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) return t;
  }
  const m = String(label || '').match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
  const date = normalizeBookingDate(b.date);
  if (!m || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  let h = Number(m[1]);
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  const [y, mo, d] = date.split('-').map(Number);
  return new Date(y, mo - 1, d, h, Number(m[2])).getTime();
}

const clock = (ms: number | null) =>
  ms === null ? null : new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function hoursLabel(h: number): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}

function Stars({ value, size = 'w-3.5 h-3.5' }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className={`${size} ${i < Math.round(value) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
      ))}
    </span>
  );
}

function StarInput({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs font-bold text-slate-600">{label}</span>
      <span className="inline-flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-label={`${label} ${n} of 5`}
            onClick={() => onChange(value === n ? null : n)}
            className="p-0.5"
          >
            <Star className={`w-5 h-5 ${value !== null && n <= value ? 'text-amber-400 fill-amber-400' : 'text-slate-300'}`} />
          </button>
        ))}
      </span>
    </div>
  );
}

const StaffProfileFlyout: React.FC<Props> = ({ staff, bookings, services, extras, onClose, onViewClient }) => {
  const { showFlyer } = useFlyer();
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [assessments, setAssessments] = useState<StaffAssessment[]>([]);
  const [assessmentsLoading, setAssessmentsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{
    rating: number | null;
    punctuality: number | null;
    quality: number | null;
    professionalism: number | null;
    remark: string;
    bookingId: string;
  }>({ rating: null, punctuality: null, quality: null, professionalism: null, remark: '', bookingId: '' });

  const loadAssessments = useCallback(async () => {
    try {
      setAssessments(await apiAdmin.getStaffAssessments(staff.id));
    } catch {
      setAssessments([]);
    } finally {
      setAssessmentsLoading(false);
    }
  }, [staff.id]);

  useEffect(() => {
    setAssessmentsLoading(true);
    void loadAssessments();
  }, [loadAssessments]);

  const today = getTodayYYYYMMDD();
  const week = getLocalWeekMondayToSundayRange();

  /** Every job assigned to this cleaner, enriched with pay, times and punctuality. */
  const jobs = useMemo(() => {
    return bookings
      .filter((b) => b.assignedStaffId === staff.id || (b.assignedStaffIds || []).includes(staff.id))
      .map((b) => {
        const svc = services.find((s) => String(s.id) === String(b.serviceType) || s.name === b.serviceType) ?? null;
        const pay = staffJobPay(b, staff.hourlyRate, svc, extras);
        const wc = b.workCompletion;
        const start = bookingStartMs(b);
        const arrived = clockMs(wc?.clockInAtIso, wc?.clockInTime, b);
        const left = clockMs(wc?.clockOutAtIso, wc?.clockOutTime, b);
        const setOff = b.enRouteAt ? Date.parse(b.enRouteAt) : null;
        const minutesLate = start !== null && arrived !== null ? Math.round((arrived - start) / 60000) : null;
        const workedHours = arrived !== null && left !== null && left > arrived ? (left - arrived) / 3600000 : null;
        return {
          b,
          date: normalizeBookingDate(b.date),
          pay,
          setOff: Number.isFinite(setOff) ? setOff : null,
          arrived,
          left,
          minutesLate,
          onTime: minutesLate === null ? null : minutesLate <= ON_TIME_GRACE_MIN,
          workedHours,
          lateNotices: Array.isArray(b.lateNotices) ? b.lateNotices : [],
        };
      })
      .sort((a, z) => (z.date + z.b.time).localeCompare(a.date + a.b.time));
  }, [bookings, staff.id, staff.hourlyRate, services, extras]);

  const completed = jobs.filter((j) => j.b.status === 'Completed');
  const upcoming = jobs.filter((j) => j.b.status === 'Pending' || j.b.status === 'Confirmed');
  const cancelled = jobs.filter((j) => j.b.status === 'Cancelled');
  const sum = (list: typeof jobs) => list.reduce((acc, j) => acc + j.pay.pay, 0);

  const totalEarned = sum(completed);
  const hoursWorked = completed.reduce((acc, j) => acc + j.pay.yourHours, 0);
  const weekEarned = sum(completed.filter((j) => j.date >= week.start && j.date <= week.end));
  const todayEarned = sum(completed.filter((j) => j.date === today));
  const todayScheduled = sum(upcoming.filter((j) => j.date === today));
  const todayJobs = jobs.filter((j) => j.date === today);

  const reviews = jobs.filter((j) => (j.b.rating ?? 0) > 0);
  const avgClientRating = reviews.length ? reviews.reduce((a, j) => a + (j.b.rating || 0), 0) / reviews.length : 0;
  const compliments = reviews.filter((j) => (j.b.rating || 0) >= 4);
  const complaints = reviews.filter((j) => (j.b.rating || 0) <= 2);
  const timed = jobs.filter((j) => j.onTime !== null);
  const punctuality = timed.length ? Math.round((timed.filter((j) => j.onTime).length / timed.length) * 100) : null;
  const lateNoticeCount = jobs.reduce((a, j) => a + j.lateNotices.length, 0);
  const avgSupervisor = assessments.length ? assessments.reduce((a, x) => a + x.rating, 0) / assessments.length : 0;

  const firstJobDate = jobs.length ? jobs[jobs.length - 1].date : null;
  const sinceIso = staff.joinedAt || (firstJobDate ? `${firstJobDate}T00:00:00` : null);
  const since = sinceIso ? new Date(sinceIso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  const history = jobs.filter((j) =>
    filter === 'all' ? true : filter === 'completed' ? j.b.status === 'Completed' : filter === 'upcoming' ? upcoming.includes(j) : j.b.status === 'Cancelled',
  );

  const submitAssessment = async () => {
    if (!form.rating) {
      showFlyer('Please give an overall score.', 'error');
      return;
    }
    if (form.remark.trim().length < 3) {
      showFlyer('Please write a short remark.', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiAdmin.createStaffAssessment(staff.id, {
        rating: form.rating,
        punctuality: form.punctuality,
        quality: form.quality,
        professionalism: form.professionalism,
        remark: form.remark.trim(),
        bookingId: form.bookingId ? Number(form.bookingId) : null,
      });
      setForm({ rating: null, punctuality: null, quality: null, professionalism: null, remark: '', bookingId: '' });
      setShowForm(false);
      showFlyer('Assessment saved. The cleaner has been notified.', 'success');
      await loadAssessments();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not save assessment', 'error');
    } finally {
      setSaving(false);
    }
  };

  const removeAssessment = async (id: number) => {
    if (!window.confirm('Delete this assessment?')) return;
    try {
      await apiAdmin.deleteStaffAssessment(id);
      setAssessments((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not delete assessment', 'error');
    }
  };

  const statusBadge = (status: string) =>
    status === 'Completed'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'Cancelled'
        ? 'bg-red-100 text-red-700'
        : status === 'Confirmed'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-amber-100 text-amber-700';

  const availability = staff.availability;
  const bankOnFile = Boolean(staff.accountNumber && staff.sortCode);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${staff.name} profile`}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl bg-slate-50 h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 shrink-0 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-200 overflow-hidden">
                {staff.profilePhoto || staff.imageUrl ? (
                  <img src={staff.profilePhoto || staff.imageUrl} alt={staff.name} className="w-full h-full object-cover" />
                ) : (
                  staff.name.charAt(0)
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-black text-slate-900 truncate">{staff.name}</h2>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">
                  {staff.role}
                  <span className={`ml-2 ${staff.status === 'Active' ? 'text-emerald-600' : 'text-red-500'}`}>{staff.status}</span>
                </p>
                {since && <p className="text-xs font-medium text-slate-500 mt-0.5">With us since {since}</p>}
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors" aria-label="Close profile">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Headline numbers */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Jobs completed', value: String(completed.length), sub: 'since joining', icon: Award, color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Upcoming', value: String(upcoming.length), sub: `${cancelled.length} cancelled`, icon: Calendar, color: 'text-blue-600 bg-blue-50' },
              { label: 'Hours worked', value: hoursLabel(hoursWorked), sub: 'completed jobs', icon: Timer, color: 'text-indigo-600 bg-indigo-50' },
              { label: 'Total earned', value: money(totalEarned), sub: `£${Number(staff.hourlyRate || 0).toFixed(2)}/hr`, icon: PoundSterling, color: 'text-slate-700 bg-slate-100' },
              { label: 'Today earned', value: money(todayEarned), sub: todayScheduled > 0 ? `+ ${money(todayScheduled)} scheduled` : 'completed today', icon: PoundSterling, color: 'text-amber-600 bg-amber-50' },
              { label: 'This week', value: money(weekEarned), sub: 'completed Mon to Sun', icon: Briefcase, color: 'text-purple-600 bg-purple-50' },
              { label: 'Client rating', value: avgClientRating ? avgClientRating.toFixed(1) : '-', sub: `${reviews.length} review${reviews.length === 1 ? '' : 's'}`, icon: Star, color: 'text-amber-600 bg-amber-50' },
              { label: 'Supervisor score', value: avgSupervisor ? avgSupervisor.toFixed(1) : '-', sub: `${assessments.length} assessment${assessments.length === 1 ? '' : 's'}`, icon: ClipboardCheck, color: 'text-teal-600 bg-teal-50' },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 text-center">
                <div className={`inline-flex p-2 rounded-xl ${s.color} mb-2`}>
                  <s.icon className="w-4 h-4" />
                </div>
                <div className="text-lg font-black text-slate-900 tabular-nums">{s.value}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{s.label}</div>
                <div className="text-[10px] font-medium text-slate-400 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Performance */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div>
              <div className={`text-lg font-black ${punctuality === null ? 'text-slate-400' : punctuality >= 90 ? 'text-emerald-600' : punctuality >= 75 ? 'text-amber-600' : 'text-red-500'}`}>
                {punctuality === null ? '-' : `${punctuality}%`}
              </div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">On-time arrivals</div>
            </div>
            <div>
              <div className="text-lg font-black text-emerald-600">{compliments.length}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Compliments</div>
            </div>
            <div>
              <div className="text-lg font-black text-red-500">{complaints.length}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Complaints</div>
            </div>
            <div>
              <div className="text-lg font-black text-amber-600">{lateNoticeCount}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Running-late notices</div>
            </div>
          </div>

          {/* Biodata */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" /> Biodata
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              {[
                { icon: User, label: 'Full name', value: staff.name },
                { icon: Briefcase, label: 'Role', value: `${staff.role} (${staff.status})` },
                { icon: Mail, label: 'Email', value: staff.email || '-' },
                { icon: Phone, label: 'Phone', value: staff.phone || '-' },
                { icon: MapPin, label: 'Address', value: [staff.address, staff.postcode].filter(Boolean).join(', ') || '-' },
                { icon: PoundSterling, label: 'Hourly rate', value: `£${Number(staff.hourlyRate || 0).toFixed(2)}` },
                { icon: Calendar, label: 'Joined', value: since || '-' },
                { icon: Landmark, label: 'Bank details', value: bankOnFile ? `On file${staff.bankName ? ` (${staff.bankName})` : ''}` : 'Missing' },
              ].map((row) => (
                <div key={row.label} className="flex items-start gap-2 min-w-0">
                  <row.icon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <dt className="text-slate-400 font-bold shrink-0">{row.label}:</dt>
                  <dd className={`text-slate-700 font-medium break-words ${row.label === 'Bank details' && !bankOnFile ? 'text-red-500' : ''}`}>{row.value}</dd>
                </div>
              ))}
            </dl>
            {Array.isArray(staff.skills) && staff.skills.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {staff.skills.map((s) => (
                  <span key={s} className="text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 px-2 py-1 rounded-lg">{s}</span>
                ))}
              </div>
            )}
            {availability && (
              <div className="pt-3 border-t border-slate-50">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Weekly availability</div>
                <div className="grid grid-cols-7 gap-1.5">
                  {(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const).map((day) => {
                    const slot = availability[day];
                    return (
                      <div key={day} className={`text-center py-1.5 rounded-lg ${slot?.active ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                        <div className="text-[10px] font-black">{day}</div>
                        <div className="text-[9px] font-medium">{slot?.active ? `${slot.start}-${slot.end}` : 'Off'}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Today */}
          {todayJobs.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Today ({todayJobs.length} job{todayJobs.length === 1 ? '' : 's'})
              </h3>
              {todayJobs.map((j) => (
                <div key={j.b.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-xl px-4 py-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-bold text-slate-900">{j.b.time}</span>
                    <span className="text-slate-500 ml-2">{j.b.contact?.name || 'Client'}</span>
                    <span className="text-slate-400 ml-2 text-xs">{j.b.address?.postcode}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-bold text-slate-600">{money(j.pay.pay)}</span>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${statusBadge(j.b.status)}`}>
                      {j.arrived !== null && j.b.status !== 'Completed' ? 'On site' : j.setOff !== null && j.b.status !== 'Completed' ? 'On the way' : j.b.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Client feedback */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Star className="w-4 h-4 text-slate-400" /> Compliments & complaints from clients ({reviews.length})
            </h3>
            {reviews.length === 0 ? (
              <p className="text-sm text-slate-400 font-medium">No client reviews yet.</p>
            ) : (
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {reviews.map((j) => {
                  const r = j.b.rating || 0;
                  const tone = r >= 4 ? 'bg-emerald-50 text-emerald-600' : r <= 2 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600';
                  return (
                    <div key={j.b.id} className="flex gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                      <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${tone}`}>
                        {r >= 4 ? <ThumbsUp className="w-4 h-4" /> : r <= 2 ? <ThumbsDown className="w-4 h-4" /> : <Star className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">{j.b.contact?.name || 'Client'}</span>
                          <span className="text-[10px] text-slate-400">{j.date}</span>
                          <Stars value={r} size="w-3 h-3" />
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{r >= 4 ? 'Compliment' : r <= 2 ? 'Complaint' : 'Neutral'}</span>
                        </div>
                        {j.b.feedback ? <p className="text-xs text-slate-600 mt-1">"{j.b.feedback}"</p> : <p className="text-xs text-slate-400 mt-1">No written comment.</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Supervisor assessments */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-slate-400" /> Supervisor assessments ({assessments.length})
              </h3>
              {!showForm && (
                <button
                  type="button"
                  onClick={() => setShowForm(true)}
                  className="text-xs font-black uppercase tracking-wider px-3 py-2 rounded-xl bg-slate-900 text-white hover:bg-slate-700"
                >
                  Add assessment
                </button>
              )}
            </div>

            {showForm && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <StarInput label="Overall *" value={form.rating} onChange={(v) => setForm((f) => ({ ...f, rating: v }))} />
                <StarInput label="Punctuality" value={form.punctuality} onChange={(v) => setForm((f) => ({ ...f, punctuality: v }))} />
                <StarInput label="Quality of cleaning" value={form.quality} onChange={(v) => setForm((f) => ({ ...f, quality: v }))} />
                <StarInput label="Professionalism" value={form.professionalism} onChange={(v) => setForm((f) => ({ ...f, professionalism: v }))} />
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">Job (optional)</span>
                  <select
                    value={form.bookingId}
                    onChange={(e) => setForm((f) => ({ ...f, bookingId: e.target.value }))}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">General assessment (not tied to a job)</option>
                    {jobs.map((j) => (
                      <option key={j.b.id} value={j.b.id}>
                        {j.date} {j.b.time} · {j.b.contact?.name || 'Client'} · {j.b.bookingId || `#${j.b.id}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold text-slate-600">Remark *</span>
                  <textarea
                    value={form.remark}
                    onChange={(e) => setForm((f) => ({ ...f, remark: e.target.value }))}
                    rows={3}
                    maxLength={2000}
                    placeholder="What did you observe on the job? Strengths, anything to improve..."
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider text-slate-500 hover:bg-white">
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void submitAssessment()}
                    className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save assessment'}
                  </button>
                </div>
              </div>
            )}

            {assessmentsLoading ? (
              <p className="text-sm text-slate-400 font-medium">Loading assessments...</p>
            ) : assessments.length === 0 ? (
              <p className="text-sm text-slate-400 font-medium">No supervisor assessments yet.</p>
            ) : (
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {assessments.map((a) => (
                  <div key={a.id} className="rounded-xl bg-slate-50 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Stars value={a.rating} />
                          <span className="text-xs font-bold text-slate-800">{a.assessorName}</span>
                          <span className="text-[10px] text-slate-400">
                            {a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                          </span>
                        </div>
                        {a.booking && (
                          <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                            Job {a.booking.bookingId || `#${a.booking.id}`} · {a.booking.date} · {a.booking.clientName}
                          </div>
                        )}
                      </div>
                      <button type="button" onClick={() => void removeAssessment(a.id)} className="p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50" aria-label="Delete assessment">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {(a.punctuality || a.quality || a.professionalism) && (
                      <div className="flex flex-wrap gap-3 mt-2 text-[11px] font-bold text-slate-500">
                        {a.punctuality ? <span>Punctuality {a.punctuality}/5</span> : null}
                        {a.quality ? <span>Quality {a.quality}/5</span> : null}
                        {a.professionalism ? <span>Professionalism {a.professionalism}/5</span> : null}
                      </div>
                    )}
                    <p className="text-sm text-slate-700 mt-2">{a.remark}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Job history */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" /> Job history ({jobs.length})
              </h3>
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                {(['all', 'completed', 'upcoming', 'cancelled'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-slate-400 font-medium">No jobs in this view.</p>
            ) : (
              <div className="space-y-2 max-h-[32rem] overflow-y-auto">
                {history.map((j) => {
                  const wc = j.b.workCompletion;
                  const latest = j.lateNotices[j.lateNotices.length - 1];
                  return (
                    <div key={j.b.id} className="border border-slate-100 rounded-xl px-4 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-900">{j.b.bookingId || `#${j.b.id}`}</span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${statusBadge(j.b.status)}`}>{j.b.status}</span>
                          {j.onTime !== null && (
                            <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${j.onTime ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                              {j.onTime ? 'On time' : `${j.minutesLate} min late`}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-slate-500">
                          {j.date} · booked {j.b.time} · {hoursLabel(j.pay.yourHours)}
                          {j.pay.staffCount > 1 ? ` (${j.pay.staffCount} cleaners)` : ''} · {money(j.pay.pay)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-600">
                        <span className="font-medium">{j.b.serviceType}</span>
                        {j.b.contact?.name && (
                          <button type="button" onClick={() => onViewClient?.(j.b.contact?.email || '')} className="text-blue-600 font-bold hover:underline">
                            {j.b.contact.name}
                          </button>
                        )}
                        {j.b.address?.postcode && <span className="text-slate-400">{j.b.address.postcode}</span>}
                      </div>

                      {(j.setOff !== null || j.arrived !== null || j.left !== null) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] font-bold text-slate-500">
                          {j.setOff !== null && (
                            <span className="inline-flex items-center gap-1"><Navigation className="w-3 h-3" /> Set off {clock(j.setOff)}</span>
                          )}
                          {j.arrived !== null && (
                            <span className="inline-flex items-center gap-1"><LogIn className="w-3 h-3" /> Arrived {clock(j.arrived)}</span>
                          )}
                          {j.left !== null && (
                            <span className="inline-flex items-center gap-1"><LogOut className="w-3 h-3" /> Left {clock(j.left)}</span>
                          )}
                          {j.workedHours !== null && <span>Worked {hoursLabel(j.workedHours)}</span>}
                        </div>
                      )}

                      {(j.b.rating ?? 0) > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                          <Stars value={j.b.rating || 0} size="w-3 h-3" />
                          {j.b.feedback && <span className="text-xs text-slate-500 truncate">"{j.b.feedback}"</span>}
                        </div>
                      )}
                      {latest && (
                        <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 rounded-lg px-2 py-1 inline-flex items-center gap-1">
                          <AlarmClock className="w-3 h-3" /> Running late: {latest.reason}
                          {latest.minutesLate ? `, ~${latest.minutesLate} min` : ''}
                          {j.lateNotices.length > 1 ? ` (${j.lateNotices.length} notices)` : ''}
                        </div>
                      )}
                      {wc?.earlyClockOutReason && (
                        <div className="mt-2 text-[11px] text-slate-600">
                          <span className="font-bold">Finished early:</span> {wc.earlyClockOutReason}
                        </div>
                      )}
                      {wc?.issues && (
                        <div className="mt-1 text-[11px] text-slate-600">
                          <span className="font-bold">Issues reported:</span> {wc.issues}
                        </div>
                      )}
                      {j.b.adminNotes && (
                        <div className="mt-1 text-[11px] text-slate-600">
                          <span className="font-bold">Booking note:</span> {j.b.adminNotes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StaffProfileFlyout;
