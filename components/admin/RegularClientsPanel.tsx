import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, Gift, Heart, Plus, Repeat, Settings2, Trash2, UserCheck, Users } from 'lucide-react';
import { apiAdmin } from '../../services/api';
import { subscribeNnSync } from '../../services/realtime';
import { useFlyer } from '../Flyer';
import type { RegularClient, RegularClientCare } from '../../types';
import { BTN_PRIMARY, BTN_SECONDARY, Card, EmptyState, Field, INPUT, PILL, Pill, SectionHeader, Segmented, SidePanel, StatCard, Switch } from './marketing/MarketingUi';

type Filter = 'at_risk' | 'active' | 'lapsed' | 'all';

const STATUS: Record<RegularClient['status'], { label: string; tone: string }> = {
  active: { label: 'On track', tone: PILL.green },
  at_risk: { label: 'Needs attention', tone: PILL.amber },
  lapsed: { label: 'Lapsed', tone: PILL.slate },
};

const FREQ_TONE: Record<string, string> = { Weekly: PILL.blue, Fortnightly: PILL.purple, Monthly: PILL.slate };

function fmtDay(ymd: string | null | undefined): string {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!y || !m || !d) return '-';
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

/**
 * Weekly, fortnightly and monthly clients: who is on track, who needs a call, and the thank-you
 * rewards and follow-ups they get automatically (Settings live here too).
 */
const RegularClientsPanel: React.FC<{ onViewClient?: (email: string) => void }> = ({ onViewClient }) => {
  const { showFlyer } = useFlyer();
  const [clients, setClients] = useState<RegularClient[]>([]);
  const [care, setCare] = useState<RegularClientCare | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>('at_risk');
  const [editing, setEditing] = useState<RegularClientCare | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await apiAdmin.getRegularClients();
      setClients(data.clients);
      setCare(data.settings);
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not load regular clients', 'error');
    } finally {
      setLoading(false);
    }
  }, [showFlyer]);

  useEffect(() => {
    void load();
    return subscribeNnSync(() => void load());
  }, [load]);

  const groups = useMemo(
    () => ({
      at_risk: clients.filter((c) => c.status === 'at_risk'),
      active: clients.filter((c) => c.status === 'active'),
      lapsed: clients.filter((c) => c.status === 'lapsed'),
      all: clients,
    }),
    [clients],
  );

  useEffect(() => {
    if (!loading && filter === 'at_risk' && groups.at_risk.length === 0 && groups.active.length) setFilter('active');
  }, [loading, filter, groups]);

  const shown = groups[filter];
  const totalCleans = clients.reduce((s, c) => s + c.cleans, 0);

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const milestones = editing.milestones
        .filter((m) => Number(m.cleans) > 0)
        .map((m) => ({ cleans: Math.round(Number(m.cleans)), points: Math.max(0, Math.round(Number(m.points) || 0)) }))
        .sort((a, b) => a.cleans - b.cleans);
      await apiAdmin.updateBusinessSettings({ regularClientCare: { ...editing, milestones } });
      setCare({ ...editing, milestones });
      setEditing(null);
      showFlyer('Regular client rewards saved', 'success');
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not save', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-64 animate-pulse rounded-2xl bg-slate-100" />;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <SectionHeader
        title="Regular clients"
        description="Weekly, fortnightly and monthly clients. Their next visit is booked after every clean, with their usual cleaner when free. Clients that need a call are listed first."
        actions={
          <button type="button" className={BTN_SECONDARY} onClick={() => care && setEditing({ ...care, milestones: care.milestones.map((m) => ({ ...m })) })}>
            <Settings2 className="h-4 w-4" /> Rewards and follow-ups
          </button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={<Users className="h-4 w-4" />} label="Regular clients" value={clients.length - groups.lapsed.length} sub={`${groups.lapsed.length} lapsed`} tone="bg-blue-50 text-blue-600" onClick={() => setFilter('all')} />
        <StatCard icon={<AlertTriangle className="h-4 w-4" />} label="Need attention" value={groups.at_risk.length} sub="No visit booked, cancellations or no cleaner" tone="bg-amber-50 text-amber-600" onClick={() => setFilter('at_risk')} />
        <StatCard icon={<UserCheck className="h-4 w-4" />} label="On track" value={groups.active.length} sub="Next visit booked with a cleaner" tone="bg-emerald-50 text-emerald-600" onClick={() => setFilter('active')} />
        <StatCard icon={<Heart className="h-4 w-4" />} label="Cleans delivered" value={totalCleans} sub="To regular clients" tone="bg-rose-50 text-rose-600" />
      </div>

      {care && !care.enabled ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Automatic welcomes, rewards and follow-ups are switched off. Turn them on in Rewards and follow-ups.
        </div>
      ) : null}

      <Segmented<Filter>
        ariaLabel="Regular clients"
        value={filter}
        onChange={setFilter}
        items={[
          { id: 'at_risk', label: 'Needs attention', count: groups.at_risk.length },
          { id: 'active', label: 'On track', count: groups.active.length },
          { id: 'lapsed', label: 'Lapsed', count: groups.lapsed.length },
          { id: 'all', label: 'All', count: clients.length },
        ]}
      />

      {shown.length === 0 ? (
        <EmptyState
          icon={<Repeat className="h-6 w-6" />}
          title={clients.length ? 'Nobody here' : 'No regular clients yet'}
          text={clients.length ? 'Try another filter.' : 'When a client books a weekly, fortnightly or monthly clean they appear here.'}
        />
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-slate-100">
            {shown.map((c) => (
              <li key={c.key} className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center">
                <div className="min-w-0 lg:w-72">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="truncate text-left text-sm font-black text-slate-900 hover:text-blue-600"
                      onClick={() => c.email && onViewClient?.(c.email)}
                    >
                      {c.name}
                    </button>
                    <Pill tone={FREQ_TONE[c.frequency] || PILL.slate}>{c.frequency}</Pill>
                    <Pill tone={STATUS[c.status].tone}>{STATUS[c.status].label}</Pill>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {c.serviceType} · since {fmtDay(c.since)} · {c.cleans} clean{c.cleans === 1 ? '' : 's'}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {[c.phone, c.email].filter(Boolean).join(' · ')}
                  </p>
                </div>

                <div className="grid flex-1 grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Next visit</p>
                    {c.nextVisit ? (
                      <p className="font-semibold text-slate-800">
                        {fmtDay(c.nextVisit.date)} {c.nextVisit.time}
                        <span className="block text-xs font-medium text-slate-500">{c.nextVisit.cleaners.length ? c.nextVisit.cleaners.join(', ') : 'No cleaner yet'}</span>
                      </p>
                    ) : (
                      <p className="font-semibold text-amber-700">Nothing booked</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Usual cleaner</p>
                    <p className="font-semibold text-slate-800">{c.usualCleaner || '-'}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Last clean</p>
                    <p className="font-semibold text-slate-800">{fmtDay(c.lastClean)}</p>
                  </div>
                </div>

                {c.reasons.length ? (
                  <ul className="space-y-1 lg:w-72">
                    {c.reasons.map((r) => (
                      <li key={r} className="flex items-start gap-1.5 text-xs font-medium text-amber-800">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {r}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 lg:w-72">
                    <CalendarClock className="h-3.5 w-3.5" /> All good
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SidePanel
        open={!!editing}
        title="Rewards and follow-ups"
        subtitle="What regular clients get automatically"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className={BTN_SECONDARY} onClick={() => setEditing(null)}>
              Cancel
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        }
      >
        {editing ? (
          <div className="space-y-6">
            <ToggleRow
              label="Regular client care"
              hint="Welcome message, next-visit emails, rewards and office alerts."
              checked={editing.enabled}
              onChange={(v) => setEditing({ ...editing, enabled: v })}
            />
            <ToggleRow
              label="Keep the same cleaner"
              hint="Book each next visit with their last cleaner when they are free. You are alerted when they are not."
              checked={editing.sameCleaner}
              onChange={(v) => setEditing({ ...editing, sameCleaner: v })}
            />

            <div>
              <p className="flex items-center gap-2 text-sm font-black text-slate-900">
                <Gift className="h-4 w-4 text-rose-500" /> Thank-you milestones
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Loyalty points added when a regular client reaches this many cleans (10 points = £1 off). Set points to 0 for a thank-you message only.</p>
              <div className="mt-3 space-y-2">
                {editing.milestones.map((m, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <Field label={i === 0 ? 'After clean number' : ''}>
                      <input
                        type="number"
                        min={1}
                        className={INPUT}
                        value={m.cleans}
                        onChange={(e) => setEditing({ ...editing, milestones: editing.milestones.map((x, j) => (j === i ? { ...x, cleans: Number(e.target.value) } : x)) })}
                      />
                    </Field>
                    <Field label={i === 0 ? 'Points' : ''}>
                      <input
                        type="number"
                        min={0}
                        className={INPUT}
                        value={m.points}
                        onChange={(e) => setEditing({ ...editing, milestones: editing.milestones.map((x, j) => (j === i ? { ...x, points: Number(e.target.value) } : x)) })}
                      />
                    </Field>
                    <span className="mb-3 w-16 shrink-0 text-xs font-semibold text-slate-500">£{((Number(m.points) || 0) / 10).toFixed(2)}</span>
                    <button
                      type="button"
                      className="mb-1.5 rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Remove milestone"
                      onClick={() => setEditing({ ...editing, milestones: editing.milestones.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-sm font-bold text-blue-600 hover:text-blue-700"
                  onClick={() => {
                    const last = editing.milestones[editing.milestones.length - 1];
                    setEditing({ ...editing, milestones: [...editing.milestones, { cleans: last ? last.cleans * 2 : 5, points: last ? last.points * 2 : 50 }] });
                  }}
                >
                  <Plus className="h-4 w-4" /> Add milestone
                </button>
              </div>
            </div>

            <Field label="Anniversary points" hint="Given on the anniversary of their first regular clean, every year they stay. 0 sends the message only.">
              <input type="number" min={0} className={INPUT} value={editing.anniversaryPoints} onChange={(e) => setEditing({ ...editing, anniversaryPoints: Number(e.target.value) })} />
            </Field>

            <ToggleRow
              label="We miss you message"
              hint="Sent once when a regular has nothing booked and is past their usual gap. You get an alert to call them too."
              checked={editing.winBack}
              onChange={(v) => setEditing({ ...editing, winBack: v })}
            />
            <Field label="Days past their usual gap before it is sent">
              <input
                type="number"
                min={1}
                max={90}
                className={INPUT}
                value={editing.quietDays}
                onChange={(e) => setEditing({ ...editing, quietDays: Number(e.target.value) })}
              />
            </Field>
            <p className="text-xs text-slate-500">The wording of every message is in Communication, under email templates starting with "client_regular".</p>
          </div>
        ) : null}
      </SidePanel>
    </div>
  );
};

function ToggleRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-black text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{hint}</p>
      </div>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

export default RegularClientsPanel;
