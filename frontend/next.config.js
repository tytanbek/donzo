/** @type {import('next').NextConfig} */

// Backend manzili env'dan olinadi; berilmasa — joriy Render backend.
const BACKEND_ORIGIN = (
  process.env.BACKEND_ORIGIN || 'https://donzo-backend-v8oz.onrender.com'
).replace(/\/$/, '');

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ];
  },

  // Eslatma: avval bu yerda barcha yo'llarga `Access-Control-Allow-Origin: *`
  // qo'yilgan edi — bu /api proksi orqali backend CORS cheklovini aylanib
  // o'tishga imkon berardi. Olib tashlandi; xavfsizlik sarlavhalari vercel.json'da.

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'www.pubgmobile.com', pathname: '/**' },
      { protocol: 'https', hostname: 'cdn.akamai.steamstatic.com', pathname: '/**' },
      { protocol: 'https', hostname: new URL(BACKEND_ORIGIN).hostname, pathname: '/**' },
      { protocol: 'https', hostname: 'frontend-self-mu-1nb1d09n0h.vercel.app', pathname: '/**' },
    ],
  },
};

// Vercel'dagi NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL env'lari o'chgan eski
// backend'ga (masalan donzo-backend-lzmd) ishora qilib qolishi mumkin — u 404
// qaytaradi va Telegram avto-kirish ishlamay qoladi. Shuning uchun Vercel
// build'larida manzillar BACKEND_ORIGIN'dan majburan olinadi.
if (process.env.VERCEL) {
  const wsOrigin = BACKEND_ORIGIN.replace(/^http/, 'ws');
  nextConfig.env = {
    NEXT_PUBLIC_API_URL: `${BACKEND_ORIGIN}/api/v1`,
    NEXT_PUBLIC_WS_URL: `${wsOrigin}/ws`,
  };
}

module.exports = nextConfig;
