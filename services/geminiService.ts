import {
  getAiAssistantSettings,
  KNOWLEDGE_BASE_MAX_CHARS,
} from '../src/ai/aiAssistantSettingsStorage';

import { apiUrl } from './api';
export async function getCleaningAdvice(query: string, brandName?: string): Promise<string> {
  const s = typeof window !== 'undefined' ? getAiAssistantSettings() : null;

  try {
    const res = await fetch(apiUrl('/ai/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        brandName: brandName?.trim() || 'our business',
        knowledgeBase: (s?.knowledgeBase || '').slice(0, KNOWLEDGE_BASE_MAX_CHARS),
        systemPrompt: s?.systemPrompt || '',
        websiteUrl: s?.websiteUrl || '',
        apiKeyOverride: s?.claudeApiKey || '',
      }),
    });

    if (!res.ok) {
      return 'Sorry — our assistant is temporarily unavailable. Please try again in a moment, or reach us using the contact details on our website.';
    }

    const data = (await res.json()) as { response?: string };
    return data.response || "I'm sorry, I couldn't process that. Please try again!";
  } catch (error) {
    console.error('AI chat error:', error);
    return "Hello! I'm your booking assistant. How can I help you with your booking today?";
  }
}
