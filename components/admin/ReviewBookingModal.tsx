import React, { useEffect, useState } from 'react';
import { Booking, BookingStatus, ServiceConfig, Extra, WorkCompletionData, PaymentFeeEvidenceItem } from '../../types';
import { apiAdmin } from '../../services/api';
import { X, CheckCircle2, CreditCard, Send, FileText, AlertCircle, Camera, Download } from 'lucide-react';
import InvoiceView from '../InvoiceView';
import { DurationBreakdownBlock } from '../DurationBreakdownBlock';
import { useFlyer } from '../Flyer';
import { formatBookedHoursLabel, getDurationBreakdown, getExtraDisplayLabel } from '../../src/utils/bookingHelpers';
import { useBusinessSettings } from '../../src/context/BusinessSettingsContext';
import { formatInvoiceBankDetailsPlainText, getPayoutBankDetailsForInvoice } from '../../src/utils/invoiceBankDetails';

interface Props {
    booking: Booking;
    services: ServiceConfig[];
    extras: Extra[];
    onClose: () => void;
    onUpdate: () => void;
}

function bookingStatusPillClass(status: BookingStatus): string {
    switch (status) {
        case BookingStatus.COMPLETED:
            return 'bg-amber-100 text-amber-900 border-amber-200';
        case BookingStatus.CANCELLED:
            return 'bg-red-100 text-red-800 border-red-200';
        case BookingStatus.CONFIRMED:
            return 'bg-emerald-100 text-emerald-900 border-emerald-200';
        default:
            return 'bg-slate-100 text-slate-800 border-slate-200';
    }
}

const BookingReviewModal: React.FC<Props> = ({ booking, services, extras, onClose, onUpdate }) => {
    const { showFlyer } = useFlyer();
    const { bankDetails } = useBusinessSettings();
    const [liveBooking, setLiveBooking] = useState<Booking>(booking);
    const [adminNote, setAdminNote] = useState(booking.adminNotes || '');
    const [stripeLink, setStripeLink] = useState(booking.stripePaymentLink || '');
    const [isProcessing, setIsProcessing] = useState(false);
    const [generatingStripeLink, setGeneratingStripeLink] = useState(false);
    const [activeTab, setActiveTab] = useState<'details' | 'invoice' | 'actions'>('details');

    useEffect(() => {
        setLiveBooking(booking);
        setAdminNote(booking.adminNotes || '');
        setStripeLink(booking.stripePaymentLink || '');
    }, [booking]);

    useEffect(() => {
        let live = true;
        const syncBooking = async () => {
            try {
                const rows = await apiAdmin.getBookings();
                const current = rows.find((b) => b.id === booking.id);
                if (live && current) {
                    setLiveBooking(current);
                    // We don't update adminNote or stripeLink here so we don't
                    // overwrite what the admin is currently typing.
                }
            } catch {
                // keep previous state on transient errors
            }
        };
        const timer = setInterval(syncBooking, 5000);
        return () => {
            live = false;
            clearInterval(timer);
        };
    }, [booking.id]);

    const serviceConfig = services.find((s) => String(s.id) === String(liveBooking.serviceType) || s.name === liveBooking.serviceType);
    const durationBreakdown = getDurationBreakdown(liveBooking, serviceConfig ?? null, extras);

    const downloadEvidence = (item: PaymentFeeEvidenceItem, index: number) => {
        const dataUrl = String(item.dataUrl || '');
        if (!dataUrl) return;
        const inferredExt = dataUrl.toLowerCase().startsWith('data:application/pdf')
            ? '.pdf'
            : dataUrl.toLowerCase().startsWith('data:image/jpeg')
                ? '.jpg'
                : dataUrl.toLowerCase().startsWith('data:image/png')
                    ? '.png'
                    : '';
        const rawBase = String(item.fileName || `payment-proof-${liveBooking.id}-${index + 1}`).trim();
        const hasExtension = /\.[a-z0-9]{2,5}$/i.test(rawBase);
        const filename = hasExtension ? rawBase : `${rawBase}${inferredExt}`;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = filename;
        a.rel = 'noreferrer';
        document.body.appendChild(a);
        a.click();
        a.remove();
    };

    const handleSendUpdates = async () => {
        setIsProcessing(true);
        try {
            // 1. Update Booking with new notes and payment link
            await apiAdmin.updateBooking(liveBooking.id, {
                adminNotes: adminNote,
                stripePaymentLink: stripeLink,
                status: BookingStatus.CONFIRMED // Auto-confirm on sending invoice
            });

            // 2. Call apiAdmin.sendBookingConfirmation to send the custom template
            await apiAdmin.sendBookingConfirmation(liveBooking.id, {
                adminNote: adminNote,
                stripePaymentLink: stripeLink
            });

            showFlyer(`Email Sent to ${liveBooking.contact.email}! Includes: Professional Invoice, Stripe Payment Link, and Admin Notes`, 'success');
            onUpdate();
            onClose();

        } catch (error) {
            showFlyer("Failed to update booking. Please try again.", 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleGenerateStripeLink = async () => {
        setGeneratingStripeLink(true);
        try {
            const result = await apiAdmin.createBookingPaymentIntent(liveBooking.id);
            if (result.alreadyPaid) {
                showFlyer('This booking deposit has already been paid via Stripe!', 'success');
                return;
            }
            if (result.payUrl) {
                setStripeLink(result.payUrl);
                showFlyer(`Stripe payment link generated — £${result.depositAmount?.toFixed(2) ?? '?'} (${result.depositPercent ?? '?'}% deposit)`, 'success');
            }
        } catch (error: any) {
            showFlyer(error?.message || 'Failed to generate Stripe payment link', 'error');
        } finally {
            setGeneratingStripeLink(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[150] bg-white flex animate-in fade-in duration-300">
            <div className="bg-white w-full h-full flex flex-col overflow-hidden">

                {/* Header */}
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <div className="flex items-center space-x-3 mb-2">
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Booking Review</h2>
                            <span className="px-3 py-1 bg-blue-100 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                #{liveBooking.bookingId}
                            </span>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Review details before confirming to client</p>
                    </div>
                    <button onClick={onClose} className="p-4 bg-white rounded-2xl text-slate-400 hover:text-red-500 hover:shadow-md transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-64 bg-slate-50 border-r border-slate-100 p-6 space-y-2 hidden md:block">
                        <button
                            onClick={() => setActiveTab('details')}
                            className={`w-full flex items-center space-x-3 px-5 py-4 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all ${activeTab === 'details' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:bg-white hover:text-slate-600'}`}
                        >
                            <FileText className="w-4 h-4" /> <span>Details</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('invoice')}
                            className={`w-full flex items-center space-x-3 px-5 py-4 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all ${activeTab === 'invoice' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:bg-white hover:text-slate-600'}`}
                        >
                            <CreditCard className="w-4 h-4" /> <span>Invoice View</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('actions')}
                            className={`w-full flex items-center space-x-3 px-5 py-4 rounded-2xl font-bold text-xs uppercase tracking-wider transition-all ${activeTab === 'actions' ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:bg-white hover:text-slate-600'}`}
                        >
                            <Send className="w-4 h-4" /> <span>Finalize</span>
                        </button>
                    </div>

                    {/* Main Panel */}
                    <div className="flex-1 overflow-y-auto p-8 md:p-12">
                        {activeTab === 'details' && (
                            <div className="space-y-8 animate-in slide-in-from-right duration-300">
                                <div className="grid grid-cols-2 gap-8">
                                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Status</div>
                                        <span
                                            className={`inline-flex text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-xl border ${bookingStatusPillClass(liveBooking.status)}`}
                                        >
                                            {liveBooking.status}
                                        </span>
                                    </div>
                                    <DetailBox label="Service Type" value={liveBooking.serviceType} />
                                    <DetailBox label="Date & Time" value={`${liveBooking.date} @ ${liveBooking.time}`} />
                                    <DetailBox label="Customer" value={liveBooking.contact.name} />
                                    <DetailBox label="Email" value={liveBooking.contact.email} />
                                    <div className="col-span-2">
                                        <DetailBox label="Address" value={`${liveBooking.address.line1}, ${liveBooking.address.city}, ${liveBooking.address.postcode}`} />
                                    </div>
                                    <div className="col-span-2 space-y-3 rounded-3xl border border-slate-200 bg-slate-50/80 p-6">
                                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                                            Client consent (audit)
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <DetailBox
                                                label="Deposit / payment terms"
                                                value={
                                                    liveBooking.depositTermsAcceptedAt
                                                        ? new Date(liveBooking.depositTermsAcceptedAt as string).toLocaleString()
                                                        : 'Not recorded (legacy or admin-created)'
                                                }
                                            />
                                            <DetailBox
                                                label="Short-notice cancellation fee"
                                                value={
                                                    liveBooking.shortNoticeCancelFeeConsentedAt
                                                        ? `Acknowledged ${new Date(liveBooking.shortNoticeCancelFeeConsentedAt as string).toLocaleString()}`
                                                        : liveBooking.status === 'Cancelled'
                                                            ? 'Not required for this cancel, or not recorded (legacy)'
                                                            : '—'
                                                }
                                            />
                                        </div>
                                    </div>
                                    {liveBooking.paymentFeeEvidence?.items &&
                                        liveBooking.paymentFeeEvidence.items.length > 0 ? (
                                        <div className="col-span-2 space-y-3 rounded-3xl border border-indigo-100 bg-indigo-50/60 p-6">
                                            <div className="text-[10px] font-black uppercase text-indigo-800 tracking-widest">
                                                Client payment proof (deposit / cancellation fee)
                                            </div>
                                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                {liveBooking.paymentFeeEvidence.items.map((it: PaymentFeeEvidenceItem, idx: number) => (
                                                    <li
                                                        key={`${it.uploadedAt}-${idx}`}
                                                        onClick={() => downloadEvidence(it, idx)}
                                                        role="button"
                                                        tabIndex={0}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' || e.key === ' ') {
                                                                e.preventDefault();
                                                                downloadEvidence(it, idx);
                                                            }
                                                        }}
                                                        className="flex cursor-pointer gap-3 rounded-2xl border border-indigo-100 bg-white p-3 transition-colors hover:bg-indigo-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
                                                    >
                                                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                                                            {it.dataUrl?.toLowerCase().startsWith('data:image/') ? (
                                                                <a href={it.dataUrl} target="_blank" rel="noreferrer" className="block h-full w-full">
                                                                    <img src={it.dataUrl} alt="" className="h-full w-full object-cover" />
                                                                </a>
                                                            ) : (
                                                                <a
                                                                    href={it.dataUrl}
                                                                    target="_blank"
                                                                    rel="noreferrer"
                                                                    className="flex h-full w-full items-center justify-center text-[10px] font-black text-slate-600 hover:bg-slate-50"
                                                                >
                                                                    PDF
                                                                </a>
                                                            )}
                                                        </div>
                                                        <div className="min-w-0 flex-1 text-left">
                                                            <div className="text-[10px] font-black uppercase text-indigo-700">
                                                                {it.kind === 'cancellation_fee' ? 'Cancellation fee' : 'Deposit'}
                                                            </div>
                                                            <div className="truncate text-xs font-bold text-slate-900">{it.fileName || 'Upload'}</div>
                                                            <div className="text-[10px] font-medium text-slate-500">
                                                                {new Date(it.uploadedAt).toLocaleString()}
                                                            </div>
                                                            {it.note ? (
                                                                <p className="mt-1 text-xs font-medium text-slate-700 whitespace-pre-wrap">{it.note}</p>
                                                            ) : null}
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    downloadEvidence(it, idx);
                                                                }}
                                                                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-indigo-800 hover:bg-indigo-100"
                                                            >
                                                                <Download className="h-3.5 w-3.5" />
                                                                Download
                                                            </button>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ) : null}
                                </div>

                                <DurationBreakdownBlock breakdown={durationBreakdown} title="Booked duration (client invoice matches)" />

                                <div className="space-y-4">
                                    <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1 border-b border-slate-100 pb-2">Property Specifications (Level 2)</h3>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                        <DetailBox label="Bedrooms" value={liveBooking.propertyDetails.bedrooms.toString()} />
                                        <DetailBox label="Bathrooms" value={liveBooking.propertyDetails.bathrooms.toString()} />
                                        <DetailBox
                                            label="Clockroom Toilets"
                                            value={String(liveBooking.propertyDetails.clockRoomToilets ?? liveBooking.propertyDetails.toilets)}
                                        />
                                        <DetailBox label="Living Rooms" value={liveBooking.propertyDetails.livingRooms.toString()} />
                                        <DetailBox label="Kitchens" value={liveBooking.propertyDetails.kitchens.toString()} />
                                        <DetailBox label="Property Type" value={liveBooking.propertyDetails.propertyType || 'Standard'} />
                                        <DetailBox label="Surface Type" value={liveBooking.propertyDetails.surfaceType || 'Multi'} />
                                        <DetailBox label="Sq Ft" value={liveBooking.propertyDetails.sqft > 0 ? `${liveBooking.propertyDetails.sqft} sqft` : 'N/A'} />
                                    </div>
                                </div>

                                {liveBooking.extras && liveBooking.extras.length > 0 && (
                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1 border-b border-slate-100 pb-2">Extra Services</h3>
                                        <div className="flex flex-col gap-2">
                                            {liveBooking.extras.map((item, i: number) => {
                                                const ex = extras.find((e) => String(e.id) === String(item.id));
                                                const line = durationBreakdown.lines.find((l) => l.extraId === String(item.id));
                                                const label = getExtraDisplayLabel(ex?.name || String(item.id));
                                                return (
                                                    <div
                                                        key={`${item.id}-${i}`}
                                                        className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-blue-50 text-blue-800 rounded-xl text-xs font-bold border border-blue-100"
                                                    >
                                                        <span>
                                                            {item.quantity}× {label}
                                                        </span>
                                                        {durationBreakdown.model === 'itemized' && line ? (
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-600">
                                                                {formatBookedHoursLabel(line.lineHours)}h booked
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {liveBooking.workCompletion && (
                                    <div className="space-y-4">
                                        <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1 border-b border-slate-100 pb-2">Staff Completion Report (Real-time)</h3>
                                        {(() => {
                                            const wc = liveBooking.workCompletion as WorkCompletionData;
                                            const clockInAdmin =
                                                wc.clockInAtIso && wc.clockInTime
                                                    ? `${wc.clockInTime} · ${new Date(wc.clockInAtIso).toLocaleString()}`
                                                    : wc.clockInTime || 'N/A';
                                            const clockOutAdmin =
                                                wc.clockOutAtIso && wc.clockOutTime
                                                    ? `${wc.clockOutTime} · ${new Date(wc.clockOutAtIso).toLocaleString()}`
                                                    : wc.clockOutTime || 'N/A';
                                            return (
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <DetailBox label="Clock In" value={clockInAdmin} />
                                                    <DetailBox label="Clock Out" value={clockOutAdmin} />
                                                    <DetailBox label="Job Notes" value={wc.notes || 'No notes'} />
                                                    <DetailBox label="Issues" value={wc.issues || 'No issues'} />
                                                    {wc.earlyClockOutReason ? (
                                                        <div className="md:col-span-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
                                                            <div className="text-[10px] font-black uppercase tracking-widest text-amber-800 mb-1">
                                                                Early clock-out reason
                                                            </div>
                                                            <div className="text-sm font-bold text-amber-950 whitespace-pre-wrap">{wc.earlyClockOutReason}</div>
                                                        </div>
                                                    ) : null}
                                                    <DetailBox label="Signature" value={wc.signature || 'Not captured'} />
                                                    <DetailBox label="Location" value={wc.location ? `${wc.location.lat}, ${wc.location.lng}` : 'Not shared'} />
                                                    <div className="md:col-span-2 bg-slate-50 p-6 rounded-3xl border border-slate-100">
                                                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-3 flex items-center">
                                                            <Camera className="w-4 h-4 mr-2" /> Submitted Photos
                                                        </div>
                                                        {wc.photos?.length ? (
                                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                                                {wc.photos.map((photo, idx) => (
                                                                    <a key={idx} href={photo} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 bg-white">
                                                                        <img src={photo} alt={`Work report ${idx + 1}`} className="w-full h-28 object-cover" />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm font-bold text-slate-400">No photos submitted.</div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                )}

                                <div className="bg-amber-50 p-6 rounded-3xl border border-amber-100">
                                    <div className="flex items-center space-x-2 mb-4 text-amber-700 font-black text-xs uppercase tracking-widest">
                                        <AlertCircle className="w-4 h-4" /> Admin Notes
                                    </div>
                                    <textarea
                                        className="w-full bg-white p-4 rounded-2xl border-none outline-none text-sm font-medium text-slate-700 h-32 resize-none shadow-sm focus:ring-2 ring-amber-500/20"
                                        placeholder="Add internal notes or message to customer..."
                                        value={adminNote}
                                        onChange={e => setAdminNote(e.target.value)}
                                    />
                                    <p className="text-[10px] text-amber-600/60 mt-2 font-bold uppercase tracking-wide">* These notes will be included in the confirmation email</p>
                                </div>
                            </div>
                        )}

                        {activeTab === 'invoice' && (
                            <div className="scale-75 origin-top-left w-[133%] animate-in slide-in-from-right duration-300">
                                <InvoiceView
                                    booking={liveBooking}
                                    serviceConfig={services.find((s) => String(s.id) === String(liveBooking.serviceType) || s.name === liveBooking.serviceType)}
                                    extrasConfig={extras}
                                    total={liveBooking.totalPrice}
                                />
                            </div>
                        )}

                        {activeTab === 'actions' && (
                            <div className="space-y-8 animate-in slide-in-from-right duration-300 max-w-lg mx-auto text-center">
                                <div className="w-24 h-24 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Send className="w-10 h-10" />
                                </div>

                                <h3 className="text-2xl font-black text-slate-900">Ready to Send?</h3>
                                <p className="text-slate-500 font-medium">This will confirm the booking and send the payment invoice to the customer.</p>

                                <div className="bg-slate-50 p-6 rounded-3xl text-left space-y-4 border border-slate-100">
                                    <label className="text-xs font-black uppercase text-slate-400 tracking-widest pl-1">
                                        Stripe link or bank details
                                    </label>
                                    <div className="relative">
                                        <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                        <input
                                            type="text"
                                            placeholder="https://buy.stripe.com/... or bank transfer text"
                                            className="w-full pl-12 pr-4 py-4 rounded-2xl border-none outline-none focus:ring-2 ring-blue-500/20 font-bold text-sm"
                                            value={stripeLink}
                                            onChange={e => setStripeLink(e.target.value)}
                                        />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <button
                                            type="button"
                                            title="Uses the same accounts as the Invoice View tab (active business bank details, or the invoice fallback)."
                                            onClick={() => {
                                                const text = formatInvoiceBankDetailsPlainText(getPayoutBankDetailsForInvoice(bankDetails));
                                                setStripeLink(text);
                                                showFlyer('Invoice bank details inserted into the field.', 'success');
                                            }}
                                            className="text-[10px] font-bold text-blue-600 uppercase tracking-widest hover:underline"
                                        >
                                            Insert bank details
                                        </button>
                                        <span className="text-slate-300 text-xs">or</span>
                                        <button
                                            type="button"
                                            onClick={handleGenerateStripeLink}
                                            disabled={generatingStripeLink}
                                            className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest hover:underline disabled:opacity-50 flex items-center gap-1"
                                        >
                                            <CreditCard className="w-3.5 h-3.5" />
                                            {generatingStripeLink ? 'Generating...' : 'Generate Stripe link'}
                                        </button>
                                    </div>
                                </div>

                                <button
                                    onClick={handleSendUpdates}
                                    disabled={isProcessing}
                                    className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black shadow-xl hover:scale-[1.02] active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center space-x-2"
                                >
                                    {isProcessing ? 'Sending...' : 'Confirm & Email Invoice'}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const DetailBox = ({ label, value }: { label: string, value: string }) => (
    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">{label}</div>
        <div className="text-sm font-black text-slate-900">{value}</div>
    </div>
);

export default BookingReviewModal;
