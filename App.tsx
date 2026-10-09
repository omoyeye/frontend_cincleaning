import React, { Component, useState, useEffect, useCallback, useRef } from 'react';
import {
  Users,
  LayoutDashboard,
  PlusCircle,
  Menu,
  X,
  UserCircle,
  ShieldCheck,
  Loader2,
  ChevronDown,
} from 'lucide-react';
import BookingWizard from './components/BookingWizard';
import BrandLogoMark, { BRAND_LOGO_PATH } from './components/BrandLogoMark';
import MarketingContactBar from './components/MarketingContactBar';
import { BusinessSettingsProvider } from './src/context/BusinessSettingsContext';
import { NotificationBell } from './components/NotificationBell';
import MarketingSite from './components/MarketingSite';
import AdminDashboard from './components/AdminDashboard';
import StaffPortal from './components/StaffPortal';
import CustomerPortal from './components/CustomerPortal';
import LoginScreen from './components/auth/LoginScreen';
import ResetPassword from './components/auth/ResetPassword';
import { ThemeProvider } from './components/ThemeProvider';
import { FlyerProvider } from './components/Flyer';
import CookieConsentBanner from './components/CookieConsentBanner';
import StickyMobileFooter from './components/StickyMobileFooter';
import PromoBanner from './components/PromoBanner';
import WhatsAppButton from './components/WhatsAppButton';
import FirstTimePopup from './components/FirstTimePopup';
import { useBusinessBrand } from './src/hooks/useBusinessBrand';
import { Booking, UserAccount, StaffNotification } from './types';
import { apiClient, apiAdmin, apiStaff } from './services/api';
import { subscribeNnSync } from './services/realtime';
import { useApplySeo } from './src/seo/useApplySeo';
import {
  getViewFromPathname,
  LEGACY_PATH_REDIRECT,
  parseCustomerRoute,
  pathForCustomerPage,
  PORTAL_PATH,
  type CustomerPageKey as CustomerPage,
} from './src/seo/routePaths';

type View = 'customer' | 'admin' | 'staff' | 'portal' | 'reset-password';
const AI_WELCOME_NUDGE_KEY = 'nn_ai_welcome_seen_v1';

function initialCustomerRoute(): { page: CustomerPage; blogSlug: string | null } {
  if (typeof window === 'undefined') return { page: 'home', blogSlug: null };
  const path = window.location.pathname;
  if (getViewFromPathname(path) !== 'customer') return { page: 'home', blogSlug: null };
  return parseCustomerRoute(path);
}

function themeColorForView(view: View): string {
  if (view === 'admin') return '#0f172a';
  if (view === 'staff') return '#4f46e5';
  return '#4f46e5';
}

function mapServerNotifs(notifs: any[]): StaffNotification[] {
  if (!Array.isArray(notifs)) return [];
  return notifs.map((n: any) => {
    const type = String(n?.type ?? 'system');
    const created = n?.createdAt != null ? new Date(n.createdAt as string | number | Date) : new Date();
    const ts = Number.isNaN(created.getTime()) ? '' : created.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      id: String(n?.id ?? ''),
      title: type.replace(/_/g, ' ').toUpperCase(),
      message: String(n?.message ?? ''),
      timestamp: ts,
      priority:
        type === 'system'
          ? 'urgent'
          : type === 'booking_update'
            ? 'high'
            : type === 'invoice'
              ? 'medium'
              : 'low',
      read: Boolean(n?.isRead),
    };
  });
}

type PortalErrorBoundaryProps = {
  children: React.ReactNode;
  fallbackTitle: string;
  onReset: () => void;
};

type PortalErrorBoundaryState = { hasError: boolean; message?: string };

class PortalErrorBoundary extends Component<PortalErrorBoundaryProps, PortalErrorBoundaryState> {
  declare props: Readonly<PortalErrorBoundaryProps>;
  state: PortalErrorBoundaryState = { hasError: false, message: undefined };

  componentDidCatch(error: Error) {
    console.error(`${this.props.fallbackTitle} crashed:`, error);
    (this as any).setState({
      hasError: true,
      message: String(error?.message || 'Unknown runtime error'),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[min(100dvh,48rem)] w-full flex-1 flex-col items-center justify-center bg-background p-6">
          <div className="bg-card w-full max-w-lg rounded-[2rem] border-2 border-border p-8 text-center shadow-2xl">
            <h2 className="text-2xl font-black text-foreground">{this.props.fallbackTitle} crashed</h2>
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              The portal hit an unexpected error. Please sign in again.
            </p>
            {this.state.message ? (
              <p className="mt-3 rounded-lg bg-muted px-3 py-2 text-left text-[11px] font-mono text-foreground/90">
                {this.state.message}
              </p>
            ) : null}
            <button
              type="button"
              onClick={this.props.onReset}
              className="mt-6 rounded-xl bg-primary px-5 py-3 text-xs font-black uppercase tracking-widest text-primary-foreground hover:opacity-95"
            >
              Back To Login
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App: React.FC<{ serverUrl?: string }> = ({ serverUrl }) => {
  return (
    <FlyerProvider>
      <ThemeProvider>
        <BusinessSettingsProvider>
          <AppContent serverUrl={serverUrl} />
        </BusinessSettingsProvider>
      </ThemeProvider>
    </FlyerProvider>
  );
};

const AppContent: React.FC<{ serverUrl?: string }> = ({ serverUrl }) => {
  const [clientUser, setClientUser] = useState<UserAccount | null>(null);
  const [adminUser, setAdminUser] = useState<UserAccount | null>(null);
  const [staffUser, setStaffUser] = useState<UserAccount | null>(null);
  const [currentView, setCurrentView] = useState<View>(() => {
    if (serverUrl) return getViewFromPathname(serverUrl);
    if (typeof window !== 'undefined') return getViewFromPathname(window.location.pathname);
    return 'customer';
  });
  const [customerPage, setCustomerPage] = useState<CustomerPage>(() => {
    if (serverUrl) {
      if (getViewFromPathname(serverUrl) !== 'customer') return 'home';
      return parseCustomerRoute(serverUrl).page;
    }
    return initialCustomerRoute().page;
  });
  const [blogSlug, setBlogSlug] = useState<string | null>(() => {
    if (serverUrl) {
      if (getViewFromPathname(serverUrl) !== 'customer') return null;
      return parseCustomerRoute(serverUrl).blogSlug;
    }
    return initialCustomerRoute().blogSlug;
  });
  /** Staff/admin deep links: show UI immediately; session restore must not block login (hung `me()` = blank wait). */
  const [loading, setLoading] = useState(() => {
    const url = serverUrl || (typeof window !== 'undefined' ? window.location.pathname : '/');
    const v = getViewFromPathname(url);
    if (v === 'customer') return false;
    return v !== 'staff' && v !== 'admin';
  });
  const [clientBookings, setClientBookings] = useState<Booking[]>([]);
  const [adminBookings, setAdminBookings] = useState<Booking[]>([]);
  const [staffBookings, setStaffBookings] = useState<Booking[]>([]);
  const [staffNotifications, setStaffNotifications] = useState<StaffNotification[]>([]);
  const [reorderBooking, setReorderBooking] = useState<Booking | null>(() => {
    // Persist reorder intent across full-page navigations via sessionStorage
    try {
      const raw = typeof window !== 'undefined' ? sessionStorage.getItem('nn_reorder_booking') : null;
      return raw ? (JSON.parse(raw) as Booking) : null;
    } catch {
      return null;
    }
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [mobileNavServicesOpen, setMobileNavServicesOpen] = useState(false);
  const [mobileNavAboutOpen, setMobileNavAboutOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const brandName = useBusinessBrand('CiN');
  useApplySeo(currentView, customerPage, brandName, blogSlug);

  // Restore each portal session independently (client / admin / staff tokens)
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const settled = await Promise.allSettled([
          apiClient.me(),
          apiAdmin.me(),
          apiStaff.me(),
        ]);
        const cu = settled[0].status === 'fulfilled' ? settled[0].value : null;
        const au = settled[1].status === 'fulfilled' ? settled[1].value : null;
        const su = settled[2].status === 'fulfilled' ? settled[2].value : null;
        /** Same cookie hits `/api/me` for every realm — only store the user in the portal that matches their role. */
        if (cu?.role === 'customer') setClientUser(cu);
        if (au?.role === 'admin') setAdminUser(au);
        if (su?.role === 'staff') setStaffUser(su);
        if (settled.some((r) => r.status === 'rejected')) {
          console.warn(
            'Session restoration: one or more /api/me calls failed.',
            settled.map((r) => (r.status === 'rejected' ? r.reason : null)),
          );
        }
      } catch (err) {
        console.error('Session restoration failed:', err);
      } finally {
        setLoading(false);
      }
    };
    void restoreSession();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pathname = window.location.pathname;
    const p = pathname.replace(/\/$/, '') || '/';
    const to = LEGACY_PATH_REDIRECT[p];
    if (to) window.history.replaceState(window.history.state, '', to);
    if (getViewFromPathname(pathname) !== 'customer') return;
    const r = parseCustomerRoute(window.location.pathname);
    setCustomerPage(r.page);
    setBlogSlug(r.blogSlug);
  }, []);

  // Handle browser back/forward buttons
  useEffect(() => {
    const handlePopState = () => {
      const nextView = getViewFromPathname(window.location.pathname);
      setCurrentView(nextView);
      if (nextView === 'customer') {
        const r = parseCustomerRoute(window.location.pathname);
        setCustomerPage(r.page);
        setBlogSlug(r.blogSlug);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Keep admin/staff/portal deep-link URLs in sync (SPA navigation for team portals only).
  // Customer page URLs are handled by full-page navigation in openCustomerPage().
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let target: string | null = null;
    if (currentView === 'admin') target = '/admin';
    else if (currentView === 'staff') target = '/staff';
    else if (currentView === 'portal') target = PORTAL_PATH;
    if (!target) return;
    const cur = window.location.pathname.replace(/\/$/, '') || '/';
    const normTarget = target.replace(/\/$/, '') || '/';
    if (cur !== normTarget) {
      window.history.pushState({ view: currentView }, '', target);
    }
  }, [currentView]);

  // Route-specific PWA manifest + theme-color (staff/admin install as separate home screens)
  useEffect(() => {
    const href =
      currentView === 'staff'
        ? '/manifest-staff.webmanifest'
        : currentView === 'admin'
          ? '/manifest-admin.webmanifest'
          : '/manifest.webmanifest';
    let link = document.querySelector('link[rel="manifest"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = href;
    const color = themeColorForView(currentView);
    if (document.getElementById('nn-theme-color')) {
      (document.getElementById('nn-theme-color') as HTMLMetaElement).content = color;
    }
  }, [currentView]);

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const teamRoute = currentView === 'staff' || currentView === 'admin';
    if (teamRoute && deferredPrompt && !isStandalone) {
      const timer = setTimeout(() => {
        setShowInstallPrompt(true);
      }, 30000);
      return () => clearTimeout(timer);
    }
  }, [currentView, deferredPrompt, isStandalone]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setShowInstallPrompt(false);
    }
    setDeferredPrompt(null);
  };

  // Client portal: refresh profile (e.g. loyalty) from DB
  useEffect(() => {
    if (!clientUser?.id) return;
    let live = true;
    const syncUserData = async () => {
      try {
        const freshUser = await apiClient.me();
        if (live && freshUser) {
          setClientUser((prev) =>
            prev && JSON.stringify(prev) === JSON.stringify(freshUser) ? prev : freshUser
          );
        }
      } catch (error) {
        console.warn('Failed to sync client user:', error);
      }
    };
    syncUserData();
    const intervalId = setInterval(syncUserData, 10000);
    return () => {
      live = false;
      clearInterval(intervalId);
    };
  }, [clientUser?.id]);

  // Staff portal alerts (staff JWT only)
  useEffect(() => {
    if (!staffUser?.id) return;
    let live = true;
    const syncStaffNotifs = async () => {
      try {
        const notifs = await apiStaff.getNotifications(Number(staffUser.id));
        if (live) {
          try {
            setStaffNotifications(mapServerNotifs(notifs));
          } catch {
            setStaffNotifications([]);
          }
        }
      } catch (error) {
        console.warn('Failed to sync staff notifications:', error);
      }
    };
    syncStaffNotifs();
    const intervalId = setInterval(syncStaffNotifs, 10000);
    return () => {
      live = false;
      clearInterval(intervalId);
    };
  }, [staffUser?.id]);

  const refetchAllBookings = useCallback(async () => {
    try {
      await Promise.all([
        adminUser ? apiAdmin.getBookings().then(setAdminBookings) : Promise.resolve(),
        staffUser ? apiStaff.getBookings().then(setStaffBookings) : Promise.resolve(),
        clientUser ? apiClient.getBookings().then(setClientBookings) : Promise.resolve(),
      ]);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
    }
  }, [adminUser?.id, staffUser?.id, clientUser?.id]);

  useEffect(() => {
    void refetchAllBookings();
  }, [refetchAllBookings]);

  useEffect(() => {
    return subscribeNnSync((scope) => {
      if (scope === 'all' || scope === 'bookings') void refetchAllBookings();
      if (scope === 'all' || scope === 'notifications') {
        if (staffUser?.id) {
          void apiStaff
            .getNotifications(Number(staffUser.id))
            .then((n) => {
              try {
                setStaffNotifications(mapServerNotifs(n));
              } catch {
                setStaffNotifications([]);
              }
            })
            .catch(() => { });
        }
      }
    });
  }, [refetchAllBookings, staffUser?.id]);

  const handleUpdateBooking = (updatedBooking: Booking) => {
    setClientBookings((prev) => prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b)));
    setAdminBookings((prev) => prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b)));
    setStaffBookings((prev) => prev.map((b) => (b.id === updatedBooking.id ? updatedBooking : b)));
  };

  const handleReorder = (booking: Booking) => {
    // Store reorder intent in sessionStorage so the booking wizard can pick it up
    try {
      sessionStorage.setItem('nn_reorder_booking', JSON.stringify(booking));
    } catch { /* ignore */ }
    window.location.href = pathForCustomerPage('book');
  };

  const openCustomerPage = (page: CustomerPage, opts?: { blogSlug?: string | null }) => {
    // Use full-page navigation so the server returns SSR HTML with correct head tags
    const blogSlugVal = opts && 'blogSlug' in opts ? opts.blogSlug ?? null : null;
    const path =
      page === 'blog' && blogSlugVal
        ? `/cleaning-blog/${encodeURIComponent(blogSlugVal)}`
        : pathForCustomerPage(page);
    window.location.href = path;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="text-muted-foreground font-bold animate-pulse">Initializing {brandName}...</p>
        </div>
      </div>
    );
  }

  const teamPortalView = currentView === 'staff' || currentView === 'admin';
  const servicesNavActive =
    customerPage === 'residential' ||
    customerPage === 'standardCleaning' ||
    customerPage === 'deepCleaning' ||
    customerPage === 'endOfTenancy' ||
    customerPage === 'commercial' ||
    customerPage === 'airbnbShortLet';
  const aboutNavActive =
    customerPage === 'about' || customerPage === 'gallery' || customerPage === 'blog';

  /** Desktop nav: hover + focus-within; pt-2 bridges gap so pointer can reach the panel */
  const desktopFlyoutPanel =
    'absolute left-0 top-full z-50 pt-2 opacity-0 invisible pointer-events-none translate-y-1 group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto group-hover:translate-y-0 focus-within:opacity-100 focus-within:visible focus-within:pointer-events-auto focus-within:translate-y-0 transition-[opacity,transform] duration-200 ease-out';

  return (
    <div
      className={`min-h-screen relative w-full bg-background font-sans selection:bg-primary/20 ${teamPortalView
        ? 'flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden'
        : ''
        }`}
    >
      <div className="sticky top-0 z-50">
        {(!isStandalone && currentView === 'customer') && (
          <header className="bg-card/95 backdrop-blur-xl border-b border-border shadow-sm shadow-primary/5 overflow-visible">
            <div className="max-w-7xl mx-auto px-4 lg:px-8 h-24 flex items-center justify-between">
              <div className="flex items-center gap-3 cursor-pointer min-w-0" onClick={() => openCustomerPage('home')}>
                <BrandLogoMark className="h-[4.5rem] w-auto max-h-[4.5rem] max-w-[min(26vw,400px)] sm:h-20 sm:max-h-20 sm:max-w-[440px] shrink-0 object-contain object-left" />
                <div className="hidden sm:flex lg:hidden xl:flex flex-col leading-tight min-w-0">
                  <span className="text-lg font-black tracking-tight text-foreground truncate">{brandName}</span>
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Clean It Neatly</span>
                </div>
              </div>

              <nav className="hidden lg:flex items-center space-x-1 whitespace-nowrap bg-muted/80 p-1.5 rounded-2xl overflow-visible no-scrollbar border border-border/60">
                <button
                  type="button"
                  onClick={() => openCustomerPage('home')}
                  className={`px-3 py-2 rounded-xl text-sm font-bold transition-all ${currentView === 'customer' && customerPage === 'home' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card'
                    }`}
                >
                  Home
                </button>

                <div className="relative group">
                  <button
                    type="button"
                    className={`flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold transition-all ${currentView === 'customer' && servicesNavActive
                      ? 'bg-card text-foreground shadow-sm group-hover:bg-card'
                      : 'text-muted-foreground hover:bg-card group-hover:text-foreground'
                      }`}
                    aria-haspopup="menu"
                  >
                    Services
                    <ChevronDown className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180" />
                  </button>
                  <div className={desktopFlyoutPanel}>
                    <div
                      role="menu"
                      className="min-w-[min(18rem,calc(100vw-2rem))] whitespace-normal py-1 rounded-xl bg-card border border-border shadow-lg"
                    >
                      <div className="py-0.5">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openCustomerPage('residential')}
                          className={`w-full text-left px-4 py-2 text-sm font-bold rounded-lg mx-1 transition-colors duration-150 hover:bg-primary/15 hover:text-primary ${customerPage === 'residential' ? 'text-primary bg-primary/10' : 'text-foreground'
                            }`}
                        >
                          Residential
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openCustomerPage('standardCleaning')}
                          className={`w-full text-left pl-8 pr-4 py-1.5 text-sm font-semibold rounded-lg mx-1 transition-colors duration-150 hover:bg-primary/15 hover:text-primary ${customerPage === 'standardCleaning' ? 'text-primary bg-primary/10' : 'text-muted-foreground'
                            }`}
                        >
                          General / standard cleaning
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openCustomerPage('deepCleaning')}
                          className={`w-full text-left pl-8 pr-4 py-1.5 text-sm font-semibold rounded-lg mx-1 transition-colors duration-150 hover:bg-primary/15 hover:text-primary ${customerPage === 'deepCleaning' ? 'text-primary bg-primary/10' : 'text-muted-foreground'
                            }`}
                        >
                          Deep cleaning
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openCustomerPage('endOfTenancy')}
                          className={`w-full text-left pl-8 pr-4 py-1.5 text-sm font-semibold rounded-lg mx-1 transition-colors duration-150 hover:bg-primary/15 hover:text-primary ${customerPage === 'endOfTenancy' ? 'text-primary bg-primary/10' : 'text-muted-foreground'
                            }`}
                        >
                          End of tenancy cleaning
                        </button>
                      </div>
                      <div className="py-0.5 border-t border-border/60 mt-0.5 pt-1">
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openCustomerPage('commercial')}
                          className={`w-full text-left px-4 py-2 text-sm font-bold rounded-lg mx-1 transition-colors duration-150 hover:bg-primary/15 hover:text-primary ${customerPage === 'commercial' ? 'text-primary bg-primary/10' : 'text-foreground'
                            }`}
                        >
                          Commercial
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => openCustomerPage('airbnbShortLet')}
                          className={`w-full text-left pl-8 pr-4 py-1.5 text-sm font-semibold rounded-lg mx-1 transition-colors duration-150 hover:bg-primary/15 hover:text-primary ${customerPage === 'airbnbShortLet' ? 'text-primary bg-primary/10' : 'text-muted-foreground'
                            }`}
                        >
                          Airbnb / short-let cleaning
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="relative group">
                  <button
                    type="button"
                    className={`flex items-center gap-1 px-3 py-2 rounded-xl text-sm font-bold transition-all ${currentView === 'customer' && aboutNavActive
                      ? 'bg-card text-foreground shadow-sm group-hover:bg-card'
                      : 'text-muted-foreground hover:bg-card group-hover:text-foreground'
                      }`}
                    aria-haspopup="menu"
                  >
                    About Us
                    <ChevronDown className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:rotate-180 group-focus-within:rotate-180" />
                  </button>
                  <div className={desktopFlyoutPanel}>
                    <div
                      role="menu"
                      className="min-w-[12rem] whitespace-normal py-1 rounded-xl bg-card border border-border shadow-lg"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openCustomerPage('about')}
                        className={`w-full text-left px-4 py-2.5 text-sm font-bold rounded-lg mx-1 transition-colors duration-150 hover:bg-primary/15 hover:text-primary ${customerPage === 'about' ? 'text-primary bg-primary/10' : 'text-foreground'
                          }`}
                      >
                        About us
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openCustomerPage('gallery')}
                        className={`w-full text-left px-4 py-2.5 text-sm font-bold rounded-lg mx-1 transition-colors duration-150 hover:bg-primary/15 hover:text-primary ${customerPage === 'gallery' ? 'text-primary bg-primary/10' : 'text-foreground'
                          }`}
                      >
                        Gallery
                      </button>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => openCustomerPage('blog')}
                        className={`w-full text-left px-4 py-2.5 text-sm font-bold rounded-lg mx-1 transition-colors duration-150 hover:bg-primary/15 hover:text-primary ${customerPage === 'blog' ? 'text-primary bg-primary/10' : 'text-foreground'
                          }`}
                      >
                        Blog
                      </button>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openCustomerPage('pricing')}
                  className={`px-3 py-2 rounded-xl text-sm font-bold transition-all ${currentView === 'customer' && customerPage === 'pricing' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card'
                    }`}
                >
                  Pricing
                </button>

                <button onClick={() => openCustomerPage('book')} className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold shadow">
                  <PlusCircle className="w-4 h-4" />
                  <span>Book Now</span>
                </button>
                <button onClick={() => window.location.href = PORTAL_PATH} className="flex items-center space-x-2 px-4 py-2 rounded-xl text-muted-foreground hover:bg-card font-bold">
                  <UserCircle className="w-4 h-4" />
                  <span>{clientUser ? 'My Account' : 'Client Login'}</span>
                </button>
                {clientUser && (
                  <NotificationBell
                    fetchNotifications={() => apiClient.getNotifications(Number(clientUser.id))}
                    markRead={apiClient.markNotificationRead}
                    deleteNotification={apiClient.deleteNotification}
                  />
                )}
              </nav>

              <div className="flex items-center gap-2 shrink-0 lg:hidden">
                {clientUser && (
                  <NotificationBell
                    fetchNotifications={() => apiClient.getNotifications(Number(clientUser.id))}
                    markRead={apiClient.markNotificationRead}
                    deleteNotification={apiClient.deleteNotification}
                  />
                )}
                <button
                  type="button"
                  onClick={() => openCustomerPage('book')}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold shadow shrink-0 active:scale-95 transition-transform"
                  aria-label="Book a clean"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Book</span>
                </button>
                <button
                  type="button"
                  className="p-2 text-foreground shrink-0"
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                >
                  {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
              </div>
            </div>

            {isMobileMenuOpen && (
              <div className="lg:hidden absolute top-24 left-4 right-4 sm:left-auto sm:w-96 bg-card/95 backdrop-blur-md border-2 border-border p-4 rounded-3xl space-y-1 flex flex-col shadow-2xl animate-in fade-in zoom-in-95 duration-200 max-h-[min(80dvh,520px)] overflow-y-auto">
                <button
                  type="button"
                  onClick={() => openCustomerPage('home')}
                  className="text-left px-3 py-2.5 rounded-xl font-bold text-slate-700 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  Home
                </button>

                <div className="border-t border-border/60 pt-1">
                  <button
                    type="button"
                    onClick={() => setMobileNavServicesOpen((v) => !v)}
                    className="flex w-full items-center justify-between text-left px-3 py-2.5 rounded-xl font-bold text-slate-700 transition-colors hover:bg-primary/10 hover:text-primary"
                    aria-expanded={mobileNavServicesOpen}
                  >
                    Services
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${mobileNavServicesOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {mobileNavServicesOpen && (
                    <div className="pl-3 pb-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => openCustomerPage('residential')}
                        className="w-full text-left px-3 py-2 rounded-lg font-bold text-slate-600 text-sm transition-colors hover:bg-primary/15 hover:text-primary"
                      >
                        Residential
                      </button>
                      <button
                        type="button"
                        onClick={() => openCustomerPage('standardCleaning')}
                        className="w-full text-left pl-6 pr-3 py-2 rounded-lg font-bold text-slate-600 text-sm transition-colors hover:bg-primary/15 hover:text-primary"
                      >
                        General / standard cleaning
                      </button>
                      <button
                        type="button"
                        onClick={() => openCustomerPage('deepCleaning')}
                        className="w-full text-left pl-6 pr-3 py-2 rounded-lg font-bold text-slate-600 text-sm transition-colors hover:bg-primary/15 hover:text-primary"
                      >
                        Deep cleaning
                      </button>
                      <button
                        type="button"
                        onClick={() => openCustomerPage('endOfTenancy')}
                        className="w-full text-left pl-6 pr-3 py-2 rounded-lg font-bold text-slate-600 text-sm transition-colors hover:bg-primary/15 hover:text-primary"
                      >
                        End of tenancy cleaning
                      </button>
                      <button
                        type="button"
                        onClick={() => openCustomerPage('commercial')}
                        className="w-full text-left px-3 py-2 rounded-lg font-bold text-slate-600 text-sm transition-colors hover:bg-primary/15 hover:text-primary"
                      >
                        Commercial
                      </button>
                      <button
                        type="button"
                        onClick={() => openCustomerPage('airbnbShortLet')}
                        className="w-full text-left pl-6 pr-3 py-2 rounded-lg font-bold text-slate-600 text-sm transition-colors hover:bg-primary/15 hover:text-primary"
                      >
                        Airbnb / short-let cleaning
                      </button>
                    </div>
                  )}
                </div>

                <div className="border-t border-border/60 pt-1">
                  <button
                    type="button"
                    onClick={() => setMobileNavAboutOpen((v) => !v)}
                    className="flex w-full items-center justify-between text-left px-3 py-2.5 rounded-xl font-bold text-slate-700 transition-colors hover:bg-primary/10 hover:text-primary"
                    aria-expanded={mobileNavAboutOpen}
                  >
                    About Us
                    <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${mobileNavAboutOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {mobileNavAboutOpen && (
                    <div className="pl-3 pb-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => openCustomerPage('about')}
                        className="w-full text-left px-3 py-2 rounded-lg font-bold text-slate-600 text-sm transition-colors hover:bg-primary/15 hover:text-primary"
                      >
                        About us
                      </button>
                      <button
                        type="button"
                        onClick={() => openCustomerPage('gallery')}
                        className="w-full text-left px-3 py-2 rounded-lg font-bold text-slate-600 text-sm transition-colors hover:bg-primary/15 hover:text-primary"
                      >
                        Gallery
                      </button>
                      <button
                        type="button"
                        onClick={() => openCustomerPage('blog')}
                        className="w-full text-left px-3 py-2 rounded-lg font-bold text-slate-600 text-sm transition-colors hover:bg-primary/15 hover:text-primary"
                      >
                        Blog
                      </button>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => openCustomerPage('pricing')}
                  className="text-left px-3 py-2.5 rounded-xl font-bold text-slate-700 transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  Pricing
                </button>

                <button type="button" onClick={() => openCustomerPage('book')} className="px-3 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-left mt-1">
                  Book Service
                </button>
                <button
                  type="button"
                  onClick={() => window.location.href = PORTAL_PATH}
                  className="px-3 py-2.5 rounded-xl font-bold text-slate-700 text-left transition-colors hover:bg-primary/10 hover:text-primary"
                >
                  Client Portal
                </button>
              </div>
            )}
          </header>
        )}
      </div>
      {currentView === 'customer' && !isStandalone && <MarketingContactBar />}

      {adminUser && currentView !== 'staff' && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex max-w-[min(100vw-1rem,28rem)] items-center gap-0.5 overflow-x-auto no-scrollbar bg-slate-900/90 backdrop-blur-xl p-1.5 rounded-2xl shadow-2xl border border-white/10 ring-1 ring-black/20 animate-in slide-in-from-bottom-8 duration-700 safe-area-pb">
          <button
            type="button"
            onClick={() => openCustomerPage('home')}
            className={`shrink-0 flex items-center space-x-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${currentView === 'customer' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>Customer</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('admin')}
            className={`shrink-0 flex items-center space-x-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${currentView === 'admin' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Admin</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('staff')}
            className={`shrink-0 flex items-center space-x-2 px-4 sm:px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${currentView === 'staff' ? 'bg-white text-slate-900 shadow-xl' : 'text-slate-400 hover:text-white'}`}
          >
            <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
            <span>Staff</span>
          </button>
        </div>
      )}

      <main
        className={
          teamPortalView
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden pt-0 pb-[calc(6.5rem+env(safe-area-inset-bottom,0px))] md:pb-16'
            : `flex flex-col flex-1 ${(!isStandalone && currentView === 'customer') ? 'pt-0' : 'pt-0'}`
        }
      >
        {teamPortalView ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {currentView === 'admin' && (
              adminUser ? (
                <AdminDashboard
                  bookings={adminBookings}
                  onLogout={() => { setAdminUser(null); apiAdmin.logout(); }}
                  currentUser={adminUser}
                />
              ) : (
                <LoginScreen
                  role="admin"
                  onLoginSuccess={(user) => setAdminUser(user)}
                  onBack={() => window.location.href = '/'}
                />
              )
            )}

            {currentView === 'staff' && (
              staffUser ? (
                <PortalErrorBoundary
                  fallbackTitle="Staff portal"
                  onReset={() => {
                    setStaffUser(null);
                    void apiStaff.logout();
                  }}
                >
                  <StaffPortal
                    onLogout={() => { setStaffUser(null); apiStaff.logout(); }}
                    currentUser={staffUser}
                    notifications={staffNotifications}
                  />
                </PortalErrorBoundary>
              ) : (
                <LoginScreen
                  role="staff"
                  onLoginSuccess={(user) => setStaffUser(user)}
                  onBack={() => window.location.href = '/'}
                />
              )
            )}
          </div>
        ) : (
          <div
            className={`${currentView === 'customer' && customerPage !== 'book' ? 'pt-0 pb-0' : 'py-6 sm:py-8'
              }`}
          >
            {currentView === 'customer' && (
              <PromoBanner surface={customerPage === 'book' ? 'booking' : 'homepage'} />
            )}

            {currentView === 'customer' && (
              customerPage === 'book' ? (
                <BookingWizard
                  currentUser={clientUser}
                  initialData={reorderBooking}
                  onComplete={(newBooking) => {
                    setClientBookings((prev) => [newBooking, ...prev]);
                    if (clientUser) {
                      setClientUser({
                        ...clientUser,
                        bookings: [...(clientUser.bookings || []), newBooking.id],
                      });
                    }
                    setReorderBooking(null);
                    try { sessionStorage.removeItem('nn_reorder_booking'); } catch { /* ignore */ }
                    void refetchAllBookings();
                  }}
                />
              ) : (
                <MarketingSite
                  page={customerPage}
                  blogSlug={blogSlug}
                  onBookNow={() => openCustomerPage('book')}
                  onNavigate={openCustomerPage}
                  onOpenBlogPost={(slug) => openCustomerPage('blog', { blogSlug: slug })}
                />

              )
            )}

            {currentView === 'portal' && (
              <CustomerPortal
                user={clientUser}
                setUser={setClientUser}
                bookings={clientBookings.filter((b) => {
                  if (!clientUser) return false;
                  const byId = String(b.customerId) === String(clientUser.id);
                  const byEmail =
                    !!clientUser.email &&
                    b.contact?.email?.trim().toLowerCase() === clientUser.email.trim().toLowerCase();
                  return byId || byEmail;
                })}
                onUpdateBooking={handleUpdateBooking}
                onStartNewBooking={() => openCustomerPage('book')}
                onReorder={handleReorder}
                onLogout={() => { setClientUser(null); apiClient.logout(); }}
                onLogin={(user) => setClientUser(user)}
                onBackToWebsite={() => openCustomerPage('home')}
              />
            )}
 
            {currentView === 'reset-password' && (
              <ResetPassword />
            )}
          </div>
        )}
      </main>

      {currentView === 'customer' && (
        <>
          <WhatsAppButton />
          {customerPage !== 'book' && <FirstTimePopup onBookNow={() => openCustomerPage('book')} />}
        </>
      )}

      {/* PWA Install Prompt Toast */}
      {showInstallPrompt && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-6 md:w-96 bg-slate-900 text-white p-5 sm:p-6 rounded-[2rem] shadow-2xl z-[100] animate-in slide-in-from-bottom-8 duration-500 flex items-center justify-between gap-3 safe-area-pb">
          <div>
            <h4 className="font-black text-lg">Install Team App</h4>
            <p className="text-slate-400 text-sm font-medium leading-tight mt-1">Get faster access to the portal.</p>
          </div>
          <button onClick={handleInstallClick} className="px-5 py-3 bg-white text-slate-900 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-105 transition-transform">
            Install
          </button>
          <button onClick={() => setShowInstallPrompt(false)} className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1 border-2 border-slate-900"><X className="w-4 h-4" /></button>
        </div>
      )}

      <CookieConsentBanner />
      {currentView === 'customer' && customerPage !== 'book' && <StickyMobileFooter />}
      {(currentView === 'customer' || currentView === 'portal') && (
        customerPage !== 'book' ? <AIAssistant brandName={brandName} /> : null
      )}
    </div>
  );
};

const AIAssistant: React.FC<{ brandName: string }> = ({ brandName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [chatLog, setChatLog] = useState<{ role: 'user' | 'ai', text: string }[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showWelcomeNudge, setShowWelcomeNudge] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setShowWelcomeNudge(false);
      return;
    }
    if (sessionStorage.getItem(AI_WELCOME_NUDGE_KEY) === '1') return;
    const openTimer = window.setTimeout(() => setShowWelcomeNudge(true), 1200);
    const closeTimer = window.setTimeout(() => {
      setShowWelcomeNudge(false);
      sessionStorage.setItem(AI_WELCOME_NUDGE_KEY, '1');
    }, 11000);
    return () => {
      window.clearTimeout(openTimer);
      window.clearTimeout(closeTimer);
    };
  }, [isOpen]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog, isTyping]);

  const handleSend = async () => {
    if (!message.trim()) return;
    const userMsg = message;
    setMessage('');
    setChatLog(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsTyping(true);
    try {
      const { getCleaningAdvice } = await import('./services/geminiService');
      const response = await getCleaningAdvice(userMsg, brandName);
      setChatLog((prev) => [...prev, { role: 'ai', text: response }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <>
      {/* Chat panel */}
      {isOpen && (
        <div className="cin-ai-panel fixed bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))] right-4 z-[91] w-[340px] max-w-[calc(100vw-2rem)] rounded-[2rem] bg-card shadow-[0_32px_64px_-12px_rgba(0,0,0,0.14)] border-2 border-border flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 duration-500 ease-out min-[769px]:bottom-[7.5rem] min-[769px]:right-6" style={{ maxHeight: 'min(500px, calc(100dvh - 12rem))' }}>
          <div className="bg-gradient-to-r from-primary to-indigo-800 p-5 text-primary-foreground flex justify-between items-center select-none shrink-0">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/25 rounded-2xl backdrop-blur-md flex items-center justify-center overflow-hidden ring-2 ring-white/30">
                <img src={BRAND_LOGO_PATH} alt="" className="w-8 h-8 object-contain" decoding="async" />
              </div>
              <div>
                <span className="block font-black text-sm uppercase tracking-wider">{brandName} AI</span>
                <span className="text-[10px] text-primary-foreground/80 font-medium">Concierge</span>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-muted/40">
            {chatLog.length === 0 && (
              <div className="bg-card p-4 rounded-3xl border border-border shadow-sm">
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Hi! I&apos;m the {brandName} expert. Need help picking a service or getting a cleaning quote?
                </p>
              </div>
            )}
            {chatLog.map((chat, i) => (
              <div key={i} className={`flex ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-5 py-3 rounded-3xl text-sm leading-relaxed ${chat.role === 'user'
                  ? 'bg-primary text-primary-foreground shadow-md rounded-tr-none'
                  : 'bg-card text-foreground border border-border shadow-sm rounded-tl-none'
                  }`}>
                  {chat.text}
                </div>
              </div>
            ))}
            {isTyping && <div className="text-primary text-xs font-black animate-pulse flex items-center ml-2">
              <Loader2 className="w-3 h-3 animate-spin mr-1" /> AI is thinking...
            </div>}
            <div ref={chatEndRef} />
          </div>
          <div className="p-4 bg-card border-t border-border shrink-0">
            <div className="flex items-center gap-3 bg-muted/60 p-2 rounded-2xl border-2 border-input focus-within:border-primary transition-colors">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="Ask anything..."
                className="flex-1 bg-transparent border-none focus:ring-0 focus:outline-none text-sm font-bold px-3 py-2 text-foreground placeholder:text-muted-foreground"
              />
              <button
                onClick={handleSend}
                disabled={!message.trim() || isTyping}
                className="p-2 bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/30 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100 transition-all"
              >
                <PlusCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Welcome nudge */}
      {!isOpen && showWelcomeNudge && (
        <button
          type="button"
          onClick={() => {
            setIsOpen(true);
            setShowWelcomeNudge(false);
            sessionStorage.setItem(AI_WELCOME_NUDGE_KEY, '1');
          }}
          className="cin-ai-tip fixed bottom-[calc(12rem+env(safe-area-inset-bottom,0px))] right-4 z-[91] max-w-[280px] text-left rounded-2xl border border-primary/20 bg-white px-4 py-3 shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-500 print:hidden min-[769px]:bottom-[10.5rem] min-[769px]:right-6"
        >
          <p className="text-sm font-black text-slate-900">Welcome to {brandName}.</p>
          <p className="text-xs text-slate-600 mt-1 leading-relaxed">
            Need help choosing a cleaning service? Tap here and I can guide you in seconds.
          </p>
        </button>
      )}

      {/* FAB — fixed above WhatsApp */}
      <button
        onClick={() => {
          setIsOpen((o) => !o);
          setShowWelcomeNudge(false);
          sessionStorage.setItem(AI_WELCOME_NUDGE_KEY, '1');
        }}
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
        className="cin-ai-fab fixed bottom-[calc(8rem+env(safe-area-inset-bottom,0px))] right-4 z-[91] group flex items-center justify-center w-12 h-12 min-[769px]:w-14 min-[769px]:h-14 rounded-full shadow-2xl shadow-primary/40 hover:scale-110 active:scale-95 transition-all duration-300 overflow-hidden print:hidden min-[769px]:bottom-[5.5rem] min-[769px]:right-6"
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-indigo-800 to-primary scale-150 group-hover:rotate-45 transition-transform duration-500" />
        {isOpen ? (
          <X className="w-6 h-6 text-white relative z-10" />
        ) : (
          <img src={BRAND_LOGO_PATH} alt="" className="w-8 h-8 object-contain relative z-10 drop-shadow-sm" decoding="async" />
        )}
        {!isOpen && showWelcomeNudge && <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-white animate-pulse z-20" />}
      </button>
    </>
  );
};

export default App;
