import type { MetadataRoute } from 'next';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://donzo-eight.vercel.app').replace(/\/$/, '');
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || 'https://donzo-backend-v8oz.onrender.com/api/v1').replace(/\/$/, '');

export const revalidate = 3600; // har soatda yangilanadi

/** Ochiq sahifalar + har bir faol xizmat sahifasi (backend'dan). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: 'daily', priority: 1 },
  ];
  try {
    const res = await fetch(`${API_BASE}/services/`, { next: { revalidate: 3600 } });
    if (res.ok) {
      const data = await res.json();
      const services: any[] = data?.results || data || [];
      for (const s of services) {
        if (s?.slug) {
          pages.push({
            url: `${SITE_URL}/services/${s.slug}`,
            lastModified: now,
            changeFrequency: 'daily',
            priority: 0.8,
          });
        }
      }
    }
  } catch {
    /* backend uxlayotgan bo'lsa ham sitemap bosh sahifa bilan qaytadi */
  }
  return pages;
}
