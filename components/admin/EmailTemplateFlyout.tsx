import React, { useState } from 'react';
import { X, Mail, CheckCircle2, Eye } from 'lucide-react';
import type { EmailTemplate } from '../../types';
import { sanitizeHtml } from '../../src/utils/sanitizeHtml';

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
                <code className="bg-white/80 px-1 rounded">{'{{brand_name}}'}</code> for the header strip.{' '}
                <code className="bg-white/80 px-1 rounded">{'{{brand_logo_block}}'}</code> and{' '}
                <code className="bg-white/80 px-1 rounded">{'{{contact_block}}'}</code> are filled from Business profile (phone, email,
                website, address) and your public site URL for the logo image.
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
              <div
                className="w-full bg-white border-2 border-input rounded-2xl p-6 min-h-[300px] overflow-y-auto text-sm text-slate-800 leading-relaxed [&_a]:text-primary [&_img]:max-w-full"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(body || '<p class=\"text-slate-400 italic\">No content</p>') }}
              />
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
