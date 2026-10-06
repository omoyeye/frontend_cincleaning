const STORAGE_KEY = 'nn_cookie_consent_v1';

export type CookieConsentValue = 'accepted' | 'declined';

/** Read stored choice, or null if the user has not decided yet. */
export function getCookieConsent(): CookieConsentValue | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'accepted' || v === 'declined') return v;
    return null;
  } catch {
    return null;
  }
}

export function setCookieConsent(value: CookieConsentValue): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent('nn_cookie_consent', { detail: { value } }));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Use before enabling analytics, marketing tags, or non-essential storage. */
export function hasAcceptedOptionalCookies(): boolean {
  return getCookieConsent() === 'accepted';
}
