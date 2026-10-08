import {
    Booking,
    ServiceConfig,
    ServiceBookingFlow,
    ServiceTrigger,
    WizardStepKey,
    Staff,
    Extra,
    Referral,
    ChatSummary,
    GalleryItem,
    BlogPost,
    UserAccount,
    PaymentFeeEvidencePayload,
    BookingTracking,
    LateNotice,
    StaffAssessment,
    QuoteLead,
    QuoteLeadStatus,
} from '../types';

/** Maps `/api/login` user JSON into a `UserAccount` for the customer portal (cookie auth; body is untyped). */
export function customerAccountFromLoginUser(u: Record<string, unknown>): UserAccount {
    const id = u.id;
    const loyalty = u.loyaltyPoints;
    const adminTabsRaw = Array.isArray(u.adminTabs) ? u.adminTabs : [];
    const adminTabs = adminTabsRaw
        .filter((x): x is string => typeof x === 'string')
        .map((x) => x.trim())
        .filter(Boolean);
    return {
        id: typeof id === 'string' || typeof id === 'number' ? id : String(id ?? ''),
        name: String(u.name ?? ''),
        email: String(u.email ?? ''),
        isVerified: !!u.isVerified,
        role: typeof u.role === 'string' ? u.role : undefined,
        isSuperadmin: !!u.isSuperadmin,
        adminTabs,
        bookings: [],
        loyaltyPoints: typeof loyalty === 'number' && Number.isFinite(loyalty) ? loyalty : undefined,
        referralCode: typeof u.referralCode === 'string' ? u.referralCode : undefined,
        phone: typeof u.phone === 'string' ? u.phone : null,
        address: typeof u.address === 'string' ? u.address : null,
        postcode: typeof u.postcode === 'string' ? u.postcode : null,
    };
}

/** `/api/me` can return partial JSON from proxies/errors; never treat arbitrary objects as a session user. */
export function sessionUserFromMeResponse(raw: unknown): UserAccount | null {
    if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const o = raw as Record<string, unknown>;
    const id = o.id;
    const hasId =
        (typeof id === 'number' && Number.isFinite(id)) ||
        (typeof id === 'string' && id.trim().length > 0);
    if (!hasId) return null;
    return customerAccountFromLoginUser(o);
}

/** API base, e.g. `https://api.cleanitneatly.com/api`, or `/api` when proxied same-origin (Vite dev). */
function resolveApiUrl(): string {
    const v = import.meta.env.VITE_API_URL as string | undefined;
    if (v && String(v).trim()) return String(v).replace(/\/$/, '');
    return '/api';
}

export const API_URL = resolveApiUrl();

/** Absolute URL for an API path such as `/maps/key` (for direct `fetch` calls outside the API clients). */
export function apiUrl(path: string): string {
    return `${API_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

const VALID_TRIGGERS: readonly ServiceTrigger[] = [
    'standard', 'deep', 'end_of_tenancy', 'airbnb', 'commercial', 'jet_washing', 'custom',
];
const VALID_STEPS: readonly WizardStepKey[] = [
    'details', 'extras', 'schedule', 'location', 'requirements', 'invoice',
];

/** Parse a DB booking_flow JSON (may be string if MySQL returns raw text). */
function parseBookingFlow(raw: unknown): ServiceBookingFlow | undefined {
    if (raw == null) return undefined;
    let obj: unknown = raw;
    if (typeof obj === 'string') {
        try { obj = JSON.parse(obj); } catch { return undefined; }
    }
    if (!obj || typeof obj !== 'object') return undefined;
    const o = obj as Record<string, unknown>;
    const trig = typeof o.trigger === 'string' ? o.trigger.toLowerCase() : '';
    const trigger = (VALID_TRIGGERS as readonly string[]).includes(trig)
        ? (trig as ServiceTrigger)
        : 'standard';
    const rawSteps = Array.isArray(o.steps) ? o.steps : [];
    const seen = new Set<string>();
    const steps: WizardStepKey[] = [];
    for (const s of rawSteps) {
        const k = typeof s === 'string' ? s.toLowerCase() : '';
        if ((VALID_STEPS as readonly string[]).includes(k) && !seen.has(k)) {
            seen.add(k);
            steps.push(k as WizardStepKey);
        }
    }
    return { trigger, steps };
}

function normalizeServiceConfig(r: Record<string, unknown>): ServiceConfig {
    const baseRate = Number(r.baseRate);
    let callOutCharge: number | null | undefined;
    if (Object.prototype.hasOwnProperty.call(r, 'callOutCharge')) {
        const rawCo = r.callOutCharge;
        if (rawCo == null || rawCo === '') callOutCharge = null;
        else {
            const n = Number(rawCo);
            callOutCharge = Number.isFinite(n) ? n : null;
        }
    }
    const bookingFlow = parseBookingFlow(r.bookingFlow);
    const londonRateRaw = r.londonRate;
    const londonRateNum = londonRateRaw == null || londonRateRaw === '' ? NaN : Number(londonRateRaw);
    return {
        id: String(r.id ?? ''),
        name: String(r.name ?? ''),
        baseRate: Number.isFinite(baseRate) ? baseRate : 0,
        londonRate: Number.isFinite(londonRateNum) && londonRateNum > 0 ? londonRateNum : null,
        pricingModel: (r.pricingModel as ServiceConfig['pricingModel']) || 'hourly',
        minDuration: Number(r.minDuration) || 2,
        minNotice: Number(r.minNotice) || 2,
        ...(callOutCharge !== undefined ? { callOutCharge } : {}),
        description: r.description != null ? String(r.description) : '',
        features: Array.isArray(r.features) ? (r.features as string[]) : undefined,
        icon: String(r.icon ?? ''),
        active: r.active === true || r.active === 1 || r.active === 'true',
        ...(bookingFlow ? { bookingFlow } : {}),
    };
}

function normalizeExtraRow(r: Record<string, unknown>): Extra {
    const price = Number(r.price);
    return {
        id: String(r.id ?? ''),
        name: String(r.name ?? ''),
        price: Number.isFinite(price) ? price : 0,
        type: (r.type as Extra['type']) || 'fixed',
        duration: r.duration != null && r.duration !== '' ? Number(r.duration) : undefined,
        icon: r.icon != null ? String(r.icon) : undefined,
    };
}

/** WebSocket URL: VITE_WS_URL, else the API host's /ws (wss on https), else this page's host (dev proxy). */
export function getWsUrl(): string {
    const v = import.meta.env.VITE_WS_URL as string | undefined;
    if (v && String(v).trim()) return String(v).trim();
    if (/^https?:\/\//i.test(API_URL)) {
        const u = new URL(API_URL);
        return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}/ws`;
    }
    if (typeof window !== 'undefined') {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${proto}//${window.location.host}/ws`;
    }
    return 'ws://127.0.0.1:3002/ws';
}

const TOKEN_KEYS = {
    client: 'nn_client_token',
    admin: 'nn_admin_token',
    staff: 'nn_staff_token',
} as const;

export type AuthRealm = keyof typeof TOKEN_KEYS;

function parseJwtPayload(token: string): Record<string, unknown> | null {
    try {
        const part = token.split('.')[1];
        if (!part) return null;
        const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
        return JSON.parse(atob(b64 + pad));
    } catch {
        return null;
    }
}

/** Move legacy single token into the correct realm bucket (run once on load). */
export function migrateLegacyNnToken(): void {
    const legacy = localStorage.getItem('nn_token');
    if (!legacy) return;
    const payload = parseJwtPayload(legacy);
    if (!payload) {
        localStorage.removeItem('nn_token');
        return;
    }
    const role = payload.role as string | undefined;
    if (payload.isSuperadmin || role === 'admin') {
        sessionStorage.setItem(TOKEN_KEYS.admin, legacy);
    } else if (role === 'staff') {
        sessionStorage.setItem(TOKEN_KEYS.staff, legacy);
    } else {
        sessionStorage.setItem(TOKEN_KEYS.client, legacy);
    }
    localStorage.removeItem('nn_token');
}

function getToken(realm: AuthRealm): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(TOKEN_KEYS[realm]) || localStorage.getItem(TOKEN_KEYS[realm]);
}

function setToken(realm: AuthRealm, token: string): void {
    if (typeof window === 'undefined') return;
    // Session-scoped token storage reduces long-lived exposure on shared devices.
    sessionStorage.setItem(TOKEN_KEYS[realm], token);
    localStorage.removeItem(TOKEN_KEYS[realm]);
}

export function clearRealmToken(realm: AuthRealm): void {
    if (typeof window === 'undefined') return;
    sessionStorage.removeItem(TOKEN_KEYS[realm]);
    localStorage.removeItem(TOKEN_KEYS[realm]);
}

function authHeader(realm: AuthRealm): Record<string, string> {
    const t = getToken(realm);
    return t ? { Authorization: `Bearer ${t}` } : {};
}

function parseJsonErrorBody(text: string): Record<string, unknown> {
    const t = text.trim();
    if (!t.startsWith('{') && !t.startsWith('[')) return {};
    try {
        return JSON.parse(t) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function pickApiErrorMessage(parsed: Record<string, unknown>): string | undefined {
    const tryStr = (v: unknown): string | undefined => {
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number' && Number.isFinite(v)) return String(v);
        return undefined;
    };
    const fromObj = (o: unknown): string | undefined => {
        if (!o || typeof o !== 'object') return undefined;
        const m = (o as { message?: unknown }).message;
        return tryStr(m);
    };

    return (
        tryStr(parsed.message) ||
        tryStr(parsed.error) ||
        tryStr(parsed.detail) ||
        tryStr(parsed.title) ||
        fromObj(parsed.error) ||
        (Array.isArray(parsed.errors) ? fromObj(parsed.errors[0]) || tryStr(parsed.errors[0]) : undefined)
    );
}

/** Single read of response body — avoids `response.json()` throwing on empty 200 bodies (some proxies). */
const handleResponse = async (response: Response) => {
    const text = await response.text();

    if (!response.ok) {
        const parsed = parseJsonErrorBody(text);
        let msg = pickApiErrorMessage(parsed);
        if (!msg && text) {
            const trimmed = text.trim();
            if (trimmed.startsWith('<!') && trimmed.length > 0) {
                const plain = trimmed.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 220);
                if (plain) msg = `Server returned HTML (${response.status}): ${plain}`;
            } else if (!trimmed.startsWith('<!') && trimmed.length > 0 && trimmed.length < 500) {
                msg = trimmed;
            } else if (trimmed.length >= 500) {
                msg = `Server returned a non-JSON error (${response.status}). ${trimmed.slice(0, 140)}…`;
            }
        }
        if (!msg) {
            if (response.status === 401) msg = 'Invalid credentials.';
            else if (response.status === 409)
                msg =
                    'This action conflicts with existing data (duplicate slug, email, or other unique field).';
            else if (response.status === 404)
                msg =
                    'API not found. Ensure the backend is running and your host forwards /api to the API (e.g. proxy port 3002 in development).';
            else if (response.status === 502 || response.status === 503 || response.status === 504)
                msg = 'Server unavailable. Try again in a moment.';
            else if (response.status >= 500)
                msg = `Server error (${response.status}). Check the API process logs and DATABASE_URL.`;
            else msg = `Request failed (${response.status} ${response.statusText || ''})`.trim();
        }
        throw new Error(msg);
    }

    if (!text || !text.trim()) {
        return null;
    }
    try {
        return JSON.parse(text) as unknown;
    } catch {
        throw new Error(
            'Server returned a non-JSON response. Check VITE_API_URL / reverse proxy so /api reaches the Node server.',
        );
    }
};

function portalRealmLabel(realm: AuthRealm): string {
    return realm === 'admin' ? 'admin' : realm === 'staff' ? 'staff' : 'client';
}

type FetchHintOpts = { skipAuth?: boolean };

function mergeRequestHeaders(init: RequestInit | undefined, extra: Record<string, string>): Headers {
    const h = new Headers(init?.headers);
    for (const [k, v] of Object.entries(extra)) {
        if (v) h.set(k, v);
    }
    return h;
}

/** Wraps fetch so offline / CORS / DNS failures show the same helpful message as admin & staff login. */
async function fetchWithNetworkHint(
    realm: AuthRealm,
    input: RequestInfo | URL,
    init?: RequestInit,
    opts?: FetchHintOpts,
): Promise<Response> {
    const headers = mergeRequestHeaders(init, opts?.skipAuth ? {} : authHeader(realm));
    try {
        return await fetch(input, {
            ...init,
            credentials: 'include',
            headers,
        });
    } catch (e) {
        const m = e instanceof Error ? e.message : String(e);
        if (m === 'Failed to fetch' || m.includes('NetworkError')) {
            throw new Error(
                `Cannot reach the API (${portalRealmLabel(realm)} portal). Start the backend (e.g. npm run server) and ensure /api is proxied to it, or set VITE_API_URL to your API base.`
            );
        }
        throw new Error(m || 'Network error');
    }
}

function assertLoginRole(realm: AuthRealm, user: { role?: string }): void {
    const role = user?.role;
    if (realm === 'admin') {
        if (role !== 'admin') throw new Error('Administrator access only. This account is not an admin.');
    } else if (realm === 'staff') {
        if (role !== 'staff') {
            throw new Error(
                'Staff portal only: this account does not have staff access. Use admin or client sign-in, or ask an administrator to create a staff user for this email.'
            );
        }
    } else {
        if (role !== 'customer') {
            throw new Error(
                'Client portal only: this account is not a customer. Use Staff or Admin sign-in for team accounts.'
            );
        }
    }
}

function createRealmApi(realm: AuthRealm) {
    const H = () => authHeader(realm);

    return {
        login: async (email: string, password: string) => {
            clearRealmToken('client');
            clearRealmToken('admin');
            clearRealmToken('staff');
            const res = await fetchWithNetworkHint(
                realm,
                `${API_URL}/login`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password }),
                },
                { skipAuth: true },
            );
            const data = (await handleResponse(res)) as { user?: Record<string, unknown> };
            if (!data?.user) throw new Error('Login did not return a user');
            assertLoginRole(realm, data.user as { role?: string });
            return data.user as Record<string, unknown>;
        },

        logout: async () => {
            try {
                await fetchWithNetworkHint(realm, `${API_URL}/logout`, { method: 'POST' });
            } catch {
                /* ignore network errors on logout */
            }
            clearRealmToken(realm);
        },

        me: async (): Promise<UserAccount | null> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/me`, { headers: { ...H() } });
            if (res.status === 401 || res.status === 403) {
                clearRealmToken(realm);
                return null;
            }
            if (res.status === 404) return null;
            const data = await handleResponse(res);
            return sessionUserFromMeResponse(data);
        },

        getServices: async (): Promise<ServiceConfig[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/services`, { headers: { ...H() } });
            if (res.status === 401 || res.status === 403) return [];
            if (!res.ok) throw new Error('Failed to fetch services');
            const rows: unknown = await res.json();
            if (!Array.isArray(rows)) return [];
            return rows.map((r) => normalizeServiceConfig(r as Record<string, unknown>));
        },

        createService: async (serviceData: Partial<ServiceConfig>): Promise<{ id: string; message: string }> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/services`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(serviceData),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to create service');
            }
            const data = (await res.json()) as { id?: unknown; message?: string };
            return { id: String(data.id ?? ''), message: data.message ?? 'Service created' };
        },

        deleteService: async (id: string): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/services/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { ...H() } });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to delete service');
            }
        },

        updateService: async (id: string, updates: Partial<ServiceConfig>): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/services/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(updates),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to update service');
            }
        },

        getExtraServices: async (): Promise<Extra[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/extra-services`, { headers: { ...H() } });
            if (res.status === 401 || res.status === 403) return [];
            if (!res.ok) throw new Error('Failed to fetch extra services');
            const rows: unknown = await res.json();
            if (!Array.isArray(rows)) return [];
            return rows.map((r) => normalizeExtraRow(r as Record<string, unknown>));
        },

        addExtraService: async (extra: Partial<Extra>): Promise<{ id: string; message: string }> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/extra-services`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(extra),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to create extra service');
            }
            const data = (await res.json()) as { id?: unknown; message?: string };
            return { id: String(data.id ?? ''), message: data.message ?? 'Extra service created' };
        },

        deleteExtraService: async (id: string): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/extra-services/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { ...H() } });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to delete extra service');
            }
        },

        updateExtraService: async (id: string, updates: Partial<Extra>): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/extra-services/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(updates),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to update extra service');
            }
        },

        createBooking: async (
            booking: Partial<Booking> & { depositTermsAccepted?: boolean },
        ): Promise<{
            id: number;
            bookingId?: string | null;
            message: string;
            depositTermsAcceptedAt?: string;
            conflictWarning?: { conflictCount: number; conflictingBookingIds: string[]; message: string };
        }> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(booking),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const msg =
                    (err as { error?: string }).error ||
                    (err as { details?: string }).details ||
                    'Failed to create booking';
                throw new Error(msg);
            }
            return res.json();
        },

        updateBooking: async (
            id: string | number,
            updates: Partial<Booking> & {
                forceScheduleOverlap?: boolean;
                shortNoticeConsent?: boolean;
                /** Client-only: records `depositTermsAcceptedAt` when sent alone. */
                depositTermsAcknowledged?: boolean;
                /** Client-only: replace fee payment evidence; must be sent alone. */
                paymentFeeEvidence?: PaymentFeeEvidencePayload;
            },
        ): Promise<{ message?: string; depositTermsAcceptedAt?: string; paymentFeeEvidence?: PaymentFeeEvidencePayload }> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${encodeURIComponent(String(id))}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(updates),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                const msg = (err as { error?: string }).error || 'Failed to update booking';
                throw new Error(msg);
            }
            return (await res.json().catch(() => ({}))) as { message?: string; depositTermsAcceptedAt?: string };
        },

        requestStaffCancellation: async (id: string | number, reason?: string): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${encodeURIComponent(String(id))}/staff-cancel-request`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify({ reason: reason ?? '' }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to submit cancellation request');
            }
        },

        getBookingTracking: async (id: string | number): Promise<BookingTracking> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${encodeURIComponent(String(id))}/tracking`, {
                headers: { ...H() },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to load tracking');
            }
            return res.json();
        },

        startTravel: async (
            id: string | number,
            body: { lat?: number; lng?: number; silent?: boolean } = {},
        ): Promise<{ enRouteAt: string }> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/staff/jobs/${encodeURIComponent(String(id))}/en-route`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to start travel');
            }
            return res.json();
        },

        /** Clock-in on site: the client is told their cleaner has arrived (once). */
        markArrived: async (id: string | number, coords: { lat?: number; lng?: number } = {}): Promise<{ arrivedAt: string }> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/staff/jobs/${encodeURIComponent(String(id))}/arrived`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(coords),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to record arrival');
            }
            return res.json();
        },

        updateLocation: async (id: string | number, coords: { lat: number; lng: number }): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/staff/jobs/${encodeURIComponent(String(id))}/location`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(coords),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to update location');
            }
        },

        sendRunningLate: async (
            id: string | number,
            body: {
                reason: string;
                etaTime?: string;
                minutesLate?: number;
                note?: string;
                notifyClient: boolean;
                notifyAdmin: boolean;
            },
        ): Promise<{ notice: LateNotice }> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/staff/jobs/${encodeURIComponent(String(id))}/running-late`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to send running-late notice');
            }
            return res.json();
        },

        getBookings: async (): Promise<Booking[]> => {
            const PAGE_SIZE = 50;
            let page = 1;
            let allBookings: Booking[] = [];
            let totalCount: number | null = null;

            while (true) {
                const url = `${API_URL}/bookings?page=${page}&limit=${PAGE_SIZE}`;
                const res = await fetchWithNetworkHint(realm, url, { headers: { ...H() } });
                if (res.status === 401 || res.status === 403) return [];
                if (!res.ok) throw new Error('Failed to fetch bookings');

                // Read total from header on first page
                if (page === 1) {
                    const total = res.headers.get('X-Total-Count');
                    totalCount = total !== null ? parseInt(total, 10) : null;
                }

                const rows: unknown = await res.json();
                const pageRows = Array.isArray(rows) ? (rows as Booking[]) : [];
                allBookings = allBookings.concat(pageRows);

                // Stop when we've fetched all pages or received an empty/short page
                if (pageRows.length < PAGE_SIZE) break;
                if (totalCount !== null && allBookings.length >= totalCount) break;
                page++;
            }

            return allBookings;
        },

        getReviews: async (params?: { page?: number; limit?: number; rating?: number; sort?: string }): Promise<{
            reviews: Array<{
                id: number;
                bookingId: string | null;
                customerName: string;
                serviceType: string;
                date: string;
                rating: number;
                feedback: string | null;
                staffNames: string[];
            }>;
            total: number;
            page: number;
            limit: number;
            avgRating: number | null;
            distribution: Record<number, number>;
        }> => {
            const qs = new URLSearchParams();
            if (params?.page) qs.set('page', String(params.page));
            if (params?.limit) qs.set('limit', String(params.limit));
            if (params?.rating) qs.set('rating', String(params.rating));
            if (params?.sort) qs.set('sort', params.sort);
            const res = await fetchWithNetworkHint(realm, `${API_URL}/reviews?${qs}`, { headers: { ...H() } });
            if (res.status === 401 || res.status === 403) return { reviews: [], total: 0, page: 1, limit: 20, avgRating: null, distribution: {} };
            if (!res.ok) throw new Error('Failed to fetch reviews');
            const data = await res.json();
            return data as any;
        },

        getStaff: async (): Promise<Staff[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/staff`, { headers: { ...H() } });
            if (res.status === 401 || res.status === 403) return [];
            if (!res.ok) throw new Error('Failed to fetch staff');
            const rows: unknown = await res.json();
            return Array.isArray(rows) ? (rows as Staff[]) : [];
        },

        forgotPassword: async (email: string): Promise<unknown> => {
            const res = await fetchWithNetworkHint(
                realm,
                `${API_URL}/forgot-password`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                },
                { skipAuth: true },
            );
            return handleResponse(res);
        },

        resetPassword: async (token: string, newPassword: string): Promise<unknown> => {
            const res = await fetchWithNetworkHint(
                realm,
                `${API_URL}/reset-password`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ token, newPassword }),
                },
                { skipAuth: true },
            );
            return handleResponse(res);
        },

        completeJob: async (id: number, data: unknown): Promise<unknown> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${id}/complete`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to complete job');
            return res.json();
        },

        getBusinessSettings: async (): Promise<unknown> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/business-settings`, undefined, { skipAuth: true });
            if (!res.ok) throw new Error('Failed to fetch settings');
            return res.json();
        },

        updateBusinessSettings: async (settings: unknown): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/business-settings`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(settings),
            });
            if (!res.ok) {
                const errBody = await res.json().catch(() => ({}));
                const msg =
                    typeof (errBody as { error?: unknown }).error === 'string'
                        ? (errBody as { error: string }).error
                        : `Failed to update settings (${res.status})`;
                throw new Error(msg);
            }
        },

        getGallery: async (): Promise<GalleryItem[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/gallery`, undefined, { skipAuth: true });
            return handleResponse(res) as Promise<GalleryItem[]>;
        },

        getGalleryAdmin: async (): Promise<GalleryItem[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/gallery`, { headers: { ...H() } });
            return handleResponse(res) as Promise<GalleryItem[]>;
        },

        createGalleryItem: async (data: Partial<GalleryItem>): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/gallery`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data),
            });
            await handleResponse(res);
        },

        updateGalleryItem: async (id: number, data: Partial<GalleryItem>): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/gallery/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data),
            });
            await handleResponse(res);
        },

        deleteGalleryItem: async (id: number): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/gallery/${id}`, {
                method: 'DELETE',
                headers: { ...H() },
            });
            await handleResponse(res);
        },

        getBlogPosts: async (): Promise<BlogPost[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/blog-posts`, undefined, { skipAuth: true });
            if (!res.ok) throw new Error('Failed to load blog posts');
            return res.json();
        },

        getBlogPostBySlug: async (slug: string): Promise<BlogPost> => {
            const res = await fetchWithNetworkHint(
                realm,
                `${API_URL}/blog-posts/${encodeURIComponent(slug)}`,
                undefined,
                { skipAuth: true },
            );
            if (!res.ok) throw new Error('Failed to load post');
            return res.json();
        },

        getBlogPostsAdmin: async (): Promise<BlogPost[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/blog-posts`, { headers: { ...H() } });
            return handleResponse(res) as Promise<BlogPost[]>;
        },

        createBlogPost: async (data: Partial<BlogPost> & { bodyHtml: string; title: string }): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/blog-posts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data),
            });
            await handleResponse(res);
        },

        updateBlogPost: async (id: number, data: Partial<BlogPost>): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/blog-posts/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data),
            });
            await handleResponse(res);
        },

        deleteBlogPost: async (id: number): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/blog-posts/${id}`, {
                method: 'DELETE',
                headers: { ...H() },
            });
            await handleResponse(res);
        },

        getBookingChat: async (bookingId: string) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${bookingId}/chat`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch chat');
            return res.json();
        },

        sendBookingChat: async (bookingId: string, text: string) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${bookingId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify({ text }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to send chat message');
            }
            return res.json();
        },

        closeBookingChat: async (bookingId: string) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${bookingId}/chat/close`, {
                method: 'POST',
                headers: { ...H() },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to close chat');
            }
            return res.json();
        },

        reopenBookingChat: async (bookingId: string) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${bookingId}/chat/reopen`, {
                method: 'POST',
                headers: { ...H() },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to reopen chat');
            }
            return res.json();
        },

        getDirectMessages: async () => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/direct-messages`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch direct messages');
            return res.json();
        },

        sendDirectMessage: async (text: string, recipientUserId?: number) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/direct-messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify({ text, recipientUserId }),
            });
            if (!res.ok) throw new Error('Failed to send message');
            return res.json();
        },

        markDirectMessagesRead: async () => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/direct-messages/read`, {
                method: 'PUT',
                headers: { ...H() },
            });
            if (!res.ok) throw new Error('Failed to mark messages read');
            return res.json();
        },

        getChatSummaries: async (): Promise<ChatSummary[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/chat-summaries`, { headers: { ...H() } });
            if (res.status === 401 || res.status === 403) return [];
            if (!res.ok) throw new Error('Failed to load chat summaries');
            return res.json();
        },

        getEmailTemplates: async (): Promise<unknown[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/email-templates`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch templates');
            return res.json();
        },

        updateEmailTemplate: async (id: number, template: unknown): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/email-templates/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(template),
            });
            if (!res.ok) throw new Error('Failed to update template');
        },

        getSmsTemplates: async (): Promise<unknown[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/sms-templates`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch sms templates');
            return res.json();
        },

        updateSmsTemplate: async (id: number, template: unknown): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/sms-templates/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(template),
            });
            if (!res.ok) throw new Error('Failed to update sms template');
        },

        createStaff: async (staffData: unknown): Promise<{ message: string; credentials?: { email: string; password: string; role: string } }> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/staff`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(staffData),
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error((errorData as { error?: string }).error || 'Failed to create staff');
            }
            return res.json();
        },

        updateStaff: async (id: number | string, staffData: unknown): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/staff/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(staffData),
            });
            if (!res.ok) {
                const errorData = await res.json().catch(() => ({}));
                throw new Error((errorData as { error?: string }).error || 'Failed to update staff');
            }
        },

        deleteStaff: async (id: number | string): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/staff/${id}`, { method: 'DELETE', headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to delete staff');
        },

        getNotifications: async (_userId: number) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/notifications`, { headers: { ...H() } });
            if (res.status === 401 || res.status === 403) return [];
            if (!res.ok) throw new Error('Failed to fetch notifications');
            const rows: unknown = await res.json();
            return Array.isArray(rows) ? rows : [];
        },

        markNotificationRead: async (id: number) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/notifications/${id}/read`, {
                method: 'POST',
                headers: { ...H() },
            });
            if (!res.ok) throw new Error('Failed to mark read');
            return res.json();
        },

        deleteNotification: async (id: number) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/notifications/${id}`, {
                method: 'DELETE',
                headers: { ...H() },
            });
            if (!res.ok) throw new Error('Failed to delete notification');
            return res.json();
        },

        getStaffCancelRequests: async (): Promise<Array<Record<string, unknown>>> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/staff-cancel-requests`, { headers: { ...H() } });
            if (res.status === 401 || res.status === 403) return [];
            if (!res.ok) throw new Error('Failed to fetch cancellation requests');
            const data = await res.json();
            return Array.isArray(data) ? data : [];
        },

        respondStaffCancelRequest: async (requestId: number, decision: 'approve' | 'reject', adminNote?: string): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/staff-cancel-requests/${requestId}/respond`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify({ decision, adminNote: adminNote ?? '' }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to respond to request');
            }
        },

        sendBulkEmail: async (data: unknown) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/broadcast/email`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to send email');
            return res.json();
        },

        sendBulkNotification: async (data: unknown) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/broadcast/notification`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to send notification');
            return res.json();
        },

        /** Upload image for broadcast HTML; returns public `url` for `<img src="…">`. */
        uploadBroadcastEmailImage: async (dataUrl: string): Promise<{ path: string; url: string }> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/broadcast/email-image`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify({ dataUrl }),
            });
            return handleAdminJson(res, 'Failed to upload image');
        },

        sendInvoice: async (bookingId: string) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${bookingId}/invoice`, {
                method: 'POST',
                headers: { ...H() },
            });
            if (!res.ok) throw new Error('Failed to send invoice');
            return res.json();
        },

        sendBookingConfirmation: async (bookingId: string, data?: { adminNote?: string; stripePaymentLink?: string }) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${bookingId}/send-confirmation`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data || {}),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to send confirmation email');
            }
            return res.json();
        },

        createBookingPaymentIntent: async (bookingId: string | number, fullPayment?: boolean) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${bookingId}/create-payment-intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify({ fullPayment: !!fullPayment }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to create booking payment link');
            }
            return res.json() as Promise<{ clientSecret?: string; paymentIntentId?: string; payUrl?: string; alreadyPaid?: boolean; depositAmount?: number; depositPercent?: number }>;
        },

        sendReminder: async (bookingId: string, customMessage?: string) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/bookings/${bookingId}/reminder`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify({ customMessage }),
            });
            if (!res.ok) throw new Error('Failed to send reminder');
            return res.json();
        },

        validateDiscount: async (code: string) => {
            const res = await fetchWithNetworkHint(
                realm,
                `${API_URL}/validate-discount`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ code }),
                },
                { skipAuth: true },
            );
            if (!res.ok) {
                const err = await res.json();
                throw new Error((err as { message?: string }).message || 'Invalid code');
            }
            return res.json();
        },

        getDiscounts: async () => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/discounts`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch discounts');
            return res.json();
        },

        createDiscount: async (data: unknown) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/discounts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || `Failed to create discount (${res.status})`);
            }
            return res.json();
        },

        deleteDiscount: async (id: string) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/discounts/${id}`, {
                method: 'DELETE',
                headers: { ...H() },
            });
            if (!res.ok) throw new Error('Failed to delete discount');
        },

        getWeeklyInvoice: async (staffId: number) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/staff/${staffId}/weekly-invoice`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch invoice data');
            return res.json();
        },

        submitWeeklyInvoice: async (staffId: number, data: unknown) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/staff/${staffId}/invoice`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to submit invoice');
            return res.json();
        },

        getStaffInvoiceHistory: async (staffId: number) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/staff/${staffId}/invoices-history`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch invoice history');
            const rows: unknown = await res.json();
            return Array.isArray(rows) ? rows : [];
        },

        getAllInvoices: async () => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/invoices`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch invoices');
            return res.json();
        },

        updateInvoiceStatus: async (id: number, status: 'Approved' | 'Rejected', notes?: string) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/invoices/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify({ status, adminNotes: notes }),
            });
            if (!res.ok) throw new Error('Failed to update invoice status');
        },
        /** Add or change the admin note on a staff invoice without changing its status. */
        updateStaffInvoiceNote: async (id: number, notes: string) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/invoices/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify({ adminNotes: notes }),
            });
            if (!res.ok) throw new Error('Failed to save the note');
        },
        deleteStaffInvoice: async (id: number) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/invoices/${id}`, {
                method: 'DELETE',
                headers: { ...H() },
            });
            if (!res.ok) throw new Error('Failed to delete the staff invoice');
        },
        // ── Customer Invoices ──
        getCustomerInvoices: async () => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/customer-invoices`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch customer invoices');
            return res.json();
        },
        createCustomerInvoice: async (data: any) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/customer-invoices`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to create invoice');
            return res.json();
        },
        updateCustomerInvoice: async (id: number, data: any) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/customer-invoices/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(data),
            });
            if (!res.ok) throw new Error('Failed to update invoice');
            return res.json();
        },
        deleteCustomerInvoice: async (id: number) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/customer-invoices/${id}`, {
                method: 'DELETE',
                headers: { ...H() },
            });
            if (!res.ok) throw new Error('Failed to delete invoice');
        },
        getMyInvoices: async () => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/my-invoices`, { headers: { ...H() } });
            if (res.status === 401 || res.status === 403) return [];
            if (!res.ok) throw new Error('Failed to fetch invoices');
            return res.json();
        },
        previewCustomerInvoice: async (id: number): Promise<string> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/customer-invoices/${id}/preview`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to load preview');
            return res.text();
        },
        createPaymentIntent: async (id: number) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/customer-invoices/${id}/create-payment-intent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to create payment link');
            }
            return res.json() as Promise<{ clientSecret?: string; paymentIntentId?: string; payUrl?: string; alreadyPaid?: boolean }>;
        },
        sendCustomerInvoice: async (id: number, via: 'email' | 'sms' | 'both') => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/customer-invoices/${id}/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify({ via }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to send invoice');
            }
            return res.json();
        },
        createInvoiceFromBooking: async (bookingId: number) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/customer-invoices/from-booking/${bookingId}`, {
                method: 'POST',
                headers: { ...H() },
            });
            if (!res.ok) throw new Error('Failed to create invoice from booking');
            return res.json();
        },

        getAdminAccounts: async (): Promise<Array<{ id: number; name: string; email: string; role: string; adminTabs?: string[]; createdAt?: string }>> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/accounts`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch admin accounts');
            const rows: unknown = await res.json();
            return Array.isArray(rows) ? (rows as Array<{ id: number; name: string; email: string; role: string; adminTabs?: string[]; createdAt?: string }>) : [];
        },
        updateAdminMenuScope: async (id: number | string, adminTabs: string[]): Promise<void> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/accounts/${encodeURIComponent(String(id))}/menu-scope`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify({ adminTabs }),
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error((err as { error?: string }).error || 'Failed to update admin menu scope');
            }
        },

        getReferrals: async (): Promise<Referral[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/referrals`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch referrals');
            const rows: unknown = await res.json();
            return Array.isArray(rows) ? (rows as Referral[]) : [];
        },

        getLoyaltyOverview: async (): Promise<{
            totalCustomers: number;
            customersWithPoints: number;
            totalPoints: number;
            topCustomers: Array<{ id: number; name: string; email: string; loyaltyPoints: number; referralCode?: string }>;
            topReferrers: Array<{ id: number; name: string; role: string; referrals: number }>;
        }> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/admin/loyalty-overview`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch loyalty overview');
            return res.json();
        },

        getUserReferrals: async (userId: string | number, type: 'staff' | 'customer'): Promise<Referral[]> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/referrals?userId=${userId}&type=${type}`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch user referrals');
            const rows: unknown = await res.json();
            return Array.isArray(rows) ? (rows as Referral[]) : [];
        },

        updateReferral: async (id: string, updates: { rewardAmount?: number; status?: string }) => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/referrals/${encodeURIComponent(id)}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(updates),
            });
            if (!res.ok) throw new Error('Failed to update referral');
            return res.json();
        },

        getMe: async (id: number): Promise<unknown> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/users/${id}`, { headers: { ...H() } });
            if (!res.ok) throw new Error('Failed to fetch user');
            return res.json();
        },
        updateProfile: async (
            id: number | string,
            updates: {
                name?: string;
                email?: string;
                phone?: string | null;
                address?: string | null;
                postcode?: string | null;
                password?: string;
                currentPassword?: string;
            },
        ): Promise<unknown> => {
            const res = await fetchWithNetworkHint(realm, `${API_URL}/users/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', ...H() },
                body: JSON.stringify(updates),
            });
            return handleResponse(res);
        },
    };
}

if (typeof window !== 'undefined') {
    migrateLegacyNnToken();
}

export const apiClient = {
    ...createRealmApi('client'),
    register: async (userData: unknown) => {
        const res = await fetchWithNetworkHint(
            'client',
            `${API_URL}/register`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData),
            },
            { skipAuth: true },
        );
        return handleResponse(res);
    },
    submitContactInquiry: async (payload: {
        name: string;
        email: string;
        serviceType?: string;
        message: string;
    }): Promise<{ ok: true; message?: string }> => {
        const res = await fetchWithNetworkHint(
            'client',
            `${API_URL}/contact`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            },
            { skipAuth: true },
        );
        if (!res.ok) {
            let errMsg = 'Unable to send your message right now.';
            try {
                const parsed = await res.json();
                if (parsed && typeof parsed.error === 'string') errMsg = parsed.error;
            } catch {
                /* non-JSON body */
            }
            throw new Error(errMsg);
        }
        return res.json();
    },
};

const adminRealmApi = createRealmApi('admin');

export interface BrevoSettingsPublic {
    apiKey: string;
    senderEmail: string;
    senderName: string;
    smsSender: string;
    smtpHost: string;
    smtpPort: string;
    smtpUser: string;
    smtpPassword: string;
    apiKeyMasked: string;
    smtpPasswordMasked: string;
    hasApiKey: boolean;
    hasSmtpPassword: boolean;
}

export type BrevoSettingsPatch = Partial<Pick<
    BrevoSettingsPublic,
    'apiKey' | 'senderEmail' | 'senderName' | 'smsSender' | 'smtpHost' | 'smtpPort' | 'smtpUser' | 'smtpPassword'
>>;

async function handleAdminJson<T>(res: Response, fallbackMsg: string): Promise<T> {
    if (!res.ok) {
        let message = fallbackMsg;
        try {
            const parsed = (await res.json()) as Record<string, unknown>;
            if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) message = parsed.error.trim();
            else if (parsed && typeof parsed.message === 'string' && parsed.message.trim()) message = parsed.message.trim();
        } catch {
            /* non-JSON body */
        }
        throw new Error(message);
    }
    return res.json() as Promise<T>;
}

export const apiAdmin = {
    ...adminRealmApi,
    getBrevoSettings: async (): Promise<BrevoSettingsPublic> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/brevo-settings`, {
            headers: { ...authHeader('admin') },
        });
        return handleAdminJson<BrevoSettingsPublic>(res, 'Failed to load Brevo settings');
    },
    updateBrevoSettings: async (patch: BrevoSettingsPatch): Promise<BrevoSettingsPublic> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/brevo-settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeader('admin') },
            body: JSON.stringify(patch),
        });
        const data = await handleAdminJson<{ ok: true; settings: BrevoSettingsPublic }>(res, 'Failed to save Brevo settings');
        return data.settings;
    },
    clearBrevoSettings: async (): Promise<BrevoSettingsPublic> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/brevo-settings`, {
            method: 'DELETE',
            headers: { ...authHeader('admin') },
        });
        const data = await handleAdminJson<{ ok: true; settings: BrevoSettingsPublic }>(res, 'Failed to disconnect Brevo');
        return data.settings;
    },
    sendBrevoTestEmail: async (to?: string): Promise<{ ok: true; to: string }> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/brevo-settings/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('admin') },
            body: JSON.stringify(to ? { to } : {}),
        });
        return handleAdminJson<{ ok: true; to: string }>(res, 'Brevo test email failed');
    },

    getBookingReminderSettings: async (): Promise<{
        masterEnabled: boolean;
        send48h: boolean;
        send24h: boolean;
        notifyAdmin: boolean;
        notifyStaff: boolean;
    }> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/booking-reminder-settings`, {
            headers: { ...authHeader('admin') },
        });
        return handleAdminJson(res, 'Failed to load booking reminder settings');
    },

    updateBookingReminderSettings: async (body: {
        masterEnabled?: boolean;
        send48h?: boolean;
        send24h?: boolean;
        notifyAdmin?: boolean;
        notifyStaff?: boolean;
    }) => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/booking-reminder-settings`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeader('admin') },
            body: JSON.stringify(body),
        });
        return handleAdminJson(res, 'Failed to save booking reminder settings');
    },

    getBookingReminderLog: async (limit = 80): Promise<
        Array<{ id: number; bookingId: string; windowLabel: string; channels: string; createdAt?: string | null }>
    > => {
        const res = await fetchWithNetworkHint(
            'admin',
            `${API_URL}/admin/booking-reminder-log?limit=${encodeURIComponent(String(limit))}`,
            { headers: { ...authHeader('admin') } },
        );
        return handleAdminJson(res, 'Failed to load reminder log');
    },

    deleteBookingReminderLogRow: async (id: number): Promise<void> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/booking-reminder-log/${id}`, {
            method: 'DELETE',
            headers: { ...authHeader('admin') },
        });
        await handleAdminJson(res, 'Failed to delete log row');
    },

    resetBookingAutomaticReminders: async (bookingId: string): Promise<void> => {
        const res = await fetchWithNetworkHint(
            'admin',
            `${API_URL}/admin/bookings/${encodeURIComponent(bookingId)}/automatic-reminders/reset`,
            { method: 'POST', headers: { ...authHeader('admin') } },
        );
        await handleAdminJson(res, 'Failed to reset automatic reminders');
    },

    runBookingRemindersNow: async (): Promise<{ scanned: number; sent48: number; sent24: number }> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/booking-reminders/run`, {
            method: 'POST',
            headers: { ...authHeader('admin') },
        });
        return handleAdminJson(res, 'Failed to run reminders');
    },

    getStaffAssessments: async (staffId: number): Promise<StaffAssessment[]> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/staff/${staffId}/assessments`, {
            headers: { ...authHeader('admin') },
        });
        return handleAdminJson(res, 'Failed to load assessments');
    },

    createStaffAssessment: async (
        staffId: number,
        body: {
            rating: number;
            punctuality?: number | null;
            quality?: number | null;
            professionalism?: number | null;
            remark: string;
            bookingId?: number | null;
        },
    ): Promise<{ id: number }> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/staff/${staffId}/assessments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('admin') },
            body: JSON.stringify(body),
        });
        return handleAdminJson(res, 'Failed to save assessment');
    },

    deleteStaffAssessment: async (id: number): Promise<void> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/staff-assessments/${id}`, {
            method: 'DELETE',
            headers: { ...authHeader('admin') },
        });
        await handleAdminJson(res, 'Failed to delete assessment');
    },

    getQuoteLeads: async (): Promise<QuoteLead[]> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/quote-leads`, {
            headers: { ...authHeader('admin') },
        });
        return handleAdminJson(res, 'Failed to load quote requests');
    },

    updateQuoteLead: async (id: number, body: { status?: QuoteLeadStatus; adminNotes?: string }): Promise<void> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/quote-leads/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...authHeader('admin') },
            body: JSON.stringify(body),
        });
        await handleAdminJson(res, 'Failed to update quote request');
    },

    deleteQuoteLead: async (id: number): Promise<void> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/quote-leads/${id}`, {
            method: 'DELETE',
            headers: { ...authHeader('admin') },
        });
        await handleAdminJson(res, 'Failed to delete quote request');
    },

    getLiveTracking: async (): Promise<BookingTracking[]> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/live-tracking`, {
            headers: { ...authHeader('admin') },
        });
        return handleAdminJson(res, 'Failed to load live tracking');
    },

    nudgeStaff: async (bookingId: string | number): Promise<{ notified: number }> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/admin/jobs/${encodeURIComponent(String(bookingId))}/nudge-staff`, {
            method: 'POST',
            headers: { ...authHeader('admin') },
        });
        return handleAdminJson(res, 'Failed to notify cleaner');
    },

    getExpenses: async (): Promise<any[]> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/expenses`, { headers: { ...authHeader('admin') } });
        return handleAdminJson(res, 'Failed to fetch expenses');
    },
    createExpense: async (data: { title: string; amount: string; category: string; purpose?: string; receiptUrl?: string; expenseDate: string }): Promise<any> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/expenses`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader('admin') },
            body: JSON.stringify(data),
        });
        return handleAdminJson(res, 'Failed to create expense');
    },
    updateExpense: async (id: number, data: Record<string, any>): Promise<any> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/expenses/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeader('admin') },
            body: JSON.stringify(data),
        });
        return handleAdminJson(res, 'Failed to update expense');
    },
    deleteExpense: async (id: number): Promise<any> => {
        const res = await fetchWithNetworkHint('admin', `${API_URL}/expenses/${id}`, {
            method: 'DELETE',
            headers: { ...authHeader('admin') },
        });
        return handleAdminJson(res, 'Failed to delete expense');
    },
};
export const apiStaff = createRealmApi('staff');

/** @deprecated Use apiClient / apiAdmin / apiStaff */
export const api = apiClient;
