import React, { useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, Crown, Gift, HandCoins, Hourglass, Pencil, Search, Star, Trophy, Users, Wallet } from 'lucide-react';
import type { Referral } from '../../../types';
import { apiAdmin } from '../../../services/api';
import { useFlyer } from '../../Flyer';
import {
  Avatar,
  BTN_PRIMARY,
  BTN_SECONDARY,
  Card,
  EmptyState,
  INPUT,
  PILL,
  Pill,
  Segmented,
  SectionHeader,
  StatCard,
  copyText,
  money,
} from './MarketingUi';

export type ReferralFilter = 'all' | 'Pending' | 'Completed' | 'Paid Out';

export interface LoyaltyOverview {
  totalCustomers: number;
  customersWithPoints: number;
  totalPoints: number;
  topCustomers: Array<{ id: number; name: string; email: string; loyaltyPoints: number; referralCode?: string }>;
  topReferrers: Array<{ id: number; name: string; role: string; referrals: number }>;
}

const STATUS_PILL: Record<Referral['status'], { tone: string; label: string }> = {
  Pending: { tone: PILL.amber, label: 'Waiting for first clean' },
  Completed: { tone: PILL.blue, label: 'Ready to pay' },
  'Paid Out': { tone: PILL.green, label: 'Paid out' },
  Rejected: { tone: PILL.slate, label: 'Not eligible' },
};

/** Client rewards are cleaning credit (used automatically on bookings); staff rewards are paid as a bonus. */
function pillFor(r: Referral): { tone: string; label: string } {
  if (r.status === 'Completed' && r.referrerType === 'customer') return { tone: PILL.green, label: 'Credit added' };
  if (r.status === 'Completed' && r.payStatus === 'claimed') return { tone: PILL.blue, label: 'On staff invoice' };
  return STATUS_PILL[r.status] ?? { tone: PILL.slate, label: r.status };
}

/** Only an unlocked staff bonus that is not already on a weekly invoice can be marked paid by hand. */
const canMarkPaid = (r: Referral) => r.status === 'Completed' && r.referrerType === 'staff' && r.payStatus !== 'claimed';

export function referralTotals(referrals: Referral[]) {
  const t = { pending: 0, completed: 0, paid: 0, owed: 0, paidAmount: 0 };
  referrals.forEach((r) => {
    const amt = Number(r.rewardAmount) || 0;
    if (r.status === 'Pending') t.pending++;
    else if (r.status === 'Completed') {
      t.completed++;
      // Client rewards are cleaning credit, not money owed.
      if (r.referrerType === 'staff' && r.payStatus !== 'paid') t.owed += amt;
    } else if (r.status === 'Paid Out') {
      t.paid++;
      t.paidAmount += amt;
    }
  });
  return t;
}

interface ReferralsSectionProps {
  referrals: Referral[];
  rewardAmount: number;
  onRewardAmountChange: (n: number) => void;
  onSaveReward: () => void;
  savingReward: boolean;
  onEdit: (r: Referral) => void;
  onReferralsChanged: () => Promise<void>;
  initialFilter?: ReferralFilter;
}

export const ReferralsSection: React.FC<ReferralsSectionProps> = ({
  referrals,
  rewardAmount,
  onRewardAmountChange,
  onSaveReward,
  savingReward,
  onEdit,
  onReferralsChanged,
  initialFilter = 'all',
}) => {
  const { showFlyer } = useFlyer();
  const [filter, setFilter] = useState<ReferralFilter>(initialFilter);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const totals = useMemo(() => referralTotals(referrals), [referrals]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...referrals]
      .filter((r) => filter === 'all' || r.status === filter)
      .filter((r) => !q || `${r.referrerName} ${r.referredClientName}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.dateReferred).localeCompare(String(a.dateReferred)));
  }, [referrals, filter, search]);

  const advance = async (r: Referral) => {
    const next = r.status === 'Pending' ? 'Completed' : 'Paid Out';
    setBusyId(r.id);
    try {
      await apiAdmin.updateReferral(r.id, { status: next, rewardAmount: Number(r.rewardAmount) || 0 });
      await onReferralsChanged();
      showFlyer(next === 'Paid Out' ? `Marked ${money(Number(r.rewardAmount))} as paid to ${r.referrerName}.` : `Referral by ${r.referrerName} marked as completed.`, 'success');
    } catch {
      showFlyer('Could not update the referral.', 'error');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Referrals"
        description="Customers and cleaners earn a reward when someone they refer books a clean. Mark each one completed after the first clean, then paid once you have sent the reward."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<Hourglass className="h-4 w-4" />} tone="bg-amber-50 text-amber-600" label="Waiting" value={totals.pending} sub="Referred, no completed clean yet" />
        <StatCard
          icon={<HandCoins className="h-4 w-4" />}
          tone="bg-blue-50 text-blue-600"
          label="To pay out"
          value={money(totals.owed)}
          sub={`${totals.completed} reward${totals.completed === 1 ? '' : 's'} ready`}
          onClick={totals.completed ? () => setFilter('Completed') : undefined}
        />
        <StatCard icon={<Wallet className="h-4 w-4" />} tone="bg-emerald-50 text-emerald-600" label="Paid so far" value={money(totals.paidAmount)} sub={`${totals.paid} reward${totals.paid === 1 ? '' : 's'}`} />
      </div>

      {/* Reward setting */}
      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <Gift className="h-5 w-5" />
          </span>
          <div>
            <p className="font-black text-slate-900">Reward per referral</p>
            <p className="text-sm text-slate-500">Applies to every referral, from customers and cleaners.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-32">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">£</span>
            <input
              type="number"
              min={0}
              step="0.5"
              aria-label="Reward per referral in pounds"
              className={`${INPUT} pl-8 font-black`}
              value={Number.isFinite(rewardAmount) ? rewardAmount : 0}
              onChange={(e) => onRewardAmountChange(Number(e.target.value))}
            />
          </div>
          <button type="button" className={BTN_PRIMARY} onClick={onSaveReward} disabled={savingReward}>
            {savingReward ? 'Saving…' : 'Save'}
          </button>
        </div>
      </Card>

      {/* List */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          ariaLabel="Filter referrals"
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: 'All', count: referrals.length },
            { id: 'Pending', label: 'Waiting', count: totals.pending },
            { id: 'Completed', label: 'Ready to pay', count: totals.completed },
            { id: 'Paid Out', label: 'Paid out', count: totals.paid },
          ]}
        />
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" className={`${INPUT} pl-10`} placeholder="Search names" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {referrals.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No referrals yet"
          text="When a customer or cleaner shares their referral code and someone books with it, it will appear here."
        />
      ) : shown.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-slate-500">No referrals match this filter.</p>
      ) : (
        <Card className="divide-y divide-slate-100 overflow-hidden">
          <div className="hidden grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_110px_90px_120px_auto] gap-4 bg-slate-50 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-400 lg:grid">
            <span>Referred by</span>
            <span>New customer</span>
            <span>Date</span>
            <span>Reward</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          {shown.map((r) => {
            const pill = pillFor(r);
            const staff = r.referrerType === 'staff';
            return (
              <div
                key={r.id}
                className="grid grid-cols-1 gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1.2fr)_110px_90px_120px_auto] lg:items-center lg:gap-4"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={r.referrerName} tone={staff ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{r.referrerName}</p>
                    <p className={`text-[11px] font-bold ${staff ? 'text-purple-600' : 'text-blue-600'}`}>{staff ? 'Cleaner' : 'Customer'}</p>
                  </div>
                </div>
                <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-700">
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 lg:hidden" />
                  <span className="truncate">{r.referredClientName || 'Unknown'}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:contents">
                  <span className="text-xs font-semibold text-slate-500">
                    {r.dateReferred ? new Date(r.dateReferred).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                  </span>
                  <span className="text-sm font-black tabular-nums text-slate-900">{money(Number(r.rewardAmount))}</span>
                  <span>
                    <Pill tone={pill.tone}>{pill.label}</Pill>
                  </span>
                  <div className="flex items-center gap-2 lg:justify-end">
                    {r.status === 'Pending' || canMarkPaid(r) ? (
                      <button
                        type="button"
                        disabled={busyId === r.id}
                        onClick={() => void advance(r)}
                        className={`${r.status === 'Completed' ? BTN_PRIMARY : BTN_SECONDARY} whitespace-nowrap px-3 py-1.5 text-xs`}
                      >
                        <Check className="h-3.5 w-3.5" />
                        {busyId === r.id ? 'Saving…' : r.status === 'Pending' ? 'Mark completed' : 'Mark paid'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onEdit(r)}
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Edit reward or status"
                      aria-label={`Edit referral by ${r.referrerName}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
};

const MEDAL = ['bg-amber-100 text-amber-700', 'bg-slate-200 text-slate-700', 'bg-orange-100 text-orange-700'];

function Rank({ i }: { i: number }) {
  return (
    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${MEDAL[i] ?? 'bg-slate-100 text-slate-500'}`}>
      {i === 0 ? <Crown className="h-3.5 w-3.5" /> : i + 1}
    </span>
  );
}

function CopyCode({ code }: { code: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(code)) {
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        }
      }}
      className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-bold text-slate-600 hover:bg-slate-200"
      title="Copy referral code"
    >
      {code}
      {done ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function LoyaltySection({ data }: { data: LoyaltyOverview }) {
  const share = data.totalCustomers ? Math.round((data.customersWithPoints / data.totalCustomers) * 100) : 0;
  const maxPoints = Math.max(1, ...data.topCustomers.map((c) => Number(c.loyaltyPoints) || 0));
  const maxRefs = Math.max(1, ...data.topReferrers.map((r) => Number(r.referrals) || 0));
  const avg = data.customersWithPoints ? Math.round(data.totalPoints / data.customersWithPoints) : 0;

  return (
    <div className="space-y-6">
      <SectionHeader title="Loyalty" description="Customers collect points as they book. See who your most loyal customers and best referrers are." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="Customers" value={data.totalCustomers} sub="With an account" />
        <Card className="p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <Star className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">Collecting points</span>
          </div>
          <p className="mt-3 text-2xl font-black tabular-nums text-slate-900 sm:text-3xl">
            {data.customersWithPoints}
            <span className="ml-1.5 text-sm font-bold text-slate-400">{share}%</span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${share}%` }} />
          </div>
        </Card>
        <StatCard
          icon={<Trophy className="h-4 w-4" />}
          tone="bg-purple-50 text-purple-600"
          label="Points issued"
          value={Number(data.totalPoints || 0).toLocaleString('en-GB')}
          sub={avg ? `About ${avg} per customer` : 'None yet'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <h5 className="font-black text-slate-900">Most loyal customers</h5>
          </div>
          {data.topCustomers.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-400">No points collected yet.</p>
          ) : (
            <ol className="space-y-3">
              {data.topCustomers.map((u, i) => (
                <li key={u.id} className="flex items-center gap-3">
                  <Rank i={i} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-black text-slate-900">{u.name}</p>
                      <p className="shrink-0 text-sm font-black tabular-nums text-slate-900">
                        {u.loyaltyPoints} <span className="text-xs font-bold text-slate-400">pts</span>
                      </p>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.round(((Number(u.loyaltyPoints) || 0) / maxPoints) * 100)}%` }} />
                      </div>
                      {u.referralCode ? <CopyCode code={u.referralCode} /> : null}
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-slate-400">{u.email}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Trophy className="h-4 w-4 text-purple-500" />
            <h5 className="font-black text-slate-900">Top referrers</h5>
          </div>
          {data.topReferrers.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-400">No referrals yet.</p>
          ) : (
            <ol className="space-y-3">
              {data.topReferrers.map((r, i) => {
                const staff = String(r.role).toLowerCase() === 'staff';
                return (
                  <li key={r.id} className="flex items-center gap-3">
                    <Rank i={i} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="truncate text-sm font-black text-slate-900">{r.name}</p>
                          <Pill tone={staff ? PILL.purple : PILL.blue}>{staff ? 'Cleaner' : 'Customer'}</Pill>
                        </div>
                        <p className="shrink-0 text-sm font-black tabular-nums text-slate-900">{r.referrals}</p>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-purple-400" style={{ width: `${Math.round(((Number(r.referrals) || 0) / maxRefs) * 100)}%` }} />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
}
