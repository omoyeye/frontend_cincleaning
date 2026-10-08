import React, { useRef, useMemo, useState } from 'react';
import { Booking, ServiceConfig, Extra } from '../types';
import { ShieldCheck, Download, Printer } from 'lucide-react';
import { useFlyer } from './Flyer';
import { useBusinessBrand } from '../src/hooks/useBusinessBrand';
import { useBusinessSettings } from '../src/context/BusinessSettingsContext';
import {
    formatBookedHoursLabel,
    getBookingDurationHours,
    getDurationBreakdown,
    getCallOutChargeGbp,
    getExtraDisplayLabel,
} from '../src/utils/bookingHelpers';
import { getPayoutBankDetailsForInvoice } from '../src/utils/invoiceBankDetails';
import { DurationBreakdownBlock } from './DurationBreakdownBlock';
import BrandLogoMark from './BrandLogoMark';
import { printInvoiceElement } from '../src/utils/invoicePrint';

function DepositConsentCaption() {
    return (
        <span className="text-xs font-bold leading-relaxed text-slate-800">
            I have read and agree to the deposit and payment details above, and to the{' '}
            <a
                href="/terms-and-conditions"
                className="text-blue-700 underline underline-offset-2 hover:text-blue-800"
            >
                terms and conditions
            </a>{' '}
            (including any short-notice cancellation fee if I cancel close to the appointment).
        </span>
    );
}

/** Optional consent UI under bank details: wizard (controlled) or portal (record + optional ack). */
export type InvoiceDepositConsent =
    | { variant: 'controlled'; checked: boolean; onChange: (next: boolean) => void }
    | {
        variant: 'record';
        acceptedAt?: string | null;
        onAcknowledge?: () => Promise<void>;
    };

interface Props {
    booking: Partial<Booking>;
    serviceConfig?: ServiceConfig;
    extrasConfig: Extra[];
    total: number;
    /** When set, shows checkbox under bank transfer (hidden on admin print flows unless recorded). */
    depositConsent?: InvoiceDepositConsent;
    /**
     * When false, Print / Download PDF are disabled (booking wizard preview).
     * Client portal and admin flows omit this prop so actions stay enabled.
     */
    enableInvoiceExportActions?: boolean;
}

const InvoiceView: React.FC<Props> = ({
    booking,
    serviceConfig,
    extrasConfig,
    total,
    depositConsent,
    enableInvoiceExportActions = true,
}) => {
    const { showFlyer } = useFlyer();
    const invoiceRootRef = useRef<HTMLDivElement>(null);
    const brandName = useBusinessBrand();
    const {
        email: companyEmail,
        phone: companyPhone,
        address: companyAddress,
        bankDetails,
        depositPolicy,
    } = useBusinessSettings();
    const invoiceId = useMemo(() => {
        const id = booking.bookingId;
        if (id !== undefined && id !== null && String(id).length > 0) {
            return `INV-${String(id)}`;
        }
        return `INV-${Date.now()}`;
    }, [booking.id]);
    const dateParams = new Date().toLocaleDateString();
    const totalHours = getBookingDurationHours(booking, serviceConfig ?? null, extrasConfig);
    const durationBreakdown = getDurationBreakdown(booking, serviceConfig ?? null, extrasConfig);
    const callOutCharge = getCallOutChargeGbp(booking, serviceConfig ?? null);
    /** Rate stored on the booking when it was made (London/standard); older bookings fall back to the service rate. */
    const storedRate = Number(booking.hourlyRate);
    const chargedHourlyRate =
        Number.isFinite(storedRate) && storedRate > 0 ? storedRate : Number(serviceConfig?.baseRate || 0);
    const payoutBankDetails = getPayoutBankDetailsForInvoice(bankDetails);
    const depositPercent = Number.isFinite(Number(depositPolicy?.requiredPercent))
        ? Math.min(100, Math.max(0, Number(depositPolicy?.requiredPercent)))
        : 40;
    const depositAmount = Number(((Number(total) || 0) * depositPercent) / 100);
    const defaultDepositMessage =
        `To reserve your preferred slot and lock in your cleaner team, we require a ${depositPercent}% deposit before attendance. This confirms your booking in our live rota and guarantees staff dispatch on the day.`;
    const depositMessage =
        typeof depositPolicy?.message === 'string' && depositPolicy.message.trim()
            ? depositPolicy.message.trim()
            : defaultDepositMessage;

    const runPrint = () => {
        const el = invoiceRootRef.current;
        if (!el) {
            showFlyer('Invoice is not ready to print yet.', 'error');
            return;
        }
        printInvoiceElement(el);
    };

    const runDownloadPdf = () => {
        const el = invoiceRootRef.current;
        if (!el) {
            showFlyer('Invoice is not ready yet.', 'error');
            return;
        }
        printInvoiceElement(el, () => {
            showFlyer('In the print dialog, choose Save as PDF or Microsoft Print to PDF to download.', 'success');
        });
    };

    return (
        <div
            ref={invoiceRootRef}
            className="bg-white p-8 md:p-12 rounded-[2rem] shadow-xl border border-slate-100 max-w-3xl mx-auto font-sans text-slate-900 relative"
        >
            <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none">
                <ShieldCheck className="w-64 h-64 text-slate-900" />
            </div>

            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-8 mb-8 relative z-10">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-2">INVOICE</h1>
                    <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{invoiceId}</p>
                </div>
                <div className="text-right flex flex-col items-end gap-3">
                    <BrandLogoMark className="h-24 w-auto max-w-[400px] object-contain object-right" />
                    <div>
                        <div className="text-xl font-black text-blue-600">{brandName}</div>
                        <p className="text-xs font-bold text-slate-400 mt-1">Professional Cleaning Services</p>
                        {companyAddress ? (
                            <p className="text-xs font-medium text-slate-500 mt-2 max-w-xs text-right ml-auto">{companyAddress}</p>
                        ) : null}
                        {(companyEmail || companyPhone) && (
                            <p className="text-xs font-medium text-slate-500 mt-1 max-w-xs text-right ml-auto">
                                {[companyEmail, companyPhone].filter(Boolean).join(' · ')}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Details */}
            <div className="grid grid-cols-2 gap-8 mb-8 relative z-10">
                <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Billed To</h3>
                    <p className="font-bold text-lg">{booking.contact?.name || 'Guest Customer'}</p>
                    <p className="text-sm text-slate-500 font-medium">{booking.contact?.email}</p>
                    <p className="text-sm text-slate-500 font-medium mt-2">{booking.address?.line1}</p>
                    <p className="text-sm text-slate-500 font-medium">{booking.address?.city}, {booking.address?.postcode}</p>
                </div>
                <div className="text-right">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Booking Details</h3>
                    <p className="font-bold"><span className="text-slate-400 text-xs uppercase tracking-wide mr-2">Service Date:</span> {booking.date}</p>
                    <p className="font-bold"><span className="text-slate-400 text-xs uppercase tracking-wide mr-2">Time:</span> {booking.time}</p>
                    <p className="font-bold"><span className="text-slate-400 text-xs uppercase tracking-wide mr-2">Total hours (booked):</span> {formatBookedHoursLabel(totalHours)} hrs</p>
                    <p className="font-bold"><span className="text-slate-400 text-xs uppercase tracking-wide mr-2">Frequency:</span> {booking.frequency || '-'}</p>
                    <p className="font-bold mt-2"><span className="text-slate-400 text-xs uppercase tracking-wide mr-2">Issue Date:</span> {dateParams}</p>
                </div>
            </div>

            <div className="mb-6 relative z-10 no-print">
                <DurationBreakdownBlock breakdown={durationBreakdown} title="Time allocation (transparency)" />
            </div>

            {/* Property Breakdown */}
            {booking.propertyDetails && (
                <div className="mb-6 p-6 bg-slate-50 rounded-2xl grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10">
                    <div>
                        <span className="block text-[9px] font-black uppercase text-slate-400 tracking-widest">Bedrooms</span>
                        <span className="font-bold text-sm">{booking.propertyDetails.bedrooms}</span>
                    </div>
                    <div>
                        <span className="block text-[9px] font-black uppercase text-slate-400 tracking-widest">Bathrooms</span>
                        <span className="font-bold text-sm">{booking.propertyDetails.bathrooms}</span>
                    </div>
                    <div>
                        <span className="block text-[9px] font-black uppercase text-slate-400 tracking-widest">Clockroom Toilets</span>
                        <span className="font-bold text-sm">{booking.propertyDetails.clockRoomToilets ?? booking.propertyDetails.toilets}</span>
                    </div>
                    <div>
                        <span className="block text-[9px] font-black uppercase text-slate-400 tracking-widest">Living Rooms</span>
                        <span className="font-bold text-sm">{booking.propertyDetails.livingRooms}</span>
                    </div>
                </div>
            )}

            {/* Line Items */}
            <div className="mb-6 relative z-10">
                <table className="w-full text-left">
                    <thead>
                        <tr className="border-b border-slate-200">
                            <th className="py-4 text-xs font-black uppercase tracking-widest text-slate-400">Description</th>
                            {durationBreakdown.model === 'itemized' && (
                                <th className="py-4 text-right text-xs font-black uppercase tracking-widest text-slate-400 w-24">Est. time</th>
                            )}
                            <th className="py-4 text-right text-xs font-black uppercase tracking-widest text-slate-400">Amount</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {callOutCharge > 0 && (
                            <tr>
                                <td className="py-4 font-bold text-slate-700">
                                    Call-out charge
                                    <span className="block text-xs font-medium text-slate-400 mt-1">
                                        Fixed fee payable by the client (per booking)
                                    </span>
                                </td>
                                {durationBreakdown.model === 'itemized' && (
                                    <td className="py-4 text-right font-bold text-slate-600 tabular-nums">-</td>
                                )}
                                <td className="py-4 text-right font-bold text-slate-900">£{callOutCharge.toFixed(2)}</td>
                            </tr>
                        )}
                        <tr>
                            <td className="py-4 font-bold text-slate-700">
                                {serviceConfig?.name || booking.serviceType}
                                <span className="block text-xs font-medium text-slate-400 mt-1">
                                    {durationBreakdown.model === 'itemized'
                                        ? `Minimum duration guidance - ${formatBookedHoursLabel(durationBreakdown.baseHours)}h (instruction only, not charged)`
                                        : `Booked duration - ${formatBookedHoursLabel(totalHours)}h`}
                                </span>
                            </td>
                            {durationBreakdown.model === 'itemized' && (
                                <td className="py-4 text-right font-bold text-slate-600 tabular-nums">
                                    {formatBookedHoursLabel(durationBreakdown.baseHours)}h
                                </td>
                            )}
                            <td className="py-4 text-right font-bold text-slate-900">
                                £
                                {durationBreakdown.model === 'itemized'
                                    ? '0.00'
                                    : chargedHourlyRate.toFixed(2)}
                            </td>
                        </tr>
                        {booking.extras?.map((extraItem) => {
                            const extra = extrasConfig.find((e) => String(e.id) === String(extraItem.id));
                            const timeLine = durationBreakdown.lines.find((l) => l.extraId === String(extraItem.id));
                            return (
                                <tr key={`${extraItem.id}-${extraItem.quantity}`}>
                                    <td className="py-4 font-bold text-slate-700">
                                        {getExtraDisplayLabel(extra?.name || String(extraItem.id))} x {extraItem.quantity}
                                        <span className="block text-xs font-medium text-slate-400 mt-1">
                                            {durationBreakdown.model === 'itemized'
                                                ? 'Scope / add-on (own price & est. time)'
                                                : 'Extra Service Add-on'}
                                        </span>
                                    </td>
                                    {durationBreakdown.model === 'itemized' && (
                                        <td className="py-4 text-right font-bold text-slate-600 tabular-nums">
                                            {timeLine ? `${formatBookedHoursLabel(timeLine.lineHours)}h` : '-'}
                                        </td>
                                    )}
                                    <td className="py-4 text-right font-bold text-slate-900">
                                        £{(Number(extra?.price || 0) * extraItem.quantity).toFixed(2)}
                                    </td>
                                </tr>
                            );
                        })}
                        {booking.propertyDetails?.cleaningMaterials && booking.propertyDetails.cleaningMaterials !== 'none' && (
                            <tr>
                                <td className="py-4 font-bold text-slate-700">
                                    {booking.propertyDetails.cleaningMaterials === 'hoover_and_materials' ? 'Hoover + cleaning materials' : 'Hoover only'}
                                    <span className="block text-xs font-medium text-slate-400 mt-1">Cleaning equipment add-on</span>
                                </td>
                                {durationBreakdown.model === 'itemized' && (
                                    <td className="py-4 text-right font-bold text-slate-600 tabular-nums">-</td>
                                )}
                                <td className="py-4 text-right font-bold text-slate-900">
                                    £{booking.propertyDetails.cleaningMaterials === 'hoover_and_materials' ? '6.00' : '3.00'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                    <tfoot>
                        <tr className="border-t border-slate-200">
                            <td
                                colSpan={durationBreakdown.model === 'itemized' ? 2 : 1}
                                className="py-6 text-right font-black text-lg text-slate-900"
                            >
                                Total Due
                            </td>
                            <td className="py-6 text-right font-black text-2xl text-blue-600">£{Number(total).toFixed(2)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/70 p-6 relative z-10 space-y-4">
                <div>
                    <h4 className="font-black text-blue-900">Payment Details</h4>
                    <p className="text-xs font-semibold text-blue-700 mt-1">{depositMessage}</p>
                    <p className="text-xs font-bold text-blue-900 mt-2">
                        Deposit required now: £{depositAmount.toFixed(2)} ({depositPercent}% of £{Number(total).toFixed(2)})
                    </p>
                </div>
                <p className="text-sm font-medium text-blue-800">
                    A secure payment link will be sent to your email once your booking is confirmed by our team.
                </p>
                {depositConsent ? (
                    <InvoiceBankConsentFooter depositConsent={depositConsent} />
                ) : null}
            </div>

            {/* Footer / Status */}
            <div className="bg-slate-50 p-6 rounded-2xl flex justify-between items-center relative z-10">
                <div className="flex items-center space-x-2">
                    {booking.invoicePaid ? (
                        <>
                            <div className="w-3 h-3 rounded-full bg-emerald-500" />
                            <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Paid</span>
                        </>
                    ) : (
                        <>
                            <div className="w-3 h-3 rounded-full bg-amber-500 animate-pulse" />
                            <span className="text-xs font-black uppercase tracking-widest text-amber-600">Payment pending</span>
                        </>
                    )}
                </div>
                <p className="text-xs font-medium text-slate-400">Thank you for choosing {brandName}.</p>
            </div>

            <div className="mt-4 space-y-3 no-print">
                {!enableInvoiceExportActions ? (
                    <p className="text-center text-xs font-semibold text-slate-500">
                        Print and PDF download are available in My Account after your booking is confirmed.
                    </p>
                ) : null}
                <div className="flex flex-col sm:flex-row flex-wrap justify-center items-stretch sm:items-center gap-3">
                    <button
                        type="button"
                        onClick={runPrint}
                        disabled={!enableInvoiceExportActions}
                        title={
                            enableInvoiceExportActions
                                ? undefined
                                : 'Available in My Account after you complete your booking.'
                        }
                        className="inline-flex items-center justify-center gap-2 min-h-11 px-5 py-3 bg-slate-100 rounded-xl font-bold text-slate-700 border border-slate-200/80 transition-colors enabled:hover:bg-slate-200 enabled:active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                        <Printer className="w-4 h-4 shrink-0" aria-hidden />
                        <span>Print Invoice</span>
                    </button>
                    <button
                        type="button"
                        onClick={runDownloadPdf}
                        disabled={!enableInvoiceExportActions}
                        title={
                            enableInvoiceExportActions
                                ? undefined
                                : 'Available in My Account after you complete your booking.'
                        }
                        className="inline-flex items-center justify-center gap-2 min-h-11 px-5 py-3 bg-slate-900 text-white rounded-xl font-bold transition-colors enabled:hover:bg-slate-800 enabled:active:scale-[0.98] disabled:opacity-45 disabled:cursor-not-allowed"
                    >
                        <Download className="w-4 h-4 shrink-0" aria-hidden />
                        <span>Download PDF</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export function InvoiceBankConsentFooter({ depositConsent }: { depositConsent: InvoiceDepositConsent }) {
    const [busy, setBusy] = useState(false);
    const [ackError, setAckError] = useState<string | null>(null);

    if (depositConsent.variant === 'controlled') {
        return (
            <label className="no-print flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-white/90 p-4 text-left">
                <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                    checked={depositConsent.checked}
                    onChange={(e) => depositConsent.onChange(e.target.checked)}
                />
                <DepositConsentCaption />
            </label>
        );
    }

    const at = depositConsent.acceptedAt;
    if (at) {
        const label = new Date(at).toLocaleString();
        return (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-xs font-bold text-emerald-900">
                Deposit and cancellation terms acknowledged on {label}. This is stored on your booking for our team.
            </p>
        );
    }

    if (!depositConsent.onAcknowledge) return null;

    return (
        <div className="no-print space-y-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-200 bg-white/90 p-4 text-left">
                <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 shrink-0 rounded border-blue-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                    disabled={busy}
                    onChange={async (e) => {
                        if (!e.target.checked) return;
                        setAckError(null);
                        setBusy(true);
                        try {
                            await depositConsent.onAcknowledge!();
                        } catch {
                            setAckError('Could not save. Please try again.');
                            e.target.checked = false;
                        } finally {
                            setBusy(false);
                        }
                    }}
                />
                <DepositConsentCaption />
            </label>
            {ackError ? <p className="text-xs font-bold text-red-600">{ackError}</p> : null}
        </div>
    );
}

export default InvoiceView;
