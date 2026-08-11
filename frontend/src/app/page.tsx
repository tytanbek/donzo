'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FiZap, FiShield, FiClock, FiTrendingUp, FiAward } from 'react-icons/fi';
import { serviceAPI, categoryAPI, referralAPI, bannerAPI } from '@/lib/api';
import { useStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { BOT_URL } from '@/lib/brand';

// ─── Game emoji mapping ───
const gameIcons: Record<string, string> = {
  'mobile legends': '🎮', 'mlbb': '🎮', 'valorant': '🔫', 'clash royale': '👑',
  'clash of clans': '⚔️', 'roblox': '🧊', 'free fire': '🔥', 'pubg': '🎯',
  'fortnite': '🦴', 'steam': '💎', 'telegram': '✈️', 'discord': '💬',
  'netflix': '🎬', 'spotify': '🎵', 'genshin': '⭐', 'cod': '💀', 'honor of kings': '🐉',
  'star': '⭐', 'premium': '💎',
};

function getGameIcon(name: string): string {
  const lower = (name || '').toLowerCase();
  for (const [key, icon] of Object.entries(gameIcons)) {
    if (lower.includes(key)) return icon;
  }
  return '🎮';
}

function handleImgError(e: React.SyntheticEvent<HTMLImageElement>, serviceName: string) {
  const img = e.target as HTMLImageElement;
  img.style.display = 'none';
  const holder = img.parentElement;
  if (holder && !holder.querySelector('.fallback-emoji')) {
    const sp = document.createElement('span');
    sp.className = 'fallback-emoji';
    sp.textContent = getGameIcon(serviceName);
    holder.appendChild(sp);
  }
}

const heroSlides = [
  {
    image: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=900&q=80',
    emoji: '⚡',
    title: '5 daqiqada yetkazamiz',
    sub: 'Eng tezkor donat xizmati',
  },
  {
    image: 'https://images.unsplash.com/photo-1552820728-8b83bb6b773f?w=900&q=80',
    emoji: '🛡️',
    title: '100% xavfsiz to\'lov',
    sub: 'Balans orqali himoyalangan xarid',
  },
  {
    image: 'https://images.unsplash.com/photo-1538481199705-c710c4e965fc?w=900&q=80',
    emoji: '🎁',
    title: 'Do\'stlarni taklif qiling',
    sub: 'Har bir buyurtmadan 5% cashback',
  },
];

const TOP_TABS = [
  { key: 'today', label: 'Bugungi' },
  { key: 'week', label: 'Haftalik' },
  { key: 'month', label: 'Oylik' },
];

export default function HomePage() {
  const router = useRouter();
  const [services, setServices] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [topTab, setTopTab] = useState('today');
  const [isLoading, setIsLoading] = useState(true);
  const [banners, setBanners] = useState<any[]>([]);
  const { user, isAuthenticated } = useStore();

  // Hero carousel state
  const [slideIndex, setSlideIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const autoplayRef = useRef<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [servicesRes, categoriesRes, bannersRes] = await Promise.all([
          serviceAPI.list(),
          categoryAPI.list(),
          bannerAPI.list(),
        ]);
        setServices(servicesRes.data.results || servicesRes.data);
        setCategories(categoriesRes.data.results || categoriesRes.data);
        // Slider'da ko'rsatiladigan bannerlar: 'slider' va 'announcement' (e'lon)
        const all = bannersRes.data.results || bannersRes.data || [];
        setBanners(all.filter((b: any) => ['slider', 'announcement'].includes(b.type)));
      } catch (e) {
        toast.error('Ma\'lumotlarni yuklashda xatolik');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // Referral attribution: when a guest lands on /?ref=CODE (login removed, the
  // link comes from ReferralSection), apply the code once the Telegram auto-login
  // resolves. Best-effort — never blocks or errors the page.
  useEffect(() => {
    if (!user || !isAuthenticated || user.referred_by) return;
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (!ref) return;
    referralAPI.applyCode(ref).catch(() => {});
    // Clean the query string so the code is not re-applied on reload.
    window.history.replaceState({}, '', window.location.pathname);
  }, [user, isAuthenticated]);

  // Autoplay hero — resets on manual interaction
  const restartAutoplay = () => {
    if (autoplayRef.current) clearInterval(autoplayRef.current);
    autoplayRef.current = setInterval(() => {
      setSlideIndex((prev) => (prev + 1) % heroSlides.length);
    }, 4000);
  };

  useEffect(() => {
    restartAutoplay();
    return () => { if (autoplayRef.current) clearInterval(autoplayRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta < -40) setSlideIndex((prev) => (prev + 1) % heroSlides.length);
    else if (delta > 40) setSlideIndex((prev) => (prev - 1 + heroSlides.length) % heroSlides.length);
    touchStartX.current = null;
    restartAutoplay();
  };

  const filteredServices = selectedCategory
    ? services.filter((s) => s.category === selectedCategory)
    : services;

  const cheapestPrice = (service: any): number | null => {
    if (service.min_price !== null && service.min_price !== undefined) {
      return Number(service.min_price);
    }
    if (service.packages && service.packages.length) {
      return Math.min(...service.packages.map((p: any) => Number(p.price || 0)));
    }
    return null;
  };

  // "Sotuv Top 10" — ranked by package count (popularity proxy), no backend changes
  const topServices = [...filteredServices]
    .sort((a: any, b: any) => Number(b.packages_count || 0) - Number(a.packages_count || 0))
    .slice(0, 10);

  // Most popular service in the visible set → gets the "Popular" ribbon
  const mostPopularId = filteredServices.length
    ? [...filteredServices].sort((a: any, b: any) => Number(b.packages_count || 0) - Number(a.packages_count || 0))[0]?.id
    : null;

  return (
    <div>
      {/* ═══════════ HERO BANNER (slider) — admin bannerlaridan yoki default ═══════════ */}
      {(() => {
        const slides = banners.length > 0
          ? banners.map((b: any) => ({
              key: `b${b.id}`,
              image: b.image_url,
              title: b.title || '',
              sub: b.subtitle || '',
              link: b.link_url || null,
            }))
          : heroSlides.map((s: any, i: number) => ({ key: `h${i}`, ...s, link: null }));
        const slideCount = slides.length || 1;
        return (
          <div
            className="hero-carousel"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            <div className="hero-track" style={{ transform: `translateX(-${slideIndex % slideCount * 100}%)` }}>
              {slides.map((slide, i) => (
                <div
                  key={slide.key}
                  className={`hero-slide ${i === slideIndex % slideCount ? 'active' : ''}`}
                  onClick={() => {
                    if (slide.link) window.open(slide.link, '_blank', 'noopener,noreferrer');
                    else if (i === 0) router.push('/#services');
                  }}
                >
                  <div
                    className="hero-slide-bg"
                    style={{ backgroundImage: `url('${slide.image}')` }}
                  >
                    <span className="hero-slide-emoji">{slide.emoji || ''}</span>
                  </div>
                  <div className="hero-slide-overlay">
                    {slide.title && <div className="hero-slide-title">{slide.title}</div>}
                    {slide.sub && <div className="hero-slide-sub">{slide.sub}</div>}
                  </div>
                </div>
              ))}
            </div>
            <div className="hero-dots">
              {slides.map((_, i) => (
                <div key={i} className={`hero-dot ${i === slideIndex % slideCount ? 'active' : ''}`} />
              ))}
            </div>
          </div>
        );
      })()}

      {/* ═══════════ GUEST CTA ═══════════ */}
      {!isAuthenticated && !user && (
        <div className="guest-cta mini-anim-in">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#2DD4BF] to-[#6366F1] flex items-center justify-center text-[#081018]">
              <FiZap className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Balans orqali to'lang</p>
              <p className="text-xs text-[#9CA3AF]">Hisob oching va 5% cashback oling</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/profile" className="pill-btn !py-3 !text-sm flex-1">
              Profil
            </Link>
            <a
              href={BOT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="pill-btn pill-btn-ghost !py-3 !text-sm flex-1"
            >
              Botni ochish
            </a>
          </div>
        </div>
      )}

      {/* ═══════════ O'YINLAR — 2-column grid ═══════════ */}
      <div id="services" className="scroll-mt-20">
        <div className="mini-section-head">
          <div className="mini-section-title">
            {selectedCategory ? 'Xizmatlar' : 'O\'yinlar'}
          </div>
          <span className="text-xs text-[#9CA3AF]">{filteredServices.length} ta</span>
        </div>

        {isLoading ? (
          <div className="mini-card-grid">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="mini-card shimmer !border-0" style={{ height: 140 }} />
            ))}
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="premium-empty">
            <div className="premium-empty-icon">🎮</div>
            <div className="premium-empty-title">Xizmatlar topilmadi</div>
            <div className="premium-empty-sub">Bu kategoriyada hozircha xizmatlar mavjud emas</div>
          </div>
        ) : (
          <div className="mini-card-grid">
            {filteredServices.map((service: any) => {
              const price = cheapestPrice(service);
              return (
                <Link key={service.id} href={`/services/${service.slug}`} className="mini-card">
                  {mostPopularId === service.id && <span className="mini-card-ribbon">Popular</span>}
                  <span className="mini-card-online" aria-hidden="true" />
                  <div className="mini-card-emoji">
                    {service.image_url ? (
                      <img
                        src={service.image_url}
                        alt={service.name}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => handleImgError(e, service.name)}
                      />
                    ) : (
                      <span>{getGameIcon(service.name)}</span>
                    )}
                  </div>
                  <div className="mini-card-name">{service.name}</div>
                  <div className="mini-card-price">
                    {price !== null ? `${Number(price).toLocaleString()} so'm` : 'Narxi bor'}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══════════ CATEGORY FILTER ═══════════ */}
      <div className="chip-row">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`chip ${selectedCategory === null ? 'active' : ''}`}
        >
          Barchasi
        </button>
        {categories.map((cat: any) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={`chip ${selectedCategory === cat.id ? 'active' : ''}`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* ═══════════ SOTUV TOP 10 ═══════════ */}
      <div className="mini-section-head">
        <div className="mini-section-title flex items-center gap-2">
          <FiTrendingUp className="w-5 h-5 text-[#2DD4BF]" />
          Sotuv Top 10
        </div>
      </div>

      <div className="tab-row !pt-1 !pb-3">
        {TOP_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setTopTab(tab.key)}
            className={`order-tab ${topTab === tab.key ? 'active' : ''}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {topServices.length === 0 ? (
        /* ═══ Professional Empty State ═══ */
        <div className="premium-empty">
          <div className="premium-empty-icon">
            <FiTrendingUp className="w-8 h-8" />
          </div>
          <div className="premium-empty-title">Bu davr uchun sotuv topilmadi</div>
          <div className="premium-empty-sub">
            Hozircha sotuv ma'lumotlari mavjud emas. Tez orada yangilanadi!
          </div>
        </div>
      ) : (
        <div className="pb-2">
          {topServices.map((service: any, i: number) => {
            const price = cheapestPrice(service);
            return (
              <Link key={service.id} href={`/services/${service.slug}`} className="top10-row">
                <div className={`top10-rank ${i >= 3 ? 'off' : ''}`}>{i + 1}</div>
                <div className="mini-card-emoji !w-11 !h-11 !text-xl !rounded-xl">
                  {service.image_url ? (
                    <img
                      src={service.image_url}
                      alt={service.name}
                      loading="lazy"
                      decoding="async"
                      onError={(e) => handleImgError(e, service.name)}
                    />
                  ) : (
                    <span>{getGameIcon(service.name)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white truncate">{service.name}</p>
                  <p className="text-[11px] text-[#9CA3AF]">
                    {Number(service.packages_count || 0)} ta paket
                  </p>
                </div>
                {price !== null && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-[#2DD4BF]">
                      {Number(price).toLocaleString()} so'm
                    </p>
                    <p className="text-[10px] text-[#9CA3AF]">dan boshlab</p>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* ═══════════ TRUST STRIP ═══════════ */}
      <div className="mini-panel !mx-4 mb-6 flex items-center justify-around">
        <div className="flex flex-col items-center gap-1">
          <FiZap className="w-5 h-5 text-[#2DD4BF]" />
          <span className="text-[10px] text-[#9CA3AF]">Tezkor</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <FiShield className="w-5 h-5 text-[#34D399]" />
          <span className="text-[10px] text-[#9CA3AF]">Xavfsiz</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <FiClock className="w-5 h-5 text-[#6366F1]" />
          <span className="text-[10px] text-[#9CA3AF]">24/7</span>
        </div>
      </div>
    </div>
  );
}
