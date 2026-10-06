// Pre-renders public marketing pages to static HTML after `vite build`, so crawlers and link previews get
// full content and per-page SEO tags on Vercel (replaces the old per-request server rendering).
//
// - dist/index.html            home page
// - dist/<path>.html           every other path in PRERENDER_PATHS (services, areas, blog index, ...)
// - dist/app-shell.html        unrendered shell for client-only routes (/admin, /staff, /my-account, ...)
//
// Live admin settings are fetched from the API when reachable (PRERENDER_API_URL, else VITE_API_URL);
// otherwise the built-in defaults are used and the browser applies live settings after load.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distDir = path.join(root, 'dist');
const ssrDir = path.join(root, 'dist-ssr');

const template = readFileSync(path.join(distDir, 'index.html'), 'utf8');
const { render, PRERENDER_PATHS, resolveSeoForPrerender } = await import(
  pathToFileURL(path.join(ssrDir, 'entry-server.mjs')).href
);
const SITE_URL = (process.env.VITE_SITE_URL || 'https://cleanitneatly.com').replace(/\/$/, '');

async function loadLiveSeoSettings() {
  const api = (process.env.PRERENDER_API_URL || process.env.VITE_API_URL || '').replace(/\/$/, '');
  if (!/^https?:\/\//.test(api)) return null;
  try {
    const res = await fetch(`${api}/business-settings`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const settings = await res.json();
    return settings && typeof settings.seo_settings === 'object' ? settings.seo_settings : null;
  } catch (e) {
    console.warn(`[prerender] Could not load SEO settings from ${api} (${e.message}); using defaults.`);
    return null;
  }
}

const insertBefore = (html, marker, snippet) => {
  const i = html.toLowerCase().lastIndexOf(marker);
  return i === -1 ? html : html.slice(0, i) + snippet + html.slice(i);
};

/** Same head/body injection the old Express SSR handler performed. */
function buildPage(appHtml, headHtml, seo) {
  let out = template.split('<!--app-html-->').join(appHtml);
  if (headHtml) {
    out = out.replace(/<title>.*?<\/title>/is, '');
    if (headHtml.includes('name="description"')) out = out.replace(/<meta name="description"[^>]*>\s*/i, '');
  }
  let head = '';
  if (seo) head += `<script>window.__NN_SEO_SETTINGS__ = ${JSON.stringify(seo).replace(/<\//g, '<\\/')};</script>\n`;
  if (headHtml) head += `${headHtml}\n`;
  if (seo?.scriptHead) head += `${seo.scriptHead}\n`;
  out = insertBefore(out, '</head>', head);
  if (seo?.scriptBodyStart) out = out.replace(/<body[^>]*>/i, (m) => `${m}\n${seo.scriptBodyStart}`);
  if (seo?.scriptBodyEnd) out = insertBefore(out, '</body>', `${seo.scriptBodyEnd}\n`);
  return out;
}

const seo = await loadLiveSeoSettings();
// Head tags use defaults merged with live settings; the browser still receives the raw live settings.
const renderSettings = resolveSeoForPrerender(seo, SITE_URL);

// Client-only routes get the shell (with live settings + admin scripts, but no pre-rendered markup to hydrate).
writeFileSync(path.join(distDir, 'app-shell.html'), buildPage('', '', seo));

let count = 0;
for (const route of PRERENDER_PATHS) {
  const { html, headHtml } = render(route, renderSettings);
  const page = buildPage(html, headHtml, seo);
  // Vercel `cleanUrls` serves deep-cleaning.html at /deep-cleaning.
  const file = route === '/' ? path.join(distDir, 'index.html') : path.join(distDir, `${route.replace(/^\//, '')}.html`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, page);
  count += 1;
}

rmSync(ssrDir, { recursive: true, force: true });
console.log(`[prerender] ${count} pages + app-shell.html written${seo ? ' (live SEO settings)' : ' (default SEO settings)'}.`);
