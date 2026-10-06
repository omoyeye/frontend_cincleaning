import React, { useEffect, useState } from 'react';
import { ServiceConfig, ServiceTrigger, WizardStepKey } from '../../types';
import { apiAdmin } from '../../services/api';
import { X, Layers, Save } from 'lucide-react';
import { useFlyer } from '../Flyer';
import { ALL_WIZARD_STEPS, defaultStepsForTrigger, getServiceTrigger, resolveBookingFlowSteps } from '../../src/utils/bookingHelpers';

interface Props {
    service: ServiceConfig;
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

const TRIGGER_OPTIONS: Array<{ id: ServiceTrigger; label: string }> = [
    { id: 'standard', label: 'Standard / Residential' },
    { id: 'deep', label: 'Deep Clean' },
    { id: 'end_of_tenancy', label: 'End of Tenancy' },
    { id: 'airbnb', label: 'Airbnb / Short-let' },
    { id: 'commercial', label: 'Commercial' },
    { id: 'jet_washing', label: 'Jet / Pressure Washing' },
    { id: 'custom', label: 'Custom Flow' },
];

const TRIGGER_DEFAULTS: Partial<Record<ServiceTrigger, { pricingModel: NonNullable<ServiceConfig['pricingModel']>; minDuration: number }>> = {
    airbnb: { pricingModel: 'hourly', minDuration: 2 },
};

const STEP_META: Record<WizardStepKey, { label: string; hint: string }> = {
    details: { label: 'Property Details', hint: 'Bedrooms, bathrooms, size.' },
    extras: { label: 'Extras', hint: 'Optional add-ons (oven, fridge, ironing).' },
    schedule: { label: 'Schedule', hint: 'Date and time picker.' },
    location: { label: 'Location', hint: 'Service address and contact.' },
    requirements: { label: 'Requirements', hint: 'Access notes, pets, instructions.' },
    invoice: { label: 'Invoice / Tip', hint: 'Discount code and tip step.' },
};

const ServiceFlyout: React.FC<Props> = ({ service, onClose, onUpdate }) => {
    const { showFlyer } = useFlyer();
    const [name, setName] = useState(service.name);
    const [baseRate, setBaseRate] = useState(service.baseRate.toString());
    const [pricingModel, setPricingModel] = useState<ServiceConfig['pricingModel']>(service.pricingModel || 'hourly');
    const [minDuration, setMinDuration] = useState(String(service.minDuration ?? 2));
    const [minNotice, setMinNotice] = useState(String(service.minNotice ?? 2));
    const [callOutCharge, setCallOutCharge] = useState(
        service.callOutCharge != null && Number.isFinite(Number(service.callOutCharge)) ? String(service.callOutCharge) : ''
    );
    const [description, setDescription] = useState(service.description || '');
    const [icon, setIcon] = useState(service.icon || 'Sparkles');
    const [active, setActive] = useState(service.active);
    const [trigger, setTrigger] = useState<ServiceTrigger>(getServiceTrigger(service));
    const [flowSteps, setFlowSteps] = useState<WizardStepKey[]>(resolveBookingFlowSteps(service));
    const [isSaving, setIsSaving] = useState(false);
    const [pricingHelpOpen, setPricingHelpOpen] = useState(false);

    useEffect(() => {
        setName(service.name);
        setBaseRate(service.baseRate.toString());
        setPricingModel(service.pricingModel || 'hourly');
        setMinDuration(String(service.minDuration ?? 2));
        setMinNotice(String(service.minNotice ?? 2));
        setCallOutCharge(
            service.callOutCharge != null && Number.isFinite(Number(service.callOutCharge)) ? String(service.callOutCharge) : ''
        );
        setDescription(service.description || '');
        setIcon(service.icon || 'Sparkles');
        setActive(service.active);
        setTrigger(getServiceTrigger(service));
        setFlowSteps(resolveBookingFlowSteps(service));
        setPricingHelpOpen(false);
    }, [service.id, service.name, service.baseRate, service.pricingModel, service.minDuration, service.minNotice, service.callOutCharge, service.description, service.icon, service.active, service.bookingFlow]);

    const toggleStep = (key: WizardStepKey) => {
        setFlowSteps((prev) => {
            if (prev.includes(key)) return prev.filter((s) => s !== key);
            const next = [...prev, key];
            return ALL_WIZARD_STEPS.filter((s) => next.includes(s));
        });
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) {
            showFlyer("Service name is required.", "error");
            return;
        }
        const rate = parseFloat(baseRate);
        const d = parseInt(minDuration, 10);
        const n = parseInt(minNotice, 10);
        if (isNaN(rate)) {
            showFlyer("Base rate must be a number.", "error");
            return;
        }
        if (!Number.isFinite(d) || d < 1) {
            showFlyer("Minimum duration must be at least 1 hour.", "error");
            return;
        }
        if (!Number.isFinite(n) || n < 0) {
            showFlyer("Minimum notice must be 0 or more days.", "error");
            return;
        }

        const coTrim = callOutCharge.trim();
        let callOutPayload: number | null;
        if (coTrim === '') {
            callOutPayload = null;
        } else {
            const co = parseFloat(coTrim);
            if (!Number.isFinite(co) || co < 0) {
                showFlyer('Call-out charge must be a non-negative number, or leave blank to use the system default (£30).', 'error');
                return;
            }
            callOutPayload = co;
        }

        setIsSaving(true);
        try {
            await apiAdmin.updateService(service.id, {
                name: name.trim(),
                baseRate: rate,
                pricingModel,
                minDuration: d,
                minNotice: n,
                callOutCharge: callOutPayload,
                description: description.trim(),
                icon: icon.trim() || 'Sparkles',
                active,
                bookingFlow: { trigger, steps: flowSteps },
            });
            showFlyer(`${service.name} updated successfully!`, 'success');
            onUpdate();
            onClose();
        } catch (error) {
            showFlyer(error instanceof Error ? error.message : 'Failed to update service.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-300">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="bg-white w-full max-w-md h-full shadow-2xl animate-in slide-in-from-right duration-500 relative flex flex-col">
                {/* Header */}
                <div className="p-8 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                            <Layers className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">Edit Service</h2>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-xl text-slate-400 hover:text-red-500 shadow-sm transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-8 border-b border-slate-100">
                    <h3 className="text-2xl font-black text-slate-900 mb-6">{service.name}</h3>

                    <form id="edit-service-form" onSubmit={handleSave} className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Service Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-sm text-foreground transition-all shadow-inner"
                                required
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Base Rate (£)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={baseRate}
                                onChange={e => setBaseRate(e.target.value)}
                                className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-lg text-foreground transition-all shadow-inner"
                                required
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Pricing Model</label>
                            <div className="grid grid-cols-2 gap-2">
                                {PRICING_MODELS.map((m) => (
                                    <button
                                        key={m.id}
                                        type="button"
                                        title={m.hint}
                                        onClick={() => setPricingModel(m.id)}
                                        className={`py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide transition-all ${
                                            pricingModel === m.id
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[11px] text-slate-500 font-semibold">
                                {PRICING_MODELS.find((m) => m.id === pricingModel)?.hint}
                            </p>
                            <button
                                type="button"
                                onClick={() => setPricingHelpOpen((v) => !v)}
                                className="text-[11px] font-black uppercase tracking-wide text-blue-600 hover:text-blue-700"
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
                                Call-out charge (£)
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={callOutCharge}
                                onChange={(e) => setCallOutCharge(e.target.value)}
                                placeholder="e.g. 30 (blank = default £30)"
                                className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-lg text-foreground transition-all shadow-inner"
                            />
                            <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                                Deep / end-of-tenancy call-out shown in the booking wizard and invoices. Leave blank to use the system default
                                (£30). Set 0 for no call-out line on those flows.
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
                                    className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-lg text-foreground transition-all shadow-inner"
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
                                    className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-lg text-foreground transition-all shadow-inner"
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
                                className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold text-sm text-foreground transition-all shadow-inner"
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Description</label>
                            <textarea
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                rows={4}
                                className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-medium text-sm text-foreground transition-all shadow-inner resize-y"
                                placeholder="Short service description"
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Booking Trigger</label>
                            <div className="grid grid-cols-2 gap-2">
                                {TRIGGER_OPTIONS.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => {
                                            setTrigger(t.id);
                                            setFlowSteps(defaultStepsForTrigger(t.id));
                                            const defaults = TRIGGER_DEFAULTS[t.id];
                                            if (defaults) {
                                                setPricingModel(defaults.pricingModel);
                                                setMinDuration(String(defaults.minDuration));
                                            }
                                        }}
                                        className={`py-2.5 px-3 rounded-xl font-bold text-[11px] uppercase tracking-wide transition-all text-center ${
                                            trigger === t.id
                                                ? 'bg-blue-600 text-white shadow-lg shadow-blue-200'
                                                : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                                Controls call-out / fast-path logic and resets the step list to this trigger's defaults.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Booking Form Steps</label>
                            <div className="space-y-2">
                                {ALL_WIZARD_STEPS.map((key) => {
                                    const on = flowSteps.includes(key);
                                    const meta = STEP_META[key];
                                    return (
                                        <label
                                            key={key}
                                            className={`flex items-start justify-between gap-3 p-4 rounded-2xl cursor-pointer border-2 transition-all ${
                                                on ? 'border-blue-500 bg-blue-50/50' : 'border-slate-100 bg-white hover:bg-slate-50'
                                            }`}
                                        >
                                            <div className="min-w-0">
                                                <div className="font-black text-slate-900 text-sm">{meta.label}</div>
                                                <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-1">{meta.hint}</p>
                                            </div>
                                            <div className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${on ? 'bg-blue-500' : 'bg-slate-300'}`}>
                                                <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </div>
                                            <input type="checkbox" checked={on} onChange={() => toggleStep(key)} className="hidden" />
                                        </label>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] text-slate-500 font-semibold leading-relaxed">
                                Service picker and Review screens always show. Toggle the optional steps customers move through for this service.
                            </p>
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
                </div>

                {/* Footer */}
                <div className="p-8 bg-slate-50">
                    <button
                        type="submit"
                        form="edit-service-form"
                        disabled={isSaving}
                        className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 hover:-translate-y-0.5 active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : <><Save className="w-4 h-4 mr-2" /> Save Configuration</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ServiceFlyout;
