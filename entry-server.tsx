import React from "react";
import ReactDOMServer from "react-dom/server";
import App from './App';
import { buildSsrHeadHtml } from './src/seo/ssrSeo';

import { defaultSiteSeo, deepMergePages } from './src/seo/seoStorage';
import type { SiteSeoSettings } from './types';

/** Public pages pre-rendered to static HTML at build time (scripts/prerender.mjs). */
export { SITEMAP_CUSTOMER_PATHS as PRERENDER_PATHS } from './src/seo/routePaths';

/** Live admin SEO settings (possibly partial or missing) merged over defaults, with a site URL for canonicals/JSON-LD. */
export function resolveSeoForPrerender(raw: Partial<SiteSeoSettings> | null | undefined, siteUrlFallback: string): SiteSeoSettings {
  const defaults = defaultSiteSeo();
  const merged: SiteSeoSettings = {
    ...defaults,
    ...(raw || {}),
    pages: deepMergePages(defaults.pages, raw?.pages),
  };
  if (!merged.siteUrl?.trim()) merged.siteUrl = siteUrlFallback.replace(/\/$/, '');
  return merged;
}

// Classic JSX compiles to React.createElement; some bundled code references bare "React".
// Set global so all modules in the SSR bundle resolve it (Node has no global React).
if (typeof globalThis !== "undefined") (globalThis as unknown as { React: typeof React }).React = React;
else if (typeof global !== "undefined") (global as unknown as { React: typeof React }).React = React;

export function render(url: string, settings?: any) {
  if (url.startsWith('/admin') || url.startsWith('/staff') || url.startsWith('/portal') || url.startsWith('/my-account')) {
    return { html: '', headHtml: '' };
  }

  // Build SEO head tags server-side (no document/window needed)
  const headHtml = buildSsrHeadHtml(url, settings);

  const app = (
    <React.StrictMode>
      <App serverUrl={url} />
    </React.StrictMode>
  );

  const html = ReactDOMServer.renderToString(app);
  return { html, headHtml };
}
