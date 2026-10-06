import React, { useMemo, useState } from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Calculator } from 'lucide-react';
import type { PricingPageConfig, PricingPlanCard, PricingFrequencyOption, PricingEstimateFormula } from '../../types';
import { mergePricingPageConfig, computePricingEstimate } from '../../src/pricing/pricingPageConfig';
import { useFlyer } from '../Flyer';
import { apiAdmin } from '../../services/api';

function cloneCfg(c: PricingPageConfig): PricingPageConfig {
  return JSON.parse(JSON.stringify(c)) as PricingPageConfig;
}

const PricingPageSettingsPanel: React.FC = () => {
  const { showFlyer } = useFlyer();
  const [config, setConfig] = useState<PricingPageConfig>(() => mergePricingPageConfig(null));
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    let live = true;
    (async () => {
      try {
        const s = (await apiAdmin.getBusinessSettings()) as { pricingPage?: unknown };
        if (live) setConfig(mergePricingPageConfig(s?.pricingPage));
      } catch {
        if (live) setConfig(mergePricingPageConfig(null));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const previewEstimate = useMemo(() => {
    const c = config.calculator;
    const fid = c.frequencies[0]?.id ?? 'weekly';
    return computePricingEstimate(c, fid, c.serviceLengthDefault, c.hoursPerVisitDefault);
  }, [config.calculator]);

  const updatePlan = (index: number, patch: Partial<PricingPlanCard>) => {
    setConfig((prev) => {
      const next = cloneCfg(prev);
      const plans = [...next.plans];
      if (patch.popular === true) {
        plans.forEach((p, i) => {
          plans[i] = { ...p, popular: i === index };
        });
      } else {
        plans[index] = { ...plans[index], ...patch };
      }
      next.plans = plans;
      return next;
    });
  };

  const removePlan = (index: number) => {
    setConfig((prev) => {
      const next = cloneCfg(prev);
      next.plans = next.plans.filter((_, i) => i !== index);
      if (next.plans.length && !next.plans.some((p) => p.popular)) next.plans[0] = { ...next.plans[0], popular: true };
      return next;
    });
  };

  const addPlan = () => {
    setConfig((prev) => {
      const next = cloneCfg(prev);
      next.plans.forEach((p, i) => {
        next.plans[i] = { ...p, popular: false };
      });
      next.plans.push({
        id: `plan-${Date.now()}`,
        label: 'NEW PLAN',
        price: 49,
        note: 'Description for this plan.',
        popular: true,
      });
      return next;
    });
  };

  const movePlan = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    setConfig((prev) => {
      if (j < 0 || j >= prev.plans.length) return prev;
      const next = cloneCfg(prev);
      const plans = [...next.plans];
      [plans[index], plans[j]] = [plans[j], plans[index]];
      next.plans = plans;
      return next;
    });
  };

  const updateFreq = (index: number, patch: Partial<PricingFrequencyOption>) => {
    setConfig((prev) => {
      const next = cloneCfg(prev);
      const f = [...next.calculator.frequencies];
      f[index] = { ...f[index], ...patch };
      if (typeof patch.id === 'string' && !patch.id.trim()) return prev;
      next.calculator.frequencies = f;
      return next;
    });
  };

  const addFrequency = () => {
    setConfig((prev) => {
      const next = cloneCfg(prev);
      next.calculator.frequencies.push({
        id: `freq-${Date.now()}`,
        label: 'New',
        factor: 1,
      });
      return next;
    });
  };

  const removeFrequency = (index: number) => {
    setConfig((prev) => {
      if (prev.calculator.frequencies.length <= 1) return prev;
      const next = cloneCfg(prev);
      next.calculator.frequencies = next.calculator.frequencies.filter((_, i) => i !== index);
      return next;
    });
  };

  const resetDefaults = () => {
    setConfig(mergePricingPageConfig(null));
    showFlyer('Form reset to built-in defaults (save to apply).', 'success');
  };

  const save = async () => {
    try {
      const normalized = mergePricingPageConfig(config);
      await apiAdmin.updateBusinessSettings({ pricingPage: normalized });
      setConfig(normalized);
      window.dispatchEvent(new CustomEvent('nn_business_settings_updated', { detail: { pricingPage: normalized } }));
      showFlyer('Pricing page saved. Live site updates on next visit or refresh.', 'success');
    } catch {
      showFlyer('Failed to save pricing page', 'error');
    }
  };

  const calc = config.calculator;
  const formulaHelp =
    calc.formula === 'cin_tiered_hourly'
      ? `CiN tiered £/hr (before VAT): One-time - 2h £30, 3h £25, 4h £23, 5h £20 (interpolate between knots; 5h+ flat £20). Weekly - £20/h at 2h, then −£0.40 per hour after 2h. Fortnightly - pick 3- or 6-month commitment; 3mo table 2h £20 / 3h £19.30 / 4h £19, then −£0.30/h after 4h; 6mo 2h £19 / 3h £18.50, then −£0.30/h after 3h.`
      : calc.formula === 'baseHourlyRate_times_factor'
        ? `Shown amount = base hourly rate (£${calc.baseHourlyRate}) × frequency factor. Sliders are display-only for this mode unless you switch formula.`
        : `Shown amount = service length × hours per visit × frequency factor. Example: ${calc.serviceLengthDefault} × ${calc.hoursPerVisitDefault} × 1 = ${(calc.serviceLengthDefault * calc.hoursPerVisitDefault).toFixed(2)} before factor.`;

  if (loading) {
    return (
      <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 text-slate-500 font-bold text-sm">Loading pricing settings…</div>
    );
  }

  return (
    <div className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100/50 p-8 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 border-b border-slate-100 pb-6">
        <div>
          <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Calculator className="w-6 h-6 text-teal-600" />
            Public pricing page
          </h4>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2 max-w-xl">
            Controls the marketing &quot;Pricing&quot; route: plan cards, copy, and the quote calculator math.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={resetDefaults}
            className="px-4 py-2 rounded-xl border-2 border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest hover:bg-slate-50"
          >
            Reset defaults
          </button>
          <button
            type="button"
            onClick={() => void save()}
            className="px-6 py-3 rounded-xl bg-teal-700 text-white font-black text-sm hover:bg-teal-800 shadow-lg shadow-teal-200"
          >
            Save pricing page
          </button>
        </div>
      </div>

      <section className="space-y-4">
        <h5 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Page header</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">Eyebrow</span>
            <input
              className="w-full p-3 rounded-xl border border-slate-200 font-bold text-sm"
              value={config.eyebrow}
              onChange={(e) => setConfig((p) => ({ ...p, eyebrow: e.target.value }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">Title</span>
            <input
              className="w-full p-3 rounded-xl border border-slate-200 font-bold text-sm"
              value={config.title}
              onChange={(e) => setConfig((p) => ({ ...p, title: e.target.value }))}
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Subtitle (plain text)</span>
          <textarea
            className="w-full p-3 rounded-xl border border-slate-200 font-medium text-sm min-h-[80px]"
            value={config.subtitle}
            onChange={(e) => setConfig((p) => ({ ...p, subtitle: e.target.value }))}
          />
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">Popular badge label</span>
            <input
              className="w-full p-3 rounded-xl border border-slate-200 font-bold text-sm"
              value={config.popularBadgeLabel}
              onChange={(e) => setConfig((p) => ({ ...p, popularBadgeLabel: e.target.value }))}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">Plan button label</span>
            <input
              className="w-full p-3 rounded-xl border border-slate-200 font-bold text-sm"
              value={config.selectPlanButtonLabel}
              onChange={(e) => setConfig((p) => ({ ...p, selectPlanButtonLabel: e.target.value }))}
            />
          </label>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h5 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Membership / plan cards</h5>
          <button
            type="button"
            onClick={addPlan}
            className="flex items-center gap-1 text-xs font-black uppercase tracking-widest text-teal-700 hover:text-teal-900"
          >
            <Plus className="w-4 h-4" /> Add plan
          </button>
        </div>
        <div className="space-y-3">
          {config.plans.map((plan, i) => (
            <div key={plan.id} className="p-4 rounded-2xl border border-slate-100 bg-slate-50/80 space-y-3">
              <div className="flex flex-wrap items-center gap-2 justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase">Plan {i + 1}</span>
                <div className="flex items-center gap-1">
                  <button type="button" className="p-2 rounded-lg bg-white border border-slate-200" onClick={() => movePlan(i, -1)} aria-label="Move up">
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button type="button" className="p-2 rounded-lg bg-white border border-slate-200" onClick={() => movePlan(i, 1)} aria-label="Move down">
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <button type="button" className="p-2 rounded-lg bg-red-50 text-red-600 border border-red-100" onClick={() => removePlan(i)} aria-label="Remove">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-400">Label</span>
                  <input
                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold"
                    value={plan.label}
                    onChange={(e) => updatePlan(i, { label: e.target.value })}
                  />
                </label>
                <label className="space-y-1">
                  <span className="text-[9px] font-black uppercase text-slate-400">Price (£)</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold"
                    value={plan.price}
                    onChange={(e) => updatePlan(i, { price: Number(e.target.value) })}
                  />
                </label>
                <label className="flex items-center gap-2 pt-6">
                  <input
                    type="radio"
                    name="popular-plan"
                    checked={plan.popular}
                    onChange={() => updatePlan(i, { popular: true })}
                  />
                  <span className="text-xs font-bold text-slate-600">Featured (popular)</span>
                </label>
              </div>
              <label className="space-y-1 block">
                <span className="text-[9px] font-black uppercase text-slate-400">Description</span>
                <textarea
                  className="w-full p-2 rounded-lg border border-slate-200 text-sm"
                  rows={2}
                  value={plan.note}
                  onChange={(e) => updatePlan(i, { note: e.target.value })}
                />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h5 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Quote calculator</h5>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">Panel title</span>
            <input
              className="w-full p-3 rounded-xl border border-slate-200 font-bold text-sm"
              value={calc.title}
              onChange={(e) => setConfig((p) => ({ ...p, calculator: { ...p.calculator, title: e.target.value } }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-[10px] font-black uppercase text-slate-400">Frequency section label</span>
            <input
              className="w-full p-3 rounded-xl border border-slate-200 font-bold text-sm"
              value={calc.frequencySectionLabel}
              onChange={(e) =>
                setConfig((p) => ({ ...p, calculator: { ...p.calculator, frequencySectionLabel: e.target.value } }))
              }
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-[10px] font-black uppercase text-slate-400">Frequencies (factor multiplies into estimate)</span>
            <button type="button" onClick={addFrequency} className="text-xs font-black text-teal-700 flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add
            </button>
          </div>
          {calc.frequencies.map((f, i) => (
            <div key={f.id} className="flex flex-wrap gap-2 items-end p-3 rounded-xl bg-teal-50/50 border border-teal-100">
              <label className="flex-1 min-w-[100px] space-y-1">
                <span className="text-[9px] font-black uppercase text-slate-400">Id (stable)</span>
                <input
                  className="w-full p-2 rounded-lg border border-slate-200 text-xs font-mono"
                  value={f.id}
                  onChange={(e) => updateFreq(i, { id: e.target.value })}
                />
              </label>
              <label className="flex-1 min-w-[120px] space-y-1">
                <span className="text-[9px] font-black uppercase text-slate-400">Label</span>
                <input
                  className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold"
                  value={f.label}
                  onChange={(e) => updateFreq(i, { label: e.target.value })}
                />
              </label>
              <label className="w-24 space-y-1">
                <span className="text-[9px] font-black uppercase text-slate-400">Factor</span>
                <input
                  type="number"
                  step={0.01}
                  className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold"
                  value={f.factor}
                  onChange={(e) => updateFreq(i, { factor: Number(e.target.value) })}
                />
              </label>
              <button type="button" className="p-2 text-red-500 mb-0.5" onClick={() => removeFrequency(i)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(
            [
              ['serviceLengthLabel', 'Service length label'],
              ['hoursPerVisitLabel', 'Hours / visit label'],
              ['durationUnitLabel', 'Duration unit (e.g. Hours)'],
            ] as const
          ).map(([key, lab]) => (
            <label key={key} className="space-y-1 col-span-2 md:col-span-1">
              <span className="text-[9px] font-black uppercase text-slate-400">{lab}</span>
              <input
                className="w-full p-2 rounded-lg border border-slate-200 text-xs font-bold"
                value={String((calc as any)[key])}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, calculator: { ...p.calculator, [key]: e.target.value } }))
                }
              />
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              ['serviceLengthMin', 'Svc len min'],
              ['serviceLengthMax', 'Svc len max'],
              ['serviceLengthStep', 'Step'],
              ['serviceLengthDefault', 'Default'],
            ] as const
          ).map(([key, lab]) => (
            <label key={key} className="space-y-1">
              <span className="text-[9px] font-black uppercase text-slate-400">{lab}</span>
              <input
                type="number"
                step={key.includes('Step') ? 0.5 : 1}
                className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold"
                value={Number((calc as any)[key])}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, calculator: { ...p.calculator, [key]: Number(e.target.value) } }))
                }
              />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(
            [
              ['hoursPerVisitMin', 'Hrs visit min'],
              ['hoursPerVisitMax', 'Hrs visit max'],
              ['hoursPerVisitStep', 'Step'],
              ['hoursPerVisitDefault', 'Default'],
            ] as const
          ).map(([key, lab]) => (
            <label key={key} className="space-y-1">
              <span className="text-[9px] font-black uppercase text-slate-400">{lab}</span>
              <input
                type="number"
                step={0.5}
                className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold"
                value={Number((calc as any)[key])}
                onChange={(e) =>
                  setConfig((p) => ({ ...p, calculator: { ...p.calculator, [key]: Number(e.target.value) } }))
                }
              />
            </label>
          ))}
        </div>

        <label className="block space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400">Calculation</span>
          <select
            className="w-full p-3 rounded-xl border border-slate-200 font-bold text-sm bg-white"
            value={calc.formula}
            onChange={(e) =>
              setConfig((p) => ({
                ...p,
                calculator: { ...p.calculator, formula: e.target.value as PricingEstimateFormula },
              }))
            }
          >
            <option value="cin_tiered_hourly">CiN tiered £/hr (one-time / weekly / fortnightly tables)</option>
            <option value="serviceLength_times_hoursPerVisit_times_factor">
              Service length × hours per visit × frequency factor
            </option>
            <option value="baseHourlyRate_times_factor">Base hourly rate × frequency factor</option>
          </select>
        </label>
        {calc.formula === 'baseHourlyRate_times_factor' && (
          <label className="block space-y-1 max-w-xs">
            <span className="text-[10px] font-black uppercase text-slate-400">Base hourly rate (£)</span>
            <input
              type="number"
              min={0}
              step={0.5}
              className="w-full p-3 rounded-xl border border-slate-200 font-bold"
              value={calc.baseHourlyRate}
              onChange={(e) =>
                setConfig((p) => ({
                  ...p,
                  calculator: { ...p.calculator, baseHourlyRate: Number(e.target.value) },
                }))
              }
            />
          </label>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-[9px] font-black uppercase text-slate-400">Estimate label</span>
            <input
              className="w-full p-2 rounded-lg border border-slate-200 text-sm"
              value={calc.estimateLabel}
              onChange={(e) =>
                setConfig((p) => ({ ...p, calculator: { ...p.calculator, estimateLabel: e.target.value } }))
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-[9px] font-black uppercase text-slate-400">Decimal places</span>
            <input
              type="number"
              min={0}
              max={4}
              className="w-full p-2 rounded-lg border border-slate-200 text-sm"
              value={calc.decimalPlaces}
              onChange={(e) =>
                setConfig((p) => ({
                  ...p,
                  calculator: { ...p.calculator, decimalPlaces: Number(e.target.value) },
                }))
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-[9px] font-black uppercase text-slate-400">Line 1 prefix (before £)</span>
            <input
              className="w-full p-2 rounded-lg border border-slate-200 text-sm"
              value={calc.estimatePrefix}
              onChange={(e) =>
                setConfig((p) => ({ ...p, calculator: { ...p.calculator, estimatePrefix: e.target.value } }))
              }
            />
          </label>
          <label className="space-y-1">
            <span className="text-[9px] font-black uppercase text-slate-400">Line 2 suffix</span>
            <input
              className="w-full p-2 rounded-lg border border-slate-200 text-sm"
              value={calc.estimateSuffix}
              onChange={(e) =>
                setConfig((p) => ({ ...p, calculator: { ...p.calculator, estimateSuffix: e.target.value } }))
              }
            />
          </label>
          <label className="space-y-1 sm:col-span-2">
            <span className="text-[9px] font-black uppercase text-slate-400">Book button</span>
            <input
              className="w-full p-2 rounded-lg border border-slate-200 text-sm font-bold"
              value={calc.bookButtonLabel}
              onChange={(e) =>
                setConfig((p) => ({ ...p, calculator: { ...p.calculator, bookButtonLabel: e.target.value } }))
              }
            />
          </label>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">How the number is calculated</p>
          <p className="text-sm font-medium text-slate-200 mt-2">{formulaHelp}</p>
          <p className="text-lg font-black mt-3">
            Sample (first frequency, default sliders): {calc.estimatePrefix}
            {previewEstimate.toFixed(calc.decimalPlaces)}
          </p>
        </div>
      </section>
    </div>
  );
};

export default PricingPageSettingsPanel;
