import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, ExternalLink, Eye, EyeOff, ImageIcon, Pencil, Plus, Trash2 } from 'lucide-react';
import type { GalleryItem } from '../../types';
import { apiAdmin } from '../../services/api';
import { useFlyer } from '../Flyer';
import CmsImageInput from './CmsImageInput';
import { BTN_GHOST_DANGER, BTN_PRIMARY, BTN_SECONDARY, EmptyState, Field, INPUT, PILL, Pill, Segmented, SidePanel, Switch } from './marketing/MarketingUi';

const emptyDraft = (): Partial<GalleryItem> => ({
  title: '',
  imageUrl: '',
  caption: '',
  sortOrder: 0,
  published: true,
});

type Filter = 'all' | 'published' | 'hidden';

const byOrder = (a: GalleryItem, b: GalleryItem) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id;

const GalleryManager: React.FC = () => {
  const { showFlyer } = useFlyer();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Partial<GalleryItem>>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = () => {
    setLoadError(null);
    return apiAdmin
      .getGalleryAdmin()
      .then((rows) => setItems(Array.isArray(rows) ? [...rows].sort(byOrder) : []))
      .catch((e) => {
        setItems([]);
        setLoadError(e instanceof Error ? e.message : 'Could not load gallery');
        showFlyer('Could not load gallery. Check that you are signed in as admin.', 'error');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const counts = useMemo(
    () => ({ all: items.length, published: items.filter((i) => i.published).length, hidden: items.filter((i) => !i.published).length }),
    [items]
  );
  const shown = items.filter((i) => filter === 'all' || (filter === 'published' ? i.published : !i.published));

  const openNew = () => {
    setEditingId(null);
    setDraft({ ...emptyDraft(), sortOrder: items.length ? Math.max(...items.map((i) => i.sortOrder ?? 0)) + 10 : 0 });
    setPanelOpen(true);
  };

  const openEdit = (it: GalleryItem) => {
    setEditingId(it.id);
    setDraft({ title: it.title, imageUrl: it.imageUrl, caption: it.caption ?? '', sortOrder: it.sortOrder ?? 0, published: it.published });
    setPanelOpen(true);
  };

  const save = async () => {
    if (!draft.title?.trim() || !draft.imageUrl?.trim()) {
      showFlyer('Add a photo and a title first.', 'error');
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
        showFlyer('Photo updated.', 'success');
      } else {
        await apiAdmin.createGalleryItem(payload);
        showFlyer('Photo added to the gallery.', 'success');
      }
      setPanelOpen(false);
      await load();
    } catch (e) {
      showFlyer((e as Error).message || 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (it: GalleryItem) => {
    if (!window.confirm(`Remove "${it.title}" from the gallery?`)) return;
    try {
      await apiAdmin.deleteGalleryItem(it.id);
      if (editingId === it.id) setPanelOpen(false);
      showFlyer('Photo removed.', 'success');
      await load();
    } catch (e) {
      showFlyer((e as Error).message || 'Delete failed', 'error');
    }
  };

  const togglePublished = async (it: GalleryItem) => {
    setBusyId(it.id);
    try {
      await apiAdmin.updateGalleryItem(it.id, { published: !it.published });
      setItems((prev) => prev.map((x) => (x.id === it.id ? { ...x, published: !it.published } : x)));
      showFlyer(it.published ? 'Hidden from the website.' : 'Now showing on the website.', 'success');
    } catch (e) {
      showFlyer((e as Error).message || 'Update failed', 'error');
    } finally {
      setBusyId(null);
    }
  };

  /** Swap a photo with its neighbour and save new positions (spaced by 10). */
  const movePhoto = async (it: GalleryItem, dir: -1 | 1) => {
    const order = [...items].sort(byOrder);
    const i = order.findIndex((x) => x.id === it.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    const next = order.map((x, idx) => ({ ...x, sortOrder: idx * 10 }));
    const changed = next.filter((x) => items.find((y) => y.id === x.id)?.sortOrder !== x.sortOrder);
    setItems(next);
    try {
      await Promise.all(changed.map((x) => apiAdmin.updateGalleryItem(x.id, { sortOrder: x.sortOrder })));
    } catch {
      showFlyer('Could not save the new order.', 'error');
      void load();
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          ariaLabel="Filter photos"
          value={filter}
          onChange={setFilter}
          items={[
            { id: 'all', label: 'All', count: counts.all },
            { id: 'published', label: 'On website', count: counts.published },
            { id: 'hidden', label: 'Hidden', count: counts.hidden },
          ]}
        />
        <div className="flex items-center gap-2">
          <a href="/cleaning-gallery" target="_blank" rel="noreferrer" className={`${BTN_SECONDARY} px-3`}>
            <ExternalLink className="h-4 w-4" /> <span className="hidden sm:inline">View page</span>
          </a>
          <button type="button" className={BTN_PRIMARY} onClick={openNew}>
            <Plus className="h-4 w-4" /> Add photo
          </button>
        </div>
      </div>

      {loadError && <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800">{loadError}</p>}

      {items.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-6 w-6" />}
          title="Your gallery is empty"
          text="Show off your best before-and-after photos. They appear on the Gallery page of your website."
          action={
            <button type="button" className={BTN_PRIMARY} onClick={openNew}>
              <Plus className="h-4 w-4" /> Add your first photo
            </button>
          }
        />
      ) : shown.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-sm font-semibold text-slate-500">No photos in this view.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 md:grid-cols-3 2xl:grid-cols-4">
          {shown.map((it) => {
            const pos = items.findIndex((x) => x.id === it.id);
            return (
              <li key={it.id} className={`group overflow-hidden rounded-2xl border bg-white ${it.published ? 'border-slate-200' : 'border-dashed border-slate-300'}`}>
                <div className="relative aspect-[4/3] bg-slate-100">
                  <img src={it.imageUrl} alt={it.title} className={`h-full w-full object-cover ${it.published ? '' : 'opacity-50 grayscale'}`} loading="lazy" />
                  <div className="absolute left-2 top-2 flex gap-1.5">
                    <span className="rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-white">#{pos + 1}</span>
                    {!it.published ? (
                      <Pill tone={PILL.slate}>
                        <EyeOff className="h-3 w-3" /> Hidden
                      </Pill>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(it)}
                    className="absolute inset-0 flex items-center justify-center bg-slate-900/0 text-white opacity-0 transition group-hover:bg-slate-900/40 group-hover:opacity-100 focus-visible:bg-slate-900/40 focus-visible:opacity-100"
                    aria-label={`Edit ${it.title}`}
                  >
                    <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-black text-slate-900">
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </span>
                  </button>
                </div>
                <div className="space-y-2 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{it.title}</p>
                    <p className="truncate text-xs text-slate-500">{it.caption || 'No caption'}</p>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Switch checked={it.published} disabled={busyId === it.id} onChange={() => void togglePublished(it)} label={`Show ${it.title} on the website`} />
                      <span className="text-[11px] font-bold text-slate-500">{it.published ? 'On website' : 'Hidden'}</span>
                    </div>
                    <div className="flex items-center">
                      <button
                        type="button"
                        disabled={pos === 0}
                        onClick={() => void movePhoto(it, -1)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        aria-label="Move earlier"
                        title="Move earlier"
                      >
                        <ArrowLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        disabled={pos === items.length - 1}
                        onClick={() => void movePhoto(it, 1)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                        aria-label="Move later"
                        title="Move later"
                      >
                        <ArrowRight className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(it)}
                        className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                        aria-label={`Delete ${it.title}`}
                        title="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <SidePanel
        open={panelOpen}
        onClose={() => !saving && setPanelOpen(false)}
        title={editingId != null ? 'Edit photo' : 'Add a photo'}
        subtitle="Photos appear on the Gallery page in the order shown here."
        footer={
          <>
            {editingId != null ? (
              <button
                type="button"
                className={`${BTN_GHOST_DANGER} mr-auto`}
                onClick={() => {
                  const it = items.find((x) => x.id === editingId);
                  if (it) void handleDelete(it);
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            ) : null}
            <button type="button" className={BTN_SECONDARY} onClick={() => setPanelOpen(false)} disabled={saving}>
              Cancel
            </button>
            <button type="button" className={BTN_PRIMARY} onClick={() => void save()} disabled={saving}>
              {saving ? 'Saving…' : editingId != null ? 'Save changes' : 'Add to gallery'}
            </button>
          </>
        }
      >
        <Field label="Photo">
          <CmsImageInput
            inputId={editingId != null ? `gallery-edit-${editingId}` : 'gallery-draft'}
            value={draft.imageUrl || ''}
            onChange={(url) => setDraft((d) => ({ ...d, imageUrl: url }))}
          />
        </Field>
        <Field label="Title" hint="Also used as the image description for search engines and screen readers.">
          <input className={INPUT} value={draft.title || ''} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder="Kitchen deep clean, Didsbury" />
        </Field>
        <Field label="Caption (optional)">
          <textarea
            className={`${INPUT} min-h-[72px]`}
            value={draft.caption || ''}
            onChange={(e) => setDraft((d) => ({ ...d, caption: e.target.value }))}
            placeholder="Before and after an end of tenancy clean."
          />
        </Field>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
              {draft.published !== false ? <Eye className="h-4 w-4 text-emerald-600" /> : <EyeOff className="h-4 w-4 text-slate-400" />}
              Show on the website
            </p>
            <p className="text-xs text-slate-500">Turn off to keep the photo here without showing it.</p>
          </div>
          <Switch checked={draft.published !== false} onChange={(v) => setDraft((d) => ({ ...d, published: v }))} label="Show on the website" />
        </div>
      </SidePanel>
    </div>
  );
};

export default GalleryManager;
