import React, { useCallback, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Gift,
  HandCoins,
  Hourglass,
  ImageIcon,
  LayoutDashboard,
  LayoutTemplate,
  Megaphone,
  Star,
  Ticket,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { Referral } from '../../../types';
import WebsiteContentManager from '../WebsiteContentManager';
import GalleryManager from '../GalleryManager';
import BlogManager from '../BlogManager';
import PromoCodesSection, { bannerStatus, codeState, discountLabel, usePromotions, type DiscountRow } from './PromoCodesSection';
import { LoyaltySection, ReferralsSection, referralTotals, type LoyaltyOverview, type ReferralFilter } from './ReferralsSection';
import { Card, HubLayout, SectionHeader, StatCard, money } from './MarketingUi';

export type MarketingSectionId = 'overview' | 'referrals' | 'loyalty' | 'promos' | 'website' | 'gallery' | 'blog';

interface Props {
  section: MarketingSectionId;
  onSectionChange: (s: MarketingSectionId) => void;
  referrals: Referral[];
  onReferralsChanged: () => Promise<void>;
  onEditReferral: (r: Referral) => void;
  rewardAmount: number;
  onRewardAmountChange: (n: number) => void;
  onSaveReward: () => void;
  savingReward: boolean;
  loyalty: LoyaltyOverview;
  discounts: DiscountRow[];
  onDiscountsChange: (rows: DiscountRow[]) => void;
  newQuoteCount: number;
  onOpenQuotes: () => void;
}

const NAV: { group: string; items: { id: MarketingSectionId; label: string; hint: string; icon: React.ReactNode }[] }[] = [
  {
    group: 'Grow',
    items: [
      { id: 'overview', label: 'Overview', hint: 'What needs doing', icon: <LayoutDashboard className="h-4 w-4" /> },
      { id: 'promos', label: 'Offers & codes', hint: 'Promo codes and banners', icon: <Ticket className="h-4 w-4" /> },
      { id: 'referrals', label: 'Referrals', hint: 'Rewards to pay', icon: <Gift className="h-4 w-4" /> },
      { id: 'loyalty', label: 'Loyalty', hint: 'Top customers', icon: <Star className="h-4 w-4" /> },
    ],
  },
  {
    group: 'Website',
    items: [
      { id: 'website', label: 'Website content', hint: 'Headers, cards, footer', icon: <LayoutTemplate className="h-4 w-4" /> },
      { id: 'gallery', label: 'Gallery', hint: 'Photos of your work', icon: <ImageIcon className="h-4 w-4" /> },
      { id: 'blog', label: 'Blog', hint: 'Tips and guides', icon: <FileText className="h-4 w-4" /> },
    ],
  },
];

/** Headers for the sections whose managers don't draw their own. */
const TITLES: Partial<Record<MarketingSectionId, { title: string; description: string }>> = {
  website: { title: 'Website content', description: 'Edit the words and photos on your public website. Everything saves automatically.' },
  gallery: { title: 'Gallery', description: 'Photos of your work, shown on the Gallery page of the website.' },
  blog: { title: 'Blog', description: 'Articles that help customers and bring visitors from Google.' },
};

export default function MarketingHub(props: Props) {
  const { section, onSectionChange } = props;
  const promotions = usePromotions();
  const [openCreate, setOpenCreate] = useState<'code' | 'banner' | null>(null);
  const [referralFilter, setReferralFilter] = useState<ReferralFilter>('all');
  const clearOpenCreate = useCallback(() => setOpenCreate(null), []);
  const totals = useMemo(() => referralTotals(props.referrals), [props.referrals]);
  const codeStats = useMemo(() => {
    const active = props.discounts.filter((d) => codeState(d) === 'active').length;
    const usedUp = props.discounts.filter((d) => codeState(d) === 'used_up').length;
    const redemptions = props.discounts.reduce((s, d) => s + (Number(d.usedCount) || 0), 0);
    return { active, usedUp, redemptions };
  }, [props.discounts]);
  const liveBanners = useMemo(() => promotions.list.filter((p) => bannerStatus(p) === 'live'), [promotions.list]);

  const badge: Partial<Record<MarketingSectionId, number>> = {
    promos: liveBanners.length + codeStats.active || undefined,
    referrals: totals.completed || undefined,
  };

  const go = (s: MarketingSectionId) => {
    onSectionChange(s);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const head = TITLES[section];

  const groups = NAV.map((g) => ({
    group: g.group,
    items: g.items.map((it) => ({ ...it, badge: badge[it.id], badgeAlert: it.id === 'referrals' })),
  }));

  return (
    <HubLayout
      title="Marketing"
      subtitle="Bring in new customers and keep them coming back."
      navLabel="Marketing sections"
      groups={groups}
      active={section}
      onChange={onSectionChange}
    >
          {head ? <SectionHeader title={head.title} description={head.description} /> : null}

          {section === 'overview' && (
            <Overview
              {...props}
              totals={totals}
              codeStats={codeStats}
              liveBanners={liveBanners}
              promotionsLoading={promotions.loading}
              go={go}
              onCreate={(kind) => {
                setOpenCreate(kind);
                go('promos');
              }}
              onReferralFilter={(f) => {
                setReferralFilter(f);
                go('referrals');
              }}
            />
          )}

          {section === 'promos' && (
            <PromoCodesSection
              discounts={props.discounts}
              onDiscountsChange={props.onDiscountsChange}
              promotions={promotions}
              openCreate={openCreate}
              onOpenCreateHandled={clearOpenCreate}
            />
          )}

          {section === 'referrals' && (
            <ReferralsSection
              key={referralFilter}
              referrals={props.referrals}
              rewardAmount={props.rewardAmount}
              onRewardAmountChange={props.onRewardAmountChange}
              onSaveReward={props.onSaveReward}
              savingReward={props.savingReward}
              onEdit={props.onEditReferral}
              onReferralsChanged={props.onReferralsChanged}
              initialFilter={referralFilter}
            />
          )}

          {section === 'loyalty' && <LoyaltySection data={props.loyalty} />}
          {section === 'website' && <WebsiteContentManager />}
          {section === 'gallery' && <GalleryManager />}
          {section === 'blog' && <BlogManager />}
    </HubLayout>
  );
}

/* ---------------------------------------------------------------------------------------------- */

function Overview(
  p: Props & {
    totals: ReturnType<typeof referralTotals>;
    codeStats: { active: number; usedUp: number; redemptions: number };
    liveBanners: ReturnType<typeof usePromotions>['list'];
    promotionsLoading: boolean;
    go: (s: MarketingSectionId) => void;
    onCreate: (kind: 'code' | 'banner') => void;
    onReferralFilter: (f: ReferralFilter) => void;
  }
) {
  const { totals, codeStats, liveBanners } = p;

  const todos: { icon: React.ReactNode; tone: string; text: React.ReactNode; action: string; run: () => void }[] = [];
  if (p.newQuoteCount > 0)
    todos.push({
      icon: <ClipboardList className="h-4 w-4" />,
      tone: 'bg-blue-50 text-blue-600',
      text: (
        <>
          <strong>{p.newQuoteCount}</strong> new quote request{p.newQuoteCount === 1 ? '' : 's'} waiting for a reply
        </>
      ),
      action: 'Reply',
      run: p.onOpenQuotes,
    });
  if (totals.completed > 0)
    todos.push({
      icon: <HandCoins className="h-4 w-4" />,
      tone: 'bg-emerald-50 text-emerald-600',
      text: (
        <>
          <strong>{money(totals.owed)}</strong> in staff referral bonuses ready to pay ({totals.completed})
        </>
      ),
      action: 'Pay out',
      run: () => p.onReferralFilter('Completed'),
    });
  if (totals.pending > 0)
    todos.push({
      icon: <Hourglass className="h-4 w-4" />,
      tone: 'bg-amber-50 text-amber-600',
      text: (
        <>
          <strong>{totals.pending}</strong> referral{totals.pending === 1 ? '' : 's'} waiting for a first clean
        </>
      ),
      action: 'Review',
      run: () => p.onReferralFilter('Pending'),
    });
  if (codeStats.usedUp > 0)
    todos.push({
      icon: <Ticket className="h-4 w-4" />,
      tone: 'bg-amber-50 text-amber-600',
      text: (
        <>
          <strong>{codeStats.usedUp}</strong> promo code{codeStats.usedUp === 1 ? ' has' : 's have'} reached the usage limit
        </>
      ),
      action: 'View',
      run: () => p.go('promos'),
    });
  if (!p.promotionsLoading && liveBanners.length === 0)
    todos.push({
      icon: <Megaphone className="h-4 w-4" />,
      tone: 'bg-purple-50 text-purple-600',
      text: 'No offer is showing on the website right now',
      action: 'Add banner',
      run: () => p.onCreate('banner'),
    });

  const topCodes = [...p.discounts].sort((a, b) => (Number(b.usedCount) || 0) - (Number(a.usedCount) || 0)).slice(0, 5);
  const maxUsed = Math.max(1, ...topCodes.map((d) => Number(d.usedCount) || 0));
  const refTotal = totals.pending + totals.completed + totals.paid;

  const actions: { icon: React.ReactNode; label: string; hint: string; run: () => void }[] = [
    { icon: <Ticket className="h-5 w-5" />, label: 'New promo code', hint: 'A discount for checkout', run: () => p.onCreate('code') },
    { icon: <Megaphone className="h-5 w-5" />, label: 'New website banner', hint: 'Announce a seasonal offer', run: () => p.onCreate('banner') },
    { icon: <LayoutTemplate className="h-5 w-5" />, label: 'Edit homepage', hint: 'Headline, photo, cards', run: () => p.go('website') },
    { icon: <ImageIcon className="h-5 w-5" />, label: 'Add gallery photo', hint: 'Show your best work', run: () => p.go('gallery') },
    { icon: <FileText className="h-5 w-5" />, label: 'Write a blog post', hint: 'Help people find you', run: () => p.go('blog') },
    { icon: <Gift className="h-5 w-5" />, label: 'Referral reward', hint: `Currently ${money(p.rewardAmount)}`, run: () => p.go('referrals') },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={<Ticket className="h-4 w-4" />}
          label="Active codes"
          value={codeStats.active}
          sub={`${codeStats.redemptions} use${codeStats.redemptions === 1 ? '' : 's'} so far`}
          onClick={() => p.go('promos')}
        />
        <StatCard
          icon={<Megaphone className="h-4 w-4" />}
          tone="bg-purple-50 text-purple-600"
          label="Live banner"
          value={<span className="block truncate text-lg sm:text-xl">{liveBanners[0]?.title ?? 'None'}</span>}
          sub={liveBanners.length > 1 ? `+${liveBanners.length - 1} more live` : liveBanners.length ? 'Showing on the website' : 'Nothing showing now'}
          onClick={() => p.go('promos')}
        />
        <StatCard
          icon={<HandCoins className="h-4 w-4" />}
          tone="bg-emerald-50 text-emerald-600"
          label="Rewards to pay"
          value={money(totals.owed)}
          sub={`${totals.completed} referral${totals.completed === 1 ? '' : 's'} ready`}
          onClick={() => p.onReferralFilter(totals.completed ? 'Completed' : 'all')}
        />
        <StatCard
          icon={<Users className="h-4 w-4" />}
          tone="bg-amber-50 text-amber-600"
          label="Loyalty members"
          value={p.loyalty.customersWithPoints}
          sub={`of ${p.loyalty.totalCustomers} customers`}
          onClick={() => p.go('loyalty')}
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
        <Card className="p-4 sm:p-6">
          <h5 className="font-black text-slate-900">To do</h5>
          {todos.length === 0 ? (
            <div className="flex items-center gap-3 py-6">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              <div>
                <p className="font-bold text-slate-900">You are all caught up</p>
                <p className="text-sm text-slate-500">Nothing needs your attention in marketing right now.</p>
              </div>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {todos.map((t, i) => (
                <li key={i}>
                  <button type="button" onClick={t.run} className="group flex w-full items-center gap-3 py-3 text-left">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.tone}`}>{t.icon}</span>
                    <span className="min-w-0 flex-1 text-sm text-slate-700">{t.text}</span>
                    <span className="inline-flex shrink-0 items-center gap-0.5 text-xs font-bold text-blue-600 group-hover:text-blue-800">
                      {t.action} <ChevronRight className="h-4 w-4" />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 sm:p-6">
          <h5 className="font-black text-slate-900">Quick actions</h5>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.run}
                className="group flex flex-col items-start gap-2 rounded-xl border border-slate-200 p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-blue-600 group-hover:text-white">{a.icon}</span>
                <span>
                  <span className="block text-sm font-bold text-slate-900">{a.label}</span>
                  <span className="block text-[11px] text-slate-500">{a.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h5 className="flex items-center gap-2 font-black text-slate-900">
              <TrendingUp className="h-4 w-4 text-blue-600" /> Most used codes
            </h5>
            <button type="button" onClick={() => p.go('promos')} className="text-xs font-bold text-blue-600 hover:text-blue-800">
              All codes
            </button>
          </div>
          {topCodes.length === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-400">No promo codes yet.</p>
          ) : (
            <ul className="mt-4 space-y-3">
              {topCodes.map((d) => (
                <li key={String(d.id)}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <code className="truncate font-mono font-black text-slate-900">{d.code}</code>
                      <span className="shrink-0 text-xs text-slate-500">{discountLabel(d)}</span>
                    </span>
                    <span className="shrink-0 font-black tabular-nums text-slate-900">{Number(d.usedCount) || 0}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.round(((Number(d.usedCount) || 0) / maxUsed) * 100)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-4 sm:p-6">
          <div className="flex items-center justify-between gap-2">
            <h5 className="flex items-center gap-2 font-black text-slate-900">
              <Gift className="h-4 w-4 text-purple-600" /> Referrals
            </h5>
            <button type="button" onClick={() => p.go('referrals')} className="text-xs font-bold text-blue-600 hover:text-blue-800">
              Open
            </button>
          </div>
          {refTotal === 0 ? (
            <p className="py-8 text-center text-sm font-semibold text-slate-400">No referrals yet.</p>
          ) : (
            <>
              <p className="mt-3 text-3xl font-black tabular-nums text-slate-900">
                {refTotal}
                <span className="ml-2 text-sm font-bold text-slate-400">
                  {Math.round(((totals.completed + totals.paid) / refTotal) * 100)}% turned into a booking
                </span>
              </p>
              <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="bg-amber-400" style={{ width: `${(totals.pending / refTotal) * 100}%` }} title="Waiting" />
                <div className="bg-blue-500" style={{ width: `${(totals.completed / refTotal) * 100}%` }} title="Ready to pay" />
                <div className="bg-emerald-500" style={{ width: `${(totals.paid / refTotal) * 100}%` }} title="Paid out" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                {[
                  { label: 'Waiting', n: totals.pending, dot: 'bg-amber-400', f: 'Pending' as const },
                  { label: 'Ready to pay', n: totals.completed, dot: 'bg-blue-500', f: 'Completed' as const },
                  { label: 'Paid out', n: totals.paid, dot: 'bg-emerald-500', f: 'Paid Out' as const },
                ].map((s) => (
                  <button key={s.label} type="button" onClick={() => p.onReferralFilter(s.f)} className="rounded-lg p-2 text-left hover:bg-slate-50">
                    <span className="flex items-center gap-1.5 font-semibold text-slate-500">
                      <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.label}
                    </span>
                    <span className="mt-0.5 block text-lg font-black tabular-nums text-slate-900">{s.n}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
