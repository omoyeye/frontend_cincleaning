import React from 'react';
import {
  AlertTriangle,
  Building2,
  ExternalLink,
  Eye,
  EyeOff,
  Facebook,
  Instagram,
  Landmark,
  Linkedin,
  Mail,
  Music2,
  Phone,
  Globe,
  Plus,
  Trash2,
  Star,
  Twitter,
  Wand2,
} from 'lucide-react';
import type { BankAccountDetail, BusinessSettings, SocialMediaLinks } from '../../../types';
import BrandLogoMark from '../../BrandLogoMark';
import { BTN_GHOST_DANGER, BTN_PRIMARY, BTN_SECONDARY, Card, EmptyState, Field, INPUT, PILL, Pill, SectionHeader, Switch } from '../marketing/MarketingUi';

type Settings = Partial<BusinessSettings>;
type SetSettings = React.Dispatch<React.SetStateAction<Settings>>;

/** Fields the Business profile owns (and the only ones its Save sends). */
export const PROFILE_KEYS = ['companyName', 'email', 'phone', 'website', 'address', 'socialLinks', 'googleReviewUrl', 'bankDetails', 'depositPolicy', 'cancellationPolicy'] as const;

export const PROFILE_GROUPS = {
  company: ['companyName', 'email', 'phone', 'website', 'address'],
  social: ['socialLinks', 'googleReviewUrl'],
  bank: ['bankDetails'],
  policies: ['depositPolicy', 'cancellationPolicy'],
} as const;

export const snapshotOf = (s: Settings, keys: readonly string[] = PROFILE_KEYS) =>
  JSON.stringify(keys.map((k) => (s as Record<string, unknown>)[k] ?? null));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const looksLikeUrl = (v: string) => /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(v.trim());

/* ------------------------------------------------------------------------------------- Company */

export function CompanySection({ settings, setSettings }: { settings: Settings; setSettings: SetSettings }) {
  const set = (k: keyof BusinessSettings, v: string) => setSettings((p) => ({ ...p, [k]: v }));
  const emailBad = !!settings.email && !EMAIL_RE.test(settings.email.trim());
  const siteBad = !!settings.website && !looksLikeUrl(settings.website);
  const addressLines = String(settings.address || '').split('\n').map((l) => l.trim()).filter(Boolean);

  return (
    <div className="space-y-5">
      <SectionHeader title="Company & contact" description="Your business details on invoices, emails, booking confirmations and the website." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="space-y-4 p-4 sm:p-6">
          <Field label="Company name" hint="Shown in the admin, customer portal, emails and invoices.">
            <input className={`${INPUT} font-bold`} value={settings.companyName || ''} onChange={(e) => set('companyName', e.target.value)} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Support email"
              hint={emailBad ? <span className="font-bold text-red-600">This does not look like an email address.</span> : 'Booking alerts and contact form messages go here.'}
            >
              <input type="email" className={INPUT} value={settings.email || ''} onChange={(e) => set('email', e.target.value)} />
            </Field>
            <Field label="Support phone" hint="On invoices, confirmations and texts.">
              <input type="tel" className={INPUT} value={settings.phone || ''} onChange={(e) => set('phone', e.target.value)} />
            </Field>
          </div>
          <Field
            label="Website"
            hint={siteBad ? <span className="font-bold text-amber-700">Include https:// at the start, e.g. https://www.cleanitneatly.com</span> : 'Linked from email footers.'}
          >
            <input type="url" className={INPUT} value={settings.website || ''} onChange={(e) => set('website', e.target.value)} placeholder="https://www.cleanitneatly.com" />
          </Field>
          <Field label="Business address" hint="Put the street, town and postcode on separate lines.">
            <textarea className={`${INPUT} min-h-[100px]`} value={settings.address || ''} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </Card>

        <div className="xl:sticky xl:top-4 xl:self-start">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Eye className="h-3.5 w-3.5" /> How it looks on an invoice
          </p>
          <Card className="space-y-4 p-5">
            <BrandLogoMark className="h-12 w-auto object-contain object-left" />
            <div>
              <p className="font-black text-slate-900">{settings.companyName || 'Company name'}</p>
              {addressLines.length ? (
                addressLines.map((l, i) => (
                  <p key={i} className="text-xs text-slate-500">
                    {l}
                  </p>
                ))
              ) : (
                <p className="text-xs italic text-slate-400">No address yet</p>
              )}
            </div>
            <div className="space-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-600">
              <p className="flex items-center gap-2">
                <Phone className="h-3.5 w-3.5 text-slate-400" /> {settings.phone || <span className="italic text-slate-400">No phone</span>}
              </p>
              <p className="flex items-center gap-2">
                <Mail className="h-3.5 w-3.5 text-slate-400" /> {settings.email || <span className="italic text-slate-400">No email</span>}
              </p>
              <p className="flex items-center gap-2 break-all">
                <Globe className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {settings.website || <span className="italic text-slate-400">No website</span>}
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------------------- Social */

const SOCIALS: { key: keyof SocialMediaLinks; label: string; icon: React.ReactNode; tone: string; placeholder: string }[] = [
  { key: 'facebook', label: 'Facebook', icon: <Facebook className="h-4 w-4" />, tone: 'bg-blue-600 text-white', placeholder: 'https://facebook.com/yourpage' },
  { key: 'instagram', label: 'Instagram', icon: <Instagram className="h-4 w-4" />, tone: 'bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600 text-white', placeholder: 'https://instagram.com/yourname' },
  { key: 'tiktok', label: 'TikTok', icon: <Music2 className="h-4 w-4" />, tone: 'bg-slate-900 text-white', placeholder: 'https://tiktok.com/@yourname' },
  { key: 'twitter', label: 'X (Twitter)', icon: <Twitter className="h-4 w-4" />, tone: 'bg-black text-white', placeholder: 'https://x.com/yourname' },
  { key: 'linkedin', label: 'LinkedIn', icon: <Linkedin className="h-4 w-4" />, tone: 'bg-sky-700 text-white', placeholder: 'https://linkedin.com/company/yourcompany' },
];

export function SocialSection({ settings, setSettings }: { settings: Settings; setSettings: SetSettings }) {
  const links = (settings.socialLinks || {}) as SocialMediaLinks;
  const filled = SOCIALS.filter((s) => String(links[s.key] || '').trim()).length;
  return (
    <div className="space-y-5">
      <SectionHeader
        title="Social links"
        description={`Shown as icons in the website footer and on emails. ${filled} of ${SOCIALS.length} added. Leave a box empty to hide that icon.`}
      />
      <Card className="divide-y divide-slate-100">
        {SOCIALS.map((s) => {
          const v = String(links[s.key] || '');
          const ok = v.trim() !== '' && looksLikeUrl(v);
          const bad = v.trim() !== '' && !ok;
          return (
            <div key={s.key} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
              <div className="flex w-44 shrink-0 items-center gap-3">
                <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${s.tone}`}>{s.icon}</span>
                <div>
                  <p className="text-sm font-black text-slate-900">{s.label}</p>
                  {ok ? <Pill tone={PILL.green}>Showing</Pill> : bad ? <Pill tone={PILL.amber}>Check link</Pill> : <Pill tone={PILL.slate}>Hidden</Pill>}
                </div>
              </div>
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <input
                  type="url"
                  aria-label={`${s.label} link`}
                  className={INPUT}
                  value={v}
                  placeholder={s.placeholder}
                  onChange={(e) => setSettings((p) => ({ ...p, socialLinks: { ...(p.socialLinks || {}), [s.key]: e.target.value } as SocialMediaLinks }))}
                />
                {ok ? (
                  <a href={v} target="_blank" rel="noreferrer" className={`${BTN_SECONDARY} shrink-0 px-3`} title="Open link" aria-label={`Open ${s.label}`}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : null}
              </div>
            </div>
          );
        })}
      </Card>
      <p className="text-xs text-slate-500">Links need to start with https:// so they open correctly.</p>

      <Card className="space-y-3 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-500">
            <Star className="h-4 w-4 fill-current" />
          </span>
          <div>
            <p className="text-sm font-black text-slate-900">Google review link</p>
            <p className="text-sm text-slate-500">
              Customers who give 4 or 5 stars are invited to post the same review on Google. Reviews there are what show
              stars next to your business in Google Search and Maps.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="url"
            aria-label="Google review link"
            className={INPUT}
            value={settings.googleReviewUrl || ''}
            placeholder="https://g.page/r/your-business-id/review"
            onChange={(e) => setSettings((p) => ({ ...p, googleReviewUrl: e.target.value }))}
          />
          {looksLikeUrl(String(settings.googleReviewUrl || '')) ? (
            <a href={settings.googleReviewUrl} target="_blank" rel="noreferrer" className={`${BTN_SECONDARY} shrink-0 px-3`} title="Test link" aria-label="Test Google review link">
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
        <p className="text-xs text-slate-500">
          Find it in your Google Business Profile: open your business on Google, choose <strong>Ask for reviews</strong> (or
          <strong> Share review form</strong>) and copy the link.
        </p>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------------------------- Bank */

const formatSortCode = (v: string) =>
  v
    .replace(/\D/g, '')
    .slice(0, 6)
    .replace(/(\d{2})(?=\d)/g, '$1-');

export function BankSection({ settings, setSettings }: { settings: Settings; setSettings: SetSettings }) {
  const banks = settings.bankDetails || [];
  const patch = (index: number, p: Partial<BankAccountDetail>) =>
    setSettings((prev) => ({ ...prev, bankDetails: (prev.bankDetails || []).map((b, i) => (i === index ? { ...b, ...p } : b)) }));
  const add = () =>
    setSettings((prev) => ({
      ...prev,
      bankDetails: [...(prev.bankDetails || []), { id: `bank-${Date.now()}`, accountName: '', accountNumber: '', sortCode: '', bankName: '', notes: '', active: true }],
    }));
  const shownCount = banks.filter((b) => b.active !== false).length;

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Bank accounts"
        description="Where customers send bank transfers. Accounts switched on appear on invoices and booking confirmations."
        actions={
          <button type="button" className={BTN_PRIMARY} onClick={add}>
            <Plus className="h-4 w-4" /> Add account
          </button>
        }
      />
      {banks.length > 0 && shownCount === 0 ? (
        <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> No account is switched on, so customers will not see any bank details.
        </p>
      ) : null}

      {banks.length === 0 ? (
        <EmptyState
          icon={<Landmark className="h-6 w-6" />}
          title="No bank accounts yet"
          text="Add the account customers should pay into by bank transfer."
          action={
            <button type="button" className={BTN_PRIMARY} onClick={add}>
              <Plus className="h-4 w-4" /> Add account
            </button>
          }
        />
      ) : (
        <div className="space-y-4">
          {banks.map((bank, index) => {
            const missing = [!bank.accountName?.trim() && 'account name', !bank.accountNumber?.trim() && 'account number', !bank.sortCode?.trim() && 'sort code'].filter(Boolean);
            const on = bank.active !== false;
            return (
              <Card key={bank.id || `bank-${index}`} className={`overflow-hidden ${on ? '' : 'opacity-80'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <Landmark className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-slate-900">{bank.bankName?.trim() || bank.accountName?.trim() || `Account ${index + 1}`}</p>
                      <p className="text-xs font-semibold text-slate-500">
                        {on ? <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" /> Shown to customers</span> : <span className="inline-flex items-center gap-1"><EyeOff className="h-3 w-3" /> Hidden from customers</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={on} onChange={(v) => patch(index, { active: v })} label="Show this account to customers" />
                    <button
                      type="button"
                      className={`${BTN_GHOST_DANGER} px-2.5`}
                      aria-label="Delete account"
                      onClick={() => {
                        if (!window.confirm('Remove this bank account? It is deleted when you save.')) return;
                        setSettings((prev) => ({ ...prev, bankDetails: (prev.bankDetails || []).filter((_, i) => i !== index) }));
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-4 p-4 sm:p-5">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Account name" hint="The name on the account, as customers type it for the payee.">
                      <input className={INPUT} value={bank.accountName || ''} onChange={(e) => patch(index, { accountName: e.target.value })} />
                    </Field>
                    <Field label="Bank (optional)">
                      <input className={INPUT} value={bank.bankName || ''} onChange={(e) => patch(index, { bankName: e.target.value })} placeholder="e.g. Starling" />
                    </Field>
                    <Field label="Account number">
                      <input
                        inputMode="numeric"
                        className={`${INPUT} font-mono tracking-wider`}
                        value={bank.accountNumber || ''}
                        onChange={(e) => patch(index, { accountNumber: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                        placeholder="12345678"
                      />
                    </Field>
                    <Field label="Sort code">
                      <input
                        inputMode="numeric"
                        className={`${INPUT} font-mono tracking-wider`}
                        value={bank.sortCode || ''}
                        onChange={(e) => patch(index, { sortCode: formatSortCode(e.target.value) })}
                        placeholder="04-06-05"
                      />
                    </Field>
                  </div>
                  <Field label="Notes (optional)" hint="Extra payment instructions, e.g. use your booking reference.">
                    <textarea className={`${INPUT} min-h-[64px]`} value={bank.notes || ''} onChange={(e) => patch(index, { notes: e.target.value })} />
                  </Field>
                  {missing.length ? (
                    <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                      <AlertTriangle className="h-4 w-4 shrink-0" /> Add the {missing.join(', ')}. Incomplete accounts are not saved.
                    </p>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------ Policies */

const depositText = (pct: number) =>
  `To reserve your slot and lock in your cleaning team, we ask for a ${pct}% deposit when you book. The balance is due once the clean is finished.`;
const cancelText = (hours: number, pct: number) =>
  `If you cancel within ${hours} hours of your appointment, a short-notice cancellation fee of ${pct}% of the booking total applies.`;

function PercentInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 flex-1 cursor-pointer accent-blue-600"
      />
      <div className="relative w-24">
        <input
          type="number"
          min={0}
          max={100}
          className={`${INPUT} pr-8 text-right font-black`}
          value={value}
          aria-label={label}
          onChange={(e) => onChange(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">%</span>
      </div>
    </div>
  );
}

export function PoliciesSection({ settings, setSettings }: { settings: Settings; setSettings: SetSettings }) {
  const dep = Number(settings.depositPolicy?.requiredPercent ?? 40);
  const hours = Number(settings.cancellationPolicy?.shortNoticeWindowHours ?? 24);
  const fee = Number(settings.cancellationPolicy?.shortNoticeFeePercent ?? 10);
  const setDep = (p: Partial<NonNullable<BusinessSettings['depositPolicy']>>) =>
    setSettings((prev) => ({ ...prev, depositPolicy: { requiredPercent: dep, ...(prev.depositPolicy || {}), ...p } }));
  const setCancel = (p: Partial<NonNullable<BusinessSettings['cancellationPolicy']>>) =>
    setSettings((prev) => ({
      ...prev,
      cancellationPolicy: { shortNoticeWindowHours: hours, shortNoticeFeePercent: fee, ...(prev.cancellationPolicy || {}), ...p },
    }));
  const example = 120;

  return (
    <div className="space-y-6">
      <SectionHeader title="Deposit & cancellation" description="The rules customers agree to when they book or cancel." />

      <Card className="space-y-5 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-slate-900">Deposit</p>
            <p className="text-sm text-slate-500">How much customers pay when they book. They can also choose to pay in full.</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <Building2 className="h-5 w-5" />
          </span>
        </div>
        <Field label="Deposit amount">
          <PercentInput value={dep} label="Deposit percentage" onChange={(n) => setDep({ requiredPercent: n })} />
        </Field>
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          On a <strong>£{example}</strong> booking the customer pays <strong className="text-slate-900">£{((example * dep) / 100).toFixed(2)}</strong> now and{' '}
          <strong className="text-slate-900">£{(example - (example * dep) / 100).toFixed(2)}</strong> after the clean.
        </div>
        <Field label="Message shown with the deposit" counter={{ value: String(settings.depositPolicy?.message || '').length, max: 400 }}>
          <textarea
            className={`${INPUT} min-h-[96px]`}
            value={settings.depositPolicy?.message || ''}
            placeholder={depositText(dep)}
            onChange={(e) => setDep({ message: e.target.value })}
          />
        </Field>
        <button type="button" className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800" onClick={() => setDep({ message: depositText(dep) })}>
          <Wand2 className="h-3.5 w-3.5" /> Use suggested wording for {dep}%
        </button>
      </Card>

      <Card className="space-y-5 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-slate-900">Short-notice cancellation</p>
            <p className="text-sm text-slate-500">A fee for cancelling close to the appointment. Customers must tick to agree before they cancel.</p>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
          </span>
        </div>
        <Field label="Counts as short notice within">
          <div className="flex flex-wrap items-center gap-2">
            {[12, 24, 48, 72].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setCancel({ shortNoticeWindowHours: h })}
                className={`rounded-xl border-2 px-3 py-2 text-sm font-bold transition ${hours === h ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
              >
                {h} hours
              </button>
            ))}
            <div className="relative w-28">
              <input
                type="number"
                min={1}
                className={`${INPUT} pr-12`}
                aria-label="Custom number of hours"
                value={hours}
                onChange={(e) => setCancel({ shortNoticeWindowHours: Math.max(1, Number(e.target.value) || 1) })}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">hrs</span>
            </div>
          </div>
        </Field>
        <Field label="Cancellation fee">
          <PercentInput value={fee} label="Cancellation fee percentage" onChange={(n) => setCancel({ shortNoticeFeePercent: n })} />
        </Field>
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
          Cancelling a <strong>£{example}</strong> booking less than <strong>{hours} hours</strong> before costs{' '}
          <strong className="text-slate-900">£{((example * fee) / 100).toFixed(2)}</strong>.
        </div>
        <Field label="Message customers agree to" counter={{ value: String(settings.cancellationPolicy?.consentMessage || '').length, max: 400 }}>
          <textarea
            className={`${INPUT} min-h-[96px]`}
            value={settings.cancellationPolicy?.consentMessage || ''}
            placeholder={cancelText(hours, fee)}
            onChange={(e) => setCancel({ consentMessage: e.target.value })}
          />
        </Field>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800"
          onClick={() => setCancel({ consentMessage: cancelText(hours, fee) })}
        >
          <Wand2 className="h-3.5 w-3.5" /> Use suggested wording for {hours} hours and {fee}%
        </button>
      </Card>
    </div>
  );
}

