const { execSync } = require('child_process');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'https://donzo-backend-lzmd.onrender.com/api/:path*',
      },
    ];
  },

  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
      ],
    }];
  },

  experimental: {
    // Avoid "external" warning for remote images
    externalDir: true,
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com', pathname: '/**' },
      { protocol: 'https', hostname: 'www.pubgmobile.com', pathname: '/**' },
      { protocol: 'https', hostname: 'cdn.akamai.steamstatic.com', pathname: '/**' },
      { protocol: 'https', hostname: 'donzo-backend-lzmd.onrender.com', pathname: '/**' },
      { protocol: 'https', hostname: 'donzo-eight.vercel.app', pathname: '/**' },
    ],
  },
};

// Environment overrides
try {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;

  /** @type {import('next').NextConfig} */
  const envOverrides = {};

  if (nodeEnv === 'production' && apiUrl) {
    envOverrides.env = { NEXT_PUBLIC_API_URL: apiUrl };
  }

  if (vercelUrl) {
    envOverrides.env = envOverrides.env || {};
    envOverrides.env.NEXT_PUBLIC_API_URL = `https://donzo-backend-lzmd.onrender.com/api/v1`;
  }

  Object.assign(nextConfig, envOverrides);
} catch { /* noop */ }

module.exports = nextConfig;
