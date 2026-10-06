import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { BusinessSettings } from '../../types';
import { apiClient } from '../../services/api';

const DEFAULTS: Partial<BusinessSettings> = {
  companyName: 'CiN Cleaning',
  email: '',
  phone: '',
  website: '',
  address: '',
  bankDetails: [],
  depositPolicy: {
    requiredPercent: 40,
    message:
      'A 40% deposit is required to secure your booking and guarantee your cleaner arrives at the scheduled time.',
  },
  cancellationPolicy: {
    shortNoticeWindowHours: 24,
    shortNoticeFeePercent: 10,
    consentMessage:
      'If you choose to cancel within 24 hours of your appointment, you agree to a short-notice cancellation fee of 10% of the booking total.',
  },
};

function normalize(raw: Record<string, unknown> | null | undefined): Partial<BusinessSettings> {
  if (!raw || typeof raw !== 'object') return { ...DEFAULTS };
  const social = raw.socialLinks;
  const rawBankDetails = Array.isArray(raw.bankDetails) ? raw.bankDetails : [];
  const bankDetails = rawBankDetails
    .map((entry, idx) => {
      if (!entry || typeof entry !== 'object') return null;
      const e = entry as Record<string, unknown>;
      const accountName = typeof e.accountName === 'string' ? e.accountName.trim() : '';
      const accountNumber = typeof e.accountNumber === 'string' ? e.accountNumber.trim() : '';
      const sortCode = typeof e.sortCode === 'string' ? e.sortCode.trim() : '';
      if (!accountName || !accountNumber || !sortCode) return null;
      return {
        id: typeof e.id === 'string' && e.id.trim() ? e.id : `bank-${idx + 1}`,
        accountName,
        accountNumber,
        sortCode,
        bankName: typeof e.bankName === 'string' ? e.bankName : '',
        notes: typeof e.notes === 'string' ? e.notes : '',
        active: e.active !== false,
      };
    })
    .filter(Boolean) as NonNullable<BusinessSettings['bankDetails']>;
  const depositPolicyRaw =
    raw.depositPolicy && typeof raw.depositPolicy === 'object'
      ? (raw.depositPolicy as Record<string, unknown>)
      : {};
  const requiredPercentRaw = Number(depositPolicyRaw.requiredPercent);
  const requiredPercent = Number.isFinite(requiredPercentRaw)
    ? Math.min(100, Math.max(0, requiredPercentRaw))
    : DEFAULTS.depositPolicy?.requiredPercent || 40;
  const depositMessage =
    typeof depositPolicyRaw.message === 'string' && depositPolicyRaw.message.trim()
      ? depositPolicyRaw.message.trim()
      : DEFAULTS.depositPolicy?.message;
  const cancellationPolicyRaw =
    raw.cancellationPolicy && typeof raw.cancellationPolicy === 'object'
      ? (raw.cancellationPolicy as Record<string, unknown>)
      : {};
  const shortNoticeWindowHoursRaw = Number(cancellationPolicyRaw.shortNoticeWindowHours);
  const shortNoticeFeePercentRaw = Number(cancellationPolicyRaw.shortNoticeFeePercent);
  const shortNoticeWindowHours = Number.isFinite(shortNoticeWindowHoursRaw)
    ? Math.max(1, shortNoticeWindowHoursRaw)
    : DEFAULTS.cancellationPolicy?.shortNoticeWindowHours || 24;
  const shortNoticeFeePercent = Number.isFinite(shortNoticeFeePercentRaw)
    ? Math.min(100, Math.max(0, shortNoticeFeePercentRaw))
    : DEFAULTS.cancellationPolicy?.shortNoticeFeePercent || 10;
  const consentMessage =
    typeof cancellationPolicyRaw.consentMessage === 'string' && cancellationPolicyRaw.consentMessage.trim()
      ? cancellationPolicyRaw.consentMessage.trim()
      : DEFAULTS.cancellationPolicy?.consentMessage;
  const logoUrl =
    typeof raw.logoUrl === 'string'
      ? raw.logoUrl.trim() || null
      : raw.logoUrl === null
        ? null
        : undefined;

  return {
    ...DEFAULTS,
    companyName:
      typeof raw.companyName === 'string' && raw.companyName.trim()
        ? raw.companyName.trim()
        : DEFAULTS.companyName,
    email: typeof raw.email === 'string' ? raw.email : '',
    phone: typeof raw.phone === 'string' ? raw.phone : '',
    website: typeof raw.website === 'string' ? raw.website : '',
    address: typeof raw.address === 'string' ? raw.address : '',
    ...(logoUrl !== undefined ? { logoUrl } : {}),
    bankDetails,
    depositPolicy: {
      requiredPercent,
      ...(depositMessage ? { message: depositMessage } : {}),
    },
    cancellationPolicy: {
      shortNoticeWindowHours,
      shortNoticeFeePercent,
      ...(consentMessage ? { consentMessage } : {}),
    },
    socialLinks:
      social && typeof social === 'object' && !Array.isArray(social)
        ? (social as BusinessSettings['socialLinks'])
        : undefined,
  };
}

/**
 * Pages are pre-rendered at build time, so admin SEO edits made since the last deploy (GA4/GTM IDs,
 * verification tag, titles) are applied here from the live API instead.
 */
function applyLiveSeoSettings(seo: unknown): void {
  if (typeof window === 'undefined' || !seo || typeof seo !== 'object') return;
  const w = window as unknown as { __NN_SEO_SETTINGS__?: unknown };
  if (JSON.stringify(w.__NN_SEO_SETTINGS__ ?? null) === JSON.stringify(seo)) return;
  w.__NN_SEO_SETTINGS__ = seo;
  window.dispatchEvent(new Event('nn_seo_settings_updated'));
}

const BusinessSettingsContext = createContext<Partial<BusinessSettings>>(DEFAULTS);

export const BusinessSettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Partial<BusinessSettings>>(DEFAULTS);

  useEffect(() => {
    let live = true;
    const load = async () => {
      try {
        const raw = (await apiClient.getBusinessSettings()) as Record<string, unknown>;
        if (!live) return;
        setSettings(normalize(raw));
        applyLiveSeoSettings(raw?.seo_settings);
      } catch {
        /* keep defaults */
      }
    };
    void load();

    const onUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Partial<BusinessSettings>>).detail;
      if (!detail) return;
      setSettings((prev) => ({
        ...prev,
        ...detail,
        companyName: detail.companyName?.trim() || prev.companyName,
        socialLinks: detail.socialLinks ?? prev.socialLinks,
      }));
    };

    window.addEventListener('nn_business_settings_updated', onUpdated);
    return () => {
      live = false;
      window.removeEventListener('nn_business_settings_updated', onUpdated);
    };
  }, []);

  const value = useMemo(() => settings, [settings]);

  return <BusinessSettingsContext.Provider value={value}>{children}</BusinessSettingsContext.Provider>;
};

export function useBusinessSettings(): Partial<BusinessSettings> {
  return useContext(BusinessSettingsContext);
}
