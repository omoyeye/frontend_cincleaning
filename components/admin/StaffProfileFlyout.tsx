import React, { useMemo } from 'react';
import {
  X,
  MapPin,
  Mail,
  Phone,
  Star,
  Clock,
  Calendar,
  Briefcase,
  DollarSign,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  Award,
  ChevronRight,
  User,
} from 'lucide-react';
import type { Staff, Booking } from '../../types';

interface Props {
  staff: Staff;
  bookings: Booking[];
  allStaff: Staff[];
  onClose: () => void;
  onViewClient?: (email: string) => void;
}

const StaffProfileFlyout: React.FC<Props> = ({ staff, bookings, allStaff, onClose, onViewClient }) => {
  const staffBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.assignedStaffId === staff.id ||
          (b.assignedStaffIds || []).includes(staff.id),
      ),
    [bookings, staff.id],
  );

  const completedJobs = useMemo(() => staffBookings.filter((b) => b.status === 'Completed'), [staffBookings]);
  const cancelledJobs = useMemo(() => staffBookings.filter((b) => b.status === 'Cancelled'), [staffBookings]);
  const pendingJobs = useMemo(() => staffBookings.filter((b) => b.status === 'Pending' || b.status === 'Confirmed'), [staffBookings]);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayJobs = useMemo(() => staffBookings.filter((b) => b.date === todayStr), [staffBookings, todayStr]);
  const todayEarnings = useMemo(
    () =>
      todayJobs
        .filter((b) => b.status === 'Completed')
        .reduce((sum, b) => {
          const staffCount = (b.assignedStaffIds || [b.assignedStaffId]).filter(Boolean).length || 1;
          return sum + b.totalPrice / staffCount;
        }, 0),
    [todayJobs],
  );
  const totalEarnings = useMemo(
    () =>
      completedJobs.reduce((sum, b) => {
        const staffCount = (b.assignedStaffIds || [b.assignedStaffId]).filter(Boolean).length || 1;
        return sum + b.totalPrice / staffCount;
      }, 0),
    [completedJobs],
  );

  const reviews = useMemo(
    () => staffBookings.filter((b) => b.rating != null && b.rating > 0),
    [staffBookings],
  );
  const avgRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, b) => sum + (b.rating || 0), 0) / reviews.length;
  }, [reviews]);
  const compliments = useMemo(() => reviews.filter((b) => (b.rating || 0) >= 4), [reviews]);
  const complaints = useMemo(() => reviews.filter((b) => (b.rating || 0) <= 2), [reviews]);

  const supervisorRemarks = useMemo(
    () => staffBookings.filter((b) => b.adminNotes && b.adminNotes.trim().length > 0),
    [staffBookings],
  );

  const sortedHistory = useMemo(
    () => [...staffBookings].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [staffBookings],
  );

  const completionRate = staffBookings.length > 0
    ? Math.round((completedJobs.length / staffBookings.length) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-50 h-full overflow-y-auto shadow-2xl animate-in slide-in-from-right">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-200">
                {staff.profilePhoto || staff.imageUrl ? (
                  <img src={staff.profilePhoto || staff.imageUrl} alt={staff.name} className="w-full h-full rounded-2xl object-cover" />
                ) : (
                  staff.name.charAt(0)
                )}
              </div>
              <div>
                <h2 className="text-xl font-black text-slate-900">{staff.name}</h2>
                <p className="text-xs font-bold text-blue-600 uppercase tracking-widest">{staff.role} {staff.status === 'Inactive' && <span className="text-red-500 ml-1">- Inactive</span>}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total Jobs', value: staffBookings.length, icon: Briefcase, color: 'text-blue-600 bg-blue-50' },
              { label: 'Completed', value: completedJobs.length, icon: Award, color: 'text-emerald-600 bg-emerald-50' },
              { label: 'Today Earned', value: `£${todayEarnings.toFixed(0)}`, icon: DollarSign, color: 'text-amber-600 bg-amber-50' },
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

          {/* Extended Stats */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 grid grid-cols-3 gap-4">
            <div className="text-center">
              <div className="text-lg font-black text-slate-900">{completionRate}%</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Completion Rate</div>
            </div>
            <div className="text-center border-x border-slate-100">
              <div className="text-lg font-black text-emerald-600">{compliments.length}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Compliments</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-black text-red-500">{complaints.length}</div>
              <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Complaints</div>
            </div>
          </div>

          {/* Biodata */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400" /> Biodata
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-slate-600">
                <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="truncate">{staff.email}</span>
              </div>
              {staff.phone && (
                <div className="flex items-center gap-2 text-slate-600">
                  <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{staff.phone}</span>
                </div>
              )}
              {(staff.address || staff.postcode) && (
                <div className="flex items-center gap-2 text-slate-600 sm:col-span-2">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <span>{[staff.address, staff.postcode].filter(Boolean).join(', ')}</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-slate-600">
                <DollarSign className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Rate: {'£'}{staff.hourlyRate}/hr</span>
              </div>
              <div className="flex items-center gap-2 text-slate-600">
                <TrendingUp className="w-4 h-4 text-slate-400 shrink-0" />
                <span>Total earned: {'£'}{totalEarnings.toFixed(2)}</span>
              </div>
            </div>
            {/* Availability */}
            {staff.availability && (
              <div className="pt-3 border-t border-slate-50">
                <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Weekly availability</div>
                <div className="flex gap-1.5">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                    const slot = staff.availability?.[day as keyof typeof staff.availability];
                    const isActive = slot?.active;
                    return (
                      <div
                        key={day}
                        className={`flex-1 text-center py-1.5 rounded-lg text-[10px] font-black ${isActive ? 'bg-blue-500 text-white' : 'bg-slate-100 text-slate-400'}`}
                        title={isActive && slot ? `${slot.start} - ${slot.end}` : 'Off'}
                      >
                        {day.charAt(0)}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Today's Jobs */}
          {todayJobs.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Calendar className="w-4 h-4 text-slate-400" /> Today's Jobs ({todayJobs.length})
              </h3>
              <div className="space-y-2">
                {todayJobs.map((b) => (
                  <div key={b.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                    <div>
                      <span className="text-sm font-bold text-slate-900">{b.contact?.name || 'Client'}</span>
                      <span className="text-xs text-slate-400 ml-2">{b.time} - {b.serviceType}</span>
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
                      b.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                      b.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>{b.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compliments & Complaints */}
          {reviews.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Star className="w-4 h-4 text-slate-400" /> Client Feedback ({reviews.length})
              </h3>
              <div className="space-y-3 max-h-72 overflow-y-auto">
                {reviews.slice(0, 20).map((b) => (
                  <div key={b.id} className="flex gap-3 border-b border-slate-50 pb-3 last:border-0 last:pb-0">
                    <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
                      (b.rating || 0) >= 4 ? 'bg-emerald-50' : (b.rating || 0) <= 2 ? 'bg-red-50' : 'bg-amber-50'
                    }`}>
                      {(b.rating || 0) >= 4 ? (
                        <ThumbsUp className="w-4 h-4 text-emerald-600" />
                      ) : (b.rating || 0) <= 2 ? (
                        <ThumbsDown className="w-4 h-4 text-red-600" />
                      ) : (
                        <Star className="w-4 h-4 text-amber-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">{b.contact?.name || 'Client'}</span>
                        <span className="text-[10px] text-slate-400">{b.date}</span>
                        <div className="flex items-center gap-0.5">
                          {Array.from({ length: 5 }, (_, i) => (
                            <Star key={i} className={`w-3 h-3 ${i < (b.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                          ))}
                        </div>
                      </div>
                      {b.feedback && <p className="text-xs text-slate-600 mt-1">{b.feedback}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supervisor Remarks */}
          {supervisorRemarks.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <Award className="w-4 h-4 text-slate-400" /> Supervisor Remarks ({supervisorRemarks.length})
              </h3>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {supervisorRemarks.slice(0, 15).map((b) => (
                  <div key={b.id} className="bg-slate-50 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-700">{b.bookingId || `#${b.id}`}</span>
                      <span className="text-[10px] text-slate-400">{b.date}</span>
                    </div>
                    <p className="text-xs text-slate-600">{b.adminNotes}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Job History */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 space-y-3">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" /> Job History ({staffBookings.length})
            </h3>
            {sortedHistory.length === 0 ? (
              <p className="text-sm text-slate-400 font-medium">No jobs assigned yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sortedHistory.map((b) => {
                  const wc = b.workCompletion;
                  const clockIn = wc?.clockInTime || wc?.clockInAtIso;
                  const clockOut = wc?.clockOutTime || wc?.clockOutAtIso;
                  return (
                    <div key={b.id} className="border border-slate-50 rounded-xl px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-900">{b.bookingId || `#${b.id}`}</span>
                          <span className={`text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded ${
                            b.status === 'Completed' ? 'bg-emerald-100 text-emerald-700' :
                            b.status === 'Cancelled' ? 'bg-red-100 text-red-700' :
                            b.status === 'Confirmed' ? 'bg-blue-100 text-blue-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>{b.status}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">{b.date} {b.time}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-slate-600">
                          <span className="font-medium">{b.serviceType}</span>
                          {b.contact?.name && (
                            <button
                              type="button"
                              onClick={() => onViewClient?.(b.contact?.email || '')}
                              className="ml-2 text-blue-600 hover:text-blue-800 font-bold hover:underline"
                            >
                              {b.contact.name}
                            </button>
                          )}
                        </div>
                        {(clockIn || clockOut) && (
                          <div className="text-[10px] text-slate-500 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {clockIn && <span>In: {formatTime(clockIn)}</span>}
                            {clockOut && <span className="ml-1">Out: {formatTime(clockOut)}</span>}
                          </div>
                        )}
                      </div>
                      {b.rating != null && (
                        <div className="flex items-center gap-1 mt-1">
                          {Array.from({ length: 5 }, (_, i) => (
                            <Star key={i} className={`w-3 h-3 ${i < (b.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                          ))}
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

export default StaffProfileFlyout;
