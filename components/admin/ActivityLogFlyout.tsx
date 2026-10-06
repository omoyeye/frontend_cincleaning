import React from 'react';
import { X, Calendar, UserPlus, CheckCircle2, DollarSign } from 'lucide-react';
import { Booking, BookingStatus } from '../../types';
import { format } from 'date-fns';

interface ActivityLogFlyoutProps {
    bookings: Booking[];
    onClose: () => void;
}

const ActivityLogFlyout: React.FC<ActivityLogFlyoutProps> = ({ bookings, onClose }) => {
    // Sort bookings by creation date descending
    const sortedBookings = [...bookings].sort((a, b) => {
        return new Date(b.createdAt || new Date()).getTime() - new Date(a.createdAt || new Date()).getTime();
    });

    const getIconForStatus = (status: BookingStatus) => {
        switch (status) {
            case BookingStatus.COMPLETED:
                return <CheckCircle2 className="w-5 h-5" />;
            case BookingStatus.CONFIRMED:
                return <Calendar className="w-5 h-5" />;
            case BookingStatus.PENDING:
            default:
                return <UserPlus className="w-5 h-5" />;
        }
    };

    const getColorForStatus = (status: BookingStatus) => {
        switch (status) {
            case BookingStatus.COMPLETED:
                return 'bg-green-50 text-green-600';
            case BookingStatus.CONFIRMED:
                return 'bg-blue-50 text-blue-600';
            case BookingStatus.PENDING:
            default:
                return 'bg-amber-50 text-amber-600';
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex justify-end">
            <div className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
            <div className="w-full max-w-md bg-white h-full relative z-10 shadow-2xl animate-in slide-in-from-right flex flex-col">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-black text-slate-900">Activity Log</h2>
                        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Real-time system events</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {sortedBookings.length === 0 ? (
                        <div className="text-center text-slate-400 italic font-bold">No recent activities found.</div>
                    ) : (
                        sortedBookings.map((booking) => (
                            <div key={booking.id} className="flex space-x-4 animate-in slide-in-from-bottom-2 fade-in">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${getColorForStatus(booking.status)}`}>
                                    {getIconForStatus(booking.status)}
                                </div>
                                <div className="flex-1 pb-6 border-b border-slate-50">
                                    <div className="text-sm font-bold text-slate-900">
                                        {booking.status === BookingStatus.COMPLETED && `Job completed: ${booking.serviceType}`}
                                        {booking.status === BookingStatus.CONFIRMED && `Booking confirmed for ${booking.contact.name}`}
                                        {booking.status === BookingStatus.PENDING && `New request: ${booking.serviceType} from ${booking.contact.name}`}
                                    </div>
                                    <div className="text-xs font-medium text-slate-500 mt-1 line-clamp-2">
                                        {booking.address.line1}, {booking.address.city} • £{booking.totalPrice}
                                    </div>
                                    <div className="text-[10px] font-black uppercase text-slate-400 mt-2 tracking-wider">
                                        {format(new Date(booking.createdAt || new Date()), 'MMM d, yyyy • h:mm a')}
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default ActivityLogFlyout;
