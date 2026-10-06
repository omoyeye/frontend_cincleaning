import React from 'react';
import {
    CheckCircle,
    CheckCircle2,
    ShieldCheck,
    Sparkles,
    MapPin,
    Briefcase,
    Lock,
    ChevronLeft,
    User,
    CreditCard,
    ExternalLink,
    Landmark,
} from 'lucide-react';
import { format } from 'date-fns';
import { Booking, ServiceConfig, Extra } from '../types';
import { useFlyer } from './Flyer';
import {
    formatBookedHoursLabel,
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
    const defaultDepositMessage =
        `To reserve your preferred slot and lock in your cleaner team, we require a ${depositPercent}% deposit before attendance. This confirms your booking in our live rota and guarantees staff dispatch on the day.`;
    const depositMessage =
        typeof depositPolicy?.message === 'string' && depositPolicy.message.trim()
            ? depositPolicy.message.trim()
            : defaultDepositMessage;

    return (
        <div className={`mx-auto ${isModal ? 'p-0' : 'py-12 px-6'} text-center animate-in zoom-in-95 duration-500`}>
            {!isModal && (
                <>
                    <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-green-600 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-green-200 rotation-3 hover:scale-110 transition-transform">
                        <CheckCircle className="w-12 h-12 text-white" />
                    </div>

                    <h2 className="text-5xl font-black text-slate-900 mb-4 tracking-tight">You're All Set! 🎉</h2>
                    <p className="text-slate-500 mb-2 text-xl font-medium">Get ready for a sparkling clean home!</p>

                    <div className="inline-block bg-blue-50 py-3 px-6 rounded-full mb-12 border border-blue-100">
                        <p className="text-blue-700 font-bold text-sm flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
                            Confirmation sent to {booking.contact.email}
                        </p>
                    </div>
                    {conflictWarningText ? (
                        <div className="mb-8 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-left">
                            <p className="text-xs font-black uppercase tracking-widest text-amber-700">Scheduling note</p>
                            <p className="mt-1 text-sm font-bold text-amber-900">{conflictWarningText}</p>
                        </div>
                    ) : null}
                </>
            )}

            <div
                ref={receiptPrintRef}
                className="bg-white rounded-[2.5rem] shadow-2xl border border-slate-100 overflow-hidden text-left relative"
            >
                {/* Header */}
                <div className="bg-slate-900 p-8 text-white relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-10 opacity-5 rotate-12 scale-150">
                        <Sparkles className="w-40 h-40" />
                    </div>
                    <div className="relative z-10 flex justify-between items-start gap-4">
                        <div className="flex items-start gap-4 min-w-0">
                            <div className="shrink-0 rounded-xl bg-white/95 p-3 shadow-sm ring-1 ring-white/20">
                                <BrandLogoMark className="h-[5.5rem] w-auto max-w-[280px] object-contain object-left" />
                            </div>
                            <div className="min-w-0">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400 mb-2 block">Booking Reference</span>
                                <h3 className="text-3xl font-black text-white">#{booking.bookingId ?? booking.id}</h3>
                            </div>
                        </div>
                        <div className="bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10 shrink-0">
                            <ShieldCheck className="w-8 h-8 text-green-400" />
                        </div>
                    </div>
                </div>

                {/* Details Body */}
                <div className="p-8 space-y-6 bg-slate-50/50">
                    {/* Service & Time */}
                    <div className="flex justify-between items-center pb-6 border-b border-slate-200 border-dashed">
                        <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Service</div>
                            <div className="text-xl font-black text-slate-900">{serviceName}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Date & Time</div>
                            <div className="text-xl font-black text-slate-900">
                                {serviceDateLocal ? format(serviceDateLocal, 'MMM do') : booking.date || 'N/A'} @ {booking.time}
                            </div>
                        </div>
                    </div>

                    {/* Client Details */}
                    <div className="pb-6 border-b border-slate-200 border-dashed">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Client Details</div>
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-purple-100 rounded-lg text-purple-600 mt-1">
                                <User className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="font-bold text-slate-800">{booking.contact.name || 'N/A'}</div>
                                <div className="text-sm font-medium text-slate-500">{booking.contact.email}</div>
                                {booking.contact.phone && <div className="text-sm font-medium text-slate-500">{booking.contact.phone}</div>}
                            </div>
                        </div>
                    </div>

                    {/* Location */}
                    <div className="pb-6 border-b border-slate-200 border-dashed">
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Location</div>
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-blue-100 rounded-lg text-blue-600 mt-1">
                                <MapPin className="w-4 h-4" />
                            </div>
                            <div>
                                <div className="font-bold text-slate-800">{booking.address.line1}</div>
                                <div className="text-sm font-medium text-slate-500">{booking.address.city}, {booking.address.postcode}</div>
                            </div>
                        </div>
                    </div>

                    <DurationBreakdownBlock breakdown={durationBreakdown} className="mb-2" />

                    {/* Summary Breakdown */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-100 space-y-4 shadow-sm">
                        <h4 className="font-black text-slate-800 flex items-center gap-2">
                            <Briefcase className="w-4 h-4 text-slate-400" />
                            Booking Summary
                        </h4>

                        {callOutCharge > 0 && (
                            <div className="flex justify-between text-sm font-bold text-slate-800 gap-3 pb-2 border-b border-dashed border-slate-100">
                                <span>Call-out charge</span>
                                <span className="shrink-0">£{callOutCharge.toFixed(2)}</span>
                            </div>
                        )}
                        {durationBreakdown.model === 'itemized' && (
                            <div className="flex justify-between text-sm font-bold text-slate-800 gap-3 pb-2 border-b border-dashed border-slate-100">
                                <span>
                                    Minimum duration ({formatBookedHoursLabel(durationBreakdown.baseHours)}h, instruction only)
                                </span>
                                <span className="shrink-0">£0.00</span>
                            </div>
                        )}

                        {/* Breakout Extras/Property Details */}
                        <div className="space-y-2 pl-2 border-l-2 border-slate-100">
                            {selectedExtras.length > 0 ? selectedExtras.map(item => {
                                const extra = extrasList.find(e => String(e.id) === String(item.id));
                                if (!extra) return null;
                                const timeLine = durationBreakdown.lines.find((l) => l.extraId === String(item.id));
                                return (
                                    <div key={item.id} className="flex justify-between text-sm text-slate-600 font-medium gap-3">
                                        <span>{item.quantity}x {getExtraDisplayLabel(extra.name)}</span>
                                        <span className="text-right shrink-0">
                                            {durationBreakdown.model === 'itemized' && timeLine ? (
                                                <span className="text-slate-400 font-bold mr-2">{formatBookedHoursLabel(timeLine.lineHours)}h</span>
                                            ) : null}
                                            <span>£{(Number(extra.price) * item.quantity).toFixed(0)}</span>
                                        </span>
                                    </div>
                                );
                            }) : <span className="text-sm text-slate-400 italic">Standard service only</span>}
                        </div>

                        <div className="pt-4 border-t border-slate-100 mt-2 flex justify-between items-center">
                            <span className="text-lg font-bold text-slate-600">Total Paid</span>
                            <span className="text-3xl font-black text-green-600">£{Number(booking.totalPrice).toFixed(2)}</span>
                        </div>
                    </div>

                    <div className="bg-green-50 p-6 rounded-2xl border border-green-100 text-center shadow-inner mt-4">
                        <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm">
                            <Sparkles className="w-6 h-6 text-green-500" />
                        </div>
                        <h4 className="text-green-800 font-black text-lg mb-2 tracking-tight">Welcome to the {brandName} family! ✨</h4>
                        <p className="text-green-700 text-sm font-medium leading-relaxed mb-4">
                            Your trust means everything to us. Our professionals are already preparing to deliver a meticulous clean that will leave your space feeling entirely renewed. We don't just clean - we care for your home.
                        </p>
                        <div className="pt-4 border-t border-green-200/50 flex flex-col items-center justify-center space-y-1">
                            <span className="text-green-900 font-extrabold uppercase tracking-widest text-xs">{brandName}</span>
                            <span className="text-green-600/80 font-bold text-[10px] uppercase tracking-wider text-center leading-relaxed">
                                {[companyAddress, companyEmail, companyPhone].filter(Boolean).join(' · ') || 'Thank you for your business.'}
                            </span>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 shadow-inner mt-4 text-left space-y-4">
                        <h4 className="text-blue-900 font-black text-lg mb-2 tracking-tight">Payment Details</h4>
                        <p className="text-blue-800 text-sm font-semibold leading-relaxed">{depositMessage}</p>
                        <p className="text-blue-900 text-sm font-black">
                            Deposit required now: £{depositAmount.toFixed(2)} ({depositPercent}% of £{totalAmount.toFixed(2)})
                        </p>

                        {booking.stripePaymentLink && !booking.invoicePaid ? (
                            <a
                                href={booking.stripePaymentLink}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center justify-center gap-3 w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-700 hover:shadow-xl active:scale-[0.98] transition-all no-print"
                            >
                                <CreditCard className="w-5 h-5" />
                                Pay Deposit Now
                                <ExternalLink className="w-4 h-4 opacity-70" />
                            </a>
                        ) : booking.invoicePaid ? (
                            <div className="flex items-center gap-3 p-4 bg-green-100 rounded-2xl border border-green-200">
                                <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
                                <div>
                                    <p className="text-sm font-black text-green-900">Deposit Paid</p>
                                    <p className="text-xs font-medium text-green-700">Payment confirmed — thank you!</p>
                                </div>
                            </div>
                        ) : (
                            <p className="text-blue-700 text-sm font-medium">
                                A secure payment link will be sent to your email once your booking is confirmed by our team.
                            </p>
                        )}

                        <div className="pt-4 mt-2 border-t border-blue-200/60">
                            <div className="flex items-center gap-2 mb-3">
                                <Landmark className="w-4 h-4 text-blue-700" />
                                <p className="text-sm font-black text-blue-900 uppercase tracking-wider">Or pay by bank transfer</p>
                            </div>
                            <div className="space-y-3">
                                {payoutBankDetails.map((bank) => (
                                    <div key={bank.id || bank.accountNumber} className="bg-white rounded-xl border border-blue-200 p-4">
                                        <p className="text-sm font-black text-slate-900">{bank.accountName || 'Account'}</p>
                                        {bank.bankName?.trim() && <p className="text-xs font-semibold text-slate-500 mt-0.5">{bank.bankName}</p>}
                                        <div className="mt-2 space-y-1">
                                            <p className="text-sm font-semibold text-slate-700">Account number: <span className="font-black">{bank.accountNumber}</span></p>
                                            <p className="text-sm font-semibold text-slate-700">Sort code: <span className="font-black">{bank.sortCode}</span></p>
                                        </div>
                                        {bank.notes?.trim() && <p className="text-xs text-slate-500 mt-2">{bank.notes}</p>}
                                    </div>
                                ))}
                            </div>
                            <p className="text-xs font-medium text-blue-600 mt-3">
                                Please use your booking reference <span className="font-black">#{booking.bookingId ?? booking.id}</span> as the payment reference.
                            </p>
                        </div>

                        {depositConsent ? <InvoiceBankConsentFooter depositConsent={depositConsent} /> : null}
                    </div>
                </div>

                <div className="no-print p-6 bg-white border-t border-slate-100">
                    <button
                        type="button"
                        className="w-full flex items-center justify-center space-x-3 bg-slate-900 text-white py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all active:scale-95 shadow-xl shadow-slate-200"
                        onClick={() => {
                            const el = receiptPrintRef.current;
                            if (!el) {
                                showFlyer('Could not open print view. Please try again.', 'error');
                                return;
                            }
                            printInvoiceElement(el, () =>
                                showFlyer(
                                    'Print dialog opened — choose Save as PDF in the print window to download your receipt.',
                                    'success'
                                )
                            );
                        }}
                    >
                        <Lock className="w-5 h-5 text-slate-400" />
                        <span>Download Official Receipt</span>
                    </button>
                </div>
            </div>

            {!isModal && onBookAnother && (
                <button
                    onClick={onBookAnother}
                    className="mt-8 text-slate-400 font-bold hover:text-blue-600 transition-colors flex items-center justify-center gap-2 mx-auto group"
                >
                    <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Book Another Service
                </button>
            )}
        </div>
    );
};

export default BookingConfirmation;
