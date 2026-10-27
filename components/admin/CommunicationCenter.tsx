import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Bell,
  Bold,
  CheckCircle2,
  Gift,
  Heading2,
  History,
  ImagePlus,
  Link2,
  Mail,
  Megaphone,
  Minus,
  Monitor,
  MousePointerClick,
  RefreshCw,
  Send,
  Smartphone,
  Sparkles,
  UserRound,
  Users,
  Wrench,
} from 'lucide-react';
import { apiAdmin, type BroadcastAppAudience, type BroadcastEmailAudience, type BroadcastRecord } from '../../services/api';
import { subscribeNnSync } from '../../services/realtime';
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Card,
  EmptyState,
  Field,
  HubLayout,
  INPUT,
  PILL,
  Pill,
  SectionHeader,
  Segmented,
  SidePanel,
  Switch,
} from './marketing/MarketingUi';

export type CommunicationSectionId = 'email' | 'app' | 'history';

type Status = { type: 'success' | 'error'; text: string } | null;

const EMAIL_AUDIENCES: Array<{ id: BroadcastEmailAudience; label: string; hint: string; icon: React.ReactNode }> = [
  { id: 'customers', label: 'All customers', hint: 'Service news and updates', icon: <Users className="h-4 w-4" /> },
  { id: 'marketing', label: 'Accept offers', hint: 'Customers who opted in to offers', icon: <Gift className="h-4 w-4" /> },
  { id: 'inactive', label: 'Inactive customers', hint: 'No booking in 30+ days', icon: <RefreshCw className="h-4 w-4" /> },
  { id: 'staff', label: 'Staff', hint: 'Your cleaning team', icon: <Wrench className="h-4 w-4" /> },
  { id: 'all', label: 'Everyone', hint: 'Customers and staff', icon: <Megaphone className="h-4 w-4" /> },
  { id: 'specific', label: 'Specific people', hint: 'Type email addresses', icon: <UserRound className="h-4 w-4" /> },
];

const APP_AUDIENCES: Array<{ id: BroadcastAppAudience; label: string; hint: string }> = [
  { id: 'all', label: 'Everyone', hint: 'Customers and staff' },
  { id: 'customers', label: 'Customers', hint: 'Customer accounts' },
  { id: 'staff', label: 'Staff', hint: 'Your cleaning team' },
];

const AUDIENCE_LABEL: Record<string, string> = {
  all: 'Everyone',
  customers: 'All customers',
  marketing: 'Customers who accept offers',
  inactive: 'Inactive customers',
  staff: 'Staff',
  specific: 'Specific people',
};

const STARTERS: Array<{ id: string; label: string; audience: BroadcastEmailAudience; subject: string; body: string }> = [
  {
    id: 'offer',
    label: 'Special offer',
    audience: 'marketing',
    subject: '{{first_name}}, 15% off your next clean',
    body: `<h2>A little treat from {{brand_name}}</h2>
<p>Hi {{first_name}},</p>
<p>Book any clean in the next 14 days and get <strong>15% off</strong> with the code below.</p>
<p style="font-size:22px;font-weight:800;letter-spacing:2px">CLEAN15</p>
<p><a href="https://www.cleanitneatly.com/book-cleaning" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">Book now</a></p>
<p>Thanks for choosing us,<br />The {{brand_name}} team</p>`,
  },
  {
    id: 'update',
    label: 'Service update',
    audience: 'customers',
    subject: 'An update from {{brand_name}}',
    body: `Hi {{first_name}},

We wanted to let you know about a change to our service.

[Write your update here]

If you have any questions, just reply to this email.

The {{brand_name}} team`,
  },
  {
    id: 'missyou',
    label: 'We miss you',
    audience: 'inactive',
    subject: 'It has been a while, {{first_name}}',
    body: `<p>Hi {{first_name}},</p>
<p>It has been a while since your last clean with us. Your home deserves a refresh, and we would love to help.</p>
<p><a href="https://www.cleanitneatly.com/book-cleaning" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">Book your next clean</a></p>
<p>See you soon,<br />The {{brand_name}} team</p>`,
  },
  {
    id: 'team',
    label: 'Team announcement',
    audience: 'staff',
    subject: 'Team update from the office',
    body: `Hi {{first_name}},

[Write your news for the team here]

Thanks for all your hard work,
The office`,
  },
];

const DRAFT_KEY = 'cin_comm_email_draft';
const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const parseEmails = (raw: string) => [...new Set(raw.split(/[,;\s]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))];

function readDraft(): { subject: string; body: string; audience: BroadcastEmailAudience; emails: string } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function fmtWhen(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  const ok = status.type === 'success';
  return (
    <div className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm font-medium ${ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`} role="status">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{status.text}</span>
    </div>
  );
}

/** Centered "are you sure" step before anything goes out to many people. */
function ConfirmSend({
  open,
  title,
  lines,
  confirmLabel,
  busy,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  lines: React.ReactNode[];
  confirmLabel: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open || typeof document === 'undefined') return null;
  // Portal to <body> so animated (transformed) parents do not offset the fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[220] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={busy ? undefined : onCancel} />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in-95">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Send className="h-5 w-5" />
        </div>
        <h4 className="mt-4 text-lg font-black text-slate-900">{title}</h4>
        <ul className="mt-2 space-y-1 text-sm text-slate-600">
          {lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">This cannot be undone once sent.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className={BTN_SECONDARY} onClick={onCancel} disabled={busy}>
            Back
          </button>
          <button type="button" className={BTN_PRIMARY} onClick={onConfirm} disabled={busy}>
            {busy ? 'Sending…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function CommunicationCenter({
  adminEmail,
  onOpenTemplates,
}: {
  /** Pre-fills "send a test to". */
  adminEmail?: string;
  /** Opens Settings > automatic message templates. */
  onOpenTemplates?: () => void;
}) {
  const [section, setSection] = useState<CommunicationSectionId>('email');
  const [counts, setCounts] = useState<{ email: Record<string, number>; app: Record<string, number> } | null>(null);
  const [history, setHistory] = useState<BroadcastRecord[] | null>(null);

  // Email composer
  const draft = useMemo(readDraft, []);
  const [audience, setAudience] = useState<BroadcastEmailAudience>(draft?.audience || 'customers');
  const [emails, setEmails] = useState(draft?.emails || '');
  const [subject, setSubject] = useState(draft?.subject || '');
  const [body, setBody] = useState(draft?.body || '');
  const [testTo, setTestTo] = useState(adminEmail || '');
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewWidth, setPreviewWidth] = useState<'desktop' | 'mobile'>('desktop');
  const [emailStatus, setEmailStatus] = useState<Status>(null);
  const [sending, setSending] = useState(false);
  const [testing, setTesting] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | 'email' | 'app'>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // App composer
  const [appAudience, setAppAudience] = useState<BroadcastAppAudience>('all');
  const [appTitle, setAppTitle] = useState('');
  const [appMessage, setAppMessage] = useState('');
  const [appPush, setAppPush] = useState(true);
  const [appStatus, setAppStatus] = useState<Status>(null);

  // History
  const [historyFilter, setHistoryFilter] = useState<'all' | 'email' | 'app'>('all');
  const [openRecord, setOpenRecord] = useState<BroadcastRecord | null>(null);
  const [recordHtml, setRecordHtml] = useState('');

  const loadCounts = useCallback(() => {
    apiAdmin.getBroadcastAudiences().then(setCounts).catch(() => setCounts(null));
  }, []);
  const loadHistory = useCallback(() => {
    apiAdmin.getBroadcasts().then(setHistory).catch(() => setHistory([]));
  }, []);

  useEffect(() => {
    loadCounts();
    loadHistory();
    return subscribeNnSync((scope) => {
      if (scope === 'all') loadHistory();
    });
  }, [loadCounts, loadHistory]);

  useEffect(() => {
    if (!testTo && adminEmail) setTestTo(adminEmail);
  }, [adminEmail, testTo]);

  // Keep a draft on this device so a half-written email is not lost.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (subject || body) localStorage.setItem(DRAFT_KEY, JSON.stringify({ subject, body, audience, emails }));
        else localStorage.removeItem(DRAFT_KEY);
      } catch {
        /* storage unavailable */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [subject, body, audience, emails]);

  // Live branded preview, built by the server with the real email layout.
  useEffect(() => {
    if (section !== 'email') return;
    let cancelled = false;
    const t = setTimeout(() => {
      apiAdmin
        .previewBroadcastEmail({ subject, body })
        .then((p) => !cancelled && setPreview(p))
        .catch(() => undefined);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [subject, body, section]);

  const specificList = useMemo(() => parseEmails(emails), [emails]);
  const invalidEmails = specificList.filter((e) => !isEmail(e));
  const reach = audience === 'specific' ? specificList.length - invalidEmails.length : counts?.email?.[audience] ?? null;
  const appReach = counts?.app?.[appAudience] ?? null;

  const insertAtCursor = (before: string, after = '', placeholder = '') => {
    const ta = bodyRef.current;
    if (!ta) {
      setBody((b) => b + before + placeholder + after);
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = body.slice(start, end) || placeholder;
    const next = body.slice(0, start) + before + selected + after + body.slice(end);
    setBody(next);
    queueMicrotask(() => {
      ta.focus();
      const pos = start + before.length;
      ta.setSelectionRange(pos, pos + selected.length);
    });
  };

  const addLink = () => {
    const url = window.prompt('Link address (https://…)', 'https://www.cleanitneatly.com');
    if (!url) return;
    insertAtCursor(`<a href="${url.replace(/"/g, '&quot;')}">`, '</a>', 'link text');
  };
  const addButton = () => {
    const url = window.prompt('Where should the button go?', 'https://www.cleanitneatly.com/book-cleaning');
    if (!url) return;
    insertAtCursor(
      `<p><a href="${url.replace(/"/g, '&quot;')}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:700">`,
      '</a></p>',
      'Book now',
    );
  };

  const onImageSelected: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.heic') || lower.endsWith('.heif') || /heic|heif/i.test(file.type)) {
      setEmailStatus({ type: 'error', text: 'HEIC photos do not work in email. Save it as JPEG or PNG and try again.' });
      return;
    }
    if (file.type && !/^image\/(png|jpeg|jpg|gif|webp)$/i.test(file.type)) {
      setEmailStatus({ type: 'error', text: 'Choose a PNG, JPEG, GIF or WebP image.' });
      return;
    }
    setImageBusy(true);
    setEmailStatus(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
      });
      const { url } = await apiAdmin.uploadBroadcastEmailImage(dataUrl);
      const alt = file.name.replace(/\.[a-z0-9]+$/i, '').replace(/[&"<]/g, '');
      insertAtCursor(`<p><img src="${url}" alt="${alt}" style="max-width:100%;height:auto;display:block;margin:12px 0;border-radius:8px" /></p>`);
    } catch (err) {
      setEmailStatus({ type: 'error', text: err instanceof Error ? err.message : 'Image upload failed.' });
    } finally {
      setImageBusy(false);
    }
  };

  const validateEmail = (): string | null => {
    if (!subject.trim()) return 'Add a subject line.';
    if (!body.trim()) return 'Write your message.';
    if (audience === 'specific') {
      if (!specificList.length) return 'Add at least one email address.';
      if (invalidEmails.length) return `Check these addresses: ${invalidEmails.slice(0, 3).join(', ')}`;
    }
    if (reach === 0) return 'Nobody is in this audience yet.';
    return null;
  };

  const sendTest = async () => {
    const problem = !subject.trim() ? 'Add a subject line.' : !body.trim() ? 'Write your message.' : !isEmail(testTo.trim()) ? 'Enter an email address for the test.' : null;
    if (problem) return setEmailStatus({ type: 'error', text: problem });
    setTesting(true);
    setEmailStatus(null);
    try {
      await apiAdmin.sendBulkEmail({ subject, body, audience: 'specific', specificEmails: [testTo.trim()], test: true });
      setEmailStatus({ type: 'success', text: `Test sent to ${testTo.trim()}. Check the inbox (and spam) to see it for real.` });
    } catch (e) {
      setEmailStatus({ type: 'error', text: e instanceof Error ? e.message : 'Test failed to send.' });
    } finally {
      setTesting(false);
    }
  };

  const sendEmailNow = async () => {
    setSending(true);
    try {
      const r = await apiAdmin.sendBulkEmail({ subject, body, audience, specificEmails: audience === 'specific' ? specificList : undefined });
      setConfirm(null);
      setEmailStatus({
        type: r.failed ? 'error' : 'success',
        text: r.failed ? `Sent to ${r.sent} of ${r.total}. ${r.failed} could not be delivered.` : `Sent to ${r.sent} ${r.sent === 1 ? 'person' : 'people'}.`,
      });
      setSubject('');
      setBody('');
      setEmails('');
      loadHistory();
    } catch (e) {
      setConfirm(null);
      setEmailStatus({ type: 'error', text: e instanceof Error ? e.message : 'Failed to send.' });
    } finally {
      setSending(false);
    }
  };

  const sendAppNow = async () => {
    setSending(true);
    try {
      const r = await apiAdmin.sendBulkNotification({ message: appMessage.trim(), title: appTitle.trim() || undefined, audience: appAudience, push: appPush });
      setConfirm(null);
      setAppStatus({ type: 'success', text: `Sent to ${r.sent} ${r.sent === 1 ? 'account' : 'accounts'}${appPush ? ', with a phone alert for anyone using the app' : ''}.` });
      setAppTitle('');
      setAppMessage('');
      loadHistory();
    } catch (e) {
      setConfirm(null);
      setAppStatus({ type: 'error', text: e instanceof Error ? e.message : 'Failed to send.' });
    } finally {
      setSending(false);
    }
  };

  const reuse = (r: BroadcastRecord) => {
    setOpenRecord(null);
    if (r.channel === 'email') {
      setSubject(r.subject || '');
      setBody(r.body);
      if (r.audience in AUDIENCE_LABEL) setAudience(r.audience as BroadcastEmailAudience);
      setSection('email');
    } else {
      setAppTitle(r.subject || '');
      setAppMessage(r.body);
      if (APP_AUDIENCES.some((a) => a.id === r.audience)) setAppAudience(r.audience as BroadcastAppAudience);
      setAppPush(r.channel === 'push');
      setSection('app');
    }
  };

  useEffect(() => {
    if (!openRecord || openRecord.channel !== 'email') return setRecordHtml('');
    apiAdmin
      .previewBroadcastEmail({ subject: openRecord.subject || '', body: openRecord.body })
      .then((p) => setRecordHtml(p.html))
      .catch(() => setRecordHtml(''));
  }, [openRecord]);

  const emailCount = history?.filter((h) => h.channel === 'email').length ?? 0;
  const filteredHistory = (history || []).filter((h) => historyFilter === 'all' || (historyFilter === 'email' ? h.channel === 'email' : h.channel !== 'email'));

  return (
    <HubLayout
      title="Communication"
      subtitle="Send emails and app messages to your customers and team, and see everything you have sent."
      navLabel="Communication sections"
      active={section}
      onChange={setSection}
      groups={[
        {
          group: 'Send',
          items: [
            { id: 'email', label: 'Email', hint: 'Branded email to a group', icon: <Mail className="h-4 w-4" />, dot: Boolean(subject || body) && section !== 'email' },
            { id: 'app', label: 'App message', hint: 'Bell alert and phone push', icon: <Bell className="h-4 w-4" /> },
          ],
        },
        {
          group: 'Track',
          items: [{ id: 'history', label: 'Sent', hint: 'Everything sent from here', icon: <History className="h-4 w-4" />, badge: history?.length || undefined }],
        },
      ]}
    >
      {section === 'email' && (
        <>
          <SectionHeader
            title="Email a group"
            description="Your message is wrapped in your branded email layout, with each person's name filled in."
            actions={
              onOpenTemplates ? (
                <button type="button" className={BTN_SECONDARY} onClick={onOpenTemplates}>
                  <Sparkles className="h-4 w-4" /> Automatic emails
                </button>
              ) : null
            }
          />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Start from:</span>
            {STARTERS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if ((subject || body) && !window.confirm('Replace what you have written with this starter?')) return;
                  setSubject(s.subject);
                  setBody(s.body);
                  setAudience(s.audience);
                  setEmailStatus(null);
                }}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-5">
              <Card className="p-5">
                <p className="text-xs font-bold text-slate-700">Who gets it</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {EMAIL_AUDIENCES.map((a) => {
                    const on = audience === a.id;
                    const n = a.id === 'specific' ? null : counts?.email?.[a.id];
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAudience(a.id)}
                        aria-pressed={on}
                        className={`flex items-start gap-3 rounded-xl border p-3 text-left transition ${
                          on ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${on ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{a.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm font-bold text-slate-900">{a.label}</span>
                            {n != null ? <span className="text-xs font-black tabular-nums text-slate-500">{n}</span> : null}
                          </span>
                          <span className="block text-[11px] text-slate-500">{a.hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                {audience === 'specific' ? (
                  <div className="mt-4">
                    <Field label="Email addresses" hint="Separate with commas, spaces or new lines.">
                      <textarea className={`${INPUT} min-h-[72px]`} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="jane@example.com, john@example.com" />
                    </Field>
                    {invalidEmails.length ? <p className="mt-1 text-xs font-bold text-red-600">Not valid: {invalidEmails.slice(0, 4).join(', ')}</p> : null}
                  </div>
                ) : null}
                {audience === 'customers' || audience === 'all' ? (
                  <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
                    Sending an offer or promotion? Choose <strong>Accept offers</strong> so only customers who said yes to marketing get it.
                  </p>
                ) : null}
              </Card>

              <Card className="space-y-4 p-5">
                <Field label="Subject" counter={{ value: subject.length, max: 70 }} hint="Short and specific works best. {{first_name}} adds their name.">
                  <input className={INPUT} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Your spring clean, 15% off" />
                </Field>

                <div>
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700">Message</span>
                    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
                      {[
                        { label: 'Bold', icon: <Bold className="h-4 w-4" />, run: () => insertAtCursor('<strong>', '</strong>', 'bold text') },
                        { label: 'Heading', icon: <Heading2 className="h-4 w-4" />, run: () => insertAtCursor('<h2>', '</h2>', 'Heading') },
                        { label: 'Link', icon: <Link2 className="h-4 w-4" />, run: addLink },
                        { label: 'Button', icon: <MousePointerClick className="h-4 w-4" />, run: addButton },
                        { label: 'Divider', icon: <Minus className="h-4 w-4" />, run: () => insertAtCursor('\n<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0" />\n') },
                        { label: imageBusy ? 'Uploading…' : 'Image', icon: <ImagePlus className="h-4 w-4" />, run: () => imageInputRef.current?.click() },
                      ].map((b) => (
                        <button
                          key={b.label}
                          type="button"
                          title={b.label}
                          aria-label={b.label}
                          disabled={imageBusy && b.label.startsWith('Upload')}
                          onClick={b.run}
                          className="rounded-lg p-1.5 text-slate-600 hover:bg-white hover:text-slate-900 disabled:opacity-50"
                        >
                          {b.icon}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => insertAtCursor('{{first_name}}')}
                        className="rounded-lg px-2 py-1 text-[11px] font-bold text-blue-700 hover:bg-white"
                      >
                        + Name
                      </button>
                    </div>
                  </div>
                  <input ref={imageInputRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={onImageSelected} />
                  <textarea
                    ref={bodyRef}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={12}
                    placeholder={'Hi {{first_name}},\n\nJust type your message. Blank lines start a new paragraph.\nHTML works too if you prefer.'}
                    className={`${INPUT} font-mono text-[13px] leading-relaxed`}
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Plain text is fine. Use the buttons above for headings, links, a booking button or a photo.</p>
                </div>

                <StatusLine status={emailStatus} />

                <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-end">
                  <div className="flex-1">
                    <Field label="Send a test to">
                      <input className={INPUT} type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
                    </Field>
                  </div>
                  <button type="button" className={BTN_SECONDARY} disabled={testing} onClick={() => void sendTest()}>
                    {testing ? 'Sending test…' : 'Send test'}
                  </button>
                  <button
                    type="button"
                    className={BTN_PRIMARY}
                    onClick={() => {
                      const problem = validateEmail();
                      if (problem) return setEmailStatus({ type: 'error', text: problem });
                      setEmailStatus(null);
                      setConfirm('email');
                    }}
                  >
                    <Send className="h-4 w-4" /> Send{reach != null ? ` to ${reach}` : ''}
                  </button>
                </div>
              </Card>
            </div>

            {/* Preview */}
            <Card className="flex min-h-[560px] flex-col overflow-hidden 2xl:sticky 2xl:top-4 2xl:self-start">
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <p className="text-xs font-black uppercase tracking-wider text-slate-500">Preview</p>
                <div className="flex gap-1 rounded-lg bg-slate-100 p-0.5">
                  {(['desktop', 'mobile'] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setPreviewWidth(w)}
                      aria-label={w === 'desktop' ? 'Desktop preview' : 'Phone preview'}
                      className={`rounded-md p-1.5 ${previewWidth === w ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                    >
                      {w === 'desktop' ? <Monitor className="h-4 w-4" /> : <Smartphone className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <p className="truncate text-sm font-black text-slate-900">{preview?.subject || subject || 'Your subject line'}</p>
                <p className="text-[11px] text-slate-500">
                  To: {audience === 'specific' ? `${specificList.length || 0} address${specificList.length === 1 ? '' : 'es'}` : AUDIENCE_LABEL[audience]} · names shown as "Sarah Jones"
                </p>
              </div>
              <div className="flex flex-1 justify-center bg-slate-100 p-3">
                <iframe
                  title="Email preview"
                  sandbox=""
                  srcDoc={preview?.html || '<p style="font-family:sans-serif;color:#94a3b8;padding:24px">Loading preview…</p>'}
                  className={`h-[640px] rounded-lg border border-slate-200 bg-white transition-all ${previewWidth === 'mobile' ? 'w-[375px]' : 'w-full'}`}
                />
              </div>
            </Card>
          </div>
        </>
      )}

      {section === 'app' && (
        <>
          <SectionHeader
            title="App message"
            description="Shows in the notification bell on the website and apps. With phone alerts on, people with the app also get a push notification."
          />
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
            <Card className="space-y-5 p-5">
              <div>
                <p className="text-xs font-bold text-slate-700">Who gets it</p>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {APP_AUDIENCES.map((a) => {
                    const on = appAudience === a.id;
                    return (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setAppAudience(a.id)}
                        aria-pressed={on}
                        className={`rounded-xl border p-3 text-left transition ${on ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="text-sm font-bold text-slate-900">{a.label}</span>
                          {counts?.app?.[a.id] != null ? <span className="text-xs font-black tabular-nums text-slate-500">{counts.app[a.id]}</span> : null}
                        </span>
                        <span className="block text-[11px] text-slate-500">{a.hint}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <Field label="Title (optional)" counter={{ value: appTitle.length, max: 50 }}>
                <input className={INPUT} value={appTitle} maxLength={60} onChange={(e) => setAppTitle(e.target.value)} placeholder="e.g. Bank holiday hours" />
              </Field>
              <Field label="Message" counter={{ value: appMessage.length, max: 240 }} hint="Phones show about two lines, so put the important part first.">
                <textarea className={`${INPUT} min-h-[110px]`} maxLength={500} value={appMessage} onChange={(e) => setAppMessage(e.target.value)} placeholder="e.g. We are closed on Monday 25 August. Bookings for Tuesday are running as normal." />
              </Field>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div>
                  <p className="text-sm font-bold text-slate-900">Phone alert</p>
                  <p className="text-[11px] text-slate-500">Also send a push notification to people using the app.</p>
                </div>
                <Switch checked={appPush} onChange={setAppPush} label="Phone alert" />
              </div>
              <StatusLine status={appStatus} />
              <div className="flex justify-end border-t border-slate-100 pt-4">
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  onClick={() => {
                    if (!appMessage.trim()) return setAppStatus({ type: 'error', text: 'Write your message first.' });
                    if (appReach === 0) return setAppStatus({ type: 'error', text: 'Nobody is in this audience yet.' });
                    setAppStatus(null);
                    setConfirm('app');
                  }}
                >
                  <Send className="h-4 w-4" /> Send{appReach != null ? ` to ${appReach}` : ''}
                </button>
              </div>
            </Card>

            {/* Phone preview */}
            <div className="mx-auto w-full max-w-[340px]">
              <div className="rounded-[2.5rem] border-[10px] border-slate-900 bg-gradient-to-b from-sky-700 via-indigo-700 to-slate-900 p-4 shadow-xl">
                <p className="mt-6 text-center text-5xl font-light tabular-nums text-white">09:41</p>
                <p className="text-center text-xs font-medium text-white/70">
                  {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                <div className="mt-8 space-y-2 pb-24">
                  {appPush ? (
                    <div className="rounded-2xl bg-white/85 p-3 shadow-lg backdrop-blur">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-teal-600 text-[9px] font-black text-white">C</span>
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">CiN Cleaning</span>
                        <span className="ml-auto text-[10px] text-slate-400">now</span>
                      </div>
                      <p className="mt-1.5 text-[13px] font-bold text-slate-900">{appTitle || 'CiN Cleaning'}</p>
                      <p className="line-clamp-3 text-[13px] text-slate-700">{appMessage || 'Your message appears here.'}</p>
                    </div>
                  ) : (
                    <p className="rounded-2xl bg-white/10 p-3 text-center text-xs text-white/80">Phone alert off. The message only appears in the bell.</p>
                  )}
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">In the bell</p>
                <div className="mt-2 flex gap-2.5">
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                  <p className="text-sm text-slate-700">{appTitle ? <strong>{appTitle}: </strong> : null}{appMessage || 'Your message appears here.'}</p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {section === 'history' && (
        <>
          <SectionHeader
            title="Sent messages"
            description="Every email and app message sent from Communication. Open one to read it or send it again."
            actions={
              <button type="button" className={BTN_SECONDARY} onClick={loadHistory}>
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
            }
          />
          <Segmented<'all' | 'email' | 'app'>
            ariaLabel="Filter sent messages"
            value={historyFilter}
            onChange={setHistoryFilter}
            items={[
              { id: 'all', label: 'All', count: history?.length ?? 0 },
              { id: 'email', label: 'Emails', count: emailCount },
              { id: 'app', label: 'App messages', count: (history?.length ?? 0) - emailCount },
            ]}
          />
          {history === null ? (
            <div className="flex justify-center py-16">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" />
            </div>
          ) : filteredHistory.length === 0 ? (
            <EmptyState icon={<History className="h-6 w-6" />} title="Nothing sent yet" text="Emails and app messages you send from here are listed with who received them." />
          ) : (
            <Card className="divide-y divide-slate-100 overflow-hidden">
              {filteredHistory.map((r) => (
                <button key={r.id} type="button" onClick={() => setOpenRecord(r)} className="flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-slate-50 sm:px-5">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${r.channel === 'email' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}
                  >
                    {r.channel === 'email' ? <Mail className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black text-slate-900">{r.subject || r.body.slice(0, 80)}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {AUDIENCE_LABEL[r.audience] || r.audience} · {fmtWhen(r.createdAt)}
                      {r.createdBy ? ` · by ${r.createdBy}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Pill tone={PILL.green}>{r.sent} sent</Pill>
                    {r.failed ? <Pill tone={PILL.red}>{r.failed} failed</Pill> : r.channel === 'push' ? <Pill tone={PILL.purple}>+ phone alert</Pill> : null}
                  </span>
                </button>
              ))}
            </Card>
          )}
        </>
      )}

      <SidePanel
        open={!!openRecord}
        wide={openRecord?.channel === 'email'}
        title={openRecord?.subject || (openRecord?.channel === 'email' ? 'Email' : 'App message')}
        subtitle={openRecord ? `${AUDIENCE_LABEL[openRecord.audience] || openRecord.audience} · ${fmtWhen(openRecord.createdAt)}` : undefined}
        onClose={() => setOpenRecord(null)}
        footer={
          openRecord ? (
            <>
              <button type="button" className={BTN_SECONDARY} onClick={() => setOpenRecord(null)}>
                Close
              </button>
              <button type="button" className={BTN_PRIMARY} onClick={() => reuse(openRecord)}>
                Use again
              </button>
            </>
          ) : null
        }
      >
        {openRecord ? (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Recipients', openRecord.recipients],
                ['Sent', openRecord.sent],
                ['Failed', openRecord.failed],
              ].map(([k, v]) => (
                <div key={String(k)} className="rounded-xl bg-white p-3 text-center ring-1 ring-inset ring-slate-200">
                  <p className="text-xl font-black tabular-nums text-slate-900">{v}</p>
                  <p className="text-[11px] font-bold text-slate-500">{k}</p>
                </div>
              ))}
            </div>
            {openRecord.channel === 'email' ? (
              <iframe title="Sent email" sandbox="" srcDoc={recordHtml || '<p style="font-family:sans-serif;color:#94a3b8;padding:24px">Loading…</p>'} className="h-[560px] w-full rounded-xl border border-slate-200 bg-white" />
            ) : (
              <div className="rounded-xl bg-white p-4 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 whitespace-pre-line">{openRecord.body}</div>
            )}
          </>
        ) : null}
      </SidePanel>

      <ConfirmSend
        open={confirm === 'email'}
        title={`Send this email to ${reach ?? 0} ${reach === 1 ? 'person' : 'people'}?`}
        lines={[
          <>
            <strong>Subject:</strong> {subject}
          </>,
          <>
            <strong>To:</strong> {audience === 'specific' ? specificList.filter(isEmail).slice(0, 3).join(', ') + (specificList.length > 3 ? ` and ${specificList.length - 3} more` : '') : AUDIENCE_LABEL[audience]}
          </>,
        ]}
        confirmLabel="Send email"
        busy={sending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void sendEmailNow()}
      />
      <ConfirmSend
        open={confirm === 'app'}
        title={`Send this message to ${appReach ?? 0} ${appReach === 1 ? 'account' : 'accounts'}?`}
        lines={[
          <>
            <strong>To:</strong> {APP_AUDIENCES.find((a) => a.id === appAudience)?.label}
          </>,
          <>{appPush ? 'Shows in the bell and as a phone alert.' : 'Shows in the bell only.'}</>,
        ]}
        confirmLabel="Send message"
        busy={sending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void sendAppNow()}
      />
    </HubLayout>
  );
}
