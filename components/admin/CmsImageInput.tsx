import React, { useId, useRef, useState } from 'react';
import { ImagePlus, Link2, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import { processImageFileForCms } from '../../src/utils/cmsImageUpload';

type Props = {
  value: string;
  onChange: (url: string) => void;
  /** Unique id prefix so multiple rows don’t clash */
  inputId: string;
  /** Replaces the default helper line under the field (e.g. blog optional hero) */
  helperText?: string;
};

/**
 * Image picker for website content: drop or choose a photo (resized to JPEG in the browser),
 * or paste a link/path instead. Shows a preview with Replace and Remove once set.
 */
const CmsImageInput: React.FC<Props> = ({ value, onChange, inputId, helperText }) => {
  const reactId = useId();
  const fileId = `${inputId}-${reactId.replace(/:/g, '')}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [showLink, setShowLink] = useState(() => Boolean(value && !value.startsWith('data:')));

  const processFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setErr('Please choose an image file (JPG, PNG or WebP).');
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      onChange(await processImageFileForCms(file));
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    void processFile(file);
  };

  const showPreview = Boolean(value && (value.startsWith('data:') || value.startsWith('http') || value.startsWith('/')));
  const isUpload = value.startsWith('data:');

  return (
    <div className="w-full min-w-0 space-y-2">
      <input ref={fileRef} id={fileId} type="file" accept="image/*" className="sr-only" onChange={handleFile} disabled={busy} />

      {showPreview ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:flex-row sm:items-center">
          <img src={value} alt="" className="h-28 w-full rounded-xl border border-slate-100 bg-slate-100 object-cover sm:w-44" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate text-xs font-semibold text-slate-500">{isUpload ? 'Uploaded image' : value}</p>
            <div className="flex flex-wrap gap-2">
              <label
                htmlFor={fileId}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 ${busy ? 'pointer-events-none opacity-60' : ''}`}
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                {busy ? 'Processing…' : 'Replace'}
              </label>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"
                onClick={() => onChange('')}
              >
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={fileId}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void processFile(e.dataTransfer.files?.[0]);
          }}
          className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition ${
            dragging ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40'
          } ${busy ? 'pointer-events-none opacity-60' : ''}`}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" />}
          </span>
          <span className="text-sm font-bold text-slate-800">{busy ? 'Processing image…' : 'Drop a photo here or click to upload'}</span>
          <span className="text-[11px] text-slate-500">JPG, PNG or WebP. Large photos are resized for you.</span>
        </label>
      )}

      {err ? <p className="text-xs font-semibold text-red-600">{err}</p> : null}

      {showLink ? (
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            type="text"
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20"
            value={isUpload ? '' : value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://… or /siteshots/photo.png"
            aria-label="Image link or path"
          />
        </div>
      ) : (
        <button type="button" onClick={() => setShowLink(true)} className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800">
          <Link2 className="h-3.5 w-3.5" /> Use an image link instead
        </button>
      )}

      {helperText ? <p className="text-[11px] text-slate-500">{helperText}</p> : null}
    </div>
  );
};

export default CmsImageInput;
