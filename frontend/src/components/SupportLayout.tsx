'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '@/lib/store';
import {
  FiLayout, FiShoppingBag, FiUsers, FiChevronLeft, FiChevronRight, FiLogOut
} from 'react-icons/fi';

const sidebarItems = [
  { icon: FiLayout, label: 'Dashboard', href: '/support' },
  { icon: FiShoppingBag, label: 'Buyurtmalar', href: '/support/orders' },
  { icon: FiUsers, label: 'Mijozlar', href: '/support/customers' },
];

export default function SupportLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, authChecked } = useStore();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    // LOGIN REMOVED — no /auth/login anymore. Wait for the silent Telegram
    // auto-login to settle (authChecked) before bouncing guests home.
    // DEMO MODE: rol sahifa yo'nalishidan keladi (layout avtomatik demo-login
    // qiladi) — rol mos kelmaguncha sahifani ko'rsatmaymiz, lekin otib
    // yubormaymiz (aks holda rol almashish paytida aylanma yo'nalish bo'ladi).
    if (!token && authChecked) {
      router.push('/');
    }
  }, [user, router, authChecked]);

  if (!user || !['support', 'operator', 'senior_operator', 'admin', 'super_admin'].includes(user.role)) {
    return null;
  }

  return (
    <div className="min-h-screen flex pt-20">
      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-20 bottom-0 z-30 transition-all duration-300 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="h-full glass-card rounded-none border-l-0 border-t-0 border-b-0 p-4 flex flex-col">
          {/* Toggle */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="self-end p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00F5FF] transition-all duration-200 mb-4"
          >
            {isCollapsed ? <FiChevronRight className="w-4 h-4" /> : <FiChevronLeft className="w-4 h-4" />}
          </button>

          {/* Support badge */}
          <div className="px-3 py-2 mb-4 rounded-xl bg-teal-500/10 border border-teal-500/20">
            <p className="text-xs text-teal-400 font-medium">Support panel</p>
            <p className="text-[10px] text-[#64748B]">{user.username}</p>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1">
            {sidebarItems.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/support' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-teal-500/10 text-teal-400 border border-teal-500/20'
                      : 'text-[#64748B] hover:text-white hover:bg-white/5'
                  }`}
                  title={isCollapsed ? item.label : undefined}
                >
                  <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-teal-400' : ''}`} />
                  {!isCollapsed && <span>{item.label}</span>}
                </Link>
              );
            })}
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
            {!isCollapsed && <span>Chiqish</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 transition-all duration-300 ${isCollapsed ? 'ml-20' : 'ml-64'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
