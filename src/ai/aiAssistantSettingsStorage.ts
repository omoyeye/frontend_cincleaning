export interface AiAssistantSettings {
  /** Optional override; falls back to ANTHROPIC_API_KEY on the server if empty */
  claudeApiKey: string;
  /** Pasted notes from PDFs, booking policies, FAQs, etc. */
  knowledgeBase: string;
  /** Primary site URL for context (e.g. https://example.com) */
  websiteUrl: string;
  /** Instructions for tone, rules, and how to use the knowledge base */
  systemPrompt: string;
}

const STORAGE_KEY = 'nn_ai_assistant_settings_v1';

/** ~100k chars safety margin for model context */
export const KNOWLEDGE_BASE_MAX_CHARS = 100_000;

export const DEFAULT_AI_SYSTEM_PROMPT = `You are the concierge for {{BRAND}} — a professional cleaning business.

Your job:
- Help visitors choose services (e.g. general, deep, end of tenancy, Airbnb/short-let, commercial), understand how booking works, and feel confident contacting the team.
- When the reference material or website URL below contains relevant facts, use them. If something is not covered, say you are not sure and suggest they contact the team or use the booking flow.
- Be warm, clear, and professional. Prefer concise answers (about 150 words or less) unless the user asks for more detail.
- Do not invent prices, guarantees, legal terms, or policies that are not in the reference material.
- Do not claim to access live calendars, accounts, or bookings; you only have the text provided.`;

export function defaultAiAssistantSettings(): AiAssistantSettings {
  return {
    claudeApiKey: '',
    knowledgeBase: '',
    websiteUrl: '',
    systemPrompt: DEFAULT_AI_SYSTEM_PROMPT,
  };
}

export function getAiAssistantSettings(): AiAssistantSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const defaults = defaultAiAssistantSettings();
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AiAssistantSettings & { geminiApiKey?: string }>;
    return {
      ...defaults,
      ...parsed,
      claudeApiKey:
        typeof parsed.claudeApiKey === 'string' && parsed.claudeApiKey
          ? parsed.claudeApiKey
          : typeof parsed.geminiApiKey === 'string'
            ? parsed.geminiApiKey
            : defaults.claudeApiKey,
      knowledgeBase: typeof parsed.knowledgeBase === 'string' ? parsed.knowledgeBase : defaults.knowledgeBase,
      websiteUrl: typeof parsed.websiteUrl === 'string' ? parsed.websiteUrl : defaults.websiteUrl,
      systemPrompt:
        typeof parsed.systemPrompt === 'string' && parsed.systemPrompt.trim()
          ? parsed.systemPrompt
          : defaults.systemPrompt,
    };
  } catch {
    return defaultAiAssistantSettings();
  }
}

export function saveAiAssistantSettings(settings: AiAssistantSettings): boolean {
  try {
    const kb = settings.knowledgeBase.slice(0, KNOWLEDGE_BASE_MAX_CHARS);
    const payload: AiAssistantSettings = {
      ...settings,
      knowledgeBase: kb,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(new CustomEvent('nn_ai_assistant_settings_updated', { detail: payload }));
    return true;
  } catch {
    return false;
  }
}
