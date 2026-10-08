
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  Calendar,
  Clock,
  MapPin,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  MoreVertical,
  Plus,
  Trash2,
  Edit2,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronDown,
  ClipboardList,
  ChevronsRight,
  ArrowUpRight,
  ArrowDownRight,
  Settings,
  LogOut,
  Menu,
  X,
  Mail,
  Phone,
  DollarSign,
  Briefcase,
  Star,
  Award,
  Zap,
  Layers,
  Calculator,
  BarChart3,
  PieChart as PieChartIcon,
  TrendingUp,
  UserPlus,
  UserCheck,
  UserX,
  Send,
  AlertCircle,
  Building2,
  Palette,
  Image as ImageIcon,
  LayoutDashboard,
  MessageCircle,
  ThumbsUp,
  Lock,
  MailQuestion,
  Package, // Re-added
  CalendarDays, // Re-added
  ShieldCheck, // NEW
  MessageSquare,
  Smartphone, // NEW ICON for SMS
  AlertTriangle,
  Ban,
  Download,
  FileText,
  RefreshCw,
  EyeOff,
  Eye,
  RotateCcw,
  Receipt,
} from 'lucide-react';
import { Booking, BookingStatus, ServiceConfig, Extra, Staff, Referral, EmailTemplate, SmsTemplate, BusinessSettings, UserAccount, ChatSummary, QuoteLead, QuoteLeadStatus } from '../types';
import { apiAdmin, apiUrl } from '../services/api';
import { subscribeNnSync } from '../services/realtime';
import { NotificationBell } from './NotificationBell';
import QuoteRequestsPanel from './admin/QuoteRequestsPanel';
import RotaSchedulePanel from './admin/RotaSchedulePanel';
import { useTheme } from './ThemeProvider';
import { format } from 'date-fns';
import CommunicationCenter from './admin/CommunicationCenter';
import BookingReviewModal from './admin/ReviewBookingModal';
import StaffAssignmentModal from './admin/StaffAssignmentModal';
import RescheduleBookingModal from './admin/RescheduleBookingModal';
import ServiceFlyout from './admin/ServiceFlyout';
import ExtraServiceFlyout from './admin/ExtraServiceFlyout';
import CreateServiceFlyout from './admin/CreateServiceFlyout';
import ReferralFlyout from './admin/ReferralFlyout';
import ActivityLogFlyout from './admin/ActivityLogFlyout';
import ChatOversightFlyout from './admin/ChatOversightFlyout';
import EmailTemplateFlyout from './admin/EmailTemplateFlyout';
import SmsTemplateFlyout from './admin/SmsTemplateFlyout'; // ADDED SMS FLYOUT
import BrevoSettingsCard from './admin/BrevoSettingsCard';
import WebsiteContentManager from './admin/WebsiteContentManager';
import GalleryManager from './admin/GalleryManager';
import BlogManager from './admin/BlogManager';
import SeoSettingsManager from './admin/SeoSettingsManager';
import AiAssistantSettingsPanel from './admin/AiAssistantSettingsPanel';
import PricingPageSettingsPanel from './admin/PricingPageSettingsPanel';
import BookingRemindersPanel from './admin/BookingRemindersPanel';
import ReviewsPanel from './admin/ReviewsPanel';
import AdminStaffChat from './admin/AdminStaffChat';
import CustomerInvoicesPanel from './admin/CustomerInvoicesPanel';
import ExpenseTracker from './admin/ExpenseTracker';
import QrCodePanel from './admin/QrCodePanel';
import StaffProfileFlyout from './admin/StaffProfileFlyout';
import ClientHistoryFlyout from './admin/ClientHistoryFlyout';
import LiveMapPanel from './admin/LiveMapPanel';
import BrandLogoMark from './BrandLogoMark';
import StaffInvoiceDocument from './StaffInvoiceDocument';
import { useFlyer } from './Flyer';
import {
  bookingHasStaff,
  exportBookingsCsv,
  findStaffScheduleConflicts,
  getOverlapConflictDetailsForPatchedBooking,
  getTodayYYYYMMDD,
  getTomorrowYYYYMMDD,
  parseLocalDateFromYYYYMMDD,
} from '../src/utils/bookingHelpers';

interface Props {
  bookings: Booking[];
  onLogout: () => void;
  currentUser: UserAccount | null;
}

type AdminTab = 'overview' | 'bookings' | 'quotes' | 'assignment' | 'rota' | 'liveMap' | 'staff' | 'staffInvoices' | 'customerInvoices' | 'services' | 'marketing' | 'communication' | 'support' | 'settings' | 'reviews' | 'expenses' | 'performance';

type SettingsSectionId = 'seo' | 'ai' | 'pricing' | 'website' | 'business' | 'theme' | 'templates' | 'reminders' | 'qrcode';
type BusinessProfileSubId = 'company' | 'social' | 'payments';
type MarketingSectionId = 'overview' | 'referrals' | 'loyalty' | 'promos' | 'website' | 'gallery' | 'blog';
type ServicesSectionId = 'catalog' | 'addons';

interface PromotionRow {
  id: number;
  title: string;
  description: string | null;
  bannerText: string | null;
  discountCode: string | null;
  discountPercent: number | null;
  startDate: string;
  endDate: string;
  active: boolean;
  showOnHomepage: boolean;
  showOnBooking: boolean;
}

interface PromoFormState {
  title: string;
  description: string;
  bannerText: string;
  discountCode: string;
  /** Kept as a string so the number input can be cleared; coerced on save. */
  discountPercent: string;
  startDate: string;
  endDate: string;
  showOnHomepage: boolean;
  showOnBooking: boolean;
}

const EMPTY_PROMO_FORM: PromoFormState = {
  title: '',
  description: '',
  bannerText: '',
  discountCode: '',
  discountPercent: '',
  startDate: '',
  endDate: '',
  showOnHomepage: true,
  showOnBooking: true,
};
const ADMIN_PERMISSIONABLE_TABS: AdminTab[] = [
  'overview',
  'bookings',
  'quotes',
  'assignment',
  'rota',
  'staff',
  'staffInvoices',
  'customerInvoices',
  'services',
  'marketing',
  'reviews',
  'expenses',
  'performance',
  'liveMap',
  'communication',
  'support',
  'settings',
];

/** Human-readable names for menus (also used when granting menu access to other admins). */
const ADMIN_TAB_LABELS: Record<AdminTab, string> = {
  overview: 'Dashboard',
  bookings: 'Bookings',
  quotes: 'Quote Requests',
  assignment: 'Job Assignment',
  rota: 'Rota & Schedule',
  liveMap: 'Live Map',
  staff: 'Staffing',
  staffInvoices: 'Staff invoices',
  performance: 'Performance',
  customerInvoices: 'Customer Invoices',
  expenses: 'Expenses',
  services: 'Services',
  marketing: 'Marketing',
  reviews: 'Reviews',
  communication: 'Communication',
  support: 'Chat Oversight',
  settings: 'Settings',
};

/** Sidebar sections. Groups can be folded away; the one holding the open page always stays open. */
const ADMIN_MENU_GROUPS: Array<{ id: string; label: string; tabs: AdminTab[] }> = [
  { id: 'home', label: '', tabs: ['overview'] },
  { id: 'jobs', label: 'Jobs & bookings', tabs: ['bookings', 'quotes', 'assignment', 'rota', 'liveMap'] },
  { id: 'team', label: 'Team', tabs: ['staff', 'staffInvoices', 'performance'] },
  { id: 'finance', label: 'Finance', tabs: ['customerInvoices', 'expenses'] },
  { id: 'growth', label: 'Growth', tabs: ['services', 'marketing', 'reviews'] },
];

const SETTINGS_NAV: { id: SettingsSectionId; label: string }[] = [
  { id: 'seo', label: 'SEO & search' },
  { id: 'ai', label: 'AI concierge' },
  { id: 'pricing', label: 'Pricing page' },
  { id: 'website', label: 'Website adverts' },
  { id: 'business', label: 'Business profile' },
  { id: 'theme', label: 'Theme & colors' },
  { id: 'templates', label: 'Email & SMS' },
  { id: 'reminders', label: 'Booking reminders' },
  { id: 'qrcode', label: 'QR codes' },
];

const MARKETING_NAV: { id: MarketingSectionId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'referrals', label: 'Referrals' },
  { id: 'loyalty', label: 'Loyalty' },
  { id: 'promos', label: 'Promo codes' },
  { id: 'website', label: 'Website content' },
  { id: 'gallery', label: 'Gallery' },
  { id: 'blog', label: 'Blog' },
];

const SERVICES_NAV: { id: ServicesSectionId; label: string }[] = [
  { id: 'catalog', label: 'Main services' },
  { id: 'addons', label: 'Extra add-ons' },
];

function AdminInnerSubNav<T extends string>({
  items,
  active,
  onChange,
  ariaLabel,
}: {
  items: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <nav
      className="flex flex-row flex-wrap gap-2 lg:flex-col lg:flex-nowrap lg:w-52 shrink-0 lg:sticky lg:top-4 z-10 pb-1 lg:pb-0"
      aria-label={ariaLabel}
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`rounded-xl px-3 py-2.5 text-left text-[10px] font-black uppercase tracking-widest transition-all border-2 ${active === item.id
              ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200'
              : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200 hover:bg-slate-50'
            }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}

function isOngoingLiveChat(s: ChatSummary | undefined): boolean {
  if (!s || s.chatClosed || s.msgCount === 0) return false;
  if (!s.lastMessageAt || !s.lastSenderRole) return false;
  if (s.lastSenderRole === 'admin') return false;
  const age = Date.now() - new Date(s.lastMessageAt).getTime();
  return age >= 0 && age < 15 * 60 * 1000;
}

const AdminDashboard: React.FC<Props> = ({ bookings: initialBookings, onLogout, currentUser }) => {
  const { showFlyer } = useFlyer();
  const { settings: themeSettings, updateSettings: updateTheme, saveSettings: saveTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try {
      return typeof localStorage !== 'undefined' && localStorage.getItem('nn_admin_sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });

  const [foldedMenuGroups, setFoldedMenuGroups] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('nn_admin_menu_groups_folded') || '[]');
      return Array.isArray(saved) ? saved.filter((x): x is string => typeof x === 'string') : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('nn_admin_menu_groups_folded', JSON.stringify(foldedMenuGroups));
    } catch {
      /* ignore */
    }
  }, [foldedMenuGroups]);

  useEffect(() => {
    try {
      localStorage.setItem('nn_admin_sidebar_collapsed', isSidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [isSidebarCollapsed]);

  // Marketing/Discounts State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookingStatus | 'All'>('All');
  const [bookingsSubView, setBookingsSubView] = useState<'pipeline' | 'upcoming'>('pipeline');
  const [pipelineQuickFilter, setPipelineQuickFilter] = useState<
    'none' | 'today' | 'unassigned' | 'stale_pending' | 'cancel_requests' | 'cancelled' | 'hidden'
  >('none');

  const [selectedBookingIds, setSelectedBookingIds] = useState<Set<number>>(new Set());
  const [hiddenBookingIds, setHiddenBookingIds] = useState<Set<number>>(() => {
    try {
      const stored = localStorage.getItem('nn_admin_hidden_bookings');
      if (stored) return new Set(JSON.parse(stored) as number[]);
    } catch { /* ignore */ }
    return new Set();
  });

  const persistHiddenBookings = useCallback((ids: Set<number>) => {
    setHiddenBookingIds(ids);
    try { localStorage.setItem('nn_admin_hidden_bookings', JSON.stringify([...ids])); } catch { /* ignore */ }
  }, []);

  const handleDismissBookings = useCallback((ids: number[]) => {
    const next = new Set(hiddenBookingIds);
    ids.forEach((id) => next.add(id));
    persistHiddenBookings(next);
    setSelectedBookingIds(new Set());
  }, [hiddenBookingIds, persistHiddenBookings]);

  const handleRestoreBookings = useCallback((ids: number[]) => {
    const next = new Set(hiddenBookingIds);
    ids.forEach((id) => next.delete(id));
    persistHiddenBookings(next);
    setSelectedBookingIds(new Set());
  }, [hiddenBookingIds, persistHiddenBookings]);

  // Data State (keep in sync with App refetches / WebSocket)
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);

  useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

  useEffect(() => {
    void apiAdmin.getChatSummaries().then(setChatSummaries).catch(() => { });
    return subscribeNnSync((scope) => {
      if (scope === 'all' || scope === 'bookings') {
        void apiAdmin.getChatSummaries().then(setChatSummaries).catch(() => { });
      }
    });
  }, []);

  useEffect(() => {
    setSelectedChatBooking((prev) => {
      if (!prev) return prev;
      const next = bookings.find((b) => b.id === prev.id);
      return next ?? prev;
    });
  }, [bookings]);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [services, setServices] = useState<ServiceConfig[]>([]);
  const [extraServices, setExtraServices] = useState<Extra[]>([]);
  const [discounts, setDiscounts] = useState<any[]>([]); // New Discount State
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referralRewardAmount, setReferralRewardAmount] = useState<number>(20);
  const [isSavingReferralReward, setIsSavingReferralReward] = useState(false);
  const [loyaltyOverview, setLoyaltyOverview] = useState<{
    totalCustomers: number;
    customersWithPoints: number;
    totalPoints: number;
    topCustomers: Array<{ id: number; name: string; email: string; loyaltyPoints: number; referralCode?: string }>;
    topReferrers: Array<{ id: number; name: string; role: string; referrals: number }>;
  }>({
    totalCustomers: 0,
    customersWithPoints: 0,
    totalPoints: 0,
    topCustomers: [],
    topReferrers: [],
  });
  const [invoiceDecisionNotes, setInvoiceDecisionNotes] = useState<Record<number, string>>({});
  /** Staff invoice whose note is open for editing after it was approved/rejected. */
  const [editingStaffInvoiceNoteId, setEditingStaffInvoiceNoteId] = useState<number | null>(null);
  const [savingStaffInvoiceNoteId, setSavingStaffInvoiceNoteId] = useState<number | null>(null);
  const [expandedStaffInvoiceId, setExpandedStaffInvoiceId] = useState<number | null>(null);
  const [staffPayInvoices, setStaffPayInvoices] = useState<Array<{
    id: number;
    staffId: number;
    staffName?: string | null;
    weekLabel: string;
    weekStart?: string | null;
    weekEnd?: string | null;
    totalAmount: number;
    weekTotalHours: number;
    weekJobCount: number;
    jobs: unknown;
    bankDetails?: unknown;
    status: string;
    adminNotes?: string | null;
    createdAt?: string;
  }>>([]);
  const [customerInvoicesList, setCustomerInvoicesList] = useState<any[]>([]);
  const [staffCancelRequests, setStaffCancelRequests] = useState<Array<{
    id: number;
    bookingId: number;
    staffName: string;
    status?: string | null;
    reason?: string | null;
    createdAt?: string | null;
    serviceType?: string | null;
    date?: string | null;
    time?: string | null;
    bookingStatus?: string | null;
  }>>([]);
  const [adminAccounts, setAdminAccounts] = useState<Array<{
    id: number;
    name: string;
    email: string;
    role: string;
    adminTabs?: string[];
    createdAt?: string;
  }>>([]);
  const [cancelDecisionNotes, setCancelDecisionNotes] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  // Settings & Branding
  const [businessSettings, setBusinessSettings] = useState<Partial<BusinessSettings>>({
    companyName: 'CiN Cleaning',
    email: 'support@niceneat.com',
    phone: '',
    website: '',
    primaryColor: '#4f46e5',
    logoUrl: null,
    address: '',
    socialLinks: { facebook: '', instagram: '', tiktok: '', twitter: '', linkedin: '' },
    bankDetails: [
      {
        id: 'bank-default-1',
        accountName: 'Surpluslink & co LTD',
        accountNumber: '27847158',
        sortCode: '04-06-05',
        bankName: '',
        notes: '',
        active: true,
      },
    ],
    depositPolicy: {
      requiredPercent: 40,
      message:
        'A 40% deposit secures your booking and guarantees our staff arrive on schedule, fully prepared to deliver.',
    },
    cancellationPolicy: {
      shortNoticeWindowHours: 24,
      shortNoticeFeePercent: 10,
      consentMessage:
        'If you choose to cancel within 24 hours of your appointment, you agree to a short-notice cancellation fee of 10% of the booking total.',
    },
  });
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);

  // --- SMS Templates ---
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([]);
  const [editingSmsTemplate, setEditingSmsTemplate] = useState<SmsTemplate | null>(null);

  // Staff Creation/Editing State
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [isEditingStaff, setIsEditingStaff] = useState(false);
  const [newStaff, setNewStaff] = useState({ name: '', email: '', role: 'Cleaner' as any, password: '', skills: [] as string[], hourlyRate: '15', adminTabs: [] as AdminTab[] });
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string; role: string } | null>(null);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [editingPassword, setEditingPassword] = useState('');
  const [profileStaff, setProfileStaff] = useState<Staff | null>(null);
  const [profileClientEmail, setProfileClientEmail] = useState<string | null>(null);

  // Extra Service Creation State
  const [isCreatingExtra, setIsCreatingExtra] = useState(false);
  const [newExtra, setNewExtra] = useState({ name: '', price: '', type: 'fixed', duration: '30' });

  // Discount Creation State
  const [isCreatingDiscount, setIsCreatingDiscount] = useState(false);
  const [newDiscount, setNewDiscount] = useState({ code: '', type: 'fixed', value: '', usageLimit: '' });
  const [isStaffFormSubmitting, setIsStaffFormSubmitting] = useState(false);
  const [isExtraFormSubmitting, setIsExtraFormSubmitting] = useState(false);
  const [isDiscountFormSubmitting, setIsDiscountFormSubmitting] = useState(false);

  // Modals / Selected Items
  const [reminderModalBooking, setReminderModalBooking] = useState<Booking | null>(null);
  const [batchReminderModalOpen, setBatchReminderModalOpen] = useState(false);
  const [reminderMessage, setReminderMessage] = useState('');
  const [selectedBookingForAssignment, setSelectedBookingForAssignment] = useState<Booking | null>(null);
  const [selectedStaffIds, setSelectedStaffIds] = useState<number[]>([]);
  const [reviewBooking, setReviewBooking] = useState<Booking | null>(null);
  const [monitoringChatBooking, setMonitoringChatBooking] = useState<Booking | null>(null);
  const [rescheduleBooking, setRescheduleBooking] = useState<Booking | null>(null);
  const [editingService, setEditingService] = useState<ServiceConfig | null>(null);
  const [editingExtra, setEditingExtra] = useState<Extra | null>(null);
  const [isCreatingService, setIsCreatingService] = useState(false);
  const [editingReferral, setEditingReferral] = useState<Referral | null>(null);
  const [editingEmailTemplate, setEditingEmailTemplate] = useState<EmailTemplate | null>(null);

  // Overview Tab UI State
  const [overviewChartDays, setOverviewChartDays] = useState<30 | 90 | 365>(30);
  const [upcomingFilter, setUpcomingFilter] = useState<string>('All Status');
  const [isActivityLogOpen, setIsActivityLogOpen] = useState(false);
  const [isQuickActionOpen, setIsQuickActionOpen] = useState(false);
  const [dashStats, setDashStats] = useState<any>(null);
  const [dashStatsLoading, setDashStatsLoading] = useState(false);

  // Rota Tab UI State

  // Marketing Tab UI State
  const [referralFilter, setReferralFilter] = useState('All Select');
  const [promotionsList, setPromotionsList] = useState<PromotionRow[]>([]);
  const [promosLoading, setPromosLoading] = useState(false);
  const [showPromoForm, setShowPromoForm] = useState(false);
  const [editingPromo, setEditingPromo] = useState<PromotionRow | null>(null);
  const [promoForm, setPromoForm] = useState<PromoFormState>(EMPTY_PROMO_FORM);
  const [promoSaving, setPromoSaving] = useState(false);
  const [promoError, setPromoError] = useState('');
  const [quoteLeadsList, setQuoteLeadsList] = useState<QuoteLead[]>([]);
  const [quoteLeadsLoading, setQuoteLeadsLoading] = useState(false);

  // Support Tab UI State
  const [selectedChatBooking, setSelectedChatBooking] = useState<Booking | null>(null);
  const [chatSummaries, setChatSummaries] = useState<ChatSummary[]>([]);

  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('seo');
  const [businessProfileSub, setBusinessProfileSub] = useState<BusinessProfileSubId>('company');
  const [isSavingBusinessProfile, setIsSavingBusinessProfile] = useState(false);
  const didHydrateBusinessSettingsRef = useRef(false);
  const isEditingAdminScopesRef = useRef(false);
  const [marketingSection, setMarketingSection] = useState<MarketingSectionId>('overview');
  const [servicesSection, setServicesSection] = useState<ServicesSectionId>('catalog');
  const canManageAdminScopes = currentUser?.isSuperadmin === true;

  // Fetch Dashboard KPI Stats
  useEffect(() => {
    if (activeTab !== 'overview') return;
    setDashStatsLoading(true);
    fetch(apiUrl('/admin/dashboard-stats'), { credentials: 'include' })
      .then(r => r.json())
      .then(setDashStats)
      .catch(() => {})
      .finally(() => setDashStatsLoading(false));
  }, [activeTab]);

  const fetchPromotions = useCallback(async () => {
    setPromosLoading(true);
    try {
      const res = await fetch(apiUrl('/admin/promotions'), { credentials: 'include' });
      if (res.ok) setPromotionsList(await res.json());
    } catch {
      /* ignore */
    } finally {
      setPromosLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'marketing' && marketingSection === 'promos') void fetchPromotions();
  }, [activeTab, marketingSection, fetchPromotions]);

  const fetchQuoteLeads = useCallback(async () => {
    setQuoteLeadsLoading(true);
    try {
      setQuoteLeadsList(await apiAdmin.getQuoteLeads());
    } catch {
      /* keep the last list; the page shows a refresh button */
    } finally {
      setQuoteLeadsLoading(false);
    }
  }, []);

  // Loaded up front for the menu badge, then kept live as new requests arrive.
  useEffect(() => {
    void fetchQuoteLeads();
    return subscribeNnSync((scope) => {
      if (scope === 'quotes' || scope === 'all') void fetchQuoteLeads();
    });
  }, [fetchQuoteLeads]);

  useEffect(() => {
    if (activeTab === 'quotes') void fetchQuoteLeads();
  }, [activeTab, fetchQuoteLeads]);

  const updateQuoteLead = useCallback(async (id: number, body: { status?: QuoteLeadStatus; adminNotes?: string }) => {
    await apiAdmin.updateQuoteLead(id, body);
    const now = new Date().toISOString();
    setQuoteLeadsList((prev) =>
      prev.map((l) =>
        l.id === id
          ? {
            ...l,
            ...(body.status ? { status: body.status, statusUpdatedAt: now } : {}),
            ...(body.adminNotes !== undefined ? { adminNotes: body.adminNotes.trim() || null } : {}),
          }
          : l
      )
    );
  }, []);

  const deleteQuoteLead = useCallback(async (id: number) => {
    await apiAdmin.deleteQuoteLead(id);
    setQuoteLeadsList((prev) => prev.filter((l) => l.id !== id));
  }, []);

  const newQuoteCount = useMemo(() => quoteLeadsList.filter((l) => l.status === 'new').length, [quoteLeadsList]);

  const savePromotion = useCallback(async () => {
    if (!promoForm.title.trim()) return setPromoError('A title is required.');
    if (!promoForm.startDate || !promoForm.endDate) return setPromoError('Start and end dates are required.');
    if (promoForm.endDate < promoForm.startDate) return setPromoError('The end date must be on or after the start date.');

    setPromoSaving(true);
    setPromoError('');
    try {
      const payload = {
        ...promoForm,
        discountPercent: promoForm.discountPercent === '' ? null : Number(promoForm.discountPercent),
      };
      const res = await fetch(
        editingPromo ? apiUrl(`/admin/promotions/${editingPromo.id}`) : apiUrl('/admin/promotions'),
        {
          method: editingPromo ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || 'Could not save the promotion.');
      }
      setShowPromoForm(false);
      setEditingPromo(null);
      setPromoForm(EMPTY_PROMO_FORM);
      await fetchPromotions();
    } catch (e: any) {
      setPromoError(e?.message || 'Could not save the promotion.');
    } finally {
      setPromoSaving(false);
    }
  }, [promoForm, editingPromo, fetchPromotions]);

  const togglePromotionActive = useCallback(
    async (promo: PromotionRow) => {
      try {
        await fetch(apiUrl(`/admin/promotions/${promo.id}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ active: !promo.active }),
        });
        await fetchPromotions();
      } catch {
        /* ignore */
      }
    },
    [fetchPromotions],
  );

  const deletePromotion = useCallback(
    async (id: number) => {
      if (!window.confirm('Delete this promotion?')) return;
      try {
        await fetch(apiUrl(`/admin/promotions/${id}`), { method: 'DELETE', credentials: 'include' });
        await fetchPromotions();
      } catch {
        /* ignore */
      }
    },
    [fetchPromotions],
  );

  // Fetch Data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [fetchedServices, fetchedExtras, fetchedStaff, fetchedBookings, fetchedSettings, fetchedTemplates, fetchedSms, fetchedDiscounts, fetchedReferrals, fetchedLoyalty, fetchedStaffInvoices, fetchedCancelRequests, fetchedAdminAccounts, fetchedCustomerInvoices] = await Promise.all([
          apiAdmin.getServices(),
          apiAdmin.getExtraServices().catch(() => []),
          apiAdmin.getStaff().catch(() => []),
          apiAdmin.getBookings().catch(() => null),
          apiAdmin.getBusinessSettings().catch(() => ({})),
          apiAdmin.getEmailTemplates().catch(() => []),
          apiAdmin.getSmsTemplates().catch(() => []),
          apiAdmin.getDiscounts().catch(() => []),
          apiAdmin.getReferrals().catch(() => []),
          apiAdmin.getLoyaltyOverview().catch(() => ({ totalCustomers: 0, customersWithPoints: 0, totalPoints: 0, topCustomers: [], topReferrers: [] })),
          apiAdmin.getAllInvoices().catch(() => []),
          apiAdmin.getStaffCancelRequests().catch(() => []),
          apiAdmin.getAdminAccounts().catch(() => []),
          apiAdmin.getCustomerInvoices().catch(() => []),
        ]);
        setServices(fetchedServices);
        setExtraServices(fetchedExtras);
        setStaffList(fetchedStaff);
        if (fetchedBookings !== null) setBookings(fetchedBookings);
        if (!didHydrateBusinessSettingsRef.current) {
          setBusinessSettings((prev) => {
            const patch =
              typeof fetchedSettings === 'object' &&
                fetchedSettings !== null &&
                !Array.isArray(fetchedSettings)
                ? (fetchedSettings as Partial<BusinessSettings>)
                : {};
            return { ...prev, ...patch };
          });
          didHydrateBusinessSettingsRef.current = true;
        }
        const rewardRaw = Number((fetchedSettings as any)?.referralRewardAmount);
        if (Number.isFinite(rewardRaw) && rewardRaw >= 0) {
          setReferralRewardAmount(rewardRaw);
        }
        const parseVars = (v: unknown): string[] | undefined => {
          if (Array.isArray(v)) return v as string[];
          if (typeof v === 'string') {
            try {
              const p = JSON.parse(v);
              return Array.isArray(p) ? p : undefined;
            } catch {
              return undefined;
            }
          }
          return undefined;
        };
        setEmailTemplates(
          Array.isArray(fetchedTemplates)
            ? (fetchedTemplates as Record<string, unknown>[]).map((t) => ({
              id: Number(t.id),
              name: String(t.name ?? ''),
              subject: String(t.subject ?? ''),
              body: String(t.body ?? ''),
              description: t.description != null ? String(t.description) : null,
              variables: parseVars(t.variables),
              active: t.active !== false,
            }))
            : []
        );
        setSmsTemplates(
          Array.isArray(fetchedSms)
            ? (fetchedSms as Record<string, unknown>[]).map((t) => ({
              id: Number(t.id),
              name: String(t.name ?? ''),
              message: String(t.message ?? ''),
              description: t.description != null ? String(t.description) : null,
              variables: parseVars(t.variables),
              active: t.active !== false,
            }))
            : []
        );
        setDiscounts(fetchedDiscounts);
        setReferrals(fetchedReferrals);
        setLoyaltyOverview(fetchedLoyalty);
        setStaffPayInvoices(Array.isArray(fetchedStaffInvoices) ? fetchedStaffInvoices : []);
        setCustomerInvoicesList(Array.isArray(fetchedCustomerInvoices) ? fetchedCustomerInvoices : []);
        setStaffCancelRequests(
          Array.isArray(fetchedCancelRequests)
            ? fetchedCancelRequests.map((r) => ({
              id: Number((r as any).id),
              bookingId: Number((r as any).bookingId),
              staffName: String((r as any).staffName ?? ''),
              status: (r as any).status != null ? String((r as any).status) : null,
              reason: (r as any).reason != null ? String((r as any).reason) : null,
              createdAt: (r as any).createdAt != null ? String((r as any).createdAt) : null,
              serviceType: (r as any).serviceType != null ? String((r as any).serviceType) : null,
              date: (r as any).date != null ? String((r as any).date) : null,
              time: (r as any).time != null ? String((r as any).time) : null,
              bookingStatus: (r as any).bookingStatus != null ? String((r as any).bookingStatus) : null,
            }))
            : []
        );
        if (!isEditingAdminScopesRef.current) {
          setAdminAccounts(Array.isArray(fetchedAdminAccounts) ? fetchedAdminAccounts : []);
        }
      } catch (error) {
        console.error("Failed to load dashboard data", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();

    // Set up real-time polling every 10 seconds for a more responsive feel
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    const revenue = bookings.reduce((acc, curr) => acc + Number(curr.totalPrice || 0), 0);
    const active = bookings.filter(b => b.status === BookingStatus.PENDING || b.status === BookingStatus.CONFIRMED).length;
    return [
      { label: 'Total Revenue', value: `£${revenue.toFixed(2)} `, icon: <TrendingUp className="w-6 h-6" />, color: 'bg-green-50 text-green-600' },
      { label: 'Active Jobs', value: active.toString(), icon: <Calendar className="w-6 h-6" />, color: 'bg-blue-50 text-blue-600' },
      { label: 'Team Members', value: staffList.length.toString(), icon: <Users className="w-6 h-6" />, color: 'bg-purple-50 text-purple-600' },
      { label: 'Avg. Rating', value: '4.9', icon: <Star className="w-6 h-6" />, color: 'bg-amber-50 text-amber-600' },
    ];
  }, [bookings, staffList]);

  const filteredBookings = useMemo(() => {
    const today = getTodayYYYYMMDD();
    const requestBookingIds = new Set(
      staffCancelRequests
        .filter((r) => String(r.status || '').toLowerCase() === 'approved')
        .map((r) => r.bookingId)
        .filter((id) => Number.isFinite(id) && id > 0)
    );
    return bookings.filter(b => {
      if (pipelineQuickFilter === 'hidden') return hiddenBookingIds.has(Number(b.id));
      if (hiddenBookingIds.has(Number(b.id))) return false;
      const ref = String(b.bookingId ?? b.id);
      const matchesSearch = (b.contact?.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        ref.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'All' || b.status === statusFilter;
      if (!matchesSearch || !matchesStatus) return false;
      if (pipelineQuickFilter === 'today') return b.date === today;
      if (pipelineQuickFilter === 'unassigned') {
        const active = b.status !== BookingStatus.CANCELLED && b.status !== BookingStatus.COMPLETED;
        return active && !bookingHasStaff(b) && b.date >= today;
      }
      if (pipelineQuickFilter === 'stale_pending') {
        return b.status === BookingStatus.PENDING && b.date < today;
      }
      if (pipelineQuickFilter === 'cancel_requests') {
        return requestBookingIds.has(Number(b.id));
      }
      if (pipelineQuickFilter === 'cancelled') {
        return b.status === BookingStatus.CANCELLED;
      }
      return true;
    });
  }, [bookings, searchTerm, statusFilter, pipelineQuickFilter, staffCancelRequests, hiddenBookingIds]);

  const cancelledBookingsCount = useMemo(
    () => bookings.filter((b) => b.status === BookingStatus.CANCELLED).length,
    [bookings]
  );

  const hiddenBookingsCount = useMemo(
    () => bookings.filter((b) => hiddenBookingIds.has(Number(b.id))).length,
    [bookings, hiddenBookingIds]
  );

  const pendingCancelRequests = useMemo(
    () => staffCancelRequests.filter((r) => String(r.status || '').toLowerCase() === 'pending'),
    [staffCancelRequests]
  );

  const approvedCancelBookingIds = useMemo(
    () =>
      new Set(
        staffCancelRequests
          .filter((r) => String(r.status || '').toLowerCase() === 'approved')
          .map((r) => r.bookingId)
          .filter((id) => Number.isFinite(id) && id > 0)
      ),
    [staffCancelRequests]
  );

  const approvedCancelNeedsReassignCount = useMemo(
    () =>
      bookings.filter(
        (b) =>
          approvedCancelBookingIds.has(Number(b.id)) &&
          !bookingHasStaff(b) &&
          b.status !== BookingStatus.CANCELLED &&
          b.status !== BookingStatus.COMPLETED
      ).length,
    [approvedCancelBookingIds, bookings]
  );

  const saveBusinessProfileSettings = useCallback(async () => {
    const MAX_LONG_TEXT = 12000;
    const clamp = (s: string) => s.trim().slice(0, MAX_LONG_TEXT);
    setIsSavingBusinessProfile(true);
    try {
      const cleanedBankDetails = (businessSettings.bankDetails || [])
        .map((bank, idx) => ({
          id: String(bank.id || `bank-${idx + 1}`),
          accountName: String(bank.accountName || '').trim(),
          accountNumber: String(bank.accountNumber || '').trim(),
          sortCode: String(bank.sortCode || '').trim(),
          bankName: String(bank.bankName || '').trim(),
          notes: clamp(String(bank.notes || '')),
          active: bank.active !== false,
        }))
        .filter((bank) => bank.accountName && bank.accountNumber && bank.sortCode);
      const requiredDepositRaw = Number(businessSettings.depositPolicy?.requiredPercent);
      const requiredPercent = Number.isFinite(requiredDepositRaw) ? Math.min(100, Math.max(0, requiredDepositRaw)) : 40;
      const shortNoticeWindowRaw = Number(businessSettings.cancellationPolicy?.shortNoticeWindowHours);
      const shortNoticeFeeRaw = Number(businessSettings.cancellationPolicy?.shortNoticeFeePercent);
      const shortNoticeWindowHours = Number.isFinite(shortNoticeWindowRaw) ? Math.max(1, shortNoticeWindowRaw) : 24;
      const shortNoticeFeePercent = Number.isFinite(shortNoticeFeeRaw) ? Math.min(100, Math.max(0, shortNoticeFeeRaw)) : 10;
      const depositMsgRaw = String(businessSettings.depositPolicy?.message || '').trim();
      const consentRaw = String(businessSettings.cancellationPolicy?.consentMessage || '').trim();
      const merged: Record<string, unknown> = {
        ...businessSettings,
        address: clamp(String(businessSettings.address || '')),
        bankDetails: cleanedBankDetails,
        depositPolicy: {
          requiredPercent,
          message:
            clamp(depositMsgRaw) ||
            `To reserve your preferred slot and lock in your cleaner team, we require a ${requiredPercent}% deposit before attendance. This confirms your booking in our live rota and guarantees staff dispatch on the day.`,
        },
        cancellationPolicy: {
          shortNoticeWindowHours,
          shortNoticeFeePercent,
          consentMessage:
            clamp(consentRaw) ||
            `If you choose to cancel within ${shortNoticeWindowHours} hours of your appointment, you agree to a short-notice cancellation fee of ${shortNoticeFeePercent}% of the booking total.`,
        },
      };
      const payload = Object.fromEntries(
        Object.entries(merged).filter(([, v]) => v !== undefined)
      ) as Partial<BusinessSettings>;
      await apiAdmin.updateBusinessSettings(payload);
      setBusinessSettings((prev) => ({ ...prev, ...payload }));
      window.dispatchEvent(new CustomEvent('nn_business_settings_updated', { detail: payload }));
      showFlyer('Business settings updated.', 'success');
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not save business settings.', 'error');
    } finally {
      setIsSavingBusinessProfile(false);
    }
  }, [businessSettings, showFlyer]);

  const opsHealth = useMemo(() => {
    const today = getTodayYYYYMMDD();
    const tomorrow = getTomorrowYYYYMMDD();
    const active = (b: Booking) => b.status !== BookingStatus.CANCELLED && b.status !== BookingStatus.COMPLETED;
    const unassignedTomorrow = bookings.filter(
      b => active(b) && b.date === tomorrow && !bookingHasStaff(b)
    ).length;
    const stalePending = bookings.filter(
      b => b.status === BookingStatus.PENDING && b.date < today
    ).length;
    const pendingToday = bookings.filter(
      b => b.status === BookingStatus.PENDING && b.date === today
    ).length;
    return { unassignedTomorrow, stalePending, pendingToday };
  }, [bookings]);

  const referralStats = useMemo(() => {
    const list = referrals || [];
    const totalReward = list.reduce((s, r) => s + Number(r.rewardAmount || 0), 0);
    let pending = 0;
    let completed = 0;
    let paid = 0;
    list.forEach((r) => {
      if (r.status === 'Pending') pending++;
      else if (r.status === 'Completed') completed++;
      else if (r.status === 'Paid Out') paid++;
    });
    const settled = completed + paid;
    const conversion = list.length ? Math.round((settled / list.length) * 100) : 0;
    return { total: list.length, totalReward, pending, completed, paid, conversion };
  }, [referrals]);

  const discountStats = useMemo(() => {
    const list = discounts || [];
    const redemptions = list.reduce((s, d) => s + (d.usedCount || 0), 0);
    const active = list.filter(d => d.isActive).length;
    return { count: list.length, redemptions, active };
  }, [discounts]);

  const staffScheduleConflicts = useMemo(
    () => findStaffScheduleConflicts(bookings, services, extraServices),
    [bookings, services, extraServices]
  );

  const handleAssignStaff = async (staffId: string) => {
    if (!selectedBookingForAssignment) return;
    const sid = parseInt(staffId, 10);
    if (!Number.isFinite(sid)) return;
    const patched: Booking = {
      ...selectedBookingForAssignment,
      assignedStaffId: sid,
      assignedStaffIds: [sid],
      status: BookingStatus.CONFIRMED,
    };
    const overlapDetails = getOverlapConflictDetailsForPatchedBooking(bookings, patched, services, extraServices);
    if (overlapDetails.length > 0) {
      const staffLabel =
        staffList.find((s) => s.id === sid)?.name?.trim() || `Staff #${sid}`;
      const lines = overlapDetails
        .map(
          (d) =>
            `• ${staffLabel}: this job ${d.thisWindowLabel} overlaps ${d.otherBookingId} (${d.otherWindowLabel}) — visit windows cross in time, not only the same date.`
        )
        .join('\n');
      const ok = window.confirm(
        `Overlapping visit times for ${staffLabel}:\n\n${lines}\n\nAssign anyway? Cancel to stop (no change).`
      );
      if (!ok) return;
    }
    try {
      await apiAdmin.updateBooking(selectedBookingForAssignment.id, {
        assignedStaffId: sid,
        assignedStaffIds: [sid],
        status: BookingStatus.CONFIRMED,
        ...(overlapDetails.length > 0 ? { forceScheduleOverlap: true } : {}),
      });

      setBookings(prev => prev.map(b =>
        b.id === selectedBookingForAssignment.id ? { ...b, status: BookingStatus.CONFIRMED, assignedStaffId: sid, assignedStaffIds: [sid] } : b
      ));

      showFlyer(`Success: Staff assigned to job ${selectedBookingForAssignment.id}.`, 'success');
      setSelectedBookingForAssignment(null);
    } catch (error) {
      showFlyer(error instanceof Error ? error.message : 'Failed to assign staff.', 'error');
    }
  };

  const handleUnassignBooking = async (b: Booking) => {
    const hasAssignment = Boolean(b.assignedStaffId) || (b.assignedStaffIds && b.assignedStaffIds.length > 0);
    if (!hasAssignment) return;
    const assignedLabel = (b.assignedStaffIds && b.assignedStaffIds.length > 0
      ? b.assignedStaffIds
      : b.assignedStaffId
        ? [b.assignedStaffId]
        : []
    )
      .map((sid) => staffList.find((s) => s.id === sid)?.name || `Staff #${sid}`)
      .join(', ');
    const ok = window.confirm(
      `Unassign ${assignedLabel || 'all staff'} from booking ${b.id}?\n\n` +
      `This returns the job to the Pending Dispatch queue so another cleaner can be assigned. ` +
      `It is separate from a staff cancellation request.`
    );
    if (!ok) return;
    const previous = bookings;
    setBookings((prev) =>
      prev.map((row) =>
        row.id === b.id
          ? { ...row, assignedStaffId: undefined, assignedStaffIds: [], status: BookingStatus.PENDING }
          : row
      )
    );
    try {
      await apiAdmin.updateBooking(b.id, {
        assignedStaffIds: [],
        assignedStaffId: null as unknown as number | undefined,
        status: BookingStatus.PENDING,
      });
      showFlyer(`Booking ${b.id} unassigned. Back on the dispatch queue.`, 'success');
    } catch (error) {
      setBookings(previous);
      showFlyer(error instanceof Error ? error.message : 'Failed to unassign booking.', 'error');
    }
  };

  const handleCreateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isStaffFormSubmitting) return;
    const payloadRole = String(newStaff.role || '');
    const creatingAdmin = payloadRole === 'Admin' || payloadRole === 'Superadmin';
    if (creatingAdmin && !canManageAdminScopes) {
      showFlyer('Only superadmin can create admin-level accounts.', 'error');
      return;
    }
    if (payloadRole === 'Admin' && canManageAdminScopes && newStaff.adminTabs.length === 0) {
      showFlyer('Pick at least one admin menu access for this admin account.', 'error');
      return;
    }
    const name = newStaff.name.trim();
    const email = newStaff.email.trim();
    if (!name) {
      showFlyer('Please enter a full name.', 'error');
      return;
    }
    if (!email) {
      showFlyer('Please enter an email address.', 'error');
      return;
    }
    if (!newStaff.password.trim()) {
      showFlyer('Please set an initial password for the new account.', 'error');
      return;
    }
    if (!creatingAdmin) {
      const rate = parseFloat(newStaff.hourlyRate);
      if (!Number.isFinite(rate) || rate < 0) {
        showFlyer('Please enter a valid hourly rate (0 or greater).', 'error');
        return;
      }
    }
    setIsStaffFormSubmitting(true);
    try {
      const response = await apiAdmin.createStaff({
        ...newStaff,
        name,
        email,
        hourlyRate: creatingAdmin ? undefined : parseFloat(newStaff.hourlyRate),
        ...(payloadRole === 'Admin' ? { adminTabs: newStaff.adminTabs } : {})
      });
      const fetchedStaff = await apiAdmin.getStaff();
      setStaffList(fetchedStaff);
      setCreatedCredentials(response?.credentials || null);
      setIsCreatingStaff(false);
      setNewStaff({ name: '', email: '', role: 'Cleaner', password: '', skills: [], hourlyRate: '15', adminTabs: [] });
      showFlyer("Account created successfully!", 'success');
    } catch (err: unknown) {
      showFlyer(err instanceof Error ? err.message : "Failed to create staff member.", 'error');
    } finally {
      setIsStaffFormSubmitting(false);
    }
  };

  const handleUpdateStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff || isStaffFormSubmitting) return;
    const roleStr = String(editingStaff.role || '');
    const editingAdmin = roleStr === 'Admin' || roleStr === 'Superadmin';
    if (!editingAdmin) {
      const rate = Number(editingStaff.hourlyRate);
      if (!Number.isFinite(rate) || rate < 0) {
        showFlyer('Please enter a valid hourly rate (0 or greater).', 'error');
        return;
      }
    }
    setIsStaffFormSubmitting(true);
    try {
      await apiAdmin.updateStaff(editingStaff.id, {
        ...editingStaff,
        password: editingPassword
      });
      const fetchedStaff = await apiAdmin.getStaff();
      setStaffList(fetchedStaff);
      setIsEditingStaff(false);
      setEditingStaff(null);
      setEditingPassword('');
      showFlyer("Staff member updated successfully!", 'success');
    } catch (err: unknown) {
      showFlyer(err instanceof Error ? err.message : "Failed to update staff member.", 'error');
    } finally {
      setIsStaffFormSubmitting(false);
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this staff member? This will also remove their user account.")) return;
    try {
      await apiAdmin.deleteStaff(id);
      setStaffList(prev => prev.filter(s => s.id !== id));
      showFlyer("Staff member deleted.", 'success');
    } catch (error) {
      showFlyer("Failed to delete staff member.", 'error');
    }
  };

  const handleUpdateAdminScope = async (accountId: number, tabs: AdminTab[]) => {
    if (!canManageAdminScopes) {
      showFlyer('Only superadmin can update admin menu scope.', 'error');
      return;
    }
    if (tabs.length === 0) {
      showFlyer('Select at least one menu for this admin.', 'error');
      return;
    }
    try {
      await apiAdmin.updateAdminMenuScope(accountId, tabs);
      isEditingAdminScopesRef.current = false;
      setAdminAccounts((prev) =>
        prev.map((a) => (a.id === accountId ? { ...a, adminTabs: tabs } : a))
      );
      showFlyer('Admin menu scope updated.', 'success');
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Failed to update admin scope.', 'error');
    }
  };

  const handleCreateExtra = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isExtraFormSubmitting) return;
    const name = newExtra.name.trim();
    const price = parseFloat(newExtra.price);
    const duration = parseInt(newExtra.duration, 10);
    if (!name) {
      showFlyer('Please enter a service name.', 'error');
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      showFlyer('Please enter a valid price (0 or greater).', 'error');
      return;
    }
    if (!Number.isFinite(duration) || duration < 1) {
      showFlyer('Please enter a duration of at least 1 minute.', 'error');
      return;
    }
    setIsExtraFormSubmitting(true);
    try {
      const payload: Partial<Extra> = {
        name,
        price,
        type: newExtra.type as any,
        duration
      };
      const res = await apiAdmin.addExtraService(payload);
      setExtraServices([...extraServices, { ...payload, id: res.id || 'TEMP' } as Extra]);
      setIsCreatingExtra(false);
      setNewExtra({ name: '', price: '', type: 'fixed', duration: '30' });
      showFlyer('Extra service created.', 'success');
    } catch (error: unknown) {
      showFlyer(error instanceof Error ? error.message : 'Failed to create extra service.', 'error');
    } finally {
      setIsExtraFormSubmitting(false);
    }
  };

  const handleDeleteService = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this major service?")) return;
    try {
      await apiAdmin.deleteService(id);
      setServices(prev => prev.filter(s => s.id !== id));
    } catch (error) {
      showFlyer(error instanceof Error ? error.message : 'Failed to delete service', 'error');
    }
  };

  const [templatesReloading, setTemplatesReloading] = useState(false);
  const parseTemplateVars = (v: unknown): string[] | undefined => {
    if (Array.isArray(v)) return v as string[];
    if (typeof v === 'string') {
      try {
        const p = JSON.parse(v);
        return Array.isArray(p) ? p : undefined;
      } catch {
        return undefined;
      }
    }
    return undefined;
  };

  const reloadMessageTemplates = async () => {
    setTemplatesReloading(true);
    try {
      const [fetchedEmail, fetchedSms] = await Promise.all([
        apiAdmin.getEmailTemplates(),
        apiAdmin.getSmsTemplates(),
      ]);
      setEmailTemplates(
        Array.isArray(fetchedEmail)
          ? (fetchedEmail as Record<string, unknown>[]).map((t) => ({
            id: Number(t.id),
            name: String(t.name ?? ''),
            subject: String(t.subject ?? ''),
            body: String(t.body ?? ''),
            description: t.description != null ? String(t.description) : null,
            variables: parseTemplateVars(t.variables),
            active: t.active !== false,
          }))
          : [],
      );
      setSmsTemplates(
        Array.isArray(fetchedSms)
          ? (fetchedSms as Record<string, unknown>[]).map((t) => ({
            id: Number(t.id),
            name: String(t.name ?? ''),
            message: String(t.message ?? ''),
            description: t.description != null ? String(t.description) : null,
            variables: parseTemplateVars(t.variables),
            active: t.active !== false,
          }))
          : [],
      );
      const total =
        (Array.isArray(fetchedEmail) ? fetchedEmail.length : 0) +
        (Array.isArray(fetchedSms) ? fetchedSms.length : 0);
      showFlyer(`Templates reloaded (${total} found).`, 'success');
    } catch (error) {
      showFlyer(error instanceof Error ? error.message : 'Failed to reload templates', 'error');
    } finally {
      setTemplatesReloading(false);
    }
  };

  const handleToggleServiceActive = async (svc: ServiceConfig) => {
    const nextActive = !svc.active;
    const previous = services;
    // Optimistic flip so the toggle feels instant; rollback on failure.
    setServices(prev => prev.map(s => (s.id === svc.id ? { ...s, active: nextActive } : s)));
    try {
      await apiAdmin.updateService(svc.id, { active: nextActive });
      showFlyer(`${svc.name} ${nextActive ? 'enabled' : 'disabled'}.`, 'success');
    } catch (error) {
      setServices(previous);
      showFlyer(error instanceof Error ? error.message : 'Failed to update service status.', 'error');
    }
  };

  const handleDeleteExtra = async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this service?")) return;
    try {
      await apiAdmin.deleteExtraService(id);
      setExtraServices(prev => prev.filter(e => e.id !== id));
    } catch (error) {
      showFlyer(error instanceof Error ? error.message : 'Failed to delete extra service', 'error');
    }
  };

  const handleStaffInvoiceStatus = async (id: number, status: 'Approved' | 'Rejected') => {
    const notes = invoiceDecisionNotes[id]?.trim();
    try {
      await apiAdmin.updateInvoiceStatus(id, status, notes || undefined);
      const next = await apiAdmin.getAllInvoices();
      setStaffPayInvoices(Array.isArray(next) ? next : []);
      setInvoiceDecisionNotes((prev) => {
        const n = { ...prev };
        delete n[id];
        return n;
      });
      showFlyer(status === 'Approved' ? 'Invoice approved.' : 'Invoice rejected.', 'success');
    } catch (e: unknown) {
      showFlyer(e instanceof Error ? e.message : 'Failed to update invoice', 'error');
    }
  };

  const clearStaffInvoiceDraft = (id: number) =>
    setInvoiceDecisionNotes((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });

  const handleStaffInvoiceNote = async (id: number) => {
    const notes = (invoiceDecisionNotes[id] ?? '').trim();
    setSavingStaffInvoiceNoteId(id);
    try {
      await apiAdmin.updateStaffInvoiceNote(id, notes);
      setStaffPayInvoices((prev) => prev.map((i) => (i.id === id ? { ...i, adminNotes: notes || null } : i)));
      clearStaffInvoiceDraft(id);
      setEditingStaffInvoiceNoteId(null);
      showFlyer(notes ? 'Note saved. The cleaner has been notified.' : 'Note removed.', 'success');
    } catch (e: unknown) {
      showFlyer(e instanceof Error ? e.message : 'Failed to save the note', 'error');
    } finally {
      setSavingStaffInvoiceNoteId(null);
    }
  };

  const handleDeleteStaffInvoice = async (inv: { id: number; staffName?: string | null; staffId?: number | null; weekLabel?: string | null; status?: string | null }) => {
    const who = inv.staffName || `Staff #${inv.staffId}`;
    const warning =
      inv.status === 'Approved'
        ? `This invoice from ${who} (${inv.weekLabel || 'week'}) is already APPROVED. Delete it anyway?\n\nThe cleaner will be told it was removed so they can resubmit.`
        : `Delete the invoice from ${who} for ${inv.weekLabel || 'this week'}?\n\nThe cleaner will be told it was removed so they can resubmit.`;
    if (!window.confirm(warning)) return;
    try {
      await apiAdmin.deleteStaffInvoice(inv.id);
      setStaffPayInvoices((prev) => prev.filter((i) => i.id !== inv.id));
      clearStaffInvoiceDraft(inv.id);
      if (expandedStaffInvoiceId === inv.id) setExpandedStaffInvoiceId(null);
      showFlyer('Staff invoice deleted.', 'success');
    } catch (e: unknown) {
      showFlyer(e instanceof Error ? e.message : 'Failed to delete the staff invoice', 'error');
    }
  };

  const handleCancelRequestDecision = async (requestId: number, decision: 'approve' | 'reject') => {
    try {
      await apiAdmin.respondStaffCancelRequest(requestId, decision, cancelDecisionNotes[requestId] || '');
      setStaffCancelRequests((prev) =>
        prev
          .map((r) =>
            r.id === requestId ? { ...r, status: decision === 'approve' ? 'Approved' : 'Rejected' } : r
          )
          .filter((r) => String(r.status || '').toLowerCase() !== 'rejected')
      );
      setCancelDecisionNotes((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
      if (decision === 'approve') {
        const updated = await apiAdmin.getBookings();
        setBookings(updated);
      }
      showFlyer(decision === 'approve' ? 'Cancellation request approved.' : 'Cancellation request declined.', 'success');
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Failed to process cancellation request', 'error');
    }
  };

  const handleSaveReferralRewardAmount = async () => {
    if (!Number.isFinite(referralRewardAmount) || referralRewardAmount < 0) {
      showFlyer('Referral reward must be 0 or greater.', 'error');
      return;
    }
    setIsSavingReferralReward(true);
    try {
      await apiAdmin.updateBusinessSettings({ referralRewardAmount });
      const [nextReferrals, nextLoyalty] = await Promise.all([
        apiAdmin.getReferrals().catch(() => []),
        apiAdmin.getLoyaltyOverview().catch(() => loyaltyOverview),
      ]);
      setReferrals(Array.isArray(nextReferrals) ? nextReferrals : []);
      setLoyaltyOverview(nextLoyalty);
      showFlyer('Referral reward amount updated.', 'success');
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Failed to update referral reward.', 'error');
    } finally {
      setIsSavingReferralReward(false);
    }
  };

  const handleCreateDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isDiscountFormSubmitting) return;
    const code = newDiscount.code.trim();
    const valueNum = parseFloat(newDiscount.value);
    if (!code) {
      showFlyer('Please enter a promo code.', 'error');
      return;
    }
    if (!Number.isFinite(valueNum) || valueNum <= 0) {
      showFlyer('Please enter a discount value greater than zero.', 'error');
      return;
    }
    if (newDiscount.type === 'percentage' && valueNum > 100) {
      showFlyer('Percentage discounts cannot exceed 100%.', 'error');
      return;
    }
    let usageLimit: number | null = null;
    if (newDiscount.usageLimit.trim()) {
      const n = parseInt(newDiscount.usageLimit, 10);
      if (!Number.isFinite(n) || n < 1) {
        showFlyer('Usage limit must be a whole number of 1 or more.', 'error');
        return;
      }
      usageLimit = n;
    }
    setIsDiscountFormSubmitting(true);
    try {
      await apiAdmin.createDiscount({
        ...newDiscount,
        code,
        value: valueNum,
        usageLimit
      });
      const d = await apiAdmin.getDiscounts();
      setDiscounts(d);
      setIsCreatingDiscount(false);
      setNewDiscount({ code: '', type: 'fixed', value: '', usageLimit: '' });
      showFlyer("Discount created!", 'success');
    } catch (err: unknown) {
      showFlyer(err instanceof Error ? err.message : 'Failed to create discount.', 'error');
    } finally {
      setIsDiscountFormSubmitting(false);
    }
  };

  const pendingStaffInvoiceCount = useMemo(
    () => staffPayInvoices.filter((i) => i.status === 'Pending').length,
    [staffPayInvoices]
  );

  /** Bookings unassigned within 24h, or assigned but nobody en route within 30 min of start. */
  const coverageWarningCount = useMemo(() => {
    const now = Date.now();
    return bookings.filter((b) => {
      if (b.status !== BookingStatus.PENDING && b.status !== BookingStatus.CONFIRMED) return false;
      const start = parseLocalDateFromYYYYMMDD(b.date);
      if (!start) return false;
      const [hh, mm] = String(b.time || '09:00').split(':').map(Number);
      start.setHours(hh || 0, mm || 0, 0, 0);
      const minsUntil = (start.getTime() - now) / 60000;
      if (minsUntil < -120) return false;
      if (!bookingHasStaff(b)) return minsUntil <= 24 * 60;
      return !b.enRouteAt && minsUntil <= 30;
    }).length;
  }, [bookings]);

  const summaryById = useMemo(() => {
    const m = new Map<string, ChatSummary>();
    chatSummaries.forEach((s) => m.set(String(s.bookingId), s));
    return m;
  }, [chatSummaries]);

  const supportBookings = useMemo(
    () =>
      bookings.filter(
        (b) =>
          b.status === BookingStatus.PENDING ||
          b.status === BookingStatus.CONFIRMED ||
          b.status === BookingStatus.COMPLETED
      ),
    [bookings]
  );

  const activeSupportBookings = useMemo(() => {
    return supportBookings.filter((b) => {
      const s = summaryById.get(String(b.id));
      const closed = s ? s.chatClosed : Boolean(b.chatClosedByAdmin);
      return !closed;
    });
  }, [supportBookings, summaryById]);

  const historySupportBookings = useMemo(() => {
    return supportBookings.filter((b) => {
      const s = summaryById.get(String(b.id));
      const closed = s ? s.chatClosed : Boolean(b.chatClosedByAdmin);
      return closed;
    });
  }, [supportBookings, summaryById]);

  const renderSupportChatCard = (b: Booking) => {
    const s = summaryById.get(String(b.id));
    const live = isOngoingLiveChat(s);
    return (
      <div
        key={b.id}
        className={`p-6 bg-slate-50 rounded-2xl border transition-colors cursor-pointer group ${live
            ? 'border-emerald-400 ring-2 ring-emerald-300/80 animate-pulse ring-offset-2'
            : 'border-slate-100/50 hover:border-blue-200'
          }`}
        onClick={() => setSelectedChatBooking(b)}
      >
        <div className="flex justify-between items-start mb-4">
          <div>
            <div className="font-black text-slate-900">{b.contact?.name || 'Client'}</div>
            <div className="text-xs font-bold text-slate-400 mt-0.5">{b.address.line1}</div>
            {live && (
              <div className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-2">Live activity</div>
            )}
          </div>
          <div className="bg-blue-100 text-blue-600 rounded-full w-8 h-8 flex items-center justify-center relative shadow-sm">
            <MessageCircle className="w-4 h-4" />
          </div>
        </div>
        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest flex items-center">
          <Calendar className="w-3 h-3 mr-1" /> {b.date} • {b.time}
        </div>
        <div className="mt-4 pt-4 border-t border-slate-200/50 flex justify-between items-center text-xs font-bold">
          <span className="text-slate-500 group-hover:text-blue-600 transition-colors flex items-center">
            <MessageSquare className="w-3 h-3 mr-1" /> Monitor Chat
          </span>
        </div>
      </div>
    );
  };

  const primaryMenuItems: Array<{
    id: AdminTab;
    label: string;
    icon: React.ReactNode;
    badge?: number;
  }> = [
      { id: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="w-5 h-5" /> },
      { id: 'bookings', label: 'Bookings', icon: <Package className="w-5 h-5" /> },
      { id: 'quotes', label: 'Quote Requests', icon: <ClipboardList className="w-5 h-5" />, badge: newQuoteCount },
      { id: 'assignment', label: 'Job Assignment', icon: <UserCheck className="w-5 h-5" /> },
      { id: 'rota', label: 'Rota & Schedule', icon: <CalendarDays className="w-5 h-5" /> },
      { id: 'liveMap', label: 'Live Map', icon: <MapPin className="w-5 h-5" />, badge: coverageWarningCount },
      { id: 'staff', label: 'Staffing', icon: <Users className="w-5 h-5" /> },
      { id: 'staffInvoices', label: 'Staff invoices', icon: <FileText className="w-5 h-5" />, badge: pendingStaffInvoiceCount },
      { id: 'customerInvoices', label: 'Customer Invoices', icon: <DollarSign className="w-5 h-5" /> },
      { id: 'services', label: 'Services', icon: <Layers className="w-5 h-5" /> },
      { id: 'marketing', label: 'Marketing', icon: <TrendingUp className="w-5 h-5" /> },
      { id: 'reviews', label: 'Reviews', icon: <Star className="w-5 h-5" /> },
      { id: 'expenses', label: 'Expenses', icon: <Receipt className="w-5 h-5" /> },
      { id: 'performance', label: 'Performance', icon: <BarChart3 className="w-5 h-5" /> },
    ];

  const quickAccessMenuItems: Array<{
    id: Extract<AdminTab, 'communication' | 'support' | 'settings'>;
    label: string;
    icon: React.ReactNode;
  }> = [
      { id: 'communication', label: 'Communication', icon: <MailQuestion className="w-5 h-5" /> },
      { id: 'support', label: 'Chat Oversight', icon: <MessageCircle className="w-5 h-5" /> },
      { id: 'settings', label: 'Settings', icon: <Settings className="w-5 h-5" /> },
    ];
  const allowedAdminTabs = useMemo<AdminTab[]>(() => {
    if (currentUser?.isSuperadmin) return ADMIN_PERMISSIONABLE_TABS;
    const raw = Array.isArray(currentUser?.adminTabs) ? currentUser?.adminTabs : [];
    const scoped = raw.filter((t): t is AdminTab => ADMIN_PERMISSIONABLE_TABS.includes(t as AdminTab));
    return scoped.length > 0 ? scoped : ADMIN_PERMISSIONABLE_TABS;
  }, [currentUser?.adminTabs, currentUser?.isSuperadmin]);
  const visiblePrimaryMenuItems = useMemo(
    () => primaryMenuItems.filter((item) => allowedAdminTabs.includes(item.id)),
    [primaryMenuItems, allowedAdminTabs]
  );
  const visibleQuickAccessMenuItems = useMemo(
    () => quickAccessMenuItems.filter((item) => allowedAdminTabs.includes(item.id)),
    [quickAccessMenuItems, allowedAdminTabs]
  );
  useEffect(() => {
    if (!allowedAdminTabs.includes(activeTab)) {
      setActiveTab(allowedAdminTabs[0] || 'overview');
    }
  }, [activeTab, allowedAdminTabs]);

  const notificationBellProps = {
    fetchNotifications: () => apiAdmin.getNotifications(0),
    markRead: apiAdmin.markNotificationRead,
    deleteNotification: apiAdmin.deleteNotification,
  };

  const mobileHeaderTitle =
    activeTab === 'bookings'
      ? bookingsSubView === 'upcoming'
        ? 'Bookings · Upcoming'
        : 'Bookings · Pipeline'
      : activeTab === 'quotes'
        ? 'Quote Requests'
      : activeTab === 'communication'
        ? 'Communication'
        : activeTab === 'support'
          ? 'Chat Oversight'
          : activeTab === 'settings'
            ? 'Settings'
            : activeTab === 'expenses'
              ? 'Expenses'
              : activeTab === 'performance'
                ? 'Performance'
                : activeTab === 'liveMap'
                  ? 'Live Map'
                  : activeTab;

  const Sidebar = ({ mobile = false }) => {
    const collapsed = !mobile && isSidebarCollapsed;
    const widthClass = mobile ? 'w-full' : collapsed ? 'w-[4.5rem]' : 'w-72';
    return (
      <div
        className={`flex flex-col h-full bg-[#0B1120] text-white border-r border-slate-800 ${widthClass} fixed top-0 left-0 ${mobile ? '' : 'hidden md:flex'} z-50 transition-all duration-300 ease-out`}
      >
        <div
          className={`shrink-0 border-b border-slate-800/50 ${collapsed ? 'px-2 py-3 flex flex-col items-center gap-2' : 'p-5 sm:p-8 space-y-3'}`}
        >
          {collapsed ? (
            <>
              <BrandLogoMark className="h-9 w-auto max-w-[2.75rem] object-contain object-center shrink-0" />
              <button
                type="button"
                onClick={() => setIsSidebarCollapsed(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                title="Expand menu"
                aria-label="Expand menu"
              >
                <ChevronsRight className="w-5 h-5" />
              </button>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2 min-w-0">
                <BrandLogoMark className="h-20 w-auto max-h-20 max-w-[min(200px,55vw)] shrink-0 object-contain object-left" />
                {!mobile ? (
                  <button
                    type="button"
                    onClick={() => setIsSidebarCollapsed(true)}
                    className="shrink-0 p-2 rounded-xl text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                    title="Collapse menu"
                    aria-label="Collapse menu"
                  >
                    <ChevronsLeft className="w-5 h-5" />
                  </button>
                ) : null}
              </div>
              <span className="text-xl font-black tracking-tight text-white truncate min-w-0 block">
                {businessSettings.companyName || 'CiN Cleaning'}
              </span>
            </>
          )}
        </div>

        <nav aria-label="Admin menu" className={`flex-1 overflow-y-auto no-scrollbar py-3 ${collapsed ? 'px-2' : 'px-3'}`}>
          {ADMIN_MENU_GROUPS.map((group, groupIndex) => {
            const items = group.tabs
              .map((tab) => visiblePrimaryMenuItems.find((item) => item.id === tab))
              .filter((item): item is (typeof visiblePrimaryMenuItems)[number] => Boolean(item));
            if (items.length === 0) return null;
            const holdsActive = items.some((item) => item.id === activeTab);
            const folded = !collapsed && Boolean(group.label) && foldedMenuGroups.includes(group.id) && !holdsActive;
            const groupBadge = items.reduce((sum, item) => sum + (item.badge || 0), 0);
            return (
              <div key={group.id} className={groupIndex > 0 ? (collapsed ? 'mt-2 pt-2 border-t border-slate-800/70' : 'mt-3') : ''}>
                {group.label && !collapsed ? (
                  <button
                    type="button"
                    onClick={() =>
                      setFoldedMenuGroups((prev) =>
                        prev.includes(group.id) ? prev.filter((g) => g !== group.id) : [...prev, group.id]
                      )
                    }
                    aria-expanded={!folded}
                    title={holdsActive ? 'Contains the open page' : folded ? 'Show section' : 'Hide section'}
                    className="w-full flex items-center gap-2 px-3 py-1.5 mb-1 rounded-lg text-[10px] font-black uppercase tracking-[0.16em] text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <span className="flex-1 text-left">{group.label}</span>
                    {folded && groupBadge > 0 ? (
                      <span className="min-w-[1.25rem] rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[10px] font-black text-white tracking-normal">
                        {groupBadge}
                      </span>
                    ) : null}
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${folded ? '-rotate-90' : ''}`} />
                  </button>
                ) : null}
                {!folded && (
                  <div className="space-y-1">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setActiveTab(item.id);
                          if (item.id === 'bookings') setBookingsSubView('pipeline');
                          if (item.id === 'services') setServicesSection('catalog');
                          setIsSidebarOpen(false);
                        }}
                        title={collapsed ? item.label : undefined}
                        aria-label={item.label}
                        aria-current={activeTab === item.id ? 'page' : undefined}
                        className={`w-full flex items-center rounded-xl transition-all duration-200 font-medium text-sm group ${collapsed ? 'justify-center px-2 py-3' : 'space-x-3 px-4 py-2.5'
                          } ${activeTab === item.id
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                            : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                          }`}
                      >
                        <span
                          className={`relative shrink-0 ${activeTab === item.id ? 'text-white' : 'text-slate-500 group-hover:text-white'}`}
                        >
                          {item.icon}
                          {collapsed && item.badge ? (
                            <span className="absolute -right-0.5 -top-0.5 min-w-[0.5rem] h-2 px-0.5 rounded-full bg-amber-500 ring-2 ring-[#0B1120]" aria-hidden />
                          ) : null}
                        </span>
                        {!collapsed ? (
                          <>
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.badge ? (
                              <span className="min-w-[1.25rem] rounded-full bg-amber-500 px-1.5 py-0.5 text-center text-[10px] font-black text-white">
                                {item.badge}
                              </span>
                            ) : null}
                          </>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className={`mt-auto border-t border-slate-800/50 ${collapsed ? 'p-2 flex flex-col items-center gap-2' : 'p-4'}`}>
          {collapsed && !mobile ? (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('settings')}
                className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 flex items-center justify-center text-amber-900 font-black shadow-sm uppercase hover:ring-2 hover:ring-white/30 transition-all"
                title="Settings"
                aria-label="Open settings"
              >
                {currentUser?.name?.charAt(0) || 'A'}
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="p-2 rounded-xl text-slate-400 hover:bg-red-500/20 hover:text-red-400 transition-colors"
                title="Log out"
                aria-label="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div
              role="button"
              tabIndex={0}
              onClick={() => {
                setActiveTab('settings');
                setIsSidebarOpen(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActiveTab('settings');
                  setIsSidebarOpen(false);
                }
              }}
              className="w-full flex items-center space-x-3 p-3 rounded-2xl bg-slate-800/50 hover:bg-slate-800 transition-colors border border-slate-700/50 cursor-pointer"
            >
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-200 to-amber-400 flex items-center justify-center text-amber-900 font-black shadow-sm uppercase shrink-0">
                {currentUser?.name?.charAt(0) || 'A'}
              </div>
              <div className="text-left flex-1 min-w-0">
                <div className="text-xs font-bold text-white truncate">{currentUser?.name || 'Administrator'}</div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">
                  {currentUser?.role || 'Admin'}
                </div>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLogout();
                }}
                className="p-2 hover:bg-red-500/20 text-slate-400 hover:text-red-500 rounded-lg transition-colors shrink-0"
                aria-label="Log out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="flex h-full min-h-0 min-w-0 flex-1 items-center justify-center bg-background text-muted-foreground font-bold">Loading Dashboard...</div>;
  }

  return (
    <div
      className={`flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-y-contain bg-[#F8FAFC] transition-[padding] duration-300 ease-out ${isSidebarCollapsed ? 'md:pl-[4.5rem]' : 'md:pl-72'
        }`}
    >
      {/* Mobile Header Bar */}
      <div className="md:hidden flex items-center gap-2 p-4 bg-white border-b border-slate-100 sticky top-0 z-[60]">
        <button
          type="button"
          onClick={() => setIsSidebarOpen(true)}
          className="p-2.5 bg-slate-50 rounded-xl text-slate-600 transition-all active:scale-95 shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
        <span className="font-black text-[10px] uppercase tracking-[0.15em] text-slate-900 truncate flex-1 min-w-0 text-center">
          {mobileHeaderTitle}
        </span>
        <div className="flex items-center gap-0.5 shrink-0">
          {visibleQuickAccessMenuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                setIsSidebarOpen(false);
              }}
              title={item.label}
              aria-label={item.label}
              className={`p-2 rounded-xl transition-colors ${activeTab === item.id
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-500 bg-slate-50 hover:bg-slate-200 hover:text-slate-800'
                }`}
            >
              <span className="flex [&_svg]:w-[18px] [&_svg]:h-[18px]">{item.icon}</span>
            </button>
          ))}
          <NotificationBell {...notificationBellProps} />
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0">
            {(businessSettings.companyName || 'N').charAt(0).toUpperCase()}
          </div>
        </div>
      </div>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="md:hidden fixed inset-0 z-[100] animate-in fade-in duration-300">
          <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm" onClick={() => setIsSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-4/5 bg-[#0B1120] shadow-2xl animate-in slide-in-from-left duration-500">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Desktop Sidebar used to be here, but now it's fixed inside the Sidebar component itself which is rendered above */}
      <Sidebar />

      {/* Content Area */}
      <div className={`p-6 md:p-10 animate-in fade-in duration-700 w-full min-w-0 ${activeTab === 'assignment' || activeTab === 'communication' || activeTab === 'support' ? '' : 'max-w-[1600px] mx-auto'}`}>
        <div className="hidden md:flex sticky top-0 z-30 -mx-6 md:-mx-10 px-6 md:px-10 py-3 mb-4 items-center justify-end gap-2 flex-wrap bg-[#F8FAFC]/95 backdrop-blur-sm border-b border-slate-200/60">
          {visibleQuickAccessMenuItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              title={item.label}
              aria-label={item.label}
              className={`inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-[10px] font-black uppercase tracking-widest transition-all border-2 ${activeTab === item.id
                  ? 'border-blue-600 bg-blue-600 text-white shadow-lg shadow-blue-200/40'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
            >
              <span className={activeTab === item.id ? 'text-white' : 'text-slate-500'}>{item.icon}</span>
              <span className="hidden xl:inline">{item.label}</span>
            </button>
          ))}
          <div className="h-8 w-px bg-slate-200 mx-1 hidden sm:block" aria-hidden />
          <NotificationBell {...notificationBellProps} />
        </div>
        {activeTab === 'overview' && (
          <div className="space-y-8">
            {/* ── Dashboard KPI Panel ── */}
            {dashStatsLoading && !dashStats ? (
              <div className="text-center py-8 text-sm text-muted-foreground animate-pulse">Loading dashboard stats...</div>
            ) : dashStats && (
              <div className="space-y-6">
                {/* KPI Cards Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-card rounded-2xl border p-5">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue This Month</div>
                    <div className="text-2xl font-bold mt-1">£{dashStats?.revenue?.thisMonth?.toLocaleString() ?? '—'}</div>
                    {dashStats?.revenue?.lastMonth > 0 && (
                      <div className={`text-xs mt-1 ${(dashStats.revenue.thisMonth >= dashStats.revenue.lastMonth) ? 'text-emerald-500' : 'text-red-400'}`}>
                        {dashStats.revenue.thisMonth >= dashStats.revenue.lastMonth ? '↑' : '↓'} vs £{dashStats.revenue.lastMonth.toLocaleString()} last month
                      </div>
                    )}
                  </div>
                  <div className="bg-card rounded-2xl border p-5">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bookings Today</div>
                    <div className="text-2xl font-bold mt-1">{dashStats?.bookings?.today ?? '—'}</div>
                    <div className="text-xs text-muted-foreground mt-1">{dashStats?.bookings?.thisWeek ?? 0} this week · {dashStats?.bookings?.thisMonth ?? 0} this month</div>
                  </div>
                  <div className="bg-card rounded-2xl border p-5">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Avg Rating</div>
                    <div className="text-2xl font-bold mt-1">{dashStats?.ratings?.average ? `${dashStats.ratings.average} ★` : '—'}</div>
                    <div className="text-xs text-muted-foreground mt-1">{dashStats?.ratings?.totalReviews ?? 0} reviews</div>
                  </div>
                  <div className="bg-card rounded-2xl border p-5">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cancellation Rate</div>
                    <div className="text-2xl font-bold mt-1">{dashStats?.cancellationRate ?? 0}%</div>
                    <div className="text-xs text-muted-foreground mt-1">{dashStats?.customers?.total ?? 0} total clients</div>
                  </div>
                </div>

                {/* Second row: Status breakdown + Top Services */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Bookings by Status */}
                  <div className="bg-card rounded-2xl border p-5">
                    <div className="text-sm font-semibold mb-3">Booking Pipeline</div>
                    <div className="space-y-2">
                      {dashStats?.bookings?.byStatus && Object.entries(dashStats.bookings.byStatus).map(([status, count]: [string, any]) => {
                        const colors: Record<string, string> = { Pending: 'bg-amber-500', Confirmed: 'bg-blue-500', Completed: 'bg-emerald-500', Cancelled: 'bg-red-400' };
                        const total = Object.values(dashStats.bookings.byStatus).reduce((a: number, b: any) => a + Number(b), 0) as number;
                        const pct = total > 0 ? Math.round((Number(count) / total) * 100) : 0;
                        return (
                          <div key={status} className="flex items-center gap-3">
                            <div className="w-20 text-xs text-muted-foreground">{status}</div>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${colors[status] || 'bg-slate-400'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <div className="text-xs font-medium w-8 text-right">{String(count)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Top Services */}
                  <div className="bg-card rounded-2xl border p-5">
                    <div className="text-sm font-semibold mb-3">Top Services</div>
                    <div className="space-y-2">
                      {dashStats?.topServices?.map((s: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{s.serviceType}</span>
                          <span className="font-medium">{s.count} jobs · £{s.revenue?.toLocaleString()}</span>
                        </div>
                      ))}
                      {(!dashStats?.topServices || dashStats.topServices.length === 0) && (
                        <div className="text-sm text-muted-foreground">No data yet</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Revenue Trend */}
                {dashStats?.revenue?.trend?.length > 0 && (
                  <div className="bg-card rounded-2xl border p-5">
                    <div className="text-sm font-semibold mb-3">Revenue Trend (6 Months)</div>
                    <div className="flex items-end gap-2 h-32">
                      {dashStats.revenue.trend.map((m: any, i: number) => {
                        const maxVal = Math.max(...dashStats.revenue.trend.map((t: any) => Number(t.total)));
                        const h = maxVal > 0 ? Math.max(8, (Number(m.total) / maxVal) * 100) : 8;
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <div className="text-xs font-medium">£{Number(m.total).toLocaleString()}</div>
                            <div className="w-full bg-primary/80 rounded-t-md" style={{ height: `${h}%` }} />
                            <div className="text-[10px] text-muted-foreground">{m.month?.slice(5)}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Customers + Staff row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-card rounded-2xl border p-5">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Customers</div>
                    <div className="text-2xl font-bold mt-1">{dashStats?.customers?.total ?? '—'}</div>
                    <div className="text-xs text-emerald-500 mt-1">+{dashStats?.customers?.newThisMonth ?? 0} this month</div>
                  </div>
                  <div className="bg-card rounded-2xl border p-5">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Active Staff</div>
                    <div className="text-2xl font-bold mt-1">{dashStats?.staff?.active ?? '—'}</div>
                  </div>
                  <div className="bg-card rounded-2xl border p-5">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bookings Last Month</div>
                    <div className="text-2xl font-bold mt-1">{dashStats?.bookings?.lastMonth ?? '—'}</div>
                  </div>
                  <div className="bg-card rounded-2xl border p-5">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue Last Month</div>
                    <div className="text-2xl font-bold mt-1">£{dashStats?.revenue?.lastMonth?.toLocaleString() ?? '—'}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Top Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
              <div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">Admin Overview</h1>
                <p className="text-slate-500 text-sm font-medium mt-1">Welcome back, {currentUser?.name?.split(' ')[0] || 'Admin'}. Here's what's happening today.</p>
              </div>
              <div className="flex items-center space-x-4">
                <div className="relative hidden md:block group">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                  <input
                    type="text"
                    placeholder="Search appointments..."
                    className="pl-11 pr-4 py-3 bg-white w-72 rounded-xl text-sm font-medium border-none shadow-sm focus:ring-2 ring-blue-500/20 text-slate-600 placeholder:text-slate-400 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        setBookingsSubView('pipeline');
                        setActiveTab('bookings'); // Jump to bookings tab on search
                      }
                    }}
                  />
                </div>
                <div className="relative">
                  <button
                    className="relative p-3 bg-white rounded-xl shadow-sm hover:bg-slate-50 transition-colors text-slate-400 hover:text-slate-600"
                    onClick={() => setIsQuickActionOpen(!isQuickActionOpen)}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                  {isQuickActionOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 z-50 overflow-hidden animate-in fade-in zoom-in-95">
                      <div className="p-2 space-y-1">
                        <button
                          onClick={() => {
                            // Redirect to client booking flow in new tab to book on behalf
                            window.open('/', '_blank');
                            setIsQuickActionOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-lg transition-colors flex items-center"
                        >
                          <Plus className="w-4 h-4 mr-2" /> Book on behalf
                        </button>
                        <button
                          onClick={() => {
                            setActiveTab('services');
                            setServicesSection('catalog');
                            setIsCreatingService(true);
                            setIsQuickActionOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-lg transition-colors flex items-center"
                        >
                          <Layers className="w-4 h-4 mr-2" /> New Service Type
                        </button>
                        <button
                          onClick={() => {
                            setActiveTab('staff');
                            setIsCreatingStaff(true);
                            setIsQuickActionOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 rounded-lg transition-colors flex items-center"
                        >
                          <UserPlus className="w-4 h-4 mr-2" /> Add Staff Member
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Operations health strip */}
            <div className="flex flex-col lg:flex-row lg:items-stretch gap-3 rounded-[1.5rem] border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-orange-50/80 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-amber-900 font-black text-xs uppercase tracking-widest shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                Ops health
              </div>
              <div className="flex flex-wrap gap-2 flex-1">
                <button
                  type="button"
                  onClick={() => { setActiveTab('assignment'); setPipelineQuickFilter('unassigned'); }}
                  className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide border transition-all ${opsHealth.unassignedTomorrow > 0 ? 'bg-amber-100 border-amber-300 text-amber-950' : 'bg-white/80 border-slate-200 text-slate-600'}`}
                >
                  Tomorrow unassigned: <span className="tabular-nums">{opsHealth.unassignedTomorrow}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBookingsSubView('pipeline');
                    setActiveTab('bookings');
                    setPipelineQuickFilter('stale_pending');
                  }}
                  className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide border transition-all ${opsHealth.stalePending > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-white/80 border-slate-200 text-slate-600'}`}
                >
                  Stale pending (past date): <span className="tabular-nums">{opsHealth.stalePending}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBookingsSubView('pipeline');
                    setActiveTab('bookings');
                    setPipelineQuickFilter('today');
                    setStatusFilter(BookingStatus.PENDING);
                  }}
                  className="px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-wide bg-white/80 border border-slate-200 text-slate-700"
                >
                  Pending today: <span className="tabular-nums">{opsHealth.pendingToday}</span>
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* Revenue Card */}
              <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-100/50 hover:shadow-md transition-shadow relative overflow-hidden group">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Total Revenue</div>
                    <div className="text-3xl font-black text-slate-900 tracking-tight">£{bookings.reduce((acc, curr) => acc + Number(curr.totalPrice || 0), 0).toFixed(2)}</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <DollarSign className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="flex items-center space-x-1 text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">
                    <TrendingUp className="w-3 h-3" />
                    <span>+8.2%</span>
                  </div>
                  {/* Mini Sparkline Visualization */}
                  <svg className="w-24 h-8 text-blue-500 opacity-20" viewBox="0 0 100 40" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M0 30 C 20 20, 40 40, 60 10 S 100 5, 100 5" />
                  </svg>
                </div>
              </div>

              {/* Active Bookings Card */}
              <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-100/50 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Active Bookings</div>
                    <div className="text-3xl font-black text-slate-900 tracking-tight">{bookings.filter(b => b.status === BookingStatus.PENDING || b.status === BookingStatus.CONFIRMED).length}</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Calendar className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="flex items-center space-x-1 text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">
                    <TrendingUp className="w-3 h-3" />
                    <span>+12%</span>
                  </div>
                  <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 w-[70%]" />
                  </div>
                </div>
              </div>

              {/* Ratings Card */}
              <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-100/50 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Average Rating</div>
                    <div className="text-3xl font-black text-slate-900 tracking-tight">
                      {bookings.filter(b => b.rating).length > 0
                        ? (bookings.filter(b => b.rating).reduce((sum, b) => sum + (b.rating || 0), 0) / bookings.filter(b => b.rating).length).toFixed(1)
                        : '5.0'}
                    </div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center">
                    <Star className="w-5 h-5 fill-current" />
                  </div>
                </div>
                <div className="flex items-center space-x-1 mt-auto">
                  {[1, 2, 3, 4, 5].map(s => <Star key={s} className="w-3 h-3 text-amber-400 fill-current" />)}
                  <span className="text-[9px] text-slate-400 font-bold ml-2">from {bookings.filter(b => b.rating).length} reviews</span>
                </div>
              </div>

              {/* Utilization Card */}
              <div className="bg-white p-6 rounded-[1.5rem] shadow-sm border border-slate-100/50 hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Staff Utilization</div>
                    <div className="text-3xl font-black text-slate-900 tracking-tight">82%</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div className="flex items-center space-x-1 text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">
                    <TrendingUp className="w-3 h-3" />
                    <span>+5%</span>
                  </div>
                  <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 w-[82%]" />
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setActiveTab('bookings');
                setBookingsSubView('upcoming');
              }}
              className="w-full flex items-center justify-between gap-4 p-5 sm:p-6 rounded-[1.5rem] border-2 border-blue-200/80 bg-gradient-to-r from-blue-50/90 to-white shadow-sm hover:border-blue-300 hover:shadow-md transition-all text-left group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-md shrink-0">
                  <Calendar className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-900">Upcoming appointments</p>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    Opens under Bookings — same page, dedicated tab for this schedule view.
                  </p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-blue-600 shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </button>

            {/* Middle Section: Chart and Live Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Main Chart Area */}
              <div className="lg:col-span-2 bg-white p-5 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100/50">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h3 className="text-lg font-black text-slate-900">Bookings vs Revenue</h3>
                    <p className="text-xs font-bold text-slate-400 mt-1">Performance for the last 30 days</p>
                  </div>
                  <div className="bg-slate-50 p-1 rounded-xl flex space-x-1">
                    <button
                      onClick={() => setOverviewChartDays(30)}
                      className={`px-3 py-1.5 shadow-sm rounded-lg text-[10px] font-black transition-colors ${overviewChartDays === 30 ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
                      30 Days
                    </button>
                    <button
                      onClick={() => setOverviewChartDays(90)}
                      className={`px-3 py-1.5 shadow-sm rounded-lg text-[10px] font-black transition-colors ${overviewChartDays === 90 ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
                      90 Days
                    </button>
                    <button
                      onClick={() => setOverviewChartDays(365)}
                      className={`px-3 py-1.5 shadow-sm rounded-lg text-[10px] font-black transition-colors ${overviewChartDays === 365 ? 'bg-white text-slate-900' : 'text-slate-500 hover:text-slate-900'}`}>
                      1 Year
                    </button>
                  </div>
                </div>
                {/* Chart Visualization based on real bookings */}
                <div className="h-64 w-full bg-slate-50/50 rounded-2xl flex items-end justify-between px-6 pb-0 pt-10">
                  {Array.from({ length: 12 }).map((_, i) => {
                    // Simple logic: split bookings into 12 "bins" or just show dummy data that looks cleaner if no data yet
                    // For now, let's just make it look a bit more "real" or empty if no data
                    const count =
                      bookings.length > 0
                        ? bookings.filter((b) => parseLocalDateFromYYYYMMDD(b.date)?.getMonth() === i).length * 10
                        : 0;
                    return (
                      <div key={i} className="w-1/12 mx-1 bg-blue-100 rounded-t-lg relative group h-full">
                        <div className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t-lg transition-all duration-500 group-hover:bg-blue-600" style={{ height: `${Math.max(count || 5, 2)}%` }}></div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-between mt-4 text-[10px] font-bold text-slate-400 px-2">
                  {overviewChartDays === 30 && (
                    <><span>Week 1</span><span>Week 2</span><span>Week 3</span><span>Week 4</span></>
                  )}
                  {overviewChartDays === 90 && (
                    <><span>Month 1</span><span>Month 2</span><span>Month 3</span></>
                  )}
                  {overviewChartDays === 365 && (
                    <><span>Q1</span><span>Q2</span><span>Q3</span><span>Q4</span></>
                  )}
                </div>
              </div>

              {/* Live Feed */}
              <div className="bg-white p-5 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100/50">
                <div className="flex justify-between items-center mb-8">
                  <h3 className="text-lg font-black text-slate-900">Live Feed</h3>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                </div>
                <div className="space-y-6">
                  {/* Feed Items (Dynamic) */}
                  {bookings.slice(0, 4).map((booking, idx) => (
                    <div key={booking.id} className="flex space-x-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${idx % 2 === 0 ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
                        {idx % 2 === 0 ? <Briefcase className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-slate-900 truncate">
                          {booking.contact?.name || 'New Client'} <span className="font-normal text-slate-500">booked {booking.serviceType}</span>
                        </div>
                        <div className="text-[10px] font-medium text-slate-400 mt-0.5">
                          {format(new Date(booking.createdAt || new Date()), 'h:mm a')} • {booking.address.city}
                        </div>
                      </div>
                    </div>
                  ))}
                  {bookings.length === 0 && (
                    <p className="text-xs text-slate-400 italic text-center py-4">No recent activity</p>
                  )}
                </div>
                <button
                  onClick={() => setIsActivityLogOpen(true)}
                  className="w-full mt-8 py-3 text-sm font-bold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-xl transition-colors"
                >
                  View Activity Log
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'bookings' && (
          <div className="flex-1 flex flex-col animate-in fade-in duration-500">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-8">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Bookings</h3>
                <p className="text-slate-500 text-sm font-medium mt-1">Service pipeline and upcoming appointments in one place.</p>
              </div>
              <div className="flex p-1 rounded-2xl bg-slate-200/70 border border-slate-200 gap-1 w-full lg:w-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setBookingsSubView('pipeline')}
                  className={`flex-1 lg:flex-none px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${bookingsSubView === 'pipeline' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  Service pipeline
                </button>
                <button
                  type="button"
                  onClick={() => setBookingsSubView('upcoming')}
                  className={`flex-1 lg:flex-none px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${bookingsSubView === 'upcoming' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                >
                  Upcoming appointments
                </button>
              </div>
            </div>

            {bookingsSubView === 'pipeline' && (
              <>
                <div className="flex flex-col md:flex-row justify-between items-center mb-10 gap-6">
                  <div>
                    <h3 className="text-2xl font-black text-slate-900 tracking-tight">Service pipeline</h3>
                    <p className="text-slate-500 text-sm font-medium mt-1">Manage and track all incoming client requests.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative w-full md:w-64">
                      <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                      <input
                        type="text"
                        placeholder="Search..."
                        className="w-full pl-12 pr-6 py-4 bg-white border border-slate-100 rounded-2xl outline-none focus:ring-2 ring-blue-500/20 font-bold shadow-sm transition-all"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                      />
                    </div>
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative">
                        <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                        <select
                          className="pl-10 pr-8 py-4 bg-white border border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none focus:ring-2 ring-blue-500/20 appearance-none cursor-pointer shadow-sm transition-all"
                          value={statusFilter}
                          onChange={e => setStatusFilter(e.target.value as any)}
                        >
                          {[
                            'All',
                            BookingStatus.PENDING,
                            BookingStatus.CONFIRMED,
                            BookingStatus.COMPLETED,
                            BookingStatus.CANCELLED,
                          ].map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {([
                          { id: 'none' as const, label: 'All' },
                          { id: 'today' as const, label: 'Today' },
                          { id: 'unassigned' as const, label: 'Unassigned' },
                          { id: 'stale_pending' as const, label: 'Stale pending' },
                          { id: 'cancel_requests' as const, label: `Cancel requests (${approvedCancelNeedsReassignCount})` },
                          { id: 'cancelled' as const, label: `Cancelled (${cancelledBookingsCount})` },
                          ...(hiddenBookingsCount > 0 ? [{ id: 'hidden' as const, label: `Hidden (${hiddenBookingsCount})` }] : []),
                        ]).map((q) => (
                          <button
                            key={q.id}
                            type="button"
                            onClick={() => { setPipelineQuickFilter(q.id); setSelectedBookingIds(new Set()); }}
                            className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide border transition-all ${pipelineQuickFilter === q.id
                              ? q.id === 'hidden' ? 'bg-orange-600 text-white border-orange-600' : 'bg-slate-900 text-white border-slate-900'
                              : q.id === 'hidden' ? 'bg-orange-50 border-orange-200 text-orange-600 hover:border-orange-300' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}
                          >
                            {q.label}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          exportBookingsCsv(filteredBookings, `bookings-export-${new Date().toISOString().slice(0, 10)}.csv`);
                          showFlyer('Downloaded CSV with the current pipeline view.', 'success');
                        }}
                        className="p-4 bg-white border border-slate-100 text-slate-700 rounded-2xl hover:bg-slate-50 transition-colors shadow-sm"
                        title="Export visible rows to CSV"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                      <button
                        onClick={async () => {
                          const toRemind = filteredBookings.filter(b => b.status === BookingStatus.CONFIRMED);
                          if (toRemind.length === 0) {
                            showFlyer("No confirmed bookings to remind", 'error');
                            return;
                          }
                          setReminderMessage("Hi there, just a quick reminder about your upcoming booking. Looking forward to seeing you!");
                          setBatchReminderModalOpen(true);
                        }}
                        className="p-4 bg-white border border-slate-100 text-blue-600 rounded-2xl hover:bg-blue-50 transition-colors shadow-sm"
                        title="Send Reminders to Confirmed Bookings"
                      >
                        <Mail className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>

                {pendingCancelRequests.length > 0 && (
                  <div className="mb-6 space-y-3">
                    <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50">
                      <p className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">Staff cancellation requests</p>
                      <p className="text-sm font-bold text-amber-900">
                        {pendingCancelRequests.length} pending request{pendingCancelRequests.length === 1 ? '' : 's'} need your response.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {pendingCancelRequests.map((r) => (
                        <div key={r.id} className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm">
                          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Booking {r.bookingId} • {r.date || 'N/A'} {r.time || ''}
                              </p>
                              <p className="font-black text-slate-900 mt-1">
                                {r.staffName} requested cancellation{r.serviceType ? ` (${r.serviceType})` : ''}.
                              </p>
                              {r.reason ? <p className="text-sm font-medium text-slate-600 mt-1">Reason: {r.reason}</p> : null}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleCancelRequestDecision(r.id, 'approve')}
                                className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-widest hover:bg-red-700"
                              >
                                Approve cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleCancelRequestDecision(r.id, 'reject')}
                                className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-widest hover:bg-slate-700"
                              >
                                Reject
                              </button>
                            </div>
                          </div>
                          <input
                            type="text"
                            value={cancelDecisionNotes[r.id] || ''}
                            onChange={(e) =>
                              setCancelDecisionNotes((prev) => ({
                                ...prev,
                                [r.id]: e.target.value,
                              }))
                            }
                            placeholder="Optional note (sent when rejecting)"
                            className="mt-3 w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-medium"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedBookingIds.size > 0 && (
                  <div className="mb-4 flex items-center gap-3 p-3 rounded-2xl bg-slate-900 text-white animate-in slide-in-from-top-2 duration-300">
                    <span className="text-xs font-black uppercase tracking-widest">
                      {selectedBookingIds.size} selected
                    </span>
                    <div className="flex-1" />
                    {pipelineQuickFilter === 'hidden' ? (
                      <button
                        type="button"
                        onClick={() => handleRestoreBookings([...selectedBookingIds])}
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-500 transition-all flex items-center gap-2"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Restore to view
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleDismissBookings([...selectedBookingIds])}
                        className="px-4 py-2 rounded-xl bg-orange-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-orange-500 transition-all flex items-center gap-2"
                      >
                        <EyeOff className="w-3.5 h-3.5" /> Remove from view
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedBookingIds(new Set())}
                      className="px-4 py-2 rounded-xl bg-white/10 text-white text-[10px] font-black uppercase tracking-widest hover:bg-white/20 transition-all"
                    >
                      Clear
                    </button>
                  </div>
                )}

                <div className="flex items-center justify-between mb-2 px-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {filteredBookings.length} booking{filteredBookings.length === 1 ? '' : 's'}
                    {pipelineQuickFilter === 'hidden' ? ' hidden from view' : ''}
                  </span>
                </div>

                <div className="overflow-x-auto no-scrollbar flex-1">
                  <table className="w-full text-left min-w-[1180px]">
                    <thead className="sticky top-0 bg-slate-50/80 backdrop-blur-md z-10">
                      <tr>
                        <th className="pl-4 pr-2 py-5 w-[44px]">
                          <input
                            type="checkbox"
                            checked={filteredBookings.length > 0 && filteredBookings.every(b => selectedBookingIds.has(Number(b.id)))}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedBookingIds(new Set(filteredBookings.map(b => Number(b.id))));
                              } else {
                                setSelectedBookingIds(new Set());
                              }
                            }}
                            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 cursor-pointer"
                            title="Select all"
                          />
                        </th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Client</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Service</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Price</th>
                        <th className="px-6 py-5 text-[10px] font-black uppercase text-slate-400 tracking-widest">Status</th>
                        <th className="px-6 py-5 text-center text-[10px] font-black uppercase text-slate-400 tracking-widest w-[100px]">Paid</th>
                        <th className="px-6 py-5 text-right text-[10px] font-black uppercase text-slate-400 tracking-widest">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredBookings.map(b => {
                        const isSelected = selectedBookingIds.has(Number(b.id));
                        const isHiddenView = pipelineQuickFilter === 'hidden';
                        return (
                        <tr
                          key={b.id}
                          className={`group transition-all ${isSelected ? 'bg-blue-50/60' : b.status === BookingStatus.CANCELLED
                              ? 'bg-red-50/70 hover:bg-red-50'
                              : isHiddenView
                                ? 'bg-orange-50/40 hover:bg-orange-50/60'
                                : approvedCancelBookingIds.has(b.id) &&
                                  !bookingHasStaff(b) &&
                                  b.status !== BookingStatus.COMPLETED
                                  ? 'bg-red-50/55 hover:bg-red-50'
                                  : 'hover:bg-slate-50/30'
                            }`}
                        >
                          <td className="pl-4 pr-2 py-5 w-[44px]">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                const next = new Set(selectedBookingIds);
                                if (e.target.checked) next.add(Number(b.id)); else next.delete(Number(b.id));
                                setSelectedBookingIds(next);
                              }}
                              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500 cursor-pointer"
                            />
                          </td>
                          <td className="px-6 py-5">
                            <div
                              className="font-black text-slate-900 hover:text-blue-600 cursor-pointer transition-colors inline-block"
                              onClick={(e) => { e.stopPropagation(); if (b.contact?.email) setProfileClientEmail(b.contact.email); }}
                            >{b.contact?.name || 'Guest'}</div>
                            <div className="text-[10px] font-bold text-slate-400">REF: {b.bookingId}</div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="font-bold text-sm text-slate-700">{b.serviceType}</div>
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{b.date} • {b.time}</div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="font-black text-sm text-slate-800">£{Number(b.totalPrice || 0).toFixed(2)}</div>
                          </td>
                          <td className="px-6 py-5">
                            <div className="flex items-center gap-2 flex-wrap">
                              {b.status === BookingStatus.CANCELLED ? (
                                <Ban className="w-4 h-4 text-red-500 shrink-0" aria-hidden />
                              ) : null}
                              <span
                                className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${b.status === BookingStatus.COMPLETED
                                    ? 'bg-green-50 text-green-600'
                                    : b.status === BookingStatus.PENDING
                                      ? 'bg-amber-50 text-amber-600'
                                      : b.status === BookingStatus.CANCELLED
                                        ? 'bg-red-50 text-red-600 ring-1 ring-red-100'
                                        : 'bg-blue-50 text-blue-600'
                                  }`}
                              >
                                {b.status}
                              </span>
                            </div>
                          </td>
                          <td className="px-6 py-5 text-center">
                            <input
                              type="checkbox"
                              checked={Boolean(b.invoicePaid)}
                              onChange={async (e) => {
                                const checked = e.target.checked;
                                try {
                                  await apiAdmin.updateBooking(b.id, { invoicePaid: checked });
                                  setBookings((prev) => prev.map((row) => (row.id === b.id ? { ...row, invoicePaid: checked } : row)));
                                  showFlyer(checked ? 'Invoice marked as paid.' : 'Invoice marked as payment pending.', 'success');
                                } catch (err) {
                                  showFlyer(err instanceof Error ? err.message : 'Could not update payment status', 'error');
                                }
                              }}
                              className="h-5 w-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                              title="Customer invoice paid"
                              aria-label={`Mark invoice paid for ${b.id}`}
                            />
                          </td>
                          <td className="px-6 py-5 text-right">
                            <div className="flex justify-end space-x-2 transition-opacity">
                              {isHiddenView ? (
                                <button
                                  type="button"
                                  onClick={() => handleRestoreBookings([Number(b.id)])}
                                  className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center"
                                  title="Restore this booking to the pipeline view"
                                >
                                  <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Restore
                                </button>
                              ) : (
                                <>
                                  {approvedCancelBookingIds.has(b.id) && !bookingHasStaff(b) && b.status !== BookingStatus.CANCELLED && b.status !== BookingStatus.COMPLETED && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setActiveTab('assignment');
                                        setSelectedBookingForAssignment(b);
                                      }}
                                      className="px-3 py-2 rounded-xl bg-red-50 text-red-700 border border-red-200 text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all flex items-center"
                                      title="Staff cancel approved - click to reassign now"
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />
                                      staff cancel
                                    </button>
                                  )}
                                  <button onClick={() => {
                                    setReminderMessage(`Reminder: Your booking for ${b.serviceType} is coming up on ${b.date} at ${b.time}.`);
                                    setReminderModalBooking(b);
                                  }} className="p-2 bg-slate-50 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50" title="Send Reminder">
                                    <Mail className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => setRescheduleBooking(b)} className="p-2 bg-slate-50 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50" title="Edit Date/Time">
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => setReviewBooking(b)}
                                    className="bg-slate-900 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-slate-700 transition-all flex items-center active:scale-95"
                                  >
                                    <CheckCircle2 className="w-3.5 h-3.5 mr-2" /> Review
                                  </button>
                                  <button
                                    onClick={() => apiAdmin.sendInvoice(b.id).then(() => showFlyer('Invoice Sent Successfully!', 'success'))}
                                    className="bg-green-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg hover:bg-green-700 transition-all flex items-center active:scale-95"
                                  >
                                    <Send className="w-3.5 h-3.5 mr-2" /> Invoice
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDismissBookings([Number(b.id)])}
                                    className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                                    title="Hide from view"
                                  >
                                    <EyeOff className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                        );
                      })}
                      {filteredBookings.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-12 text-center">
                            <div className="text-slate-400">
                              {pipelineQuickFilter === 'hidden' ? (
                                <>
                                  <Eye className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                                  <p className="text-sm font-bold">No hidden bookings</p>
                                  <p className="text-xs mt-1">All bookings are visible in the pipeline.</p>
                                </>
                              ) : (
                                <>
                                  <Calendar className="w-8 h-8 mx-auto mb-3 text-slate-300" />
                                  <p className="text-sm font-bold">No bookings match this filter</p>
                                  <p className="text-xs mt-1">Try adjusting your search or filter criteria.</p>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {bookingsSubView === 'upcoming' && (
              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100/50 p-5 sm:p-8">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-6">
                  <div>
                    <h3 className="text-xl font-black text-slate-900">Upcoming appointments</h3>
                    <p className="text-xs font-medium text-slate-500 mt-1">Sorted by date and time · assign or unassign staff</p>
                  </div>
                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="text-xs font-bold text-slate-400">Filter by:</span>
                    <select
                      value={upcomingFilter}
                      onChange={(e) => setUpcomingFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-100 text-xs font-black uppercase text-slate-600 py-2 pl-3 pr-8 rounded-lg cursor-pointer outline-none focus:ring-2 focus:ring-blue-500/20"
                    >
                      <option value="All Status">All Status</option>
                      <option value={BookingStatus.CONFIRMED}>Confirmed</option>
                      <option value={BookingStatus.PENDING}>Pending</option>
                      <option value={BookingStatus.CANCELLED}>Cancelled</option>
                    </select>
                  </div>
                </div>

                <div className="overflow-x-auto no-scrollbar">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr className="border-b border-slate-50 text-left">
                        <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Client</th>
                        <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Service Type</th>
                        <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Date &amp; time</th>
                        <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Assigned Staff</th>
                        <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Status</th>
                        <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right pr-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {[...bookings.filter((b) => upcomingFilter === 'All Status' || b.status === upcomingFilter)]
                        .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`))
                        .map((b) => (
                          <tr
                            key={b.id}
                            className={`group transition-colors ${b.status === BookingStatus.CANCELLED ? 'bg-red-50/70 hover:bg-red-50' : 'hover:bg-slate-50/50'
                              }`}
                          >
                            <td className="py-4 pl-2">
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-xs text-slate-500">
                                  {(b.contact?.name || '?').charAt(0)}
                                </div>
                                <div>
                                  <div
                                    className="text-sm font-bold text-slate-900 hover:text-blue-600 cursor-pointer transition-colors inline-block"
                                    onClick={(e) => { e.stopPropagation(); if (b.contact?.email) setProfileClientEmail(b.contact.email); }}
                                  >{b.contact?.name}</div>
                                  <div className="text-[10px] text-slate-400 font-medium">{b.address.line1}</div>
                                </div>
                              </div>
                            </td>
                            <td className="py-4">
                              <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-black uppercase tracking-wide">
                                {b.serviceType}
                              </span>
                            </td>
                            <td className="py-4">
                              <span className="text-xs font-bold text-slate-700">{b.date}</span>
                              <span className="text-[10px] text-slate-400 font-bold block uppercase tracking-widest">{b.time}</span>
                            </td>
                            <td className="py-4">
                              <div className="flex items-center space-x-2">
                                {b.assignedStaffId || (b.assignedStaffIds && b.assignedStaffIds.length > 0) ? (
                                  (() => {
                                    const sid = b.assignedStaffId || (b.assignedStaffIds && b.assignedStaffIds[0]);
                                    const s = staffList.find((st) => st.id === sid);
                                    return s ? (
                                      <>
                                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-[10px] font-black text-emerald-600">
                                          {s.name.charAt(0)}
                                        </div>
                                        <span className="text-xs font-bold text-slate-600">{s.name}</span>
                                      </>
                                    ) : (
                                      <span className="text-xs font-bold text-slate-400">Unassigned</span>
                                    );
                                  })()
                                ) : (
                                  <span className="text-xs font-bold text-slate-400">Unassigned</span>
                                )}
                              </div>
                            </td>
                            <td className="py-4">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {b.status === BookingStatus.CANCELLED ? (
                                  <Ban className="w-3.5 h-3.5 text-red-500 shrink-0" aria-hidden />
                                ) : null}
                                <div
                                  className={`w-2 h-2 rounded-full shrink-0 ${b.status === BookingStatus.CONFIRMED
                                      ? 'bg-green-500'
                                      : b.status === BookingStatus.PENDING
                                        ? 'bg-amber-500'
                                        : b.status === BookingStatus.CANCELLED
                                          ? 'bg-red-500'
                                          : 'bg-slate-300'
                                    }`}
                                />
                                <span
                                  className={`text-xs font-bold ${b.status === BookingStatus.CONFIRMED
                                      ? 'text-green-600'
                                      : b.status === BookingStatus.PENDING
                                        ? 'text-amber-600'
                                        : b.status === BookingStatus.CANCELLED
                                          ? 'text-red-600'
                                          : 'text-slate-500'
                                    }`}
                                >
                                  {b.status}
                                </span>
                              </div>
                            </td>
                            <td className="py-4 text-right pr-2">
                              <div className="inline-flex items-center gap-2 justify-end">
                                {(b.assignedStaffId || (b.assignedStaffIds && b.assignedStaffIds.length > 0)) && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleUnassignBooking(b);
                                    }}
                                    title="Unassign staff — return job to dispatch queue"
                                    className="text-slate-400 hover:text-red-600 transition-colors p-2 bg-slate-50 rounded-lg shadow-sm"
                                  >
                                    <UserX className="w-4 h-4" />
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    setSelectedBookingForAssignment(b);
                                  }}
                                  title="Assign Staff"
                                  className="text-slate-400 hover:text-blue-600 transition-colors p-2 bg-slate-50 rounded-lg shadow-sm"
                                >
                                  <UserCheck className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      {bookings.filter((b) => upcomingFilter === 'All Status' || b.status === upcomingFilter).length === 0 && (
                        <tr className="border-none">
                          <td colSpan={6} className="py-8 text-center text-xs font-bold text-slate-400 italic">
                            No appointments matching this filter
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'assignment' && (
          <div className="flex-1 flex flex-col animate-in fade-in duration-500 min-h-0">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Job Assignment</h3>
                <p className="text-slate-500 text-sm font-medium mt-1">Dispatch unassigned jobs to your available staff.</p>
              </div>
            </div>

            {staffScheduleConflicts.length > 0 && (
              <div className="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm font-bold text-amber-950">
                <AlertTriangle className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <p className="font-black uppercase tracking-tight text-xs text-amber-800 mb-1">Schedule overlaps detected</p>
                  <p>
                    {staffScheduleConflicts.length} overlapping assignment
                    {staffScheduleConflicts.length === 1 ? '' : 's'} on the rota (same staff, same time window). Reschedule or reassign
                    so each job has a clear slot.
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] gap-6 xl:gap-8 flex-1 min-h-0">
              {/* Left Panel: Pending/Unassigned Jobs */}
              <div className="w-full bg-white rounded-[2rem] shadow-sm border border-slate-100/50 flex flex-col overflow-hidden min-h-[320px] max-h-[60vh] xl:max-h-none">
                <div className="p-6 border-b border-slate-100 bg-slate-50/50">
                  <h4 className="text-lg font-black text-slate-900 flex items-center">
                    <AlertCircle className="w-5 h-5 mr-2 text-amber-500" />
                    Pending Dispatch
                  </h4>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                  {bookings.filter(b => b.status === BookingStatus.PENDING || (!b.assignedStaffId && (!b.assignedStaffIds || b.assignedStaffIds.length === 0))).length === 0 && (
                    <div className="text-center p-5 sm:p-8 text-slate-400 font-bold italic text-sm">
                      All caught up! No pending jobs to assign.
                    </div>
                  )}
                  {bookings
                    .filter(b => b.status === BookingStatus.PENDING || (!b.assignedStaffId && (!b.assignedStaffIds || b.assignedStaffIds.length === 0)))
                    .map(b => (
                      <div
                        key={b.id}
                        onClick={() => setSelectedBookingForAssignment(b)}
                        className={`p-5 rounded-2xl cursor-pointer transition-all border ${selectedBookingForAssignment?.id === b.id ? 'bg-blue-50 border-blue-500 shadow-md ring-2 ring-blue-500/20' : 'bg-slate-50 border-slate-100 hover:border-blue-200 hover:shadow-sm'}`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-black text-slate-900 text-sm truncate pr-2">{b.contact?.name || 'Guest'}</div>
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">{b.date}</div>
                        </div>
                        <div className="font-bold text-sm text-slate-700 mb-2 truncate">{b.serviceType}</div>
                        <div className="flex items-center text-[10px] font-bold text-slate-500 truncate">
                          <MapPin className="w-3 h-3 mr-1 shrink-0" />
                          <span className="truncate">{b.address.city}, {b.address.postcode}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* Right Panel: Assignment Details */}
              <div className="flex-1 bg-white rounded-[2rem] shadow-sm border border-slate-100/50 flex flex-col overflow-hidden relative min-h-[420px]">
                {selectedBookingForAssignment ? (
                  <>
                    <div className="p-5 sm:p-8 border-b border-slate-100">
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h2 className="text-2xl font-black text-slate-900 mb-1">{selectedBookingForAssignment.serviceType}</h2>
                          <div className="text-sm font-bold text-slate-500">{selectedBookingForAssignment.contact?.name} • REF: {selectedBookingForAssignment.id}</div>
                        </div>
                        <div className="px-4 py-2 bg-amber-50 rounded-xl border border-amber-100">
                          <div className="text-[10px] font-black text-amber-600 uppercase tracking-widest block mb-0.5">Scheduled</div>
                          <div className="text-sm font-black text-amber-700">{selectedBookingForAssignment.date} at {selectedBookingForAssignment.time}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
                        <div className="p-4 bg-slate-50 rounded-2xl">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Property Layout</div>
                          <div className="text-sm font-bold text-slate-700">
                            {selectedBookingForAssignment.propertyDetails?.bedrooms} Bed, {selectedBookingForAssignment.propertyDetails?.bathrooms} Bath
                          </div>
                        </div>
                        <div className="p-4 bg-slate-50 rounded-2xl">
                          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Address Location</div>
                          <div className="text-sm font-bold text-slate-700 truncate">
                            {selectedBookingForAssignment.address.line1}, {selectedBookingForAssignment.address.city}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-5 sm:p-8 flex-1 overflow-y-auto no-scrollbar bg-slate-50/30">
                      <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-4">Available Cleaners</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {staffList.filter(s => s.role === 'Cleaner' || s.role === 'Staff').map(staff => {
                          const isAssigned =
                            selectedBookingForAssignment.assignedStaffId === staff.id ||
                            (selectedBookingForAssignment.assignedStaffIds && selectedBookingForAssignment.assignedStaffIds.includes(staff.id));

                          return (
                            <div
                              key={staff.id}
                              onClick={() => {
                                // Provide a small quick assign logic for this mockup wrapper
                                handleAssignStaff(staff.id.toString());
                              }}
                              className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between group ${isAssigned ? 'bg-green-50 border-green-500 shadow-md ring-2 ring-green-500/20' : 'bg-white border-slate-200 hover:border-blue-400 hover:shadow-sm'}`}
                            >
                              <div className="flex items-center space-x-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm ${isAssigned ? 'bg-green-200 text-green-800' : 'bg-slate-100 text-slate-500'}`}>
                                  {staff.name.charAt(0)}
                                </div>
                                <div>
                                  <div className={`font-black text-sm ${isAssigned ? 'text-green-900' : 'text-slate-900'}`}>{staff.name}</div>
                                  <div className={`text-[10px] font-bold ${isAssigned ? 'text-green-600' : 'text-slate-400'}`}>£{staff.hourlyRate}/hr</div>
                                </div>
                              </div>
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isAssigned ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-300 group-hover:bg-blue-100 group-hover:text-blue-600'}`}>
                                {isAssigned ? <CheckCircle2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-5 sm:p-8 text-center">
                    <UserCheck className="w-16 h-16 text-slate-200 mb-4" />
                    <h4 className="text-xl font-black text-slate-900 mb-2">No Job Selected</h4>
                    <p className="text-sm font-medium">Select a pending job from the list to view details and assign staff members to the dispatch queue.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'rota' && (
          <RotaSchedulePanel
            bookings={bookings}
            staffList={staffList}
            services={services}
            extras={extraServices}
            conflicts={staffScheduleConflicts}
            chatSummaryById={summaryById}
            isLiveChat={isOngoingLiveChat}
            onOpenBooking={setReviewBooking}
            onOpenAssignment={() => setActiveTab('assignment')}
          />
        )}

        {activeTab === 'quotes' && (
          <QuoteRequestsPanel
            leads={quoteLeadsList}
            loading={quoteLeadsLoading}
            companyName={businessSettings.companyName || 'CiN Cleaning'}
            onRefresh={() => void fetchQuoteLeads()}
            onUpdate={updateQuoteLead}
            onDelete={deleteQuoteLead}
            onNotify={(message, type = 'success') => showFlyer(message, type)}
          />
        )}

        {activeTab === 'marketing' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">Marketing &amp; Referrals</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                Jump to a section - no long scrolling
              </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">
              <AdminInnerSubNav
                ariaLabel="Marketing sections"
                items={MARKETING_NAV}
                active={marketingSection}
                onChange={setMarketingSection}
              />

              <div className="flex-1 min-w-0 space-y-8 w-full">
                {marketingSection === 'overview' && (
                  <div className="space-y-8">
                    <div className="flex justify-between items-center flex-wrap gap-4">
                      <h4 className="text-xl font-black text-slate-900">Overview &amp; stats</h4>
                      <button
                        onClick={() => setIsCreatingDiscount(true)}
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center shadow-lg shadow-blue-200"
                      >
                        <Plus className="w-5 h-5 mr-2" /> Create Promo
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm">
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Referrals logged</div>
                        <div className="text-3xl font-black text-slate-900 tabular-nums">{referralStats.total}</div>
                      </div>
                      <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm">
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Reward pool (£)</div>
                        <div className="text-3xl font-black text-slate-900 tabular-nums">£{referralStats.totalReward.toFixed(2)}</div>
                      </div>
                      <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm">
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Settled vs open</div>
                        <div className="text-lg font-black text-slate-900">
                          <span className="text-green-600 tabular-nums">{referralStats.completed + referralStats.paid}</span>
                          <span className="text-slate-300 mx-1">/</span>
                          <span className="text-amber-600 tabular-nums">{referralStats.pending}</span>
                        </div>
                      </div>
                      <div className="bg-white p-6 rounded-[1.5rem] border border-slate-100 shadow-sm">
                        <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Completion rate</div>
                        <div className="text-3xl font-black text-slate-900 tabular-nums">{referralStats.conversion}%</div>
                        <p className="text-[10px] text-slate-400 font-medium mt-1">Completed or paid ÷ total</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
                        <div className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mb-1">Active promo codes</div>
                        <div className="text-2xl font-black text-indigo-900 tabular-nums">{discountStats.active}</div>
                      </div>
                      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
                        <div className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mb-1">Total redemptions</div>
                        <div className="text-2xl font-black text-indigo-900 tabular-nums">{discountStats.redemptions}</div>
                      </div>
                      <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
                        <div className="text-[10px] font-black uppercase text-indigo-500 tracking-widest mb-1">Codes in system</div>
                        <div className="text-2xl font-black text-indigo-900 tabular-nums">{discountStats.count}</div>
                      </div>
                    </div>

                    <div className="pt-6 border-t border-slate-100">
                      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-blue-100 bg-blue-50/60 p-5">
                        <div>
                          <h4 className="text-lg font-black text-slate-900">Free quote requests</h4>
                          <p className="text-sm text-slate-600 font-medium mt-1">
                            {newQuoteCount > 0
                              ? `${newQuoteCount} new ${newQuoteCount === 1 ? 'request is' : 'requests are'} waiting for a reply.`
                              : 'No new requests waiting.'}{' '}
                            Homepage quotes now have their own page.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('quotes')}
                          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-black hover:bg-blue-700"
                        >
                          <ClipboardList className="w-4 h-4" /> Open Quote Requests
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {marketingSection === 'referrals' && (
                  <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100/50 p-5 sm:p-8">
                    <div className="mb-6 rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-blue-600">Global referral reward</p>
                          <p className="text-xs font-bold text-slate-600 mt-1">This amount is applied to all referral rows (staff + customer).</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black text-slate-500">£</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={Number.isFinite(referralRewardAmount) ? referralRewardAmount : 0}
                            onChange={(e) => setReferralRewardAmount(Number(e.target.value))}
                            className="w-28 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-black text-slate-900"
                          />
                          <button
                            type="button"
                            onClick={handleSaveReferralRewardAmount}
                            disabled={isSavingReferralReward}
                            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-black uppercase tracking-widest hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isSavingReferralReward ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-between items-center mb-6 flex-wrap gap-3">
                      <h4 className="text-xl font-black text-slate-900">Referral monitoring</h4>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-400">Filter by Status:</span>
                        <select
                          value={referralFilter}
                          onChange={(e) => setReferralFilter(e.target.value)}
                          className="bg-slate-50 border-none text-xs font-black uppercase text-slate-600 py-2 pl-3 pr-8 rounded-lg cursor-pointer outline-none focus:ring-0"
                        >
                          <option value="All Select">All Status</option>
                          <option value="Pending">Pending</option>
                          <option value="Completed">Completed</option>
                          <option value="Paid Out">Paid Out</option>
                        </select>
                      </div>
                    </div>
                    <div className="overflow-x-auto no-scrollbar">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-slate-50 text-left">
                            <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Referrer</th>
                            <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Type</th>
                            <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Referred Client</th>
                            <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Added</th>
                            <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Reward (£)</th>
                            <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Status</th>
                            <th className="py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right pr-2">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {referrals
                            .filter((r) => referralFilter === 'All Select' || r.status === referralFilter)
                            .map((r) => (
                              <tr key={r.id} className="group hover:bg-slate-50/50 transition-colors">
                                <td className="py-4 pl-2">
                                  <div className="font-bold text-sm text-slate-900">{r.referrerName}</div>
                                </td>
                                <td className="py-4">
                                  <span
                                    className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${r.referrerType === 'staff' ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'
                                      }`}
                                  >
                                    {r.referrerType}
                                  </span>
                                </td>
                                <td className="py-4">
                                  <div className="font-bold text-sm text-slate-600">{r.referredClientName}</div>
                                </td>
                                <td className="py-4">
                                  <div className="text-xs font-bold text-slate-400">{new Date(r.dateReferred).toLocaleDateString()}</div>
                                </td>
                                <td className="py-4">
                                  <div className="font-black text-slate-900 text-sm">£{Number(r.rewardAmount || 0).toFixed(2)}</div>
                                </td>
                                <td className="py-4">
                                  <span
                                    className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-wider ${r.status === 'Paid Out'
                                        ? 'bg-green-50 text-green-600'
                                        : r.status === 'Completed'
                                          ? 'bg-blue-50 text-blue-600'
                                          : 'bg-amber-50 text-amber-600'
                                      }`}
                                  >
                                    {r.status}
                                  </span>
                                </td>
                                <td className="py-4 text-right pr-2">
                                  <button
                                    onClick={() => setEditingReferral(r)}
                                    className="p-2 bg-slate-50 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors shadow-sm"
                                    title="Edit Reward"
                                  >
                                    <Edit2 className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          {referrals.filter((r) => referralFilter === 'All Select' || r.status === referralFilter).length === 0 && (
                            <tr className="border-none">
                              <td colSpan={7} className="py-8 text-center text-xs font-bold text-slate-400 italic">
                                No referrals found matching this filter
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {marketingSection === 'loyalty' && (
                  <div className="space-y-6">
                    <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100/50 p-5 sm:p-8">
                      <h4 className="text-xl font-black text-slate-900 mb-6">Loyalty monitoring (customers + staff referrals)</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total customers</p>
                          <p className="text-3xl font-black text-slate-900 mt-1 tabular-nums">{loyaltyOverview.totalCustomers}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Customers with points</p>
                          <p className="text-3xl font-black text-slate-900 mt-1 tabular-nums">{loyaltyOverview.customersWithPoints}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total loyalty points</p>
                          <p className="text-3xl font-black text-slate-900 mt-1 tabular-nums">{loyaltyOverview.totalPoints}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100/50 p-5 sm:p-8">
                        <h5 className="text-lg font-black text-slate-900 mb-4">Top customers by loyalty points</h5>
                        {loyaltyOverview.topCustomers.length === 0 ? (
                          <p className="text-sm font-bold text-slate-400">No loyalty data yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {loyaltyOverview.topCustomers.map((u) => (
                              <div key={u.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-black text-slate-900 truncate">{u.name}</p>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 truncate">{u.email}</p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-black text-slate-900 tabular-nums">{u.loyaltyPoints} pts</p>
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{u.referralCode || 'No code'}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100/50 p-5 sm:p-8">
                        <h5 className="text-lg font-black text-slate-900 mb-4">Top referrers (staff + customers)</h5>
                        {loyaltyOverview.topReferrers.length === 0 ? (
                          <p className="text-sm font-bold text-slate-400">No referral activity yet.</p>
                        ) : (
                          <div className="space-y-3">
                            {loyaltyOverview.topReferrers.map((r) => (
                              <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-black text-slate-900 truncate">{r.name}</p>
                                  <p className={`inline-block mt-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${String(r.role).toLowerCase() === 'staff' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                                    {String(r.role).toLowerCase() === 'staff' ? 'staff' : 'customer'}
                                  </p>
                                </div>
                                <p className="font-black text-slate-900 tabular-nums shrink-0">{r.referrals} referrals</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {marketingSection === 'promos' && (
                  <div className="space-y-6">
                    <div className="flex justify-between items-center flex-wrap gap-4">
                      <h4 className="text-xl font-black text-slate-900">Active promo codes</h4>
                      <button
                        onClick={() => setIsCreatingDiscount(true)}
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                      >
                        <Plus className="w-5 h-5 mr-2 inline" /> New code
                      </button>
                    </div>
                    {!discounts || discounts.length === 0 ? (
                      <div className="text-slate-400 text-sm font-bold bg-slate-50 p-6 rounded-2xl text-center">No promo codes yet.</div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {discounts.map((d) => (
                          <div key={d.id} className="bg-white p-6 rounded-[2rem] border border-slate-100 relative group">
                            <div className="absolute top-6 right-6">
                              <button
                                onClick={() =>
                                  window.confirm('Delete this promo code?') &&
                                  apiAdmin.deleteDiscount(d.id).then(() => setDiscounts(discounts.filter((x) => x.id !== d.id)))
                                }
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="text-2xl font-black text-blue-600 tracking-tight mb-2">{d.code}</div>
                            <div className="text-sm font-bold text-slate-700">{d.type === 'percentage' ? `${d.value}% OFF` : `£${d.value} OFF`}</div>
                            <div className="text-[10px] font-black uppercase text-slate-400 mt-4 tracking-widest">
                              Used {d.usedCount} times {d.usageLimit ? `/ ${d.usageLimit}` : ''}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="pt-6 border-t border-slate-100 space-y-6">
                      <div className="flex justify-between items-center flex-wrap gap-4">
                        <div>
                          <h4 className="text-xl font-black text-slate-900">Seasonal promotions</h4>
                          <p className="text-sm text-slate-500 font-medium mt-1">
                            Time-limited banners shown on the website between the dates you set.
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setEditingPromo(null);
                            setPromoForm(EMPTY_PROMO_FORM);
                            setShowPromoForm(true);
                          }}
                          className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                        >
                          <Plus className="w-5 h-5 mr-2 inline" /> New promotion
                        </button>
                      </div>

                      {showPromoForm && (
                        <div className="bg-slate-50 rounded-2xl p-6 space-y-4">
                          <h5 className="font-black text-slate-900">{editingPromo ? 'Edit promotion' : 'Create promotion'}</h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                              value={promoForm.title}
                              onChange={(e) => setPromoForm((f) => ({ ...f, title: e.target.value }))}
                              placeholder="Internal title *"
                              className="px-4 py-3 rounded-xl border border-slate-200 font-medium outline-none focus:border-blue-400"
                            />
                            <input
                              value={promoForm.bannerText}
                              onChange={(e) => setPromoForm((f) => ({ ...f, bannerText: e.target.value }))}
                              placeholder="Banner text shown on the site"
                              className="px-4 py-3 rounded-xl border border-slate-200 font-medium outline-none focus:border-blue-400"
                            />
                            <input
                              value={promoForm.discountCode}
                              onChange={(e) => setPromoForm((f) => ({ ...f, discountCode: e.target.value.toUpperCase() }))}
                              placeholder="Linked promo code (optional)"
                              className="px-4 py-3 rounded-xl border border-slate-200 font-medium uppercase outline-none focus:border-blue-400"
                            />
                            <input
                              value={promoForm.discountPercent}
                              onChange={(e) => setPromoForm((f) => ({ ...f, discountPercent: e.target.value }))}
                              type="number"
                              min={0}
                              max={100}
                              placeholder="Discount % (optional)"
                              className="px-4 py-3 rounded-xl border border-slate-200 font-medium outline-none focus:border-blue-400"
                            />
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                              Starts
                              <input
                                value={promoForm.startDate}
                                onChange={(e) => setPromoForm((f) => ({ ...f, startDate: e.target.value }))}
                                type="date"
                                className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 font-medium text-slate-900 normal-case tracking-normal outline-none focus:border-blue-400"
                              />
                            </label>
                            <label className="text-xs font-black uppercase tracking-widest text-slate-400">
                              Ends
                              <input
                                value={promoForm.endDate}
                                onChange={(e) => setPromoForm((f) => ({ ...f, endDate: e.target.value }))}
                                type="date"
                                className="mt-1 w-full px-4 py-3 rounded-xl border border-slate-200 font-medium text-slate-900 normal-case tracking-normal outline-none focus:border-blue-400"
                              />
                            </label>
                          </div>
                          <textarea
                            value={promoForm.description}
                            onChange={(e) => setPromoForm((f) => ({ ...f, description: e.target.value }))}
                            placeholder="Internal notes"
                            rows={2}
                            className="w-full px-4 py-3 rounded-xl border border-slate-200 font-medium outline-none focus:border-blue-400"
                          />
                          <div className="flex flex-wrap gap-6 text-sm font-bold text-slate-700">
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={promoForm.showOnHomepage}
                                onChange={(e) => setPromoForm((f) => ({ ...f, showOnHomepage: e.target.checked }))}
                              />
                              Show on homepage
                            </label>
                            <label className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={promoForm.showOnBooking}
                                onChange={(e) => setPromoForm((f) => ({ ...f, showOnBooking: e.target.checked }))}
                              />
                              Show on booking page
                            </label>
                          </div>
                          {promoError && <div className="text-sm font-bold text-red-600">{promoError}</div>}
                          <div className="flex gap-3">
                            <button
                              onClick={savePromotion}
                              disabled={promoSaving}
                              className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all disabled:opacity-60"
                            >
                              {promoSaving ? 'Saving…' : editingPromo ? 'Update promotion' : 'Create promotion'}
                            </button>
                            <button
                              onClick={() => {
                                setShowPromoForm(false);
                                setPromoError('');
                              }}
                              className="px-6 py-3 rounded-xl font-bold border border-slate-200 text-slate-600 hover:bg-slate-100"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}

                      {promosLoading ? (
                        <div className="text-slate-400 text-sm font-bold">Loading promotions…</div>
                      ) : promotionsList.length === 0 ? (
                        <div className="text-slate-400 text-sm font-bold bg-slate-50 p-6 rounded-2xl text-center">
                          No seasonal promotions yet.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {promotionsList.map((p) => {
                            const today = new Date().toISOString().slice(0, 10);
                            const live = !!p.active && p.startDate <= today && p.endDate >= today;
                            return (
                              <div
                                key={p.id}
                                className="bg-white p-5 rounded-2xl border border-slate-100 flex flex-col md:flex-row md:items-center gap-4"
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                    <span className="font-black text-slate-900">{p.title}</span>
                                    {p.discountCode && (
                                      <span className="text-[10px] font-black uppercase tracking-widest bg-blue-50 text-blue-600 px-2 py-1 rounded-full">
                                        {p.discountCode}
                                      </span>
                                    )}
                                    {p.discountPercent ? (
                                      <span className="text-xs font-bold text-slate-500">{p.discountPercent}% off</span>
                                    ) : null}
                                  </div>
                                  <div className="text-[10px] font-black uppercase text-slate-400 mt-2 tracking-widest">
                                    {p.startDate} → {p.endDate} {live ? '· Live now' : '· Not showing'}
                                  </div>
                                  {p.bannerText && (
                                    <div className="text-sm text-slate-600 font-medium mt-2 truncate">{p.bannerText}</div>
                                  )}
                                </div>
                                <div className="flex gap-2 shrink-0">
                                  <button
                                    onClick={() => {
                                      setEditingPromo(p);
                                      setPromoForm({
                                        title: p.title || '',
                                        description: p.description || '',
                                        bannerText: p.bannerText || '',
                                        discountCode: p.discountCode || '',
                                        discountPercent: p.discountPercent == null ? '' : String(p.discountPercent),
                                        startDate: p.startDate || '',
                                        endDate: p.endDate || '',
                                        showOnHomepage: p.showOnHomepage !== false,
                                        showOnBooking: p.showOnBooking !== false,
                                      });
                                      setPromoError('');
                                      setShowPromoForm(true);
                                    }}
                                    className="px-4 py-2 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => togglePromotionActive(p)}
                                    className="px-4 py-2 rounded-lg text-xs font-bold border border-slate-200 text-slate-600 hover:bg-slate-50"
                                  >
                                    {p.active ? 'Deactivate' : 'Activate'}
                                  </button>
                                  <button
                                    onClick={() => deletePromotion(p.id)}
                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                    aria-label="Delete promotion"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {marketingSection === 'website' && (
                  <div className="space-y-4">
                    <h4 className="text-xl font-black text-slate-900">Website content</h4>
                    <WebsiteContentManager />
                  </div>
                )}

                {marketingSection === 'gallery' && (
                  <div className="space-y-4">
                    <h4 className="text-xl font-black text-slate-900">Gallery</h4>
                    <GalleryManager />
                  </div>
                )}

                {marketingSection === 'blog' && (
                  <div className="space-y-4">
                    <h4 className="text-xl font-black text-slate-900">Blog</h4>
                    <BlogManager />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'customerInvoices' && (
          <CustomerInvoicesPanel
            invoices={customerInvoicesList}
            bookings={bookings}
            services={services}
            extraServices={extraServices}
            onRefresh={async () => {
              const data = await apiAdmin.getCustomerInvoices().catch(() => []);
              setCustomerInvoicesList(Array.isArray(data) ? data : []);
            }}
            showFlyer={showFlyer}
          />
        )}

        {activeTab === 'services' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">Services</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                Main service types and optional add-ons — pick a section
              </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">
              <AdminInnerSubNav
                ariaLabel="Service sections"
                items={SERVICES_NAV}
                active={servicesSection}
                onChange={setServicesSection}
              />

              <div className="flex-1 min-w-0 space-y-8 w-full">
                {servicesSection === 'catalog' && (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                      <div>
                        <h4 className="text-xl font-black text-slate-900">Main services</h4>
                        <p className="text-xs font-bold text-slate-500 mt-1">Base rates, pricing model, booking flow, and active status.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCreatingService(true)}
                        className="inline-flex items-center justify-center gap-2 shrink-0 bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-200"
                      >
                        <Plus className="w-5 h-5" />
                        Add service type
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {(services || []).length === 0 ? (
                        <div className="col-span-full rounded-[2rem] border border-dashed border-slate-200 bg-slate-50/80 py-16 px-8 text-center">
                          <Layers className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                          <p className="font-black text-slate-800 text-lg mb-1">No services yet</p>
                          <p className="text-sm text-slate-500 font-medium mb-6">
                            Add your first service type. Base rate and active status can be edited anytime.
                          </p>
                          <button
                            type="button"
                            onClick={() => setIsCreatingService(true)}
                            className="inline-flex items-center gap-2 bg-green-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-green-700 transition-all shadow-lg shadow-green-200"
                          >
                            <Plus className="w-5 h-5" /> Add service
                          </button>
                        </div>
                      ) : (
                        (services || []).map((s) => (
                          <div
                            key={s.id}
                            className={`bg-white p-5 sm:p-8 rounded-[2.5rem] border transition-all relative group ${s.active ? 'border-slate-100 hover:border-blue-200' : 'border-slate-100 opacity-80'
                              }`}
                          >
                            <div className="flex justify-between items-start mb-6 gap-3">
                              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shrink-0">
                                <Layers className="w-6 h-6" />
                              </div>
                              <button
                                type="button"
                                onClick={() => handleToggleServiceActive(s)}
                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${s.active ? 'bg-green-50 text-green-600 hover:bg-green-100' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                  }`}
                                aria-label={s.active ? `Disable ${s.name}` : `Enable ${s.name}`}
                                title={s.active ? 'Click to disable' : 'Click to enable'}
                              >
                                <span
                                  className={`relative inline-block w-7 h-4 rounded-full transition-colors ${s.active ? 'bg-green-500' : 'bg-slate-300'
                                    }`}
                                >
                                  <span
                                    className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${s.active ? 'translate-x-3' : 'translate-x-0'
                                      }`}
                                  />
                                </span>
                                {s.active ? 'Active' : 'Disabled'}
                              </button>
                            </div>
                            <h4 className="font-black text-lg text-slate-900 mb-2">{s.name}</h4>
                            <div className="space-y-2 mb-6">
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-400 font-bold">Base Rate</span>
                                <span className="font-black text-slate-900">£{Number(s.baseRate).toFixed(2)}</span>
                              </div>
                              {s.londonRate != null && Number(s.londonRate) > 0 && (
                                <div className="flex justify-between text-sm">
                                  <span className="text-slate-400 font-bold">London Rate</span>
                                  <span className="font-black text-blue-700">£{Number(s.londonRate).toFixed(2)}</span>
                                </div>
                              )}
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-400 font-bold">Pricing Model</span>
                                <span className="font-black text-slate-900 capitalize">
                                  {(s.pricingModel === 'flat' ? 'flat rate' : s.pricingModel)?.replace(/_/g, ' ') || 'Hourly'}
                                </span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-400 font-bold">Trigger</span>
                                <span className="font-black text-slate-900 capitalize">
                                  {(s.bookingFlow?.trigger || 'standard').replace(/_/g, ' ')}
                                </span>
                              </div>
                            </div>
                            <div className="flex space-x-2">
                              <button
                                type="button"
                                onClick={() => setEditingService(s)}
                                className="flex-1 py-3 rounded-xl bg-slate-50 text-slate-600 font-bold hover:bg-blue-50 hover:text-blue-600 transition-all"
                              >
                                Edit Config
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteService(s.id)}
                                className="p-3 bg-red-50 rounded-xl text-red-500 hover:bg-red-100 transition-all"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}

                {servicesSection === 'addons' && (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                      <div>
                        <h4 className="text-xl font-black text-slate-900">Extra add-ons</h4>
                        <p className="text-xs font-bold text-slate-500 mt-1">Optional upsells: price, duration, and fixed vs hourly billing.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsCreatingExtra(true)}
                        className="inline-flex items-center justify-center gap-2 shrink-0 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                      >
                        <Plus className="w-5 h-5" />
                        New extra
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {(extraServices || []).length === 0 ? (
                        <div className="col-span-full rounded-[2rem] border border-dashed border-slate-200 bg-slate-50/80 py-12 px-8 text-center">
                          <Package className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                          <p className="font-black text-slate-800 mb-1">No extra add-ons</p>
                          <p className="text-sm text-slate-500 font-medium mb-6">
                            Create extras customers can add to a booking (price, duration, billing type).
                          </p>
                          <button
                            type="button"
                            onClick={() => setIsCreatingExtra(true)}
                            className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-200"
                          >
                            <Plus className="w-5 h-5" /> New extra
                          </button>
                        </div>
                      ) : (
                        (extraServices || []).map((ex) => (
                          <div
                            key={ex.id}
                            className="bg-white p-6 rounded-[2rem] border border-slate-100 hover:border-blue-200 transition-all group relative"
                          >
                            <div className="flex justify-between items-start mb-4">
                              <div className="font-black text-slate-900">{ex.name}</div>
                              <div className="font-black text-blue-600">£{Number(ex.price).toFixed(2)}</div>
                            </div>
                            <div className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-4">
                              {ex.type || 'Fixed'} • {ex.duration != null ? `${ex.duration} m` : 'N/A'}
                            </div>
                            <div className="flex space-x-2">
                              <button
                                type="button"
                                onClick={() => setEditingExtra(ex)}
                                className="flex-1 py-2 bg-slate-50 rounded-lg text-xs font-bold text-slate-600 hover:bg-blue-50 hover:text-blue-600"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExtra(ex.id)}
                                className="p-2 bg-red-50 rounded-lg text-red-500 hover:bg-red-100"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'staff' && (
          <div className="animate-in fade-in slide-in-from-bottom-4">
            {isCreatingStaff || isEditingStaff ? (
              <div className="max-w-4xl mx-auto bg-white rounded-[2.5rem] shadow-sm border border-slate-100/50 p-5 sm:p-8 md:p-12">
                <div className="flex justify-between items-center mb-8 pb-6 border-b border-slate-100">
                  <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                    {isCreatingStaff ? 'Add Team Account' : 'Edit Staff Member'}
                  </h3>
                  <button onClick={() => { setIsCreatingStaff(false); setIsEditingStaff(false); }} className="px-6 py-3 bg-slate-50 text-slate-600 rounded-xl font-bold hover:bg-slate-100 transition-colors flex items-center">
                    <X className="w-5 h-5 mr-2" /> Cancel
                  </button>
                </div>

                <form onSubmit={isCreatingStaff ? handleCreateStaff : handleUpdateStaff} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <BusinessInputField
                      label="Full Name"
                      value={isCreatingStaff ? newStaff.name : (editingStaff?.name || '')}
                      onChange={v => isCreatingStaff ? setNewStaff({ ...newStaff, name: v }) : (editingStaff && setEditingStaff({ ...editingStaff, name: v }))}
                    />
                    <BusinessInputField
                      label="Email Address"
                      value={isCreatingStaff ? newStaff.email : (editingStaff?.email || '')}
                      onChange={v => isCreatingStaff ? setNewStaff({ ...newStaff, email: v }) : (editingStaff && setEditingStaff({ ...editingStaff, email: v }))}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Role</label>
                      <select
                        className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-sm text-foreground"
                        value={isCreatingStaff ? newStaff.role : (editingStaff?.role || 'Cleaner')}
                        onChange={e => isCreatingStaff ? setNewStaff({ ...newStaff, role: e.target.value as any }) : (editingStaff && setEditingStaff({ ...editingStaff, role: e.target.value as any }))}
                      >
                        {(canManageAdminScopes
                          ? ['Cleaner', 'Supervisor', 'Manager', 'Admin', 'Superadmin']
                          : ['Cleaner', 'Supervisor', 'Manager']
                        ).map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <BusinessInputField
                      label={isCreatingStaff ? "Password" : "New Password (Optional)"}
                      value={isCreatingStaff ? newStaff.password : editingPassword}
                      onChange={v => isCreatingStaff ? setNewStaff({ ...newStaff, password: v }) : setEditingPassword(v)}
                    />
                  </div>

                  {isCreatingStaff && !['Admin', 'Superadmin'].includes(String(newStaff.role)) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <BusinessInputField
                        label="Hourly Rate (£)"
                        value={newStaff.hourlyRate}
                        onChange={v => setNewStaff({ ...newStaff, hourlyRate: v })}
                      />
                    </div>
                  )}

                  {isCreatingStaff && String(newStaff.role) === 'Admin' && canManageAdminScopes && (
                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                      <label className="text-[11px] font-black uppercase text-slate-500 tracking-widest ml-1">
                        Admin menu access
                      </label>
                      <p className="text-xs font-medium text-slate-500">
                        Select which admin menu sections this account can monitor and use.
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {ADMIN_PERMISSIONABLE_TABS.map((tab) => {
                          const checked = newStaff.adminTabs.includes(tab);
                          return (
                            <label
                              key={tab}
                              className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${checked ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'
                                }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const next = e.target.checked
                                    ? Array.from(new Set([...newStaff.adminTabs, tab]))
                                    : newStaff.adminTabs.filter((t) => t !== tab);
                                  setNewStaff({ ...newStaff, adminTabs: next });
                                }}
                              />
                              {ADMIN_TAB_LABELS[tab]}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {isEditingStaff && editingStaff && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Hourly Rate (£)</label>
                        <input
                          type="number"
                          value={editingStaff.hourlyRate || ''}
                          onChange={e => setEditingStaff({ ...editingStaff, hourlyRate: parseFloat(e.target.value) })}
                          className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-sm text-foreground"
                        />
                      </div>
                      <div className="space-y-3">
                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Status</label>
                        <select
                          className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-sm text-foreground"
                          value={editingStaff.status}
                          onChange={e => setEditingStaff({ ...editingStaff, status: e.target.value })}
                        >
                          {['Active', 'Inactive'].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      </div>
                    </div>
                  )}

                  {!['Admin', 'Superadmin'].includes(String(isCreatingStaff ? newStaff.role : editingStaff?.role || '')) && (
                    <div className="space-y-3">
                      <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Skills (Comma Separated)</label>
                      <input
                        className="w-full bg-card border-2 border-input rounded-[1.5rem] p-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-sm text-foreground"
                        placeholder="e.g. Deep Clean, Carpet, Oven"
                        value={isCreatingStaff ? (newStaff as any)._skillsRaw ?? newStaff.skills.join(', ') : (editingStaff as any)?._skillsRaw ?? (editingStaff?.skills || []).join(', ')}
                        onChange={e => {
                          const raw = e.target.value;
                          if (isCreatingStaff) {
                            setNewStaff(prev => ({ ...prev, _skillsRaw: raw, skills: raw.split(',').map(s => s.trim()).filter(Boolean) }));
                          } else if (editingStaff) {
                            setEditingStaff({ ...editingStaff, _skillsRaw: raw, skills: raw.split(',').map(s => s.trim()).filter(Boolean) } as any);
                          }
                        }}
                        onBlur={() => {
                          if (isCreatingStaff) {
                            setNewStaff(prev => { const { _skillsRaw, ...rest } = prev as any; return { ...rest, skills: (prev.skills || []) }; });
                          } else if (editingStaff) {
                            setEditingStaff(prev => { if (!prev) return prev; const { _skillsRaw, ...rest } = prev as any; return { ...rest, skills: (prev.skills || []) }; });
                          }
                        }}
                      />
                    </div>
                  )}

                  <div className="pt-8 text-right">
                    <button
                      type="submit"
                      disabled={isStaffFormSubmitting}
                      className="px-10 py-5 bg-slate-900 text-white rounded-[1.5rem] font-black text-lg hover:bg-blue-600 transition-colors shadow-xl inline-flex items-center disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <CheckCircle2 className="w-5 h-5 mr-3" />
                      {isStaffFormSubmitting
                        ? 'Saving…'
                        : isCreatingStaff
                          ? 'Create Account'
                          : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="space-y-10">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="text-3xl font-black text-slate-900 tracking-tight">Staff Management</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Manage team, roles & skills in real-time</p>
                  </div>
                  <button onClick={() => setIsCreatingStaff(true)} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors shadow-lg shadow-blue-200">Add Account</button>
                </div>
                {createdCredentials && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Credentials Sent</div>
                      <p className="text-sm font-bold text-emerald-900 mt-1">
                        {createdCredentials.role} • {createdCredentials.email}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={async () => {
                        const value = `Email: ${createdCredentials.email}\nPassword: ${createdCredentials.password}\nRole: ${createdCredentials.role}`;
                        await navigator.clipboard.writeText(value);
                        showFlyer('Credentials copied to clipboard.', 'success');
                      }}
                      className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700"
                    >
                      Copy Credentials
                    </button>
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {(staffList || []).map(s => (
                    <div key={s.id} className="bg-white p-5 sm:p-8 rounded-[2.5rem] border border-slate-100 relative group hover:border-blue-200 transition-all cursor-pointer" onClick={() => setProfileStaff(s)}>
                      <div className="absolute top-8 right-8 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => { e.stopPropagation(); setEditingStaff(s); setEditingPassword(''); setIsEditingStaff(true); }} className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-blue-600"><Edit2 className="w-4 h-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); handleDeleteStaff(s.id); }} className="p-2 bg-slate-50 rounded-xl text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                      <div className="flex items-center space-x-4 mb-6">
                        <div className="w-16 h-16 bg-slate-100 rounded-[1.5rem] flex items-center justify-center font-black text-slate-400 text-xl">{s.name.charAt(0)}</div>
                        <div>
                          <div className="font-black text-slate-900 text-lg leading-tight">{s.name}</div>
                          <div className="text-xs text-slate-400 font-bold mt-1">{s.email}</div>
                          <div className="text-xs text-blue-600 font-bold uppercase tracking-widest mt-1">{s.role}</div>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {(s.skills as string[] || []).map((skill, i) => (
                            <span key={i} className="px-3 py-1 bg-slate-50 rounded-lg text-[10px] font-bold text-slate-500 uppercase tracking-wider">{skill}</span>
                          ))}
                        </div>
                        <div className="pt-4 border-t border-slate-50 flex justify-between items-center text-xs font-bold text-slate-400">
                          <span>Rate: £{s.hourlyRate}/hr</span>
                          <span className={s.status === 'Active' ? 'text-green-500' : 'text-slate-300'}>{s.status}</span>
                        </div>
                        <div className="pt-4 border-t border-slate-50">
                          <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Availability</div>
                          <div className="flex space-x-1.5">
                            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => {
                              const isActive = s.availability && s.availability[day]?.active;
                              return (
                                <div
                                  key={day}
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black shadow-sm transition-all ${isActive ? 'bg-blue-500 text-white shadow-blue-200' : 'bg-slate-100 text-slate-400 opacity-50'}`}
                                  title={isActive ? `${s.availability[day].start} - ${s.availability[day].end}` : 'Off'}
                                >
                                  {day.charAt(0)}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                {canManageAdminScopes && (
                  <div className="mt-8 bg-white rounded-[2rem] border border-slate-100 p-6">
                    <h4 className="text-xl font-black text-slate-900">Admin menu access control</h4>
                    <p className="text-xs font-medium text-slate-500 mt-1">
                      Update what each admin account can see in the admin sidebar.
                    </p>
                    <div className="mt-4 space-y-4">
                      {adminAccounts.length === 0 ? (
                        <p className="text-sm font-bold text-slate-400">No admin accounts found.</p>
                      ) : (
                        adminAccounts.map((acc) => {
                          const currentTabs = Array.isArray(acc.adminTabs) ? acc.adminTabs : [];
                          return (
                            <div key={acc.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                              <div className="mb-3">
                                <p className="font-black text-slate-900">{acc.name}</p>
                                <p className="text-xs font-bold text-slate-500">{acc.email}</p>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                {ADMIN_PERMISSIONABLE_TABS.map((tab) => {
                                  const checked = currentTabs.includes(tab);
                                  return (
                                    <label
                                      key={`${acc.id}-${tab}`}
                                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${checked ? 'border-blue-300 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'
                                        }`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={(e) => {
                                          isEditingAdminScopesRef.current = true;
                                          const next = e.target.checked
                                            ? Array.from(new Set([...currentTabs, tab]))
                                            : currentTabs.filter((t) => t !== tab);
                                          setAdminAccounts((prev) =>
                                            prev.map((a) => (a.id === acc.id ? { ...a, adminTabs: next } : a))
                                          );
                                        }}
                                      />
                                      {ADMIN_TAB_LABELS[tab]}
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="mt-3 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateAdminScope(acc.id, (acc.adminTabs || []) as AdminTab[])}
                                  className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase tracking-widest text-white hover:bg-slate-800"
                                >
                                  Save access
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}

                <AdminStaffChat api={apiAdmin} showFlyer={showFlyer} staffList={staffList} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'staffInvoices' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Staff weekly invoices</h3>
                <p className="text-sm font-medium text-slate-500 mt-1 max-w-2xl">
                  Staff submit these from <span className="font-bold text-slate-700">Staff portal → Earnings (invoice)</span> using &quot;Submit Weekly Invoice&quot;.
                  Approve or reject here; pending items also show a count on the sidebar.
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Pending</p>
                <p className="text-2xl font-black text-amber-600">{pendingStaffInvoiceCount}</p>
              </div>
            </div>

            {staffPayInvoices.length === 0 ? (
              <div className="bg-white rounded-[2rem] border border-slate-100 p-6 sm:p-12 text-center text-slate-400 font-bold">
                No staff invoices submitted yet.
              </div>
            ) : (
              <div className="space-y-4">
                {staffPayInvoices.map((inv) => {
                  const jobsArr = Array.isArray(inv.jobs) ? inv.jobs : [];
                  const bank = inv.bankDetails as { bankName?: string; accountNumber?: string; sortCode?: string } | null;
                  const expanded = expandedStaffInvoiceId === inv.id;
                  const staffProfile = staffList.find((s) => Number(s.id) === Number(inv.staffId));
                  return (
                    <div key={inv.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden">
                      <div className="p-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-slate-900 text-lg">{inv.staffName || `Staff #${inv.staffId}`}</span>
                            <span
                              className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${inv.status === 'Approved'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : inv.status === 'Rejected'
                                    ? 'bg-red-100 text-red-700'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                            >
                              {inv.status}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-400 mt-1">{inv.weekLabel}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                            Submitted {inv.createdAt ? new Date(inv.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-6 items-center">
                          <div>
                            <p className="text-[10px] font-black uppercase text-slate-400">Amount</p>
                            <p className="text-xl font-black text-slate-900">£{Number(inv.totalAmount || 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase text-slate-400">Hours</p>
                            <p className="text-xl font-black text-slate-900">{Number(inv.weekTotalHours || 0).toFixed(2)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase text-slate-400">Jobs</p>
                            <p className="text-xl font-black text-slate-900">{inv.weekJobCount}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setExpandedStaffInvoiceId(expanded ? null : inv.id)}
                              className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-200"
                            >
                              {expanded ? 'Hide detail' : 'View jobs'}
                            </button>
                            {inv.status === 'Pending' && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleStaffInvoiceStatus(inv.id, 'Approved')}
                                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-700"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleStaffInvoiceStatus(inv.id, 'Rejected')}
                                  className="px-4 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-widest hover:bg-red-700"
                                >
                                  Reject
                                </button>
                              </>
                            )}
                            <button
                              type="button"
                              onClick={() => void handleDeleteStaffInvoice(inv)}
                              title="Delete this invoice"
                              aria-label={`Delete invoice from ${inv.staffName || 'staff'}`}
                              className="px-3 py-2 rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {inv.status === 'Pending' || editingStaffInvoiceNoteId === inv.id ? (
                        <div className="px-6 pb-4">
                          <label htmlFor={`staff-invoice-note-${inv.id}`} className="text-[10px] font-black uppercase text-slate-400 tracking-widest">
                            Note to {inv.staffName || 'the cleaner'} (they can see this){inv.status === 'Pending' ? ', saved on approve/reject or with Save note' : ''}
                          </label>
                          <textarea
                            id={`staff-invoice-note-${inv.id}`}
                            maxLength={2000}
                            className="mt-2 w-full rounded-2xl border border-slate-200 p-4 text-sm font-medium text-slate-800 min-h-[72px]"
                            placeholder="e.g. Paid via bank transfer, ref INV-0412. Tuesday job paid at 2h, not 3h."
                            value={invoiceDecisionNotes[inv.id] ?? inv.adminNotes ?? ''}
                            onChange={(e) => setInvoiceDecisionNotes((prev) => ({ ...prev, [inv.id]: e.target.value }))}
                          />
                          <div className="mt-2 flex justify-end gap-2">
                            {editingStaffInvoiceNoteId === inv.id && (
                              <button
                                type="button"
                                onClick={() => {
                                  clearStaffInvoiceDraft(inv.id);
                                  setEditingStaffInvoiceNoteId(null);
                                }}
                                className="px-4 py-2 rounded-xl text-xs font-black text-slate-500 hover:bg-slate-100"
                              >
                                Cancel
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={
                                savingStaffInvoiceNoteId === inv.id ||
                                (invoiceDecisionNotes[inv.id] ?? inv.adminNotes ?? '').trim() === (inv.adminNotes ?? '').trim()
                              }
                              onClick={() => void handleStaffInvoiceNote(inv.id)}
                              className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-black disabled:opacity-40"
                            >
                              {savingStaffInvoiceNoteId === inv.id ? 'Saving...' : 'Save note'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="px-6 pb-4 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[10px] font-black uppercase text-slate-400">Note to cleaner</p>
                            <p className="text-sm font-medium text-slate-600 mt-1 whitespace-pre-line break-words">
                              {inv.adminNotes || <span className="text-slate-400 italic">No note</span>}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setEditingStaffInvoiceNoteId(inv.id)}
                            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-600 hover:bg-slate-50"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> {inv.adminNotes ? 'Edit note' : 'Add note'}
                          </button>
                        </div>
                      )}

                      {expanded && (
                        <div className="border-t border-slate-100 bg-slate-50/80 p-6 space-y-4">
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
                            jobs={jobsArr as any[]}
                            bankDetails={bank}
                            staff={{
                              name: staffProfile?.name || inv.staffName || `Staff #${inv.staffId}`,
                              email: staffProfile?.email || null,
                              phone: (staffProfile as any)?.phone || null,
                              address: (staffProfile as any)?.address || null,
                              postcode: (staffProfile as any)?.postcode || null,
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="pb-4 border-b border-slate-100">
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">Platform Settings</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                Choose a section - no long scrolling
              </p>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">
              <AdminInnerSubNav
                ariaLabel="Settings sections"
                items={SETTINGS_NAV}
                active={settingsSection}
                onChange={(id) => {
                  setSettingsSection(id);
                  if (id === 'business') setBusinessProfileSub('company');
                }}
              />

              <div className="flex-1 min-w-0 w-full space-y-8">
                {settingsSection === 'seo' && <SeoSettingsManager />}

                {settingsSection === 'ai' && <AiAssistantSettingsPanel />}

                {settingsSection === 'pricing' && <PricingPageSettingsPanel />}

                {settingsSection === 'website' && (
                  <div className="space-y-4">
                    <h4 className="text-xl font-black text-slate-900">Website advert cards</h4>
                    <WebsiteContentManager />
                  </div>
                )}

                {settingsSection === 'business' && (
                  <div className="space-y-6 w-full">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div>
                        <h4 className="text-xl font-black text-slate-900">Business profile</h4>
                        <p className="text-sm text-slate-500 font-medium mt-1 max-w-2xl">
                          Use the tabs below for a full-width layout. Each section has short guidance under the fields. Saving once updates company, social, bank, deposit, and cancellation settings together.
                        </p>
                      </div>
                      <div className="flex flex-wrap p-1 rounded-2xl bg-slate-200/70 border border-slate-200 gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setBusinessProfileSub('company')}
                          className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${businessProfileSub === 'company' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                          Company &amp; contact
                        </button>
                        <button
                          type="button"
                          onClick={() => setBusinessProfileSub('social')}
                          className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${businessProfileSub === 'social' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                          Social profiles
                        </button>
                        <button
                          type="button"
                          onClick={() => setBusinessProfileSub('payments')}
                          className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${businessProfileSub === 'payments' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                            }`}
                        >
                          Bank &amp; policies
                        </button>
                      </div>
                    </div>

                    {businessProfileSub === 'company' && (
                      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100/50 p-6 sm:p-10 lg:p-12 w-full">
                        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-5 sm:p-6 mb-8 max-w-3xl">
                          <h5 className="text-sm font-black text-blue-950 flex items-center gap-2">
                            <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
                            Public company &amp; contact details
                          </h5>
                          <p className="text-sm text-blue-900/80 font-medium mt-2 leading-relaxed">
                            These values power the admin header, customer-facing confirmations, invoices, and default notification targets. Keep the support email accurate so booking alerts and Brevo flows reach the right inbox.
                          </p>
                        </div>
                        <div className="space-y-8 max-w-3xl">
                          <BusinessInputField
                            label="Company name"
                            hint="Shown in the admin sidebar, client portal, emails, and PDF-style invoice headers."
                            value={businessSettings.companyName || ''}
                            onChange={(v) => setBusinessSettings({ ...businessSettings, companyName: v })}
                          />
                          <BusinessInputField
                            label="Support email"
                            hint="Primary business inbox. Used for contact forms and as the fallback admin booking address when ADMIN_BOOKING_EMAIL is not set in the server environment."
                            value={businessSettings.email || ''}
                            onChange={(v) => setBusinessSettings({ ...businessSettings, email: v })}
                          />
                          <BusinessInputField
                            label="Support phone"
                            hint="Displayed on invoices, booking confirmations, and SMS templates that reference your brand phone."
                            value={businessSettings.phone || ''}
                            onChange={(v) => setBusinessSettings({ ...businessSettings, phone: v })}
                          />
                          <BusinessInputField
                            label="Website URL"
                            hint="Include https:// when possible. Used in email footers and anywhere the site link is surfaced to customers."
                            value={businessSettings.website || ''}
                            onChange={(v) => setBusinessSettings({ ...businessSettings, website: v })}
                          />
                          <BusinessTextareaField
                            label="Business address"
                            rows={4}
                            hint="Printed on invoices and used as the official trading address in customer communications. Use line breaks for street, city, and postcode."
                            value={businessSettings.address || ''}
                            onChange={(v) => setBusinessSettings({ ...businessSettings, address: v })}
                          />
                        </div>
                        <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <p className="text-xs text-slate-500 font-medium max-w-xl">
                            Saves together with social, bank, and policy fields from the other tabs.
                          </p>
                          <button
                            type="button"
                            disabled={isSavingBusinessProfile}
                            onClick={() => void saveBusinessProfileSettings()}
                            className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all shrink-0 disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {isSavingBusinessProfile ? 'Saving…' : 'Save business profile'}
                          </button>
                        </div>
                      </div>
                    )}

                    {businessProfileSub === 'social' && (
                      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100/50 p-6 sm:p-10 lg:p-12 w-full">
                        <div className="rounded-2xl border border-purple-100 bg-purple-50/60 p-5 sm:p-6 mb-8 max-w-3xl">
                          <h5 className="text-sm font-black text-purple-950 flex items-center gap-2">
                            <span className="w-8 h-8 rounded-xl bg-white flex items-center justify-center text-purple-600 font-black border border-purple-100">@</span>
                            Social &amp; discovery links
                          </h5>
                          <p className="text-sm text-purple-900/80 font-medium mt-2 leading-relaxed">
                            Paste full profile or page URLs. When filled, these typically appear in the website footer, marketing blocks, and anywhere the brand links out to social proof.
                          </p>
                        </div>
                        <div className="space-y-8 max-w-3xl">
                          <BusinessInputField
                            label="Facebook URL"
                            hint="Company page URL (https://facebook.com/…)."
                            value={businessSettings.socialLinks?.facebook || ''}
                            onChange={(v) =>
                              setBusinessSettings({
                                ...businessSettings,
                                socialLinks: { ...businessSettings.socialLinks, facebook: v },
                              })
                            }
                          />
                          <BusinessInputField
                            label="TikTok URL"
                            hint="Public profile link."
                            value={businessSettings.socialLinks?.tiktok || ''}
                            onChange={(v) =>
                              setBusinessSettings({
                                ...businessSettings,
                                socialLinks: { ...businessSettings.socialLinks, tiktok: v },
                              })
                            }
                          />
                          <BusinessInputField
                            label="Instagram URL"
                            hint="Main grid profile URL."
                            value={businessSettings.socialLinks?.instagram || ''}
                            onChange={(v) =>
                              setBusinessSettings({
                                ...businessSettings,
                                socialLinks: { ...businessSettings.socialLinks, instagram: v },
                              })
                            }
                          />
                          <BusinessInputField
                            label="Twitter / X URL"
                            hint="Profile or brand handle URL on X."
                            value={businessSettings.socialLinks?.twitter || ''}
                            onChange={(v) =>
                              setBusinessSettings({
                                ...businessSettings,
                                socialLinks: { ...businessSettings.socialLinks, twitter: v },
                              })
                            }
                          />
                          <BusinessInputField
                            label="LinkedIn URL"
                            hint="Company page on LinkedIn."
                            value={businessSettings.socialLinks?.linkedin || ''}
                            onChange={(v) =>
                              setBusinessSettings({
                                ...businessSettings,
                                socialLinks: { ...businessSettings.socialLinks, linkedin: v },
                              })
                            }
                          />
                        </div>
                        <div className="mt-10 pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <p className="text-xs text-slate-500 font-medium max-w-xl">
                            Saves together with company, bank, and policy fields from the other tabs.
                          </p>
                          <button
                            type="button"
                            disabled={isSavingBusinessProfile}
                            onClick={() => void saveBusinessProfileSettings()}
                            className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all shrink-0 disabled:opacity-60 disabled:pointer-events-none"
                          >
                            {isSavingBusinessProfile ? 'Saving…' : 'Save business profile'}
                          </button>
                        </div>
                      </div>
                    )}

                    {businessProfileSub === 'payments' && (
                      <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100/50 p-6 sm:p-10 lg:p-12 w-full space-y-10">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 sm:p-6 max-w-3xl">
                          <h5 className="text-sm font-black text-slate-900 flex items-center gap-2">
                            <DollarSign className="w-5 h-5 text-emerald-600 shrink-0" />
                            Bank accounts, deposit, and short-notice cancellation
                          </h5>
                          <p className="text-sm text-slate-600 font-medium mt-2 leading-relaxed">
                            Bank rows shown to customers must include name, account number, and sort code. Inactive accounts are hidden on invoices. Deposit and cancellation text is shown in the booking wizard, confirmation, and client portal when relevant.
                          </p>
                        </div>

                        <section className="space-y-5">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 max-w-3xl">
                            <div>
                              <h5 className="text-lg font-black text-slate-900">Bank details</h5>
                              <p className="text-xs text-slate-500 font-medium mt-1">
                                Each saved account can be toggled for display on customer invoices and confirmation screens.
                              </p>
                            </div>
                            <button
                              type="button"
                              className="px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider shrink-0"
                              onClick={() =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  bankDetails: [
                                    ...(prev.bankDetails || []),
                                    {
                                      id: `bank-${Date.now()}`,
                                      accountName: '',
                                      accountNumber: '',
                                      sortCode: '',
                                      bankName: '',
                                      notes: '',
                                      active: true,
                                    },
                                  ],
                                }))
                              }
                            >
                              Add account
                            </button>
                          </div>
                          <div className="space-y-4 max-w-3xl">
                            {(businessSettings.bankDetails || []).length === 0 && (
                              <p className="text-sm font-semibold text-slate-500">No bank accounts yet. Use Add account to create one.</p>
                            )}
                            {(businessSettings.bankDetails || []).map((bank, index) => (
                              <div key={bank.id || `bank-row-${index}`} className="p-5 sm:p-6 rounded-2xl border border-slate-100 bg-slate-50/70 space-y-4">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="text-xs font-black uppercase tracking-wider text-slate-500">Account {index + 1}</p>
                                  <button
                                    type="button"
                                    className="px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-black uppercase tracking-wider"
                                    onClick={() =>
                                      setBusinessSettings((prev) => ({
                                        ...prev,
                                        bankDetails: (prev.bankDetails || []).filter((_, i) => i !== index),
                                      }))
                                    }
                                  >
                                    Delete
                                  </button>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  <BusinessInputField
                                    label="Account name"
                                    hint="Legal name as it appears on the bank account (e.g. payee on transfers)."
                                    value={bank.accountName || ''}
                                    onChange={(v) =>
                                      setBusinessSettings((prev) => ({
                                        ...prev,
                                        bankDetails: (prev.bankDetails || []).map((b, i) => (i === index ? { ...b, accountName: v } : b)),
                                      }))
                                    }
                                  />
                                  <BusinessInputField
                                    label="Bank name (optional)"
                                    hint="Helps customers recognise the institution."
                                    value={bank.bankName || ''}
                                    onChange={(v) =>
                                      setBusinessSettings((prev) => ({
                                        ...prev,
                                        bankDetails: (prev.bankDetails || []).map((b, i) => (i === index ? { ...b, bankName: v } : b)),
                                      }))
                                    }
                                  />
                                  <BusinessInputField
                                    label="Account number"
                                    value={bank.accountNumber || ''}
                                    onChange={(v) =>
                                      setBusinessSettings((prev) => ({
                                        ...prev,
                                        bankDetails: (prev.bankDetails || []).map((b, i) => (i === index ? { ...b, accountNumber: v } : b)),
                                      }))
                                    }
                                  />
                                  <BusinessInputField
                                    label="Sort code"
                                    hint="UK format, e.g. 04-06-05."
                                    value={bank.sortCode || ''}
                                    onChange={(v) =>
                                      setBusinessSettings((prev) => ({
                                        ...prev,
                                        bankDetails: (prev.bankDetails || []).map((b, i) => (i === index ? { ...b, sortCode: v } : b)),
                                      }))
                                    }
                                  />
                                </div>
                                <BusinessTextareaField
                                  label="Notes (optional)"
                                  rows={3}
                                  hint="Internal memo or extra payment instructions for staff; may be shown on invoices if you use notes publicly."
                                  value={bank.notes || ''}
                                  onChange={(v) =>
                                    setBusinessSettings((prev) => ({
                                      ...prev,
                                      bankDetails: (prev.bankDetails || []).map((b, i) => (i === index ? { ...b, notes: v } : b)),
                                    }))
                                  }
                                />
                                <label className="inline-flex items-start gap-2 text-sm font-semibold text-slate-700">
                                  <input
                                    type="checkbox"
                                    className="mt-1 rounded border-slate-300"
                                    checked={bank.active !== false}
                                    onChange={(e) =>
                                      setBusinessSettings((prev) => ({
                                        ...prev,
                                        bankDetails: (prev.bankDetails || []).map((b, i) =>
                                          i === index ? { ...b, active: e.target.checked } : b
                                        ),
                                      }))
                                    }
                                  />
                                  <span>Show this account on customer invoices and booking confirmation payment blocks.</span>
                                </label>
                              </div>
                            ))}
                          </div>
                        </section>

                        <section className="space-y-5 max-w-3xl border-t border-slate-100 pt-10">
                          <h5 className="text-lg font-black text-slate-900">Deposit policy</h5>
                          <p className="text-sm text-slate-500 font-medium">
                            The message appears next to the calculated deposit on invoices and confirmations. Percent must be between 0 and 100.
                          </p>
                          <div className="max-w-xs">
                            <BusinessInputField
                              label="Required deposit (%)"
                              hint="Example: 40 means customers see 40% of the booking total as the amount to pay now."
                              value={String(businessSettings.depositPolicy?.requiredPercent ?? 40)}
                              onChange={(v) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  depositPolicy: {
                                    ...(prev.depositPolicy || {}),
                                    requiredPercent: Number.isFinite(Number(v)) ? Number(v) : 40,
                                  },
                                }))
                              }
                            />
                          </div>
                          <BusinessTextareaField
                            label="Deposit message"
                            rows={5}
                            hint="Plain language shown with the deposit amount on invoices and booking confirmation. You can write several sentences."
                            value={
                              businessSettings.depositPolicy?.message ||
                              'A 40% deposit secures your booking and guarantees our staff arrive on schedule, fully prepared to deliver.'
                            }
                            onChange={(v) =>
                              setBusinessSettings((prev) => ({
                                ...prev,
                                depositPolicy: {
                                  ...(prev.depositPolicy || {}),
                                  message: v,
                                },
                              }))
                            }
                          />
                        </section>

                        <section className="space-y-5 max-w-3xl border-t border-slate-100 pt-10">
                          <h5 className="text-lg font-black text-slate-900">Short-notice cancellation</h5>
                          <p className="text-sm text-slate-500 font-medium">
                            Used when a client cancels close to the job time. The consent line is shown in the portal before they confirm a fee-bearing cancel.
                          </p>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <BusinessInputField
                              label="Short-notice window (hours)"
                              hint="Inside this many hours before the visit, the client must consent to the fee to cancel (e.g. 24)."
                              value={String(businessSettings.cancellationPolicy?.shortNoticeWindowHours ?? 24)}
                              onChange={(v) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  cancellationPolicy: {
                                    ...(prev.cancellationPolicy || {}),
                                    shortNoticeWindowHours: Number.isFinite(Number(v)) ? Number(v) : 24,
                                  },
                                }))
                              }
                            />
                            <BusinessInputField
                              label="Short-notice fee (%)"
                              hint="Maximum percentage of booking total referenced in consent (0–100)."
                              value={String(businessSettings.cancellationPolicy?.shortNoticeFeePercent ?? 10)}
                              onChange={(v) =>
                                setBusinessSettings((prev) => ({
                                  ...prev,
                                  cancellationPolicy: {
                                    ...(prev.cancellationPolicy || {}),
                                    shortNoticeFeePercent: Number.isFinite(Number(v)) ? Number(v) : 10,
                                  },
                                }))
                              }
                            />
                          </div>
                          <BusinessTextareaField
                            label="Cancellation consent message"
                            rows={6}
                            hint="Shown next to the consent checkbox when clients cancel inside the short-notice window. Mention the fee percentage and how payment will be collected."
                            value={
                              businessSettings.cancellationPolicy?.consentMessage ||
                              'If you choose to cancel within 24 hours of your appointment, you agree to a short-notice cancellation fee of 10% of the booking total.'
                            }
                            onChange={(v) =>
                              setBusinessSettings((prev) => ({
                                ...prev,
                                cancellationPolicy: {
                                  ...(prev.cancellationPolicy || {}),
                                  consentMessage: v,
                                },
                              }))
                            }
                          />
                        </section>

                        <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <p className="text-xs text-slate-500 font-medium max-w-xl">
                            Saves together with company and social fields from the other tabs.
                          </p>
                          <button
                            type="button"
                            disabled={isSavingBusinessProfile}
                            onClick={() => void saveBusinessProfileSettings()}
                            className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-slate-800 transition-all shrink-0 disabled:opacity-60 disabled:pointer-events-none"
                          >
                            {isSavingBusinessProfile ? 'Saving…' : 'Save business profile'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {settingsSection === 'theme' && (
                  <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100/50 p-5 sm:p-8">
                    <div className="flex justify-between items-center mb-8 flex-wrap gap-4">
                      <div>
                        <h4 className="text-xl font-black text-slate-900">Theme &amp; Branding</h4>
                        <p className="text-xs font-bold text-slate-400 mt-1 uppercase tracking-widest">Customize your global appearance</p>
                      </div>
                      <button
                        onClick={() => saveTheme().then(() => showFlyer('Theme Saved Successfully!', 'success'))}
                        className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all text-sm"
                      >
                        Apply Theme
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                      <div className="flex items-center space-x-6">
                        <input
                          type="color"
                          value={themeSettings.theme_primary || '#4f46e5'}
                          onChange={(e) => updateTheme({ theme_primary: e.target.value })}
                          className="w-20 h-20 rounded-[1.5rem] border-4 border-white shadow-sm cursor-pointer p-0 bg-transparent overflow-hidden"
                        />
                        <div>
                          <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest block mb-1">Primary Color</label>
                          <div className="text-xl font-black text-slate-900 uppercase">{themeSettings.theme_primary}</div>
                          <p className="text-xs text-slate-500 mt-1 font-medium">Used for buttons, CTAs, and active states.</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-6">
                        <input
                          type="color"
                          value={themeSettings.theme_background || '#f4f6fb'}
                          onChange={(e) => updateTheme({ theme_background: e.target.value })}
                          className="w-20 h-20 rounded-[1.5rem] border-4 border-white shadow-sm cursor-pointer p-0 bg-transparent overflow-hidden"
                        />
                        <div>
                          <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest block mb-1">Global Background</label>
                          <div className="text-xl font-black text-slate-900 uppercase">{themeSettings.theme_background}</div>
                          <p className="text-xs text-slate-500 mt-1 font-medium">The main background color for your application.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {settingsSection === 'reminders' && <BookingRemindersPanel />}

                {settingsSection === 'qrcode' && <QrCodePanel />}

                {settingsSection === 'templates' && (
                  <div className="space-y-8">
                    <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-5 py-4 text-sm text-slate-600 leading-relaxed">
                      <p className="font-bold text-slate-800 mb-1">How this works</p>
                      <p>
                        Transactional emails use the <strong className="text-slate-900">email shell</strong> layout: logo and contact
                        block come from <strong className="text-slate-900">Business profile</strong> plus your public site URL (for the
                        logo image). SMS templates here are used when Brevo transactional SMS is configured on the server; staff and
                        customer mobiles must be on file where noted in each template description.
                      </p>
                    </div>
                    <BrevoSettingsCard
                      onStatus={(msg, kind = 'info') => showFlyer(msg, kind === 'info' ? 'success' : kind)}
                    />
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <h4 className="text-lg font-black text-slate-900 tracking-tight">Message templates</h4>
                        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                          {emailTemplates.length} email · {smsTemplates.length} SMS
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={reloadMessageTemplates}
                        disabled={templatesReloading}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-black uppercase tracking-widest hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                      >
                        <RefreshCw className={`w-4 h-4 ${templatesReloading ? 'animate-spin' : ''}`} />
                        {templatesReloading ? 'Reloading…' : 'Reload templates'}
                      </button>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                      <div className="bg-white p-5 sm:p-8 rounded-[2.5rem] border border-slate-100/50 shadow-sm">
                        <h4 className="text-xl font-black text-slate-900 mb-6 flex items-center">
                          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mr-3">
                            <MessageSquare className="w-5 h-5" />
                          </div>
                          Email Templates
                        </h4>
                        <div className="space-y-4">
                          {emailTemplates.length === 0 && <p className="text-slate-400 font-bold italic text-sm">No email templates found.</p>}
                          {emailTemplates.map((t) => (
                            <div key={t.id} className="p-5 bg-slate-50 rounded-[1.5rem] hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-blue-100 group">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <div className="font-black text-slate-900">{t.description?.trim() ? t.description.split('.')[0] : t.name.replace(/_/g, ' ')}</div>
                                  <div className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">{t.name}</div>
                                </div>
                                <button onClick={() => setEditingEmailTemplate(t)} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 hover:text-white transition-colors">
                                  Edit
                                </button>
                              </div>
                              <div className="text-xs text-slate-500 font-bold truncate pr-4">{t.subject}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-white p-5 sm:p-8 rounded-[2.5rem] border border-slate-100/50 shadow-sm">
                        <h4 className="text-xl font-black text-slate-900 mb-6 flex items-center">
                          <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center mr-3">
                            <Smartphone className="w-5 h-5" />
                          </div>
                          SMS Templates
                        </h4>
                        <div className="space-y-4">
                          {smsTemplates.length === 0 && <p className="text-slate-400 font-bold italic text-sm">No SMS templates found.</p>}
                          {smsTemplates.map((t) => (
                            <div key={t.id} className="p-5 bg-slate-50 rounded-[1.5rem] hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-green-100 group">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <div className="font-black text-slate-900">{t.description?.trim() ? t.description.split('.')[0] : t.name.replace(/_/g, ' ')}</div>
                                  <div className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">{t.name}</div>
                                </div>
                                <button onClick={() => setEditingSmsTemplate(t)} className="px-4 py-2 bg-green-50 text-green-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-green-600 hover:text-white transition-colors">
                                  Edit
                                </button>
                              </div>
                              <div className="text-xs text-slate-500 font-bold line-clamp-2 pr-4">{t.message}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Communication Center */}
        {activeTab === 'communication' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 w-full">
            <div className="w-full min-w-0">
              <CommunicationCenter />
            </div>
          </div>
        )}

        {/* Chat Oversight (Support) */}
        {activeTab === 'support' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
            <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-100 flex-wrap gap-4">
              <div>
                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Chat Oversight</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Monitor conversations between staff and clients</p>
              </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100/50 p-5 sm:p-8">
              <h3 className="text-xl font-black text-slate-900 mb-2">Active monitoring</h3>
              <p className="text-xs font-bold text-slate-500 mb-6">Open chats you have not closed. Cards pulse green when the client or staff sent a message in the last 15 minutes.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeSupportBookings.map((b) => renderSupportChatCard(b))}
                {activeSupportBookings.length === 0 && (
                  <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center py-12 text-slate-400 font-bold italic">
                    No open chats to monitor. Closed chats appear under History.
                  </div>
                )}
              </div>
            </div>

            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100/50 p-5 sm:p-8">
              <h3 className="text-xl font-black text-slate-900 mb-2">History</h3>
              <p className="text-xs font-bold text-slate-500 mb-6">Bookings where you ended the chat (locked). Reopen from the flyout if needed.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {historySupportBookings.map((b) => renderSupportChatCard(b))}
                {historySupportBookings.length === 0 && (
                  <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center py-12 text-slate-400 font-bold italic">
                    No closed chats yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reviews */}
        {activeTab === 'reviews' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 w-full">
            <ReviewsPanel role="admin" api={apiAdmin as any} />
          </div>
        )}

        {activeTab === 'expenses' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 w-full">
            <ExpenseTracker />
          </div>
        )}

        {activeTab === 'liveMap' && (
          <LiveMapPanel
            bookings={bookings}
            staffList={staffList}
            onAssign={(b) => setSelectedBookingForAssignment(b)}
            onViewStaff={(s) => setProfileStaff(s)}
            onViewClient={(email) => setProfileClientEmail(email)}
          />
        )}

        {activeTab === 'performance' && (() => {
          const perfSearchTerm = searchTerm.toLowerCase();
          const clientMap = new Map<string, { name: string; email: string; bookings: Booking[] }>();
          bookings.forEach(b => {
            const email = b.contact?.email;
            if (!email) return;
            if (!clientMap.has(email)) {
              clientMap.set(email, { name: b.contact?.name || 'Guest', email, bookings: [] });
            }
            clientMap.get(email)!.bookings.push(b);
          });
          const clientList = Array.from(clientMap.values());
          const filteredStaff = staffList.filter(s =>
            s.name.toLowerCase().includes(perfSearchTerm) || (s.email || '').toLowerCase().includes(perfSearchTerm)
          );
          const filteredClients = clientList.filter(c =>
            c.name.toLowerCase().includes(perfSearchTerm) || c.email.toLowerCase().includes(perfSearchTerm)
          );

          return (
            <div className="animate-in fade-in slide-in-from-bottom-4 w-full space-y-8">
              {/* Team Performance */}
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" /> Team Performance
                  </h3>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{filteredStaff.length} staff</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {filteredStaff.map(s => {
                    const staffBookings = bookings.filter(b =>
                      b.assignedStaffId === s.id || (b.assignedStaffIds || []).includes(s.id)
                    );
                    const completed = staffBookings.filter(b => b.status === BookingStatus.COMPLETED).length;
                    const avgRating = staffBookings.filter(b => b.rating).length > 0
                      ? staffBookings.filter(b => b.rating).reduce((sum, b) => sum + (b.rating || 0), 0) / staffBookings.filter(b => b.rating).length
                      : 0;

                    return (
                      <div
                        key={s.id}
                        onClick={() => setProfileStaff(s)}
                        className="bg-white rounded-[2rem] border border-slate-100/50 p-5 cursor-pointer hover:shadow-lg hover:border-blue-200 transition-all group"
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-sm">
                            {s.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <div className="font-black text-slate-900 text-sm truncate group-hover:text-blue-600 transition-colors">{s.name}</div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.role}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center p-2 bg-slate-50 rounded-xl">
                            <div className="text-lg font-black text-slate-900">{staffBookings.length}</div>
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Jobs</div>
                          </div>
                          <div className="text-center p-2 bg-emerald-50 rounded-xl">
                            <div className="text-lg font-black text-emerald-700">{completed}</div>
                            <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest">Done</div>
                          </div>
                          <div className="text-center p-2 bg-amber-50 rounded-xl">
                            <div className="text-lg font-black text-amber-700">{avgRating ? avgRating.toFixed(1) : '-'}</div>
                            <div className="text-[9px] font-bold text-amber-500 uppercase tracking-widest flex items-center justify-center gap-0.5">
                              <Star className="w-2.5 h-2.5" /> Avg
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredStaff.length === 0 && (
                    <div className="col-span-full text-center py-12 text-slate-400 font-medium">No staff found</div>
                  )}
                </div>
              </div>

              {/* Client Accounts */}
              <div>
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-primary" /> Client Accounts
                  </h3>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{filteredClients.length} clients</span>
                </div>
                <div className="bg-white rounded-[2.5rem] border border-slate-100/50 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[600px]">
                      <thead>
                        <tr className="bg-slate-50/80 border-b border-slate-100">
                          <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Client</th>
                          <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Bookings</th>
                          <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Total Spent</th>
                          <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Avg Rating</th>
                          <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Last Booking</th>
                          <th className="px-6 py-4"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredClients
                          .sort((a, b) => b.bookings.length - a.bookings.length)
                          .map(c => {
                            const totalSpent = c.bookings.reduce((sum, b) => sum + Number(b.totalPrice || 0), 0);
                            const rated = c.bookings.filter(b => b.rating);
                            const avgR = rated.length ? rated.reduce((s, b) => s + (b.rating || 0), 0) / rated.length : 0;
                            const lastDate = c.bookings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]?.date || '-';
                            return (
                              <tr
                                key={c.email}
                                className="border-b border-slate-50 hover:bg-slate-50/50 cursor-pointer transition-colors"
                                onClick={() => setProfileClientEmail(c.email)}
                              >
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-black text-xs text-slate-500">
                                      {c.name.charAt(0)}
                                    </div>
                                    <div>
                                      <div className="font-bold text-sm text-slate-900">{c.name}</div>
                                      <div className="text-[10px] text-slate-400 font-medium">{c.email}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4 font-black text-sm text-slate-800">{c.bookings.length}</td>
                                <td className="px-6 py-4 font-black text-sm text-slate-800">£{totalSpent.toFixed(2)}</td>
                                <td className="px-6 py-4">
                                  {avgR > 0 ? (
                                    <span className="flex items-center gap-1 text-sm font-bold text-amber-600">
                                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" /> {avgR.toFixed(1)}
                                    </span>
                                  ) : (
                                    <span className="text-xs text-slate-400">-</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 text-xs font-bold text-slate-500">{lastDate}</td>
                                <td className="px-6 py-4">
                                  <ChevronRight className="w-4 h-4 text-slate-300" />
                                </td>
                              </tr>
                            );
                          })}
                        {filteredClients.length === 0 && (
                          <tr>
                            <td colSpan={6} className="text-center py-12 text-slate-400 font-medium">No clients found</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {isCreatingExtra && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
            <div
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => {
                if (!isExtraFormSubmitting) setIsCreatingExtra(false);
              }}
            />
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-6 md:p-10 relative z-10 shadow-2xl">
              <h3 className="text-2xl font-black text-slate-900 mb-6">New Extra Service</h3>
              <form onSubmit={handleCreateExtra} className="space-y-4">
                <BusinessInputField label="Service Name" value={newExtra.name} onChange={v => setNewExtra({ ...newExtra, name: v })} />
                <div className="grid grid-cols-2 gap-4">
                  <BusinessInputField label="Price (£)" value={newExtra.price} onChange={v => setNewExtra({ ...newExtra, price: v })} />
                  <BusinessInputField label="Duration (min)" value={newExtra.duration} onChange={v => setNewExtra({ ...newExtra, duration: v })} />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Price Type</label>
                  <div className="flex space-x-2">
                    {['fixed', 'hourly'].map(t => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewExtra({ ...newExtra, type: t })}
                        className={`flex-1 py-3 rounded-xl font-bold capitalize ${newExtra.type === t ? 'bg-blue-600 text-white' : 'bg-slate-50 text-slate-500'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={isExtraFormSubmitting}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-lg mt-4 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isExtraFormSubmitting ? 'Creating…' : 'Create Service'}
                </button>
              </form>
              <button
                type="button"
                disabled={isExtraFormSubmitting}
                onClick={() => {
                  if (!isExtraFormSubmitting) setIsCreatingExtra(false);
                }}
                className="absolute top-6 right-6 p-2 rounded-full bg-slate-50 hover:bg-slate-100 disabled:opacity-40"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>
        )}

        {isCreatingDiscount && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
            <div
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
              onClick={() => {
                if (!isDiscountFormSubmitting) setIsCreatingDiscount(false);
              }}
            />
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-6 md:p-10 relative z-10 shadow-2xl">
              <h3 className="text-2xl font-black text-slate-900 mb-6">Create Discount</h3>
              <form onSubmit={handleCreateDiscount} className="space-y-4">
                <BusinessInputField label="Promo Code" value={newDiscount.code} onChange={v => setNewDiscount({ ...newDiscount, code: v.toUpperCase() })} />
                <div className="grid grid-cols-2 gap-4">
                  <BusinessInputField label="Value" value={newDiscount.value} onChange={v => setNewDiscount({ ...newDiscount, value: v })} />
                  <div className="space-y-3">
                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Type</label>
                    <select
                      className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-sm text-foreground"
                      value={newDiscount.type}
                      onChange={e => setNewDiscount({ ...newDiscount, type: e.target.value })}
                    >
                      <option value="fixed">Fixed Amount (£)</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>
                  </div>
                </div>
                <BusinessInputField label="Usage Limit (Optional)" value={newDiscount.usageLimit} onChange={v => setNewDiscount({ ...newDiscount, usageLimit: v })} />

                <button
                  type="submit"
                  disabled={isDiscountFormSubmitting}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-lg mt-4 hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isDiscountFormSubmitting ? 'Creating…' : 'Create Promo'}
                </button>
              </form>
              <button
                type="button"
                disabled={isDiscountFormSubmitting}
                onClick={() => {
                  if (!isDiscountFormSubmitting) setIsCreatingDiscount(false);
                }}
                className="absolute top-6 right-6 p-2 rounded-full bg-slate-50 hover:bg-slate-100 disabled:opacity-40"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>
        )}

        {reminderModalBooking && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setReminderModalBooking(null)} />
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-6 md:p-10 relative z-10 shadow-2xl">
              <h3 className="text-2xl font-black text-slate-900 mb-2">Send Reminder</h3>
              <p className="text-sm font-bold text-slate-500 mb-6">Edit the reminder message below before sending.</p>
              <textarea
                className="w-full h-32 p-4 bg-card rounded-2xl border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25 font-medium text-sm text-foreground outline-none resize-none"
                value={reminderMessage}
                onChange={e => setReminderMessage(e.target.value)}
                placeholder="Enter custom reminder message..."
              />
              <button
                onClick={async () => {
                  try {
                    const result = await apiAdmin.sendReminder(reminderModalBooking.id, reminderMessage);
                    const warning = result && typeof result === 'object' ? (result as { warning?: unknown }).warning : undefined;
                    if (typeof warning === 'string' && warning.trim()) {
                      showFlyer(`${warning.trim()} (Client: ${reminderModalBooking.contact?.name || reminderModalBooking.id})`, 'warning');
                    } else {
                      showFlyer(`Reminder sent to ${reminderModalBooking.contact?.name}`, 'success');
                    }
                    setReminderModalBooking(null);
                  } catch (err) {
                    showFlyer("Error sending reminder", 'error');
                  }
                }}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg mt-6 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30"
              >
                Send Reminder Message
              </button>
              <button onClick={() => setReminderModalBooking(null)} className="absolute top-6 right-6 p-2 rounded-full bg-slate-50 hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>
        )}

        {batchReminderModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 animate-in fade-in zoom-in-95">
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setBatchReminderModalOpen(false)} />
            <div className="bg-white w-full max-w-lg rounded-[2.5rem] p-6 md:p-10 relative z-10 shadow-2xl">
              <h3 className="text-2xl font-black text-slate-900 mb-2">Send Batch Reminders</h3>
              <p className="text-sm font-bold text-slate-500 mb-6">This message will be sent to all confirmed clients.</p>
              <textarea
                className="w-full h-32 p-4 bg-card rounded-2xl border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25 font-medium text-sm text-foreground outline-none resize-none"
                value={reminderMessage}
                onChange={e => setReminderMessage(e.target.value)}
                placeholder="Enter custom batch reminder message..."
              />
              <button
                onClick={async () => {
                  const toRemind = bookings.filter(b => b.status === BookingStatus.CONFIRMED);
                  try {
                    const settled = await Promise.allSettled(
                      toRemind.map(async (b) => {
                        const result = await apiAdmin.sendReminder(b.id, reminderMessage);
                        const warning =
                          result && typeof result === 'object'
                            ? (result as { warning?: unknown }).warning
                            : undefined;
                        return {
                          id: b.id,
                          warning: typeof warning === 'string' && warning.trim() ? warning.trim() : null,
                        };
                      })
                    );
                    const failed = settled.filter((r) => r.status === 'rejected').length;
                    const fulfilled = settled.filter((r): r is PromiseFulfilledResult<{ id: string; warning: string | null }> => r.status === 'fulfilled');
                    const warned = fulfilled.filter((r) => r.value.warning).length;
                    const succeeded = fulfilled.length;

                    if (failed === 0 && warned === 0) {
                      showFlyer(`Sent reminders to ${succeeded} confirmed clients`, 'success');
                    } else if (succeeded > 0 && failed === 0) {
                      showFlyer(
                        `Sent ${succeeded} reminders, ${warned} with delivery warnings.`,
                        'warning'
                      );
                    } else if (succeeded > 0) {
                      showFlyer(
                        `Processed ${toRemind.length}: ${succeeded} sent, ${warned} warnings, ${failed} failed.`,
                        'warning'
                      );
                    } else {
                      showFlyer('Error sending batch reminders', 'error');
                      return;
                    }
                    setBatchReminderModalOpen(false);
                  } catch (err) {
                    showFlyer("Error sending batch reminders", 'error');
                  }
                }}
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-bold text-lg mt-6 hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/30"
              >
                Send Bulk Reminders
              </button>
              <button onClick={() => setBatchReminderModalOpen(false)} className="absolute top-6 right-6 p-2 rounded-full bg-slate-50 hover:bg-slate-100">
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>
        )}

        {reviewBooking && (
          <BookingReviewModal
            booking={reviewBooking}
            services={services}
            extras={extraServices}
            onClose={() => setReviewBooking(null)}
            onUpdate={async () => {
              const updated = await apiAdmin.getBookings();
              setBookings(updated);
            }}
          />
        )}

        {selectedBookingForAssignment && (
          <StaffAssignmentModal
            booking={selectedBookingForAssignment}
            staffList={staffList}
            allBookings={bookings}
            services={services}
            extras={extraServices}
            onClose={() => setSelectedBookingForAssignment(null)}
            onUpdate={async () => {
              const updated = await apiAdmin.getBookings();
              setBookings(updated);
            }}
          />
        )}

        {rescheduleBooking && (
          <RescheduleBookingModal
            booking={rescheduleBooking}
            allBookings={bookings}
            services={services}
            extras={extraServices}
            staffList={staffList}
            onClose={() => setRescheduleBooking(null)}
            onUpdate={async () => {
              const updated = await apiAdmin.getBookings();
              setBookings(updated);
            }}
          />
        )}

        {editingService && (
          <ServiceFlyout
            service={editingService}
            onClose={() => setEditingService(null)}
            onUpdate={async () => {
              const updated = await apiAdmin.getServices();
              setServices(updated);
            }}
          />
        )}

        {editingExtra && (
          <ExtraServiceFlyout
            extra={editingExtra}
            onClose={() => setEditingExtra(null)}
            onUpdate={async () => {
              const updated = await apiAdmin.getExtraServices();
              setExtraServices(updated);
            }}
          />
        )}

        {isCreatingService && (
          <CreateServiceFlyout
            onClose={() => setIsCreatingService(false)}
            onUpdate={async () => {
              const updated = await apiAdmin.getServices();
              setServices(updated);
            }}
          />
        )}

        {editingReferral && (
          <ReferralFlyout
            referral={editingReferral}
            onClose={() => setEditingReferral(null)}
            onUpdate={async () => {
              const updated = await apiAdmin.getReferrals();
              setReferrals(updated);
            }}
          />
        )}

        {isActivityLogOpen && (
          <ActivityLogFlyout
            bookings={bookings}
            onClose={() => setIsActivityLogOpen(false)}
          />
        )}

        {selectedChatBooking && (
          <ChatOversightFlyout
            booking={selectedChatBooking}
            adminName={currentUser?.name}
            onClose={() => setSelectedChatBooking(null)}
          />
        )}

        {/* Email Template Editor Flyout */}
        {editingEmailTemplate && (
          <EmailTemplateFlyout
            template={editingEmailTemplate}
            onClose={() => setEditingEmailTemplate(null)}
            onSave={async (id, updates) => {
              try {
                await apiAdmin.updateEmailTemplate(Number(id), updates);
                const index = emailTemplates.findIndex((e) => e.id === Number(id));
                if (index > -1) {
                  const updated = [...emailTemplates];
                  updated[index] = { ...updated[index], ...updates };
                  setEmailTemplates(updated);
                }
                showFlyer('Email template saved', 'success');
              } catch {
                showFlyer('Failed to save email template', 'error');
              }
            }}
          />
        )}

        {/* SMS Template Editor Flyout */}
        {editingSmsTemplate && (
          <SmsTemplateFlyout
            template={editingSmsTemplate}
            onClose={() => setEditingSmsTemplate(null)}
            onSave={async (id, updates) => {
              try {
                await apiAdmin.updateSmsTemplate(Number(id), updates);
                const index = smsTemplates.findIndex((s) => s.id === Number(id));
                if (index > -1) {
                  const updated = [...smsTemplates];
                  updated[index] = { ...updated[index], ...updates };
                  setSmsTemplates(updated);
                }
                showFlyer("SMS template saved", "success");
              } catch (err) {
                showFlyer("Failed to save SMS template", "error");
              }
            }}
          />
        )}

        {profileStaff && (
          <StaffProfileFlyout
            staff={profileStaff}
            bookings={bookings}
            services={services}
            extras={extraServices}
            onClose={() => setProfileStaff(null)}
            onViewClient={(email) => {
              setProfileStaff(null);
              setProfileClientEmail(email);
            }}
          />
        )}

        {profileClientEmail && (
          <ClientHistoryFlyout
            clientEmail={profileClientEmail}
            bookings={bookings}
            staffList={staffList}
            onClose={() => setProfileClientEmail(null)}
            onViewStaff={(staffId) => {
              setProfileClientEmail(null);
              const s = staffList.find(st => st.id === staffId);
              if (s) setProfileStaff(s);
            }}
          />
        )}
      </div>
    </div>
  );
};

const StatCard = ({ label, value, icon, color }: { label: string, value: string, icon: React.ReactNode, color: string }) => (
  <div className="bg-white p-6 md:p-10 rounded-[3rem] border border-slate-100 shadow-sm hover:shadow-2xl transition-all group relative overflow-hidden">
    <div className={`w-16 h-16 rounded-[1.5rem] ${color} flex items-center justify-center mb-8 group-hover:scale-110 transition-transform shadow-sm`}>{icon}</div>
    <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-2">{label}</div>
    <div className="text-4xl font-black text-slate-900 tabular-nums leading-none tracking-tight">{value}</div>
  </div>
);

const BusinessInputField = ({
  label,
  value,
  onChange,
  icon,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  icon?: React.ReactNode;
  /** Short guidance shown under the field for admins (optional). */
  hint?: string;
}) => (
  <div className="space-y-3">
    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">{label}</label>
    <div className="relative">
      {icon && <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300">{icon}</div>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-sm text-foreground transition-all ${icon ? 'pl-14' : ''}`}
      />
    </div>
    {hint ? <p className="text-xs text-slate-500 font-medium leading-relaxed ml-1">{hint}</p> : null}
  </div>
);

const BusinessTextareaField = ({
  label,
  value,
  onChange,
  hint,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  rows?: number;
}) => (
  <div className="space-y-3">
    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">{label}</label>
    <textarea
      value={value}
      rows={rows}
      onChange={(e) => onChange(e.target.value)}
      className="w-full min-h-[6rem] resize-y bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-semibold text-sm text-foreground leading-relaxed transition-all"
    />
    {hint ? <p className="text-xs text-slate-500 font-medium leading-relaxed ml-1">{hint}</p> : null}
  </div>
);

export default AdminDashboard;
