import React, { useEffect, useState } from 'react';
import { X, Mail, CheckCircle2, Eye, Smartphone, Monitor, Loader2 } from 'lucide-react';
import type { EmailTemplate } from '../../types';
import { apiAdmin } from '../../services/api';

interface EmailTemplateFlyoutProps {
  template: EmailTemplate;
  onClose: () => void;
  onSave: (id: number, updates: Partial<Pick<EmailTemplate, 'subject' | 'body'>>) => Promise<void>;
}

const EmailTemplateFlyout: React.FC<EmailTemplateFlyoutProps> = ({ template, onClose, onSave }) => {
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; html: string } | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [previewWidth, setPreviewWidth] = useState<'phone' | 'desktop'>('desktop');

  // The finished email as clients receive it: branded layout, logo, contact footer and sample values.
  useEffect(() => {
    if (!showPreview) return;
    let alive = true;
    setPreview(null);
    setPreviewError('');
    apiAdmin
      .previewEmailTemplate({ name: template.name, subject, body })
      .then((p) => alive && setPreview(p))
      .catch((e) => alive && setPreviewError(e instanceof Error ? e.message : 'Could not build the preview'));
    return () => {
      alive = false;
    };
  }, [showPreview]);

  const vars = template.variables?.length ? template.variables : [];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(template.id, { subject, body });
      onClose();
    } catch (error) {
      console.error('Failed to save template', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <div className="w-full max-w-2xl bg-white h-full relative z-10 shadow-2xl animate-in slide-in-from-right flex flex-col">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-blue-50/50">
          <div>
            <h2 className="text-2xl font-black text-slate-900 flex items-center">
              <Mail className="w-6 h-6 mr-3 text-blue-600" />
              Edit email template
            </h2>
            <p className="text-xs font-bold text-slate-500 mt-2 uppercase tracking-widest">{template.name}</p>
            {template.description ? (
              <p className="text-sm text-slate-600 mt-2 leading-relaxed max-w-lg">{template.description}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {template.name === 'email_shell' ? (
            <div className="rounded-2xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-900">
              <strong className="font-black uppercase text-xs tracking-widest">Layout template</strong>
              <p className="mt-2">
                This wraps all other emails. Keep <code className="bg-white/80 px-1 rounded">{'{{inner_content}}'}</code> where each
                message body goes. Use <code className="bg-white/80 px-1 rounded">{'{{brand_primary}}'}</code> and{' '}
                <code className="bg-white/80 px-1 rounded">{'{{brand_name}}'}</code> for colours and name.{' '}
                <code className="bg-white/80 px-1 rounded">{'{{brand_logo_block}}'}</code>,{' '}
                <code className="bg-white/80 px-1 rounded">{'{{contact_block}}'}</code> and{' '}
                <code className="bg-white/80 px-1 rounded">{'{{social_block}}'}</code> are filled from Business profile (logo, phone, email,
                website, address, social links). Every email sent, including system notices, uses this layout.
              </p>
            </div>
          ) : null}

          <div className="space-y-3">
            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Subject line</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full bg-card border-2 border-input rounded-2xl p-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-foreground"
            />
          </div>

          <div className="space-y-3 flex-1 flex flex-col min-h-[280px]">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Body (HTML)</label>
              <button
                type="button"
                onClick={() => setShowPreview(!showPreview)}
                className="text-[10px] font-black uppercase tracking-widest text-primary flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-primary/20 hover:bg-primary/10 transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                {showPreview ? 'Edit HTML' : 'Preview'}
              </button>
            </div>
            {showPreview ? (
              <div className="flex-1 flex flex-col rounded-2xl border-2 border-input bg-slate-100 overflow-hidden min-h-[520px]">
                <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2.5">
                  <p className="min-w-0 truncate text-xs font-bold text-slate-600">
                    <span className="text-slate-400">Subject:</span> {preview?.subject || subject}
                  </p>
                  <div className="flex shrink-0 rounded-lg bg-slate-100 p-0.5">
                    {(['desktop', 'phone'] as const).map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setPreviewWidth(w)}
                        className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${previewWidth === w ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                      >
                        {w === 'phone' ? <Smartphone className="h-3 w-3" /> : <Monitor className="h-3 w-3" />}
                        {w}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-3 flex justify-center">
                  {previewError ? (
                    <p className="self-center text-sm font-bold text-red-600">{previewError}</p>
                  ) : !preview ? (
                    <Loader2 className="h-6 w-6 animate-spin self-center text-slate-400" />
                  ) : (
                    <iframe
                      title="Email preview"
                      sandbox=""
                      srcDoc={`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0">${preview.html}</body>`}
                      className="h-full min-h-[480px] rounded-xl bg-white shadow-sm transition-all"
                      style={{ width: previewWidth === 'phone' ? 380 : '100%', maxWidth: '100%' }}
                    />
                  )}
                </div>
                <p className="border-t border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold text-slate-500">
                  Sample values are filled in. Logo, contact details and social links come from Settings.
                </p>
              </div>
            ) : (
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="w-full bg-card border-2 border-input rounded-2xl p-4 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-medium text-sm text-foreground font-mono resize-y flex-1 min-h-[300px]"
                placeholder="HTML for the inner email body…"
              />
            )}
          </div>

          {vars.length > 0 ? (
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
              <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2">Merge tags</h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-3">
                Use double curly braces in the subject or body. They are filled automatically when the email is sent.
              </p>
              <div className="flex flex-wrap gap-2">
                {vars.map((v) => (
                  <code key={v} className="text-[11px] bg-white px-2 py-1 rounded-lg border border-slate-200 text-slate-800 font-bold">
                    {`{{${v}}}`}
                  </code>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-6 border-t border-slate-100 bg-white">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black text-lg hover:bg-blue-700 transition-colors shadow-xl shadow-blue-200 flex items-center justify-center disabled:opacity-50"
          >
            {isSaving ? (
              'Saving…'
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5 mr-2" /> Save template
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EmailTemplateFlyout;
