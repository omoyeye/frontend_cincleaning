import React, { useState, useEffect } from 'react';
import { X, Phone, Calendar } from 'lucide-react';
import { useBusinessSettings } from '../src/context/BusinessSettingsContext';
import { WHATSAPP_PREFILL, WhatsAppGlyph, useWhatsAppNumber } from './WhatsAppButton';

const DISMISS_KEY = 'cin_sticky_footer_dismissed';
/** Fallback only if business settings have no phone yet. */
const FALLBACK_PHONE = '07909565925';

const StickyMobileFooter: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const brand = useBusinessSettings();
  const phone = (brand.phone ?? '').trim() || FALLBACK_PHONE;
  const waNumber = useWhatsAppNumber();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth > 768) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch { /* ignore */ }
    setVisible(true);
  }, []);

  // Lets index.css pad the page and tidy the floating buttons while this bar is on screen.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (visible) root.setAttribute('data-sticky-footer', '1');
    else root.removeAttribute('data-sticky-footer');
    return () => root.removeAttribute('data-sticky-footer');
  }, [visible]);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  const track = (event: string) => {
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({ event, label: 'sticky_footer' });
    }
  };

  return (
    <>
      <style>{`
        @media (min-width: 769px) { .cin-sticky-footer { display: none !important; } }
        .cin-sticky-footer {
          position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
          background: #0D1B3E; border-top: 2px solid #00C896;
          display: flex; align-items: stretch; padding: 0;
          box-shadow: 0 -4px 20px rgba(0,0,0,.25);
          padding-bottom: env(safe-area-inset-bottom, 0px);
        }
        .cin-sticky-footer a, .cin-sticky-footer button { font-family: inherit; text-decoration: none; }
        .cin-sf-btn {
          flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center; gap: 6px;
          height: 52px; padding: 0 8px; font-size: 14px; font-weight: 800; border: none; cursor: pointer;
          white-space: nowrap;
        }
        .cin-sf-btn span { overflow: hidden; text-overflow: ellipsis; }
        .cin-sf-book { background: #00C896; color: #0D1B3E; }
        .cin-sf-call { background: #fff; color: #0D1B3E; }
        .cin-sf-wa { flex: 0 0 56px; background: #25D366; color: #fff; }
        .cin-sf-x {
          position: absolute; top: -14px; left: 8px;
          width: 28px; height: 28px; border-radius: 50%;
          background: #0D1B3E; border: 2px solid #00C896; color: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; padding: 0; font-size: 0;
        }
        .cin-sf-us { display: none; }
        /* Narrow phones: "Call us" instead of a cut-off number (the link still dials it). */
        @media (max-width: 419px) { .cin-sf-call .cin-sf-num { display: none; } .cin-sf-call .cin-sf-us { display: inline; } }
      `}</style>
      <div className="cin-sticky-footer">
        <a href="/book-cleaning" className="cin-sf-btn cin-sf-book" onClick={() => track('book_click')}>
          <Calendar size={16} aria-hidden /> <span>Book online</span>
        </a>
        <a href={`tel:${phone.replace(/\s/g, '')}`} className="cin-sf-btn cin-sf-call" onClick={() => track('phone_click')} aria-label={`Call ${phone}`}>
          <Phone size={16} aria-hidden /> <span>Call<span className="cin-sf-us"> us</span><span className="cin-sf-num"> {phone}</span></span>
        </a>
        <a
          href={`https://wa.me/${waNumber}?text=${WHATSAPP_PREFILL}`}
          target="_blank"
          rel="noopener noreferrer"
          className="cin-sf-btn cin-sf-wa"
          onClick={() => track('whatsapp_click')}
          aria-label="Chat with us on WhatsApp"
        >
          <WhatsAppGlyph className="h-6 w-6" />
        </a>
        <button type="button" className="cin-sf-x" onClick={dismiss} aria-label="Hide this bar">
          <X size={14} />
        </button>
      </div>
    </>
  );
};

export default StickyMobileFooter;
