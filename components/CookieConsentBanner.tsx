import React, { useCallback, useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { getCookieConsent, setCookieConsent, type CookieConsentValue } from '../src/utils/cookieConsent';

const CookieConsentBanner: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [showPrefs, setShowPrefs] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    setVisible(getCookieConsent() === null);
  }, []);

  const choose = useCallback((value: CookieConsentValue) => {
    setCookieConsent(value);
    setVisible(false);
  }, []);

  const savePreferences = useCallback(() => {
    setCookieConsent(analytics || marketing ? 'accepted' : 'declined');
    try {
      localStorage.setItem('nn_cookie_analytics', analytics ? '1' : '0');
      localStorage.setItem('nn_cookie_marketing', marketing ? '1' : '0');
    } catch {}
    setVisible(false);
  }, [analytics, marketing]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-labelledby="nn-cookie-consent-title"
      aria-describedby="nn-cookie-consent-desc"
      className="fixed bottom-0 left-0 right-0 z-[10001] p-4 pb-[72px] sm:pb-5 sm:p-5 pointer-events-none"
    >
      <div className="max-w-4xl mx-auto pointer-events-auto rounded-2xl border border-slate-200/80 bg-white/95 backdrop-blur-md shadow-[0_-8px_40px_rgba(15,23,42,0.12)] px-4 py-4 sm:px-6 sm:py-5 flex flex-col gap-4">
        <div className="flex gap-3 min-w-0 flex-1">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Cookie className="w-5 h-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <p id="nn-cookie-consent-title" className="text-sm font-black text-slate-900">
              Cookies &amp; privacy
            </p>
            <p id="nn-cookie-consent-desc" className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              We use essential cookies to make the site work. With your consent we also use analytics cookies to understand
              how you use the site and marketing cookies for personalised offers. You can accept all, decline optional
              cookies, or manage your preferences.{' '}
              <a href="/terms" className="underline underline-offset-2 text-primary hover:text-primary/80">
                Read our Cookie &amp; Privacy Policy
              </a>
            </p>
          </div>
        </div>

        {showPrefs && (
          <div className="border-t border-slate-200 pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">Essential cookies</p>
                <p className="text-xs text-slate-500">Session, security, and site functionality. Always active.</p>
              </div>
              <span className="text-xs font-semibold text-slate-400 px-3 py-1 bg-slate-100 rounded-full">Always on</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">Analytics cookies</p>
                <p className="text-xs text-slate-500">Help us understand how visitors interact with the site.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={analytics}
                onClick={() => setAnalytics((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${analytics ? 'bg-primary' : 'bg-slate-200'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${analytics ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-slate-800">Marketing cookies</p>
                <p className="text-xs text-slate-500">Used to show relevant ads and measure campaign performance.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={marketing}
                onClick={() => setMarketing((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors ${marketing ? 'bg-primary' : 'bg-slate-200'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${marketing ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            <button
              type="button"
              onClick={savePreferences}
              className="w-full px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-95 shadow-md shadow-primary/25 transition-opacity"
            >
              Save preferences
            </button>
          </div>
        )}

        {!showPrefs && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <button
              type="button"
              onClick={() => setShowPrefs(true)}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-bold hover:bg-slate-50 transition-colors"
            >
              Manage preferences
            </button>
            <button
              type="button"
              onClick={() => choose('declined')}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm font-bold hover:bg-slate-50 transition-colors"
            >
              Decline optional
            </button>
            <button
              type="button"
              onClick={() => choose('accepted')}
              className="px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-95 shadow-md shadow-primary/25 transition-opacity"
            >
              Accept all
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CookieConsentBanner;
