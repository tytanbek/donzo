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

module.exports = nextConfig;
