import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  Mail,
  Phone,
  MapPin,
  Search,
  RefreshCw,
  Download,
  Trash2,
  MessageCircle,
  CheckCircle2,
  Clock,
  Home,
  StickyNote,
  CalendarCheck,
  AlertTriangle,
  Inbox,
  UserCheck,
} from 'lucide-react';
import type { QuoteLead, QuoteLeadStatus } from '../../types';

interface Props {
  leads: QuoteLead[];
  loading: boolean;
  companyName: string;
  onRefresh: () => void;
  onUpdate: (id: number, body: { status?: QuoteLeadStatus; adminNotes?: string }) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  onNotify: (message: string, type?: 'success' | 'error') => void;
}

type FilterId = 'all' | QuoteLeadStatus | 'unfinished';

const STATUS_META: Record<QuoteLeadStatus, { label: string; pill: string; dot: string }> = {
  new: { label: 'New', pill: 'bg-amber-100 text-amber-800 border-amber-200', dot: 'bg-amber-500' },
  contacted: { label: 'Contacted', pill: 'bg-blue-100 text-blue-700 border-blue-200', dot: 'bg-blue-500' },
  converted: { label: 'Converted', pill: 'bg-emerald-100 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  lost: { label: 'Lost', pill: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
};
const STATUS_ORDER: QuoteLeadStatus[] = ['new', 'contacted', 'converted', 'lost'];

/** Left contact details in step one but never finished the quote. */
const isUnfinished = (l: QuoteLead) => l.serviceType === 'Pending';

const displayName = (l: QuoteLead) => (l.firstName || '').trim() || l.email.split('@')[0];

const estimateText = (l: QuoteLead) => {
  if (isUnfinished(l)) return 'No quote yet';
  const n = Number(l.priceEstimate);
  return Number.isFinite(n) && n > 0 ? `£${n.toFixed(2)}` : 'Bespoke';
};

const propertyText = (l: QuoteLead) => {
  if (/commercial/i.test(l.serviceType)) return 'Commercial premises';
  return [l.bedrooms && `${l.bedrooms} bed`, l.bathrooms && `${l.bathrooms} bath`].filter(Boolean).join(', ') || 'Not given';
};

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

const formatDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

/** New leads waiting longer than this are flagged so nobody is left without a reply. */
const OVERDUE_HOURS = 24;
const isOverdue = (l: QuoteLead) =>
  l.status === 'new' && !!l.createdAt && Date.now() - new Date(l.createdAt).getTime() > OVERDUE_HOURS * 3600_000;

/** UK mobile/landline to wa.me format (07700 900123 -> 447700900123). */
function whatsappNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `44${d.slice(1)}`;
  return d.length >= 10 ? d : null;
}

function replyMailto(l: QuoteLead, companyName: string): string {
  const name = displayName(l);
  const subject = isUnfinished(l) ? `Your cleaning quote from ${companyName}` : `Your ${l.serviceType} quote from ${companyName}`;
  const lines = [
    `Hi ${name},`,
    '',
    isUnfinished(l)
      ? `Thanks for your interest in ${companyName}. I noticed you started a quote on our website and wanted to help you finish it.`
      : `Thanks for requesting a ${l.serviceType} quote${l.postcode ? ` for ${l.postcode}` : ''}.${
          Number(l.priceEstimate) > 0 ? ` Your estimate came to £${Number(l.priceEstimate).toFixed(2)}.` : ''
        }`,
    '',
    'Is there a good time for a quick call, or would you like me to book this in for you?',
    '',
    'Kind regards,',
    companyName,
  ];
  return `mailto:${l.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const QuoteRequestsPanel: React.FC<Props> = ({ leads, loading, companyName, onRefresh, onUpdate, onDelete, onNotify }) => {
  const [filter, setFilter] = useState<FilterId>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const selected = useMemo(() => leads.find((l) => l.id === selectedId) ?? null, [leads, selectedId]);

  const stats = useMemo(() => {
    const finished = leads.filter((l) => !isUnfinished(l));
    const by = (s: QuoteLeadStatus) => leads.filter((l) => l.status === s).length;
    const converted = by('converted');
    const decided = converted + by('lost');
    const openValue = finished
      .filter((l) => l.status === 'new' || l.status === 'contacted')
      .reduce((sum, l) => sum + (Number(l.priceEstimate) > 0 ? Number(l.priceEstimate) : 0), 0);
    return {
      total: leads.length,
      new: by('new'),
      contacted: by('contacted'),
      converted,
      lost: by('lost'),
      unfinished: leads.length - finished.length,
      overdue: leads.filter(isOverdue).length,
      conversionRate: decided > 0 ? Math.round((converted / decided) * 100) : null,
      openValue,
      bookedNotMarked: leads.filter((l) => l.matchedBooking && l.status !== 'converted').length,
    };
  }, [leads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (filter === 'unfinished' && !isUnfinished(l)) return false;
      if (filter !== 'all' && filter !== 'unfinished' && l.status !== filter) return false;
      if (!q) return true;
      return [l.firstName, l.email, l.phone, l.postcode, l.serviceType, l.adminNotes, l.matchedBooking?.bookingId]
        .some((v) => String(v ?? '').toLowerCase().includes(q));
    });
  }, [leads, filter, query]);

  const filters: Array<{ id: FilterId; label: string; count: number }> = [
    { id: 'all', label: 'All', count: stats.total },
    { id: 'new', label: 'New', count: stats.new },
    { id: 'contacted', label: 'Contacted', count: stats.contacted },
    { id: 'converted', label: 'Converted', count: stats.converted },
    { id: 'lost', label: 'Lost', count: stats.lost },
    { id: 'unfinished', label: 'Unfinished', count: stats.unfinished },
  ];

  const setStatus = async (lead: QuoteLead, status: QuoteLeadStatus, quiet = false) => {
    if (lead.status === status) return;
    try {
      await onUpdate(lead.id, { status });
      if (!quiet) onNotify(`${displayName(lead)} marked as ${STATUS_META[status].label.toLowerCase()}.`);
    } catch (e) {
      onNotify(e instanceof Error ? e.message : 'Could not update the quote request.', 'error');
    }
  };

  /** Reaching out to a new lead moves it to Contacted automatically. */
  const onContacted = (lead: QuoteLead) => {
    if (lead.status === 'new') {
      void setStatus(lead, 'contacted', true).then(() => onNotify(`${displayName(lead)} moved to Contacted.`));
    }
  };

  const exportCsv = () => {
    const header = ['Received', 'Name', 'Email', 'Phone', 'Postcode', 'Service', 'Bedrooms', 'Bathrooms', 'Estimate', 'Status', 'Booked', 'Notes'];
    const rows = filtered.map((l) => [
      formatDateTime(l.createdAt),
      l.firstName,
      l.email,
      l.phone,
      l.postcode,
      isUnfinished(l) ? 'Unfinished' : l.serviceType,
      l.bedrooms,
      l.bathrooms,
      l.priceEstimate,
      STATUS_META[l.status]?.label ?? l.status,
      l.matchedBooking?.bookingId ?? '',
      l.adminNotes,
    ]);
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `quote-requests-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
      <div className="flex flex-wrap items-end justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 className="text-3xl font-black text-slate-900 tracking-tight">Quote Requests</h3>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Free quotes requested on the homepage. Reply fast: new requests over {OVERDUE_HOURS}h old are flagged.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatTile label="Need a reply" value={stats.new} hint={stats.overdue ? `${stats.overdue} waiting over ${OVERDUE_HOURS}h` : 'All caught up'} tone={stats.overdue ? 'red' : 'amber'} />
        <StatTile label="In progress" value={stats.contacted} hint="Contacted, not decided" tone="blue" />
        <StatTile label="Converted" value={stats.converted} hint={stats.conversionRate == null ? 'No decided leads yet' : `${stats.conversionRate}% win rate`} tone="green" />
        <StatTile label="Open quote value" value={`£${stats.openValue.toFixed(0)}`} hint="New + contacted estimates" tone="slate" />
        <StatTile label="Unfinished" value={stats.unfinished} hint="Left details, no quote" tone="slate" />
      </div>

      {stats.bookedNotMarked > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-bold text-emerald-800">
            <CalendarCheck className="inline w-4 h-4 mr-1.5 -mt-0.5" />
            {stats.bookedNotMarked} {stats.bookedNotMarked === 1 ? 'person has' : 'people have'} booked since requesting a quote but {stats.bookedNotMarked === 1 ? "isn't" : "aren't"} marked converted.
          </p>
          <button
            type="button"
            onClick={async () => {
              const toMark = leads.filter((l) => l.matchedBooking && l.status !== 'converted');
              try {
                for (const l of toMark) await onUpdate(l.id, { status: 'converted' });
                onNotify(`${toMark.length} quote ${toMark.length === 1 ? 'request' : 'requests'} marked converted.`);
              } catch (e) {
                onNotify(e instanceof Error ? e.message : 'Could not update every request.', 'error');
              }
            }}
            className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700"
          >
            Mark them converted
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filter quote requests">
          {filters.map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-colors border ${
                filter === f.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label}
              <span className={`ml-1.5 tabular-nums ${filter === f.id ? 'text-white/70' : 'text-slate-400'}`}>{f.count}</span>
            </button>
          ))}
        </div>
        <div className="relative lg:ml-auto lg:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, email, phone, postcode..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading && leads.length === 0 ? (
        <div className="text-slate-400 text-sm font-bold p-10 text-center">Loading quote requests...</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-10 text-center">
          <Inbox className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="font-black text-slate-700">{leads.length === 0 ? 'No quote requests yet' : 'Nothing matches this filter'}</p>
          <p className="text-sm text-slate-500 mt-1">
            {leads.length === 0 ? 'Requests from the homepage free quote form will appear here instantly.' : 'Try another filter or clear the search.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100 overflow-hidden">
          {filtered.map((l) => {
            const meta = STATUS_META[l.status] ?? STATUS_META.new;
            const overdue = isOverdue(l);
            return (
              <button
                key={l.id}
                type="button"
                onClick={() => setSelectedId(l.id)}
                className="w-full text-left px-4 sm:px-5 py-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 sm:w-64 shrink-0">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${meta.dot}`} aria-hidden />
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 truncate">{displayName(l)}</div>
                    <div className="text-xs text-slate-500 truncate">{l.email}</div>
                  </div>
                </div>
                <div className="flex-1 min-w-0 text-sm">
                  <div className="font-bold text-slate-700 truncate">
                    {isUnfinished(l) ? <span className="text-slate-400 italic">Unfinished quote</span> : l.serviceType}
                    {!isUnfinished(l) && <span className="font-medium text-slate-400"> · {propertyText(l)}</span>}
                  </div>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {l.postcode && <span className="font-mono">{l.postcode}</span>}
                    {l.phone && <span>{l.phone}</span>}
                    {l.adminNotes && <span className="text-slate-400 truncate max-w-[16rem]"><StickyNote className="inline w-3 h-3 -mt-0.5" /> {l.adminNotes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:justify-end shrink-0">
                  {l.matchedBooking && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-1 text-[10px] font-black text-emerald-700">
                      <CalendarCheck className="w-3 h-3" /> Booked {l.matchedBooking.bookingId || ''}
                    </span>
                  )}
                  {l.bookingsBeforeQuote > 0 && !l.matchedBooking && (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 border border-indigo-200 px-2 py-1 text-[10px] font-black text-indigo-700">
                      <UserCheck className="w-3 h-3" /> Existing customer
                    </span>
                  )}
                  <span className="font-black text-slate-900 tabular-nums text-sm w-24 text-right">{estimateText(l)}</span>
                  <span className={`rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-wider ${meta.pill}`}>{meta.label}</span>
                  <span className={`text-xs w-24 text-right ${overdue ? 'text-red-600 font-black' : 'text-slate-400 font-medium'}`}>
                    {overdue && <AlertTriangle className="inline w-3 h-3 mr-0.5 -mt-0.5" />}
                    {timeAgo(l.createdAt)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <QuoteRequestFlyout
          lead={selected}
          companyName={companyName}
          onClose={() => setSelectedId(null)}
          onSetStatus={(s) => setStatus(selected, s)}
          onContacted={() => onContacted(selected)}
          onSaveNotes={async (notes) => {
            try {
              await onUpdate(selected.id, { adminNotes: notes });
              onNotify('Notes saved.');
            } catch (e) {
              onNotify(e instanceof Error ? e.message : 'Could not save notes.', 'error');
            }
          }}
          onDelete={async () => {
            if (!window.confirm(`Delete the quote request from ${displayName(selected)}? This cannot be undone.`)) return;
            try {
              await onDelete(selected.id);
              setSelectedId(null);
              onNotify('Quote request deleted.');
            } catch (e) {
              onNotify(e instanceof Error ? e.message : 'Could not delete the quote request.', 'error');
            }
          }}
        />
      )}
    </div>
  );
};

const TONES = {
  amber: 'bg-amber-50 border-amber-100 text-amber-900',
  red: 'bg-red-50 border-red-100 text-red-900',
  blue: 'bg-blue-50 border-blue-100 text-blue-900',
  green: 'bg-emerald-50 border-emerald-100 text-emerald-900',
  slate: 'bg-white border-slate-100 text-slate-900',
};

const StatTile: React.FC<{ label: string; value: React.ReactNode; hint: string; tone: keyof typeof TONES }> = ({ label, value, hint, tone }) => (
  <div className={`rounded-2xl border p-4 shadow-sm ${TONES[tone]}`}>
    <div className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</div>
    <div className="text-2xl font-black tabular-nums mt-1">{value}</div>
    <div className="text-[11px] font-medium opacity-70 mt-0.5">{hint}</div>
  </div>
);

const QuoteRequestFlyout: React.FC<{
  lead: QuoteLead;
  companyName: string;
  onClose: () => void;
  onSetStatus: (s: QuoteLeadStatus) => Promise<void>;
  onContacted: () => void;
  onSaveNotes: (notes: string) => Promise<void>;
  onDelete: () => Promise<void>;
}> = ({ lead, companyName, onClose, onSetStatus, onContacted, onSaveNotes, onDelete }) => {
  const [notes, setNotes] = useState(lead.adminNotes ?? '');
  const [savingNotes, setSavingNotes] = useState(false);

  useEffect(() => {
    setNotes(lead.adminNotes ?? '');
  }, [lead.id, lead.adminNotes]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const wa = whatsappNumber(lead.phone);
  const notesChanged = notes.trim() !== (lead.adminNotes ?? '').trim();

  const details: Array<{ icon: React.ReactNode; label: string; value: React.ReactNode }> = [
    { icon: <Home className="w-4 h-4" />, label: 'Service', value: isUnfinished(lead) ? 'Not chosen (quote unfinished)' : lead.serviceType },
    { icon: <Home className="w-4 h-4" />, label: 'Property', value: isUnfinished(lead) ? 'Not given' : propertyText(lead) },
    { icon: <MapPin className="w-4 h-4" />, label: 'Postcode', value: lead.postcode || 'Not given' },
    { icon: <Clock className="w-4 h-4" />, label: 'Received', value: `${formatDateTime(lead.createdAt)} (${timeAgo(lead.createdAt)})` },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Quote request from ${displayName(lead)}`}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-xl bg-slate-50 h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Quote request #{lead.id}</p>
            <h2 className="text-xl font-black text-slate-900 truncate">{displayName(lead)}</h2>
            <p className="text-2xl font-black text-slate-900 tabular-nums mt-1">{estimateText(lead)}</p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100" aria-label="Close quote request">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {lead.matchedBooking ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-emerald-800">
                <p className="font-black"><CalendarCheck className="inline w-4 h-4 mr-1 -mt-0.5" /> Booked {lead.matchedBooking.bookingId}</p>
                <p className="font-medium">
                  Cleaning on {lead.matchedBooking.date} · {lead.matchedBooking.status}
                  {lead.bookingsAfterQuote > 1 ? ` · ${lead.bookingsAfterQuote} bookings since the quote` : ''}
                </p>
              </div>
              {lead.status !== 'converted' && (
                <button type="button" onClick={() => void onSetStatus('converted')} className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700">
                  Mark converted
                </button>
              )}
            </div>
          ) : lead.bookingsBeforeQuote > 0 ? (
            <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm font-bold text-indigo-800">
              <UserCheck className="inline w-4 h-4 mr-1 -mt-0.5" /> Existing customer: {lead.bookingsBeforeQuote} earlier {lead.bookingsBeforeQuote === 1 ? 'booking' : 'bookings'} with this email.
            </div>
          ) : null}

          <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Get in touch</h3>
            <div className="space-y-2 text-sm">
              <p className="flex items-center gap-2 text-slate-700"><Mail className="w-4 h-4 text-slate-400" /> {lead.email}</p>
              <p className="flex items-center gap-2 text-slate-700"><Phone className="w-4 h-4 text-slate-400" /> {lead.phone || 'No phone given'}</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <a href={replyMailto(lead, companyName)} onClick={onContacted} className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 text-white px-3 py-2.5 text-xs font-black hover:bg-blue-700">
                <Mail className="w-4 h-4" /> Reply by email
              </a>
              {lead.phone ? (
                <a href={`tel:${lead.phone.replace(/\s/g, '')}`} onClick={onContacted} className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-slate-700 px-3 py-2.5 text-xs font-black hover:bg-slate-50">
                  <Phone className="w-4 h-4" /> Call
                </a>
              ) : null}
              {wa ? (
                <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" onClick={onContacted} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-2.5 text-xs font-black hover:bg-emerald-100">
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              ) : null}
            </div>
            {lead.status === 'new' && (
              <p className="text-[11px] text-slate-400 font-medium">Using any of these buttons moves the request to Contacted.</p>
            )}
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Status</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {STATUS_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void onSetStatus(s)}
                  aria-pressed={lead.status === s}
                  className={`rounded-xl border px-3 py-2.5 text-xs font-black transition-colors ${
                    lead.status === s ? `${STATUS_META[s].pill} ring-2 ring-offset-1 ring-slate-300` : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {lead.status === s && <CheckCircle2 className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
                  {STATUS_META[s].label}
                </button>
              ))}
            </div>
            {lead.statusUpdatedAt && <p className="text-[11px] text-slate-400 font-medium">Last changed {formatDateTime(lead.statusUpdatedAt)}</p>}
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Request details</h3>
            <dl className="space-y-3">
              {details.map((d) => (
                <div key={d.label} className="flex items-start gap-3 text-sm">
                  <span className="text-slate-400 mt-0.5">{d.icon}</span>
                  <dt className="w-24 shrink-0 font-bold text-slate-500">{d.label}</dt>
                  <dd className="font-bold text-slate-900 min-w-0 break-words">{d.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Private notes</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Call outcome, follow-up date, anything the team should know..."
              className="w-full rounded-xl border border-slate-200 p-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={!notesChanged || savingNotes}
                onClick={async () => {
                  setSavingNotes(true);
                  await onSaveNotes(notes);
                  setSavingNotes(false);
                }}
                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black disabled:opacity-40"
              >
                {savingNotes ? 'Saving...' : 'Save notes'}
              </button>
            </div>
          </section>

          <button
            type="button"
            onClick={() => void onDelete()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white text-red-600 px-4 py-3 text-xs font-black hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" /> Delete quote request
          </button>
        </div>
      </div>
    </div>
  );
};

export default QuoteRequestsPanel;
