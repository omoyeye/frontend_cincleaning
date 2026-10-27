import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatHoursMinutes } from '../../src/utils/bookingHelpers';
import { CalendarDays, CalendarPlus, CheckCircle2, Clock3, Hourglass, Palmtree, Pencil, PoundSterling, Trash2, X } from 'lucide-react';
import { apiStaff, type StaffHoliday, type StaffHolidayYear } from '../../services/api';
import { subscribeNnSync } from '../../services/realtime';
import { useFlyer } from '../Flyer';
import { Badge, Button, Callout, Card, cx, EmptyState, Field, inputClass, SectionHeader, Spinner } from './StaffUi';

/** Weekdays between two dates inclusive (matches the server); a single-day half day is 0.5. */
export function countHolidayDays(start: string, end: string, halfDay: boolean): number {
  if (!start || !end || end < start) return 0;
  let days = 0;
  const d = new Date(`${start}T12:00:00Z`);
  const e = new Date(`${end}T12:00:00Z`);
  for (; d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) days++;
  }
  return halfDay && start === end && days === 1 ? 0.5 : days;
}

export const fmtHolidayDay = (ymd: string) =>
  new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

export const holidayRange = (h: { startDate: string; endDate: string }) =>
  h.startDate === h.endDate ? fmtHolidayDay(h.startDate) : `${fmtHolidayDay(h.startDate)} to ${fmtHolidayDay(h.endDate)}`;

const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

const STATUS_TONE: Record<string, 'warning' | 'success' | 'danger' | 'neutral' | 'primary'> = {
  Pending: 'warning',
  Approved: 'success',
  Rejected: 'danger',
  Cancelled: 'neutral',
};

type FormState = { id: number | null; startDate: string; endDate: string; halfDay: boolean; note: string };
const EMPTY_FORM: FormState = { id: null, startDate: '', endDate: '', halfDay: false, note: '' };

export default function StaffHolidayPanel({ staffId }: { staffId: number }) {
  const { showFlyer } = useFlyer();
  const [data, setData] = useState<StaffHolidayYear | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef<HTMLDivElement>(null);
  const formKey = form ? String(form.id ?? 'new') : '';

  // Bring the form into view when it opens (it sits below the summary on phones).
  useEffect(() => {
    if (formKey) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [formKey]);

  const load = useCallback(async () => {
    try {
      setData(await apiStaff.getStaffHolidays(staffId, year ?? undefined));
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not load holiday', 'error');
    } finally {
      setLoading(false);
    }
  }, [staffId, year, showFlyer]);

  useEffect(() => {
    void load();
    return subscribeNnSync(() => void load());
  }, [load]);

  const formDays = form ? countHolidayDays(form.startDate, form.endDate || form.startDate, form.halfDay) : 0;
  const editingDays = form?.id ? data?.holidays.find((h) => h.id === form.id)?.days ?? 0 : 0;
  const availableForForm = data ? data.balance.remaining + (form?.id ? editingDays : 0) : 0;

  const save = async () => {
    if (!form) return;
    setError('');
    if (!form.startDate) return setError('Choose the first day of your holiday.');
    const endDate = form.endDate || form.startDate;
    if (endDate < form.startDate) return setError('The last day must be on or after the first day.');
    if (formDays <= 0) return setError('Those dates are only weekends. Choose at least one weekday.');
    if (formDays > availableForForm) return setError(`That is ${plural(formDays)}, but you have ${plural(availableForForm)} left.`);
    setSaving(true);
    try {
      const body = { startDate: form.startDate, endDate, halfDay: form.halfDay && form.startDate === endDate, note: form.note.trim() };
      if (form.id) await apiStaff.updateHoliday(form.id, body);
      else await apiStaff.createHoliday(staffId, body);
      showFlyer(form.id ? 'Holiday request updated.' : 'Holiday requested. The office will confirm it soon.', 'success');
      setForm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save holiday');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (h: StaffHoliday) => {
    if (!window.confirm(`Cancel your holiday request for ${holidayRange(h)}?`)) return;
    try {
      await apiStaff.cancelHoliday(h.id);
      showFlyer('Holiday request cancelled.', 'success');
      await load();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not cancel', 'error');
    }
  };

  const sorted = useMemo(
    () => [...(data?.holidays ?? [])].filter((h) => h.status !== 'Cancelled').sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [data],
  );

  if (loading || !data) {
    return (
      <div className="flex justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (!data.staff.contracted) {
    return (
      <EmptyState
        icon={<Palmtree className="h-6 w-6" />}
        title="Holiday booking is for contracted staff"
        body="You are set up as self-employed, so paid holiday does not apply. If you think this is wrong, message the office."
      />
    );
  }

  const b = data.balance;
  const used = b.taken + b.confirmed + b.pending;
  const pct = (n: number) => (b.allowance ? `${(n / b.allowance) * 100}%` : '0%');
  const isNextYear = data.year > data.currentYear;
  const minDate = data.today > data.yearStart ? data.today : data.yearStart;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Allowance overview */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-600 to-indigo-600 p-6 text-white shadow-lg shadow-sky-600/20">
        <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" aria-hidden />
        <div className="relative">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-sky-50">Holiday year · {data.yearLabel}</p>
              <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
                {b.remaining}
                <span className="ml-2 text-lg font-medium text-sky-100">of {b.allowance} days left</span>
              </p>
            </div>
            <div className="flex gap-1 rounded-xl bg-white/15 p-1 text-xs font-semibold">
              {[data.currentYear, data.currentYear + 1].map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setYear(y);
                    setLoading(true);
                  }}
                  className={cx('rounded-lg px-3 py-1.5', data.year === y ? 'bg-white text-sky-700' : 'text-white/85 hover:bg-white/10')}
                >
                  {y === data.currentYear ? 'This year' : 'Next year'}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/20" aria-hidden>
            <div className="bg-white" style={{ width: pct(b.taken) }} />
            <div className="bg-emerald-300" style={{ width: pct(b.confirmed) }} />
            <div className="bg-amber-300" style={{ width: pct(b.pending) }} />
          </div>
          <p className="mt-2 text-xs text-sky-50/90">
            {plural(used)} booked · holiday pay {`£${data.staff.dailyPay.toFixed(2)}`} per day ({formatHoursMinutes(data.staff.hoursPerDay)} × £{data.staff.hourlyRate.toFixed(2)})
          </p>
          <Button
            variant="secondary"
            className="mt-5 w-full sm:w-auto"
            disabled={b.remaining <= 0}
            onClick={() => {
              setError('');
              setForm({ ...EMPTY_FORM, startDate: isNextYear ? data.yearStart : '' });
            }}
            icon={<CalendarPlus className="h-4 w-4" />}
          >
            Book holiday
          </Button>
          {b.remaining <= 0 ? <p className="mt-2 text-xs text-sky-50/90">You have used all your holiday for this year.</p> : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Taken', value: b.taken, icon: <CheckCircle2 className="h-5 w-5" />, accent: 'bg-slate-100 text-slate-600', hint: 'Approved and started' },
          { label: 'Confirmed', value: b.confirmed, icon: <CalendarDays className="h-5 w-5" />, accent: 'bg-emerald-50 text-emerald-600', hint: 'Approved, coming up' },
          { label: 'Pending', value: b.pending, icon: <Hourglass className="h-5 w-5" />, accent: 'bg-amber-50 text-amber-600', hint: 'Waiting for the office' },
          { label: 'Remaining', value: b.remaining, icon: <Palmtree className="h-5 w-5" />, accent: 'bg-sky-50 text-sky-600', hint: `Of ${b.allowance} days` },
        ].map((t) => (
          <Card key={t.label} className="flex items-start gap-3">
            <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', t.accent)}>{t.icon}</div>
            <div className="min-w-0">
              <p className="text-sm text-slate-500">{t.label}</p>
              <p className="text-2xl font-semibold tabular-nums text-slate-900">{t.value}</p>
              <p className="text-xs text-slate-500">{t.hint}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Booking / edit form */}
      {form ? (
        <div ref={formRef} className="scroll-mt-4">
        <Card className="relative">
          <button type="button" onClick={() => setForm(null)} className="absolute right-3 top-3 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
          <SectionHeader
            className="pr-8"
            title={form.id ? 'Change holiday request' : 'Book holiday'}
            subtitle="Weekdays count towards your allowance. Weekends are free."
          />
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="First day" htmlFor="hol-start">
              <input
                id="hol-start"
                type="date"
                className={inputClass}
                min={minDate}
                max={data.yearEnd}
                value={form.startDate}
                onChange={(e) => setForm((f) => f && { ...f, startDate: e.target.value, endDate: f.endDate && f.endDate < e.target.value ? e.target.value : f.endDate })}
              />
            </Field>
            <Field label="Last day" htmlFor="hol-end" hint="Leave empty for a single day.">
              <input
                id="hol-end"
                type="date"
                className={inputClass}
                min={form.startDate || minDate}
                max={data.yearEnd}
                value={form.endDate}
                onChange={(e) => setForm((f) => f && { ...f, endDate: e.target.value })}
              />
            </Field>
          </div>
          {form.startDate && (!form.endDate || form.endDate === form.startDate) ? (
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={form.halfDay} onChange={(e) => setForm((f) => f && { ...f, halfDay: e.target.checked })} className="h-4 w-4 rounded" />
              Half day only
            </label>
          ) : null}
          <Field label="Note for the office (optional)" htmlFor="hol-note" className="mt-4">
            <textarea id="hol-note" className={cx(inputClass, 'min-h-[72px]')} value={form.note} onChange={(e) => setForm((f) => f && { ...f, note: e.target.value })} placeholder="e.g. Family wedding" />
          </Field>
          <div className={cx('mt-4 rounded-xl px-4 py-3 text-sm', formDays > availableForForm ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700')}>
            {formDays > 0 ? (
              <>
                <strong>{plural(formDays)}</strong> of holiday · <strong>{plural(Math.max(0, availableForForm - formDays))}</strong> left after this ·
                holiday pay about <strong>£{(formDays * data.staff.dailyPay).toFixed(2)}</strong>
              </>
            ) : (
              'Pick your dates to see how many days this uses.'
            )}
          </div>
          {error ? (
            <Callout tone="danger" className="mt-3">
              {error}
            </Callout>
          ) : null}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setForm(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving || formDays <= 0}>
              {saving ? 'Saving…' : form.id ? 'Save changes' : 'Send request'}
            </Button>
          </div>
        </Card>
        </div>
      ) : null}

      {/* Requests */}
      <Card>
        <SectionHeader title="Your holiday" subtitle={data.yearLabel} />
        {sorted.length === 0 ? (
          <EmptyState className="mt-5" icon={<Palmtree className="h-6 w-6" />} title="No holiday booked yet" body="Tap Book holiday to request time off." />
        ) : (
          <ul className="mt-4 divide-y divide-slate-100">
            {sorted.map((h) => {
              const editable = h.status === 'Pending' || h.status === 'Rejected';
              const past = h.endDate < data.today;
              return (
                <li key={h.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-slate-900">{holidayRange(h)}</p>
                      <Badge tone={STATUS_TONE[h.status] || 'neutral'} dot>
                        {h.status === 'Approved' ? (past ? 'Taken' : 'Confirmed') : h.status}
                      </Badge>
                      {h.payStatus === 'paid' ? (
                        <Badge tone="success">
                          <PoundSterling className="h-3 w-3" /> Paid
                        </Badge>
                      ) : h.payStatus === 'claimed' ? (
                        <Badge tone="primary">On an invoice</Badge>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {h.halfDay ? 'Half day' : plural(h.days)}
                      {h.note ? ` · ${h.note}` : ''}
                    </p>
                    {h.adminNote ? <p className="mt-1 text-sm text-slate-600">Office: {h.adminNote}</p> : null}
                    {h.status === 'Rejected' ? <p className="mt-1 text-xs text-slate-500">Change the dates to send it again.</p> : null}
                  </div>
                  {editable ? (
                    <div className="flex shrink-0 gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Pencil className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setError('');
                          setForm({ id: h.id, startDate: h.startDate, endDate: h.endDate, halfDay: h.halfDay, note: h.note || '' });
                        }}
                      >
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => void cancel(h)}>
                        Cancel
                      </Button>
                    </div>
                  ) : h.status === 'Approved' && !past ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" /> To change, message the office
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {data.claimable.length > 0 ? (
        <Callout tone="success" icon={<PoundSterling className="h-4 w-4" />} title="Holiday pay ready">
          You have {plural(data.claimable.reduce((s, c) => s + c.days, 0))} of holiday pay (£
          {data.claimable.reduce((s, c) => s + c.amount, 0).toFixed(2)}) to claim. Add it to your next weekly invoice in Earnings.
        </Callout>
      ) : null}
    </div>
  );
}
