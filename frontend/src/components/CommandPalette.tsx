'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { FiSearch, FiUsers, FiShoppingBag, FiGrid, FiLayout, FiSettings, FiLogOut, FiX, FiKey, FiSend } from 'react-icons/fi';
import { adminAPI, orderAPI } from '@/lib/api';

const ADMIN_PAGES = [
  { href: '/admin', label: 'CRM Dashboard', icon: FiLayout },
  { href: '/admin/analytics', label: 'Analitika', icon: FiGrid },
  { href: '/admin/orders', label: 'Buyurtmalar', icon: FiShoppingBag },
  { href: '/admin/payments', label: 'To\'lovlar', icon: FiShoppingBag },
  { href: '/admin/promocodes', label: 'Promo Kodlar', icon: FiGrid },
  { href: '/admin/services', label: 'Xizmatlar', icon: FiGrid },
  { href: '/admin/categories', label: 'Kategoriyalar', icon: FiGrid },
  { href: '/admin/customers', label: 'Foydalanuvchilar', icon: FiUsers },
  { href: '/admin/keys', label: 'Kalitlar', icon: FiKey },
  { href: '/admin/bot', label: 'Bot holati', icon: FiSend },
  { href: '/admin/settings', label: 'Sozlamalar', icon: FiSettings },
];

interface PaletteItem {
  type: 'page' | 'user' | 'order';
  label: string;
  sub?: string;
  href: string;
  icon: React.ComponentType<any>;
}

export default function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<PaletteItem[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Ctrl+K / Cmd+K toggle + custom open event (used by the sidebar quick-search button)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((v) => !v);
      }
      if (e.key === 'Escape') setIsOpen(false);
    };
    const openHandler = () => setIsOpen(true);
    window.addEventListener('keydown', handler);
    window.addEventListener('open-command-palette', openHandler);
    return () => {
      window.removeEventListener('keydown', handler);
      window.removeEventListener('open-command-palette', openHandler);
    };
  }, []);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setItems(ADMIN_PAGES.map((p) => ({ type: 'page', label: p.label, href: p.href, icon: p.icon })));
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Debounced search across users + orders
  useEffect(() => {
    if (!query.trim()) {
      setItems(ADMIN_PAGES.map((p) => ({ type: 'page', label: p.label, href: p.href, icon: p.icon })));
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results: PaletteItem[] = [];
        // Users
        const usersRes = await adminAPI.get('/admin/users/', { params: { search: query, page_size: 5 } });
        const users = usersRes.data.results || usersRes.data || [];
        users.slice(0, 5).forEach((u: any) => {
          results.push({
            type: 'user',
            label: `@${u.username}`,
            sub: `${u.email} — ${Number(u.balance || 0).toLocaleString()} so'm`,
            href: `/admin/customers?user=${u.id}`,
            icon: FiUsers,
          });
        });
        // Orders
        const ordersRes = await orderAPI.adminList({ search: query, page_size: 5 });
        const orders = ordersRes.data.results || ordersRes.data || [];
        orders.slice(0, 5).forEach((o: any) => {
          results.push({
            type: 'order',
            label: `#${o.order_number}`,
            sub: `${o.service_name || o.service?.name || 'Xizmat'} — ${Number(o.total_price || 0).toLocaleString()} so'm`,
            href: `/admin/orders?search=${o.order_number}`,
            icon: FiShoppingBag,
          });
        });
        setItems(results.length ? results : ADMIN_PAGES.map((p) => ({ type: 'page', label: p.label, href: p.href, icon: p.icon })));
      } catch (e) {
        setItems(ADMIN_PAGES.map((p) => ({ type: 'page', label: p.label, href: p.href, icon: p.icon })));
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && items[activeIndex]) {
      router.push(items[activeIndex].href);
      setIsOpen(false);
    }
  };

  const navigate = useCallback((href: string) => {
    router.push(href);
    setIsOpen(false);
  }, [router]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4"
          onClick={() => setIsOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: -10 }}
            transition={{ duration: 0.18 }}
            className="w-full max-w-lg glass-deep rounded-2xl overflow-hidden border-[#00F5FF]/15"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Input */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-white/5">
              <FiSearch className="w-5 h-5 text-[#00F5FF] flex-shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActiveIndex(0); }}
                onKeyDown={handleKeyDown}
                placeholder="Qidirish: foydalanuvchi, buyurtma yoki sahifa..."
                className="flex-1 bg-transparent outline-none text-white text-sm placeholder:text-[#64748B]"
              />
              {isSearching && <div className="w-4 h-4 border-2 border-[#00F5FF]/30 border-t-[#00F5FF] rounded-full animate-spin flex-shrink-0" />}
              <button onClick={() => setIsOpen(false)} className="p-1 rounded-lg hover:bg-white/5 text-[#64748B]">
                <FiX className="w-4 h-4" />
              </button>
            </div>

            {/* Results */}
            <div className="max-h-80 overflow-y-auto p-2">
              {items.length === 0 ? (
                <p className="text-center py-10 text-sm text-[#64748B]">Hech narsa topilmadi</p>
              ) : (
                items.map((item, i) => (
                  <button
                    key={`${item.type}-${item.label}-${i}`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => navigate(item.href)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                      i === activeIndex ? 'bg-[#00F5FF]/10 border border-[#00F5FF]/20' : 'border border-transparent'
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      item.type === 'user' ? 'bg-[#A855F7]/15 text-[#A855F7]' :
                      item.type === 'order' ? 'bg-emerald-500/15 text-emerald-400' :
                      'bg-[#00F5FF]/15 text-[#00F5FF]'
                    }`}>
                      <item.icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-white truncate">{item.label}</p>
                      {item.sub && <p className="text-xs text-[#64748B] truncate">{item.sub}</p>}
                    </div>
                    {item.type === 'page' && <FiSearch className="w-3.5 h-3.5 text-[#64748B] opacity-0 group-hover:opacity-100" />}
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-5 py-3 border-t border-white/5 text-[10px] text-[#64748B]">
              <span className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">↑</kbd>
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">↓</kbd>
                harakat
                <kbd className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 ml-2">Enter</kbd>
                ochish
              </span>
              <button onClick={() => { localStorage.removeItem('access_token'); localStorage.removeItem('refresh_token'); window.location.href = '/'; }} className="flex items-center gap-1.5 hover:text-red-400 transition-colors">
                <FiLogOut className="w-3 h-3" /> Chiqish
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
