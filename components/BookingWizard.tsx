import React, { useState, useMemo, useEffect } from 'react';
import { formatHoursMinutes } from '../src/utils/bookingHelpers';
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Home,
  MapPin,
  ShieldCheck,
  Lock,
  Sparkles,
  User,
  Calendar,
  Clock,
  Briefcase,
  SprayCan,
  Trash2,
  Hotel,
  Building2,
  Droplets,
  Trees,
  ChevronDown,
  RotateCcw,
  Loader2
} from 'lucide-react';
import InvoiceView from './InvoiceView';
import PaymentChoicePicker from './PaymentChoicePicker';
import { useBusinessSettings } from '../src/context/BusinessSettingsContext';
import BookingConfirmation from './BookingConfirmation';
import { Booking, BookingStatus, PropertyDetails, UserAccount, ServiceConfig, Extra, WizardStepKey } from '../types';
import { apiClient } from '../services/api';
import {
  calculateHourlyPrice,
  hourlyRateFor,
  londonRateOf,
  lookupPricingRegion,
  type PricingRegion,
} from '../src/utils/pricing';
import {
  computeBookedDurationHours,
  getDurationBreakdown,
  isDeepOrEOTService,
  resolveDeepEotCallOutChargeGbp,
  resolveBookingFlowSteps,
  getServiceTrigger,
  wizardStepLiteral,
  COMMERCIAL_OR_JET_DETAILS_MIN_CHARS,
  isPlausibleBookingEmail,
  isPlausibleUkPostcode,
  normalizeUkPostcode,
  verifyUkPostcodeLive,
  isPlausibleBookingPhone,
  isBookingAtLeastNoticeHoursAhead,
} from '../src/utils/bookingHelpers';

/** Clock / cloak room WC line item - not Bathroom/Ensuite. A naive `includes('toilet')` match can hit "Bathroom & Toilet" first and hijack this control. */
function resolveToiletExtra(extras: Extra[]): Extra | undefined {
  if (!extras?.length) return undefined;
  const lower = (s: string) => s.toLowerCase();
  return (
    extras.find((e) => /(clock\s*room|clockroom|cloak\s*room|cloakroom)/i.test(e.name) && (/\bwc\b/i.test(e.name) || lower(e.name).includes('toilet'))) ||
    extras.find((e) => lower(e.name).includes('cloakroom') && !lower(e.name).includes('bathroom')) ||
    extras.find((e) => /cloak\s*room/i.test(e.name) && !lower(e.name).includes('bathroom')) ||
    extras.find((e) => lower(e.name).includes('clockroom') && !lower(e.name).includes('bathroom')) ||
    extras.find((e) => /clock\s*room/i.test(e.name) && !lower(e.name).includes('bathroom')) ||
    extras.find((e) => /\bwc\b/i.test(e.name) && !lower(e.name).includes('bathroom')) ||
    extras.find((e) => lower(e.name).includes('toilet') && !lower(e.name).includes('bathroom')) ||
    extras.find((e) => lower(e.name).includes('cloakroom'))
  );
}

interface Props {
  onComplete: (booking: Booking) => void;
  currentUser?: UserAccount | null;
  initialData?: Booking | null;
}

const STEPS = [
  'Service',
  'Details',
  'Extras',
  'Schedule',
  'Location',
  'Requirements',
  'Invoice',
  'Review'
];

/** Map optional step keys to their fixed absolute index in STEPS. Service (0) & Review (last) are always on. */
const STEP_KEY_INDEX: Record<WizardStepKey, number> = {
  details: 1,
  extras: 2,
  schedule: 3,
  location: 4,
  requirements: 5,
  invoice: 6,
};

/** Half-hour slots for schedule step (local same-day ordering). */
const WIZARD_TIME_SLOTS = (() => {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 30]) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return slots;
})();

/** Friendly titles and hints for each step (display only). */
const STEP_COPY: Record<string, { title: string; short: string; hint: string }> = {
  Service: { title: 'Choose your clean', short: 'Service', hint: 'Pick the type of clean and how often you would like it.' },
  Details: { title: 'About your home', short: 'Your home', hint: 'This sets the time we need and your price.' },
  Extras: { title: 'Add extras', short: 'Extras', hint: 'Optional jobs we can do while we are there.' },
  Schedule: { title: 'Pick a date and time', short: 'Date', hint: 'Choose when you would like your cleaner to arrive.' },
  Location: { title: 'Your details and address', short: 'Address', hint: 'So we know where to go and how to reach you.' },
  Requirements: { title: 'Anything else?', short: 'Notes', hint: 'Access, parking, pets or anything your cleaner should know.' },
  Invoice: { title: 'Check your price', short: 'Price', hint: 'Add a promo code or tip, then review the breakdown and agree to the terms.' },
  Review: { title: 'Review and book', short: 'Review', hint: 'One last look before you send your booking request.' },
};

const FREQUENCY_HINT: Record<string, string> = {
  'One-time': 'A single visit',
  Weekly: 'Every week',
  Fortnightly: 'Every two weeks',
  Monthly: 'Once a month',
};

/** Groups the half-hour slots on the schedule step (display only). */
const TIME_GROUPS = [
  { label: 'Morning', from: 6, to: 12 },
  { label: 'Afternoon', from: 12, to: 17 },
  { label: 'Evening', from: 17, to: 24 },
  { label: 'Early hours', from: 0, to: 6 },
];

function resolveAirbnbDurationFromBedrooms(bedrooms: number): number {
  if (!Number.isFinite(bedrooms) || bedrooms < 1) return 0;
  // 1 bed = 2h, 2 bed = 3h, 3 bed = 4h, 4 bed = 5h, 5 bed = 6h.
  return bedrooms + 1;
}


const BookingWizard: React.FC<Props> = ({ onComplete, currentUser, initialData }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [bookingConflictWarning, setBookingConflictWarning] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const errorRef = React.useRef<HTMLDivElement>(null);

  // Data State
  const [services, setServices] = useState<ServiceConfig[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setLoadingError(null);
      try {
        const [fetchedServices, fetchedExtras] = await Promise.all([
          apiClient.getServices(),
          apiClient.getExtraServices()
        ]);
        setServices(fetchedServices || []);
        setExtras(fetchedExtras || []);
      } catch (err: any) {
        console.error("Failed to load booking data", err);
        setLoadingError("Unable to connect to the booking server. Please check your internet connection.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const IconMap: Record<string, React.ReactNode> = {
    Home: <Home className="w-6 h-6" />,
    Sparkles: <Sparkles className="w-6 h-6" />,
    Trash2: <Trash2 className="w-6 h-6" />,
    Hotel: <Hotel className="w-6 h-6" />,
    Building2: <Building2 className="w-6 h-6" />,
    Droplets: <Droplets className="w-6 h-6" />,
    SprayCan: <SprayCan className="w-6 h-6" />,
    Trees: <Trees className="w-6 h-6" />
  };

  const renderIcon = (iconName: string) => IconMap[iconName] || <Sparkles className="w-6 h-6" />;

  // Form State
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [propertyDetails, setPropertyDetails] = useState<PropertyDetails>({
    bedrooms: 1, bathrooms: 1, toilets: 0, livingRooms: 1, kitchens: 1, size: 'Studio', sqft: 0, clockRoomToilets: 0
  });
  const [frequency, setFrequency] = useState<'One-time' | 'Weekly' | 'Fortnightly' | 'Monthly'>('One-time');
  const [duration, setDuration] = useState<number>(3);
  const [notifyIfMoreTimeNeeded, setNotifyIfMoreTimeNeeded] = useState(false);
  const [selectedExtras, setSelectedExtras] = useState<{ id: string, quantity: number }[]>([]);
  const [date, setDate] = useState<string>('');
  const [time, setTime] = useState<string>('');
  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [address, setAddress] = useState({ line1: '', line2: '', city: '', postcode: '' });
  const [instructions, setInstructions] = useState('');
  const [cleaningMaterials, setCleaningMaterials] = useState<'none' | 'hoover_only' | 'hoover_and_materials'>('none');
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [depositTermsAccepted, setDepositTermsAccepted] = useState(false);
  /** Pay the deposit now (default) or pay in full; the server sets the card payment to match. */
  const [paymentChoice, setPaymentChoice] = useState<'deposit' | 'full'>('deposit');
  const { depositPolicy } = useBusinessSettings();
  const wizardDepositPercent = Number.isFinite(Number(depositPolicy?.requiredPercent))
    ? Math.min(100, Math.max(0, Number(depositPolicy?.requiredPercent)))
    : 40;
  const [tipPercent, setTipPercent] = useState(0);
  const [customTip, setCustomTip] = useState<string>('');
  const [commercialDetails, setCommercialDetails] = useState<string>('');
  const [postcodeVerified, setPostcodeVerified] = useState(false);
  const [postcodeVerifying, setPostcodeVerifying] = useState(false);
  const [postcodeVerifyMsg, setPostcodeVerifyMsg] = useState<string>('');
  /** Pricing region from the property postcode (London rate applies inside Greater London). */
  const [pricingRegion, setPricingRegion] = useState<PricingRegion | null>(null);
  const [regionChecking, setRegionChecking] = useState(false);

  // Discount State
  const [discountCode, setDiscountCode] = useState('');
  const [discountError, setDiscountError] = useState('');
  const [appliedDiscount, setAppliedDiscount] = useState<{ code: string, type: 'fixed' | 'percentage', value: number } | null>(null);
  const [isValidatingDiscount, setIsValidatingDiscount] = useState(false);

  const [isInitialized, setIsInitialized] = useState(false);

  // Computed skip logic
  const availableServices = useMemo(
    () => services.filter((s) => s.active !== false),
    [services]
  );
  const selectedService = useMemo(
    () => availableServices.find(s => String(s.id) === String(serviceId)),
    [serviceId, availableServices]
  );

  /** Standard cleans with a London rate need the postcode before a price can be shown. */
  const isStandardService = Boolean(selectedService) && getServiceTrigger(selectedService) === 'standard';
  const usesRegionalRate = isStandardService && londonRateOf(selectedService) !== null;
  const effectiveHourlyRate = selectedService
    ? isStandardService
      ? hourlyRateFor(selectedService, pricingRegion)
      : Number(selectedService.baseRate) || 0
    : 0;
  const regionReady = !usesRegionalRate || (pricingRegion !== null && !regionChecking);

  useEffect(() => {
    if (!serviceId) return;
    const stillAvailable = availableServices.some((s) => String(s.id) === String(serviceId));
    if (!stillAvailable) setServiceId(null);
  }, [serviceId, availableServices]);

  const postcodeInitRef = React.useRef(true);
  useEffect(() => {
    if (postcodeInitRef.current) {
      postcodeInitRef.current = false;
      return;
    }
    setPostcodeVerified(false);
    setPostcodeVerifyMsg('');
  }, [address.postcode]);

  // Work out the pricing region whenever the postcode changes (debounced; ignores stale replies).
  useEffect(() => {
    const normalized = normalizeUkPostcode(address.postcode);
    if (!isPlausibleUkPostcode(normalized)) {
      setPricingRegion(null);
      setRegionChecking(false);
      return;
    }
    let cancelled = false;
    setRegionChecking(true);
    const timer = setTimeout(() => {
      lookupPricingRegion(normalized).then((result) => {
        if (cancelled) return;
        setPricingRegion(result?.region ?? null);
        setRegionChecking(false);
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [address.postcode]);

  /** Admin-configured optional step keys (e.g. ['details','schedule','location','requirements']). */
  const enabledStepKeys = useMemo<WizardStepKey[]>(
    () => resolveBookingFlowSteps(selectedService ?? null),
    [selectedService]
  );

  /** Absolute STEP indices that should be SKIPPED in the wizard for the current service. */
  const skippedStepIndices = useMemo(() => {
    const enabled = new Set<number>(enabledStepKeys.map(k => STEP_KEY_INDEX[k]));
    const skipped: number[] = [];
    for (const key of Object.keys(STEP_KEY_INDEX) as WizardStepKey[]) {
      const idx = STEP_KEY_INDEX[key];
      if (!enabled.has(idx)) skipped.push(idx);
    }
    return skipped;
  }, [enabledStepKeys]);

  const invoiceStepSkipped = skippedStepIndices.includes(STEP_KEY_INDEX.invoice);

  const activeSteps = useMemo(
    () => STEPS.filter((_, idx) => !skippedStepIndices.includes(idx)),
    [skippedStepIndices]
  );

  const displayStepNumber = (absoluteIndex: number) => {
    // Count how many enabled steps (including this one) sit at or before the absolute index.
    let num = 0;
    for (let i = 0; i <= absoluteIndex; i++) {
      if (!skippedStepIndices.includes(i)) num += 1;
    }
    return num;
  };

  // LocalStorage Sync
  useEffect(() => {
    if (!loading && services.length > 0 && !isInitialized) {
      if (!initialData) {
        const saved = localStorage.getItem('niceNeatWizardState');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setCurrentStep(Number(parsed.currentStep) || 0);
            setServiceId(parsed.serviceId);
            setPropertyDetails(parsed.propertyDetails || {
              bedrooms: 1,
              bathrooms: 1,
              toilets: 0,
              livingRooms: 1,
              kitchens: 1,
              size: 'Studio',
              sqft: 0,
              clockRoomToilets: 0,
            });
            setFrequency(parsed.frequency || 'One-time');
            setDuration(Number(parsed.duration) || 3);
            setSelectedExtras(parsed.selectedExtras || []);
            setDate(parsed.date || '');
            setTime(parsed.time || '');
            setCustomer(parsed.customer || { name: '', email: '', phone: '' });
            postcodeInitRef.current = true;
            setAddress(parsed.address || { line1: '', line2: '', city: '', postcode: '' });
            setInstructions(parsed.instructions || '');
            setSmsOptIn(parsed.smsOptIn || false);
            setTipPercent(Number(parsed.tipPercent) || 0);
            setCustomTip(typeof parsed.customTip === 'string' ? parsed.customTip : '');
            setCommercialDetails(parsed.commercialDetails || '');
            setDiscountCode(typeof parsed.discountCode === 'string' ? parsed.discountCode : '');
            setAppliedDiscount(
              parsed.appliedDiscount &&
                typeof parsed.appliedDiscount === 'object' &&
                parsed.appliedDiscount.code &&
                (parsed.appliedDiscount.type === 'fixed' || parsed.appliedDiscount.type === 'percentage')
                ? {
                    code: String(parsed.appliedDiscount.code),
                    type: parsed.appliedDiscount.type,
                    value: Number(parsed.appliedDiscount.value) || 0,
                  }
                : null,
            );
            setDepositTermsAccepted(Boolean(parsed.depositTermsAccepted));
            if (parsed.paymentChoice === 'full') setPaymentChoice('full');
            setNotifyIfMoreTimeNeeded(Boolean(parsed.notifyIfMoreTimeNeeded));
            if (parsed.postcodeVerified) setPostcodeVerified(true);
          } catch (e) {
            console.error("Could not parse saved state", e);
            localStorage.removeItem('niceNeatWizardState');
          }
        }
      }
      setIsInitialized(true);
    }
  }, [loading, services, initialData, isInitialized]);

  useEffect(() => {
    if (isInitialized && !isCompleted && !initialData) {
      localStorage.setItem('niceNeatWizardState', JSON.stringify({
        currentStep,
        serviceId,
        propertyDetails,
        frequency,
        duration,
        selectedExtras,
        date,
        time,
        customer,
        address,
        instructions,
        smsOptIn,
        tipPercent,
        customTip,
        commercialDetails,
        discountCode,
        appliedDiscount,
        depositTermsAccepted,
        paymentChoice,
        notifyIfMoreTimeNeeded,
        postcodeVerified,
      }));
    }
  }, [
    isInitialized,
    isCompleted,
    initialData,
    currentStep,
    serviceId,
    propertyDetails,
    frequency,
    duration,
    selectedExtras,
    date,
    time,
    customer,
    address,
    instructions,
    smsOptIn,
    tipPercent,
    customTip,
    commercialDetails,
    discountCode,
    appliedDiscount,
    depositTermsAccepted,
    paymentChoice,
    notifyIfMoreTimeNeeded,
    postcodeVerified,
  ]);

  const handleServiceTypeSelect = (newId: string) => {
    if (serviceId && serviceId !== newId) {
      // Clear selections according to PRD
      setSelectedExtras([]);
      setTipPercent(0);
      setCustomTip('');
    }
    setServiceId(newId);
  };

  // Resolve reorder service id once services are loaded (serviceType on booking is usually the display name).
  useEffect(() => {
    if (!initialData || availableServices.length === 0) return;
    const match = availableServices.find(
      (s) => s.name === initialData.serviceType || String(s.id) === String(initialData.serviceType),
    );
    if (match) setServiceId(String(match.id));
  }, [initialData, availableServices]);

  // Pre-fill if user is logged in or initialData provided
  useEffect(() => {
    if (initialData) {
      setPropertyDetails(initialData.propertyDetails);
      setFrequency(initialData.frequency || 'One-time');
      setDuration(initialData.duration || 3);
      setNotifyIfMoreTimeNeeded(initialData.propertyDetails.notifyIfMoreTimeNeeded || false);
      setSelectedExtras(initialData.extras);
      setCustomer(initialData.contact);
      setAddress(initialData.address);
      setInstructions(initialData.instructions || '');
      const cd =
        typeof initialData.propertyDetails?.commercialDetails === 'string'
          ? initialData.propertyDetails.commercialDetails
          : '';
      setCommercialDetails(cd);
      setSmsOptIn(Boolean(initialData.propertyDetails?.smsUpdatesOptIn));
      // Date and Time are intentionally NOT copied for reordering, user must pick new slot
    } else if (currentUser) {
      setCustomer({
        name: currentUser.name,
        email: currentUser.email,
        phone: ''
      });
    }
  }, [currentUser, initialData]);

  const handleApplyDiscount = async () => {
    if (!discountCode.trim()) return;
    setIsValidatingDiscount(true);
    setDiscountError('');
    try {
      const res = await apiClient.validateDiscount(discountCode);
      if (res.valid && res.discount) {
        setAppliedDiscount({
          code: res.discount.code,
          type: res.discount.type,
          value: Number(res.discount.value)
        });
      } else {
        setDiscountError(res.message || 'Invalid code');
        setAppliedDiscount(null);
      }
    } catch (err: any) {
      setDiscountError(err.message || 'Failed to validate code');
      setAppliedDiscount(null);
    } finally {
      setIsValidatingDiscount(false);
    }
  };

  const handleVerifyPostcode = async () => {
    const normalized = normalizeUkPostcode(address.postcode);
    if (!isPlausibleUkPostcode(normalized)) {
      setPostcodeVerified(false);
      setPostcodeVerifyMsg('Enter a valid UK postcode format first.');
      return;
    }
    setPostcodeVerifying(true);
    setPostcodeVerifyMsg('');
    const verified = await verifyUkPostcodeLive(normalized);
    setPostcodeVerifying(false);
    setAddress((prev) => ({ ...prev, postcode: verified.normalized }));
    if (verified.ok) {
      setPostcodeVerified(true);
      setPostcodeVerifyMsg('Postcode verified.');
      return;
    }
    setPostcodeVerified(false);
    setPostcodeVerifyMsg('We could not verify this postcode. Please check and try again.');
  };




  // Update default duration when service changes
  useEffect(() => {
    if (selectedService) {
      const trig = getServiceTrigger(selectedService);
      if (trig === 'airbnb') {
        setPropertyDetails((prev) => ({ ...prev, bedrooms: 0 }));
        setDuration(0);
      } else if (trig === 'deep' || trig === 'end_of_tenancy') {
        const minH = Math.max(3, Number(selectedService.minDuration) || 3);
        setDuration(minH);
      } else {
        setDuration(selectedService.minDuration || 3);
      }
    }
  }, [selectedService]);

  // Total booked hours (single source with invoices / confirmations - see bookingHelpers)
  const calculatedDuration = useMemo(() => {
    if (!selectedService) return 3;
    return computeBookedDurationHours(
      {
        serviceType: selectedService.name,
        duration,
        extras: selectedExtras,
      },
      selectedService,
      extras
    );
  }, [selectedService, duration, selectedExtras, extras]);

  const toiletExtraFromCatalog = useMemo(() => resolveToiletExtra(extras), [extras]);

  useEffect(() => {
    // Keep Clockroom Toilet property qty and selected extra line in sync
    // so price (+£15 each) and time (+0.5h each) are always reflected.
    const trig = getServiceTrigger(selectedService);
    const isItemized = trig === 'deep' || trig === 'end_of_tenancy';
    if (!isItemized || !toiletExtraFromCatalog) return;
    const targetQty = Math.max(0, Number(propertyDetails.clockRoomToilets ?? propertyDetails.toilets ?? 0));
    const extraId = String(toiletExtraFromCatalog.id);
    setSelectedExtras((prev) => {
      const current = prev.find((p) => String(p.id) === extraId);
      const currentQty = current?.quantity ?? 0;
      if (currentQty === targetQty) return prev;
      const others = prev.filter((p) => String(p.id) !== extraId);
      return targetQty > 0 ? [...others, { id: toiletExtraFromCatalog.id, quantity: targetQty }] : others;
    });
  }, [selectedService, toiletExtraFromCatalog, propertyDetails.clockRoomToilets, propertyDetails.toilets]);

  /** Deep / EOT: time breakdown uses min hours as scheduling guidance; pricing is call-out + each extra’s own £. */
  const itemizedDurationBreakdown = useMemo(() => {
    if (!selectedService) return null;
    if (!isDeepOrEOTService(selectedService, selectedService.name)) return null;
    return getDurationBreakdown(
      { serviceType: selectedService.name, duration, extras: selectedExtras },
      selectedService,
      extras
    );
  }, [selectedService, duration, selectedExtras, extras]);

  // Real-Time Pricing Engine (subtotal after discount, tip, grand total)
  const pricing = useMemo(() => {
    if (!selectedService) {
      return {
        calculatedSubtotal: 0,
        discountAmount: 0,
        totalAfterDiscount: 0,
        tipAmount: 0,
        grandTotal: 0,
        base: undefined as number | undefined,
      };
    }

    const baseRate = Number(selectedService.baseRate) || 0;
    let calculated = 0;

    const trig = getServiceTrigger(selectedService);

    // Standard cleans: shared pence-exact calculation (same function the API uses to verify the total).
    if (trig === 'standard') {
      const p = calculateHourlyPrice({
        hourlyRate: effectiveHourlyRate,
        hours: duration || 2,
        extras: selectedExtras
          .map((item) => {
            const extra = extras.find((e) => e.id === item.id);
            return extra ? { price: extra.price, quantity: item.quantity } : null;
          })
          .filter(Boolean) as Array<{ price: number; quantity: number }>,
        cleaningMaterials,
        discount: appliedDiscount ? { type: appliedDiscount.type, value: appliedDiscount.value } : null,
        tip: tipPercent === -1 ? { amount: Number(customTip) || 0 } : { percent: tipPercent },
      });
      return {
        calculatedSubtotal: p.subtotal,
        discountAmount: p.discount,
        totalAfterDiscount: p.afterDiscount,
        tipAmount: p.tip,
        grandTotal: p.total,
        base: p.base,
      };
    }

    const isAirBnB = trig === 'airbnb';
    const isCommercialOrJet = trig === 'commercial' || trig === 'jet_washing';
    const isDeepOrEOT = trig === 'deep' || trig === 'end_of_tenancy';

    if (isCommercialOrJet) {
      calculated = 0;
    } else if (isAirBnB) {
      const airbnbHours = resolveAirbnbDurationFromBedrooms(Number(propertyDetails.bedrooms));
      calculated = baseRate * airbnbHours;
    } else if (isDeepOrEOT) {
      const callOutGbp = resolveDeepEotCallOutChargeGbp(selectedService);
      const extrasCost = selectedExtras.reduce((sum, item) => {
        const ex = extras.find((e) => e.id === item.id);
        if (!ex) return sum;
        return sum + Number(ex.price) * item.quantity;
      }, 0);
      calculated = callOutGbp + extrasCost;
    } else {
      calculated = baseRate * (duration || 2);
    }

    let discountAmount = 0;
    if (appliedDiscount) {
      if (appliedDiscount.type === 'percentage') {
        discountAmount = calculated * (appliedDiscount.value / 100);
      } else {
        discountAmount = appliedDiscount.value;
      }
    }

    const totalAfterDiscount = Math.max(0, calculated - discountAmount);
    const tipAmount = tipPercent === -1 ? (Number(customTip) || 0) : totalAfterDiscount * (tipPercent / 100);
    const grandTotal = totalAfterDiscount + tipAmount;

    return {
      calculatedSubtotal: calculated,
      discountAmount,
      totalAfterDiscount,
      tipAmount,
      grandTotal,
      base: undefined as number | undefined,
    };
  }, [selectedService, serviceId, propertyDetails, selectedExtras, tipPercent, customTip, extras, duration, appliedDiscount, cleaningMaterials, effectiveHourlyRate]);

  const totalPrice = pricing.grandTotal;

  // Referral credit (cleaning credit, no cash value) for a signed-in client. The server takes it off
  // when the booking is saved; it is shown here so the client sees what they will actually pay.
  const [creditBalance, setCreditBalance] = useState(0);
  useEffect(() => {
    if (currentUser?.role !== 'customer') {
      setCreditBalance(0);
      return;
    }
    apiClient.getReferralSummary().then((r) => setCreditBalance(r.credit?.balance ?? 0)).catch(() => setCreditBalance(0));
  }, [currentUser?.id, currentUser?.role]);
  const quoteBasedService = (() => {
    const t = getServiceTrigger(selectedService);
    return t === 'commercial' || t === 'jet_washing';
  })();
  const referralCredit = quoteBasedService ? 0 : Math.round(Math.min(creditBalance, Number(totalPrice) || 0) * 100) / 100;
  const payableTotal = Math.round(((Number(totalPrice) || 0) - referralCredit) * 100) / 100;

  const londonRate = londonRateOf(selectedService);
  const regionNote = (
    <p
      className={`text-xs font-bold ${
        pricingRegion === 'london' ? 'text-blue-700' : pricingRegion === 'standard' ? 'text-emerald-700' : 'text-slate-500'
      }`}
      aria-live="polite"
    >
      {regionChecking
        ? 'Checking your area...'
        : pricingRegion === 'london'
          ? `London postcode: £${effectiveHourlyRate.toFixed(2)} per hour`
          : pricingRegion === 'standard'
            ? `£${effectiveHourlyRate.toFixed(2)} per hour for this postcode`
            : `We use your postcode for the right hourly rate: £${(Number(selectedService?.baseRate) || 0).toFixed(2)}/hr${
                londonRate !== null ? `, London £${londonRate.toFixed(2)}/hr` : ''
              }.`}
    </p>
  );

  const showError = (msg: string) => {
    setError(msg);
    setTimeout(() => errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60);
  };

  const validateStep = () => {
    setError(null);
    const step = wizardStepLiteral(currentStep);

    if (step === 'service' && !serviceId) {
      showError('Please choose a service type to continue.');
      return false;
    }

    if (step === 'details' && selectedService) {
      if (usesRegionalRate) {
        if (!isPlausibleUkPostcode(normalizeUkPostcode(address.postcode))) {
          showError('Please enter the property postcode so we can show your exact price.');
          return false;
        }
        if (!regionReady) {
          showError('Checking your postcode for pricing. Please try again in a moment.');
          return false;
        }
      }
      const trig = getServiceTrigger(selectedService);
      if (trig === 'airbnb' && Number(propertyDetails.bedrooms) < 1) {
        showError('Please select number of bedroom(s) to continue.');
        return false;
      }
      if (trig === 'commercial' || trig === 'jet_washing') {
        if (commercialDetails.trim().length < COMMERCIAL_OR_JET_DETAILS_MIN_CHARS) {
          showError(
            `Please add at least ${COMMERCIAL_OR_JET_DETAILS_MIN_CHARS} characters describing the site or surfaces so we can prepare an accurate quote.`,
          );
          return false;
        }
      }
    }

    if (step === 'schedule') {
      if (!date || !time) {
        showError('Please select a date and time.');
        return false;
      }
      if (selectedService) {
        const minH = Number(selectedService.minNotice);
        const notice = Number.isFinite(minH) && minH > 0 ? minH : 0;
        if (!isBookingAtLeastNoticeHoursAhead(date, time, notice)) {
          showError(
            notice > 0
              ? `Please choose a slot at least ${notice} hour(s) from now to match this service's notice policy.`
              : 'Please choose a valid future date and time.',
          );
          return false;
        }
      }
    }

    if (step === 'location') {
      const name = customer.name.trim();
      const email = customer.email.trim();
      const phone = customer.phone.trim();
      if (!name || !email || !address.line1.trim() || !address.city.trim() || !address.postcode.trim()) {
        showError('Full name, email, address line 1, city, and postcode are required.');
        return false;
      }
      if (!isPlausibleBookingEmail(email)) {
        showError('Please enter a valid email address.');
        return false;
      }
      if (!isPlausibleUkPostcode(address.postcode)) {
        showError('Please enter a valid UK postcode.');
        return false;
      }
      if (!postcodeVerified) {
        showError('Please verify your postcode before continuing.');
        return false;
      }
      if (!regionReady) {
        showError('Checking your postcode for pricing. Please try again in a moment.');
        return false;
      }
      if (!isPlausibleBookingPhone(phone)) {
        showError('Please enter a valid phone number (at least 10 digits).');
        return false;
      }
    }

    if (step === 'invoice' && !depositTermsAccepted) {
      showError('Please tick the payment agreement to continue.');
      return false;
    }

    return true;
  };

  const next = () => {
    if (!validateStep()) return;

    let nextStep = currentStep + 1;
    while (nextStep < STEPS.length - 1 && skippedStepIndices.includes(nextStep)) {
      nextStep += 1;
    }

    setCurrentStep(Math.min(nextStep, STEPS.length - 1));
  };

  const back = () => {
    setError(null);
    let prevStep = currentStep - 1;

    while (prevStep > 0 && skippedStepIndices.includes(prevStep)) {
      prevStep -= 1;
    }

    setCurrentStep(Math.max(prevStep, 0));
  };

  const handleFinalSubmit = async () => {
    if (!serviceId || !date || !time || !customer.name.trim() || !customer.email.trim() || !address.line1.trim() || !address.postcode.trim() || !address.city.trim()) {
      showError('Please complete service, schedule, and full address details before booking.');
      return;
    }
    if (!isPlausibleBookingEmail(customer.email)) {
      showError('Please enter a valid email address.');
      return;
    }
    if (!isPlausibleUkPostcode(address.postcode)) {
      showError('Please enter a valid UK postcode.');
      return;
    }
    if (!postcodeVerified) {
      showError('Please verify your postcode before submitting your booking request.');
      return;
    }
    if (!regionReady) {
      showError('Checking your postcode for pricing. Please try again in a moment.');
      return;
    }
    if (!isPlausibleBookingPhone(customer.phone)) {
      showError('Please enter a valid phone number (at least 10 digits).');
      return;
    }
    if (selectedService) {
      const minH = Number(selectedService.minNotice);
      const notice = Number.isFinite(minH) && minH > 0 ? minH : 0;
      if (!isBookingAtLeastNoticeHoursAhead(date, time, notice)) {
        showError(
          notice > 0
            ? `Your slot must be at least ${notice} hour(s) from now. Please adjust the date or time.`
            : 'Please choose a valid future date and time.',
        );
        return;
      }
    }
    if (!depositTermsAccepted) {
      showError(
        invoiceStepSkipped
          ? 'Please tick the payment and cancellation agreement below before submitting.'
          : 'Please tick the payment agreement on the invoice step.',
      );
      return;
    }
    if (tipPercent === -1 && (!Number.isFinite(Number(customTip)) || Number(customTip) < 0)) {
      showError('Please enter a valid custom tip amount in £, or choose a percentage tip.');
      return;
    }
    setIsProcessing(true);
    setError(null);
    try {
      const discountAmountForServer =
        appliedDiscount && pricing.discountAmount > 0 ? Number(pricing.discountAmount.toFixed(2)) : 0;

      const bookingData: Partial<Booking> & { depositTermsAccepted: boolean; discountAmount?: number; tipAmount?: number } = {
        serviceType: selectedService?.name || serviceId!,
        propertyDetails: {
          ...propertyDetails,
          duration: calculatedDuration,
          notifyIfMoreTimeNeeded,
          commercialDetails: commercialDetails.trim() || undefined,
          smsUpdatesOptIn: smsOptIn,
          ...(cleaningMaterials !== 'none' ? { cleaningMaterials } : {}),
          ...(selectedService && isDeepOrEOTService(selectedService, selectedService.name)
            ? { callOutCharge: resolveDeepEotCallOutChargeGbp(selectedService) }
            : {}),
        },
        duration: calculatedDuration,
        extras: selectedExtras,
        frequency,
        date,
        time,
        contact: customer,
        address,
        instructions,
        totalPrice,
        status: BookingStatus.PENDING,
        discountCode: appliedDiscount?.code,
        discountAmount: discountAmountForServer,
        tipAmount: Number(pricing.tipAmount.toFixed(2)),
        customerId: currentUser?.id,
        depositTermsAccepted: true,
        paymentChoice,
      };

      const res = await apiClient.createBooking(bookingData);
      const warning = res.conflictWarning;
      setBookingConflictWarning(
        warning
          ? 'Your booking has been submitted and is pending confirmation. The time you chose may overlap with another booking, so our team will check it and confirm with you shortly.'
          : null
      );
      const fullBooking: Booking = {
        ...(bookingData as Booking),
        id: res.id,
        bookingId: res.bookingId,
        createdAt: new Date().toISOString(),
        depositTermsAcceptedAt: res.depositTermsAcceptedAt,
        stripePaymentLink: res.stripePaymentLink || '',
        // The server's final price (after any referral credit) is what the client pays.
        ...(typeof res.totalPrice === 'number' ? { totalPrice: res.totalPrice } : {}),
        ...(res.referralCreditUsed ? { referralCreditUsed: res.referralCreditUsed } : {}),
      };

      localStorage.removeItem('niceNeatWizardState');
      setConfirmedBooking(fullBooking);
      onComplete(fullBooking);
      setIsCompleted(true);
    } catch (err) {
      console.error('Booking create failed:', err);
      const message = err instanceof Error && err.message
        ? err.message
        : 'Booking failed. Please check your connection and try again.';
      showError(message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => setShowResetConfirm(true);

  const confirmReset = () => {
    setShowResetConfirm(false);
    setCurrentStep(0);
    setServiceId(null);
    setPropertyDetails({ bedrooms: 1, bathrooms: 1, toilets: 0, livingRooms: 1, kitchens: 1, size: 'Studio', sqft: 0, clockRoomToilets: 0 });
    setFrequency('One-time');
    setDuration(3);
    setNotifyIfMoreTimeNeeded(false);
    setSelectedExtras([]);
    setDate('');
    setTime('');
    setAddress({ line1: '', line2: '', city: '', postcode: '' });
    setInstructions('');
    setCleaningMaterials('none');
    setSmsOptIn(false);
    setDepositTermsAccepted(false);
    setTipPercent(0);
    setCustomTip('');
    setDiscountCode('');
    setAppliedDiscount(null);
    setCommercialDetails('');
    setError(null);
    if (currentUser) {
      setCustomer({ name: currentUser.name, email: currentUser.email, phone: '' });
    } else {
      setCustomer({ name: '', email: '', phone: '' });
    }
    localStorage.removeItem('niceNeatWizardState');
  };

  if (isCompleted && confirmedBooking) {
    return (
      <BookingConfirmation
        booking={confirmedBooking}
        services={services}
        extrasList={extras}
        conflictWarningText={bookingConflictWarning}
        onBookAnother={() => window.location.reload()}
        depositConsent={{
          variant: 'record',
          acceptedAt: confirmedBooking.depositTermsAcceptedAt,
        }}
      />
    );
  }

  if (loadingError) {
    return (
      <div className="mx-auto w-full max-w-xl px-4">
        <div className="rounded-3xl border border-red-100 bg-white p-8 text-center shadow-sm sm:p-12">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
            <Trash2 className="h-7 w-7" />
          </div>
          <h3 className="mt-5 text-xl font-semibold text-slate-900">We could not load the booking form</h3>
          <p className="mt-2 text-sm text-slate-500">{loadingError}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            <RotateCcw className="h-4 w-4" /> Try again
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="space-y-4 rounded-3xl border border-slate-200/80 bg-white p-6 lg:col-span-8 sm:p-8">
            <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
            <div className="h-8 w-64 animate-pulse rounded bg-slate-200" />
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
            <p className="flex items-center gap-2 pt-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading services and prices…
            </p>
          </div>
          <div className="hidden h-80 animate-pulse rounded-3xl bg-white ring-1 ring-slate-200/80 lg:col-span-4 lg:block" />
        </div>
      </div>
    );
  }

  const trigNow = getServiceTrigger(selectedService);
  const isQuoteOnly = trigNow === 'commercial' || trigNow === 'jet_washing';
  const stepName = STEPS[currentStep];
  const stepCopy = STEP_COPY[stepName] || { title: stepName, hint: '' };
  const stepPos = displayStepNumber(currentStep);
  const durationLabel = formatHoursMinutes(calculatedDuration);
  const prettyDate = date
    ? new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const servicePriceHint = (svc: ServiceConfig) => {
    const t = getServiceTrigger(svc);
    if (t === 'commercial' || t === 'jet_washing') return 'Quote based';
    if (t === 'deep' || t === 'end_of_tenancy') return `From £${resolveDeepEotCallOutChargeGbp(svc)}`;
    const london = t === 'standard' ? londonRateOf(svc) : null;
    return london !== null ? `£${Number(svc.baseRate).toFixed(0)}/hr · London £${london.toFixed(0)}/hr` : `£${Number(svc.baseRate).toFixed(0)}/hr`;
  };
  const labelCls = 'text-sm font-semibold text-slate-800';
  const selectCls =
    'w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10';
  const textareaCls =
    'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10';
  const infoBox = (icon: React.ReactNode, title: React.ReactNode, body: React.ReactNode) => (
    <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm ring-1 ring-primary/10">{icon}</div>
      <div className="min-w-0 text-sm">
        <p className="font-semibold text-slate-900">{title}</p>
        <div className="mt-0.5 leading-relaxed text-slate-600">{body}</div>
      </div>
    </div>
  );

  return (
    <div className="relative isolate mx-auto max-w-6xl px-4 pb-28 sm:px-6 lg:pb-0">
      <div className="mb-6 sm:mb-8">
        <p className="text-sm font-medium text-primary">Book a clean</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">Your price updates as you go</h2>
        <p className="mt-1 text-sm text-slate-500">It takes about two minutes. You will not be asked for card details on this form.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
      <div className="min-w-0 space-y-6 lg:col-span-8">
        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.12)]">
          {/* Stepper */}
          <div className="border-b border-slate-100 px-5 pb-5 pt-5 sm:px-8 sm:pt-7">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-slate-500">
                Step {stepPos} of {activeSteps.length}
              </p>
              {currentStep > 0 && (
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                  title="Start over"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Start over
                </button>
              )}
            </div>
            <ol className="mt-3 flex gap-1.5" aria-label="Booking steps">
              {activeSteps.map((s, i) => {
                const done = i < stepPos - 1;
                const current = i === stepPos - 1;
                return (
                  <li key={s} className="min-w-0 flex-1">
                    <div className={`h-1.5 rounded-full transition-colors ${done ? 'bg-primary' : current ? 'bg-primary/60' : 'bg-slate-200'}`} />
                    <p className={`mt-1.5 hidden truncate text-[11px] font-medium sm:block ${current ? 'text-primary' : done ? 'text-slate-600' : 'text-slate-400'}`}>
                      {done ? '✓ ' : ''}
                      {STEP_COPY[s]?.short || s}
                    </p>
                  </li>
                );
              })}
            </ol>
            <h3 className="mt-5 text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">{stepCopy.title}</h3>
            {stepCopy.hint ? <p className="mt-1 text-sm text-slate-500">{stepCopy.hint}</p> : null}
            {error && (
              <div ref={errorRef} className="mt-4 flex animate-in slide-in-from-top-2 items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800">
                <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-600 text-xs font-bold text-white">!</span>
                {error}
              </div>
            )}
          </div>

          <div className={`p-5 sm:p-8 ${currentStep === 6 ? 'min-h-0' : 'min-h-[360px]'}`}>
            {currentStep === 0 && (
              <div className="space-y-8 animate-in fade-in duration-300">
                <div className="space-y-3">
                  <p className={labelCls}>Which clean do you need?</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Service">
                    {availableServices.map((s) => {
                      const on = String(serviceId) === String(s.id);
                      const popular = s.id === 'deep' || s.id === 'end_of_tenancy';
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => handleServiceTypeSelect(String(s.id))}
                          className={`group relative flex items-start gap-3 rounded-2xl border p-4 text-left transition ${
                            on ? 'border-primary bg-primary/[0.05] ring-2 ring-primary/20' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                          }`}
                        >
                          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition ${on ? 'bg-primary text-primary-foreground' : 'bg-slate-100 text-slate-500 group-hover:text-primary'}`}>
                            {renderIcon(s.icon)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-2">
                              <span className="font-semibold text-slate-900">{s.name}</span>
                              {popular ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">Popular</span> : null}
                            </span>
                            <span className="mt-0.5 block text-sm font-semibold text-primary">{servicePriceHint(s)}</span>
                            {s.description ? <span className="mt-1 line-clamp-2 block text-xs leading-relaxed text-slate-500">{s.description}</span> : null}
                          </span>
                          <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${on ? 'border-primary bg-primary' : 'border-slate-300'}`}>
                            {on ? <CheckCircle className="h-3.5 w-3.5 text-white" /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-3">
                  <p className={labelCls}>How often?</p>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {(['One-time', 'Weekly', 'Fortnightly', 'Monthly'] as const).map((freq) => {
                      const on = frequency === freq;
                      return (
                        <button
                          key={freq}
                          type="button"
                          onClick={() => setFrequency(freq as any)}
                          className={`rounded-2xl border px-4 py-3 text-left transition ${on ? 'border-primary bg-primary/[0.05] ring-2 ring-primary/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                        >
                          <span className={`block text-sm font-semibold ${on ? 'text-primary' : 'text-slate-900'}`}>{freq}</span>
                          <span className="block text-xs text-slate-500">{FREQUENCY_HINT[freq]}</span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-500">Booked a regular clean? You can move or cancel any visit from your account.</p>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {(() => {
                  const trig = getServiceTrigger(selectedService);
                  const isAirBnB = trig === 'airbnb';
                  const isCommercialOrJet = trig === 'commercial' || trig === 'jet_washing';
                  const isGeneral = trig === 'standard' || trig === 'custom';

                  if (isAirBnB) {
                    return (
                      <div className="space-y-5">
                        <div className="space-y-2">
                          <label className={labelCls}>Number of bedrooms</label>
                          <div className="grid grid-cols-5 gap-2">
                            {[1, 2, 3, 4, 5].map((n) => {
                              const on = Number(propertyDetails.bedrooms) === n;
                              return (
                                <button
                                  key={n}
                                  type="button"
                                  onClick={() => {
                                    setPropertyDetails((prev) => ({ ...prev, bedrooms: n }));
                                    setDuration(resolveAirbnbDurationFromBedrooms(n));
                                  }}
                                  className={`rounded-xl border py-3 text-center transition ${on ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}
                                >
                                  <span className="block text-lg font-semibold">{n}</span>
                                  <span className={`block text-[11px] ${on ? 'text-white/80' : 'text-slate-500'}`}>bed{n > 1 ? 's' : ''}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        {infoBox(
                          <Clock className="h-4 w-4" />,
                          'Fixed duration',
                          Number(propertyDetails.bedrooms) > 0 ? (
                            <>
                              Your turnaround clean is set for <strong>{resolveAirbnbDurationFromBedrooms(Number(propertyDetails.bedrooms))} hours</strong>, based on the number of bedrooms.
                            </>
                          ) : (
                            <>Choose the number of bedrooms to set the clean length.</>
                          ),
                        )}
                      </div>
                    );
                  } else if (isCommercialOrJet) {
                    const isJet = trig === 'jet_washing';
                    const label = isJet ? 'Tell us about the surfaces' : 'Tell us about your premises';
                    const placeholder = isJet
                      ? 'Please describe the surfaces to be cleaned (driveway, patio, deck, etc.) and any specific requirements...'
                      : 'Please describe your commercial property (office space, retail store, etc.) and cleaning requirements...';
                    const enough = commercialDetails.trim().length >= COMMERCIAL_OR_JET_DETAILS_MIN_CHARS;
                    return (
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className={labelCls}>{label}</label>
                          <textarea className={`${textareaCls} h-40`} placeholder={placeholder} value={commercialDetails} onChange={(e) => setCommercialDetails(e.target.value)} />
                          <div className="flex items-center gap-3">
                            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className={`h-full rounded-full transition-all ${enough ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                style={{ width: `${Math.min(100, (commercialDetails.trim().length / COMMERCIAL_OR_JET_DETAILS_MIN_CHARS) * 100)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-medium ${enough ? 'text-emerald-600' : 'text-amber-700'}`}>
                              {commercialDetails.trim().length} / {COMMERCIAL_OR_JET_DETAILS_MIN_CHARS} characters minimum for an accurate quote
                            </span>
                          </div>
                        </div>
                        {infoBox(
                          <Briefcase className="h-4 w-4" />,
                          'We will send you a tailored quote',
                          'This is a bespoke service. The more detail you give (size, rooms, how often, access times), the more accurate your quote.',
                        )}
                      </div>
                    );
                  } else if (isGeneral) {
                    const currentHours = Math.floor(duration);
                    const currentMinutes = Math.round((duration - currentHours) * 60);
                    return (
                      <div className="space-y-6">
                        {usesRegionalRate && (
                          <div className="space-y-2 rounded-2xl bg-slate-50 p-4">
                            <label className={labelCls}>Property postcode</label>
                            <p className="text-xs text-slate-500">London postcodes have a different hourly rate, so we check it first.</p>
                            <input
                              type="text"
                              value={address.postcode}
                              onChange={(e) => {
                                const postcode = e.target.value.toUpperCase();
                                setAddress((prev) => ({ ...prev, postcode }));
                              }}
                              placeholder="e.g. E2 7NX or M3 2BW"
                              autoComplete="postal-code"
                              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold uppercase tracking-wide text-slate-900 shadow-sm outline-none transition placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10"
                            />
                            {regionNote}
                          </div>
                        )}

                        <DropdownField
                          label="Property size (helps us plan)"
                          value={propertyDetails.size || 'Studio'}
                          options={['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5 Bedroom', 'House', 'Flat']}
                          onChange={(val) => setPropertyDetails((prev) => ({ ...prev, size: String(val) }))}
                          isString
                        />

                        <div className="space-y-2">
                          <label className={labelCls}>How long should we stay?</label>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="relative">
                              <select
                                value={currentHours}
                                onChange={(e) => {
                                  const newHours = Number(e.target.value);
                                  setDuration(newHours + currentMinutes / 60);
                                }}
                                className={`${selectCls} w-28 text-base font-semibold`}
                                aria-label="Hours"
                              >
                                {[2, 3, 4, 5, 6, 7, 8].map((h) => (
                                  <option key={h} value={h}>
                                    {h}
                                  </option>
                                ))}
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            </div>
                            <span className="text-sm font-medium text-slate-500">hours</span>
                            <div className="relative">
                              <select
                                value={currentMinutes}
                                onChange={(e) => {
                                  const newMinutes = Number(e.target.value);
                                  setDuration(currentHours + newMinutes / 60);
                                }}
                                className={`${selectCls} w-28 text-base font-semibold`}
                                aria-label="Minutes"
                              >
                                <option value={0}>00</option>
                                <option value={30}>30</option>
                              </select>
                              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            </div>
                            <span className="text-sm font-medium text-slate-500">minutes</span>
                          </div>
                          {effectiveHourlyRate > 0 ? <p className="text-xs text-slate-500">Each hour is £{effectiveHourlyRate.toFixed(2)}. Your total updates as you change the time.</p> : null}
                        </div>

                        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
                          <input
                            type="checkbox"
                            checked={notifyIfMoreTimeNeeded}
                            onChange={(e) => setNotifyIfMoreTimeNeeded(e.target.checked)}
                            className="mt-0.5 h-4 w-4 rounded accent-primary"
                          />
                          <span>
                            <span className="block text-sm font-semibold text-slate-900">Tell me if the job needs more time</span>
                            <span className="block text-xs text-slate-500">We will let you know if your home needs longer than the time you booked.</span>
                          </span>
                        </label>
                      </div>
                    );
                  } else {
                    // Itemized Service - Property Details Form (Deep / EOT)
                    const getExtra = (idOrName: string) =>
                      extras.find(
                        (e) => String(e.id) === String(idOrName) || e.name.toLowerCase().includes(idOrName.toLowerCase())
                      );
                    const getQty = (idOrName: string) =>
                      selectedExtras.find((e) => {
                        const ex = getExtra(idOrName);
                        return ex && String(e.id) === String(ex.id);
                      })?.quantity ?? 0;
                    const updateQty = (idOrName: string, val: string | number, detailUpdater: (prev: any, count: number) => any) => {
                      const count = Number(val);
                      const ex = getExtra(idOrName);
                      if (ex) {
                        setSelectedExtras((prev) => {
                          const others = prev.filter((p) => String(p.id) !== String(ex.id));
                          return count > 0 ? [...others, { id: ex.id, quantity: count }] : others;
                        });
                        setPropertyDetails((prev) => detailUpdater(prev, count));
                      }
                    };

                    const toiletExtra = resolveToiletExtra(extras);
                    const getToiletQty = () => {
                      if (toiletExtra) {
                        const fromSel = selectedExtras.find((e) => String(e.id) === String(toiletExtra.id))?.quantity;
                        if (fromSel != null) return fromSel;
                      }
                      return propertyDetails.toilets ?? 0;
                    };
                    const updateToiletQty = (val: string | number) => {
                      const count = Number(val);
                      const ex = resolveToiletExtra(extras);
                      if (ex) {
                        setSelectedExtras((prev) => {
                          const others = prev.filter((p) => String(p.id) !== String(ex.id));
                          return count > 0 ? [...others, { id: ex.id, quantity: count }] : others;
                        });
                      }
                      setPropertyDetails((prev) => ({
                        ...prev,
                        toilets: count,
                        clockRoomToilets: count,
                      }));
                    };
                    const priceOf = (key: string) => {
                      const ex = getExtra(key);
                      return ex ? `£${Number(ex.price).toFixed(0)} each` : undefined;
                    };

                    return (
                      <div className="space-y-5">
                        {infoBox(
                          <Sparkles className="h-4 w-4" />,
                          'Priced by room',
                          'Tell us what needs cleaning. Each room has its own price, and your total updates on the right as you go.',
                        )}
                        <div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
                          <DropdownField label="Bedrooms" hint={priceOf('bedroom')} value={getQty('bedroom')} options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} onChange={(val) => updateQty('bedroom', val, (prev, count) => ({ ...prev, bedrooms: count }))} />
                          <DropdownField label="Reception rooms" hint={priceOf('reception')} value={getQty('reception')} options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} onChange={(val) => updateQty('reception', val, (prev, count) => ({ ...prev, receptionRooms: count }))} />
                          <DropdownField label="Bathrooms" hint={priceOf('bathroom')} value={getQty('bathroom')} options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} onChange={(val) => updateQty('bathroom', val, (prev, count) => ({ ...prev, bathrooms: count }))} />
                          <DropdownField label="Utility rooms" hint={priceOf('utility')} value={getQty('utility')} options={[0, 1, 2, 3, 4, 5]} onChange={(val) => updateQty('utility', val, (prev, count) => ({ ...prev, utilityRooms: count }))} />
                          <DropdownField label="Cloakroom toilets" hint={toiletExtra ? `£${Number(toiletExtra.price).toFixed(0)} each` : undefined} value={getToiletQty()} options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} onChange={(val) => updateToiletQty(val)} />
                          <DropdownField
                            label="Property size"
                            value={propertyDetails.sqftRange || '1 - 1,200 Sq Ft'}
                            options={['1 - 1,200 Sq Ft', '1,201 - 2,000 Sq Ft', '2,001 - 3,000 Sq Ft', '3,001 - 4,000 Sq Ft', '4,001 - 5,000 Sq Ft', '5,001+ Sq Ft']}
                            onChange={(val) => setPropertyDetails((prev) => ({ ...prev, sqftRange: String(val) }))}
                            isString
                          />
                          <DropdownField label="Kitchens" hint={priceOf('kitchen')} value={getQty('kitchen')} options={[0, 1, 2, 3, 4, 5]} onChange={(val) => updateQty('kitchen', val, (prev, count) => ({ ...prev, kitchens: count }))} />
                          <DropdownField label="Carpet steam cleaning (rooms)" hint={priceOf('carpet')} value={getQty('carpet')} options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]} onChange={(val) => updateQty('carpet', val, (prev, count) => ({ ...prev, carpetSteamCleaning: count }))} />
                        </div>
                      </div>
                    );
                  }
                })()}
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <p className="text-sm text-slate-500">Optional. Add anything you would like done on top of your clean.</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {extras
                    .filter((e) => {
                      const name = e.name.toLowerCase();
                      return !(name.includes('bedroom') || name.includes('reception') || name.includes('bathroom') || name.includes('utility') || name.includes('cloakroom') || name.includes('clock') || name.includes('kitchen') || name.includes('carpet'));
                    })
                    .map((extra) => {
                      const selected = selectedExtras.find((e) => e.id === extra.id);
                      const quantity = selected ? selected.quantity : 0;
                      return (
                        <div
                          key={extra.id}
                          className={`flex items-center justify-between gap-3 rounded-2xl border p-4 transition ${quantity > 0 ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/15' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{extra.name}</p>
                            <p className="text-sm text-slate-500">
                              £{Number(extra.price).toFixed(0)}
                              {quantity > 0 ? <span className="font-semibold text-primary"> · £{(Number(extra.price) * quantity).toFixed(0)} added</span> : null}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1 rounded-xl bg-slate-100 p-1">
                            <button
                              type="button"
                              aria-label={`Remove one ${extra.name}`}
                              onClick={() => {
                                if (quantity <= 0) return;
                                if (quantity === 1) {
                                  setSelectedExtras((prev) => prev.filter((e) => e.id !== extra.id));
                                } else {
                                  setSelectedExtras((prev) => prev.map((e) => (e.id === extra.id ? { ...e, quantity: e.quantity - 1 } : e)));
                                }
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg font-semibold text-slate-600 transition hover:bg-white disabled:opacity-30"
                              disabled={quantity <= 0}
                            >
                              −
                            </button>
                            <span className="w-7 text-center text-sm font-semibold tabular-nums text-slate-900">{quantity}</span>
                            <button
                              type="button"
                              aria-label={`Add one ${extra.name}`}
                              onClick={() => {
                                if (quantity === 0) {
                                  setSelectedExtras((prev) => [...prev, { id: extra.id, quantity: 1 }]);
                                } else {
                                  setSelectedExtras((prev) => prev.map((e) => (e.id === extra.id ? { ...e, quantity: e.quantity + 1 } : e)));
                                }
                              }}
                              className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-lg font-semibold text-primary shadow-sm transition hover:bg-primary hover:text-primary-foreground"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                {infoBox(
                  <Clock className="h-4 w-4" />,
                  'Pick any day and time, 24/7',
                  'If your slot overlaps another booking, we will contact you after you submit to confirm or adjust.',
                )}
                <InputField label="Date" value={date} onChange={setDate} type="date" icon={<Calendar className="h-4 w-4" />} />

                <div className="space-y-4">
                  <label className={labelCls}>Start time</label>
                  {TIME_GROUPS.map((g) => (
                    <div key={g.label}>
                      <p className="mb-2 text-xs font-medium text-slate-500">{g.label}</p>
                      <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                        {WIZARD_TIME_SLOTS.filter((t) => {
                          const h = Number(t.slice(0, 2));
                          return h >= g.from && h < g.to;
                        }).map((timeSlot) => {
                          const isSelected = time === timeSlot;
                          return (
                            <button
                              key={timeSlot}
                              type="button"
                              onClick={() => setTime(timeSlot)}
                              className={`rounded-xl border py-2.5 text-sm font-semibold tabular-nums transition ${
                                isSelected ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-primary/40 hover:text-primary'
                              }`}
                            >
                              {timeSlot}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                {date && time ? (
                  <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900 ring-1 ring-inset ring-emerald-100">
                    <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
                    <span>
                      <strong>{prettyDate}</strong> at <strong>{time}</strong>
                      {calculatedDuration > 0 ? ` · about ${durationLabel}` : ''}
                    </span>
                  </div>
                ) : null}
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="space-y-4">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <User className="h-4 w-4 text-primary" /> Your contact details
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <InputField label="Full name" value={customer.name} onChange={(v) => setCustomer({ ...customer, name: v })} placeholder="John Doe" icon={<User className="h-4 w-4" />} />
                    </div>
                    <InputField label="Email address" value={customer.email} onChange={(v) => setCustomer({ ...customer, email: v })} placeholder="john@example.com" icon={<ShieldCheck className="h-4 w-4" />} type="email" />
                    <InputField label="Phone number" value={customer.phone} onChange={(v) => setCustomer({ ...customer, phone: v })} placeholder="07700 900123" type="tel" />
                  </div>
                  <p className="text-xs text-slate-500">We send your confirmation by email, and we may call on the day (UK number, at least 10 digits).</p>
                </div>

                <div className="space-y-4 border-t border-slate-100 pt-6">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <MapPin className="h-4 w-4 text-primary" /> Where should we clean?
                  </p>
                  <InputField label="Address line 1" value={address.line1} onChange={(v) => setAddress({ ...address, line1: v })} placeholder="123 Neat Street" icon={<MapPin className="h-4 w-4" />} />
                  <InputField label="Address line 2 (optional)" value={address.line2 || ''} onChange={(v) => setAddress({ ...address, line2: v })} placeholder="Flat, floor or building" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <InputField label="Town or city" value={address.city} onChange={(v) => setAddress({ ...address, city: v })} placeholder="London" />
                    <div className="space-y-1.5">
                      <label className={labelCls}>Postcode</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={address.postcode}
                          onChange={(e) => setAddress({ ...address, postcode: e.target.value.toUpperCase() })}
                          placeholder="SW1A 1AA"
                          autoComplete="postal-code"
                          className={`w-full rounded-xl border bg-white px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-900 shadow-sm outline-none transition placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:ring-4 focus:ring-primary/10 ${
                            postcodeVerified ? 'border-emerald-300 focus:border-emerald-400' : 'border-slate-200 focus:border-primary'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={handleVerifyPostcode}
                          disabled={postcodeVerifying}
                          className={`shrink-0 rounded-xl px-4 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                            postcodeVerified ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200' : 'bg-slate-900 text-white hover:bg-slate-800'
                          }`}
                        >
                          {postcodeVerifying ? 'Checking…' : postcodeVerified ? '✓ Checked' : 'Check'}
                        </button>
                      </div>
                      {postcodeVerifyMsg ? (
                        <p className={`text-xs font-medium ${postcodeVerified ? 'text-emerald-600' : 'text-amber-700'}`}>{postcodeVerifyMsg}</p>
                      ) : (
                        <p className="text-xs text-slate-500">Tap Check so we can confirm we cover your area.</p>
                      )}
                      {usesRegionalRate && regionNote}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <label className={labelCls}>Anything we should know?</label>
                  <textarea
                    className={`${textareaCls} h-36`}
                    placeholder="Any special instructions? Key location, parking, pets, etc..."
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {['Key is with a neighbour', 'Free parking outside', 'I have a pet', 'Please focus on the kitchen'].map((chip) => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setInstructions((prev) => (prev.trim() ? `${prev.trim()}\n${chip}` : chip))}
                        className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-primary/40 hover:text-primary"
                      >
                        + {chip}
                      </button>
                    ))}
                  </div>
                </div>
                {selectedService && getServiceTrigger(selectedService) === 'standard' && (
                  <div className="space-y-3">
                    <div>
                      <p className={labelCls}>Should we bring a hoover and cleaning materials?</p>
                      <p className="text-xs text-slate-500">If you do not have your own supplies, our team can bring everything needed.</p>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {(
                        [
                          { v: 'none', label: 'No thanks', sub: 'I have my own', price: 'Free' },
                          { v: 'hoover_only', label: 'Just a hoover', sub: 'We bring a hoover', price: '+£3.00' },
                          { v: 'hoover_and_materials', label: 'Hoover + materials', sub: 'Everything needed', price: '+£6.00' },
                        ] as const
                      ).map((o) => {
                        const on = cleaningMaterials === o.v;
                        return (
                          <label
                            key={o.v}
                            className={`flex cursor-pointer flex-col rounded-2xl border p-4 transition ${on ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/15' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                          >
                            <input type="radio" name="cleaningMaterials" value={o.v} checked={on} onChange={() => setCleaningMaterials(o.v)} className="sr-only" />
                            <span className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-900">{o.label}</span>
                              <span className={`shrink-0 whitespace-nowrap text-sm font-semibold ${o.v === 'none' ? 'text-slate-400' : 'text-emerald-700'}`}>{o.price}</span>
                            </span>
                            <span className="mt-0.5 text-xs text-slate-500">{o.sub}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-slate-300">
                  <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-primary" />
                  <span>
                    <span className="block text-sm font-semibold text-slate-900">Text me updates and reminders</span>
                    <span className="block text-xs text-slate-500">Reminders and updates about this booking by text message.</span>
                  </span>
                </label>
              </div>
            )}

            {currentStep === 6 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label className={labelCls}>Promo code (optional)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-900 shadow-sm outline-none transition placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:bg-slate-50"
                        placeholder="e.g. FIRST10"
                        value={discountCode}
                        onChange={(e) => setDiscountCode(e.target.value)}
                        disabled={!!appliedDiscount}
                      />
                      <button
                        onClick={() => {
                          if (appliedDiscount) {
                            setAppliedDiscount(null);
                            setDiscountCode('');
                          } else {
                            handleApplyDiscount();
                          }
                        }}
                        className={`shrink-0 rounded-xl px-4 text-sm font-semibold transition ${appliedDiscount ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                        disabled={isValidatingDiscount}
                      >
                        {isValidatingDiscount ? '…' : appliedDiscount ? 'Remove' : 'Apply'}
                      </button>
                    </div>
                    {discountError && <p className="text-xs font-medium text-red-600">{discountError}</p>}
                    {appliedDiscount && <p className="text-xs font-medium text-emerald-600">✓ {appliedDiscount.code} applied</p>}
                    {!appliedDiscount && !discountError ? <p className="text-xs text-slate-500">New customer? Try FIRST10 for 10% off your first clean.</p> : null}
                  </div>

                  <div className="space-y-2">
                    <label className={labelCls}>Add a tip for your cleaner (optional)</label>
                    <div className="flex flex-wrap gap-2">
                      {[0, 5, 10, 15, 20].map((p) => {
                        const on = tipPercent === p && tipPercent !== -1;
                        return (
                          <button
                            key={p}
                            type="button"
                            onClick={() => {
                              setTipPercent(p);
                              setCustomTip('');
                            }}
                            className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${on ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                          >
                            {p === 0 ? 'No tip' : `${p}%`}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() => setTipPercent(-1)}
                        className={`rounded-xl border px-3.5 py-2 text-sm font-semibold transition ${tipPercent === -1 ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                      >
                        Custom £
                      </button>
                    </div>
                    {tipPercent === -1 && (
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        inputMode="decimal"
                        value={customTip}
                        onChange={(e) => setCustomTip(e.target.value)}
                        placeholder="Tip amount in £"
                        aria-label="Tip amount in pounds"
                        className="w-full max-w-[12rem] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
                      />
                    )}
                  </div>
                </div>

                <div className="w-full">
                  <InvoiceView
                    booking={{
                      serviceType: selectedService?.name,
                      date,
                      time,
                      frequency,
                      duration: calculatedDuration,
                      propertyDetails: { ...propertyDetails, ...(cleaningMaterials !== 'none' ? { cleaningMaterials } : {}) },
                      contact: customer,
                      address,
                      extras: selectedExtras,
                      totalPrice: payableTotal,
                      referralCreditUsed: referralCredit || null,
                    }}
                    serviceConfig={selectedService}
                    extrasConfig={extras}
                    total={payableTotal}
                    enableInvoiceExportActions={false}
                    depositConsent={{
                      variant: 'controlled',
                      checked: depositTermsAccepted,
                      onChange: setDepositTermsAccepted,
                    }}
                  />
                </div>
              </div>
            )}

            {currentStep === 7 && (
              <div className="space-y-6 animate-in fade-in duration-300">
                <div className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between gap-3 bg-slate-50 px-5 py-3">
                    <p className="text-sm font-semibold text-slate-900">Your booking</p>
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
                      <ShieldCheck className="h-4 w-4" /> Check everything before you submit
                    </span>
                  </div>
                  <dl className="divide-y divide-slate-100">
                    {[
                      { icon: <Sparkles className="h-4 w-4" />, k: 'Service', v: selectedService?.name, sub: `${frequency} · ${formatHoursMinutes(calculatedDuration)} booked` },
                      { icon: <Calendar className="h-4 w-4" />, k: 'When', v: prettyDate || date, sub: time ? `Starting at ${time}` : undefined },
                      {
                        icon: <MapPin className="h-4 w-4" />,
                        k: 'Where',
                        v: [address.line1, address.line2].filter(Boolean).join(', '),
                        sub: [address.city, address.postcode].filter(Boolean).join(', '),
                      },
                      { icon: <User className="h-4 w-4" />, k: 'Contact', v: customer.name, sub: [customer.email, customer.phone].filter(Boolean).join(' · ') },
                    ].map((row) => (
                      <div key={row.k} className="flex items-start gap-3 px-5 py-4">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{row.icon}</span>
                        <div className="min-w-0 flex-1">
                          <dt className="text-xs font-medium text-slate-500">{row.k}</dt>
                          <dd className="break-words font-semibold text-slate-900">{row.v || '—'}</dd>
                          {row.sub ? <dd className="break-words text-sm text-slate-500">{row.sub}</dd> : null}
                        </div>
                      </div>
                    ))}
                  </dl>
                  {referralCredit > 0 ? (
                    <div className="flex items-center justify-between gap-3 border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-emerald-800">
                      <span className="text-sm font-medium">Referral credit (cleaning only, no cash value)</span>
                      <span className="font-semibold tabular-nums">−£{referralCredit.toFixed(2)}</span>
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-900 px-5 py-4 text-white">
                    <span className="text-sm font-medium text-white/80">Total estimate</span>
                    <span className="text-2xl font-semibold tabular-nums">
                      {(() => {
                        const trig = getServiceTrigger(selectedService);
                        return trig === 'commercial' || trig === 'jet_washing' ? 'Quote based' : `£${payableTotal.toFixed(2)}`;
                      })()}
                    </span>
                  </div>
                </div>

                {(() => {
                  const trig = getServiceTrigger(selectedService);
                  return selectedService && Number(totalPrice) > 0 && trig !== 'commercial' && trig !== 'jet_washing' ? (
                    <PaymentChoicePicker total={payableTotal} depositPercent={wizardDepositPercent} value={paymentChoice} onChange={setPaymentChoice} />
                  ) : null;
                })()}

                {invoiceStepSkipped && selectedService ? (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
                    <p className="text-sm font-semibold text-slate-900">Payment and terms</p>
                    <p className="text-xs leading-relaxed text-slate-600">
                      This booking path skips the separate invoice screen. Review the payment details and tick the agreement before you submit your request.
                    </p>
                    <div className="max-h-[min(70vh,560px)] overflow-y-auto rounded-xl border border-slate-100">
                      <InvoiceView
                        booking={{
                          serviceType: selectedService?.name,
                          date,
                          time,
                          frequency,
                          duration: calculatedDuration,
                          propertyDetails,
                          contact: customer,
                          address,
                          extras: selectedExtras,
                          totalPrice: payableTotal,
                          referralCreditUsed: referralCredit || null,
                        }}
                        serviceConfig={selectedService}
                        extrasConfig={extras}
                        total={payableTotal}
                        enableInvoiceExportActions={false}
                        depositConsent={{
                          variant: 'controlled',
                          checked: depositTermsAccepted,
                          onChange: setDepositTermsAccepted,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-center text-sm font-medium ${depositTermsAccepted ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                    {depositTermsAccepted ? <CheckCircle className="h-4 w-4 shrink-0" /> : <Lock className="h-4 w-4 shrink-0" />}
                    {depositTermsAccepted
                      ? 'Terms accepted on the invoice step. Submit your booking request when you are ready.'
                      : 'Go back to the invoice step and tick the payment agreement before submitting.'}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="hidden items-center justify-between gap-4 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:px-8 lg:flex">
            <button
              onClick={back}
              disabled={currentStep === 0}
              className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-white hover:shadow-sm disabled:pointer-events-none disabled:opacity-0"
            >
              <ChevronLeft className="h-4 w-4" /> Back
            </button>
            <div className="flex items-center gap-3">
              {currentStep < STEPS.length - 1 && activeSteps[stepPos] ? <span className="text-xs text-slate-400">Next: {STEP_COPY[activeSteps[stepPos]]?.short || activeSteps[stepPos]}</span> : null}
              <button
                onClick={currentStep === STEPS.length - 1 ? handleFinalSubmit : next}
                disabled={(currentStep === 0 && !serviceId) || isProcessing}
                className="group inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                <span>{isProcessing ? 'Processing…' : currentStep === STEPS.length - 1 ? 'Submit booking request' : 'Continue'}</span>
                {!isProcessing && <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="min-w-0 lg:col-span-4">
        <div className="space-y-4 lg:sticky lg:top-28">
          <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-16px_rgba(15,23,42,0.12)]">
            <div className="relative overflow-hidden bg-gradient-to-br from-primary to-primary/80 px-6 py-6 text-primary-foreground">
              <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10" aria-hidden />
              <p className="relative text-xs font-medium text-white/85">Your price</p>
              <p className="relative mt-1 text-4xl font-semibold tracking-tight tabular-nums">
                {isQuoteOnly ? 'Quote' : `£${payableTotal.toFixed(2)}`}
              </p>
              <div className="relative mt-3 flex flex-wrap gap-2 text-xs font-medium">
                <span className="rounded-full bg-white/15 px-2.5 py-1">
                  <Clock className="mr-1 inline h-3.5 w-3.5 -translate-y-px" />
                  {durationLabel}
                </span>
                <span className="rounded-full bg-white/15 px-2.5 py-1">{frequency}</span>
                {date ? <span className="rounded-full bg-white/15 px-2.5 py-1">{new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{time ? ` · ${time}` : ''}</span> : null}
              </div>
            </div>
            <div className="space-y-3 p-6 text-sm">
              <div className="flex items-start justify-between gap-3">
                <span className="text-slate-500">Service</span>
                <span className="text-right font-semibold text-slate-900">{selectedService?.name || 'Not chosen yet'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-500">Duration</span>
                <span className="font-semibold text-slate-900">{durationLabel}</span>
              </div>

              <div className="space-y-2 border-t border-slate-100 pt-3">
                {selectedService && isDeepOrEOTService(selectedService, selectedService.name) && (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500">Call-out charge</span>
                    <span className="font-semibold text-slate-900">£{resolveDeepEotCallOutChargeGbp(selectedService).toFixed(2)}</span>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <span className="text-slate-500">
                    {(() => {
                      const trig = getServiceTrigger(selectedService);
                      if (trig === 'deep' || trig === 'end_of_tenancy') return 'Minimum duration (instruction only)';
                      if (trig === 'standard') {
                        const hrs = duration || 2;
                        return `Base price (${formatHoursMinutes(hrs)} × £${effectiveHourlyRate.toFixed(2)}/hr${pricingRegion === 'london' ? ', London rate' : ''})`;
                      }
                      return 'Base price';
                    })()}
                  </span>
                  <span className="shrink-0 font-semibold text-slate-900">
                    £{(() => {
                      if (!selectedService) return '0.00';
                      const baseRate = Number(selectedService.baseRate) || 0;
                      const trig = getServiceTrigger(selectedService);

                      if (trig === 'deep' || trig === 'end_of_tenancy') {
                        return '0.00';
                      } else if (trig === 'standard' && pricing.base !== undefined) {
                        return pricing.base.toFixed(2);
                      } else if (trig === 'commercial' || trig === 'jet_washing') {
                        return '0.00 (Quote)';
                      } else if (trig === 'airbnb' || trig === 'standard' || trig === 'custom') {
                        return (baseRate * (calculatedDuration || 2)).toFixed(2);
                      }
                      return (baseRate * (selectedService.minDuration || 2)).toFixed(2);
                    })()}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Rooms and extras</span>
                  <span className="font-semibold text-slate-900">
                    £{(() => {
                      const trig = getServiceTrigger(selectedService);
                      const isHourly = trig === 'standard' || trig === 'airbnb' || trig === 'custom';
                      return selectedExtras
                        .reduce((sum, item) => {
                          const extra = extras.find((e) => e.id === item.id);
                          if (!extra) return sum;
                          const isRoomExtra = ['bedroom', 'reception', 'bathroom', 'utility', 'cloakroom', 'clock', 'kitchen', 'carpet'].some((n) => extra.name.toLowerCase().includes(n));
                          if (isHourly && isRoomExtra) return sum;
                          return sum + Number(extra.price) * item.quantity;
                        }, 0)
                        .toFixed(2);
                    })()}
                  </span>
                </div>
                {itemizedDurationBreakdown && isDeepOrEOTService(selectedService, selectedService?.name) && (
                  <p className="text-xs text-slate-400">Each line has its own price; the estimated duration is for scheduling only (not charged).</p>
                )}
                <div className="max-h-40 space-y-1 overflow-y-auto pr-1 custom-scrollbar">
                  {selectedExtras.map((item) => {
                    const extra = extras.find((e) => e.id === item.id);
                    if (!extra) return null;
                    const lowerName = extra.name.toLowerCase();
                    const isCloakroomToilet =
                      (lowerName.includes('cloakroom') || lowerName.includes('clockroom') || /clock\s*room/.test(lowerName)) && (lowerName.includes('toilet') || /\bwc\b/.test(lowerName));
                    const displayName = isCloakroomToilet ? 'Cloakroom Toilet (£15/30min each)' : extra.name;
                    const trig = getServiceTrigger(selectedService);
                    const isHourly = trig === 'standard' || trig === 'airbnb' || trig === 'custom';
                    const isRoomExtra = ['bedroom', 'reception', 'bathroom', 'utility', 'cloakroom', 'clock', 'kitchen', 'carpet', 'toilet'].some((n) => extra.name.toLowerCase().includes(n));
                    if (isHourly && isRoomExtra) return null;
                    const isDeepOrEOT = trig === 'deep' || trig === 'end_of_tenancy';
                    if (isDeepOrEOT) {
                      const durLine = itemizedDurationBreakdown?.lines.find((l) => l.extraId === item.id);
                      const lineH = durLine?.lineHours ?? 0;
                      const lineSubtotal = Number(extra.price) * item.quantity;
                      return (
                        <div key={item.id} className="flex justify-between gap-2 text-xs text-slate-500">
                          <span>
                            {item.quantity} × {displayName}
                          </span>
                          <span className="shrink-0 text-right">
                            £{lineSubtotal.toFixed(2)}
                            {lineH > 0 ? <span className="text-slate-400"> · +{formatHoursMinutes(lineH)}</span> : null}
                          </span>
                        </div>
                      );
                    }
                    return (
                      <div key={item.id} className="flex justify-between gap-2 text-xs text-slate-500">
                        <span>
                          {item.quantity} × {displayName}
                        </span>
                        <span>£{(Number(extra.price) * item.quantity).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
                {cleaningMaterials !== 'none' && (
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{cleaningMaterials === 'hoover_and_materials' ? 'Hoover + cleaning materials' : 'Hoover only'}</span>
                    <span>£{cleaningMaterials === 'hoover_and_materials' ? '6.00' : '3.00'}</span>
                  </div>
                )}
              </div>

              {pricing.discountAmount > 0 ? (
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                  <span className="text-slate-500">Discount{appliedDiscount?.code ? ` (${appliedDiscount.code})` : ''}</span>
                  <span className="font-semibold text-emerald-700">−£{pricing.discountAmount.toFixed(2)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <span className="text-slate-500">Subtotal (after discount)</span>
                <span className="font-semibold text-slate-900">£{pricing.totalAfterDiscount.toFixed(2)}</span>
              </div>
              {pricing.tipAmount > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Tip</span>
                  <span className="font-semibold text-slate-900">£{pricing.tipAmount.toFixed(2)}</span>
                </div>
              ) : null}
              {referralCredit > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <span className="text-slate-500">Referral credit</span>
                  <span className="font-semibold text-emerald-700">−£{referralCredit.toFixed(2)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
                <span className="font-semibold text-slate-900">Total due</span>
                <span className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">£{payableTotal.toFixed(2)}</span>
              </div>
              <button
                onClick={handleReset}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium text-slate-400 transition hover:bg-red-50 hover:text-red-600"
              >
                <RotateCcw className="h-4 w-4" /> Start over
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-5">
            <p className="text-sm font-semibold text-slate-900">Why book with us</p>
            <ul className="mt-3 space-y-2.5 text-sm text-slate-600">
              {[
                { icon: <ShieldCheck className="h-4 w-4" />, t: 'Fully insured on every visit' },
                { icon: <User className="h-4 w-4" />, t: 'Vetted, DBS-checked cleaners' },
                { icon: <CheckCircle className="h-4 w-4" />, t: '100% satisfaction guarantee' },
                { icon: <Calendar className="h-4 w-4" />, t: 'Move or cancel from your account' },
              ].map((x) => (
                <li key={x.t} className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{x.icon}</span>
                  {x.t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-t-3xl bg-white p-6 shadow-2xl sm:mx-4 sm:rounded-2xl">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-600">
              <RotateCcw className="h-5 w-5" />
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">Start over?</h3>
            <p className="mt-1 text-sm text-slate-500">This clears everything you have entered so far.</p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded-xl border border-slate-200 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                Keep going
              </button>
              <button type="button" onClick={confirmReset} className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white transition hover:bg-red-700">
                Start over
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile sticky bar */}
      <div className="safe-area-pb fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200/80 bg-white/95 px-4 py-3 shadow-[0_-12px_40px_-12px_rgba(15,23,42,0.18)] backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium text-slate-500">
              Step {stepPos} of {activeSteps.length} · {STEP_COPY[stepName]?.short || stepName}
            </p>
            <p className="text-xl font-semibold tabular-nums text-slate-900">{isQuoteOnly ? 'Quote' : `£${payableTotal.toFixed(2)}`}</p>
          </div>
          {currentStep > 0 && (
            <button onClick={back} className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200" aria-label="Back">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={currentStep === STEPS.length - 1 ? handleFinalSubmit : next}
            disabled={(currentStep === 0 && !serviceId) || isProcessing}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm shadow-primary/25 disabled:opacity-50"
          >
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            <span>{currentStep === STEPS.length - 1 ? (isProcessing ? 'Processing' : 'Submit') : 'Continue'}</span>
            {!isProcessing ? <ChevronRight className="h-4 w-4" /> : null}
          </button>
        </div>
      </div>
    </div>
    </div>
  );
};

const InputField: React.FC<{ label: string, value: string, onChange: (v: string) => void, placeholder?: string, icon?: React.ReactNode, type?: string }> = ({ label, value, onChange, placeholder, icon, type = 'text' }) => (
  <div className="space-y-1.5">
    <label className="text-sm font-semibold text-slate-800">{label}</label>
    <div className="relative">
      {icon && <div className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition placeholder:font-normal placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/10 ${icon ? 'pl-10' : ''}`}
      />
    </div>
  </div>
);

const DropdownField: React.FC<{ label: string, value: number | string, options: (number | string)[], onChange: (val: string | number) => void, isString?: boolean, hint?: string }> = ({ label, value, options, onChange, hint }) => (
  <div className="space-y-1.5">
    <div className="flex items-baseline justify-between gap-2">
      <label className="text-sm font-semibold text-slate-800">{label}</label>
      {hint ? <span className="text-xs text-slate-400">{hint}</span> : null}
    </div>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  </div>
);

const PriceLine: React.FC<{ label: string, value: number, isRate?: boolean, isPositive?: boolean }> = ({ label, value, isRate, isPositive }) => (
  <div className="flex justify-between items-center text-sm">
    <span className="text-slate-500 font-medium">{label}</span>
    <span className={`font-black ${isPositive ? 'text-green-600' : 'text-slate-900'}`}>
      {isPositive ? '+' : ''}£{Number(value).toFixed(2)}{isRate ? '/hr' : ''}
    </span>
  </div>
);

export default BookingWizard;
