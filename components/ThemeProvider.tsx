import React, { createContext, useContext, useEffect, useState } from 'react';
import { apiAdmin, apiClient } from '../services/api';

type ThemeSettings = {
    theme_primary: string;
    theme_background: string;
    theme_button: string; // Separate button color? Or just primary?
};

type ThemeContextType = {
    settings: ThemeSettings;
    updateSettings: (newSettings: Partial<ThemeSettings>) => void;
    saveSettings: () => Promise<void>;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Helper: Hex to HSL (space separated for Tailwind)
const hexToHSL = (hex: string): string => {
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
        r = parseInt("0x" + hex[1] + hex[1]);
        g = parseInt("0x" + hex[2] + hex[2]);
        b = parseInt("0x" + hex[3] + hex[3]);
    } else if (hex.length === 7) {
        r = parseInt("0x" + hex[1] + hex[2]);
        g = parseInt("0x" + hex[3] + hex[4]);
        b = parseInt("0x" + hex[5] + hex[6]);
    }

    r /= 255;
    g /= 255;
    b /= 255;

    let cmin = Math.min(r, g, b),
        cmax = Math.max(r, g, b),
        delta = cmax - cmin,
        h = 0,
        s = 0,
        l = 0;

    if (delta === 0) h = 0;
    else if (cmax === r) h = ((g - b) / delta) % 6;
    else if (cmax === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;

    h = Math.round(h * 60);
    if (h < 0) h += 360;

    l = (cmax + cmin) / 2;
    s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
    s = +(s * 100).toFixed(1);
    l = +(l * 100).toFixed(1);

    return `${h} ${s}% ${l}%`;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<ThemeSettings>({
        theme_primary: '#4f46e5',
        theme_background: '#f4f6fb',
        theme_button: '#4f46e5'
    });

    // Apply CSS Variables
    useEffect(() => {
        const root = document.documentElement;

        const accentHex = settings.theme_button || settings.theme_primary;
        if (accentHex) {
            const hsl = hexToHSL(accentHex);
            root.style.setProperty('--primary', hsl);
            root.style.setProperty('--ring', hsl);
        }

        if (settings.theme_background) {
            const hsl = hexToHSL(settings.theme_background);
            root.style.setProperty('--background', hsl);
        }

    }, [settings]);

    // Load from API on mount (public GET; no client token required)
    useEffect(() => {
        apiClient.getBusinessSettings().then((data: any) => {
            if (data.theme_primary) setSettings(prev => ({ ...prev, theme_primary: data.theme_primary }));
            if (data.theme_background) setSettings(prev => ({ ...prev, theme_background: data.theme_background }));
            if (data.theme_button) setSettings(prev => ({ ...prev, theme_button: data.theme_button }));
        });
    }, []);

    const updateSettings = (newSettings: Partial<ThemeSettings>) => {
        setSettings(prev => ({ ...prev, ...newSettings }));
    };

    const saveSettings = async () => {
        await apiAdmin.updateBusinessSettings(settings);
    };

    return (
        <ThemeContext.Provider value={{ settings, updateSettings, saveSettings }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error("useTheme must be used within a ThemeProvider");
    return context;
};
