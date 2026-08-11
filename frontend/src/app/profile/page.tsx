'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FiUser, FiMail, FiPhone, FiPackage, FiArrowRight, FiEdit2, FiSave, FiTrendingUp, FiLayout, FiShoppingBag, FiStar, FiDollarSign, FiLogOut, FiAlertTriangle } from 'react-icons/fi';
import { useStore } from '@/lib/store';
import { authAPI, orderStatsAPI } from '@/lib/api';
import ProfileStats from '@/components/ProfileStats';
import ReferralSection from '@/components/ReferralSection';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, logout, setUser } = useStore();
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', phone: '', first_name: '', last_name: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [totalSpent, setTotalSpent] = useState<number | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const handleLogout = () => {
    setConfirmLogout(false);
    logout();
    toast.success('Hisobdan chiqdingiz');
    // Guests browse the site freely — send them home (LoginGate prompts when
    // they hit a protected section again), not to a staff login page.
    router.push('/');
  };

  useEffect(() => {
    if (user) {
      setForm({
        username: user.username,
        email: user.email,
        phone: user.phone || '',
        first_name: user.first_name || '',
        last_name: user.last_name || '',
      });
    }
  }, [user]);

  // Total spend for the "Jami sarf" card
  useEffect(() => {
    if (isAuthenticated) {
      orderStatsAPI.get()
        .then((res) => setTotalSpent(res.data?.overall?.total_spent ?? null))
        .catch(() => setTotalSpent(null));
    }
  }, [isAuthenticated]);

  // Refetch the profile on mount so async-enriched Fragment data (Telegram
  // Premium, avatar, name) — which lands a moment AFTER login — shows up.
  useEffect(() => {
    if (isAuthenticated && user) {
      authAPI.profile()
        .then((res) => {
          if (res.data && JSON.stringify(res.data) !== JSON.stringify(user)) {
            setUser({ ...user, ...res.data });
          }
        })
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  // ── Fragment sync backstop (faqat oddiy brauzer) ────────────────────────
  // Telegram ichida TelegramAutoLogin (STEP 3b) har ochilishda force-sync
  // qiladi — bu yerda qayta chaqirilmaydi (ortiqcha dublikat yo'q). Lekin
  // oddiy brauzerda TelegramAutoLogin ishlamaydi, shuning uchun profil
  // sahifasi backstop vazifasini bajaradi: har session'da faqat BIR marta
  // Fragment API'dan jonli ma'lumot (ism, avatar, Premium) olinadi.
  useEffect(() => {
    if (!isAuthenticated || !user) return;
    try {
      if (sessionStorage.getItem('fragment_synced_once')) return;
      sessionStorage.setItem('fragment_synced_once', '1');
    } catch { /* storage o'chirilgan bo'lsa — har safar urinamiz */ }
    authAPI.syncFragment()
      .then((res) => {
        const fresh = res?.data?.user;
        if (fresh) {
          const { user: current } = useStore.getState();
          if (current) setUser({ ...current, ...fresh });
        }
      })
      .catch(() => {
        try { sessionStorage.removeItem('fragment_synced_once'); } catch { /* noop */ }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]);

  const copyReferral = () => {
    if (user?.referral_code) {
      navigator.clipboard.writeText(user.referral_code);
      toast.success('Referral kod nusxalandi');
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await authAPI.updateProfile(form);
      // Refresh the store so the card + 'Shaxsiy ma'lumotlar' update immediately
      if (user && res.data) {
        setUser({ ...user, ...res.data });
      }
      toast.success('Profil yangilandi');
      setIsEditing(false);
    } catch (e: any) {
      toast.error('Xatolik yuz berdi');
    } finally {
      setIsSaving(false);
    }
  };

  // DEMO MODE: layout avtomatik demo-login qiladi — yuklanayotganda spinner.
  if (!isAuthenticated || !user) {
    return <div className="px-4 pt-6 pb-6"><div className="max-w-md mx-auto glass-card p-8 text-center text-sm text-[#9CA3AF]">Yuklanmoqda...</div></div>;
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <div className="max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* ═══ User Card ═══ */}
          <div className="glass-card p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-[#2DD4BF]/8 to-[#6366F1]/10 rounded-full blur-[60px]" />
            <div className="relative z-10 flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#2DD4BF] to-[#6366F1] flex items-center justify-center text-[#081018] font-bold text-2xl shadow-lg shadow-[#2DD4BF]/25 overflow-hidden">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    (user.first_name || user.username).charAt(0).toUpperCase()
                  )}
                </div>
                {user.is_telegram_premium && (
                  <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-[#229ED9] to-[#2AABEE] border-2 border-[#0B1220] flex items-center justify-center text-[10px] shadow-md" title="Telegram Premium">⭐</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-xl font-bold text-white truncate">
                  {user.first_name || user.username}
                </h1>
                <p className="text-[#9CA3AF] text-sm truncate">
                  {user.telegram_username ? `@${user.telegram_username}` : user.username}
                </p>
                {user.telegram_id && (
                  <p className="text-[#64748B] text-xs">Telegram ID: {user.telegram_id}</p>
                )}
                {user.is_telegram_premium && (
                  <p className="text-[11px] text-[#2AABEE] font-medium mt-0.5 flex items-center gap-1">
                    ⭐ Telegram Premium
                  </p>
                )}
                <div className="flex items-center gap-2 mt-2">
                  <span className={`px-3 py-1 rounded-full text-xs border ${
                    user.role === 'super_admin' ? 'bg-purple-500/10 text-purple-300 border-purple-500/20' :
                    user.role === 'admin' ? 'bg-blue-500/10 text-blue-300 border-blue-500/20' :
                    user.role === 'senior_operator' ? 'bg-[#6366F1]/10 text-[#818CF8] border-[#6366F1]/20' :
                    user.role === 'operator' ? 'bg-[#6366F1]/10 text-[#818CF8] border-[#6366F1]/20' :
                    user.role === 'support' ? 'bg-teal-500/10 text-teal-300 border-teal-500/20' :
                    user.role === 'customer' ? 'bg-[#2DD4BF]/10 text-[#2DD4BF] border-[#2DD4BF]/20' :
                    'bg-white/5 text-[#9CA3AF] border-white/10'
                  }`}>
                    {user.role === 'super_admin' ? 'Super Admin' :
                     user.role === 'admin' ? 'Admin' :
                     user.role === 'senior_operator' ? 'Senior Operator' :
                     user.role === 'operator' ? 'Operator' :
                     user.role === 'support' ? 'Support Agent' :
                     user.role === 'customer' ? 'Mijoz' : user.role}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="glow-btn-outline flex items-center gap-2 px-3 py-2 text-xs"
              >
                <FiEdit2 className="w-3.5 h-3.5" />
                Tahrirlash
              </button>
            </div>
          </div>

          {/* ═══ Buyurtmalar Card ═══ */}
          <Link href="/orders" className="premium-stat flex items-center justify-between group cursor-pointer">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#2DD4BF]/15 to-[#6366F1]/15 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <FiPackage className="w-5 h-5 text-[#2DD4BF]" />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Buyurtmalarim</p>
                <p className="text-[11px] text-[#9CA3AF]">Barcha buyurtmalar tarixi</p>
              </div>
            </div>
            <FiArrowRight className="w-5 h-5 text-[#9CA3AF] group-hover:text-[#2DD4BF] group-hover:translate-x-1 transition-all duration-200" />
          </Link>

          {/* ═══ Star Sotish Button ═══ */}
          <Link href="/balance" className="pill-btn !py-4">
            <FiStar className="w-5 h-5" />
            Star sotish
          </Link>

          {/* ═══ Jami Sarf Card ═══ */}
          <div className="grid grid-cols-2 gap-3">
            <div className="premium-stat text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <FiDollarSign className="w-4 h-4 text-[#2DD4BF]" />
              </div>
              <p className="premium-stat-value gold">
                {totalSpent !== null ? Number(totalSpent).toLocaleString() : '—'}
              </p>
              <p className="premium-stat-label">Jami sarf (so'm)</p>
            </div>
            <Link href="/balance" className="premium-stat text-center group cursor-pointer">
              <p className="premium-stat-value">{Number(user.balance || 0).toLocaleString()}</p>
              <p className="premium-stat-label">Balans — to'ldirish →</p>
            </Link>
          </div>

          {/* ═══ Cashback quick card ═══ */}
          <div className="grid grid-cols-2 gap-3">
            <div className="premium-stat text-center">
              <p className="premium-stat-value">{Number(user.cashback_balance || 0).toLocaleString()}</p>
              <p className="premium-stat-label">Cashback</p>
            </div>
            <Link href="/balance" className="premium-stat flex items-center justify-center gap-2 group cursor-pointer">
              <FiTrendingUp className="w-5 h-5 text-[#2DD4BF] group-hover:scale-110 transition-transform" />
              <span className="text-sm font-medium gradient-text">To'ldirish</span>
            </Link>
          </div>

          {/* ═══ Referral Section (card, taklif qilganlar, daromad, ishlatish) ═══ */}
          <ReferralSection user={user} copyReferral={copyReferral} />

          {/* ═══ Edit Profile Form ═══ */}
          {isEditing ? (
            <div className="glass-card p-6">
              <h2 className="text-lg font-bold text-white mb-4">Profilni tahrirlash</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-2">Ism</label>
                  <input
                    type="text"
                    value={form.first_name}
                    onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                    className="glass-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-2">Familiya</label>
                  <input
                    type="text"
                    value={form.last_name}
                    onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                    className="glass-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-2">Username</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => setForm({ ...form, username: e.target.value })}
                    className="glass-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-2">Email</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="glass-input"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#9CA3AF] mb-2">Telefon</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="glass-input"
                  />
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="glow-btn flex items-center gap-2 px-6 py-3"
                  >
                    <FiSave className="w-4 h-4" />
                    {isSaving ? 'Saqlanmoqda...' : 'Saqlash'}
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="glow-btn-outline px-6 py-3"
                  >
                    Bekor qilish
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-card p-6">
              <h2 className="text-lg font-bold text-white mb-4">Shaxsiy ma'lumotlar</h2>
              <div className="space-y-4">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5">
                  <FiUser className="w-5 h-5 text-[#9CA3AF]" />
                  <div>
                    <p className="text-xs text-[#9CA3AF]">Ism</p>
                    <p className="text-sm text-white">
                      {[user.first_name, user.last_name].filter(Boolean).join(' ') || "Ko'rsatilmagan"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5">
                  <FiUser className="w-5 h-5 text-[#9CA3AF]" />
                  <div>
                    <p className="text-xs text-[#9CA3AF]">Telegram username</p>
                    <p className="text-sm text-white">
                      {user.telegram_username ? `@${user.telegram_username}` : "Ko'rsatilmagan"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5">
                  <FiUser className="w-5 h-5 text-[#9CA3AF]" />
                  <div>
                    <p className="text-xs text-[#9CA3AF]">Telegram ID</p>
                    <p className="text-sm text-white">{user.telegram_id || "Ko'rsatilmagan"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5">
                  <FiUser className="w-5 h-5 text-[#9CA3AF]" />
                  <div>
                    <p className="text-xs text-[#9CA3AF]">Username</p>
                    <p className="text-sm text-white">{user.username}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5">
                  <FiMail className="w-5 h-5 text-[#9CA3AF]" />
                  <div>
                    <p className="text-xs text-[#9CA3AF]">Email</p>
                    <p className="text-sm text-white">{user.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5">
                  <FiPhone className="w-5 h-5 text-[#9CA3AF]" />
                  <div>
                    <p className="text-xs text-[#9CA3AF]">Telefon</p>
                    <p className="text-sm text-white">{user.phone || "Ko'rsatilmagan"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Panel Links — Role-based ═══ */}
          <div className="space-y-2">
            <h2 className="text-lg font-bold text-white">Panelga o'tish</h2>

            {['super_admin'].includes(user.role) && (
              <Link
                href="/admin"
                className="glass-card p-5 flex items-center justify-between group hover:border-[#6366F1]/30 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366F1]/20 to-[#2DD4BF]/20 flex items-center justify-center">
                    <FiPackage className="w-6 h-6 text-[#6366F1]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Super Admin Panel</h3>
                    <p className="text-sm text-[#9CA3AF]">To'liq boshqaruv: xizmatlar, buyurtmalar, sozlamalar</p>
                  </div>
                </div>
                <FiArrowRight className="w-5 h-5 text-[#9CA3AF] group-hover:text-[#6366F1] group-hover:translate-x-1 transition-all duration-200" />
              </Link>
            )}

            {['admin'].includes(user.role) && (
              <Link
                href="/admin"
                className="glass-card p-5 flex items-center justify-between group hover:border-blue-400/30 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
                    <FiPackage className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Admin Panel</h3>
                    <p className="text-sm text-[#9CA3AF]">Xizmatlar, buyurtmalar va mijozlarni boshqarish</p>
                  </div>
                </div>
                <FiArrowRight className="w-5 h-5 text-[#9CA3AF] group-hover:text-blue-400 group-hover:translate-x-1 transition-all duration-200" />
              </Link>
            )}

            {['senior_operator'].includes(user.role) && (
              <Link
                href="/operator"
                className="glass-card p-5 flex items-center justify-between group hover:border-[#6366F1]/30 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366F1]/20 to-pink-500/20 flex items-center justify-center">
                    <FiShoppingBag className="w-6 h-6 text-[#6366F1]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Senior Operator Panel</h3>
                    <p className="text-sm text-[#9CA3AF]">Kengaytirilgan buyurtmalar boshqaruvi</p>
                  </div>
                </div>
                <FiArrowRight className="w-5 h-5 text-[#9CA3AF] group-hover:text-[#6366F1] group-hover:translate-x-1 transition-all duration-200" />
              </Link>
            )}

            {['operator'].includes(user.role) && (
              <Link
                href="/operator"
                className="glass-card p-5 flex items-center justify-between group hover:border-[#6366F1]/30 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366F1]/20 to-purple-500/20 flex items-center justify-center">
                    <FiShoppingBag className="w-6 h-6 text-[#6366F1]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Operator Panel</h3>
                    <p className="text-sm text-[#9CA3AF]">Buyurtmalarni ko'rish va boshqarish</p>
                  </div>
                </div>
                <FiArrowRight className="w-5 h-5 text-[#9CA3AF] group-hover:text-[#6366F1] group-hover:translate-x-1 transition-all duration-200" />
              </Link>
            )}

            {['support'].includes(user.role) && (
              <Link
                href="/support"
                className="glass-card p-5 flex items-center justify-between group hover:border-teal-400/30 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/20 to-emerald-500/20 flex items-center justify-center">
                    <FiShoppingBag className="w-6 h-6 text-teal-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Support Panel</h3>
                    <p className="text-sm text-[#9CA3AF]">Mijozlar va buyurtmalar bilan ishlash</p>
                  </div>
                </div>
                <FiArrowRight className="w-5 h-5 text-[#9CA3AF] group-hover:text-teal-400 group-hover:translate-x-1 transition-all duration-200" />
              </Link>
            )}

            {['customer'].includes(user.role) && (
              <Link
                href="/dashboard"
                className="glass-card p-4 flex items-center justify-between group hover:border-[#34D399]/30 transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#34D399]/20 to-emerald-500/20 flex items-center justify-center">
                    <FiLayout className="w-6 h-6 text-[#34D399]" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">Mening panelim</h3>
                    <p className="text-sm text-[#9CA3AF]">Buyurtmalarim, balans, profil</p>
                  </div>
                </div>
                <FiArrowRight className="w-5 h-5 text-[#9CA3AF] group-hover:text-[#34D399] group-hover:translate-x-1 transition-all duration-200" />
              </Link>
            )}

            {['guest'].includes(user.role) && (
              <div className="glass-card p-5 text-center">
                <p className="text-sm text-[#9CA3AF]">Panelga kirish uchun profilni to'ldiring</p>
              </div>
            )}
          </div>

          {/* ═══ Profile Stats & Charts ═══ */}
          <ProfileStats />

          {/* ═══ Logout Section ═══ */}
          <div className="pt-2">
            {confirmLogout ? (
              <div className="glass-card p-6 border-red-500/25 !bg-red-500/5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                    <FiAlertTriangle className="w-5 h-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Hisobdan chiqish</h3>
                    <p className="text-xs text-[#9CA3AF]">Haqiqatan ham chiqmoqchimisiz?</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleLogout}
                    className="flex-1 py-3 rounded-xl bg-red-500/90 text-white text-sm font-semibold hover:bg-red-500 transition-all duration-200 flex items-center justify-center gap-2"
                  >
                    <FiLogOut className="w-4 h-4" />
                    Ha, chiqish
                  </button>
                  <button
                    onClick={() => setConfirmLogout(false)}
                    className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white text-sm font-semibold hover:bg-white/10 transition-all duration-200"
                  >
                    Bekor qilish
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmLogout(true)}
                className="w-full glass-card p-5 flex items-center justify-center gap-3 group hover:border-red-500/30 hover:bg-red-500/5 transition-all duration-300"
              >
                <FiLogOut className="w-5 h-5 text-red-400 group-hover:scale-110 transition-transform duration-200" />
                <span className="text-sm font-semibold text-red-400 group-hover:text-red-300">Hisobdan chiqish</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
