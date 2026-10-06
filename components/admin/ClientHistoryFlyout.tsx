import React, { useMemo } from 'react';
import {
  X,
  Mail,
  Phone,
  MapPin,
  Calendar,
  Clock,
  Star,
  DollarSign,
  FileText,
  Package,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
  User,
} from 'lucide-react';
import type { Booking, Staff } from '../../types';

interface Props {
  clientEmail: string;
  bookings: Booking[];
  staffList: Staff[];
  onClose: () => void;
  onViewStaff?: (staffId: number) => void;
}

const ClientHistoryFlyout: React.FC<Props> = ({ clientEmail, bookings, staffList, onClose, onViewStaff }) => {
  const clientBookings = useMemo(
    () =>
      bookings
        .filter((b) => b.contact?.email?.toLowerCase() === clientEmail.toLowerCase())
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [bookings, clientEmail],
  );

  const clientInfo = clientBookings[0]?.contact;
  const clientName = clientInfo?.name || 'Unknown Client';

  const completed = useMemo(() => clientBookings.filter((b) => b.status === 'Completed'), [clientBookings]);
  const cancelled = useMemo(() => clientBookings.filter((b) => b.status === 'Cancelled'), [clientBookings]);

  const totalSpent = useMemo(
    () => completed.reduce((sum, b) => sum + b.totalPrice, 0),
    [completed],
  );
  const totalAllBookings = useMemo(
    () => clientBookings.reduce((sum, b) => sum + b.totalPrice, 0),
    [clientBookings],
  );
  const reviews = useMemo(
    () => clientBookings.filter((b) => b.rating != null && b.rating > 0),
    [clientBookings],
  );
  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, b) => sum + (b.rating || 0), 0) / reviews.length;
  }, [reviews]);

  const paidBookings = useMemo(
    () => clientBookings.filter((b) => b.invoicePaid),
    [clientBookings],
  );

  const serviceBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const b of clientBookings) {
      map[b.serviceType] = (map[b.serviceType] || 0) + 1;
    }
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [clientBookings]);

  const frequencyLabel = useMemo(() => {
    const freqs = clientBookings.map((b) => b.frequency).filter(Boolean);
    if (freqs.length === 0) return 'One-time';
    const counts: Record<string, number> = {};
    for (const f of freqs) counts[f!] = (counts[f!] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  }, [clientBookings]);

  const staffForClient = (staffId: number | undefined): Staff | undefined => {
    if (!staffId) return undefined;
    return staffList.find((s) => s.id === staffId);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-50 h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-emerald-200">
                {clientName.charAt(0)}
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">{clientName}</h2>
                <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Client account</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Bookings', value: clientBookings.length, icon: Package, color: 'text-blue-600 bg-blue-50' },
              { label: 'Completed', value: completed.length, icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Total Spent', value: `£${totalSpent.toFixed(0)}`, icon: DollarSign, color: 'text-amber-600 bg-amber-50' },
              { label: 'Avg Rating', value: avgRating > 0 ? avgRating.toFixed(1) : '-', icon: Star, color: 'text-purple-600 bg-purple-50' },
            ].map((stat) => (
              <div key={stat.label} className="bg-white rounded-2xl border border-slate-100 p-4 text-center">
                <div className={`inline-flex p-2 rounded-xl ${stat.color} mb-2`}>
                  <stat.icon className="w-4 h-4" />
                </div>
                <div className="text-xl font-black text-slate-900">{stat.value}</div>
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Contact Info */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" /> Client Details
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{clientEmail}</span>
              </div>
              {clientInfo?.phone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{clientInfo.phone}</span>
                </div>
              )}
              {clientBookings[0]?.address && (
                <div className="flex items-center gap-2 text-slate-600 sm:col-span-2">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{[clientBookings[0].address.line1, clientBookings[0].address.city, clientBookings[0].address.postcode].filter(Boolean).join(', ')}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-slate-600">
                <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Preferred: {frequencyLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <DollarSign className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Lifetime value: {'£'}{totalAllBookings.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Service Preferences */}
          {serviceBreakdown.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Service Preferences</h3>
              <div className="flex flex-wrap gap-2">
                {serviceBreakdown.map(([service, count]) => (
                  <span key={service} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 rounded-xl text-xs font-bold text-slate-700">
                    {service} <span className="text-[10px] font-black text-slate-400">{count}x</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Reviews */}
          {reviews.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Star className="w-4 h-4 text-slate-400" /> Reviews ({reviews.length})
              </h3>
              <div className="space-y-3 max-h-56 overflow-y-auto">
                {reviews.map((b) => (
                  <div key={b.id} className="bg-slate-50 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star key={i} className={`w-3 h-3 ${i < (b.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                        ))}
                      </div>
                      <span className="text-[10px] text-slate-400">{b.date}</span>
                      <span className="text-[10px] text-slate-500 font-bold">{b.serviceType}</span>
                    </div>
                    {b.feedback && <p className="text-xs text-slate-600">{b.feedback}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Booking History */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-400" /> Booking History ({clientBookings.length})
            </h3>
            {clientBookings.length === 0 ? (
              <p className="text-sm text-slate-400 font-medium">No bookings found.</p>
            ) : (
              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {clientBookings.map((b) => {
                  const wc = b.workCompletion;
                  const clockIn = wc?.clockInTime || wc?.clockInAtIso;
                  const clockOut = wc?.clockOutTime || wc?.clockOutAtIso;
                  const assignedStaff = (b.assignedStaffIds || [b.assignedStaffId]).filter(Boolean) as number[];

                  return (
                    <div key={b.id} className="border border-slate-100 rounded-xl p-4 space-y-2 hover:bg-slate-50/50 transition-colors">
                      {/* Row 1: Ref, Status, Amount */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-slate-900">{b.bookingId || `#${b.id}`}</span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg ${
                            b.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                            b.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                            b.status === 'Confirmed' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>{b.status}</span>
                        </div>
                        <span className="text-sm font-black text-slate-900">{'£'}{b.totalPrice.toFixed(2)}</span>
                      </div>

                      {/* Row 2: Service, Date, Time */}
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="font-bold text-slate-700">{b.serviceType}</span>
                        <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{b.date}</span>
                        <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{b.time}</span>
                        {b.frequency && b.frequency !== 'One-time' && (
                          <span className="text-[10px] font-bold text-blue-600">{b.frequency}</span>
                        )}
                      </div>

                      {/* Row 3: Address */}
                      {b.address && (
                        <div className="flex items-center gap-1 text-[11px] text-slate-400">
                          <MapPin className="w-3 h-3 shrink-0" />
                          {[b.address.line1, b.address.city, b.address.postcode].filter(Boolean).join(', ')}
                        </div>
                      )}

                      {/* Row 4: Cleaner arrival/departure */}
                      {(clockIn || clockOut) && (
                        <div className="flex items-center gap-3 text-[11px] text-slate-500">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {clockIn && <span>Arrived: <strong>{formatTime(clockIn)}</strong></span>}
                          {clockOut && <span>Left: <strong>{formatTime(clockOut)}</strong></span>}
                        </div>
                      )}

                      {/* Row 5: Assigned staff */}
                      {assignedStaff.length > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cleaner:</span>
                          {assignedStaff.map((sid) => {
                            const s = staffForClient(sid);
                            return s ? (
                              <button
                                key={sid}
                                type="button"
                                onClick={() => onViewStaff?.(sid)}
                                className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                {s.name}
                              </button>
                            ) : (
                              <span key={sid} className="text-xs text-slate-400">Staff #{sid}</span>
                            );
                          })}
                        </div>
                      )}

                      {/* Row 6: Special instructions */}
                      {b.instructions && (
                        <div className="flex gap-1.5 text-[11px] text-slate-500 bg-amber-50 rounded-lg px-3 py-2">
                          <AlertCircle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                          <span>{b.instructions}</span>
                        </div>
                      )}

                      {/* Row 7: Payment info */}
                      <div className="flex items-center gap-3 text-[10px] text-slate-400">
                        {b.invoicePaid && (
                          <span className="flex items-center gap-1 text-emerald-600 font-bold">
                            <CheckCircle2 className="w-3 h-3" /> Paid
                          </span>
                        )}
                        {b.discountCode && (
                          <span className="font-bold">Discount: {b.discountCode} (-{'£'}{(b.discountAmount || 0).toFixed(2)})</span>
                        )}
                        {b.createdAt && (
                          <span>Booked: {new Date(b.createdAt).toLocaleDateString('en-GB')}</span>
                        )}
                      </div>

                      {/* Row 8: Rating */}
                      {b.rating != null && (
                        <div className="flex items-center gap-2 pt-1 border-t border-slate-50">
                          <div className="flex items-center gap-0.5">
                            {Array.from({ length: 5 }, (_, i) => (
                              <Star key={i} className={`w-3 h-3 ${i < (b.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                            ))}
                          </div>
                          {b.feedback && <span className="text-[11px] text-slate-500 truncate">{b.feedback}</span>}
                        </div>
                      )}

                      {/* Row 9: Admin notes */}
                      {b.adminNotes && (
                        <div className="flex gap-1.5 text-[11px] text-slate-500 bg-blue-50 rounded-lg px-3 py-2">
                          <MessageSquare className="w-3 h-3 text-blue-500 shrink-0 mt-0.5" />
                          <span>{b.adminNotes}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

function formatTime(val: string): string {
  if (!val) return '';
  if (val.includes('T') || val.includes('Z')) {
    try {
      const d = new Date(val);
      return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return val;
    }
  }
  return val;
}

export default ClientHistoryFlyout;
