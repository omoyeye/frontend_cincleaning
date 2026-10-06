import React, { useEffect, useRef, useState, useCallback } from 'react';

import { apiUrl } from '../services/api';
declare global {
  interface Window {
    google?: typeof google;
    __gmapsLoading?: Promise<void>;
  }
}

async function loadGoogleMaps(): Promise<void> {
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
      script.onerror = () => reject(new Error('Google Maps script failed'));
      document.head.appendChild(script);
    } catch (err) {
      reject(err);
    }
  });
  return window.__gmapsLoading;
}

async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
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

interface AddressMapProps {
  address: string;
  height?: string;
  className?: string;
}

const AddressMap: React.FC<AddressMapProps> = ({ address, height = '200px', className = '' }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const initMap = useCallback(async () => {
    if (!mapRef.current || !address || address.length < 5) {
      setLoading(false);
      setError(true);
      return;
    }
    setLoading(true);
    setError(false);

    try {
      await loadGoogleMaps();
      const location = await geocodeAddress(address);
      if (!location) {
        setError(true);
        setLoading(false);
        return;
      }

      const map = new google.maps.Map(mapRef.current, {
        center: location,
        zoom: 15,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
        ],
      });
      mapInstanceRef.current = map;

      if (markerRef.current) markerRef.current.setMap(null);
      markerRef.current = new google.maps.Marker({
        position: location,
        map,
        title: address,
        icon: {
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
          fillColor: '#4f46e5',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 1.8,
          anchor: new google.maps.Point(12, 22),
        },
      });

      setLoading(false);
    } catch {
      setError(true);
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    initMap();
    return () => {
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
    };
  }, [initMap]);

  if (error) return null;

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-slate-200/80 ${className}`} style={{ height }}>
      <div ref={mapRef} className="h-full w-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
};

export default AddressMap;
