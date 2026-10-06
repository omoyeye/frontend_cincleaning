import type {
  PricingCalculatorConfig,
  PricingEstimateFormula,
  PricingFrequencyOption,
  PricingPageConfig,
  PricingPlanCard,
} from '../../types';

export const DEFAULT_PRICING_PAGE: PricingPageConfig = {
  eyebrow: 'TRANSPARENT PRICING',
  title: 'OUR PRICES',
  subtitle:
    'Premium cleaning should not be a mystery. We offer straightforward hourly rates from £13/hr + VAT with zero hidden fees.',
  popularBadgeLabel: 'Popular',
  selectPlanButtonLabel: 'Select Plan',
  plans: [
    {
      id: 'one-off',
      label: 'ONE-OFF',
      price: 30,
      note: 'Perfect for a single deep clean or quick refresh.',
      popular: false,
    },
    {
      id: 'one-month',
      label: 'ONE MONTH',
      price: 59,
      note: 'Maintain a steady sparkle with our monthly introductory package.',
      popular: true,
    },
    {
      id: 'two-months',
      label: 'TWO MONTHS',
      price: 69,
      note: 'Extended consistency for those who value long-term tidy maintenance.',
      popular: false,
    },
    {
      id: 'three-months',
      label: 'THREE MONTHS',
      price: 79,
      note: 'Our quarterly refresh package designed for families and busy professionals.',
      popular: false,
    },
    {
      id: 'six-months',
      label: 'SIX MONTHS',
      price: 119,
      note: 'Commit to cleanliness and save with our half-year premium membership.',
      popular: false,
    },
    {
      id: 'yearly',
      label: 'YEARLY',
      price: 209,
      note: 'The ultimate peace of mind. Full-year professional care for your space.',
      popular: false,
    },
  ],
  calculator: {
    title: 'GET A QUOTE',
    frequencySectionLabel: 'Frequency',
    frequencies: [
      { id: 'weekly', label: 'Weekly', factor: 1 },
      { id: 'fortnightly', label: 'Fortnightly', factor: 0.9 },
      { id: 'one-time', label: 'One Time', factor: 1.15 },
    ],
    serviceLengthLabel: 'Commitment (months)',
    serviceLengthMin: 3,
    serviceLengthMax: 6,
    serviceLengthStep: 3,
    serviceLengthDefault: 3,
    hoursPerVisitLabel: 'Hours per Visit',
    hoursPerVisitMin: 2,
    hoursPerVisitMax: 8,
    hoursPerVisitStep: 0.5,
    hoursPerVisitDefault: 3.5,
    formula: 'cin_tiered_hourly',
    baseHourlyRate: 13,
    estimateLabel: 'Estimated Rate',
    estimatePrefix: 'FROM £',
    estimateSuffix: 'PER HOUR',
    bookButtonLabel: 'BOOK THIS PLAN',
    decimalPlaces: 2,
    durationUnitLabel: 'Hours',
  },
};

function clampNum(n: number, fallback: number): number {
  return Number.isFinite(n) ? n : fallback;
}

function normalizeFrequency(f: Partial<PricingFrequencyOption> | undefined, i: number): PricingFrequencyOption {
  return {
    id: typeof f?.id === 'string' && f.id.trim() ? f.id.trim() : `freq-${i}`,
    label: typeof f?.label === 'string' && f.label.trim() ? f.label.trim() : `Option ${i + 1}`,
    factor: clampNum(Number(f?.factor), 1),
  };
}

function normalizePlan(p: Partial<PricingPlanCard> | undefined, i: number): PricingPlanCard {
  return {
    id: typeof p?.id === 'string' && p.id.trim() ? p.id.trim() : `plan-${i}`,
    label: typeof p?.label === 'string' ? p.label : '',
    price: clampNum(Number(p?.price), 0),
    note: typeof p?.note === 'string' ? p.note : '',
    popular: Boolean(p?.popular),
  };
}

const FORMULAS: PricingEstimateFormula[] = [
  'serviceLength_times_hoursPerVisit_times_factor',
  'baseHourlyRate_times_factor',
  'cin_tiered_hourly',
];

export function mergePricingPageConfig(raw: unknown): PricingPageConfig {
  const d = DEFAULT_PRICING_PAGE;
  if (!raw || typeof raw !== 'object') return { ...d, plans: [...d.plans], calculator: { ...d.calculator, frequencies: [...d.calculator.frequencies] } };
  const r = raw as Partial<PricingPageConfig>;
  const calcRaw: Partial<PricingCalculatorConfig> = (r.calculator || {}) as Partial<PricingCalculatorConfig>;
  let formula: PricingEstimateFormula = FORMULAS.includes(calcRaw.formula as PricingEstimateFormula)
    ? (calcRaw.formula as PricingEstimateFormula)
    : d.calculator.formula;
  const wasLegacyMultiply = (calcRaw.formula as string) === 'serviceLength_times_hoursPerVisit_times_factor';
  if (formula === 'serviceLength_times_hoursPerVisit_times_factor') {
    formula = 'cin_tiered_hourly';
  }

  let frequencies = Array.isArray(calcRaw.frequencies) && calcRaw.frequencies.length
    ? calcRaw.frequencies.map((f, i) => normalizeFrequency(f, i))
    : [...d.calculator.frequencies];
  if (!frequencies.length) frequencies = [...d.calculator.frequencies];

  let plans = Array.isArray(r.plans) && r.plans.length ? r.plans.map((p, i) => normalizePlan(p, i)) : [...d.plans];
  if (!plans.length) plans = [...d.plans];

  const popularCount = plans.filter((p) => p.popular).length;
  if (popularCount > 1) {
    let seen = false;
    for (let i = 0; i < plans.length; i++) {
      if (plans[i].popular) {
        if (seen) plans[i] = { ...plans[i], popular: false };
        else seen = true;
      }
    }
  }

  const calculator: PricingCalculatorConfig = {
    ...d.calculator,
    ...calcRaw,
    formula,
    frequencies,
    title: typeof calcRaw.title === 'string' ? calcRaw.title : d.calculator.title,
    frequencySectionLabel:
      typeof calcRaw.frequencySectionLabel === 'string'
        ? calcRaw.frequencySectionLabel
        : d.calculator.frequencySectionLabel,
    serviceLengthLabel:
      typeof calcRaw.serviceLengthLabel === 'string' ? calcRaw.serviceLengthLabel : d.calculator.serviceLengthLabel,
    hoursPerVisitLabel:
      typeof calcRaw.hoursPerVisitLabel === 'string' ? calcRaw.hoursPerVisitLabel : d.calculator.hoursPerVisitLabel,
    estimateLabel: typeof calcRaw.estimateLabel === 'string' ? calcRaw.estimateLabel : d.calculator.estimateLabel,
    estimatePrefix: typeof calcRaw.estimatePrefix === 'string' ? calcRaw.estimatePrefix : d.calculator.estimatePrefix,
    estimateSuffix: typeof calcRaw.estimateSuffix === 'string' ? calcRaw.estimateSuffix : d.calculator.estimateSuffix,
    bookButtonLabel:
      typeof calcRaw.bookButtonLabel === 'string' ? calcRaw.bookButtonLabel : d.calculator.bookButtonLabel,
    durationUnitLabel:
      typeof calcRaw.durationUnitLabel === 'string' ? calcRaw.durationUnitLabel : d.calculator.durationUnitLabel,
    serviceLengthMin: wasLegacyMultiply
      ? d.calculator.serviceLengthMin
      : clampNum(Number(calcRaw.serviceLengthMin), d.calculator.serviceLengthMin),
    serviceLengthMax: wasLegacyMultiply
      ? d.calculator.serviceLengthMax
      : clampNum(Number(calcRaw.serviceLengthMax), d.calculator.serviceLengthMax),
    serviceLengthStep: wasLegacyMultiply
      ? d.calculator.serviceLengthStep
      : clampNum(Number(calcRaw.serviceLengthStep), d.calculator.serviceLengthStep),
    serviceLengthDefault: wasLegacyMultiply
      ? d.calculator.serviceLengthDefault
      : clampNum(Number(calcRaw.serviceLengthDefault), d.calculator.serviceLengthDefault),
    hoursPerVisitMin: clampNum(Number(calcRaw.hoursPerVisitMin), d.calculator.hoursPerVisitMin),
    hoursPerVisitMax: clampNum(Number(calcRaw.hoursPerVisitMax), d.calculator.hoursPerVisitMax),
    hoursPerVisitStep: clampNum(Number(calcRaw.hoursPerVisitStep), d.calculator.hoursPerVisitStep),
    hoursPerVisitDefault: clampNum(Number(calcRaw.hoursPerVisitDefault), d.calculator.hoursPerVisitDefault),
    baseHourlyRate: clampNum(Number(calcRaw.baseHourlyRate), d.calculator.baseHourlyRate),
    decimalPlaces: Math.max(0, Math.min(4, Math.round(Number(calcRaw.decimalPlaces) || d.calculator.decimalPlaces))),
  };

  return {
    eyebrow: typeof r.eyebrow === 'string' ? r.eyebrow : d.eyebrow,
    title: typeof r.title === 'string' ? r.title : d.title,
    subtitle: typeof r.subtitle === 'string' ? r.subtitle : d.subtitle,
    popularBadgeLabel: typeof r.popularBadgeLabel === 'string' ? r.popularBadgeLabel : d.popularBadgeLabel,
    selectPlanButtonLabel:
      typeof r.selectPlanButtonLabel === 'string' ? r.selectPlanButtonLabel : d.selectPlanButtonLabel,
    plans,
    calculator,
  };
}

/** Linear £/hr between (hours, rate) knots (hours ascending). */
function interpolateHourlyRate(h: number, points: [number, number][]): number {
  const sorted = [...points].sort((a, b) => a[0] - b[0]);
  if (h <= sorted[0][0]) return sorted[0][1];
  const last = sorted[sorted.length - 1];
  if (h >= last[0]) return last[1];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [h0, r0] = sorted[i];
    const [h1, r1] = sorted[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0);
      return r0 + t * (r1 - r0);
    }
  }
  return last[1];
}

function clampHours(h: number, min: number, max: number): number {
  if (!Number.isFinite(h)) return min;
  return Math.max(min, Math.min(max, h));
}

/**
 * CiN default tiered £/hr (before VAT):
 * - One-time: 2h £30, 3h £25, 4h £23, 5h £20 (interpolate); beyond 5h flat £20/hr.
 * - Weekly: £20/hr at 2h; each hour after 2 reduces the rate by £0.40.
 * - Fortnightly: 3-month - 2h £20, 3h £19.30, 4h £19 (interpolate); after 4h −£0.30 per hour.
 *   6-month - 2h £19, 3h £18.50 (interpolate); after 3h −£0.30 per hour.
 */
export function computeCinTieredHourly(
  frequencyId: string,
  serviceLengthMonths: number,
  hoursPerVisit: number,
  hoursMin: number,
  hoursMax: number
): number {
  const h = clampHours(hoursPerVisit, hoursMin, hoursMax);

  if (frequencyId === 'one-time') {
    if (h <= 5) {
      return interpolateHourlyRate(h, [
        [2, 30],
        [3, 25],
        [4, 23],
        [5, 20],
      ]);
    }
    return 20;
  }

  if (frequencyId === 'weekly') {
    return Math.max(0, 20 - 0.4 * Math.max(0, h - 2));
  }

  if (frequencyId === 'fortnightly') {
    const months: 3 | 6 = Math.round(serviceLengthMonths) >= 6 ? 6 : 3;
    if (months === 3) {
      if (h <= 4) {
        return interpolateHourlyRate(h, [
          [2, 20],
          [3, 19.3],
          [4, 19],
        ]);
      }
      return Math.max(0, 19 - 0.3 * (h - 4));
    }
    if (h <= 3) {
      return interpolateHourlyRate(h, [
        [2, 19],
        [3, 18.5],
      ]);
    }
    return Math.max(0, 18.5 - 0.3 * (h - 3));
  }

  return Math.max(0, 20 - 0.4 * Math.max(0, h - 2));
}

export function computePricingEstimate(
  calc: PricingCalculatorConfig,
  frequencyId: string,
  serviceLength: number,
  hoursPerVisit: number
): number {
  const dp = calc.decimalPlaces ?? 2;

  if (calc.formula === 'cin_tiered_hourly') {
    const v = computeCinTieredHourly(
      frequencyId,
      serviceLength,
      hoursPerVisit,
      calc.hoursPerVisitMin,
      calc.hoursPerVisitMax
    );
    return Number(v.toFixed(dp));
  }

  const factor = calc.frequencies.find((x) => x.id === frequencyId)?.factor ?? 1;
  let v: number;
  if (calc.formula === 'baseHourlyRate_times_factor') {
    v = calc.baseHourlyRate * factor;
  } else {
    v = serviceLength * hoursPerVisit * factor;
  }
  return Number(v.toFixed(dp));
}
