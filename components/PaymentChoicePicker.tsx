import React from 'react';
import { CreditCard, Wallet } from 'lucide-react';

/** "Pay the deposit now" or "Pay in full now", shown before the client submits a booking. */
export default function PaymentChoicePicker({
  total,
  depositPercent,
  value,
  onChange,
}: {
  total: number;
  depositPercent: number;
  value: 'deposit' | 'full';
  onChange: (next: 'deposit' | 'full') => void;
}) {
  const deposit = (total * depositPercent) / 100;
  const options = [
    {
      key: 'deposit' as const,
      title: `Pay ${depositPercent}% deposit`,
      sub: `£${(total - deposit).toFixed(2)} balance due after your clean`,
      amount: deposit,
      Icon: Wallet,
    },
    {
      key: 'full' as const,
      title: 'Pay in full',
      sub: 'Nothing more to pay after your clean',
      amount: total,
      Icon: CreditCard,
    },
  ];
  return (
    <div className="rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-lg ring-1 ring-slate-100/80">
      <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">How would you like to pay?</h4>
      <p className="mt-1 text-xs font-semibold text-slate-500">
        A secure card payment link is sent to your email once your booking is confirmed. You can still switch on the payment page.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Payment option">
        {options.map(({ key, title, sub, amount, Icon }) => {
          const on = value === key;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(key)}
              className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-left transition-all ${
                on ? 'border-primary bg-primary/5 shadow-md shadow-primary/10' : 'border-slate-200 bg-white hover:border-primary/40'
              }`}
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                  on ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500'
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-black text-slate-900">{title}</span>
                <span className="block text-xs font-semibold text-slate-500">{sub}</span>
              </span>
              <span className="shrink-0 text-lg font-black tabular-nums text-slate-900">£{amount.toFixed(2)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
