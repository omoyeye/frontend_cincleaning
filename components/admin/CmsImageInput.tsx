import React, { useId, useRef, useState } from 'react';
import { ImageIcon, Loader2 } from 'lucide-react';
import { processImageFileForCms } from '../../src/utils/cmsImageUpload';

type Props = {
  value: string;
  onChange: (url: string) => void;
  /** Unique id prefix so multiple rows don’t clash */
  inputId: string;
  /** Replaces the default helper line under the field (e.g. blog optional hero) */
  helperText?: string;
};

const CmsImageInput: React.FC<Props> = ({ value, onChange, inputId, helperText }) => {
  const reactId = useId();
  const fileId = `${inputId}-${reactId.replace(/:/g, '')}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setErr(null);
    try {
      const dataUrl = await processImageFileForCms(file);
      onChange(dataUrl);
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const showPreview = Boolean(
    value && (value.startsWith('data:') || value.startsWith('http') || value.startsWith('/'))
  );

  return (
    <div className="space-y-2 w-full min-w-0">
      <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center">
        <input
          type="text"
          className="flex-1 min-w-0 p-3 rounded-xl border border-slate-200 bg-white text-sm font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="/siteshots/photo.png or https://…"
          aria-label="Image URL or path"
        />
        <input
          ref={fileRef}
          id={fileId}
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFile}
          disabled={busy}
        />
        <div className="flex flex-wrap gap-2 shrink-0">
          <label
            htmlFor={fileId}
            className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold cursor-pointer whitespace-nowrap ${
              busy ? 'bg-slate-300 text-slate-500 cursor-wait' : 'bg-slate-900 text-white hover:bg-slate-800'
            }`}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
            {busy ? 'Processing…' : 'Upload image'}
          </label>
          {value ? (
            <button
              type="button"
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50"
              onClick={() => onChange('')}
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>
      {err ? <p className="text-xs text-red-600 font-medium">{err}</p> : null}
      <p className="text-[11px] text-slate-500">
        {helperText ??
          'Upload resizes large photos to JPEG. Paste a URL or path — upload is optional when a URL is set. You can use a path under /public or an HTTPS URL.'}
      </p>
      {showPreview ? (
        <div className="flex items-start gap-3">
          <img
            src={value}
            alt=""
            className="h-24 w-auto max-w-[min(100%,280px)] rounded-lg border border-slate-200 object-cover bg-slate-100"
          />
        </div>
      ) : null}
    </div>
  );
};

export default CmsImageInput;
