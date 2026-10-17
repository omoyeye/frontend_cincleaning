import React, { useState } from 'react';
import { Send, CheckCircle2 } from 'lucide-react';
import { Booking, BookingStatus } from '../../types';
import { apiAdmin } from '../../services/api';
import { useFlyer } from '../Flyer';
import { bookingPaymentState } from '../../src/utils/bookingPayment';
import { useBusinessSettings } from '../../src/context/BusinessSettingsContext';

/**
 * Payment status for one booking in the admin bookings table: unpaid, deposit paid (with the balance)
 * or paid in full, the client's choice, and quick actions for the balance.
 */
export default function BookingPaymentCell({
  booking,
  onChanged,
}: {
  booking: Booking;
  onChanged: (patch: Partial<Booking>) => void;
}) {
  const { showFlyer } = useFlyer();
  const { depositPolicy } = useBusinessSettings();
  const depositPercent = Number.isFinite(Number(depositPolicy?.requiredPercent)) ? Number(depositPolicy?.requiredPercent) : 40;
  const [busy, setBusy] = useState<'deposit' | 'full' | 'request' | null>(null);
  const pay = bookingPaymentState(booking, depositPercent);
  const cancelled = booking.status === BookingStatus.CANCELLED;

  const run = async (kind: 'deposit' | 'full' | 'request', fn: () => Promise<unknown>, ok: string, patch?: Partial<Booking>) => {
    setBusy(kind);
    try {
      await fn();
      if (patch) onChanged(patch);
      showFlyer(ok, 'success');
    } catch (err) {
      showFlyer(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  };

  const badge =
    pay.stage === 'paid'
      ? { text: 'Paid in full', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-100' }
      : pay.stage === 'deposit_paid'
        ? { text: `Deposit paid · £${pay.balanceDue.toFixed(2)} due`, cls: 'bg-blue-50 text-blue-700 ring-blue-100' }
        : { text: pay.choice === 'full' ? 'Unpaid · chose full' : 'Unpaid · chose deposit', cls: 'bg-amber-50 text-amber-700 ring-amber-100' };

  return (
    <div className="flex flex-col items-center gap-1.5 min-w-[150px]">
      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ring-1 whitespace-nowrap ${badge.cls}`}>{badge.text}</span>
      {!cancelled && pay.stage === 'unpaid' ? (
        <button
          type="button"
          disabled={!!busy}
          onClick={() =>
            run(
              'deposit',
              () => apiAdmin.updateBooking(booking.id, { invoicePaid: true }),
              'Deposit marked as paid.',
              { invoicePaid: true, paymentStage: 'deposit_paid', amountPaid: pay.depositAmount, balanceDue: Math.max(0, pay.total - pay.depositAmount) },
            )
          }
          className="text-[10px] font-bold text-slate-500 hover:text-emerald-700 underline underline-offset-2 disabled:opacity-50"
        >
          Mark deposit paid
        </button>
      ) : null}
      {pay.stage === 'deposit_paid' ? (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={!!busy}
            onClick={() =>
              run('full', () => apiAdmin.markBookingPaidInFull(booking.id), 'Balance marked as paid.', {
                paymentStage: 'paid',
                amountPaid: pay.total,
                balanceDue: 0,
                paidInFullAt: new Date().toISOString(),
              })
            }
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[9px] font-black uppercase tracking-wider hover:bg-emerald-100 disabled:opacity-50"
            title="The client paid the balance by cash or bank transfer"
          >
            <CheckCircle2 className="w-3 h-3" /> Balance paid
          </button>
          <button
            type="button"
            disabled={!!busy || cancelled}
            onClick={() =>
              run('request', () => apiAdmin.sendBalanceRequest(booking.id), 'Balance request sent by email, SMS and app.', {
                balanceRequestSentAt: new Date().toISOString(),
              })
            }
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-black uppercase tracking-wider hover:bg-blue-100 disabled:opacity-50"
            title={booking.balanceRequestSentAt ? `Last sent ${new Date(booking.balanceRequestSentAt).toLocaleString('en-GB')}` : 'Send the balance request now'}
          >
            <Send className="w-3 h-3" /> {booking.balanceRequestSentAt ? 'Resend' : 'Request'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
