import React, { useEffect, useState } from 'react';
import { Extra } from '../../types';
import { apiAdmin } from '../../services/api';
import { X, Save, Package } from 'lucide-react';
import { useFlyer } from '../Flyer';

interface Props {
    extra: Extra;
    onClose: () => void;
    onUpdate: () => void;
}

const ExtraServiceFlyout: React.FC<Props> = ({ extra, onClose, onUpdate }) => {
    const { showFlyer } = useFlyer();
    const [name, setName] = useState(extra.name);
    const [price, setPrice] = useState(extra.price.toString());
    const [duration, setDuration] = useState(extra.duration?.toString() || '30');
    const [type, setType] = useState<'fixed' | 'hourly'>(extra.type || 'fixed');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setName(extra.name);
        setPrice(extra.price.toString());
        setDuration(extra.duration?.toString() || '30');
        setType(extra.type || 'fixed');
    }, [extra.id, extra.name, extra.price, extra.duration, extra.type]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const parsedPrice = parseFloat(price);
        const parsedDuration = parseInt(duration);

        if (isNaN(parsedPrice) || isNaN(parsedDuration)) {
            showFlyer("Price and duration must be numbers.", "error");
            return;
        }

        setIsSaving(true);
        try {
            await apiAdmin.updateExtraService(extra.id, {
                name,
                price: parsedPrice,
                duration: parsedDuration,
                type
            });
            showFlyer(`${name} updated successfully!`, 'success');
            onUpdate();
            onClose();
        } catch (error) {
            showFlyer(error instanceof Error ? error.message : 'Failed to update extra service.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex justify-end bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="relative flex h-full w-full max-w-lg flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center">
                            <Package className="w-5 h-5" />
                        </div>
                        <h2 className="text-lg font-black text-slate-900">Edit Extra Service</h2>
                    </div>
                    <button onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto bg-slate-50 px-6 py-6">
                    <form id="edit-extra-form" onSubmit={handleSave} className="space-y-5">
                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-800">Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-800">Price (£)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={price}
                                    onChange={e => setPrice(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                                    required
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-sm font-semibold text-slate-800">Duration (min)</label>
                                <input
                                    type="number"
                                    value={duration}
                                    onChange={e => setDuration(e.target.value)}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base font-semibold text-slate-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-800">Billing Type</label>
                            <div className="flex space-x-3">
                                {['fixed', 'hourly'].map(t => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setType(t as any)}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold capitalize transition-all ${type === t ? 'bg-blue-600 text-white shadow-sm shadow-blue-200' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:ring-slate-300'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="border-t border-slate-200 bg-white px-6 py-4">
                    <button
                        type="submit"
                        form="edit-extra-form"
                        disabled={isSaving}
                        className="flex w-full items-center justify-center rounded-xl bg-blue-600 py-3 text-sm font-bold text-white shadow-sm shadow-blue-200 transition hover:bg-blue-700 disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : <><Save className="w-4 h-4 mr-2" /> Save Details</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExtraServiceFlyout;
