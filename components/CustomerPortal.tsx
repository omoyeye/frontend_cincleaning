
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
} from 'lucide-react';
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
  PaymentFeeEvidenceItem,
} from '../types';
const CleanerTracker = React.lazy(() => import('./CleanerTracker'));
const AddressMap = React.lazy(() => import('./AddressMap'));
import InvoiceView from './InvoiceView';
import { apiClient, customerAccountFromLoginUser } from '../services/api';
import { NotificationBell } from './NotificationBell';
import { useFlyer } from './Flyer';
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

type PortalSection = 'history' | 'invoices' | 'notifications' | 'settings' | 'chats' | 'referrals';
type SectionTone = 'blue' | 'purple' | 'indigo' | 'emerald' | 'amber' | 'rose';

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
  const { bankDetails, cancellationPolicy } = useBusinessSettings();
  const [isLogin, setIsLogin] = useState(true);
  const [activeSection, setActiveSection] = useState<PortalSection>('history');
  const [isMobilePortalMenuOpen, setIsMobilePortalMenuOpen] = useState(false);
  const sectionToneByActive: Record<PortalSection, string> = {
    history: 'from-blue-50/70 to-cyan-50/50 border-blue-100',
    invoices: 'from-rose-50/70 to-pink-50/50 border-rose-100',
    referrals: 'from-purple-50/70 to-fuchsia-50/50 border-purple-100',
    chats: 'from-indigo-50/70 to-violet-50/50 border-indigo-100',
    notifications: 'from-emerald-50/70 to-teal-50/50 border-emerald-100',
    settings: 'from-amber-50/70 to-orange-50/50 border-amber-100',
  };

  // Data State
  const [services, setServices] = useState<ServiceConfig[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [customerInvoicesList, setCustomerInvoicesList] = useState<any[]>([]);

  useEffect(() => {
    if (activeSection === 'notifications' && user) {
      apiClient.getNotifications(user.id).then(setNotifications);
    }
    if (activeSection === 'referrals' && user) {
      apiClient.getUserReferrals(user.id, 'customer').then(setReferrals);
    }
    if (activeSection === 'invoices' && user) {
      apiClient.getMyInvoices().then(setCustomerInvoicesList).catch(() => {});
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
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
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
      });
      onUpdateBooking({ ...ratingBooking, rating: starCount, ...(fb ? { feedback: fb } : {}) });
      showFlyer(`Thank you! Your feedback helps us maintain professional standards.`, 'success');
      setRatingBooking(null);
      setStarCount(5);
      setFeedback('');
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

  const PortalHeader = () => (
    <header className="fixed top-0 left-0 right-0 h-24 bg-gradient-to-r from-white/95 via-indigo-50/85 to-emerald-50/85 backdrop-blur-xl border-b border-indigo-100 z-50 shadow-sm shadow-indigo-100/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {onBackToWebsite && (
            <button
              type="button"
              onClick={onBackToWebsite}
              className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border/80 bg-background/80 px-2.5 py-2 text-[10px] font-black uppercase tracking-widest text-muted-foreground shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground sm:px-3.5"
              title="Back to marketing website"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">Website</span>
            </button>
          )}
          <div className="flex items-center gap-3 cursor-pointer min-w-0" onClick={onStartNewBooking}>
            <BrandLogoMark className="h-[4.5rem] w-auto max-h-[4.5rem] max-w-[min(26vw,400px)] sm:h-20 sm:max-h-20 sm:max-w-[440px] shrink-0 object-contain object-left" />
            <div className="hidden sm:flex flex-col leading-tight min-w-0">
              <span className="text-xl font-black tracking-tighter text-slate-900">
                CLIENT<span className="text-primary">PORTAL</span>
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Clean It Neatly</span>
            </div>
          </div>
        </div>

        <div className="relative flex items-center space-x-3 sm:space-x-4 shrink-0">
          {user && (
            <>
              <button
                type="button"
                onClick={() => setIsMobilePortalMenuOpen((v) => !v)}
                className="lg:hidden inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 shadow-sm"
                aria-label={isMobilePortalMenuOpen ? 'Close portal menu' : 'Open portal menu'}
              >
                {isMobilePortalMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
                <span className="hidden sm:inline">{isMobilePortalMenuOpen ? 'Close' : 'Menu'}</span>
              </button>
              {isMobilePortalMenuOpen && (
                <div className="lg:hidden absolute right-0 top-[calc(100%+0.65rem)] w-[min(90vw,22rem)] rounded-2xl border border-slate-200 bg-white p-2.5 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200 z-[70] max-h-[78vh] overflow-y-auto">
                  <SidebarBtn tone="blue" active={activeSection === 'history'} onClick={() => setActiveSection('history')} icon={<History />} label="My Cleans" />
                  <SidebarBtn tone="rose" active={activeSection === 'invoices'} onClick={() => setActiveSection('invoices')} icon={<CreditCard />} label="Invoices" count={customerInvoicesList.filter(i => i.status !== 'paid').length} />
                  <SidebarBtn tone="purple" active={activeSection === 'referrals'} onClick={() => setActiveSection('referrals')} icon={<Gift />} label="My Referrals" />
                  <SidebarBtn tone="indigo" active={activeSection === 'chats'} onClick={() => setActiveSection('chats')} icon={<MessageSquare />} label="Messages" count={chatEligibleBookings.length} />
                  <SidebarBtn tone="emerald" active={activeSection === 'notifications'} onClick={() => setActiveSection('notifications')} icon={<Bell />} label="Alerts" count={notifications.filter(n => !n.read).length} />
                  <SidebarBtn tone="amber" active={activeSection === 'settings'} onClick={() => setActiveSection('settings')} icon={<Settings />} label="Portal Settings" />
                  <div className="mt-3 p-6 bg-slate-900 rounded-[1.75rem] text-white shadow-xl relative overflow-hidden group">
                    <Star className="absolute -bottom-6 -right-6 w-24 h-24 opacity-10 text-amber-400 group-hover:scale-110 transition-transform duration-700" />
                    <div className="relative z-10">
                      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Loyalty Rewards</span>
                      <p className="text-3xl font-black text-amber-400 mb-1">{user?.loyaltyPoints || 0}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Points Earned</p>

                      <div className="bg-white/10 rounded-2xl p-3 border border-white/10 backdrop-blur-sm">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Your Referral Code</p>
                        <div className="flex justify-between items-center gap-2">
                          <span className="font-black text-base text-white tracking-widest">{user?.referralCode || 'N/A'}</span>
                          <button
                            type="button"
                            onClick={() => navigator.clipboard.writeText(user?.referralCode || '')}
                            className="text-[9px] font-bold text-slate-300 uppercase tracking-widest hover:text-white transition-colors"
                          >
                            Copy
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
          <button
            onClick={onStartNewBooking}
            className="hidden md:flex items-center space-x-2 px-5 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs uppercase tracking-widest hover:bg-white hover:text-primary transition-all"
          >
            <Plus className="w-4 h-4" /> <span>New Booking</span>
          </button>
          {user && (
            <NotificationBell
              fetchNotifications={() => apiClient.getNotifications(user.id)}
              markRead={apiClient.markNotificationRead}
              deleteNotification={apiClient.deleteNotification}
            />
          )}
          {user && (
            <button
              onClick={() => {
                if (onLogout) onLogout();
                else setUser(null);
              }}
              className="flex items-center space-x-2 px-5 py-2.5 text-slate-500 hover:bg-red-50 hover:text-red-500 rounded-xl transition-all"
            >
              <LogOut className="w-4 h-4" />
              <span className="font-bold text-sm hidden sm:inline">Logout</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );

  if (!user && !showVerification) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#eef7ff] via-[#f7f5ff] to-[#eefcf7] font-sans pt-24 sm:pt-28 pb-24 overflow-x-hidden">
        <PortalHeader />
        <div className="max-w-md mx-auto pt-1 pb-12 px-4 sm:px-6">
          <div className="bg-white p-6 sm:p-10 md:p-12 rounded-[2.5rem] sm:rounded-[3.5rem] shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-500">
            <div className="flex justify-center mb-10">
              <BrandLogoMark className="h-32 w-auto max-w-[min(85vw,560px)] object-contain mx-auto" />
            </div>

            <h2 className="text-3xl font-black text-slate-900 mb-2 text-center tracking-tight leading-none">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-slate-400 text-xs font-black uppercase tracking-[0.15em] mb-10 text-center leading-relaxed">
              {brandName} Client Management
            </p>

            {registrationSuccess && (
              <div className="mb-8 p-4 bg-green-50 text-green-700 rounded-2xl border border-green-100 text-sm font-medium text-center animate-in slide-in-from-top-4">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-600" />
                <p className="font-bold">Registration Successful!</p>
                <p className="text-xs mt-1">Please check your email for your login credentials and QR code.</p>
                <button onClick={() => setRegistrationSuccess(false)} className="mt-2 text-[10px] font-black uppercase underline">Dismiss</button>
              </div>
            )}

            {authError && (
              <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-2xl border border-red-100 text-xs font-bold text-center animate-in shake">
                {authError}
              </div>
            )}

            {isForgotPassword ? (
              <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button
                  onClick={() => { setIsForgotPassword(false); setAuthError(''); setForgotPasswordMessage(''); }}
                  className="mb-6 flex items-center text-slate-400 hover:text-primary transition-colors font-bold text-[10px] uppercase tracking-widest"
                >
                  <X className="w-3.5 h-3.5 mr-2" /> Back to Login
                </button>
                <h3 className="text-xl font-black text-slate-900 mb-6 uppercase tracking-tight">Reset Password</h3>
                {forgotPasswordMessage ? (
                  <div className="p-6 bg-primary/12 text-primary rounded-2xl border border-primary/18 text-sm font-bold text-center">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-3 text-primary" />
                    {forgotPasswordMessage}
                  </div>
                ) : (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="relative group">
                      <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <input
                        type="email"
                        placeholder="Email Address"
                        value={forgotPasswordEmail}
                        onChange={e => setForgotPasswordEmail(e.target.value)}
                        required
                        className="w-full pl-14 pr-6 py-5 bg-card border-2 border-input rounded-2xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold transition-all text-foreground placeholder:text-muted-foreground shadow-sm"
                      />
                    </div>
                    <button type="submit" disabled={isProcessing} className="w-full bg-primary text-primary-foreground py-6 rounded-[2rem] font-black shadow-xl shadow-primary/30 hover:opacity-90 transition-all active:scale-95 flex items-center justify-center space-x-3 uppercase tracking-widest text-xs">
                      {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
                    </button>
                  </form>
                )}
              </div>
            ) : (
              <form onSubmit={handleAuthSubmit} className="space-y-4 mb-8">
                {!isLogin && (
                  <>
                    <div className="relative group">
                      <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <input type="text" placeholder="Full Name" value={name} onChange={e => setName(e.target.value)} required className="w-full pl-14 pr-6 py-5 bg-card border-2 border-input rounded-2xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold transition-all text-foreground placeholder:text-muted-foreground shadow-sm" />
                    </div>
                    <div className="relative group">
                      <Gift className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <input type="text" placeholder="Referral Code (Optional)" value={referralCodeInput} onChange={e => setReferralCodeInput(e.target.value.toUpperCase())} className="w-full pl-14 pr-6 py-5 bg-card border-2 border-input rounded-2xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold transition-all text-foreground placeholder:text-muted-foreground shadow-sm uppercase" />
                    </div>
                    <div className="relative group">
                      <Phone className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel"
                        placeholder="Mobile (optional — for SMS updates)"
                        value={registerPhone}
                        onChange={(e) => setRegisterPhone(e.target.value)}
                        className="w-full pl-14 pr-6 py-5 bg-card border-2 border-input rounded-2xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold transition-all text-foreground placeholder:text-muted-foreground shadow-sm"
                      />
                    </div>
                  </>
                )}
                <div className="relative group">
                  <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input type="email" placeholder="Email Address" value={email} onChange={e => setEmail(e.target.value)} required className="w-full pl-14 pr-6 py-5 bg-card border-2 border-input rounded-2xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold transition-all text-foreground placeholder:text-muted-foreground shadow-sm" />
                </div>
                <div className="relative group">
                  <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full pl-14 pr-14 py-5 bg-card border-2 border-input rounded-2xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold transition-all text-foreground placeholder:text-muted-foreground shadow-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-5 top-1/2 -translate-y-1/2 p-1 text-slate-300 hover:text-primary transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {isLogin && (
                  <div className="flex justify-end px-2">
                    <button
                      type="button"
                      onClick={() => { setIsForgotPassword(true); setAuthError(''); setForgotPasswordEmail(email); }}
                      className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors"
                    >
                      Forgot Password?
                    </button>
                  </div>
                )}
                <button type="submit" disabled={isProcessing} className="w-full bg-primary text-primary-foreground py-6 rounded-[2rem] font-black shadow-xl shadow-primary/30 hover:opacity-90 transition-all active:scale-95 flex items-center justify-center space-x-3 uppercase tracking-widest text-xs">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Member Login' : 'Join Now')}
                </button>
              </form>
            )}

            <div className="pt-8 border-t border-slate-50 text-center space-y-8">
              <button onClick={() => { setIsLogin(!isLogin); setRegistrationSuccess(false); setAuthError(''); }} className="text-sm font-black uppercase tracking-widest text-primary hover:text-primary transition-colors underline decoration-2 underline-offset-4">
                {isLogin ? "Need a member account? Sign Up" : "Already a member? Sign In"}
              </button>

              <div className="bg-slate-900 rounded-[2.5rem] p-6 sm:p-10 text-white shadow-2xl relative overflow-hidden group">
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary rounded-full opacity-20 -translate-y-1/2 translate-x-1/2 group-hover:scale-110 transition-transform"></div>
                <h3 className="text-xl font-black mb-2 uppercase tracking-tight relative z-10">Quick Booking</h3>
                <p className="text-[10px] font-bold text-primary-foreground/70 uppercase tracking-widest mb-8 relative z-10">No registration required</p>
                <button
                  onClick={onStartNewBooking}
                  className="w-full flex items-center justify-center space-x-3 py-5 rounded-2xl bg-white text-slate-900 font-black hover:bg-slate-50 transition-all shadow-xl group relative z-10"
                >
                  <Plus className="w-5 h-5" />
                  <span className="uppercase tracking-widest text-[10px]">Book as Guest</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform ml-auto opacity-30" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#eef7ff] via-[#f7f5ff] to-[#eefcf7] font-sans pt-24 sm:pt-28 pb-24 overflow-x-hidden">
      <PortalHeader />
      <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-8">
        <div className="space-y-8 sm:space-y-10 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 sm:gap-6">
            <div className="flex items-center gap-4 sm:gap-6 min-w-0">
              <div className="shrink-0 w-14 h-14 sm:w-20 sm:h-20 bg-primary rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center text-white text-2xl sm:text-3xl font-black shadow-2xl">
                {(user?.name || 'Client').charAt(0)}
              </div>
              <div className="min-w-0">
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-none uppercase break-words">Hello, {(user?.name || 'Client').split(' ')[0]}</h2>
                <p className="text-slate-400 font-black mt-1 uppercase text-[10px] tracking-widest">{brandName} Professional Member</p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button onClick={onStartNewBooking} className="flex items-center space-x-2 sm:space-x-3 bg-slate-900 text-white px-5 sm:px-8 py-3 sm:py-4 rounded-2xl font-black shadow-xl hover:scale-105 active:scale-95 transition-all uppercase tracking-widest text-[10px]">
                <Plus className="w-4 h-4" /> <span>Schedule New Clean</span>
              </button>
              <button
                onClick={() => {
                  if (onLogout) onLogout();
                  else setUser(null);
                }}
                className="p-3 sm:p-4 bg-white border border-slate-100 rounded-2xl text-slate-400 hover:text-red-500 transition-all shadow-sm"
                aria-label="Sign out"
              >
                <LogOut className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            </div>
          </div>

          {user && nextVisit && (
            <div className="rounded-[2rem] border-2 border-primary/20 bg-gradient-to-br from-primary/8 to-white p-8 shadow-lg shadow-primary/10 animate-in slide-in-from-bottom-4 duration-500">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
                <div className="space-y-3 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/12 px-3 py-1 rounded-full border border-primary/18">Next visit</span>
                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${nextVisit.status === BookingStatus.CONFIRMED ? 'bg-green-50 text-green-700 border-green-100' : 'bg-amber-50 text-amber-800 border-amber-100'}`}>
                      {nextVisit.status}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{nextVisit.serviceType}</h3>
                  <p className="text-slate-600 font-bold flex flex-wrap gap-x-4 gap-y-1">
                    <span className="inline-flex items-center"><Calendar className="w-4 h-4 mr-2 text-primary" /> {nextVisit.date}</span>
                    <span className="inline-flex items-center"><Clock className="w-4 h-4 mr-2 text-primary" /> {nextVisit.time}</span>
                  </p>
                  <p className="text-sm text-slate-500 font-medium">{nextVisit.address?.line1}, {nextVisit.address?.postcode}</p>
                  {nextVisitPrep.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Before we arrive</p>
                      <ul className="space-y-1.5">
                        {nextVisitPrep.map((tip, i) => (
                          <li key={i} className="text-sm text-slate-700 font-medium flex gap-2">
                            <ClipboardCheck className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadBookingIcs(nextVisit)}
                    className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl border-2 border-slate-200 bg-white font-black text-xs uppercase tracking-widest text-slate-800 hover:border-primary hover:text-primary transition-colors"
                  >
                    <Download className="w-4 h-4" /> Add to calendar (.ics)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBookingForDetail(nextVisit);
                      setViewMode('details');
                      setActiveSection('history');
                    }}
                    className="inline-flex items-center justify-center gap-2 px-6 py-4 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-widest hover:bg-slate-800 transition-colors"
                  >
                    View details <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Live Job Tracker */}
          {activeBooking && (
            <div className="animate-in slide-in-from-bottom-8 duration-700 delay-200">
              <h2 className="text-2xl font-black text-slate-900 mb-6 uppercase tracking-tight">Live Job Status</h2>
              <React.Suspense fallback={<div className="h-96 w-full bg-slate-100 rounded-[2.5rem] flex items-center justify-center font-black text-slate-400 uppercase tracking-widest">Loading Map...</div>}>
                <CleanerTracker
                  booking={activeBooking}
                  staff={staffList.filter(s =>
                    (activeBooking.assignedStaffIds || []).includes(s.id) ||
                    activeBooking.assignedStaffId === s.id
                  )}
                />
              </React.Suspense>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
            <div className="hidden lg:block lg:col-span-1 space-y-2">
              <SidebarBtn tone="blue" active={activeSection === 'history'} onClick={() => setActiveSection('history')} icon={<History />} label="My Cleans" />
              <SidebarBtn tone="rose" active={activeSection === 'invoices'} onClick={() => setActiveSection('invoices')} icon={<CreditCard />} label="Invoices" count={customerInvoicesList.filter(i => i.status !== 'paid').length} />
              <SidebarBtn tone="purple" active={activeSection === 'referrals'} onClick={() => setActiveSection('referrals')} icon={<Gift />} label="My Referrals" />
              <SidebarBtn tone="indigo" active={activeSection === 'chats'} onClick={() => setActiveSection('chats')} icon={<MessageSquare />} label="Messages" count={chatEligibleBookings.length} />
              <SidebarBtn tone="emerald" active={activeSection === 'notifications'} onClick={() => setActiveSection('notifications')} icon={<Bell />} label="Alerts" count={notifications.filter(n => !n.read).length} />
              <SidebarBtn tone="amber" active={activeSection === 'settings'} onClick={() => setActiveSection('settings')} icon={<Settings />} label="Portal Settings" />

              <div className="mt-8 p-6 sm:p-10 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-[3rem] text-white shadow-2xl relative overflow-hidden group">
                <Star className="absolute -bottom-6 -right-6 w-32 h-32 opacity-10 text-amber-400 group-hover:scale-110 transition-transform duration-700" />
                <div className="relative z-10">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-3">Loyalty Rewards</span>
                  <p className="text-4xl font-black text-amber-400 mb-2">{user?.loyaltyPoints || 0}</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6">Points Earned</p>

                  <div className="bg-white/10 rounded-2xl p-4 border border-white/10 backdrop-blur-sm">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Your Referral Code</p>
                    <div className="flex justify-between items-center">
                      <span className="font-black text-lg text-white tracking-widest">{user?.referralCode || 'N/A'}</span>
                      <button onClick={() => navigator.clipboard.writeText(user?.referralCode || '')} className="text-[9px] font-bold text-slate-300 uppercase tracking-widest hover:text-white transition-colors">Copy</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-3">
              <div className={`bg-gradient-to-b ${sectionToneByActive[activeSection]} rounded-[3.5rem] border shadow-sm overflow-hidden min-h-[600px] flex flex-col`}>
                {activeSection === 'history' && (
                  <div className="p-6 sm:p-10 space-y-8 animate-in fade-in duration-500">
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Cleaning History</h3>
                      <div className="bg-primary/12 text-primary px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-primary/18">All Jobs</div>
                    </div>
                    <div className="space-y-4">
                      {(bookings || []).map(b => {
                        const proofBanner = bookingNeedsPaymentProofBanner(b);
                        return (
                          <div
                            key={b.id}
                            onClick={() => { setSelectedBookingForDetail(b); setViewMode('details'); }}
                            className="p-4 sm:p-8 rounded-2xl sm:rounded-[2.5rem] bg-gradient-to-br from-white to-indigo-50/65 border border-indigo-100 flex flex-col gap-3 sm:gap-4 md:gap-5 group hover:bg-white hover:shadow-2xl hover:border-primary/18 transition-all cursor-pointer overflow-hidden"
                          >
                            {proofBanner.show && (
                              <div
                                role="status"
                                className="w-full shrink-0 rounded-2xl border border-emerald-400/70 bg-emerald-50 px-3 py-2.5 shadow-sm shadow-emerald-900/10 motion-safe:animate-pulse sm:px-4 sm:py-3"
                              >
                                <p className="flex items-start justify-center gap-2 text-center text-[10px] font-black uppercase leading-snug tracking-wide text-emerald-900 sm:text-[11px] sm:tracking-widest">
                                  <Upload className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                                  <span>
                                    {proofBanner.needsDeposit && proofBanner.needsCancellationFee
                                      ? 'Upload proof of your deposit and cancellation fee payments — open this job.'
                                      : proofBanner.needsCancellationFee
                                        ? 'Cancellation fee agreed — upload proof of payment on this job.'
                                        : 'Deposit agreed — upload proof of payment on this job.'}
                                  </span>
                                </p>
                              </div>
                            )}
                            <div className="flex flex-col gap-3 sm:gap-5 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-start gap-3 sm:gap-6 w-full md:w-auto min-w-0">
                                <div className="w-11 h-11 sm:w-16 sm:h-16 bg-white rounded-xl sm:rounded-2xl flex items-center justify-center shadow-sm text-primary shrink-0 group-hover:bg-primary group-hover:text-white transition-all">
                                  {b.status === BookingStatus.COMPLETED ? <CheckCircle2 className="w-5 h-5 sm:w-7 sm:h-7" /> : <Clock className="w-5 h-5 sm:w-7 sm:h-7" />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1 font-black text-slate-900 text-[15px] sm:text-lg uppercase tracking-normal sm:tracking-tight leading-tight break-words [hyphens:auto]">
                                      {b.serviceType}
                                    </div>
                                    <div className="text-right shrink-0 md:hidden">
                                      <span className="block text-[15px] sm:text-base font-black text-slate-900 tabular-nums whitespace-nowrap leading-none">£{Number(b.totalPrice).toFixed(2)}</span>
                                      <span className={`text-[9px] font-black uppercase tracking-widest whitespace-nowrap mt-1 inline-block ${b.status === BookingStatus.COMPLETED ? 'text-green-600' :
                                        b.status === BookingStatus.CANCELLED ? 'text-red-500' : 'text-primary'
                                        }`}>{b.status}</span>
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-2">
                                    <span className="flex items-center text-slate-400 text-[10px] font-black uppercase tracking-widest"><Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 shrink-0" /> {b.date}</span>
                                    {(b.assignedStaffIds || (b.assignedStaffId ? [b.assignedStaffId] : [])).map(id => {
                                      const s = staffList.find(st => st.id === id);
                                      if (!s) return null;
                                      return (
                                        <span key={id} className="flex items-center text-primary text-[10px] font-black uppercase tracking-widest bg-primary/12 px-2 sm:px-3 py-1 rounded-lg max-w-[12rem]">
                                          <UserCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2 shrink-0" /> <span className="truncate">{s.name}</span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center flex-wrap gap-2 sm:gap-3 w-full md:w-auto md:justify-end">
                                <div className="text-right hidden md:block mr-3">
                                  <span className="block text-xl font-black text-slate-900 tabular-nums">£{Number(b.totalPrice).toFixed(2)}</span>
                                  <span className={`text-[9px] font-black uppercase tracking-widest ${b.status === BookingStatus.COMPLETED ? 'text-green-600' :
                                    b.status === BookingStatus.CANCELLED ? 'text-red-500' : 'text-primary'
                                    }`}>{b.status}</span>
                                </div>

                                {b.stripePaymentLink && !b.invoicePaid && (b.status === BookingStatus.PENDING || b.status === BookingStatus.CONFIRMED) && (
                                  <a
                                    href={b.stripePaymentLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="px-3 sm:px-5 py-2.5 sm:py-3.5 bg-emerald-600 text-white border border-emerald-700 rounded-xl sm:rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-sm active:scale-95 inline-flex items-center"
                                  >
                                    <CreditCard className="w-3.5 h-3.5 mr-1.5 sm:mr-2 shrink-0" /> Pay Now
                                  </a>
                                )}

                                {(b.status === BookingStatus.PENDING || b.status === BookingStatus.CONFIRMED) && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setCancellingBooking(b); setShortNoticeConsentChecked(false); }}
                                    className={`px-3 sm:px-6 py-2.5 sm:py-3.5 border rounded-xl sm:rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm active:scale-95 inline-flex items-center ${isCancellable(b.date, b.time)
                                      ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white'
                                      : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-600 hover:text-white'
                                      }`}
                                  >
                                    {isCancellable(b.date, b.time) ? (
                                      <>
                                        <Trash2 className="w-3.5 h-3.5 mr-1.5 sm:mr-2 shrink-0" /> Cancel
                                      </>
                                    ) : (
                                      <>
                                        <Clock className="w-3.5 h-3.5 mr-1.5 sm:mr-2 shrink-0" /> <span className="whitespace-nowrap">Cancel (&lt;{shortNoticeWindowHours}h)</span>
                                      </>
                                    )}
                                  </button>
                                )}

                                {b.status === BookingStatus.COMPLETED && (
                                  <>
                                    <button onClick={(e) => { e.stopPropagation(); onReorder(b); }} className="px-3 sm:px-4 py-2.5 sm:py-3.5 bg-primary/12 text-primary border border-primary/18 rounded-xl sm:rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all shadow-sm active:scale-95 inline-flex items-center">
                                      <Repeat className="w-3.5 h-3.5 mr-1.5 sm:mr-2 shrink-0" /> Reorder
                                    </button>
                                    {b.rating != null && b.rating >= 1 && b.rating <= 5 ? (
                                      <span className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2.5 sm:py-3.5 rounded-xl sm:rounded-2xl border border-amber-200 bg-amber-50 text-amber-900 text-[10px] font-black uppercase tracking-widest">
                                        <Star className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-amber-400 text-amber-400 shrink-0" />
                                        {b.rating}/5
                                      </span>
                                    ) : (
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setStarCount(5); setFeedback(''); setRatingBooking(b); }} className="px-3 sm:px-6 py-2.5 sm:py-3.5 bg-white border border-slate-200 rounded-xl sm:rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-900 hover:text-white hover:border-slate-900 transition-all shadow-sm active:scale-95">Rate</button>
                                    )}
                                  </>
                                )}
                                <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors ml-2 hidden md:block" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {bookings.length === 0 && (
                        <div className="py-20 text-center text-slate-400">
                          <Calendar className="w-16 h-16 mx-auto mb-4 opacity-20" />
                          <p className="font-black text-sm uppercase tracking-widest">No service history yet.</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeSection === 'invoices' && (
                  <div className="p-6 sm:p-10 space-y-8 animate-in fade-in duration-500">
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">My Invoices</h3>
                      <div className="bg-rose-50 text-rose-600 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-rose-100">
                        {customerInvoicesList.filter(i => i.status !== 'paid').length} Unpaid
                      </div>
                    </div>

                    <div className="space-y-4">
                      {customerInvoicesList.length === 0 && (
                        <div className="py-20 text-center text-slate-400">
                          <CreditCard className="w-16 h-16 mx-auto mb-4 opacity-20" />
                          <p className="font-black text-sm uppercase tracking-widest mb-2">No invoices yet.</p>
                          <p className="text-xs">Invoices for your bookings will appear here.</p>
                        </div>
                      )}
                      {customerInvoicesList.map(inv => {
                        const statusColors: Record<string, string> = {
                          paid: 'bg-green-50 text-green-600 border-green-100',
                          sent: 'bg-blue-50 text-blue-600 border-blue-100',
                          overdue: 'bg-red-50 text-red-600 border-red-100',
                          pending: 'bg-amber-50 text-amber-600 border-amber-100',
                        };
                        const statusCls = statusColors[inv.status] || 'bg-slate-50 text-slate-600 border-slate-100';
                        return (
                          <div key={inv.id} className="p-6 rounded-[2rem] border border-slate-100 bg-white shadow-sm hover:border-primary/18 transition-all">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-4">
                                <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                                  <CreditCard className="w-6 h-6" />
                                </div>
                                <div>
                                  <h4 className="font-black text-lg text-slate-900 uppercase tracking-tight leading-none">{inv.invoiceNumber}</h4>
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                    {inv.createdAt ? new Date(inv.createdAt).toLocaleDateString() : ''}
                                    {inv.dueDate ? ` · Due ${inv.dueDate}` : ''}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-2xl font-black text-slate-900 tabular-nums leading-none">{'£'}{Number(inv.total || 0).toFixed(2)}</div>
                                <span className={`inline-block mt-1 px-3 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border ${statusCls}`}>
                                  {inv.status}
                                </span>
                              </div>
                            </div>

                            {inv.status !== 'paid' && inv.stripePaymentUrl && (
                              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                                <a
                                  href={inv.stripePaymentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
                                >
                                  <CreditCard className="w-4 h-4" />
                                  Pay Now
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}

                            {inv.status !== 'paid' && !inv.stripePaymentUrl && inv.id && (
                              <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                                <a
                                  href={`/pay/invoice/${inv.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-white text-[10px] font-black uppercase tracking-widest hover:opacity-90 transition-all"
                                >
                                  <CreditCard className="w-4 h-4" />
                                  Pay Now
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeSection === 'notifications' && (
                  <div className="p-6 sm:p-10 space-y-8 animate-in fade-in duration-500">
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Notification Center</h3>
                      <div className="bg-red-50 text-red-600 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-red-100">{notifications.length} Alerts</div>
                    </div>
                    <div className="space-y-4">
                      {notifications.length === 0 && (
                        <div className="py-20 text-center text-slate-400">
                          <Bell className="w-16 h-16 mx-auto mb-4 opacity-20" />
                          <p className="font-black text-sm uppercase tracking-widest">You are all caught up.</p>
                        </div>
                      )}
                      {(notifications || []).map(n => (
                        <div key={n.id} className={`p-6 rounded-[2rem] border flex items-start space-x-4 ${n.read ? 'bg-white border-slate-100' : 'bg-primary/12 border-primary/18'}`}>
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${n.read ? 'bg-slate-50 text-slate-400' : 'bg-primary text-white shadow-lg'}`}>
                            <Bell className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex justify-between items-start">
                              <h4 className={`font-black uppercase tracking-tight ${n.read ? 'text-slate-600' : 'text-slate-900'}`}>{n.title || 'Notification'}</h4>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{new Date(n.createdAt).toLocaleDateString()}</span>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    try {
                                      await apiClient.deleteNotification(Number(n.id));
                                      setNotifications((prev) => prev.filter((x) => String(x.id) !== String(n.id)));
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
                            <p className={`text-sm mt-1 leading-relaxed ${n.read ? 'text-slate-400' : 'text-slate-600 font-bold'}`}>{n.message}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSection === 'settings' && user && (
                  <div className="p-6 sm:p-10 space-y-8 animate-in slide-in-from-right-4 duration-500">
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tight">Security & Account</h3>
                      <span className="flex items-center text-green-700 bg-green-50 px-5 py-2.5 rounded-2xl border border-green-100 text-xs font-black uppercase tracking-wider shadow-sm">
                        <ShieldCheck className="w-4 h-4 mr-2" /> Identity Verified
                      </span>
                    </div>

                    <div className="grid grid-cols-1 gap-8">
                      <div className="space-y-6 rounded-[2rem] border border-slate-200/80 bg-white p-6 sm:p-8 shadow-sm">
                        <div className="space-y-1">
                          <label className="text-xs font-black uppercase tracking-widest text-slate-500">Member Information</label>
                          <p className="text-sm font-medium text-slate-500">Review and update your account profile details.</p>
                        </div>
                        <div className="space-y-5">
                          <div className="space-y-2">
                            <span className="text-xs font-black text-slate-600 uppercase tracking-wider ml-1">Full Name</span>
                            {isEditingProfile ? (
                              <input
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="w-full p-4 sm:p-5 bg-white rounded-2xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 font-semibold text-base text-slate-900"
                              />
                            ) : (
                              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 font-semibold text-base text-slate-900">{user.name}</div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <span className="text-xs font-black text-slate-600 uppercase tracking-wider ml-1">Email Profile</span>
                            {isEditingProfile ? (
                              <input
                                value={editEmail}
                                onChange={(e) => setEditEmail(e.target.value)}
                                className="w-full p-4 sm:p-5 bg-white rounded-2xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 font-semibold text-base text-slate-900"
                              />
                            ) : (
                              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 font-semibold text-base text-slate-900">{user.email}</div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <span className="text-xs font-black text-slate-600 uppercase tracking-wider ml-1">Mobile</span>
                            {isEditingProfile ? (
                              <input
                                value={editPhone}
                                onChange={(e) => setEditPhone(e.target.value)}
                                placeholder="e.g. 07700 900123"
                                className="w-full p-4 sm:p-5 bg-white rounded-2xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 font-semibold text-base text-slate-900"
                              />
                            ) : (
                              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 font-semibold text-base text-slate-900">{user.phone || <span className="text-slate-400 font-semibold">Not provided</span>}</div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <span className="text-xs font-black text-slate-600 uppercase tracking-wider ml-1">Postcode</span>
                            {isEditingProfile ? (
                              <div className="space-y-2">
                                <div className="flex gap-2">
                                  <input
                                    value={editPostcode}
                                    onChange={(e) => {
                                      setEditPostcode(e.target.value.toUpperCase());
                                      setPostcodeLookup({ loading: false, note: null, error: null });
                                    }}
                                    placeholder="e.g. SW1A 1AA"
                                    className="flex-1 p-4 sm:p-5 bg-white rounded-2xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 font-semibold text-base text-slate-900 uppercase tracking-wider"
                                  />
                                  <button
                                    type="button"
                                    onClick={handlePostcodeLookup}
                                    disabled={postcodeLookup.loading || !editPostcode.trim()}
                                    className="px-5 py-4 bg-slate-900 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-800 transition-all disabled:opacity-60"
                                  >
                                    {postcodeLookup.loading ? 'Checking...' : 'Verify'}
                                  </button>
                                </div>
                                {postcodeLookup.note && (
                                  <p className="text-xs font-semibold text-emerald-600">{postcodeLookup.note}</p>
                                )}
                                {postcodeLookup.error && (
                                  <p className="text-xs font-semibold text-red-600">{postcodeLookup.error}</p>
                                )}
                              </div>
                            ) : (
                              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 font-semibold text-base text-slate-900 uppercase tracking-wider">{user.postcode || <span className="text-slate-400 font-semibold normal-case tracking-normal">Not provided</span>}</div>
                            )}
                          </div>
                          <div className="space-y-2">
                            <span className="text-xs font-black text-slate-600 uppercase tracking-wider ml-1">Home Address</span>
                            {isEditingProfile ? (
                              <textarea
                                value={editAddress}
                                onChange={(e) => setEditAddress(e.target.value)}
                                placeholder="Street, building, flat"
                                rows={2}
                                className="w-full p-4 sm:p-5 bg-white rounded-2xl border border-slate-300 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/60 font-semibold text-base text-slate-900 resize-none"
                              />
                            ) : (
                              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 font-semibold text-base text-slate-900 whitespace-pre-line">{user.address || <span className="text-slate-400 font-semibold">Not provided</span>}</div>
                            )}
                          </div>
                          <div className="flex gap-3">
                            {isEditingProfile ? (
                              <>
                                <button disabled={isSavingProfile} onClick={handleProfileSave} className="flex-1 py-5 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:opacity-90 transition-all active:scale-95 disabled:opacity-60">{isSavingProfile ? 'Saving...' : 'Save Changes'}</button>
                                <button disabled={isSavingProfile} onClick={() => {
                                  setIsEditingProfile(false);
                                  setPostcodeLookup({ loading: false, note: null, error: null });
                                  if (user) {
                                    setEditName(user.name);
                                    setEditEmail(user.email);
                                    setEditPhone(user.phone || '');
                                    setEditAddress(user.address || '');
                                    setEditPostcode(user.postcode || '');
                                  }
                                }} className="px-6 py-5 bg-slate-100 text-slate-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all disabled:opacity-60">Cancel</button>
                              </>
                            ) : (
                              <button onClick={() => setIsEditingProfile(true)} className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all active:scale-95">Edit Profile</button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

                    {!isEditingProfile && (
                      <div className="p-6 sm:p-8 rounded-[2rem] bg-white border border-slate-100 space-y-5 shadow-sm">
                        <div>
                          <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Change password</h4>
                          <p className="text-xs text-slate-500 font-medium mt-1">Use at least 8 characters. You'll stay signed in after changing it.</p>
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <span className="text-[9px] font-black text-slate-300 uppercase ml-1">Current password</span>
                            <input
                              type="password"
                              autoComplete="current-password"
                              value={passwordForm.current}
                              onChange={(e) => setPasswordForm((p) => ({ ...p, current: e.target.value }))}
                              className="w-full p-4 bg-white rounded-2xl border border-slate-200 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 font-bold text-sm text-slate-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <span className="text-[9px] font-black text-slate-300 uppercase ml-1">New password</span>
                            <input
                              type="password"
                              autoComplete="new-password"
                              value={passwordForm.next}
                              onChange={(e) => setPasswordForm((p) => ({ ...p, next: e.target.value }))}
                              className="w-full p-4 bg-white rounded-2xl border border-slate-200 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 font-bold text-sm text-slate-900"
                            />
                          </div>
                          <div className="space-y-2">
                            <span className="text-[9px] font-black text-slate-300 uppercase ml-1">Confirm new password</span>
                            <input
                              type="password"
                              autoComplete="new-password"
                              value={passwordForm.confirm}
                              onChange={(e) => setPasswordForm((p) => ({ ...p, confirm: e.target.value }))}
                              className="w-full p-4 bg-white rounded-2xl border border-slate-200 outline-none focus:border-primary/60 focus:ring-2 focus:ring-primary/20 font-bold text-sm text-slate-900"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handlePasswordSave}
                            disabled={passwordForm.saving}
                            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all active:scale-95 disabled:opacity-60"
                          >
                            {passwordForm.saving ? 'Updating...' : 'Update password'}
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="p-8 rounded-[2rem] bg-gradient-to-br from-white to-emerald-50/60 border border-emerald-100 space-y-6">
                      <div>
                        <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Notification preferences</h4>
                        <p className="text-xs text-slate-500 font-medium mt-1">Stored on this device for when in-app alerts roll out. Marketing emails remain separate.</p>
                      </div>
                      <label className="flex items-center justify-between gap-4 cursor-pointer group">
                        <span className="text-sm font-bold text-slate-700">Booking updates &amp; schedule changes</span>
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary"
                          checked={clientPrefs.notifyBooking}
                          onChange={(e) => persistClientPrefs({ ...clientPrefs, notifyBooking: e.target.checked })}
                        />
                      </label>
                      <label className="flex items-center justify-between gap-4 cursor-pointer group">
                        <span className="text-sm font-bold text-slate-700">Promotions &amp; tips</span>
                        <input
                          type="checkbox"
                          className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary"
                          checked={clientPrefs.notifyPromo}
                          onChange={(e) => persistClientPrefs({ ...clientPrefs, notifyPromo: e.target.checked })}
                        />
                      </label>
                    </div>
                  </div>
                )}

                {activeSection === 'chats' && (
                  <div className="flex flex-col h-full animate-in fade-in duration-500">
                    <div className="p-6 sm:p-10 border-b border-slate-50">
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Active Channels</h3>
                    </div>
                    <div className="hidden lg:grid flex-1 grid-cols-[320px_minmax(0,1fr)] min-h-0">
                      <div className="border-r border-slate-100 p-4 space-y-3 overflow-y-auto">
                        {chatEligibleBookings.length === 0 && (
                          <p className="text-sm font-bold text-slate-400 p-4">No assigned bookings yet.</p>
                        )}
                        {chatEligibleBookings.map((b) => (
                          <button
                            key={b.id}
                            onClick={() => {
                              setActiveChatBooking(b);
                              void loadChat(b.id);
                            }}
                            className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 ${activeChatBooking?.id === b.id
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-[0_0_24px_rgba(16,185,129,0.45)] ring-2 ring-emerald-400/90'
                              : 'bg-white border-slate-100 hover:border-emerald-300/60'
                              }`}
                          >
                            <div className="font-black text-slate-900 text-sm">{b.serviceType}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{b.date} @ {b.time}</div>
                          </button>
                        ))}
                      </div>
                      <div className="flex flex-col min-h-0">
                        {!activeChatBooking ? (
                          <div className="flex-1 flex flex-col items-center justify-center p-6 sm:p-12 text-slate-300 text-center opacity-40">
                            <MessageSquare className="w-20 h-20 mb-6" />
                            <p className="font-black text-sm uppercase tracking-widest leading-relaxed">Select a booking to open chat.</p>
                          </div>
                        ) : (
                          <>
                            <div className="p-5 border-b border-slate-100">
                              <p className="font-black text-slate-900">{activeChatBooking.serviceType} • {activeChatBooking.date} {activeChatBooking.time}</p>
                              {activeChatStaffNames.length > 0 && (
                                <p className="text-xs font-bold text-slate-500 mt-1">
                                  Staff on this job: {activeChatStaffNames.join(', ')}
                                </p>
                              )}
                              {!chatCanStart && !canBookingChatStart(activeChatBooking) && (
                                <p className="text-xs font-bold text-amber-600 mt-1">Chat opens 10 minutes before start time.</p>
                              )}
                              {chatClosedByAdmin && (
                                <p className="text-xs font-bold text-slate-500 mt-1">Chat closed by admin after completion.</p>
                              )}
                            </div>
                            <div className="flex-1 overflow-y-auto p-5 space-y-3">
                              {chatMessages.map((m) => (
                                <div key={m.id} className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${m.senderRole === 'customer' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-800'}`}>
                                  <div className="text-[10px] font-black uppercase opacity-70 mb-1">{m.senderName}</div>
                                  <div>{m.text}</div>
                                </div>
                              ))}
                            </div>
                            <div className="p-4 border-t border-slate-100 flex gap-2">
                              <input
                                value={chatMessage}
                                onChange={(e) => setChatMessage(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && activeChatBooking) {
                                    void apiClient.sendBookingChat(activeChatBooking.id, chatMessage)
                                      .then(() => {
                                        setChatMessage('');
                                        return loadChat(activeChatBooking.id);
                                      });
                                  }
                                }}
                                disabled={chatClosedByAdmin || !chatCanStart}
                                placeholder="Type a message..."
                                className="flex-1 p-3 rounded-xl border border-slate-200"
                              />
                              <button
                                onClick={() => {
                                  if (!activeChatBooking || !chatMessage.trim()) return;
                                  void apiClient.sendBookingChat(activeChatBooking.id, chatMessage)
                                    .then(() => {
                                      setChatMessage('');
                                      return loadChat(activeChatBooking.id);
                                    });
                                }}
                                disabled={chatClosedByAdmin || !chatCanStart || !chatMessage.trim()}
                                className="px-4 py-3 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest disabled:opacity-50"
                              >
                                Send
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="lg:hidden flex-1 min-h-0">
                      {mobileChatView === 'list' ? (
                        <div className="p-4 space-y-3 overflow-y-auto">
                          {chatEligibleBookings.length === 0 && (
                            <p className="text-sm font-bold text-slate-400 p-4">No assigned bookings yet.</p>
                          )}
                          {chatEligibleBookings.map((b) => (
                            <button
                              key={b.id}
                              onClick={() => {
                                setActiveChatBooking(b);
                                setMobileChatView('chat');
                                void loadChat(b.id);
                              }}
                              className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 ${activeChatBooking?.id === b.id
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-950 shadow-[0_0_24px_rgba(16,185,129,0.45)] ring-2 ring-emerald-400/90'
                                : 'bg-white border-slate-100 hover:border-emerald-300/60'
                                }`}
                            >
                              <div className="font-black text-slate-900 text-sm">{b.serviceType}</div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">{b.date} @ {b.time}</div>
                            </button>
                          ))}
                        </div>
                      ) : !activeChatBooking ? (
                        <div className="p-6">
                          <button
                            type="button"
                            onClick={() => setMobileChatView('list')}
                            className="inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary"
                          >
                            <ArrowLeft className="w-4 h-4" />
                            Back
                          </button>
                        </div>
                      ) : (
                        <div className="flex h-full min-h-[70vh] flex-col bg-white">
                          <div className="p-4 border-b border-slate-100">
                            <button
                              type="button"
                              onClick={() => setMobileChatView('list')}
                              className="mb-2 inline-flex items-center gap-1 text-xs font-black uppercase tracking-widest text-primary"
                            >
                              <ArrowLeft className="w-4 h-4" />
                              Back to chats
                            </button>
                            <p className="font-black text-slate-900">{activeChatBooking.serviceType} • {activeChatBooking.date} {activeChatBooking.time}</p>
                            <p className="text-xs font-bold text-slate-500 mt-1">
                              Staff on this job: {activeChatStaffNames.length > 0 ? activeChatStaffNames.join(', ') : 'Assigned team'}
                            </p>
                            {!chatCanStart && !canBookingChatStart(activeChatBooking) && (
                              <p className="text-xs font-bold text-amber-600 mt-1">Chat opens 10 minutes before start time.</p>
                            )}
                            {chatClosedByAdmin && (
                              <p className="text-xs font-bold text-slate-500 mt-1">Chat closed by admin after completion.</p>
                            )}
                          </div>
                          <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {chatMessages.map((m) => (
                              <div key={m.id} className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm ${m.senderRole === 'customer' ? 'ml-auto bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-800'}`}>
                                <div className="text-[10px] font-black uppercase opacity-70 mb-1">{m.senderName}</div>
                                <div>{m.text}</div>
                              </div>
                            ))}
                          </div>
                          <div className="p-4 border-t border-slate-100 flex gap-2">
                            <input
                              value={chatMessage}
                              onChange={(e) => setChatMessage(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && activeChatBooking) {
                                  void apiClient.sendBookingChat(activeChatBooking.id, chatMessage)
                                    .then(() => {
                                      setChatMessage('');
                                      return loadChat(activeChatBooking.id);
                                    });
                                }
                              }}
                              disabled={chatClosedByAdmin || !chatCanStart}
                              placeholder="Type a message..."
                              className="flex-1 p-3 rounded-xl border border-slate-200"
                            />
                            <button
                              onClick={() => {
                                if (!activeChatBooking || !chatMessage.trim()) return;
                                void apiClient.sendBookingChat(activeChatBooking.id, chatMessage)
                                  .then(() => {
                                    setChatMessage('');
                                    return loadChat(activeChatBooking.id);
                                  });
                              }}
                              disabled={chatClosedByAdmin || !chatCanStart || !chatMessage.trim()}
                              className="px-4 py-3 rounded-xl bg-primary text-primary-foreground font-black text-xs uppercase tracking-widest disabled:opacity-50"
                            >
                              Send
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeSection === 'referrals' && (
                  <div className="p-6 sm:p-10 space-y-8 animate-in fade-in duration-500">
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">My Referrals</h3>
                      <div className="bg-purple-50 text-purple-600 px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest border border-purple-100">£{referrals.reduce((sum, r) => sum + Number(r.rewardAmount || 0), 0).toFixed(2)} Earned</div>
                    </div>

                    <div className="space-y-4">
                      {referrals.length === 0 && (
                        <div className="py-20 text-center text-slate-400">
                          <Gift className="w-16 h-16 mx-auto mb-4 opacity-20" />
                          <p className="font-black text-sm uppercase tracking-widest mb-2">No referrals yet.</p>
                          <p className="text-xs">Share your code <span className="text-primary font-bold">{user?.referralCode}</span> to start earning!</p>
                        </div>
                      )}
                      {(referrals || []).map(r => (
                        <div key={r.id} className="p-6 rounded-[2rem] border border-slate-100 bg-white shadow-sm flex items-center justify-between hover:border-primary/18 transition-all">
                          <div className="flex items-center space-x-4">
                            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${r.status === 'Completed' || r.status === 'Paid Out' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-500'
                              }`}>
                              <Gift className="w-6 h-6" />
                            </div>
                            <div>
                              <h4 className="font-black text-lg text-slate-900 uppercase tracking-tight leading-none">{r.referredClientName}</h4>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                Referred on {new Date(r.dateReferred).toLocaleDateString()}
                              </p>
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-2xl font-black text-slate-900 tabular-nums leading-none">£{Number(r.rewardAmount || 0).toFixed(2)}</div>
                            <div className={`text-[10px] font-black uppercase tracking-widest mt-1 ${r.status === 'Paid Out' ? 'text-green-600' :
                              r.status === 'Completed' ? 'text-primary' : 'text-amber-500'
                              }`}>
                              {r.status}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Job specification — full-page overlay */}
          {selectedBookingForDetail && (
            <div className="fixed inset-0 z-[120] flex min-h-0 flex-col bg-gradient-to-br from-[#eef7ff] via-[#f7f5ff] to-[#eefcf7] animate-in fade-in duration-300">
              <header className="shrink-0 border-b border-slate-200/80 bg-white/95 px-4 py-4 shadow-sm backdrop-blur-xl sm:px-8 sm:py-5 pt-[max(1rem,env(safe-area-inset-top))]">
                <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (viewMode !== 'details') setViewMode('details');
                      else {
                        setSelectedBookingForDetail(null);
                        setViewMode('details');
                      }
                    }}
                    className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-600 shadow-sm transition-all hover:bg-slate-50 sm:px-5"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {viewMode !== 'details' ? (
                      <>
                        <span className="hidden sm:inline">Specification</span>
                        <span className="sm:hidden">Spec</span>
                      </>
                    ) : (
                      <>
                        <span className="hidden sm:inline">My cleans</span>
                        <span className="sm:hidden">Back</span>
                      </>
                    )}
                  </button>
                  <div className="min-w-0 flex-1 px-2 text-center">
                    <h1 className="truncate text-base font-black uppercase tracking-tight text-slate-900 sm:text-2xl">
                      {viewMode === 'details'
                        ? 'Job specification'
                        : viewMode === 'invoice'
                          ? 'Invoice & receipt'
                          : 'Booking confirmation'}
                    </h1>
                    <p className="truncate text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Booking ID: {selectedBookingForDetail.bookingId}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBookingForDetail(null);
                        setViewMode('details');
                      }}
                      className="rounded-2xl bg-white p-3.5 text-slate-400 shadow-sm ring-1 ring-slate-200 transition-all hover:text-slate-900 active:scale-95"
                      aria-label="Close"
                    >
                      <X className="h-6 w-6" />
                    </button>
                  </div>
                </div>
              </header>

              <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain no-scrollbar">
                <div className="mx-auto w-full max-w-4xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 sm:px-6 sm:py-8 lg:px-8 safe-area-pb">
                  <div className="overflow-hidden rounded-[2rem] border border-slate-100/90 bg-white shadow-[0_8px_40px_-12px_rgba(15,23,42,0.12)] sm:rounded-[3rem]">
                    <div className="p-5 sm:p-8 lg:p-10">
                      {viewMode === 'details' && (
                        <div className="space-y-10">
                          {(() => {
                            const customerInfo = (selectedBookingForDetail as any).customer || selectedBookingForDetail.contact || {
                              name: 'Customer',
                              email: 'No email provided',
                              phone: 'No phone provided',
                            };
                            return (
                              <>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10">
                                  <DetailSection label="Service Type" value={selectedBookingForDetail.serviceType} icon={<CheckCircle2 className="text-primary w-4 h-4" />} />
                                  <DetailSection label="Date & Time" value={`${selectedBookingForDetail.date} @ ${selectedBookingForDetail.time}`} icon={<Clock className="text-primary w-4 h-4" />} />
                                  <DetailSection label="Location" value={`${selectedBookingForDetail.address.line1}, ${selectedBookingForDetail.address.city}, ${selectedBookingForDetail.address.postcode}`} icon={<MapPin className="text-primary w-4 h-4" />} />
                                  <DetailSection label="Investment" value={`£${Number(selectedBookingForDetail.totalPrice).toFixed(2)}`} icon={<CreditCard className="text-primary w-4 h-4" />} />
                                  <div className="col-span-full">
                                    <React.Suspense fallback={<div className="h-[200px] w-full bg-slate-100 rounded-2xl animate-pulse" />}>
                                      <AddressMap
                                        address={`${selectedBookingForDetail.address.line1}, ${selectedBookingForDetail.address.city}, ${selectedBookingForDetail.address.postcode}`}
                                        height="200px"
                                      />
                                    </React.Suspense>
                                  </div>
                                  <div className="space-y-3 col-span-full">
                                    <div className="flex items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                                      <span className="mr-2"><UserCheck className="text-primary w-4 h-4" /></span> Assigned Professionals
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                      {(selectedBookingForDetail.assignedStaffIds || (selectedBookingForDetail.assignedStaffId ? [selectedBookingForDetail.assignedStaffId] : [])).map(id => {
                                        const s = staffList.find(st => st.id === id);
                                        if (!s) return null;
                                        return (
                                          <div key={id} className="flex items-center space-x-4 p-4 bg-slate-50 rounded-[2rem] border border-slate-100">
                                            <div className="w-12 h-12 bg-white rounded-2xl overflow-hidden flex items-center justify-center border border-slate-100">
                                              {s.profilePhoto ? <img src={s.profilePhoto} alt={s.name} className="w-full h-full object-cover" /> : <UserIcon className="text-slate-300 w-6 h-6" />}
                                            </div>
                                            <div>
                                              <div className="font-black text-slate-900 text-sm">{s.name}</div>
                                              <div className="flex items-center text-amber-500 space-x-1">
                                                <Star className="w-3 h-3 fill-current" />
                                                <span className="text-[10px] font-black">{Number(s.rating ?? 4.9).toFixed(1)}</span>
                                                <span className={`text-[10px] font-black ml-2 ${s.isVerified === false || s.status !== 'Active' ? 'text-amber-600' : 'text-green-600'}`}>
                                                  {s.isVerified === false || s.status !== 'Active' ? 'UNVERIFIED' : 'VERIFIED'}
                                                </span>
                                              </div>
                                            </div>
                                          </div>
                                        );
                                      })}
                                      {!(selectedBookingForDetail.assignedStaffIds?.length || selectedBookingForDetail.assignedStaffId) && (
                                        <div className="text-sm font-bold text-slate-400 italic py-2">Allocation in progress...</div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="space-y-3">
                                    <div className="flex items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
                                      <span className="mr-2"><UserIcon className="text-primary w-4 h-4" /></span> Client Information
                                    </div>
                                    <div className="space-y-1">
                                      <div className="font-black text-slate-900 text-lg uppercase tracking-tight leading-none">{customerInfo.name}</div>
                                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{customerInfo.email}</div>
                                      <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{customerInfo.phone || 'No phone provided'}</div>
                                    </div>
                                  </div>
                                </div>

                                {user &&
                                  (selectedBookingForDetail.depositTermsAcceptedAt ||
                                    selectedBookingForDetail.shortNoticeCancelFeeConsentedAt) && (
                                    <div className="rounded-[2rem] border border-indigo-100 bg-gradient-to-br from-indigo-50/95 via-white to-slate-50 p-6 sm:p-8 space-y-5 shadow-sm">
                                      <div className="flex items-start gap-3">
                                        <div className="shrink-0 rounded-2xl bg-indigo-600 p-2.5 text-white shadow-md shadow-indigo-200">
                                          <Upload className="w-5 h-5" />
                                        </div>
                                        <div className="min-w-0 space-y-2">
                                          <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-800">
                                            Upload payment proof (for admin)
                                          </h4>
                                          <p className="text-sm font-medium text-slate-700 leading-relaxed">
                                            You agreed to our{' '}
                                            {selectedBookingForDetail.depositTermsAcceptedAt ? (
                                              <strong>deposit / payment terms</strong>
                                            ) : null}
                                            {selectedBookingForDetail.depositTermsAcceptedAt &&
                                              selectedBookingForDetail.shortNoticeCancelFeeConsentedAt
                                              ? ' and '
                                              : null}
                                            {selectedBookingForDetail.shortNoticeCancelFeeConsentedAt ? (
                                              <strong>short-notice cancellation fee</strong>
                                            ) : null}
                                            . After you pay (e.g. bank transfer using the details on your invoice), upload a
                                            clear screenshot or PDF here so we can match your payment to this booking.
                                          </p>
                                          <p className="text-xs font-bold text-slate-500 leading-snug">
                                            Include reference, date, and amount if visible. Images or PDF only, up to{' '}
                                            {MAX_FEE_EVIDENCE_FILES} files, max 4 MB each.
                                          </p>
                                        </div>
                                      </div>

                                      {selectedBookingForDetail.depositTermsAcceptedAt &&
                                        selectedBookingForDetail.shortNoticeCancelFeeConsentedAt ? (
                                        <div className="space-y-1">
                                          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">
                                            What is this file for?
                                          </label>
                                          <select
                                            value={feeEvidenceKind}
                                            onChange={(e) =>
                                              setFeeEvidenceKind(e.target.value as 'deposit' | 'cancellation_fee')
                                            }
                                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800"
                                          >
                                            <option value="deposit">Deposit payment</option>
                                            <option value="cancellation_fee">Cancellation fee payment</option>
                                          </select>
                                        </div>
                                      ) : selectedBookingForDetail.depositTermsAcceptedAt ? (
                                        <p className="text-xs font-black uppercase tracking-widest text-indigo-700">
                                          Proof type: deposit payment
                                        </p>
                                      ) : (
                                        <p className="text-xs font-black uppercase tracking-widest text-indigo-700">
                                          Proof type: cancellation fee payment
                                        </p>
                                      )}

                                      <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block">
                                          Optional note to admin
                                        </label>
                                        <textarea
                                          value={feeEvidenceNote}
                                          onChange={(e) => setFeeEvidenceNote(e.target.value)}
                                          rows={2}
                                          maxLength={500}
                                          placeholder="e.g. Paid from account ending 1234 on 3 May"
                                          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-800 placeholder:text-slate-400"
                                        />
                                      </div>

                                      <div className="flex flex-wrap items-center gap-3">
                                        <label className="inline-flex cursor-pointer items-center justify-center rounded-xl bg-indigo-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-md hover:bg-indigo-700 disabled:opacity-50">
                                          <input
                                            type="file"
                                            accept="image/*,application/pdf"
                                            className="hidden"
                                            disabled={feeEvidenceSaving}
                                            onChange={handleFeeEvidenceFileChange}
                                          />
                                          {feeEvidenceSaving ? 'Uploading…' : 'Choose file'}
                                        </label>
                                        <button
                                          type="button"
                                          onClick={handleFeeEvidenceUploadSubmit}
                                          disabled={feeEvidenceSaving || !feeEvidencePendingFile}
                                          className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-5 py-3 text-xs font-black uppercase tracking-widest text-white shadow-md transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                          {feeEvidenceSaving ? 'Submitting…' : 'Submit proof'}
                                        </button>
                                        {feeEvidencePendingFile ? (
                                          <span className="text-[10px] font-bold text-indigo-700">
                                            Selected: {feeEvidencePendingFile.name}
                                          </span>
                                        ) : null}
                                        <span className="text-[10px] font-bold text-slate-500">
                                          {(selectedBookingForDetail.paymentFeeEvidence?.items?.length ?? 0)} /{' '}
                                          {MAX_FEE_EVIDENCE_FILES} uploaded
                                        </span>
                                      </div>

                                      {selectedBookingForDetail.paymentFeeEvidence?.items &&
                                        selectedBookingForDetail.paymentFeeEvidence.items.length > 0 ? (
                                        <div className="space-y-2">
                                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            Your uploads
                                          </p>
                                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {selectedBookingForDetail.paymentFeeEvidence.items.map((it, idx) => (
                                              <li
                                                key={`${it.uploadedAt}-${idx}`}
                                                className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left"
                                              >
                                                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                                                  {it.dataUrl?.toLowerCase().startsWith('data:image/') ? (
                                                    <img src={it.dataUrl} alt="" className="h-full w-full object-cover" />
                                                  ) : (
                                                    <div className="flex h-full w-full items-center justify-center text-[10px] font-black text-slate-500">
                                                      PDF
                                                    </div>
                                                  )}
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                  <div className="text-[10px] font-black uppercase text-indigo-700">
                                                    {it.kind === 'cancellation_fee' ? 'Cancellation fee' : 'Deposit'}
                                                  </div>
                                                  <div className="truncate text-xs font-bold text-slate-800">
                                                    {it.fileName || 'File'}
                                                  </div>
                                                  <div className="text-[10px] font-medium text-slate-500">
                                                    {new Date(it.uploadedAt).toLocaleString()}
                                                  </div>
                                                  {it.note ? (
                                                    <div className="mt-1 text-[10px] font-medium text-slate-600 line-clamp-2">
                                                      {it.note}
                                                    </div>
                                                  ) : null}
                                                </div>
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      ) : null}
                                    </div>
                                  )}

                                {selectedBookingForDetail.instructions && (
                                  <div className="p-8 bg-primary/10 rounded-[2.5rem] border border-primary/18 italic font-medium text-slate-600">
                                    <div className="flex items-center text-[9px] font-black uppercase tracking-[0.2em] text-primary mb-3"><Info className="w-4 h-4 mr-2" /> Special Instructions</div>
                                    "{selectedBookingForDetail.instructions}"
                                  </div>
                                )}

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <button
                                    onClick={() => setViewMode('confirmation')}
                                    className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-between group hover:bg-white hover:shadow-xl hover:border-primary/18 transition-all"
                                  >
                                    <div className="flex items-center space-x-4">
                                      <div className="w-12 h-12 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center group-hover:bg-green-600 group-hover:text-white transition-colors">
                                        <ShieldCheck className="w-6 h-6" />
                                      </div>
                                      <div className="text-left">
                                        <span className="block font-black text-slate-900 text-sm uppercase tracking-tight">Booking Confirmation</span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">View & Download</span>
                                      </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-green-600 transition-colors" />
                                  </button>

                                  <button
                                    onClick={() => setViewMode('invoice')}
                                    className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-between group hover:bg-white hover:shadow-xl hover:border-primary/18 transition-all"
                                  >
                                    <div className="flex items-center space-x-4">
                                      <div className="w-12 h-12 bg-primary/18 text-primary rounded-2xl flex items-center justify-center group-hover:bg-primary group-hover:text-white transition-colors">
                                        <Download className="w-6 h-6" />
                                      </div>
                                      <div className="text-left">
                                        <span className="block font-black text-slate-900 text-sm uppercase tracking-tight">Invoice #INV-{String(selectedBookingForDetail.bookingId).slice(-4)}</span>
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">View & Pay</span>
                                      </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-primary transition-colors" />
                                  </button>
                                </div>

                                {selectedBookingForDetail.stripePaymentLink && !selectedBookingForDetail.invoicePaid && (
                                  <a
                                    href={selectedBookingForDetail.stripePaymentLink}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="block p-6 bg-gradient-to-r from-emerald-50 to-green-50 rounded-[2rem] border border-emerald-200 hover:shadow-xl hover:border-emerald-400 transition-all group"
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center space-x-4">
                                        <div className="w-12 h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-emerald-200 group-hover:scale-105 transition-transform">
                                          <CreditCard className="w-6 h-6" />
                                        </div>
                                        <div>
                                          <span className="block font-black text-emerald-900 text-sm uppercase tracking-tight">Pay Deposit Now</span>
                                          <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">Secure card payment via Stripe</span>
                                        </div>
                                      </div>
                                      <ExternalLink className="w-5 h-5 text-emerald-400 group-hover:text-emerald-600 transition-colors" />
                                    </div>
                                  </a>
                                )}

                                {selectedBookingForDetail.invoicePaid && (
                                  <div className="p-6 bg-gradient-to-r from-green-50 to-emerald-50 rounded-[2rem] border border-green-200">
                                    <div className="flex items-center space-x-4">
                                      <div className="w-12 h-12 bg-green-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-green-200">
                                        <CheckCircle2 className="w-6 h-6" />
                                      </div>
                                      <div>
                                        <span className="block font-black text-green-900 text-sm uppercase tracking-tight">Deposit Paid</span>
                                        <span className="text-[10px] font-bold text-green-600 uppercase tracking-widest">Payment confirmed — thank you!</span>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                <div className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                  <div>
                                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400">Current Status</div>
                                    <div className={`text-sm font-black uppercase tracking-widest ${selectedBookingForDetail.status === BookingStatus.COMPLETED ? 'text-green-600' : 'text-primary'}`}>{selectedBookingForDetail.status}</div>
                                  </div>
                                  {(selectedBookingForDetail.status === BookingStatus.PENDING || selectedBookingForDetail.status === BookingStatus.CONFIRMED) && (
                                    <button
                                      onClick={() => { setSelectedBookingForDetail(null); setCancellingBooking(selectedBookingForDetail); setShortNoticeConsentChecked(false); }}
                                      className={`px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all shadow-sm ${isCancellable(selectedBookingForDetail.date, selectedBookingForDetail.time)
                                        ? 'bg-red-50 text-red-600 border-red-100 hover:bg-red-600 hover:text-white'
                                        : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-600 hover:text-white'
                                        }`}
                                    >
                                      {isCancellable(selectedBookingForDetail.date, selectedBookingForDetail.time)
                                        ? 'Request Cancellation'
                                        : `Cancel (${shortNoticeWindowHours}h Rule Override)`}
                                    </button>
                                  )}
                                </div>

                                <button
                                  onClick={() => {
                                    setSelectedBookingForDetail(null);
                                    setViewMode('details');
                                  }}
                                  className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-2xl active:scale-95 transition-all"
                                >
                                  Back to my cleans
                                </button>
                              </>
                            );
                          })()}
                        </div>
                      )}

                      {viewMode === 'confirmation' && (
                        <BookingConfirmation
                          booking={selectedBookingForDetail}
                          services={services}
                          extrasList={extras}
                          isModal
                          depositConsent={{
                            variant: 'record',
                            acceptedAt: selectedBookingForDetail.depositTermsAcceptedAt,
                            onAcknowledge: selectedBookingForDetail.depositTermsAcceptedAt
                              ? undefined
                              : async () => {
                                const b = selectedBookingForDetail;
                                const r = await apiClient.updateBooking(b.id, { depositTermsAcknowledged: true });
                                onUpdateBooking({
                                  ...b,
                                  depositTermsAcceptedAt: r.depositTermsAcceptedAt ?? new Date().toISOString(),
                                });
                                showFlyer('Agreement saved on your booking.', 'success');
                              },
                          }}
                        />
                      )}

                      {viewMode === 'invoice' && (
                        <InvoiceView
                          booking={selectedBookingForDetail}
                          serviceConfig={services.find(s => s.id === selectedBookingForDetail.serviceType || s.name === selectedBookingForDetail.serviceType)}
                          extrasConfig={extras}
                          total={selectedBookingForDetail.totalPrice}
                          depositConsent={{
                            variant: 'record',
                            acceptedAt: selectedBookingForDetail.depositTermsAcceptedAt,
                            onAcknowledge: selectedBookingForDetail.depositTermsAcceptedAt
                              ? undefined
                              : async () => {
                                const b = selectedBookingForDetail;
                                const r = await apiClient.updateBooking(b.id, { depositTermsAcknowledged: true });
                                onUpdateBooking({
                                  ...b,
                                  depositTermsAcceptedAt: r.depositTermsAcceptedAt ?? new Date().toISOString(),
                                });
                                showFlyer('Agreement saved on your booking.', 'success');
                              },
                          }}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </main>
            </div>
          )}

          {cancellingBooking && (
            <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-md flex items-stretch sm:items-center justify-center p-0 sm:p-6 overflow-y-auto">
              <div className="bg-white w-full sm:max-w-md rounded-none sm:rounded-[3.5rem] shadow-2xl relative overflow-hidden p-6 sm:p-10 animate-in fade-in sm:zoom-in-95 duration-300 text-center min-h-screen sm:min-h-0 flex flex-col justify-center">
                <div className="w-20 h-20 bg-red-50 text-red-500 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <AlertTriangle className="w-10 h-10" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2 uppercase tracking-tight">Confirm Cancellation</h3>
                <p className="text-slate-500 text-sm font-medium mb-6 leading-relaxed">Are you sure you want to cancel your **{cancellingBooking.serviceType}** on **{cancellingBooking.date}**? This action cannot be undone.</p>
                {getHoursUntilBooking(cancellingBooking.date, cancellingBooking.time) < shortNoticeWindowHours && (
                  <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left space-y-3">
                    <p className="text-xs font-black uppercase tracking-widest text-amber-800">Short-notice cancellation</p>
                    <p className="text-sm font-semibold text-amber-900 leading-relaxed">
                      {shortNoticeConsentMessage}
                    </p>
                    <p className="text-sm font-black text-amber-900">
                      Fee: £{((Number(cancellingBooking.totalPrice) || 0) * (shortNoticeFeePercent / 100)).toFixed(2)} ({shortNoticeFeePercent}% of £{Number(cancellingBooking.totalPrice).toFixed(2)})
                    </p>
                    <div className="rounded-xl border border-amber-100 bg-white p-3 space-y-2">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Bank details</p>
                      {cancellationBankDetails.map((bank) => (
                        <div key={bank.id} className="text-sm text-slate-700 font-semibold leading-relaxed">
                          <p className="font-black text-slate-900">{bank.accountName}</p>
                          <p>Account number: {bank.accountNumber}</p>
                          <p>Sort code: {bank.sortCode}</p>
                        </div>
                      ))}
                    </div>
                    <label className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                      <input
                        type="checkbox"
                        checked={shortNoticeConsentChecked}
                        onChange={(e) => setShortNoticeConsentChecked(e.target.checked)}
                        className="mt-0.5"
                      />
                      I consent to the short-notice cancellation fee and agree to complete payment.
                    </label>
                  </div>
                )}

                <div className="flex flex-col space-y-3">
                  <button onClick={handleCancelConfirm} className="w-full bg-red-600 text-white py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-red-700 transition-all active:scale-95">Yes, Cancel Booking</button>
                  <button onClick={() => { setCancellingBooking(null); setShortNoticeConsentChecked(false); }} className="w-full bg-slate-100 text-slate-600 py-5 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">No, Keep Booking</button>
                </div>
              </div>
            </div>
          )}

          {ratingBooking && (
            <div className="fixed inset-0 z-[130] bg-slate-900/60 backdrop-blur-md flex items-stretch sm:items-center justify-center p-0 sm:p-6 overflow-y-auto">
              <div className="bg-white w-full sm:max-w-lg rounded-none sm:rounded-[3.5rem] shadow-2xl relative overflow-hidden animate-in fade-in sm:zoom-in-95 duration-300 min-h-screen sm:min-h-0 flex flex-col">
                <div className="p-6 sm:p-10 bg-amber-50 border-b flex justify-between items-center">
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight leading-none">Rate Service</h3>
                  <button onClick={() => setRatingBooking(null)} className="p-4 bg-white rounded-2xl shadow-sm text-slate-400 hover:text-slate-900 transition-all active:scale-90"><X className="w-6 h-6" /></button>
                </div>
                <div className="p-6 sm:p-12 space-y-10 text-center">
                  <div className="flex items-center justify-center space-x-3">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} onClick={() => setStarCount(s)} className="p-2 transition-transform hover:scale-125">
                        <Star className={`w-12 h-12 ${s <= starCount ? 'text-amber-400 fill-amber-400' : 'text-slate-100'}`} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={feedback}
                    onChange={e => setFeedback(e.target.value)}
                    placeholder="Tell us about your cleaning professional..."
                    className="w-full p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] min-h-[160px] text-sm font-medium outline-none focus:ring-4 ring-amber-500/10 transition-all resize-none shadow-inner"
                  />
                  <button onClick={handleRatingSubmit} className="w-full bg-slate-900 text-white py-6 rounded-[2rem] font-black text-sm uppercase tracking-widest shadow-2xl hover:bg-slate-800 active:scale-95 transition-all">Submit Feedback</button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailSection: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="space-y-3">
    <div className="flex items-center text-[10px] font-black uppercase tracking-widest text-slate-400">
      <span className="mr-2">{icon}</span> {label}
    </div>
    <div className="font-black text-slate-900 text-lg uppercase tracking-tight leading-tight">{value}</div>
  </div>
);

const SecurityAction: React.FC<{ label: string; icon: React.ReactNode; onClick?: () => void }> = ({ label, icon, onClick }) => (
  <button onClick={onClick} className="w-full flex items-center justify-between p-6 rounded-[2.5rem] bg-slate-50 border border-slate-100 font-black text-sm text-slate-600 hover:bg-white hover:border-primary/28 transition-all group shadow-sm">
    <div className="flex items-center space-x-4">
      <span className="text-slate-300 group-hover:text-primary transition-colors">{icon}</span>
      <span className="uppercase tracking-tight">{label}</span>
    </div>
    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform opacity-30" />
  </button>
);

const SidebarBtn: React.FC<{ active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number; tone?: SectionTone }> = ({ active, onClick, icon, label, count, tone = 'indigo' }) => {
  const toneClasses: Record<SectionTone, { active: string; count: string }> = {
    blue: {
      active: 'bg-gradient-to-r from-blue-600 to-cyan-600 border-blue-500 shadow-blue-200/70',
      count: 'bg-blue-100 text-blue-600',
    },
    purple: {
      active: 'bg-gradient-to-r from-purple-600 to-fuchsia-600 border-purple-500 shadow-purple-200/70',
      count: 'bg-purple-100 text-purple-600',
    },
    indigo: {
      active: 'bg-gradient-to-r from-indigo-600 to-violet-600 border-indigo-500 shadow-indigo-200/70',
      count: 'bg-indigo-100 text-indigo-600',
    },
    emerald: {
      active: 'bg-gradient-to-r from-emerald-600 to-teal-600 border-emerald-500 shadow-emerald-200/70',
      count: 'bg-emerald-100 text-emerald-600',
    },
    amber: {
      active: 'bg-gradient-to-r from-amber-500 to-orange-500 border-amber-400 shadow-amber-200/70',
      count: 'bg-amber-100 text-amber-600',
    },
    rose: {
      active: 'bg-gradient-to-r from-rose-600 to-pink-600 border-rose-500 shadow-rose-200/70',
      count: 'bg-rose-100 text-rose-600',
    },
  };
  const t = toneClasses[tone];
  return (
    <button onClick={onClick} className={`w-full flex items-center justify-between px-8 py-5 rounded-2xl border transition-all ${active ? `${t.active} text-white shadow-2xl scale-[1.02]` : 'text-slate-500 bg-white/85 border-indigo-100 hover:bg-white hover:text-primary hover:border-primary/25 shadow-sm'}`}>
      <div className="flex items-center space-x-4">
        <span className="shrink-0">{icon}</span>
        <span className="font-bold text-sm tracking-tight uppercase">{label}</span>
      </div>
      {count ? <span className={`px-3 py-1 rounded-lg text-[9px] font-black ${active ? 'bg-white text-slate-900' : t.count}`}>{count}</span> : null}
    </button>
  );
};

export default CustomerPortal;
