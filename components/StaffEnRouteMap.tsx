import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Booking } from '../types';
import { buildAddressString, loadGoogleMaps, geocodeAddress } from '../src/utils/googleMaps';

export interface StaffEnRouteMapProps {
  booking: Booking;
  showDirections?: boolean;
}

const StaffEnRouteMap: React.FC<StaffEnRouteMapProps> = ({ booking, showDirections = true }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [routeInfo, setRouteInfo] = useState<{ distance: string; duration: string } | null>(null);

  const address = buildAddressString(booking);

  const initMap = useCallback(async () => {
    if (!mapRef.current) return;
    setLoading(true);
    setError(null);

    try {
      await loadGoogleMaps();

      const jobLocation = await geocodeAddress(address);
      if (!jobLocation) {
        setError('Could not find this address on the map');
        setLoading(false);
        return;
      }

      const map = new google.maps.Map(mapRef.current, {
        center: jobLocation,
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
        position: jobLocation,
        map,
        title: 'Job Site',
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 12,
          fillColor: '#059669',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        label: { text: '📍', fontSize: '16px' },
      });
      markersRef.current.push(jobMarker);

      if (showDirections && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const staffLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };

            const staffMarker = new google.maps.Marker({
              position: staffLocation,
              map,
              title: 'Your Location',
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                scale: 10,
                fillColor: '#4f46e5',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 3,
              },
            });
            markersRef.current.push(staffMarker);

            const directionsService = new google.maps.DirectionsService();
            const directionsRenderer = new google.maps.DirectionsRenderer({
              map,
              suppressMarkers: true,
              polylineOptions: {
                strokeColor: '#4f46e5',
                strokeWeight: 5,
                strokeOpacity: 0.8,
              },
            });
            directionsRendererRef.current = directionsRenderer;

            directionsService.route(
              {
                origin: staffLocation,
                destination: jobLocation,
                travelMode: google.maps.TravelMode.DRIVING,
              },
              (result, status) => {
                if (status === 'OK' && result) {
                  directionsRenderer.setDirections(result);
                  const leg = result.routes[0]?.legs[0];
                  if (leg) {
                    setRouteInfo({
                      distance: leg.distance?.text || '',
                      duration: leg.duration?.text || '',
                    });
                  }
                }
              },
            );
          },
          () => {
            const bounds = new google.maps.LatLngBounds();
            bounds.extend(jobLocation);
            map.fitBounds(bounds);
          },
          { enableHighAccuracy: true, timeout: 8000 },
        );
      }

      setLoading(false);
    } catch (err) {
      console.error('Map init error:', err);
      setError('Map could not be loaded');
      setLoading(false);
    }
  }, [address, showDirections]);

  useEffect(() => {
    initMap();
    return () => {
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
        directionsRendererRef.current = null;
      }
    };
  }, [initMap]);

  return (
    <div className="relative h-full w-full min-h-[280px]">
      <div ref={mapRef} className="h-full w-full min-h-[280px]" />

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
            <p className="text-xs text-slate-400 mt-1">Use "Open Maps" below for directions</p>
          </div>
        </div>
      )}

      {routeInfo && (
        <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-sm rounded-xl shadow-lg px-3 py-2 border border-slate-200/80">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-black text-primary">{routeInfo.duration}</span>
            <span className="text-slate-400">|</span>
            <span className="font-bold text-slate-600">{routeInfo.distance}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StaffEnRouteMap;
