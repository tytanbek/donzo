'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@/lib/store';
import {
  FiLayout, FiPackage, FiShoppingBag, FiGrid, FiImage,
  FiSettings, FiUsers, FiLogOut, FiChevronLeft, FiChevronRight, FiBarChart2, FiFileText,
  FiTag, FiDollarSign, FiSearch, FiActivity, FiTrendingUp, FiKey, FiSend, FiShield, FiBell, FiMenu, FiX, FiZap, FiCreditCard, FiRadio, FiUser, FiLayers, FiSpeaker
} from 'react-icons/fi';
import CommandPalette from '@/components/CommandPalette';

interface SidebarItem {
  icon: React.ComponentType<any>;
  label: string;
  href: string;
  roles: string[];
}

interface SidebarGroup {
  title: string;
  items: SidebarItem[];
}

const sidebarGroups: SidebarGroup[] = [
  {
    title: 'Asosiy',
    items: [
      { icon: FiLayout, label: 'CRM Dashboard', href: '/admin', roles: ['admin', 'super_admin'] },
      { icon: FiTrendingUp, label: 'Analitika', href: '/admin/analytics', roles: ['admin', 'super_admin'] },
    ],
  },
  {
    title: 'Savdo',
    items: [
      { icon: FiShoppingBag, label: 'Buyurtmalar', href: '/admin/orders', roles: ['admin', 'super_admin'] },
      { icon: FiZap, label: 'Telegram', href: '/admin/telegram-orders', roles: ['admin', 'super_admin'] },
      { icon: FiDollarSign, label: "To'lovlar", href: '/admin/payments', roles: ['admin', 'super_admin'] },
      { icon: FiCreditCard, label: "To'lov nazorati", href: '/admin/cardpay', roles: ['admin', 'super_admin'] },
      { icon: FiLayers, label: 'Kartalar', href: '/admin/cards', roles: ['admin', 'super_admin'] },
      { icon: FiUser, label: 'User Client', href: '/admin/user-client', roles: ['admin', 'super_admin'] },
      { icon: FiTag, label: 'Promo Kodlar', href: '/admin/promocodes', roles: ['admin', 'super_admin'] },
      { icon: FiBell, label: 'Bildirishnomalar', href: '/admin/notifications', roles: ['admin', 'super_admin'] },
      { icon: FiSpeaker, label: 'Marketing', href: '/admin/marketing', roles: ['admin', 'super_admin'] },
    ],
  },
  {
    title: 'Katalog',
    items: [
      { icon: FiPackage, label: 'Xizmatlar', href: '/admin/services', roles: ['admin', 'super_admin'] },
      { icon: FiGrid, label: 'Kategoriyalar', href: '/admin/categories', roles: ['admin', 'super_admin'] },
      { icon: FiImage, label: 'Bannerlar', href: '/admin/banners', roles: ['admin', 'super_admin'] },
    ],
  },
  {
    title: 'Foydalanuvchilar',
    items: [
      { icon: FiUsers, label: 'Mijozlar', href: '/admin/customers', roles: ['admin', 'super_admin'] },
      { icon: FiShield, label: 'Rollar', href: '/admin/roles', roles: ['super_admin'] },
    ],
  },
  {
    title: 'Xavfsizlik',
    items: [
      { icon: FiShield, label: 'Security Center', href: '/admin/security', roles: ['admin', 'super_admin'] },
      { icon: FiRadio, label: 'Jonli sessiyalar', href: '/admin/sessions', roles: ['admin', 'super_admin'] },
    ],
  },
  {
    title: 'Tizim',
    items: [
      { icon: FiSend, label: 'Bot holati', href: '/admin/bot', roles: ['super_admin'] },
      { icon: FiKey, label: 'Kalitlar', href: '/admin/keys', roles: ['super_admin'] },
      { icon: FiFileText, label: 'Loglar', href: '/admin/logs', roles: ['super_admin'] },
      { icon: FiSettings, label: 'Sozlamalar', href: '/admin/settings', roles: ['super_admin'] },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authChecked } = useStore();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Close the mobile drawer on route change
  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile drawer is open
  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isMobileOpen]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    // LOGIN REMOVED — no /auth/login anymore. Guests without a session are
    // sent home; staff identity comes only from the Telegram auto-login.
    // Wait for authChecked so the silent auto-login settles before bouncing,
    // avoiding a visible home→panel round-trip on a direct /admin deep link.
    // DEMO MODE: rol sahifa yo'nalishidan keladi (layout avtomatik demo-login
    // qiladi) — rol mos kelmaguncha sahifani ko'rsatmaymiz, lekin otib
    // yubormaymiz (aks holda rol almashish paytida aylanma yo'nalish bo'ladi).
    if (!token && authChecked) {
      router.push('/');
    }
  }, [user, router, authChecked]);

  if (!user || !['admin', 'super_admin'].includes(user.role)) {
    return null;
  }

  // Filter groups by role
  const visibleGroups = sidebarGroups
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(user.role)) }))
    .filter((g) => g.items.length > 0);

  const isActive = (href: string) =>
    pathname === href || (href !== '/admin' && pathname.startsWith(href));

  // Shared sidebar body (used by both desktop aside and mobile drawer)
  const renderSidebarBody = (collapseable: boolean) => (
    <div className="h-full glass-card rounded-none border-l-0 border-t-0 border-b-0 p-4 flex flex-col">
      {/* Toggle */}
      <div className="flex items-center justify-between mb-4">
        {(!isCollapsed || !collapseable) && (
          <div className="flex items-center gap-2 px-2">
            <img src="/images/donzo.png" alt="" className="w-4 h-4 rounded object-cover" />
            <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wider">DONZO CRM</span>
          </div>
        )}
        {collapseable ? (
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00F5FF] transition-all duration-200"
          >
            {isCollapsed ? <FiChevronRight className="w-4 h-4" /> : <FiChevronLeft className="w-4 h-4" />}
          </button>
        ) : (
          <button
            onClick={() => setIsMobileOpen(false)}
            className="lg:hidden p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00F5FF] transition-all duration-200"
          >
            <FiX className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Command Palette button */}
      <button
        onClick={() => { setIsMobileOpen(false); window.dispatchEvent(new CustomEvent('open-command-palette')); }}
        className="mb-4 flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 text-sm text-[#94A3B8] hover:text-white transition-all"
        title="Qidirish (Ctrl+K)"
      >
        <FiSearch className="w-4 h-4 flex-shrink-0 text-[#00F5FF]" />
        {(!isCollapsed || !collapseable) && <span className="flex-1 text-left">Qidirish...</span>}
        {!isCollapsed && collapseable && <kbd className="px-1.5 py-0.5 rounded bg-black/30 border border-white/10 text-[10px]">Ctrl K</kbd>}
      </button>

      {/* Navigation groups */}
      <nav className="flex-1 space-y-4 overflow-y-auto">
        {visibleGroups.map((group) => (
          <div key={group.title}>
            {(!isCollapsed || !collapseable) && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#475569]">
                {group.title}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                      active
                        ? 'bg-[#00F5FF]/10 text-[#00F5FF] border border-[#00F5FF]/20'
                        : 'text-[#64748B] hover:text-white hover:bg-white/5'
                    }`}
                    title={isCollapsed && collapseable ? item.label : undefined}
                  >
                    <item.icon className={`w-5 h-5 flex-shrink-0 ${active ? 'text-[#00F5FF]' : ''}`} />
                    {(!isCollapsed || !collapseable) && <span>{item.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Logout */}
      <button
        onClick={() => {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/';
        }}
        className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all duration-200 w-full"
      >
        <FiLogOut className="w-4 h-4 flex-shrink-0" />
        {(!isCollapsed || !collapseable) && <span>Chiqish</span>}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen flex pt-20">
      {/* ═══ Mobile top bar (hamburger) — site Header (z-50, top-0) ostida ═══ */}
      <div className="lg:hidden fixed top-20 left-0 right-0 z-40 h-14 flex items-center px-4 bg-[#0F172A]/90 backdrop-blur-xl border-b border-[#00F5FF]/10">
        <button
          onClick={() => setIsMobileOpen(true)}
          className="p-2.5 rounded-xl hover:bg-white/5 text-[#94A3B8] hover:text-[#00F5FF] transition-all duration-200"
          aria-label="Menuni ochish"
        >
          <FiMenu className="w-6 h-6" />
        </button>
        <span className="ml-3 text-sm font-semibold text-[#64748B] uppercase tracking-wider">
          DONZO CRM
        </span>
      </div>

      {/* ═══ Desktop Sidebar (lg+) ═══ */}
      <aside
        className={`hidden lg:block fixed left-0 top-20 bottom-0 z-30 transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {renderSidebarBody(true)}
      </aside>

      {/* ═══ Mobile Drawer ═══ */}
      <AnimatePresence>
        {isMobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="lg:hidden fixed inset-0 top-[136px] z-30 bg-black/60 backdrop-blur-sm"
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'tween', duration: 0.25 }}
              className="lg:hidden fixed left-0 top-[136px] bottom-0 z-40 w-72 max-w-[85vw]"
            >
              {renderSidebarBody(false)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ═══ Main Content ═══ */}
      <main className={`flex-1 transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-[56px] pb-8 lg:pt-8">
          {children}
        </div>
      </main>

      {/* ═══ Command Palette (Ctrl+K) ═══ */}
      <CommandPalette />
    </div>
  );
}
