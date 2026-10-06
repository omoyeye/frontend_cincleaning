import React, { useState } from 'react';
import { Referral } from '../../types';
import { apiAdmin } from '../../services/api';
import { X, Gift, Save } from 'lucide-react';
import { useFlyer } from '../Flyer';

interface Props {
    referral: Referral;
    onClose: () => void;
    onUpdate: () => void;
}

const ReferralFlyout: React.FC<Props> = ({ referral, onClose, onUpdate }) => {
    const { showFlyer } = useFlyer();
    const [rewardAmount, setRewardAmount] = useState(referral.rewardAmount.toString());
    const [status, setStatus] = useState(referral.status);
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        const parsedReward = parseFloat(rewardAmount);

        if (isNaN(parsedReward)) {
            showFlyer("Reward amount must be a number.", "error");
            return;
        }

        setIsSaving(true);
        try {
            await apiAdmin.updateReferral(referral.id, {
                rewardAmount: parsedReward,
                status
            });
            showFlyer(`Referral ${referral.id} updated successfully!`, 'success');
            onUpdate();
            onClose();
        } catch (error) {
            showFlyer("Failed to update referral.", 'error');
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
                        <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                            <Gift className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-black text-slate-900 tracking-tight">Edit Referral</h2>
                    </div>
                    <button onClick={onClose} className="p-3 bg-white rounded-xl text-slate-400 hover:text-red-500 shadow-sm transition-all">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-8 border-b border-slate-100">
                    <div className="mb-6 space-y-2">
                        <h3 className="text-2xl font-black text-slate-900">Referrer: {referral.referrerName}</h3>
                        <p className="text-sm font-bold text-slate-500">Referred: <span className="text-slate-900">{referral.referredClientName}</span></p>
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400">Type: {referral.referrerType}</p>
                    </div>

                    <form id="edit-referral-form" onSubmit={handleSave} className="space-y-6">
                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Reward Value (£)</label>
                            <input
                                type="number"
                                step="0.01"
                                value={rewardAmount}
                                onChange={e => setRewardAmount(e.target.value)}
                                className="w-full bg-card border-2 border-input rounded-2xl p-5 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/25 font-bold text-lg text-foreground transition-all shadow-inner"
                                required
                            />
                        </div>

                        <div className="space-y-3">
                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-widest ml-1">Current Status</label>
                            <div className="grid grid-cols-3 gap-2">
                                {['Pending', 'Completed', 'Paid Out'].map(t => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setStatus(t as any)}
                                        className={`py-4 rounded-xl font-bold flex flex-col items-center justify-center transition-all ${status === t ? 'bg-purple-600 text-white shadow-lg shadow-purple-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                    >
                                        <span className="text-xs uppercase tracking-wider">{t}</span>
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
                        form="edit-referral-form"
                        disabled={isSaving}
                        className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black shadow-xl hover:bg-slate-800 hover:-translate-y-0.5 active:scale-95 transition-all text-sm uppercase tracking-widest flex items-center justify-center disabled:opacity-50"
                    >
                        {isSaving ? 'Saving...' : <><Save className="w-4 h-4 mr-2" /> Save Referral</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ReferralFlyout;
