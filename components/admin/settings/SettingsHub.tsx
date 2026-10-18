import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BellRing,
  Bot,
  Building2,
  CircleDollarSign,
  Landmark,
  LayoutTemplate,
  Mail,
  MessageSquare,
  Palette,
  Pencil,
  QrCode,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Share2,
  Smartphone,
  Tags,
  Undo2,
} from 'lucide-react';
import type { BusinessSettings, EmailTemplate, SmsTemplate } from '../../../types';
import { useTheme } from '../../ThemeProvider';
import { useFlyer } from '../../Flyer';
import SeoSettingsManager from '../SeoSettingsManager';
import AiAssistantSettingsPanel from '../AiAssistantSettingsPanel';
import PricingPageSettingsPanel from '../PricingPageSettingsPanel';
import BookingRemindersPanel from '../BookingRemindersPanel';
import QrCodePanel from '../QrCodePanel';
import BrevoSettingsCard from '../BrevoSettingsCard';
import { BTN_PRIMARY, BTN_SECONDARY, Card, EmptyState, Field, HubLayout, INPUT, PILL, Pill, Segmented, SectionHeader } from '../marketing/MarketingUi';
import { BankSection, CompanySection, PROFILE_GROUPS, PROFILE_KEYS, PoliciesSection, SocialSection, snapshotOf } from './BusinessProfileSections';

export type SettingsSectionId =
  | 'company'
  | 'social'
  | 'bank'
  | 'policies'
  | 'theme'
  | 'seo'
  | 'pricing'
  | 'ai'
  | 'website'
  | 'templates'
  | 'reminders'
  | 'qrcode';

type Settings = Partial<BusinessSettings>;

interface Props {
  section: SettingsSectionId;
  onSectionChange: (s: SettingsSectionId) => void;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  /** True once the saved settings have been loaded from the server. */
  settingsLoaded: boolean;
  onSaveProfile: () => Promise<boolean>;
  savingProfile: boolean;
  emailTemplates: EmailTemplate[];
  smsTemplates: SmsTemplate[];
  onEditEmailTemplate: (t: EmailTemplate) => void;
  onEditSmsTemplate: (t: SmsTemplate) => void;
  onReloadTemplates: () => void;
  templatesReloading: boolean;
  onOpenWebsiteContent: () => void;
}

const PROFILE_SECTIONS: SettingsSectionId[] = ['company', 'social', 'bank', 'policies'];

export default function SettingsHub(p: Props) {
  const { section } = p;
  const [baseline, setBaseline] = useState<string | null>(null);
  const [rebase, setRebase] = useState(false);

  // Remember what was saved, so we can show unsaved changes and offer Discard.
  useEffect(() => {
    if ((baseline === null && p.settingsLoaded) || rebase) {
      setBaseline(snapshotOf(p.settings));
      setRebase(false);
    }
  }, [baseline, p.settingsLoaded, p.settings, rebase]);

  const dirtyGroups = useMemo(() => {
    if (!baseline) return { company: false, social: false, bank: false, policies: false };
    const saved = JSON.parse(baseline) as unknown[];
    const savedObj = Object.fromEntries(PROFILE_KEYS.map((k, i) => [k, saved[i]]));
    const groupDirty = (keys: readonly string[]) => snapshotOf(p.settings, keys) !== snapshotOf(savedObj as Settings, keys);
    return {
      company: groupDirty(PROFILE_GROUPS.company),
      social: groupDirty(PROFILE_GROUPS.social),
      bank: groupDirty(PROFILE_GROUPS.bank),
      policies: groupDirty(PROFILE_GROUPS.policies),
    };
  }, [baseline, p.settings]);
  const dirtyCount = Object.values(dirtyGroups).filter(Boolean).length;

  const discard = () => {
    if (!baseline) return;
    const saved = JSON.parse(baseline) as unknown[];
    p.setSettings((prev) => ({ ...prev, ...Object.fromEntries(PROFILE_KEYS.map((k, i) => [k, saved[i] ?? undefined])) }));
  };

  const save = async () => {
    if (await p.onSaveProfile()) setRebase(true);
  };

  const groups = [
    {
      group: 'Business',
      items: [
        { id: 'company' as const, label: 'Company & contact', hint: 'Name, email, phone, address', icon: <Building2 className="h-4 w-4" />, dot: dirtyGroups.company },
        { id: 'social' as const, label: 'Social links', hint: 'Footer and email icons', icon: <Share2 className="h-4 w-4" />, dot: dirtyGroups.social },
        { id: 'bank' as const, label: 'Bank accounts', hint: 'For bank transfers', icon: <Landmark className="h-4 w-4" />, dot: dirtyGroups.bank },
        { id: 'policies' as const, label: 'Deposit & cancellation', hint: 'Booking rules', icon: <CircleDollarSign className="h-4 w-4" />, dot: dirtyGroups.policies },
        { id: 'theme' as const, label: 'Theme & colours', hint: 'Brand colours', icon: <Palette className="h-4 w-4" /> },
      ],
    },
    {
      group: 'Website',
      items: [
        { id: 'seo' as const, label: 'SEO & search', hint: 'Google, analytics, meta tags', icon: <Search className="h-4 w-4" /> },
        { id: 'pricing' as const, label: 'Pricing page', hint: 'Plans and calculator', icon: <Tags className="h-4 w-4" /> },
        { id: 'ai' as const, label: 'AI assistant', hint: 'Website chat helper', icon: <Bot className="h-4 w-4" /> },
        { id: 'website' as const, label: 'Website content', hint: 'Moved to Marketing', icon: <LayoutTemplate className="h-4 w-4" /> },
      ],
    },
    {
      group: 'Messages',
      items: [
        { id: 'templates' as const, label: 'Email & SMS', hint: 'Templates and sending', icon: <Mail className="h-4 w-4" />, badge: p.emailTemplates.length + p.smsTemplates.length || undefined },
        { id: 'reminders' as const, label: 'Booking reminders', hint: 'Automatic 48h and 24h', icon: <BellRing className="h-4 w-4" /> },
      ],
    },
    {
      group: 'Tools',
      items: [{ id: 'qrcode' as const, label: 'QR codes', hint: 'For flyers and cards', icon: <QrCode className="h-4 w-4" /> }],
    },
  ];

  return (
    <HubLayout title="Settings" subtitle="Your business details, website, messages and tools." navLabel="Settings sections" groups={groups} active={section} onChange={p.onSectionChange}>
      {section === 'company' && <CompanySection settings={p.settings} setSettings={p.setSettings} />}
      {section === 'social' && <SocialSection settings={p.settings} setSettings={p.setSettings} />}
      {section === 'bank' && <BankSection settings={p.settings} setSettings={p.setSettings} />}
      {section === 'policies' && <PoliciesSection settings={p.settings} setSettings={p.setSettings} />}
      {section === 'theme' && <ThemeSection />}
      {section === 'seo' && <SeoSettingsManager />}
      {section === 'pricing' && <PricingPageSettingsPanel />}
      {section === 'ai' && <AiAssistantSettingsPanel />}
      {section === 'website' && (
        <EmptyState
          icon={<LayoutTemplate className="h-6 w-6" />}
          title="Website content has moved"
          text="Page headers, homepage cards and the footer are now edited in Marketing, next to the Gallery and Blog."
          action={
            <button type="button" className={BTN_PRIMARY} onClick={p.onOpenWebsiteContent}>
              Open Website content <ArrowRight className="h-4 w-4" />
            </button>
          }
        />
      )}
      {section === 'templates' && <MessagesSection {...p} />}
      {section === 'reminders' && <BookingRemindersPanel />}
      {section === 'qrcode' && <QrCodePanel />}

      {/* Unsaved changes bar for the business profile sections */}
      {PROFILE_SECTIONS.includes(section) && (dirtyCount > 0 || p.savingProfile) && (
        <div className="sticky bottom-24 z-30 lg:bottom-6">
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-white shadow-2xl shadow-slate-900/30 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-semibold">
              <span className="mr-2 inline-block h-2 w-2 rounded-full bg-amber-400 align-middle" />
              {p.savingProfile ? 'Saving your changes…' : `Unsaved changes in ${dirtyCount} section${dirtyCount === 1 ? '' : 's'}`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={discard}
                disabled={p.savingProfile}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-white/80 hover:bg-white/10 disabled:opacity-50"
              >
                <Undo2 className="h-4 w-4" /> Discard
              </button>
              <button
                type="button"
                onClick={() => void save()}
                disabled={p.savingProfile}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-black text-slate-900 hover:bg-slate-100 disabled:opacity-60"
              >
                <Save className="h-4 w-4" /> {p.savingProfile ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </HubLayout>
  );
}

/* --------------------------------------------------------------------------------------- Theme */

const PRESETS: { name: string; primary: string; background: string }[] = [
  { name: 'Indigo', primary: '#4f46e5', background: '#f4f6fb' },
  { name: 'Ocean', primary: '#2563eb', background: '#f5f8ff' },
  { name: 'Teal', primary: '#0d9488', background: '#f3faf9' },
  { name: 'Emerald', primary: '#059669', background: '#f4fbf7' },
  { name: 'Rose', primary: '#e11d48', background: '#fdf6f7' },
  { name: 'Slate', primary: '#0f172a', background: '#f6f7f9' },
];

const HEX_RE = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  if (!HEX_RE.test(hex)) return 0.5;
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ColourField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <Field label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <label className="relative h-11 w-14 shrink-0 cursor-pointer overflow-hidden rounded-xl border border-slate-200 shadow-sm" style={{ background: value }}>
          <input type="color" value={HEX_RE.test(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label={label} />
        </label>
        <input
          className={`${INPUT} font-mono uppercase`}
          value={text}
          maxLength={7}
          onChange={(e) => {
            const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
            setText(v);
            if (HEX_RE.test(v)) onChange(v.toLowerCase());
          }}
        />
      </div>
    </Field>
  );
}

function ThemeSection() {
  const { showFlyer } = useFlyer();
  const { settings, updateSettings, saveSettings } = useTheme();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(() => ({ primary: settings.theme_primary, background: settings.theme_background }));
  const primary = settings.theme_primary || '#4f46e5';
  const background = settings.theme_background || '#f4f6fb';
  const changed = saved.primary !== primary || saved.background !== background;
  const lightPrimary = luminance(primary) > 0.45;

  // The site applies the button colour first, so keep it in step with the primary colour.
  const setPrimary = (v: string) => updateSettings({ theme_primary: v, theme_button: v });

  const apply = async () => {
    setSaving(true);
    try {
      await saveSettings();
      setSaved({ primary, background });
      showFlyer('Theme saved. Customers see the new colours on their next visit.', 'success');
    } catch {
      showFlyer('Could not save the theme.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Theme & colours"
        description="Your brand colours for buttons, links and backgrounds. You can try colours here before saving."
        actions={
          <>
            {changed ? (
              <button type="button" className={BTN_SECONDARY} onClick={() => updateSettings({ theme_primary: saved.primary, theme_button: saved.primary, theme_background: saved.background })}>
                <RotateCcw className="h-4 w-4" /> Undo
              </button>
            ) : null}
            <button type="button" className={BTN_PRIMARY} disabled={saving || !changed} onClick={() => void apply()}>
              {saving ? 'Saving…' : changed ? 'Save theme' : 'Saved'}
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="space-y-5 p-4 sm:p-6">
          <div>
            <p className="mb-2 text-xs font-bold text-slate-700">Quick picks</p>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {PRESETS.map((t) => {
                const on = t.primary === primary && t.background === background;
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => {
                      setPrimary(t.primary);
                      updateSettings({ theme_background: t.background });
                    }}
                    className={`rounded-xl border-2 p-1.5 text-center transition ${on ? 'border-slate-900' : 'border-transparent hover:border-slate-200'}`}
                  >
                    <span className="flex h-10 overflow-hidden rounded-lg border border-slate-200">
                      <span className="w-1/2" style={{ background: t.primary }} />
                      <span className="w-1/2" style={{ background: t.background }} />
                    </span>
                    <span className="mt-1 block text-[11px] font-bold text-slate-600">{t.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <ColourField label="Main colour" hint="Buttons, links and highlighted items." value={primary} onChange={setPrimary} />
          <ColourField label="Page background" hint="Behind cards and content. Light colours work best." value={background} onChange={(v) => updateSettings({ theme_background: v })} />
          {lightPrimary ? (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
              This main colour is very light, so white button text may be hard to read. A darker shade is easier for customers.
            </p>
          ) : null}
        </Card>

        <div>
          <p className="mb-2 text-xs font-bold text-slate-500">Preview</p>
          <div className="overflow-hidden rounded-2xl border border-slate-200" style={{ background }}>
            <div className="flex items-center justify-between border-b border-black/5 bg-white px-4 py-3">
              <span className="text-sm font-black text-slate-900">CiN Cleaning</span>
              <span className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: primary }}>
                Book now
              </span>
            </div>
            <div className="space-y-3 p-4">
              <div className="rounded-xl bg-white p-4 shadow-sm">
                <p className="text-sm font-black text-slate-900">Deep clean</p>
                <p className="mt-0.5 text-xs text-slate-500">3 hours · 2 cleaners</p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-lg font-black" style={{ color: primary }}>
                    £120
                  </span>
                  <span className="rounded-lg px-3 py-1.5 text-xs font-bold text-white" style={{ background: primary }}>
                    Choose
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-600">
                Questions? <span className="font-bold underline" style={{ color: primary }}>Contact us</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------ Messages */

const friendlyName = (t: { description?: string | null; name: string }) =>
  t.description?.trim() ? t.description.split('.')[0] : t.name.replace(/_/g, ' ');

function MessagesSection(p: Props) {
  const { showFlyer } = useFlyer();
  const [tab, setTab] = useState<'templates' | 'sending'>('templates');
  const [kind, setKind] = useState<'email' | 'sms'>('email');
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list =
      kind === 'email'
        ? p.emailTemplates.map((t) => ({ id: t.id, title: friendlyName(t), key: t.name, preview: t.subject, active: t.active !== false, open: () => p.onEditEmailTemplate(t) }))
        : p.smsTemplates.map((t) => ({ id: t.id, title: friendlyName(t), key: t.name, preview: t.message, active: t.active !== false, open: () => p.onEditSmsTemplate(t) }));
    return list.filter((r) => !query || `${r.title} ${r.key} ${r.preview}`.toLowerCase().includes(query));
  }, [kind, q, p]);

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Email & SMS"
        description="The automatic messages customers and cleaners receive. Every email uses your logo and contact details from Company & contact."
        actions={
          tab === 'templates' ? (
            <button type="button" className={BTN_SECONDARY} onClick={p.onReloadTemplates} disabled={p.templatesReloading}>
              <RefreshCw className={`h-4 w-4 ${p.templatesReloading ? 'animate-spin' : ''}`} /> {p.templatesReloading ? 'Reloading…' : 'Reload'}
            </button>
          ) : null
        }
      />
      <Segmented
        ariaLabel="Email and SMS sections"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'templates', label: 'Templates', count: p.emailTemplates.length + p.smsTemplates.length },
          { id: 'sending', label: 'Sending (Brevo)' },
        ]}
      />

      {tab === 'sending' ? (
        <BrevoSettingsCard onStatus={(msg, k = 'info') => showFlyer(msg, k === 'info' ? 'success' : k)} />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Segmented
              ariaLabel="Template type"
              value={kind}
              onChange={setKind}
              items={[
                { id: 'email', label: 'Emails', count: p.emailTemplates.length },
                { id: 'sms', label: 'Texts', count: p.smsTemplates.length },
              ]}
            />
            <div className="relative sm:w-72">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input type="search" className={`${INPUT} pl-10`} placeholder="Search templates" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-slate-500">
              {q ? 'No templates match.' : 'No templates found. Try Reload.'}
            </p>
          ) : (
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {rows.map((r) => (
                <button key={`${kind}-${r.id}`} type="button" onClick={r.open} className="group flex w-full items-center gap-4 px-4 py-3.5 text-left transition hover:bg-slate-50 sm:px-5">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${kind === 'email' ? 'bg-blue-50 text-blue-600' : 'bg-emerald-50 text-emerald-600'}`}>
                    {kind === 'email' ? <MessageSquare className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900">{r.title}</span>
                      {!r.active ? <Pill tone={PILL.slate}>Off</Pill> : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{r.preview || <em>No text yet</em>}</span>
                    <span className="mt-0.5 block font-mono text-[10px] text-slate-400">{r.key}</span>
                  </span>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold text-blue-600 group-hover:bg-blue-50">
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </span>
                </button>
              ))}
            </Card>
          )}
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Send className="h-3.5 w-3.5" /> Texts only send when Brevo SMS is set up and the person has a mobile number on file.
          </p>
        </>
      )}
    </div>
  );
}
