
import React, { useState, useMemo, useEffect } from 'react';
import {
  UserCircle,
  History,
  Calendar,
  MapPin,
  ChevronRight,
  LogOut,
  Star,
  Mail,
  Lock,
  ArrowRight,
  ArrowLeft,
  Plus,
  Bell,
  Settings,
  ShieldCheck,
  CheckCircle2,
  X,
  MessageSquare,
  Send,
  Loader2,
  ExternalLink,
  ShieldAlert,
  Clock,
  Info,
  CreditCard,
  ClipboardCheck,
  Repeat,
  AlertTriangle,
  UserCheck,
  User as UserIcon,
  Trash2,
  AlertCircle,
  Phone,
  Download,
  Gift,
  Eye,
  EyeOff,
  Menu,
  Upload,
  Home,
  Sparkles,
  Copy,
  Wallet,
} from 'lucide-react';
import { Avatar, Badge, Button, Callout, Card, cx, EmptyState, Field, InfoItem, inputClass, SectionHeader, Segmented, StatTile, statusTone } from './staff/StaffUi';
import BrandLogoMark from './BrandLogoMark';
import BookingConfirmation from './BookingConfirmation';
import {
  UserAccount,
  Booking,
  BookingStatus,
  ChatMessage,
  ServiceConfig,
  Extra,
  Staff,
  Referral,
  ReferralSummary,
  PaymentFeeEvidenceItem,
} from '../types';
const CleanerTracker = React.lazy(() => import('./CleanerTracker'));
const AddressMap = React.lazy(() => import('./AddressMap'));
import InvoiceView from './InvoiceView';
import { apiClient, customerAccountFromLoginUser } from '../services/api';
import { NotificationBell } from './NotificationBell';
import { useFlyer } from './Flyer';
import AccountDataControls from './AccountDataControls';
import { bookingPaymentState } from '../src/utils/bookingPayment';
import { compareBookingDateTime, downloadBookingIcs, getTodayYYYYMMDD } from '../src/utils/bookingHelpers';
import { getPrepChecklistForService } from '../src/prepChecklists';
import { useBusinessBrand } from '../src/hooks/useBusinessBrand';
import { useBusinessSettings } from '../src/context/BusinessSettingsContext';

const CLIENT_PREFS_KEY = 'nn_client_prefs';

type ClientPrefs = {
  notifyBooking: boolean;
  notifyPromo: boolean;
};

interface Props {
  user: UserAccount | null;
  setUser: (user: UserAccount | null) => void;
  bookings: Booking[];
  onUpdateBooking: (booking: Booking) => void;
  onStartNewBooking: () => void;
  onReorder: (booking: Booking) => void;
  onLogout?: () => void;
  onLogin?: (user: UserAccount) => void;
  /** Return to public marketing site (e.g. home). */
  onBackToWebsite?: () => void;
}

type PortalSection = 'home' | 'history' | 'invoices' | 'notifications' | 'settings' | 'chats' | 'referrals';

/** Registered customers who consented to deposit / short-notice fee still owe admin-visible proof until uploaded. */
function bookingNeedsPaymentProofBanner(b: Booking): {
  show: boolean;
  needsDeposit: boolean;
  needsCancellationFee: boolean;
} {
  const items = b.paymentFeeEvidence?.items ?? [];
  const hasDepositProof = items.some((it) => it.kind === 'deposit');
  const hasCancellationProof = items.some((it) => it.kind === 'cancellation_fee');
  const needsDeposit = Boolean(b.depositTermsAcceptedAt) && !hasDepositProof;
  const needsCancellationFee =
    b.status === BookingStatus.CANCELLED &&
    Boolean(b.shortNoticeCancelFeeConsentedAt) &&
    !hasCancellationProof;
  return {
    show: needsDeposit || needsCancellationFee,
    needsDeposit,
    needsCancellationFee,
  };
}

const CustomerPortal: React.FC<Props> = ({
  user,
  setUser,
  bookings,
  onUpdateBooking,
  onStartNewBooking,
  onReorder,
  onLogout,
  onLogin,
  onBackToWebsite,
}) => {
  const { showFlyer } = useFlyer();
  const brandName = useBusinessBrand();
  const { bankDetails, cancellationPolicy, depositPolicy, googleReviewUrl } = useBusinessSettings();
  const portalDepositPercent = Number.isFinite(Number(depositPolicy?.requiredPercent))
    ? Math.min(100, Math.max(0, Number(depositPolicy?.requiredPercent)))
    : 40;
  /** Deposit before the clean, or the balance once the clean is done. */
  const payNowFor = (b: Booking) => {
    const pay = bookingPaymentState(b, portalDepositPercent);
    const open =
      (pay.stage === 'unpaid' && (b.status === BookingStatus.PENDING || b.status === BookingStatus.CONFIRMED)) ||
      (pay.stage === 'deposit_paid' && b.status !== BookingStatus.CANCELLED);
    return { pay, show: Boolean(b.stripePaymentLink) && open && pay.payNowAmount > 0 };
  };
  const [isLogin, setIsLogin] = useState(true);
  const [activeSection, setActiveSection] = useState<PortalSection>('home');
  const [isMobilePortalMenuOpen, setIsMobilePortalMenuOpen] = useState(false);
  const [cleansFilter, setCleansFilter] = useState<'upcoming' | 'past' | 'cancelled'>('upcoming');

  // Data State
  const [services, setServices] = useState<ServiceConfig[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralSummary, setReferralSummary] = useState<ReferralSummary | null>(null);
  const [customerInvoicesList, setCustomerInvoicesList] = useState<any[]>([]);

  // Load alerts, invoices and referrals up front (Home shows counts), and refresh when a section opens.
  useEffect(() => {
    if (!user) return;
    if (activeSection === 'home' || activeSection === 'notifications') apiClient.getNotifications(user.id).then(setNotifications).catch(() => {});
    if (activeSection === 'home' || activeSection === 'invoices') apiClient.getMyInvoices().then(setCustomerInvoicesList).catch(() => {});
    if (activeSection === 'referrals') {
      apiClient.getUserReferrals(user.id, 'customer').then(setReferrals).catch(() => {});
      apiClient.getReferralSummary().then(setReferralSummary).catch(() => {});
    }
  }, [activeSection, user]);

  useEffect(() => {
    setIsMobilePortalMenuOpen(false);
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== 'chats') setMobileChatView('list');
  }, [activeSection]);

  useEffect(() => {
    if (!user?.id) return;
    const onNnSync = (ev: Event) => {
      const scope = (ev as CustomEvent<{ scope?: string }>).detail?.scope;
      if (scope !== 'all' && scope !== 'notifications') return;
      apiClient.getNotifications(user.id).then(setNotifications);
    };
    window.addEventListener('nn_sync', onNnSync);
    return () => window.removeEventListener('nn_sync', onNnSync);
  }, [user?.id]);
  const [extras, setExtras] = useState<Extra[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fetchedServices, fetchedExtras, fetchedStaff] = await Promise.all([
          apiClient.getServices(),
          apiClient.getExtraServices(),
          apiClient.getStaff().catch(() => [] as Staff[]),
        ]);
        setServices(fetchedServices || []);
        setExtras(fetchedExtras || []);
        setStaffList(fetchedStaff || []);
      } catch (err) {
        console.error("Failed to load portal data", err);
      }
    };
    fetchData();
  }, [user]);

  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [registerPhone, setRegisterPhone] = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
  const [forgotPasswordMessage, setForgotPasswordMessage] = useState('');

  useEffect(() => {
    // Supports shared referral URLs like /my-account?ref=CODE
    const q = new URLSearchParams(window.location.search);
    const fromUrl = (q.get('ref') || q.get('referral') || q.get('code') || '').trim().toUpperCase();
    if (fromUrl) setReferralCodeInput(fromUrl);
  }, []);

  // Verification State
  const [showVerification, setShowVerification] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [pendingUser, setPendingUser] = useState<UserAccount | null>(null);

  // Detail & Rating State
  const [selectedBookingForDetail, setSelectedBookingForDetail] = useState<Booking | null>(null);
  const [viewMode, setViewMode] = useState<'details' | 'invoice' | 'confirmation'>('details');
  const [ratingBooking, setRatingBooking] = useState<Booking | null>(null);
  /** Customer agreed their review may appear on the website (must be opted in). */
  const [reviewPublic, setReviewPublic] = useState(false);
  /** After a 4 or 5 star rating: invite the customer to post it on Google too. */
  const [googlePrompt, setGooglePrompt] = useState<{ comment: string } | null>(null);
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  /** Client moving their own booking (allowed up to RESCHEDULE_NOTICE_HOURS before it starts). */
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [rescheduleSaving, setRescheduleSaving] = useState(false);
  const [shortNoticeConsentChecked, setShortNoticeConsentChecked] = useState(false);
  const [starCount, setStarCount] = useState(5);
  const [feedback, setFeedback] = useState('');
  const [feeEvidenceSaving, setFeeEvidenceSaving] = useState(false);
  const [feeEvidenceKind, setFeeEvidenceKind] = useState<'deposit' | 'cancellation_fee'>('deposit');
  const [feeEvidenceNote, setFeeEvidenceNote] = useState('');
  const [feeEvidencePendingFile, setFeeEvidencePendingFile] = useState<File | null>(null);

  useEffect(() => {
    if (!selectedBookingForDetail) return;
    setFeeEvidenceNote('');
    setFeeEvidencePendingFile(null);
    if (selectedBookingForDetail.shortNoticeCancelFeeConsentedAt && !selectedBookingForDetail.depositTermsAcceptedAt) {
      setFeeEvidenceKind('cancellation_fee');
    } else {
      setFeeEvidenceKind('deposit');
    }
  }, [selectedBookingForDetail?.id]);

  // Profile Edit State
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editPostcode, setEditPostcode] = useState('');
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

  // Initialize edit state when user loads
  useEffect(() => {
    if (user) {
      setEditName(user.name);
      setEditEmail(user.email);
      setEditPhone(user.phone || '');
      setEditAddress(user.address || '');
      setEditPostcode(user.postcode || '');
    }
  }, [user]);

  // Chat State
  const [activeChatBooking, setActiveChatBooking] = useState<Booking | null>(null);
  const [mobileChatView, setMobileChatView] = useState<'list' | 'chat'>('list');
  const [chatMessage, setChatMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{ id: string; senderName: string; senderRole: string; text: string; timestamp: string }>>([]);
  const [chatClosedByAdmin, setChatClosedByAdmin] = useState(false);
  const [chatCanStart, setChatCanStart] = useState(false);

  // Registration Success State
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [authError, setAuthError] = useState('');

  const [clientPrefs, setClientPrefs] = useState<ClientPrefs>({ notifyBooking: true, notifyPromo: false });

  const canBookingChatStart = (b: Booking) => {
    const [year, month, day] = String(b.date || '').split('-').map(Number);
    const [hours, minutes] = String(b.time || '').split(':').map(Number);
    const start = new Date(year || 1970, (month || 1) - 1, day || 1, hours || 0, minutes || 0).getTime();
    return Date.now() >= (start - 10 * 60 * 1000);
  };

  const chatEligibleBookings = useMemo(() => {
    return (bookings || []).filter((b) => {
      const assigned = !!b.assignedStaffId || !!(b.assignedStaffIds && b.assignedStaffIds.length > 0);
      const active = b.status !== BookingStatus.CANCELLED;
      return assigned && active;
    });
  }, [bookings]);

  const activeChatStaffNames = useMemo(() => {
    if (!activeChatBooking) return [] as string[];
    const ids = activeChatBooking.assignedStaffIds || (activeChatBooking.assignedStaffId ? [activeChatBooking.assignedStaffId] : []);
    const names = ids
      .map((id) => staffList.find((s) => Number(s.id) === Number(id))?.name)
      .filter((n): n is string => Boolean(n));
    return Array.from(new Set(names));
  }, [activeChatBooking, staffList]);

  const loadChat = async (bookingId: string) => {
    try {
      const payload = await apiClient.getBookingChat(bookingId);
      setChatMessages(payload?.messages || []);
      setChatClosedByAdmin(Boolean(payload?.chatClosedByAdmin));
      setChatCanStart(Boolean(payload?.canChatNow));
    } catch {
      setChatMessages([]);
      setChatClosedByAdmin(false);
      setChatCanStart(false);
    }
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(CLIENT_PREFS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<ClientPrefs>;
        setClientPrefs((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      /* ignore */
    }
  }, []);

  /** Offers and news consent lives on the account, so the app shows the same choice. */
  const saveMarketingOptIn = async (next: boolean) => {
    if (!user) return;
    const prev = Boolean(user.marketingOptIn);
    setUser({ ...user, marketingOptIn: next });
    try {
      await apiClient.updateProfile(user.id, { marketingOptIn: next });
      showFlyer(next ? 'You will hear about offers and news.' : 'Marketing messages turned off.', 'success');
    } catch (err) {
      setUser({ ...user, marketingOptIn: prev });
      showFlyer(err instanceof Error ? err.message : 'Could not save your choice.', 'error');
    }
  };

  const persistClientPrefs = (next: ClientPrefs) => {
    setClientPrefs(next);
    try {
      localStorage.setItem(CLIENT_PREFS_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const nextVisit = useMemo(() => {
    const today = getTodayYYYYMMDD();
    const upcoming = bookings.filter(
      (b) => b.status !== BookingStatus.CANCELLED && b.status !== BookingStatus.COMPLETED
    );
    return [...upcoming].sort(compareBookingDateTime).find((b) => b.date >= today) ?? null;
  }, [bookings]);

  const nextVisitPrep = useMemo(
    () => (nextVisit ? getPrepChecklistForService(nextVisit.serviceType) : []),
    [nextVisit]
  );

  const isCancellable = (dateStr: string, timeStr: string) => {
    try {
      // dateStr: YYYY-MM-DD, timeStr: HH:mm
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      const bookingDate = new Date(year, month - 1, day, hours, minutes);
      const now = new Date();
      const diffHours = (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      // Cancellation only allowed if more than 24 hours remain
      return diffHours >= 24;
    } catch (e) {
      return false;
    }
  };

  const shortNoticeWindowHours = Number.isFinite(Number(cancellationPolicy?.shortNoticeWindowHours))
    ? Math.max(1, Number(cancellationPolicy?.shortNoticeWindowHours))
    : 24;
  const shortNoticeFeePercent = Number.isFinite(Number(cancellationPolicy?.shortNoticeFeePercent))
    ? Math.min(100, Math.max(0, Number(cancellationPolicy?.shortNoticeFeePercent)))
    : 10;
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
  const cancellationBankDetails = activeBankDetails.length > 0 ? activeBankDetails : fallbackBankDetails;
  const defaultShortNoticeMessage =
    `If you still need to cancel within ${shortNoticeWindowHours} hours, you agree to a short-notice cancellation fee of ${shortNoticeFeePercent}% of your booking total.`;
  const shortNoticeConsentMessage =
    typeof cancellationPolicy?.consentMessage === 'string' && cancellationPolicy.consentMessage.trim()
      ? cancellationPolicy.consentMessage.trim()
      : defaultShortNoticeMessage;
  const getHoursUntilBooking = (dateStr: string, timeStr: string): number => {
    try {
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      const bookingDate = new Date(year, month - 1, day, hours, minutes);
      const now = new Date();
      return (bookingDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    } catch {
      return Number.NEGATIVE_INFINITY;
    }
  };

  const MAX_FEE_EVIDENCE_FILES = 6;
  const MAX_FEE_EVIDENCE_FILE_BYTES = 4 * 1024 * 1024;
  // Server JSON body limit is 12mb; keep a little headroom for request envelope.
  const MAX_FEE_EVIDENCE_TOTAL_REQUEST_BYTES = 11 * 1024 * 1024;

  const feeEvidenceUploadErrorMessage = (err: unknown): string => {
    const raw = err instanceof Error ? err.message : '';
    const msg = raw.toLowerCase();
    if (msg.includes('payload too large') || msg.includes('request entity too large') || msg.includes('413')) {
      return 'Upload too large for one request. Please use smaller screenshots/PDFs, or fewer files.';
    }
    if (msg.includes('only images or pdf')) {
      return 'Only images (JPG/PNG/etc.) or PDF files are allowed.';
    }
    if (msg.includes('at most') && msg.includes('files allowed')) {
      return `You can upload up to ${MAX_FEE_EVIDENCE_FILES} files for this booking.`;
    }
    if (msg.includes('send only paymentfeevidence')) {
      return 'Upload failed due to invalid request format. Please retry from this booking page.';
    }
    return raw || 'Could not upload payment proof right now. Please try again.';
  };

  const handleFeeEvidenceFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBookingForDetail || !user) return;
    if (file.size > MAX_FEE_EVIDENCE_FILE_BYTES) {
      showFlyer('File is too large (max 4 MB). Try a smaller photo or PDF.', 'error');
      e.target.value = '';
      return;
    }
    const prev = selectedBookingForDetail.paymentFeeEvidence?.items ?? [];
    if (prev.length >= MAX_FEE_EVIDENCE_FILES) {
      showFlyer(`You can upload up to ${MAX_FEE_EVIDENCE_FILES} files. Remove one from the list first if the app supports it, or contact us.`, 'error');
      e.target.value = '';
      return;
    }
    setFeeEvidencePendingFile(file);
    showFlyer(`Selected: ${file.name}. Click "Submit proof" to upload.`, 'info');
    e.target.value = '';
  };

  const handleFeeEvidenceUploadSubmit = async () => {
    const file = feeEvidencePendingFile;
    if (!file || !selectedBookingForDetail || !user) {
      showFlyer('Choose a file first, then submit.', 'error');
      return;
    }
    const prev = selectedBookingForDetail.paymentFeeEvidence?.items ?? [];
    if (prev.length >= MAX_FEE_EVIDENCE_FILES) {
      showFlyer(`You can upload up to ${MAX_FEE_EVIDENCE_FILES} files.`, 'error');
      return;
    }
    let dataUrl = '';
    try {
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Could not read file.'));
        reader.readAsDataURL(file);
      });
    } catch (err) {
      showFlyer(feeEvidenceUploadErrorMessage(err), 'error');
      return;
    }
    const lower = dataUrl.toLowerCase();
    if (!lower.startsWith('data:image/') && !lower.startsWith('data:application/pdf')) {
      showFlyer('Please upload an image (JPG, PNG, etc.) or a PDF.', 'error');
      return;
    }
    const nextItem: PaymentFeeEvidenceItem = {
      kind: feeEvidenceKind,
      dataUrl,
      fileName: file.name,
      uploadedAt: new Date().toISOString(),
      ...(feeEvidenceNote.trim() ? { note: feeEvidenceNote.trim() } : {}),
    };
    const items = [...prev, nextItem];
    const estimatedRequestBytes = new Blob([JSON.stringify({ paymentFeeEvidence: { items } })]).size;
    if (estimatedRequestBytes > MAX_FEE_EVIDENCE_TOTAL_REQUEST_BYTES) {
      showFlyer(
        'Total upload size is too large for one save request. Please use smaller files or reduce the number of proofs.',
        'error',
      );
      return;
    }
    setFeeEvidenceSaving(true);
    try {
      const r = await apiClient.updateBooking(selectedBookingForDetail.id, { paymentFeeEvidence: { items } });
      const merged = r.paymentFeeEvidence ?? { items };
      const nextBooking = { ...selectedBookingForDetail, paymentFeeEvidence: merged };
      onUpdateBooking(nextBooking);
      setSelectedBookingForDetail(nextBooking);
      setFeeEvidenceNote('');
      setFeeEvidencePendingFile(null);
      showFlyer('Thank you — your payment proof was sent to our team.', 'success');
    } catch (err) {
      showFlyer(feeEvidenceUploadErrorMessage(err), 'error');
    } finally {
      setFeeEvidenceSaving(false);
    }
  };

  const RESCHEDULE_NOTICE_HOURS = 24;
  const canReschedule = (b: Booking) =>
    (b.status === BookingStatus.PENDING || b.status === BookingStatus.CONFIRMED) &&
    getHoursUntilBooking(b.date, b.time) >= RESCHEDULE_NOTICE_HOURS;

  const openReschedule = (b: Booking) => {
    setReschedulingBooking(b);
    setRescheduleDate(String(b.date || '').slice(0, 10));
    setRescheduleTime(String(b.time || '').slice(0, 5));
  };

  const rescheduleProblem = (() => {
    if (!reschedulingBooking) return '';
    if (!rescheduleDate || !rescheduleTime) return 'Choose a new date and time.';
    if (rescheduleDate === String(reschedulingBooking.date).slice(0, 10) && rescheduleTime === String(reschedulingBooking.time).slice(0, 5)) {
      return 'Pick a different date or time.';
    }
    if (getHoursUntilBooking(rescheduleDate, rescheduleTime) < RESCHEDULE_NOTICE_HOURS) {
      return `The new time must be at least ${RESCHEDULE_NOTICE_HOURS} hours from now.`;
    }
    return '';
  })();

  const handleRescheduleConfirm = async () => {
    if (!reschedulingBooking || rescheduleProblem) return;
    setRescheduleSaving(true);
    try {
      const res = (await apiClient.updateBooking(reschedulingBooking.id, { date: rescheduleDate, time: rescheduleTime })) as {
        status?: string;
        cleanerKept?: boolean;
      };
      onUpdateBooking({
        ...reschedulingBooking,
        date: rescheduleDate,
        time: rescheduleTime,
        status: (res.status as Booking['status']) || reschedulingBooking.status,
      });
      setReschedulingBooking(null);
      showFlyer(
        res.cleanerKept === false
          ? 'Booking moved. We will confirm your cleaner for the new time shortly.'
          : 'Booking moved. A confirmation is on its way to your email.',
        'success',
      );
      void apiClient.getNotifications(0).then(setNotifications);
    } catch (err) {
      showFlyer(err instanceof Error ? err.message : 'Could not move the booking. Please try again.', 'error');
    } finally {
      setRescheduleSaving(false);
    }
  };

  const handleCancelConfirm = async () => {
    if (cancellingBooking) {
      const diffHours = getHoursUntilBooking(cancellingBooking.date, cancellingBooking.time);
      const requiresShortNoticeConsent = diffHours < shortNoticeWindowHours;
      if (requiresShortNoticeConsent && !shortNoticeConsentChecked) {
        showFlyer(`Please confirm consent to the ${shortNoticeFeePercent}% short-notice cancellation fee.`, 'error');
        return;
      }
      try {
        await apiClient.updateBooking(cancellingBooking.id, {
          status: BookingStatus.CANCELLED,
          ...(requiresShortNoticeConsent ? { shortNoticeConsent: true } : {}),
        });
        onUpdateBooking({
          ...cancellingBooking,
          status: BookingStatus.CANCELLED,
          ...(requiresShortNoticeConsent ? { shortNoticeCancelFeeConsentedAt: new Date().toISOString() } : {}),
        });
        setCancellingBooking(null);
        setShortNoticeConsentChecked(false);
        showFlyer("Booking successfully cancelled. We hope to see you again soon!", 'success');
        void apiClient.getNotifications(0).then(setNotifications);
      } catch (err) {
        showFlyer("Failed to cancel booking. Please try again.", 'error');
      }
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setAuthError('');

    try {
      if (isLogin) {
        const userAccount = customerAccountFromLoginUser(await apiClient.login(email, password));
        setUser(userAccount);
      } else {
        await apiClient.register({
          email,
          password,
          name,
          phone: registerPhone.trim() || undefined,
          referredBy: referralCodeInput ? referralCodeInput.toUpperCase() : undefined,
        });
        setRegistrationSuccess(true);
        setIsLogin(true);
        setEmail('');
        setPassword('');
        setName('');
        setRegisterPhone('');
        setReferralCodeInput('');
      }
    } catch (err: unknown) {
      console.error('Auth Error', err);
      const raw = err instanceof Error ? err.message : String(err);
      const fallback = isLogin
        ? 'Sign-in failed. Check your email and password, or register if you are new.'
        : 'Registration failed. Check your details, referral code, and try again.';
      setAuthError(raw?.trim() ? raw : fallback);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    setAuthError('');
    setForgotPasswordMessage('');

    try {
      const response = (await apiClient.forgotPassword(forgotPasswordEmail)) as { message?: string };
      setForgotPasswordMessage(response?.message ?? 'Check your email for instructions.');
    } catch (err: unknown) {
      const raw = err instanceof Error ? err.message : String(err);
      setAuthError(
        raw?.trim()
          ? raw
          : 'Could not send reset link. Check your email and that the server is reachable.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRatingSubmit = async () => {
    if (!ratingBooking) return;
    try {
      const fb = feedback.trim();
      await apiClient.updateBooking(ratingBooking.id, {
        rating: starCount,
        ...(fb ? { feedback: fb } : {}),
        reviewPublic: reviewPublic && !!fb,
      });
      onUpdateBooking({ ...ratingBooking, rating: starCount, ...(fb ? { feedback: fb } : {}) });
      const google = String(googleReviewUrl || '').trim();
      if (starCount >= 4 && /^https?:\/\//i.test(google)) {
        setGooglePrompt({ comment: fb });
      } else {
        showFlyer(`Thank you! Your feedback helps us maintain professional standards.`, 'success');
        setRatingBooking(null);
      }
      setStarCount(5);
      setFeedback('');
      setReviewPublic(false);
    } catch (err) {
      showFlyer('Failed to submit rating.', 'error');
    }
  };

  const normalizePostcode = (raw: string): string => {
    const compact = raw.replace(/\s+/g, '').toUpperCase();
    if (compact.length < 5) return compact;
    return `${compact.slice(0, compact.length - 3)} ${compact.slice(-3)}`;
  };

  const handlePostcodeLookup = async () => {
    const pc = normalizePostcode(editPostcode || '');
    if (!pc) {
      setPostcodeLookup({ loading: false, note: null, error: 'Enter a postcode first.' });
      return;
    }
    setPostcodeLookup({ loading: true, note: null, error: null });
    try {
      const res = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`);
      if (!res.ok) {
        setPostcodeLookup({
          loading: false,
          note: null,
          error: res.status === 404 ? 'Postcode not found.' : 'Lookup failed, try again.',
        });
        return;
      }
      const data = await res.json();
      const r = data?.result;
      const bits = [r?.admin_ward, r?.admin_district, r?.region].filter(Boolean);
      setEditPostcode(pc);
      setPostcodeLookup({
        loading: false,
        note: bits.length ? `Valid UK postcode · ${bits.join(', ')}` : 'Valid UK postcode.',
        error: null,
      });
    } catch (err) {
      setPostcodeLookup({
        loading: false,
        note: null,
        error: err instanceof Error ? err.message : 'Lookup failed.',
      });
    }
  };

  const handleProfileSave = async () => {
    if (!user) return;
    const name = editName.trim();
    const email = editEmail.trim();
    const phone = editPhone.trim();
    const address = editAddress.trim();
    const postcode = editPostcode.trim() ? normalizePostcode(editPostcode) : '';
    if (!name || !email) {
      showFlyer('Name and email are required.', 'error');
      return;
    }
    if (postcode) {
      const UK_PC = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;
      if (!UK_PC.test(postcode)) {
        showFlyer('Postcode looks invalid. Please check and try again.', 'error');
        return;
      }
    }
    setIsSavingProfile(true);
    try {
      const updated = (await apiClient.updateProfile(user.id, {
        name,
        email,
        phone: phone || null,
        address: address || null,
        postcode: postcode || null,
      })) as Partial<UserAccount>;
      setUser({
        ...user,
        ...updated,
        name: updated.name ?? name,
        email: updated.email ?? email,
        phone: updated.phone ?? (phone || null),
        address: updated.address ?? (address || null),
        postcode: updated.postcode ?? (postcode || null),
      });
      setIsEditingProfile(false);
      setPostcodeLookup({ loading: false, note: null, error: null });
      showFlyer("Profile updated successfully!", 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile.';
      showFlyer(msg, 'error');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handlePasswordSave = async () => {
    if (!user) return;
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
      await apiClient.updateProfile(user.id, {
        currentPassword: current,
        password: next,
      });
      setPasswordForm({ current: '', next: '', confirm: '', saving: false });
      showFlyer('Password updated. Use the new one next time you sign in.', 'success');
    } catch (err) {
      setPasswordForm((p) => ({ ...p, saving: false }));
      showFlyer(err instanceof Error ? err.message : 'Failed to update password', 'error');
    }
  };

  const handleSecurityAction = (action: string) => {
    switch (action) {
      case 'password':
        showFlyer("A password reset link has been sent to your email address.", 'success');
        break;
      case 'sessions':
        showFlyer("Session information displayed below.", 'info');
        console.log("Sessions: Windows PC - Chrome (Current) | iPhone 13 - Safari");
        break;
      case 'data':
        showFlyer("Your data download request has been queued. You will receive a secure link shortly.", 'success');
        break;
      default:
        break;
    }
  };

  /* Polling for updates on active bookings */
  useEffect(() => {
    const pollInterval = setInterval(async () => {
      // Periodic check for status updates could go here if needed
    }, 30000);
    return () => clearInterval(pollInterval);
  }, [bookings]);

  const activeBooking = bookings.find(
    (b) => b.status === BookingStatus.CONFIRMED && b.date === getTodayYYYYMMDD()
  );

  /* ───────────────────────── Presentation ───────────────────────── */

  const todayYmd = getTodayYYYYMMDD();
  const firstName = (user?.name || 'there').split(' ')[0];
  const greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();
  const isOpenBooking = (b: Booking) => b.status === BookingStatus.PENDING || b.status === BookingStatus.CONFIRMED;
  /** Open and still ahead of us; open bookings whose date has passed are listed with past cleans. */
  const isUpcoming = (b: Booking) => isOpenBooking(b) && String(b.date).slice(0, 10) >= todayYmd;
  const upcomingBookings = useMemo(() => bookings.filter(isUpcoming).sort(compareBookingDateTime), [bookings, todayYmd]);
  const pastBookings = useMemo(
    () => bookings.filter((b) => b.status === BookingStatus.COMPLETED || (isOpenBooking(b) && !isUpcoming(b))).sort((a, b) => compareBookingDateTime(b, a)),
    [bookings, todayYmd],
  );
  const cancelledBookings = useMemo(
    () => bookings.filter((b) => b.status === BookingStatus.CANCELLED).sort((a, b) => compareBookingDateTime(b, a)),
    [bookings],
  );
  const unpaidInvoices = customerInvoicesList.filter((i) => i.status !== 'paid');
  const unreadAlerts = notifications.filter((n) => !n.read && !n.isRead).length;
  const bookingsToPay = bookings.filter((b) => payNowFor(b).show);
  const bookingsNeedingProof = bookings.filter((b) => bookingNeedsPaymentProofBanner(b).show);
  const cleansToRate = pastBookings.filter((b) => b.status === BookingStatus.COMPLETED && !(b.rating != null && b.rating >= 1));
  const lastCompleted = pastBookings.find((b) => b.status === BookingStatus.COMPLETED) ?? null;
  const amountToPay =
    bookingsToPay.reduce((s, b) => s + payNowFor(b).pay.payNowAmount, 0) + unpaidInvoices.reduce((s, i) => s + Number(i.total || 0), 0);

  const staffNamesFor = (b: Booking) =>
    Array.from(
      new Set(
        (b.assignedStaffIds || (b.assignedStaffId ? [b.assignedStaffId] : []))
          .map((id) => staffList.find((s) => Number(s.id) === Number(id))?.name)
          .filter((n): n is string => Boolean(n)),
      ),
    );

  const ymdToDate = (ymd: string) => {
    const [y, m, d] = String(ymd || '').slice(0, 10).split('-').map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1);
  };
  const fmtLongDate = (ymd: string) => ymdToDate(ymd).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtShortDate = (ymd: string) => ymdToDate(ymd).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const relativeDay = (ymd: string) => {
    const days = Math.round((ymdToDate(ymd).getTime() - ymdToDate(todayYmd).getTime()) / 86400000);
    if (days === 0) return 'Today';
    if (days === 1) return 'Tomorrow';
    if (days > 1 && days < 7) return `In ${days} days`;
    return null;
  };
  const money = (n: number) => `£${(Number(n) || 0).toFixed(2)}`;

  const signOut = () => {
    if (onLogout) onLogout();
    else setUser(null);
  };

  const openBooking = (b: Booking) => {
    setSelectedBookingForDetail(b);
    setViewMode('details');
  };

  const goTo = (s: PortalSection) => {
    setActiveSection(s);
    setIsMobilePortalMenuOpen(false);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const copyReferral = async () => {
    const code = user?.referralCode || '';
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showFlyer('Referral code copied.', 'success');
    } catch {
      showFlyer(code, 'info');
    }
  };

  const sendChat = () => {
    if (!activeChatBooking || !chatMessage.trim()) return;
    void apiClient.sendBookingChat(activeChatBooking.id, chatMessage).then(() => {
      setChatMessage('');
      return loadChat(activeChatBooking.id);
    });
  };

  const PAGE_META: Record<PortalSection, { title: string; subtitle: string }> = {
    home: { title: `${greeting}, ${firstName}`, subtitle: 'Your next clean, anything that needs you, and quick links.' },
    history: { title: 'My cleans', subtitle: 'Upcoming visits and everything you have booked with us.' },
    invoices: { title: 'Invoices', subtitle: 'Bills for your cleans and what is left to pay.' },
    chats: { title: 'Messages', subtitle: 'Chat with your cleaner and our team about a booking.' },
    notifications: { title: 'Alerts', subtitle: 'Updates about your bookings and account.' },
    referrals: { title: 'Refer a friend', subtitle: 'Share your code. You both save when they book.' },
    settings: { title: 'Account settings', subtitle: 'Your details, password and message choices.' },
  };
  const pageMeta = PAGE_META[activeSection];
  const isMoreSection = activeSection === 'invoices' || activeSection === 'notifications' || activeSection === 'referrals' || activeSection === 'settings';

  const notificationBell = (className?: string) =>
    user ? (
      <div className={className}>
        <NotificationBell
          fetchNotifications={() => apiClient.getNotifications(user.id)}
          markRead={apiClient.markNotificationRead}
          deleteNotification={apiClient.deleteNotification}
        />
      </div>
    ) : null;

  /** Booking card used on Home and My cleans. */
  const renderBookingCard = (b: Booking) => {
    const proof = bookingNeedsPaymentProofBanner(b);
    const pay = payNowFor(b);
    const names = staffNamesFor(b);
    const open = isUpcoming(b) && getHoursUntilBooking(b.date, b.time) > 0;
    const d = ymdToDate(b.date);
    const rel = isUpcoming(b) ? relativeDay(b.date) : null;
    const cancelled = b.status === BookingStatus.CANCELLED;
    const completed = b.status === BookingStatus.COMPLETED;
    return (
      <div
        key={b.id}
        role="button"
        tabIndex={0}
        onClick={() => openBooking(b)}
        onKeyDown={(e) => e.key === 'Enter' && openBooking(b)}
        className={cx(
          'group overflow-hidden rounded-2xl border bg-white text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/20',
          cancelled ? 'border-slate-200/80 opacity-75' : 'border-slate-200/80',
        )}
      >
        {proof.show ? (
          <div className="flex items-center gap-2 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900">
            <Upload className="h-3.5 w-3.5 shrink-0" />
            {proof.needsDeposit && proof.needsCancellationFee
              ? 'Please upload proof of your deposit and cancellation fee payments.'
              : proof.needsCancellationFee
                ? 'Cancellation fee agreed. Please upload proof of payment.'
                : 'Deposit agreed. Please upload proof of payment.'}
          </div>
        ) : null}
        <div className="flex items-stretch">
          <div
            className={cx(
              'flex w-[4.5rem] shrink-0 flex-col items-center justify-center border-r px-2 py-4 sm:w-20',
              completed ? 'border-emerald-100 bg-emerald-50 text-emerald-700' : cancelled ? 'border-slate-100 bg-slate-50 text-slate-400' : 'border-primary/10 bg-primary/5 text-primary',
            )}
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{d.toLocaleDateString('en-GB', { month: 'short' })}</span>
            <span className="text-2xl font-semibold leading-none tabular-nums">{d.getDate()}</span>
            <span className="mt-1 text-[11px] font-medium opacity-80">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
          </div>
          <div className="min-w-0 flex-1 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={cx('truncate font-semibold text-slate-900 group-hover:text-primary', cancelled && 'line-through')}>{b.serviceType}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {String(b.time || '').slice(0, 5)}
                  </span>
                  {rel ? <span className="font-medium text-primary">{rel}</span> : null}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-semibold tabular-nums text-slate-900">{money(Number(b.totalPrice))}</p>
                <Badge tone={statusTone(b.status)} className="mt-1">
                  {b.status}
                </Badge>
              </div>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-sm text-slate-600">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              <span className="line-clamp-1">{[b.address?.line1, b.address?.postcode].filter(Boolean).join(', ')}</span>
            </p>
            {names.length ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                <UserCheck className="h-4 w-4 shrink-0 text-slate-400" /> {names.join(', ')}
              </p>
            ) : isUpcoming(b) ? (
              <p className="mt-1 text-xs text-slate-400">We will confirm your cleaner soon.</p>
            ) : null}

            {(pay.show || open || completed) && (
              <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                {pay.show ? (
                  <a
                    href={b.stripePaymentLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                  >
                    <CreditCard className="h-3.5 w-3.5" /> {pay.pay.payNowLabel}
                  </a>
                ) : null}
                {open ? (
                  <>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Calendar className="h-3.5 w-3.5" />}
                      disabled={!canReschedule(b)}
                      title={canReschedule(b) ? 'Move to another date or time' : `Bookings can be moved up to ${RESCHEDULE_NOTICE_HOURS} hours before they start. Please contact us.`}
                      onClick={() => canReschedule(b) && openReschedule(b)}
                    >
                      Move
                    </Button>
                    <Button
                      size="sm"
                      variant={isCancellable(b.date, b.time) ? 'danger' : 'warning'}
                      icon={isCancellable(b.date, b.time) ? <Trash2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                      onClick={() => {
                        setCancellingBooking(b);
                        setShortNoticeConsentChecked(false);
                      }}
                    >
                      {isCancellable(b.date, b.time) ? 'Cancel' : `Cancel (under ${shortNoticeWindowHours}h)`}
                    </Button>
                  </>
                ) : null}
                {completed ? (
                  <>
                    <Button size="sm" variant="secondary" icon={<Repeat className="h-3.5 w-3.5" />} onClick={() => onReorder(b)}>
                      Book again
                    </Button>
                    {b.rating != null && b.rating >= 1 && b.rating <= 5 ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> You rated {b.rating}/5
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="warning"
                        icon={<Star className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setStarCount(5);
                          setFeedback('');
                          setRatingBooking(b);
                        }}
                      >
                        Rate this clean
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
          <div className="hidden items-center pr-4 text-slate-300 transition group-hover:text-primary sm:flex">
            <ChevronRight className="h-5 w-5" />
          </div>
        </div>
      </div>
    );
  };

  if (!user && !showVerification) {
    return (
      <div className="min-h-screen bg-slate-50 font-sans">
        <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
            <button type="button" onClick={onBackToWebsite} className="flex items-center gap-3" aria-label="Back to website">
              <BrandLogoMark className="h-11 w-auto object-contain" />
            </button>
            <div className="flex items-center gap-2">
              {onBackToWebsite ? (
                <Button variant="ghost" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={onBackToWebsite}>
                  <span className="hidden sm:inline">Back to website</span>
                  <span className="sm:hidden">Website</span>
                </Button>
              ) : null}
              <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={onStartNewBooking}>
                Book a clean
              </Button>
            </div>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)] lg:items-center lg:py-16">
          <div className="order-2 hidden space-y-6 lg:order-1 lg:block">
            <p className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <ShieldCheck className="h-3.5 w-3.5" /> Your {brandName} account
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-slate-900">Everything about your cleans, in one place.</h1>
            <ul className="space-y-3 text-slate-600">
              {[
                'See your next clean and who is coming',
                'Move or cancel a booking yourself',
                'Pay securely and download invoices',
                'Chat with your cleaner on the day',
              ].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" /> {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="order-1 lg:order-2">
            <Card className="p-6 shadow-xl shadow-slate-200/60 sm:p-8">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{isForgotPassword ? 'Reset your password' : isLogin ? 'Welcome back' : 'Create your account'}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {isForgotPassword ? 'We will email you a link to choose a new password.' : isLogin ? 'Sign in to manage your cleans.' : 'It takes a minute and keeps all your bookings together.'}
              </p>

              {registrationSuccess && (
                <Callout tone="success" className="mt-5" icon={<CheckCircle2 className="h-4 w-4" />} title="Account created">
                  Check your email for your login details, then sign in below.
                  <button type="button" onClick={() => setRegistrationSuccess(false)} className="ml-2 text-xs font-semibold underline">
                    Dismiss
                  </button>
                </Callout>
              )}
              {authError && (
                <Callout tone="danger" className="mt-5" icon={<AlertCircle className="h-4 w-4" />}>
                  {authError}
                </Callout>
              )}

              {isForgotPassword ? (
                <div className="mt-6">
                  {forgotPasswordMessage ? (
                    <Callout tone="success" icon={<CheckCircle2 className="h-4 w-4" />}>
                      {forgotPasswordMessage}
                    </Callout>
                  ) : (
                    <form onSubmit={handleForgotPassword} className="space-y-4">
                      <Field label="Email address" htmlFor="cp-forgot-email">
                        <input id="cp-forgot-email" type="email" autoComplete="email" value={forgotPasswordEmail} onChange={(e) => setForgotPasswordEmail(e.target.value)} required className={inputClass} />
                      </Field>
                      <Button type="submit" block size="lg" disabled={isProcessing}>
                        {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send reset link'}
                      </Button>
                    </form>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsForgotPassword(false);
                      setAuthError('');
                      setForgotPasswordMessage('');
                    }}
                    className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-primary"
                  >
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAuthSubmit} className="mt-6 space-y-4">
                  {!isLogin && (
                    <>
                      <Field label="Full name" htmlFor="cp-name">
                        <input id="cp-name" type="text" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} />
                      </Field>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field label="Mobile (optional)" htmlFor="cp-phone" hint="For text updates on the day.">
                          <input id="cp-phone" type="tel" inputMode="tel" autoComplete="tel" value={registerPhone} onChange={(e) => setRegisterPhone(e.target.value)} className={inputClass} />
                        </Field>
                        <Field label="Referral code (optional)" htmlFor="cp-ref" hint="A friend's code gives you credit off your first clean.">
                          <input id="cp-ref" type="text" value={referralCodeInput} onChange={(e) => setReferralCodeInput(e.target.value.toUpperCase())} className={cx(inputClass, 'uppercase')} />
                        </Field>
                      </div>
                    </>
                  )}
                  <Field label="Email address" htmlFor="cp-email">
                    <input id="cp-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required className={inputClass} />
                  </Field>
                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label htmlFor="cp-password" className="text-sm font-medium text-slate-700">
                        Password
                      </label>
                      {isLogin ? (
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPassword(true);
                            setAuthError('');
                            setForgotPasswordEmail(email);
                          }}
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      ) : null}
                    </div>
                    <div className="relative">
                      <input
                        id="cp-password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className={cx(inputClass, 'pr-11')}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                  <Button type="submit" block size="lg" disabled={isProcessing}>
                    {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : isLogin ? 'Sign in' : 'Create account'}
                  </Button>
                  <p className="text-center text-sm text-slate-500">
                    {isLogin ? 'New here?' : 'Already have an account?'}{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsLogin(!isLogin);
                        setRegistrationSuccess(false);
                        setAuthError('');
                      }}
                      className="font-semibold text-primary hover:underline"
                    >
                      {isLogin ? 'Create an account' : 'Sign in'}
                    </button>
                  </p>
                </form>
              )}

              <div className="mt-6 flex items-center gap-3 rounded-xl bg-slate-50 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm ring-1 ring-slate-200">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">Just want to book?</p>
                  <p className="text-xs text-slate-500">No account needed.</p>
                </div>
                <Button size="sm" variant="secondary" onClick={onStartNewBooking}>
                  Book as guest
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  const detail = selectedBookingForDetail;

  return (
    <div className="min-h-screen overflow-x-clip bg-slate-50 font-sans selection:bg-primary/15">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/80 bg-white lg:flex">
        <button type="button" onClick={onBackToWebsite} className="flex items-center px-5 pb-3 pt-5" aria-label="Back to website">
          <BrandLogoMark className="h-12 w-auto object-contain object-left" />
        </button>
        <div className="mx-3 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-3">
          <Avatar name={user?.name || 'Client'} size="sm" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
            <p className="truncate text-xs text-slate-500">{user?.email}</p>
          </div>
        </div>
        <div className="px-3 pt-4">
          <Button block icon={<Plus className="h-4 w-4" />} onClick={onStartNewBooking}>
            Book a clean
          </Button>
        </div>
        <nav className="min-h-0 flex-1 space-y-6 overflow-y-auto px-3 py-5 no-scrollbar" aria-label="Account menu">
          <div className="space-y-1">
            <SideNavBtn active={activeSection === 'home'} onClick={() => goTo('home')} label="Home" icon={<Home className="h-[18px] w-[18px]" />} />
            <SideNavBtn active={activeSection === 'history'} onClick={() => goTo('history')} label="My cleans" icon={<Calendar className="h-[18px] w-[18px]" />} badge={upcomingBookings.length} badgeTone="neutral" />
            <SideNavBtn active={activeSection === 'invoices'} onClick={() => goTo('invoices')} label="Invoices" icon={<CreditCard className="h-[18px] w-[18px]" />} badge={unpaidInvoices.length} />
            <SideNavBtn active={activeSection === 'chats'} onClick={() => goTo('chats')} label="Messages" icon={<MessageSquare className="h-[18px] w-[18px]" />} />
            <SideNavBtn active={activeSection === 'notifications'} onClick={() => goTo('notifications')} label="Alerts" icon={<Bell className="h-[18px] w-[18px]" />} badge={unreadAlerts} />
          </div>
          <div className="space-y-1">
            <p className="px-3 pb-1 text-xs font-medium text-slate-400">Account</p>
            <SideNavBtn active={activeSection === 'referrals'} onClick={() => goTo('referrals')} label="Refer a friend" icon={<Gift className="h-[18px] w-[18px]" />} />
            <SideNavBtn active={activeSection === 'settings'} onClick={() => goTo('settings')} label="Settings" icon={<Settings className="h-[18px] w-[18px]" />} />
          </div>
        </nav>
        <div className="space-y-1 border-t border-slate-100 p-3">
          {onBackToWebsite ? (
            <button type="button" onClick={onBackToWebsite} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-900">
              <ArrowLeft className="h-[18px] w-[18px]" /> Back to website
            </button>
          ) : null}
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-red-50 hover:text-red-600">
            <LogOut className="h-[18px] w-[18px]" /> Sign out
          </button>
        </div>
      </aside>

      <main className="lg:pl-64">
        <div className="mx-auto max-w-5xl px-4 pb-32 pt-4 sm:px-6 lg:px-10 lg:pb-16 lg:pt-10">
          {/* Mobile header */}
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <button type="button" onClick={onBackToWebsite} aria-label="Back to website" className="shrink-0">
              <BrandLogoMark className="h-10 w-auto object-contain" />
            </button>
            <div className="flex-1" />
            {notificationBell('shrink-0')}
          </div>

          {/* Page title */}
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">{pageMeta.title}</h1>
              <p className="mt-1 text-sm text-slate-500">{pageMeta.subtitle}</p>
            </div>
            <div className="hidden items-center gap-2 lg:flex">{notificationBell()}</div>
          </div>

          <div className="animate-in fade-in duration-300">
            {/* ───────── Home ───────── */}
            {activeSection === 'home' && (
              <div className="space-y-6">
                {activeBooking ? (
                  <Card padded={false} className="overflow-hidden">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                        <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> Your clean is today
                      </p>
                      <Button size="sm" variant="ghost" onClick={() => openBooking(activeBooking)}>
                        Details
                      </Button>
                    </div>
                    <React.Suspense fallback={<div className="h-72 animate-pulse bg-slate-100" />}>
                      <CleanerTracker
                        booking={activeBooking}
                        staff={staffList.filter((s) => (activeBooking.assignedStaffIds || []).includes(s.id) || activeBooking.assignedStaffId === s.id)}
                      />
                    </React.Suspense>
                  </Card>
                ) : null}

                {nextVisit ? (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary/75 p-6 text-white shadow-lg shadow-primary/20 sm:p-7">
                    <div className="pointer-events-none absolute -right-14 -top-14 h-52 w-52 rounded-full bg-white/10" aria-hidden />
                    <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/5" aria-hidden />
                    <div className="relative">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">Next clean</span>
                        {relativeDay(nextVisit.date) ? <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-semibold text-primary">{relativeDay(nextVisit.date)}</span> : null}
                        <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold">{nextVisit.status}</span>
                      </div>
                      <p className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{fmtLongDate(nextVisit.date)}</p>
                      <p className="mt-1 text-white/85">
                        {String(nextVisit.time).slice(0, 5)} · {nextVisit.serviceType}
                      </p>
                      <div className="mt-4 grid gap-2 text-sm text-white/90 sm:grid-cols-2">
                        <p className="flex items-start gap-2">
                          <MapPin className="mt-0.5 h-4 w-4 shrink-0" /> {[nextVisit.address?.line1, nextVisit.address?.postcode].filter(Boolean).join(', ')}
                        </p>
                        <p className="flex items-start gap-2">
                          <UserCheck className="mt-0.5 h-4 w-4 shrink-0" /> {staffNamesFor(nextVisit).join(', ') || 'Cleaner to be confirmed'}
                        </p>
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openBooking(nextVisit)}
                          className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:bg-white/90"
                        >
                          View details <ChevronRight className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadBookingIcs(nextVisit)}
                          className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/25"
                        >
                          <Download className="h-4 w-4" /> Add to calendar
                        </button>
                        {canReschedule(nextVisit) ? (
                          <button
                            type="button"
                            onClick={() => openReschedule(nextVisit)}
                            className="inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/25"
                          >
                            <Calendar className="h-4 w-4" /> Move
                          </button>
                        ) : null}
                        {payNowFor(nextVisit).show ? (
                          <a
                            href={nextVisit.stripePaymentLink}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-300"
                          >
                            <CreditCard className="h-4 w-4" /> {payNowFor(nextVisit).pay.payNowLabel}
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Card className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-slate-900">No clean booked yet</p>
                      <p className="text-sm text-slate-500">Pick a date that suits you. It takes about two minutes.</p>
                    </div>
                    <Button icon={<Plus className="h-4 w-4" />} onClick={onStartNewBooking}>
                      Book a clean
                    </Button>
                  </Card>
                )}

                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 [&>*]:min-w-0">
                  <StatTile label="Upcoming" value={upcomingBookings.length} hint="Booked cleans" icon={<Calendar className="h-5 w-5" />} />
                  <StatTile label="Completed" value={pastBookings.length} hint="Cleans with us" icon={<CheckCircle2 className="h-5 w-5" />} accent="bg-emerald-50 text-emerald-600" />
                  <StatTile label="To pay" value={money(amountToPay)} hint={amountToPay > 0 ? 'Deposits and invoices' : 'All paid up'} icon={<Wallet className="h-5 w-5" />} accent="bg-rose-50 text-rose-600" />
                  <StatTile
                    label="Loyalty points"
                    value={user?.loyaltyPoints || 0}
                    hint={(user?.loyaltyPoints || 0) >= 10 ? `Worth £${Math.floor((user?.loyaltyPoints || 0) / 10)} off a clean` : '10 points = £1 off a clean'}
                    icon={<Star className="h-5 w-5" />}
                    accent="bg-amber-50 text-amber-600"
                  />
                </div>

                {(bookingsToPay.length > 0 || unpaidInvoices.length > 0 || bookingsNeedingProof.length > 0 || cleansToRate.length > 0) && (
                  <Card>
                    <SectionHeader title="Needs your attention" subtitle="A few quick things to keep everything on track." />
                    <div className="mt-4 space-y-2">
                      {bookingsToPay.map((b) => (
                        <button
                          key={`pay-${b.id}`}
                          type="button"
                          onClick={() => openBooking(b)}
                          className="flex w-full items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-left ring-1 ring-inset ring-emerald-100 transition hover:bg-emerald-100/70"
                        >
                          <CreditCard className="h-5 w-5 shrink-0 text-emerald-600" />
                          <span className="min-w-0 flex-1 text-sm text-emerald-950">
                            <span className="font-semibold">{payNowFor(b).pay.payNowLabel}</span> for {b.serviceType} on {fmtShortDate(b.date)}
                          </span>
                          <ChevronRight className="h-4 w-4 text-emerald-400" />
                        </button>
                      ))}
                      {unpaidInvoices.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => goTo('invoices')}
                          className="flex w-full items-center gap-3 rounded-xl bg-rose-50 px-4 py-3 text-left ring-1 ring-inset ring-rose-100 transition hover:bg-rose-100/70"
                        >
                          <CreditCard className="h-5 w-5 shrink-0 text-rose-600" />
                          <span className="min-w-0 flex-1 text-sm text-rose-950">
                            <span className="font-semibold">
                              {unpaidInvoices.length} unpaid invoice{unpaidInvoices.length === 1 ? '' : 's'}
                            </span>{' '}
                            · {money(unpaidInvoices.reduce((s, i) => s + Number(i.total || 0), 0))}
                          </span>
                          <ChevronRight className="h-4 w-4 text-rose-400" />
                        </button>
                      ) : null}
                      {bookingsNeedingProof.map((b) => (
                        <button
                          key={`proof-${b.id}`}
                          type="button"
                          onClick={() => openBooking(b)}
                          className="flex w-full items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-left ring-1 ring-inset ring-amber-100 transition hover:bg-amber-100/70"
                        >
                          <Upload className="h-5 w-5 shrink-0 text-amber-600" />
                          <span className="min-w-0 flex-1 text-sm text-amber-950">
                            <span className="font-semibold">Upload payment proof</span> for {b.serviceType} on {fmtShortDate(b.date)}
                          </span>
                          <ChevronRight className="h-4 w-4 text-amber-400" />
                        </button>
                      ))}
                      {cleansToRate.slice(0, 2).map((b) => (
                        <button
                          key={`rate-${b.id}`}
                          type="button"
                          onClick={() => {
                            setStarCount(5);
                            setFeedback('');
                            setRatingBooking(b);
                          }}
                          className="flex w-full items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 text-left ring-1 ring-inset ring-slate-200 transition hover:bg-slate-100"
                        >
                          <Star className="h-5 w-5 shrink-0 text-amber-500" />
                          <span className="min-w-0 flex-1 text-sm text-slate-800">
                            <span className="font-semibold">How did we do?</span> Rate your {b.serviceType} on {fmtShortDate(b.date)}
                          </span>
                          <ChevronRight className="h-4 w-4 text-slate-300" />
                        </button>
                      ))}
                    </div>
                  </Card>
                )}

                {nextVisitPrep.length > 0 && nextVisit ? (
                  <Card>
                    <SectionHeader title="Before we arrive" subtitle={`A few tips for your ${nextVisit.serviceType}.`} />
                    <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                      {nextVisitPrep.map((tip, i) => (
                        <li key={i} className="flex items-start gap-2.5 rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-700">
                          <ClipboardCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> {tip}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ) : null}

                <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
                  {lastCompleted ? (
                    <Card className="flex flex-col">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                          <Repeat className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900">Book the same again</p>
                          <p className="truncate text-sm text-slate-500">
                            {lastCompleted.serviceType} · last on {fmtShortDate(lastCompleted.date)}
                          </p>
                        </div>
                      </div>
                      <Button className="mt-4 self-start" variant="secondary" icon={<Repeat className="h-4 w-4" />} onClick={() => onReorder(lastCompleted)}>
                        Book again
                      </Button>
                    </Card>
                  ) : null}
                  <Card className="flex flex-col bg-gradient-to-br from-amber-50 to-white">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                        <Gift className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">Refer a friend</p>
                        <p className="text-sm text-slate-500">Share your code and earn a reward.</p>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <span className="flex-1 rounded-xl border border-dashed border-amber-300 bg-white px-3 py-2 text-center font-mono text-base font-semibold tracking-widest text-slate-900">
                        {user?.referralCode || 'N/A'}
                      </span>
                      <Button variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => void copyReferral()}>
                        Copy
                      </Button>
                    </div>
                  </Card>
                </div>

                {upcomingBookings.length > 1 ? (
                  <div>
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-slate-900">Also coming up</h2>
                      <Button size="sm" variant="ghost" onClick={() => goTo('history')}>
                        See all
                      </Button>
                    </div>
                    <div className="space-y-3">{upcomingBookings.slice(1, 4).map(renderBookingCard)}</div>
                  </div>
                ) : null}
              </div>
            )}

            {/* ───────── My cleans ───────── */}
            {activeSection === 'history' && (
              <div className="space-y-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <Segmented
                    value={cleansFilter}
                    onChange={setCleansFilter}
                    items={[
                      { id: 'upcoming', label: 'Upcoming', count: upcomingBookings.length },
                      { id: 'past', label: 'Past', count: pastBookings.length },
                      { id: 'cancelled', label: 'Cancelled', count: cancelledBookings.length },
                    ]}
                  />
                  <Button icon={<Plus className="h-4 w-4" />} onClick={onStartNewBooking} className="hidden sm:inline-flex">
                    Book a clean
                  </Button>
                </div>
                {(() => {
                  const list = cleansFilter === 'upcoming' ? upcomingBookings : cleansFilter === 'past' ? pastBookings : cancelledBookings;
                  if (!list.length) {
                    return (
                      <EmptyState
                        icon={<Calendar className="h-6 w-6" />}
                        title={cleansFilter === 'upcoming' ? 'No upcoming cleans' : cleansFilter === 'past' ? 'No completed cleans yet' : 'No cancelled cleans'}
                        body={cleansFilter === 'upcoming' ? 'Book your next clean and it will show here.' : undefined}
                        action={
                          cleansFilter === 'upcoming' ? (
                            <Button icon={<Plus className="h-4 w-4" />} onClick={onStartNewBooking}>
                              Book a clean
                            </Button>
                          ) : undefined
                        }
                      />
                    );
                  }
                  return <div className="space-y-3">{list.map(renderBookingCard)}</div>;
                })()}
              </div>
            )}

            {/* ───────── Invoices ───────── */}
            {activeSection === 'invoices' && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <StatTile label="Unpaid" value={unpaidInvoices.length} hint={money(unpaidInvoices.reduce((s, i) => s + Number(i.total || 0), 0))} icon={<CreditCard className="h-5 w-5" />} accent="bg-rose-50 text-rose-600" />
                  <StatTile
                    label="Paid"
                    value={customerInvoicesList.length - unpaidInvoices.length}
                    hint={money(customerInvoicesList.filter((i) => i.status === 'paid').reduce((s, i) => s + Number(i.total || 0), 0))}
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    accent="bg-emerald-50 text-emerald-600"
                  />
                </div>
                {customerInvoicesList.length === 0 ? (
                  <EmptyState icon={<CreditCard className="h-6 w-6" />} title="No invoices yet" body="Invoices for your cleans will appear here." />
                ) : (
                  <Card padded={false} className="divide-y divide-slate-100 overflow-hidden">
                    {customerInvoicesList.map((inv) => {
                      const payHref = inv.stripePaymentUrl || (inv.id ? `/pay/invoice/${inv.id}` : '');
                      return (
                        <div key={inv.id} className="p-4 sm:p-5">
                          <div className="flex items-start gap-3">
                            <div className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', inv.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600')}>
                              <CreditCard className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold text-slate-900">{inv.invoiceNumber}</p>
                                <Badge tone={inv.status === 'paid' ? 'success' : inv.status === 'overdue' ? 'danger' : inv.status === 'sent' ? 'info' : 'warning'} dot>
                                  {String(inv.status || 'pending').replace(/^\w/, (c: string) => c.toUpperCase())}
                                </Badge>
                              </div>
                              <p className="mt-0.5 text-sm text-slate-500">
                                {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                                {inv.dueDate ? ` · Due ${inv.dueDate}` : ''}
                              </p>
                            </div>
                            <p className="shrink-0 text-lg font-semibold tabular-nums text-slate-900">{money(Number(inv.total || 0))}</p>
                          </div>
                          {inv.notes && String(inv.notes).trim() ? (
                            <Callout tone="neutral" className="mt-3" title="Note from us">
                              <span className="whitespace-pre-line">{inv.notes}</span>
                            </Callout>
                          ) : null}
                          {inv.status !== 'paid' && payHref ? (
                            <div className="mt-3 flex justify-end">
                              <a
                                href={payHref}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
                              >
                                <CreditCard className="h-4 w-4" /> Pay now <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </Card>
                )}
              </div>
            )}

            {/* ───────── Alerts ───────── */}
            {activeSection === 'notifications' && (
              <div>
                {notifications.length === 0 ? (
                  <EmptyState icon={<Bell className="h-6 w-6" />} title="You are all caught up" body="Booking updates and messages from us will appear here." />
                ) : (
                  <Card padded={false} className="divide-y divide-slate-100 overflow-hidden">
                    {notifications.map((n) => {
                      const unread = !n.read && !n.isRead;
                      return (
                        <div key={n.id} className={cx('flex items-start gap-3 p-4 sm:p-5', unread && 'bg-primary/[0.03]')}>
                          <div className={cx('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', unread ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-400')}>
                            <Bell className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className={cx('text-sm', unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700')}>{n.title || 'Update'}</p>
                              <span className="shrink-0 text-xs text-slate-400">{n.createdAt ? new Date(n.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                            </div>
                            <p className={cx('mt-0.5 text-sm leading-relaxed', unread ? 'text-slate-700' : 'text-slate-500')}>{n.message}</p>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                await apiClient.deleteNotification(Number(n.id));
                                setNotifications((prev) => prev.filter((x) => String(x.id) !== String(n.id)));
                              } catch (err) {
                                showFlyer(err instanceof Error ? err.message : 'Failed to delete notification', 'error');
                              }
                            }}
                            className="shrink-0 rounded-lg p-1.5 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                            aria-label="Delete alert"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      );
                    })}
                  </Card>
                )}
              </div>
            )}

            {/* ───────── Settings ───────── */}
            {activeSection === 'settings' && user && (
              <div className="space-y-5">
                <Card>
                  <SectionHeader
                    title="Your details"
                    subtitle="We use these for bookings, invoices and updates."
                    action={
                      !isEditingProfile ? (
                        <Button size="sm" variant="secondary" onClick={() => setIsEditingProfile(true)}>
                          Edit
                        </Button>
                      ) : (
                        <Badge tone="success" dot>
                          <ShieldCheck className="h-3 w-3" /> Verified
                        </Badge>
                      )
                    }
                  />
                  {isEditingProfile ? (
                    <div className="mt-5 grid gap-4 sm:grid-cols-2">
                      <Field label="Full name" htmlFor="cp-edit-name">
                        <input id="cp-edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} className={inputClass} />
                      </Field>
                      <Field label="Email" htmlFor="cp-edit-email">
                        <input id="cp-edit-email" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} className={inputClass} />
                      </Field>
                      <Field label="Mobile" htmlFor="cp-edit-phone">
                        <input id="cp-edit-phone" type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="e.g. 07700 900123" className={inputClass} />
                      </Field>
                      <Field label="Postcode" htmlFor="cp-edit-postcode">
                        <div className="flex gap-2">
                          <input
                            id="cp-edit-postcode"
                            value={editPostcode}
                            onChange={(e) => {
                              setEditPostcode(e.target.value.toUpperCase());
                              setPostcodeLookup({ loading: false, note: null, error: null });
                            }}
                            placeholder="e.g. SW1A 1AA"
                            className={cx(inputClass, 'uppercase')}
                          />
                          <Button variant="secondary" onClick={handlePostcodeLookup} disabled={postcodeLookup.loading || !editPostcode.trim()}>
                            {postcodeLookup.loading ? 'Checking…' : 'Check'}
                          </Button>
                        </div>
                        {postcodeLookup.note ? <p className="mt-1 text-xs font-medium text-emerald-600">{postcodeLookup.note}</p> : null}
                        {postcodeLookup.error ? <p className="mt-1 text-xs font-medium text-red-600">{postcodeLookup.error}</p> : null}
                      </Field>
                      <Field label="Home address" htmlFor="cp-edit-address" className="sm:col-span-2">
                        <textarea id="cp-edit-address" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} placeholder="Street, building, flat" rows={2} className={cx(inputClass, 'resize-none')} />
                      </Field>
                      <div className="flex gap-2 sm:col-span-2">
                        <Button disabled={isSavingProfile} onClick={handleProfileSave}>
                          {isSavingProfile ? 'Saving…' : 'Save changes'}
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={isSavingProfile}
                          onClick={() => {
                            setIsEditingProfile(false);
                            setPostcodeLookup({ loading: false, note: null, error: null });
                            setEditName(user.name);
                            setEditEmail(user.email);
                            setEditPhone(user.phone || '');
                            setEditAddress(user.address || '');
                            setEditPostcode(user.postcode || '');
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <InfoItem label="Full name" value={user.name} icon={<UserIcon className="h-4 w-4" />} />
                      <InfoItem label="Email" value={user.email} icon={<Mail className="h-4 w-4" />} />
                      <InfoItem label="Mobile" value={user.phone || <span className="font-normal text-slate-400">Not added</span>} icon={<Phone className="h-4 w-4" />} />
                      <InfoItem label="Postcode" value={user.postcode || <span className="font-normal text-slate-400">Not added</span>} icon={<MapPin className="h-4 w-4" />} />
                      <InfoItem label="Home address" value={user.address || <span className="font-normal text-slate-400">Not added</span>} icon={<Home className="h-4 w-4" />} className="sm:col-span-2" />
                    </div>
                  )}
                </Card>

                {!isEditingProfile && (
                  <Card>
                    <SectionHeader title="Change password" subtitle="Use at least 8 characters. You stay signed in after changing it." />
                    <div className="mt-5 grid gap-4 sm:grid-cols-3">
                      <Field label="Current password" htmlFor="cp-pw-current">
                        <input id="cp-pw-current" type="password" autoComplete="current-password" value={passwordForm.current} onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))} className={inputClass} />
                      </Field>
                      <Field label="New password" htmlFor="cp-pw-next">
                        <input id="cp-pw-next" type="password" autoComplete="new-password" value={passwordForm.next} onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))} className={inputClass} />
                      </Field>
                      <Field label="Confirm new password" htmlFor="cp-pw-confirm">
                        <input id="cp-pw-confirm" type="password" autoComplete="new-password" value={passwordForm.confirm} onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))} className={inputClass} />
                      </Field>
                    </div>
                    <Button className="mt-4" variant="dark" onClick={handlePasswordSave} disabled={passwordForm.saving} icon={<Lock className="h-4 w-4" />}>
                      {passwordForm.saving ? 'Updating…' : 'Update password'}
                    </Button>
                  </Card>
                )}

                <Card>
                  <SectionHeader title="Messages from us" subtitle="Booking updates are always sent so you never miss a change." />
                  <div className="mt-4 divide-y divide-slate-100">
                    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
                      <span>
                        <span className="block text-sm font-medium text-slate-900">Booking updates and schedule changes</span>
                        <span className="block text-xs text-slate-500">Reminders, cleaner on the way, changes to your booking.</span>
                      </span>
                      <input type="checkbox" className="h-5 w-5 rounded accent-primary" checked={clientPrefs.notifyBooking} onChange={(e) => persistClientPrefs({ ...clientPrefs, notifyBooking: e.target.checked })} />
                    </label>
                    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
                      <span>
                        <span className="block text-sm font-medium text-slate-900">Offers and news</span>
                        <span className="block text-xs text-slate-500">Occasional discounts. Change this any time.</span>
                      </span>
                      <input type="checkbox" className="h-5 w-5 rounded accent-primary" checked={Boolean(user.marketingOptIn)} onChange={(e) => void saveMarketingOptIn(e.target.checked)} />
                    </label>
                  </div>
                </Card>

                <AccountDataControls api={apiClient} onDeleted={() => onLogout?.()} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] sm:p-6" />
              </div>
            )}

            {/* ───────── Messages ───────── */}
            {activeSection === 'chats' && (
              <Card padded={false} className="overflow-hidden">
                <div className="grid min-h-[560px] grid-cols-[minmax(0,1fr)] lg:grid-cols-[300px_minmax(0,1fr)]">
                  <div className={cx('min-w-0 border-r border-slate-100', mobileChatView === 'chat' && activeChatBooking ? 'hidden lg:block' : 'block')}>
                    <div className="border-b border-slate-100 px-4 py-3">
                      <p className="text-sm font-semibold text-slate-900">Your bookings</p>
                      <p className="text-xs text-slate-500">Chat opens 10 minutes before each clean.</p>
                    </div>
                    <div className="max-h-[560px] space-y-1 overflow-y-auto p-2">
                      {chatEligibleBookings.length === 0 ? (
                        <p className="px-3 py-10 text-center text-sm text-slate-500">Once a cleaner is assigned to a booking, you can chat here.</p>
                      ) : (
                        chatEligibleBookings.map((b) => {
                          const on = activeChatBooking?.id === b.id;
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => {
                                setActiveChatBooking(b);
                                setMobileChatView('chat');
                                void loadChat(b.id);
                              }}
                              className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition', on ? 'bg-primary/10' : 'hover:bg-slate-50')}
                            >
                              <div className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', on ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-500')}>
                                <MessageSquare className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <p className={cx('truncate text-sm font-medium', on ? 'text-primary' : 'text-slate-900')}>{b.serviceType}</p>
                                <p className="truncate text-xs text-slate-500">
                                  {fmtShortDate(b.date)} · {String(b.time).slice(0, 5)}
                                </p>
                              </div>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                  <div className={cx('min-w-0 flex-col', mobileChatView === 'chat' && activeChatBooking ? 'flex' : 'hidden lg:flex')}>
                    {!activeChatBooking ? (
                      <div className="flex flex-1 items-center justify-center p-10">
                        <EmptyState icon={<MessageSquare className="h-6 w-6" />} title="Pick a booking" body="Choose a booking on the left to chat with your cleaner and our team." className="border-0 bg-transparent" />
                      </div>
                    ) : (
                      <>
                        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3">
                          <button type="button" onClick={() => setMobileChatView('list')} className="-ml-1 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label="Back to chats">
                            <ArrowLeft className="h-5 w-5" />
                          </button>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{activeChatBooking.serviceType}</p>
                            <p className="truncate text-xs text-slate-500">
                              {fmtShortDate(activeChatBooking.date)} · {String(activeChatBooking.time).slice(0, 5)}
                              {activeChatStaffNames.length ? ` · ${activeChatStaffNames.join(', ')}` : ''}
                            </p>
                          </div>
                        </div>
                        {!chatCanStart && !canBookingChatStart(activeChatBooking) ? (
                          <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-800">Chat opens 10 minutes before your clean starts.</div>
                        ) : null}
                        {chatClosedByAdmin ? <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium text-slate-600">This chat has been closed by our team.</div> : null}
                        <div className="min-h-[320px] flex-1 space-y-3 overflow-y-auto bg-slate-50/60 p-4">
                          {chatMessages.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No messages yet.</p> : null}
                          {chatMessages.map((m) => {
                            const own = m.senderRole === 'customer';
                            return (
                              <div key={m.id} className={cx('flex flex-col', own ? 'items-end' : 'items-start')}>
                                <span className="mb-0.5 px-1 text-[11px] text-slate-400">{own ? 'You' : m.senderRole === 'admin' ? `${m.senderName} · Office` : m.senderName}</span>
                                <div className={cx('max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm shadow-sm', own ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200')}>
                                  {m.text}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex gap-2 border-t border-slate-100 p-3">
                          <input
                            value={chatMessage}
                            onChange={(e) => setChatMessage(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') sendChat();
                            }}
                            disabled={chatClosedByAdmin || !chatCanStart}
                            placeholder={chatClosedByAdmin || !chatCanStart ? 'Chat is not open right now' : 'Type a message…'}
                            className={cx(inputClass, 'flex-1')}
                          />
                          <Button onClick={sendChat} disabled={chatClosedByAdmin || !chatCanStart || !chatMessage.trim()} icon={<Send className="h-4 w-4" />} aria-label="Send">
                            <span className="hidden sm:inline">Send</span>
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </Card>
            )}

            {/* ───────── Referrals ───────── */}
            {activeSection === 'referrals' && (
              <div className="space-y-5">
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-6 text-white shadow-lg shadow-amber-500/20">
                  <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15" aria-hidden />
                  <p className="text-sm font-medium text-white/90">Your referral code</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="rounded-xl bg-white/20 px-4 py-2 font-mono text-2xl font-semibold tracking-widest">{user?.referralCode || 'N/A'}</span>
                    <button type="button" onClick={() => void copyReferral()} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-orange-600 shadow-sm hover:bg-white/90">
                      <Copy className="h-4 w-4" /> Copy code
                    </button>
                  </div>
                  <p className="mt-3 text-sm text-white/90">
                    Friends enter it when they create their account. You get {money(referralSummary?.rewardAmount ?? 20)} cleaning credit when they complete their first clean.
                  </p>
                </div>
                <Card className="border-emerald-200 bg-emerald-50/70">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Your cleaning credit</p>
                      <p className="mt-1 text-3xl font-semibold tabular-nums text-emerald-900">{money(referralSummary?.credit?.balance ?? 0)}</p>
                      <p className="mt-1 text-sm text-emerald-800">
                        {(referralSummary?.credit?.balance ?? 0) > 0
                          ? 'Comes off your next booking automatically.'
                          : 'Credit appears here when a friend has their first clean.'}
                        {referralSummary?.pending ? ` ${money(referralSummary.pending)} on its way.` : ''}
                      </p>
                      <p className="mt-1 text-xs text-emerald-700">Can only be used towards your cleaning. No cash value.</p>
                    </div>
                    {(referralSummary?.credit?.balance ?? 0) > 0 ? (
                      <Button icon={<Plus className="h-4 w-4" />} onClick={onStartNewBooking}>
                        Book a clean
                      </Button>
                    ) : null}
                  </div>
                </Card>
                <div className="grid grid-cols-2 gap-3">
                  <StatTile label="Friends referred" value={referrals.length} icon={<Gift className="h-5 w-5" />} accent="bg-amber-50 text-amber-600" />
                  <StatTile
                    label="Credit earned"
                    value={money(referralSummary?.unlocked ?? referrals.filter((r) => r.status === 'Completed' || r.status === 'Paid Out').reduce((sum, r) => sum + Number(r.rewardAmount || 0), 0))}
                    hint={referralSummary?.credit?.used ? `${money(referralSummary.credit.used)} used so far` : undefined}
                    icon={<Wallet className="h-5 w-5" />}
                    accent="bg-emerald-50 text-emerald-600"
                  />
                </div>
                {referrals.length === 0 ? (
                  <EmptyState icon={<Gift className="h-6 w-6" />} title="No referrals yet" body="Share your code with friends and family to start earning." />
                ) : (
                  <Card padded={false} className="divide-y divide-slate-100 overflow-hidden">
                    {referrals.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 p-4 sm:p-5">
                        <Avatar name={r.referredClientName || '?'} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-900">{r.referredClientName}</p>
                          <p className="text-xs text-slate-500">Referred {new Date(r.dateReferred).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold tabular-nums text-slate-900">{money(Number(r.rewardAmount || 0))}</p>
                          <Badge tone={r.status === 'Completed' || r.status === 'Paid Out' ? 'success' : r.status === 'Rejected' ? 'neutral' : 'warning'}>
                            {r.status === 'Completed' || r.status === 'Paid Out' ? 'Credit added' : r.status === 'Rejected' ? 'Not eligible' : 'Waiting for first clean'}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Mobile "More" sheet */}
      {isMobilePortalMenuOpen && (
        <div className="fixed inset-0 z-[95] flex flex-col justify-end lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px] animate-in fade-in duration-200" onClick={() => setIsMobilePortalMenuOpen(false)} />
          <div className="relative rounded-t-3xl bg-white shadow-2xl animate-in slide-in-from-bottom-4 duration-300" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}>
            <div className="flex justify-center pb-1 pt-3">
              <div className="h-1 w-9 rounded-full bg-slate-200" />
            </div>
            <div className="px-4 pb-4">
              <div className="mb-2 flex items-center gap-3 rounded-2xl bg-slate-50 p-3">
                <Avatar name={user?.name || 'Client'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-900">{user?.name}</p>
                  <p className="truncate text-xs text-slate-500">{user?.email}</p>
                </div>
                <button type="button" onClick={() => setIsMobilePortalMenuOpen(false)} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-200" aria-label="Close menu">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-1">
                <MoreSheetItem active={activeSection === 'invoices'} onClick={() => goTo('invoices')} label="Invoices" icon={<CreditCard className="h-5 w-5" />} badge={unpaidInvoices.length} />
                <MoreSheetItem active={activeSection === 'notifications'} onClick={() => goTo('notifications')} label="Alerts" icon={<Bell className="h-5 w-5" />} badge={unreadAlerts} />
                <MoreSheetItem active={activeSection === 'referrals'} onClick={() => goTo('referrals')} label="Refer a friend" icon={<Gift className="h-5 w-5" />} />
                <MoreSheetItem active={activeSection === 'settings'} onClick={() => goTo('settings')} label="Account settings" icon={<Settings className="h-5 w-5" />} />
                {onBackToWebsite ? <MoreSheetItem active={false} onClick={onBackToWebsite} label="Back to website" icon={<ArrowLeft className="h-5 w-5" />} /> : null}
              </div>
              <div className="mt-2 border-t border-slate-100 pt-2">
                <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-red-600 transition hover:bg-red-50">
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
      {!detail && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl lg:hidden" style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)' }} aria-label="Account menu">
          <div className="flex items-stretch justify-around px-1 pb-1 pt-1.5">
            <BottomNavBtn active={activeSection === 'home'} onClick={() => goTo('home')} label="Home" icon={<Home className="h-[22px] w-[22px]" />} />
            <BottomNavBtn active={activeSection === 'history'} onClick={() => goTo('history')} label="Cleans" icon={<Calendar className="h-[22px] w-[22px]" />} />
            <button type="button" onClick={onStartNewBooking} className="flex min-w-[3.75rem] flex-col items-center justify-center gap-0.5 px-2" aria-label="Book a clean">
              <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-white">
                <Plus className="h-6 w-6" />
              </span>
              <span className="text-[11px] font-medium leading-tight text-primary">Book</span>
            </button>
            <BottomNavBtn active={activeSection === 'chats'} onClick={() => goTo('chats')} label="Messages" icon={<MessageSquare className="h-[22px] w-[22px]" />} />
            <BottomNavBtn active={isMoreSection} onClick={() => setIsMobilePortalMenuOpen((v) => !v)} label="More" icon={<Menu className="h-[22px] w-[22px]" />} badge={unpaidInvoices.length + unreadAlerts} />
          </div>
        </nav>
      )}

      {/* ───────── Booking details (full page) ───────── */}
      {detail && (
        <div className="fixed inset-0 z-[120] flex min-h-0 flex-col bg-slate-50 animate-in fade-in duration-200">
          <header className="shrink-0 border-b border-slate-200/80 bg-white/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-6">
            <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (viewMode !== 'details') setViewMode('details');
                  else {
                    setSelectedBookingForDetail(null);
                    setViewMode('details');
                  }
                }}
                className="rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{viewMode === 'details' ? detail.serviceType : viewMode === 'invoice' ? 'Invoice and receipt' : 'Booking confirmation'}</p>
                <p className="truncate text-xs text-slate-500">
                  {fmtShortDate(detail.date)} · {String(detail.time).slice(0, 5)}
                  {detail.bookingId ? ` · ${detail.bookingId}` : ''}
                </p>
              </div>
              <Badge tone={statusTone(detail.status)} dot className="hidden sm:inline-flex">
                {detail.status}
              </Badge>
              <button
                type="button"
                onClick={() => {
                  setSelectedBookingForDetail(null);
                  setViewMode('details');
                }}
                className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-3xl space-y-5 px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pt-8">
              {viewMode === 'details' && (
                <>
                  {payNowFor(detail).show ? (
                    <a
                      href={detail.stripePaymentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-4 rounded-2xl bg-emerald-600 p-4 text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 sm:p-5"
                    >
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/15">
                        <CreditCard className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{payNowFor(detail).pay.payNowLabel}</p>
                        <p className="text-sm text-white/85">
                          {payNowFor(detail).pay.stage === 'unpaid' ? 'Deposit or pay in full · secure card payment' : 'Balance after your clean · secure card payment'}
                        </p>
                      </div>
                      <ExternalLink className="h-5 w-5 text-white/70" />
                    </a>
                  ) : null}

                  {bookingPaymentState(detail, portalDepositPercent).stage !== 'unpaid' ? (
                    (() => {
                      const pay = bookingPaymentState(detail, portalDepositPercent);
                      return (
                        <Callout tone="success" icon={<CheckCircle2 className="h-4 w-4" />} title={pay.stage === 'paid' ? 'Paid in full' : `Deposit paid: ${money(pay.amountPaid)}`}>
                          {pay.stage === 'paid' ? `${money(pay.total)} received, thank you!` : `Balance of ${money(pay.balanceDue)} is due after your clean.`}
                        </Callout>
                      );
                    })()
                  ) : null}

                  <Card>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <InfoItem label="Service" value={detail.serviceType} icon={<Sparkles className="h-4 w-4" />} />
                      <InfoItem label="Date and time" value={`${fmtLongDate(detail.date)} at ${String(detail.time).slice(0, 5)}`} icon={<Clock className="h-4 w-4" />} />
                      <InfoItem label="Address" value={[detail.address?.line1, detail.address?.city, detail.address?.postcode].filter(Boolean).join(', ')} icon={<MapPin className="h-4 w-4" />} />
                      <InfoItem label="Total" value={money(Number(detail.totalPrice))} icon={<CreditCard className="h-4 w-4" />} />
                    </div>
                    <div className="mt-4 overflow-hidden rounded-xl">
                      <React.Suspense fallback={<div className="h-[200px] w-full animate-pulse rounded-xl bg-slate-100" />}>
                        <AddressMap address={[detail.address?.line1, detail.address?.city, detail.address?.postcode].filter(Boolean).join(', ')} height="200px" />
                      </React.Suspense>
                    </div>
                  </Card>

                  <Card>
                    <SectionHeader title="Your cleaner" />
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {(detail.assignedStaffIds || (detail.assignedStaffId ? [detail.assignedStaffId] : [])).map((id) => {
                        const s = staffList.find((st) => st.id === id);
                        if (!s) return null;
                        const verified = !(s.isVerified === false || s.status !== 'Active');
                        return (
                          <div key={id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3">
                            <Avatar src={s.profilePhoto} name={s.name} />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900">{s.name}</p>
                              <p className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="inline-flex items-center gap-0.5 text-amber-600">
                                  <Star className="h-3 w-3 fill-current" /> {s.rating != null ? Number(s.rating).toFixed(1) : 'New'}
                                </span>
                                <span className={verified ? 'text-emerald-600' : 'text-amber-600'}>{verified ? 'Verified' : 'Being verified'}</span>
                              </p>
                            </div>
                          </div>
                        );
                      })}
                      {!(detail.assignedStaffIds?.length || detail.assignedStaffId) ? <p className="text-sm text-slate-500">We are choosing the best cleaner for you and will confirm soon.</p> : null}
                    </div>
                  </Card>

                  {detail.instructions ? (
                    <Callout tone="primary" icon={<Info className="h-4 w-4" />} title="Your instructions">
                      {detail.instructions}
                    </Callout>
                  ) : null}

                  {user && (detail.depositTermsAcceptedAt || detail.shortNoticeCancelFeeConsentedAt) && (
                    <Card>
                      <SectionHeader title="Payment proof" subtitle="After paying by bank transfer, upload a screenshot or PDF so we can match it to this booking." />
                      <p className="mt-2 text-sm text-slate-600">
                        You agreed to our {detail.depositTermsAcceptedAt ? <strong>deposit terms</strong> : null}
                        {detail.depositTermsAcceptedAt && detail.shortNoticeCancelFeeConsentedAt ? ' and ' : null}
                        {detail.shortNoticeCancelFeeConsentedAt ? <strong>short-notice cancellation fee</strong> : null}. Include the reference, date and amount if you can. Images or PDF, up to{' '}
                        {MAX_FEE_EVIDENCE_FILES} files, 4 MB each.
                      </p>
                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        {detail.depositTermsAcceptedAt && detail.shortNoticeCancelFeeConsentedAt ? (
                          <Field label="What is this file for?" htmlFor="cp-proof-kind">
                            <select id="cp-proof-kind" value={feeEvidenceKind} onChange={(e) => setFeeEvidenceKind(e.target.value as 'deposit' | 'cancellation_fee')} className={inputClass}>
                              <option value="deposit">Deposit payment</option>
                              <option value="cancellation_fee">Cancellation fee payment</option>
                            </select>
                          </Field>
                        ) : (
                          <InfoItem label="Proof for" value={detail.depositTermsAcceptedAt ? 'Deposit payment' : 'Cancellation fee payment'} />
                        )}
                        <Field label="Note for us (optional)" htmlFor="cp-proof-note">
                          <input id="cp-proof-note" value={feeEvidenceNote} onChange={(e) => setFeeEvidenceNote(e.target.value)} maxLength={500} placeholder="e.g. Paid from account ending 1234" className={inputClass} />
                        </Field>
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <label className={cx('inline-flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50', feeEvidenceSaving && 'pointer-events-none opacity-50')}>
                          <input type="file" accept="image/*,application/pdf" className="hidden" disabled={feeEvidenceSaving} onChange={handleFeeEvidenceFileChange} />
                          <Upload className="h-4 w-4" /> Choose file
                        </label>
                        <Button onClick={handleFeeEvidenceUploadSubmit} disabled={feeEvidenceSaving || !feeEvidencePendingFile}>
                          {feeEvidenceSaving ? 'Uploading…' : 'Send proof'}
                        </Button>
                        {feeEvidencePendingFile ? <span className="text-xs font-medium text-primary">{feeEvidencePendingFile.name}</span> : null}
                        <span className="text-xs text-slate-500">
                          {detail.paymentFeeEvidence?.items?.length ?? 0} of {MAX_FEE_EVIDENCE_FILES} uploaded
                        </span>
                      </div>
                      {detail.paymentFeeEvidence?.items?.length ? (
                        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                          {detail.paymentFeeEvidence.items.map((it, idx) => (
                            <li key={`${it.uploadedAt}-${idx}`} className="flex gap-3 rounded-xl bg-slate-50 p-3">
                              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
                                {it.dataUrl?.toLowerCase().startsWith('data:image/') ? (
                                  <img src={it.dataUrl} alt="" className="h-full w-full object-cover" />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500">PDF</div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-semibold text-primary">{it.kind === 'cancellation_fee' ? 'Cancellation fee' : 'Deposit'}</p>
                                <p className="truncate text-sm text-slate-800">{it.fileName || 'File'}</p>
                                <p className="text-xs text-slate-500">{new Date(it.uploadedAt).toLocaleString('en-GB')}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </Card>
                  )}

                  <div className="grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => setViewMode('confirmation')} className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-md">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                        <ShieldCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">Booking confirmation</p>
                        <p className="text-xs text-slate-500">View and download</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary" />
                    </button>
                    <button type="button" onClick={() => setViewMode('invoice')} className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 text-left transition hover:border-slate-300 hover:shadow-md">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Download className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">Invoice INV-{String(detail.bookingId).slice(-4)}</p>
                        <p className="text-xs text-slate-500">View and pay</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-primary" />
                    </button>
                  </div>

                  {isOpenBooking(detail) && getHoursUntilBooking(detail.date, detail.time) > 0 ? (
                    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">Need to change this booking?</p>
                        <p className="text-sm text-slate-500">
                          Move it up to {RESCHEDULE_NOTICE_HOURS} hours before. Cancelling within {shortNoticeWindowHours} hours has a {shortNoticeFeePercent}% fee.
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Button
                          variant="secondary"
                          icon={<Calendar className="h-4 w-4" />}
                          disabled={!canReschedule(detail)}
                          onClick={() => {
                            if (!canReschedule(detail)) return;
                            const b = detail;
                            setSelectedBookingForDetail(null);
                            openReschedule(b);
                          }}
                        >
                          Move
                        </Button>
                        <Button
                          variant={isCancellable(detail.date, detail.time) ? 'danger' : 'warning'}
                          icon={<Trash2 className="h-4 w-4" />}
                          onClick={() => {
                            setSelectedBookingForDetail(null);
                            setCancellingBooking(detail);
                            setShortNoticeConsentChecked(false);
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </Card>
                  ) : detail.status === BookingStatus.COMPLETED ? (
                    <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">Happy with this clean?</p>
                        <p className="text-sm text-slate-500">Book the same again in a couple of taps.</p>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {!(detail.rating != null && detail.rating >= 1) ? (
                          <Button
                            variant="warning"
                            icon={<Star className="h-4 w-4" />}
                            onClick={() => {
                              setStarCount(5);
                              setFeedback('');
                              setRatingBooking(detail);
                            }}
                          >
                            Rate
                          </Button>
                        ) : null}
                        <Button icon={<Repeat className="h-4 w-4" />} onClick={() => onReorder(detail)}>
                          Book again
                        </Button>
                      </div>
                    </Card>
                  ) : null}
                </>
              )}

              {viewMode === 'confirmation' && (
                <>
                  <BookingConfirmation
                    booking={detail}
                    services={services}
                    extrasList={extras}
                    isModal
                    depositConsent={{
                      variant: 'record',
                      acceptedAt: detail.depositTermsAcceptedAt,
                      onAcknowledge: detail.depositTermsAcceptedAt
                        ? undefined
                        : async () => {
                            const b = detail;
                            const r = await apiClient.updateBooking(b.id, { depositTermsAcknowledged: true });
                            onUpdateBooking({ ...b, depositTermsAcceptedAt: r.depositTermsAcceptedAt ?? new Date().toISOString() });
                            showFlyer('Agreement saved on your booking.', 'success');
                          },
                    }}
                  />
                </>
              )}

              {viewMode === 'invoice' && (
                <Card>
                  <InvoiceView
                    booking={detail}
                    serviceConfig={services.find((s) => s.id === detail.serviceType || s.name === detail.serviceType)}
                    extrasConfig={extras}
                    total={detail.totalPrice}
                    depositConsent={{
                      variant: 'record',
                      acceptedAt: detail.depositTermsAcceptedAt,
                      onAcknowledge: detail.depositTermsAcceptedAt
                        ? undefined
                        : async () => {
                            const b = detail;
                            const r = await apiClient.updateBooking(b.id, { depositTermsAcknowledged: true });
                            onUpdateBooking({ ...b, depositTermsAcceptedAt: r.depositTermsAcceptedAt ?? new Date().toISOString() });
                            showFlyer('Agreement saved on your booking.', 'success');
                          },
                    }}
                  />
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ───────── Move booking ───────── */}
      {reschedulingBooking && (
        <Modal onClose={() => setReschedulingBooking(null)} label="Move booking">
          <div className="p-6 sm:p-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Calendar className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Move your booking</h3>
            <p className="mt-1 text-sm text-slate-500">
              {reschedulingBooking.serviceType}, currently {fmtShortDate(reschedulingBooking.date)} at {String(reschedulingBooking.time).slice(0, 5)}. You can move a booking up to {RESCHEDULE_NOTICE_HOURS} hours before it starts.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Field label="New date" htmlFor="cp-move-date">
                <input id="cp-move-date" type="date" value={rescheduleDate} min={new Date(Date.now() + RESCHEDULE_NOTICE_HOURS * 3600000).toISOString().slice(0, 10)} onChange={(e) => setRescheduleDate(e.target.value)} className={inputClass} />
              </Field>
              <Field label="New time" htmlFor="cp-move-time">
                <input id="cp-move-time" type="time" step={900} value={rescheduleTime} onChange={(e) => setRescheduleTime(e.target.value)} className={inputClass} />
              </Field>
            </div>
            <p className={cx('mt-3 min-h-[1.25rem] text-sm', rescheduleProblem ? 'text-amber-700' : 'text-emerald-700')}>{rescheduleProblem || 'Your cleaner and our team will be told about the new time.'}</p>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => setReschedulingBooking(null)}>
                Keep current time
              </Button>
              <Button onClick={() => void handleRescheduleConfirm()} disabled={Boolean(rescheduleProblem) || rescheduleSaving}>
                {rescheduleSaving ? 'Moving…' : 'Move booking'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ───────── Cancel booking ───────── */}
      {cancellingBooking && (
        <Modal
          onClose={() => {
            setCancellingBooking(null);
            setShortNoticeConsentChecked(false);
          }}
          label="Cancel booking"
        >
          <div className="p-6 sm:p-7">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Cancel this booking?</h3>
            <p className="mt-1 text-sm text-slate-500">
              Your <strong className="text-slate-700">{cancellingBooking.serviceType}</strong> on <strong className="text-slate-700">{fmtShortDate(cancellingBooking.date)}</strong> will be cancelled. This cannot be undone.
            </p>
            {getHoursUntilBooking(cancellingBooking.date, cancellingBooking.time) < shortNoticeWindowHours && (
              <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900">Short-notice cancellation</p>
                <p className="text-sm text-amber-900">{shortNoticeConsentMessage}</p>
                <p className="text-sm font-semibold text-amber-900">
                  Fee: {money((Number(cancellingBooking.totalPrice) || 0) * (shortNoticeFeePercent / 100))} ({shortNoticeFeePercent}% of {money(Number(cancellingBooking.totalPrice))})
                </p>
                <div className="space-y-2 rounded-lg bg-white p-3 ring-1 ring-amber-100">
                  <p className="text-xs font-medium text-slate-500">Pay the fee to</p>
                  {cancellationBankDetails.map((bank) => (
                    <div key={bank.id} className="text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">{bank.accountName}</p>
                      <p>Account number: {bank.accountNumber}</p>
                      <p>Sort code: {bank.sortCode}</p>
                    </div>
                  ))}
                </div>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={shortNoticeConsentChecked} onChange={(e) => setShortNoticeConsentChecked(e.target.checked)} className="mt-0.5 h-4 w-4" />
                  I agree to the short-notice cancellation fee and will pay it.
                </label>
              </div>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                variant="secondary"
                onClick={() => {
                  setCancellingBooking(null);
                  setShortNoticeConsentChecked(false);
                }}
              >
                Keep booking
              </Button>
              <button type="button" onClick={handleCancelConfirm} className="inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700">
                Yes, cancel booking
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ───────── Rate a clean ───────── */}
      {ratingBooking && (
        <Modal
          onClose={() => {
            setRatingBooking(null);
            setGooglePrompt(null);
          }}
          label="Rate your clean"
          wide
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{googlePrompt ? 'Thank you!' : 'How was your clean?'}</h3>
              {!googlePrompt ? (
                <p className="text-sm text-slate-500">
                  {ratingBooking.serviceType} · {fmtShortDate(ratingBooking.date)}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => {
                setRatingBooking(null);
                setGooglePrompt(null);
              }}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          {googlePrompt ? (
            <div className="space-y-5 p-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
                <Star className="h-7 w-7 fill-amber-400 text-amber-400" />
              </div>
              <div>
                <p className="text-lg font-semibold text-slate-900">Glad you are happy with your clean</p>
                <p className="mt-1 text-sm text-slate-600">
                  Would you share it on Google too? It takes a minute and helps local customers find us.
                  {googlePrompt.comment ? ' We will copy your comment so you can paste it.' : ''}
                </p>
              </div>
              <a
                href={String(googleReviewUrl || '')}
                target="_blank"
                rel="noreferrer"
                onClick={() => {
                  if (googlePrompt.comment) void navigator.clipboard?.writeText(googlePrompt.comment).catch(() => {});
                  setGooglePrompt(null);
                  setRatingBooking(null);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" /> Review us on Google
              </a>
              <button
                type="button"
                onClick={() => {
                  setGooglePrompt(null);
                  setRatingBooking(null);
                }}
                className="text-sm font-medium text-slate-500 hover:text-slate-800"
              >
                Maybe later
              </button>
            </div>
          ) : (
            <div className="space-y-5 p-6">
              <div className="flex items-center justify-center gap-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <button key={s} type="button" onClick={() => setStarCount(s)} className="p-1.5 transition-transform hover:scale-110" aria-label={`${s} star${s === 1 ? '' : 's'}`}>
                    <Star className={cx('h-10 w-10', s <= starCount ? 'fill-amber-400 text-amber-400' : 'text-slate-200')} />
                  </button>
                ))}
              </div>
              <p className="text-center text-sm font-medium text-slate-600">{['', 'Poor', 'Not great', 'Okay', 'Good', 'Excellent'][starCount]}</p>
              <Field label="Tell us more (optional)" htmlFor="cp-rate-feedback">
                <textarea id="cp-rate-feedback" value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What did your cleaner do well? Anything we could improve?" className={cx(inputClass, 'min-h-[110px] resize-none')} />
              </Field>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-slate-50 p-3.5">
                <input type="checkbox" checked={reviewPublic} onChange={(e) => setReviewPublic(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-amber-500" />
                <span className="text-xs leading-relaxed text-slate-600">
                  You can show my rating and comment on the CiN website with my first name, the first letter of my surname and my town. I can ask for it to be removed at any time.
                </span>
              </label>
              <Button block size="lg" variant="dark" onClick={handleRatingSubmit}>
                Send feedback
              </Button>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
};

/** Shared modal frame: bottom sheet on phones, centred card on larger screens. */
const Modal: React.FC<{ onClose: () => void; label: string; children: React.ReactNode; wide?: boolean }> = ({ onClose, label, children, wide }) => (
  <div className="fixed inset-0 z-[130] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={label}>
    <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={onClose} />
    <div
      className={cx(
        'relative max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl animate-in slide-in-from-bottom-8 duration-300 sm:rounded-2xl',
        wide ? 'sm:max-w-lg' : 'sm:max-w-md',
      )}
    >
      {children}
    </div>
  </div>
);

const SideNavBtn: React.FC<{ active: boolean; onClick: () => void; label: string; icon: React.ReactNode; badge?: number; badgeTone?: 'alert' | 'neutral' }> = ({
  active,
  onClick,
  label,
  icon,
  badge,
  badgeTone = 'alert',
}) => (
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
      <span className={cx('min-w-[1.25rem] rounded-full px-1.5 text-center text-xs font-semibold', badgeTone === 'alert' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-600')}>
        {badge > 9 ? '9+' : badge}
      </span>
    )}
  </button>
);

const BottomNavBtn: React.FC<{ active: boolean; onClick: () => void; label: string; icon: React.ReactNode; badge?: number }> = ({ active, onClick, label, icon, badge }) => (
  <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined} className="relative flex min-w-[3.75rem] flex-col items-center justify-center gap-0.5 px-2 py-1">
    <span className={cx('relative flex h-8 w-14 items-center justify-center rounded-full transition', active ? 'bg-primary/10 text-primary' : 'text-slate-400')}>
      {icon}
      {!!badge && badge > 0 && (
        <span className="absolute -top-0.5 right-2 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">{badge > 9 ? '9+' : badge}</span>
      )}
    </span>
    <span className={cx('text-[11px] font-medium leading-tight', active ? 'text-primary' : 'text-slate-500')}>{label}</span>
  </button>
);

const MoreSheetItem: React.FC<{ active: boolean; onClick: () => void; label: string; icon: React.ReactNode; badge?: number }> = ({ active, onClick, label, icon, badge }) => (
  <button type="button" onClick={onClick} className={cx('flex w-full items-center gap-3 rounded-2xl px-3 py-3 transition', active ? 'bg-primary/5 text-primary' : 'text-slate-700 hover:bg-slate-50')}>
    <span className={cx('flex h-9 w-9 items-center justify-center rounded-xl', active ? 'bg-primary/10 text-primary' : 'bg-slate-100 text-slate-500')}>{icon}</span>
    <span className="flex-1 text-left text-sm font-medium">{label}</span>
    {!!badge && badge > 0 ? <span className="min-w-[1.25rem] rounded-full bg-red-500 px-1.5 text-center text-xs font-semibold text-white">{badge > 9 ? '9+' : badge}</span> : null}
    <ChevronRight className={cx('h-4 w-4', active ? 'text-primary/50' : 'text-slate-300')} />
  </button>
);

export default CustomerPortal;
