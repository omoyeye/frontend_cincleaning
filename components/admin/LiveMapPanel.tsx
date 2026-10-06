import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlarmClock, AlertTriangle, BellRing, CheckCircle2, Clock, MapPin, Navigation, RefreshCw, UserPlus, UserX } from 'lucide-react';
import { Booking, BookingStatus, BookingTracking, Staff } from '../../types';
import { apiAdmin } from '../../services/api';
import { subscribeNnSync } from '../../services/realtime';
import { useFlyer } from '../Flyer';
import { DEFAULT_CENTER, buildAddressString, geocodeAddress, loadGoogleMaps } from '../../src/utils/googleMaps';
import { getBookingStaffIds, getTodayYYYYMMDD, normalizeBookingDate } from '../../src/utils/bookingHelpers';

/** Mirrors server thresholds in server/jobTracking.ts. */
const NO_EN_ROUTE_WARN_MIN = 30;
const UNASSIGNED_WARN_HOURS = 24;

type JobState = 'completed' | 'unassigned' | 'en_route' | 'not_moving' | 'scheduled';

const STATE_STYLE: Record<JobState, { label: string; badge: string; dot: string }> = {
  completed: { label: 'Completed', badge: 'bg-slate-100 text-slate-500', dot: '#94a3b8' },
  unassigned: { label: 'No cleaner', badge: 'bg-red-100 text-red-700', dot: '#dc2626' },
  not_moving: { label: 'Not on the way', badge: 'bg-orange-100 text-orange-700', dot: '#ea580c' },
  en_route: { label: 'On the way', badge: 'bg-emerald-100 text-emerald-700', dot: '#059669' },
  scheduled: { label: 'Scheduled', badge: 'bg-blue-100 text-blue-700', dot: '#2563eb' },
};

const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

function bookingStartMs(b: Booking): number {
  const [y, m, d] = String(b.date || '').split('-').map(Number);
  const [hh, mm] = String(b.time || '09:00').split(':').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1, hh || 0, mm || 0).getTime();
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function minutesAgo(iso?: string | null): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.round((Date.now() - t) / 60000)) : null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface Props {
  bookings: Booking[];
  staffList: Staff[];
  onAssign: (b: Booking) => void;
  onViewStaff: (s: Staff) => void;
  onViewClient: (email: string) => void;
}

const LiveMapPanel: React.FC<Props> = ({ bookings, staffList, onAssign, onViewStaff, onViewClient }) => {
  const { showFlyer } = useFlyer();
  const [tracking, setTracking] = useState<Record<number, BookingTracking>>({});
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [now, setNow] = useState(Date.now());
  const [nudging, setNudging] = useState<number | null>(null);
  const [focusId, setFocusId] = useState<number | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const markers = useRef<Array<{ setMap: (m: google.maps.Map | null) => void }>>([]);
  const infoWindow = useRef<google.maps.InfoWindow | null>(null);
  const [jobCoords, setJobCoords] = useState<Record<number, { lat: number; lng: number } | null>>({});
  const fittedOnce = useRef(false);

  const today = getTodayYYYYMMDD();

  const loadTracking = useCallback(async () => {
    try {
      const rows = await apiAdmin.getLiveTracking();
      const map: Record<number, BookingTracking> = {};
      rows.forEach((r) => { map[r.id] = r; });
      setTracking(map);
      setLastRefresh(new Date());
    } catch {
      /* keep last snapshot */
    }
  }, []);

  useEffect(() => {
    void loadTracking();
    const poll = setInterval(() => void loadTracking(), 20000);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const unsub = subscribeNnSync((scope) => {
      if (scope === 'location' || scope === 'bookings' || scope === 'all') void loadTracking();
    });
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      unsub();
    };
  }, [loadTracking]);

  const staffById = useMemo(() => new Map(staffList.map((s) => [Number(s.id), s])), [staffList]);

  const todaysJobs = useMemo(() => {
    return bookings
      .filter((b) => normalizeBookingDate(b.date) === today && b.status !== BookingStatus.CANCELLED)
      .map((b) => {
        const t = tracking[b.id];
        const staffIds = getBookingStaffIds(b);
        const enRouteAt = t?.enRouteAt ?? b.enRouteAt ?? null;
        const minutesUntil = (bookingStartMs(b) - now) / 60000;
        let state: JobState;
        if (b.status === BookingStatus.COMPLETED) state = 'completed';
        else if (!staffIds.length) state = 'unassigned';
        else if (enRouteAt) state = 'en_route';
        else if (minutesUntil <= NO_EN_ROUTE_WARN_MIN) state = 'not_moving';
        else state = 'scheduled';
        return {
          booking: b,
          staff: staffIds.map((id) => staffById.get(id)).filter(Boolean) as Staff[],
          enRouteAt,
          location: t?.cleanerLocation ?? null,
          lateNotices: t?.lateNotices ?? (Array.isArray(b.lateNotices) ? b.lateNotices : []),
          minutesUntil,
          state,
        };
      })
      .sort((a, b) => String(a.booking.time).localeCompare(String(b.booking.time)));
  }, [bookings, tracking, today, staffById, now]);

  const unassignedSoon = useMemo(
    () =>
      bookings
        .filter((b) => {
          if (b.status !== BookingStatus.PENDING && b.status !== BookingStatus.CONFIRMED) return false;
          if (getBookingStaffIds(b).length) return false;
          const mins = (bookingStartMs(b) - now) / 60000;
          return mins <= UNASSIGNED_WARN_HOURS * 60 && mins > -120;
        })
        .sort((a, b) => bookingStartMs(a) - bookingStartMs(b)),
    [bookings, now],
  );

  const notMoving = todaysJobs.filter((j) => j.state === 'not_moving');
  const counts = useMemo(() => {
    const c: Record<JobState, number> = { completed: 0, unassigned: 0, en_route: 0, not_moving: 0, scheduled: 0 };
    todaysJobs.forEach((j) => { c[j.state] += 1; });
    return c;
  }, [todaysJobs]);

  // Geocode today's job addresses once each.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next: Record<number, { lat: number; lng: number } | null> = {};
      for (const j of todaysJobs) {
        const addr = buildAddressString(j.booking);
        if (!addr) continue;
        if (!geocodeCache.has(addr)) geocodeCache.set(addr, await geocodeAddress(addr));
        next[j.booking.id] = geocodeCache.get(addr) ?? null;
      }
      if (!cancelled) setJobCoords(next);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaysJobs.map((j) => `${j.booking.id}:${buildAddressString(j.booking)}`).join('|')]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (cancelled || !mapRef.current || mapInstance.current) return;
        mapInstance.current = new google.maps.Map(mapRef.current, {
          center: DEFAULT_CENTER,
          zoom: 11,
          disableDefaultUI: true,
          zoomControl: true,
          fullscreenControl: true,
          styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
        });
        infoWindow.current = new google.maps.InfoWindow();
        setMapError(null);
      })
      .catch(() => !cancelled && setMapError('Map unavailable. Check the Google Maps key in server settings.'));
    return () => { cancelled = true; };
  }, []);

  // Redraw markers whenever jobs, coordinates or live locations change.
  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !window.google?.maps) return;
    markers.current.forEach((m) => m.setMap(null));
    markers.current = [];
    const bounds = new google.maps.LatLngBounds();
    let any = false;

    for (const j of todaysJobs) {
      const pos = jobCoords[j.booking.id];
      if (pos) {
        const style = STATE_STYLE[j.state];
        const marker = new google.maps.Marker({
          position: pos,
          map,
          title: `${j.booking.time} ${j.booking.contact?.name || ''}`,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9,
            fillColor: style.dot,
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 3,
          },
          label: { text: j.booking.time.slice(0, 5), color: '#0f172a', fontSize: '10px', fontWeight: '700' },
        });
        marker.addListener('click', () => {
          setFocusId(j.booking.id);
          infoWindow.current?.setContent(
            `<div style="font-family:system-ui;font-size:12px;max-width:220px"><strong>${escapeHtml(j.booking.contact?.name || 'Client')}</strong><br/>${escapeHtml(j.booking.time)} · ${escapeHtml(j.booking.serviceType)}<br/><span style="color:#64748b">${escapeHtml(buildAddressString(j.booking))}</span><br/><span style="color:${style.dot};font-weight:700">${style.label}</span></div>`,
          );
          infoWindow.current?.open(map, marker);
        });
        markers.current.push(marker);
        bounds.extend(pos);
        any = true;
      }

      if (j.location && j.state !== 'completed') {
        const loc = { lat: j.location.lat, lng: j.location.lng };
        const name = j.location.staffName || j.staff[0]?.name || 'Cleaner';
        const cleaner = new google.maps.Marker({
          position: loc,
          map,
          title: name,
          zIndex: 1000,
          icon: {
            path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
            scale: 6,
            fillColor: '#4f46e5',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });
        cleaner.addListener('click', () => {
          const ago = minutesAgo(j.location?.at);
          infoWindow.current?.setContent(
            `<div style="font-family:system-ui;font-size:12px"><strong>${escapeHtml(name)}</strong><br/>Heading to ${escapeHtml(j.booking.contact?.name || 'client')} (${escapeHtml(j.booking.time)})<br/><span style="color:#64748b">Updated ${ago == null ? 'recently' : `${ago} min ago`}</span></div>`,
          );
          infoWindow.current?.open(map, cleaner);
        });
        markers.current.push(cleaner);
        if (pos) {
          const line = new google.maps.Polyline({
            path: [loc, pos],
            map,
            strokeColor: '#4f46e5',
            strokeOpacity: 0,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.7, scale: 3 }, offset: '0', repeat: '12px' }],
          });
          markers.current.push(line);
        }
        bounds.extend(loc);
        any = true;
      }
    }

    if (any && !fittedOnce.current) {
      map.fitBounds(bounds, 60);
      fittedOnce.current = true;
    }
  }, [todaysJobs, jobCoords]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || focusId == null) return;
    const j = todaysJobs.find((x) => x.booking.id === focusId);
    const pos = j?.location ? { lat: j.location.lat, lng: j.location.lng } : jobCoords[focusId];
    if (pos) {
      map.panTo(pos);
      if ((map.getZoom() || 0) < 13) map.setZoom(13);
    }
  }, [focusId, todaysJobs, jobCoords]);

  const nudge = async (b: Booking) => {
    setNudging(b.id);
    try {
      const r = await apiAdmin.nudgeStaff(b.id);
      showFlyer(r.notified ? 'Cleaner notified to head to the job.' : 'Sent by SMS only (cleaner has no app account).', 'success');
    } catch (e) {
      showFlyer(e instanceof Error ? e.message : 'Could not notify cleaner', 'error');
    } finally {
      setNudging(null);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 w-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Navigation className="w-5 h-5 text-primary" /> Live map
          </h3>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Today's jobs and where your cleaners are. Locations update about every 30 seconds while a cleaner is travelling.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadTracking()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:bg-slate-50"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {lastRefresh ? `Updated ${lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Refresh'}
        </button>
      </div>

      {(unassignedSoon.length > 0 || notMoving.length > 0) && (
        <div className="rounded-[2rem] border-2 border-red-200 bg-red-50 p-5 space-y-3">
          <p className="flex items-center gap-2 text-sm font-black text-red-800">
            <AlertTriangle className="w-5 h-5" /> Needs attention
          </p>
          {notMoving.map((j) => (
            <div key={`nm-${j.booking.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white border border-red-100 p-3">
              <div className="text-sm">
                <span className="font-black text-slate-900">No cleaner on the way</span>
                <span className="text-slate-600">
                  {' '}to {j.booking.contact?.name || 'client'} at {j.booking.time}
                  {j.minutesUntil > 0 ? ` (starts in ${Math.round(j.minutesUntil)} min)` : ` (${Math.round(-j.minutesUntil)} min overdue)`}
                  {j.staff.length ? `. Assigned: ${j.staff.map((s) => s.name).join(', ')}` : ''}
                </span>
              </div>
              <button
                type="button"
                disabled={nudging === j.booking.id}
                onClick={() => void nudge(j.booking)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-600 text-white text-xs font-black uppercase tracking-wider hover:bg-red-700 disabled:opacity-50"
              >
                <BellRing className="w-3.5 h-3.5" /> {nudging === j.booking.id ? 'Sending...' : 'Notify cleaner'}
              </button>
            </div>
          ))}
          {unassignedSoon.map((b) => (
            <div key={`un-${b.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white border border-red-100 p-3">
              <div className="text-sm">
                <span className="font-black text-slate-900">No cleaner assigned</span>
                <span className="text-slate-600">
                  {' '}for {b.contact?.name || 'client'} on {b.date} at {b.time} ({b.address?.postcode})
                </span>
              </div>
              <button
                type="button"
                onClick={() => onAssign(b)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 text-white text-xs font-black uppercase tracking-wider hover:bg-slate-700"
              >
                <UserPlus className="w-3.5 h-3.5" /> Assign
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {([
          ['en_route', 'On the way', <Navigation key="i" className="w-4 h-4" />],
          ['scheduled', 'Scheduled', <Clock key="i" className="w-4 h-4" />],
          ['not_moving', 'Not moving', <AlertTriangle key="i" className="w-4 h-4" />],
          ['completed', 'Completed', <CheckCircle2 key="i" className="w-4 h-4" />],
        ] as [JobState, string, React.ReactNode][]).map(([k, label, icon]) => (
          <div key={k} className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${STATE_STYLE[k].badge}`}>
              {icon} {label}
            </div>
            <div className="text-2xl font-black text-slate-900 mt-2">{counts[k]}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 bg-white rounded-[2rem] border border-slate-100 overflow-hidden relative min-h-[420px]">
          <div ref={mapRef} className="absolute inset-0" />
          {mapError && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-sm font-bold text-slate-500 p-6 text-center">
              {mapError}
            </div>
          )}
          <div className="absolute bottom-3 left-3 bg-white/95 rounded-xl shadow px-3 py-2 flex flex-wrap gap-3 text-[10px] font-bold text-slate-600">
            {(['scheduled', 'en_route', 'not_moving', 'unassigned'] as JobState[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: STATE_STYLE[k].dot }} /> {STATE_STYLE[k].label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 text-indigo-600"><Navigation className="w-3 h-3" /> Cleaner</span>
          </div>
        </div>

        <div className="xl:col-span-2 space-y-3 max-h-[620px] overflow-y-auto pr-1">
          {todaysJobs.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-sm font-bold text-slate-400">
              No jobs scheduled today.
            </div>
          )}
          {todaysJobs.map((j) => {
            const style = STATE_STYLE[j.state];
            const jobPos = jobCoords[j.booking.id];
            const km = j.location && jobPos ? distanceKm(j.location, jobPos) : null;
            const seen = minutesAgo(j.location?.at);
            const latest = j.lateNotices[j.lateNotices.length - 1];
            return (
              <div
                key={j.booking.id}
                onClick={() => setFocusId(j.booking.id)}
                className={`bg-white rounded-2xl border p-4 cursor-pointer transition-all ${
                  focusId === j.booking.id ? 'border-primary ring-2 ring-primary/20' : 'border-slate-100 hover:border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-slate-900">{j.booking.time}</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (j.booking.contact?.email) onViewClient(j.booking.contact.email); }}
                        className="text-sm font-bold text-slate-700 hover:text-blue-600 truncate"
                      >
                        {j.booking.contact?.name || 'Client'}
                      </button>
                    </div>
                    <div className="text-[11px] text-slate-500 font-medium flex items-center gap-1 mt-0.5 truncate">
                      <MapPin className="w-3 h-3 shrink-0" /> {j.booking.address?.line1}, {j.booking.address?.postcode}
                    </div>
                  </div>
                  <span className={`shrink-0 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${style.badge}`}>
                    {style.label}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  {j.staff.length ? (
                    j.staff.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onViewStaff(s); }}
                        className="px-2 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-blue-50 hover:text-blue-700"
                      >
                        {s.name}
                      </button>
                    ))
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600"><UserX className="w-3.5 h-3.5" /> Unassigned</span>
                  )}
                  {j.enRouteAt && (
                    <span className="text-emerald-700">
                      Left {new Date(j.enRouteAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                  {km != null && j.state !== 'completed' && (
                    <span className="text-indigo-700">
                      {km < 0.2 ? 'At the property' : `${km.toFixed(1)} km away`}
                      {seen != null ? ` · ${seen} min ago` : ''}
                    </span>
                  )}
                </div>

                {latest && (
                  <div className="mt-3 rounded-xl bg-amber-50 border border-amber-100 p-2.5 text-[11px] text-amber-900">
                    <span className="font-black inline-flex items-center gap-1"><AlarmClock className="w-3.5 h-3.5" /> Running late</span>
                    {' '}{latest.staffName}: {latest.reason}
                    {latest.minutesLate ? `, ~${latest.minutesLate} min` : ''}
                    {latest.etaTime ? `, ETA ${latest.etaTime}` : ''}
                    {j.lateNotices.length > 1 ? ` (${j.lateNotices.length} updates)` : ''}
                  </div>
                )}

                {(j.state === 'unassigned' || j.state === 'not_moving' || j.state === 'scheduled') && (
                  <div className="mt-3 flex gap-2">
                    {j.state === 'unassigned' ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onAssign(j.booking); }}
                        className="flex-1 py-2 rounded-xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-wider"
                      >
                        Assign cleaner
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={nudging === j.booking.id}
                        onClick={(e) => { e.stopPropagation(); void nudge(j.booking); }}
                        className="flex-1 py-2 rounded-xl border border-slate-200 text-slate-700 text-[11px] font-black uppercase tracking-wider hover:bg-slate-50 disabled:opacity-50"
                      >
                        {nudging === j.booking.id ? 'Sending...' : 'Tell cleaner to set off'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default LiveMapPanel;
