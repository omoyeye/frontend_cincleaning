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

async function loadLiveSettings() {
  const api = (process.env.PRERENDER_API_URL || process.env.VITE_API_URL || '').replace(/\/$/, '');
  if (!/^https?:\/\//.test(api)) return {};
  try {
    const res = await fetch(`${api}/business-settings`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const settings = await res.json();
    // Published blog posts, so the blog index and each article are prerendered with real content.
    let blogPosts = [];
    try {
      const b = await fetch(`${api}/blog-posts`, { signal: AbortSignal.timeout(15000) });
      if (b.ok) blogPosts = (await b.json()).filter((p) => p && p.slug && p.published !== false);
    } catch (e) {
      console.warn(`[prerender] Could not load blog posts (${e.message}); articles stay client-rendered.`);
    }
    return {
      seo: settings && typeof settings.seo_settings === 'object' ? settings.seo_settings : null,
      websiteContent: settings && typeof settings.websiteContent === 'object' ? settings.websiteContent : null,
      blogPosts,
    };
  } catch (e) {
    console.warn(`[prerender] Could not load settings from ${api} (${e.message}); using defaults.`);
    return {};
  }
}

/** A custom head/body snippet is only safe to inject when it is real HTML (contains a tag). */
const htmlSnippet = (value, label) => {
  const v = String(value || '').trim();
  if (!v) return '';
  if (!/<[a-z!]/i.test(v)) {
    console.warn(`[prerender] Skipping SEO "${label}": it has no HTML tags, so it would show as text on the page.`);
    return '';
  }
  return v;
};

const inlineJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c');

const insertBefore = (html, marker, snippet) => {
  const i = html.toLowerCase().lastIndexOf(marker);
  return i === -1 ? html : html.slice(0, i) + snippet + html.slice(i);
};

/** Same head/body injection the old Express SSR handler performed. */
function buildPage(appHtml, headHtml, seo, websiteContent, blog) {
  let out = template.split('<!--app-html-->').join(appHtml);
  if (headHtml) {
    out = out.replace(/<title>.*?<\/title>/is, '');
    if (headHtml.includes('name="description"')) out = out.replace(/<meta name="description"[^>]*>\s*/i, '');
  }
  let head = '';
  if (seo) head += `<script>window.__NN_SEO_SETTINGS__ = ${JSON.stringify(seo).replace(/<\//g, '<\\/')};</script>\n`;
  // The content this page was rendered with, so the browser's first render matches (no hydration error).
  if (appHtml && websiteContent) head += `<script>window.__NN_WEBSITE_CONTENT__ = ${inlineJson(websiteContent)};</script>\n`;
  if (appHtml && blog?.posts) head += `<script>window.__NN_BLOG_POSTS__ = ${inlineJson(blog.posts)};</script>\n`;
  if (appHtml && blog?.post) head += `<script>window.__NN_BLOG_POST__ = ${inlineJson(blog.post)};</script>\n`;
  if (headHtml) head += `${headHtml}\n`;
  const scriptHead = htmlSnippet(seo?.scriptHead, 'Head scripts');
  const scriptBodyStart = htmlSnippet(seo?.scriptBodyStart, 'Body start scripts');
  const scriptBodyEnd = htmlSnippet(seo?.scriptBodyEnd, 'Body end scripts');
  if (scriptHead) head += `${scriptHead}\n`;
  out = insertBefore(out, '</head>', head);
  if (scriptBodyStart) out = out.replace(/<body[^>]*>/i, (m) => `${m}\n${scriptBodyStart}`);
  if (scriptBodyEnd) out = insertBefore(out, '</body>', `${scriptBodyEnd}\n`);
  return out;
}

const { seo = null, websiteContent = null, blogPosts = [] } = await loadLiveSettings();
// Head tags use defaults merged with live settings; the browser still receives the raw live settings.
const renderSettings = resolveSeoForPrerender(seo, SITE_URL);

// Client-only routes get the shell (with live settings + admin scripts, but no pre-rendered markup to hydrate).
writeFileSync(path.join(distDir, 'app-shell.html'), buildPage('', '', seo));

const isBlogIndex = (route) => route === '/cleaning-blog' || route === '/blog';
const articleRoutes = blogPosts.map((post) => ({ route: `/cleaning-blog/${encodeURIComponent(post.slug)}`, post }));

let count = 0;
for (const { route, post } of [...PRERENDER_PATHS.map((route) => ({ route, post: null })), ...articleRoutes]) {
  const blog = post ? { post } : isBlogIndex(route) && blogPosts.length ? { posts: blogPosts } : null;
  const { html, headHtml } = render(route, renderSettings, websiteContent, blog);
  const page = buildPage(html, headHtml, seo, websiteContent, blog);
  // Vercel `cleanUrls` serves deep-cleaning.html at /deep-cleaning.
  const file = route === '/' ? path.join(distDir, 'index.html') : path.join(distDir, `${route.replace(/^\//, '')}.html`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, page);
  // Articles live in a cleaning-blog/ folder, so give the blog index an index.html there too: the
  // folder then resolves to the index whichever way the host maps /cleaning-blog.
  if (route === '/cleaning-blog' && articleRoutes.length) {
    mkdirSync(path.join(distDir, 'cleaning-blog'), { recursive: true });
    writeFileSync(path.join(distDir, 'cleaning-blog', 'index.html'), page);
  }
  count += 1;
}

rmSync(ssrDir, { recursive: true, force: true });
console.log(`[prerender] ${count} pages (${articleRoutes.length} blog articles) + app-shell.html written (${seo ? 'live' : 'default'} SEO settings, ${websiteContent ? 'live' : 'default'} website content).`);
