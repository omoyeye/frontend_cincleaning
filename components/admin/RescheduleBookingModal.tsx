import React, { useMemo, useState, useCallback } from 'react';
import { Booking, ServiceConfig, Extra, Staff } from '../../types';
import { apiAdmin } from '../../services/api';
import { X, Calendar as CalendarIcon, Clock, AlertTriangle } from 'lucide-react';
import { useFlyer } from '../Flyer';
import {
    findConflictsForPatchedBooking,
    conflictingBookingIdsForTarget,
    getOverlapConflictDetailsForPatchedBooking,
} from '../../src/utils/bookingHelpers';

interface Props {
    booking: Booking;
    allBookings: Booking[];
    services: ServiceConfig[];
    extras: Extra[];
    /** Optional: resolve staff id to name in overlap messages */
    staffList?: Staff[];
    onClose: () => void;
    onUpdate: () => void;
}

const RescheduleBookingModal: React.FC<Props> = ({
    booking,
    allBookings,
    services,
    extras,
    staffList = [],
    onClose,
    onUpdate,
}) => {
    const { showFlyer } = useFlyer();
    const [date, setDate] = useState(booking.date);
    const [time, setTime] = useState(booking.time);
    const [isSaving, setIsSaving] = useState(false);

    const patched = useMemo(() => ({ ...booking, date, time }) as Booking, [booking, date, time]);

    const conflictOtherIds = useMemo(() => {
        const c = findConflictsForPatchedBooking(allBookings, patched, services, extras);
        return conflictingBookingIdsForTarget(c, booking.id);
    }, [allBookings, booking.id, extras, patched, services]);

    const overlapDetails = useMemo(
        () => getOverlapConflictDetailsForPatchedBooking(allBookings, patched, services, extras),
        [allBookings, extras, patched, services]
    );

    const staffName = useCallback(
        (id: number) => staffList.find((s) => s.id === id)?.name?.trim() || `Staff #${id}`,
        [staffList]
    );

    const overlapSummaryForConfirm = useMemo(() => {
        if (overlapDetails.length === 0) return '';
        return overlapDetails
            .map(
                (d) =>
                    `• ${staffName(d.staffId)}: this job ${d.thisWindowLabel} overlaps booking ${d.otherBookingId} (${d.otherWindowLabel}) — same visit windows in time, not only the same date.`
            )
            .join('\n');
    }, [overlapDetails, staffName]);

    const persistSchedule = async (forceScheduleOverlap: boolean) => {
        setIsSaving(true);
        try {
            await apiAdmin.updateBooking(booking.id, {
                date,
                time,
                ...(forceScheduleOverlap ? { forceScheduleOverlap: true } : {}),
            });
            showFlyer(`Booking #${booking.id} rescheduled successfully!`, 'success');
            onUpdate();
            onClose();
        } catch (error) {
            showFlyer(error instanceof Error ? error.message : 'Failed to reschedule booking. Please try again.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        if (conflictOtherIds.length > 0) return;
        await persistSchedule(false);
    };

    const handleSaveDespiteOverlap = async () => {
        if (overlapDetails.length === 0) return;
        const ok = window.confirm(
            `Time overlap (date + start time + estimated duration), not the calendar day alone:\n\n${overlapSummaryForConfirm}\n\nSave this new schedule anyway? You can cancel and pick another slot instead.`
        );
        if (!ok) return;
        await persistSchedule(true);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center animate-in fade-in duration-300">
            <div className="bg-white w-full h-full flex flex-col overflow-hidden relative">

                {/* Header */}
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10 flex-wrap gap-4">
                    <div>
                        <div className="flex items-center space-x-3 mb-2">
                            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                                <CalendarIcon className="w-6 h-6" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Reschedule Booking</h2>
                            <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                #{booking.bookingId}
                            </span>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest pl-1">Modify date and time for {booking.serviceType}</p>
                    </div>
                    <div className="flex items-center flex-wrap gap-3 justify-end">
                        {conflictOtherIds.length === 0 ? (
                            <button
                                onClick={() => void handleSave()}
                                disabled={isSaving}
                                className="px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : 'Confirm New Schedule'}
                            </button>
                        ) : (
                            <>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-2 border-slate-200 text-slate-600 hover:bg-slate-50"
                                >
                                    Discontinue
                                </button>
                                <button
                                    type="button"
                                    onClick={() => void handleSaveDespiteOverlap()}
                                    disabled={isSaving}
                                    className="px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all bg-amber-600 text-white hover:bg-amber-700 active:scale-95 disabled:opacity-50"
                                >
                                    {isSaving ? 'Saving...' : 'Continue — save despite overlap'}
                                </button>
                            </>
                        )}
                        <button onClick={onClose} className="p-4 bg-slate-50 rounded-2xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 flex items-center justify-center">
                    <div className="w-full max-w-2xl bg-white p-12 rounded-[3rem] border border-slate-100 shadow-sm">
                        <h3 className="text-xl font-black text-slate-900 mb-8">Select New Schedule</h3>

                        <div className="space-y-8">
                            {overlapDetails.length > 0 && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-xs font-bold text-amber-950 space-y-3">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-black text-sm text-amber-950">Overlapping visit times</p>
                                            <p className="mt-1 font-semibold leading-relaxed text-amber-900/95">
                                                The same team member would have two jobs whose <strong>time windows</strong> intersect (start time + estimated
                                                duration). Same calendar date with different times is fine; this is a real schedule overlap.
                                            </p>
                                        </div>
                                    </div>
                                    <ul className="list-disc pl-5 space-y-2 text-[11px] leading-relaxed">
                                        {overlapDetails.map((d) => (
                                            <li key={`${d.staffId}-${d.otherBookingId}`}>
                                                <span className="font-black">{staffName(d.staffId)}</span>: this booking{' '}
                                                <span className="font-mono">{d.thisWindowLabel}</span> overlaps{' '}
                                                <span className="font-black">{d.otherBookingId}</span>{' '}
                                                <span className="font-mono">({d.otherWindowLabel})</span>.
                                            </li>
                                        ))}
                                    </ul>
                                    <p className="text-[11px] font-semibold text-amber-900/90">
                                        Choose <strong>Discontinue</strong> to pick another slot, or <strong>Continue</strong> if the gap between visits is
                                        acceptable on your judgment.
                                    </p>
                                </div>
                            )}
                            <div className="space-y-4">
                                <label className="flex items-center space-x-2 text-xs font-black uppercase text-slate-400 tracking-widest">
                                    <CalendarIcon className="w-4 h-4" />
                                    <span>New Date</span>
                                </label>
                                <input
                                    type="date"
                                    value={date}
                                    onChange={e => setDate(e.target.value)}
                                    className="w-full bg-card border-2 border-input rounded-2xl p-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-black text-lg text-foreground transition-all"
                                />
                            </div>

                            <div className="space-y-4">
                                <label className="flex items-center space-x-2 text-xs font-black uppercase text-slate-400 tracking-widest">
                                    <Clock className="w-4 h-4" />
                                    <span>New Time</span>
                                </label>
                                <input
                                    type="time"
                                    value={time}
                                    onChange={e => setTime(e.target.value)}
                                    className="w-full bg-card border-2 border-input rounded-2xl p-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-black text-lg text-foreground transition-all"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RescheduleBookingModal;
