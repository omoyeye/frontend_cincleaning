import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  Download,
  Eye,
  EyeOff,
  Mail,
  MapPin,
  MoreHorizontal,
  RotateCcw,
  Search,
  Send,
  UserCheck,
  UserPlus,
  UserX,
  Wallet,
  X,
  Hourglass,
  Clock3,
  ChevronRight,
} from 'lucide-react';
import { Booking, BookingStatus, Staff } from '../../types';
import { bookingHasStaff, getTodayYYYYMMDD, getTomorrowYYYYMMDD } from '../../src/utils/bookingHelpers';
import { bookingPaymentState } from '../../src/utils/bookingPayment';
import { useBusinessSettings } from '../../src/context/BusinessSettingsContext';
import BookingPaymentCell from './BookingPaymentCell';

/**
 * Admin bookings page: one list instead of two tables. Shows what needs attention first,
 * groups jobs by day, and keeps each booking on one readable card with the cleaner,
 * payment and a single "Open" action (everything else in the ⋯ menu).
 */

export type BookingsView =
  | 'upcoming'
  | 'today'
  | 'unassigned'
  | 'pending'
  | 'stale_pending'
  | 'balance_due'
  | 'cancel_requests'
  | 'past'
  | 'cancelled'
  | 'all'
  | 'hidden';

type CancelRequest = {
  id: number;
  bookingId: number;
  staffName: string;
  status?: string | null;
  reason?: string | null;
  serviceType?: string | null;
  date?: string | null;
  time?: string | null;
};

interface Props {
  bookings: Booking[];
  staffList: Staff[];
  view: BookingsView;
  onViewChange: (v: BookingsView) => void;
  search: string;
  onSearchChange: (v: string) => void;
  statusFilter: BookingStatus | 'All';
  onStatusFilterChange: (v: BookingStatus | 'All') => void;
  hiddenIds: Set<number>;
  onHide: (ids: number[]) => void;
  onRestore: (ids: number[]) => void;
  cancelRequests: CancelRequest[];
  cancelNotes: Record<number, string>;
  onCancelNoteChange: (id: number, note: string) => void;
  onCancelDecision: (id: number, decision: 'approve' | 'reject') => void;
  onOpen: (b: Booking) => void;
  onReschedule: (b: Booking) => void;
  onAssign: (b: Booking) => void;
  onUnassign: (b: Booking) => void;
  onRemind: (b: Booking) => void;
  onSendInvoice: (b: Booking) => void;
  onClientProfile: (email: string) => void;
  onExport: (list: Booking[]) => void;
  onRemindConfirmed: (list: Booking[]) => void;
  onPaymentChanged: (id: Booking['id'], patch: Partial<Booking>) => void;
}

const PAGE = 60;

const isActive = (b: Booking) => b.status !== BookingStatus.CANCELLED && b.status !== BookingStatus.COMPLETED;
const stamp = (b: Booking) => `${String(b.date || '').slice(0, 10)} ${String(b.time || '00:00').slice(0, 5)}`;
const hoursOf = (b: Booking) => Number(b.propertyDetails?.duration ?? b.duration) || 0;

function dayLabel(ymd: string, today: string, tomorrow: string): string {
  if (ymd === today) return 'Today';
  if (ymd === tomorrow) return 'Tomorrow';
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd || 'No date';
  const dt = new Date(y, m - 1, d);
  const sameYear = dt.getFullYear() === new Date().getFullYear();
  return dt.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

const STATUS_STYLE: Record<string, string> = {
  [BookingStatus.PENDING]: 'bg-amber-50 text-amber-700 ring-amber-200',
  [BookingStatus.CONFIRMED]: 'bg-blue-50 text-blue-700 ring-blue-200',
  'In Progress': 'bg-violet-50 text-violet-700 ring-violet-200',
  [BookingStatus.COMPLETED]: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  [BookingStatus.CANCELLED]: 'bg-red-50 text-red-700 ring-red-200',
};

export default function BookingsBoard(props: Props) {
  const {
    bookings,
    staffList,
    view,
    onViewChange,
    search,
    onSearchChange,
    statusFilter,
    onStatusFilterChange,
    hiddenIds,
    cancelRequests,
  } = props;
  const { depositPolicy } = useBusinessSettings();
  const depositPct = Number.isFinite(Number(depositPolicy?.requiredPercent)) ? Number(depositPolicy?.requiredPercent) : 40;
  const today = getTodayYYYYMMDD();
  const tomorrow = getTomorrowYYYYMMDD();

  const [serviceFilter, setServiceFilter] = useState('All');
  const [staffFilter, setStaffFilter] = useState<'All' | 'none' | string>('All');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [menuFor, setMenuFor] = useState<Booking['id'] | null>(null);
  const [showRequests, setShowRequests] = useState(true);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setSelected(new Set());
    setLimit(PAGE);
  }, [view, search, statusFilter, serviceFilter, staffFilter]);

  useEffect(() => {
    if (menuFor == null) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuFor(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuFor]);

  const staffById = useMemo(() => new Map(staffList.map((s) => [Number(s.id), s])), [staffList]);
  const staffOf = (b: Booking): Staff[] => {
    const ids = new Set<number>((b.assignedStaffIds || []).map(Number));
    if (b.assignedStaffId != null) ids.add(Number(b.assignedStaffId));
    return [...ids].map((id) => staffById.get(id)).filter((s): s is Staff => Boolean(s));
  };

  const pendingRequests = useMemo(
    () => cancelRequests.filter((r) => String(r.status || '').toLowerCase() === 'pending'),
    [cancelRequests]
  );
  const approvedRequestIds = useMemo(
    () => new Set(cancelRequests.filter((r) => String(r.status || '').toLowerCase() === 'approved').map((r) => Number(r.bookingId))),
    [cancelRequests]
  );

  const visible = useMemo(() => bookings.filter((b) => !hiddenIds.has(Number(b.id))), [bookings, hiddenIds]);

  /** Things the team should act on, used for the summary cards and the per-booking flags. */
  const attention = useMemo(() => {
    const upcomingActive = visible.filter((b) => isActive(b) && String(b.date).slice(0, 10) >= today);
    const balances = visible.filter((b) => b.status === BookingStatus.COMPLETED && bookingPaymentState(b, depositPct).stage === 'deposit_paid');
    return {
      today: visible.filter((b) => String(b.date).slice(0, 10) === today && b.status !== BookingStatus.CANCELLED),
      unassigned: upcomingActive.filter((b) => !bookingHasStaff(b)),
      pending: upcomingActive.filter((b) => b.status === BookingStatus.PENDING),
      stale: visible.filter((b) => b.status === BookingStatus.PENDING && String(b.date).slice(0, 10) < today),
      balances,
      balanceTotal: balances.reduce((sum, b) => sum + bookingPaymentState(b, depositPct).balanceDue, 0),
    };
  }, [visible, today, depositPct]);

  const services = useMemo(() => [...new Set(bookings.map((b) => b.serviceType).filter(Boolean))].sort(), [bookings]);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows: Booking[];
    switch (view) {
      case 'hidden':
        rows = bookings.filter((b) => hiddenIds.has(Number(b.id)));
        break;
      case 'today':
        rows = attention.today;
        break;
      case 'unassigned':
        rows = attention.unassigned;
        break;
      case 'pending':
        rows = attention.pending;
        break;
      case 'stale_pending':
        rows = attention.stale;
        break;
      case 'balance_due':
        rows = attention.balances;
        break;
      case 'cancel_requests':
        rows = visible.filter((b) => approvedRequestIds.has(Number(b.id)) && isActive(b));
        break;
      case 'past':
        rows = visible.filter((b) => b.status !== BookingStatus.CANCELLED && (String(b.date).slice(0, 10) < today || b.status === BookingStatus.COMPLETED));
        break;
      case 'cancelled':
        rows = visible.filter((b) => b.status === BookingStatus.CANCELLED);
        break;
      case 'all':
        rows = visible;
        break;
      case 'upcoming':
      default:
        rows = visible.filter((b) => isActive(b) && String(b.date).slice(0, 10) >= today);
    }
    rows = rows.filter((b) => {
      if (statusFilter !== 'All' && b.status !== statusFilter) return false;
      if (serviceFilter !== 'All' && b.serviceType !== serviceFilter) return false;
      if (staffFilter === 'none' && bookingHasStaff(b)) return false;
      if (staffFilter !== 'All' && staffFilter !== 'none' && !staffOf(b).some((s) => String(s.id) === staffFilter)) return false;
      if (!q) return true;
      const hay = [
        b.contact?.name,
        b.contact?.email,
        b.contact?.phone,
        b.bookingId,
        b.id,
        b.address?.line1,
        b.address?.postcode,
        b.serviceType,
        ...staffOf(b).map((s) => s.name),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    const newestFirst = view === 'past' || view === 'cancelled' || view === 'balance_due' || view === 'all' || view === 'hidden' || view === 'stale_pending';
    return [...rows].sort((a, b) => (newestFirst ? stamp(b).localeCompare(stamp(a)) : stamp(a).localeCompare(stamp(b))));
  }, [view, bookings, visible, hiddenIds, attention, approvedRequestIds, search, statusFilter, serviceFilter, staffFilter, today, staffById]);

  const shown = list.slice(0, limit);
  const groups = useMemo(() => {
    const out: { day: string; rows: Booking[]; revenue: number }[] = [];
    for (const b of shown) {
      const day = String(b.date || '').slice(0, 10);
      const last = out[out.length - 1];
      if (last && last.day === day) {
        last.rows.push(b);
        last.revenue += Number(b.totalPrice) || 0;
      } else out.push({ day, rows: [b], revenue: Number(b.totalPrice) || 0 });
    }
    return out;
  }, [shown]);

  const hiddenCount = bookings.filter((b) => hiddenIds.has(Number(b.id))).length;
  const filtersOn = statusFilter !== 'All' || serviceFilter !== 'All' || staffFilter !== 'All';
  const attentionViews: BookingsView[] = ['today', 'unassigned', 'pending', 'stale_pending', 'balance_due', 'cancel_requests'];
  const viewTitle: Record<BookingsView, string> = {
    upcoming: 'Upcoming',
    today: 'Today',
    unassigned: 'Needs a cleaner',
    pending: 'Awaiting confirmation',
    stale_pending: 'Overdue (still pending)',
    balance_due: 'Balance due',
    cancel_requests: 'Cleaner cancelled, reassign',
    past: 'Past',
    cancelled: 'Cancelled',
    all: 'All bookings',
    hidden: 'Hidden',
  };

  const cards: { id: BookingsView; label: string; value: string; sub: string; icon: React.ReactNode; tone: string }[] = [
    {
      id: 'today',
      label: 'Today',
      value: String(attention.today.length),
      sub: attention.today.length === 1 ? 'job today' : 'jobs today',
      icon: <CalendarDays className="h-4 w-4" />,
      tone: 'text-blue-700 bg-blue-50',
    },
    {
      id: 'unassigned',
      label: 'Needs a cleaner',
      value: String(attention.unassigned.length),
      sub: 'upcoming, no one assigned',
      icon: <UserPlus className="h-4 w-4" />,
      tone: 'text-amber-700 bg-amber-50',
    },
    {
      id: 'pending',
      label: 'Awaiting confirmation',
      value: String(attention.pending.length),
      sub: 'upcoming, still pending',
      icon: <Hourglass className="h-4 w-4" />,
      tone: 'text-violet-700 bg-violet-50',
    },
    {
      id: 'stale_pending',
      label: 'Overdue',
      value: String(attention.stale.length),
      sub: 'date passed, still pending',
      icon: <AlertTriangle className="h-4 w-4" />,
      tone: 'text-red-700 bg-red-50',
    },
    {
      id: 'balance_due',
      label: 'Balance due',
      value: `£${attention.balanceTotal.toFixed(0)}`,
      sub: `${attention.balances.length} finished job${attention.balances.length === 1 ? '' : 's'}`,
      icon: <Wallet className="h-4 w-4" />,
      tone: 'text-emerald-700 bg-emerald-50',
    },
  ];

  const tabs: { id: BookingsView; label: string; count?: number }[] = [
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'past', label: 'Past' },
    { id: 'cancelled', label: 'Cancelled' },
    { id: 'all', label: 'All' },
    ...(hiddenCount ? [{ id: 'hidden' as const, label: 'Hidden', count: hiddenCount }] : []),
  ];

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const flagsFor = (b: Booking): { text: string; cls: string }[] => {
    const f: { text: string; cls: string }[] = [];
    const ymd = String(b.date).slice(0, 10);
    if (isActive(b) && !bookingHasStaff(b)) {
      f.push(
        approvedRequestIds.has(Number(b.id))
          ? { text: 'Cleaner cancelled, reassign', cls: 'bg-red-50 text-red-700 ring-red-200' }
          : { text: 'No cleaner yet', cls: 'bg-amber-50 text-amber-800 ring-amber-200' }
      );
    }
    if (b.status === BookingStatus.PENDING && ymd < today) f.push({ text: 'Date passed, still pending', cls: 'bg-red-50 text-red-700 ring-red-200' });
    if (b.paymentFeeEvidence?.items?.length && !b.invoicePaid) f.push({ text: 'Payment proof uploaded', cls: 'bg-teal-50 text-teal-700 ring-teal-200' });
    return f;
  };

  return (
    <div className="flex-1 flex flex-col pb-24 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between mb-6">
        <div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tight">Bookings</h3>
          <p className="text-slate-500 text-sm font-medium mt-1">
            {attention.today.length} today · {visible.filter((b) => isActive(b) && String(b.date).slice(0, 10) >= today).length} upcoming ·{' '}
            {bookings.length} in total
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] lg:w-80 lg:flex-none">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="search"
              placeholder="Search name, ref, postcode, phone, cleaner…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 shadow-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => props.onExport(list)}
            className="inline-flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
            title="Download the bookings in this view as CSV"
          >
            <Download className="w-4 h-4" /> Export
          </button>
          <button
            type="button"
            onClick={() => props.onRemindConfirmed(list)}
            className="inline-flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-blue-700 hover:bg-blue-50 shadow-sm"
            title="Send a reminder to confirmed bookings"
          >
            <Mail className="w-4 h-4" /> Remind confirmed
          </button>
        </div>
      </div>

      {/* What needs attention */}
      <div className="-mx-1 flex gap-3 overflow-x-auto no-scrollbar px-1 pb-1 mb-5 snap-x sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 xl:grid-cols-5">
        {cards.map((c) => {
          const on = view === c.id;
          const zero = c.value === '0' || c.value === '£0';
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onViewChange(on ? 'upcoming' : c.id)}
              className={`snap-start shrink-0 w-[150px] sm:w-auto text-left rounded-2xl border p-3.5 sm:p-4 transition-all ${
                on ? 'border-slate-900 bg-slate-900 text-white shadow-lg' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
              } ${zero && !on ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${on ? 'bg-white/15 text-white' : c.tone}`}>{c.icon}</span>
                <span className={`text-[11px] font-black uppercase tracking-wider ${on ? 'text-white/80' : 'text-slate-500'}`}>{c.label}</span>
              </div>
              <p className={`mt-2 text-2xl font-black tabular-nums ${on ? 'text-white' : 'text-slate-900'}`}>{c.value}</p>
              <p className={`text-xs font-medium ${on ? 'text-white/70' : 'text-slate-500'}`}>{c.sub}</p>
            </button>
          );
        })}
      </div>

      {/* Cleaner cancellation requests */}
      {pendingRequests.length > 0 && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50/70">
          <button
            type="button"
            onClick={() => setShowRequests((v) => !v)}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
          >
            <span className="flex items-center gap-2 text-sm font-black text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              {pendingRequests.length} cleaner{pendingRequests.length === 1 ? '' : 's'} asked to cancel a job
            </span>
            <span className="text-xs font-bold text-amber-800">{showRequests ? 'Hide' : 'Review'}</span>
          </button>
          {showRequests && (
            <div className="space-y-2 px-4 pb-4">
              {pendingRequests.map((r) => (
                <div key={r.id} className="rounded-xl bg-white border border-amber-100 p-3 flex flex-col md:flex-row md:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900">
                      {r.staffName} · {r.serviceType || 'Job'} · {r.date || ''} {r.time || ''}
                    </p>
                    {r.reason ? <p className="text-xs text-slate-600 mt-0.5">Reason: {r.reason}</p> : null}
                    <input
                      type="text"
                      value={props.cancelNotes[r.id] || ''}
                      onChange={(e) => props.onCancelNoteChange(r.id, e.target.value)}
                      placeholder="Optional note (sent if you decline)"
                      className="mt-2 w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs"
                    />
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => props.onCancelDecision(r.id, 'approve')}
                      className="px-3 py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => props.onCancelDecision(r.id, 'reject')}
                      className="px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-700"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tabs and filters */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-3 mb-4">
        <div className="flex p-1 rounded-xl bg-slate-200/70 gap-1 overflow-x-auto no-scrollbar shrink-0">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onViewChange(t.id)}
              className={`whitespace-nowrap px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                view === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
              {t.count ? <span className="ml-1.5 text-[10px] text-orange-600">{t.count}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:ml-auto">
          <select
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
            aria-label="Filter by service"
          >
            <option value="All">All services</option>
            {services.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
            aria-label="Filter by cleaner"
          >
            <option value="All">All cleaners</option>
            <option value="none">No cleaner yet</option>
            {staffList.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value as BookingStatus | 'All')}
            className="px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700"
            aria-label="Filter by status"
          >
            <option value="All">All statuses</option>
            {[BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.CANCELLED].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          {filtersOn ? (
            <button
              type="button"
              onClick={() => {
                setServiceFilter('All');
                setStaffFilter('All');
                onStatusFilterChange('All');
              }}
              className="text-xs font-bold text-slate-500 hover:text-slate-900"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      {/* Current view + bulk actions */}
      <div className="flex flex-wrap items-center gap-3 mb-3 min-h-[36px]">
        {attentionViews.includes(view) ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-white pl-3 pr-1.5 py-1 text-xs font-bold">
            {viewTitle[view]}
            <button type="button" onClick={() => onViewChange('upcoming')} className="rounded-full p-0.5 hover:bg-white/20" aria-label="Back to upcoming">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : null}
        <span className="text-xs font-semibold text-slate-500">
          {list.length} booking{list.length === 1 ? '' : 's'}
        </span>
        {list.length > 0 && (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-500 cursor-pointer">
            <input
              type="checkbox"
              checked={shown.length > 0 && shown.every((b) => selected.has(Number(b.id)))}
              onChange={(e) => setSelected(e.target.checked ? new Set(shown.map((b) => Number(b.id))) : new Set())}
              className="h-4 w-4 rounded border-slate-300"
            />
            Select all
          </label>
        )}
        {selected.size > 0 && (
          <div className="flex items-center gap-2 ml-auto rounded-xl bg-slate-900 text-white px-3 py-1.5">
            <span className="text-xs font-bold">{selected.size} selected</span>
            {view === 'hidden' ? (
              <button
                type="button"
                onClick={() => {
                  props.onRestore([...selected]);
                  setSelected(new Set());
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-bold hover:bg-emerald-500"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Show again
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  props.onHide([...selected]);
                  setSelected(new Set());
                }}
                className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1 text-xs font-bold hover:bg-orange-500"
              >
                <EyeOff className="h-3.5 w-3.5" /> Hide from list
              </button>
            )}
            <button type="button" onClick={() => setSelected(new Set())} className="rounded-lg px-2 py-1 text-xs font-bold hover:bg-white/15">
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Bookings grouped by day */}
      {list.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center">
          {view === 'hidden' ? <Eye className="w-8 h-8 mx-auto mb-3 text-slate-300" /> : <CalendarClock className="w-8 h-8 mx-auto mb-3 text-slate-300" />}
          <p className="text-sm font-bold text-slate-600">
            {search ? `No bookings match "${search}"` : view === 'hidden' ? 'No hidden bookings' : `Nothing in ${viewTitle[view].toLowerCase()} right now`}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {attentionViews.includes(view) ? 'All clear here.' : 'Try another tab or clear the filters.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.day}>
              <div className="sticky top-0 z-10 -mx-1 px-1 py-2 bg-[#f7f9fc]/90 backdrop-blur flex items-baseline justify-between">
                <h4 className={`text-sm font-black ${g.day === today ? 'text-blue-700' : 'text-slate-800'}`}>
                  {dayLabel(g.day, today, tomorrow)}
                  <span className="ml-2 text-xs font-semibold text-slate-400">
                    {g.rows.length} job{g.rows.length === 1 ? '' : 's'}
                  </span>
                </h4>
                <span className="text-xs font-bold text-slate-400 tabular-nums">£{g.revenue.toFixed(2)}</span>
              </div>
              <div className="space-y-2">
                {g.rows.map((b) => {
                  const id = Number(b.id);
                  const team = staffOf(b);
                  const flags = flagsFor(b);
                  const hrs = hoursOf(b);
                  const pd = b.propertyDetails;
                  const property = pd
                    ? [pd.bedrooms ? `${pd.bedrooms} bed` : null, pd.bathrooms ? `${pd.bathrooms} bath` : null].filter(Boolean).join(' · ')
                    : '';
                  const cancelled = b.status === BookingStatus.CANCELLED;
                  return (
                    <div
                      key={b.id}
                      className={`group relative grid grid-cols-[auto_1fr] xl:grid-cols-[auto_64px_minmax(0,1fr)_190px_180px_auto] items-start xl:items-center gap-x-4 gap-y-3 rounded-2xl border bg-white p-4 transition-all hover:shadow-md ${
                        selected.has(id) ? 'border-blue-300 ring-2 ring-blue-100' : cancelled ? 'border-red-100 bg-red-50/30' : 'border-slate-200'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggle(id)}
                        className="mt-1 xl:mt-0 h-4 w-4 rounded border-slate-300 cursor-pointer"
                        aria-label={`Select booking ${b.bookingId || id}`}
                      />

                      {/* Time */}
                      <div className="hidden xl:block">
                        <p className="text-lg font-black text-slate-900 tabular-nums leading-none">{String(b.time || '--:--').slice(0, 5)}</p>
                        {hrs ? (
                          <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                            <Clock3 className="h-3 w-3" />
                            {hrs}h
                          </p>
                        ) : null}
                      </div>

                      {/* Client, service, address */}
                      <button type="button" onClick={() => props.onOpen(b)} className="min-w-0 text-left">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span className="xl:hidden inline-flex items-center rounded-md bg-slate-900 px-1.5 py-0.5 text-xs font-black text-white tabular-nums">{String(b.time || '').slice(0, 5)}</span>
                          <span
                            role="link"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (b.contact?.email) props.onClientProfile(b.contact.email);
                            }}
                            className={`text-[15px] font-black hover:text-blue-600 ${cancelled ? 'text-slate-500 line-through' : 'text-slate-900'}`}
                          >
                            {b.contact?.name || 'Guest'}
                          </span>
                          <span className="text-[11px] font-semibold text-slate-400">{b.bookingId || `#${id}`}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ring-1 ${STATUS_STYLE[b.status] || 'bg-slate-50 text-slate-600 ring-slate-200'}`}>
                            {b.status}
                          </span>
                        </div>
                        <p className="mt-0.5 text-sm font-semibold text-slate-700 truncate">
                          {b.serviceType}
                          {property ? <span className="text-slate-400 font-medium"> · {property}</span> : null}
                        </p>
                        {b.address?.line1 ? (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 truncate">
                            <MapPin className="h-3 w-3 shrink-0" />
                            {[b.address.line1, b.address.postcode].filter(Boolean).join(', ')}
                          </p>
                        ) : null}
                        {flags.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {flags.map((f) => (
                              <span key={f.text} className={`px-2 py-0.5 rounded-md text-[10px] font-bold ring-1 ${f.cls}`}>
                                {f.text}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </button>

                      {/* Cleaner, payment and actions: one row under the details, or their own columns on wide screens */}
                      <div className="col-start-2 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-100 pt-3 xl:contents">
                      <div className="xl:col-start-auto">
                        {team.length ? (
                          <button type="button" onClick={() => props.onAssign(b)} className="flex items-center gap-2 text-left" title="Change cleaner">
                            <span className="flex -space-x-2">
                              {team.slice(0, 3).map((s) => (
                                <span
                                  key={s.id}
                                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-emerald-100 text-[11px] font-black text-emerald-700"
                                >
                                  {s.name.charAt(0)}
                                </span>
                              ))}
                            </span>
                            <span className="min-w-0 text-xs font-bold text-slate-700 truncate">
                              {team.map((s) => s.name.split(' ')[0]).join(', ')}
                            </span>
                          </button>
                        ) : isActive(b) ? (
                          <button
                            type="button"
                            onClick={() => props.onAssign(b)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100"
                          >
                            <UserPlus className="h-3.5 w-3.5" /> Assign cleaner
                          </button>
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">No cleaner</span>
                        )}
                      </div>

                      {/* Payment and price */}
                      <div className="flex items-center gap-3 xl:block">
                        <p className="text-base font-black text-slate-900 tabular-nums xl:text-right xl:mb-1">£{Number(b.totalPrice || 0).toFixed(2)}</p>
                        <div className="xl:flex xl:justify-end">
                          <BookingPaymentCell booking={b} onChanged={(patch) => props.onPaymentChanged(b.id, patch)} />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="ml-auto xl:ml-0 flex items-center gap-2 xl:justify-end relative">
                        <button
                          type="button"
                          onClick={() => props.onOpen(b)}
                          className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-bold text-white hover:bg-slate-700"
                        >
                          Open <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setMenuFor(menuFor === b.id ? null : b.id)}
                          className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                          aria-label="More actions"
                          aria-expanded={menuFor === b.id}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {menuFor === b.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-0 top-full z-30 mt-1 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
                          >
                            {[
                              { label: 'Change date or time', icon: <CalendarClock className="h-4 w-4" />, run: () => props.onReschedule(b), show: !cancelled },
                              { label: team.length ? 'Change cleaner' : 'Assign cleaner', icon: <UserCheck className="h-4 w-4" />, run: () => props.onAssign(b), show: !cancelled },
                              { label: 'Remove cleaner', icon: <UserX className="h-4 w-4" />, run: () => props.onUnassign(b), show: team.length > 0 && isActive(b) },
                              { label: 'Send reminder', icon: <Mail className="h-4 w-4" />, run: () => props.onRemind(b), show: isActive(b) },
                              { label: 'Send invoice', icon: <Send className="h-4 w-4" />, run: () => props.onSendInvoice(b), show: !cancelled },
                              view === 'hidden'
                                ? { label: 'Show in list again', icon: <RotateCcw className="h-4 w-4" />, run: () => props.onRestore([id]), show: true }
                                : { label: 'Hide from list', icon: <EyeOff className="h-4 w-4" />, run: () => props.onHide([id]), show: true },
                            ]
                              .filter((a) => a.show)
                              .map((a) => (
                                <button
                                  key={a.label}
                                  type="button"
                                  onClick={() => {
                                    setMenuFor(null);
                                    a.run();
                                  }}
                                  className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  <span className="text-slate-400">{a.icon}</span>
                                  {a.label}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {list.length > shown.length && (
            <div className="text-center">
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE)}
                className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                Show more ({list.length - shown.length} left)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
