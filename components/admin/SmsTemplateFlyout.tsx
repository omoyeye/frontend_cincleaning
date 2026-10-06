import React, { useState } from 'react';
import { X, MessageSquare, CheckCircle2 } from 'lucide-react';
import type { SmsTemplate } from '../../types';

interface SmsTemplateFlyoutProps {
  template: SmsTemplate;
  onClose: () => void;
  onSave: (id: number, updates: Partial<Pick<SmsTemplate, 'message'>>) => Promise<void>;
}

const SmsTemplateFlyout: React.FC<SmsTemplateFlyoutProps> = ({ template, onClose, onSave }) => {
  const [message, setMessage] = useState(template.message || '');
  const [isSaving, setIsSaving] = useState(false);

  const maxLength = 320;
  const isOverLength = message.length > 160;

  const vars = template.variables?.length ? template.variables : [];

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(template.id, { message });
      onClose();
    } catch (error) {
      console.error('Failed to save SMS template', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <div className="w-full max-w-md bg-white h-full relative z-10 shadow-2xl animate-in slide-in-from-right flex flex-col">
        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-green-50/50">
          <div>
            <h2 className="text-xl font-black text-slate-900 flex items-center">
              <MessageSquare className="w-6 h-6 mr-3 text-green-600" />
              Edit SMS template
            </h2>
            <p className="text-xs font-bold text-slate-500 mt-2 uppercase tracking-widest">{template.name}</p>
            {template.description ? (
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{template.description}</p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Message</label>
              <span className={`text-[10px] font-bold ${isOverLength ? 'text-amber-600' : 'text-slate-400'}`}>
                {message.length} / {maxLength}
              </span>
            </div>

            <div className="bg-slate-100 p-4 rounded-3xl border-4 border-slate-200 shadow-inner relative max-w-[280px] mx-auto mt-4">
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-slate-300 rounded-full" />
              <div className="mt-8 bg-green-500/10 text-slate-800 p-4 rounded-2xl rounded-tr-sm text-sm border border-green-500/20 leading-relaxed shadow-sm">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-transparent border-none outline-none resize-none min-h-[120px]"
                  placeholder="SMS text with {{placeholders}}…"
                  maxLength={maxLength}
                />
              </div>
            </div>
            {isOverLength ? (
              <p className="text-xs text-amber-600 font-bold mt-2 text-center">
                Over 160 characters may split into multiple SMS segments (carrier-dependent).
              </p>
            ) : null}
          </div>

          {vars.length > 0 ? (
            <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100">
              <h4 className="text-xs font-black text-slate-600 uppercase tracking-widest mb-2">Merge tags</h4>
              <p className="text-xs text-slate-500 font-medium leading-relaxed mb-3">
                Replaced automatically when the message is sent (server-side notifications or staff actions from the job workflow).
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
            className="w-full py-4 bg-green-600 text-white rounded-2xl font-black text-lg hover:bg-green-700 transition-colors shadow-xl shadow-green-200 flex items-center justify-center disabled:opacity-50"
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

export default SmsTemplateFlyout;
