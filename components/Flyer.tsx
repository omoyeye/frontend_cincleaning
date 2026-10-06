import React, { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext, ReactNode } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type FlyerType = 'success' | 'error' | 'info';

interface Flyer {
    id: string;
    message: string;
    type: FlyerType;
}

interface FlyerContextType {
    showFlyer: (message: string, type?: FlyerType) => void;
}

const FlyerContext = createContext<FlyerContextType | undefined>(undefined);

/** Avoid stacking dozens of toasts (e.g. from effects re-running); newest kept. */
const MAX_VISIBLE_FLYERS = 5;

export const FlyerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [flyers, setFlyers] = useState<Flyer[]>([]);

    const removeFlyer = useCallback((id: string) => {
        setFlyers((prev) => prev.filter((f) => f.id !== id));
    }, []);

    const showFlyer = useCallback((message: string, type: FlyerType = 'success') => {
        const id = Math.random().toString(36).substring(2, 9);
        setFlyers((prev) => {
            const next = [...prev, { id, message, type }];
            return next.length > MAX_VISIBLE_FLYERS ? next.slice(-MAX_VISIBLE_FLYERS) : next;
        });
    }, []);

    const contextValue = useMemo(() => ({ showFlyer }), [showFlyer]);

    return (
        <FlyerContext.Provider value={contextValue}>
            {children}
            <div
                className="fixed z-[300] flex flex-col gap-2 pointer-events-none bottom-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] left-1/2 -translate-x-1/2 items-center w-[min(92vw,22rem)] max-h-[min(42vh,20rem)] overflow-y-auto overflow-x-hidden overscroll-contain sm:top-6 sm:right-6 sm:bottom-auto sm:left-auto sm:translate-x-0 sm:items-end sm:max-h-[min(50vh,24rem)] sm:w-auto sm:pr-1"
                aria-live="polite"
            >
                {flyers.map((flyer) => (
                    <FlyerItem key={flyer.id} flyer={flyer} onRemove={() => removeFlyer(flyer.id)} />
                ))}
            </div>
        </FlyerContext.Provider>
    );
};

const FlyerItem: React.FC<{ flyer: Flyer; onRemove: () => void }> = ({ flyer, onRemove }) => {
    const onRemoveRef = useRef(onRemove);
    onRemoveRef.current = onRemove;
    useEffect(() => {
        const timer = setTimeout(() => onRemoveRef.current(), 5000);
        return () => clearTimeout(timer);
    }, [flyer.id]);

    const icons = {
        success: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
        error: <AlertCircle className="w-5 h-5 text-rose-500" />,
        info: <Info className="w-5 h-5 text-blue-500" />,
    };

    const colors = {
        success: 'bg-emerald-50 border-emerald-100 text-emerald-900',
        error: 'bg-rose-50 border-rose-100 text-rose-900',
        info: 'bg-blue-50 border-blue-100 text-blue-900',
    };

    return (
        <div className={`pointer-events-auto w-full sm:w-auto flex items-center space-x-4 px-5 sm:px-6 py-4 rounded-2xl border shadow-xl ${colors[flyer.type]} animate-in slide-in-from-bottom sm:slide-in-from-right fade-in duration-300`}>
            {icons[flyer.type]}
            <p className="text-sm font-bold break-words min-w-0 flex-1">{flyer.message}</p>
            <button onClick={onRemove} className="p-1 hover:bg-black/5 rounded-lg transition-colors">
                <X className="w-4 h-4 opacity-50" />
            </button>
        </div>
    );
};

export const useFlyer = () => {
    const context = useContext(FlyerContext);
    if (!context) throw new Error('useFlyer must be used within a FlyerProvider');
    return context;
};
