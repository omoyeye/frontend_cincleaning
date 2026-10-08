import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Clock, MapPin, ChevronRight, ChevronLeft, CheckCircle2, Camera, MessageSquare, History, Navigation, Star,
  Signature, ShieldCheck, Phone, X, AlertCircle, Bell, User, ClipboardList, Send, LogOut,
  ImageIcon, Box, Calendar, FileText, Search, RotateCcw, Filter, Trash2, Settings, Lock,
  Briefcase, CheckSquare, Menu, Gift, Users, Wallet, Map as MapIcon, AlarmClock
} from 'lucide-react';
import RunningLatePanel from './staff/RunningLatePanel';
import { StaffNotification, Booking, BookingStatus, Extra, Referral, ServiceConfig, Staff, WorkCompletionData, UserAccount } from '../types';
import { apiStaff } from '../services/api';
import { NotificationBell } from './NotificationBell';
import ReviewsPanel from './admin/ReviewsPanel';
import { requestNotificationPermission } from '../services/NotificationService';
import { useFlyer } from './Flyer';
import { useBusinessBrand } from '../src/hooks/useBusinessBrand';
import { useBusinessSettings } from '../src/context/BusinessSettingsContext';
import {
  formatBookedHoursLabel,
  normalizeBookingDate,
  getBookingDurationHours,
  getDurationBreakdown,
  getLocalWeekMondayToSundayRange,
  getAssignedStaffCount,
  getBookingStaffIds,
  getTodayYYYYMMDD,
  getExtraDisplayLabel,
  staffJobPay,
} from '../src/utils/bookingHelpers';
import { DurationBreakdownBlock } from './DurationBreakdownBlock';
import StaffInvoiceDocument from './StaffInvoiceDocument';

const StaffEnRouteMap = React.lazy(() => import('./StaffEnRouteMap'));
const StaffJobsMap = React.lazy(() => import('./StaffJobsMap'));

function shiftCalendarDay(isoDate: string, deltaDays: number): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d + deltaDays);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

/** End of booked window in local time (start + duration). Returns null if inputs are invalid. */
function getScheduledJobEndMs(booking: Pick<Booking, 'date' | 'time'>, durationHours: number): number | null {
  const [year, month, day] = String(booking.date || '').split('-').map(Number);
  const [hours, minutes] = String(booking.time || '').split(':').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  const start = new Date(year, month - 1, day, Number.isFinite(hours) ? hours : 0, Number.isFinite(minutes) ? minutes : 0);
  const t = start.getTime();
  if (!Number.isFinite(t)) return null;
  const h = Number(durationHours);
  if (!Number.isFinite(h) || h <= 0) return null;
  return t + h * 60 * 60 * 1000;
}

/** Strip spaces for tel: / SMS dial strings (keep + and digits). */
function stripPhoneForDial(raw: string | undefined | null): string {
  return String(raw ?? '')
    .trim()
    .replace(/\s/g, '');
}

/** Client mobile from booking (`contact.phone` or API `contactPhone`). */
function clientPhoneForBooking(job: Booking | null): string {
  if (!job) return '';
  const fromContact = stripPhoneForDial(job.contact?.phone);
  if (fromContact) return fromContact;
  return stripPhoneForDial(job.contactPhone);
}

function sortStaffJobsByTimeThenId(list: Booking[]): Booking[] {
  return [...list].sort((a, b) => {
    const byTime = String(a.time || '').localeCompare(String(b.time || ''));
    if (byTime !== 0) return byTime;
    return String(a.id).localeCompare(String(b.id));
  });
}

function safeGetBookingDurationHours(
  booking: Partial<Booking>,
  serviceConfig: ServiceConfig | null,
  extrasList: Extra[]
): number {
  try {
    const h = getBookingDurationHours(booking, serviceConfig, extrasList);
    if (Number.isFinite(h) && h > 0) return h;
  } catch {
    // Defensive fallback for malformed legacy payloads.
  }
  const fallback = Number(booking.duration ?? booking.propertyDetails?.duration);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 2;
}

type ClockInState = { time: string; startedAtIso: string; location?: { lat: number; lng: number } };
type PersistedActiveJob = {
  jobId: string;
  stage: 'work' | 'summary';
  clockInTimeLabel: string;
  clockInStartedAtIso: string;
  location?: { lat: number; lng: number };
};

function getStaffActiveJobStorageKey(userId: unknown): string {
  return `nn_staff_active_job_${String(userId ?? '')}`;
}

function readPersistedActiveJob(userId: unknown): PersistedActiveJob | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(getStaffActiveJobStorageKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedActiveJob;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.jobId || !parsed.clockInStartedAtIso) return null;
    const stage = parsed.stage === 'summary' ? 'summary' : 'work';
    return {
      jobId: String(parsed.jobId),
      stage,
      clockInTimeLabel: String(parsed.clockInTimeLabel || ''),
      clockInStartedAtIso: String(parsed.clockInStartedAtIso),
      location:
        parsed.location &&
          typeof parsed.location.lat === 'number' &&
          typeof parsed.location.lng === 'number'
          ? { lat: parsed.location.lat, lng: parsed.location.lng }
          : undefined,
    };
  } catch {
    return null;
  }
}

function writePersistedActiveJob(userId: unknown, data: PersistedActiveJob): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getStaffActiveJobStorageKey(userId), JSON.stringify(data));
  } catch {
    // Ignore storage errors (private mode / quota).
  }
}

function clearPersistedActiveJob(userId: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getStaffActiveJobStorageKey(userId));
  } catch {
    // Ignore storage errors.
  }
}

function formatElapsedClock(iso: string, nowMs: number): string {
  const startMs = new Date(iso).getTime();
  if (!Number.isFinite(startMs) || startMs <= 0) return '00:00:00';
  const totalSec = Math.max(0, Math.floor((nowMs - startMs) / 1000));
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

type PortalTab = 'schedule' | 'availability' | 'messages' | 'late' | 'invoice' | 'referrals' | 'profile' | 'reviews';
type InboxView = 'alerts' | 'chats' | 'admin';

const TAB_ACCENT: Record<PortalTab, {
  titleGradient: string;
  sideActive: string;
  menuActive: string;
  bottomActive: string;
}> = {
  schedule: {
    titleGradient: 'from-emerald-600 to-teal-500',
    sideActive: 'bg-gradient-to-r from-emerald-600 to-teal-500 shadow-xl shadow-emerald-300/50 text-white -translate-y-0.5',
    menuActive: 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg shadow-emerald-300/50',
    bottomActive: 'bg-gradient-to-br from-emerald-200 to-teal-200 text-emerald-700 scale-105',
  },
  availability: {
    titleGradient: 'from-sky-600 to-blue-500',
    sideActive: 'bg-gradient-to-r from-sky-600 to-blue-500 shadow-xl shadow-sky-300/50 text-white -translate-y-0.5',
    menuActive: 'bg-gradient-to-br from-sky-500 to-blue-500 text-white shadow-lg shadow-sky-300/50',
    bottomActive: 'bg-gradient-to-br from-sky-200 to-blue-200 text-sky-700 scale-105',
  },
  messages: {
    titleGradient: 'from-indigo-600 to-violet-500',
    sideActive: 'bg-gradient-to-r from-indigo-600 to-violet-500 shadow-xl shadow-indigo-300/50 text-white -translate-y-0.5',
    menuActive: 'bg-gradient-to-br from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-300/50',
    bottomActive: 'bg-gradient-to-br from-indigo-200 to-violet-200 text-indigo-700 scale-105',
  },
  late: {
    titleGradient: 'from-amber-500 to-orange-500',
    sideActive: 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-xl shadow-amber-300/50 text-white -translate-y-0.5',
    menuActive: 'bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-300/50',
    bottomActive: 'bg-gradient-to-br from-amber-200 to-orange-200 text-amber-700 scale-105',
  },
  invoice: {
    titleGradient: 'from-purple-600 to-fuchsia-500',
    sideActive: 'bg-gradient-to-r from-purple-600 to-fuchsia-500 shadow-xl shadow-purple-300/50 text-white -translate-y-0.5',
    menuActive: 'bg-gradient-to-br from-purple-500 to-fuchsia-500 text-white shadow-lg shadow-purple-300/50',
    bottomActive: 'bg-gradient-to-br from-purple-200 to-fuchsia-200 text-purple-700 scale-105',
  },
  referrals: {
    titleGradient: 'from-rose-600 to-pink-500',
    sideActive: 'bg-gradient-to-r from-rose-600 to-pink-500 shadow-xl shadow-rose-300/50 text-white -translate-y-0.5',
    menuActive: 'bg-gradient-to-br from-rose-500 to-pink-500 text-white shadow-lg shadow-rose-300/50',
    bottomActive: 'bg-gradient-to-br from-rose-200 to-pink-200 text-rose-700 scale-105',
  },
  profile: {
    titleGradient: 'from-cyan-600 to-blue-500',
    sideActive: 'bg-gradient-to-r from-cyan-600 to-blue-500 shadow-xl shadow-cyan-300/50 text-white -translate-y-0.5',
    menuActive: 'bg-gradient-to-br from-cyan-500 to-blue-500 text-white shadow-lg shadow-cyan-300/50',
    bottomActive: 'bg-gradient-to-br from-cyan-200 to-blue-200 text-cyan-700 scale-105',
  },
  reviews: {
    titleGradient: 'from-amber-500 to-yellow-400',
    sideActive: 'bg-gradient-to-r from-amber-500 to-yellow-400 shadow-xl shadow-amber-300/50 text-white -translate-y-0.5',
    menuActive: 'bg-gradient-to-br from-amber-500 to-yellow-400 text-white shadow-lg shadow-amber-300/50',
    bottomActive: 'bg-gradient-to-br from-amber-200 to-yellow-200 text-amber-700 scale-105',
  },
};

const StaffPortal: React.FC<{
  currentUser: UserAccount;
  notifications: StaffNotification[];
  onLogout: () => void;
}> = ({ currentUser, notifications, onLogout }) => {
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const asStaffRows = (rows: unknown): Staff[] =>
    Array.isArray(rows) ? rows.filter((x): x is Staff => isRecord(x) && typeof (x as Record<string, unknown>).id === 'number' && typeof (x as Record<string, unknown>).name === 'string') : [];
  const asBookingRows = (rows: unknown): Booking[] =>
    Array.isArray(rows) ? rows.filter((x): x is Booking => isRecord(x) && typeof (x as Record<string, unknown>).id === 'number' && typeof (x as Record<string, unknown>).status === 'string') : [];

  const { showFlyer } = useFlyer();
  const brandName = useBusinessBrand();
  const { phone: brandPhoneSetting } = useBusinessSettings();
  const brandPhoneDial = stripPhoneForDial(brandPhoneSetting);
  const displayName =
    String(currentUser?.name ?? '').trim() ||
    String(currentUser?.email ?? '').split('@')[0]?.trim() ||
    'Staff';
  const displayInitial = displayName.charAt(0).toUpperCase();
  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good morning' : greetingHour < 17 ? 'Good afternoon' : 'Good evening';
  const todayLabel = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const [activeTab, setActiveTab] = useState<PortalTab>('schedule');
  const [mobileScheduleView, setMobileScheduleView] = useState<'list' | 'day' | 'map'>('list');
  const [desktopMapVisible, setDesktopMapVisible] = useState(false);
  const [mobileChatView, setMobileChatView] = useState<'list' | 'chat'>('list');
  const [inboxView, setInboxView] = useState<InboxView>('alerts');
  const [showAllOpenChats, setShowAllOpenChats] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const activeTheme = TAB_ACCENT[activeTab];
  const isMoreTab = activeTab === 'profile' || activeTab === 'reviews' || activeTab === 'referrals' || activeTab === 'late';
  const [staffAlerts, setStaffAlerts] = useState<StaffNotification[]>(notifications || []);

  const openInbox = (view: InboxView = 'alerts') => {
    setInboxView(view);
    setActiveTab('messages');
  };

  useEffect(() => {
    setStaffAlerts(Array.isArray(notifications) ? notifications : []);
  }, [notifications]);

  useEffect(() => {
    if (activeTab !== 'schedule') setMobileScheduleView('list');
  }, [activeTab]);
  useEffect(() => {
    if (activeTab !== 'messages') setMobileChatView('list');
  }, [activeTab]);

  // State to hold the full Staff object (with ID, rate, etc.)
  const [currentStaff, setCurrentStaff] = useState<Staff | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Staff>>({});
  const [postcodeLookup, setPostcodeLookup] = useState<{ loading: boolean; note: string | null; error: string | null }>({
    loading: false,
    note: null,
    error: null,
  });
  const [passwordForm, setPasswordForm] = useState<{ current: string; next: string; confirm: string; saving: boolean }>({
    current: '',
    next: '',
    confirm: '',
    saving: false,
  });
  const [selectedJob, setSelectedJob] = useState<Booking | null>(null);
  const [jobStage, setJobStage] = useState<'details' | 'travel' | 'work' | 'summary'>('details');
  const [clockInData, setClockInData] = useState<ClockInState | null>(null);
  /** Set when staff taps clock out; used on summary + final submit (not re-computed each render). */
  const [clockOutTimeLabel, setClockOutTimeLabel] = useState<string | null>(null);
  /** ISO instant when staff tapped clock out — submitted with report for admin audit. */
  const [clockOutAtIso, setClockOutAtIso] = useState<string | null>(null);
  const [earlyClockOutModalOpen, setEarlyClockOutModalOpen] = useState(false);
  const [earlyClockOutReasonInput, setEarlyClockOutReasonInput] = useState('');
  /** Captured when staff confirms early clock-out; sent with final report. */
  const [earlyClockOutReason, setEarlyClockOutReason] = useState<string | null>(null);
  const [clockNowMs, setClockNowMs] = useState<number>(() => Date.now());
  const [workDetails, setWorkDetails] = useState<Partial<WorkCompletionData> & { toolsProvided: boolean }>({
    notes: '',
    issues: '',
    photos: [],
    toolsProvided: false
  });
  const [cancelRequestReason, setCancelRequestReason] = useState('');
  const [isRequestingCancel, setIsRequestingCancel] = useState(false);

  // Data State
  const [initialLoading, setInitialLoading] = useState(true);
  const [jobs, setJobs] = useState<Booking[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceConfig[]>([]);
  const [extraServices, setExtraServices] = useState<Extra[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [submittedInvoices, setSubmittedInvoices] = useState<Array<{
    id: number;
    staffName?: string | null;
    weekLabel: string;
    weekStart?: string | null;
    weekEnd?: string | null;
    totalAmount: number;
    weekTotalHours: number;
    weekJobCount: number;
    jobs?: unknown;
    bankDetails?: unknown;
    status: string;
    adminNotes?: string | null;
    createdAt?: string;
  }>>([]);
  const [expandedSubmittedInvoiceId, setExpandedSubmittedInvoiceId] = useState<number | null>(null);
  const [staffDirectory, setStaffDirectory] = useState<Staff[]>([]);
  const [activeChatJobId, setActiveChatJobId] = useState<string | null>(null);
  const [staffChatMessage, setStaffChatMessage] = useState('');
  const [staffChatMessages, setStaffChatMessages] = useState<Array<{ id: string; senderName: string; senderRole: string; text: string; timestamp: string }>>([]);
  const [staffChatClosed, setStaffChatClosed] = useState(false);
  const [staffChatCanStart, setStaffChatCanStart] = useState(false);
  const [adminChatMessages, setAdminChatMessages] = useState<Array<{ id: number; senderName: string; senderRole: string; text: string; createdAt: string; isRead: boolean }>>([]);
  const [adminChatInput, setAdminChatInput] = useState('');
  const [adminChatLoading, setAdminChatLoading] = useState(false);

  const selectedClientPhone = useMemo(() => clientPhoneForBooking(selectedJob), [selectedJob]);

  const filesToDataUrls = (files: FileList): Promise<string[]> =>
    Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || ''));
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
          })
      )
    );
  const MAX_PROFILE_IMAGE_DATA_URL_LENGTH = 60000;
  const hasRestoredActiveJobRef = useRef(false);
  const [lateModalJobId, setLateModalJobId] = useState<number | null>(null);
  const sigCanvasRef = useRef<HTMLCanvasElement>(null);
  const sigDrawingRef = useRef(false);
  const toOptimizedProfileImageDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.onload = () => {
        const source = String(reader.result || '');
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid image file'));
        img.onload = () => {
          try {
            const maxDim = 900;
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const width = Math.max(1, Math.round(img.width * scale));
            const height = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
              resolve(source);
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            // Use jpeg for predictable compressed size.
            let out = canvas.toDataURL('image/jpeg', 0.78);
            if (out.length > MAX_PROFILE_IMAGE_DATA_URL_LENGTH) {
              out = canvas.toDataURL('image/jpeg', 0.65);
            }
            resolve(out.length <= source.length ? out : source);
          } catch {
            resolve(source);
          }
        };
        img.src = source;
      };
      reader.readAsDataURL(file);
    });

  // Filtering for Rota — local calendar day (not UTC from toISOString)
  const [selectedRotaDate, setSelectedRotaDate] = useState<string>(() => getTodayYYYYMMDD());
  /** Recomputed each render so filters stay correct if the tab stays open past midnight. */
  const calendarToday = getTodayYYYYMMDD();
  const [isEditingAvailability, setIsEditingAvailability] = useState(false);
  const [availabilityForm, setAvailabilityForm] = useState<any>({
    Mon: { active: true, start: '09:00', end: '17:00' },
    Tue: { active: true, start: '09:00', end: '17:00' },
    Wed: { active: true, start: '09:00', end: '17:00' },
    Thu: { active: true, start: '09:00', end: '17:00' },
    Fri: { active: true, start: '09:00', end: '17:00' },
    Sat: { active: false, start: '09:00', end: '13:00' },
    Sun: { active: false, start: '09:00', end: '13:00' }
  });

  // Fetch Staff Details & Jobs on mount and poll
  useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    let isFetching = false;
    let cancelled = false;

    const init = async () => {
      if (isFetching) return;
      isFetching = true;
      try {
        const [fetchedExtras, fetchedServices] = await Promise.all([
          apiStaff.getExtraServices(),
          apiStaff.getServices(),
        ]);
        if (cancelled) return;
        setExtraServices(fetchedExtras || []);
        setServiceCatalog(fetchedServices || []);
        // 1. Find Staff record for current user
        const allStaffRaw = await apiStaff.getStaff();
        if (cancelled) return;
        const allStaff = asStaffRows(allStaffRaw);
        setStaffDirectory(allStaff);
        const currentUid = Number(currentUser?.id);
        const staffRecord =
          allStaff.find((s: any) => Number((s as any).userId) === currentUid) ||
          allStaff.find((s) => String(s.email || '').trim().toLowerCase() === String(currentUser?.email || '').trim().toLowerCase());

        if (staffRecord) {
          setCurrentStaff(staffRecord);
          // Sync existing availability payload if present
          if (staffRecord.availability) {
            setAvailabilityForm(staffRecord.availability);
          }

          // 2. Fetch Jobs and submitted invoice history for this staff profile
          const [allBookingsRaw, invoiceHistory] = await Promise.all([
            apiStaff.getBookings(),
            apiStaff.getStaffInvoiceHistory(staffRecord.id).catch(() => []),
          ]);
          if (cancelled) return;
          const allBookings = asBookingRows(allBookingsRaw);
          const staffPk = Number(staffRecord.id);
          const myJobs = allBookings.filter((b) => getBookingStaffIds(b).includes(staffPk));
          setJobs(myJobs);
          setSubmittedInvoices(Array.isArray(invoiceHistory) ? invoiceHistory : []);

          // 3. Fetch Referrals for this Staff ID
          const myReferrals = await apiStaff.getUserReferrals(Number(currentUser?.id), 'staff');
          if (cancelled) return;
          setReferrals(Array.isArray(myReferrals) ? myReferrals : []);
        } else {
          showFlyer("Staff profile not found. Please contact admin.", 'error');
          console.error("No staff record found for user:", currentUser.email);
        }
      } catch (err) {
        if (!cancelled) console.error("Failed to fetch staff data", err);
      } finally {
        isFetching = false;
        if (!cancelled) setInitialLoading(false);
      }
    };

    if (currentUser) {
      init();
      pollInterval = setInterval(init, 15000);
    }

    return () => {
      cancelled = true;
      clearInterval(pollInterval);
    };
  }, [currentUser]);

  const todaysJobs = useMemo(() => {
    const today = calendarToday;
    return sortStaffJobsByTimeThenId(
      jobs.filter((j) => normalizeBookingDate(j.date) === today && j.status !== BookingStatus.COMPLETED)
    );
  }, [jobs, calendarToday]);

  const upcomingJobs = useMemo(() => {
    const today = calendarToday;
    return sortStaffJobsByTimeThenId(
      jobs.filter((j) => normalizeBookingDate(j.date) > today && j.status !== BookingStatus.COMPLETED)
    );
  }, [jobs, calendarToday]);

  const selectedDateJobs = useMemo(() => {
    return sortStaffJobsByTimeThenId(jobs.filter((j) => normalizeBookingDate(j.date) === selectedRotaDate));
  }, [jobs, selectedRotaDate]);

  const rotaDayLabel = useMemo(() => {
    if (selectedRotaDate === calendarToday) return 'Today';
    return selectedRotaDate < calendarToday ? 'Past date' : 'Upcoming';
  }, [selectedRotaDate, calendarToday]);

  const mobileScheduleDailyRows = useMemo(() => {
    const actionableJobs = jobs.filter((j) => {
      const bookingDate = normalizeBookingDate(j.date);
      return bookingDate >= calendarToday && j.status !== BookingStatus.COMPLETED;
    });
    const grouped = new Map<string, { date: string; jobs: Booking[]; totalHours: number }>();
    for (const job of actionableJobs) {
      const date = normalizeBookingDate(job.date);
      if (!date) continue;
      const current = grouped.get(date) ?? { date, jobs: [], totalHours: 0 };
      const svc = serviceCatalog.find(
        (s) => String(s.id) === String(job.serviceType) || s.name === job.serviceType
      );
      current.jobs.push(job);
      current.totalHours += safeGetBookingDurationHours(job, svc ?? null, extraServices);
      grouped.set(date, current);
    }
    const rows = Array.from(grouped.values()) as Array<{ date: string; jobs: Booking[]; totalHours: number }>;
    return rows
      .map((row) => ({
        date: row.date,
        totalHours: row.totalHours,
        jobs: sortStaffJobsByTimeThenId(row.jobs),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [jobs, calendarToday, serviceCatalog, extraServices]);

  const mobileScheduleSections = useMemo(() => {
    const sections = new Map<string, typeof mobileScheduleDailyRows>();
    for (const row of mobileScheduleDailyRows) {
      const label = getMobileWeekSectionLabel(row.date, calendarToday);
      const existing = sections.get(label) ?? [];
      existing.push(row);
      sections.set(label, existing);
    }
    return Array.from(sections.entries()).map(([label, rows]) => ({ label, rows }));
  }, [mobileScheduleDailyRows, calendarToday]);

  const chatEligibleJobs = useMemo(() => {
    return jobs.filter((j) =>
      (j.status === BookingStatus.PENDING || j.status === BookingStatus.CONFIRMED || j.status === BookingStatus.COMPLETED) &&
      (!!j.assignedStaffId || !!(j.assignedStaffIds && j.assignedStaffIds.length > 0))
    );
  }, [jobs]);
  const openChatJobs = useMemo(
    () => chatEligibleJobs.filter((j) => !Boolean((j as any).chatClosedByAdmin)),
    [chatEligibleJobs],
  );
  const visibleOpenChatJobs = useMemo(
    () => (showAllOpenChats ? openChatJobs : openChatJobs.slice(0, 4)),
    [openChatJobs, showAllOpenChats]
  );
  const closedChatHistoryJobs = useMemo(
    () => chatEligibleJobs.filter((j) => Boolean((j as any).chatClosedByAdmin)),
    [chatEligibleJobs],
  );
  const activeChatJob = useMemo(
    () => chatEligibleJobs.find((j) => String(j.id) === String(activeChatJobId)) ?? null,
    [chatEligibleJobs, activeChatJobId],
  );

  const loadStaffChat = async (bookingId: string) => {
    try {
      const payload = await apiStaff.getBookingChat(bookingId);
      setStaffChatMessages(payload?.messages || []);
      setStaffChatClosed(Boolean(payload?.chatClosedByAdmin));
      setStaffChatCanStart(Boolean(payload?.canChatNow));
    } catch {
      setStaffChatMessages([]);
      setStaffChatClosed(false);
      setStaffChatCanStart(false);
    }
  };

  const loadAdminChat = async () => {
    setAdminChatLoading(true);
    try {
      const msgs = await apiStaff.getDirectMessages();
      setAdminChatMessages(Array.isArray(msgs) ? msgs.reverse() : []);
      await apiStaff.markDirectMessagesRead().catch(() => {});
    } catch {
      setAdminChatMessages([]);
    } finally {
      setAdminChatLoading(false);
    }
  };

  const sendAdminChat = async () => {
    const text = adminChatInput.trim();
    if (!text) return;
    try {
      await apiStaff.sendDirectMessage(text);
      setAdminChatInput('');
      await loadAdminChat();
    } catch {
      showFlyer('Failed to send message. Please try again.', 'error');
    }
  };

  const openJobDetails = (job: Booking) => {
    setSelectedJob(job);
    setJobStage('details');
    setCancelRequestReason('');
    setClockOutTimeLabel(null);
    setClockOutAtIso(null);
    setEarlyClockOutModalOpen(false);
    setEarlyClockOutReasonInput('');
    setEarlyClockOutReason(null);
  };

  const persistActiveClockedInJob = (
    job: Booking,
    ci: ClockInState,
    stage: 'work' | 'summary' = 'work'
  ) => {
    writePersistedActiveJob(currentUser?.id, {
      jobId: String(job.id),
      stage,
      clockInTimeLabel: ci.time,
      clockInStartedAtIso: ci.startedAtIso,
      location: ci.location,
    });
  };

  const clearActiveClockedInJob = () => {
    clearPersistedActiveJob(currentUser?.id);
  };

  useEffect(() => {
    hasRestoredActiveJobRef.current = false;
  }, [currentUser?.id]);

  useEffect(() => {
    if (!clockInData?.startedAtIso) return;
    const t = setInterval(() => setClockNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [clockInData?.startedAtIso]);

  const elapsedClockLabel = useMemo(() => {
    if (!clockInData?.startedAtIso) return '00:00:00';
    return formatElapsedClock(clockInData.startedAtIso, clockNowMs);
  }, [clockInData?.startedAtIso, clockNowMs]);

  const activeClockedJob = useMemo(() => {
    if (!clockInData) return null;
    if (selectedJob) return selectedJob;
    const persisted = readPersistedActiveJob(currentUser?.id);
    if (!persisted) return null;
    return jobs.find((j) => String(j.id) === String(persisted.jobId)) ?? null;
  }, [clockInData, selectedJob, jobs, currentUser?.id]);

  useEffect(() => {
    if (!currentUser?.id || jobs.length === 0 || hasRestoredActiveJobRef.current) return;
    const persisted = readPersistedActiveJob(currentUser.id);
    hasRestoredActiveJobRef.current = true;
    if (!persisted) return;
    const matched = jobs.find((j) => String(j.id) === String(persisted.jobId));
    if (!matched || matched.status === BookingStatus.COMPLETED) {
      clearActiveClockedInJob();
      return;
    }
    setSelectedJob(matched);
    setJobStage(persisted.stage);
    setClockInData({
      time: persisted.clockInTimeLabel || new Date(persisted.clockInStartedAtIso).toLocaleTimeString(),
      startedAtIso: persisted.clockInStartedAtIso,
      location: persisted.location,
    });
    setClockOutTimeLabel(null);
    setClockOutAtIso(null);
    setEarlyClockOutModalOpen(false);
    setEarlyClockOutReasonInput('');
    setEarlyClockOutReason(null);
  }, [jobs, currentUser?.id]);

  useEffect(() => {
    if (!selectedJob) return;
    const latest = jobs.find((j) => String(j.id) === String(selectedJob.id));
    if (!latest) return;
    setSelectedJob(latest);
  }, [jobs, selectedJob]);

  const travellingJobId = jobStage === 'travel' && selectedJob ? selectedJob.id : null;
  const travellingJobIsToday = jobStage === 'travel' && selectedJob ? normalizeBookingDate(selectedJob.date) === getTodayYYYYMMDD() : false;

  // Share live GPS with the office and client while travelling to today's job.
  useEffect(() => {
    if (travellingJobId == null || !travellingJobIsToday || !navigator.geolocation) return;
    let lastSent = 0;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const now = Date.now();
        if (now - lastSent < 30000) return;
        lastSent = now;
        apiStaff
          .updateLocation(travellingJobId, { lat: pos.coords.latitude, lng: pos.coords.longitude })
          .catch(() => { /* next fix will retry */ });
      },
      () => { /* permission denied or unavailable: travel still works without live tracking */ },
      { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [travellingJobId, travellingJobIsToday]);

  const getQuickPosition = (): Promise<{ lat: number; lng: number } | null> =>
    new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
      );
    });

  const handleStartTravel = async () => {
    if (!selectedJob) return;
    const job = selectedJob;
    setJobStage('travel');
    if (normalizeBookingDate(job.date) !== getTodayYYYYMMDD()) return;
    const coords = await getQuickPosition();
    try {
      await apiStaff.startTravel(job.id, coords ?? {});
      showFlyer('The client and office have been told you are on the way.', 'success');
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not share that you are on the way.', 'error');
    }
  };

  const refreshMyJobs = async () => {
    if (!currentStaff) return;
    try {
      const all = asBookingRows(await apiStaff.getBookings());
      setJobs(all.filter((b) => getBookingStaffIds(b).includes(Number(currentStaff.id))));
    } catch {
      /* regular polling will catch up */
    }
  };

  const handleClockIn = () => {
    if (selectedJob) {
      const jobDate = normalizeBookingDate(selectedJob.date);
      const today = getTodayYYYYMMDD();
      if (!jobDate || jobDate !== today) {
        showFlyer('Clock-in is only allowed for jobs scheduled for today.', 'error');
        return;
      }
      const now = new Date();
      const baseClockIn: ClockInState = { time: now.toLocaleTimeString(), startedAtIso: now.toISOString() };
      // Note: Real app would use actual Geolocation here
      // Show active job UI immediately; refine with GPS when available (avoids null clockInData while geolocation pending).
      setClockInData(baseClockIn);
      persistActiveClockedInJob(selectedJob, baseClockIn, 'work');
      setJobStage('work');
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
          const withLocation: ClockInState = {
            ...baseClockIn,
            location: { lat: pos.coords.latitude, lng: pos.coords.longitude }
          };
          setClockInData(withLocation);
          persistActiveClockedInJob(selectedJob, withLocation, 'work');
          // Tells the client their cleaner has arrived (and counts as en route for admin warnings).
          apiStaff
            .markArrived(selectedJob.id, { lat: pos.coords.latitude, lng: pos.coords.longitude })
            .catch(() => { /* non-blocking */ });
        }, () => {
          apiStaff.markArrived(selectedJob.id).catch(() => { /* non-blocking */ });
        });
      } else {
        apiStaff.markArrived(selectedJob.id).catch(() => { /* non-blocking */ });
      }
    }
  };

  const finalizeClockOut = (reason: string | null) => {
    setEarlyClockOutReason(reason && reason.trim() ? reason.trim() : null);
    setEarlyClockOutModalOpen(false);
    setEarlyClockOutReasonInput('');
    const out = new Date();
    setClockOutTimeLabel(out.toLocaleTimeString());
    setClockOutAtIso(out.toISOString());
    clearActiveClockedInJob();
    setJobStage('summary');
  };

  const handleClockOut = () => {
    if (!selectedJob) return;
    const svc = serviceCatalog.find(
      (s) => String(s.id) === String(selectedJob.serviceType) || s.name === selectedJob.serviceType
    );
    const bookedHours = safeGetBookingDurationHours(selectedJob, svc ?? null, extraServices);
    const endMs = getScheduledJobEndMs(selectedJob, bookedHours);
    if (endMs != null && Date.now() < endMs) {
      setEarlyClockOutReasonInput('');
      setEarlyClockOutModalOpen(true);
      return;
    }
    finalizeClockOut(null);
  };

  const confirmEarlyClockOut = () => {
    const text = earlyClockOutReasonInput.trim();
    if (!text) {
      showFlyer('Please explain why you are finishing before the booked time ends.', 'error');
      return;
    }
    finalizeClockOut(text);
  };

  const handleRunningLate = () => {
    if (!selectedJob) return;
    if (normalizeBookingDate(selectedJob.date) !== getTodayYYYYMMDD()) {
      showFlyer('Running-late updates can only be sent on the day of the job.', 'error');
      return;
    }
    setLateModalJobId(selectedJob.id);
  };

  const hoursUntilJob = (date: string, time: string): number => {
    const [year, month, day] = String(date || '').split('-').map(Number);
    const [hours, minutes] = String(time || '').split(':').map(Number);
    const at = new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0);
    return (at.getTime() - Date.now()) / (1000 * 60 * 60);
  };

  const handleRequestCancellation = async () => {
    if (!selectedJob) return;
    const diffHours = hoursUntilJob(selectedJob.date, selectedJob.time);
    if (!Number.isFinite(diffHours) || diffHours < 72) {
      showFlyer('Cancellation requests must be made at least 3 days before the job.', 'error');
      return;
    }
    setIsRequestingCancel(true);
    try {
      await apiStaff.requestStaffCancellation(selectedJob.id, cancelRequestReason.trim());
      showFlyer('Request sent to admin. They will review and confirm next steps.', 'success');
      setCancelRequestReason('');
    } catch (err) {
      showFlyer(err instanceof Error ? err.message : 'Failed to send cancellation request.', 'error');
    } finally {
      setIsRequestingCancel(false);
    }
  };

  const initSignaturePad = (canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * 2;
    canvas.height = rect.height * 2;
    ctx.scale(2, 2);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#1e293b';
  };

  const getSignaturePoint = (e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const touch = 'touches' in e ? e.touches[0] || e.changedTouches[0] : null;
    const clientX = touch ? touch.clientX : (e as React.MouseEvent).clientX;
    const clientY = touch ? touch.clientY : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const onSigStart = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    sigDrawingRef.current = true;
    const ctx = canvas.getContext('2d');
    const pt = getSignaturePoint(e, canvas);
    ctx?.beginPath();
    ctx?.moveTo(pt.x, pt.y);
  };

  const onSigMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!sigDrawingRef.current) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    e.preventDefault();
    const ctx = canvas.getContext('2d');
    const pt = getSignaturePoint(e, canvas);
    ctx?.lineTo(pt.x, pt.y);
    ctx?.stroke();
  };

  const onSigEnd = () => {
    sigDrawingRef.current = false;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const ctx = canvas.getContext('2d');
    const hasContent = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0) : false;
    if (hasContent) {
      setWorkDetails(prev => ({ ...prev, signature: dataUrl }));
    }
  };

  const clearSignature = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    setWorkDetails(prev => ({ ...prev, signature: '' }));
  };

  const handleFinalSubmit = async () => {
    if (!selectedJob) return;

    const clockInLabel = (clockInData?.time || '').trim();
    const clockInIso = (clockInData?.startedAtIso || '').trim();
    const outLabel = (clockOutTimeLabel || '').trim();
    const outIso = (clockOutAtIso || '').trim();
    if (!clockInLabel || !clockInIso) {
      showFlyer('Clock-in data is missing. Re-open the job from your schedule or contact admin.', 'error');
      return;
    }
    if (!outLabel || !outIso) {
      showFlyer('Use “Complete Job & Clock Out” first so your clock-out time is recorded, then submit the report.', 'error');
      return;
    }

    const completionData: WorkCompletionData = {
      notes: workDetails.notes || '',
      issues: workDetails.issues || '',
      photos: workDetails.photos || [],
      signature: workDetails.signature || 'Signed', // Mock signature if empty
      clockInTime: clockInLabel,
      clockInAtIso: clockInIso,
      clockOutTime: outLabel,
      clockOutAtIso: outIso,
      ...(earlyClockOutReason ? { earlyClockOutReason: earlyClockOutReason } : {}),
      location: clockInData?.location
    };

    try {
      await apiStaff.completeJob(selectedJob.id, completionData);
      showFlyer(`Job ${selectedJob.id} Submitted Successfully!`, 'success');
      // Update local state (include report so My Rota / details show it without waiting for refresh)
      setJobs((prev) =>
        prev.map((j) =>
          j.id === selectedJob.id ? { ...j, status: BookingStatus.COMPLETED, workCompletion: completionData } : j
        )
      );
      setSelectedJob(null);
      setJobStage('details');
      setClockInData(null);
      setClockOutTimeLabel(null);
      setClockOutAtIso(null);
      setEarlyClockOutModalOpen(false);
      setEarlyClockOutReasonInput('');
      setEarlyClockOutReason(null);
      clearActiveClockedInJob();
      setWorkDetails({ notes: '', issues: '', photos: [], toolsProvided: false });
    } catch (error) {
      console.error('Error submitting job:', error);
      showFlyer("Failed to submit job details. Please try again.", 'error');
    }
  };

  const invoiceData = useMemo(() => {
    const hourlyRate = Number(currentStaff?.hourlyRate ?? 0);
    const completedJobs = jobs.filter((j) => j.status === BookingStatus.COMPLETED);
    const { start: weekStart, end: weekEnd } = getLocalWeekMondayToSundayRange();

    const mapRow = (j: Booking) => {
      const svc = serviceCatalog.find((s) => String(s.id) === String(j.serviceType) || s.name === j.serviceType);
      const { bookedHours, staffCount, yourHours, pay: yourShare } = staffJobPay(j, hourlyRate, svc ?? null, extraServices);
      return {
        id: j.id,
        customer: j.contact?.name || 'Guest',
        date: j.date,
        staffCount,
        bookedHours,
        yourHours,
        hourlyRate,
        yourShare,
      };
    };

    const allInvoiceJobs = completedJobs.map(mapRow);
    const weekJobs = completedJobs
      .filter((j) => {
        const d = normalizeBookingDate(j.date);
        return d >= weekStart && d <= weekEnd;
      })
      .map(mapRow);

    const weekTotalShare = weekJobs.reduce((acc, j) => acc + j.yourShare, 0);
    const weekTotalYourHours = weekJobs.reduce((acc, j) => acc + j.yourHours, 0);
    const weekJobCount = weekJobs.length;

    const ymPrefix = new Date().toISOString().slice(0, 7);
    const monthJobs = allInvoiceJobs.filter((j) => String(j.date).startsWith(ymPrefix));
    const monthShare = monthJobs.reduce((acc, j) => acc + j.yourShare, 0);

    return {
      jobs: allInvoiceJobs,
      weekJobs,
      weekStart,
      weekEnd,
      weekTotalShare,
      weekTotalYourHours,
      weekJobCount,
      totalShare: allInvoiceJobs.reduce((acc, curr) => acc + curr.yourShare, 0),
      monthJobs,
      monthShare,
    };
  }, [jobs, serviceCatalog, extraServices, currentStaff]);

  const selectedJobBreakdown = useMemo(() => {
    if (!selectedJob) return null;
    try {
      const svc = serviceCatalog.find(
        (s) => String(s.id) === String(selectedJob.serviceType) || s.name === selectedJob.serviceType
      );
      return getDurationBreakdown(selectedJob, svc ?? null, extraServices);
    } catch {
      return null;
    }
  }, [selectedJob, serviceCatalog, extraServices]);

  const coworkersOnSelectedJob = useMemo(() => {
    if (!selectedJob || !currentStaff) return [];
    const ids =
      selectedJob.assignedStaffIds && selectedJob.assignedStaffIds.length > 0
        ? selectedJob.assignedStaffIds
        : selectedJob.assignedStaffId != null
          ? [selectedJob.assignedStaffId]
          : [];
    return ids
      .filter((id) => id !== currentStaff.id)
      .map((id) => staffDirectory.find((s) => s.id === id))
      .filter(Boolean) as Staff[];
  }, [selectedJob, currentStaff, staffDirectory]);

  const selectedJobEarningsPreview = useMemo(() => {
    if (!selectedJob || !currentStaff) return null;
    const staffCount = getAssignedStaffCount(selectedJob);
    const svc = serviceCatalog.find(
      (s) => String(s.id) === String(selectedJob.serviceType) || s.name === selectedJob.serviceType
    );
    const bookedHours = safeGetBookingDurationHours(selectedJob, svc ?? null, extraServices);
    const yourHours = bookedHours / staffCount;
    const rate = Number(currentStaff.hourlyRate || 0);
    return {
      staffCount,
      bookedHours,
      yourHours,
      rate,
      pay: yourHours * rate,
    };
  }, [selectedJob, currentStaff, serviceCatalog, extraServices]);

  /** Completed jobs on this staff member’s roster that include a client rating (1–5). */
  const clientRatingStats = useMemo(() => {
    const rated = jobs.filter(
      (j) =>
        j.status === BookingStatus.COMPLETED &&
        j.rating != null &&
        Number(j.rating) >= 1 &&
        Number(j.rating) <= 5
    );
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    rated.forEach((j) => {
      const r = Math.round(Number(j.rating));
      if (r >= 1 && r <= 5) counts[r] += 1;
    });
    const n = rated.length;
    const avg = n ? rated.reduce((a, j) => a + Number(j.rating), 0) / n : null;
    return { counts, n, avg };
  }, [jobs]);

  const handleSendInvoice = async () => {
    if (invoiceData.weekJobs.length === 0 || !currentStaff) return;

    if (!currentStaff.bankName || !currentStaff.accountNumber || !currentStaff.sortCode) {
      showFlyer('Please add your bank details in the Profile tab first!', 'error');
      return;
    }

    try {
      await apiStaff.submitWeeklyInvoice(currentStaff.id, {
        totalAmount: invoiceData.weekTotalShare,
        jobs: invoiceData.weekJobs,
        week: `${invoiceData.weekStart} → ${invoiceData.weekEnd}`,
        weekTotalHours: invoiceData.weekTotalYourHours,
        weekJobCount: invoiceData.weekJobCount,
        bankDetails: {
          bankName: currentStaff.bankName,
          accountNumber: currentStaff.accountNumber,
          sortCode: currentStaff.sortCode
        }
      });
      const history = await apiStaff.getStaffInvoiceHistory(currentStaff.id).catch(() => []);
      setSubmittedInvoices(Array.isArray(history) ? history : []);
      showFlyer(`Weekly invoice (£${Number(invoiceData.weekTotalShare || 0).toFixed(2)}, ${Number(invoiceData.weekTotalYourHours || 0).toFixed(2)} your hrs) submitted!`, 'success');
    } catch (e) {
      showFlyer('Failed to submit invoice', 'error');
    }
  };

  const handleTimeOffRequest = async () => {
    if (!currentStaff) return;
    try {
      await apiStaff.updateStaff(currentStaff.id, { availability: availabilityForm });
      setCurrentStaff({ ...currentStaff, availability: availabilityForm } as Staff);
      showFlyer("Weekly availability saved to Admin dashboard.", 'success');
      setIsEditingAvailability(false);
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Failed to submit request', 'error');
    }
  };

  const normalizePostcode = (raw: string): string => {
    const compact = raw.replace(/\s+/g, '').toUpperCase();
    if (compact.length < 5) return compact;
    return `${compact.slice(0, compact.length - 3)} ${compact.slice(-3)}`;
  };

  const handleLookupPostcode = async () => {
    const pc = normalizePostcode(editForm.postcode || '');
    if (!pc) {
      setPostcodeLookup({ loading: false, note: null, error: 'Enter a postcode first.' });
      return;
    }
    setPostcodeLookup({ loading: true, note: null, error: null });
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
      if (!res.ok) {
        const msg = res.status === 404 ? 'Postcode not found.' : 'Lookup failed, try again.';
        setPostcodeLookup({ loading: false, note: null, error: msg });
        return;
      }
      const data = await res.json();
      const r = data?.result;
      const areaBits = [r?.admin_ward, r?.admin_district, r?.region].filter(Boolean);
      const note = areaBits.length
        ? `Valid UK postcode · ${areaBits.join(', ')}`
        : 'Valid UK postcode.';
      setEditForm((prev) => ({ ...prev, postcode: pc }));
      setPostcodeLookup({ loading: false, note, error: null });
    } catch (err) {
      setPostcodeLookup({
        loading: false,
        note: null,
        error: err instanceof Error ? err.message : 'Lookup failed.',
      });
    }
  };

  const handleProfileSave = async () => {
    if (!currentStaff) return;
    const pc = editForm.postcode ? normalizePostcode(editForm.postcode) : '';
    const UK_PC = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
    if (pc && !UK_PC.test(pc)) {
      showFlyer('Postcode looks invalid. Please check and try again.', 'error');
      return;
    }
    try {
      const payload = {
        phone: editForm.phone ?? '',
        address: editForm.address ?? '',
        postcode: pc,
        imageUrl: editForm.imageUrl ?? '',
        bankName: editForm.bankName ?? '',
        accountNumber: editForm.accountNumber ?? '',
        sortCode: editForm.sortCode ?? '',
      };
      if (
        payload.imageUrl &&
        payload.imageUrl.startsWith('data:image') &&
        payload.imageUrl.length > MAX_PROFILE_IMAGE_DATA_URL_LENGTH
      ) {
        showFlyer('Profile photo is too large. Upload a smaller image or use an image URL.', 'error');
        return;
      }
      await apiStaff.updateStaff(currentStaff.id, payload);
      setCurrentStaff({ ...currentStaff, ...payload } as Staff);
      setIsEditingProfile(false);
      setPostcodeLookup({ loading: false, note: null, error: null });
      showFlyer("Profile updated successfully!", 'success');
    } catch (error) {
      showFlyer(error instanceof Error ? error.message : 'Failed to update profile', 'error');
    }
  };

  const handlePasswordSave = async () => {
    if (!currentStaff) return;
    const { current, next, confirm } = passwordForm;
    if (!current || !next || !confirm) {
      showFlyer('Fill in every password field.', 'error');
      return;
    }
    if (next.length < 8) {
      showFlyer('New password must be at least 8 characters.', 'error');
      return;
    }
    if (next !== confirm) {
      showFlyer('New password and confirmation do not match.', 'error');
      return;
    }
    if (next === current) {
      showFlyer('New password must be different from current.', 'error');
      return;
    }
    setPasswordForm((p) => ({ ...p, saving: true }));
    try {
      await apiStaff.updateStaff(currentStaff.id, {
        currentPassword: current,
        password: next,
      });
      setPasswordForm({ current: '', next: '', confirm: '', saving: false });
      showFlyer('Password updated. Use the new one next time you sign in.', 'success');
    } catch (error) {
      setPasswordForm((p) => ({ ...p, saving: false }));
      showFlyer(error instanceof Error ? error.message : 'Failed to update password', 'error');
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-1 overflow-hidden bg-gradient-to-br from-[#eef9f2] via-[#f3f1ff] to-[#e9f6ff] selection:bg-emerald-100">
      {/* Desktop Sidebar Navigation */}
      <aside className="z-20 hidden h-full min-h-0 w-72 shrink-0 border-r border-[#dff0e5] bg-gradient-to-b from-white/90 to-emerald-50/60 shadow-[4px_0_24px_-12px_rgba(0,0,0,0.05)] backdrop-blur-xl md:flex md:min-h-0 md:flex-col">
        <div className="p-6 pb-4 border-b border-slate-50 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full overflow-hidden bg-gradient-to-tr from-primary to-indigo-600 shadow-lg shadow-primary/30 mb-3 flex items-center justify-center">
            {currentStaff?.imageUrl ? (
              <img src={currentStaff.imageUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-black text-primary-foreground">{displayInitial}</span>
            )}
          </div>
          <h2 className="text-lg font-black text-slate-900 leading-tight text-center">{displayName}</h2>
          <p className="text-primary font-bold uppercase tracking-widest text-[9px] mt-1">{currentStaff?.role || 'Staff Member'}</p>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto py-4 px-4 no-scrollbar">
          <SideNavBtn active={activeTab === 'schedule'} activeClass={TAB_ACCENT.schedule.sideActive} onClick={() => setActiveTab('schedule')} label="My Schedule" icon={<Calendar className="w-5 h-5" />} />
          <SideNavBtn active={activeTab === 'availability'} activeClass={TAB_ACCENT.availability.sideActive} onClick={() => setActiveTab('availability')} label="My Rota" icon={<CheckSquare className="w-5 h-5" />} />
          <SideNavBtn
            active={activeTab === 'messages'}
            activeClass={TAB_ACCENT.messages.sideActive}
            onClick={() => openInbox('alerts')}
            label="Inbox"
            icon={<MessageSquare className="w-5 h-5" />}
            badge={staffAlerts.length}
          />
          <SideNavBtn active={activeTab === 'late'} activeClass={TAB_ACCENT.late.sideActive} onClick={() => setActiveTab('late')} label="Running Late" icon={<AlarmClock className="w-5 h-5" />} />
          <SideNavBtn active={activeTab === 'invoice'} activeClass={TAB_ACCENT.invoice.sideActive} onClick={() => setActiveTab('invoice')} label="Earnings" icon={<FileText className="w-5 h-5" />} />
          <SideNavBtn active={activeTab === 'referrals'} activeClass={TAB_ACCENT.referrals.sideActive} onClick={() => setActiveTab('referrals')} label="Referrals" icon={<Gift className="w-5 h-5" />} />
          <SideNavBtn active={activeTab === 'profile'} activeClass={TAB_ACCENT.profile.sideActive} onClick={() => setActiveTab('profile')} label="Profile" icon={<User className="w-5 h-5" />} />
          <SideNavBtn active={activeTab === 'reviews'} activeClass={TAB_ACCENT.reviews.sideActive} onClick={() => setActiveTab('reviews')} label="My Reviews" icon={<Star className="w-5 h-5" />} />
        </div>

        <div className="p-4 border-t border-slate-50">
          <button onClick={onLogout} className="w-full py-4 text-slate-400 bg-slate-50 border border-slate-100/50 hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all rounded-[1.5rem] font-black uppercase text-[10px] tracking-widest flex items-center justify-center space-x-2">
            <LogOut className="w-4 h-4" /> <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="relative z-10 min-h-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        {!selectedJob && (
          <div className="max-w-5xl mx-auto pt-10 md:pt-16 pb-32 md:pb-24 px-6 md:px-12 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Mobile Header */}
            <div className="md:hidden mb-6">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-primary to-indigo-600 shadow-md flex items-center justify-center shrink-0 ring-2 ring-white">
                  {currentStaff?.imageUrl ? (
                    <img src={currentStaff.imageUrl} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-white">{displayInitial}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-slate-900 truncate">{greeting}, {displayName.split(' ')[0]}</h2>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs text-slate-500">{todayLabel}</span>
                    <span className="text-slate-300">&middot;</span>
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-xs font-medium text-emerald-600">On Duty</span>
                    </span>
                  </div>
                </div>
                <NotificationBell
                  fetchNotifications={() => apiStaff.getNotifications(Number(currentUser?.id))}
                  markRead={apiStaff.markNotificationRead}
                  deleteNotification={apiStaff.deleteNotification}
                  className="shrink-0"
                />
              </div>
            </div>

            <div className="hidden md:flex justify-end mb-6">
              <NotificationBell
                fetchNotifications={() => apiStaff.getNotifications(Number(currentUser?.id))}
                markRead={apiStaff.markNotificationRead}
                deleteNotification={apiStaff.deleteNotification}
              />
            </div>

            {initialLoading ? (
              <div className="space-y-6 animate-pulse">
                <div className="h-8 w-48 bg-slate-200 rounded-xl" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="rounded-[2rem] border border-slate-100 bg-white p-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-slate-200" />
                        <div className="flex-1 space-y-2">
                          <div className="h-4 w-32 bg-slate-200 rounded" />
                          <div className="h-3 w-20 bg-slate-100 rounded" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="h-3 w-full bg-slate-100 rounded" />
                        <div className="h-3 w-3/4 bg-slate-100 rounded" />
                      </div>
                      <div className="flex gap-2">
                        <div className="h-8 w-20 bg-slate-100 rounded-xl" />
                        <div className="h-8 w-20 bg-slate-100 rounded-xl" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
            <div className="space-y-4">
              {activeTab === 'schedule' && (
                <div className="space-y-12 animate-in slide-in-from-right duration-300">
                  <div className="md:hidden space-y-6">
                    {activeClockedJob && clockInData ? (
                      <div className="rounded-[1.5rem] border border-emerald-300 bg-gradient-to-br from-emerald-50 to-teal-50 p-4 shadow-[0_10px_30px_-14px_rgba(16,185,129,0.55)]">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Active Job</p>
                            <p className="text-base font-black text-slate-900">{activeClockedJob.contact?.name || 'Client'}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Booking #{activeClockedJob.id}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedJob(activeClockedJob);
                              setJobStage('work');
                            }}
                            className="rounded-xl bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white shadow-sm"
                          >
                            Open Active Job
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-xl border border-emerald-200 bg-white/80 p-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Clocked In</p>
                            <p className="font-mono text-sm font-black text-emerald-700">{clockInData.time}</p>
                          </div>
                          <div className="rounded-xl border border-emerald-200 bg-white/80 p-2">
                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Elapsed</p>
                            <p className="font-mono text-sm font-black text-emerald-700">{elapsedClockLabel}</p>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {mobileScheduleView === 'map' ? (
                      <>
                        <div className="px-2 flex items-center justify-between gap-3">
                          <button type="button" onClick={() => setMobileScheduleView('list')} className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary">
                            <ChevronLeft className="h-4 w-4" /> List
                          </button>
                          <h3 className="text-lg font-black text-slate-900">Jobs Map</h3>
                        </div>
                        <React.Suspense fallback={<div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
                          <StaffJobsMap bookings={jobs} onSelectBooking={(b) => openJobDetails(b)} />
                        </React.Suspense>
                      </>
                    ) : mobileScheduleView === 'list' ? (
                      <>
                        <div className="px-2 flex items-center justify-between">
                          <h3 className="text-xl font-black text-slate-900">Schedule</h3>
                          <div className="flex items-center gap-2">
                            <button type="button" onClick={() => setMobileScheduleView('map')} className="p-2 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors" title="View on map">
                              <MapIcon className="w-4 h-4" />
                            </button>
                            <span className="text-[10px] bg-primary/15 text-primary px-3 py-1 rounded-full uppercase tracking-widest">
                              {mobileScheduleDailyRows.length} {mobileScheduleDailyRows.length === 1 ? 'day' : 'days'}
                            </span>
                          </div>
                        </div>
                        {mobileScheduleDailyRows.length > 0 ? (
                          <div className="space-y-5">
                            {mobileScheduleSections.map((section) => (
                              <section key={section.label} className="space-y-2.5">
                                <div className="px-2 py-1 bg-slate-200/70 text-slate-900 rounded-lg">
                                  <p className="text-xs font-black uppercase tracking-wider">{section.label}</p>
                                </div>
                                <ol className="space-y-2.5 list-none p-0 m-0">
                                  {section.rows.map((row) => (
                                    <li key={row.date}>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedRotaDate(row.date);
                                          setMobileScheduleView('day');
                                        }}
                                        className="w-full rounded-[1.15rem] bg-emerald-50/85 px-2 py-3 text-left transition-colors hover:bg-emerald-100"
                                      >
                                        <div className="flex items-start justify-between gap-2">
                                          <p className={`text-[1.65rem] font-black leading-none ${row.date === calendarToday ? 'text-primary' : 'text-slate-900'}`}>
                                            {row.date === calendarToday ? 'Today' : formatMobileDateRowTitle(row.date)}
                                          </p>
                                          <div className="h-8 w-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                                            <ChevronRight className="h-4 w-4" />
                                          </div>
                                        </div>
                                        <div className="mt-2 flex items-center justify-end gap-1.5">
                                          <span className="rounded-full bg-[#1e2a8a] px-2.5 py-0.5 text-[11px] font-black text-white tabular-nums">
                                            {row.jobs.length}
                                          </span>
                                          <span className="rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-black text-white tabular-nums">
                                            {formatBookedHoursLabel(row.totalHours)}hrs
                                          </span>
                                        </div>
                                      </button>
                                    </li>
                                  ))}
                                </ol>
                              </section>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-10 bg-emerald-50 rounded-[2.5rem] border border-emerald-200 shadow-sm text-slate-400">
                            <Calendar className="w-12 h-12 mx-auto mb-2 opacity-30" />
                            <p className="font-bold text-sm text-slate-900">No upcoming jobs scheduled yet.</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-3 px-2">
                          <button
                            type="button"
                            onClick={() => setMobileScheduleView('list')}
                            className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary"
                          >
                            <ChevronLeft className="h-4 w-4" />
                            Back
                          </button>
                          <div className="text-right">
                            <p className="text-lg font-black text-slate-900">
                              {selectedRotaDate === calendarToday ? 'Today' : formatScheduleCardDate(selectedRotaDate)}
                            </p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                              {selectedDateJobs.length} job{selectedDateJobs.length === 1 ? '' : 's'} · by start time
                            </p>
                          </div>
                        </div>
                        {selectedDateJobs.length > 0 ? (
                          <ol className="m-0 list-none space-y-4 p-0">
                            {selectedDateJobs.map((job) => (
                              <li key={job.id}>
                                <JobCard
                                  job={job}
                                  onClick={() => openJobDetails(job)}
                                  timeOrdered
                                  currentStaffId={currentStaff?.id}
                                  staffDirectory={staffDirectory}
                                  serviceCatalog={serviceCatalog}
                                  extraServices={extraServices}
                                />
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <div className="text-center py-12 bg-emerald-50 rounded-[2.5rem] border border-emerald-200 shadow-sm text-slate-400">
                            <Calendar className="w-14 h-14 mx-auto mb-3 opacity-20 text-slate-900" />
                            <p className="font-black text-slate-900 text-lg">Not working</p>
                            <p className="font-bold text-sm mt-1">No jobs assigned for this date.</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="hidden md:block space-y-6">
                    {activeClockedJob && clockInData ? (
                      <div className="rounded-[2rem] border border-emerald-300 bg-gradient-to-r from-emerald-50 to-teal-50 p-5 shadow-[0_14px_40px_-20px_rgba(16,185,129,0.5)]">
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Active Job In Progress</p>
                            <p className="text-xl font-black text-slate-900 mt-1">{activeClockedJob.contact?.name || 'Client'} <span className="text-sm text-slate-500">#{activeClockedJob.id}</span></p>
                            <p className="text-[11px] font-bold text-slate-600 mt-1">
                              {activeClockedJob.date} @ {activeClockedJob.time}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="rounded-2xl bg-white/90 border border-emerald-200 px-4 py-3 text-right min-w-[10rem]">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Clocked In</p>
                              <p className="font-mono text-base font-black text-emerald-700">{clockInData.time}</p>
                            </div>
                            <div className="rounded-2xl bg-white/90 border border-emerald-200 px-4 py-3 text-right min-w-[10rem]">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Elapsed</p>
                              <p className="font-mono text-base font-black text-emerald-700">{elapsedClockLabel}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedJob(activeClockedJob);
                                setJobStage('work');
                              }}
                              className="rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-widest text-white shadow-md shadow-emerald-300/60 hover:opacity-95"
                            >
                              Open Active Job
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    {/* Dashboard Metrics */}
                    <div className="grid grid-cols-3 gap-4 mb-8">
                      <div className="bg-white p-5 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col items-center justify-center text-center hover:-translate-y-1 transition-transform">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Jobs Done</div>
                        <div className="text-3xl font-black text-slate-800 bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-primary">
                          {jobs.filter(j => j.status === BookingStatus.COMPLETED).length}
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col items-center justify-center text-center hover:-translate-y-1 transition-transform min-h-[140px]">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Client ratings</div>
                        <div className="text-3xl font-black text-slate-800 bg-clip-text text-transparent bg-gradient-to-r from-indigo-700 to-primary flex items-center">
                          {clientRatingStats.avg != null ? clientRatingStats.avg.toFixed(1) : '-'}
                        </div>
                        <div className="text-[10px] font-bold text-slate-500 mt-1">
                          {clientRatingStats.n === 0 ? 'No reviews yet' : `${clientRatingStats.n} review${clientRatingStats.n === 1 ? '' : 's'}`}
                        </div>
                        <div className="flex flex-wrap justify-center gap-x-2 gap-y-0.5 mt-3 text-[9px] font-black text-slate-400">
                          {[5, 4, 3, 2, 1].map((s) => (
                            <span key={s}>{s}★:{clientRatingStats.counts[s]}</span>
                          ))}
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-[2rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] flex flex-col items-center justify-center text-center hover:-translate-y-1 transition-transform">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Reliability</div>
                        <div className="text-3xl font-black text-emerald-600">
                          {(() => {
                            const completedCount = jobs.filter(j => j.status === BookingStatus.COMPLETED).length;
                            const totalFinished = jobs.filter(j => j.status === BookingStatus.COMPLETED || j.status === BookingStatus.CANCELLED).length;
                            if (totalFinished === 0) return '100%';
                            return Math.round((completedCount / totalFinished) * 100) + '%';
                          })()}
                        </div>
                      </div>
                    </div>

                    <h3 className="text-xl font-black text-slate-900 px-2 flex justify-between items-center">
                      <span>Today's Jobs</span>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setDesktopMapVisible(v => !v)} className={`p-2 rounded-xl transition-colors ${desktopMapVisible ? 'bg-primary text-white shadow-md' : 'bg-primary/10 text-primary hover:bg-primary/20'}`} title={desktopMapVisible ? 'Hide map' : 'Show jobs on map'}>
                          <MapIcon className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] bg-primary/15 text-primary px-3 py-1 rounded-full uppercase tracking-widest">
                          {todaysJobs.length} {todaysJobs.length === 1 ? 'job' : 'jobs'} · by start time
                        </span>
                      </div>
                    </h3>

                    {desktopMapVisible && (
                      <React.Suspense fallback={<div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
                        <StaffJobsMap bookings={todaysJobs} onSelectBooking={(b) => openJobDetails(b)} />
                      </React.Suspense>
                    )}

                    {todaysJobs.length > 0 ? (
                      <ol className="space-y-4 list-none p-0 m-0">
                        {todaysJobs.map((job) => (
                          <li key={job.id}>
                            <JobCard
                              job={job}
                              onClick={() => openJobDetails(job)}
                              timeOrdered
                              currentStaffId={currentStaff?.id}
                              staffDirectory={staffDirectory}
                              serviceCatalog={serviceCatalog}
                              extraServices={extraServices}
                            />
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="text-center py-10 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm text-slate-400">
                        <CheckSquare className="w-12 h-12 mx-auto mb-2 opacity-30" />
                        <p className="font-bold text-sm text-slate-900">No jobs scheduled for today.</p>
                      </div>
                    )}
                  </div>

                  <div className="hidden md:block space-y-6">
                    <div className="flex justify-between items-center px-2">
                      <h3 className="text-xl font-black text-slate-900">Upcoming Schedule</h3>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{upcomingJobs.length} Jobs</span>
                    </div>
                    {upcomingJobs.length > 0 ? (
                      <ol className="space-y-4 list-none p-0 m-0">
                        {upcomingJobs.map((job) => (
                          <li key={job.id}>
                            <JobCard
                              job={job}
                              onClick={() => openJobDetails(job)}
                              timeOrdered
                              currentStaffId={currentStaff?.id}
                              staffDirectory={staffDirectory}
                              serviceCatalog={serviceCatalog}
                              extraServices={extraServices}
                            />
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <div className="text-center py-10 bg-slate-50 rounded-[2.5rem] border border-slate-100 text-slate-400">
                        <Calendar className="w-16 h-16 mx-auto mb-4 opacity-20 text-slate-900" />
                        <p className="font-black text-slate-900 text-lg">Your future looks clear!</p>
                        <p className="font-bold text-sm mt-1">No upcoming jobs scheduled yet.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'availability' && (
                <div className="space-y-6 animate-in slide-in-from-right duration-300">
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start px-2">
                    <div>
                      <h3 className="text-xl font-black text-slate-900">My Rota</h3>
                      <p className="text-xs font-bold text-slate-500 mt-1">
                        {rotaDayLabel}
                        {selectedDateJobs.length > 0
                          ? ` · ${selectedDateJobs.length} job${selectedDateJobs.length === 1 ? '' : 's'} this date (by start time)`
                          : ' · pick any date to see past and upcoming assignments'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRotaDate((d) => shiftCalendarDay(d, -1))}
                        className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
                      >
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRotaDate(getTodayYYYYMMDD())}
                        className="px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-xs font-black uppercase tracking-widest text-primary hover:bg-primary/15"
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRotaDate((d) => shiftCalendarDay(d, 1))}
                        className="px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
                      >
                        Next
                      </button>
                      <input
                        type="date"
                        value={selectedRotaDate}
                        onChange={(e) => setSelectedRotaDate(e.target.value)}
                        className="text-sm font-bold bg-card text-foreground px-4 py-2 border-2 border-input rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                      />
                    </div>
                  </div>

                  {selectedDateJobs.length > 0 ? (
                    <ol className="m-0 list-none space-y-4 p-0">
                      {selectedDateJobs.map((job) => (
                        <li key={job.id}>
                          <JobCard
                            job={job}
                            onClick={() => openJobDetails(job)}
                            timeOrdered
                            rotaNotes
                            currentStaffId={currentStaff?.id}
                            staffDirectory={staffDirectory}
                            serviceCatalog={serviceCatalog}
                            extraServices={extraServices}
                          />
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <div className="text-center py-16 bg-white rounded-[2.5rem] border border-slate-100 shadow-sm text-slate-400">
                      <Calendar className="w-16 h-16 mx-auto mb-4 opacity-20 text-slate-900" />
                      <p className="font-black text-slate-900 text-lg">No Jobs Found</p>
                      <p className="font-bold text-sm mt-1">You have no assignments on {selectedRotaDate}.</p>
                    </div>
                  )}

                  <div className="bg-white p-5 sm:p-8 rounded-[2.5rem] shadow-[0_8px_30px_rgb(0,0,0,0.04)] mt-8">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-xl font-black text-slate-900">Weekly Availability</h3>
                      {!isEditingAvailability ? (
                        <button onClick={() => setIsEditingAvailability(true)} className="text-xs font-black text-primary bg-primary/12 px-3 py-1.5 rounded-xl uppercase tracking-widest hover:bg-primary/18 transition-colors">Edit</button>
                      ) : (
                        <button onClick={handleTimeOffRequest} className="text-xs font-black text-primary-foreground bg-primary px-3 py-1.5 rounded-xl uppercase tracking-widest hover:opacity-90 shadow-md shadow-primary/25 transition-all">Save Changes</button>
                      )}
                    </div>
                    <div className="space-y-3">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                        <div key={day} className="flex justify-between items-center p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                          <div className="flex items-center space-x-3 w-1/3">
                            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-black text-slate-400 text-xs shadow-sm">{day.charAt(0)}</div>
                            <span className="font-bold text-slate-700 text-sm">{day}</span>
                          </div>

                          {!isEditingAvailability ? (
                            <div className="flex items-center justify-end w-2/3">
                              {availabilityForm[day]?.active ? (
                                <span className="text-[10px] font-black text-green-600 bg-green-100 px-3 py-1.5 rounded-lg uppercase tracking-wide">{availabilityForm[day].start} - {availabilityForm[day].end}</span>
                              ) : (
                                <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-3 py-1.5 rounded-lg uppercase tracking-wide">Off Duty</span>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center justify-end space-x-2 w-2/3">
                              <label className="relative inline-flex items-center cursor-pointer mr-2">
                                <input type="checkbox" className="sr-only peer" checked={availabilityForm[day]?.active} onChange={(e) => setAvailabilityForm({ ...availabilityForm, [day]: { ...availabilityForm[day], active: e.target.checked } })} />
                                <div className="w-9 h-5 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
                              </label>

                              {availabilityForm[day]?.active && (
                                <>
                                  <input type="time" value={availabilityForm[day].start} onChange={(e) => setAvailabilityForm({ ...availabilityForm, [day]: { ...availabilityForm[day], start: e.target.value } })} className="text-xs font-bold bg-white text-slate-900 px-2 py-1 border border-slate-200 rounded-lg focus:outline-none" />
                                  <span className="text-slate-400 font-bold text-xs">-</span>
                                  <input type="time" value={availabilityForm[day].end} onChange={(e) => setAvailabilityForm({ ...availabilityForm, [day]: { ...availabilityForm[day], end: e.target.value } })} className="text-xs font-bold bg-white text-slate-900 px-2 py-1 border border-slate-200 rounded-lg focus:outline-none" />
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'invoice' && (
                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
                  <div className="bg-emerald-600 text-white p-5 sm:p-8 rounded-[2.5rem] shadow-xl shadow-emerald-200">
                    <p className="text-emerald-100 text-xs font-black uppercase tracking-widest mb-1">This week (Mon–Sun)</p>
                    <p className="text-emerald-100/90 text-[10px] font-bold uppercase tracking-widest mb-3">{invoiceData.weekStart} → {invoiceData.weekEnd}</p>
                    <h2 className="text-4xl font-black">£{Number(invoiceData.weekTotalShare || 0).toFixed(2)}</h2>
                    <p className="text-emerald-100 text-sm mt-2 font-medium">
                      {invoiceData.weekJobCount} job{invoiceData.weekJobCount === 1 ? '' : 's'} · {Number(invoiceData.weekTotalYourHours || 0).toFixed(2)} your hrs (booked time ÷ team size)
                    </p>

                    <button
                      onClick={handleSendInvoice}
                      disabled={invoiceData.weekJobs.length === 0}
                      className="mt-6 w-full py-4 bg-white text-emerald-600 rounded-2xl font-black hover:bg-emerald-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                    >
                      <Send className="w-4 h-4" /> <span>Submit Weekly Invoice</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="bg-slate-900 text-white p-6 rounded-[2rem] shadow-lg">
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">This month (completed)</p>
                      <p className="text-3xl font-black tabular-nums">£{Number(invoiceData.monthShare || 0).toFixed(2)}</p>
                      <p className="text-slate-500 text-xs font-medium mt-2">{invoiceData.monthJobs.length} job{invoiceData.monthJobs.length === 1 ? '' : 's'} in {new Date().toLocaleString('default', { month: 'long' })}</p>
                    </div>
                    <div className="bg-white border border-slate-100 p-6 rounded-[2rem] shadow-sm flex flex-col justify-center">
                      <p className="text-slate-400 text-[10px] font-black uppercase tracking-widest mb-1">All-time earnings (hourly)</p>
                      <p className="text-2xl font-black text-slate-900 tabular-nums">£{Number(invoiceData.totalShare || 0).toFixed(2)}</p>
                      <p className="text-slate-500 text-xs font-medium mt-2">From {invoiceData.jobs.length} completed job{invoiceData.jobs.length === 1 ? '' : 's'} on record</p>
                    </div>
                  </div>

                  <div className="bg-white rounded-[2.5rem] p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
                      <h3 className="text-xl font-black text-slate-900">This week&apos;s jobs (invoice)</h3>
                      <div className="text-xs font-black uppercase tracking-widest text-slate-400">
                        {invoiceData.weekJobCount} jobs · {Number(invoiceData.weekTotalYourHours || 0).toFixed(2)} your hrs
                      </div>
                    </div>
                    {invoiceData.weekJobs.length === 0 ? (
                      <p className="text-slate-400 text-sm font-bold text-center py-8">
                        No completed jobs in this calendar week ({invoiceData.weekStart} – {invoiceData.weekEnd}).
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {invoiceData.weekJobs.map((job: any) => (
                          <div key={job.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <div className="font-black text-slate-900">{job.customer}</div>
                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{job.date} • ID: {job.id}</div>
                              </div>
                              <div className="text-right">
                                <div className="text-emerald-600 font-black">£{Number(job.yourShare || 0).toFixed(2)}</div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-0.5">your pay</div>
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 items-center text-xs font-bold text-slate-500 mt-2 pt-2 border-t border-slate-200">
                              <span className={job.staffCount > 1 ? 'text-primary' : ''}>
                                {job.staffCount > 1 ? `Team job - ${job.staffCount} staff` : 'Solo job'}
                              </span>
                              <span>Booked: {Number(job.bookedHours || 0).toFixed(2)}h</span>
                              <span>Your hours: {Number(job.yourHours || 0).toFixed(2)}h</span>
                              <span>£{Number(job.hourlyRate || 0).toFixed(2)}/hr</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-[2.5rem] p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <div className="flex items-center justify-between gap-2 mb-6">
                      <h3 className="text-xl font-black text-slate-900">Submitted invoices</h3>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Includes admin decision notes
                      </p>
                    </div>
                    {submittedInvoices.length === 0 ? (
                      <p className="text-slate-400 text-sm font-bold text-center py-8">No submitted invoices yet.</p>
                    ) : (
                      <div className="space-y-4">
                        {submittedInvoices.map((inv) => (
                          <div key={inv.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-black text-slate-900">{inv.weekLabel || 'Current week'}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">
                                  #{inv.id} · {inv.weekJobCount} jobs · {Number(inv.weekTotalHours || 0).toFixed(2)}h
                                </p>
                              </div>
                              <div className="text-right">
                                <p className="font-black text-slate-900">£{Number(inv.totalAmount || 0).toFixed(2)}</p>
                                <span className={`inline-block mt-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${inv.status === 'Approved'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : inv.status === 'Rejected'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-700'
                                  }`}>
                                  {inv.status || 'Pending'}
                                </span>
                              </div>
                            </div>
                            <div className="mt-3 flex justify-end">
                              <button
                                type="button"
                                onClick={() => setExpandedSubmittedInvoiceId((prev) => (prev === inv.id ? null : inv.id))}
                                className="rounded-xl bg-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 hover:bg-slate-300"
                              >
                                {expandedSubmittedInvoiceId === inv.id ? 'Hide invoice' : 'View invoice'}
                              </button>
                            </div>
                            <div className="mt-3 p-3 rounded-xl bg-white border border-slate-100">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Admin note</p>
                              <p className="text-sm font-medium text-slate-700">
                                {inv.adminNotes && String(inv.adminNotes).trim()
                                  ? inv.adminNotes
                                  : 'No admin note yet.'}
                              </p>
                            </div>
                            {expandedSubmittedInvoiceId === inv.id && (
                              <div className="mt-4 border-t border-slate-200 pt-4">
                                <StaffInvoiceDocument
                                  invoiceId={inv.id}
                                  weekLabel={inv.weekLabel}
                                  weekStart={inv.weekStart}
                                  weekEnd={inv.weekEnd}
                                  createdAt={inv.createdAt}
                                  status={inv.status}
                                  adminNotes={inv.adminNotes}
                                  totalAmount={Number(inv.totalAmount || 0)}
                                  weekTotalHours={Number(inv.weekTotalHours || 0)}
                                  weekJobCount={Number(inv.weekJobCount || 0)}
                                  jobs={(Array.isArray(inv.jobs) ? inv.jobs : []) as any[]}
                                  bankDetails={
                                    (inv.bankDetails as { bankName?: string; accountNumber?: string; sortCode?: string } | undefined) ||
                                    {
                                      bankName: currentStaff?.bankName || '',
                                      accountNumber: currentStaff?.accountNumber || '',
                                      sortCode: currentStaff?.sortCode || '',
                                    }
                                  }
                                  staff={{
                                    name: currentStaff?.name || inv.staffName || displayName,
                                    email: currentStaff?.email || currentUser?.email || '',
                                    phone: (currentStaff as any)?.phone || '',
                                    address: (currentStaff as any)?.address || '',
                                    postcode: (currentStaff as any)?.postcode || '',
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'referrals' && (
                <div className="space-y-8 animate-in fade-in duration-500">
                  <div className="bg-purple-600 text-white p-5 sm:p-8 rounded-[2.5rem] shadow-xl shadow-purple-200">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-purple-100 text-xs font-black uppercase tracking-widest mb-1">Total Referral Earnings</p>
                        <h2 className="text-4xl font-black">£{referrals.reduce((sum, r) => sum + Number(r.rewardAmount || 0), 0).toFixed(2)}</h2>
                        <p className="text-purple-100 text-[10px] font-bold mt-2 uppercase tracking-widest leading-relaxed max-w-xs">
                          Refer friends and clients using your code and earn bonuses when they book their first clean!
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] font-black uppercase tracking-widest text-purple-200 mb-2 mt-1">Your Code</p>
                        <div className="px-4 py-2 bg-white text-purple-600 rounded-xl font-black inline-block text-sm cursor-pointer hover:bg-slate-50 transition-colors shadow-sm" onClick={() => { navigator.clipboard.writeText(currentUser?.referralCode || 'N/A'); showFlyer('Referral code copied!', 'success'); }}>
                          {currentUser?.referralCode || 'N/A'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white rounded-[2.5rem] p-5 sm:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                    <h3 className="text-xl font-black text-slate-900 mb-6 tracking-tight">Referral History</h3>
                    <div className="space-y-4">
                      {referrals.length === 0 && (
                        <div className="py-12 text-center text-slate-400">
                          <Gift className="w-16 h-16 mx-auto mb-4 opacity-20" />
                          <p className="font-bold text-sm">You haven't referred anyone yet.</p>
                        </div>
                      )}
                      {referrals.map((r) => (
                        <div key={r.id} className="p-5 rounded-3xl bg-slate-50 border border-slate-100 flex items-center justify-between">
                          <div>
                            <p className="font-black text-slate-900 leading-tight">{r.referredClientName}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              {new Date(r.dateReferred).toLocaleDateString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className={`font-black tracking-tight text-lg mb-0.5 ${r.status !== 'Paid Out' ? 'text-slate-900' : 'text-green-600'}`}>£{Number(r.rewardAmount || 0).toFixed(2)}</p>
                            <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${r.status === 'Paid Out' ? 'bg-green-100 text-green-700' :
                              r.status === 'Completed' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                              }`}>
                              {r.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'profile' && (
                <div className="space-y-6 animate-in slide-in-from-right duration-300">
                  <div className="bg-white p-5 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative">
                    {!isEditingProfile ? (
                      <div className="text-center">
                        <button onClick={() => { setEditForm(currentStaff || {}); setIsEditingProfile(true); }} className="absolute top-6 right-6 p-2 bg-muted text-slate-400 hover:text-primary rounded-xl transition-colors">
                          <Settings className="w-5 h-5" />
                        </button>
                        <div className="w-24 h-24 bg-slate-100 bg-cover bg-center rounded-[2rem] mx-auto flex items-center justify-center text-3xl font-black text-slate-300 mb-6 overflow-hidden" style={currentStaff?.imageUrl ? { backgroundImage: `url(${currentStaff.imageUrl})` } : {}}>
                          {!currentStaff?.imageUrl && displayInitial}
                        </div>
                        <h3 className="text-2xl font-black text-slate-900">{displayName}</h3>
                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mt-1">{currentStaff?.role || 'Staff Member'}</p>

                        <div className="mt-8 flex flex-wrap gap-2 justify-center">
                          {(currentStaff?.skills as string[] || ['General Cleaning', 'Deep Clean']).map(s => (
                            <span key={s} className="px-4 py-2 bg-[#f4f2fc] text-blue-700 rounded-xl text-[10px] font-black uppercase tracking-widest">{s}</span>
                          ))}
                        </div>

                        <div className="mt-8 text-left space-y-4">
                          <DetailRow label="Phone" value={currentStaff?.phone || 'Not provided'} icon={<Phone className="w-4 h-4" />} />
                          <DetailRow label="Postcode" value={currentStaff?.postcode || 'Not provided'} icon={<MapPin className="w-4 h-4" />} />
                          <DetailRow label="Address" value={currentStaff?.address || 'Not provided'} icon={<MapPin className="w-4 h-4" />} />
                          <h4 className="font-black text-slate-900 mt-6 mb-2 border-b border-slate-100 pb-2">Bank Details</h4>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Bank</span>
                              <div className="font-bold text-sm text-slate-800">{currentStaff?.bankName || 'Not Set'}</div>
                            </div>
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Acc Num</span>
                              <div className="font-bold text-sm text-slate-800">{currentStaff?.accountNumber ? '****' + String(currentStaff.accountNumber).slice(-4) : 'Not Set'}</div>
                            </div>
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sort Code</span>
                              <div className="font-bold text-sm text-slate-800">{currentStaff?.sortCode || 'Not Set'}</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                          <h3 className="text-xl font-black text-slate-900">Edit Profile</h3>
                          <button onClick={() => setIsEditingProfile(false)} className="p-2 bg-slate-50 text-slate-400 hover:text-red-500 rounded-xl transition-colors">
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        <div>
                          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 block">Upload Profile Photo (Optional)</label>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const dataUrl = await toOptimizedProfileImageDataUrl(file);
                                if (dataUrl.length > MAX_PROFILE_IMAGE_DATA_URL_LENGTH) {
                                  showFlyer('Image is too large. Please choose a smaller photo.', 'error');
                                  return;
                                }
                                setEditForm({ ...editForm, imageUrl: dataUrl });
                                showFlyer('Profile photo selected.', 'success');
                              } catch {
                                showFlyer('Failed to load profile photo.', 'error');
                              } finally {
                                e.currentTarget.value = '';
                              }
                            }}
                            className="w-full p-3 bg-card rounded-2xl font-medium text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25"
                          />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 block">Profile Photo URL</label>
                          <input type="text" className="w-full p-4 bg-card rounded-2xl font-medium text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25" value={editForm.imageUrl || ''} onChange={e => setEditForm({ ...editForm, imageUrl: e.target.value })} placeholder="https://..." />
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-2">Use file upload or paste URL</p>
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 block">Phone Number</label>
                          <input type="text" className="w-full p-4 bg-card rounded-2xl font-medium text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25" value={editForm.phone || ''} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} />
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 block">Postcode</label>
                          <div className="flex items-stretch gap-2">
                            <input
                              type="text"
                              className="flex-1 min-w-0 p-4 bg-card rounded-2xl font-semibold uppercase tracking-wider text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25"
                              value={editForm.postcode || ''}
                              onChange={(e) => {
                                setEditForm({ ...editForm, postcode: e.target.value.toUpperCase() });
                                if (postcodeLookup.note || postcodeLookup.error) {
                                  setPostcodeLookup({ loading: false, note: null, error: null });
                                }
                              }}
                              placeholder="e.g. SW1A 1AA"
                              maxLength={10}
                              autoComplete="postal-code"
                            />
                            <button
                              type="button"
                              onClick={handleLookupPostcode}
                              disabled={postcodeLookup.loading}
                              className="px-4 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                            >
                              {postcodeLookup.loading ? '…' : 'Verify'}
                            </button>
                          </div>
                          {postcodeLookup.note && (
                            <p className="text-[11px] font-bold text-emerald-600 mt-2">{postcodeLookup.note}</p>
                          )}
                          {postcodeLookup.error && (
                            <p className="text-[11px] font-bold text-red-500 mt-2">{postcodeLookup.error}</p>
                          )}
                          <p className="text-[11px] text-slate-400 font-semibold mt-1.5">We verify the postcode with Royal Mail's public lookup. Enter the full address below.</p>
                        </div>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 block">Home Address</label>
                          <input type="text" className="w-full p-4 bg-card rounded-2xl font-medium text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25" value={editForm.address || ''} onChange={e => setEditForm({ ...editForm, address: e.target.value })} placeholder="House name/number, street, city" autoComplete="street-address" />
                        </div>

                        <h4 className="font-black text-slate-900 mt-6 mb-2 border-b border-slate-100 pb-2">Banking Details</h4>
                        <div>
                          <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 block">Bank Name</label>
                          <input type="text" className="w-full p-4 bg-card rounded-2xl font-medium text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25" value={editForm.bankName || ''} onChange={e => setEditForm({ ...editForm, bankName: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 block">Account Number</label>
                            <input type="text" className="w-full p-4 bg-card rounded-2xl font-medium text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25" value={editForm.accountNumber || ''} onChange={e => setEditForm({ ...editForm, accountNumber: e.target.value })} />
                          </div>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 block">Sort Code</label>
                            <input type="text" className="w-full p-4 bg-card rounded-2xl font-medium text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25" value={editForm.sortCode || ''} onChange={e => setEditForm({ ...editForm, sortCode: e.target.value })} />
                          </div>
                        </div>

                        <button onClick={handleProfileSave} className="w-full mt-6 py-4 bg-primary text-primary-foreground rounded-2xl font-black shadow-xl shadow-primary/30 hover:opacity-90 transition-colors">
                          Save Changes
                        </button>
                      </div>
                    )}
                  </div>
                  {!isEditingProfile && (
                    <>
                      <div className="bg-white p-5 sm:p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                        <div className="flex items-start gap-3 mb-5">
                          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                            <Lock className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="text-lg font-black text-slate-900 leading-tight">Change password</h4>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Keep your account secure</p>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 block">Current password</label>
                            <input
                              type="password"
                              autoComplete="current-password"
                              className="w-full p-4 bg-card rounded-2xl font-medium text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25"
                              value={passwordForm.current}
                              onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                              placeholder="Enter your current password"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 block">New password</label>
                            <input
                              type="password"
                              autoComplete="new-password"
                              className="w-full p-4 bg-card rounded-2xl font-medium text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25"
                              value={passwordForm.next}
                              onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
                              placeholder="At least 8 characters"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-1 block">Confirm new password</label>
                            <input
                              type="password"
                              autoComplete="new-password"
                              className="w-full p-4 bg-card rounded-2xl font-medium text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25"
                              value={passwordForm.confirm}
                              onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                              placeholder="Repeat the new password"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handlePasswordSave}
                            disabled={passwordForm.saving}
                            className="w-full mt-2 py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl shadow-slate-900/20 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                          >
                            {passwordForm.saving ? 'Updating…' : 'Update password'}
                          </button>
                        </div>
                      </div>

                      <button onClick={onLogout} className="w-full py-4 bg-red-50 text-red-500 rounded-[2rem] font-black hover:bg-red-100 transition-colors">
                        Log Out
                      </button>
                    </>
                  )}
                </div>
              )}

              {activeTab === 'reviews' && (
                <ReviewsPanel role="staff" api={apiStaff as any} />
              )}

              {activeTab === 'late' && (
                <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm p-5 md:p-8 animate-in slide-in-from-right duration-300">
                  <RunningLatePanel
                    jobs={jobs}
                    staffName={displayName}
                    brandName={brandName}
                    onSent={() => void refreshMyJobs()}
                  />
                </div>
              )}

              {activeTab === 'messages' && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <InboxPill
                    active={inboxView === 'alerts'}
                    onClick={() => setInboxView('alerts')}
                    icon={<Bell className="w-4 h-4" />}
                    label="Alerts"
                    count={staffAlerts.length}
                    activeClass="bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-300/50"
                  />
                  <InboxPill
                    active={inboxView === 'chats'}
                    onClick={() => setInboxView('chats')}
                    icon={<MessageSquare className="w-4 h-4" />}
                    label="Chats"
                    count={openChatJobs.length}
                    activeClass="bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-300/50"
                  />
                  <InboxPill
                    active={inboxView === 'admin'}
                    onClick={() => { setInboxView('admin'); void loadAdminChat(); }}
                    icon={<Users className="w-4 h-4" />}
                    label="Admin"
                    count={adminChatMessages.filter(m => !m.isRead && m.senderRole === 'admin').length}
                    activeClass="bg-gradient-to-r from-teal-500 to-emerald-500 text-white shadow-lg shadow-teal-300/50"
                  />
                </div>
              )}

              {activeTab === 'messages' && inboxView === 'alerts' && (
                <div className="space-y-4">
                  <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Desktop alerts</p>
                      <p className="text-sm font-bold text-slate-700">Get browser notifications for new assignments (when supported).</p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        await requestNotificationPermission();
                        showFlyer('If your browser allowed it, notifications are enabled.', 'success');
                      }}
                      className="shrink-0 px-5 py-3 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-800 transition-colors"
                    >
                      Enable alerts
                    </button>
                  </div>
                  {staffAlerts.length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                      <Bell className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="font-bold text-sm">No new notifications.</p>
                    </div>
                  ) : (
                    staffAlerts.map(n => (
                      <div key={n.id} className={`p-6 rounded-3xl border ${n.priority === 'urgent' ? 'bg-red-50 border-red-100' : 'bg-white border-slate-100'} shadow-sm`}>
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-black text-slate-900">{n.title}</h4>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] bg-white px-2 py-1 rounded-lg border border-slate-100 font-bold uppercase">{n.timestamp}</span>
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await apiStaff.deleteNotification(Number(n.id));
                                  setStaffAlerts((prev) => prev.filter((x) => String(x.id) !== String(n.id)));
                                  showFlyer('Notification deleted.', 'success');
                                } catch (err) {
                                  showFlyer(err instanceof Error ? err.message : 'Failed to delete notification', 'error');
                                }
                              }}
                              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                              title="Delete notification"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <p className="text-slate-500 text-sm font-medium">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'messages' && inboxView === 'chats' && (
                <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-4 min-h-[500px]">
                  <div className="bg-gradient-to-b from-emerald-50/70 to-white rounded-3xl border border-emerald-100 p-4 space-y-3 overflow-y-auto">
                    <div className="md:hidden">
                      {mobileChatView === 'list' ? (
                        <div className="space-y-4">
                          {openChatJobs.length > 0 ? (
                            <div className="space-y-2">
                              <p className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Open chats</p>
                              {visibleOpenChatJobs.map((job) => (
                                <button
                                  key={job.id}
                                  onClick={() => {
                                    setActiveChatJobId(job.id);
                                    setMobileChatView('chat');
                                    void loadStaffChat(job.id);
                                  }}
                                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 ${activeChatJobId === job.id
                                    ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-[0_0_24px_rgba(16,185,129,0.45)] ring-2 ring-emerald-400/90'
                                    : 'bg-slate-50 border-slate-100 hover:border-emerald-300/60'
                                    }`}
                                >
                                  <div className="font-black text-sm text-slate-900">{job.contact?.name || 'Client'}</div>
                                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                    Booking #{job.id} • {job.date} @ {job.time}
                                  </div>
                                </button>
                              ))}
                              {openChatJobs.length > 4 && (
                                <button
                                  type="button"
                                  onClick={() => setShowAllOpenChats((prev) => !prev)}
                                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
                                >
                                  {showAllOpenChats ? 'Show less' : `Show more (${openChatJobs.length - 4})`}
                                </button>
                              )}
                            </div>
                          ) : (
                            <p className="text-sm font-bold text-slate-400 p-2">No open chats right now.</p>
                          )}
                          {closedChatHistoryJobs.length > 0 && (
                            <div className="space-y-2 pt-1">
                              <p className="px-1 text-[10px] font-black uppercase tracking-widest text-red-500">History (closed by admin)</p>
                              {closedChatHistoryJobs.map((job) => (
                                <button
                                  key={job.id}
                                  onClick={() => {
                                    setActiveChatJobId(job.id);
                                    setMobileChatView('chat');
                                    void loadStaffChat(job.id);
                                  }}
                                  className="w-full text-left p-4 rounded-2xl border border-red-200 bg-red-50 text-red-900"
                                >
                                  <div className="font-black text-sm">{job.contact?.name || 'Client'}</div>
                                  <div className="text-[10px] font-bold uppercase tracking-widest text-red-500">
                                    Booking #{job.id} • closed
                                  </div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-white rounded-3xl border border-slate-100 flex flex-col min-h-[420px]">
                          <div className="p-4 border-b border-slate-100">
                            <button
                              type="button"
                              onClick={() => setMobileChatView('list')}
                              className="mb-2 inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary"
                            >
                              <ChevronLeft className="h-4 w-4" />
                              Back
                            </button>
                            <p className="text-sm font-black text-slate-900">{activeChatJob?.contact?.name || 'Client'}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              Booking #{activeChatJob?.id || activeChatJobId || 'N/A'}
                            </p>
                            {!staffChatCanStart && <p className="mt-1 text-xs font-bold text-amber-600">Chat opens 10 minutes before start time.</p>}
                            {staffChatClosed && <p className="mt-1 text-xs font-bold text-red-600">Closed by admin (history).</p>}
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {staffChatMessages.map((m) => (
                              <div key={m.id} className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${m.senderRole === 'staff' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-900'}`}>
                                <div className="text-[10px] font-black uppercase opacity-70 mb-1">{m.senderName}</div>
                                {m.text}
                              </div>
                            ))}
                          </div>
                          <div className="p-4 border-t border-slate-100 flex gap-2">
                            <input
                              value={staffChatMessage}
                              onChange={(e) => setStaffChatMessage(e.target.value)}
                              disabled={staffChatClosed || !staffChatCanStart}
                              placeholder="Type message..."
                              className="flex-1 p-3 rounded-xl border border-slate-200"
                            />
                            <button
                              onClick={() => {
                                if (!activeChatJobId || !staffChatMessage.trim()) return;
                                void apiStaff.sendBookingChat(activeChatJobId, staffChatMessage).then(() => {
                                  setStaffChatMessage('');
                                  return loadStaffChat(activeChatJobId);
                                });
                              }}
                              disabled={staffChatClosed || !staffChatCanStart || !staffChatMessage.trim()}
                              className="px-4 py-3 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest disabled:opacity-50"
                            >
                              Send
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="hidden md:block space-y-3">
                      {openChatJobs.length > 0 && (
                        <div className="space-y-2">
                          <p className="px-1 text-[10px] font-black uppercase tracking-widest text-slate-400">Open chats</p>
                          {visibleOpenChatJobs.map((job) => (
                            <button
                              key={job.id}
                              onClick={() => {
                                setActiveChatJobId(job.id);
                                void loadStaffChat(job.id);
                              }}
                              className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 ${activeChatJobId === job.id
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-[0_0_24px_rgba(16,185,129,0.45)] ring-2 ring-emerald-400/90'
                                : 'bg-slate-50 border-slate-100 hover:border-emerald-300/60'
                                }`}
                            >
                              <div className="font-black text-sm text-slate-900">{job.contact?.name || 'Client'}</div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Booking #{job.id} • {job.date} @ {job.time}
                              </div>
                            </button>
                          ))}
                          {openChatJobs.length > 4 && (
                            <button
                              type="button"
                              onClick={() => setShowAllOpenChats((prev) => !prev)}
                              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
                            >
                              {showAllOpenChats ? 'Show less' : `Show more (${openChatJobs.length - 4})`}
                            </button>
                          )}
                        </div>
                      )}
                      {closedChatHistoryJobs.length > 0 && (
                        <div className="space-y-2 pt-1">
                          <p className="px-1 text-[10px] font-black uppercase tracking-widest text-red-500">History (closed by admin)</p>
                          {closedChatHistoryJobs.map((job) => (
                            <button
                              key={job.id}
                              onClick={() => {
                                setActiveChatJobId(job.id);
                                void loadStaffChat(job.id);
                              }}
                              className="w-full text-left p-4 rounded-2xl border border-red-200 bg-red-50 text-red-900"
                            >
                              <div className="font-black text-sm">{job.contact?.name || 'Client'}</div>
                              <div className="text-[10px] font-bold uppercase tracking-widest text-red-500">
                                Booking #{job.id} • closed
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {openChatJobs.length === 0 && closedChatHistoryJobs.length === 0 && (
                        <p className="text-sm font-bold text-slate-400 p-4">No chats available yet.</p>
                      )}
                    </div>
                  </div>
                  <div className="hidden md:flex bg-white rounded-3xl border border-slate-100 flex-col min-h-0">
                    {!activeChatJobId ? (
                      <div className="flex-1 flex items-center justify-center text-slate-400 font-bold">Select a booking chat</div>
                    ) : (
                      <>
                        <div className="p-4 border-b border-slate-100">
                          <p className="text-sm font-black text-slate-900">{activeChatJob?.contact?.name || 'Client'}</p>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                            Booking #{activeChatJob?.id || activeChatJobId}
                          </p>
                          {!staffChatCanStart && <p className="text-xs font-bold text-amber-600">Chat opens 10 minutes before start time.</p>}
                          {staffChatClosed && <p className="text-xs font-bold text-red-600">Chat closed by admin after job completion.</p>}
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                          {staffChatMessages.map((m) => (
                            <div key={m.id} className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${m.senderRole === 'staff' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-900'}`}>
                              <div className="text-[10px] font-black uppercase opacity-70 mb-1">{m.senderName}</div>
                              {m.text}
                            </div>
                          ))}
                        </div>
                        <div className="p-4 border-t border-slate-100 flex gap-2">
                          <input
                            value={staffChatMessage}
                            onChange={(e) => setStaffChatMessage(e.target.value)}
                            disabled={staffChatClosed || !staffChatCanStart}
                            placeholder="Type message..."
                            className="flex-1 p-3 rounded-xl border border-slate-200"
                          />
                          <button
                            onClick={() => {
                              if (!activeChatJobId || !staffChatMessage.trim()) return;
                              void apiStaff.sendBookingChat(activeChatJobId, staffChatMessage).then(() => {
                                setStaffChatMessage('');
                                return loadStaffChat(activeChatJobId);
                              });
                            }}
                            disabled={staffChatClosed || !staffChatCanStart || !staffChatMessage.trim()}
                            className="px-4 py-3 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase tracking-widest disabled:opacity-50"
                          >
                            Send
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'messages' && inboxView === 'admin' && (
                <div className="bg-white rounded-3xl border border-slate-100 flex flex-col min-h-[500px] max-h-[600px]">
                  <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">Admin Chat</p>
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Direct messages with management</p>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {adminChatLoading ? (
                      <div className="flex items-center justify-center py-10">
                        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : adminChatMessages.length === 0 ? (
                      <div className="text-center py-10 text-slate-400">
                        <MessageSquare className="w-10 h-10 mx-auto mb-2 opacity-40" />
                        <p className="font-bold text-sm">No messages yet</p>
                        <p className="text-xs">Send a message to admin below.</p>
                      </div>
                    ) : (
                      adminChatMessages.map((m) => (
                        <div key={m.id} className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${m.senderRole === 'staff' ? 'ml-auto bg-teal-600 text-white' : 'bg-slate-100 text-slate-900'}`}>
                          <div className="text-[10px] font-black uppercase opacity-70 mb-1">{m.senderName} {m.senderRole === 'admin' ? '(Admin)' : ''}</div>
                          <p className="whitespace-pre-wrap">{m.text}</p>
                          <div className="text-[9px] opacity-50 mt-1">
                            {m.createdAt ? new Date(m.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-4 border-t border-slate-100 flex gap-2">
                    <input
                      value={adminChatInput}
                      onChange={(e) => setAdminChatInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendAdminChat(); } }}
                      placeholder="Message admin..."
                      className="flex-1 p-3 rounded-xl border border-slate-200 text-sm font-medium focus:border-teal-400 focus:ring-2 focus:ring-teal-200/60 outline-none"
                    />
                    <button
                      onClick={() => void sendAdminChat()}
                      disabled={!adminChatInput.trim()}
                      className="px-4 py-3 rounded-xl bg-teal-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50 hover:bg-teal-700 transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        )}
        {selectedJob && (
          <div className="mx-auto w-full max-w-4xl px-2 pb-28 pt-3 md:px-6 md:pt-8 animate-in fade-in slide-in-from-bottom-6 duration-500">
            <div className="w-full overflow-hidden rounded-[2.25rem] md:rounded-[3rem] border border-white/70 bg-white/95 shadow-[0_26px_70px_-34px_rgba(15,23,42,0.45)] backdrop-blur-sm">
              <div className="p-6 md:p-10 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
                <div>
                  <h3 className="text-2xl font-black tracking-tight">{selectedJob.contact?.name}</h3>
                  <div className="flex items-center text-[10px] text-slate-400 font-black uppercase tracking-widest">
                    <Clock className="w-3.5 h-3.5 mr-1.5" /> Start: {selectedJob.time}
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (clockInData && jobStage === 'work') return;
                    setSelectedJob(null);
                    setJobStage('details');
                    setClockOutTimeLabel(null);
                    setClockOutAtIso(null);
                    setEarlyClockOutModalOpen(false);
                    setEarlyClockOutReasonInput('');
                    setEarlyClockOutReason(null);
                  }}
                  disabled={!!clockInData && jobStage === 'work'}
                  title={clockInData && jobStage === 'work' ? 'Clock out to close this active job' : 'Close'}
                  className={`w-12 h-12 bg-white rounded-2xl shadow-[0_4px_14px_rgb(0,0,0,0.05)] flex items-center justify-center transition-all ${clockInData && jobStage === 'work' ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-50 hover:scale-105'}`}
                >
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>

              <div className="p-6 md:p-10 space-y-10 pb-10">
                {jobStage === 'details' && (
                  <div className="space-y-8">
                    <div className="space-y-8">
                      <DetailRow label="Booking Ref" value={selectedJob.bookingId} icon={<ClipboardList className="w-4 h-4" />} />
                      <DetailRow label="Client Name" value={selectedJob.contact?.name || 'Guest'} icon={<User className="w-4 h-4" />} />
                      <DetailRow label="Service Type" value={selectedJob.serviceType} icon={<Briefcase className="w-4 h-4" />} />
                      <DetailRow label="Date" value={selectedJob.date} icon={<Calendar className="w-4 h-4" />} />
                      <DetailRow label="Start Time" value={selectedJob.time} icon={<Clock className="w-4 h-4" />} />
                      <DetailRow
                        label="Duration"
                        value={
                          selectedJobBreakdown && selectedJobEarningsPreview
                            ? selectedJobEarningsPreview.staffCount > 1
                              ? `${formatBookedHoursLabel(selectedJobBreakdown.totalHours)}h booked on job · ${formatBookedHoursLabel(selectedJobEarningsPreview.yourHours)}h your share (${selectedJobEarningsPreview.staffCount} staff)`
                              : `${formatBookedHoursLabel(selectedJobBreakdown.totalHours)}h booked`
                            : 'N/A'
                        }
                        icon={<History className="w-4 h-4" />}
                      />
                      {selectedJobBreakdown ? (
                        <DurationBreakdownBlock breakdown={selectedJobBreakdown} title="Time breakdown" />
                      ) : null}
                      {(coworkersOnSelectedJob.length > 0 || (selectedJobEarningsPreview && selectedJobEarningsPreview.staffCount > 1)) && (
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2 text-slate-400">
                            <Users className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Team on this job</span>
                          </div>
                          <div className="text-lg font-black text-slate-900 uppercase tracking-tight">
                            {coworkersOnSelectedJob.length > 0
                              ? coworkersOnSelectedJob.map((s) => s.name).join(', ')
                              : `${selectedJobEarningsPreview!.staffCount - 1} other cleaner(s) assigned`}
                          </div>
                          <p className="text-xs font-bold text-slate-500">
                            Pay uses booked hours ÷ {selectedJobEarningsPreview?.staffCount ?? 1} staff × your profile rate.
                          </p>
                        </div>
                      )}
                      <DetailRow label="Status" value={selectedJob.status} icon={<CheckCircle2 className="w-4 h-4" />} />
                      <DetailRow
                        label="Address"
                        value={[
                          (selectedJob as any)?.address?.line1 ?? (selectedJob as any)?.addressLine1 ?? '',
                          (selectedJob as any)?.address?.city ?? (selectedJob as any)?.addressCity ?? '',
                          (selectedJob as any)?.address?.postcode ?? (selectedJob as any)?.addressPostcode ?? '',
                        ]
                          .filter(Boolean)
                          .join(', ') || 'Address not available'}
                        icon={<MapPin className="w-4 h-4" />}
                      />
                      {selectedJobEarningsPreview ? (
                        <DetailRow
                          label="Your estimated pay"
                          value={`£${Number(selectedJobEarningsPreview.pay || 0).toFixed(2)} (${formatBookedHoursLabel(selectedJobEarningsPreview.yourHours)}h × £${Number(selectedJobEarningsPreview.rate).toFixed(2)}/hr)`}
                          icon={<Wallet className="w-4 h-4" />}
                        />
                      ) : null}
                      {Array.isArray(selectedJob.extras) && selectedJob.extras.length > 0 && (
                        <DetailRow
                          label="Extras"
                          value={selectedJob.extras.map((e) => {
                            const extraName = extraServices.find((x) => String(x.id) === String(e.id))?.name || String(e.id);
                            return `${getExtraDisplayLabel(extraName)} x${e.quantity}`;
                          }).join(', ')}
                          icon={<Box className="w-4 h-4" />}
                        />
                      )}
                      {selectedJob.instructions && (
                        <div className="p-6 bg-amber-50/50 rounded-3xl text-amber-900">
                          <div className="flex items-center space-x-2 mb-2">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Instructions</span>
                          </div>
                          <p className="text-sm italic">"{selectedJob.instructions}"</p>
                        </div>
                      )}

                      {selectedJob.workCompletion && (
                        <div className="p-6 bg-slate-50 rounded-3xl border border-slate-200 space-y-4">
                          <div className="flex items-center space-x-2">
                            <ClipboardList className="w-4 h-4 text-primary" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Work completion report</span>
                          </div>
                          {(() => {
                            const wc = selectedJob.workCompletion as WorkCompletionData;
                            return (
                              <>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <span className="text-[10px] font-black uppercase text-slate-400 block">Clock in</span>
                                    <span className="font-black text-slate-900">{wc.clockInTime || '-'}</span>
                                    {wc.clockInAtIso ? (
                                      <span className="text-[10px] font-bold text-slate-500 block mt-0.5">
                                        {new Date(wc.clockInAtIso).toLocaleString()}
                                      </span>
                                    ) : null}
                                  </div>
                                  <div>
                                    <span className="text-[10px] font-black uppercase text-slate-400 block">Clock out</span>
                                    <span className="font-black text-slate-900">{wc.clockOutTime || '-'}</span>
                                    {wc.clockOutAtIso ? (
                                      <span className="text-[10px] font-bold text-slate-500 block mt-0.5">
                                        {new Date(wc.clockOutAtIso).toLocaleString()}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                {wc.notes ? (
                                  <div>
                                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Job notes</span>
                                    <p className="text-sm font-medium text-slate-800 whitespace-pre-wrap">{wc.notes}</p>
                                  </div>
                                ) : null}
                                {wc.earlyClockOutReason ? (
                                  <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                                    <span className="text-[10px] font-black uppercase text-amber-800 block mb-1">Early clock-out</span>
                                    <p className="text-sm font-medium text-amber-950 whitespace-pre-wrap">{wc.earlyClockOutReason}</p>
                                  </div>
                                ) : null}
                                {wc.issues ? (
                                  <div className="p-4 bg-red-50 rounded-2xl border border-red-100">
                                    <span className="text-[10px] font-black uppercase text-red-700 block mb-1">Issues / report</span>
                                    <p className="text-sm font-medium text-red-900 whitespace-pre-wrap">{wc.issues}</p>
                                  </div>
                                ) : null}
                                {wc.photos && wc.photos.length > 0 ? (
                                  <div>
                                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-2">Photos</span>
                                    <div className="grid grid-cols-2 gap-2">
                                      {wc.photos.map((src, idx) => (
                                        <a key={idx} href={src} target="_blank" rel="noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 bg-white">
                                          <img src={src} alt="" className="w-full h-24 object-cover" />
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                ) : null}
                                {wc.signature ? (
                                  <p className="text-xs font-bold text-slate-500">Signature: {wc.signature}</p>
                                ) : null}
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                    <div className="space-y-3">
                      {(selectedJob.status === BookingStatus.PENDING || selectedJob.status === BookingStatus.CONFIRMED) && (
                        <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                              Need to cancel this assigned job?
                            </p>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              Admin approval only
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-600">
                            You can request cancellation only 3+ days before the start time. Admin must approve.
                          </p>
                          <textarea
                            value={cancelRequestReason}
                            onChange={(e) => setCancelRequestReason(e.target.value)}
                            rows={2}
                            className="w-full p-3 bg-white rounded-xl border border-slate-200 text-sm font-medium text-slate-900"
                            placeholder="Optional reason for admin..."
                          />
                          <button
                            type="button"
                            onClick={handleRequestCancellation}
                            disabled={isRequestingCancel || hoursUntilJob(selectedJob.date, selectedJob.time) < 72}
                            className="w-full py-3 rounded-xl font-black text-[11px] uppercase tracking-widest border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isRequestingCancel ? 'Sending request...' : 'Request cancellation from admin'}
                          </button>
                          {hoursUntilJob(selectedJob.date, selectedJob.time) < 72 && (
                            <p className="text-[11px] font-bold text-red-600">
                              This job is within 3 days, so cancellation request is locked.
                            </p>
                          )}
                        </div>
                      )}

                      {(selectedJob.status === BookingStatus.PENDING || selectedJob.status === BookingStatus.CONFIRMED) ? (
                        <>
                          <button
                            type="button"
                            onClick={handleRunningLate}
                            className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-2 border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 transition-colors"
                          >
                            Running late - notify client & office
                          </button>
                          <button onClick={() => void handleStartTravel()} className="w-full bg-gradient-to-r from-primary to-indigo-700 text-primary-foreground py-6 rounded-[2.5rem] font-black shadow-xl shadow-primary/35 hover:-translate-y-1 hover:shadow-primary/45 transition-all">
                            Start Travel
                          </button>
                        </>
                      ) : (
                        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-center text-sm font-bold text-slate-500">
                          This booking is {selectedJob.status}. Travel/work actions are disabled.
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {jobStage === 'travel' && (
                  <div className="relative -mx-2 overflow-hidden rounded-[1.75rem] border border-slate-200/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] sm:mx-0 md:rounded-[2rem]">
                    <div className="pointer-events-none absolute inset-0 z-0 min-h-[300px] md:min-h-[340px]">
                      <React.Suspense
                        fallback={
                          <div className="flex h-full min-h-[300px] w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-300 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Loading map…
                          </div>
                        }
                      >
                        <StaffEnRouteMap booking={selectedJob} />
                      </React.Suspense>
                    </div>
                    <div className="pointer-events-auto relative z-10 space-y-6 bg-gradient-to-b from-white/88 via-white/78 to-white/92 px-4 pb-8 pt-8 text-center backdrop-blur-md md:px-6 md:pt-10">
                      {normalizeBookingDate(selectedJob.date) !== getTodayYYYYMMDD() && (
                        <div className="rounded-2xl border border-red-200 bg-red-50/95 p-4 text-sm font-bold text-red-700 shadow-sm">
                          You can only clock in on the scheduled date of this job.
                        </div>
                      )}
                      <div className="w-24 h-24 bg-primary/15 ring-2 ring-primary/20 rounded-full flex items-center justify-center mx-auto animate-pulse shadow-lg shadow-primary/10">
                        <Navigation className="w-10 h-10 text-primary" />
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-slate-900 drop-shadow-sm">En Route to Client</h3>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-slate-500">
                          Map preview · use Open Maps for turn-by-turn
                        </p>
                        {travellingJobIsToday && (
                          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700 border border-emerald-200">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Sharing live location with office & client
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {selectedClientPhone ? (
                          <a
                            href={`tel:${selectedClientPhone}`}
                            className="py-4 bg-white/90 rounded-2xl font-bold text-sm flex items-center justify-center hover:bg-white border border-slate-200/80 shadow-sm transition-colors"
                          >
                            Call client
                          </a>
                        ) : brandPhoneDial ? (
                          <a
                            href={`tel:${brandPhoneDial}`}
                            title={`${brandName} office line (from business settings)`}
                            className="py-4 bg-white/90 rounded-2xl font-bold text-sm flex items-center justify-center hover:bg-white border border-slate-200/80 shadow-sm transition-colors"
                          >
                            Call office
                          </a>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              showFlyer(
                                'No client phone on this booking. Add your business phone in Admin → Business settings to call the office.',
                                'error',
                              )
                            }
                            className="py-4 bg-white/80 rounded-2xl font-bold text-sm text-slate-600 flex items-center justify-center text-center px-2 border border-slate-200/60 hover:bg-slate-50"
                          >
                            Call office
                          </button>
                        )}
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(
                            [
                              (selectedJob as any)?.address?.line1 ?? (selectedJob as any)?.addressLine1 ?? '',
                              (selectedJob as any)?.address?.postcode ?? (selectedJob as any)?.addressPostcode ?? '',
                            ]
                              .filter(Boolean)
                              .join(', '),
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="py-4 bg-white/90 rounded-2xl font-bold text-sm flex items-center justify-center hover:bg-white border border-slate-200/80 shadow-sm transition-colors"
                        >
                          Open Maps
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={handleRunningLate}
                        className="w-full py-4 rounded-2xl font-black text-xs uppercase tracking-widest border-2 border-amber-200 bg-amber-50/95 text-amber-900 hover:bg-amber-100 transition-colors shadow-sm"
                      >
                        Running late - notify client & office
                      </button>
                      <button
                        onClick={handleClockIn}
                        disabled={normalizeBookingDate(selectedJob.date) !== getTodayYYYYMMDD()}
                        className="w-full bg-green-600 text-white py-6 rounded-[2.5rem] font-black shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Arrived & Clock In
                      </button>
                    </div>
                  </div>
                )}

                {jobStage === 'work' && (
                  <div className="space-y-8">
                    <div className="p-6 bg-green-50 rounded-3xl border border-green-100 flex items-center justify-between">
                      <div>
                        <p className="text-green-800 font-bold">Clocked In</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-green-700/70">Since {clockInData?.time}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-black uppercase tracking-widest text-green-700/70">Elapsed</p>
                        <span className="font-mono text-green-700 font-black text-lg">{elapsedClockLabel}</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h4 className="font-black text-lg">Work Log</h4>

                      <div>
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 block">Job Notes</label>
                        <textarea
                          className="w-full p-4 bg-card rounded-2xl font-medium text-foreground border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25 h-24"
                          placeholder="Describe work done..."
                          value={workDetails.notes}
                          onChange={(e) => setWorkDetails({ ...workDetails, notes: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 block">Issues / Report</label>
                        <textarea
                          className="w-full p-4 bg-red-50 rounded-2xl font-medium text-slate-900 border-none focus:ring-2 ring-red-500/20 h-20 placeholder:text-red-300"
                          placeholder="Any issues encountered?"
                          value={workDetails.issues}
                          onChange={(e) => setWorkDetails({ ...workDetails, issues: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 block">Photos</label>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          className="hidden"
                          id="photo-upload"
                          onChange={async (e) => {
                            if (e.target.files && e.target.files.length > 0) {
                              try {
                                const newPhotos = await filesToDataUrls(e.target.files);
                                setWorkDetails(prev => ({ ...prev, photos: [...(prev.photos || []), ...newPhotos] }));
                                showFlyer(`${e.target.files.length} photo(s) successfully attached!`, 'success');
                              } catch {
                                showFlyer('Failed to attach selected photos.', 'error');
                              }
                            }
                          }}
                        />
                        <label htmlFor="photo-upload" className="w-full p-4 bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 font-bold flex items-center justify-center hover:bg-slate-100 transition-colors cursor-pointer">
                          <Camera className="w-5 h-5 mr-2" />
                          {workDetails.photos && workDetails.photos.length > 0 ? `${workDetails.photos.length} Photos Attached` : 'Upload Before/After Photos'}
                        </label>
                      </div>
                    </div>

                    <button onClick={handleClockOut} className="w-full bg-slate-900 text-white py-6 rounded-[2.5rem] font-black shadow-xl">
                      Complete Job & Clock Out
                    </button>
                  </div>
                )}

                {jobStage === 'summary' && (
                  <div className="space-y-8 animate-in slide-in-from-right duration-300">
                    <div className="text-center">
                      <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-10 h-10" />
                      </div>
                      <h3 className="text-2xl font-black">Job Completed!</h3>
                      <p className="text-slate-500 font-bold">Time to sign off.</p>
                    </div>

                    {earlyClockOutReason ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-left">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-800 mb-1">Early finish (before booked time)</p>
                        <p className="text-sm font-bold text-amber-950 whitespace-pre-wrap">{earlyClockOutReason}</p>
                        <p className="text-[10px] font-bold text-amber-700/80 mt-2">This note will be sent with your report to admin.</p>
                      </div>
                    ) : null}

                    <div className="bg-slate-50 p-6 rounded-3xl space-y-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400 font-bold">Clock In</span>
                        <span className="font-black">{clockInData?.time}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-400 font-bold">Clock Out</span>
                        <span className="font-black">{clockOutTimeLabel ?? '—'}</span>
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2 block">Customer Signature</label>
                      <canvas
                        ref={(el) => {
                          (sigCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
                          if (el) initSignaturePad(el);
                        }}
                        className="h-32 w-full bg-white border-2 border-slate-200 rounded-2xl cursor-crosshair touch-none"
                        onMouseDown={onSigStart}
                        onMouseMove={onSigMove}
                        onMouseUp={onSigEnd}
                        onMouseLeave={onSigEnd}
                        onTouchStart={onSigStart}
                        onTouchMove={onSigMove}
                        onTouchEnd={onSigEnd}
                      />
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-bold text-slate-400">
                          {workDetails.signature ? 'Signature captured' : 'Sign above with finger or mouse'}
                        </span>
                        {workDetails.signature && (
                          <button onClick={clearSignature} className="text-xs font-bold text-red-500 uppercase tracking-wide hover:underline">
                            Clear
                          </button>
                        )}
                      </div>
                    </div>

                    <button onClick={handleFinalSubmit} className="w-full bg-primary text-primary-foreground py-6 rounded-[2.5rem] font-black shadow-xl shadow-primary/35">
                      Submit Final Report
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation (Hidden on Desktop) */}
      {earlyClockOutModalOpen && selectedJob && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="early-clockout-title"
        >
          <div className="w-full max-w-md rounded-[1.75rem] border border-amber-200 bg-white p-6 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]">
            <div className="flex items-start gap-3 mb-4">
              <div className="shrink-0 rounded-2xl bg-amber-100 p-2.5 text-amber-700">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h2 id="early-clockout-title" className="text-lg font-black text-slate-900 leading-tight">
                  Finishing before booked time ends?
                </h2>
                <p className="mt-2 text-sm font-bold text-slate-600 leading-snug">
                  You are clocking out before the scheduled end of this booking. Please tell us why so admin can review it with your report.
                </p>
              </div>
            </div>
            <label htmlFor="early-clockout-reason" className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-2">
              Reason required
            </label>
            <textarea
              id="early-clockout-reason"
              rows={4}
              value={earlyClockOutReasonInput}
              onChange={(e) => setEarlyClockOutReasonInput(e.target.value)}
              placeholder="e.g. Client asked to stop early, property smaller than expected, access issue…"
              className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200/60 outline-none resize-y min-h-[6rem]"
            />
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setEarlyClockOutModalOpen(false);
                  setEarlyClockOutReasonInput('');
                }}
                className="w-full sm:w-auto rounded-2xl border border-slate-200 bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEarlyClockOut}
                className="w-full sm:w-auto rounded-2xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-lg hover:bg-slate-800"
              >
                Continue & clock out
              </button>
            </div>
          </div>
        </div>
      )}

      {isMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px] animate-in fade-in duration-200" onClick={() => setIsMenuOpen(false)} />
          <div className="relative bg-white rounded-t-[1.75rem] shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.12)] animate-in slide-in-from-bottom-4 duration-300" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-9 h-1 rounded-full bg-slate-200" />
            </div>
            <div className="px-5 pb-4">
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-base font-bold text-slate-900">More</h3>
                <button type="button" onClick={() => setIsMenuOpen(false)} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-1">
                <MoreSheetItem active={activeTab === 'profile'} onClick={() => { setActiveTab('profile'); setIsMenuOpen(false); }} label="My Profile" icon={<User className="w-5 h-5" />} />
                <MoreSheetItem active={activeTab === 'reviews'} onClick={() => { setActiveTab('reviews'); setIsMenuOpen(false); }} label="My Reviews" icon={<Star className="w-5 h-5" />} />
                <MoreSheetItem active={activeTab === 'referrals'} onClick={() => { setActiveTab('referrals'); setIsMenuOpen(false); }} label="Referrals" icon={<Gift className="w-5 h-5" />} />
                <MoreSheetItem active={activeTab === 'late'} onClick={() => { setActiveTab('late'); setIsMenuOpen(false); }} label="Running Late" icon={<AlarmClock className="w-5 h-5" />} />
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100">
                <button type="button" onClick={() => { onLogout(); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-red-500 hover:bg-red-50 active:bg-red-100 transition-all duration-200">
                  <div className="p-2 rounded-xl bg-red-50 text-red-500"><LogOut className="w-5 h-5" /></div>
                  <span className="text-sm font-semibold">Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {!selectedJob && (
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-slate-200/60 z-40" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)' }}>
          <div className="flex justify-around items-stretch pt-1.5 pb-1 px-1">
            <BottomNavBtn active={activeTab === 'schedule'} onClick={() => { setActiveTab('schedule'); setIsMenuOpen(false); }} label="Schedule" icon={<Calendar className="w-[22px] h-[22px]" />} />
            <BottomNavBtn active={activeTab === 'availability'} onClick={() => { setActiveTab('availability'); setIsMenuOpen(false); }} label="Rota" icon={<CheckSquare className="w-[22px] h-[22px]" />} />
            <BottomNavBtn active={activeTab === 'messages'} onClick={() => { openInbox('alerts'); setIsMenuOpen(false); }} label="Inbox" icon={<MessageSquare className="w-[22px] h-[22px]" />} badge={staffAlerts.length} />
            <BottomNavBtn active={activeTab === 'invoice'} onClick={() => { setActiveTab('invoice'); setIsMenuOpen(false); }} label="Earnings" icon={<Wallet className="w-[22px] h-[22px]" />} />
            <BottomNavBtn active={isMoreTab} onClick={() => setIsMenuOpen((v) => !v)} label="More" icon={<Menu className="w-[22px] h-[22px]" />} />
          </div>
        </nav>
      )}

      {lateModalJobId != null && (
        <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center sm:p-6">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setLateModalJobId(null)} />
          <div className="relative w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto bg-white rounded-t-[2rem] sm:rounded-[2rem] p-5 md:p-8 shadow-2xl animate-in slide-in-from-bottom-8">
            <RunningLatePanel
              jobs={jobs}
              staffName={displayName}
              brandName={brandName}
              initialJobId={lateModalJobId}
              onClose={() => setLateModalJobId(null)}
              onSent={() => void refreshMyJobs()}
            />
          </div>
        </div>
      )}

    </div>
  );
};

const SideNavBtn: React.FC<{ active: boolean, onClick: () => void, label: string, icon: React.ReactNode, activeClass?: string, badge?: number }> = ({ active, onClick, label, icon, activeClass, badge }) => (
  <button
    onClick={onClick}
    className={`w-full p-4 rounded-2xl flex items-center space-x-4 transition-all duration-300 group ${active ? (activeClass || 'bg-gradient-to-r from-primary to-indigo-700 shadow-xl shadow-primary/35 text-primary-foreground -translate-y-0.5') : 'hover:bg-muted'}`}
  >
    <div className={`relative p-2 rounded-xl transition-all duration-300 ${active ? 'bg-white/20 text-white shadow-sm' : 'bg-slate-100 text-slate-400 group-hover:bg-white group-hover:text-primary group-hover:shadow-sm'}`}>
      {icon}
      {!!badge && badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center ring-2 ring-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </div>
    <span className={`font-black text-sm tracking-wide ${active ? 'text-white' : 'text-slate-600'}`}>{label}</span>
  </button>
);

const BottomNavBtn: React.FC<{ active: boolean; onClick: () => void; label: string; icon: React.ReactNode; badge?: number }> = ({ active, onClick, label, icon, badge }) => (
  <button onClick={onClick} className="relative flex flex-col items-center justify-center py-1.5 px-2 min-w-[3.5rem]">
    {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-[3px] rounded-full bg-primary" />}
    <div className={`relative mb-0.5 transition-colors duration-200 ${active ? 'text-primary' : 'text-slate-400'}`}>
      {icon}
      {!!badge && badge > 0 && (
        <span className="absolute -top-1 -right-2.5 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </div>
    <span className={`text-[10px] font-semibold leading-tight transition-colors duration-200 ${active ? 'text-primary' : 'text-slate-400'}`}>{label}</span>
  </button>
);

const MoreSheetItem: React.FC<{ active: boolean; onClick: () => void; label: string; icon: React.ReactNode }> = ({ active, onClick, label, icon }) => (
  <button onClick={onClick} className={`w-full flex items-center gap-3 px-3 py-3.5 rounded-2xl transition-all duration-200 ${active ? 'bg-primary/5 text-primary' : 'text-slate-700 hover:bg-slate-50 active:bg-slate-100'}`}>
    <div className={`p-2 rounded-xl ${active ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500'}`}>{icon}</div>
    <span className="text-sm font-semibold flex-1 text-left">{label}</span>
    <ChevronRight className={`w-4 h-4 ${active ? 'text-primary/40' : 'text-slate-300'}`} />
  </button>
);

const InboxPill: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  count?: number;
  activeClass?: string;
}> = ({ active, onClick, label, icon, count, activeClass }) => (
  <button
    type="button"
    onClick={onClick}
    className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest transition-all duration-200 ${active
      ? activeClass || 'bg-slate-900 text-white shadow-lg shadow-slate-900/30'
      : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-50'
      }`}
    aria-pressed={active}
  >
    {icon}
    <span>{label}</span>
    {!!count && count > 0 && (
      <span
        className={`min-w-[22px] h-[22px] px-1.5 rounded-full text-[10px] font-black flex items-center justify-center ${active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
          }`}
      >
        {count > 99 ? '99+' : count}
      </span>
    )}
  </button>
);

function formatScheduleCardDate(raw: string): string {
  const d = normalizeBookingDate(raw);
  if (!d) return raw;
  const parts = d.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return raw;
  const [y, m, day] = parts;
  const dt = new Date(y, m - 1, day);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMobileDateRowTitle(raw: string): string {
  const d = normalizeBookingDate(raw);
  if (!d) return raw;
  const parts = d.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return raw;
  const [y, m, day] = parts;
  const dt = new Date(y, m - 1, day);
  return dt.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' });
}

function getMobileWeekSectionLabel(dateIso: string, todayIso: string): string {
  const toDate = (value: string): Date | null => {
    const parts = value.split('-').map(Number);
    if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
    return new Date(parts[0], parts[1] - 1, parts[2]);
  };
  const startOfWeekMonday = (value: Date): Date => {
    const copy = new Date(value.getFullYear(), value.getMonth(), value.getDate());
    const day = copy.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    copy.setDate(copy.getDate() + offset);
    return copy;
  };

  const today = toDate(todayIso);
  const target = toDate(dateIso);
  if (!today || !target) return 'Upcoming';

  const todayWeekStart = startOfWeekMonday(today);
  const targetWeekStart = startOfWeekMonday(target);
  const diffWeeks = Math.round((targetWeekStart.getTime() - todayWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000));

  if (diffWeeks <= 0) return 'This week';
  if (diffWeeks === 1) return 'Next week';

  return `Week starting ${targetWeekStart.toLocaleDateString(undefined, { weekday: 'short', day: '2-digit', month: 'short' })}`;
}

const JobCard: React.FC<{
  job: Booking;
  onClick: () => void;
  /** Prominent start-time header + single full-card click target (good for several jobs per day). */
  timeOrdered?: boolean;
  /** Show admin notes block (used on My Rota). */
  rotaNotes?: boolean;
  currentStaffId?: number;
  staffDirectory: Staff[];
  serviceCatalog: ServiceConfig[];
  extraServices: Extra[];
}> = ({ job, onClick, timeOrdered, rotaNotes, currentStaffId, staffDirectory, serviceCatalog, extraServices }) => {
  const addressLine1 =
    (job as any)?.address?.line1 ??
    (job as any)?.addressLine1 ??
    (job as any)?.address_line_1 ??
    '';
  const addressPostcode =
    (job as any)?.address?.postcode ??
    (job as any)?.addressPostcode ??
    (job as any)?.address_postcode ??
    '';
  const addressLabel = [addressLine1, addressPostcode].filter(Boolean).join(', ') || 'Address not available';
  const svc = serviceCatalog.find(
    (s) => String(s.id) === String(job.serviceType) || s.name === job.serviceType
  );
  const durationHours = safeGetBookingDurationHours(job, svc ?? null, extraServices);

  const assignedIds = getBookingStaffIds(job);
  const staffOnJob = Math.max(1, assignedIds.length);
  const peerIds =
    currentStaffId != null ? assignedIds.filter((id) => Number(id) !== Number(currentStaffId)) : assignedIds;
  const peerNames = peerIds
    .map((id) => staffDirectory.find((s) => Number(s.id) === Number(id))?.name)
    .filter((n): n is string => Boolean(n));
  const showTeamRow = staffOnJob > 1;

  const isCompleted = job.status === BookingStatus.COMPLETED;
  const isCancelled = job.status === BookingStatus.CANCELLED;
  const stripTone = isCompleted ? 'bg-emerald-500' : isCancelled ? 'bg-red-700' : 'bg-cyan-200';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative w-full overflow-hidden rounded-[2.5rem] text-left shadow-[0_8px_30px_rgb(0,0,0,0.04)] transition-all duration-300 animate-in slide-in-from-right-4 hover:shadow-[0_20px_40px_rgb(30,64,175,0.08)] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${timeOrdered ? 'bg-emerald-50 md:bg-white p-0' : 'bg-emerald-50 md:bg-white p-6'
        }`}
    >
      <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-primary to-indigo-700 scale-x-0 transition-transform duration-500 origin-left group-hover:scale-x-100" />
      {timeOrdered ? (
        <div className={`flex flex-wrap items-center justify-between gap-2 px-5 py-4 ${isCompleted || isCancelled ? 'text-white' : 'text-slate-900'} ${stripTone}`}>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="text-2xl font-black tabular-nums tracking-tight">{job.time || '—'}</span>
          </div>
          {isCompleted ? (
            <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest ring-1 ring-white/40">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Completed
            </span>
          ) : (
            <span className={`shrink-0 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ring-1 ${isCancelled ? 'bg-white/15 ring-white/25' : 'bg-slate-900/5 ring-slate-900/15 text-slate-700'}`}>
              {job.status}
            </span>
          )}
        </div>
      ) : null}

      <div className={timeOrdered ? 'p-6' : ''}>
        <div className="mb-4 flex items-start justify-between">
          <div className="bg-primary/12 text-primary rounded-xl px-4 py-1.5 text-[10px] font-black uppercase tracking-widest">
            {job.serviceType}
          </div>
          {!timeOrdered ? <span className="font-mono text-[10px] font-bold text-slate-300">#{job.id}</span> : null}
        </div>
        <div className="mb-2 text-2xl font-black uppercase tracking-tight text-slate-800 transition-colors group-hover:text-primary">
          {job.contact?.name || 'Guest'}
        </div>
        {timeOrdered ? (
          <div className="mb-3 space-y-1 text-[11px] font-black uppercase tracking-widest text-slate-500">
            <div>Duration: {formatBookedHoursLabel(durationHours)}h booked</div>
            <div>Booking #{job.bookingId}</div>
          </div>
        ) : null}
        <div className="mb-4 flex items-center text-sm font-medium text-slate-500">
          <MapPin className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
          <span className="leading-snug">
            {addressLabel}
          </span>
        </div>

        <div className="mb-6 space-y-2 text-xs font-bold text-slate-600">
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span>{formatScheduleCardDate(job.date)}</span>
          </div>
          {!timeOrdered ? (
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>{formatBookedHoursLabel(durationHours)}h booked</span>
            </div>
          ) : null}
          {showTeamRow ? (
            <div className="flex items-start gap-2 text-primary">
              <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="leading-snug">
                {peerNames.length > 0
                  ? `With ${peerNames.join(', ')}`
                  : currentStaffId != null
                    ? `${peerIds.length} other staff on job`
                    : `${staffOnJob} staff assigned`}
              </span>
            </div>
          ) : null}
        </div>

        {rotaNotes && job.adminNotes ? (
          <div className="mb-6 flex items-start space-x-3 rounded-2xl bg-[#fff1ee] p-4 text-[#802a00]">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#802a00]" />
            <div className="text-sm font-medium">
              <strong className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[#611e00]">
                Admin / Feedback Notes
              </strong>
              {job.adminNotes}
            </div>
          </div>
        ) : null}

        <div
          className={`flex items-center justify-between border-t border-slate-50/50 pt-6 ${timeOrdered ? 'border-slate-100' : ''}`}
        >
          {timeOrdered ? (
            <span className="text-xs font-black uppercase tracking-widest text-slate-400">Tap for full details</span>
          ) : (
            <div className="flex items-center space-x-2 font-black text-primary">
              <Clock className="h-4 w-4" />
              <span className="text-sm uppercase tracking-wider">Start {job.time}</span>
            </div>
          )}
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/12 shadow-sm transition-all group-hover:scale-110 group-hover:bg-primary group-hover:text-primary-foreground">
            <ChevronRight className="h-6 w-6" />
          </div>
        </div>
        {job.status === BookingStatus.COMPLETED && job.rating != null && job.rating >= 1 && job.rating <= 5 && (
          <div className="mt-4 flex items-center gap-1.5 text-amber-600">
            <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" />
            <span className="text-[10px] font-black uppercase tracking-widest">Client rated {job.rating}/5</span>
          </div>
        )}
      </div>
    </button>
  );
};

const DetailRow: React.FC<{ label: string, value: string, icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="space-y-2">
    <div className="flex items-center space-x-2 text-slate-400">
      {icon}
      <span className="text-[10px] font-black uppercase tracking-widest">{label}</span>
    </div>
    <div className="text-lg font-black text-slate-900 uppercase tracking-tight">{value}</div>
  </div>
);

export default StaffPortal;
