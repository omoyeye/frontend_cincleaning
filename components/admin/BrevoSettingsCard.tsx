import React, { useEffect, useState } from 'react';
import { KeyRound, Mail, Phone, Save, Send, ShieldCheck, Trash2, Eye, EyeOff, Loader2, Server } from 'lucide-react';
import { apiAdmin, type BrevoSettingsPublic, type BrevoSettingsPatch } from '../../services/api';

interface Props {
    onStatus: (msg: string, kind?: 'success' | 'error' | 'info') => void;
}

const emptySettings: BrevoSettingsPublic = {
    apiKey: '',
    senderEmail: '',
    senderName: '',
    smsSender: '',
    smtpHost: '',
    smtpPort: '',
    smtpUser: '',
    smtpPassword: '',
    apiKeyMasked: '',
    smtpPasswordMasked: '',
    hasApiKey: false,
    hasSmtpPassword: false,
};

export default function BrevoSettingsCard({ onStatus }: Props) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [clearing, setClearing] = useState(false);
    const [showKey, setShowKey] = useState(false);
    const [showSmtpPass, setShowSmtpPass] = useState(false);
    const [settings, setSettings] = useState<BrevoSettingsPublic>(emptySettings);
    const [form, setForm] = useState<BrevoSettingsPatch & { apiKey: string; smtpPassword: string }>({
        apiKey: '',
        senderEmail: '',
        senderName: '',
        smsSender: '',
        smtpHost: '',
        smtpPort: '',
        smtpUser: '',
        smtpPassword: '',
    });
    const [testEmail, setTestEmail] = useState('');

    const hydrateFrom = (data: BrevoSettingsPublic) => {
        setSettings(data);
        setForm({
            apiKey: '',
            smtpPassword: '',
            senderEmail: data.senderEmail || '',
            senderName: data.senderName || '',
            smsSender: data.smsSender || '',
            smtpHost: data.smtpHost || '',
            smtpPort: data.smtpPort || '',
            smtpUser: data.smtpUser || '',
        });
    };

    const load = async () => {
        setLoading(true);
        try {
            const data = await apiAdmin.getBrevoSettings();
            hydrateFrom(data);
        } catch (err: any) {
            onStatus(err?.message || 'Failed to load Brevo settings', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            const patch: BrevoSettingsPatch = {
                senderEmail: form.senderEmail?.trim() ?? '',
                senderName: form.senderName?.trim() ?? '',
                smsSender: form.smsSender?.trim() ?? '',
                smtpHost: form.smtpHost?.trim() ?? '',
                smtpPort: form.smtpPort?.trim() ?? '',
                smtpUser: form.smtpUser?.trim() ?? '',
            };
            if (form.apiKey && form.apiKey.trim()) patch.apiKey = form.apiKey.trim();
            if (form.smtpPassword && form.smtpPassword.trim()) patch.smtpPassword = form.smtpPassword.trim();
            const updated = await apiAdmin.updateBrevoSettings(patch);
            hydrateFrom(updated);
            onStatus('Brevo settings saved', 'success');
        } catch (err: any) {
            onStatus(err?.message || 'Failed to save Brevo settings', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        try {
            const { to } = await apiAdmin.sendBrevoTestEmail(testEmail.trim() || undefined);
            onStatus(`Test email sent to ${to}. Check the inbox within a minute.`, 'success');
        } catch (err: any) {
            onStatus(err?.message || 'Brevo test email failed', 'error');
        } finally {
            setTesting(false);
        }
    };

    const handleDisconnect = async () => {
        if (!confirm('Disconnect Brevo? The stored API key and SMTP password will be removed.')) return;
        setClearing(true);
        try {
            const updated = await apiAdmin.clearBrevoSettings();
            hydrateFrom(updated);
            onStatus('Brevo disconnected. Emails & SMS will stop sending until a new key is saved.', 'info');
        } catch (err: any) {
            onStatus(err?.message || 'Failed to disconnect Brevo', 'error');
        } finally {
            setClearing(false);
        }
    };

    const status = settings.hasApiKey
        ? { label: 'Connected', dot: 'bg-green-500', text: 'text-green-600' }
        : { label: 'Not connected', dot: 'bg-amber-500', text: 'text-amber-600' };

    return (
        <div className="bg-white p-5 sm:p-8 rounded-[2.5rem] border border-slate-100/50 shadow-sm">
            <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                        <h4 className="text-xl font-black text-slate-900 leading-tight">Brevo credentials</h4>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Transactional email &amp; SMS sender</p>
                    </div>
                </div>
                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-50 ${status.text}`}>
                    <span className={`w-2 h-2 rounded-full ${status.dot}`} />
                    {status.label}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-3 text-sm text-slate-500 font-bold">
                    <Loader2 className="w-4 h-4 animate-spin" /> Loading settings…
                </div>
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field
                            label="Brevo API key"
                            hint={settings.hasApiKey ? `Stored: ${settings.apiKeyMasked}. Enter a new key to replace.` : 'Create one at Brevo → SMTP & API → API keys.'}
                            icon={<KeyRound className="w-4 h-4" />}
                        >
                            <div className="relative">
                                <input
                                    type={showKey ? 'text' : 'password'}
                                    value={form.apiKey || ''}
                                    onChange={(e) => setForm((p) => ({ ...p, apiKey: e.target.value }))}
                                    placeholder={settings.hasApiKey ? '•••• leave blank to keep current' : 'xkeysib-...'}
                                    autoComplete="off"
                                    spellCheck={false}
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowKey((v) => !v)}
                                    aria-label={showKey ? 'Hide key' : 'Show key'}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700"
                                >
                                    {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </Field>
                        <Field label="Sender name" hint="Shown as the From name in every email." icon={<Mail className="w-4 h-4" />}>
                            <input
                                type="text"
                                value={form.senderName || ''}
                                onChange={(e) => setForm((p) => ({ ...p, senderName: e.target.value }))}
                                placeholder="CiN Cleaning"
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </Field>
                        <Field label="Sender email" hint="Must be verified in Brevo or emails will bounce." icon={<Mail className="w-4 h-4" />}>
                            <input
                                type="email"
                                value={form.senderEmail || ''}
                                onChange={(e) => setForm((p) => ({ ...p, senderEmail: e.target.value }))}
                                placeholder="no-reply@yourdomain.com"
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </Field>
                        <Field label="SMS sender ID" hint="Alphanumeric, max 11 chars. Used for transactional SMS." icon={<Phone className="w-4 h-4" />}>
                            <input
                                type="text"
                                value={form.smsSender || ''}
                                onChange={(e) => setForm((p) => ({ ...p, smsSender: e.target.value.slice(0, 11) }))}
                                placeholder="CiNClean"
                                maxLength={11}
                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </Field>
                    </div>

                    <details className="rounded-2xl border border-slate-100 bg-slate-50/60 px-4 py-3 text-sm">
                        <summary className="cursor-pointer font-black text-slate-700 uppercase tracking-widest text-[11px] flex items-center gap-2">
                            <Server className="w-4 h-4" /> Advanced: SMTP relay (optional)
                        </summary>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                            <Field label="SMTP host" hint="Defaults to smtp-relay.brevo.com.">
                                <input
                                    type="text"
                                    value={form.smtpHost || ''}
                                    onChange={(e) => setForm((p) => ({ ...p, smtpHost: e.target.value }))}
                                    placeholder="smtp-relay.brevo.com"
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </Field>
                            <Field label="SMTP port" hint="Typical values: 587 (STARTTLS) or 465 (TLS).">
                                <input
                                    type="text"
                                    value={form.smtpPort || ''}
                                    onChange={(e) => setForm((p) => ({ ...p, smtpPort: e.target.value }))}
                                    placeholder="587"
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </Field>
                            <Field label="SMTP username" hint="Usually the Brevo account email.">
                                <input
                                    type="text"
                                    value={form.smtpUser || ''}
                                    onChange={(e) => setForm((p) => ({ ...p, smtpUser: e.target.value }))}
                                    placeholder="you@example.com"
                                    className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </Field>
                            <Field
                                label="SMTP password"
                                hint={settings.hasSmtpPassword ? `Stored: ${settings.smtpPasswordMasked}. Leave blank to keep.` : 'The master password from Brevo → SMTP & API.'}
                            >
                                <div className="relative">
                                    <input
                                        type={showSmtpPass ? 'text' : 'password'}
                                        value={form.smtpPassword || ''}
                                        onChange={(e) => setForm((p) => ({ ...p, smtpPassword: e.target.value }))}
                                        placeholder={settings.hasSmtpPassword ? '•••• leave blank to keep current' : ''}
                                        autoComplete="off"
                                        spellCheck={false}
                                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowSmtpPass((v) => !v)}
                                        aria-label={showSmtpPass ? 'Hide password' : 'Show password'}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700"
                                    >
                                        {showSmtpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                    </button>
                                </div>
                            </Field>
                        </div>
                        <p className="text-[11px] font-bold text-slate-400 mt-3">
                            Note: the app uses the Brevo API (not SMTP) to send today. SMTP values are saved for future/manual use.
                        </p>
                    </details>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={saving}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            {saving ? 'Saving…' : 'Save credentials'}
                        </button>

                        <div className="flex items-center gap-2">
                            <input
                                type="email"
                                value={testEmail}
                                onChange={(e) => setTestEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-52"
                            />
                            <button
                                type="button"
                                onClick={handleTest}
                                disabled={testing || !settings.hasApiKey}
                                title={settings.hasApiKey ? 'Send a test email' : 'Save an API key first'}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                Test
                            </button>
                        </div>

                        {settings.hasApiKey && (
                            <button
                                type="button"
                                onClick={handleDisconnect}
                                disabled={clearing}
                                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-red-600 hover:bg-red-50 disabled:opacity-60 transition-colors ml-auto"
                            >
                                {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                                Disconnect
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

interface FieldProps {
    label: string;
    hint?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
}

function Field({ label, hint, icon, children }: FieldProps) {
    return (
        <label className="block">
            <span className="text-[11px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5 mb-1.5">
                {icon}
                {label}
            </span>
            {children}
            {hint ? <span className="block text-[11px] text-slate-400 font-semibold mt-1.5">{hint}</span> : null}
        </label>
    );
}
