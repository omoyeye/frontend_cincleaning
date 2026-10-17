import type { Booking } from '../../types';

/**
 * Where a booking is with payment, worded the same everywhere (wizard, invoice, confirmation, portal).
 * The server sends amountPaid / balanceDue / paymentStage on loaded bookings; a booking still being
 * made in the wizard has none of those and counts as unpaid.
 */
export type BookingPaymentState = {
  choice: 'deposit' | 'full';
  total: number;
  depositPercent: number;
  depositAmount: number;
  amountPaid: number;
  balanceDue: number;
  stage: 'unpaid' | 'deposit_paid' | 'paid';
  /** What the client pays next (0 when nothing is owed). */
  payNowAmount: number;
  /** Button text for the next payment, e.g. "Pay deposit £40.00". */
  payNowLabel: string;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function bookingPaymentState(b: Partial<Booking>, depositPercent: number, totalOverride?: number): BookingPaymentState {
  const total = round2(Number(totalOverride ?? b.totalPrice) || 0);
  const pct = Number.isFinite(depositPercent) ? Math.min(100, Math.max(0, depositPercent)) : 40;
  const depositAmount = round2(Number(b.depositAmount) || (total * pct) / 100);
  const choice = b.paymentChoice === 'full' ? 'full' : 'deposit';

  let amountPaid: number;
  let stage: BookingPaymentState['stage'];
  if (b.paymentStage) {
    stage = b.paymentStage;
    amountPaid = round2(Number(b.amountPaid) || 0);
  } else if (b.paidInFullAt) {
    stage = 'paid';
    amountPaid = total;
  } else if (b.invoicePaid) {
    stage = 'deposit_paid';
    amountPaid = depositAmount;
  } else {
    stage = 'unpaid';
    amountPaid = 0;
  }
  const balanceDue = b.balanceDue != null && b.paymentStage ? round2(Number(b.balanceDue)) : round2(Math.max(0, total - amountPaid));
  if (stage === 'deposit_paid' && balanceDue < 0.01) stage = 'paid';

  const money = (n: number) => `£${n.toFixed(2)}`;
  let payNowAmount = 0;
  let payNowLabel = '';
  if (stage === 'unpaid') {
    payNowAmount = choice === 'full' ? total : depositAmount;
    payNowLabel = choice === 'full' ? `Pay in full ${money(total)}` : `Pay deposit ${money(depositAmount)}`;
  } else if (stage === 'deposit_paid') {
    payNowAmount = balanceDue;
    payNowLabel = `Pay balance ${money(balanceDue)}`;
  }
  return { choice, total, depositPercent: pct, depositAmount, amountPaid, balanceDue, stage, payNowAmount, payNowLabel };
}
