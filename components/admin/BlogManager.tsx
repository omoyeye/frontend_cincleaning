import React, { useEffect, useState } from 'react';
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import type { BlogPost } from '../../types';
import { apiAdmin } from '../../services/api';
import { useFlyer } from '../Flyer';
import CmsImageInput from './CmsImageInput';

const BlogManager: React.FC = () => {
  const { showFlyer } = useFlyer();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<BlogPost>>({
    title: '',
    slug: '',
    excerpt: '',
    bodyHtml: '',
    heroImageUrl: '',
    metaTitle: '',
    metaDescription: '',
    metaKeywords: '',
    published: true,
  });
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoadError(null);
    void apiAdmin
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
    load();
  }, []);

  const startNew = () => {
    setEditingId(null);
    setDraft({
      title: '',
      slug: '',
      excerpt: '',
      bodyHtml: '<article><p>Your introduction</p><h2>Heading</h2><p>Paragraph…</p></article>',
      heroImageUrl: '',
      metaTitle: '',
      metaDescription: '',
      metaKeywords: '',
      published: true,
    });
  };

  const startEdit = (p: BlogPost) => {
    setEditingId(p.id);
    setDraft({ ...p });
  };

  const save = async () => {
    if (!draft.title?.trim() || !draft.bodyHtml?.trim()) {
      showFlyer('Title and body HTML are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      if (editingId != null) {
        const postId = Number(editingId);
        if (!Number.isFinite(postId) || postId < 1) {
          showFlyer('Invalid post id. Reload the page and try again.', 'error');
          return;
        }
        await apiAdmin.updateBlogPost(postId, {
          title: draft.title.trim(),
          slug: draft.slug?.trim() || undefined,
          excerpt: draft.excerpt?.trim() || null,
          bodyHtml: draft.bodyHtml,
          heroImageUrl: draft.heroImageUrl?.trim() || null,
          metaTitle: draft.metaTitle?.trim() || null,
          metaDescription: draft.metaDescription?.trim() || null,
          metaKeywords: draft.metaKeywords?.trim() || null,
          published: draft.published !== false,
        });
        showFlyer('Post updated.', 'success');
      } else {
        await apiAdmin.createBlogPost({
          title: draft.title.trim(),
          slug: draft.slug?.trim() || undefined,
          excerpt: draft.excerpt?.trim() || null,
          bodyHtml: draft.bodyHtml,
          heroImageUrl: draft.heroImageUrl?.trim() || null,
          metaTitle: draft.metaTitle?.trim() || null,
          metaDescription: draft.metaDescription?.trim() || null,
          metaKeywords: draft.metaKeywords?.trim() || null,
          published: draft.published !== false,
        });
        showFlyer('Post created.', 'success');
      }
      startNew();
      load();
    } catch (e) {
      showFlyer((e as Error).message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this post permanently?')) return;
    try {
      await apiAdmin.deleteBlogPost(id);
      if (editingId === id) startNew();
      showFlyer('Deleted.', 'success');
      load();
    } catch (e) {
      showFlyer((e as Error).message || 'Delete failed', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 font-bold py-12">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading posts…
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Blog
          </h3>
          <p className="text-sm text-slate-600 mt-1">
            Posts appear on <strong>/cleaning-blog</strong> and at <strong>/cleaning-blog/your-slug</strong>. Use semantic HTML for SEO (headings, paragraphs, internal links). Create posts below; use <strong>Edit</strong> to update or delete from the list. Each post needs a{' '}
            <strong>unique slug</strong> — if an update fails, try a different slug. Long HTML and uploaded hero images need a recent API restart so MySQL can widen columns.
          </p>
          {loadError && (
            <p className="text-sm text-amber-800 font-bold mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{loadError}</p>
          )}
        </div>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          New post
        </button>
      </div>

      <div className="rounded-2xl border-2 border-slate-100 bg-slate-50/80 p-5 space-y-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {editingId != null ? `Edit post #${editingId}` : 'New post'}
        </p>
        <div className="grid grid-cols-1 gap-3">
          <input
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-sm font-bold"
            placeholder="Title"
            value={draft.title || ''}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <input
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-sm font-mono"
            placeholder="Slug (optional - auto from title)"
            value={draft.slug || ''}
            onChange={(e) => setDraft((d) => ({ ...d, slug: e.target.value }))}
          />
          <textarea
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-sm min-h-[72px]"
            placeholder="Excerpt (meta description fallback)"
            value={draft.excerpt || ''}
            onChange={(e) => setDraft((d) => ({ ...d, excerpt: e.target.value }))}
          />
          <textarea
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-sm font-mono min-h-[220px]"
            placeholder="Body HTML"
            value={draft.bodyHtml || ''}
            onChange={(e) => setDraft((d) => ({ ...d, bodyHtml: e.target.value }))}
          />
          <div className="space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Hero image (optional)</p>
            <CmsImageInput
              inputId="blog-hero"
              value={draft.heroImageUrl || ''}
              onChange={(url) => setDraft((d) => ({ ...d, heroImageUrl: url }))}
              helperText="Optional — paste a URL or upload. You do not need both; leave everything empty for no hero image."
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className="w-full p-3 rounded-xl border border-slate-200 bg-white text-xs"
              placeholder="Meta title (optional)"
              value={draft.metaTitle || ''}
              onChange={(e) => setDraft((d) => ({ ...d, metaTitle: e.target.value }))}
            />
            <input
              className="w-full p-3 rounded-xl border border-slate-200 bg-white text-xs md:col-span-2"
              placeholder="Meta keywords (optional)"
              value={draft.metaKeywords || ''}
              onChange={(e) => setDraft((d) => ({ ...d, metaKeywords: e.target.value }))}
            />
          </div>
          <textarea
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-sm min-h-[64px]"
            placeholder="Meta description (optional)"
            value={draft.metaDescription || ''}
            onChange={(e) => setDraft((d) => ({ ...d, metaDescription: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
            <input
              type="checkbox"
              checked={draft.published !== false}
              onChange={(e) => setDraft((d) => ({ ...d, published: e.target.checked }))}
            />
            Published
          </label>
        </div>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="px-5 py-2.5 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : editingId != null ? 'Update post' : 'Publish post'}
        </button>
      </div>

      <div>
        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-3">All posts ({posts.length})</h4>
        {posts.length === 0 ? (
          <p className="text-sm text-slate-500 font-medium bg-white border border-slate-100 rounded-2xl p-6">
            No posts yet. Fill in the form above and click Publish post — then manage entries here.
          </p>
        ) : (
          <ul className="space-y-2">
            {posts.map((p) => (
              <li
                key={p.id}
                className={`flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border bg-white ${
                  editingId === p.id ? 'border-blue-300 ring-1 ring-blue-200' : 'border-slate-100'
                }`}
              >
                <div className="min-w-0">
                  <p className="font-black text-slate-900 truncate">{p.title}</p>
                  <p className="text-xs text-slate-500 font-mono truncate">/{p.slug}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => startEdit(p)} className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest bg-slate-100 hover:bg-slate-200">
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(p.id)}
                    className="p-2 rounded-lg text-red-600 hover:bg-red-50"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default BlogManager;
