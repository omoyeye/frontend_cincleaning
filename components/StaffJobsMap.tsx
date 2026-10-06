import React, { useEffect, useRef, useState, useCallback } from 'react';
import { MapPin, Clock, Navigation, AlertCircle } from 'lucide-react';
import type { Booking } from '../types';
import { DEFAULT_CENTER, buildAddressString, loadGoogleMaps, geocodeAddress } from '../src/utils/googleMaps';

const STATUS_COLORS: Record<string, string> = {
  Pending: '#f59e0b',
  Confirmed: '#3b82f6',
  'In Progress': '#8b5cf6',
  Completed: '#10b981',
  Cancelled: '#ef4444',
};

type GeocodedJob = {
  booking: Booking;
  address: string;
  location: { lat: number; lng: number };
};

export interface StaffJobsMapProps {
  bookings: Booking[];
  onSelectBooking?: (booking: Booking) => void;
}

const StaffJobsMap: React.FC<StaffJobsMapProps> = ({ bookings, onSelectBooking }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [staffLocation, setStaffLocation] = useState<{ lat: number; lng: number } | null>(null);

  const activeBookings = bookings.filter(b => b.status !== 'Cancelled' && b.status !== 'Dismissed');

  const initMap = useCallback(async () => {
    if (!mapRef.current || activeBookings.length === 0) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      await loadGoogleMaps();

      const map = new google.maps.Map(mapRef.current, {
        center: DEFAULT_CENTER,
        zoom: 12,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy',
        styles: [
          { featureType: 'poi', stylers: [{ visibility: 'off' }] },
          { featureType: 'transit', stylers: [{ visibility: 'simplified' }] },
        ],
      });
      mapInstanceRef.current = map;
      infoWindowRef.current = new google.maps.InfoWindow();

      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];

      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            setStaffLocation(loc);
            const staffMarker = new google.maps.Marker({
              position: loc,
              map,
              title: 'You',
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#4f46e5',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
              },
              zIndex: 999,
            });
            markersRef.current.push(staffMarker);
          },
          () => {},
          { enableHighAccuracy: false, timeout: 5000 },
        );
      }

      const bounds = new google.maps.LatLngBounds();
      let placed = 0;

      // Build address list with deduplication for the cache
      const addressEntries = activeBookings.map((booking, i) => ({
        booking,
        addr: buildAddressString(booking),
        index: i,
      }));

      // Deduplicate addresses so each unique address is geocoded only once
      const uniqueAddresses = [...new Set(
        addressEntries.map(e => e.addr).filter(a => a && a.length >= 5)
      )];

      // Geocode all unique addresses in parallel
      const geocodeResults = await Promise.allSettled(
        uniqueAddresses.map(addr => geocodeAddress(addr))
      );

      const geocodeCache = new Map<string, { lat: number; lng: number } | null>();
      uniqueAddresses.forEach((addr, i) => {
        const result = geocodeResults[i];
        geocodeCache.set(addr, result.status === 'fulfilled' ? result.value : null);
      });

      // Create markers sequentially using cached results
      for (let i = 0; i < addressEntries.length; i++) {
        const { booking, addr } = addressEntries[i];
        if (!addr || addr.length < 5) continue;

        const location = geocodeCache.get(addr);
        if (!location) continue;

        const color = STATUS_COLORS[booking.status] || '#6b7280';
        const jobIndex = i + 1;

        const marker = new google.maps.Marker({
          position: location,
          map,
          title: `${booking.time} - ${booking.serviceType}`,
          label: {
            text: String(jobIndex),
            color: '#ffffff',
            fontWeight: 'bold',
            fontSize: '12px',
          },
          icon: {
            path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z',
            fillColor: color,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
            scale: 1.8,
            anchor: new google.maps.Point(12, 22),
            labelOrigin: new google.maps.Point(12, 9),
          },
        });

        marker.addListener('click', () => {
          const contact = (booking as any).contact || {};
          const clientName = String(contact.name || (booking as any).contactName || 'Client');
          const content = `
            <div style="font-family:system-ui;min-width:200px;padding:4px">
              <div style="font-weight:800;font-size:14px;margin-bottom:6px;color:#1e293b">
                ${booking.time} — ${booking.serviceType}
              </div>
              <div style="font-size:12px;color:#64748b;margin-bottom:4px">
                <strong>Client:</strong> ${clientName}
              </div>
              <div style="font-size:12px;color:#64748b;margin-bottom:6px">
                <strong>Address:</strong> ${addr}
              </div>
              <div style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:700;color:white;background:${color}">
                ${booking.status}
              </div>
            </div>
          `;
          infoWindowRef.current?.setContent(content);
          infoWindowRef.current?.open(map, marker);
          onSelectBooking?.(booking);
        });

        markersRef.current.push(marker);
        bounds.extend(location);
        placed++;
        setGeocodedCount(placed);
      }

      if (placed > 0) {
        if (placed === 1) {
          map.setCenter(bounds.getCenter());
          map.setZoom(15);
        } else {
          map.fitBounds(bounds, { top: 50, bottom: 50, left: 50, right: 50 });
        }
      }

      setLoading(false);
    } catch (err) {
      console.error('Jobs map error:', err);
      setError('Could not load the map');
      setLoading(false);
    }
  }, [activeBookings.map(b => b.id).join(',')]);

  useEffect(() => {
    initMap();
    return () => {
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
    };
  }, [initMap]);

  if (activeBookings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <MapPin className="w-12 h-12 text-slate-300 mb-3" />
        <p className="text-sm font-bold text-slate-500">No jobs to show on the map</p>
        <p className="text-xs text-slate-400 mt-1">Jobs will appear here when you have bookings assigned</p>
      </div>
    );
  }

  return (
    <div className="relative rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm">
      <div ref={mapRef} className="w-full" style={{ height: '420px' }} />

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              Mapping jobs... ({geocodedCount}/{activeBookings.length})
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/90">
          <div className="flex items-center gap-2 text-sm font-bold text-red-600">
            <AlertCircle className="w-5 h-5" />
            {error}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3 p-3 bg-white border-t border-slate-100">
        {Object.entries(STATUS_COLORS).map(([status, color]) => {
          const count = activeBookings.filter(b => b.status === status).length;
          if (count === 0) return null;
          return (
            <div key={status} className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
              <span className="w-3 h-3 rounded-full" style={{ background: color }} />
              {status} ({count})
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default StaffJobsMap;
