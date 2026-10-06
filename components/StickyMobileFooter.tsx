import React, { useState, useEffect } from 'react';
import { X, Phone, Calendar } from 'lucide-react';

const DISMISS_KEY = 'cin_sticky_footer_dismissed';

const StickyMobileFooter: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.innerWidth > 768) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch { /* ignore */ }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    try { sessionStorage.setItem(DISMISS_KEY, '1'); } catch { /* ignore */ }
  };

  const handleCallClick = () => {
    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'phone_click',
        label: 'sticky_footer',
      });
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
          flex: 1; display: flex; align-items: center; justify-content: center; gap: 8px;
          height: 52px; font-size: 14px; font-weight: 800; border: none; cursor: pointer;
        }
        .cin-sf-book { background: #00C896; color: #0D1B3E; }
        .cin-sf-call { background: #fff; color: #0D1B3E; }
        .cin-sf-x {
          position: absolute; top: -12px; right: 8px;
          width: 24px; height: 24px; border-radius: 50%;
          background: #0D1B3E; border: 2px solid #00C896; color: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; padding: 0; font-size: 0;
        }
      `}</style>
      <div className="cin-sticky-footer">
        <a href="/book-cleaning" className="cin-sf-btn cin-sf-book">
          <Calendar size={16} /> Book Online
        </a>
        <a href="tel:07909565925" className="cin-sf-btn cin-sf-call" onClick={handleCallClick}>
          <Phone size={16} /> Call 07909565925
        </a>
        <button type="button" className="cin-sf-x" onClick={dismiss} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    </>
  );
};

export default StickyMobileFooter;
