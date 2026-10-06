import React, { useEffect, useRef, useState } from 'react';
import { Bot, KeyRound, Loader2, MessageCircle, RotateCcw, Save, Send, Sparkles, Zap } from 'lucide-react';
import { useFlyer } from '../Flyer';
import {
  defaultAiAssistantSettings,
  DEFAULT_AI_SYSTEM_PROMPT,
  getAiAssistantSettings,
  KNOWLEDGE_BASE_MAX_CHARS,
  saveAiAssistantSettings,
  type AiAssistantSettings,
} from '../../src/ai/aiAssistantSettingsStorage';
import { apiClient, apiUrl } from '../../services/api';
import { useBusinessBrand } from '../../src/hooks/useBusinessBrand';

const AiAssistantSettingsPanel: React.FC = () => {
  const { showFlyer } = useFlyer();
  const [draft, setDraft] = useState<AiAssistantSettings>(() => getAiAssistantSettings());
  const [showKey, setShowKey] = useState(false);
  const [autoPopulating, setAutoPopulating] = useState(false);
  const brandName = useBusinessBrand();

  // Test chat state
  const [testOpen, setTestOpen] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testLog, setTestLog] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [testTyping, setTestTyping] = useState(false);
  const testEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sync = () => setDraft(getAiAssistantSettings());
    window.addEventListener('nn_ai_assistant_settings_updated', sync);
    return () => window.removeEventListener('nn_ai_assistant_settings_updated', sync);
  }, []);

  useEffect(() => {
    testEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [testLog, testTyping]);

  const handleSave = () => {
    if (!saveAiAssistantSettings(draft)) {
      showFlyer('Could not save. Browser storage may be full or disabled.', 'error');
      return;
    }
    showFlyer('AI assistant settings saved. The public chat widget uses these on the next message.', 'success');
  };

  const handleResetPrompt = () => {
    setDraft((d) => ({ ...d, systemPrompt: DEFAULT_AI_SYSTEM_PROMPT }));
    showFlyer('System prompt reset to default (not saved yet). Click Save to apply.', 'info');
  };

  const handleResetAll = () => {
    if (!window.confirm('Reset all AI assistant fields to defaults?')) return;
    const next = defaultAiAssistantSettings();
    setDraft(next);
    if (!saveAiAssistantSettings(next)) {
      showFlyer('Could not save after reset.', 'error');
      return;
    }
    showFlyer('AI assistant settings reset to defaults.', 'success');
  };

  const handleAutoPopulate = async () => {
    setAutoPopulating(true);
    try {
      const settings = await apiClient.getBusinessSettings() as Record<string, any>;
      const services = await apiClient.getServices();
      const extras = await apiClient.getExtraServices();

      const lines: string[] = [];
      lines.push(`Business: ${settings.companyName || brandName}`);
      if (settings.phone) lines.push(`Phone: ${settings.phone}`);
      if (settings.email) lines.push(`Email: ${settings.email}`);
      if (settings.address) lines.push(`Address: ${settings.address}`);
      if (settings.whatsappNumber) lines.push(`WhatsApp: ${settings.whatsappNumber}`);

      if (settings.operatingHours) {
        lines.push('', '--- Operating hours ---');
        lines.push(settings.operatingHours);
      }

      if (services?.length) {
        lines.push('', '--- Services offered ---');
        for (const s of services) {
          const rate = s.baseRate ? `£${Number(s.baseRate).toFixed(0)}/hr` : '';
          lines.push(`- ${s.name} ${rate} (${s.pricingModel || 'hourly'})`);
          if (s.description) lines.push(`  ${s.description}`);
        }
      }

      if (extras?.length) {
        lines.push('', '--- Extra services / add-ons ---');
        for (const e of extras) {
          lines.push(`- ${e.name}: £${Number(e.price).toFixed(0)} (adds ${e.durationMinutes || 0} mins)`);
        }
      }

      if (settings.areasServed) {
        lines.push('', '--- Areas served ---');
        lines.push(settings.areasServed);
      }

      const depositPolicy = settings.depositPolicy;
      if (depositPolicy) {
        const dp = typeof depositPolicy === 'string' ? JSON.parse(depositPolicy) : depositPolicy;
        lines.push('', '--- Deposit policy ---');
        lines.push(`${dp.requiredPercent || 40}% deposit required before attendance.`);
        if (dp.message) lines.push(dp.message);
      }

      const newKb = lines.join('\n');
      setDraft((d) => ({
        ...d,
        knowledgeBase: d.knowledgeBase
          ? d.knowledgeBase + '\n\n' + newKb
          : newKb,
        websiteUrl: d.websiteUrl || (typeof window !== 'undefined' ? window.location.origin : ''),
      }));
      showFlyer('Knowledge base populated from your business settings, services, and extras. Review and Save.', 'success');
    } catch (err: any) {
      showFlyer(err.message || 'Could not fetch business data.', 'error');
    } finally {
      setAutoPopulating(false);
    }
  };

  const handleTestSend = async () => {
    const q = testInput.trim();
    if (!q || testTyping) return;
    setTestInput('');
    setTestLog((l) => [...l, { role: 'user', text: q }]);
    setTestTyping(true);
    try {
      const res = await fetch(apiUrl('/ai/chat'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: q,
          brandName: brandName || 'our business',
          knowledgeBase: draft.knowledgeBase.slice(0, KNOWLEDGE_BASE_MAX_CHARS),
          systemPrompt: draft.systemPrompt,
          websiteUrl: draft.websiteUrl,
          apiKeyOverride: draft.claudeApiKey,
        }),
      });
      const data = await res.json();
      setTestLog((l) => [...l, { role: 'ai', text: data.response || 'No response.' }]);
    } catch {
      setTestLog((l) => [...l, { role: 'ai', text: 'Error — check your API key and try again.' }]);
    } finally {
      setTestTyping(false);
    }
  };

  const kbLen = draft.knowledgeBase.length;
  const kbWarn = kbLen > KNOWLEDGE_BASE_MAX_CHARS;

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100/50 p-8 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-violet-600" />
            AI concierge (public widget)
          </h4>
          <p className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-widest max-w-2xl">
            Configure the floating chat on the marketing site. Your Anthropic (Claude) API key goes in the server&apos;s <code className="text-xs bg-slate-100 px-1 rounded">.env</code> file as <code className="text-xs bg-slate-100 px-1 rounded">ANTHROPIC_API_KEY</code>. Optionally override it below, add reference text, your website URL, and
            instructions so replies match your business.
          </p>
        </div>
        <button
          type="button"
          onClick={handleResetAll}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-50 shrink-0"
        >
          <RotateCcw className="w-4 h-4" />
          Reset all
        </button>
      </div>

      <div className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900 font-medium">
        <strong className="font-black">Security:</strong> The primary API key should be set as <code className="text-xs bg-amber-100 px-1 rounded">ANTHROPIC_API_KEY</code> in your server <code className="text-xs bg-amber-100 px-1 rounded">.env</code> file. The optional override below is stored in this browser only.
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-[11px] font-black uppercase tracking-widest text-slate-400">
          <KeyRound className="w-4 h-4" />
          Claude API key (optional — overrides server key)
        </label>
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            autoComplete="off"
            className="flex-1 p-3 rounded-xl border border-slate-200 font-mono text-sm"
            placeholder="sk-ant-…"
            value={draft.claudeApiKey}
            onChange={(e) => setDraft((d) => ({ ...d, claudeApiKey: e.target.value }))}
          />
          <button
            type="button"
            onClick={() => setShowKey((v) => !v)}
            className="px-4 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            {showKey ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Website URL (for context)</label>
        <input
          className="w-full p-3 rounded-xl border border-slate-200 text-sm"
          placeholder="https://www.yourdomain.com"
          value={draft.websiteUrl}
          onChange={(e) => setDraft((d) => ({ ...d, websiteUrl: e.target.value }))}
        />
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">
            Reference material (paste from PDFs, booking policies, FAQs, service lists)
          </label>
          <button
            type="button"
            onClick={handleAutoPopulate}
            disabled={autoPopulating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 font-bold text-xs hover:bg-teal-100 disabled:opacity-50 transition-colors"
          >
            {autoPopulating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
            {autoPopulating ? 'Fetching...' : 'Auto-populate from settings'}
          </button>
        </div>
        <textarea
          className="w-full p-3 rounded-xl border border-slate-200 text-sm min-h-[200px] font-mono leading-relaxed"
          placeholder="Paste key facts, pricing notes, areas covered, hours, policies…"
          value={draft.knowledgeBase}
          onChange={(e) => setDraft((d) => ({ ...d, knowledgeBase: e.target.value }))}
        />
        <div className="flex items-center justify-between">
          <p className={`text-xs font-bold ${kbWarn ? 'text-red-600' : 'text-slate-400'}`}>
            {kbLen.toLocaleString()} / {KNOWLEDGE_BASE_MAX_CHARS.toLocaleString()} characters
            {kbWarn && ' — will be truncated on save to the limit above.'}
          </p>
          <div className="flex-1 max-w-[200px] ml-4 h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${kbWarn ? 'bg-red-500' : 'bg-violet-500'}`}
              style={{ width: `${Math.min(100, (kbLen / KNOWLEDGE_BASE_MAX_CHARS) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
            <Bot className="w-4 h-4" />
            System prompt (how the AI should behave)
          </label>
          <button
            type="button"
            onClick={handleResetPrompt}
            className="text-xs font-black uppercase tracking-widest text-slate-500 hover:text-slate-800"
          >
            Restore default prompt
          </button>
        </div>
        <textarea
          className="w-full p-3 rounded-xl border border-slate-200 text-sm min-h-[180px] leading-relaxed"
          placeholder="Tone, rules, what to do when unsure…"
          value={draft.systemPrompt}
          onChange={(e) => setDraft((d) => ({ ...d, systemPrompt: e.target.value }))}
        />
        <p className="text-xs text-slate-500">
          Use <code className="font-mono bg-slate-100 px-1 rounded">{'{{BRAND}}'}</code> where the business name should appear; it is replaced automatically.
        </p>
      </div>

      {/* Test chat */}
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setTestOpen((o) => !o)}
          className="inline-flex items-center gap-2 text-sm font-black text-violet-700 hover:text-violet-900"
        >
          <MessageCircle className="w-4 h-4" />
          {testOpen ? 'Hide test chat' : 'Test your AI assistant'}
        </button>

        {testOpen && (
          <div className="rounded-2xl border-2 border-violet-200 bg-violet-50/30 overflow-hidden">
            <div className="bg-gradient-to-r from-violet-600 to-indigo-700 px-5 py-3 text-white flex items-center gap-3">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-black uppercase tracking-wider">Live preview</span>
              {testLog.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTestLog([])}
                  className="ml-auto text-xs font-bold text-white/70 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="max-h-[280px] overflow-y-auto p-4 space-y-3 bg-white/60">
              {testLog.length === 0 && (
                <p className="text-sm text-slate-500 italic text-center py-4">
                  Type a question below to test how your AI assistant responds with the current settings.
                </p>
              )}
              {testLog.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-violet-600 text-white rounded-tr-sm'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm shadow-sm'
                  }`}>
                    {m.text}
                  </div>
                </div>
              ))}
              {testTyping && (
                <div className="flex items-center gap-2 ml-2 text-violet-600 text-xs font-bold animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
                </div>
              )}
              <div ref={testEndRef} />
            </div>
            <div className="p-3 bg-white border-t border-violet-200">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTestSend()}
                  placeholder="Ask a test question…"
                  className="flex-1 p-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-400"
                />
                <button
                  type="button"
                  onClick={handleTestSend}
                  disabled={!testInput.trim() || testTyping}
                  className="px-4 rounded-xl bg-violet-600 text-white font-bold text-sm hover:bg-violet-700 disabled:opacity-40 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2 border-t border-slate-100">
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-violet-600 text-white font-black hover:bg-violet-700 shadow-lg"
        >
          <Save className="w-5 h-5" />
          Save AI settings
        </button>
      </div>
    </div>
  );
};

export default AiAssistantSettingsPanel;
