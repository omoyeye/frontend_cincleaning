import React, { useState, useMemo, useEffect } from 'react';
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
import BookingConfirmation from './BookingConfirmation';
import { Booking, BookingStatus, PropertyDetails, UserAccount, ServiceConfig, Extra, WizardStepKey } from '../types';
import { apiClient } from '../services/api';
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
  const [tipPercent, setTipPercent] = useState(0);
  const [customTip, setCustomTip] = useState<string>('');
  const [commercialDetails, setCommercialDetails] = useState<string>('');
  const [postcodeVerified, setPostcodeVerified] = useState(false);
  const [postcodeVerifying, setPostcodeVerifying] = useState(false);
  const [postcodeVerifyMsg, setPostcodeVerifyMsg] = useState<string>('');

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
      };
    }

    const baseRate = Number(selectedService.baseRate) || 0;
    let calculated = 0;

    const trig = getServiceTrigger(selectedService);
    const isAirBnB = trig === 'airbnb';
    const isCommercialOrJet = trig === 'commercial' || trig === 'jet_washing';
    const isGeneral = trig === 'standard';
    const isDeepOrEOT = trig === 'deep' || trig === 'end_of_tenancy';

    if (isCommercialOrJet) {
      calculated = 0;
    } else if (isAirBnB) {
      const airbnbHours = resolveAirbnbDurationFromBedrooms(Number(propertyDetails.bedrooms));
      calculated = baseRate * airbnbHours;
    } else if (isGeneral) {
      calculated = baseRate * (duration || 2);
      const extrasCost = selectedExtras.reduce((sum, item) => {
        const extra = extras.find(e => e.id === item.id);
        if (!extra) return sum;
        return sum + (Number(extra.price) * item.quantity);
      }, 0);
      calculated += extrasCost;
      const materialsCost = cleaningMaterials === 'hoover_and_materials' ? 6 : cleaningMaterials === 'hoover_only' ? 3 : 0;
      calculated += materialsCost;
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
    };
  }, [selectedService, serviceId, propertyDetails, selectedExtras, tipPercent, customTip, extras, duration, appliedDiscount, cleaningMaterials]);

  const totalPrice = pricing.grandTotal;

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

      const bookingData: Partial<Booking> & { depositTermsAccepted: boolean; discountAmount?: number } = {
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
        customerId: currentUser?.id,
        depositTermsAccepted: true,
      };

      const res = await apiClient.createBooking(bookingData);
      const warning = res.conflictWarning;
      setBookingConflictWarning(
        warning
          ? `${warning.message}${warning.conflictCount > 0 ? ` (${warning.conflictCount} possible overlap${warning.conflictCount === 1 ? '' : 's'})` : ''}`
          : null
      );
      const fullBooking: Booking = {
        ...(bookingData as Booking),
        id: res.id,
        bookingId: res.bookingId,
        createdAt: new Date().toISOString(),
        depositTermsAcceptedAt: res.depositTermsAcceptedAt,
        stripePaymentLink: res.stripePaymentLink || '',
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
      <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-[2.5rem] border border-red-100/80 bg-gradient-to-br from-white via-red-50/30 to-white p-6 shadow-[0_24px_60px_-20px_rgba(220,38,38,0.12)] sm:rounded-[3rem] sm:p-12 md:p-20">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-red-200/30 blur-3xl" />
        <div className="relative flex min-h-[400px] flex-col items-center justify-center space-y-6">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br from-red-50 to-rose-100 text-red-600 shadow-inner ring-4 ring-white/80">
            <div className="absolute inset-0 animate-pulse rounded-[2rem] bg-red-400/10" />
            <Trash2 className="relative h-12 w-12" />
          </div>
          <div className="space-y-2 text-center">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Service Unavailable</h3>
            <p className="mb-6 text-[10px] font-bold uppercase tracking-widest text-slate-400">{loadingError}</p>
            <button
              onClick={() => window.location.reload()}
              className="rounded-2xl bg-gradient-to-r from-slate-800 to-slate-900 px-10 py-5 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-slate-900/20 transition-all hover:brightness-110 active:scale-[0.98]"
            >
              Retry Connection
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-[2.5rem] border border-sky-100/80 bg-gradient-to-br from-white via-sky-50/40 to-indigo-50/30 p-6 shadow-[0_24px_60px_-20px_rgba(37,99,235,0.12)] sm:rounded-[3rem] sm:p-12 md:p-20">
        <div className="pointer-events-none absolute left-1/4 top-0 h-56 w-56 -translate-x-1/2 rounded-full bg-sky-200/40 blur-3xl" />
        <div className="relative flex min-h-[600px] flex-col items-center justify-center space-y-6">
          <div className="relative flex h-28 w-28 items-center justify-center rounded-[2rem] bg-gradient-to-br from-sky-100 to-indigo-100 text-indigo-600 shadow-inner ring-4 ring-white/90">
            <Loader2 className="h-12 w-12 animate-spin" />
          </div>
          <div className="space-y-2 text-center">
            <h3 className="text-xl font-black uppercase tracking-tight text-slate-900">Initialising Secure Portal</h3>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Preparing your bespoke clean configuration...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative isolate mx-auto max-w-6xl px-4 sm:px-6">
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="absolute -right-10 bottom-10 h-80 w-80 rounded-full bg-indigo-200/30 blur-3xl" />
        <div className="absolute left-1/2 top-0 h-64 w-[min(100%,48rem)] -translate-x-1/2 rounded-[100%] bg-gradient-to-b from-sky-100/50 to-transparent blur-2xl" />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="space-y-6 lg:col-span-8">
        <div className="relative overflow-hidden rounded-[2.5rem] border border-white/60 bg-white/85 shadow-[0_30px_60px_-15px_rgba(15,23,42,0.12),0_0_0_1px_rgba(255,255,255,0.9)] ring-1 ring-slate-200/40 backdrop-blur-xl sm:rounded-[3rem]">
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-gradient-to-br from-sky-100/80 to-indigo-100/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-0 h-56 w-56 rounded-full bg-violet-100/40 blur-3xl" />

          <div className="relative z-10 border-b border-slate-200/70 bg-gradient-to-br from-slate-50/90 via-white to-sky-50/25 px-6 pb-6 pt-8 backdrop-blur-md md:px-10 md:pb-8 md:pt-10">
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-gradient-to-r from-sky-50 to-indigo-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-sky-800 shadow-sm shadow-sky-100/40">
                    Step {displayStepNumber(currentStep)} of {activeSteps.length}
                  </span>
                  {currentStep > 0 && (
                    <button
                      onClick={handleReset}
                      className="flex items-center gap-1 border-l border-slate-200/80 pl-3 text-xs font-bold text-slate-400 transition-colors hover:text-red-500"
                      title="Reset Form"
                    >
                      <RotateCcw className="h-3 w-3" /> Reset
                    </button>
                  )}
                </div>
                <h2 className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-600 bg-clip-text text-2xl font-black tracking-tight text-transparent sm:text-3xl">
                  {STEPS[currentStep]}
                </h2>
                {error && (
                  <div ref={errorRef} className="flex animate-in slide-in-from-top-2 items-center gap-2 rounded-xl border border-red-100 bg-red-50/95 py-2.5 pl-3 pr-4 text-sm font-bold text-red-700 shadow-sm shadow-red-100/50">
                    <span className="text-lg leading-none">!</span> {error}
                  </div>
                )}
              </div>
              <span className="select-none bg-gradient-to-br from-slate-200/90 to-slate-300/40 bg-clip-text text-4xl font-black tabular-nums text-transparent sm:text-5xl">
                0{displayStepNumber(currentStep)}
              </span>
            </div>

            <div className="mb-6 h-2.5 w-full overflow-hidden rounded-full bg-slate-200/90 shadow-inner ring-1 ring-slate-300/20">
              <div
                className="relative h-full overflow-hidden rounded-full bg-gradient-to-r from-sky-500 via-blue-600 to-indigo-600 shadow-[0_0_24px_rgba(37,99,235,0.35)] transition-[width] duration-500 ease-out"
                style={{ width: `${(displayStepNumber(currentStep) / activeSteps.length) * 100}%` }}
              >
                <div className="animate-wizard-shimmer absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              </div>
            </div>

            <div className="mb-1 flex justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <span>Start</span>
              <span className="hidden sm:inline">Progress</span>
              <span>Complete</span>
            </div>
          </div>

          <div
            className={`p-6 md:p-8 ${currentStep === 6 ? 'min-h-0' : 'min-h-[400px]'}`}
          >
            {currentStep === 0 && (
              <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                <div className="space-y-4">
                  <label className="text-sm font-black uppercase text-slate-400 tracking-wider">Select a Service</label>
                  <div className="relative">
                    <select
                      value={serviceId || ''}
                      onChange={(e) => handleServiceTypeSelect(e.target.value)}
                      className="w-full cursor-pointer appearance-none rounded-2xl border-2 border-slate-200/90 bg-white/90 p-5 pr-12 text-lg font-black text-foreground shadow-sm outline-none ring-slate-200/50 transition-all hover:border-sky-300/80 hover:shadow-md focus:border-primary focus:ring-4 focus:ring-primary/15"
                    >
                      <option value="" disabled>Choose a service type...</option>
                      {availableServices.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.name} {(s.id === 'deep' || s.id === 'end_of_tenancy') ? '(Popular)' : ''}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronRight className="w-5 h-5 rotate-90" />
                    </div>
                  </div>
                </div>

                {selectedService && (
                  <div className="flex animate-in fade-in slide-in-from-top-4 items-start space-x-4 rounded-2xl border border-sky-100/90 bg-gradient-to-br from-sky-50/90 via-white to-indigo-50/40 p-6 shadow-sm shadow-sky-100/50 ring-1 ring-white/80">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-white to-sky-50 text-blue-600 shadow-inner ring-1 ring-sky-100/80">
                      {renderIcon(selectedService.icon)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="mb-1 font-bold text-slate-900">{selectedService.name}</h4>
                      <p className="text-sm leading-relaxed text-slate-600">{selectedService.description}</p>
                    </div>
                  </div>
                )}

                {/* Frequency Dropdown */}
                <div className="space-y-4 mt-8 animate-in slide-in-from-right-4 duration-500 delay-100">
                  <label className="text-sm font-black uppercase text-slate-400 tracking-wider">How Often?</label>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {['One-time', 'Weekly', 'Fortnightly', 'Monthly'].map((freq) => (
                      <button
                        key={freq}
                        type="button"
                        onClick={() => setFrequency(freq as any)}
                        className={`rounded-2xl border-2 py-4 font-black shadow-sm transition-all ${frequency === freq ? 'scale-[1.02] border-indigo-500 bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-300/40' : 'border-slate-100/90 bg-white/90 text-slate-500 hover:border-sky-200 hover:bg-sky-50/50 hover:shadow-md'}`}
                      >
                        {freq}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 1 && (
              <div className="space-y-8 animate-in slide-in-from-right-8 duration-500">
                <div className="flex items-center space-x-4 mb-2">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-900 text-lg font-bold text-white">
                    {displayStepNumber(currentStep)}
                  </div>
                  <h3 className="text-2xl font-bold text-green-900">
                    {(() => {
                      const trig = getServiceTrigger(selectedService);
                      const isHourly = trig === 'standard' || trig === 'airbnb' || trig === 'commercial';
                      return isHourly ? 'Select Time Duration' : 'Property Details';
                    })()}
                  </h3>
                </div>

                {/* Conditional Rendering based on Service Type */}
                {(() => {
                  const trig = getServiceTrigger(selectedService);
                  const isAirBnB = trig === 'airbnb';
                  const isCommercialOrJet = trig === 'commercial' || trig === 'jet_washing';
                  const isGeneral = trig === 'standard' || trig === 'custom';

                  if (isAirBnB) {
                    // AirBnB Logic: Bedroom Quantity -> Fixed Duration
                    return (
                      <div className="space-y-6">
                        <label className="text-sm font-black uppercase text-slate-400 tracking-wider">Number of Bedrooms</label>
                        <div className="relative">
                          <select
                            value={Number(propertyDetails.bedrooms) > 0 ? String(propertyDetails.bedrooms) : ''}
                            onChange={(e) => {
                              const count = Number(e.target.value);
                              setPropertyDetails(prev => ({ ...prev, bedrooms: count }));
                              setDuration(resolveAirbnbDurationFromBedrooms(count));
                            }}
                            className="w-full appearance-none bg-primary/8 border-2 border-input focus:border-primary rounded-2xl px-6 py-4 pr-12 text-xl font-black text-foreground outline-none shadow-sm transition-all"
                          >
                            <option value="" disabled>Select number of bedroom</option>
                            {[1, 2, 3, 4, 5].map(n => (
                              <option key={n} value={n}>{n} Bedroom{n > 1 ? 's' : ''}</option>
                            ))}
                          </select>
                          <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                            <ChevronRight className="w-5 h-5 rotate-90" />
                          </div>
                        </div>

                        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex items-start space-x-4 mt-8">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                            <Clock className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-blue-900 mb-1">Fixed Duration Applied</h4>
                            <p className="text-sm text-blue-700/80">
                              {Number(propertyDetails.bedrooms) > 0 ? (
                                <>The clean is set for <strong>{resolveAirbnbDurationFromBedrooms(Number(propertyDetails.bedrooms))} hours</strong>.</>
                              ) : (
                                <>Select number of bedroom(s) to set the clean duration.</>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  } else if (isCommercialOrJet) {
                    const isJet = trig === 'jet_washing';
                    const label = isJet ? "Surface Details" : "Commercial Property Details";
                    const placeholder = isJet
                      ? "Please describe the surfaces to be cleaned (driveway, patio, deck, etc.) and any specific requirements..."
                      : "Please describe your commercial property (office space, retail store, etc.) and cleaning requirements...";

                    return (
                      <div className="space-y-6">
                        <label className="text-sm font-black uppercase text-slate-400 tracking-wider">{label}</label>
                        <textarea
                          className="w-full h-40 bg-card rounded-2xl p-6 border-2 border-input outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-medium text-foreground"
                          placeholder={placeholder}
                          value={commercialDetails}
                          onChange={(e) => setCommercialDetails(e.target.value)}
                        />
                        <p
                          className={`text-[10px] font-black uppercase tracking-widest ${
                            commercialDetails.trim().length >= COMMERCIAL_OR_JET_DETAILS_MIN_CHARS
                              ? 'text-emerald-600'
                              : 'text-amber-700'
                          }`}
                        >
                          {commercialDetails.trim().length} / {COMMERCIAL_OR_JET_DETAILS_MIN_CHARS} characters minimum
                          for an accurate quote
                        </p>
                        <div className="bg-blue-50 p-6 rounded-2xl border border-blue-100 flex items-start space-x-4">
                          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                            <Briefcase className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-bold text-blue-900 mb-1">Quote-Based Service</h4>
                            <p className="text-sm text-blue-700/80">
                              This is a bespoke service. Please provide as much detail as possible so we can give you an accurate quote.
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  } else if (isGeneral) {
                    // General Service
                    const currentHours = Math.floor(duration);
                    const currentMinutes = Math.round((duration - currentHours) * 60);

                    return (
                      <div className="space-y-6">
                        <DropdownField
                          label="Property Size (Informational)"
                          value={propertyDetails.size || 'Studio'}
                          options={['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5 Bedroom', 'House', 'Flat']}
                          onChange={(val) => setPropertyDetails(prev => ({ ...prev, size: String(val) }))}
                          isString
                        />

                        <div className="pt-4">
                          <label className="text-sm font-black uppercase text-slate-400 tracking-wider">Duration</label>
                          <div className="flex items-center gap-4 mt-2 mb-6">
                            <div className="relative">
                              <select
                                value={currentHours}
                                onChange={(e) => {
                                  const newHours = Number(e.target.value);
                                  setDuration(newHours + (currentMinutes / 60));
                                }}
                                className="appearance-none bg-white border-2 border-slate-200 rounded-xl px-6 py-4 pr-12 text-xl font-black text-slate-900 outline-none focus:border-blue-500 transition-colors w-32"
                              >
                                {[2, 3, 4, 5, 6, 7, 8].map(h => (
                                  <option key={h} value={h}>{h}</option>
                                ))}
                              </select>
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <ChevronRight className="w-5 h-5 rotate-90" />
                              </div>
                            </div>
                            <span className="text-lg font-bold text-slate-500">hours</span>

                            <div className="relative">
                              <select
                                value={currentMinutes}
                                onChange={(e) => {
                                  const newMinutes = Number(e.target.value);
                                  setDuration(currentHours + (newMinutes / 60));
                                }}
                                className="appearance-none bg-white border-2 border-slate-200 rounded-xl px-6 py-4 pr-12 text-xl font-black text-slate-900 outline-none focus:border-blue-500 transition-colors w-32"
                              >
                                <option value={0}>00</option>
                                <option value={30}>30</option>
                              </select>
                              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                <ChevronRight className="w-5 h-5 rotate-90" />
                              </div>
                            </div>
                            <span className="text-lg font-bold text-slate-500">minutes</span>
                          </div>

                          <label className="flex items-center space-x-3 p-4 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                            <input
                              type="checkbox"
                              checked={notifyIfMoreTimeNeeded}
                              onChange={(e) => setNotifyIfMoreTimeNeeded(e.target.checked)}
                              className="w-5 h-5 rounded-lg text-blue-600 focus:ring-blue-500 border-gray-300"
                            />
                            <span className="font-bold text-slate-700 text-sm">Notify me if the job requires more time</span>
                          </label>
                        </div>
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

                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Bedrooms */}
                        <DropdownField
                          label="Bedrooms"
                          value={getQty('bedroom')}
                          options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                          onChange={(val) => updateQty('bedroom', val, (prev, count) => ({ ...prev, bedrooms: count }))}
                        />

                        {/* Reception Room */}
                        <DropdownField
                          label="Reception Room"
                          value={getQty('reception')}
                          options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                          onChange={(val) => updateQty('reception', val, (prev, count) => ({ ...prev, receptionRooms: count }))}
                        />

                        {/* Bathrooms */}
                        <DropdownField
                          label="Bathrooms"
                          value={getQty('bathroom')}
                          options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                          onChange={(val) => updateQty('bathroom', val, (prev, count) => ({ ...prev, bathrooms: count }))}
                        />

                        {/* Utility Room */}
                        <DropdownField
                          label="Utility Room"
                          value={getQty('utility')}
                          options={[0, 1, 2, 3, 4, 5]}
                          onChange={(val) => updateQty('utility', val, (prev, count) => ({ ...prev, utilityRooms: count }))}
                        />

                        {/* Clockroom Toilet - dedicated WC add-on; must not match Bathroom & Toilet */}
                        <DropdownField
                          label="Clockroom Toilet"
                          value={getToiletQty()}
                          options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                          onChange={(val) => updateToiletQty(val)}
                        />

                        {/* Square Footage */}
                        <DropdownField
                          label="Square Footage"
                          value={propertyDetails.sqftRange || "1 - 1,200 Sq Ft"}
                          options={["1 - 1,200 Sq Ft", "1,201 - 2,000 Sq Ft", "2,001 - 3,000 Sq Ft", "3,001 - 4,000 Sq Ft", "4,001 - 5,000 Sq Ft", "5,001+ Sq Ft"]}
                          onChange={(val) => setPropertyDetails(prev => ({ ...prev, sqftRange: String(val) }))}
                          isString
                        />

                        {/* Kitchen */}
                        <DropdownField
                          label="Kitchen"
                          value={getQty('kitchen')}
                          options={[0, 1, 2, 3, 4, 5]}
                          onChange={(val) => updateQty('kitchen', val, (prev, count) => ({ ...prev, kitchens: count }))}
                        />

                        {/* Carpet Steam Cleaning */}
                        <DropdownField
                          label="Carpet Steam Cleaning"
                          value={getQty('carpet')}
                          options={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                          onChange={(val) => updateQty('carpet', val, (prev, count) => ({ ...prev, carpetSteamCleaning: count }))}
                        />
                      </div>
                    );
                  }

                })()}
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6 animate-in slide-in-from-right-8 duration-500">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-blue-200">{displayStepNumber(currentStep)}</div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                    Additional Services
                  </h3>
                </div>

                <div className="flex flex-col gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {extras
                    .filter(e => {
                      const name = e.name.toLowerCase();
                      return !(name.includes('bedroom') || name.includes('reception') || name.includes('bathroom') || name.includes('utility') || name.includes('cloakroom') || name.includes('clock') || name.includes('kitchen') || name.includes('carpet'));
                    })
                    .map(extra => {
                      const selected = selectedExtras.find(e => e.id === extra.id);
                      const quantity = selected ? selected.quantity : 0;

                      return (
                        <div
                          key={extra.id}
                          className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-sm ring-1 ring-slate-100/50 transition-all hover:border-sky-200/80 hover:shadow-md"
                        >
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 text-base">{extra.name}</span>
                            <span className="text-slate-500 text-sm font-medium">£{Number(extra.price).toFixed(0)}</span>
                          </div>

                          <div className="flex items-center space-x-3">
                            <button
                              onClick={() => {
                                if (quantity <= 0) return;
                                if (quantity === 1) {
                                  setSelectedExtras(prev => prev.filter(e => e.id !== extra.id));
                                } else {
                                  setSelectedExtras(prev => prev.map(e => e.id === extra.id ? { ...e, quantity: e.quantity - 1 } : e));
                                }
                              }}
                              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
                            >
                              -
                            </button>
                            <span className="w-6 text-center font-bold text-slate-700">{quantity}</span>
                            <button
                              onClick={() => {
                                if (quantity === 0) {
                                  setSelectedExtras(prev => [...prev, { id: extra.id, quantity: 1 }]);
                                } else {
                                  setSelectedExtras(prev => prev.map(e => e.id === extra.id ? { ...e, quantity: e.quantity + 1 } : e));
                                }
                              }}
                              className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:bg-slate-50 transition-colors"
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
              <div className="space-y-6 animate-in slide-in-from-right-8">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-blue-200">{displayStepNumber(currentStep)}</div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Schedule Your Clean</h3>
                </div>
                <div className="mb-6 flex items-start gap-3 rounded-2xl border border-sky-100/90 bg-gradient-to-r from-sky-50/90 to-indigo-50/50 p-5 shadow-sm ring-1 ring-white/60">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/90 text-sky-600 shadow-sm">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-sky-900">We are available 24/7 for your convenience.</p>
                    <p className="mt-2 text-xs font-semibold leading-relaxed text-sky-900/85">
                      Choose any slot you prefer. If it overlaps another booking, we will contact you after you submit to confirm or adjust.
                    </p>
                  </div>
                </div>
                <InputField label="Date" value={date} onChange={setDate} type="date" icon={<Calendar className="w-4 h-4" />} />

                <div className="space-y-3">
                  <label className="text-sm font-black uppercase text-slate-400 tracking-wider">Select Time Slot</label>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2 sm:gap-3">
                    {WIZARD_TIME_SLOTS.map((timeSlot) => {
                      const isSelected = time === timeSlot;
                      return (
                        <button
                          key={timeSlot}
                          type="button"
                          onClick={() => setTime(timeSlot)}
                          className={`rounded-xl border-2 py-2.5 text-xs font-bold transition-all sm:py-3 sm:text-sm ${isSelected
                            ? 'scale-105 border-indigo-500 bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-300/30'
                            : 'border-slate-100 bg-white/90 text-slate-600 hover:border-sky-200 hover:bg-sky-50/50 hover:shadow-sm'
                            }`}
                        >
                          {timeSlot}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6 animate-in slide-in-from-right-8">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-blue-200">{displayStepNumber(currentStep)}</div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Location & Contact</h3>
                </div>
                <div className="mb-6 rounded-2xl border border-slate-200/70 bg-white/95 p-6 shadow-sm ring-1 ring-slate-100/60">
                  <h4 className="mb-4 border-b border-slate-100 pb-2 text-sm font-black uppercase tracking-wider text-slate-800">Contact details</h4>
                  <div className="grid grid-cols-1 gap-4">
                    <InputField label="Full Name" value={customer.name} onChange={(v) => setCustomer({ ...customer, name: v })} placeholder="John Doe" icon={<User className="w-4 h-4" />} />
                    <InputField label="Email Address" value={customer.email} onChange={(v) => setCustomer({ ...customer, email: v })} placeholder="john@example.com" icon={<ShieldCheck className="w-4 h-4" />} />
                    <InputField label="Phone Number" value={customer.phone} onChange={(v) => setCustomer({ ...customer, phone: v })} placeholder="07700 900123" />
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                      Required: UK mobile or landline (at least 10 digits) for day-of contact.
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200/70 bg-white/95 p-6 shadow-sm ring-1 ring-slate-100/60">
                  <h4 className="mb-4 border-b border-slate-100 pb-2 text-sm font-black uppercase tracking-wider text-slate-800">Service address</h4>
                  <div className="grid grid-cols-1 gap-4">
                    <InputField label="Address Line 1" value={address.line1} onChange={(v) => setAddress({ ...address, line1: v })} placeholder="123 Neat Street" icon={<MapPin className="w-4 h-4" />} />
                    <InputField label="Address Line 2 (Optional)" value={address.line2 || ''} onChange={(v) => setAddress({ ...address, line2: v })} placeholder="Apartment, Studio, or Floor" />
                    <div className="grid grid-cols-2 gap-4">
                      <InputField label="City" value={address.city} onChange={(v) => setAddress({ ...address, city: v })} placeholder="London" />
                      <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Postcode</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={address.postcode}
                            onChange={(e) => setAddress({ ...address, postcode: e.target.value.toUpperCase() })}
                            placeholder="SW1A 1AA"
                            className="w-full rounded-2xl border-2 border-slate-200/90 bg-white/95 p-4 font-black text-foreground shadow-sm outline-none ring-slate-200/40 transition-all placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/12"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyPostcode}
                            disabled={postcodeVerifying}
                            className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {postcodeVerifying ? 'Checking' : 'Verify'}
                          </button>
                        </div>
                        {postcodeVerifyMsg ? (
                          <p className={`text-[10px] font-black uppercase tracking-wider ${postcodeVerified ? 'text-emerald-600' : 'text-amber-700'}`}>
                            {postcodeVerifyMsg}
                          </p>
                        ) : (
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                            Verify with UK postcode dataset before continuing.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-6 animate-in slide-in-from-right-8">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-blue-200">{displayStepNumber(currentStep)}</div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Special Requirements</h3>
                </div>
                <textarea
                  className="w-full h-40 bg-card rounded-2xl p-6 border-2 border-input outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-medium text-foreground"
                  placeholder="Any special instructions? Key location, parking, pets, etc..."
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                />
                {selectedService && getServiceTrigger(selectedService) === 'standard' && (
                  <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5 space-y-3">
                    <p className="text-sm font-black text-slate-900">Want us to come with a hoover and cleaning materials?</p>
                    <p className="text-xs font-medium text-slate-500">If you don't have your own supplies, our team can bring everything needed.</p>
                    <div className="space-y-2">
                      <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                        <input type="radio" name="cleaningMaterials" value="none" checked={cleaningMaterials === 'none'} onChange={() => setCleaningMaterials('none')} className="w-4 h-4 text-blue-600" />
                        <div className="flex-1">
                          <span className="text-sm font-bold text-slate-800">No thanks, I have my own</span>
                        </div>
                        <span className="text-sm font-black text-slate-400">Free</span>
                      </label>
                      <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                        <input type="radio" name="cleaningMaterials" value="hoover_only" checked={cleaningMaterials === 'hoover_only'} onChange={() => setCleaningMaterials('hoover_only')} className="w-4 h-4 text-blue-600" />
                        <div className="flex-1">
                          <span className="text-sm font-bold text-slate-800">Just a hoover</span>
                        </div>
                        <span className="text-sm font-black text-emerald-700">+£3.00</span>
                      </label>
                      <label className="flex items-center gap-3 p-3 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors">
                        <input type="radio" name="cleaningMaterials" value="hoover_and_materials" checked={cleaningMaterials === 'hoover_and_materials'} onChange={() => setCleaningMaterials('hoover_and_materials')} className="w-4 h-4 text-blue-600" />
                        <div className="flex-1">
                          <span className="text-sm font-bold text-slate-800">Hoover + cleaning materials</span>
                        </div>
                        <span className="text-sm font-black text-emerald-700">+£6.00</span>
                      </label>
                    </div>
                  </div>
                )}

                <label className="flex items-center space-x-3 p-4 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors">
                  <input
                    type="checkbox"
                    checked={smsOptIn}
                    onChange={(e) => setSmsOptIn(e.target.checked)}
                    className="w-5 h-5 rounded-lg text-blue-600 focus:ring-blue-500 border-gray-300"
                  />
                  <span className="font-bold text-slate-700 text-sm">Receive SMS updates & reminders about my booking</span>
                </label>
              </div>
            )}

            {currentStep === 6 && (
              <div className="space-y-5 animate-in slide-in-from-right-8">
                <div className="flex items-center space-x-4 mb-6">
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-lg shadow-lg shadow-blue-200">{displayStepNumber(currentStep)}</div>
                  <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Review Invoice</h3>
                </div>
                <div className="flex items-center space-x-6 rounded-[2rem] border border-sky-100/90 bg-gradient-to-r from-sky-50/90 via-white to-indigo-50/40 p-8 shadow-md ring-1 ring-white/80">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-lg shadow-indigo-300/30">
                    <CheckCircle className="h-8 w-8" />
                  </div>
                  <div>
                    <h4 className="font-black text-slate-900">Review invoice</h4>
                    <p className="text-sm font-medium text-sky-800/90">Please review your booking details before confirming.</p>
                  </div>
                </div>

                {/* Discount Code */}
                <div className="space-y-4">
                  <label className="text-sm font-black uppercase text-slate-400 tracking-wider">Promo Code (Optional)</label>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      className="flex-1 bg-card rounded-2xl p-4 font-bold outline-none border-2 border-input focus:border-primary focus:ring-2 focus:ring-primary/25 transition-colors uppercase text-foreground"
                      placeholder="Enter Code"
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
                      className={`px-6 rounded-2xl font-black text-sm uppercase tracking-wider transition-all ${appliedDiscount ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-slate-900 text-white hover:bg-slate-800'}`}
                      disabled={isValidatingDiscount}
                    >
                      {isValidatingDiscount ? '...' : appliedDiscount ? 'Remove' : 'Apply'}
                    </button>
                  </div>
                  {discountError && <p className="text-red-500 font-bold text-xs mt-1">{discountError}</p>}
                  {appliedDiscount && <p className="text-green-600 font-bold text-xs mt-1">Discount Applied: {appliedDiscount.code}</p>}
                </div>

                {/* Optional Tip Selection for Invoice */}
                <div className="space-y-4">
                  <label className="text-sm font-black uppercase text-slate-400 tracking-wider">Add a Tip (Optional)</label>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                    {[0, 5, 10, 15, 20].map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { setTipPercent(p); setCustomTip(''); }}
                        className={`rounded-2xl px-5 py-3 font-black transition-all sm:px-6 sm:py-4 ${tipPercent === p && tipPercent !== -1 ? 'scale-110 bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {p === 0 ? 'No Tip' : `${p}%`}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setTipPercent(-1)}
                      className={`rounded-2xl px-5 py-3 font-black transition-all sm:px-6 sm:py-4 ${tipPercent === -1 ? 'scale-110 bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      Custom £
                    </button>
                  </div>
                  {tipPercent === -1 && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tip amount (£)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        inputMode="decimal"
                        value={customTip}
                        onChange={(e) => setCustomTip(e.target.value)}
                        placeholder="0.00"
                        className="w-full max-w-xs rounded-2xl border-2 border-slate-200/90 bg-white/95 p-4 font-black text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/12"
                      />
                    </div>
                  )}
                </div>

                {/* Invoice (no transform scale - scale does not shrink layout box, causing huge gap above nav) */}
                <div className="mt-4 w-full">
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
                      totalPrice,
                    }}
                    serviceConfig={selectedService}
                    extrasConfig={extras}
                    total={totalPrice}
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
              <div className="space-y-6 animate-in slide-in-from-right-8">
                <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 p-8 text-white shadow-[0_24px_60px_-12px_rgba(15,23,42,0.45)] ring-1 ring-white/10">
                  <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full bg-indigo-500/25 blur-3xl" />
                  <div className="pointer-events-none absolute bottom-0 left-1/4 h-32 w-32 rounded-full bg-sky-500/15 blur-2xl" />
                  <ShieldCheck className="pointer-events-none absolute right-4 top-4 h-32 w-32 text-white/10" aria-hidden />
                  <h3 className="relative z-[1] mb-6 border-b border-white/10 pb-4 text-xl font-black uppercase tracking-widest">Booking summary</h3>

                  <div className="space-y-6 relative z-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Service Details</div>
                        <div className="text-lg font-black text-white">{selectedService?.name}</div>
                        <div className="text-sm font-bold text-slate-300">{frequency} • {calculatedDuration} Hours (booked)</div>
                      </div>
                      <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Date & Time</div>
                        <div className="text-lg font-black text-white">{date}</div>
                        <div className="text-sm font-bold text-slate-300">@ {time}</div>
                      </div>
                    </div>

                    <div className="bg-white/5 p-4 rounded-2xl border border-white/10">
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Location</div>
                      <div className="text-sm font-bold text-white">{address.line1}</div>
                      {address.line2 && <div className="text-sm font-bold text-slate-300">{address.line2}</div>}
                      <div className="text-sm font-bold text-slate-300">{address.city}, {address.postcode}</div>
                    </div>

                    <div className="flex justify-between items-center pt-4 border-t border-white/10">
                      <span className="text-lg text-slate-300 font-bold">Total Estimate</span>
                      <span className="text-3xl text-blue-400 font-black">
                        {(() => {
                          const trig = getServiceTrigger(selectedService);
                          return trig === 'commercial' || trig === 'jet_washing'
                            ? 'Quote Based'
                            : `£${Number(totalPrice).toFixed(2)}`;
                        })()}
                      </span>
                    </div>
                  </div>
                </div>

                {invoiceStepSkipped && selectedService ? (
                  <div className="space-y-3 rounded-[2rem] border border-slate-200/80 bg-white p-6 shadow-lg ring-1 ring-slate-100/80">
                    <h4 className="text-sm font-black uppercase tracking-widest text-slate-800">Payment and terms</h4>
                    <p className="text-xs font-semibold leading-relaxed text-slate-600">
                      This booking path skips the separate invoice screen. Review the payment details and tick the agreement
                      before you submit your request.
                    </p>
                    <div className="max-h-[min(70vh,560px)] overflow-y-auto rounded-2xl border border-slate-100">
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
                          totalPrice,
                        }}
                        serviceConfig={selectedService}
                        extrasConfig={extras}
                        total={totalPrice}
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
                  <p className="text-center text-xs font-bold text-slate-500">
                    {depositTermsAccepted
                      ? 'Terms accepted on the invoice step. Submit your booking request when you are ready.'
                      : 'Go back to the invoice step and tick the payment agreement before submitting.'}
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="relative flex flex-col-reverse justify-between gap-4 border-t border-slate-200/80 bg-gradient-to-r from-slate-50/90 via-white to-sky-50/20 p-6 backdrop-blur-sm sm:flex-row sm:gap-0 md:p-10">
            <button
              onClick={back}
              disabled={currentStep === 0}
              className="flex w-full items-center justify-center space-x-2 rounded-2xl px-8 py-4 font-bold text-slate-500 transition-all hover:bg-white/80 hover:shadow-sm disabled:pointer-events-none disabled:opacity-0 sm:w-auto"
            >
              <ChevronLeft className="h-5 w-5" />
              <span>Previous</span>
            </button>
            <button
              onClick={currentStep === STEPS.length - 1 ? handleFinalSubmit : next}
              disabled={currentStep === 0 && !serviceId || isProcessing}
              className="group flex w-full items-center justify-center space-x-3 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-indigo-700 px-10 py-4 font-black text-white shadow-lg shadow-indigo-500/25 transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-50 sm:w-auto"
            >
              <span>
                {isProcessing ? 'Processing...' : currentStep === STEPS.length - 1 ? 'Submit booking request' : 'Next step'}
              </span>
              {!isProcessing && <ChevronRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />}
            </button>
          </div>
        </div>
      </div>

      <div className="lg:col-span-4">
        <div className="sticky top-28 space-y-6">
          <div className="overflow-hidden rounded-[2.5rem] border border-slate-200/60 bg-white/95 shadow-[0_20px_50px_-12px_rgba(30,58,138,0.15)] ring-1 ring-slate-100/80 backdrop-blur-sm">
            <div className="relative overflow-hidden bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 p-8 text-white">
              <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
              <div className="pointer-events-none absolute bottom-0 left-0 h-28 w-28 rounded-full bg-sky-400/20 blur-xl" />
              <Sparkles className="absolute right-6 top-6 h-20 w-20 text-white/15" aria-hidden />
              <span className="relative z-[1] mb-2 block text-[10px] font-black uppercase tracking-[0.2em] text-white/85">Live cost estimate</span>
              <div className="relative z-[1] text-5xl font-black tracking-tight drop-shadow-sm">£{Number(totalPrice).toFixed(2)}</div>
              <div className="relative z-[1] mt-4 inline-flex items-center rounded-xl border border-white/20 bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur-md">
                Est. duration: {Math.floor(calculatedDuration)}h {Math.round((calculatedDuration - Math.floor(calculatedDuration)) * 60) > 0 ? `${Math.round((calculatedDuration - Math.floor(calculatedDuration)) * 60)}m` : ''}
              </div>
            </div>
            <div className="space-y-4 p-8">
              {/* Service & Duration */}
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-sm font-bold text-slate-500">Service:</span>
                <span className="text-sm font-black text-slate-900 text-right">{selectedService?.name || 'None'}</span>
              </div>
              <div className="flex justify-between items-center pb-4 border-b border-slate-100">
                <span className="text-sm font-bold text-slate-500">Duration:</span>
                <span className="text-sm font-black text-slate-900">
                  {Math.floor(calculatedDuration)}h {Math.round((calculatedDuration - Math.floor(calculatedDuration)) * 60) > 0 ? `${Math.round((calculatedDuration - Math.floor(calculatedDuration)) * 60)}m` : ''}
                </span>
              </div>

              {/* Call-out + base line */}
              <div className="pb-4 border-b border-slate-100">
                {selectedService && isDeepOrEOTService(selectedService, selectedService.name) && (
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-bold text-slate-500">Call-out charge:</span>
                    <span className="text-sm font-black text-slate-900">
                      £{resolveDeepEotCallOutChargeGbp(selectedService).toFixed(2)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-slate-500">
                    {(() => {
                      const trig = getServiceTrigger(selectedService);
                      return trig === 'deep' || trig === 'end_of_tenancy'
                        ? 'Minimum duration (instruction only):'
                        : 'Base Price:';
                    })()}
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    £{(() => {
                      if (!selectedService) return '0.00';
                      const baseRate = Number(selectedService.baseRate) || 0;
                      const trig = getServiceTrigger(selectedService);

                      if (trig === 'deep' || trig === 'end_of_tenancy') {
                        return '0.00';
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

              {/* Selected Extras Section (Additional Services) */}
              {/* Selected Extras Section (Additional Services) */}
              <div className="pb-4 border-b border-slate-100">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-bold text-slate-500">Selected Items:</span>
                  <span className="text-sm font-black text-slate-900">
                    £{(() => {
                      const trig = getServiceTrigger(selectedService);
                      const isHourly = trig === 'standard' || trig === 'airbnb' || trig === 'custom';
                      return selectedExtras.reduce((sum, item) => {
                        const extra = extras.find(e => e.id === item.id);
                        if (!extra) return sum;

                        const isRoomExtra = ['bedroom', 'reception', 'bathroom', 'utility', 'cloakroom', 'clock', 'kitchen', 'carpet'].some(n => extra.name.toLowerCase().includes(n));

                        if (isHourly && isRoomExtra) return sum;

                        return sum + (Number(extra.price) * item.quantity);
                      }, 0).toFixed(2);
                    })()}
                  </span>
                </div>
                {itemizedDurationBreakdown && isDeepOrEOTService(selectedService, selectedService?.name) && (
                  <p className="text-[10px] font-bold text-slate-400 mb-2 -mt-1">
                    Each line has its own price; estimated minimum duration is for scheduling only (not charged).
                  </p>
                )}
                <div className="space-y-1 pl-2 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                  {selectedExtras.map(item => {
                    const extra = extras.find(e => e.id === item.id);
                    if (!extra) return null;
                    const lowerName = extra.name.toLowerCase();
                    const isCloakroomToilet =
                      (lowerName.includes('cloakroom') || lowerName.includes('clockroom') || /clock\s*room/.test(lowerName)) &&
                      (lowerName.includes('toilet') || /\bwc\b/.test(lowerName));
                    const displayName = isCloakroomToilet ? 'Cloakroom Toilet (£15/30min each)' : extra.name;

                    const trig = getServiceTrigger(selectedService);
                    const isHourly = trig === 'standard' || trig === 'airbnb' || trig === 'custom';
                    const isRoomExtra = ['bedroom', 'reception', 'bathroom', 'utility', 'cloakroom', 'clock', 'kitchen', 'carpet', 'toilet'].some(n => extra.name.toLowerCase().includes(n));

                    if (isHourly && isRoomExtra) return null;

                    const isDeepOrEOT = trig === 'deep' || trig === 'end_of_tenancy';
                    if (isDeepOrEOT) {
                      const durLine = itemizedDurationBreakdown?.lines.find((l) => l.extraId === item.id);
                      const lineH = durLine?.lineHours ?? 0;
                      const lineSubtotal = Number(extra.price) * item.quantity;
                      return (
                        <div key={item.id} className="flex justify-between gap-2 text-xs text-slate-500">
                          <span>• {item.quantity} × {displayName}</span>
                          <span className="text-right shrink-0">
                            £{lineSubtotal.toFixed(2)}
                            {lineH > 0 ? <span className="text-slate-400 font-medium"> · +{lineH.toFixed(2)}h</span> : null}
                          </span>
                        </div>
                      );
                    }

                    return (
                      <div key={item.id} className="flex justify-between text-xs text-slate-400">
                        <span>• {item.quantity} x {displayName}</span>
                        <span>£{(Number(extra.price) * item.quantity).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
                {cleaningMaterials !== 'none' && (
                  <div className="flex justify-between text-xs text-slate-500 pt-1 border-t border-dashed border-slate-100 mt-1">
                    <span>• {cleaningMaterials === 'hoover_and_materials' ? 'Hoover + cleaning materials' : 'Hoover only'}</span>
                    <span className="font-bold">£{cleaningMaterials === 'hoover_and_materials' ? '6.00' : '3.00'}</span>
                  </div>
                )}
              </div>

              {pricing.discountAmount > 0 ? (
                <div className="flex justify-between items-center border-t border-slate-100 py-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Discount{appliedDiscount?.code ? ` (${appliedDiscount.code})` : ''}
                  </span>
                  <span className="text-sm font-black text-emerald-700">−£{pricing.discountAmount.toFixed(2)}</span>
                </div>
              ) : null}
              <div className="flex justify-between items-center border-t border-slate-100 py-2">
                <span className="text-sm font-bold text-slate-500">Subtotal (after discount)</span>
                <span className="text-lg font-bold text-slate-900">£{pricing.totalAfterDiscount.toFixed(2)}</span>
              </div>
              {pricing.tipAmount > 0 ? (
                <div className="flex justify-between items-center py-1">
                  <span className="text-sm font-bold text-slate-500">Tip</span>
                  <span className="text-lg font-bold text-slate-900">£{pricing.tipAmount.toFixed(2)}</span>
                </div>
              ) : null}
              <div className="flex items-center justify-between rounded-2xl border border-emerald-100/80 bg-gradient-to-br from-emerald-50/90 to-teal-50/50 px-4 py-3">
                <span className="text-lg font-black uppercase tracking-tighter text-emerald-950">Total due</span>
                <span className="text-3xl font-black tracking-tight text-emerald-800">£{pricing.grandTotal.toFixed(2)}</span>
              </div>
              <button
                onClick={handleReset}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-slate-200/90 py-3 font-bold text-slate-500 transition-all hover:border-red-200 hover:bg-red-50/90 hover:text-red-600"
              >
                <RotateCcw className="h-4 w-4" /> Start over
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Reset Confirmation Dialog */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-black text-slate-900">Reset booking?</h3>
            <p className="mb-6 text-sm font-semibold text-slate-500">This will clear all your booking details and start from scratch.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 rounded-xl border-2 border-slate-200 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReset}
                className="flex-1 rounded-xl bg-red-500 py-3 text-sm font-bold text-white transition-colors hover:bg-red-600"
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sticky Summary */}
      <div className="safe-area-pb fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between border-t border-slate-200/80 bg-white/90 p-4 shadow-[0_-12px_40px_-8px_rgba(15,23,42,0.12)] backdrop-blur-xl supports-[backdrop-filter]:bg-white/75 lg:hidden">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Estimated total</span>
          <span className="bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-2xl font-black text-transparent">£{Number(totalPrice).toFixed(2)}</span>
        </div>
        <div className="flex space-x-2 sm:space-x-3">
          <button onClick={handleReset} className="rounded-xl bg-slate-50 p-3 font-bold text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500" title="Start Over">
            <RotateCcw className="h-5 w-5" />
          </button>
          {currentStep > 0 && (
            <button onClick={back} className="rounded-xl bg-slate-100 p-3 font-bold text-slate-600 transition-colors hover:bg-slate-200">
              <ChevronLeft className="h-5 w-5" />
            </button>
          )}
          <button
            onClick={currentStep === STEPS.length - 1 ? handleFinalSubmit : next}
            disabled={(currentStep === 0 && !serviceId) || isProcessing}
            className="flex items-center space-x-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 font-black text-white shadow-lg shadow-indigo-500/20"
          >
            <span>
              {currentStep === STEPS.length - 1
                ? isProcessing
                  ? 'Processing'
                  : 'Submit'
                : 'Next'}
            </span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
    </div>
  );
};

const InputField: React.FC<{ label: string, value: string, onChange: (v: string) => void, placeholder?: string, icon?: React.ReactNode, type?: string }> = ({ label, value, onChange, placeholder, icon, type = 'text' }) => (
  <div className="space-y-2">
    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</label>
    <div className="relative">
      {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">{icon}</div>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full rounded-2xl border-2 border-slate-200/90 bg-white/95 p-4 font-black text-foreground shadow-sm outline-none ring-slate-200/40 transition-all placeholder:text-slate-400 focus:border-primary focus:ring-4 focus:ring-primary/12 ${icon ? 'pl-12' : ''}`}
      />
    </div>
  </div>
);

const DropdownField: React.FC<{ label: string, value: number | string, options: (number | string)[], onChange: (val: string | number) => void, isString?: boolean }> = ({ label, value, options, onChange, isString }) => (
  <div className="space-y-2">
    <label className="text-sm font-bold text-slate-700">{label}</label>
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full cursor-pointer appearance-none rounded-xl border border-slate-200/90 bg-white/95 p-3 pr-10 text-sm font-medium text-slate-700 shadow-sm outline-none ring-slate-100/80 transition-all focus:border-sky-400 focus:ring-2 focus:ring-sky-200/60"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
        <ChevronDown className="w-4 h-4" />
      </div>
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
