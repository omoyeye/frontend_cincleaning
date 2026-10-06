import React, { useMemo, useState } from 'react';
import { ServiceConfig, ServiceTrigger, WizardStepKey } from '../../types';
import { apiAdmin } from '../../services/api';
import { X, Layers, PlusCircle, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { useFlyer } from '../Flyer';
import { ALL_WIZARD_STEPS, defaultStepsForTrigger } from '../../src/utils/bookingHelpers';

interface Props {
    onClose: () => void;
    onUpdate: () => void;
}

const PRICING_MODELS: Array<{
    id: NonNullable<ServiceConfig['pricingModel']>;
    label: string;
    hint: string;
}> = [
    { id: 'hourly', label: 'Hourly', hint: 'Charges by time (e.g. base rate per hour).' },
    { id: 'flat', label: 'Flat', hint: 'One fixed price for the whole service.' },
    { id: 'size_based', label: 'Size based', hint: 'Price varies by property size bands.' },
    { id: 'room_based', label: 'Room based', hint: 'Price scales with room count.' },
    { id: 'bedroom_based', label: 'Bedroom based', hint: 'Price mainly follows bedroom count.' },
    { id: 'quote', label: 'Quote', hint: 'No fixed price; admin provides a custom quote.' },
];

interface TriggerOption {
    id: ServiceTrigger;
    label: string;
    blurb: string;
    suggestedIcon: string;
    suggestedModel: NonNullable<ServiceConfig['pricingModel']>;
    suggestedMinDuration: number;
    suggestedCallOut?: string;
}

const TRIGGERS: TriggerOption[] = [
    {
        id: 'standard',
        label: 'Standard / Residential',
        blurb: 'Regular home clean. Full wizard with property details, extras, scheduling, location, requirements, tip and review.',
        suggestedIcon: 'Home',
        suggestedModel: 'hourly',
        suggestedMinDuration: 2,
    },
    {
        id: 'deep',
        label: 'Deep Clean',
        blurb: 'Deep clean with call-out fee and itemized extras; minimum duration is scheduling guidance only.',
        suggestedIcon: 'Sparkles',
        suggestedModel: 'hourly',
        suggestedMinDuration: 3,
        suggestedCallOut: '30',
    },
    {
        id: 'end_of_tenancy',
        label: 'End of Tenancy',
        blurb: 'Move-out clean with call-out fee and per-extra duration; minimum duration is instruction only.',
        suggestedIcon: 'Trash2',
        suggestedModel: 'hourly',
        suggestedMinDuration: 3,
        suggestedCallOut: '30',
    },
    {
        id: 'airbnb',
        label: 'Airbnb / Short-let',
        blurb: 'Fast turnover flow. Bedroom-based fixed hours (1 bed = 2h, 2 bed = 3h, 3 bed = 4h, 4 bed = 5h, 5 bed = 6h) and hourly pricing.',
        suggestedIcon: 'Hotel',
        suggestedModel: 'hourly',
        suggestedMinDuration: 2,
    },
    {
        id: 'commercial',
        label: 'Commercial',
        blurb: 'Office or commercial property. Collects business details, skips Extras and tip.',
        suggestedIcon: 'Building2',
        suggestedModel: 'quote',
        suggestedMinDuration: 2,
    },
    {
        id: 'jet_washing',
        label: 'Jet / Pressure Washing',
        blurb: 'Outdoor specialty job. Skips Extras and tip; uses flat or quote pricing.',
        suggestedIcon: 'Droplets',
        suggestedModel: 'flat',
        suggestedMinDuration: 2,
    },
    {
        id: 'custom',
        label: 'Custom Flow',
        blurb: 'Start from a blank flow and pick exactly which wizard steps the customer sees.',
        suggestedIcon: 'Sparkles',
        suggestedModel: 'hourly',
        suggestedMinDuration: 2,
    },
];

const STEP_META: Record<WizardStepKey, { label: string; hint: string }> = {
    details: { label: 'Property Details', hint: 'Bedrooms, bathrooms, size — drives hourly pricing and duration.' },
    extras: { label: 'Extras', hint: 'Optional add-ons (oven, fridge, ironing…). Skip for fast-turnaround Airbnb style jobs.' },
    schedule: { label: 'Schedule', hint: 'Date + time picker. Usually required.' },
    location: { label: 'Location', hint: 'Service address and contact details.' },
    requirements: { label: 'Requirements', hint: 'Access notes, pets, parking, special instructions.' },
    invoice: { label: 'Invoice / Tip', hint: 'Discount code and tip percentage screen before review.' },
};

const CreateServiceFlyout: React.FC<Props> = ({ onClose, onUpdate }) => {
    const { showFlyer } = useFlyer();
    const [step, setStep] = useState<0 | 1>(0);
    const [trigger, setTrigger] = useState<ServiceTrigger>('standard');
    const [name, setName] = useState('');
    const [baseRate, setBaseRate] = useState('');
    const [pricingModel, setPricingModel] = useState<ServiceConfig['pricingModel']>('hourly');
    const [minDuration, setMinDuration] = useState('2');
    const [minNotice, setMinNotice] = useState('2');
    const [callOutCharge, setCallOutCharge] = useState('');
    const [icon, setIcon] = useState('Sparkles');
    const [description, setDescription] = useState('');
    const [active, setActive] = useState(true);
    const [flowSteps, setFlowSteps] = useState<WizardStepKey[]>(defaultStepsForTrigger('standard'));
    const [isSaving, setIsSaving] = useState(false);
    const [pricingHelpOpen, setPricingHelpOpen] = useState(false);

    const selectedTrigger = useMemo(
        () => TRIGGERS.find((t) => t.id === trigger) ?? TRIGGERS[0],
        [trigger]
    );

    const applyTriggerDefaults = (t: ServiceTrigger) => {
        const opt = TRIGGERS.find((x) => x.id === t);
        if (!opt) return;
        setTrigger(t);
        setPricingModel(opt.suggestedModel);
        setMinDuration(String(opt.suggestedMinDuration));
        setIcon(opt.suggestedIcon);
        setCallOutCharge(opt.suggestedCallOut || '');
        setFlowSteps(defaultStepsForTrigger(t));
    };

    const toggleStep = (key: WizardStepKey) => {
        setFlowSteps((prev) => {
            if (prev.includes(key)) return prev.filter((s) => s !== key);
            // Preserve canonical order.
            const next = [...prev, key];
            return ALL_WIZARD_STEPS.filter((s) => next.includes(s));
        });
    };

    const handleNext = () => {
        setStep(1);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const rate = parseFloat(baseRate);
        const d = parseInt(minDuration, 10);
        const n = parseInt(minNotice, 10);
        if (!name.trim()) {
            showFlyer('Service name is required.', 'error');
            return;
        }
        if (isNaN(rate)) {
            showFlyer('Base rate must be a valid number.', 'error');
            return;
        }
        if (!Number.isFinite(d) || d < 1) {
            showFlyer('Minimum duration must be at least 1 hour.', 'error');
            return;
        }
        if (!Number.isFinite(n) || n < 0) {
            showFlyer('Minimum notice must be 0 or more days.', 'error');
            return;
        }

        const coTrim = callOutCharge.trim();
        let callOutPayload: number | undefined;
        if (coTrim !== '') {
            const co = parseFloat(coTrim);
            if (!Number.isFinite(co) || co < 0) {
                showFlyer('Call-out charge must be a non-negative number or leave blank.', 'error');
                return;
            }
            callOutPayload = co;
        }

        setIsSaving(true);
        try {
            await apiAdmin.createService({
                name: name.trim(),
                baseRate: rate,
                pricingModel,
                minDuration: d,
                minNotice: n,
                ...(callOutPayload !== undefined ? { callOutCharge: callOutPayload } : {}),
                icon: icon.trim() || 'Sparkles',
                description: description.trim(),
                active,
                bookingFlow: { trigger, steps: flowSteps },
            });
            showFlyer(`Service ${name} created successfully!`, 'success');
            onUpdate();
            onClose();
        } catch (error) {
            showFlyer(error instanceof Error ? error.message : 'Failed to create service.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-300">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="bg-white w-full max-w-md h-full shadow-2xl animate-in slide-in-from-right duration-500 relative flex flex-col">
                {/* Header */}
                <div className="p-5 sm:p-8 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-green-50 text-green-600 rounded-xl flex items-center justify-center">
                            <Layers className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 tracking-tight">Create New Service</h2>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
                                Step {step + 1} of 2 — {step === 0 ? 'Trigger & flow' : 'Service details'}
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-xl text-slate-400 hover:text-red-500 shadow-sm transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Progress */}
                <div className="px-5 sm:px-8 pt-4">
                    <div className="flex gap-2">
                        <div className={`h-1.5 flex-1 rounded-full ${step >= 0 ? 'bg-green-500' : 'bg-slate-200'}`} />
                        <div className={`h-1.5 flex-1 rounded-full ${step >= 1 ? 'bg-green-500' : 'bg-slate-200'}`} />
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-5 sm:p-8 border-b border-slate-100">
                    {step === 0 ? (
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Pick a Trigger</label>
                                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                    The trigger decides which booking-form flow customers see and sets smart defaults for pricing and duration.
                                </p>
                                <div className="space-y-2">
                                    {TRIGGERS.map((t) => {
                                        const isActive = t.id === trigger;
                                        return (
                                            <button
                                                key={t.id}
                                                type="button"
                                                onClick={() => applyTriggerDefaults(t.id)}
                                                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                                                    isActive
                                                        ? 'border-green-500 bg-green-50/70 shadow-md shadow-green-100'
                                                        : 'border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div>
                                                        <div className="font-black text-slate-900 text-sm">{t.label}</div>
                                                        <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-1">
                                                            {t.blurb}
                                                        </p>
                                                    </div>
                                                    {isActive && (
                                                        <div className="shrink-0 w-6 h-6 rounded-full bg-green-500 text-white flex items-center justify-center">
                                                            <Check className="w-3.5 h-3.5" />
                                                        </div>
                                                    )}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Booking Form Steps</label>
                                <p className="text-xs text-slate-500 font-medium leading-relaxed">
                                    Service picker and Review screens always show. Toggle the optional steps the customer will move through for this service.
                                </p>
                                <div className="space-y-2">
                                    {ALL_WIZARD_STEPS.map((key) => {
                                        const on = flowSteps.includes(key);
                                        const meta = STEP_META[key];
                                        return (
                                            <label
                                                key={key}
                                                className={`flex items-start justify-between gap-3 p-4 rounded-2xl cursor-pointer border-2 transition-all ${
                                                    on ? 'border-green-500 bg-green-50/50' : 'border-slate-100 bg-white hover:bg-slate-50'
                                                }`}
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-black text-slate-900 text-sm">{meta.label}</div>
                                                    <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-1">{meta.hint}</p>
                                                </div>
                                                <div className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-green-500' : 'bg-slate-300'}`}>
                                                    <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
                                                </div>
                                                <input type="checkbox" checked={on} onChange={() => toggleStep(key)} className="hidden" />
                                            </label>
                                        );
                                    })}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setFlowSteps(defaultStepsForTrigger(trigger))}
                                    className="text-[11px] font-black uppercase tracking-wide text-emerald-600 hover:text-emerald-700"
                                >
                                    Reset to {selectedTrigger.label} defaults
                                </button>
                            </div>
                        </div>
                    ) : (
                        <form id="create-service-form" onSubmit={handleSave} className="space-y-6">
                            <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Trigger</p>
                                <p className="font-black text-slate-900 text-sm">{selectedTrigger.label}</p>
                                <p className="text-[11px] text-slate-500 font-medium mt-1">
                                    Flow: {flowSteps.length === 0 ? 'Service → Review only' : flowSteps.map((s) => STEP_META[s].label).join(' → ')}
                                </p>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Service Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    placeholder="e.g. Move Out Cleaning"
                                    className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 font-bold text-sm text-foreground transition-all shadow-inner"
                                    required
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Base Rate (£)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="0.00"
                                    value={baseRate}
                                    onChange={e => setBaseRate(e.target.value)}
                                    className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 font-bold text-lg text-foreground transition-all shadow-inner"
                                    required
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Pricing Model</label>
                                <div className="grid grid-cols-2 gap-2">
                                    {PRICING_MODELS.map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            title={t.hint}
                                            onClick={() => setPricingModel(t.id)}
                                            className={`py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide transition-all ${
                                                pricingModel === t.id ? 'bg-green-600 text-white shadow-lg shadow-green-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                                            }`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[11px] text-slate-500 font-semibold">
                                    {PRICING_MODELS.find((m) => m.id === pricingModel)?.hint}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setPricingHelpOpen((v) => !v)}
                                    className="text-[11px] font-black uppercase tracking-wide text-emerald-600 hover:text-emerald-700"
                                >
                                    {pricingHelpOpen ? 'Hide pricing help' : 'Pricing help'}
                                </button>
                                {pricingHelpOpen && (
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                                        {PRICING_MODELS.map((m) => (
                                            <p key={m.id} className="text-xs text-slate-600 leading-relaxed">
                                                <span className="font-black text-slate-800">{m.label}:</span> {m.hint}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">
                                    Call-out charge (£) — optional
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={callOutCharge}
                                    onChange={(e) => setCallOutCharge(e.target.value)}
                                    placeholder="Blank = none stored (deep/EOT default £30 from app)"
                                    className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 font-bold text-lg text-foreground transition-all shadow-inner"
                                />
                                <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                                    For deep / end-of-tenancy style services, set the fixed call-out fee. Use 0 for no fee.
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Min Duration (hrs)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={minDuration}
                                        onChange={e => setMinDuration(e.target.value)}
                                        className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 font-bold text-lg text-foreground transition-all shadow-inner"
                                        required
                                    />
                                </div>
                                <div className="space-y-3">
                                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Min Notice (days)</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={minNotice}
                                        onChange={e => setMinNotice(e.target.value)}
                                        className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 font-bold text-lg text-foreground transition-all shadow-inner"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Icon Name</label>
                                <input
                                    type="text"
                                    value={icon}
                                    onChange={e => setIcon(e.target.value)}
                                    placeholder="e.g. Sparkles"
                                    className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 font-bold text-sm text-foreground transition-all shadow-inner"
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Description</label>
                                <textarea
                                    value={description}
                                    onChange={e => setDescription(e.target.value)}
                                    rows={4}
                                    className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/25 font-medium text-sm text-foreground transition-all shadow-inner resize-y"
                                    placeholder="Short service description"
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Status</label>
                                <label className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-all">
                                    <span className="font-bold text-slate-700">Currently {active ? 'Active' : 'Disabled'}</span>
                                    <div className={`relative w-12 h-6 rounded-full transition-colors ${active ? 'bg-green-500' : 'bg-slate-300'}`}>
                                        <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${active ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </div>
                                    <input
                                        type="checkbox"
                                        checked={active}
                                        onChange={e => setActive(e.target.checked)}
                                        className="hidden"
                                    />
                                </label>
                            </div>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <div className="p-5 sm:p-8 bg-slate-50 flex items-center gap-3">
                    {step === 0 ? (
                        <>
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-4 bg-white text-slate-600 border border-slate-200 rounded-2xl font-black hover:bg-slate-100 transition-all text-sm uppercase tracking-widest"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleNext}
                                className="flex-[1.4] py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 hover:-translate-y-0.5 active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center"
                            >
                                Continue <ChevronRight className="w-4 h-4 ml-2" />
                            </button>
                        </>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => setStep(0)}
                                className="py-4 px-5 bg-white text-slate-600 border border-slate-200 rounded-2xl font-black hover:bg-slate-100 transition-all text-sm uppercase tracking-widest flex items-center"
                            >
                                <ChevronLeft className="w-4 h-4 mr-2" /> Back
                            </button>
                            <button
                                type="submit"
                                form="create-service-form"
                                disabled={isSaving}
                                className="flex-1 py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 hover:-translate-y-0.5 active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center disabled:opacity-50"
                            >
                                {isSaving ? 'Creating...' : <><PlusCircle className="w-4 h-4 mr-2" /> Create Service</>}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CreateServiceFlyout;
