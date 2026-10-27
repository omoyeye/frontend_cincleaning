import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck2, CalendarPlus, Check, ChevronLeft, ChevronRight, Hourglass, Palmtree, Users, X } from 'lucide-react';
import { apiAdmin, type AdminHolidayRequest, type AdminHolidayYear } from '../../services/api';
import { subscribeNnSync } from '../../services/realtime';
import { useFlyer } from '../Flyer';
import { countHolidayDays, fmtHolidayDay, holidayRange } from '../staff/StaffHolidayPanel';
import { Avatar, BTN_PRIMARY, BTN_SECONDARY, Card, EmptyState, Field, INPUT, PILL, Pill, SectionHeader, Segmented, SidePanel, StatCard } from './marketing/MarketingUi';

type Filter = 'pending' | 'upcoming' | 'past' | 'rejected' | 'all';

const plural = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

function statusPill(h: AdminHolidayRequest, today: string) {
  if (h.status === 'Pending') return <Pill tone={PILL.amber}>Pending</Pill>;
  if (h.status === 'Rejected') return <Pill tone={PILL.red}>Rejected</Pill>;
  if (h.status === 'Cancelled') return <Pill tone={PILL.slate}>Cancelled</Pill>;
  if (h.startDate <= today && h.endDate >= today) return <Pill tone={PILL.blue}>On holiday now</Pill>;
  return h.endDate < today ? <Pill tone={PILL.slate}>Taken</Pill> : <Pill tone={PILL.green}>Confirmed</Pill>;
}

function payPill(h: AdminHolidayRequest) {
  if (h.payStatus === 'paid') return <Pill tone={PILL.green}>Holiday pay paid</Pill>;
  if (h.payStatus === 'claimed') return <Pill tone={PILL.purple}>On staff invoice</Pill>;
  return null;
}

type Decision = { request: AdminHolidayRequest; status: 'Approved' | 'Rejected'; note: string; days: string };
type AddForm = { staffId: number; name: string; startDate: string; endDate: string; halfDay: boolean; note: string };

export default function AdminHolidaysPanel({ onPendingChange }: { onPendingChange?: (n: number) => void }) {
  const { showFlyer } = useFlyer();
  const [data, setData] = useState<AdminHolidayYear | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [addForm, setAddForm] = useState<AddForm | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiAdmin.getAdminHolidays(year ?? undefined);
      setData(res);
      if (res.year === res.currentYear) onPendingChange?.(res.requests.filter((r) => r.status === 'Pending').length);
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not load holiday', 'error');
    }
  }, [year, showFlyer, onPendingChange]);

  useEffect(() => {
    void load();
    return subscribeNnSync(() => void load());
  }, [load]);

  const today = data?.today ?? '';
  const requests = useMemo(() => (data?.requests ?? []).filter((r) => r.status !== 'Cancelled'), [data]);
  const groups = useMemo(() => {
    const pending = requests.filter((r) => r.status === 'Pending').sort((a, b) => a.startDate.localeCompare(b.startDate));
    const upcoming = requests.filter((r) => r.status === 'Approved' && r.endDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate));
    const past = requests.filter((r) => r.status === 'Approved' && r.endDate < today).sort((a, b) => b.startDate.localeCompare(a.startDate));
    const rejected = requests.filter((r) => r.status === 'Rejected').sort((a, b) => b.startDate.localeCompare(a.startDate));
    const all = [...requests].sort((a, b) => b.startDate.localeCompare(a.startDate));
    return { pending, upcoming, past, rejected, all };
  }, [requests, today]);

  const decide = async () => {
    if (!decision) return;
    const days = Number(decision.days);
    if (decision.status === 'Approved' && (!Number.isFinite(days) || days <= 0)) {
      showFlyer('Enter the number of days to take from the allowance.', 'error');
      return;
    }
    setBusy(true);
    try {
      await apiAdmin.decideHoliday(decision.request.id, {
        status: decision.status,
        adminNote: decision.note.trim() || undefined,
        days: decision.status === 'Approved' && days !== decision.request.days ? days : undefined,
      });
      showFlyer(decision.status === 'Approved' ? `Holiday approved for ${decision.request.staffName}.` : `Holiday rejected for ${decision.request.staffName}.`, 'success');
      setDecision(null);
      await load();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not save decision', 'error');
    } finally {
      setBusy(false);
    }
  };

  const quickApprove = async (r: AdminHolidayRequest) => {
    if (r.clashes.length) {
      setDecision({ request: r, status: 'Approved', note: '', days: String(r.days) });
      return;
    }
    setBusy(true);
    try {
      await apiAdmin.decideHoliday(r.id, { status: 'Approved' });
      showFlyer(`Holiday approved for ${r.staffName}.`, 'success');
      await load();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not approve', 'error');
    } finally {
      setBusy(false);
    }
  };

  const cancelApproved = async (r: AdminHolidayRequest) => {
    if (!window.confirm(`Cancel ${r.staffName}'s holiday for ${holidayRange(r)}? The days go back to their allowance and they will be told.`)) return;
    try {
      await apiAdmin.cancelHoliday(r.id);
      showFlyer('Holiday cancelled.', 'success');
      await load();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not cancel', 'error');
    }
  };

  const saveAdd = async () => {
    if (!addForm) return;
    const endDate = addForm.endDate || addForm.startDate;
    if (!addForm.startDate) return showFlyer('Choose the first day.', 'error');
    setBusy(true);
    try {
      await apiAdmin.createHoliday(addForm.staffId, {
        startDate: addForm.startDate,
        endDate,
        halfDay: addForm.halfDay && addForm.startDate === endDate,
        note: addForm.note.trim(),
        status: 'Approved',
      });
      showFlyer(`Holiday recorded for ${addForm.name}.`, 'success');
      setAddForm(null);
      await load();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not add holiday', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
      </div>
    );
  }

  const list = groups[filter];
  const onHolidayToday = data.balances.filter((b) => b.onHolidayToday);
  const approvedDays = data.balances.reduce((s, b) => s + b.taken + b.confirmed, 0);
  const yearStart = `${data.year}-04-01`;
  const yearEnd = `${data.year + 1}-03-31`;
  const addDays = addForm ? countHolidayDays(addForm.startDate, addForm.endDate || addForm.startDate, addForm.halfDay) : 0;
  const addBalance = addForm ? data.balances.find((b) => b.staffId === addForm.staffId) : undefined;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <SectionHeader
        title="Staff holiday"
        description="Contracted staff book paid holiday here. Approve, reject or leave requests pending. Each person gets up to 26 days from April to March."
        actions={
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
            <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Previous year" onClick={() => setYear(data.year - 1)}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[10.5rem] text-center text-sm font-bold text-slate-800">{data.yearLabel}</span>
            <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30" aria-label="Next year" disabled={data.year > data.currentYear} onClick={() => setYear(data.year + 1)}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Hourglass className="h-4 w-4" />} label="Waiting" value={groups.pending.length} sub="Requests to decide" tone="bg-amber-50 text-amber-600" onClick={() => setFilter('pending')} />
        <StatCard
          icon={<Palmtree className="h-4 w-4" />}
          label="Off today"
          value={onHolidayToday.length}
          sub={onHolidayToday.length ? onHolidayToday.map((b) => b.name.split(' ')[0]).join(', ') : 'Everyone is working'}
          tone="bg-sky-50 text-sky-600"
        />
        <StatCard icon={<CalendarCheck2 className="h-4 w-4" />} label="Approved days" value={approvedDays} sub="Taken and confirmed this year" tone="bg-emerald-50 text-emerald-600" onClick={() => setFilter('upcoming')} />
        <StatCard icon={<Users className="h-4 w-4" />} label="Contracted staff" value={data.balances.length} sub="Who can book holiday" tone="bg-blue-50 text-blue-600" />
      </div>

      <div className="space-y-4">
        <Segmented<Filter>
          ariaLabel="Holiday requests"
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'pending', label: 'Pending', count: groups.pending.length },
            { id: 'upcoming', label: 'Confirmed', count: groups.upcoming.length },
            { id: 'past', label: 'Taken', count: groups.past.length },
            { id: 'rejected', label: 'Rejected', count: groups.rejected.length },
            { id: 'all', label: 'All', count: groups.all.length },
          ]}
        />

        {list.length === 0 ? (
          <EmptyState
            icon={<Palmtree className="h-6 w-6" />}
            title={filter === 'pending' ? 'No requests waiting' : 'Nothing here yet'}
            text={filter === 'pending' ? 'New holiday requests from staff show up here for you to approve.' : `No ${filter === 'all' ? '' : filter + ' '}holiday in ${data.yearLabel}.`}
          />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {list.map((r) => {
              const bal = data.balances.find((b) => b.staffId === r.staffId);
              return (
                <Card key={r.id} className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <Avatar name={r.staffName} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-900">{r.staffName}</p>
                        {statusPill(r, today)}
                        {payPill(r)}
                      </div>
                      <p className="mt-1 text-sm font-bold text-slate-700">
                        {holidayRange(r)} · {r.halfDay ? 'Half day' : plural(r.days)}
                      </p>
                      {r.note ? <p className="mt-1 text-sm text-slate-500">"{r.note}"</p> : null}
                      {r.adminNote ? <p className="mt-1 text-xs text-slate-500">Your note: {r.adminNote}</p> : null}
                      {bal && r.status === 'Pending' ? (
                        <p className="mt-1 text-xs text-slate-500">
                          {plural(bal.remaining)} left if approved · {bal.allowance} allowed
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {r.clashes.length ? (
                    <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                      <p className="flex items-center gap-1.5 font-bold">
                        <AlertTriangle className="h-4 w-4" /> {r.clashes.length} {r.clashes.length === 1 ? 'job is' : 'jobs are'} booked with {r.staffName.split(' ')[0]} on these days
                      </p>
                      <ul className="mt-1 space-y-0.5 text-xs">
                        {r.clashes.slice(0, 4).map((c) => (
                          <li key={c.id}>
                            {fmtHolidayDay(c.date)}
                            {c.time ? ` ${c.time}` : ''} · {c.client} · {c.service}
                          </li>
                        ))}
                        {r.clashes.length > 4 ? <li>and {r.clashes.length - 4} more</li> : null}
                      </ul>
                      <p className="mt-1 text-xs">Reassign these jobs in Job Assignment if you approve.</p>
                    </div>
                  ) : null}

                  {r.status === 'Pending' ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="button" className={BTN_PRIMARY} disabled={busy} onClick={() => void quickApprove(r)}>
                        <Check className="h-4 w-4" /> Approve
                      </button>
                      <button type="button" className={BTN_SECONDARY} disabled={busy} onClick={() => setDecision({ request: r, status: 'Rejected', note: '', days: String(r.days) })}>
                        <X className="h-4 w-4" /> Reject
                      </button>
                      <button type="button" className={`${BTN_SECONDARY} border-transparent`} onClick={() => setDecision({ request: r, status: 'Approved', note: '', days: String(r.days) })}>
                        Approve with note
                      </button>
                    </div>
                  ) : r.status === 'Approved' && r.payStatus === 'unpaid' ? (
                    <div className="mt-4">
                      <button type="button" className="text-xs font-bold text-red-600 hover:underline" onClick={() => void cancelApproved(r)}>
                        Cancel this holiday
                      </button>
                    </div>
                  ) : r.status === 'Rejected' ? (
                    <div className="mt-4">
                      <button type="button" className="text-xs font-bold text-blue-600 hover:underline" onClick={() => setDecision({ request: r, status: 'Approved', note: '', days: String(r.days) })}>
                        Approve after all
                      </button>
                    </div>
                  ) : null}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Allowances */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 px-5 py-4">
          <div>
            <h5 className="text-base font-black text-slate-900">Allowances · {data.yearLabel}</h5>
            <p className="text-sm text-slate-500">Set contract type and allowance in Staffing. Self-employed staff cannot book holiday.</p>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] font-bold text-slate-500">
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-slate-500" /> Taken</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Confirmed</span>
            <span className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Pending</span>
          </div>
        </div>
        {data.balances.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No contracted staff yet. Open a staff member in Staffing and set their contract to Contracted.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {data.balances.map((b) => {
              const pct = (n: number) => (b.allowance ? `${(n / b.allowance) * 100}%` : '0%');
              return (
                <li key={b.staffId} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 items-center gap-3 sm:w-56">
                    <Avatar name={b.name} tone="bg-sky-100 text-sky-700" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{b.name}</p>
                      {b.onHolidayToday ? <Pill tone={PILL.blue}>Off today</Pill> : <p className="text-xs text-slate-500">{b.allowance} days allowed</p>}
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div className="bg-slate-500" style={{ width: pct(b.taken) }} />
                      <div className="bg-emerald-500" style={{ width: pct(b.confirmed) }} />
                      <div className="bg-amber-400" style={{ width: pct(b.pending) }} />
                    </div>
                    <p className="mt-1.5 text-xs font-medium text-slate-500">
                      {b.taken} taken · {b.confirmed} confirmed · {b.pending} pending
                    </p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <p className="text-sm">
                      <span className="text-xl font-black tabular-nums text-slate-900">{b.remaining}</span>
                      <span className="ml-1 font-medium text-slate-500">left</span>
                    </p>
                    <button
                      type="button"
                      className={BTN_SECONDARY}
                      disabled={b.remaining <= 0}
                      onClick={() => setAddForm({ staffId: b.staffId, name: b.name, startDate: '', endDate: '', halfDay: false, note: '' })}
                    >
                      <CalendarPlus className="h-4 w-4" /> Add
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Approve / reject panel */}
      <SidePanel
        open={!!decision}
        title={decision?.status === 'Approved' ? 'Approve holiday' : 'Reject holiday'}
        subtitle={decision ? `${decision.request.staffName} · ${holidayRange(decision.request)}` : undefined}
        onClose={() => setDecision(null)}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setDecision(null)}>
              Back
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void decide()}
              className={decision?.status === 'Rejected' ? BTN_PRIMARY.replace('bg-blue-600', 'bg-red-600').replace('hover:bg-blue-700', 'hover:bg-red-700').replace('shadow-blue-200', 'shadow-red-200') : BTN_PRIMARY}
            >
              {busy ? 'Saving…' : decision?.status === 'Approved' ? 'Approve holiday' : 'Reject holiday'}
            </button>
          </>
        }
      >
        {decision ? (
          <>
            <Segmented<'Approved' | 'Rejected'>
              ariaLabel="Decision"
              value={decision.status}
              onChange={(status) => setDecision({ ...decision, status })}
              items={[
                { id: 'Approved', label: 'Approve' },
                { id: 'Rejected', label: 'Reject' },
              ]}
            />
            {decision.request.note ? (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-600 ring-1 ring-inset ring-slate-200">
                <p className="text-xs font-bold text-slate-500">Their note</p>
                <p className="mt-1">{decision.request.note}</p>
              </div>
            ) : null}
            {decision.request.clashes.length ? (
              <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
                <p className="font-bold">
                  {decision.request.clashes.length} {decision.request.clashes.length === 1 ? 'job' : 'jobs'} booked with them on these days
                </p>
                <ul className="mt-1 space-y-0.5 text-xs">
                  {decision.request.clashes.map((c) => (
                    <li key={c.id}>
                      {fmtHolidayDay(c.date)}
                      {c.time ? ` ${c.time}` : ''} · {c.client} · {c.service}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {decision.status === 'Approved' ? (
              <Field label="Days taken from allowance" hint="Usually the weekdays in the request. Change it for bank holidays or part days.">
                <input type="number" min={0.5} step={0.5} className={INPUT} value={decision.days} onChange={(e) => setDecision({ ...decision, days: e.target.value })} />
              </Field>
            ) : null}
            <Field label={decision.status === 'Rejected' ? 'Reason (the staff member sees this)' : 'Note for the staff member (optional)'}>
              <textarea
                className={`${INPUT} min-h-[96px]`}
                value={decision.note}
                onChange={(e) => setDecision({ ...decision, note: e.target.value })}
                placeholder={decision.status === 'Rejected' ? 'e.g. We are short staffed that week. Could you pick other dates?' : 'e.g. Enjoy your break!'}
              />
            </Field>
          </>
        ) : null}
      </SidePanel>

      {/* Record holiday for a staff member */}
      <SidePanel
        open={!!addForm}
        title="Add holiday"
        subtitle={addForm ? `${addForm.name} · approved straight away` : undefined}
        onClose={() => setAddForm(null)}
        footer={
          <>
            <button type="button" className={BTN_SECONDARY} onClick={() => setAddForm(null)}>
              Cancel
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={busy || addDays <= 0} onClick={() => void saveAdd()}>
              {busy ? 'Saving…' : 'Add holiday'}
            </button>
          </>
        }
      >
        {addForm ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="First day">
                <input
                  type="date"
                  className={INPUT}
                  min={yearStart}
                  max={yearEnd}
                  value={addForm.startDate}
                  onChange={(e) => setAddForm({ ...addForm, startDate: e.target.value, endDate: addForm.endDate && addForm.endDate < e.target.value ? e.target.value : addForm.endDate })}
                />
              </Field>
              <Field label="Last day" hint="Leave empty for one day.">
                <input type="date" className={INPUT} min={addForm.startDate || yearStart} max={yearEnd} value={addForm.endDate} onChange={(e) => setAddForm({ ...addForm, endDate: e.target.value })} />
              </Field>
            </div>
            {addForm.startDate && (!addForm.endDate || addForm.endDate === addForm.startDate) ? (
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input type="checkbox" checked={addForm.halfDay} onChange={(e) => setAddForm({ ...addForm, halfDay: e.target.checked })} className="h-4 w-4 rounded" />
                Half day only
              </label>
            ) : null}
            <Field label="Note (optional)">
              <input className={INPUT} value={addForm.note} onChange={(e) => setAddForm({ ...addForm, note: e.target.value })} placeholder="e.g. Agreed by phone" />
            </Field>
            <div className={`rounded-xl px-4 py-3 text-sm ${addBalance && addDays > addBalance.remaining ? 'bg-red-50 text-red-700' : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200'}`}>
              {addDays > 0 ? (
                <>
                  <strong>{plural(addDays)}</strong> · {addBalance ? `${plural(Math.max(0, addBalance.remaining - addDays))} left after this` : ''}
                </>
              ) : (
                'Pick dates to see how many weekdays this uses.'
              )}
            </div>
            <p className="text-xs text-slate-500">You can record past dates, for example holiday agreed by phone. Past days become claimable holiday pay on their next invoice.</p>
          </>
        ) : null}
      </SidePanel>
    </div>
  );
}
