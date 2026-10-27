import React, { useMemo, useState } from 'react';
import {
  Briefcase,
  Building2,
  Clock,
  Droplets,
  Eye,
  Hotel,
  Key,
  Layers,
  Package,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  TrendingUp,
} from 'lucide-react';
import type { Booking, Extra, ServiceConfig } from '../../../types';
import { formatHoursMinutes, getServiceTrigger, resolveDeepEotCallOutChargeGbp } from '../../../src/utils/bookingHelpers';
import { londonRateOf } from '../../../src/utils/pricing';
import { BTN_PRIMARY, BTN_SECONDARY, Card, EmptyState, HubLayout, PILL, Pill, SectionHeader, Segmented, StatCard, Switch } from '../marketing/MarketingUi';

export type ServicesSectionId = 'catalog' | 'addons';

const TRIGGER_META: Record<string, { label: string; icon: React.ReactNode; tone: string }> = {
  standard: { label: 'Hourly clean', icon: <Sparkles className="h-5 w-5" />, tone: 'bg-blue-50 text-blue-600' },
  custom: { label: 'Custom', icon: <Sparkles className="h-5 w-5" />, tone: 'bg-blue-50 text-blue-600' },
  deep: { label: 'Priced by room', icon: <Layers className="h-5 w-5" />, tone: 'bg-violet-50 text-violet-600' },
  end_of_tenancy: { label: 'Priced by room', icon: <Key className="h-5 w-5" />, tone: 'bg-amber-50 text-amber-600' },
  airbnb: { label: 'By bedrooms', icon: <Hotel className="h-5 w-5" />, tone: 'bg-rose-50 text-rose-600' },
  commercial: { label: 'Quote request', icon: <Building2 className="h-5 w-5" />, tone: 'bg-slate-100 text-slate-600' },
  jet_washing: { label: 'Quote request', icon: <Droplets className="h-5 w-5" />, tone: 'bg-cyan-50 text-cyan-600' },
};

const STEP_LABEL: Record<string, string> = {
  details: 'Details',
  extras: 'Extras',
  schedule: 'Schedule',
  location: 'Address',
  requirements: 'Notes',
  invoice: 'Invoice',
};

/** Rooms are priced per room on Deep and End of Tenancy cleans (same rule the booking form uses). */
const isRoomExtra = (name: string) => ['bedroom', 'reception', 'bathroom', 'utility', 'cloakroom', 'clock', 'kitchen', 'carpet', 'toilet'].some((n) => name.toLowerCase().includes(n));

const money = (n: number) => `£${(Number(n) || 0).toFixed(2)}`;

/** What a customer sees on the booking form for this service. */
function customerPriceLabel(s: ServiceConfig): string {
  const t = getServiceTrigger(s);
  if (t === 'commercial' || t === 'jet_washing') return 'Quote based';
  if (t === 'deep' || t === 'end_of_tenancy') return `From £${resolveDeepEotCallOutChargeGbp(s)}`;
  const london = t === 'standard' ? londonRateOf(s) : null;
  return london !== null ? `£${Number(s.baseRate).toFixed(0)}/hr · London £${london.toFixed(0)}/hr` : `£${Number(s.baseRate).toFixed(0)}/hr`;
}

export default function ServicesHub({
  section,
  onSectionChange,
  services,
  extras,
  bookings,
  onCreateService,
  onEditService,
  onToggleService,
  onDeleteService,
  onCreateExtra,
  onEditExtra,
  onDeleteExtra,
}: {
  section: ServicesSectionId;
  onSectionChange: (s: ServicesSectionId) => void;
  services: ServiceConfig[];
  extras: Extra[];
  bookings: Booking[];
  onCreateService: () => void;
  onEditService: (s: ServiceConfig) => void;
  onToggleService: (s: ServiceConfig) => void;
  onDeleteService: (id: string) => void;
  onCreateExtra: () => void;
  onEditExtra: (e: Extra) => void;
  onDeleteExtra: (id: string) => void;
}) {
  const [svcFilter, setSvcFilter] = useState<'all' | 'active' | 'disabled'>('all');
  const [svcQuery, setSvcQuery] = useState('');
  const [extraFilter, setExtraFilter] = useState<'all' | 'rooms' | 'addons'>('all');
  const [extraQuery, setExtraQuery] = useState('');

  /** How often each service and extra is booked (all time and last 30 days), from the bookings already loaded. */
  const usage = useMemo(() => {
    const since = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const svc = new Map<string, { total: number; recent: number; revenue: number }>();
    const ext = new Map<string, number>();
    for (const b of bookings || []) {
      if (String(b.status) === 'Cancelled') continue;
      const key = String(b.serviceType || '').toLowerCase();
      const cur = svc.get(key) || { total: 0, recent: 0, revenue: 0 };
      cur.total += 1;
      if (String(b.date || '') >= since) cur.recent += 1;
      cur.revenue += Number(b.totalPrice) || 0;
      svc.set(key, cur);
      for (const it of b.extras || []) ext.set(String(it.id), (ext.get(String(it.id)) || 0) + (Number(it.quantity) || 0));
    }
    return { svc, ext };
  }, [bookings]);
  const usageFor = (s: ServiceConfig) => usage.svc.get(String(s.name).toLowerCase()) || usage.svc.get(String(s.id).toLowerCase()) || { total: 0, recent: 0, revenue: 0 };

  const activeCount = services.filter((s) => s.active).length;
  const mostBooked = [...services].sort((a, b) => usageFor(b).total - usageFor(a).total)[0];
  const roomExtras = extras.filter((e) => isRoomExtra(e.name));
  const addOnExtras = extras.filter((e) => !isRoomExtra(e.name));

  const shownServices = services
    .filter((s) => (svcFilter === 'all' ? true : svcFilter === 'active' ? s.active : !s.active))
    .filter((s) => !svcQuery.trim() || `${s.name} ${s.description}`.toLowerCase().includes(svcQuery.trim().toLowerCase()));
  const shownExtras = (extraFilter === 'rooms' ? roomExtras : extraFilter === 'addons' ? addOnExtras : extras).filter(
    (e) => !extraQuery.trim() || e.name.toLowerCase().includes(extraQuery.trim().toLowerCase()),
  );

  return (
    <HubLayout
      title="Services"
      subtitle="What customers can book, how each one is priced, and the extras they can add."
      navLabel="Service sections"
      active={section}
      onChange={onSectionChange}
      groups={[
        {
          group: 'Catalogue',
          items: [
            { id: 'catalog', label: 'Main services', hint: 'Prices and booking flow', icon: <Briefcase className="h-4 w-4" />, badge: services.length || undefined },
            { id: 'addons', label: 'Rooms and extras', hint: 'Per-room prices and add-ons', icon: <Package className="h-4 w-4" />, badge: extras.length || undefined },
          ],
        },
      ]}
    >
      {section === 'catalog' && (
        <>
          <SectionHeader
            title="Main services"
            description="Turn a service off to hide it from the booking form. Customers see the price shown on each card."
            actions={
              <button type="button" className={BTN_PRIMARY} onClick={onCreateService}>
                <Plus className="h-4 w-4" /> Add service
              </button>
            }
          />

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={<Briefcase className="h-4 w-4" />} label="Services" value={services.length} sub={`${activeCount} live on the website`} tone="bg-blue-50 text-blue-600" />
            <StatCard icon={<Eye className="h-4 w-4" />} label="Hidden" value={services.length - activeCount} sub="Not bookable right now" tone="bg-slate-100 text-slate-600" onClick={() => setSvcFilter('disabled')} />
            <StatCard
              icon={<TrendingUp className="h-4 w-4" />}
              label="Most booked"
              value={<span className="block truncate text-lg sm:text-xl">{mostBooked && usageFor(mostBooked).total ? mostBooked.name : '—'}</span>}
              sub={mostBooked && usageFor(mostBooked).total ? `${usageFor(mostBooked).total} bookings` : 'No bookings yet'}
              tone="bg-emerald-50 text-emerald-600"
            />
            <StatCard icon={<Package className="h-4 w-4" />} label="Extras" value={extras.length} sub={`${roomExtras.length} rooms · ${addOnExtras.length} add-ons`} tone="bg-amber-50 text-amber-600" onClick={() => onSectionChange('addons')} />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Segmented<'all' | 'active' | 'disabled'>
              ariaLabel="Filter services"
              value={svcFilter}
              onChange={setSvcFilter}
              items={[
                { id: 'all', label: 'All', count: services.length },
                { id: 'active', label: 'Live', count: activeCount },
                { id: 'disabled', label: 'Hidden', count: services.length - activeCount },
              ]}
            />
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={svcQuery}
                onChange={(e) => setSvcQuery(e.target.value)}
                placeholder="Search services…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {services.length === 0 ? (
            <EmptyState
              icon={<Layers className="h-6 w-6" />}
              title="No services yet"
              text="Add your first service. You can change its price and turn it on or off any time."
              action={
                <button type="button" className={BTN_PRIMARY} onClick={onCreateService}>
                  <Plus className="h-4 w-4" /> Add service
                </button>
              }
            />
          ) : shownServices.length === 0 ? (
            <EmptyState icon={<Search className="h-6 w-6" />} title="No services match" text="Try another filter or search." />
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {shownServices.map((s) => {
                const trig = getServiceTrigger(s);
                const meta = TRIGGER_META[trig] || TRIGGER_META.standard;
                const u = usageFor(s);
                const steps = s.bookingFlow?.steps?.length ? s.bookingFlow.steps : null;
                const london = trig === 'standard' ? londonRateOf(s) : null;
                return (
                  <Card key={s.id} className={`flex flex-col p-5 transition ${s.active ? 'hover:border-slate-300 hover:shadow-md' : 'bg-slate-50/60'}`}>
                    <div className="flex items-start gap-3">
                      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${s.active ? meta.tone : 'bg-slate-100 text-slate-400'}`}>{meta.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className={`text-base font-black ${s.active ? 'text-slate-900' : 'text-slate-500'}`}>{s.name}</p>
                          {s.active ? <Pill tone={PILL.green}>Live</Pill> : <Pill tone={PILL.slate}>Hidden</Pill>}
                        </div>
                        <p className="mt-0.5 text-xs font-medium text-slate-500">{meta.label}</p>
                      </div>
                      <Switch checked={s.active} onChange={() => onToggleService(s)} label={s.active ? `Hide ${s.name}` : `Show ${s.name}`} />
                    </div>

                    {s.description ? <p className="mt-3 line-clamp-2 text-sm text-slate-600">{s.description}</p> : null}

                    <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                      <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                        <p className="text-[11px] font-bold text-slate-500">{trig === 'deep' || trig === 'end_of_tenancy' ? 'Call-out' : 'Rate'}</p>
                        <p className="text-sm font-black tabular-nums text-slate-900">
                          {trig === 'commercial' || trig === 'jet_washing'
                            ? 'Quote'
                            : trig === 'deep' || trig === 'end_of_tenancy'
                              ? money(resolveDeepEotCallOutChargeGbp(s))
                              : `${money(Number(s.baseRate))}/hr`}
                        </p>
                      </div>
                      {london !== null ? (
                        <div className="rounded-xl bg-blue-50 px-3 py-2.5">
                          <p className="text-[11px] font-bold text-blue-700">London</p>
                          <p className="text-sm font-black tabular-nums text-blue-900">{money(london)}/hr</p>
                        </div>
                      ) : (
                        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                          <p className="text-[11px] font-bold text-slate-500">Min length</p>
                          <p className="text-sm font-black text-slate-900">{Number(s.minDuration) > 0 ? formatHoursMinutes(Number(s.minDuration)) : '—'}</p>
                        </div>
                      )}
                      <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2.5 sm:col-span-1">
                        <p className="text-[11px] font-bold text-slate-500">Booked</p>
                        <p className="text-sm font-black text-slate-900">{u.total} total</p>
                        <p className="text-[11px] font-medium text-slate-500">{u.recent} in the last 30 days</p>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="font-bold text-slate-500">Booking form:</span>
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">Service</span>
                      {(steps || ['details', 'extras', 'schedule', 'location', 'requirements', 'invoice']).map((st) => (
                        <span key={st} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">
                          {STEP_LABEL[st] || st}
                        </span>
                      ))}
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-bold text-slate-600">Review</span>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      <p className="min-w-0 text-xs leading-relaxed text-slate-500">
                        Customers see <span className="font-bold text-slate-800">{customerPriceLabel(s)}</span>
                        {Number(s.minNotice) > 0 ? ` · ${s.minNotice}h notice` : ''}
                      </p>
                      <div className="flex shrink-0 gap-1.5">
                        <button type="button" className={`${BTN_SECONDARY} px-3 py-2`} onClick={() => onEditService(s)}>
                          <Pencil className="h-4 w-4" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteService(s.id)}
                          className="rounded-xl p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                          aria-label={`Delete ${s.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {section === 'addons' && (
        <>
          <SectionHeader
            title="Rooms and extras"
            description="Room prices are used for Deep and End of Tenancy cleans. Extras can be added to any booking."
            actions={
              <button type="button" className={BTN_PRIMARY} onClick={onCreateExtra}>
                <Plus className="h-4 w-4" /> New extra
              </button>
            }
          />

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Segmented<'all' | 'rooms' | 'addons'>
              ariaLabel="Filter extras"
              value={extraFilter}
              onChange={setExtraFilter}
              items={[
                { id: 'all', label: 'All', count: extras.length },
                { id: 'rooms', label: 'Rooms', count: roomExtras.length },
                { id: 'addons', label: 'Add-ons', count: addOnExtras.length },
              ]}
            />
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={extraQuery}
                onChange={(e) => setExtraQuery(e.target.value)}
                placeholder="Search extras…"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>

          {extras.length === 0 ? (
            <EmptyState
              icon={<Package className="h-6 w-6" />}
              title="No extras yet"
              text="Create rooms and add-ons customers can choose when booking."
              action={
                <button type="button" className={BTN_PRIMARY} onClick={onCreateExtra}>
                  <Plus className="h-4 w-4" /> New extra
                </button>
              }
            />
          ) : shownExtras.length === 0 ? (
            <EmptyState icon={<Search className="h-6 w-6" />} title="No extras match" text="Try another filter or search." />
          ) : (
            <Card className="overflow-hidden">
              <div className="hidden grid-cols-[minmax(0,1fr)_110px_110px_110px_96px] gap-3 border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-500 md:grid">
                <span>Name</span>
                <span className="text-right">Price</span>
                <span className="text-right">Time</span>
                <span className="text-right">Times added</span>
                <span />
              </div>
              <ul className="divide-y divide-slate-100">
                {shownExtras.map((ex) => {
                  const room = isRoomExtra(ex.name);
                  const added = usage.ext.get(String(ex.id)) || 0;
                  return (
                    <li key={ex.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50/70 md:grid-cols-[minmax(0,1fr)_110px_110px_110px_96px]">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${room ? 'bg-violet-50 text-violet-600' : 'bg-amber-50 text-amber-600'}`}>
                          {room ? <Layers className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{ex.name}</p>
                          <p className="text-xs text-slate-500">
                            {room ? 'Room' : 'Add-on'} · {ex.type === 'hourly' ? 'Hourly' : 'Fixed price'}
                            <span className="md:hidden">
                              {' '}
                              · {money(Number(ex.price))}
                              {ex.duration != null ? ` · ${formatHoursMinutes(Number(ex.duration) / 60)}` : ''}
                            </span>
                          </p>
                        </div>
                      </div>
                      <p className="hidden text-right text-sm font-black tabular-nums text-slate-900 md:block">{money(Number(ex.price))}</p>
                      <p className="hidden items-center justify-end gap-1 text-right text-sm text-slate-600 md:flex">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {ex.duration != null ? formatHoursMinutes(Number(ex.duration) / 60) : '—'}
                      </p>
                      <p className="hidden text-right text-sm tabular-nums text-slate-600 md:block">{added}</p>
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => onEditExtra(ex)} className="rounded-lg p-2 text-slate-500 transition hover:bg-blue-50 hover:text-blue-600" aria-label={`Edit ${ex.name}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => onDeleteExtra(ex.id)} className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${ex.name}`}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          <p className="text-xs text-slate-500">
            Tip: names decide where an item appears. Anything with bedroom, reception, bathroom, utility, cloakroom, kitchen or carpet in the name is treated as a room on Deep and End of Tenancy cleans.
          </p>
        </>
      )}
    </HubLayout>
  );
}
