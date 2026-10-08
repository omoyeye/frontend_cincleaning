import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { apiClient, apiUrl } from '../services/api';
import { ServiceConfig, Extra } from '../types';
import {
  getServiceTrigger,
  isDeepOrEOTService,
  resolveDeepEotCallOutChargeGbp,
  computeBookedDurationHours,
  resolveBookingFlowSteps,
} from '../src/utils/bookingHelpers';
import styles from './QuoteWidget.module.css';
import { calculateHourlyPrice, hourlyRateFor, londonRateOf, lookupPricingRegion, type PricingRegion } from '../src/utils/pricing';

function resolveAirbnbDuration(bedrooms: number): number {
  if (!Number.isFinite(bedrooms) || bedrooms < 1) return 0;
  return bedrooms + 1;
}

function resolveToiletExtra(extras: Extra[]): Extra | undefined {
  if (!extras?.length) return undefined;
  const lower = (s: string) => s.toLowerCase();
  return (
    extras.find(e => /(clock\s*room|cloakroom)/i.test(e.name) && (/\bwc\b/i.test(e.name) || lower(e.name).includes('toilet'))) ||
    extras.find(e => lower(e.name).includes('cloakroom') && !lower(e.name).includes('bathroom')) ||
    extras.find(e => /\bwc\b/i.test(e.name) && !lower(e.name).includes('bathroom')) ||
    extras.find(e => lower(e.name).includes('toilet') && !lower(e.name).includes('bathroom'))
  );
}

const UK_POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface QuoteWidgetProps {
  onBookNow?: () => void;
}

type Step = 'service' | 'details' | 'extras' | 'contact' | 'result';

const STEP_ORDER: Step[] = ['service', 'details', 'extras', 'contact', 'result'];

const QuoteWidget: React.FC<QuoteWidgetProps> = ({ onBookNow }) => {
  const [step, setStep] = useState<Step>('service');
  const [services, setServices] = useState<ServiceConfig[]>([]);
  const [extrasList, setExtrasList] = useState<Extra[]>([]);
  const [loading, setLoading] = useState(true);

  // Email capture (after service step)
  const [emailCaptured, setEmailCaptured] = useState(false);
  const [leadId, setLeadId] = useState<number | null>(null);
  const [gateSubmitting, setGateSubmitting] = useState(false);
  const [gateError, setGateError] = useState('');

  // Form state — mirrors BookingWizard
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<'One-time' | 'Weekly' | 'Fortnightly' | 'Monthly'>('One-time');
  const [duration, setDuration] = useState(3);
  const [bedrooms, setBedrooms] = useState(1);
  const [bathrooms, setBathrooms] = useState(1);
  const [propertySize, setPropertySize] = useState('1 Bedroom');
  const [commercialDetails, setCommercialDetails] = useState('');
  const [selectedExtras, setSelectedExtras] = useState<{ id: string; quantity: number }[]>([]);
  // Deep/EOT room counts
  const [deepRooms, setDeepRooms] = useState<Record<string, number>>({});

  // Contact
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [postcode, setPostcode] = useState('');
  const [pricingRegion, setPricingRegion] = useState<PricingRegion | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [resultPrice, setResultPrice] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([apiClient.getServices(), apiClient.getExtraServices()])
      .then(([s, e]) => { setServices(s || []); setExtrasList(e || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleEmailCapture = useCallback(async () => {
    if (!EMAIL_RE.test(email.trim())) return;
    setGateSubmitting(true);
    setGateError('');
    try {
      const res = await fetch(apiUrl('/quote-lead'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Something went wrong. Please try again.');
      }
      const data = await res.json();
      setLeadId(data.id ?? null);
      setEmailCaptured(true);
    } catch (e: any) {
      setGateError(e?.message || 'Something went wrong. Please try again.');
    } finally {
      setGateSubmitting(false);
    }
  }, [email]);

  const availableServices = useMemo(() => services.filter(s => s.active !== false), [services]);
  const selectedService = useMemo(
    () => availableServices.find(s => String(s.id) === String(serviceId)),
    [serviceId, availableServices],
  );

  const trig = useMemo(() => getServiceTrigger(selectedService), [selectedService]);

  // When service changes, reset dependent state
  useEffect(() => {
    if (!selectedService) return;
    const t = getServiceTrigger(selectedService);
    setSelectedExtras([]);
    setDeepRooms({});
    setCommercialDetails('');
    if (t === 'airbnb') {
      setBedrooms(1);
      setDuration(resolveAirbnbDuration(1));
    } else if (t === 'deep' || t === 'end_of_tenancy') {
      setDuration(Math.max(3, Number(selectedService.minDuration) || 3));
    } else {
      setDuration(selectedService.minDuration || 3);
    }
  }, [selectedService]);

  // Which steps to show (skip extras if service doesn't use them)
  const activeSteps = useMemo<Step[]>(() => {
    if (!selectedService) return ['service'];
    const flowSteps = resolveBookingFlowSteps(selectedService);
    const hasExtras = flowSteps.includes('extras');
    const hasDetails = flowSteps.includes('details');
    const steps: Step[] = ['service'];
    if (hasDetails) steps.push('details');
    if (hasExtras) steps.push('extras');
    steps.push('contact', 'result');
    return steps;
  }, [selectedService]);

  const stepIndex = activeSteps.indexOf(step);
  const stepNumber = stepIndex + 1;
  const totalSteps = activeSteps.length - 1; // don't count 'result'

  // ── Pricing engine (mirrors BookingWizard exactly) ──

  const calculatedDuration = useMemo(() => {
    if (!selectedService) return 3;
    return computeBookedDurationHours(
      { serviceType: selectedService.name, duration, extras: selectedExtras },
      selectedService,
      extrasList,
    );
  }, [selectedService, duration, selectedExtras, extrasList]);

  const pricing = useMemo(() => {
    if (!selectedService) return { subtotal: 0, grandTotal: 0 };
    const baseRate = Number(selectedService.baseRate) || 0;
    let calculated = 0;

    const isAirBnB = trig === 'airbnb';
    const isCommercialOrJet = trig === 'commercial' || trig === 'jet_washing';
    const isGeneral = trig === 'standard' || trig === 'custom';
    const isDeepOrEOT = trig === 'deep' || trig === 'end_of_tenancy';

    if (isCommercialOrJet) {
      calculated = 0;
    } else if (isAirBnB) {
      calculated = baseRate * resolveAirbnbDuration(bedrooms);
    } else if (trig === 'standard') {
      calculated = calculateHourlyPrice({
        hourlyRate: hourlyRateFor(selectedService, pricingRegion),
        hours: duration || 2,
        extras: selectedExtras
          .map((item) => {
            const ex = extrasList.find((e) => e.id === item.id);
            return ex ? { price: ex.price, quantity: item.quantity } : null;
          })
          .filter(Boolean) as Array<{ price: number; quantity: number }>,
      }).total;
    } else if (isGeneral) {
      calculated = baseRate * (duration || 2);
      const extrasCost = selectedExtras.reduce((sum, item) => {
        const ex = extrasList.find(e => e.id === item.id);
        return ex ? sum + Number(ex.price) * item.quantity : sum;
      }, 0);
      calculated += extrasCost;
    } else if (isDeepOrEOT) {
      const callOut = resolveDeepEotCallOutChargeGbp(selectedService);
      const extrasCost = selectedExtras.reduce((sum, item) => {
        const ex = extrasList.find(e => e.id === item.id);
        return ex ? sum + Number(ex.price) * item.quantity : sum;
      }, 0);
      calculated = callOut + extrasCost;
    } else {
      calculated = baseRate * (duration || 2);
    }

    return { subtotal: calculated, grandTotal: calculated };
  }, [selectedService, trig, bedrooms, duration, selectedExtras, extrasList, pricingRegion]);

  // Pricing region from the (optional) postcode: London postcodes use the London hourly rate.
  useEffect(() => {
    const pc = postcode.trim();
    if (!pc || !UK_POSTCODE.test(pc)) {
      setPricingRegion(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      lookupPricingRegion(pc).then((r) => {
        if (!cancelled) setPricingRegion(r?.region ?? null);
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [postcode]);

  // ── Navigation ──

  const goNext = useCallback(() => {
    const idx = activeSteps.indexOf(step);
    if (idx < activeSteps.length - 1) setStep(activeSteps[idx + 1]);
  }, [step, activeSteps]);

  // Auto-advance after email capture
  useEffect(() => {
    if (emailCaptured && step === 'service') goNext();
  }, [emailCaptured, step, goNext]);

  const goBack = useCallback(() => {
    const idx = activeSteps.indexOf(step);
    if (idx > 0) setStep(activeSteps[idx - 1]);
  }, [step, activeSteps]);

  // ── Submit ──

  const handleSubmit = useCallback(async () => {
    if (!selectedService || !name.trim() || !EMAIL_RE.test(email.trim())) return;
    setSubmitting(true);
    setSubmitError('');

    const payload = {
      first_name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      postcode: postcode.trim().toUpperCase(),
      service_type: selectedService.name,
      bedrooms: String(bedrooms),
      bathrooms: String(bathrooms),
      price_estimate: pricing.grandTotal > 0 ? pricing.grandTotal : null,
      duration: calculatedDuration,
      frequency,
      lead_id: leadId,
      extras: selectedExtras.map(se => {
        const ex = extrasList.find(e => e.id === se.id);
        return { name: ex?.name || se.id, quantity: se.quantity, price: Number(ex?.price || 0) };
      }).filter(e => e.quantity > 0),
    };

    if (typeof window !== 'undefined' && (window as any).dataLayer) {
      (window as any).dataLayer.push({
        event: 'quote_widget_submit',
        service_type: payload.service_type,
        postcode: payload.postcode,
        price_estimate: payload.price_estimate,
      });
    }

    try {
      const res = await fetch(apiUrl('/quote-submit'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Something went wrong. Please try again.');
      }
    } catch (e: any) {
      setSubmitting(false);
      setSubmitError(e?.message || 'Something went wrong. Please try again.');
      return;
    }

    setResultPrice(pricing.grandTotal > 0 ? pricing.grandTotal : null);
    setSubmitting(false);
    setStep('result');
  }, [selectedService, name, email, phone, postcode, bedrooms, bathrooms, pricing, calculatedDuration, frequency, selectedExtras, extrasList, leadId]);

  // ── Deep/EOT room-based extras helper ──

  const roomExtras = useMemo(() => {
    const roomKeywords = ['bedroom', 'reception', 'bathroom', 'utility', 'cloakroom', 'clock', 'kitchen', 'carpet'];
    return extrasList.filter(e => roomKeywords.some(k => e.name.toLowerCase().includes(k)));
  }, [extrasList]);

  const additionalExtras = useMemo(() => {
    const roomKeywords = ['bedroom', 'reception', 'bathroom', 'utility', 'cloakroom', 'clock', 'kitchen', 'carpet'];
    return extrasList.filter(e => !roomKeywords.some(k => e.name.toLowerCase().includes(k)));
  }, [extrasList]);

  const updateRoomExtra = useCallback((extra: Extra, qty: number) => {
    setDeepRooms(prev => ({ ...prev, [extra.id]: qty }));
    setSelectedExtras(prev => {
      const others = prev.filter(p => String(p.id) !== String(extra.id));
      return qty > 0 ? [...others, { id: extra.id, quantity: qty }] : others;
    });
  }, []);

  const toggleAdditionalExtra = useCallback((extra: Extra, delta: number) => {
    setSelectedExtras(prev => {
      const existing = prev.find(p => p.id === extra.id);
      const newQty = Math.max(0, (existing?.quantity || 0) + delta);
      const others = prev.filter(p => p.id !== extra.id);
      return newQty > 0 ? [...others, { id: extra.id, quantity: newQty }] : others;
    });
  }, []);

  // ── Validation ──

  const canProceedFromService = !!serviceId;
  const canProceedFromDetails = useMemo(() => {
    if (!selectedService) return false;
    if (trig === 'airbnb') return bedrooms >= 1;
    if (trig === 'commercial' || trig === 'jet_washing') return commercialDetails.trim().length >= 25;
    return true;
  }, [selectedService, trig, bedrooms, commercialDetails]);
  const postcodeOk = postcode.trim() ? UK_POSTCODE.test(postcode.trim()) : true;
  const emailOk = EMAIL_RE.test(email.trim());
  const canSubmitContact = !!name.trim() && emailOk && postcodeOk && !submitting;

  if (loading) {
    return (
      <div className={styles.widget}>
        <div className={styles.loadingBox}>
          <div className={styles.spinner} />
          <span className={styles.loadingText}>Loading services...</span>
        </div>
      </div>
    );
  }

  // ── RESULT SCREEN ──

  if (step === 'result') {
    const isQuoteBased = trig === 'commercial' || trig === 'jet_washing';
    return (
      <div className={styles.widget}>
        <div className={styles.result}>
          <div className={styles.resultFrom}>Your estimated cost</div>
          {resultPrice != null && !isQuoteBased ? (
            <div className={styles.resultPrice}>£{resultPrice.toFixed(2)}</div>
          ) : (
            <div className={styles.resultPrice}>Bespoke Quote</div>
          )}
          <div className={styles.resultService}>{selectedService?.name} · {frequency}</div>
          {resultPrice != null && !isQuoteBased && (
            <div className={styles.resultDuration}>
              Est. duration: {Math.floor(calculatedDuration)}h{' '}
              {Math.round((calculatedDuration % 1) * 60) > 0 ? `${Math.round((calculatedDuration % 1) * 60)}m` : ''}
            </div>
          )}
          {selectedExtras.length > 0 && (
            <div className={styles.resultExtrasBox}>
              <div className={styles.resultExtrasTitle}>Included extras:</div>
              {selectedExtras.map(se => {
                const ex = extrasList.find(e => e.id === se.id);
                if (!ex) return null;
                return (
                  <div key={se.id} className={styles.resultExtraLine}>
                    {se.quantity} x {ex.name} — £{(Number(ex.price) * se.quantity).toFixed(2)}
                  </div>
                );
              })}
            </div>
          )}
          <div className={styles.resultNote}>
            {resultPrice != null
              ? 'This is an indicative estimate based on the information you provided. Your final price is confirmed when you book. We have emailed you a copy.'
              : 'We have your details and will send a tailored quote shortly.'}
          </div>
          <div className={styles.resultPromo}>
            Use code <span className={styles.promoCode}>FIRST10</span> for 10% off your first booking.
          </div>
          {onBookNow && (
            <button type="button" className={styles.btnBook} onClick={onBookNow}>
              Book this clean
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── FORM STEPS ──

  return (
    <div className={styles.widget}>
      {/* Progress */}
      <div className={styles.progress}>
        {activeSteps.filter(s => s !== 'result').map((s, i) => (
          <div key={s} className={`${styles.progressBar} ${i < stepNumber ? styles.active : ''}`} />
        ))}
      </div>

      {/* Live price sidebar (compact) */}
      {selectedService && (
        <div className={styles.priceBanner}>
          <div className={styles.priceLabel}>Live estimate</div>
          <div className={styles.priceValue}>
            {trig === 'commercial' || trig === 'jet_washing' ? 'Quote' : `£${pricing.grandTotal.toFixed(2)}`}
          </div>
          <div className={styles.priceMeta}>
            {selectedService.name} · {Math.floor(calculatedDuration)}h
            {Math.round((calculatedDuration % 1) * 60) > 0 ? ` ${Math.round((calculatedDuration % 1) * 60)}m` : ''}
          </div>
        </div>
      )}

      {/* ── STEP: Service ── */}
      {step === 'service' && (
        <>
          <div className={styles.stepTitle}>Step 1 — Choose Your Service</div>
          <div className={styles.serviceGrid}>
            {availableServices.map(svc => (
              <button
                key={svc.id}
                type="button"
                className={`${styles.serviceCard} ${serviceId === String(svc.id) ? styles.selected : ''}`}
                onClick={() => setServiceId(String(svc.id))}
              >
                <span className={styles.serviceLabel}>{svc.name}</span>
                <span className={styles.serviceDesc}>{svc.description}</span>
                <span className={styles.serviceRate}>
                  {(() => {
                    const t = getServiceTrigger(svc);
                    if (t === 'commercial' || t === 'jet_washing') return 'Quote based';
                    if (t === 'deep' || t === 'end_of_tenancy') return `From £${resolveDeepEotCallOutChargeGbp(svc)}`;
                    const london = t === 'standard' ? londonRateOf(svc) : null;
                    return london !== null
                      ? `£${Number(svc.baseRate).toFixed(0)}/hr · London £${london.toFixed(0)}/hr`
                      : `£${Number(svc.baseRate).toFixed(0)}/hr`;
                  })()}
                </span>
              </button>
            ))}
          </div>

          {/* Frequency */}
          {selectedService && (
            <div className={styles.frequencySection}>
              <div className={styles.sizeLabel}>How often?</div>
              <div className={styles.toggleGroup}>
                {(['One-time', 'Weekly', 'Fortnightly', 'Monthly'] as const).map(f => (
                  <button
                    key={f}
                    type="button"
                    className={`${styles.toggleBtn} ${frequency === f ? styles.active : ''}`}
                    onClick={() => setFrequency(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Email capture — shown after service selection, before proceeding */}
          {canProceedFromService && !emailCaptured && (
            <div className={styles.emailCapture}>
              <div className={styles.emailCaptureLabel}>Enter your email to continue</div>
              <div className={styles.emailCaptureHint}>Your email is required to unlock the next steps and receive your personalised quote. We won't share it with anyone.</div>
              <div className={styles.emailCaptureRow}>
                <input
                  type="email"
                  className={styles.formInput}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
                <button
                  type="button"
                  className={styles.btnNext}
                  disabled={!EMAIL_RE.test(email.trim()) || gateSubmitting}
                  onClick={handleEmailCapture}
                >
                  {gateSubmitting ? <><span className={styles.spinner} />...</> : 'Continue'}
                </button>
              </div>
              {gateError && <div className={`${styles.postcodeMsg} ${styles.postcodeBad}`}>{gateError}</div>}
              <div className={styles.emailCaptureTrust}>No spam. We will email you a copy of your quote.</div>
            </div>
          )}

          {emailCaptured && (
            <div className={styles.btnRow}>
              <button type="button" className={styles.btnNext} disabled={!canProceedFromService} onClick={goNext}>
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* ── STEP: Details ── */}
      {step === 'details' && selectedService && (
        <>
          <div className={styles.stepTitle}>Step {stepNumber} — Property Details</div>

          {trig === 'airbnb' && (
            <div className={styles.detailsBlock}>
              <div className={styles.sizeLabel}>Number of Bedrooms</div>
              <div className={styles.toggleGroup}>
                {[1, 2, 3, 4, 5].map(n => (
                  <button
                    key={n}
                    type="button"
                    className={`${styles.toggleBtn} ${bedrooms === n ? styles.active : ''}`}
                    onClick={() => { setBedrooms(n); setDuration(resolveAirbnbDuration(n)); }}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className={styles.estimate}>
                Fixed duration: {resolveAirbnbDuration(bedrooms)} hours
              </div>
            </div>
          )}

          {(trig === 'commercial' || trig === 'jet_washing') && (
            <div className={styles.detailsBlock}>
              <div className={styles.sizeLabel}>{trig === 'jet_washing' ? 'Surface Details' : 'Commercial Property Details'}</div>
              <textarea
                className={styles.textArea}
                placeholder={trig === 'jet_washing'
                  ? 'Describe surfaces to be cleaned (driveway, patio, deck, etc.)...'
                  : 'Describe your commercial property and cleaning requirements...'}
                value={commercialDetails}
                onChange={e => setCommercialDetails(e.target.value)}
                rows={4}
              />
              <div className={`${styles.charCount} ${commercialDetails.trim().length >= 25 ? styles.charOk : ''}`}>
                {commercialDetails.trim().length} / 25 characters minimum
              </div>
              <div className={styles.estimate}>
                This is a bespoke service. Provide details so we can prepare an accurate quote.
              </div>
            </div>
          )}

          {(trig === 'standard' || trig === 'custom') && (
            <div className={styles.detailsBlock}>
              <div className={styles.sizeSection}>
                <div className={styles.sizeLabel}>Property Size</div>
                <div className={styles.toggleGroup}>
                  {['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', '5 Bedroom', 'House', 'Flat'].map(s => (
                    <button
                      key={s}
                      type="button"
                      className={`${styles.toggleBtn} ${propertySize === s ? styles.active : ''}`}
                      onClick={() => setPropertySize(s)}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.sizeSection}>
                <div className={styles.sizeLabel}>Duration</div>
                <div className={styles.durationRow}>
                  <select
                    className={styles.durationSelect}
                    value={Math.floor(duration)}
                    onChange={e => {
                      const h = Number(e.target.value);
                      setDuration(h + (duration % 1));
                    }}
                  >
                    {[2, 3, 4, 5, 6, 7, 8].map(h => (
                      <option key={h} value={h}>{h} hours</option>
                    ))}
                  </select>
                  <select
                    className={styles.durationSelect}
                    value={Math.round((duration % 1) * 60)}
                    onChange={e => {
                      setDuration(Math.floor(duration) + Number(e.target.value) / 60);
                    }}
                  >
                    <option value={0}>00 min</option>
                    <option value={30}>30 min</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {(trig === 'deep' || trig === 'end_of_tenancy') && (
            <div className={styles.detailsBlock}>
              <div className={styles.estimate}>
                Call-out charge: £{resolveDeepEotCallOutChargeGbp(selectedService).toFixed(0)} + room-based pricing below
              </div>
              <div className={styles.roomGrid}>
                {roomExtras.map(ex => (
                  <div key={ex.id} className={styles.roomItem}>
                    <div className={styles.roomLabel}>
                      {ex.name}
                      <span className={styles.roomPrice}>£{Number(ex.price).toFixed(0)} each</span>
                    </div>
                    <select
                      className={styles.roomSelect}
                      value={deepRooms[ex.id] || 0}
                      onChange={e => updateRoomExtra(ex, Number(e.target.value))}
                    >
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className={styles.btnRow}>
            <button type="button" className={styles.btnBack} onClick={goBack}>Back</button>
            <button type="button" className={styles.btnNext} disabled={!canProceedFromDetails} onClick={goNext}>
              Next
            </button>
          </div>
        </>
      )}

      {/* ── STEP: Extras ── */}
      {step === 'extras' && selectedService && (
        <>
          <div className={styles.stepTitle}>Step {stepNumber} — Additional Services</div>
          <div className={styles.extrasGrid}>
            {additionalExtras.map(ex => {
              const qty = selectedExtras.find(s => s.id === ex.id)?.quantity || 0;
              return (
                <div key={ex.id} className={`${styles.extraCard} ${qty > 0 ? styles.extraSelected : ''}`}>
                  <div className={styles.extraInfo}>
                    <span className={styles.extraName}>{ex.name}</span>
                    <span className={styles.extraPrice}>£{Number(ex.price).toFixed(0)}</span>
                  </div>
                  <div className={styles.extraControls}>
                    <button type="button" className={styles.extraBtn} onClick={() => toggleAdditionalExtra(ex, -1)} disabled={qty === 0}>-</button>
                    <span className={styles.extraQty}>{qty}</span>
                    <button type="button" className={styles.extraBtn} onClick={() => toggleAdditionalExtra(ex, 1)}>+</button>
                  </div>
                </div>
              );
            })}
          </div>
          {additionalExtras.length === 0 && (
            <div className={styles.estimate}>No additional services available for this service type.</div>
          )}
          <div className={styles.btnRow}>
            <button type="button" className={styles.btnBack} onClick={goBack}>Back</button>
            <button type="button" className={styles.btnNext} onClick={goNext}>Next</button>
          </div>
        </>
      )}

      {/* ── STEP: Contact ── */}
      {step === 'contact' && (
        <>
          <div className={styles.stepTitle}>Step {stepNumber} — Your Details</div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Full Name</label>
            <input type="text" className={styles.formInput} value={name} onChange={e => setName(e.target.value)} placeholder="Your full name" />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Email</label>
            <input type="email" className={styles.formInput} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
            {email.trim() && !emailOk && <div className={`${styles.postcodeMsg} ${styles.postcodeBad}`}>Please enter a valid email address.</div>}
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Phone Number <span className={styles.optional}>(optional)</span></label>
            <input type="tel" className={styles.formInput} value={phone} onChange={e => setPhone(e.target.value)} placeholder="07xxx xxxxxx" autoComplete="tel" />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Postcode <span className={styles.optional}>(optional, sets your area's hourly rate)</span></label>
            <input type="text" className={styles.formInput} value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="e.g. E1 6AN" autoComplete="postal-code" />
            {postcode.trim() && !postcodeOk && <div className={`${styles.postcodeMsg} ${styles.postcodeBad}`}>Please check your postcode.</div>}
            {trig === 'standard' && selectedService && londonRateOf(selectedService) !== null && postcodeOk && pricingRegion && (
              <div className={styles.postcodeMsg}>
                {pricingRegion === 'london' ? 'London postcode' : 'Your area'}: £{hourlyRateFor(selectedService, pricingRegion).toFixed(2)} per hour
              </div>
            )}
          </div>

          {/* Summary before submit */}
          <div className={styles.summaryBox}>
            <div className={styles.summaryTitle}>Your estimate summary</div>
            <div className={styles.summaryRow}>
              <span>Service</span>
              <span>{selectedService?.name}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Frequency</span>
              <span>{frequency}</span>
            </div>
            <div className={styles.summaryRow}>
              <span>Duration</span>
              <span>{Math.floor(calculatedDuration)}h {Math.round((calculatedDuration % 1) * 60) > 0 ? `${Math.round((calculatedDuration % 1) * 60)}m` : ''}</span>
            </div>
            {selectedExtras.length > 0 && (
              <div className={styles.summaryExtras}>
                {selectedExtras.map(se => {
                  const ex = extrasList.find(e => e.id === se.id);
                  if (!ex) return null;
                  return <div key={se.id} className={styles.summaryExtraLine}>{se.quantity} x {ex.name} — £{(Number(ex.price) * se.quantity).toFixed(2)}</div>;
                })}
              </div>
            )}
            <div className={styles.summaryTotal}>
              <span>Estimated total</span>
              <span className={styles.summaryTotalPrice}>
                {trig === 'commercial' || trig === 'jet_washing' ? 'Quote based' : `£${pricing.grandTotal.toFixed(2)}`}
              </span>
            </div>
          </div>

          {submitError && <div className={`${styles.postcodeMsg} ${styles.postcodeBad}`}>{submitError}</div>}
          <div className={styles.btnRow}>
            <button type="button" className={styles.btnBack} onClick={goBack}>Back</button>
            <button
              type="button"
              className={styles.btnNext}
              disabled={!canSubmitContact}
              onClick={handleSubmit}
            >
              {submitting ? <><span className={styles.spinner} />Sending...</> : 'Get My Estimate'}
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default QuoteWidget;
