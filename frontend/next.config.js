/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['res.cloudinary.com', 'via.placeholder.com'],
  },
  // ── Security headers (audit finding #4) ──
  // Applied to every response. CSP/HSTS/clickjacking/nosniff/Referrer-Policy.
  // NOTE: 'unsafe-inline' in script-src is required by Next.js's own inline
  // bootstrap scripts (hydration) — replacing it with nonces would need
  // middleware; keeping the rest of the policy strict still blocks the vast
  // majority of injection vectors. connect-src allows the API tunnel
  // (https) + WebSocket (wss) + images from https (game artwork).
  //
  // FRAME POLICY — this is a Telegram Mini App: Telegram renders it inside
  // its own webview/framing context (Desktop & web.telegram.org). A blanket
  // `frame-ancestors 'none'` / X-Frame-Options: DENY would blank the app in
  // those clients, so framing is allowed ONLY for Telegram's own origins.
  async headers() {
    // Dev rejimida react-refresh 'unsafe-eval' talab qiladi — CSP uni bloklasa
    // sahifa buziladi. Dev'da CSP umuman yuborilmaydi (lokal server);
    // production build'da to'liq qat'iy CSP qo'llanadi.
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) return [];
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          {
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; " +
              // Telegram Mini App SDK (https://telegram.org/js/telegram-web-app.js)
              // MUST be allowed or window.Telegram.WebApp.initData never exists
              // and silent auto-login silently breaks.
              "script-src 'self' 'unsafe-inline' https://telegram.org; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' https: data: blob:; " +
              "font-src 'self' data:; " +
              "connect-src 'self' https: http://localhost:8000 wss: ws: ws://localhost:8000; " +
              "frame-src https://telegram.org https://t.me; " +
              "frame-ancestors https://telegram.org https://t.me; " +
              "base-uri 'self'; " +
              "form-action 'self'",
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
