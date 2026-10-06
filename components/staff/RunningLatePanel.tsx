import React, { useEffect, useMemo, useState } from 'react';
import { AlarmClock, Check, Clock, Send, X } from 'lucide-react';
import { Booking, BookingStatus, LateNotice } from '../../types';
import { apiStaff } from '../../services/api';
import { useFlyer } from '../Flyer';
import { getTodayYYYYMMDD, normalizeBookingDate } from '../../src/utils/bookingHelpers';

const REASONS = [
  'Heavy traffic',
  'Previous job overran',
  'Public transport delay',
  'Vehicle problem',
  'Parking difficulty',
  'Personal emergency',
];
const MINUTE_OPTIONS = [5, 10, 15, 20, 30, 45, 60];

function addMinutesToHHMM(hhmm: string, mins: number): string {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  const total = ((h || 0) * 60 + (m || 0) + mins) % (24 * 60);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(Math.floor(total / 60))}:${p(total % 60)}`;
}

function formatSentAt(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface Props {
  jobs: Booking[];
  staffName: string;
  brandName: string;
  initialJobId?: number | null;
  onClose?: () => void;
  onSent?: () => void;
}

const RunningLatePanel: React.FC<Props> = ({ jobs, staffName, brandName, initialJobId, onClose, onSent }) => {
  const { showFlyer } = useFlyer();
  const today = getTodayYYYYMMDD();

  const todaysJobs = useMemo(
    () =>
      jobs
        .filter(
          (j) =>
            normalizeBookingDate(j.date) === today &&
            (j.status === BookingStatus.PENDING || j.status === BookingStatus.CONFIRMED),
        )
        .sort((a, b) => String(a.time).localeCompare(String(b.time))),
    [jobs, today],
  );

  const [jobId, setJobId] = useState<number | null>(initialJobId ?? null);
  const [reasonChip, setReasonChip] = useState<string>('');
  const [reasonText, setReasonText] = useState('');
  const [etaMode, setEtaMode] = useState<'minutes' | 'time'>('minutes');
  const [minutesLate, setMinutesLate] = useState<number>(15);
  const [etaTime, setEtaTime] = useState('');
  const [note, setNote] = useState('');
  const [notifyClient, setNotifyClient] = useState(true);
  const [notifyAdmin, setNotifyAdmin] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (jobId != null && todaysJobs.some((j) => j.id === jobId)) return;
    setJobId(todaysJobs[0]?.id ?? null);
  }, [todaysJobs, jobId]);

  const job = todaysJobs.find((j) => j.id === jobId) || null;
  const reason = (reasonChip === 'Other' ? reasonText : reasonChip || reasonText).trim();
  const computedEta = job ? (etaMode === 'minutes' ? addMinutesToHHMM(job.time, minutesLate) : etaTime) : '';

  const preview = job
    ? `Hi ${job.contact?.name || 'there'}, ${staffName} from ${brandName} is ${
        etaMode === 'minutes' ? `about ${minutesLate} minutes late` : 'running late'
      } for your clean today (booked ${job.time}). Reason: ${reason || '...'}.${
        computedEta ? ` New estimated arrival: ${computedEta}.` : ''
      }${note.trim() ? ` ${note.trim()}` : ''} Sorry for the inconvenience.`
    : '';

  const notices: LateNotice[] = useMemo(() => {
    const list = todaysJobs.flatMap((j) => (Array.isArray(j.lateNotices) ? j.lateNotices.map((n) => ({ ...n, _job: j })) : []));
    return list.sort((a, b) => String(b.sentAt).localeCompare(String(a.sentAt)));
  }, [todaysJobs]);

  const canSend = Boolean(job && reason && computedEta && (notifyClient || notifyAdmin) && !sending);

  const handleSend = async () => {
    if (!job || !canSend) return;
    setSending(true);
    try {
      await apiStaff.sendRunningLate(job.id, {
        reason,
        etaTime: computedEta || undefined,
        minutesLate: etaMode === 'minutes' ? minutesLate : undefined,
        note: note.trim() || undefined,
        notifyClient,
        notifyAdmin,
      });
      const who = [notifyClient ? 'client' : '', notifyAdmin ? 'office' : ''].filter(Boolean).join(' and ');
      showFlyer(`Running-late update sent to the ${who}.`, 'success');
      setNote('');
      onSent?.();
      onClose?.();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not send update.', 'error');
    } finally {
      setSending(false);
    }
  };

  const chip = (active: boolean) =>
    `px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
      active ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:border-amber-300'
    }`;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <AlarmClock className="w-6 h-6 text-amber-500" /> Running late
          </h3>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Let the client and the office know why you are delayed and when you expect to arrive.
          </p>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="p-2 rounded-full bg-slate-100 hover:bg-slate-200" aria-label="Close">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        )}
      </div>

      {todaysJobs.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
          You have no open jobs today, so there is nothing to send a delay update for.
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Job</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {todaysJobs.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setJobId(j.id)}
                  className={`text-left p-4 rounded-2xl border transition-all ${
                    j.id === jobId ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-200' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-slate-900 text-sm">{j.contact?.name || 'Client'}</span>
                    <span className="text-xs font-black text-slate-500 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> {j.time}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-medium mt-1 truncate">
                    {j.serviceType} · {j.address?.postcode}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Reason</label>
            <div className="flex flex-wrap gap-2">
              {[...REASONS, 'Other'].map((r) => (
                <button key={r} type="button" onClick={() => setReasonChip(reasonChip === r ? '' : r)} className={chip(reasonChip === r)}>
                  {r}
                </button>
              ))}
            </div>
            {(reasonChip === 'Other' || !reasonChip) && (
              <input
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                maxLength={300}
                placeholder="Describe the reason"
                className="w-full mt-1 px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
              />
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Arrival</label>
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {(['minutes', 'time'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setEtaMode(m)}
                  className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider ${
                    etaMode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  {m === 'minutes' ? 'Minutes late' : 'Exact time'}
                </button>
              ))}
            </div>
            {etaMode === 'minutes' ? (
              <div className="flex flex-wrap gap-2">
                {MINUTE_OPTIONS.map((m) => (
                  <button key={m} type="button" onClick={() => setMinutesLate(m)} className={chip(minutesLate === m)}>
                    {m} min
                  </button>
                ))}
              </div>
            ) : (
              <input
                type="time"
                value={etaTime}
                onChange={(e) => setEtaTime(e.target.value)}
                className="px-4 py-3 rounded-xl border border-slate-200 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-amber-200"
              />
            )}
            {job && computedEta && (
              <p className="text-xs font-bold text-slate-500">
                Booked for {job.time}. Estimated arrival <span className="text-amber-700">{computedEta}</span>.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Extra note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g. I will message again if anything changes."
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-amber-200"
            />
          </div>

          <div className="space-y-2">
            <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Send to</label>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { on: notifyClient, set: setNotifyClient, title: 'Client', sub: 'SMS, email, app alert and booking chat' },
                { on: notifyAdmin, set: setNotifyAdmin, title: 'Office / admin', sub: 'Admin dashboard alert' },
              ].map((r) => (
                <button
                  key={r.title}
                  type="button"
                  onClick={() => r.set(!r.on)}
                  className={`flex items-center gap-3 p-4 rounded-2xl border text-left ${
                    r.on ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-md flex items-center justify-center ${r.on ? 'bg-emerald-500' : 'bg-slate-200'}`}>
                    {r.on && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                  <span>
                    <span className="block text-sm font-black text-slate-900">{r.title}</span>
                    <span className="block text-[11px] font-medium text-slate-500">{r.sub}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {notifyClient && preview && (
            <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Client will see</p>
              <p className="text-sm text-slate-700 leading-relaxed">{preview}</p>
            </div>
          )}

          <button
            type="button"
            onClick={handleSend}
            disabled={!canSend}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-amber-500 text-white font-black text-sm uppercase tracking-widest hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-200"
          >
            <Send className="w-4 h-4" /> {sending ? 'Sending...' : 'Send update'}
          </button>
        </>
      )}

      {notices.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Sent today</p>
          {notices.map((n) => {
            const j = (n as LateNotice & { _job: Booking })._job;
            return (
              <div key={n.id} className="p-4 rounded-2xl border border-amber-100 bg-amber-50/60">
                <div className="flex items-center justify-between text-xs font-black">
                  <span className="text-slate-900">{j.contact?.name || 'Client'} · {j.time}</span>
                  <span className="text-slate-500">{formatSentAt(n.sentAt)}</span>
                </div>
                <p className="text-sm text-slate-700 mt-1">
                  {n.reason}
                  {n.minutesLate ? ` · ${n.minutesLate} min late` : ''}
                  {n.etaTime ? ` · ETA ${n.etaTime}` : ''}
                </p>
                <p className="text-[11px] font-bold text-slate-500 mt-1">
                  Sent to {[n.notified?.client ? 'client' : '', n.notified?.admin ? 'office' : ''].filter(Boolean).join(' and ') || 'nobody'}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default RunningLatePanel;
