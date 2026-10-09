import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Clock, MapPin, ChevronRight, ChevronLeft, CheckCircle2, Camera, MessageSquare, History, Navigation, Star,
  Signature, ShieldCheck, Phone, X, AlertCircle, Bell, User, ClipboardList, Send, LogOut,
  ImageIcon, Box, Calendar, FileText, Search, RotateCcw, Filter, Trash2, Settings, Lock,
  Briefcase, CheckSquare, Menu, Gift, Users, Wallet, Map as MapIcon, AlarmClock
} from 'lucide-react';
import RunningLatePanel from './staff/RunningLatePanel';
import { Avatar, Badge, Button, Callout, Card, cx, EmptyState, Field, InfoItem, inputClass, SectionHeader, Segmented, Spinner, StatTile, statusTone } from './staff/StaffUi';
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

  /* ───────────────────────── Presentation helpers (no business logic) ───────────────────────── */
  const PAGE_META: Record<PortalTab, { title: string; subtitle: string }> = {
    schedule: { title: 'My schedule', subtitle: 'Your jobs for today and the days ahead.' },
    availability: { title: 'My rota', subtitle: 'Jobs on any date, plus the hours you are available.' },
    messages: { title: 'Inbox', subtitle: 'Alerts, client chats and messages from the office.' },
    late: { title: 'Running late', subtitle: 'Let the client and the office know straight away.' },
    invoice: { title: 'Earnings', subtitle: 'Your pay for this week and your invoices.' },
    referrals: { title: 'Referrals', subtitle: 'Share your code and earn a bonus.' },
    profile: { title: 'My profile', subtitle: 'Your details, bank account and password.' },
    reviews: { title: 'My reviews', subtitle: 'What clients said about your work.' },
  };
  const pageMeta = PAGE_META[activeTab];
  /** "5 Oct" from YYYY-MM-DD (falls back to the raw value). */
  const shortDate = (ymd: string) => {
    const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00`);
    return Number.isNaN(d.getTime()) ? ymd : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  };
  const isOpenJob = (j: Booking) => j.status === BookingStatus.PENDING || j.status === BookingStatus.CONFIRMED;
  /** The job a cleaner most likely needs right now: next open job today, otherwise the next upcoming one. */
  const nextJob: Booking | null = todaysJobs.find(isOpenJob) ?? upcomingJobs.find(isOpenJob) ?? null;
  const completedCount = jobs.filter((j) => j.status === BookingStatus.COMPLETED).length;
  const finishedCount = jobs.filter((j) => j.status === BookingStatus.COMPLETED || j.status === BookingStatus.CANCELLED).length;
  const reliabilityLabel = finishedCount === 0 ? '100%' : `${Math.round((completedCount / finishedCount) * 100)}%`;
  const jobAddressText = (job: Booking | null) =>
    job
      ? [
          (job as any)?.address?.line1 ?? (job as any)?.addressLine1 ?? '',
          (job as any)?.address?.city ?? (job as any)?.addressCity ?? '',
          (job as any)?.address?.postcode ?? (job as any)?.addressPostcode ?? '',
        ]
          .filter(Boolean)
          .join(', ')
      : '';
  const JOB_STEPS: Array<{ id: 'details' | 'travel' | 'work' | 'summary'; label: string }> = [
    { id: 'details', label: 'Details' },
    { id: 'travel', label: 'Travel' },
    { id: 'work', label: 'On site' },
    { id: 'summary', label: 'Sign off' },
  ];
  const jobStepIndex = Math.max(0, JOB_STEPS.findIndex((s) => s.id === jobStage));
  const closeSelectedJob = () => {
    if (clockInData && jobStage === 'work') return;
    setSelectedJob(null);
    setJobStage('details');
    setClockOutTimeLabel(null);
    setClockOutAtIso(null);
    setEarlyClockOutModalOpen(false);
    setEarlyClockOutReasonInput('');
    setEarlyClockOutReason(null);
  };
  const notificationBell = (className?: string) => (
    <NotificationBell
      fetchNotifications={() => apiStaff.getNotifications(Number(currentUser?.id))}
      markRead={apiStaff.markNotificationRead}
      deleteNotification={apiStaff.deleteNotification}
      className={className}
    />
  );
  const jobCardProps = { currentStaffId: currentStaff?.id, staffDirectory, serviceCatalog, extraServices };
  const mapFallback = (
    <div className="flex items-center justify-center py-16">
      <Spinner />
    </div>
  );
  const sendStaffChat = () => {
    if (!activeChatJobId || !staffChatMessage.trim()) return;
    void apiStaff.sendBookingChat(activeChatJobId, staffChatMessage).then(() => {
      setStaffChatMessage('');
      return loadStaffChat(activeChatJobId);
    });
  };

  const activeJobBanner =
    activeClockedJob && clockInData ? (
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-5 text-white shadow-lg shadow-emerald-600/20">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-50">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
              </span>
              Job in progress
            </p>
            <p className="mt-1 truncate text-xl font-semibold">{activeClockedJob.contact?.name || 'Client'}</p>
            <p className="text-sm text-emerald-50/90">
              Clocked in at {clockInData.time} · {activeClockedJob.bookingId || `#${activeClockedJob.id}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/15 px-4 py-2 text-right">
              <p className="text-xs text-emerald-50/90">Elapsed</p>
              <p className="font-mono text-lg font-semibold tabular-nums">{elapsedClockLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedJob(activeClockedJob);
                setJobStage('work');
              }}
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50"
            >
              Open job
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const nextJobCard =
    !activeJobBanner && nextJob ? (
      <button
        type="button"
        onClick={() => openJobDetails(nextJob)}
        className="group relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/80 p-5 text-left text-primary-foreground shadow-lg shadow-primary/20 transition hover:shadow-xl focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/30"
      >
        <div className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/10" aria-hidden />
        <div className="relative flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium opacity-90">
              Next job · {normalizeBookingDate(nextJob.date) === calendarToday ? 'Today' : formatScheduleCardDate(nextJob.date)}
            </p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{nextJob.time || '--:--'}</p>
            <p className="mt-1 truncate text-lg font-semibold">{nextJob.contact?.name || 'Client'}</p>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm opacity-90">
              <MapPin className="h-4 w-4 shrink-0" />
              <span className="truncate">{jobAddressText(nextJob) || 'Address not available'}</span>
            </p>
          </div>
          <span className="mt-1 inline-flex shrink-0 items-center gap-1 rounded-xl bg-white/20 px-3 py-2 text-sm font-semibold transition group-hover:bg-white/30">
            Open <ChevronRight className="h-4 w-4" />
          </span>
        </div>
      </button>
    ) : null;

  const chatThread = (variant: 'mobile' | 'desktop') => (
    <div className={cx('flex min-h-0 flex-col', variant === 'mobile' ? 'min-h-[460px]' : 'h-full')}>
      <div className="border-b border-slate-100 px-4 py-3">
        {variant === 'mobile' ? (
          <button type="button" onClick={() => setMobileChatView('list')} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-primary">
            <ChevronLeft className="h-4 w-4" /> All chats
          </button>
        ) : null}
        <div className="flex items-center gap-3">
          <Avatar name={activeChatJob?.contact?.name || 'Client'} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{activeChatJob?.contact?.name || 'Client'}</p>
            <p className="text-xs text-slate-500">Booking {activeChatJob?.bookingId || `#${activeChatJob?.id || activeChatJobId || ''}`}</p>
          </div>
        </div>
        {!staffChatCanStart && <Callout tone="warning" className="mt-3">Chat opens 10 minutes before the start time.</Callout>}
        {staffChatClosed && <Callout tone="danger" className="mt-3">This chat was closed by the office after the job. You can still read it.</Callout>}
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
        {staffChatMessages.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">No messages yet.</p>
        ) : (
          staffChatMessages.map((m) => (
            <div key={m.id} className={cx('flex', m.senderRole === 'staff' ? 'justify-end' : 'justify-start')}>
              <div
                className={cx(
                  'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                  m.senderRole === 'staff' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-white text-slate-900 ring-1 ring-slate-200',
                )}
              >
                <p className="mb-0.5 text-xs font-medium opacity-70">{m.senderName}</p>
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <form
        className="flex gap-2 border-t border-slate-100 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          sendStaffChat();
        }}
      >
        <input
          value={staffChatMessage}
          onChange={(e) => setStaffChatMessage(e.target.value)}
          disabled={staffChatClosed || !staffChatCanStart}
          placeholder={staffChatClosed ? 'Chat closed' : 'Write a message…'}
          className={inputClass}
        />
        <Button type="submit" disabled={staffChatClosed || !staffChatCanStart || !staffChatMessage.trim()} aria-label="Send message" icon={<Send className="h-4 w-4" />} />
      </form>
    </div>
  );

  const chatListItem = (job: Booking, closed: boolean, onOpen: () => void) => (
    <button
      key={job.id}
      type="button"
      onClick={onOpen}
      className={cx(
        'flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition',
        String(activeChatJobId) === String(job.id) ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-slate-50',
      )}
    >
      <Avatar name={job.contact?.name || 'Client'} size="sm" className={closed ? 'opacity-60' : undefined} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900">{job.contact?.name || 'Client'}</p>
        <p className="truncate text-xs text-slate-500">
          {closed ? 'Closed by office' : `${formatScheduleCardDate(job.date)} · ${job.time}`}
        </p>
      </div>
      {closed ? <Badge tone="neutral">History</Badge> : <ChevronRight className="h-4 w-4 text-slate-300" />}
    </button>
  );

  const chatList = (onPick: (job: Booking) => void) => (
    <div className="space-y-4">
      {openChatJobs.length > 0 ? (
        <div className="space-y-1">
          <p className="px-2 pb-1 text-xs font-medium text-slate-500">Open chats</p>
          {visibleOpenChatJobs.map((job) => chatListItem(job, false, () => onPick(job)))}
          {openChatJobs.length > 4 && (
            <button type="button" onClick={() => setShowAllOpenChats((prev) => !prev)} className="w-full rounded-xl px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5">
              {showAllOpenChats ? 'Show less' : `Show ${openChatJobs.length - 4} more`}
            </button>
          )}
        </div>
      ) : null}
      {closedChatHistoryJobs.length > 0 ? (
        <div className="space-y-1">
          <p className="px-2 pb-1 text-xs font-medium text-slate-500">History</p>
          {closedChatHistoryJobs.map((job) => chatListItem(job, true, () => onPick(job)))}
        </div>
      ) : null}
      {openChatJobs.length === 0 && closedChatHistoryJobs.length === 0 ? (
        <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="No chats yet" body="A chat opens with each client 10 minutes before the job starts." />
      ) : null}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full max-w-full flex-1 overflow-hidden bg-slate-50 selection:bg-primary/15">
      {/* Desktop sidebar */}
      <aside className="z-20 hidden h-full min-h-0 w-64 shrink-0 flex-col border-r border-slate-200/80 bg-white md:flex">
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-5">
          <Avatar src={currentStaff?.imageUrl} name={displayName} />
          <div className="min-w-0">
            <p className="truncate font-semibold text-slate-900">{displayName}</p>
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {currentStaff?.role || 'Staff member'} · On duty
            </p>
          </div>
        </div>

        <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-5 no-scrollbar" aria-label="Staff menu">
          <div className="space-y-1">
            <p className="px-3 pb-1 text-xs font-medium text-slate-400">Work</p>
            <SideNavBtn active={activeTab === 'schedule'} onClick={() => setActiveTab('schedule')} label="My schedule" icon={<Calendar className="h-[18px] w-[18px]" />} />
            <SideNavBtn active={activeTab === 'availability'} onClick={() => setActiveTab('availability')} label="My rota" icon={<CheckSquare className="h-[18px] w-[18px]" />} />
            <SideNavBtn active={activeTab === 'messages'} onClick={() => openInbox('alerts')} label="Inbox" icon={<MessageSquare className="h-[18px] w-[18px]" />} badge={staffAlerts.length} />
            <SideNavBtn active={activeTab === 'late'} onClick={() => setActiveTab('late')} label="Running late" icon={<AlarmClock className="h-[18px] w-[18px]" />} />
          </div>
          <div className="space-y-1">
            <p className="px-3 pb-1 text-xs font-medium text-slate-400">Me</p>
            <SideNavBtn active={activeTab === 'invoice'} onClick={() => setActiveTab('invoice')} label="Earnings" icon={<Wallet className="h-[18px] w-[18px]" />} />
            <SideNavBtn active={activeTab === 'reviews'} onClick={() => setActiveTab('reviews')} label="My reviews" icon={<Star className="h-[18px] w-[18px]" />} />
            <SideNavBtn active={activeTab === 'referrals'} onClick={() => setActiveTab('referrals')} label="Referrals" icon={<Gift className="h-[18px] w-[18px]" />} />
            <SideNavBtn active={activeTab === 'profile'} onClick={() => setActiveTab('profile')} label="Profile" icon={<User className="h-[18px] w-[18px]" />} />
          </div>
        </nav>

        <div className="border-t border-slate-100 p-3">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-[18px] w-[18px]" /> Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="relative z-10 min-h-0 w-full max-w-full flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
        {!selectedJob && (
          <div className="mx-auto max-w-5xl px-4 pb-32 pt-5 animate-in fade-in duration-300 sm:px-6 md:px-10 md:pb-16 md:pt-10">
            {/* Mobile header */}
            <div className="mb-5 flex items-center gap-3 md:hidden">
              <Avatar src={currentStaff?.imageUrl} name={displayName} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">
                  {greeting}, {displayName.split(' ')[0]}
                </p>
                <p className="flex items-center gap-1.5 text-xs text-slate-500">
                  {todayLabel}
                  <span className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> On duty
                  </span>
                </p>
              </div>
              {notificationBell('shrink-0')}
            </div>

            {/* Page title */}
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="hidden text-sm text-slate-500 md:block">
                  {greeting}, {displayName.split(' ')[0]} · {todayLabel}
                </p>
                <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:mt-1 md:text-3xl">{pageMeta.title}</h1>
                <p className="mt-1 text-sm text-slate-500">{pageMeta.subtitle}</p>
              </div>
              <div className="hidden md:block">{notificationBell()}</div>
            </div>

            {initialLoading ? (
              <div className="space-y-4 animate-pulse" aria-label="Loading">
                <div className="h-36 rounded-2xl bg-slate-200/70" />
                <div className="grid gap-4 md:grid-cols-3">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="h-24 rounded-2xl bg-white ring-1 ring-slate-200/70" />
                  ))}
                </div>
                {[1, 2].map((i) => (
                  <div key={i} className="h-28 rounded-2xl bg-white ring-1 ring-slate-200/70" />
                ))}
              </div>
            ) : (
              <div className="space-y-6">
                {/* ───────── Schedule ───────── */}
                {activeTab === 'schedule' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    {activeJobBanner}
                    {nextJobCard}

                    {/* Mobile: list of days -> day -> map */}
                    <div className="space-y-4 md:hidden">
                      {mobileScheduleView === 'map' ? (
                        <>
                          <div className="flex items-center justify-between">
                            <Button variant="ghost" size="sm" onClick={() => setMobileScheduleView('list')} icon={<ChevronLeft className="h-4 w-4" />}>
                              Back to list
                            </Button>
                            <h3 className="font-semibold text-slate-900">Jobs map</h3>
                          </div>
                          <Card padded={false} className="overflow-hidden">
                            <React.Suspense fallback={mapFallback}>
                              <StaffJobsMap bookings={jobs} onSelectBooking={(b) => openJobDetails(b)} />
                            </React.Suspense>
                          </Card>
                        </>
                      ) : mobileScheduleView === 'list' ? (
                        <>
                          <SectionHeader
                            title="Coming up"
                            subtitle={`${mobileScheduleDailyRows.length} ${mobileScheduleDailyRows.length === 1 ? 'day' : 'days'} with jobs`}
                            action={
                              <Button variant="secondary" size="sm" onClick={() => setMobileScheduleView('map')} icon={<MapIcon className="h-4 w-4" />}>
                                Map
                              </Button>
                            }
                          />
                          {mobileScheduleDailyRows.length > 0 ? (
                            <div className="space-y-5">
                              {mobileScheduleSections.map((section) => (
                                <section key={section.label} className="space-y-2">
                                  <p className="px-1 text-xs font-medium text-slate-500">{section.label}</p>
                                  <ol className="m-0 list-none space-y-2 p-0">
                                    {section.rows.map((row) => {
                                      const isToday = row.date === calendarToday;
                                      const [, , d] = String(row.date).split('-');
                                      const weekday = new Date(`${row.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
                                      return (
                                        <li key={row.date}>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setSelectedRotaDate(row.date);
                                              setMobileScheduleView('day');
                                            }}
                                            className={cx(
                                              'flex w-full items-center gap-4 rounded-2xl border bg-white px-4 py-3 text-left shadow-sm transition active:scale-[0.99]',
                                              isToday ? 'border-primary/30 ring-1 ring-primary/20' : 'border-slate-200/80 hover:border-slate-300',
                                            )}
                                          >
                                            <div className={cx('flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl', isToday ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-700')}>
                                              <span className="text-[11px] font-medium leading-none opacity-80">{weekday}</span>
                                              <span className="text-lg font-semibold leading-tight tabular-nums">{Number(d)}</span>
                                            </div>
                                            <div className="min-w-0 flex-1">
                                              <p className="font-semibold text-slate-900">{isToday ? 'Today' : formatMobileDateRowTitle(row.date)}</p>
                                              <p className="text-sm text-slate-500">
                                                {row.jobs.length} {row.jobs.length === 1 ? 'job' : 'jobs'} · {formatBookedHoursLabel(row.totalHours)}h
                                              </p>
                                            </div>
                                            <ChevronRight className="h-5 w-5 shrink-0 text-slate-300" />
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ol>
                                </section>
                              ))}
                            </div>
                          ) : (
                            <EmptyState icon={<Calendar className="h-6 w-6" />} title="No upcoming jobs" body="New jobs appear here as soon as the office assigns them to you." />
                          )}
                        </>
                      ) : (
                        <>
                          <div className="flex items-center justify-between gap-3">
                            <Button variant="ghost" size="sm" onClick={() => setMobileScheduleView('list')} icon={<ChevronLeft className="h-4 w-4" />}>
                              All days
                            </Button>
                            <div className="text-right">
                              <p className="font-semibold text-slate-900">{selectedRotaDate === calendarToday ? 'Today' : formatScheduleCardDate(selectedRotaDate)}</p>
                              <p className="text-xs text-slate-500">
                                {selectedDateJobs.length} {selectedDateJobs.length === 1 ? 'job' : 'jobs'} · by start time
                              </p>
                            </div>
                          </div>
                          {selectedDateJobs.length > 0 ? (
                            <ol className="m-0 list-none space-y-3 p-0">
                              {selectedDateJobs.map((job) => (
                                <li key={job.id}>
                                  <JobCard job={job} onClick={() => openJobDetails(job)} timeOrdered {...jobCardProps} />
                                </li>
                              ))}
                            </ol>
                          ) : (
                            <EmptyState icon={<Calendar className="h-6 w-6" />} title="Day off" body="You have no jobs on this date." />
                          )}
                        </>
                      )}
                    </div>

                    {/* Desktop: stats, today, upcoming */}
                    <div className="hidden space-y-8 md:block">
                      <div className="grid grid-cols-3 gap-4">
                        <StatTile label="Jobs completed" value={completedCount} icon={<CheckCircle2 className="h-5 w-5" />} accent="bg-emerald-50 text-emerald-600" hint="All time" />
                        <StatTile
                          label="Client rating"
                          value={
                            <span className="inline-flex items-center gap-1.5">
                              {clientRatingStats.avg != null ? clientRatingStats.avg.toFixed(1) : '–'}
                              {clientRatingStats.avg != null ? <Star className="h-5 w-5 fill-amber-400 text-amber-400" /> : null}
                            </span>
                          }
                          icon={<Star className="h-5 w-5" />}
                          accent="bg-amber-50 text-amber-600"
                          hint={
                            clientRatingStats.n === 0 ? (
                              'No reviews yet'
                            ) : (
                              <span className="flex flex-wrap gap-x-2">
                                <span>
                                  {clientRatingStats.n} review{clientRatingStats.n === 1 ? '' : 's'}
                                </span>
                                <span className="flex gap-2 text-slate-400">
                                  {[5, 4, 3, 2, 1].map((s) => (
                                    <span key={s} className="tabular-nums">
                                      {s}★ {clientRatingStats.counts[s]}
                                    </span>
                                  ))}
                                </span>
                              </span>
                            )
                          }
                        />
                        <StatTile label="Reliability" value={reliabilityLabel} icon={<ShieldCheck className="h-5 w-5" />} accent="bg-sky-50 text-sky-600" hint="Completed vs cancelled" />
                      </div>

                      <section className="space-y-3">
                        <SectionHeader
                          title="Today"
                          subtitle={`${todaysJobs.length} ${todaysJobs.length === 1 ? 'job' : 'jobs'} · by start time`}
                          action={
                            <Button variant={desktopMapVisible ? 'primary' : 'secondary'} size="sm" onClick={() => setDesktopMapVisible((v) => !v)} icon={<MapIcon className="h-4 w-4" />}>
                              {desktopMapVisible ? 'Hide map' : 'Show map'}
                            </Button>
                          }
                        />
                        {desktopMapVisible && (
                          <Card padded={false} className="overflow-hidden">
                            <React.Suspense fallback={mapFallback}>
                              <StaffJobsMap bookings={todaysJobs} onSelectBooking={(b) => openJobDetails(b)} />
                            </React.Suspense>
                          </Card>
                        )}
                        {todaysJobs.length > 0 ? (
                          <ol className="m-0 list-none space-y-3 p-0">
                            {todaysJobs.map((job) => (
                              <li key={job.id}>
                                <JobCard job={job} onClick={() => openJobDetails(job)} timeOrdered {...jobCardProps} />
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <EmptyState icon={<CheckSquare className="h-6 w-6" />} title="Nothing booked for today" body="Enjoy the break. Upcoming jobs are listed below." />
                        )}
                      </section>

                      <section className="space-y-3">
                        <SectionHeader title="Upcoming" subtitle={`${upcomingJobs.length} ${upcomingJobs.length === 1 ? 'job' : 'jobs'}`} />
                        {upcomingJobs.length > 0 ? (
                          <ol className="m-0 list-none space-y-3 p-0">
                            {upcomingJobs.map((job) => (
                              <li key={job.id}>
                                <JobCard job={job} onClick={() => openJobDetails(job)} timeOrdered {...jobCardProps} />
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <EmptyState icon={<Calendar className="h-6 w-6" />} title="Your diary is clear" body="New jobs appear here as soon as the office assigns them to you." />
                        )}
                      </section>
                    </div>
                  </div>
                )}

                {/* ───────── Rota ───────── */}
                {activeTab === 'availability' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <Card>
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-lg font-semibold text-slate-900">{rotaDayLabel}</p>
                          <p className="text-sm text-slate-500">
                            {selectedDateJobs.length > 0
                              ? `${selectedDateJobs.length} ${selectedDateJobs.length === 1 ? 'job' : 'jobs'} on this date`
                              : 'Pick any date to see past and upcoming jobs'}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="inline-flex rounded-xl bg-slate-100 p-1">
                            <button type="button" onClick={() => setSelectedRotaDate((d) => shiftCalendarDay(d, -1))} className="rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-white" aria-label="Previous day">
                              <ChevronLeft className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => setSelectedRotaDate(getTodayYYYYMMDD())} className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white">
                              Today
                            </button>
                            <button type="button" onClick={() => setSelectedRotaDate((d) => shiftCalendarDay(d, 1))} className="rounded-lg px-2.5 py-1.5 text-slate-600 hover:bg-white" aria-label="Next day">
                              <ChevronRight className="h-4 w-4" />
                            </button>
                          </div>
                          <input type="date" value={selectedRotaDate} onChange={(e) => setSelectedRotaDate(e.target.value)} className={cx(inputClass, 'w-auto py-2')} aria-label="Choose a date" />
                        </div>
                      </div>
                    </Card>

                    {selectedDateJobs.length > 0 ? (
                      <ol className="m-0 list-none space-y-3 p-0">
                        {selectedDateJobs.map((job) => (
                          <li key={job.id}>
                            <JobCard job={job} onClick={() => openJobDetails(job)} timeOrdered rotaNotes {...jobCardProps} />
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <EmptyState icon={<Calendar className="h-6 w-6" />} title="No jobs on this date" body={`You have nothing assigned on ${formatScheduleCardDate(selectedRotaDate)}.`} />
                    )}

                    <Card>
                      <SectionHeader
                        title="Weekly availability"
                        subtitle="The office uses this when assigning jobs."
                        action={
                          !isEditingAvailability ? (
                            <Button variant="secondary" size="sm" onClick={() => setIsEditingAvailability(true)} icon={<Settings className="h-4 w-4" />}>
                              Edit
                            </Button>
                          ) : (
                            <Button size="sm" onClick={handleTimeOffRequest} icon={<CheckCircle2 className="h-4 w-4" />}>
                              Save
                            </Button>
                          )
                        }
                      />
                      <div className="mt-5 divide-y divide-slate-100">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => {
                          const slot = availabilityForm[day];
                          return (
                            <div key={day} className="flex flex-wrap items-center justify-between gap-3 py-3">
                              <div className="flex items-center gap-3">
                                <span className={cx('flex h-9 w-9 items-center justify-center rounded-xl text-sm font-semibold', slot?.active ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-400')}>
                                  {day.charAt(0)}
                                </span>
                                <span className="text-sm font-medium text-slate-800">{day}</span>
                              </div>
                              {!isEditingAvailability ? (
                                slot?.active ? (
                                  <Badge tone="success">
                                    {slot.start} – {slot.end}
                                  </Badge>
                                ) : (
                                  <Badge tone="neutral">Off</Badge>
                                )
                              ) : (
                                <div className="flex items-center gap-2">
                                  <label className="relative inline-flex cursor-pointer items-center" title={slot?.active ? 'Available' : 'Off'}>
                                    <input
                                      type="checkbox"
                                      className="peer sr-only"
                                      checked={!!slot?.active}
                                      onChange={(e) => setAvailabilityForm({ ...availabilityForm, [day]: { ...availabilityForm[day], active: e.target.checked } })}
                                      aria-label={`Available on ${day}`}
                                    />
                                    <div className="h-6 w-11 rounded-full bg-slate-200 transition after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow after:transition-all after:content-[''] peer-checked:bg-primary peer-checked:after:translate-x-5" />
                                  </label>
                                  {slot?.active && (
                                    <>
                                      <input
                                        type="time"
                                        value={slot.start}
                                        onChange={(e) => setAvailabilityForm({ ...availabilityForm, [day]: { ...availabilityForm[day], start: e.target.value } })}
                                        className={cx(inputClass, 'w-28 py-1.5')}
                                        aria-label={`${day} start`}
                                      />
                                      <span className="text-slate-400">–</span>
                                      <input
                                        type="time"
                                        value={slot.end}
                                        onChange={(e) => setAvailabilityForm({ ...availabilityForm, [day]: { ...availabilityForm[day], end: e.target.value } })}
                                        className={cx(inputClass, 'w-28 py-1.5')}
                                        aria-label={`${day} end`}
                                      />
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </Card>
                  </div>
                )}

                {/* ───────── Earnings ───────── */}
                {activeTab === 'invoice' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 p-6 text-white shadow-lg shadow-emerald-600/20">
                      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10" aria-hidden />
                      <div className="relative">
                        <p className="text-sm font-medium text-emerald-50">This week · {shortDate(invoiceData.weekStart)} to {shortDate(invoiceData.weekEnd)}</p>
                        <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">£{Number(invoiceData.weekTotalShare || 0).toFixed(2)}</p>
                        <p className="mt-1 text-sm text-emerald-50/90">
                          {invoiceData.weekJobCount} {invoiceData.weekJobCount === 1 ? 'job' : 'jobs'} · {Number(invoiceData.weekTotalYourHours || 0).toFixed(2)} of your hours
                        </p>
                        <button
                          type="button"
                          onClick={handleSendInvoice}
                          disabled={invoiceData.weekJobs.length === 0}
                          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-emerald-700 shadow-sm transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                        >
                          <Send className="h-4 w-4" /> Submit weekly invoice
                        </button>
                        {invoiceData.weekJobs.length === 0 ? <p className="mt-2 text-xs text-emerald-50/80">You can submit once you have a completed job this week.</p> : null}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <StatTile
                        label={`${new Date().toLocaleString('default', { month: 'long' })} so far`}
                        value={`£${Number(invoiceData.monthShare || 0).toFixed(2)}`}
                        hint={`${invoiceData.monthJobs.length} completed ${invoiceData.monthJobs.length === 1 ? 'job' : 'jobs'}`}
                        icon={<Calendar className="h-5 w-5" />}
                      />
                      <StatTile
                        label="All-time earnings"
                        value={`£${Number(invoiceData.totalShare || 0).toFixed(2)}`}
                        hint={`From ${invoiceData.jobs.length} completed ${invoiceData.jobs.length === 1 ? 'job' : 'jobs'}`}
                        icon={<Wallet className="h-5 w-5" />}
                        accent="bg-emerald-50 text-emerald-600"
                      />
                    </div>

                    <Card>
                      <SectionHeader
                        title="This week's jobs"
                        subtitle="Pay = booked hours ÷ people on the job × your hourly rate."
                        action={<Badge tone="neutral">{Number(invoiceData.weekTotalYourHours || 0).toFixed(2)}h</Badge>}
                      />
                      {invoiceData.weekJobs.length === 0 ? (
                        <EmptyState className="mt-5" icon={<FileText className="h-6 w-6" />} title="No completed jobs this week" body={`${shortDate(invoiceData.weekStart)} to ${shortDate(invoiceData.weekEnd)}`} />
                      ) : (
                        <ul className="mt-4 divide-y divide-slate-100">
                          {invoiceData.weekJobs.map((job: any) => (
                            <li key={job.id} className="flex items-start justify-between gap-4 py-3.5">
                              <div className="min-w-0">
                                <p className="truncate font-medium text-slate-900">{job.customer}</p>
                                <p className="text-sm text-slate-500">
                                  {formatScheduleCardDate(job.date)} · {Number(job.yourHours || 0).toFixed(2)}h × £{Number(job.hourlyRate || 0).toFixed(2)}
                                </p>
                                {job.staffCount > 1 ? (
                                  <Badge tone="primary" className="mt-1.5">
                                    <Users className="h-3 w-3" /> Team of {job.staffCount} · {Number(job.bookedHours || 0).toFixed(2)}h booked
                                  </Badge>
                                ) : null}
                              </div>
                              <p className="shrink-0 font-semibold tabular-nums text-emerald-600">£{Number(job.yourShare || 0).toFixed(2)}</p>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>

                    <Card>
                      <SectionHeader title="Submitted invoices" subtitle="Status and notes from the office." />
                      {submittedInvoices.length === 0 ? (
                        <EmptyState className="mt-5" icon={<FileText className="h-6 w-6" />} title="No invoices yet" body="Submit your first weekly invoice above." />
                      ) : (
                        <ul className="mt-4 space-y-3">
                          {submittedInvoices.map((inv) => (
                            <li key={inv.id} className="rounded-xl border border-slate-200/80 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="font-medium text-slate-900">{inv.weekLabel || 'Current week'}</p>
                                  <p className="text-sm text-slate-500">
                                    {inv.weekJobCount} {Number(inv.weekJobCount) === 1 ? 'job' : 'jobs'} · {Number(inv.weekTotalHours || 0).toFixed(2)}h
                                  </p>
                                </div>
                                <div className="flex items-center gap-3">
                                  <Badge tone={statusTone(inv.status || 'Pending')} dot>
                                    {inv.status || 'Pending'}
                                  </Badge>
                                  <p className="font-semibold tabular-nums text-slate-900">£{Number(inv.totalAmount || 0).toFixed(2)}</p>
                                </div>
                              </div>
                              {inv.adminNotes && String(inv.adminNotes).trim() ? (
                                <Callout tone="neutral" className="mt-3" title="Note from the office">
                                  <span className="whitespace-pre-line">{inv.adminNotes}</span>
                                </Callout>
                              ) : null}
                              <div className="mt-3">
                                <Button variant="ghost" size="sm" onClick={() => setExpandedSubmittedInvoiceId((prev) => (prev === inv.id ? null : inv.id))} icon={<FileText className="h-4 w-4" />}>
                                  {expandedSubmittedInvoiceId === inv.id ? 'Hide invoice' : 'View invoice'}
                                </Button>
                              </div>
                              {expandedSubmittedInvoiceId === inv.id && (
                                <div className="mt-3 border-t border-slate-100 pt-4">
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
                                      (inv.bankDetails as { bankName?: string; accountNumber?: string; sortCode?: string } | undefined) || {
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
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </div>
                )}

                {/* ───────── Referrals ───────── */}
                {activeTab === 'referrals' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 p-6 text-white shadow-lg shadow-violet-600/20">
                      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10" aria-hidden />
                      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                          <p className="text-sm font-medium text-violet-100">Referral earnings</p>
                          <p className="mt-1 text-4xl font-semibold tracking-tight tabular-nums">
                            £{referrals.reduce((sum, r) => sum + Number(r.rewardAmount || 0), 0).toFixed(2)}
                          </p>
                          <p className="mt-2 max-w-sm text-sm text-violet-100">Share your code with friends and clients. You earn a bonus when they book their first clean.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(currentUser?.referralCode || 'N/A');
                            showFlyer('Referral code copied!', 'success');
                          }}
                          className="group inline-flex items-center justify-between gap-4 rounded-xl bg-white px-4 py-3 text-left text-violet-700 shadow-sm transition hover:bg-violet-50"
                        >
                          <span>
                            <span className="block text-xs font-medium text-violet-400">Your code</span>
                            <span className="block font-mono text-lg font-semibold tracking-wider">{currentUser?.referralCode || 'N/A'}</span>
                          </span>
                          <span className="text-sm font-semibold">Copy</span>
                        </button>
                      </div>
                    </div>

                    <Card>
                      <SectionHeader title="Referral history" />
                      {referrals.length === 0 ? (
                        <EmptyState className="mt-5" icon={<Gift className="h-6 w-6" />} title="No referrals yet" body="When someone books with your code they will show up here." />
                      ) : (
                        <ul className="mt-4 divide-y divide-slate-100">
                          {referrals.map((r) => (
                            <li key={r.id} className="flex items-center justify-between gap-4 py-3.5">
                              <div className="flex min-w-0 items-center gap-3">
                                <Avatar name={r.referredClientName || '?'} size="sm" />
                                <div className="min-w-0">
                                  <p className="truncate font-medium text-slate-900">{r.referredClientName}</p>
                                  <p className="text-sm text-slate-500">{new Date(r.dateReferred).toLocaleDateString()}</p>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-3">
                                <Badge tone={r.status === 'Paid Out' ? 'success' : r.status === 'Completed' ? 'info' : 'warning'}>{r.status}</Badge>
                                <p className="font-semibold tabular-nums text-slate-900">£{Number(r.rewardAmount || 0).toFixed(2)}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </Card>
                  </div>
                )}

                {/* ───────── Profile ───────── */}
                {activeTab === 'profile' && (
                  <div className="space-y-6 animate-in fade-in duration-300">
                    {!isEditingProfile ? (
                      <>
                        <Card padded={false} className="overflow-hidden">
                          <div className="h-24 bg-gradient-to-r from-primary/80 to-primary/40" aria-hidden />
                          <div className="px-5 pb-6 sm:px-6">
                            <div className="-mt-12 flex flex-wrap items-end justify-between gap-4">
                              <Avatar src={currentStaff?.imageUrl} name={displayName} size="xl" className="ring-4" />
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => {
                                  setEditForm(currentStaff || {});
                                  setIsEditingProfile(true);
                                }}
                                icon={<Settings className="h-4 w-4" />}
                              >
                                Edit profile
                              </Button>
                            </div>
                            <h2 className="mt-3 text-xl font-semibold text-slate-900">{displayName}</h2>
                            <p className="text-sm text-slate-500">{currentStaff?.role || 'Staff member'}</p>
                            <div className="mt-4 flex flex-wrap gap-2">
                              {((currentStaff?.skills as string[]) || ['General Cleaning', 'Deep Clean']).map((s) => (
                                <Badge key={s} tone="primary">
                                  {s}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        </Card>

                        <div className="grid gap-6 lg:grid-cols-2">
                          <Card>
                            <SectionHeader title="Contact details" />
                            <div className="mt-4 grid gap-3">
                              <InfoItem label="Phone" value={currentStaff?.phone || 'Not provided'} icon={<Phone className="h-4 w-4" />} />
                              <InfoItem label="Postcode" value={currentStaff?.postcode || 'Not provided'} icon={<MapPin className="h-4 w-4" />} />
                              <InfoItem label="Home address" value={currentStaff?.address || 'Not provided'} icon={<MapPin className="h-4 w-4" />} />
                            </div>
                          </Card>
                          <Card>
                            <SectionHeader title="Bank details" subtitle="Used to pay your invoices." />
                            <div className="mt-4 grid gap-3">
                              <InfoItem label="Bank" value={currentStaff?.bankName || 'Not set'} icon={<Wallet className="h-4 w-4" />} />
                              <div className="grid grid-cols-2 gap-3">
                                <InfoItem label="Account number" value={currentStaff?.accountNumber ? `•••• ${String(currentStaff.accountNumber).slice(-4)}` : 'Not set'} />
                                <InfoItem label="Sort code" value={currentStaff?.sortCode || 'Not set'} />
                              </div>
                            </div>
                          </Card>
                        </div>

                        <Card>
                          <SectionHeader title="Change password" subtitle="Use at least 8 characters." />
                          <form
                            className="mt-4 grid gap-4 sm:grid-cols-3"
                            onSubmit={(e) => {
                              e.preventDefault();
                              handlePasswordSave();
                            }}
                          >
                            <Field label="Current password" htmlFor="pw-current">
                              <input
                                id="pw-current"
                                type="password"
                                autoComplete="current-password"
                                className={inputClass}
                                value={passwordForm.current}
                                onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                              />
                            </Field>
                            <Field label="New password" htmlFor="pw-next">
                              <input
                                id="pw-next"
                                type="password"
                                autoComplete="new-password"
                                className={inputClass}
                                value={passwordForm.next}
                                onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
                              />
                            </Field>
                            <Field label="Confirm new password" htmlFor="pw-confirm">
                              <input
                                id="pw-confirm"
                                type="password"
                                autoComplete="new-password"
                                className={inputClass}
                                value={passwordForm.confirm}
                                onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                              />
                            </Field>
                            <div className="sm:col-span-3">
                              <Button type="submit" variant="dark" disabled={passwordForm.saving} icon={<Lock className="h-4 w-4" />}>
                                {passwordForm.saving ? 'Updating…' : 'Update password'}
                              </Button>
                            </div>
                          </form>
                        </Card>

                        <Button variant="danger" block size="lg" onClick={onLogout} icon={<LogOut className="h-4 w-4" />} className="md:hidden">
                          Sign out
                        </Button>
                      </>
                    ) : (
                      <Card>
                        <SectionHeader
                          title="Edit profile"
                          subtitle="Keep your details up to date so the office can reach and pay you."
                          action={<Button variant="ghost" size="sm" onClick={() => setIsEditingProfile(false)} icon={<X className="h-4 w-4" />} aria-label="Cancel editing" />}
                        />
                        <div className="mt-6 grid gap-5">
                          <div className="flex flex-wrap items-center gap-4">
                            <Avatar src={editForm.imageUrl} name={displayName} size="lg" />
                            <div className="min-w-0 flex-1 space-y-2">
                              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
                                <Camera className="h-4 w-4" /> Upload photo
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
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
                                />
                              </label>
                              <input
                                type="text"
                                className={inputClass}
                                value={editForm.imageUrl || ''}
                                onChange={(e) => setEditForm({ ...editForm, imageUrl: e.target.value })}
                                placeholder="Or paste an image link (https://…)"
                                aria-label="Profile photo link"
                              />
                            </div>
                          </div>

                          <div className="grid gap-4 sm:grid-cols-2">
                            <Field label="Phone number" htmlFor="pf-phone">
                              <input id="pf-phone" type="tel" className={inputClass} value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
                            </Field>
                            <Field
                              label="Postcode"
                              htmlFor="pf-postcode"
                              hint={
                                postcodeLookup.error ? (
                                  <span className="text-red-600">{postcodeLookup.error}</span>
                                ) : postcodeLookup.note ? (
                                  <span className="text-emerald-600">{postcodeLookup.note}</span>
                                ) : (
                                  "We check it with Royal Mail's public lookup."
                                )
                              }
                            >
                              <div className="flex gap-2">
                                <input
                                  id="pf-postcode"
                                  type="text"
                                  className={cx(inputClass, 'uppercase')}
                                  value={editForm.postcode || ''}
                                  onChange={(e) => {
                                    setEditForm({ ...editForm, postcode: e.target.value.toUpperCase() });
                                    if (postcodeLookup.note || postcodeLookup.error) {
                                      setPostcodeLookup({ loading: false, note: null, error: null });
                                    }
                                  }}
                                  placeholder="e.g. M1 5QA"
                                  maxLength={10}
                                  autoComplete="postal-code"
                                />
                                <Button variant="dark" onClick={handleLookupPostcode} disabled={postcodeLookup.loading}>
                                  {postcodeLookup.loading ? '…' : 'Verify'}
                                </Button>
                              </div>
                            </Field>
                          </div>
                          <Field label="Home address" htmlFor="pf-address">
                            <input
                              id="pf-address"
                              type="text"
                              className={inputClass}
                              value={editForm.address || ''}
                              onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                              placeholder="House number, street, city"
                              autoComplete="street-address"
                            />
                          </Field>

                          <div className="border-t border-slate-100 pt-5">
                            <p className="mb-4 font-semibold text-slate-900">Bank details</p>
                            <div className="grid gap-4 sm:grid-cols-3">
                              <Field label="Bank name" htmlFor="pf-bank">
                                <input id="pf-bank" type="text" className={inputClass} value={editForm.bankName || ''} onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })} />
                              </Field>
                              <Field label="Account number" htmlFor="pf-acc">
                                <input id="pf-acc" type="text" inputMode="numeric" className={inputClass} value={editForm.accountNumber || ''} onChange={(e) => setEditForm({ ...editForm, accountNumber: e.target.value })} />
                              </Field>
                              <Field label="Sort code" htmlFor="pf-sort">
                                <input id="pf-sort" type="text" inputMode="numeric" className={inputClass} value={editForm.sortCode || ''} onChange={(e) => setEditForm({ ...editForm, sortCode: e.target.value })} />
                              </Field>
                            </div>
                          </div>

                          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                            <Button variant="secondary" onClick={() => setIsEditingProfile(false)}>
                              Cancel
                            </Button>
                            <Button onClick={handleProfileSave} icon={<CheckCircle2 className="h-4 w-4" />}>
                              Save changes
                            </Button>
                          </div>
                        </div>
                      </Card>
                    )}
                  </div>
                )}

                {/* ───────── Reviews ───────── */}
                {activeTab === 'reviews' && <ReviewsPanel role="staff" api={apiStaff as any} />}

                {/* ───────── Running late ───────── */}
                {activeTab === 'late' && (
                  <Card className="animate-in fade-in duration-300">
                    <RunningLatePanel jobs={jobs} staffName={displayName} brandName={brandName} onSent={() => void refreshMyJobs()} />
                  </Card>
                )}

                {/* ───────── Inbox ───────── */}
                {activeTab === 'messages' && (
                  <Segmented
                    value={inboxView}
                    onChange={(v) => {
                      setInboxView(v);
                      if (v === 'admin') void loadAdminChat();
                    }}
                    items={[
                      { id: 'alerts', label: 'Alerts', icon: <Bell className="h-4 w-4" />, count: staffAlerts.length },
                      { id: 'chats', label: 'Clients', icon: <MessageSquare className="h-4 w-4" />, count: openChatJobs.length },
                      { id: 'admin', label: 'Office', icon: <Users className="h-4 w-4" />, count: adminChatMessages.filter((m) => !m.isRead && m.senderRole === 'admin').length },
                    ]}
                  />
                )}

                {activeTab === 'messages' && inboxView === 'alerts' && (
                  <div className="space-y-3 animate-in fade-in duration-200">
                    <Callout
                      tone="neutral"
                      icon={<Bell className="h-4 w-4 text-slate-500" />}
                      title="Browser notifications"
                      className="items-center"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <span>Get a pop-up on this device when you are assigned a new job.</span>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={async () => {
                            await requestNotificationPermission();
                            showFlyer('If your browser allowed it, notifications are enabled.', 'success');
                          }}
                        >
                          Turn on
                        </Button>
                      </div>
                    </Callout>
                    {staffAlerts.length === 0 ? (
                      <EmptyState icon={<Bell className="h-6 w-6" />} title="You're all caught up" body="New assignments and office updates will appear here." />
                    ) : (
                      <ul className="space-y-2">
                        {staffAlerts.map((n) => (
                          <li key={n.id}>
                            <Card padded={false} className={cx('flex items-start gap-3 p-4', n.priority === 'urgent' && 'border-red-200 bg-red-50/60')}>
                              <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', n.priority === 'urgent' ? 'bg-red-100 text-red-600' : 'bg-primary/10 text-primary')}>
                                {n.priority === 'urgent' ? <AlertCircle className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                                  <p className="font-medium text-slate-900">{n.title}</p>
                                  <span className="text-xs text-slate-400">{n.timestamp}</span>
                                </div>
                                <p className="mt-0.5 text-sm text-slate-600">{n.message}</p>
                              </div>
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
                                className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                                aria-label="Delete notification"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </Card>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {activeTab === 'messages' && inboxView === 'chats' && (
                  <div className="animate-in fade-in duration-200">
                    <div className="md:hidden">
                      {mobileChatView === 'list' ? (
                        <Card padded={false} className="p-2">
                          {chatList((job) => {
                            setActiveChatJobId(String(job.id));
                            setMobileChatView('chat');
                            void loadStaffChat(String(job.id));
                          })}
                        </Card>
                      ) : (
                        <Card padded={false} className="overflow-hidden">
                          {chatThread('mobile')}
                        </Card>
                      )}
                    </div>
                    <Card padded={false} className="hidden h-[560px] overflow-hidden md:grid md:grid-cols-[280px_minmax(0,1fr)]">
                      <div className="overflow-y-auto border-r border-slate-100 p-2">
                        {chatList((job) => {
                          setActiveChatJobId(String(job.id));
                          void loadStaffChat(String(job.id));
                        })}
                      </div>
                      {!activeChatJobId ? (
                        <div className="flex items-center justify-center p-8">
                          <EmptyState className="border-none bg-transparent" icon={<MessageSquare className="h-6 w-6" />} title="Pick a chat" body="Choose a client on the left to read and reply." />
                        </div>
                      ) : (
                        chatThread('desktop')
                      )}
                    </Card>
                  </div>
                )}

                {activeTab === 'messages' && inboxView === 'admin' && (
                  <Card padded={false} className="flex h-[560px] flex-col overflow-hidden animate-in fade-in duration-200">
                    <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Users className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Office</p>
                        <p className="text-xs text-slate-500">Message the {brandName} team directly</p>
                      </div>
                    </div>
                    <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
                      {adminChatLoading ? (
                        <div className="flex justify-center py-10">
                          <Spinner />
                        </div>
                      ) : adminChatMessages.length === 0 ? (
                        <EmptyState className="border-none bg-transparent" icon={<MessageSquare className="h-6 w-6" />} title="No messages yet" body="Ask a question or let the office know about anything below." />
                      ) : (
                        adminChatMessages.map((m) => (
                          <div key={m.id} className={cx('flex', m.senderRole === 'staff' ? 'justify-end' : 'justify-start')}>
                            <div
                              className={cx(
                                'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm shadow-sm',
                                m.senderRole === 'staff' ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-white text-slate-900 ring-1 ring-slate-200',
                              )}
                            >
                              <p className="mb-0.5 text-xs font-medium opacity-70">
                                {m.senderName}
                                {m.senderRole === 'admin' ? ' · Office' : ''}
                              </p>
                              <p className="whitespace-pre-wrap">{m.text}</p>
                              <p className="mt-1 text-[11px] opacity-60">
                                {m.createdAt ? new Date(m.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                              </p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                    <form
                      className="flex gap-2 border-t border-slate-100 p-3"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void sendAdminChat();
                      }}
                    >
                      <input value={adminChatInput} onChange={(e) => setAdminChatInput(e.target.value)} placeholder="Message the office…" className={inputClass} />
                      <Button type="submit" disabled={!adminChatInput.trim()} aria-label="Send message" icon={<Send className="h-4 w-4" />} />
                    </form>
                  </Card>
                )}
              </div>
            )}
          </div>
        )}

        {/* ───────── Job view ───────── */}
        {selectedJob && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-32 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-300 sm:px-6 md:pb-16 md:pt-8">
            <div className="mb-4 flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={closeSelectedJob}
                disabled={!!clockInData && jobStage === 'work'}
                title={clockInData && jobStage === 'work' ? 'Clock out to close this active job' : 'Back'}
                icon={<ChevronLeft className="h-4 w-4" />}
              >
                Back
              </Button>
              <Badge tone={statusTone(selectedJob.status)} dot>
                {selectedJob.status}
              </Badge>
            </div>

            {/* No overflow clipping here: it would stop the sticky action buttons from pinning to the screen. */}
            <Card padded={false}>
              <div className="border-b border-slate-100 p-5 sm:p-6">
                <p className="text-sm text-slate-500">
                  {formatScheduleCardDate(selectedJob.date)} · {selectedJob.bookingId || `#${selectedJob.id}`}
                </p>
                <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{selectedJob.contact?.name || 'Guest'}</h2>
                  <p className="flex items-center gap-1.5 text-lg font-semibold tabular-nums text-slate-900">
                    <Clock className="h-5 w-5 text-slate-400" /> {selectedJob.time}
                  </p>
                </div>
                <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-600">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                  {jobAddressText(selectedJob) || 'Address not available'}
                </p>

                {/* Progress through the job */}
                <ol className="mt-5 grid grid-cols-4 gap-2" aria-label="Job progress">
                  {JOB_STEPS.map((step, i) => {
                    const done = i < jobStepIndex;
                    const current = i === jobStepIndex;
                    return (
                      <li key={step.id} className="min-w-0">
                        <div className={cx('h-1.5 rounded-full', done || current ? 'bg-primary' : 'bg-slate-200')} />
                        <p className={cx('mt-1.5 truncate text-xs font-medium', current ? 'text-primary' : done ? 'text-slate-600' : 'text-slate-400')}>
                          {done ? '✓ ' : ''}
                          {step.label}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="space-y-6 p-5 sm:p-6">
                {jobStage === 'details' && (
                  <div className="space-y-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoItem label="Service" value={selectedJob.serviceType} icon={<Briefcase className="h-4 w-4" />} />
                      <InfoItem
                        label="Duration"
                        value={
                          selectedJobBreakdown && selectedJobEarningsPreview
                            ? selectedJobEarningsPreview.staffCount > 1
                              ? `${formatBookedHoursLabel(selectedJobBreakdown.totalHours)}h booked · ${formatBookedHoursLabel(selectedJobEarningsPreview.yourHours)}h yours`
                              : `${formatBookedHoursLabel(selectedJobBreakdown.totalHours)}h booked`
                            : 'N/A'
                        }
                        icon={<History className="h-4 w-4" />}
                      />
                      {selectedJobEarningsPreview ? (
                        <InfoItem
                          label="Your estimated pay"
                          value={
                            <span>
                              £{Number(selectedJobEarningsPreview.pay || 0).toFixed(2)}{' '}
                              <span className="font-normal text-slate-500">
                                ({formatBookedHoursLabel(selectedJobEarningsPreview.yourHours)}h × £{Number(selectedJobEarningsPreview.rate).toFixed(2)})
                              </span>
                            </span>
                          }
                          icon={<Wallet className="h-4 w-4" />}
                        />
                      ) : null}
                      <InfoItem label="Booking reference" value={selectedJob.bookingId || `#${selectedJob.id}`} icon={<ClipboardList className="h-4 w-4" />} />
                      {Array.isArray(selectedJob.extras) && selectedJob.extras.length > 0 && (
                        <InfoItem
                          className="sm:col-span-2"
                          label="Extras"
                          value={selectedJob.extras
                            .map((e) => {
                              const extraName = extraServices.find((x) => String(x.id) === String(e.id))?.name || String(e.id);
                              return `${getExtraDisplayLabel(extraName)} ×${e.quantity}`;
                            })
                            .join(', ')}
                          icon={<Box className="h-4 w-4" />}
                        />
                      )}
                      {(coworkersOnSelectedJob.length > 0 || (selectedJobEarningsPreview && selectedJobEarningsPreview.staffCount > 1)) && (
                        <InfoItem
                          className="sm:col-span-2"
                          label="Team on this job"
                          value={
                            <span>
                              {coworkersOnSelectedJob.length > 0
                                ? coworkersOnSelectedJob.map((s) => s.name).join(', ')
                                : `${selectedJobEarningsPreview!.staffCount - 1} other cleaner(s)`}
                              <span className="mt-0.5 block text-xs font-normal text-slate-500">
                                Pay = booked hours ÷ {selectedJobEarningsPreview?.staffCount ?? 1} people × your rate.
                              </span>
                            </span>
                          }
                          icon={<Users className="h-4 w-4" />}
                        />
                      )}
                    </div>

                    {selectedJob.instructions && (
                      <Callout tone="warning" icon={<AlertCircle className="h-4 w-4" />} title="Client instructions">
                        “{selectedJob.instructions}”
                      </Callout>
                    )}

                    {selectedJobBreakdown ? <DurationBreakdownBlock breakdown={selectedJobBreakdown} title="Time breakdown" /> : null}

                    {selectedJob.workCompletion && (
                      <div className="space-y-4 rounded-xl border border-slate-200 p-4">
                        <p className="flex items-center gap-2 font-semibold text-slate-900">
                          <ClipboardList className="h-4 w-4 text-primary" /> Work completion report
                        </p>
                        {(() => {
                          const wc = selectedJob.workCompletion as WorkCompletionData;
                          return (
                            <>
                              <div className="grid grid-cols-2 gap-3">
                                <InfoItem
                                  label="Clock in"
                                  value={
                                    <span>
                                      {wc.clockInTime || '-'}
                                      {wc.clockInAtIso ? <span className="block text-xs font-normal text-slate-500">{new Date(wc.clockInAtIso).toLocaleString()}</span> : null}
                                    </span>
                                  }
                                />
                                <InfoItem
                                  label="Clock out"
                                  value={
                                    <span>
                                      {wc.clockOutTime || '-'}
                                      {wc.clockOutAtIso ? <span className="block text-xs font-normal text-slate-500">{new Date(wc.clockOutAtIso).toLocaleString()}</span> : null}
                                    </span>
                                  }
                                />
                              </div>
                              {wc.notes ? (
                                <Callout tone="neutral" title="Job notes">
                                  <span className="whitespace-pre-wrap">{wc.notes}</span>
                                </Callout>
                              ) : null}
                              {wc.earlyClockOutReason ? (
                                <Callout tone="warning" title="Early clock-out">
                                  <span className="whitespace-pre-wrap">{wc.earlyClockOutReason}</span>
                                </Callout>
                              ) : null}
                              {wc.issues ? (
                                <Callout tone="danger" title="Issues reported">
                                  <span className="whitespace-pre-wrap">{wc.issues}</span>
                                </Callout>
                              ) : null}
                              {wc.photos && wc.photos.length > 0 ? (
                                <div className="grid grid-cols-3 gap-2">
                                  {wc.photos.map((src, idx) => (
                                    <a key={idx} href={src} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl ring-1 ring-slate-200">
                                      <img src={src} alt={`Job photo ${idx + 1}`} className="h-24 w-full object-cover" />
                                    </a>
                                  ))}
                                </div>
                              ) : null}
                              {wc.signature ? <p className="text-xs text-slate-500">Signature: {wc.signature}</p> : null}
                            </>
                          );
                        })()}
                      </div>
                    )}

                    {(selectedJob.status === BookingStatus.PENDING || selectedJob.status === BookingStatus.CONFIRMED) && (
                      <details className="group rounded-xl border border-slate-200 p-4">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-slate-700">
                          Can't make this job?
                          <ChevronRight className="h-4 w-4 text-slate-400 transition group-open:rotate-90" />
                        </summary>
                        <div className="mt-3 space-y-3">
                          <p className="text-sm text-slate-500">You can ask the office to take you off a job up to 3 days before it starts. The office must approve it.</p>
                          <textarea
                            value={cancelRequestReason}
                            onChange={(e) => setCancelRequestReason(e.target.value)}
                            rows={2}
                            className={inputClass}
                            placeholder="Reason for the office (optional)"
                          />
                          <Button
                            variant="danger"
                            block
                            onClick={handleRequestCancellation}
                            disabled={isRequestingCancel || hoursUntilJob(selectedJob.date, selectedJob.time) < 72}
                          >
                            {isRequestingCancel ? 'Sending request…' : 'Ask to be taken off this job'}
                          </Button>
                          {hoursUntilJob(selectedJob.date, selectedJob.time) < 72 && (
                            <p className="text-xs text-red-600">This job starts within 3 days, so please call the office instead.</p>
                          )}
                        </div>
                      </details>
                    )}

                    {selectedJob.status === BookingStatus.PENDING || selectedJob.status === BookingStatus.CONFIRMED ? (
                      <div className="sticky bottom-3 z-10 grid gap-2 rounded-2xl bg-white/90 p-1 backdrop-blur sm:grid-cols-[1fr_2fr] md:static md:bg-transparent md:p-0">
                        <Button variant="warning" size="lg" onClick={handleRunningLate} icon={<AlarmClock className="h-5 w-5" />}>
                          Running late
                        </Button>
                        <Button size="lg" onClick={() => void handleStartTravel()} icon={<Navigation className="h-5 w-5" />}>
                          Start travel
                        </Button>
                      </div>
                    ) : (
                      <Callout tone="neutral">This booking is {String(selectedJob.status).toLowerCase()}, so travel and clock-in are switched off.</Callout>
                    )}
                  </div>
                )}

                {jobStage === 'travel' && (
                  <div className="space-y-4">
                    <div className="relative h-64 overflow-hidden rounded-xl ring-1 ring-slate-200 sm:h-72">
                      <React.Suspense fallback={<div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-500">Loading map…</div>}>
                        <StaffEnRouteMap booking={selectedJob} />
                      </React.Suspense>
                    </div>
                    {normalizeBookingDate(selectedJob.date) !== getTodayYYYYMMDD() && (
                      <Callout tone="danger" icon={<AlertCircle className="h-4 w-4" />}>
                        You can only clock in on the day of this job.
                      </Callout>
                    )}
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Navigation className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">On your way</p>
                        {travellingJobIsToday ? (
                          <p className="flex items-center gap-1.5 text-sm text-emerald-700">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Sharing your live location with the client and office
                          </p>
                        ) : (
                          <p className="text-sm text-slate-500">Use Open Maps for turn-by-turn directions.</p>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {selectedClientPhone ? (
                        <a href={`tel:${selectedClientPhone}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50">
                          <Phone className="h-4 w-4" /> Call client
                        </a>
                      ) : brandPhoneDial ? (
                        <a
                          href={`tel:${brandPhoneDial}`}
                          title={`${brandName} office line`}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                        >
                          <Phone className="h-4 w-4" /> Call office
                        </a>
                      ) : (
                        <Button
                          variant="secondary"
                          onClick={() => showFlyer('No client phone on this booking. Add your business phone in Admin → Business settings to call the office.', 'error')}
                          icon={<Phone className="h-4 w-4" />}
                        >
                          Call office
                        </Button>
                      )}
                      <a
                        href={`https://maps.google.com/?q=${encodeURIComponent(
                          [(selectedJob as any)?.address?.line1 ?? (selectedJob as any)?.addressLine1 ?? '', (selectedJob as any)?.address?.postcode ?? (selectedJob as any)?.addressPostcode ?? '']
                            .filter(Boolean)
                            .join(', '),
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
                      >
                        <MapIcon className="h-4 w-4" /> Open Maps
                      </a>
                    </div>
                    <div className="sticky bottom-3 z-10 grid gap-2 rounded-2xl bg-white/90 p-1 backdrop-blur sm:grid-cols-[1fr_2fr] md:static md:bg-transparent md:p-0">
                      <Button variant="warning" size="lg" onClick={handleRunningLate} icon={<AlarmClock className="h-5 w-5" />}>
                        Running late
                      </Button>
                      <Button variant="success" size="lg" onClick={handleClockIn} disabled={normalizeBookingDate(selectedJob.date) !== getTodayYYYYMMDD()} icon={<CheckCircle2 className="h-5 w-5" />}>
                        I've arrived · clock in
                      </Button>
                    </div>
                  </div>
                )}

                {jobStage === 'work' && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between gap-4 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
                      <div>
                        <p className="flex items-center gap-2 font-semibold text-emerald-800">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                          </span>
                          Clocked in
                        </p>
                        <p className="text-sm text-emerald-700/80">Since {clockInData?.time}</p>
                      </div>
                      <p className="font-mono text-2xl font-semibold tabular-nums text-emerald-700">{elapsedClockLabel}</p>
                    </div>

                    <Field label="Job notes" htmlFor="work-notes">
                      <textarea
                        id="work-notes"
                        className={cx(inputClass, 'h-28')}
                        placeholder="What did you do? Anything the client or office should know?"
                        value={workDetails.notes}
                        onChange={(e) => setWorkDetails({ ...workDetails, notes: e.target.value })}
                      />
                    </Field>
                    <Field label="Issues to report" htmlFor="work-issues" hint="Breakages, access problems, missing supplies…">
                      <textarea
                        id="work-issues"
                        className={cx(inputClass, 'h-20')}
                        placeholder="Leave blank if everything went fine"
                        value={workDetails.issues}
                        onChange={(e) => setWorkDetails({ ...workDetails, issues: e.target.value })}
                      />
                    </Field>
                    <div>
                      <p className="mb-1.5 text-sm font-medium text-slate-700">Before and after photos</p>
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
                              setWorkDetails((prev) => ({ ...prev, photos: [...(prev.photos || []), ...newPhotos] }));
                              showFlyer(`${e.target.files.length} photo(s) successfully attached!`, 'success');
                            } catch {
                              showFlyer('Failed to attach selected photos.', 'error');
                            }
                          }
                        }}
                      />
                      <label
                        htmlFor="photo-upload"
                        className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 transition hover:border-primary/40 hover:bg-primary/5"
                      >
                        <Camera className="h-6 w-6 text-slate-400" />
                        <span className="font-medium text-slate-700">
                          {workDetails.photos && workDetails.photos.length > 0 ? `${workDetails.photos.length} photo${workDetails.photos.length === 1 ? '' : 's'} attached · add more` : 'Tap to add photos'}
                        </span>
                      </label>
                      {workDetails.photos && workDetails.photos.length > 0 ? (
                        <div className="mt-3 grid grid-cols-4 gap-2">
                          {workDetails.photos.slice(0, 8).map((src, idx) => (
                            <img key={idx} src={src} alt={`Attached photo ${idx + 1}`} className="h-16 w-full rounded-lg object-cover ring-1 ring-slate-200" />
                          ))}
                        </div>
                      ) : null}
                    </div>

                    <div className="sticky bottom-3 z-10 rounded-2xl bg-white/90 p-1 backdrop-blur md:static md:bg-transparent md:p-0">
                      <Button variant="dark" size="lg" block onClick={handleClockOut} icon={<CheckCircle2 className="h-5 w-5" />}>
                        Finish job · clock out
                      </Button>
                    </div>
                  </div>
                )}

                {jobStage === 'summary' && (
                  <div className="space-y-5 animate-in fade-in duration-300">
                    <div className="text-center">
                      <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                        <CheckCircle2 className="h-8 w-8" />
                      </div>
                      <h3 className="text-xl font-semibold text-slate-900">Great work!</h3>
                      <p className="text-sm text-slate-500">Ask the client to sign, then send your report.</p>
                    </div>

                    {earlyClockOutReason ? (
                      <Callout tone="warning" title="Finished before the booked time">
                        <span className="whitespace-pre-wrap">{earlyClockOutReason}</span>
                        <span className="mt-1 block text-xs opacity-80">This note is sent with your report.</span>
                      </Callout>
                    ) : null}

                    <div className="grid grid-cols-2 gap-3">
                      <InfoItem label="Clocked in" value={clockInData?.time || '—'} icon={<Clock className="h-4 w-4" />} />
                      <InfoItem label="Clocked out" value={clockOutTimeLabel ?? '—'} icon={<Clock className="h-4 w-4" />} />
                    </div>

                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-700">Client signature</p>
                        {workDetails.signature && (
                          <button type="button" onClick={clearSignature} className="text-sm font-medium text-red-600 hover:underline">
                            Clear
                          </button>
                        )}
                      </div>
                      <canvas
                        ref={(el) => {
                          (sigCanvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
                          if (el) initSignaturePad(el);
                        }}
                        className="h-36 w-full cursor-crosshair touch-none rounded-xl bg-white ring-1 ring-inset ring-slate-300"
                        onMouseDown={onSigStart}
                        onMouseMove={onSigMove}
                        onMouseUp={onSigEnd}
                        onMouseLeave={onSigEnd}
                        onTouchStart={onSigStart}
                        onTouchMove={onSigMove}
                        onTouchEnd={onSigEnd}
                        aria-label="Signature pad"
                      />
                      <p className="mt-1.5 text-xs text-slate-500">{workDetails.signature ? '✓ Signature captured' : 'Sign above with a finger or the mouse'}</p>
                    </div>

                    <div className="sticky bottom-3 z-10 rounded-2xl bg-white/90 p-1 backdrop-blur md:static md:bg-transparent md:p-0">
                      <Button size="lg" block onClick={handleFinalSubmit} icon={<Send className="h-5 w-5" />}>
                        Submit report
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </main>

      {/* Early clock-out reason */}
      {earlyClockOutModalOpen && selectedJob && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="early-clockout-title">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-2xl sm:rounded-2xl animate-in slide-in-from-bottom-4 duration-200">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                <AlertCircle className="h-5 w-5" />
              </div>
              <div>
                <h2 id="early-clockout-title" className="text-lg font-semibold text-slate-900">
                  Finishing early?
                </h2>
                <p className="mt-1 text-sm text-slate-600">You are clocking out before the booked time ends. Tell us why so the office can review it with your report.</p>
              </div>
            </div>
            <Field label="Reason" htmlFor="early-clockout-reason">
              <textarea
                id="early-clockout-reason"
                rows={4}
                value={earlyClockOutReasonInput}
                onChange={(e) => setEarlyClockOutReasonInput(e.target.value)}
                placeholder="e.g. Client asked to stop early, smaller property than expected, access issue…"
                className={cx(inputClass, 'min-h-[6rem] resize-y')}
              />
            </Field>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setEarlyClockOutModalOpen(false);
                  setEarlyClockOutReasonInput('');
                }}
              >
                Keep working
              </Button>
              <Button variant="dark" onClick={confirmEarlyClockOut}>
                Clock out
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile "More" sheet */}
      {isMenuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:hidden">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] animate-in fade-in duration-200" onClick={() => setIsMenuOpen(false)} />
          <div className="relative rounded-t-3xl bg-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1 w-9 rounded-full bg-slate-200" />
            </div>
            <div className="px-4 pb-4">
              <div className="mb-2 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <Avatar src={currentStaff?.imageUrl} name={displayName} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{displayName}</p>
                  <p className="text-xs text-slate-500">{currentStaff?.role || 'Staff member'}</p>
                </div>
                <button type="button" onClick={() => setIsMenuOpen(false)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200" aria-label="Close menu">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1">
                <MoreSheetItem active={activeTab === 'profile'} onClick={() => { setActiveTab('profile'); setIsMenuOpen(false); }} label="My profile" icon={<User className="h-5 w-5" />} />
                <MoreSheetItem active={activeTab === 'reviews'} onClick={() => { setActiveTab('reviews'); setIsMenuOpen(false); }} label="My reviews" icon={<Star className="h-5 w-5" />} />
                <MoreSheetItem active={activeTab === 'referrals'} onClick={() => { setActiveTab('referrals'); setIsMenuOpen(false); }} label="Referrals" icon={<Gift className="h-5 w-5" />} />
                <MoreSheetItem active={activeTab === 'late'} onClick={() => { setActiveTab('late'); setIsMenuOpen(false); }} label="Running late" icon={<AlarmClock className="h-5 w-5" />} />
              </div>
              <div className="mt-2 border-t border-slate-100 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    onLogout();
                    setIsMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-red-600 transition hover:bg-red-50"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50">
                    <LogOut className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold">Sign out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bottom navigation */}
      {!selectedJob && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl md:hidden" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)' }} aria-label="Staff menu">
          <div className="flex items-stretch justify-around px-1 pb-1 pt-1.5">
            <BottomNavBtn active={activeTab === 'schedule'} onClick={() => { setActiveTab('schedule'); setIsMenuOpen(false); }} label="Schedule" icon={<Calendar className="h-[22px] w-[22px]" />} />
            <BottomNavBtn active={activeTab === 'availability'} onClick={() => { setActiveTab('availability'); setIsMenuOpen(false); }} label="Rota" icon={<CheckSquare className="h-[22px] w-[22px]" />} />
            <BottomNavBtn active={activeTab === 'messages'} onClick={() => { openInbox('alerts'); setIsMenuOpen(false); }} label="Inbox" icon={<MessageSquare className="h-[22px] w-[22px]" />} badge={staffAlerts.length} />
            <BottomNavBtn active={activeTab === 'invoice'} onClick={() => { setActiveTab('invoice'); setIsMenuOpen(false); }} label="Earnings" icon={<Wallet className="h-[22px] w-[22px]" />} />
            <BottomNavBtn active={isMoreTab} onClick={() => setIsMenuOpen((v) => !v)} label="More" icon={<Menu className="h-[22px] w-[22px]" />} />
          </div>
        </nav>
      )}

      {/* Running late from a job */}
      {lateModalJobId != null && (
        <div className="fixed inset-0 z-[300] flex items-end justify-center sm:items-center sm:p-6">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setLateModalJobId(null)} />
          <div className="relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl animate-in slide-in-from-bottom-8 sm:max-w-2xl sm:rounded-2xl md:p-8">
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

const SideNavBtn: React.FC<{ active: boolean; onClick: () => void; label: string; icon: React.ReactNode; badge?: number }> = ({ active, onClick, label, icon, badge }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    className={cx(
      'group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
      active ? 'bg-primary/10 text-primary' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
    )}
  >
    {active ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" aria-hidden /> : null}
    <span className={cx('shrink-0', active ? 'text-primary' : 'text-slate-400 group-hover:text-slate-600')}>{icon}</span>
    <span className="flex-1 text-left">{label}</span>
    {!!badge && badge > 0 && (
      <span className="min-w-[1.25rem] rounded-full bg-red-500 px-1.5 text-center text-xs font-semibold text-white">{badge > 9 ? '9+' : badge}</span>
    )}
  </button>
);

const BottomNavBtn: React.FC<{ active: boolean; onClick: () => void; label: string; icon: React.ReactNode; badge?: number }> = ({ active, onClick, label, icon, badge }) => (
  <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className="relative flex min-w-[3.75rem] flex-col items-center justify-center gap-0.5 px-2 py-1">
    <span className={cx('relative flex h-8 w-14 items-center justify-center rounded-full transition', active ? 'bg-primary/10 text-primary' : 'text-slate-400')}>
      {icon}
      {!!badge && badge > 0 && (
        <span className="absolute -top-0.5 right-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </span>
    <span className={cx('text-[11px] font-medium leading-tight', active ? 'text-primary' : 'text-slate-500')}>{label}</span>
  </button>
);

const MoreSheetItem: React.FC<{ active: boolean; onClick: () => void; label: string; icon: React.ReactNode }> = ({ active, onClick, label, icon }) => (
  <button type="button" onClick={onClick} className={cx('flex w-full items-center gap-3 rounded-2xl px-3 py-3 transition', active ? 'bg-primary/5 text-primary' : 'text-slate-700 hover:bg-slate-50')}>
    <span className={cx('flex h-9 w-9 items-center justify-center rounded-xl', active ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500')}>{icon}</span>
    <span className="flex-1 text-left text-sm font-medium">{label}</span>
    <ChevronRight className={cx('h-4 w-4', active ? 'text-primary/50' : 'text-slate-300')} />
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
  return dt.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
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
  /** Kept for compatibility: cards are always ordered by start time now. */
  timeOrdered?: boolean;
  /** Show admin notes block (used on My Rota). */
  rotaNotes?: boolean;
  currentStaffId?: number;
  staffDirectory: Staff[];
  serviceCatalog: ServiceConfig[];
  extraServices: Extra[];
}> = ({ job, onClick, rotaNotes, currentStaffId, staffDirectory, serviceCatalog, extraServices }) => {
  const addressLine1 = (job as any)?.address?.line1 ?? (job as any)?.addressLine1 ?? (job as any)?.address_line_1 ?? '';
  const addressPostcode = (job as any)?.address?.postcode ?? (job as any)?.addressPostcode ?? (job as any)?.address_postcode ?? '';
  const addressLabel = [addressLine1, addressPostcode].filter(Boolean).join(', ') || 'Address not available';
  const svc = serviceCatalog.find((s) => String(s.id) === String(job.serviceType) || s.name === job.serviceType);
  const durationHours = safeGetBookingDurationHours(job, svc ?? null, extraServices);

  const assignedIds = getBookingStaffIds(job);
  const staffOnJob = Math.max(1, assignedIds.length);
  const peerIds = currentStaffId != null ? assignedIds.filter((id) => Number(id) !== Number(currentStaffId)) : assignedIds;
  const peerNames = peerIds.map((id) => staffDirectory.find((s) => Number(s.id) === Number(id))?.name).filter((n): n is string => Boolean(n));

  const isCompleted = job.status === BookingStatus.COMPLETED;
  const isCancelled = job.status === BookingStatus.CANCELLED;
  const endLabel = (() => {
    const [h, m] = String(job.time || '').split(':').map(Number);
    if (!Number.isFinite(h)) return '';
    const total = Math.round((h * 60 + (m || 0) + durationHours * 60) % (24 * 60));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  })();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'group flex w-full items-stretch overflow-hidden rounded-2xl border bg-white text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 active:scale-[0.995]',
        isCancelled ? 'border-slate-200/80 opacity-70' : 'border-slate-200/80',
      )}
    >
      <div
        className={cx(
          'flex w-20 shrink-0 flex-col items-center justify-center gap-0.5 border-r px-2 py-4 sm:w-24',
          isCompleted ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : isCancelled ? 'border-slate-100 bg-slate-50 text-slate-400' : 'border-primary/10 bg-primary/5 text-primary',
        )}
      >
        <span className="text-lg font-semibold tabular-nums leading-none">{job.time || '--:--'}</span>
        {endLabel ? <span className="text-xs tabular-nums opacity-70">to {endLabel}</span> : null}
        <span className="mt-1 text-xs font-medium opacity-80">{formatBookedHoursLabel(durationHours)}h</span>
      </div>

      <div className="min-w-0 flex-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <p className={cx('truncate text-base font-semibold text-slate-900 group-hover:text-primary', isCancelled && 'line-through')}>{job.contact?.name || 'Guest'}</p>
          <Badge tone={statusTone(job.status)} className="shrink-0">
            {job.status}
          </Badge>
        </div>
        <p className="mt-0.5 truncate text-sm text-slate-500">{job.serviceType}</p>
        <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span className="line-clamp-2">{addressLabel}</span>
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5" />
            {formatScheduleCardDate(job.date)}
          </span>
          {staffOnJob > 1 ? (
            <span className="inline-flex items-center gap-1 text-primary">
              <Users className="h-3.5 w-3.5" />
              {peerNames.length > 0 ? `With ${peerNames.join(', ')}` : currentStaffId != null ? `${peerIds.length} other staff` : `${staffOnJob} staff`}
            </span>
          ) : null}
          {isCompleted && job.rating != null && job.rating >= 1 && job.rating <= 5 ? (
            <span className="inline-flex items-center gap-1 text-amber-600">
              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              Rated {job.rating}/5
            </span>
          ) : null}
        </div>
        {rotaNotes && job.adminNotes ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-inset ring-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              <span className="font-medium">Note from the office: </span>
              {job.adminNotes}
            </span>
          </div>
        ) : null}
      </div>

      <div className="hidden items-center pr-4 text-slate-300 transition group-hover:text-primary sm:flex">
        <ChevronRight className="h-5 w-5" />
      </div>
    </button>
  );
};

export default StaffPortal;
