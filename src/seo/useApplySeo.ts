import { useEffect, useState } from 'react';
import { applyDocumentSeo, injectGa4, injectGtm } from './applyDocumentSeo';
import { getSiteSeo } from './seoStorage';
import { seoPageIdForRoute } from './routePaths';
import type { CustomerPageKey } from './routePaths';

type View = 'customer' | 'admin' | 'staff' | 'portal';

export function useApplySeo(
  view: View,
  customerPage: CustomerPageKey,
  brandFallbackTitle: string,
  blogSlug?: string | null
) {
  const [seoEpoch, setSeoEpoch] = useState(0);

  useEffect(() => {
    const onSeo = () => setSeoEpoch((n) => n + 1);
    window.addEventListener('nn_seo_settings_updated', onSeo);
    return () => window.removeEventListener('nn_seo_settings_updated', onSeo);
  }, []);

  useEffect(() => {
    // Blog article pages set their own title, canonical, OG, and JSON-LD in MarketingSite.
    if (view === 'customer' && customerPage === 'blog' && blogSlug) return;

    try {
      const settings = getSiteSeo();
      const pageId = seoPageIdForRoute(view, customerPage);
      applyDocumentSeo(settings, pageId, {
        brandFallback: brandFallbackTitle,
        // Area routes carry their slug in blogSlug (see parseCustomerRoute).
        areaSlug: customerPage === 'area' ? blogSlug : null,
      });

      if (settings.gtmContainerId.trim()) {
        injectGtm(settings.gtmContainerId.trim());
      }
      if (settings.googleAnalytics4Id.trim()) {
        injectGa4(settings.googleAnalytics4Id.trim());
      }
    } catch (e) {
      console.warn('applyDocumentSeo failed (non-fatal):', e);
    }
  }, [view, customerPage, brandFallbackTitle, seoEpoch, blogSlug]);
}
