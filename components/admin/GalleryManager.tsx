import React, { useEffect, useState } from 'react';
import { ImageIcon, Loader2, Plus, Pencil, Trash2 } from 'lucide-react';
import type { GalleryItem } from '../../types';
import { apiAdmin } from '../../services/api';
import { useFlyer } from '../Flyer';
import CmsImageInput from './CmsImageInput';

const emptyDraft = (): Partial<GalleryItem> => ({
  title: '',
  imageUrl: '',
  caption: '',
  sortOrder: 0,
  published: true,
});

const GalleryManager: React.FC = () => {
  const { showFlyer } = useFlyer();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<GalleryItem>>(emptyDraft);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoadError(null);
    void apiAdmin
      .getGalleryAdmin()
      .then((rows) => {
        setItems(Array.isArray(rows) ? rows : []);
      })
      .catch((e) => {
        setItems([]);
        setLoadError(e instanceof Error ? e.message : 'Could not load gallery');
        showFlyer('Could not load gallery. Check that you are signed in as admin.', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const startNew = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const startEdit = (it: GalleryItem) => {
    setEditingId(it.id);
    setDraft({
      title: it.title,
      imageUrl: it.imageUrl,
      caption: it.caption ?? '',
      sortOrder: it.sortOrder ?? 0,
      published: it.published,
    });
  };

  const save = async () => {
    if (!draft.title?.trim() || !draft.imageUrl?.trim()) {
      showFlyer('Title and an image are required — paste a URL/path or upload a file.', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        imageUrl: draft.imageUrl.trim(),
        caption: draft.caption?.trim() || null,
        sortOrder: Number(draft.sortOrder) || 0,
        published: draft.published !== false,
      };
      if (editingId != null) {
        await apiAdmin.updateGalleryItem(editingId, payload);
        showFlyer('Gallery image updated.', 'success');
      } else {
        await apiAdmin.createGalleryItem(payload);
        showFlyer('Gallery image added.', 'success');
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
    if (!window.confirm('Remove this image from the public gallery?')) return;
    try {
      await apiAdmin.deleteGalleryItem(id);
      if (editingId === id) startNew();
      showFlyer('Removed.', 'success');
      load();
    } catch (e) {
      showFlyer((e as Error).message || 'Delete failed', 'error');
    }
  };

  const quickTogglePublished = async (it: GalleryItem, published: boolean) => {
    try {
      await apiAdmin.updateGalleryItem(it.id, { published });
      showFlyer('Saved.', 'success');
      load();
    } catch (e) {
      showFlyer((e as Error).message || 'Update failed', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-500 font-bold py-12">
        <Loader2 className="w-5 h-5 animate-spin" /> Loading gallery…
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl pb-8">
      <div>
        <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
          <ImageIcon className="w-5 h-5 text-blue-600" />
          Gallery
        </h3>
        <p className="text-sm text-slate-600 mt-1">
          Images appear on <strong>/cleaning-gallery</strong>. Paste a public path (e.g.{' '}
          <code className="text-xs bg-slate-100 px-1 rounded">/siteshots/photo.png</code>) or an HTTPS URL — or upload (stored as JPEG in
          the database). If saving fails right after an upload, restart the API once so MySQL can widen the image column.
        </p>
        {loadError && (
          <p className="text-sm text-amber-800 font-bold mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">{loadError}</p>
        )}
      </div>

      <div className="rounded-2xl border-2 border-slate-100 bg-slate-50/80 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {editingId != null ? `Edit image #${editingId}` : 'Add new image'}
          </p>
          {editingId != null && (
            <button
              type="button"
              onClick={startNew}
              className="text-xs font-black uppercase tracking-widest text-blue-600 hover:text-blue-800"
            >
              Cancel edit
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <input
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-sm font-bold md:col-span-2"
            placeholder="Title"
            value={draft.title || ''}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <div className="md:col-span-2 space-y-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Image — URL or upload</p>
            <CmsImageInput
              inputId={editingId != null ? `gallery-edit-${editingId}` : 'gallery-draft'}
              value={draft.imageUrl || ''}
              onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
            />
          </div>
          <input
            className="w-full p-3 rounded-xl border border-slate-200 bg-white text-sm md:col-span-2"
            placeholder="Caption (optional)"
            value={draft.caption || ''}
            onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
          />
          <label className="flex items-center gap-2 text-sm font-bold text-slate-700">
            Sort order
            <input
              type="number"
              className="w-24 p-2 rounded-lg border border-slate-200"
              value={draft.sortOrder ?? 0}
              onChange={(e) => setDraft((d) => ({ ...d, sortOrder: Number(e.target.value) }))}
            />
          </label>
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
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-black text-xs uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50"
        >
          {editingId != null ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {saving ? 'Saving…' : editingId != null ? 'Save changes' : 'Add to gallery'}
        </button>
      </div>

      <div>
        <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-3">
          Gallery items ({items.length})
        </h4>
        {items.length === 0 ? (
          <p className="text-sm text-slate-500 font-medium bg-white border border-slate-100 rounded-2xl p-6">
            No images yet. Add one above — it will appear on the public gallery page when published.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((it) => (
              <li
                key={it.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-4 p-4 rounded-2xl border shadow-sm ${
                  editingId === it.id ? 'border-blue-300 bg-blue-50/50 ring-1 ring-blue-200' : 'border-slate-100 bg-white'
                }`}
              >
                <div className="w-full sm:w-28 h-24 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                  <img src={it.imageUrl} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0 space-y-2">
                  <p className="font-black text-slate-900 truncate">{it.title}</p>
                  {it.caption && <p className="text-sm text-slate-600 line-clamp-2">{it.caption}</p>}
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1 font-bold text-slate-600">
                      <input
                        type="checkbox"
                        checked={it.published}
                        onChange={(e) => void quickTogglePublished(it, e.target.checked)}
                      />
                      Published
                    </label>
                    <span className="text-slate-400 font-mono">order {it.sortOrder}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => startEdit(it)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest bg-slate-100 text-slate-800 hover:bg-slate-200"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(it.id)}
                    className="p-2 rounded-xl text-red-600 hover:bg-red-50"
                    aria-label="Delete"
                  >
                    <Trash2 className="w-5 h-5" />
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

export default GalleryManager;
