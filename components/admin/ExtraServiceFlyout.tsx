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
        <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex justify-end animate-in fade-in duration-300">
            <div className="absolute inset-0" onClick={onClose} />
            <div className="bg-white w-full max-w-md h-full shadow-2xl animate-in slide-in-from-right duration-500 relative flex flex-col">
                {/* Header */}
                <div className="p-8 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                            <Package className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">Edit Extra Service</h2>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-xl text-slate-400 hover:text-red-500 shadow-sm transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-8 border-b border-slate-100">
                    <form id="edit-extra-form" onSubmit={handleSave} className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 font-bold text-sm text-foreground transition-all shadow-inner"
                                required
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Price (£)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={price}
                                    onChange={e => setPrice(e.target.value)}
                                    className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 font-bold text-lg text-foreground transition-all shadow-inner"
                                    required
                                />
                            </div>

                            <div className="space-y-3">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Duration (min)</label>
                                <input
                                    type="number"
                                    value={duration}
                                    onChange={e => setDuration(e.target.value)}
                                    className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/25 font-bold text-lg text-foreground transition-all shadow-inner"
                                    required
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Billing Type</label>
                            <div className="flex space-x-3">
                                {['fixed', 'hourly'].map(t => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setType(t as any)}
                                        className={`flex-1 py-4 rounded-xl font-bold capitalize transition-all ${type === t ? 'bg-amber-500 text-white shadow-lg shadow-amber-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                    >
                                        {t}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </form>
                </div>

                {/* Footer */}
                <div className="p-8 bg-slate-50">
                    <button
                        type="submit"
                        form="edit-extra-form"
                        disabled={isSaving}
                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 hover:-translate-y-0.5 active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : <><Save className="w-4 h-4 mr-2" /> Save Details</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ExtraServiceFlyout;
