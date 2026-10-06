import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Booking, BookingTracking, Staff } from '../types';
import { User, Phone, MessageSquare, Clock, Star, Navigation, AlarmClock } from 'lucide-react';
import { apiClient, apiUrl } from '../services/api';
import { subscribeNnSync } from '../services/realtime';

declare global {
  interface Window {
    google?: typeof google;
    __gmapsLoading?: Promise<void>;
  }
}

function buildAddressString(booking: Booking): string {
  const b = booking as Record<string, unknown>;
  const addr = b.address as Record<string, unknown> | undefined;
  const line1 = String(addr?.line1 ?? b.addressLine1 ?? '');
  const line2 = String(addr?.line2 ?? b.addressLine2 ?? '');
  const city = String(addr?.city ?? b.addressCity ?? '');
  const postcode = String(addr?.postcode ?? b.addressPostcode ?? '');
  return [line1, line2, city, postcode].filter(Boolean).join(', ');
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

interface Props {
  booking: Booking;
  staff: Staff[];
}

const CleanerTracker: React.FC<Props> = ({ booking, staff }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jobLocation, setJobLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [tracking, setTracking] = useState<BookingTracking | null>(null);
  const cleanerMarkerRef = useRef<google.maps.Marker | null>(null);
  const fittedRef = useRef(false);

  const address = buildAddressString(booking);
  const isActive = booking.status !== 'Completed' && booking.status !== 'Cancelled';

  useEffect(() => {
    if (!isActive) return;
    let cancelled = false;
    const load = () =>
      apiClient
        .getBookingTracking(booking.id)
        .then((t) => { if (!cancelled) setTracking(t); })
        .catch(() => { /* keep last snapshot */ });
    void load();
    const poll = setInterval(load, 20000);
    const unsub = subscribeNnSync((scope) => {
      if (scope === 'location' || scope === 'bookings' || scope === 'all') void load();
    });
    return () => {
      cancelled = true;
      clearInterval(poll);
      unsub();
    };
  }, [booking.id, isActive]);

  const cleanerLoc = tracking?.cleanerLocation ?? null;
  const enRouteAt = tracking?.enRouteAt ?? booking.enRouteAt ?? null;
  const lateNotices = tracking?.lateNotices ?? (Array.isArray(booking.lateNotices) ? booking.lateNotices : []);
  const latestLate = lateNotices[lateNotices.length - 1];

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !window.google?.maps) return;
    if (!cleanerLoc) {
      cleanerMarkerRef.current?.setMap(null);
      cleanerMarkerRef.current = null;
      return;
    }
    const pos = { lat: cleanerLoc.lat, lng: cleanerLoc.lng };
    if (!cleanerMarkerRef.current) {
      cleanerMarkerRef.current = new google.maps.Marker({
        position: pos,
        map,
        title: cleanerLoc.staffName || 'Your cleaner',
        zIndex: 1000,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#4f46e5',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
      });
    } else {
      cleanerMarkerRef.current.setPosition(pos);
    }
    if (!fittedRef.current && jobLocation) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend(pos);
      bounds.extend(jobLocation);
      map.fitBounds(bounds, 60);
      fittedRef.current = true;
    }
  }, [cleanerLoc, jobLocation, loading]);

  const cleanerKmAway =
    cleanerLoc && jobLocation && window.google?.maps?.geometry
      ? google.maps.geometry.spherical.computeDistanceBetween(
        new google.maps.LatLng(cleanerLoc.lat, cleanerLoc.lng),
        new google.maps.LatLng(jobLocation.lat, jobLocation.lng),
      ) / 1000
      : null;
  const seenMinsAgo = cleanerLoc?.at ? Math.max(0, Math.round((Date.now() - Date.parse(cleanerLoc.at)) / 60000)) : null;

  const initMap = useCallback(async () => {
    if (!mapRef.current) return;
    setLoading(true);
    setError(null);

    try {
      await loadGoogleMaps();

      const location = await geocodeAddress(address);
      if (!location) {
        setError('Could not locate this address');
        setLoading(false);
        return;
      }
      setJobLocation(location);

      const map = new google.maps.Map(mapRef.current, {
        center: location,
        zoom: 14,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'cooperative',
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
        ],
      });
      mapInstanceRef.current = map;

      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];

      const jobMarker = new google.maps.Marker({
        position: location,
        map,
        title: 'Your Address',
        icon: {
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
          fillColor: '#059669',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 2,
          scale: 2,
          anchor: new google.maps.Point(12, 22),
          labelOrigin: new google.maps.Point(12, 9),
        },
        label: {
          text: '🏠',
          fontSize: '14px',
        },
      });
      markersRef.current.push(jobMarker);

      const infoWindow = new google.maps.InfoWindow({
        content: `<div style="font-family:system-ui;padding:4px"><strong>Service Location</strong><br/><span style="font-size:12px;color:#64748b">${address}</span></div>`,
      });
      jobMarker.addListener('click', () => infoWindow.open(map, jobMarker));

      setLoading(false);
    } catch (err) {
      console.error('CleanerTracker map error:', err);
      setError('Map could not be loaded');
      setLoading(false);
    }
  }, [address]);

  useEffect(() => {
    initMap();
    return () => {
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      cleanerMarkerRef.current?.setMap(null);
      cleanerMarkerRef.current = null;
      fittedRef.current = false;
    };
  }, [initMap]);

  const onTheWay = isActive && Boolean(enRouteAt);
  const statusColor = onTheWay
    ? 'text-indigo-600'
    : booking.status === 'Confirmed'
      ? 'text-blue-600'
      : 'text-emerald-600';

  const statusLabel = onTheWay
    ? cleanerKmAway != null && cleanerKmAway < 0.2
      ? 'Your cleaner has arrived'
      : 'Your cleaner is on the way'
    : booking.status === 'Confirmed'
      ? 'Confirmed & Scheduled'
      : booking.status;

  const statusDetail = onTheWay && cleanerKmAway != null && cleanerKmAway >= 0.2
    ? `${cleanerKmAway.toFixed(1)} km away${seenMinsAgo != null ? ` · updated ${seenMinsAgo} min ago` : ''}`
    : address;

  return (
    <div className="bg-white rounded-[2.5rem] overflow-hidden border border-slate-100 shadow-xl">
      {staff.length > 0 && (
        <div className="p-0 bg-slate-900 text-white divide-y divide-white/5">
          {staff.map(s => (
            <div key={s.id} className="p-6 md:p-8 flex justify-between items-center group">
              <div className="flex items-center space-x-4">
                <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm overflow-hidden border border-white/10 group-hover:border-blue-400 transition-colors">
                  {s.profilePhoto ? (
                    <img src={s.profilePhoto} alt={s.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="font-black text-lg">{s.name}</h3>
                  <div className="flex items-center space-x-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span>{Number(s.rating ?? 4.9).toFixed(1)} Rating</span>
                    <span className="w-1 h-1 bg-slate-500 rounded-full" />
                    <span className={`${s.isVerified === false || s.status !== 'Active' ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {s.isVerified === false || s.status !== 'Active' ? 'UNVERIFIED' : 'VERIFIED'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex space-x-2">
                {s.phone && (
                  <a href={`tel:${s.phone}`} title="Call" className="p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors active:scale-95">
                    <Phone className="w-5 h-5" />
                  </a>
                )}
                <button title="Message" className="p-3 bg-white/10 rounded-xl hover:bg-white/20 transition-colors active:scale-95">
                  <MessageSquare className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {isActive && latestLate && (
        <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-start gap-3">
          <AlarmClock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900">
            <p className="font-black">{latestLate.staffName} is running late</p>
            <p className="font-medium">
              {latestLate.reason}
              {latestLate.minutesLate ? ` · about ${latestLate.minutesLate} min` : ''}
              {latestLate.etaTime ? ` · new arrival around ${latestLate.etaTime}` : ''}
            </p>
            {latestLate.message && <p className="text-xs mt-1 text-amber-800">{latestLate.message}</p>}
          </div>
        </div>
      )}

      <div className="h-96 w-full relative z-0">
        <div ref={mapRef} className="h-full w-full" />

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/80">
            <div className="flex flex-col items-center gap-2">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Loading map...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90">
            <div className="text-center px-4">
              <p className="text-sm font-bold text-slate-600">{error}</p>
              <p className="text-xs text-slate-400 mt-1">{address}</p>
            </div>
          </div>
        )}

        <div className="absolute bottom-6 left-6 right-6 bg-white/90 backdrop-blur-md p-5 rounded-[2rem] shadow-2xl border border-slate-100 flex justify-between items-center z-[500]">
          <div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Job Status</div>
            <div className={`font-black text-lg tracking-tight leading-none ${statusColor}`}>{statusLabel}</div>
            {statusDetail && (
              <div className="text-[10px] font-bold text-slate-400 mt-1.5 max-w-[250px] truncate">{statusDetail}</div>
            )}
          </div>
          <div className="w-14 h-14 bg-primary text-white rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20">
            <Navigation className="w-7 h-7" />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CleanerTracker;
