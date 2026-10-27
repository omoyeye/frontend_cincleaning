import React from 'react';
import {
    CalendarCheck,
    CalendarPlus,
    CheckCircle2,
    Clock,
    Copy,
    CreditCard,
    Download,
    ExternalLink,
    Landmark,
    Mail,
    MapPin,
    Plus,
    ShieldCheck,
    Sparkles,
    User,
    UserCheck,
} from 'lucide-react';
import { format } from 'date-fns';
import { Booking, ServiceConfig, Extra } from '../types';
import { useFlyer } from './Flyer';
import {
    downloadBookingIcs,
    formatHoursMinutes,
    getDurationBreakdown,
    getCallOutChargeGbp,
    getExtraDisplayLabel,
    parseLocalDateFromYYYYMMDD,
} from '../src/utils/bookingHelpers';
import { DurationBreakdownBlock } from './DurationBreakdownBlock';
import BrandLogoMark from './BrandLogoMark';
import { useBusinessBrand } from '../src/hooks/useBusinessBrand';
import { useBusinessSettings } from '../src/context/BusinessSettingsContext';
import { InvoiceBankConsentFooter, type InvoiceDepositConsent } from './InvoiceView';
import { bookingPaymentState } from '../src/utils/bookingPayment';
import { printInvoiceElement } from '../src/utils/invoicePrint';

interface Props {
    booking: Booking;
    services: ServiceConfig[];
    extrasList: Extra[];
    onBookAnother?: () => void;
    isModal?: boolean;
    /** Non-blocking overlap note from booking create API. */
    conflictWarningText?: string | null;
    /** Under bank details: show acknowledgement line or allow client to record consent (portal). */
    depositConsent?: InvoiceDepositConsent;
}

const BookingConfirmation: React.FC<Props> = ({
    booking,
    services,
    extrasList,
    onBookAnother,
    isModal = false,
    conflictWarningText,
    depositConsent,
}) => {
    const { showFlyer } = useFlyer();
    const receiptPrintRef = React.useRef<HTMLDivElement>(null);
    const brandName = useBusinessBrand();
    const {
        email: companyEmail,
        phone: companyPhone,
        address: companyAddress,
        bankDetails,
        depositPolicy,
    } = useBusinessSettings();
    const serviceConfig = services.find(s => String(s.id) === String(booking.serviceType) || s.name === booking.serviceType);
    const serviceName = serviceConfig?.name || booking.serviceType;
    const selectedExtras = booking.extras || [];
    const durationBreakdown = getDurationBreakdown(booking, serviceConfig ?? null, extrasList);
    const callOutCharge = getCallOutChargeGbp(booking, serviceConfig ?? null);
    const serviceDateLocal = parseLocalDateFromYYYYMMDD(booking.date);
    const activeBankDetails = (bankDetails || []).filter((b) => b.active !== false);
    const fallbackBankDetails = [
        {
            id: 'default-bank-1',
            accountName: 'Surpluslink & co LTD',
            accountNumber: '27847158',
            sortCode: '04-06-05',
            bankName: '',
            notes: '',
            active: true,
        },
    ];
    const payoutBankDetails = activeBankDetails.length > 0 ? activeBankDetails : fallbackBankDetails;
    const totalAmount = Number(booking.totalPrice) || 0;
    const depositPercent = Number.isFinite(Number(depositPolicy?.requiredPercent))
        ? Math.min(100, Math.max(0, Number(depositPolicy?.requiredPercent)))
        : 40;
    const depositAmount = Number((totalAmount * depositPercent) / 100);
    const pay = bookingPaymentState(booking, depositPercent, totalAmount);
    const defaultDepositMessage =
        `To reserve your preferred slot and lock in your cleaner team, we require a ${depositPercent}% deposit before attendance. This confirms your booking in our live rota and guarantees staff dispatch on the day.`;
    const depositMessage =
        typeof depositPolicy?.message === 'string' && depositPolicy.message.trim()
            ? depositPolicy.message.trim()
            : defaultDepositMessage;

    const reference = String(booking.bookingId ?? booking.id);
    const firstName = String(booking.contact?.name || '').trim().split(/\s+/)[0];
    const longDate = serviceDateLocal ? format(serviceDateLocal, 'EEEE d MMMM yyyy') : booking.date || 'N/A';
    const bookedHours = Number(booking.duration ?? booking.propertyDetails?.duration);
    const totalLabel = pay.stage === 'paid' ? 'Total paid' : 'Booking total';

    const copyReference = async () => {
        try {
            await navigator.clipboard.writeText(reference);
            showFlyer('Booking reference copied.', 'success');
        } catch {
            showFlyer(reference, 'info');
        }
    };

    const printReceipt = () => {
        const el = receiptPrintRef.current;
        if (!el) {
            showFlyer('Could not open print view. Please try again.', 'error');
            return;
        }
        printInvoiceElement(el, () =>
            showFlyer('Print dialog opened. Choose Save as PDF in the print window to download your receipt.', 'success')
        );
    };

    const nextSteps: Array<{ title: string; body: string; done?: boolean; icon: React.ReactNode }> = [
        { title: 'Booking submitted', body: `We have your request and emailed a copy to ${booking.contact.email}. It stays pending until we confirm it.`, done: true, icon: <CheckCircle2 className="h-4 w-4" /> },
        { title: 'We confirm your booking', body: 'Our team checks the rota, confirms your time and lets you know who is coming.', icon: <UserCheck className="h-4 w-4" /> },
        {
            title: pay.stage === 'paid' ? 'Payment complete' : pay.choice === 'full' ? 'Pay in full' : `Pay your ${depositPercent}% deposit`,
            body:
                pay.stage === 'paid'
                    ? 'Thank you, nothing more to pay.'
                    : booking.stripePaymentLink
                        ? 'Use the secure card link below, or pay by bank transfer.'
                        : 'A secure card link is emailed once we confirm, or pay by bank transfer.',
            done: pay.stage === 'paid' || pay.stage === 'deposit_paid',
            icon: <CreditCard className="h-4 w-4" />,
        },
        { title: 'Your clean', body: `${longDate} at ${booking.time}.`, icon: <Sparkles className="h-4 w-4" /> },
    ];

    const receipt = (
        <div ref={receiptPrintRef} className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white text-left shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.14)]">
            {/* Header */}
            <div className="flex flex-col gap-4 border-b border-slate-100 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
                <BrandLogoMark className="h-14 w-auto max-w-[220px] object-contain object-left" />
                <div className="sm:text-right">
                    <p className="text-xs font-medium text-slate-500">Booking reference</p>
                    <p className="text-xl font-semibold tracking-tight text-slate-900">#{reference}</p>
                    <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${pay.stage === 'paid' ? 'bg-emerald-50 text-emerald-700' : pay.stage === 'deposit_paid' ? 'bg-sky-50 text-sky-700' : 'bg-amber-50 text-amber-800'}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${pay.stage === 'paid' ? 'bg-emerald-500' : pay.stage === 'deposit_paid' ? 'bg-sky-500' : 'bg-amber-500'}`} />
                        {pay.stage === 'paid' ? 'Paid in full' : pay.stage === 'deposit_paid' ? 'Deposit paid' : 'Awaiting payment'}
                    </span>
                </div>
            </div>

            <div className="space-y-6 p-6 sm:p-7">
                {/* Key details */}
                <div className="grid gap-3 sm:grid-cols-2">
                    {[
                        { icon: <Sparkles className="h-4 w-4" />, label: 'Service', value: serviceName, sub: [booking.frequency, Number.isFinite(bookedHours) && bookedHours > 0 ? formatHoursMinutes(bookedHours) : ''].filter(Boolean).join(' · ') },
                        { icon: <CalendarCheck className="h-4 w-4" />, label: 'Date and time', value: longDate, sub: `Starting at ${booking.time}` },
                        { icon: <MapPin className="h-4 w-4" />, label: 'Address', value: booking.address.line1, sub: [booking.address.city, booking.address.postcode].filter(Boolean).join(', ') },
                        { icon: <User className="h-4 w-4" />, label: 'Contact', value: booking.contact.name || 'N/A', sub: [booking.contact.email, booking.contact.phone].filter(Boolean).join(' · ') },
                    ].map((d) => (
                        <div key={d.label} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm ring-1 ring-slate-200/70">{d.icon}</span>
                            <div className="min-w-0">
                                <p className="text-xs font-medium text-slate-500">{d.label}</p>
                                <p className="break-words font-semibold text-slate-900">{d.value}</p>
                                {d.sub ? <p className="break-words text-sm text-slate-500">{d.sub}</p> : null}
                            </div>
                        </div>
                    ))}
                </div>

                <DurationBreakdownBlock breakdown={durationBreakdown} />

                {/* Price summary */}
                <div className="rounded-2xl border border-slate-200/80">
                    <p className="border-b border-slate-100 px-5 py-3 text-sm font-semibold text-slate-900">Price summary</p>
                    <div className="space-y-2 px-5 py-4 text-sm">
                        {callOutCharge > 0 && (
                            <div className="flex justify-between gap-3">
                                <span className="text-slate-600">Call-out charge</span>
                                <span className="shrink-0 font-medium text-slate-900">£{callOutCharge.toFixed(2)}</span>
                            </div>
                        )}
                        {durationBreakdown.model === 'itemized' && (
                            <div className="flex justify-between gap-3">
                                <span className="text-slate-600">Minimum duration ({formatHoursMinutes(durationBreakdown.baseHours)}, instruction only)</span>
                                <span className="shrink-0 font-medium text-slate-900">£0.00</span>
                            </div>
                        )}
                        {selectedExtras.length > 0 ? (
                            selectedExtras.map((item) => {
                                const extra = extrasList.find((e) => String(e.id) === String(item.id));
                                if (!extra) return null;
                                const timeLine = durationBreakdown.lines.find((l) => l.extraId === String(item.id));
                                return (
                                    <div key={item.id} className="flex justify-between gap-3">
                                        <span className="text-slate-600">
                                            {item.quantity} × {getExtraDisplayLabel(extra.name)}
                                        </span>
                                        <span className="shrink-0 text-right">
                                            {durationBreakdown.model === 'itemized' && timeLine ? (
                                                <span className="mr-2 text-xs text-slate-400">{formatHoursMinutes(timeLine.lineHours)}</span>
                                            ) : null}
                                            <span className="font-medium text-slate-900">£{(Number(extra.price) * item.quantity).toFixed(2)}</span>
                                        </span>
                                    </div>
                                );
                            })
                        ) : (
                            <p className="text-slate-500">Standard service, no extras added.</p>
                        )}
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-b-2xl bg-slate-900 px-5 py-4 text-white">
                        <span className="text-sm font-medium text-white/80">{totalLabel}</span>
                        <span className="text-2xl font-semibold tabular-nums">£{totalAmount.toFixed(2)}</span>
                    </div>
                </div>

                {/* Payment */}
                <div className="space-y-4 rounded-2xl border border-slate-200/80 p-5">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <CreditCard className="h-4 w-4 text-primary" /> Payment
                    </p>
                    {pay.stage === 'deposit_paid' ? (
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div className="rounded-xl bg-emerald-50 p-3">
                                <p className="text-xs text-emerald-700">Paid so far</p>
                                <p className="text-lg font-semibold text-emerald-900">£{pay.amountPaid.toFixed(2)}</p>
                            </div>
                            <div className="rounded-xl bg-slate-50 p-3">
                                <p className="text-xs text-slate-500">Due after your clean</p>
                                <p className="text-lg font-semibold text-slate-900">£{pay.balanceDue.toFixed(2)}</p>
                            </div>
                        </div>
                    ) : pay.choice === 'full' && pay.stage === 'unpaid' ? (
                        <p className="text-sm text-slate-700">
                            You chose to pay in full: <strong>£{totalAmount.toFixed(2)}</strong>. Nothing more to pay after your clean.
                        </p>
                    ) : pay.stage === 'unpaid' ? (
                        <>
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-xl bg-primary/[0.06] p-3 ring-1 ring-inset ring-primary/15">
                                    <p className="text-xs text-slate-600">Deposit now ({depositPercent}%)</p>
                                    <p className="text-lg font-semibold text-slate-900">£{depositAmount.toFixed(2)}</p>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <p className="text-xs text-slate-500">Balance after your clean</p>
                                    <p className="text-lg font-semibold text-slate-900">£{(totalAmount - depositAmount).toFixed(2)}</p>
                                </div>
                            </div>
                            <p className="text-xs leading-relaxed text-slate-500">{depositMessage} You can pay in full on the payment page instead.</p>
                        </>
                    ) : null}

                    {booking.stripePaymentLink && pay.stage !== 'paid' ? (
                        <a
                            href={booking.stripePaymentLink}
                            target="_blank"
                            rel="noreferrer"
                            className="no-print flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-[0.99]"
                        >
                            <CreditCard className="h-4 w-4" />
                            {pay.payNowLabel || 'Pay now'}
                            <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                        </a>
                    ) : pay.stage === 'paid' ? (
                        <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-4">
                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                            <div>
                                <p className="text-sm font-semibold text-emerald-900">Paid in full</p>
                                <p className="text-xs text-emerald-700">Payment confirmed, thank you!</p>
                            </div>
                        </div>
                    ) : pay.stage === 'deposit_paid' ? null : (
                        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                            A secure payment link will be sent to your email once your booking is confirmed by our team.
                        </p>
                    )}

                    <div className="border-t border-slate-100 pt-4">
                        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <Landmark className="h-4 w-4 text-slate-400" /> Or pay by bank transfer
                        </p>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {payoutBankDetails.map((bank) => (
                                <div key={bank.id || bank.accountNumber} className="rounded-xl bg-slate-50 p-4 text-sm">
                                    <p className="font-semibold text-slate-900">{bank.accountName || 'Account'}</p>
                                    {bank.bankName?.trim() && <p className="text-xs text-slate-500">{bank.bankName}</p>}
                                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
                                        <dt className="text-slate-500">Account</dt>
                                        <dd className="font-semibold tabular-nums text-slate-900">{bank.accountNumber}</dd>
                                        <dt className="text-slate-500">Sort code</dt>
                                        <dd className="font-semibold tabular-nums text-slate-900">{bank.sortCode}</dd>
                                    </dl>
                                    {bank.notes?.trim() && <p className="mt-2 text-xs text-slate-500">{bank.notes}</p>}
                                </div>
                            ))}
                        </div>
                        <p className="mt-3 text-xs text-slate-500">
                            Please use <strong className="text-slate-700">#{reference}</strong> as the payment reference.
                        </p>
                    </div>

                    {depositConsent ? <InvoiceBankConsentFooter depositConsent={depositConsent} /> : null}
                </div>

                <div className="rounded-2xl bg-slate-50 px-5 py-4 text-center">
                    <p className="text-sm font-semibold text-slate-900">Thank you for choosing {brandName}</p>
                    <p className="mt-1 text-xs text-slate-500">{[companyAddress, companyEmail, companyPhone].filter(Boolean).join(' · ') || 'Thank you for your business.'}</p>
                </div>
            </div>

            <div className="no-print border-t border-slate-100 bg-slate-50/60 p-4 sm:p-5">
                <button
                    type="button"
                    onClick={printReceipt}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
                >
                    <Download className="h-4 w-4" /> Download receipt (PDF)
                </button>
            </div>
        </div>
    );

    if (isModal) return <div className="mx-auto animate-in fade-in duration-300">{receipt}</div>;

    return (
        <div className="mx-auto max-w-6xl px-4 py-8 animate-in fade-in duration-500 sm:px-6 sm:py-12">
            {/* Success hero */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-teal-600 p-6 text-white shadow-lg shadow-emerald-600/20 sm:p-10">
                <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10" aria-hidden />
                <div className="pointer-events-none absolute -bottom-24 right-32 h-48 w-48 rounded-full bg-white/5" aria-hidden />
                <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-emerald-600 shadow-lg">
                            <CheckCircle2 className="h-8 w-8" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                                {firstName ? `Thank you, ${firstName}!` : 'Thank you!'} Your booking has been submitted.
                            </h2>
                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">
                                <Clock className="h-3.5 w-3.5" /> Pending, waiting for our confirmation
                            </p>
                            <p className="mt-2 flex items-center gap-1.5 text-sm text-white/90 sm:text-base">
                                <Mail className="h-4 w-4 shrink-0" /> We have emailed a copy to {booking.contact.email}
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={() => void copyReference()}
                        className="group inline-flex shrink-0 items-center gap-3 self-start rounded-2xl bg-white/15 px-4 py-3 text-left transition hover:bg-white/25 sm:self-auto"
                        title="Copy booking reference"
                    >
                        <span>
                            <span className="block text-xs text-white/80">Booking reference</span>
                            <span className="block whitespace-nowrap text-lg font-semibold tracking-wide">#{reference}</span>
                        </span>
                        <Copy className="h-4 w-4 opacity-80 group-hover:opacity-100" />
                    </button>
                </div>
            </div>

            {conflictWarningText ? (
                <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-left">
                    <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <div>
                        <p className="text-sm font-semibold text-amber-900">A note about your time slot</p>
                        <p className="mt-0.5 text-sm text-amber-900">{conflictWarningText}</p>
                    </div>
                </div>
            ) : null}

            <div className="mt-6 grid gap-6 lg:grid-cols-12">
                <div className="min-w-0 lg:col-span-8">{receipt}</div>

                <div className="min-w-0 space-y-4 lg:col-span-4">
                    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 lg:sticky lg:top-28">
                        <p className="text-sm font-semibold text-slate-900">What happens next</p>
                        <ol className="mt-4 space-y-0">
                            {nextSteps.map((s, i) => (
                                <li key={s.title} className="relative flex gap-3 pb-5 last:pb-0">
                                    {i < nextSteps.length - 1 ? <span className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-slate-200" aria-hidden /> : null}
                                    <span className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                        {s.done ? <CheckCircle2 className="h-4 w-4" /> : s.icon}
                                    </span>
                                    <div className="min-w-0 pt-1">
                                        <p className={`text-sm font-semibold ${s.done ? 'text-emerald-700' : 'text-slate-900'}`}>{s.title}</p>
                                        <p className="text-xs leading-relaxed text-slate-500">{s.body}</p>
                                    </div>
                                </li>
                            ))}
                        </ol>

                        <div className="mt-6 space-y-2 border-t border-slate-100 pt-5">
                            <button
                                type="button"
                                onClick={() => downloadBookingIcs(booking, brandName)}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition hover:opacity-90"
                            >
                                <CalendarPlus className="h-4 w-4" /> Add to my calendar
                            </button>
                            <button
                                type="button"
                                onClick={printReceipt}
                                className="flex w-full items-center justify-center gap-2 rounded-xl bg-white py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
                            >
                                <Download className="h-4 w-4" /> Download receipt
                            </button>
                            {onBookAnother && (
                                <button
                                    type="button"
                                    onClick={onBookAnother}
                                    className="flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-primary"
                                >
                                    <Plus className="h-4 w-4" /> Book another clean
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="rounded-3xl border border-slate-200/80 bg-white p-5">
                        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                            <ShieldCheck className="h-4 w-4 text-primary" /> Need to change something?
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-slate-500">
                            Sign in to your account to move or cancel your booking, or contact us{companyPhone ? ` on ${companyPhone}` : ''}{companyEmail ? `${companyPhone ? ' or ' : ' at '}${companyEmail}` : ''}.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BookingConfirmation;
