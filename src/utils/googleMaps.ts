import type { Booking } from '../../types';

import { apiUrl } from '../../services/api';
declare global {
  interface Window {
    google?: typeof google;
    __gmapsLoading?: Promise<void>;
  }
}

export const DEFAULT_CENTER = { lat: 51.505, lng: -0.09 };

export function buildAddressString(booking: Booking): string {
  const b = booking as Record<string, unknown>;
  const addr = b.address as Record<string, unknown> | undefined;
  const line1 = String(addr?.line1 ?? b.addressLine1 ?? '');
  const line2 = String(addr?.line2 ?? b.addressLine2 ?? '');
  const city = String(addr?.city ?? b.addressCity ?? '');
  const postcode = String(addr?.postcode ?? b.addressPostcode ?? '');
  return [line1, line2, city, postcode].filter(Boolean).join(', ');
}

export async function loadGoogleMaps(): Promise<void> {
  if (window.google?.maps) return;
  if (window.__gmapsLoading) return window.__gmapsLoading;
  window.__gmapsLoading = new Promise<void>(async (resolve, reject) => {
    try {
      const res = await fetch(apiUrl('/maps/key'));
      if (!res.ok) return reject(new Error('No maps key'));
      const { key } = (await res.json()) as { key: string };
      if (!key) return reject(new Error('Empty maps key'));

      const existing = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existing) {
        const check = () => {
          if (window.google?.maps) resolve();
          else setTimeout(check, 100);
        };
        check();
        return;
      }

      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=geometry`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Google Maps script failed to load'));
      document.head.appendChild(script);
    } catch (err) {
      reject(err);
    }
  });
  return window.__gmapsLoading;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const res = await fetch(apiUrl('/maps/geocode'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { lat: number; lng: number };
    return { lat: data.lat, lng: data.lng };
  } catch {
    return null;
  }
}
