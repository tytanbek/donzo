'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend,
} from 'recharts';
import {
  FiX, FiUser, FiShoppingBag, FiCreditCard, FiActivity, FiAward,
  FiClock, FiCheckCircle, FiXCircle, FiDollarSign, FiGift,
  FiRefreshCw, FiShield, FiTrendingUp, FiCopy, FiBox, FiCalendar, FiBarChart2,
} from 'react-icons/fi';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';

const CHART_COLORS = ['#00F5FF', '#A855F7', '#FFD700', '#10B981', '#F97316', '#3B82F6', '#EF4444', '#EC4899'];

const STATUS_LABELS: Record<string, string> = {
  pending: 'Kutilmoqda',
  processing: 'Bajarilmoqda',
  completed: 'Tugallangan',
  cancelled: 'Bekor qilingan',
};

const PAY_LABELS: Record<string, string> = {
  unpaid: "To'lanmagan",
  paid: "To'langan",
  refunded: 'Qaytarilgan',
};

const TX_LABELS: Record<string, string> = {
  topup: "To'ldirish",
  purchase: 'Xarid',
  cashback: 'Cashback',
  cashback_claim: 'Cashback balansga o\'tkazildi',
  referral_gift: 'Referal sovg\'a',
  admin: 'Admin tuzatmasi',
  refund: 'Qaytarildi',
};

const TX_STATUS_LABELS: Record<string, string> = {
  pending: 'Kutilmoqda',
  completed: 'Tugallangan',
  failed: 'Xatolik',
  cancelled: 'Bekor qilingan',
};

import { roleLabels, roleColors } from '@/lib/roles';

const fmtDate = (v: any) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('uz-UZ');
};
const fmtDay = (v: any) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('uz-UZ');
};
const money = (n: any) => `${Number(n || 0).toLocaleString('uz-UZ')} so'm`;
const fmtNum = (n: any) => Number(n || 0).toLocaleString('uz-UZ');

const TooltipStyle = {
  background: '#0F172A',
  border: '1px solid rgba(0,245,255,0.2)',
  borderRadius: 12,
  color: '#F8FAFC',
  fontSize: 12,
  boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
};

const TABS = [
  { key: 'general', label: 'Umumiy', icon: FiUser },
  { key: 'orders', label: 'Buyurtmalar', icon: FiShoppingBag },
  { key: 'payments', label: "To'lovlar", icon: FiCreditCard },
  { key: 'activity', label: 'Faollik', icon: FiActivity },
];

export default function AdminUserProfileModal({ user, onClose }: { user: any; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('general');

  const load = async () => {
    setIsLoading(true);
    try {
      const res = await adminAPI.get(`/admin/users/${user.id}/profile/`);
      setData(res.data);
    } catch (e) {
      toast.error("Profil ma'lumotlarini yuklashda xatolik");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { load(); }, [user.id]);

  // ESC bilan yopish
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const u = data?.user || user;
  const s = data?.summary || {};
  const activity = data?.activity || { monthly: [], top_services: [] };
  const maxService = Math.max(...(activity.top_services || []).map((t: any) => t.count || 0), 1);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 16 }}
        transition={{ duration: 0.2 }}
        className="relative w-full max-w-4xl max-h-[92vh] overflow-hidden rounded-2xl border border-white/10 bg-[#0B1220] shadow-2xl flex flex-col"
      >
        {/* ═══ Header ═══ */}
        <div className="relative px-6 pt-6 pb-5 border-b border-white/5 bg-gradient-to-br from-[#00F5FF]/10 via-transparent to-[#A855F7]/10">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-white transition-all"
            title="Yopish (Esc)"
          >
            <FiX className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-4">
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00F5FF]/25 to-[#A855F7]/25 flex items-center justify-center text-2xl font-bold text-[#00F5FF] overflow-hidden">
                {u.avatar_url ? (
                  <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  (u.first_name || u.username || '?').charAt(0).toUpperCase()
                )}
              </div>
              {u.is_telegram_premium && (
                <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-[#229ED9] to-[#2AABEE] border-2 border-[#0B1220] flex items-center justify-center text-[10px]" title="Telegram Premium">⭐</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold text-white truncate">{u.first_name || u.username}</h2>
                {u.is_telegram_premium && (
                  <span className="px-2 py-0.5 rounded-lg bg-[#2AABEE]/15 text-[#2AABEE] border border-[#2AABEE]/25 text-[10px] font-semibold">⭐ PREMIUM</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 flex-wrap text-sm">
                <span className="text-[#00F5FF]/90 font-medium">@{u.telegram_username || u.username || '—'}</span>
                <span className="text-[#64748B] flex items-center gap-1">
                  <FiShield className="w-3.5 h-3.5" /> ID: {u.telegram_id || '—'}
                </span>
                {u.language_code && (
                  <span className="text-[#64748B]">🌐 {String(u.language_code).toUpperCase()}</span>
                )}
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${roleColors[u.role] || 'bg-white/5 text-[#64748B]'}`}>
                  {roleLabels[u.role] || u.role}
                </span>
              </div>
            </div>
          </div>

          {/* Quick summary chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-5">
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
              <p className="text-[10px] text-[#64748B]">Jami sarf</p>
              <p className="text-sm font-bold text-[#00F5FF] mt-0.5">{money(s.total_spent)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
              <p className="text-[10px] text-[#64748B]">Buyurtmalar</p>
              <p className="text-sm font-bold text-white mt-0.5">{fmtNum(s.total_orders)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
              <p className="text-[10px] text-[#64748B]">O'rtacha buyurtma</p>
              <p className="text-sm font-bold text-white mt-0.5">{money(s.avg_order_price)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/5">
              <p className="text-[10px] text-[#64748B]">Referallar</p>
              <p className="text-sm font-bold text-white mt-0.5">{fmtNum(s.referrals_count)}</p>
            </div>
          </div>
        </div>

        {/* ═══ Tabs ═══ */}
        <div className="flex gap-1.5 px-6 pt-4 pb-0 border-b border-white/5 bg-white/[0.01] overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl text-xs font-semibold transition-all whitespace-nowrap border-b-2 ${
                activeTab === t.key
                  ? 'text-[#00F5FF] border-[#00F5FF] bg-[#00F5FF]/5'
                  : 'text-[#64748B] border-transparent hover:text-white hover:bg-white/5'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
              {t.key === 'orders' && s.total_orders > 0 && (
                <span className="px-1.5 py-0.5 rounded-md bg-white/10 text-[9px]">{fmtNum(s.total_orders)}</span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ Content ═══ */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-24"><div className="loading-spinner" /></div>
          ) : (
            <AnimatePresence mode="wait">
              {/* ─── GENERAL ─── */}
              {activeTab === 'general' && (
                <motion.div key="general" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-6">
                  {/* KPI grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <FiCheckCircle className="w-4 h-4 text-green-400 mb-2" />
                      <p className="text-lg font-bold text-white">{fmtNum(s.completed_orders)}</p>
                      <p className="text-[11px] text-[#64748B]">Tugallangan</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <FiClock className="w-4 h-4 text-yellow-400 mb-2" />
                      <p className="text-lg font-bold text-white">{fmtNum((s.pending_orders || 0) + (s.processing_orders || 0))}</p>
                      <p className="text-[11px] text-[#64748B]">Kutilmoqda / Bajarilmoqda</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <FiXCircle className="w-4 h-4 text-red-400 mb-2" />
                      <p className="text-lg font-bold text-white">{fmtNum(s.cancelled_orders)}</p>
                      <p className="text-[11px] text-[#64748B]">Bekor qilingan</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <FiGift className="w-4 h-4 text-pink-400 mb-2" />
                      <p className="text-lg font-bold text-white">{money(s.referral_earnings)}</p>
                      <p className="text-[11px] text-[#64748B]">Referal daromad</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <FiAward className="w-4 h-4 text-orange-400 mb-2" />
                      <p className="text-lg font-bold text-white">{money(s.cashback_balance)}</p>
                      <p className="text-[11px] text-[#64748B]">Cashback balansi</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <FiTrendingUp className="w-4 h-4 text-cyan-400 mb-2" />
                      <p className="text-lg font-bold text-white truncate">{s.top_service || '—'}</p>
                      <p className="text-[11px] text-[#64748B]">Top xizmat</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <FiCalendar className="w-4 h-4 text-blue-400 mb-2" />
                      <p className="text-sm font-bold text-white leading-tight">{fmtDay(s.first_order_at)}</p>
                      <p className="text-[11px] text-[#64748B]">Birinchi buyurtma</p>
                    </div>
                    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                      <FiClock className="w-4 h-4 text-purple-400 mb-2" />
                      <p className="text-sm font-bold text-white leading-tight">{fmtDate(s.last_order_at)}</p>
                      <p className="text-[11px] text-[#64748B]">Oxirgi buyurtma</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Fragment API block */}
                    <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4">
                      <p className="text-xs font-semibold text-sky-400 mb-3 flex items-center gap-1.5">
                        <FiRefreshCw className="w-3.5 h-3.5" /> Fragment API ma'lumotlari
                      </p>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-[10px] text-[#64748B]">Telegram Username</p>
                          <p className="text-white font-medium truncate">@{u.telegram_username || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Telegram ID</p>
                          <p className="text-white font-medium truncate">{u.telegram_id || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Ism (getInfo)</p>
                          <p className="text-white font-medium truncate">{u.first_name || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Premium</p>
                          <p className="font-medium">
                            {u.is_telegram_premium
                              ? <span className="text-[#2AABEE]">⭐ Premium</span>
                              : <span className="text-[#64748B]">Yo'q</span>}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Til</p>
                          <p className="text-white font-medium">{u.language_code?.toUpperCase() || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Oxirgi sync</p>
                          <p className="text-white font-medium truncate">{fmtDate(u.fragment_synced_at)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Email</p>
                          <p className="text-white font-medium truncate">{u.email || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Telefon</p>
                          <p className="text-white font-medium truncate">{u.phone || '—'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Referral block */}
                    <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 p-4">
                      <p className="text-xs font-semibold text-purple-400 mb-3 flex items-center gap-1.5">
                        <FiGift className="w-3.5 h-3.5" /> Referral
                      </p>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <p className="text-[10px] text-[#64748B]">Referral kod</p>
                          <p className="text-white font-medium flex items-center gap-1.5">
                            {u.referral_code || '—'}
                            {u.referral_code && (
                              <button
                                onClick={() => { navigator.clipboard.writeText(u.referral_code); toast.success('Referral kod nusxalandi'); }}
                                className="p-1 rounded-md bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-white transition-all"
                              >
                                <FiCopy className="w-3 h-3" />
                              </button>
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Taklif qilgan</p>
                          <p className="text-white font-medium truncate">@{u.referred_by || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Referallar soni</p>
                          <p className="text-white font-medium">{fmtNum(s.referrals_count)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Referal daromad</p>
                          <p className="text-white font-medium">{money(s.referral_earnings)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Account info */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-xs font-semibold text-[#94A3B8] mb-3 flex items-center gap-1.5">
                      <FiBox className="w-3.5 h-3.5" /> Hisob ma'lumotlari
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <p className="text-[10px] text-[#64748B]">Balans</p>
                        <p className="text-white font-medium">{money(u.balance)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#64748B]">Ro'yxatdan o'tgan</p>
                        <p className="text-white font-medium">{fmtDate(u.created_at)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#64748B]">Oxirgi kirish</p>
                        <p className="text-white font-medium">{fmtDate(u.last_login)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[#64748B]">Holat</p>
                        <p className={`font-medium ${u.is_active === false ? 'text-red-400' : 'text-green-400'}`}>
                          {u.is_active === false ? 'Bloklangan' : u.is_blacklisted ? 'Qora ro\'yxatda' : 'Faol'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* ─── ANTI-FRAUD: qurilma / joylashuv / IP ─── */}
                  <div className="rounded-xl border border-red-500/20 bg-red-500/[0.03] p-4">
                    <p className="text-xs font-semibold text-red-400 mb-3 flex items-center gap-1.5">
                      <FiShield className="w-3.5 h-3.5" /> Xavfsizlik — qurilma va joylashuv
                    </p>
                    {!u.last_ip && !u.last_platform && !u.last_location && u.geo_lat == null ? (
                      <p className="text-xs text-[#64748B]">Hali ma'lumot yig'ilmagan (foydalanuvchi hali kirmagan yoki metadata kelmagan)</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                        <div>
                          <p className="text-[10px] text-[#64748B]">Oxirgi IP</p>
                          <p className="text-white font-mono font-medium truncate">{u.last_ip || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">IP bo'yicha joylashuv</p>
                          <p className="text-white font-medium">{u.last_ip_location || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Qurilma (platforma)</p>
                          <p className="text-white font-medium truncate">{u.last_platform || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Til</p>
                          <p className="text-white font-medium">{u.last_language || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Vaqt mintaqasi</p>
                          <p className="text-white font-medium truncate">{u.last_timezone || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Oxirgi faollik</p>
                          <p className="text-white font-medium">{fmtDate(u.last_seen_at)}</p>
                        </div>
                        <div className="col-span-2 sm:col-span-4">
                          <p className="text-[10px] text-[#64748B]">To'liq manzil (ko'cha, tuman, shahar)</p>
                          <p className="text-white font-medium">{u.last_location || '—'}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Kenglik (lat)</p>
                          <p className="text-white font-mono font-medium">
                            {u.geo_lat != null ? Number(u.geo_lat).toFixed(6) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] text-[#64748B]">Uzunlik (lng)</p>
                          <p className="text-white font-mono font-medium">
                            {u.geo_lng != null ? Number(u.geo_lng).toFixed(6) : '—'}
                          </p>
                        </div>
                        <div className="col-span-2 sm:col-span-4">
                          <p className="text-[10px] text-[#64748B]">User-Agent</p>
                          <p className="text-white/70 font-mono text-[10px] break-all leading-relaxed">{u.last_user_agent || '—'}</p>
                        </div>
                      </div>
                    )}

                    {/* GPS xaritasi — qurilmadan aniq joylashuv (geo_source='gps') yoki IP taxminiy */}
                    {u.geo_lat != null && u.geo_lng != null && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                          <p className="text-[10px] text-[#64748B]">
                            {u.geo_source === 'gps' ? (
                              <span className="text-[#34D399]">📍 Geolokatsiya — GPS (qurilmadan aniq)</span>
                            ) : u.geo_source === 'ip' ? (
                              <span className="text-amber-400">📍 Geolokatsiya — IP (taxminiy, GPS ruxsati berilmagan)</span>
                            ) : (
                              <span>📍 Geolokatsiya</span>
                            )}
                          </p>
                          <a
                            href={`https://www.google.com/maps?q=${Number(u.geo_lat)},${Number(u.geo_lng)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-0.5 rounded-md bg-[#00F5FF]/10 text-[#00F5FF] border border-[#00F5FF]/20 hover:bg-[#00F5FF]/20 transition-all"
                          >
                            Google Maps'da ochish ↗
                          </a>
                        </div>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
                            <p className="text-[10px] text-[#64748B]">Kenglik (lat)</p>
                            <p className="text-white font-mono text-xs mt-0.5">{Number(u.geo_lat).toFixed(6)}</p>
                          </div>
                          <div className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
                            <p className="text-[10px] text-[#64748B]">Uzunlik (lng)</p>
                            <p className="text-white font-mono text-xs mt-0.5">{Number(u.geo_lng).toFixed(6)}</p>
                          </div>
                        </div>
                        <iframe
                          title="Foydalanuvchi joylashuvi"
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(u.geo_lng) - 0.01}%2C${Number(u.geo_lat) - 0.01}%2C${Number(u.geo_lng) + 0.01}%2C${Number(u.geo_lat) + 0.01}&layer=mapnik&marker=${Number(u.geo_lat)}%2C${Number(u.geo_lng)}`}
                          className="w-full h-52 rounded-xl border border-white/10 bg-black/30"
                          loading="lazy"
                        />
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ─── ORDERS ─── */}
              {activeTab === 'orders' && (
                <motion.div key="orders" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  {data?.orders?.length === 0 ? (
                    <div className="text-center py-16 text-[#64748B]">
                      <FiShoppingBag className="w-14 h-14 mx-auto mb-4 opacity-30" />
                      <p>Buyurtmalar topilmadi</p>
                      <p className="text-xs mt-2">Bu foydalanuvchi hali hech narsa xarid qilmagan</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {data?.orders?.map((o: any) => (
                        <div key={o.id} className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-[#00F5FF]/20 transition-all">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <button
                                onClick={() => { navigator.clipboard.writeText(o.order_number); toast.success('Buyurtma raqami nusxalandi'); }}
                                className="text-xs font-bold text-[#00F5FF] hover:underline flex items-center gap-1"
                                title="Nusxalash"
                              >
                                #{o.order_number} <FiCopy className="w-3 h-3 opacity-50" />
                              </button>
                              <span className="text-[10px] text-[#64748B]">{fmtDate(o.created_at)}</span>
                            </div>
                            <p className="text-sm text-white font-medium mt-0.5 truncate">
                              {o.service_name} <span className="text-[#64748B]">· {o.package_name}</span>
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${
                              o.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                              o.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              o.status === 'processing' ? 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' :
                              'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            }`}>
                              {STATUS_LABELS[o.status] || o.status}
                            </span>
                            <span className={`px-2 py-1 rounded-lg text-[11px] font-medium border ${
                              o.payment_status === 'paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              o.payment_status === 'refunded' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                              'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                              {PAY_LABELS[o.payment_status] || o.payment_status}
                            </span>
                            <span className="text-sm font-bold text-white whitespace-nowrap">{money(o.total_price)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ─── PAYMENTS ─── */}
              {activeTab === 'payments' && (
                <motion.div key="payments" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                  {data?.transactions?.length === 0 ? (
                    <div className="text-center py-16 text-[#64748B]">
                      <FiCreditCard className="w-14 h-14 mx-auto mb-4 opacity-30" />
                      <p>To'lovlar topilmadi</p>
                      <p className="text-xs mt-2">Balans operatsiyalari bu yerda ko'rinadi</p>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {data?.transactions?.map((t: any) => {
                        // Belgini turdan emas, summa ishorasidan olamiz — admin tuzatmasi manfiy bo'lishi mumkin.
                        const amount = Number(t.amount || 0);
                        const isIn = amount >= 0;
                        return (
                          <div key={t.id} className="flex flex-wrap items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/5 hover:border-white/10 transition-all">
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                              isIn ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                              {t.tx_type === 'topup' ? <FiDollarSign className="w-4 h-4" /> :
                               t.tx_type === 'purchase' ? <FiShoppingBag className="w-4 h-4" /> :
                               t.tx_type === 'cashback' ? <FiAward className="w-4 h-4" /> :
                               t.tx_type === 'cashback_claim' || t.tx_type === 'referral_gift' ? <FiGift className="w-4 h-4" /> : <FiActivity className="w-4 h-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white">{TX_LABELS[t.tx_type] || t.tx_type}</p>
                              {t.description && <p className="text-[11px] text-[#64748B] truncate">{t.description}</p>}
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-bold ${isIn ? 'text-green-400' : 'text-red-400'}`}>
                                {isIn ? '+' : '−'}{fmtNum(Math.abs(amount))} so'm
                              </p>
                              <p className="text-[10px] text-[#64748B]">{fmtDate(t.created_at)}</p>
                            </div>
                            <span className={`px-2 py-1 rounded-lg text-[10px] font-medium border ${
                              t.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                              t.status === 'failed' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                              t.status === 'cancelled' ? 'bg-gray-500/10 text-gray-400 border-gray-500/20' :
                              'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
                            }`}>
                              {TX_STATUS_LABELS[t.status] || t.status}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              )}

              {/* ─── ACTIVITY ─── */}
              {activeTab === 'activity' && (
                <motion.div key="activity" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-6">
                  {/* Monthly orders + revenue */}
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <p className="text-xs font-semibold text-[#94A3B8] mb-4 flex items-center gap-1.5">
                      <FiTrendingUp className="w-3.5 h-3.5 text-[#00F5FF]" /> Oylik buyurtmalar va daromad
                    </p>
                    {(activity.monthly || []).length === 0 ? (
                      <div className="text-center py-12 text-[#64748B]">
                        <FiBarChart2 className="w-12 h-12 mx-auto mb-3 opacity-30" />
                        <p className="text-sm">Hali ma'lumot yo'q</p>
                        <p className="text-xs mt-1">Foydalanuvchi to'lagan buyurtmalari bu yerda ko'rinadi</p>
                      </div>
                    ) : (
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={activity.monthly} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                            <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} />
                            <YAxis yAxisId="left" tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                            <YAxis yAxisId="right" orientation="right" tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} width={70} tickFormatter={(v: any) => fmtNum(v)} />
                            <Tooltip contentStyle={TooltipStyle} formatter={(v: any, name: any) => name === 'Daromad' ? money(v) : v} />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            <Bar yAxisId="left" dataKey="orders" name="Buyurtmalar" fill="#00F5FF" radius={[6, 6, 0, 0]} />
                            <Bar yAxisId="right" dataKey="revenue" name="Daromad" fill="#A855F7" radius={[6, 6, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Top services */}
                  {(activity.top_services || []).length > 0 && (
                    <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                      <p className="text-xs font-semibold text-[#94A3B8] mb-4 flex items-center gap-1.5">
                        <FiBox className="w-3.5 h-3.5 text-[#00F5FF]" /> Eng ko'p buyurtma berilgan xizmatlar
                      </p>
                      <div className="space-y-3">
                        {activity.top_services.map((t: any, i: number) => (
                          <div key={i} className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-[#0B1220]" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}>
                              {i + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-center mb-1">
                                <p className="text-xs text-white font-medium truncate">{t.service__name || '—'}</p>
                                <p className="text-[10px] text-[#64748B] ml-2 whitespace-nowrap">{fmtNum(t.count)} ta · {money(t.revenue)}</p>
                              </div>
                              <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-[#00F5FF] to-[#A855F7] transition-all duration-500"
                                  style={{ width: `${Math.max((t.count || 0) / maxService * 100, 4)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </motion.div>
    </div>
  );
}
