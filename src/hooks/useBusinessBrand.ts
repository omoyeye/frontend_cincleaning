import { useBusinessSettings } from '../context/BusinessSettingsContext';

/** Company display name from admin business settings (updates live when brand is saved). */
export function useBusinessBrand(fallback = 'CiN Cleaning') {
  const { companyName } = useBusinessSettings();
  return (companyName && companyName.trim()) || fallback;
}
