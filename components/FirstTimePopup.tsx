import React, { useEffect, useState } from 'react';

import { apiUrl } from '../services/api';
const DISMISS_KEY = 'cin_first_time_popup_dismissed';
const SHOW_AFTER_MS = 20000;

interface FirstTimePopupProps {
    onBookNow: () => void;
}

export default function FirstTimePopup({ onBookNow }: FirstTimePopupProps) {
    const [show, setShow] = useState(false);
    const [email, setEmail] = useState('');
    const [consent, setConsent] = useState(false);
    const [status, setStatus] = useState<'idle' | 'saving' | 'done'>('idle');

    useEffect(() => {
        try {
            if (localStorage.getItem(DISMISS_KEY)) return;
        } catch {
            return;
        }

        const timer = window.setTimeout(() => setShow(true), SHOW_AFTER_MS);
        const onExitIntent = (e: MouseEvent) => {
            if (e.clientY <= 4) setShow(true);
        };
        document.addEventListener('mouseout', onExitIntent);
        return () => {
            window.clearTimeout(timer);
            document.removeEventListener('mouseout', onExitIntent);
        };
    }, []);

    const remember = () => {
        try {
            localStorage.setItem(DISMISS_KEY, '1');
        } catch {}
    };

    const dismiss = () => {
        setShow(false);
        remember();
    };

    const submit = async () => {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !consent || status !== 'idle') return;
        setStatus('saving');
        try {
            await fetch(apiUrl('/newsletter-signup'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, marketingConsent: true }),
            });
        } catch {}
        remember();
        setStatus('done');
    };

    if (!show) return null;

    return (
        <div
            className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/60 p-6 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-label="First-time customer offer"
            onClick={dismiss}
        >
            <div
                className="relative w-full max-w-md rounded-3xl bg-card p-8 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <button
                    onClick={dismiss}
                    aria-label="Close offer"
                    className="absolute right-4 top-3 text-2xl leading-none text-muted-foreground hover:text-foreground"
                >
                    &times;
                </button>

                {status === 'done' ? (
                    <div className="py-4 text-center">
                        <div className="mb-3 text-4xl">🎉</div>
                        <h3 className="text-xl font-bold">You're all set!</h3>
                        <p className="mt-2 text-sm text-muted-foreground">
                            Use code <strong className="font-mono text-primary">FIRST10</strong> at checkout for 10% off your
                            first clean.
                        </p>
                        <button
                            onClick={() => {
                                setShow(false);
                                onBookNow();
                            }}
                            className="mt-6 w-full rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                        >
                            Book my clean
                        </button>
                    </div>
                ) : (
                    <>
                        <div className="mb-6 text-center">
                            <div className="mb-4 inline-flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-3xl">
                                ✨
                            </div>
                            <h3 className="text-xl font-bold">10% off your first clean</h3>
                            <p className="mt-2 text-sm text-muted-foreground">
                                Enter your email to receive your discount code.
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <label className="sr-only" htmlFor="first-time-email">
                                Email address
                            </label>
                            <input
                                id="first-time-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && submit()}
                                placeholder="you@example.com"
                                className="flex-1 rounded-xl border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
                            />
                            <button
                                onClick={submit}
                                disabled={status === 'saving' || !consent}
                                className="rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
                            >
                                {status === 'saving' ? '…' : 'Claim'}
                            </button>
                        </div>
                        <label className="mt-3 flex items-start gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={consent}
                                onChange={(e) => setConsent(e.target.checked)}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 accent-primary"
                            />
                            <span className="text-[11px] text-muted-foreground leading-snug">
                                I agree to receive my discount code and occasional marketing emails from CiN Cleaning.
                                You can unsubscribe at any time. See our{' '}
                                <a href="/terms" className="underline text-primary">Privacy Policy</a>.
                            </span>
                        </label>
                    </>
                )}
            </div>
        </div>
    );
}
