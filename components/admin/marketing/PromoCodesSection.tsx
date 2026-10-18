import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarRange,
  Check,
  Copy,
  Megaphone,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Shuffle,
  Ticket,
  Trash2,
} from 'lucide-react';
import { adminAuthHeaders, apiAdmin, apiUrl } from '../../../services/api';
import { useFlyer } from '../../Flyer';
import {
  BTN_GHOST_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  Card,
  EmptyState,
  Field,
  INPUT,
  PILL,
  Pill,
  Segmented,
  SectionHeader,
  SidePanel,
  Switch,
  copyText,
} from './MarketingUi';

/* ----------------------------------------------------------------------------------------------
 * Shared data
 * -------------------------------------------------------------------------------------------- */

export interface DiscountRow {
  id: string | number;
  code: string;
  type: 'fixed' | 'percentage' | string;
  value: number | string;
  usageLimit: number | null;
  usedCount: number | null;
  isActive?: boolean | null;
  expiresAt?: string | null;
}

export interface PromotionRow {
  id: number;
  title: string;
  description: string | null;
  bannerText: string | null;
  discountCode: string | null;
  discountPercent: number | null;
  startDate: string;
  endDate: string;
  active: boolean;
  showOnHomepage: boolean;
  showOnBooking: boolean;
}

export type BannerStatus = 'live' | 'scheduled' | 'ended' | 'paused';

const todayYmd = () => new Date().toISOString().slice(0, 10);

export function bannerStatus(p: PromotionRow, today = todayYmd()): BannerStatus {
  if (!p.active) return 'paused';
  if (p.startDate > today) return 'scheduled';
  if (p.endDate < today) return 'ended';
  return 'live';
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

export function discountLabel(d: Pick<DiscountRow, 'type' | 'value'>): string {
  const v = Number(d.value) || 0;
  return d.type === 'percentage' ? `${v % 1 ? v.toFixed(1) : v}% off` : `£${v % 1 ? v.toFixed(2) : v} off`;
}

export type CodeState = 'active' | 'used_up' | 'inactive' | 'expired';

export function codeState(d: DiscountRow): CodeState {
  if (d.isActive === false) return 'inactive';
  if (d.expiresAt && Date.parse(d.expiresAt) < Date.now()) return 'expired';
  if (d.usageLimit && (d.usedCount || 0) >= d.usageLimit) return 'used_up';
  return 'active';
}

/** Seasonal website banners (loaded once by the hub so Overview can show what is live). */
export function usePromotions() {
  const [list, setList] = useState<PromotionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('/admin/promotions'), { credentials: 'include', headers: adminAuthHeaders() });
      if (res.ok) setList(await res.json());
    } catch {
      /* keep the last list */
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  return { list, loading, refresh };
}

/* ----------------------------------------------------------------------------------------------
 * Promo codes
 * -------------------------------------------------------------------------------------------- */

const CODE_STATE_PILL: Record<CodeState, { label: string; tone: string }> = {
  active: { label: 'Active', tone: PILL.green },
  used_up: { label: 'Limit reached', tone: PILL.amber },
  inactive: { label: 'Inactive', tone: PILL.slate },
  expired: { label: 'Expired', tone: PILL.red },
};

function randomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `CIN${s}`;
}

const EMPTY_CODE = { code: '', type: 'percentage' as 'fixed' | 'percentage', value: '', usageLimit: '' };

const CodeCard: React.FC<{ d: DiscountRow; onDelete: () => void }> = ({ d, onDelete }) => {
  const [copied, setCopied] = useState(false);
  const state = codeState(d);
  const used = Number(d.usedCount) || 0;
  const pct = d.usageLimit ? Math.min(100, Math.round((used / d.usageLimit) * 100)) : 0;
  const pill = CODE_STATE_PILL[state];

  return (
    <div className={`relative overflow-hidden rounded-2xl border bg-white ${state === 'active' ? 'border-slate-200' : 'border-slate-200 opacity-80'}`}>
      {/* Ticket notches */}
      <span className="absolute -left-2.5 top-[58px] h-5 w-5 rounded-full border border-slate-200 bg-slate-50" aria-hidden />
      <span className="absolute -right-2.5 top-[58px] h-5 w-5 rounded-full border border-slate-200 bg-slate-50" aria-hidden />

      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <p className="text-3xl font-black tracking-tight text-blue-600">{discountLabel(d)}</p>
        </div>
        <Pill tone={pill.tone}>{pill.label}</Pill>
      </div>

      <div className="mx-5 mt-3 border-t border-dashed border-slate-200" />

      <div className="px-5 pb-4 pt-3">
        <div className="flex items-center justify-between gap-2">
          <code className="truncate rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-sm font-black tracking-wider text-slate-900">{d.code}</code>
          <button
            type="button"
            onClick={async () => {
              if (await copyText(d.code)) {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }
            }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="mt-3">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>
              Used <strong className="text-slate-900 tabular-nums">{used}</strong>
              {d.usageLimit ? ` of ${d.usageLimit}` : ' times'}
            </span>
            <span>{d.usageLimit ? `${Math.max(0, d.usageLimit - used)} left` : 'No limit'}</span>
          </div>
          {d.usageLimit ? (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${pct >= 100 ? 'bg-amber-500' : 'bg-blue-500'}`} style={{ width: `${pct}%` }} />
            </div>
          ) : null}
          {d.expiresAt ? (
            <p className="mt-2 text-[11px] font-semibold text-slate-400">
              {state === 'expired' ? 'Expired' : 'Expires'} {new Date(d.expiresAt).toLocaleDateString('en-GB')}
            </p>
          ) : null}
        </div>

        <div className="mt-3 flex justify-end">
          <button type="button" onClick={onDelete} className={`${BTN_GHOST_DANGER} px-2 py-1 text-xs`}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </button>
        </div>
      </div>
    </div>
  );
};

function CreateCodePanel({
  open,
  onClose,
  existingCodes,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  existingCodes: Set<string>;
  onCreated: () => Promise<void>;
}) {
  const { showFlyer } = useFlyer();
  const [form, setForm] = useState(EMPTY_CODE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ ...EMPTY_CODE, code: randomCode() });
  }, [open]);

  const valueNum = parseFloat(form.value);
  const code = form.code.trim().toUpperCase();
  const duplicate = code !== '' && existingCodes.has(code);
  const preview = Number.isFinite(valueNum) && valueNum > 0 ? discountLabel({ type: form.type, value: valueNum }) : null;

  const submit = async () => {
    if (saving) return;
    if (!code) return showFlyer('Please enter a promo code.', 'error');
    if (duplicate) return showFlyer('That code already exists. Pick another one.', 'error');
    if (!Number.isFinite(valueNum) || valueNum <= 0) return showFlyer('Enter a discount greater than zero.', 'error');
    if (form.type === 'percentage' && valueNum > 100) return showFlyer('A percentage discount cannot be more than 100%.', 'error');
    let usageLimit: number | null = null;
    if (form.usageLimit.trim()) {
      const n = parseInt(form.usageLimit, 10);
      if (!Number.isFinite(n) || n < 1) return showFlyer('Usage limit must be a whole number of 1 or more.', 'error');
      usageLimit = n;
    }
    setSaving(true);
    try {
      await apiAdmin.createDiscount({ code, type: form.type, value: valueNum, usageLimit });
      await onCreated();
      showFlyer(`Promo code ${code} created.`, 'success');
      onClose();
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not create the promo code.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SidePanel
      open={open}
      onClose={() => !saving && onClose()}
      title="New promo code"
      subtitle="Customers type this code at checkout to get the discount."
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={() => void submit()} disabled={saving}>
            {saving ? 'Creating…' : 'Create code'}
          </button>
        </>
      }
    >
      {/* Live preview */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 p-5 text-white shadow-lg shadow-blue-200">
        <p className="text-[11px] font-black uppercase tracking-widest text-white/70">Preview</p>
        <p className="mt-1 text-3xl font-black">{preview ?? 'Set a discount'}</p>
        <p className="mt-3 inline-block rounded-lg bg-white/15 px-3 py-1 font-mono text-sm font-black tracking-wider">{code || 'YOURCODE'}</p>
        <p className="mt-3 text-xs text-white/80">
          {form.usageLimit.trim() ? `Can be used ${form.usageLimit} time${form.usageLimit === '1' ? '' : 's'}.` : 'Can be used any number of times.'}
        </p>
      </div>

      <Field label="Code" hint={duplicate ? <span className="font-bold text-red-600">This code already exists.</span> : 'Letters and numbers only. Short codes are easier to type.'}>
        <div className="flex gap-2">
          <input
            className={`${INPUT} font-mono uppercase tracking-wider`}
            value={form.code}
            maxLength={50}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '') }))}
            placeholder="SUMMER10"
          />
          <button type="button" className={BTN_SECONDARY} onClick={() => setForm((f) => ({ ...f, code: randomCode() }))} title="Generate a random code">
            <Shuffle className="h-4 w-4" />
          </button>
        </div>
      </Field>

      <Field label="Discount type">
        <div className="grid grid-cols-2 gap-2">
          {(
            [
              { id: 'percentage', label: 'Percentage', hint: 'e.g. 10% off' },
              { id: 'fixed', label: 'Fixed amount', hint: 'e.g. £15 off' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setForm((f) => ({ ...f, type: t.id }))}
              className={`rounded-xl border-2 p-3 text-left transition ${
                form.type === t.id ? 'border-blue-600 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <p className="text-sm font-black text-slate-900">{t.label}</p>
              <p className="text-xs text-slate-500">{t.hint}</p>
            </button>
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={form.type === 'percentage' ? 'Percent off' : 'Amount off'}>
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
              {form.type === 'percentage' ? '%' : '£'}
            </span>
            <input
              type="number"
              min={0}
              step={form.type === 'percentage' ? 1 : 0.5}
              className={`${INPUT} pl-8`}
              value={form.value}
              onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
              placeholder={form.type === 'percentage' ? '10' : '15'}
            />
          </div>
        </Field>
        <Field label="Usage limit" hint="Leave empty for unlimited.">
          <input
            type="number"
            min={1}
            className={INPUT}
            value={form.usageLimit}
            onChange={(e) => setForm((f) => ({ ...f, usageLimit: e.target.value }))}
            placeholder="Unlimited"
          />
        </Field>
      </div>
    </SidePanel>
  );
}

/* ----------------------------------------------------------------------------------------------
 * Seasonal website banners
 * -------------------------------------------------------------------------------------------- */

interface BannerForm {
  title: string;
  description: string;
  bannerText: string;
  discountCode: string;
  discountPercent: string;
  startDate: string;
  endDate: string;
  showOnHomepage: boolean;
  showOnBooking: boolean;
}

const EMPTY_BANNER: BannerForm = {
  title: '',
  description: '',
  bannerText: '',
  discountCode: '',
  discountPercent: '',
  startDate: '',
  endDate: '',
  showOnHomepage: true,
  showOnBooking: true,
};

const BANNER_PILL: Record<BannerStatus, { label: string; tone: string }> = {
  live: { label: 'Live now', tone: PILL.green },
  scheduled: { label: 'Scheduled', tone: PILL.blue },
  ended: { label: 'Ended', tone: PILL.slate },
  paused: { label: 'Paused', tone: PILL.amber },
};

function BannerPanel({
  open,
  editing,
  onClose,
  onSaved,
  codes,
}: {
  open: boolean;
  editing: PromotionRow | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  codes: DiscountRow[];
}) {
  const [form, setForm] = useState<BannerForm>(EMPTY_BANNER);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (editing) {
      setForm({
        title: editing.title || '',
        description: editing.description || '',
        bannerText: editing.bannerText || '',
        discountCode: editing.discountCode || '',
        discountPercent: editing.discountPercent == null ? '' : String(editing.discountPercent),
        startDate: editing.startDate || '',
        endDate: editing.endDate || '',
        showOnHomepage: editing.showOnHomepage !== false,
        showOnBooking: editing.showOnBooking !== false,
      });
    } else {
      const start = todayYmd();
      const end = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
      setForm({ ...EMPTY_BANNER, startDate: start, endDate: end });
    }
  }, [open, editing]);

  const set = <K extends keyof BannerForm>(k: K, v: BannerForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.title.trim()) return setError('Give the banner a name so you can find it later.');
    if (!form.startDate || !form.endDate) return setError('Choose a start and an end date.');
    if (form.endDate < form.startDate) return setError('The end date must be on or after the start date.');
    setSaving(true);
    setError('');
    try {
      const res = await fetch(editing ? apiUrl(`/admin/promotions/${editing.id}`) : apiUrl('/admin/promotions'), {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ ...form, discountPercent: form.discountPercent === '' ? null : Number(form.discountPercent) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Could not save the banner.');
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the banner.');
    } finally {
      setSaving(false);
    }
  };

  const previewText = form.bannerText.trim() || 'Your banner message appears here';
  const length = form.startDate && form.endDate && form.endDate >= form.startDate ? daysBetween(form.startDate, form.endDate) + 1 : null;

  return (
    <SidePanel
      open={open}
      onClose={() => !saving && onClose()}
      title={editing ? 'Edit banner' : 'New website banner'}
      subtitle="A strip across the top of the website, shown only between the dates you choose."
      footer={
        <>
          <button type="button" className={BTN_SECONDARY} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Create banner'}
          </button>
        </>
      }
    >
      <div>
        <p className="mb-1.5 text-xs font-bold text-slate-700">Preview</p>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 bg-blue-600 px-4 py-2.5 text-center text-sm font-bold text-white">
            <span>{previewText}</span>
            {form.discountCode.trim() ? <span className="rounded-md bg-white/20 px-2 py-0.5 font-mono text-xs tracking-wider">{form.discountCode.trim()}</span> : null}
          </div>
          <div className="space-y-2 p-4" aria-hidden>
            <div className="h-2.5 w-1/3 rounded-full bg-slate-200" />
            <div className="h-2 w-2/3 rounded-full bg-slate-100" />
            <div className="h-2 w-1/2 rounded-full bg-slate-100" />
          </div>
        </div>
      </div>

      <Field label="Banner name" hint="Only you see this, e.g. Spring clean 2027.">
        <input className={INPUT} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Spring clean offer" />
      </Field>
      <Field label="Message on the website" counter={{ value: form.bannerText.length, max: 90 }}>
        <input
          className={INPUT}
          value={form.bannerText}
          onChange={(e) => set('bannerText', e.target.value)}
          placeholder="Spring offer: 15% off deep cleans this month"
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Promo code (optional)" hint={codes.length ? 'Pick one of your codes or type your own.' : undefined}>
          <input
            className={`${INPUT} font-mono uppercase`}
            list="cin-promo-code-options"
            value={form.discountCode}
            onChange={(e) => set('discountCode', e.target.value.toUpperCase())}
            placeholder="SPRING15"
          />
          <datalist id="cin-promo-code-options">
            {codes.map((c) => (
              <option key={String(c.id)} value={c.code}>
                {discountLabel(c)}
              </option>
            ))}
          </datalist>
        </Field>
        <Field label="Discount % (optional)">
          <input
            type="number"
            min={0}
            max={100}
            className={INPUT}
            value={form.discountPercent}
            onChange={(e) => set('discountPercent', e.target.value)}
            placeholder="15"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Starts">
          <input type="date" className={INPUT} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Ends" hint={length ? `Runs for ${length} day${length === 1 ? '' : 's'}.` : undefined}>
          <input type="date" className={INPUT} value={form.endDate} min={form.startDate || undefined} onChange={(e) => set('endDate', e.target.value)} />
        </Field>
      </div>

      <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-xs font-bold text-slate-700">Where to show it</p>
        {(
          [
            { key: 'showOnHomepage', label: 'Homepage', hint: 'Visitors see it as soon as they land.' },
            { key: 'showOnBooking', label: 'Booking page', hint: 'Reminds customers while they book.' },
          ] as const
        ).map((o) => (
          <div key={o.key} className="flex items-center justify-between gap-3 py-1">
            <div>
              <p className="text-sm font-bold text-slate-900">{o.label}</p>
              <p className="text-xs text-slate-500">{o.hint}</p>
            </div>
            <Switch checked={form[o.key]} onChange={(v) => set(o.key, v)} label={`Show on ${o.label}`} />
          </div>
        ))}
      </div>

      <Field label="Notes (optional)" hint="Only visible to admins.">
        <textarea className={`${INPUT} min-h-[72px]`} value={form.description} onChange={(e) => set('description', e.target.value)} />
      </Field>

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{error}</p> : null}
    </SidePanel>
  );
}

/* ----------------------------------------------------------------------------------------------
 * Section
 * -------------------------------------------------------------------------------------------- */

type CodeFilter = 'all' | CodeState;

export default function PromoCodesSection({
  discounts,
  onDiscountsChange,
  promotions,
  openCreate,
  onOpenCreateHandled,
}: {
  discounts: DiscountRow[];
  onDiscountsChange: (rows: DiscountRow[]) => void;
  promotions: ReturnType<typeof usePromotions>;
  /** Set by Overview's quick actions: 'code' or 'banner' opens that form on arrival. */
  openCreate: 'code' | 'banner' | null;
  onOpenCreateHandled: () => void;
}) {
  const { showFlyer } = useFlyer();
  const [createOpen, setCreateOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<PromotionRow | null>(null);
  const [filter, setFilter] = useState<CodeFilter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (openCreate === 'code') setCreateOpen(true);
    if (openCreate === 'banner') {
      setEditingBanner(null);
      setBannerOpen(true);
    }
    if (openCreate) onOpenCreateHandled();
  }, [openCreate, onOpenCreateHandled]);

  const counts = useMemo(() => {
    const c: Record<CodeFilter, number> = { all: discounts.length, active: 0, used_up: 0, inactive: 0, expired: 0 };
    discounts.forEach((d) => c[codeState(d)]++);
    return c;
  }, [discounts]);

  const shown = useMemo(() => {
    const q = search.trim().toUpperCase();
    return discounts
      .filter((d) => filter === 'all' || codeState(d) === filter)
      .filter((d) => !q || d.code.toUpperCase().includes(q))
      .sort((a, b) => (Number(b.usedCount) || 0) - (Number(a.usedCount) || 0));
  }, [discounts, filter, search]);

  const existingCodes = useMemo(() => new Set(discounts.map((d) => d.code.toUpperCase())), [discounts]);

  const reloadCodes = async () => onDiscountsChange(await apiAdmin.getDiscounts());

  const deleteCode = async (d: DiscountRow) => {
    if (!window.confirm(`Delete promo code ${d.code}? Customers will no longer be able to use it.`)) return;
    try {
      await apiAdmin.deleteDiscount(String(d.id));
      onDiscountsChange(discounts.filter((x) => x.id !== d.id));
      showFlyer(`${d.code} deleted.`, 'success');
    } catch {
      showFlyer('Could not delete the promo code.', 'error');
    }
  };

  const today = todayYmd();
  const banners = useMemo(() => {
    const order: Record<BannerStatus, number> = { live: 0, scheduled: 1, paused: 2, ended: 3 };
    return [...promotions.list].sort((a, b) => order[bannerStatus(a, today)] - order[bannerStatus(b, today)] || b.startDate.localeCompare(a.startDate));
  }, [promotions.list, today]);

  const toggleBanner = async (p: PromotionRow) => {
    try {
      await fetch(apiUrl(`/admin/promotions/${p.id}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...adminAuthHeaders() },
        credentials: 'include',
        body: JSON.stringify({ active: !p.active }),
      });
      await promotions.refresh();
      showFlyer(p.active ? 'Banner paused.' : 'Banner resumed.', 'success');
    } catch {
      showFlyer('Could not update the banner.', 'error');
    }
  };

  const deleteBanner = async (p: PromotionRow) => {
    if (!window.confirm(`Delete the banner "${p.title}"?`)) return;
    try {
      await fetch(apiUrl(`/admin/promotions/${p.id}`), { method: 'DELETE', credentials: 'include', headers: adminAuthHeaders() });
      await promotions.refresh();
      showFlyer('Banner deleted.', 'success');
    } catch {
      showFlyer('Could not delete the banner.', 'error');
    }
  };

  return (
    <div className="space-y-10">
      {/* Promo codes */}
      <section className="space-y-5">
        <SectionHeader
          title="Promo codes"
          description="Codes customers enter at checkout. The most used codes are shown first."
          actions={
            <button type="button" className={BTN_PRIMARY} onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> New code
            </button>
          }
        />

        {discounts.length > 0 && (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Segmented
              ariaLabel="Filter promo codes"
              value={filter}
              onChange={setFilter}
              items={[
                { id: 'all', label: 'All', count: counts.all },
                { id: 'active', label: 'Active', count: counts.active },
                { id: 'used_up', label: 'Limit reached', count: counts.used_up },
                ...(counts.expired ? [{ id: 'expired' as const, label: 'Expired', count: counts.expired }] : []),
                ...(counts.inactive ? [{ id: 'inactive' as const, label: 'Inactive', count: counts.inactive }] : []),
              ]}
            />
            <div className="relative sm:w-64">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" className={`${INPUT} pl-10`} placeholder="Find a code" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        )}

        {discounts.length === 0 ? (
          <EmptyState
            icon={<Ticket className="h-6 w-6" />}
            title="No promo codes yet"
            text="Create a code like FIRST10 to reward new customers or run a sale."
            action={
              <button type="button" className={BTN_PRIMARY} onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Create your first code
              </button>
            }
          />
        ) : shown.length === 0 ? (
          <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-slate-500">No codes match this filter.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {shown.map((d) => (
              <CodeCard key={String(d.id)} d={d} onDelete={() => void deleteCode(d)} />
            ))}
          </div>
        )}
      </section>

      {/* Website banners */}
      <section className="space-y-5 border-t border-slate-200 pt-8">
        <SectionHeader
          title="Website banners"
          description="Seasonal offers shown across the top of the website. They switch on and off by themselves on the dates you set."
          actions={
            <button
              type="button"
              className={BTN_SECONDARY}
              onClick={() => {
                setEditingBanner(null);
                setBannerOpen(true);
              }}
            >
              <Megaphone className="h-4 w-4" /> New banner
            </button>
          }
        />

        {promotions.loading ? (
          <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        ) : banners.length === 0 ? (
          <EmptyState
            icon={<Megaphone className="h-6 w-6" />}
            title="No banners yet"
            text="Announce a seasonal offer, like a spring clean discount, for a set number of days."
          />
        ) : (
          <div className="space-y-3">
            {banners.map((p) => {
              const st = bannerStatus(p, today);
              const pill = BANNER_PILL[st];
              const total = Math.max(1, daysBetween(p.startDate, p.endDate) + 1);
              const elapsed = Math.min(total, Math.max(0, daysBetween(p.startDate, today) + 1));
              const progress = st === 'live' ? Math.round((elapsed / total) * 100) : st === 'ended' ? 100 : 0;
              const note =
                st === 'live'
                  ? `${total - elapsed} day${total - elapsed === 1 ? '' : 's'} left`
                  : st === 'scheduled'
                    ? `Starts in ${daysBetween(today, p.startDate)} day${daysBetween(today, p.startDate) === 1 ? '' : 's'}`
                    : st === 'ended'
                      ? 'Finished'
                      : 'Turned off';
              const fmt = (ymd: string) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
              return (
                <Card key={p.id} className="p-4 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-900">{p.title}</p>
                        <Pill tone={pill.tone}>
                          {st === 'live' ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> : null}
                          {pill.label}
                        </Pill>
                        {p.discountCode ? <Pill tone={PILL.blue}>{p.discountCode}</Pill> : null}
                      </div>
                      {p.bannerText ? <p className="mt-1 truncate text-sm text-slate-600">“{p.bannerText}”</p> : null}
                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-500">
                        <span className="inline-flex items-center gap-1">
                          <CalendarRange className="h-3.5 w-3.5" /> {fmt(p.startDate)} to {fmt(p.endDate)}
                        </span>
                        <span>{note}</span>
                        <span>
                          {[p.showOnHomepage !== false && 'Homepage', p.showOnBooking !== false && 'Booking page'].filter(Boolean).join(' · ') || 'Hidden everywhere'}
                        </span>
                      </div>
                      <div className="mt-2 h-1 max-w-md overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${st === 'live' ? 'bg-emerald-500' : 'bg-slate-300'}`} style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        className={`${BTN_SECONDARY} px-3 py-2 text-xs`}
                        onClick={() => {
                          setEditingBanner(p);
                          setBannerOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </button>
                      <button type="button" className={`${BTN_SECONDARY} px-3 py-2 text-xs`} onClick={() => void toggleBanner(p)}>
                        {p.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                        {p.active ? 'Pause' : 'Resume'}
                      </button>
                      <button type="button" className={`${BTN_GHOST_DANGER} px-2.5 py-2`} onClick={() => void deleteBanner(p)} aria-label={`Delete ${p.title}`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <CreateCodePanel open={createOpen} onClose={() => setCreateOpen(false)} existingCodes={existingCodes} onCreated={reloadCodes} />
      <BannerPanel
        open={bannerOpen}
        editing={editingBanner}
        onClose={() => setBannerOpen(false)}
        onSaved={promotions.refresh}
        codes={discounts}
      />
    </div>
  );
}
