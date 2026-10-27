import React, { useEffect, useMemo, useRef, useState } from 'react';
import { formatHoursMinutes } from '../../src/utils/bookingHelpers';
import { createPortal } from 'react-dom';
import { X, Plus, Minus, Trash2, Send, Save, Printer, Eye, PencilLine, StickyNote, User, ListChecks, Home, Sparkles, MapPin } from 'lucide-react';
import type { Extra, QuoteDetails, QuoteLead, QuoteOffer, QuoteOfferInput, QuoteOfferItem, ServiceConfig } from '../../types';
import { apiAdmin } from '../../services/api';
import { hourlyRateFor, londonRateOf, lookupPricingRegion, MATERIALS_PENCE, type PricingRegion } from '../../src/utils/pricing';
import { getExtraDisplayLabel, getServiceTrigger, isDeepOrEOTService, resolveDeepEotCallOutChargeGbp } from '../../src/utils/bookingHelpers';

interface Props {
  /** The request this quote answers; null when the office starts a quote from scratch. */
  lead: QuoteLead | null;
  /** Existing quote to edit; omit to create a new one. */
  quote?: QuoteOffer | null;
  companyName: string;
  /** Services and add-ons from the database (same lists the booking form and invoices use). */
  services: ServiceConfig[];
  extras: Extra[];
  onClose: () => void;
  /** Called after a save or send so the parent can refresh. */
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

type Materials = 'none' | 'hoover_only' | 'hoover_and_materials';
type PropertyKey = 'bedrooms' | 'bathrooms' | 'toilets' | 'livingRooms' | 'kitchens' | 'receptionRooms' | 'utilityRooms';

const money = (n: number) => `£${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const FREQUENCIES = ['One-time', 'Weekly', 'Fortnightly', 'Monthly'];
const PROPERTY_TYPES = ['Flat', 'House', 'Studio', 'Maisonette', 'Bungalow', 'Office', 'Shop', 'Other'];
const ROOM_FIELDS: [PropertyKey, string][] = [
  ['bedrooms', 'Bedrooms'],
  ['bathrooms', 'Bathrooms'],
  ['toilets', 'Cloakroom toilets'],
  ['livingRooms', 'Living rooms'],
  ['kitchens', 'Kitchens'],
  ['receptionRooms', 'Reception rooms'],
  ['utilityRooms', 'Utility rooms'],
];
const MATERIAL_OPTIONS: { id: Materials; label: string }[] = [
  { id: 'none', label: 'Client provides' },
  { id: 'hoover_only', label: `Hoover (+${money(MATERIALS_PENCE.hoover_only / 100)})` },
  { id: 'hoover_and_materials', label: `Hoover + products (+${money(MATERIALS_PENCE.hoover_and_materials / 100)})` },
];

function inDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Ready-made lines admins add most often under the prices. */
const NOTE_SNIPPETS = [
  'We bring all cleaning products and equipment.',
  'Please make sure we can get in (keys, codes or someone at home).',
  'A deposit secures your date; the balance is due on completion.',
  'Parking or congestion charges, if any, are added at cost.',
  'Prices assume normal condition; heavy soiling may need extra time.',
];

const toInt = (v: unknown) => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** The service on the request, matched by name against the database list. */
function matchService(services: ServiceConfig[], name: string | null | undefined): ServiceConfig | null {
  const n = String(name || '').trim().toLowerCase();
  if (!n || n === 'pending') return null;
  return (
    services.find((s) => s.name.toLowerCase() === n) ||
    services.find((s) => getServiceTrigger(s) === getServiceTrigger(null, n) && getServiceTrigger(null, n) !== 'standard') ||
    services.find((s) => s.name.toLowerCase().includes(n) || n.includes(s.name.toLowerCase())) ||
    null
  );
}

function pricingModelOf(service: ServiceConfig | null): 'hourly' | 'itemized' | 'custom' {
  if (!service) return 'custom';
  if (service.pricingModel === 'quote' || getServiceTrigger(service) === 'commercial') return 'custom';
  if (isDeepOrEOTService(service)) return 'itemized';
  return 'hourly';
}

const field = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';
const label = 'mb-1 block text-xs font-bold text-slate-500';

function Stepper({ value, onChange, min = 0, step = 1, suffix }: { value: number; onChange: (v: number) => void; min?: number; step?: number; suffix?: string }) {
  return (
    <div className="inline-flex shrink-0 items-center rounded-xl border border-slate-200 bg-white">
      <button type="button" onClick={() => onChange(Math.max(min, round2(value - step)))} className="p-2 text-slate-500 hover:text-slate-900" aria-label="Decrease">
        <Minus className="h-4 w-4" />
      </button>
      <span className="min-w-[2.5rem] text-center text-sm font-black tabular-nums text-slate-900">
        {value}
        {suffix ? <span className="ml-0.5 text-xs font-bold text-slate-400">{suffix}</span> : null}
      </span>
      <button type="button" onClick={() => onChange(round2(value + step))} className="p-2 text-slate-500 hover:text-slate-900" aria-label="Increase">
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

/** Stand-in for a brand new client (quote started from the page header). */
const BLANK_LEAD: QuoteLead = {
  id: 0,
  firstName: '',
  email: '',
  phone: null,
  postcode: null,
  serviceType: 'Pending',
  bedrooms: null,
  bathrooms: null,
  priceEstimate: null,
  status: 'new',
  brevoSynced: false,
  adminNotes: null,
  statusUpdatedAt: null,
  createdAt: null,
  matchedBooking: null,
  bookingsAfterQuote: 0,
  bookingsBeforeQuote: 0,
};

const QuoteBuilder: React.FC<Props> = ({ lead: leadProp, quote, companyName, services, extras, onClose, onSaved, onError }) => {
  const lead = leadProp ?? BLANK_LEAD;
  const activeServices = useMemo(() => services.filter((s) => s.active !== false), [services]);
  const saved: QuoteDetails | null = quote?.details ?? null;
  const leadService = useMemo(() => matchService(activeServices, quote?.serviceType || lead.serviceType), [activeServices, quote, lead.serviceType]);

  /* ── Customer ── */
  const [customer, setCustomer] = useState(() => ({
    clientName: quote?.clientName ?? (lead.firstName || '').trim(),
    clientEmail: quote?.clientEmail ?? lead.email,
    clientPhone: quote?.clientPhone ?? lead.phone ?? '',
    clientAddress: quote?.clientAddress ?? '',
    postcode: quote?.postcode ?? lead.postcode ?? '',
  }));
  const setC = (k: keyof typeof customer, v: string) => setCustomer((p) => ({ ...p, [k]: v }));

  /* ── Job (service, frequency, property) ── */
  const [serviceId, setServiceId] = useState<string>(() => String(saved?.serviceId ?? leadService?.id ?? ''));
  const [customServiceName, setCustomServiceName] = useState(() => (saved ? (quote?.serviceType ?? '') : leadService ? '' : lead.serviceType !== 'Pending' ? lead.serviceType : ''));
  const [frequency, setFrequency] = useState(() => saved?.frequency || 'One-time');
  const [propertyType, setPropertyType] = useState(() => String(saved?.property?.propertyType ?? ''));
  const [size, setSize] = useState(() => String(saved?.property?.size ?? ''));
  const [rooms, setRooms] = useState<Record<PropertyKey, number>>(() => {
    const p = saved?.property ?? {};
    return {
      bedrooms: toInt(p.bedrooms ?? lead.bedrooms),
      bathrooms: toInt(p.bathrooms ?? lead.bathrooms),
      toilets: toInt(p.toilets),
      livingRooms: toInt(p.livingRooms ?? (saved ? 0 : 1)),
      kitchens: toInt(p.kitchens ?? (saved ? 0 : 1)),
      receptionRooms: toInt(p.receptionRooms),
      utilityRooms: toInt(p.utilityRooms),
    };
  });

  const service = useMemo(() => activeServices.find((s) => String(s.id) === serviceId) ?? null, [activeServices, serviceId]);
  const model = pricingModelOf(service);
  const trigger = service ? getServiceTrigger(service) : null;

  /* ── Pricing ── */
  const [region, setRegion] = useState<PricingRegion | null>(() => saved?.region ?? null);
  const [regionLoading, setRegionLoading] = useState(false);
  const [hours, setHours] = useState<number>(() => {
    if (saved?.hours) return saved.hours;
    const svc = leadService;
    const min = Math.max(1, Number(svc?.minDuration) || 2);
    if (svc && getServiceTrigger(svc) === 'airbnb' && toInt(lead.bedrooms)) return toInt(lead.bedrooms) + 1;
    const est = Number(lead.priceEstimate);
    const rate = svc ? hourlyRateFor(svc, null) : 0;
    if (est > 0 && rate > 0) return Math.max(min, Math.round((est / rate) * 2) / 2);
    return min;
  });
  /** null = use the service's rate for the region. */
  const [rateOverride, setRateOverride] = useState<number | null>(() => {
    if (saved?.pricingModel !== 'hourly' || saved.hourlyRate == null) return null;
    // A saved rate that matches the service's own rate is not a custom rate.
    const svc = activeServices.find((s) => String(s.id) === String(saved.serviceId));
    return svc && hourlyRateFor(svc, saved.region ?? null) === saved.hourlyRate ? null : saved.hourlyRate;
  });
  const [materials, setMaterials] = useState<Materials>(() => (saved?.cleaningMaterials as Materials) || 'none');
  const [callOutOverride, setCallOutOverride] = useState<number | null>(() => (saved?.callOutCharge != null ? saved.callOutCharge : null));
  const [extraQty, setExtraQty] = useState<Record<string, number>>(() => Object.fromEntries((saved?.extras ?? []).map((e) => [String(e.id), e.quantity])));
  /** Lines typed by hand (built lines always carry a detail, custom ones do not). */
  const [customLines, setCustomLines] = useState<QuoteOfferItem[]>(() => {
    if (quote) {
      const own = (saved ? quote.items.filter((i) => !i.detail) : quote.items).map((i) => ({ description: i.description, quantity: i.quantity, unitPrice: i.unitPrice }));
      return own;
    }
    // A request for a service we don't list gets one line to price; a new client starts empty.
    if (leadService || !leadProp || lead.serviceType === 'Pending') return [];
    return [{ description: lead.serviceType, quantity: 1, unitPrice: Number(lead.priceEstimate) > 0 ? Number(lead.priceEstimate) : 0 }];
  });

  const [extrasInput, setExtrasInput] = useState(() => ({
    discount: Number(quote?.discount) || 0,
    vatRate: Number(quote?.vatRate) || 20,
    validUntil: quote?.validUntil || inDays(14),
    message: quote?.message ?? `Thank you for getting in touch with ${companyName}. Based on what you told us, here is our price. Any questions at all, just reply to this email.`,
    notes: quote?.notes ?? '',
  }));
  const [addVat, setAddVat] = useState(() => (quote ? Number(quote.vatRate) > 0 : false));

  const [busy, setBusy] = useState<'save' | 'send' | null>(null);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'edit' | 'preview'>('edit');
  const timer = useRef<number | null>(null);

  // London or standard rate from the postcode (same lookup as the booking form).
  useEffect(() => {
    const pc = customer.postcode.trim();
    if (!pc) {
      setRegion(null);
      return;
    }
    let alive = true;
    setRegionLoading(true);
    const t = window.setTimeout(async () => {
      const r = await lookupPricingRegion(pc).catch(() => null);
      if (alive) {
        setRegion(r?.region ?? null);
        setRegionLoading(false);
      }
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [customer.postcode]);

  // Picking a service resets the per-service defaults.
  const chooseService = (id: string) => {
    setServiceId(id);
    setRateOverride(null);
    setCallOutOverride(null);
    const svc = activeServices.find((s) => String(s.id) === id);
    if (svc) {
      const min = Math.max(1, Number(svc.minDuration) || 2);
      if (getServiceTrigger(svc) === 'airbnb' && rooms.bedrooms) setHours(rooms.bedrooms + 1);
      else setHours((h) => Math.max(min, h));
    }
  };

  const autoRate = service ? hourlyRateFor(service, region) : 0;
  const rate = rateOverride ?? autoRate;
  const hasLondonRate = service ? londonRateOf(service) !== null : false;
  const callOut = model === 'itemized' ? callOutOverride ?? resolveDeepEotCallOutChargeGbp(service) : 0;

  /** Lines built from the job details, exactly like the invoice. */
  const builtLines: QuoteOfferItem[] = useMemo(() => {
    const lines: QuoteOfferItem[] = [];
    if (service && model === 'hourly') {
      lines.push({
        description: service.name,
        detail: `${formatHoursMinutes(hours)} x ${money(rate)} per hour${region === 'london' && hasLondonRate && rateOverride === null ? ' (London rate)' : ''}`,
        quantity: hours,
        unitPrice: rate,
      });
    }
    if (service && model === 'itemized' && callOut > 0) {
      lines.push({ description: 'Call-out charge', detail: 'Fixed fee per booking', quantity: 1, unitPrice: callOut });
    }
    for (const ex of extras) {
      const q = extraQty[String(ex.id)] || 0;
      if (!q) continue;
      lines.push({
        description: getExtraDisplayLabel(ex.name),
        detail: q > 1 ? `${q} x ${money(Number(ex.price))} each` : 'Add-on',
        quantity: q,
        unitPrice: Number(ex.price) || 0,
      });
    }
    if (materials !== 'none') {
      lines.push({
        description: materials === 'hoover_and_materials' ? 'Hoover and cleaning products' : 'Hoover',
        detail: 'Cleaning equipment add-on',
        quantity: 1,
        unitPrice: (MATERIALS_PENCE[materials] || 0) / 100,
      });
    }
    return lines;
  }, [service, model, hours, rate, region, hasLondonRate, rateOverride, callOut, extras, extraQty, materials]);

  const items = useMemo(
    // Lines still at £0 are unfinished and stay off the quote.
    () => [...builtLines, ...customLines.filter((l) => l.description.trim() && Number(l.quantity) > 0 && Number(l.unitPrice) > 0)],
    [builtLines, customLines],
  );

  const totals = useMemo(() => {
    const subtotal = round2(items.reduce((a, i) => a + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0));
    const discount = Math.min(subtotal, Math.max(0, Number(extrasInput.discount) || 0));
    const vatRate = addVat ? Number(extrasInput.vatRate) || 20 : 0;
    const vat = round2(((subtotal - discount) * vatRate) / 100);
    return { subtotal, discount, vatRate, vat, total: round2(subtotal - discount + vat) };
  }, [items, extrasInput.discount, extrasInput.vatRate, addVat]);

  const serviceName = service?.name || customServiceName.trim();
  const propertySummary = [propertyType, rooms.bedrooms && `${rooms.bedrooms} bed`, rooms.bathrooms && `${rooms.bathrooms} bath`].filter(Boolean).join(', ');

  const details: QuoteDetails = {
    serviceId: service ? String(service.id) : null,
    pricingModel: model,
    region,
    hourlyRate: model === 'hourly' ? rate : null,
    hours: model === 'hourly' ? hours : null,
    frequency,
    cleaningMaterials: materials,
    callOutCharge: model === 'itemized' ? callOut : null,
    property: { propertyType: propertyType || null, size: size || null, ...rooms },
    extras: extras
      .filter((e) => extraQty[String(e.id)])
      .map((e) => ({ id: String(e.id), name: getExtraDisplayLabel(e.name), price: Number(e.price) || 0, quantity: extraQty[String(e.id)] })),
  };

  const payload = (): QuoteOfferInput => ({
    ...customer,
    propertySummary,
    serviceType: serviceName,
    items,
    details,
    discount: totals.discount,
    vatRate: totals.vatRate,
    validUntil: extrasInput.validUntil,
    message: extrasInput.message,
    notes: extrasInput.notes,
  });

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.clientEmail.trim())) list.push('Add a valid client email.');
    if (!items.length) list.push('Choose a service or add a price line.');
    if (model === 'hourly' && rate <= 0) list.push('Set an hourly rate for this service.');
    if (totals.total <= 0) list.push('The total must be more than £0.');
    return list;
  }, [customer.clientEmail, items.length, model, rate, totals.total]);

  // Live preview of the branded email (debounced so typing stays smooth).
  const previewKey = JSON.stringify(payload());
  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (problems.length) {
      setPreviewError(problems[0]);
      return;
    }
    timer.current = window.setTimeout(async () => {
      try {
        setPreview(await apiAdmin.previewQuote({ ...payload(), quoteNumber: quote?.quoteNumber || 'Draft' }));
        setPreviewError(null);
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : 'Preview unavailable');
      }
    }, 450);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey, problems.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const save = async (send: boolean) => {
    if (problems.length) {
      onError(problems[0]);
      return;
    }
    const email = customer.clientEmail.trim();
    if (send && !window.confirm(`Email this quote (${money(totals.total)}) to ${email}?`)) return;
    setBusy(send ? 'send' : 'save');
    try {
      if (quote) {
        await apiAdmin.updateQuote(quote.id, payload());
        if (send) await apiAdmin.sendQuote(quote.id);
        onSaved(send ? `Quote ${quote.quoteNumber} emailed to ${email}.` : `Quote ${quote.quoteNumber} saved.`);
      } else {
        const res = leadProp
          ? await apiAdmin.createLeadQuote(leadProp.id, { ...payload(), send })
          : await apiAdmin.createStandaloneQuote({ ...payload(), send });
        onSaved(send ? `Quote ${res.quote.quoteNumber} emailed to ${email}.` : `Quote ${res.quote.quoteNumber} saved as a draft.`);
      }
      onClose();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not save the quote.');
    } finally {
      setBusy(null);
    }
  };

  /** Opens the branded quote in a new window for printing or saving as PDF. */
  const printQuote = () => {
    if (!preview) return;
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) {
      onError('Allow pop-ups to print the quote.');
      return;
    }
    w.document.open();
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${preview.subject.replace(/</g, '&lt;')}</title><style>@media print{@page{margin:12mm}}</style></head><body>${preview.html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const setNote = (k: keyof typeof extrasInput, v: string | number) => setExtrasInput((p) => ({ ...p, [k]: v }));
  const addSnippet = (s: string) => setNote('notes', extrasInput.notes.trim() ? `${extrasInput.notes.trim()}\n${s}` : s);
  const setLine = (i: number, patch: Partial<QuoteOfferItem>) => setCustomLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  return createPortal(
    <div className="fixed inset-0 z-[400] flex flex-col bg-slate-100" role="dialog" aria-modal="true" aria-label="Quote builder">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-widest text-blue-600">{quote ? `Edit quote ${quote.quoteNumber}` : 'New quote'}</p>
          <h2 className="truncate text-lg font-black text-slate-900">
            For {customer.clientName || customer.clientEmail || 'a new client'} · <span className="tabular-nums">{money(totals.total)}</span>
          </h2>
        </div>
        <button type="button" onClick={onClose} disabled={!!busy} className="rounded-xl p-2 hover:bg-slate-100" aria-label="Close quote builder">
          <X className="h-5 w-5 text-slate-500" />
        </button>
      </div>

      {/* Phone: switch between editing and preview */}
      <div className="flex gap-1 border-b border-slate-200 bg-white p-2 lg:hidden">
        {(['edit', 'preview'] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setMobileView(v)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold ${mobileView === v ? 'bg-slate-900 text-white' : 'text-slate-500'}`}
          >
            {v === 'edit' ? <PencilLine className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {v === 'edit' ? 'Edit' : 'Preview'}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Form */}
        <div className={`min-h-0 overflow-y-auto p-4 sm:p-6 ${mobileView === 'edit' ? 'block' : 'hidden'} lg:block`}>
          <div className="mx-auto max-w-2xl space-y-5">
            {/* Customer */}
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><User className="h-4 w-4 text-blue-600" /> Customer details</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><label className={label}>Name</label><input className={field} value={customer.clientName} onChange={(e) => setC('clientName', e.target.value)} /></div>
                <div><label className={label}>Email (quote is sent here)</label><input type="email" className={field} value={customer.clientEmail} onChange={(e) => setC('clientEmail', e.target.value)} /></div>
                <div><label className={label}>Phone</label><input className={field} value={customer.clientPhone} onChange={(e) => setC('clientPhone', e.target.value)} /></div>
                <div>
                  <label className={label}>Postcode</label>
                  <input className={field} value={customer.postcode} onChange={(e) => setC('postcode', e.target.value.toUpperCase())} />
                </div>
                <div className="sm:col-span-2"><label className={label}>Address</label><input className={field} value={customer.clientAddress} placeholder="House number and street, town" onChange={(e) => setC('clientAddress', e.target.value)} /></div>
              </div>
            </section>

            {/* Job + property */}
            <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><Home className="h-4 w-4 text-blue-600" /> Job and property</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Service</label>
                  <select className={field} value={serviceId} onChange={(e) => chooseService(e.target.value)}>
                    <option value="">Other (price it by hand)</option>
                    {activeServices.map((s) => (
                      <option key={s.id} value={String(s.id)}>{s.name}</option>
                    ))}
                  </select>
                </div>
                {!service ? (
                  <div><label className={label}>Service name on the quote</label><input className={field} value={customServiceName} placeholder="e.g. After-builders clean" onChange={(e) => setCustomServiceName(e.target.value)} /></div>
                ) : (
                  <div>
                    <label className={label}>Frequency</label>
                    <select className={field} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                      {FREQUENCIES.map((f) => <option key={f}>{f}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <label className={label}>Property type</label>
                  <select className={field} value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
                    <option value="">Not specified</option>
                    {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
                  </select>
                </div>
                <div><label className={label}>Size (optional)</label><input className={field} value={size} placeholder="e.g. 900 sq ft" onChange={(e) => setSize(e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
                {ROOM_FIELDS.map(([key, text]) => (
                  <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                    <span className="text-sm font-bold text-slate-700">{text}</span>
                    <Stepper
                      value={rooms[key]}
                      onChange={(v) => {
                        setRooms((p) => ({ ...p, [key]: v }));
                        if (key === 'bedrooms' && trigger === 'airbnb' && v > 0) setHours(v + 1);
                      }}
                    />
                  </div>
                ))}
              </div>
            </section>

            {/* Pricing from the service */}
            {service ? (
              <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><Sparkles className="h-4 w-4 text-blue-600" /> {service.name} pricing</h3>
                  <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-600">
                    <MapPin className="h-3 w-3" />
                    {regionLoading ? 'Checking postcode…' : region === 'london' ? 'Greater London' : region === 'standard' ? 'Outside London' : 'Add a postcode'}
                  </span>
                </div>

                {model === 'hourly' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={label}>Hours{service.minDuration ? ` (minimum ${service.minDuration})` : ''}</label>
                      <Stepper value={hours} onChange={setHours} min={0.5} step={0.5} suffix="h" />
                      {trigger === 'airbnb' ? <p className="mt-1 text-[11px] text-slate-500">Airbnb: bedrooms + 1 hour.</p> : null}
                    </div>
                    <div>
                      <label className={label}>Hourly rate</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">£</span>
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          className={`${field} pl-7`}
                          value={rate}
                          onChange={(e) => setRateOverride(Number(e.target.value))}
                        />
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {rateOverride === null
                          ? `From ${service.name}: ${money(Number(service.baseRate))}/hr${hasLondonRate ? `, London ${money(londonRateOf(service) || 0)}/hr` : ''}.`
                          : 'Custom rate. '}
                        {rateOverride !== null ? (
                          <button type="button" className="font-bold text-blue-600" onClick={() => setRateOverride(null)}>Use the service rate</button>
                        ) : null}
                      </p>
                    </div>
                  </div>
                ) : model === 'itemized' ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={label}>Call-out charge</label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">£</span>
                        <input type="number" min={0} step="1" className={`${field} pl-7`} value={callOut} onChange={(e) => setCallOutOverride(Number(e.target.value))} />
                      </div>
                    </div>
                    <p className="self-end text-xs text-slate-500">Deep and end-of-tenancy cleans are priced by call-out plus each room or add-on below, like the invoice.</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-500">This service is quote based. Add your prices under Other lines.</p>
                )}

                <div>
                  <label className={label}>Cleaning materials</label>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {MATERIAL_OPTIONS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setMaterials(m.id)}
                        className={`rounded-xl border px-3 py-2 text-xs font-bold ${materials === m.id ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            ) : null}

            {/* Add-ons from the database */}
            {extras.length ? (
              <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><Plus className="h-4 w-4 text-blue-600" /> Add-ons and rooms</h3>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
                  {extras.map((ex) => {
                    const q = extraQty[String(ex.id)] || 0;
                    return (
                      <div key={ex.id} className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${q ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200'}`}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-slate-800">{getExtraDisplayLabel(ex.name)}</p>
                          <p className="text-[11px] font-medium text-slate-500">{money(Number(ex.price))} each</p>
                        </div>
                        <Stepper value={q} onChange={(v) => setExtraQty((p) => ({ ...p, [String(ex.id)]: Math.max(0, Math.floor(v)) }))} />
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* Custom lines + totals */}
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <h3 className="flex items-center gap-2 text-sm font-black text-slate-900"><ListChecks className="h-4 w-4 text-blue-600" /> Other lines</h3>
              {customLines.length === 0 ? <p className="text-xs text-slate-500">Anything else, e.g. carpet cleaning or a one-off charge.</p> : null}
              <div className="space-y-2">
                {customLines.map((it, i) => (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-xl bg-slate-50 p-2.5">
                    <input className={field} value={it.description} placeholder="Description" onChange={(e) => setLine(i, { description: e.target.value })} aria-label={`Line ${i + 1} description`} />
                    <button type="button" onClick={() => setCustomLines((p) => p.filter((_, idx) => idx !== i))} className="justify-self-end rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove line ${i + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <div className="col-span-2 grid grid-cols-[80px_minmax(0,1fr)_auto] items-center gap-2">
                      <input type="number" min={0} step="0.5" className={field} value={it.quantity} onChange={(e) => setLine(i, { quantity: Number(e.target.value) })} aria-label="Quantity" />
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">£</span>
                        <input type="number" min={0} step="0.01" className={`${field} pl-7`} value={it.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} aria-label="Price each" />
                      </div>
                      <div className="min-w-[80px] text-right text-sm font-black tabular-nums text-slate-900">{money((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setCustomLines((p) => [...p, { description: '', quantity: 1, unitPrice: 0 }])}
                className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-blue-300 px-3 py-2 text-xs font-black text-blue-600 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4" /> Add line
              </button>

              <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
                <div>
                  <label className={label}>Discount (£)</label>
                  <input type="number" min={0} step="0.01" className={field} value={extrasInput.discount} onChange={(e) => setNote('discount', Number(e.target.value))} />
                </div>
                <div>
                  <label className={label}>VAT</label>
                  <div className="flex items-center gap-2">
                    <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                      <input type="checkbox" checked={addVat} onChange={(e) => setAddVat(e.target.checked)} className="h-4 w-4 rounded border-slate-300" /> Add
                    </label>
                    {addVat ? <input type="number" min={0} max={100} className={`${field} w-20`} value={extrasInput.vatRate} onChange={(e) => setNote('vatRate', Number(e.target.value))} aria-label="VAT rate" /> : null}
                    {addVat ? <span className="text-sm text-slate-500">%</span> : null}
                  </div>
                </div>
                <div>
                  <label className={label}>Valid until</label>
                  <input type="date" className={field} value={extrasInput.validUntil} onChange={(e) => setNote('validUntil', e.target.value)} />
                </div>
              </div>

              <div className="rounded-xl bg-slate-900 p-4 text-sm text-white">
                <ul className="space-y-1 border-b border-white/15 pb-2">
                  {items.map((i, idx) => (
                    <li key={idx} className="flex justify-between gap-3 text-white/80">
                      <span className="min-w-0 truncate">{i.description}{i.detail ? <span className="text-white/50"> · {i.detail}</span> : null}</span>
                      <span className="tabular-nums">{money((Number(i.quantity) || 0) * (Number(i.unitPrice) || 0))}</span>
                    </li>
                  ))}
                  {!items.length ? <li className="text-white/60">No lines yet</li> : null}
                </ul>
                <dl className="mt-2 space-y-1">
                  {totals.discount > 0 ? <div className="flex justify-between text-white/70"><dt>Discount</dt><dd className="tabular-nums">-{money(totals.discount)}</dd></div> : null}
                  {totals.vat > 0 ? <div className="flex justify-between text-white/70"><dt>VAT ({totals.vatRate}%)</dt><dd className="tabular-nums">{money(totals.vat)}</dd></div> : null}
                  <div className="flex justify-between text-base font-black"><dt>Total</dt><dd className="tabular-nums">{money(totals.total)}</dd></div>
                </dl>
              </div>
            </section>

            {/* Message + notes */}
            <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
              <div>
                <label className={label}>Message to the client (above the prices)</label>
                <textarea rows={3} maxLength={3000} className={field} value={extrasInput.message} onChange={(e) => setNote('message', e.target.value)} />
              </div>
              <div>
                <label className={`${label} flex items-center gap-1.5`}><StickyNote className="h-3.5 w-3.5" /> Notes and instructions (shown under the prices)</label>
                <textarea rows={4} maxLength={3000} className={field} value={extrasInput.notes} placeholder="What is included, access, materials, payment terms..." onChange={(e) => setNote('notes', e.target.value)} />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {NOTE_SNIPPETS.map((s) => (
                    <button key={s} type="button" onClick={() => addSnippet(s)} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100">
                      + {s.length > 42 ? `${s.slice(0, 40)}…` : s}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Live preview */}
        <div className={`min-h-0 flex-col border-l border-slate-200 bg-slate-200/60 ${mobileView === 'preview' ? 'flex' : 'hidden'} lg:flex`}>
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white/80 px-4 py-2.5">
            <p className="min-w-0 truncate text-xs font-bold text-slate-600"><span className="text-slate-400">Subject:</span> {preview?.subject || '…'}</p>
            <button
              type="button"
              onClick={printQuote}
              disabled={!preview || !!previewError}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <Printer className="h-4 w-4" /> Print / PDF
            </button>
          </div>
          <div className="min-h-0 flex-1 p-3 sm:p-5">
            {previewError ? (
              <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm font-bold text-slate-500">{previewError}</div>
            ) : (
              <iframe title="Quote email preview" srcDoc={preview?.html || ''} className="h-full min-h-[480px] w-full rounded-2xl border border-slate-200 bg-white shadow-sm" sandbox="allow-same-origin" />
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col-reverse gap-2 border-t border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
        <p className="mr-auto hidden text-xs font-medium text-slate-500 sm:block">Rates and add-ons come from your Services settings, like invoices.</p>
        <button
          type="button"
          onClick={() => void save(false)}
          disabled={!!busy}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Save className="h-4 w-4" /> {busy === 'save' ? 'Saving…' : quote ? 'Save changes' : 'Save draft'}
        </button>
        <button
          type="button"
          onClick={() => void save(true)}
          disabled={!!busy || problems.length > 0}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 text-sm font-black text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <Send className="h-4 w-4" /> {busy === 'send' ? 'Sending…' : 'Send to client'}
        </button>
      </div>
    </div>,
    document.body,
  );
};

export default QuoteBuilder;
