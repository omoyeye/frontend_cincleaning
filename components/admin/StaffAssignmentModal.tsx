import React from 'react';
import { Staff, Booking, BookingStatus, ServiceConfig, Extra } from '../../types';
import { apiAdmin } from '../../services/api';
import { X, UserCheck, Search, ShieldCheck, Briefcase, Star, Mail, AlertTriangle, MapPin, UserX } from 'lucide-react';
import { useFlyer } from '../Flyer';
import {
    findConflictsForPatchedBooking,
    conflictingBookingIdsForTarget,
    getOverlapConflictDetailsForPatchedBooking,
} from '../../src/utils/bookingHelpers';

interface Props {
    booking: Booking;
    staffList: Staff[];
    allBookings: Booking[];
    services: ServiceConfig[];
    extras: Extra[];
    onClose: () => void;
    onUpdate: () => void;
}

const StaffAssignmentModal: React.FC<Props> = ({
    booking,
    staffList,
    allBookings,
    services,
    extras,
    onClose,
    onUpdate,
}) => {
    const { showFlyer } = useFlyer();
    const [searchTerm, setSearchTerm] = React.useState('');
    const [selectedIds, setSelectedIds] = React.useState<number[]>(booking.assignedStaffIds || (booking.assignedStaffId ? [booking.assignedStaffId] : []));
    const [isSaving, setIsSaving] = React.useState(false);
    const [isUnassigning, setIsUnassigning] = React.useState(false);

    const hasExistingAssignment = React.useMemo(
        () =>
            Boolean(
                (booking.assignedStaffIds && booking.assignedStaffIds.length > 0) ||
                booking.assignedStaffId
            ),
        [booking.assignedStaffId, booking.assignedStaffIds]
    );

    const staffJobCounts = React.useMemo(() => {
        const counts = new Map<number, number>();
        for (const b of allBookings) {
            if (b.status !== BookingStatus.COMPLETED) continue;
            const ids = b.assignedStaffIds || (b.assignedStaffId ? [b.assignedStaffId] : []);
            for (const sid of ids) counts.set(sid, (counts.get(sid) || 0) + 1);
        }
        return counts;
    }, [allBookings]);

    const normalize = React.useCallback((v: string | undefined | null) => String(v || '').trim().toLowerCase(), []);
    const extractOutwardPostcode = React.useCallback((raw: string | undefined | null) => {
        // UK outward code (e.g. "M3 4AA" => "m3")
        const normalized = normalize(raw).replace(/\s+/g, ' ');
        const m = normalized.match(/[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}/i);
        if (!m) return '';
        return m[0].split(' ')[0];
    }, [normalize]);
    const extractFullPostcode = React.useCallback((raw: string | undefined | null) => {
        const normalized = normalize(raw).replace(/\s+/g, ' ');
        const m = normalized.match(/[a-z]{1,2}\d[a-z\d]?\s*\d[a-z]{2}/i);
        return m ? m[0].replace(/\s+/g, '') : '';
    }, [normalize]);

    const proximityMeta = React.useMemo(() => {
        const jobCity = normalize(booking.address?.city);
        const jobOutward = extractOutwardPostcode(booking.address?.postcode);
        const jobPostcode = extractFullPostcode(booking.address?.postcode);
        const map = new Map<number, { score: number; badge: string }>();

        for (const s of staffList) {
            const addr = normalize(s.address);
            const staffOutward = extractOutwardPostcode(s.address);
            const staffPostcode = extractFullPostcode(s.address);

            let score = 4;
            let badge = 'Location unknown';

            if (addr) {
                score = 3;
                badge = 'Address available';
            }
            if (jobCity && addr && addr.includes(jobCity)) {
                score = 2;
                badge = `Same city (${booking.address.city})`;
            }
            if (jobOutward && staffOutward && jobOutward === staffOutward) {
                score = 1;
                badge = `Near postcode (${jobOutward.toUpperCase()})`;
            }
            if (jobPostcode && staffPostcode && jobPostcode === staffPostcode) {
                score = 0;
                badge = `Same postcode (${booking.address.postcode})`;
            }

            map.set(s.id, { score, badge });
        }
        return map;
    }, [booking.address?.city, booking.address?.postcode, extractFullPostcode, extractOutwardPostcode, normalize, staffList]);

    const filteredStaff = React.useMemo(() => {
        const term = searchTerm.toLowerCase();
        return [...staffList]
            .filter((s) =>
                s.name.toLowerCase().includes(term) ||
                s.role.toLowerCase().includes(term) ||
                String(s.address || '').toLowerCase().includes(term)
            )
            .sort((a, b) => {
                const pa = proximityMeta.get(a.id)?.score ?? 99;
                const pb = proximityMeta.get(b.id)?.score ?? 99;
                if (pa !== pb) return pa - pb;
                if (a.status !== b.status) return a.status === 'Active' ? -1 : 1;
                return a.name.localeCompare(b.name);
            });
    }, [proximityMeta, searchTerm, staffList]);

    const toggleStaff = (id: number) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const patchedPreview = React.useMemo((): Booking => {
        return {
            ...booking,
            assignedStaffId: selectedIds[0],
            assignedStaffIds: selectedIds,
            status: BookingStatus.CONFIRMED,
        };
    }, [booking, selectedIds]);

    const conflictOtherIds = React.useMemo(() => {
        if (selectedIds.length === 0) return [] as number[];
        const c = findConflictsForPatchedBooking(allBookings, patchedPreview, services, extras);
        return conflictingBookingIdsForTarget(c, booking.id);
    }, [allBookings, booking.id, extras, patchedPreview, services, selectedIds]);

    const overlapDetails = React.useMemo(
        () =>
            selectedIds.length === 0
                ? []
                : getOverlapConflictDetailsForPatchedBooking(allBookings, patchedPreview, services, extras),
        [allBookings, extras, patchedPreview, selectedIds, services]
    );

    const staffName = React.useCallback(
        (id: number) => staffList.find((s) => s.id === id)?.name?.trim() || `Staff #${id}`,
        [staffList]
    );

    const overlapSummaryForConfirm = React.useMemo(() => {
        if (overlapDetails.length === 0) return '';
        return overlapDetails
            .map(
                (d) =>
                    `• ${staffName(d.staffId)}: this job ${d.thisWindowLabel} overlaps booking ${d.otherBookingId} (${d.otherWindowLabel}) — visit windows cross in time.`
            )
            .join('\n');
    }, [overlapDetails, staffName]);

    const persistAssignment = async (forceScheduleOverlap: boolean) => {
        setIsSaving(true);
        try {
            await apiAdmin.updateBooking(booking.id, {
                assignedStaffId: selectedIds[0],
                assignedStaffIds: selectedIds,
                status: BookingStatus.CONFIRMED,
                ...(forceScheduleOverlap ? { forceScheduleOverlap: true } : {}),
            });
            showFlyer(`Successfully assigned ${selectedIds.length} staff to booking ${booking.id}`, 'success');
            onUpdate();
            onClose();
        } catch (error) {
            showFlyer(error instanceof Error ? error.message : 'Failed to save assignment. Please try again.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleSave = async () => {
        if (selectedIds.length === 0) {
            showFlyer('Please select at least one staff member.', 'error');
            return;
        }
        if (conflictOtherIds.length > 0) return;
        await persistAssignment(false);
    };

    const handleUnassignAll = async () => {
        if (!hasExistingAssignment || isUnassigning) return;
        const assignedLabel = booking.assignedStaffIds && booking.assignedStaffIds.length > 0
            ? booking.assignedStaffIds.map(staffName).join(', ')
            : booking.assignedStaffId ? staffName(booking.assignedStaffId) : '';
        const ok = window.confirm(
            `Unassign ${assignedLabel || 'all staff'} from booking ${booking.id}?\n\n` +
            `The job will return to the Pending Dispatch queue so another team member can pick it up. ` +
            `This is different from a staff cancellation request — you're clearing the current assignment outright.`
        );
        if (!ok) return;
        setIsUnassigning(true);
        try {
            await apiAdmin.updateBooking(booking.id, {
                assignedStaffIds: [],
                // Nullable on the backend; cast because `Partial<Booking>` types `assignedStaffId` as number.
                assignedStaffId: null as unknown as number | undefined,
                status: BookingStatus.PENDING,
            });
            showFlyer(`Booking ${booking.id} unassigned. Back on the dispatch queue.`, 'success');
            onUpdate();
            onClose();
        } catch (error) {
            showFlyer(error instanceof Error ? error.message : 'Failed to unassign staff. Please try again.', 'error');
        } finally {
            setIsUnassigning(false);
        }
    };

    const handleSaveDespiteOverlap = async () => {
        if (selectedIds.length === 0 || overlapDetails.length === 0) return;
        const ok = window.confirm(
            `Time overlap (date + start + estimated duration), not the day alone:\n\n${overlapSummaryForConfirm}\n\nConfirm this assignment anyway? Choose Cancel to change staff or close without saving.`
        );
        if (!ok) return;
        await persistAssignment(true);
    };

    return (
        <div className="fixed inset-0 z-[200] bg-white flex items-center justify-center animate-in fade-in duration-300">
            <div className="bg-white w-full h-full flex flex-col overflow-hidden relative">

                {/* Header */}
                <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0 z-10">
                    <div>
                        <div className="flex items-center space-x-3 mb-2">
                            <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                                <UserCheck className="w-6 h-6" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Assign Staff</h2>
                            <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black uppercase tracking-widest">
                                #{booking.bookingId}
                            </span>
                        </div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-widest pl-1">Select one or more team members for {booking.serviceType}</p>
                        {overlapDetails.length > 0 && (
                            <div className="mt-3 max-w-2xl space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-bold text-amber-950">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="font-black text-sm">Overlapping visit times for chosen staff</p>
                                        <p className="mt-1 font-semibold leading-relaxed text-amber-900/95">
                                            Windows are compared by <strong>date + start time + estimated job length</strong>. Same date with no time clash is
                                            allowed; these rows are real overlaps.
                                        </p>
                                    </div>
                                </div>
                                <ul className="list-disc pl-5 text-[11px] leading-relaxed font-semibold">
                                    {overlapDetails.map((d) => (
                                        <li key={`${d.staffId}-${d.otherBookingId}`}>
                                            <span className="font-black">{staffName(d.staffId)}</span>: this job{' '}
                                            <span className="font-mono">{d.thisWindowLabel}</span> vs{' '}
                                            <span className="font-black">{d.otherBookingId}</span>{' '}
                                            <span className="font-mono">({d.otherWindowLabel})</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center flex-wrap gap-3 justify-end">
                        {hasExistingAssignment && (
                            <button
                                type="button"
                                onClick={() => void handleUnassignAll()}
                                disabled={isUnassigning || isSaving}
                                title="Fully unassign this job and return it to the dispatch queue"
                                className="flex items-center gap-2 px-5 py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest border-2 border-red-200 text-red-600 bg-red-50 hover:bg-red-100 hover:border-red-300 transition-all disabled:opacity-60"
                            >
                                <UserX className="w-4 h-4" />
                                {isUnassigning ? 'Unassigning…' : 'Unassign All'}
                            </button>
                        )}
                        {selectedIds.length > 0 && conflictOtherIds.length === 0 ? (
                            <button
                                onClick={() => void handleSave()}
                                disabled={isSaving}
                                className="px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl transition-all bg-blue-600 text-white hover:bg-blue-700 active:scale-95 disabled:opacity-50"
                            >
                                {isSaving ? 'Saving...' : `Confirm Assignment (${selectedIds.length})`}
                            </button>
                        ) : selectedIds.length > 0 && conflictOtherIds.length > 0 ? (
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
                                    {isSaving ? 'Saving...' : 'Continue — assign despite overlap'}
                                </button>
                            </>
                        ) : null}
                        <button onClick={onClose} className="p-4 bg-slate-50 rounded-2xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Search Bar */}
                <div className="px-8 py-6 bg-slate-50/50 border-b border-slate-100">
                    <div className="relative">
                        <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                        <input
                            type="text"
                            placeholder="Search team members by name or role..."
                            className="w-full pl-16 pr-8 py-5 bg-white border-2 border-transparent rounded-[1.5rem] outline-none focus:border-blue-500/10 focus:ring-4 ring-blue-500/5 font-bold transition-all shadow-sm"
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* Staff List */}
                <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {filteredStaff.map(staff => {
                            const isSelected = selectedIds.includes(staff.id);
                            return (
                                <div
                                    key={staff.id}
                                    className={`p-6 rounded-[2rem] border transition-all group cursor-pointer relative overflow-hidden ${isSelected ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-slate-100 hover:border-blue-200'}`}
                                    onClick={() => toggleStaff(staff.id)}
                                >
                                    <div className="flex items-center space-x-5">
                                        <div className="w-16 h-16 bg-slate-100 rounded-[1.25rem] flex items-center justify-center font-black text-slate-400 text-xl overflow-hidden relative">
                                            {staff.profilePhoto ? <img src={staff.profilePhoto} alt={staff.name} className="w-full h-full object-cover" /> : staff.name.charAt(0)}
                                            {isSelected && (
                                                <div className="absolute inset-0 bg-blue-600/20 flex items-center justify-center animate-in zoom-in duration-200">
                                                    <div className="bg-blue-600 text-white rounded-full p-1.5 shadow-lg">
                                                        <UserCheck className="w-5 h-5" />
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h4 className="font-black text-slate-900 text-lg leading-tight">{staff.name}</h4>
                                                    <div className="flex items-center space-x-2 mt-1">
                                                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{staff.role}</span>
                                                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${staff.status === 'Active' ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                            {staff.status}
                                                        </span>
                                                    </div>
                                                    <div className="mt-2 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-600">
                                                        <MapPin className="w-3 h-3" />
                                                        <span>{proximityMeta.get(staff.id)?.badge || 'Location unknown'}</span>
                                                    </div>
                                                </div>
                                                {staff.rating ? (
                                                    <div className="flex items-center space-x-1 text-amber-500">
                                                        <Star className="w-3 h-3 fill-current" />
                                                        <span className="text-xs font-black">{Number(staff.rating).toFixed(1)}</span>
                                                    </div>
                                                ) : null}
                                            </div>

                                            <div className="flex items-center space-x-4 mt-4 text-[11px] font-bold text-slate-400">
                                                <div className="flex items-center space-x-1">
                                                    <Briefcase className="w-3 h-3" />
                                                    <span>{staffJobCounts.get(staff.id) || 0} Jobs Done</span>
                                                </div>
                                                <div className="flex items-center space-x-1">
                                                    <ShieldCheck className="w-3 h-3" />
                                                    <span>Verified</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className={`absolute right-0 top-0 bottom-0 w-2 bg-blue-600 transition-transform ${isSelected ? 'translate-x-0' : 'translate-x-full group-hover:translate-x-0'}`}></div>
                                </div>
                            );
                        })}

                        {filteredStaff.length === 0 && (
                            <div className="col-span-full py-20 text-center">
                                <div className="w-20 h-20 bg-slate-100 text-slate-300 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Search className="w-10 h-10" />
                                </div>
                                <h3 className="text-lg font-black text-slate-900">No staff members found</h3>
                                <p className="text-slate-400 font-bold mt-1">Try adjusting your search terms</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-8 border-t border-slate-100 bg-white flex justify-between items-center shrink-0">
                    <div className="flex items-center space-x-4">
                        <div className={`p-3 rounded-xl transition-colors ${selectedIds.length > 0 ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-300'}`}>
                            <Mail className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Notification</p>
                            <p className="text-xs font-bold text-slate-600">
                                {selectedIds.length > 0 ? `SMS will be sent to ${selectedIds.length} team members` : 'Choose staff to see notification preview'}
                            </p>
                        </div>
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                        Selected: <span className="text-blue-600 font-black">{selectedIds.length}</span>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default StaffAssignmentModal;
