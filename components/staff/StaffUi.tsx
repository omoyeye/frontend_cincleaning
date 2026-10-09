import React from 'react';

/**
 * Small design system for the staff portal, so every screen shares the same cards,
 * headings, badges, buttons and form fields.
 */

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ');

export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 disabled:bg-slate-50 disabled:text-slate-400';

export const Card: React.FC<{ className?: string; children: React.ReactNode; padded?: boolean }> = ({ className, children, padded = true }) => (
  <div className={cx('rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]', padded && 'p-5 sm:p-6', className)}>
    {children}
  </div>
);

export const SectionHeader: React.FC<{ title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({
  title,
  subtitle,
  action,
  className,
}) => (
  <div className={cx('flex flex-wrap items-end justify-between gap-3', className)}>
    <div className="min-w-0">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
    </div>
    {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
  </div>
);

export type Tone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

const BADGE_TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600 ring-slate-200',
  primary: 'bg-primary/10 text-primary ring-primary/20',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
};

export const Badge: React.FC<{ tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }> = ({ tone = 'neutral', children, className, dot }) => (
  <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset', BADGE_TONES[tone], className)}>
    {dot ? <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden /> : null}
    {children}
  </span>
);

/** Booking status -> badge tone. */
export function statusTone(status: string | undefined | null): Tone {
  const s = String(status || '').toLowerCase();
  if (s === 'completed' || s === 'approved' || s === 'paid out') return 'success';
  if (s === 'cancelled' || s === 'rejected') return 'danger';
  if (s === 'pending') return 'warning';
  if (s === 'confirmed') return 'primary';
  return 'neutral';
}

type ButtonVariant = 'primary' | 'secondary' | 'dark' | 'danger' | 'warning' | 'ghost' | 'success';
const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-foreground shadow-sm shadow-primary/25 hover:opacity-90',
  secondary: 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
  dark: 'bg-slate-900 text-white hover:bg-slate-800',
  danger: 'bg-white text-red-600 ring-1 ring-inset ring-red-200 hover:bg-red-50',
  warning: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200 hover:bg-amber-100',
  ghost: 'text-slate-600 hover:bg-slate-100',
  success: 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/25 hover:bg-emerald-700',
};

export const Button: React.FC<
  React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: 'sm' | 'md' | 'lg'; block?: boolean; icon?: React.ReactNode }
> = ({ variant = 'primary', size = 'md', block, icon, className, children, type = 'button', ...rest }) => (
  <button
    type={type}
    className={cx(
      'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50',
      size === 'sm' && 'px-3 py-1.5 text-xs',
      size === 'md' && 'px-4 py-2.5 text-sm',
      size === 'lg' && 'px-5 py-3.5 text-base',
      block && 'w-full',
      BUTTON_VARIANTS[variant],
      className,
    )}
    {...rest}
  >
    {icon}
    {children}
  </button>
);

export const StatTile: React.FC<{ label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode; accent?: string }> = ({
  label,
  value,
  hint,
  icon,
  accent = 'bg-primary/10 text-primary',
}) => (
  <Card className="flex items-start gap-4">
    {icon ? <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', accent)}>{icon}</div> : null}
    <div className="min-w-0">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</p>
      {hint ? <div className="mt-1 text-xs text-slate-500">{hint}</div> : null}
    </div>
  </Card>
);

export const EmptyState: React.FC<{ icon: React.ReactNode; title: string; body?: React.ReactNode; action?: React.ReactNode; className?: string }> = ({
  icon,
  title,
  body,
  action,
  className,
}) => (
  <div className={cx('rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-10 text-center', className)}>
    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div>
    <p className="font-semibold text-slate-900">{title}</p>
    {body ? <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{body}</p> : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);

export const Field: React.FC<{ label: string; htmlFor?: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  label,
  htmlFor,
  hint,
  children,
  className,
}) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
      {label}
    </label>
    {children}
    {hint ? <div className="mt-1.5 text-xs text-slate-500">{hint}</div> : null}
  </div>
);

/** Label/value pair used in detail grids. */
export const InfoItem: React.FC<{ label: string; value: React.ReactNode; icon?: React.ReactNode; className?: string }> = ({ label, value, icon, className }) => (
  <div className={cx('flex items-start gap-3 rounded-xl bg-slate-50 px-3.5 py-3', className)}>
    {icon ? <div className="mt-0.5 shrink-0 text-slate-400">{icon}</div> : null}
    <div className="min-w-0">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <div className="mt-0.5 break-words text-sm font-semibold text-slate-900">{value}</div>
    </div>
  </div>
);

export const Callout: React.FC<{ tone?: Tone; icon?: React.ReactNode; title?: React.ReactNode; children?: React.ReactNode; className?: string }> = ({
  tone = 'info',
  icon,
  title,
  children,
  className,
}) => {
  const tones: Record<Tone, string> = {
    neutral: 'bg-slate-50 border-slate-200 text-slate-700',
    primary: 'bg-primary/5 border-primary/20 text-slate-800',
    success: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    warning: 'bg-amber-50 border-amber-200 text-amber-900',
    danger: 'bg-red-50 border-red-200 text-red-900',
    info: 'bg-sky-50 border-sky-200 text-sky-900',
  };
  return (
    <div className={cx('flex items-start gap-3 rounded-xl border px-4 py-3 text-sm', tones[tone], className)}>
      {icon ? <div className="mt-0.5 shrink-0">{icon}</div> : null}
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children ? <div className={cx(title && 'mt-0.5', 'leading-relaxed')}>{children}</div> : null}
      </div>
    </div>
  );
};

/** Segmented tabs (pills) with optional counts. */
export function Segmented<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  items: Array<{ id: T; label: string; icon?: React.ReactNode; count?: number }>;
  className?: string;
}) {
  return (
    <div className={cx('inline-flex w-full gap-1 rounded-xl bg-slate-100 p-1 sm:w-auto', className)} role="tablist">
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={cx(
              'inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition sm:flex-none',
              active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
            )}
          >
            {it.icon}
            <span>{it.label}</span>
            {it.count ? (
              <span className={cx('min-w-[1.25rem] rounded-full px-1.5 text-xs font-semibold tabular-nums', active ? 'bg-primary text-primary-foreground' : 'bg-slate-200 text-slate-600')}>
                {it.count > 99 ? '99+' : it.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export const Avatar: React.FC<{ src?: string | null; name: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }> = ({ src, name, size = 'md', className }) => {
  const dims = { sm: 'h-9 w-9 text-sm', md: 'h-11 w-11 text-base', lg: 'h-16 w-16 text-xl', xl: 'h-24 w-24 text-3xl' }[size];
  return (
    <div className={cx('flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary to-primary/70 font-semibold text-primary-foreground ring-2 ring-white', dims, className)}>
      {src ? <img src={src} alt={name} className="h-full w-full object-cover" /> : <span>{(name || '?').charAt(0).toUpperCase()}</span>}
    </div>
  );
};

export const Spinner: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cx('h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent', className)} aria-label="Loading" />
);
