import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Bold,
  Eye,
  FileText,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ExternalLink,
  Pencil,
  Pilcrow,
  Plus,
  Quote,
  Search,
  Trash2,
} from 'lucide-react';
import type { BlogPost } from '../../types';
import { apiAdmin } from '../../services/api';
import { sanitizeHtml } from '../../src/utils/sanitizeHtml';
import { useFlyer } from '../Flyer';
import CmsImageInput from './CmsImageInput';
import { BTN_GHOST_DANGER, BTN_PRIMARY, BTN_SECONDARY, Card, EmptyState, Field, INPUT, PILL, Pill, Segmented } from './marketing/MarketingUi';

const STARTER_BODY = '<p>Start with a short introduction.</p>\n\n<h2>First heading</h2>\n<p>Write your paragraph here.</p>';

const emptyDraft = (): Partial<BlogPost> => ({
  title: '',
  slug: '',
  excerpt: '',
  bodyHtml: STARTER_BODY,
  heroImageUrl: '',
  metaTitle: '',
  metaDescription: '',
  metaKeywords: '',
  published: false,
});

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);

const textOf = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const PREVIEW_CLASSES =
  'space-y-4 text-slate-700 [&_article]:contents [&_h2]:text-2xl [&_h2]:font-black [&_h2]:text-slate-900 [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-lg [&_h3]:font-black [&_h3]:text-slate-900 [&_h3]:mt-6 [&_p]:leading-relaxed [&_a]:text-teal-700 [&_a]:font-bold [&_a]:underline [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:border-teal-500 [&_blockquote]:pl-4 [&_blockquote]:italic';

type Filter = 'all' | 'published' | 'drafts';

const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

const BlogManager: React.FC = () => {
  const { showFlyer } = useFlyer();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<'list' | 'edit'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<BlogPost>>(emptyDraft);
  const [slugTouched, setSlugTouched] = useState(false);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const load = () => {
    setLoadError(null);
    return apiAdmin
      .getBlogPostsAdmin()
      .then((rows) => setPosts(Array.isArray(rows) ? rows : []))
      .catch((e) => {
        setPosts([]);
        setLoadError(e instanceof Error ? e.message : 'Could not load posts');
        showFlyer('Could not load blog posts. Check that you are signed in as admin.', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof BlogPost>(k: K, v: BlogPost[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const startNew = () => {
    setEditingId(null);
    setDraft(emptyDraft());
    setSlugTouched(false);
    setMode('write');
    setView('edit');
  };

  const startEdit = (p: BlogPost) => {
    setEditingId(p.id);
    setDraft({ ...p });
    setSlugTouched(true);
    setMode('write');
    setView('edit');
  };

  const save = async (published: boolean) => {
    if (!draft.title?.trim()) return showFlyer('Give your post a title.', 'error');
    if (!textOf(draft.bodyHtml || '')) return showFlyer('Write something in the post before saving.', 'error');
    setSaving(true);
    const payload = {
      title: draft.title.trim(),
      slug: draft.slug?.trim() || undefined,
      excerpt: draft.excerpt?.trim() || null,
      bodyHtml: draft.bodyHtml || '',
      heroImageUrl: draft.heroImageUrl?.trim() || null,
      metaTitle: draft.metaTitle?.trim() || null,
      metaDescription: draft.metaDescription?.trim() || null,
      metaKeywords: draft.metaKeywords?.trim() || null,
      published,
    };
    try {
      if (editingId != null) {
        await apiAdmin.updateBlogPost(Number(editingId), payload);
      } else {
        await apiAdmin.createBlogPost(payload);
      }
      showFlyer(published ? 'Post published.' : 'Draft saved.', 'success');
      await load();
      setView('list');
    } catch (e) {
      showFlyer((e as Error).message || 'Save failed. If it mentions the slug, try a different web address.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Pick<BlogPost, 'id' | 'title'>) => {
    if (!window.confirm(`Delete "${p.title}" permanently?`)) return;
    try {
      await apiAdmin.deleteBlogPost(p.id);
      showFlyer('Post deleted.', 'success');
      await load();
      if (editingId === p.id) setView('list');
    } catch (e) {
      showFlyer((e as Error).message || 'Delete failed', 'error');
    }
  };

  /** Wrap the selected text (or insert a snippet) in the body editor. */
  const insert = (before: string, after = '', placeholder = 'text') => {
    const el = bodyRef.current;
    const body = draft.bodyHtml || '';
    if (!el) return set('bodyHtml', body + before + placeholder + after);
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = body.slice(start, end) || placeholder;
    const next = body.slice(0, start) + before + selected + after + body.slice(end);
    set('bodyHtml', next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const counts = useMemo(
    () => ({ all: posts.length, published: posts.filter((p) => p.published).length, drafts: posts.filter((p) => !p.published).length }),
    [posts]
  );
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return posts
      .filter((p) => filter === 'all' || (filter === 'published' ? p.published : !p.published))
      .filter((p) => !q || `${p.title} ${p.excerpt ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
  }, [posts, filter, search]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  /* ------------------------------------------------------------------ Editor */
  if (view === 'edit') {
    const words = textOf(draft.bodyHtml || '').split(' ').filter(Boolean).length;
    const minutes = Math.max(1, Math.round(words / 200));
    const seoTitle = draft.metaTitle?.trim() || draft.title?.trim() || 'Post title';
    const seoDesc = draft.metaDescription?.trim() || draft.excerpt?.trim() || textOf(draft.bodyHtml || '').slice(0, 155) || 'A short summary of your post.';
    const slug = draft.slug?.trim() || slugify(draft.title || '') || 'your-post';
    const isLive = editingId != null && posts.find((p) => p.id === editingId)?.published;
    const tools: { icon: React.ReactNode; label: string; run: () => void }[] = [
      { icon: <Heading2 className="h-4 w-4" />, label: 'Heading', run: () => insert('<h2>', '</h2>', 'Heading') },
      { icon: <Heading3 className="h-4 w-4" />, label: 'Subheading', run: () => insert('<h3>', '</h3>', 'Subheading') },
      { icon: <Pilcrow className="h-4 w-4" />, label: 'Paragraph', run: () => insert('<p>', '</p>', 'Paragraph') },
      { icon: <Bold className="h-4 w-4" />, label: 'Bold', run: () => insert('<strong>', '</strong>') },
      { icon: <Italic className="h-4 w-4" />, label: 'Italic', run: () => insert('<em>', '</em>') },
      {
        icon: <Link2 className="h-4 w-4" />,
        label: 'Link',
        run: () => {
          const url = window.prompt('Link address (for example /contact-us or https://…)');
          if (url) insert(`<a href="${url.replace(/"/g, '&quot;')}">`, '</a>', 'link text');
        },
      },
      { icon: <List className="h-4 w-4" />, label: 'Bullet list', run: () => insert('<ul>\n  <li>', '</li>\n  <li>Second point</li>\n</ul>', 'First point') },
      { icon: <Quote className="h-4 w-4" />, label: 'Quote', run: () => insert('<blockquote>', '</blockquote>', 'Quote') },
    ];

    return (
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={() => setView('list')} className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> All posts
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={isLive ? PILL.green : PILL.slate}>{isLive ? 'Published' : editingId != null ? 'Draft' : 'New post'}</Pill>
            <button type="button" className={BTN_SECONDARY} disabled={saving} onClick={() => void save(false)}>
              {isLive ? 'Unpublish' : 'Save draft'}
            </button>
            <button type="button" className={BTN_PRIMARY} disabled={saving} onClick={() => void save(true)}>
              {saving ? 'Saving…' : isLive ? 'Update post' : 'Publish'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-4">
            <Card className="space-y-4 p-4 sm:p-6">
              <input
                className="w-full border-0 bg-transparent p-0 text-2xl font-black text-slate-900 outline-none placeholder:text-slate-300 sm:text-3xl"
                placeholder="Post title"
                value={draft.title || ''}
                onChange={(e) => {
                  const title = e.target.value;
                  setDraft((d) => ({ ...d, title, ...(slugTouched ? {} : { slug: slugify(title) }) }));
                }}
              />
              <div className="flex min-w-0 items-center gap-1 rounded-xl bg-slate-50 px-3 py-2 text-xs">
                <span className="shrink-0 font-semibold text-slate-400">cleanitneatly.com/cleaning-blog/</span>
                <input
                  className="min-w-0 flex-1 bg-transparent font-mono font-bold text-slate-700 outline-none"
                  aria-label="Web address"
                  value={draft.slug || ''}
                  placeholder="your-post"
                  onChange={(e) => {
                    setSlugTouched(true);
                    set('slug', slugify(e.target.value));
                  }}
                />
              </div>
              <Field label="Summary" hint="Shown on the blog list and used by Google when no description is set." counter={{ value: (draft.excerpt || '').length, max: 160 }}>
                <textarea className={`${INPUT} min-h-[64px]`} value={draft.excerpt || ''} onChange={(e) => set('excerpt', e.target.value)} />
              </Field>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
                <div className="flex flex-wrap items-center gap-0.5">
                  {tools.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      title={t.label}
                      aria-label={t.label}
                      disabled={mode === 'preview'}
                      onClick={t.run}
                      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-30"
                    >
                      {t.icon}
                    </button>
                  ))}
                </div>
                <Segmented
                  ariaLabel="Editor mode"
                  value={mode}
                  onChange={setMode}
                  items={[
                    { id: 'write', label: 'Write' },
                    { id: 'preview', label: 'Preview' },
                  ]}
                />
              </div>
              {mode === 'write' ? (
                <textarea
                  ref={bodyRef}
                  className="block min-h-[420px] w-full resize-y border-0 p-4 font-mono text-[13px] leading-relaxed text-slate-800 outline-none sm:p-6"
                  value={draft.bodyHtml || ''}
                  onChange={(e) => set('bodyHtml', e.target.value)}
                  spellCheck
                />
              ) : (
                <div className="min-h-[420px] p-4 sm:p-8">
                  {draft.heroImageUrl ? <img src={draft.heroImageUrl} alt="" className="mb-6 max-h-72 w-full rounded-2xl object-cover" /> : null}
                  <h1 className="text-3xl font-black leading-tight text-slate-900">{draft.title || 'Post title'}</h1>
                  {draft.excerpt ? <p className="mt-3 text-lg leading-relaxed text-slate-600">{draft.excerpt}</p> : null}
                  <div className={`mt-6 ${PREVIEW_CLASSES}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(draft.bodyHtml || '') }} />
                </div>
              )}
              <div className="border-t border-slate-100 px-4 py-2 text-[11px] font-semibold text-slate-400">
                {words} words · about {minutes} min read · select text and use the buttons above to format it
              </div>
            </Card>
          </div>

          <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
            <Card className="space-y-3 p-4">
              <p className="text-sm font-black text-slate-900">Cover photo</p>
              <CmsImageInput inputId="blog-hero" value={draft.heroImageUrl || ''} onChange={(url) => set('heroImageUrl', url)} />
            </Card>

            <Card className="space-y-4 p-4">
              <div>
                <p className="text-sm font-black text-slate-900">Google search preview</p>
                <p className="text-xs text-slate-500">How this post can appear in search results.</p>
              </div>
              <div className="rounded-xl border border-slate-100 bg-white p-3">
                <p className="truncate text-[11px] text-slate-500">cleanitneatly.com › cleaning-blog › {slug}</p>
                <p className="mt-0.5 line-clamp-2 text-base font-medium leading-snug text-[#1a0dab]">{seoTitle}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-600">{seoDesc}</p>
              </div>
              <Field label="Search title (optional)" counter={{ value: (draft.metaTitle || '').length, max: 60 }}>
                <input className={INPUT} value={draft.metaTitle || ''} onChange={(e) => set('metaTitle', e.target.value)} placeholder={draft.title || ''} />
              </Field>
              <Field label="Search description (optional)" counter={{ value: (draft.metaDescription || '').length, max: 160 }}>
                <textarea className={`${INPUT} min-h-[72px]`} value={draft.metaDescription || ''} onChange={(e) => set('metaDescription', e.target.value)} />
              </Field>
              <Field label="Keywords (optional)" hint="Separate with commas.">
                <input className={INPUT} value={draft.metaKeywords || ''} onChange={(e) => set('metaKeywords', e.target.value)} placeholder="deep cleaning, manchester" />
              </Field>
            </Card>

            {editingId != null ? (
              <button type="button" className={`${BTN_GHOST_DANGER} w-full`} onClick={() => void handleDelete({ id: editingId, title: draft.title || 'this post' })}>
                <Trash2 className="h-4 w-4" /> Delete post
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------------------- List */
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Segmented
          ariaLabel="Filter posts"
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'published', label: 'Published', count: counts.published },
            { id: 'drafts', label: 'Drafts', count: counts.drafts },
          ]}
        />
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1 lg:w-64 lg:flex-none">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="search" className={`${INPUT} pl-10`} placeholder="Search posts" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button type="button" className={BTN_PRIMARY} onClick={startNew}>
            <Plus className="h-4 w-4" /> New post
          </button>
        </div>
      </div>

      {loadError && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{loadError}</p>}

      {posts.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title="No blog posts yet"
          text="Cleaning tips and local guides help customers find you on Google."
          action={
            <button type="button" className={BTN_PRIMARY} onClick={startNew}>
              <Plus className="h-4 w-4" /> Write your first post
            </button>
          }
        />
      ) : shown.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-slate-500">No posts match.</p>
      ) : (
        <div className="space-y-3">
          {shown.map((p) => (
            <Card key={p.id} className="flex flex-col gap-4 p-3 transition hover:shadow-md sm:flex-row sm:items-center sm:p-4">
              <button type="button" onClick={() => startEdit(p)} className="h-36 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 sm:h-20 sm:w-32">
                {p.heroImageUrl ? (
                  <img src={p.heroImageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-slate-300">
                    <FileText className="h-6 w-6" />
                  </span>
                )}
              </button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={p.published ? PILL.green : PILL.slate}>{p.published ? 'Published' : 'Draft'}</Pill>
                  <span className="text-[11px] font-semibold text-slate-400">
                    {p.published && p.publishedAt ? `Published ${fmtDate(p.publishedAt)}` : p.updatedAt ? `Edited ${fmtDate(p.updatedAt)}` : fmtDate(p.createdAt)}
                  </span>
                </div>
                <button type="button" onClick={() => startEdit(p)} className="mt-1 block max-w-full truncate text-left font-black text-slate-900 hover:text-blue-700">
                  {p.title}
                </button>
                <p className="line-clamp-1 text-sm text-slate-500">{p.excerpt || textOf(p.bodyHtml || '').slice(0, 140)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" className={`${BTN_SECONDARY} px-3 py-2 text-xs`} onClick={() => startEdit(p)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                {p.published ? (
                  <a
                    href={`/cleaning-blog/${p.slug}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="View on website"
                    aria-label={`View ${p.title} on the website`}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                ) : (
                  <span className="p-2 text-slate-200" title="Publish to view on the website">
                    <Eye className="h-4 w-4" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void handleDelete(p)}
                  className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                  title="Delete"
                  aria-label={`Delete ${p.title}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default BlogManager;
