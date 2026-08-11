'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useStore, getPanelByRole } from '@/lib/store';
import { FiSearch, FiUser, FiLogOut, FiMenu, FiX, FiShoppingBag, FiChevronDown, FiLayout, FiDollarSign, FiZap } from 'react-icons/fi';
import toast from 'react-hot-toast';

export default function Header() {
  const { user, isAuthenticated, logout } = useStore();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { serviceAPI } = await import('@/lib/api');
        const res = await serviceAPI.list({ search: searchQuery });
        setSearchResults(res.data.results || res.data);
      } catch (e) { toast.error('Qidiruv vaqtida xatolik yuz berdi'); }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-[#0F172A]/90 backdrop-blur-xl border-b border-[#00F5FF]/10 shadow-lg shadow-[#00F5FF]/5'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <div className="w-10 h-10 rounded-xl overflow-hidden ring-1 ring-[#00F5FF]/30 group-hover:shadow-lg group-hover:shadow-[#00F5FF]/30 transition-all duration-300">
              <img src="/images/donzo.png" alt="DONZO" className="w-full h-full object-cover" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-[#00F5FF] to-[#A855F7] bg-clip-text text-transparent">
              DONZO
            </span>
          </Link>

          {/* Desktop Navigation — only for customer/unauthenticated users */}
          <nav className="hidden md:flex items-center gap-8">
            {(!isAuthenticated || user?.role === 'customer' || !user) ? (
              <>
                <Link
                  href="/"
                  className="text-[#94A3B8] hover:text-[#00F5FF] transition-colors duration-200 text-sm font-medium"
                >
                  Bosh sahifa
                </Link>
                <Link
                  href="/#services"
                  className="text-[#94A3B8] hover:text-[#00F5FF] transition-colors duration-200 text-sm font-medium"
                >
                  Xizmatlar
                </Link>
                {isAuthenticated && (
                  <Link
                    href="/orders"
                    className="text-[#94A3B8] hover:text-[#00F5FF] transition-colors duration-200 text-sm font-medium"
                  >
                    Buyurtmalarim
                  </Link>
                )}
              </>
            ) : (
              <Link
                href={getPanelByRole(user.role)}
                className="text-[#00F5FF] hover:text-white transition-colors duration-200 text-sm font-medium flex items-center gap-2"
              >
                <FiLayout className="w-4 h-4" />
                Panelga o'tish
              </Link>
            )}
          </nav>

          {/* Right Side */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="relative" ref={searchRef}>
              <button
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                className="p-2.5 rounded-xl hover:bg-white/5 text-[#94A3B8] hover:text-[#00F5FF] transition-all duration-200"
              >
                <FiSearch className="w-5 h-5" />
              </button>

              {isSearchOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 glass-card p-3 animate-fade-in">
                  <input
                    type="text"
                    placeholder="Qidirish... (diamond, premium...)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="glass-input text-sm"
                    autoFocus
                  />
                  {searchResults.length > 0 && (
                    <div className="mt-2 space-y-1 max-h-60 overflow-y-auto">
                      {searchResults.map((service: any) => (
                        <Link
                          key={service.id}
                          href={`/services/${service.slug}`}
                          onClick={() => { setIsSearchOpen(false); setSearchQuery(''); }}
                          className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-white/5 transition-colors duration-200"
                        >
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center text-xs font-bold text-[#00F5FF]">
                            {service.name.charAt(0)}
                          </div>
                          <div>
                            <div className="text-sm text-white font-medium">{service.name}</div>
                            <div className="text-xs text-[#64748B]">{service.category_name}</div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User Menu */}
            {isAuthenticated && user ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-2 rounded-xl hover:bg-white/5 transition-all duration-200"
                >
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center">
                    <FiUser className="w-4 h-4 text-[#00F5FF]" />
                  </div>
                  <span className="hidden sm:block text-sm text-white">{user.username}</span>
                  <FiChevronDown className="w-3 h-3 text-[#64748B]" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 top-full mt-2 w-56 glass-card p-2 animate-fade-in border border-[#00F5FF]/10">
                    {/* User Info */}
                    <div className="px-3 py-3 mb-1 border-b border-white/5">
                      <p className="text-sm font-medium text-white">{user.username}</p>
                      <p className="text-xs text-[#64748B]">{user.email}</p>
                      {user.role === 'customer' && (
                        <div className="mt-1.5 flex items-center gap-1 text-xs">
                          <FiDollarSign className="w-3 h-3 text-[#00F5FF]" />
                          <span className="text-[#00F5FF] font-semibold">{Number(user.balance || 0).toLocaleString()} so'm</span>
                        </div>
                      )}
                    </div>

                    {/* Customer users see full menu */}
                    {user.role === 'customer' && (
                      <>
                        <Link
                          href="/dashboard"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-sm text-[#94A3B8] hover:text-white transition-all duration-200"
                        >
                          <FiLayout className="w-4 h-4" />
                          Dashboard
                        </Link>
                        <Link
                          href="/balance"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-sm text-[#94A3B8] hover:text-white transition-all duration-200"
                        >
                          <FiDollarSign className="w-4 h-4" />
                          Balans to'ldirish
                        </Link>
                        <Link
                          href="/orders"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-sm text-[#94A3B8] hover:text-white transition-all duration-200"
                        >
                          <FiShoppingBag className="w-4 h-4" />
                          Buyurtmalarim
                        </Link>
                        <Link
                          href="/profile"
                          onClick={() => setShowUserMenu(false)}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 text-sm text-[#94A3B8] hover:text-white transition-all duration-200"
                        >
                          <FiUser className="w-4 h-4" />
                          Profil
                        </Link>
                        <hr className="my-1 border-[#00F5FF]/10" />
                      </>
                    )}
                    {user.role !== 'customer' && (
                      <Link
                        href={getPanelByRole(user.role)}
                        onClick={() => setShowUserMenu(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-[#00F5FF]/5 text-sm text-[#00F5FF] hover:bg-[#00F5FF]/10 transition-all duration-200 font-medium"
                      >
                        <FiLayout className="w-4 h-4" />
                        Panelga o'tish
                      </Link>
                    )}
                    <hr className="my-1 border-[#00F5FF]/10" />
                    <button
                      onClick={() => { logout(); setShowUserMenu(false); }}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-red-500/10 text-sm text-red-400 hover:text-red-300 transition-all duration-200 w-full"
                    >
                      <FiLogOut className="w-4 h-4" />
                      Chiqish
                    </button>
                  </div>
                )}
              </div>
            ) : null}

            {/* Mobile Menu Button */}
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2.5 rounded-xl hover:bg-white/5 text-[#94A3B8] hover:text-[#00F5FF] transition-all duration-200"
            >
              {isMobileMenuOpen ? <FiX className="w-5 h-5" /> : <FiMenu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden pb-4 animate-fade-in">
            <div className="glass-card p-4 space-y-2">
              {(!isAuthenticated || user?.role === 'customer' || !user) ? (
                <>
                  <Link
                    href="/"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block p-3 rounded-lg hover:bg-white/5 text-[#94A3B8] hover:text-white transition-all duration-200"
                  >
                    Bosh sahifa
                  </Link>
                  <Link
                    href="/#services"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="block p-3 rounded-lg hover:bg-white/5 text-[#94A3B8] hover:text-white transition-all duration-200"
                  >
                    Xizmatlar
                  </Link>
                  {isAuthenticated && (
                    <Link
                      href="/orders"
                      onClick={() => setIsMobileMenuOpen(false)}
                      className="block p-3 rounded-lg hover:bg-white/5 text-[#94A3B8] hover:text-white transition-all duration-200"
                    >
                      Buyurtmalarim
                    </Link>
                  )}
                  {/* Login removed entirely — no login buttons in mobile menu */}
                </>
              ) : (
                <Link
                  href={getPanelByRole(user.role)}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center gap-3 p-3 rounded-lg bg-[#00F5FF]/5 text-[#00F5FF] font-medium transition-all duration-200"
                >
                  <FiLayout className="w-5 h-5" />
                  Panelga o'tish
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
