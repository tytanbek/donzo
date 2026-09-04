import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

// Ishonchli zaxira backend — agar env'da pishirilgan URL o'lik bo'lsa (masalan
// Vercel production hali eski trycloudflare tunnelga ishora qilsa), barcha
// so'rovlar avtomatik shu Render manziliga o'tadi va ishlagan base
// localStorage'da saqlanadi (keyingi ochilishlar darhol to'g'ri joyga boradi).
const FALLBACK_BASE = 'https://donzo-backend.onrender.com/api/v1';

function effectiveBase(): string {
  if (typeof window !== 'undefined') {
    const cached = localStorage.getItem('api_base');
    if (cached === API_BASE || cached === FALLBACK_BASE) return cached;
  }
  return API_BASE;
}

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
  // Public tunnels (trycloudflare) can take 20-60s to route the first request
  // (cold routing) — use a generous timeout so the first attempt usually succeeds.
  timeout: 90000,
});

// ── Read-only GET cache (in-memory) ──
// The catalogue endpoints (services, categories, banners) barely change and
// are fetched on EVERY page mount (home, header search, detail...). Through a
// public tunnel each fetch is a round-trip, so repeat loads feel slow. We
// cache successful GET responses for a short TTL: instant back/forward and
// tab-switch navigation, still fresh enough for catalogue data.
//
// Only safe for PUBLIC read-only endpoints. Authenticated/user-specific data
// (profile, orders, balance) is NEVER cached.
const GET_CACHE_TTL_MS = 30_000; // 30s
const CACHEABLE_PREFIXES = ['/services', '/categories', '/banners', '/payments/providers'];
const getCache: Map<string, { ts: number; data: any }> = new Map();

function isCacheable(url?: string): boolean {
  if (!url) return false;
  return CACHEABLE_PREFIXES.some((p) => url.startsWith(p));
}

function cacheKey(url: string | undefined, params: any): string {
  return (url || '') + '?' + JSON.stringify(params || {});
}

// Attach JWT token to requests + serve public GETs from the in-memory cache
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    // Har so'rovda joriy (ishlayotgan) base URL ishlatiladi.
    config.baseURL = effectiveBase();
  }
  const method = String(config.method || '').toLowerCase();
  if (method === 'get' && isCacheable(config.url)) {
    const key = cacheKey(config.url, config.params);
    const hit = getCache.get(key);
    if (hit && Date.now() - hit.ts < GET_CACHE_TTL_MS) {
      // Return a synthetic success response so the caller sees the cached data
      return Promise.reject({ __fromCache: true, __data: hit.data, config });
    }
  }
  return config;
});

// Retry transient network failures (public trycloudflare tunnels occasionally
// drop the first request — "cold routing"). Retries make the UI resilient so
// users don't see 'Ma'lumotlarni yuklashda xatolik' for a single dropped packet.
// Delays are SHORT (200ms base, geometric) so a dropped request costs ~0.4s,
// not seconds — the tunnel cold-routing retry is the common case and must not
// make the UI feel slow.
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 200;

function shouldRetry(error: any): boolean {
  // Never retry intentionally-cancelled requests
  if (axios.isCancel(error)) return false;
  // Network error (no response), timeout, or 5xx → safe to retry
  if (error.code === 'ECONNABORTED' || !error.response) return true;
  return error.response?.status >= 500;
}

// Only idempotent methods are safe to retry: GET/PUT/DELETE. POST and PATCH are
// excluded to avoid double-submits (orders, payments, status updates) — EXCEPT
// the login endpoints (fragment-login / demo-login), which are idempotent
// (get_or_create + fresh tokens, nothing is charged) and MUST be retried
// because the public tunnel routinely drops the very first request (cold
// routing) and the Fragment API is flaky.
function isRetryableMethod(method?: string, url?: string): boolean {
  const m = String(method || '').toLowerCase();
  if (m === 'post' && url && (url.includes('/auth/fragment-login/') || url.includes('/auth/demo-login/'))) return true;
  return !['post', 'patch'].includes(m);
}

// Handle token refresh + retry
api.interceptors.response.use(
  (response) => {
    const method = String(response.config?.method || '').toLowerCase();
    // Katalog ma'lumotlari faqat admin mutatsiyalarida o'zgaradi (/admin/...)
    // — login, buyurtma kabi POST'lar cache'ni keraksiz tushirmasin. Faqat
    // admin yozuvlarida to'liq invalidatsiya qilamiz (TTL ham himoya qiladi).
    if (method !== 'get') {
      if ((response.config?.url || '').startsWith('/admin/')) {
        getCache.clear();
      }
      return response;
    }
    // Cache successful public GETs so repeat loads are instant
    if (isCacheable(response.config?.url)) {
      const key = cacheKey(response.config.url, response.config.params);
      getCache.set(key, { ts: Date.now(), data: response.data });
    }
    return response;
  },
  async (error) => {
    // Synthetic cache hit produced by the request interceptor → resolve it
    // as a normal 200 response so callers never see a rejection.
    if (error?.__fromCache) {
      return { data: error.__data, status: 200, statusText: 'OK', headers: {}, config: error.config };
    }

    const originalRequest = error.config as any;

    // ── BASE-URL FALLBACK ──
    // Vercel production'da NEXT_PUBLIC_API_URL eski o'lik tunnelga pishirilgan
    // bo'lishi mumkin (trycloudflare). Asosiy URL tarmoq xatosi (no response /
    // timeout) berib, hali fallback sinab ko'rilmagan bo'lsa — xuddi shu so'rovni
    // Render manziliga qayta yuboramiz va ishlaganini localStorage'da saqlaymiz.
    // Keyingi barcha so'rovlar to'g'ridan-to'g'ri ishlayotgan base'ga boradi.
    if (
      originalRequest &&
      shouldRetry(error) &&
      originalRequest.baseURL !== FALLBACK_BASE &&
      !originalRequest._fallbackTried
    ) {
      originalRequest._fallbackTried = true;
      originalRequest.baseURL = FALLBACK_BASE;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('api_base', FALLBACK_BASE);
        } catch (e) { /* localStorage o'chirilgan bo'lishi mumkin */ }
      }
      return api(originalRequest);
    }

    // Transient retry with a real counter (up to MAX_RETRIES), exponential-ish backoff
    const retryCount = originalRequest?._retryCount || 0;
    if (
      originalRequest &&
      retryCount < MAX_RETRIES &&
      shouldRetry(error) &&
      isRetryableMethod(originalRequest.method, originalRequest.url)
    ) {
      originalRequest._retryCount = retryCount + 1;
      // Geometric backoff: 200ms, 400ms, 800ms → worst case ~1.4s across
      // 3 retries (was ~4.8s before). Fast enough to feel instant, still
      // patient enough for tunnel cold-routing.
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * 2 ** (retryCount)));
      return api(originalRequest);
    }

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      // Capture the EXACT token this request was attempted with. On refresh
      // failure we only wipe it if it is STILL the current one — a parallel
      // flow (TelegramAutoLogin's silent re-login) may have already replaced
      // it with a fresh token, and wiping that would log the user right back
      // out after a successful auto-login.
      const attemptedToken = localStorage.getItem('access_token');
      try {
        const refresh = localStorage.getItem('refresh_token');
        if (refresh) {
          const res = await axios.post(`${effectiveBase()}/auth/token/refresh/`, { refresh });
          localStorage.setItem('access_token', res.data.access);
          // JWT rotation: backend blacklists the old refresh token and returns
          // a NEW one — it MUST be saved or the user gets logged out next refresh.
          if (res.data.refresh) {
            localStorage.setItem('refresh_token', res.data.refresh);
          }
          originalRequest.headers.Authorization = `Bearer ${res.data.access}`;
          return api(originalRequest);
        }
      } catch (e) {          // Wipe only when the token is still the one we attempted with.
          if (attemptedToken && localStorage.getItem('access_token') === attemptedToken) {
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            // DEMO MODE: layout avtomatik demo-login qiladi — sahifani qayta
            // yuklash kifoya.
            window.location.reload();
          }
      }
    }
    return Promise.reject(error);
  }
);

// Auth — FRAGMENT LOGIN: web app ochilganda foydalanuvchi Telegram
// username'ini kiritadi → backend Fragment API (getInfo) orqali jonli
// ma'lumotni oladi, user id ga biriktiradi va JWT qaytaradi. Keyingi
// ochilishlarda token saqlanadi — profil avtomatik yuklanadi.
export const authAPI = {
  // telegramUsername: Telegram WebApp initDataUnsafe'dagi JORIY akkaunt
  // username'i — backend kiritilgan username bilan mosligini tekshiradi
  // (mos kelmasa 403: boshqa birovning username'i bilan kirish mumkin emas).
  fragmentLogin: (username: string, telegramUsername?: string, telegramId?: string) =>
    api.post('/auth/fragment-login/', {
      username,
      ...(telegramUsername ? { telegram_username: telegramUsername } : {}),
      ...(telegramId ? { telegram_id: telegramId } : {}),
    }),
  // BOT ORQALI TASDIQLASH KODI: username kiritilgach kod @DONZOROBOT orqali
  // Telegram chatiga yuboriladi, foydalanuvchi kodni kiritadi → JWT.
  requestLoginCode: (username: string, telegramId?: string) =>
    api.post('/auth/login-code/', {
      username,
      ...(telegramId ? { telegram_id: telegramId } : {}),
    }),
  verifyLoginCode: (username: string, code: string) =>
    api.post('/auth/login-code/verify/', { username, code }),
  // Dev/testing uchun: rol bo'yicha avtomatik demo-foydalanuvchi.
  demoLogin: (role: string) => api.post('/auth/demo-login/', { role }),
  profile: () => api.get('/auth/profile/'),
  updateProfile: (data: any) => api.patch('/auth/profile/', data),
  // Web App ochilganda Fragment API (getInfo) bilan profilni HOZIROQ
  // sinxronlaydi: ism, avatar, Telegram Premium. Javobda yangilangan user.
  syncFragment: () => api.post('/auth/profile/sync-fragment/', {}),
  // SECURITY (audit): logout blacklists the refresh token server-side, so a
  // stolen token cannot mint new access tokens after the user logs out.
  logout: (refresh: string) => api.post('/auth/logout/', { refresh }),
  // ANTI-FRAUD: qurilma va joylashuv metadata'ni backend'ga yuboradi
  // (login paytida chaqiriladi — admin panelda foydalanuvchi profili ko'rinadi).
  deviceInfo: (data: any) => api.post('/auth/profile/device-info/', data),
};

// Categories
export const categoryAPI = {
  list: () => api.get('/categories/'),
  create: (data: any) => api.post('/admin/categories/', data),
  update: (id: number, data: any) => api.put(`/admin/categories/${id}/`, data),
  delete: (id: number) => api.delete(`/admin/categories/${id}/`),
};

// Services
export const serviceAPI = {
  list: (params?: any) => api.get('/services/', { params }),
  detail: (slug: string) => api.get(`/services/${slug}/`),
  create: (data: any) => api.post('/admin/services/', data),
  update: (id: number, data: any) => api.put(`/admin/services/${id}/`, data),
  delete: (id: number) => api.delete(`/admin/services/${id}/`),
  // Admin tahrirlash: BARCHA paketlar va maydonlar bilan to'liq xizmat
  adminDetail: (id: number) => api.get(`/admin/services/${id}/`),
};

// Packages
export const packageAPI = {
  create: (data: any) => api.post('/admin/packages/', data),
  update: (id: number, data: any) => api.put(`/admin/packages/${id}/`, data),
  delete: (id: number) => api.delete(`/admin/packages/${id}/`),
};

// Service Fields
export const fieldAPI = {
  create: (data: any) => api.post('/admin/fields/', data),
  update: (id: number, data: any) => api.put(`/admin/fields/${id}/`, data),
  delete: (id: number) => api.delete(`/admin/fields/${id}/`),
};

// Orders
export const orderAPI = {
  create: (data: any) => api.post('/orders/', data),
  list: (params?: any) => api.get('/orders/my/', { params }),
  detail: (id: number) => api.get(`/orders/${id}/`),
  updateStatus: (id: number, status: string) => api.patch(`/orders/${id}/status/`, { status }),
  adminList: (params?: any) => api.get('/admin/orders/', { params }),
  adminDetail: (id: number) => api.get(`/admin/orders/${id}/`),
  availableOrders: () => api.get('/admin/orders/available/'),
  acceptOrder: (id: number) => api.post(`/admin/orders/${id}/accept/`),
};

// Telegram Premium/Stars orders — admin confirm/reject flow.
// To'lov o'tgach buyurtma 'Tasdiqlash' tugmasini kutadi; tasdiqlash
// fragment-api.uz orqali buyurtmani darhol bajaradi (stars/premium buy),
// rad qilish esa mijoz balansini qaytaradi.
export const telegramOrderAPI = {
  list: (params?: any) => api.get('/admin/telegram-orders/', { params }),
  confirm: (id: number) => api.post(`/admin/telegram-orders/${id}/confirm/`, {}),
  reject: (id: number, reason: string) =>
    api.post(`/admin/telegram-orders/${id}/reject/`, { cancel_reason: reason }),
};

// Payments
export const paymentAPI = {
  init: (data: any) => api.post('/payments/init/', data),
  callback: (provider: string, data: any) => api.post(`/payments/callback/${provider}/`, data),
  providers: () => api.get('/payments/providers/'),
  check: (orderId: number) => api.get(`/payments/check/${orderId}/`),
};

// Balance Top-Up (admin-approval flow: top-up requests are pending until
// an admin approves them — no more instant unverified crediting)
export const balanceAPI = {
  topUp: (data: any) => api.post('/payments/balance/topup/', data),
  topUpStatus: (txId: number) => api.get(`/payments/balance/topup/${txId}/status/`),
  history: () => api.get('/payments/balance/history/'),
  // Admin: pending top-up requests
  adminTopUps: (params?: any) => api.get('/admin/balance-topups/', { params }),
  approveTopUp: (id: number) => api.post(`/admin/balance-topups/${id}/approve/`),
  rejectTopUp: (id: number) => api.post(`/admin/balance-topups/${id}/reject/`),
};

// Banners
export const bannerAPI = {
  list: () => api.get('/banners/'),
  create: (data: any) => api.post('/admin/banners/', data),
  update: (id: number, data: any) => api.put(`/admin/banners/${id}/`, data),
  delete: (id: number) => api.delete(`/admin/banners/${id}/`),
};

// Admin
export const adminAPI = {
  dashboard: () => api.get('/admin/dashboard/'),
  analytics: () => api.get('/admin/analytics/'),
  logs: (params?: any) => api.get('/admin/logs/', { params }),
  users: (params?: any) => api.get('/admin/users/', { params }),
  createUser: (data: any) => api.post('/admin/users/create/', data),
  updateUser: (id: number, data: any) => api.patch(`/admin/users/${id}/`, data),
  deleteUser: (id: number) => api.delete(`/admin/users/${id}/`),
  get: (url: string, config?: any) => api.get(url, config),
  post: (url: string, data: any) => api.post(url, data),    settings: () => api.get('/admin/settings/'),
    updateSettings: (data: any) => api.put('/admin/settings/', data),
    writeEnv: () => api.post('/admin/settings/write-env/', {}),
    fragmentStatus: (params?: any) => api.get('/admin/fragment-status/', { params }),
    fragmentSync: () => api.post('/admin/fragment-sync/', {}),
    marketingStats: () => api.get('/admin/marketing-stats/'),
};

// Telegram Web App sessions (admin — recent Web App logins)
export const telegramSessionsAPI = {
  list: (params?: any) => api.get('/admin/telegram-sessions/', { params }),
};

// Role Management (admin panel)
export const roleAPI = {
  holders: (params?: any) => api.get('/admin/roles/', { params }),
  setRole: (data: any) => api.post('/admin/roles/set/', data),
  search: (q: string) => api.get('/admin/roles/search/', { params: { q } }),
};

// Referral
export const referralAPI = {
  myReferrals: () => api.get('/auth/referrals/'),
  stats: () => api.get('/auth/referrals/stats/'),
  claimBonus: () => api.post('/auth/referrals/claim-bonus/', {}),
  applyCode: (code: string) => api.post('/auth/referrals/apply-code/', { referral_code: code }),
};

// Order Stats
export const orderStatsAPI = {
  get: () => api.get('/orders/stats/'),
};

// ── Card payment auto-verification (To'lov nazorati) ──
// User client (Telethon) watches a bank-notification chat and credits the
// balance when the exact unique amount arrives. Transfers above the
// suspicious limit land here for manual approve/reject.
export const cardpayAPI = {
  settings: () => api.get('/admin/cardpay/settings/'),
  updateSettings: (data: any) => api.put('/admin/cardpay/settings/', data),
  // PaymentCard registry — multi-card limits + auto-rotation
  cards: () => api.get('/admin/cardpay/cards/'),
  createCard: (data: any) => api.post('/admin/cardpay/cards/', data),
  updateCard: (id: number, data: any) => api.patch(`/admin/cardpay/cards/${id}/`, data),
  deleteCard: (id: number) => api.delete(`/admin/cardpay/cards/${id}/`),
  activateCard: (id: number) => api.post(`/admin/cardpay/cards/${id}/activate/`, {}),
  resetCard: (id: number) => api.post(`/admin/cardpay/cards/${id}/reset/`, {}),
  requests: (status?: string) => api.get('/admin/cardpay/requests/', { params: { status } }),
  messages: (params?: any) => api.get('/admin/cardpay/messages/', { params }),
  suspicious: (status?: string) => api.get('/admin/cardpay/suspicious/', { params: { status } }),
  approveSuspicious: (id: number) => api.post(`/admin/cardpay/suspicious/${id}/approve/`, {}),
  rejectSuspicious: (id: number, note: string) =>
    api.post(`/admin/cardpay/suspicious/${id}/reject/`, { note }),
  status: () => api.get('/admin/cardpay/status/'),
  settingsSave: (data: any) => api.put('/admin/cardpay/settings/', data),
  // User client (Telethon) — admin paneldan Telegram akkauntga kirish.
  // slot: 1 (default) = asosiy monitor; 2+ = qo'shimcha zaxira akkauntlar.
  userClientStatus: (slot = 1) => api.get('/admin/cardpay/userclient/status/', { params: { slot } }),
  userClientStart: (phone: string, slot = 1) =>
    api.post('/admin/cardpay/userclient/start/', { phone, slot }),
  userClientVerify: (code: string, slot = 1) =>
    api.post('/admin/cardpay/userclient/verify/', { code, slot }),
  userClientPassword: (password: string, slot = 1) =>
    api.post('/admin/cardpay/userclient/password/', { password, slot }),
  userClientLogout: (slot = 1) => api.post('/admin/cardpay/userclient/logout/', { slot }),
  // Bir nechta monitor akkaunt boshqaruvi
  userClients: () => api.get('/admin/cardpay/userclients/'),
  userClientCreate: (label?: string) => api.post('/admin/cardpay/userclients/', { label }),
  userClientSetEnabled: (slot: number, enabled: boolean) =>
    api.patch(`/admin/cardpay/userclients/${slot}/`, { enabled }),
  userClientRemove: (slot: number) => api.delete(`/admin/cardpay/userclients/${slot}/`),
  // User Client boshqaruv sahifasi uchun
  userClientDetail: () => api.get('/admin/cardpay/userclient/detail/'),
  userClientMonitorCheck: () => api.post('/admin/cardpay/userclient/monitor-check/', {}),
  userClientRestart: (slot = 1) => api.post('/admin/cardpay/userclient/restart/', { slot }),
  userClientApiKeys: (data?: any) =>
    data ? api.put('/admin/cardpay/userclient/api-keys/', data) : api.get('/admin/cardpay/userclient/api-keys/'),
};

// ── Security Center / Anti-Fraud (Gemini AI risk engine) ──
export const securityAPI = {
  dashboard: () => api.get('/admin/security/dashboard/'),
  incidents: (params?: any) => api.get('/admin/security/incidents/', { params }),
  incidentDetail: (id: number) => api.get(`/admin/security/incidents/${id}/`),
  incidentAction: (id: number, action: string, data?: any) =>
    api.post(`/admin/security/incidents/${id}/${action}/`, data || {}),
  cases: () => api.get('/admin/security/cases/'),
  createCase: (data: any) => api.post('/admin/security/cases/', data),
  caseAction: (id: number, action: string, data?: any) =>
    api.post(`/admin/security/cases/${id}/${action}/`, data || {}),
  profiles: (params?: any) => api.get('/admin/security/profiles/', { params }),
  profileAction: (userId: number, action: string) =>
    api.post(`/admin/security/profiles/${userId}/${action}/`, {}),
  settings: () => api.get('/admin/security/settings/'),
  updateSettings: (data: any) => api.put('/admin/security/settings/', data),
  copilot: (question: string) => api.post('/admin/security/copilot/', { question }),
};

export default api;
