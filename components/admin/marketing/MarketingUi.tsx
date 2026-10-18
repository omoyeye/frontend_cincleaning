import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Small shared pieces for the admin Marketing hub, so every section uses the same
 * headers, cards, pills, switches and side panels.
 */

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h4 className="text-xl font-black tracking-tight text-slate-900">{title}</h4>
        {description ? <p className="mt-1 max-w-2xl text-sm font-medium text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  icon,
  label,
  value,
  sub,
  tone = 'bg-blue-50 text-blue-600',
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
        <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-black tabular-nums text-slate-900 sm:text-3xl">{value}</p>
      {sub ? <p className="mt-0.5 text-xs font-medium text-slate-500">{sub}</p> : null}
    </>
  );
  const cls = 'rounded-2xl border border-slate-200 bg-white p-4 text-left sm:p-5';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition-all hover:border-slate-300 hover:shadow-md`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export const Card: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <div className={`rounded-2xl border border-slate-200 bg-white ${className}`}>{children}</div>
);

export function Pill({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 ring-inset ${tone}`}>
      {children}
    </span>
  );
}

export const PILL = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
};

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  text?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div>
      <p className="mt-3 text-sm font-black text-slate-900">{title}</p>
      {text ? <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{text}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Segmented filter with optional counts. */
export function Segmented<T extends string>({
  items,
  value,
  onChange,
  ariaLabel,
}: {
  items: { id: T; label: string; count?: number }[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex max-w-full gap-1 overflow-x-auto no-scrollbar rounded-xl bg-slate-100 p-1">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(it.id)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
              on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {it.label}
            {it.count != null ? (
              <span className={`rounded-md px-1.5 text-[10px] tabular-nums ${on ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-600'}`}>
                {it.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  );
}

export function Field({
  label,
  hint,
  counter,
  children,
}: {
  label: string;
  hint?: React.ReactNode;
  counter?: { value: number; max: number };
  children: React.ReactNode;
}) {
  const over = counter ? counter.value > counter.max : false;
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-700">{label}</span>
        {counter ? (
          <span className={`text-[11px] font-bold tabular-nums ${over ? 'text-red-600' : 'text-slate-400'}`}>
            {counter.value}/{counter.max}
          </span>
        ) : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-slate-500">{hint}</span> : null}
    </label>
  );
}

export const INPUT =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20';

export const BTN_PRIMARY =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 disabled:pointer-events-none disabled:opacity-50';

export const BTN_SECONDARY =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:pointer-events-none disabled:opacity-50';

export const BTN_GHOST_DANGER =
  'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50';

/** Right-hand side panel used for create / edit forms. */
export function SidePanel({
  open,
  title,
  subtitle,
  onClose,
  footer,
  children,
  wide,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;
  // Portal to <body>: animated (transformed) parents would otherwise offset a fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[200] flex justify-end" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      <div
        className={`relative flex h-full w-full flex-col bg-slate-50 shadow-2xl animate-in slide-in-from-right duration-300 ${
          wide ? 'max-w-3xl' : 'max-w-lg'
        }`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-900">{title}</h3>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export const money = (n: number) => `£${(Number(n) || 0).toFixed(2)}`;

export function initials(name: string): string {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function Avatar({ name, tone = 'bg-blue-100 text-blue-700' }: { name: string; tone?: string }) {
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black ${tone}`} aria-hidden>
      {initials(name)}
    </span>
  );
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export interface HubNavItem<T extends string> {
  id: T;
  label: string;
  hint: string;
  icon: React.ReactNode;
  /** Number shown on the right; falsy hides it. */
  badge?: number;
  /** Highlight the badge (something needs action). */
  badgeAlert?: boolean;
  /** Small amber dot, e.g. unsaved changes in that section. */
  dot?: boolean;
}

/**
 * Page layout shared by the admin hubs (Marketing, Settings): title, grouped icon menu on the left
 * (a sideways row on phones that keeps the current item in view) and the content on the right.
 */
export function HubLayout<T extends string>({
  title,
  subtitle,
  navLabel,
  groups,
  active,
  onChange,
  children,
}: {
  title: string;
  subtitle: string;
  navLabel: string;
  groups: { group: string; items: HubNavItem<T>[] }[];
  active: T;
  onChange: (id: T) => void;
  children: React.ReactNode;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const row = menuRef.current;
    const btn = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !btn || row.scrollWidth <= row.clientWidth) return;
    row.scrollTo({ left: btn.offsetLeft - row.clientWidth / 2 + btn.offsetWidth / 2, behavior: 'smooth' });
  }, [active]);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
      <div className="flex flex-col gap-1 border-b border-slate-100 pb-4">
        <h3 className="text-3xl font-black tracking-tight text-slate-900">{title}</h3>
        <p className="text-sm font-medium text-slate-500">{subtitle}</p>
      </div>

      <div className="flex flex-col items-start gap-6 lg:flex-row lg:gap-8">
        <nav aria-label={navLabel} className="w-full shrink-0 lg:sticky lg:top-4 lg:w-60">
          <div
            ref={menuRef}
            className="relative -mx-1 flex gap-2 overflow-x-auto no-scrollbar px-1 pb-1 lg:mx-0 lg:block lg:space-y-5 lg:overflow-visible lg:px-0"
          >
            {groups.map((g) => (
              <div key={g.group} className="contents lg:block">
                <p className="mb-1.5 hidden px-3 text-[10px] font-black uppercase tracking-widest text-slate-400 lg:block">{g.group}</p>
                <div className="contents lg:block lg:space-y-1">
                  {g.items.map((it) => {
                    const on = active === it.id;
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => {
                          onChange(it.id);
                          if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        aria-current={on ? 'page' : undefined}
                        className={`group flex shrink-0 items-center gap-3 rounded-xl border px-3 py-2 text-left transition lg:w-full lg:py-2.5 ${
                          on
                            ? 'border-slate-900 bg-slate-900 text-white shadow-lg shadow-slate-900/10'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 lg:border-transparent lg:bg-transparent lg:hover:bg-white'
                        }`}
                      >
                        <span
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                            on ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600'
                          }`}
                        >
                          {it.icon}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block whitespace-nowrap text-sm font-bold">{it.label}</span>
                          <span className={`hidden truncate text-[11px] lg:block ${on ? 'text-white/60' : 'text-slate-400'}`}>{it.hint}</span>
                        </span>
                        {it.dot ? <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" title="Unsaved changes" aria-label="Unsaved changes" /> : null}
                        {it.badge ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums ${
                              on ? 'bg-white text-slate-900' : it.badgeAlert ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {it.badge}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </nav>

        <div className="w-full min-w-0 flex-1 space-y-6">{children}</div>
      </div>
    </div>
  );
}
