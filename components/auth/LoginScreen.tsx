import React, { useState } from 'react';
import { Loader2, Lock, Mail, ArrowLeft, Eye, EyeOff, CheckCircle2 } from 'lucide-react';
import BrandLogoMark from '../BrandLogoMark';
import { apiAdmin, apiStaff, customerAccountFromLoginUser } from '../../services/api';
import { UserAccount } from '../../types';

interface Props {
    role: 'admin' | 'staff';
    onLoginSuccess: (user: UserAccount) => void;
    onBack: () => void;
}

const LoginScreen: React.FC<Props> = ({ role, onLoginSuccess, onBack }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);

    const [isForgotPassword, setIsForgotPassword] = useState(false);
    const [forgotPasswordEmail, setForgotPasswordEmail] = useState('');
    const [forgotPasswordMessage, setForgotPasswordMessage] = useState('');

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const raw =
                role === 'admin'
                    ? await apiAdmin.login(email, password)
                    : await apiStaff.login(email, password);
            const user = customerAccountFromLoginUser(raw);

            onLoginSuccess(user);
        } catch (err: unknown) {
            console.error(err);
            const raw = err instanceof Error ? err.message : String(err);
            const fallback =
                role === 'staff'
                    ? 'Staff login failed. Check your email and password, or ask an admin that your account has staff access.'
                    : role === 'admin'
                      ? 'Admin login failed. Check your email and password, or confirm this account is an administrator.'
                      : 'Login failed. Please check your credentials.';
            setError(raw || fallback);
        } finally {
            setLoading(false);
        }
    };

    const handleForgotPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setForgotPasswordMessage('');

        try {
            const api = role === 'admin' ? apiAdmin : apiStaff;
            const response = (await api.forgotPassword(forgotPasswordEmail)) as { message?: string };
            setForgotPasswordMessage(response?.message ?? 'Check your email for instructions.');
        } catch (err: unknown) {
            const raw = err instanceof Error ? err.message : String(err);
            setError(raw || 'Could not send reset link. Check your email and connection.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-[min(100dvh,48rem)] w-full flex-1 flex-col items-center justify-center bg-background p-6">
            <div className="bg-card w-full max-w-md p-6 md:p-10 rounded-[3rem] shadow-2xl border-2 border-border animate-in fade-in zoom-in-95 duration-500">
                <button onClick={onBack} className="mb-8 flex items-center text-muted-foreground hover:text-foreground transition-colors font-bold text-xs uppercase tracking-widest">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Home
                </button>

                <div className="flex justify-center mb-8">
                    <BrandLogoMark className="h-28 w-auto max-w-[min(85vw,520px)] object-contain mx-auto" />
                </div>

                <h2 className="text-3xl font-black text-center text-foreground mb-2 capitalize">{role} Portal</h2>
                <p className="text-center text-muted-foreground text-xs font-black uppercase tracking-widest mb-10">Secure Access Required</p>

                {error && (
                    <div className="bg-red-50 text-red-500 p-4 rounded-xl text-xs font-bold mb-6 text-center border border-red-100">
                        {error}
                    </div>
                )}

                {isForgotPassword ? (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <button
                            onClick={() => { setIsForgotPassword(false); setError(null); setForgotPasswordMessage(''); }}
                            className="mb-6 flex items-center text-muted-foreground hover:text-primary transition-colors font-bold text-[10px] uppercase tracking-widest"
                        >
                            <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Back to Login
                        </button>
                        <h3 className="text-xl font-black text-foreground mb-6 uppercase tracking-tight">Reset Password</h3>
                        {forgotPasswordMessage ? (
                            <div className="p-6 bg-primary/10 text-primary rounded-2xl border border-primary/20 text-sm font-bold text-center">
                                <div className="flex justify-center mb-3">
                                    <CheckCircle2 className="w-8 h-8 text-primary" />
                                </div>
                                {forgotPasswordMessage}
                            </div>
                        ) : (
                            <form onSubmit={handleForgotPassword} className="space-y-4">
                                <div className="relative group">
                                    <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                                    <input
                                        type="email"
                                        placeholder="Email Address"
                                        value={forgotPasswordEmail}
                                        onChange={e => setForgotPasswordEmail(e.target.value)}
                                        required
                                        className="w-full pl-14 pr-6 py-5 bg-card border-2 border-input rounded-2xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold transition-all text-foreground placeholder:text-muted-foreground shadow-sm"
                                    />
                                </div>
                                <button type="submit" disabled={loading} className="w-full bg-primary text-primary-foreground py-6 rounded-2xl font-black shadow-xl shadow-primary/30 hover:opacity-90 transition-all active:scale-95 flex items-center justify-center space-x-3 uppercase tracking-widest text-xs">
                                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Send Reset Link'}
                                </button>
                            </form>
                        )}
                    </div>
                ) : (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div className="relative group">
                            <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                            <input
                                type="email"
                                placeholder="Email Address"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                className="w-full pl-14 pr-6 py-5 bg-card border-2 border-input rounded-2xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold transition-all text-sm text-foreground placeholder:text-muted-foreground shadow-sm"
                            />
                        </div>
                        <div className="relative group">
                            <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                required
                                className="w-full pl-14 pr-14 py-5 bg-card border-2 border-input rounded-2xl outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 font-bold transition-all text-sm text-foreground placeholder:text-muted-foreground shadow-sm"
                            />
                            <button 
                                type="button" 
                                onClick={() => setShowPassword(!showPassword)} 
                                className="absolute right-5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-primary transition-colors"
                            >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </button>
                        </div>

                        <div className="flex justify-end px-2">
                            <button
                                type="button"
                                onClick={() => { setIsForgotPassword(true); setError(null); setForgotPasswordEmail(email); }}
                                className="text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors"
                            >
                                Forgot Password?
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-5 rounded-2xl font-black shadow-xl hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center ${role === 'admin' ? 'bg-foreground text-background hover:opacity-90' : 'bg-primary text-primary-foreground hover:opacity-90 shadow-primary/35'}`}
                        >
                            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Authenticate System'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    );
};

export default LoginScreen;
