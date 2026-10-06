import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, QrCode, Copy, Check, RefreshCw } from 'lucide-react';
import QRCode from 'qrcode';
import { useBusinessSettings } from '../../src/context/BusinessSettingsContext';
import { useFlyer } from '../Flyer';

type QrTarget = 'booking' | 'homepage' | 'custom';
type QrFormat = 'png' | 'svg';
type QrSize = 256 | 512 | 1024;

const SIZE_OPTIONS: { value: QrSize; label: string }[] = [
  { value: 256, label: 'Small (256px)' },
  { value: 512, label: 'Medium (512px)' },
  { value: 1024, label: 'Large (1024px)' },
];

const TARGET_OPTIONS: { value: QrTarget; label: string; path: string }[] = [
  { value: 'booking', label: 'Booking page', path: '/book-cleaning' },
  { value: 'homepage', label: 'Homepage', path: '/' },
  { value: 'custom', label: 'Custom URL', path: '' },
];

const QrCodePanel: React.FC = () => {
  const { showFlyer } = useFlyer();
  const bs = useBusinessSettings();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const baseUrl = (bs.website || 'https://cleanitneatly.com').replace(/\/+$/, '');

  const [target, setTarget] = useState<QrTarget>('booking');
  const [customUrl, setCustomUrl] = useState('');
  const [size, setSize] = useState<QrSize>(512);
  const [format, setFormat] = useState<QrFormat>('png');
  const [fgColor, setFgColor] = useState('#1e293b');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [svgData, setSvgData] = useState('');
  const [copied, setCopied] = useState(false);

  const getUrl = useCallback(() => {
    if (target === 'custom') return customUrl || baseUrl;
    const info = TARGET_OPTIONS.find((t) => t.value === target);
    return `${baseUrl}${info?.path ?? '/book-cleaning'}`;
  }, [target, customUrl, baseUrl]);

  const generateQr = useCallback(async () => {
    const url = getUrl();
    if (!url) {
      showFlyer('Please enter a valid URL', 'error');
      return;
    }
    setGenerating(true);
    setGenerated(false);
    setSvgData('');
    try {
      if (format === 'png' && canvasRef.current) {
        await QRCode.toCanvas(canvasRef.current, url, {
          width: size,
          margin: 2,
          color: { dark: fgColor, light: bgColor },
        });
      } else {
        const svg = await QRCode.toString(url, {
          type: 'svg',
          width: size,
          margin: 2,
          color: { dark: fgColor, light: bgColor },
        });
        setSvgData(svg);
      }
      setGenerated(true);
    } catch {
      showFlyer('Failed to generate QR code', 'error');
    } finally {
      setGenerating(false);
    }
  }, [getUrl, size, format, fgColor, bgColor, showFlyer]);

  useEffect(() => {
    setGenerated(false);
  }, [target, customUrl, size, format, fgColor, bgColor]);

  const downloadQr = useCallback(() => {
    const url = getUrl();
    const slug = target === 'custom' ? 'custom' : target;
    const filename = `cin-qr-${slug}-${size}`;

    if (format === 'svg') {
      const blob = new Blob([svgData], { type: 'image/svg+xml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}.svg`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else if (canvasRef.current) {
      const a = document.createElement('a');
      a.href = canvasRef.current.toDataURL('image/png');
      a.download = `${filename}.png`;
      a.click();
    }
    showFlyer('QR code downloaded', 'success');
  }, [format, svgData, target, size, getUrl, showFlyer]);

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(getUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showFlyer('Failed to copy', 'error');
    }
  }, [getUrl, showFlyer]);

  return (
    <div className="space-y-6">
      <div>
        <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
          <QrCode className="w-6 h-6 text-primary" />
          QR Code Generator
        </h4>
        <p className="text-sm text-slate-500 font-medium mt-1 max-w-2xl">
          Generate QR codes for your booking page, homepage, or any custom URL.
          Print them on flyers, business cards, or display in your premises.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100/50 p-5 sm:p-8 space-y-5">
          <h5 className="text-sm font-black text-slate-800 uppercase tracking-widest">Configuration</h5>

          {/* Target */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
              QR code links to
            </label>
            <div className="flex flex-wrap gap-2">
              {TARGET_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTarget(opt.value)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border transition-all ${
                    target === opt.value
                      ? 'bg-primary text-white border-primary shadow-sm'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom URL input */}
          {target === 'custom' && (
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Custom URL
              </label>
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://cleanitneatly.com/your-page"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
          )}

          {/* URL preview */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-4 py-3">
            <span className="text-xs text-slate-500 font-medium truncate flex-1">{getUrl()}</span>
            <button
              type="button"
              onClick={copyUrl}
              className="shrink-0 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors"
              title="Copy URL"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-400" />}
            </button>
          </div>

          {/* Format + Size */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as QrFormat)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
              >
                <option value="png">PNG (Image)</option>
                <option value="svg">SVG (Vector)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Size</label>
              <select
                value={size}
                onChange={(e) => setSize(Number(e.target.value) as QrSize)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
              >
                {SIZE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Colors */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                QR colour
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Background
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
          </div>

          {/* Generate */}
          <button
            type="button"
            onClick={generateQr}
            disabled={generating || (target === 'custom' && !customUrl)}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-2xl bg-primary text-white font-bold text-sm uppercase tracking-widest hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm"
          >
            {generating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <QrCode className="w-4 h-4" />
            )}
            {generating ? 'Generating...' : generated ? 'Regenerate QR Code' : 'Generate QR Code'}
          </button>
        </div>

        {/* Preview */}
        <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100/50 p-5 sm:p-8 flex flex-col items-center justify-center min-h-[400px]">
          {!generated ? (
            <div className="text-center space-y-3">
              <div className="w-20 h-20 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-center mx-auto">
                <QrCode className="w-8 h-8 text-slate-300" />
              </div>
              <p className="text-sm text-slate-400 font-medium">
                Configure your settings and click <br />Generate to preview the QR code
              </p>
            </div>
          ) : (
            <div className="space-y-5 text-center">
              <h5 className="text-sm font-black text-slate-800 uppercase tracking-widest">Preview</h5>
              <div className="inline-block rounded-2xl border-2 border-slate-100 p-4 bg-white shadow-sm">
                {format === 'png' ? (
                  <canvas
                    ref={canvasRef}
                    className="max-w-full h-auto"
                    style={{ width: Math.min(size, 300), height: Math.min(size, 300) }}
                  />
                ) : (
                  <div
                    dangerouslySetInnerHTML={{ __html: svgData }}
                    className="max-w-full"
                    style={{ width: Math.min(size, 300), height: Math.min(size, 300) }}
                  />
                )}
              </div>
              <p className="text-xs text-slate-400 font-medium">
                {size} x {size}px - {format.toUpperCase()}
              </p>
              <button
                type="button"
                onClick={downloadQr}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-600 text-white font-bold text-sm uppercase tracking-widest hover:bg-emerald-700 transition-colors shadow-sm"
              >
                <Download className="w-4 h-4" />
                Download {format.toUpperCase()}
              </button>
            </div>
          )}

          {/* Hidden canvas for PNG generation when not yet generated */}
          {format === 'png' && !generated && (
            <canvas ref={canvasRef} className="hidden" />
          )}
        </div>
      </div>

      {/* Usage tips */}
      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-5 py-4 text-sm text-slate-600 leading-relaxed">
        <p className="font-bold text-slate-800 mb-2">Tips for using your QR code</p>
        <ul className="space-y-1.5 list-disc list-inside text-xs text-slate-500">
          <li>Print on business cards, flyers, and window stickers for easy customer access</li>
          <li>Use PNG format for print materials and social media</li>
          <li>Use SVG format for large-format printing (scales without quality loss)</li>
          <li>Test the QR code with your phone camera before printing</li>
          <li>Place at reception desks, on vehicles, or in welcome packs for instant bookings</li>
        </ul>
      </div>
    </div>
  );
};

export default QrCodePanel;
