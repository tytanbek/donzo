'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { FiHome, FiPackage, FiGift, FiUser, FiHeadphones, FiZap, FiMinus, FiPlus } from 'react-icons/fi';
import WsStatusIndicator from '@/components/WsStatusIndicator';
import { SUPPORT_TELEGRAM_URL, BRAND_NAME } from '@/lib/brand';
import BroadcastBanner from '@/components/BroadcastBanner';

const NAV_ITEMS = [
  { key: 'home', label: 'Bosh sahifa', href: '/', icon: FiHome },
  { key: 'orders', label: 'Buyurtmalar', href: '/orders', icon: FiPackage },
  { key: 'gifts', label: 'Giftlar', href: '/balance', icon: FiGift },
  { key: 'profile', label: 'Profil', href: '/profile', icon: FiUser },
  { key: 'support', label: 'Support', href: SUPPORT_TELEGRAM_URL, icon: FiHeadphones, external: true },
];

export default function MiniAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isAuthenticated } = useStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Determine active tab from pathname
  const activeKey = (() => {
    if (pathname === '/' || pathname.startsWith('/services/')) return 'home';
    if (pathname.startsWith('/orders')) return 'orders';
    if (pathname.startsWith('/balance')) return 'gifts';
    if (pathname.startsWith('/profile') || pathname.startsWith('/dashboard')) return 'profile';
    return 'home';
  })();

  const activeIndex = NAV_ITEMS.findIndex((n) => n.key === activeKey && !n.external);
  const indicatorLeft = activeIndex >= 0 ? `calc(${activeIndex * 20}% + 4px)` : '4px';

  return (
    <div className="mini-app-frame">
      {/* ═══ Fixed Header: logo + balance with − / + steppers ═══ */}
      <header className="mini-header">
        <div className="mini-header-inner">
          <Link href="/" className="mini-logo">
            <div className="mini-logo-icon">
              <img src="/images/donzo.png" alt="DONZO" className="w-full h-full object-cover rounded-[12px]" />
            </div>
            <div>
              <div className="mini-logo-text">{BRAND_NAME}</div>
              <div className="mini-logo-sub">Premium</div>
            </div>
          </Link>

          {isAuthenticated && user ? (
            <div className="flex items-center gap-2">
              <WsStatusIndicator />
              <Link href="/balance" className="balance-badge">
                <div className="balance-badge-icon">
                  <FiZap className="w-3.5 h-3.5" />
                </div>
                {mounted && (
                  <span className="balance-badge-value">
                    {Number(user.balance || 0).toLocaleString()} so'm
                  </span>
                )}
              </Link>
              <button
                type="button"
                onClick={() => toast('Yechib olish hozircha mavjud emas', { icon: 'ℹ️' })}
                className="balance-step"
                title="Yechib olish"
              >
                <FiMinus className="w-4 h-4" />
              </button>
              <Link href="/balance" className="balance-step plus" title="To'ldirish">
                <FiPlus className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <Link href="/profile" className="balance-badge">
              <div className="balance-badge-icon">
                <FiUser className="w-3.5 h-3.5" />
              </div>
              {/* LOGIN REMOVED — no "Kirish" wording anywhere; the guest
                  badge opens the profile, where LoginGate routes to the bot. */}
              <span className="balance-badge-value">Profil</span>
            </Link>
          )}
        </div>
      </header>

      {/* ═══ Page content ═══ */}
      <main className="mini-page">
        <BroadcastBanner />
        {children}
      </main>

      {/* ═══ Fixed Bottom Nav with sliding indicator ═══ */}
      <nav className="bottom-nav">
        <div className="bottom-nav-shell">
          <div className="bottom-nav-indicator" style={{ left: indicatorLeft }} />
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === activeKey;
            const className = `nav-item ${isActive ? 'active' : ''}`;
            return item.external ? (
              <a
                key={item.key}
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className={className}
              >
                <item.icon className="nav-icon" />
                <span className="nav-label">{item.label}</span>
              </a>
            ) : (
              <Link key={item.key} href={item.href} className={className}>
                <item.icon className="nav-icon" />
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
