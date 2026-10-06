import React, { useEffect, useState } from 'react';

import { apiUrl } from '../services/api';
interface ActivePromotion {
    id: number;
    title: string;
    bannerText: string | null;
    discountCode: string | null;
    discountPercent: number | null;
    showOnHomepage: boolean;
    showOnBooking: boolean;
}

interface PromoBannerProps {
    /** Which surface is asking, so per-promotion visibility flags are respected. */
    surface: 'homepage' | 'booking';
}

export default function PromoBanner({ surface }: PromoBannerProps) {
    const [promos, setPromos] = useState<ActivePromotion[]>([]);
    const [dismissed, setDismissed] = useState<number[]>([]);

    useEffect(() => {
        let cancelled = false;
        fetch(apiUrl('/promotions/active'))
            .then((r) => (r.ok ? r.json() : []))
            .then((rows) => {
                if (!cancelled && Array.isArray(rows)) setPromos(rows);
            })
            .catch(() => {});
        try {
            const raw = sessionStorage.getItem('cin_promo_dismissed');
            if (raw) setDismissed(JSON.parse(raw));
        } catch {}
        return () => {
            cancelled = true;
        };
    }, []);

    const dismiss = (id: number) => {
        const next = [...dismissed, id];
        setDismissed(next);
        try {
            sessionStorage.setItem('cin_promo_dismissed', JSON.stringify(next));
        } catch {}
    };

    const visible = promos.filter((p) => {
        if (dismissed.includes(p.id)) return false;
        return surface === 'booking' ? p.showOnBooking !== false : p.showOnHomepage !== false;
    });

    if (visible.length === 0) return null;

    return (
        <>
            {visible.map((p) => (
                <div key={p.id} className="bg-teal-700 text-white">
                    <div className="max-w-7xl mx-auto px-4 lg:px-8 py-3 flex items-center gap-4">
                        <p className="flex-1 text-sm font-bold leading-snug">
                            {p.bannerText || p.title}
                            {p.discountCode && (
                                <>
                                    {' '}
                                    <span className="inline-block rounded-full bg-white/20 px-3 py-0.5 font-mono tracking-widest">
                                        {p.discountCode}
                                    </span>
                                </>
                            )}
                            {p.discountPercent ? <span className="ml-2 opacity-90">— {p.discountPercent}% off</span> : null}
                        </p>
                        <button
                            type="button"
                            onClick={() => dismiss(p.id)}
                            aria-label="Dismiss offer"
                            className="shrink-0 text-xl leading-none text-white/70 hover:text-white"
                        >
                            &times;
                        </button>
                    </div>
                </div>
            ))}
        </>
    );
}
