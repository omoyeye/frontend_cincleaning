import React, { useState, useEffect } from 'react';
import { Loader2, Lock, ArrowLeft, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import BrandLogoMark from '../BrandLogoMark';
import { apiClient } from '../../services/api';

const ResetPassword: React.FC = () => {
    const [token, setToken] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const t = urlParams.get('token');
        if (t) setToken(t);
        else setError('No reset token found in the URL. Please check your email link.');
    }, []);

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            return setError('Passwords do not match');
        }
        if (newPassword.length < 8) {
            return setError('Password must be at least 8 characters long');
        }

        setLoading(true);
        setError(null);

        try {
            await apiClient.resetPassword(token, newPassword);
            setSuccess(true);
            // Redirect after 3 seconds
            setTimeout(() => {
                window.location.href = '/my-account';
            }, 3000);
        } catch (err: any) {
            console.error(err);
            setError(err.message || 'Failed to reset password. The link may have expired.');
        } finally {
            setLoading(false);
        }
    };

    if (success) {
        return (
            <div className="flex min-h-[min(100dvh,48rem)] w-full flex-1 flex-col items-center justify-center bg-background p-6">
                <div className="bg-card w-full max-w-md p-6 md:p-10 rounded-[3rem] shadow-2xl border-2 border-border text-center animate-in fade-in zoom-in-95 duration-500">
                    <div className="flex justify-center mb-6">
                        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                        </div>
                    </div>
                    <h2 className="text-3xl font-black text-foreground mb-4">Password Reset!</h2>
                    <p className="text-muted-foreground font-bold mb-8">Your password has been successfully updated. Redirecting you to the login page...</p>
                    <button 
                        onClick={() => window.location.href = '/my-account'}
                        className="w-full py-4 bg-primary text-primary-foreground rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg shadow-primary/25 hover:opacity-90"
                    >
                        Go to Login Now
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-[min(100dvh,48rem)] w-full flex-1 flex-col items-center justify-center bg-background p-6">
            <div className="bg-card w-full max-w-md p-6 md:p-10 rounded-[3rem] shadow-2xl border-2 border-border animate-in fade-in zoom-in-95 duration-500">
                <button onClick={() => window.location.href = '/'} className="mb-8 flex items-center text-muted-foreground hover:text-foreground transition-colors font-bold text-xs uppercase tracking-widest">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
                </button>

                <div className="flex justify-center mb-8">
                    <BrandLogoMark className="h-28 w-auto max-w-[min(85vw,520px)] object-contain mx-auto" />
                </div>

                <h2 className="text-3xl font-black text-center text-foreground mb-2">New Password</h2>
                <p className="text-center text-muted-foreground text-xs font-black uppercase tracking-widest mb-10">Set your secure credentials</p>

                {error && (
                    <div className="bg-red-50 text-red-500 p-4 rounded-xl text-xs font-bold mb-6 text-center border border-red-100">
                        {error}
                    </div>
                )}

                <form onSubmit={handleReset} className="space-y-4">
                    <div className="relative group">
                        <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="New Password"
                            value={newPassword}
                            onChange={e => setNewPassword(e.target.value)}
                            required
                            disabled={!token}
                            className="w-full pl-14 pr-14 py-5 bg-card border-2 border-input rounded-2xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold transition-all text-sm text-foreground placeholder:text-muted-foreground shadow-sm disabled:opacity-50"
                        />
                        <button 
                            type="button" 
                            onClick={() => setShowPassword(!showPassword)} 
                            className="absolute right-5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-primary transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    <div className="relative group">
                        <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Confirm New Password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            required
                            disabled={!token}
                            className="w-full pl-14 pr-14 py-5 bg-card border-2 border-input rounded-2xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold transition-all text-sm text-foreground placeholder:text-muted-foreground shadow-sm disabled:opacity-50"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading || !token}
                        className="w-full py-5 bg-primary text-primary-foreground rounded-2xl font-black shadow-xl shadow-primary/35 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center disabled:opacity-50 disabled:scale-100"
                    >
                        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Update Password'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;
