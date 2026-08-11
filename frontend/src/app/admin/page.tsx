'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import {
  FiDollarSign, FiTrendingUp, FiShoppingBag, FiUsers, FiUserPlus,
  FiClock, FiCheckCircle, FiXCircle, FiAward, FiGift, FiActivity,
  FiPercent, FiZap, FiRefreshCw, FiArrowUpRight, FiArrowDownRight,
  FiPieChart, FiBarChart2, FiUserCheck, FiCalendar, FiTrash2, FiAlertTriangle,
} from 'react-icons/fi';
import { PageSkeleton } from '@/components/Skeleton';
import RealtimeMetricsBar from '@/components/RealtimeMetricsBar';
import ActivityFeed from '@/components/ActivityFeed';
import { adminAPI, cardpayAPI } from '@/lib/api';
import Link from 'next/link';
import { useStore } from '@/lib/store';
import RealTimeIndicator from '@/components/RealTimeIndicator';
import { useWebSocket } from '@/lib/websocket';
import toast from 'react-hot-toast';

const CHART_COLORS = ['#00F5FF', '#A855F7', '#FFD700', '#10B981', '#F97316', '#3B82F6', '#EF4444', '#EC4899'];

const PERIODS = [
  { key: 'daily', label: 'Kunlik' },
  { key: 'weekly', label: 'Haftalik' },
  { key: 'monthly', label: 'Oylik' },
  { key: 'yearly', label: 'Yillik' },
];

const PAYMENT_LABELS: Record<string, string> = {
  balance: 'Balans',
  click: 'Click',
  payme: 'Payme',
  uzum: 'Uzum',
  paynet: 'Paynet',
  unknown: 'Noma\'lum',
};

const paymentLabel = (m: any) => {
  if (!m) return 'Noma\'lum';
  return PAYMENT_LABELS[String(m)] || String(m);
};

const TooltipStyle = {
  background: '#0F172A',
  border: '1px solid rgba(0,245,255,0.2)',
  borderRadius: 12,
  color: '#F8FAFC',
  fontSize: 12,
  boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
};

interface KpiCard {
  icon: React.ComponentType<any>;
  label: string;
  value: string;
  sub?: string;
  color: string;
  iconColor: string;
  trend?: number;
}

export default function AdminDashboard() {
  const { user } = useStore();
  const [data, setData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [period, setPeriod] = useState('daily');
  const [refreshKey, setRefreshKey] = useState(0);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetConfirm, setResetConfirm] = useState('');
  const [ucStatus, setUcStatus] = useState<any>(null);
  const { connectionStatus, lastEvent } = useWebSocket();

  // User client (card-payment Telethon worker) status for the dashboard banner
  useEffect(() => {
    cardpayAPI.userClientStatus().then((r) => setUcStatus(r.data)).catch(() => {});
  }, [refreshKey]);

  // Auto-refresh on real-time order/payment events
  useEffect(() => {
    if (['order_created', 'order_updated', 'payment_received'].includes(lastEvent?.type)) {
      setRefreshKey((k) => k + 1);
    }
  }, [lastEvent]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await adminAPI.get('/admin/crm/stats/', { params: { period } });
      setData(res.data);
    } catch (e) {
      toast.error('CRM statistikasini yuklashda xatolik');
    } finally {
      setIsLoading(false);
    }
  }, [period]);

  useEffect(() => { fetchStats(); }, [fetchStats, refreshKey]);

  // ── Savdo statistikasini 0 ga qaytarish (faqat Super Admin ko'radi) ──
  const canResetStats = user?.role === 'super_admin';
  const handleResetStats = async () => {
    if (resetConfirm.trim().toUpperCase() !== 'RESET') return;
    setResetting(true);
    try {
      const res = await adminAPI.post('/admin/crm/reset-stats/', {});
      toast.success(res.data?.detail || 'Savdo statistikasi 0 ga keltirildi');
      setShowResetModal(false);
      setResetConfirm('');
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Statistika tozalashda xatolik');
    } finally {
      setResetting(false);
    }
  };

  if (isLoading) {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">CRM Dashboard</h1>
            <p className="text-sm text-[#64748B]">Professional boshqaruv paneli</p>
          </div>
        </div>
        <PageSkeleton />
      </div>
    );
  }

  const k = data?.kpis || {};
  const fmt = (n: any) => Number(n || 0).toLocaleString('uz-UZ');
  const money = (n: any) => `${fmt(n)} so'm`;

  // Real trend deltas (percent change vs previous comparable period)
  const pct = (cur: any, prev: any): number | undefined => {
    const c = Number(cur || 0);
    const p = Number(prev || 0);
    if (p <= 0) return undefined;
    return Math.round(((c - p) / p) * 100);
  };
  const todayTrend = pct(k.today_revenue, k.yesterday_revenue);

  const kpiCards: KpiCard[] = [
    // Revenue group
    { icon: FiDollarSign, label: 'Jami daromad', value: money(k.total_revenue), sub: 'Barcha vaqt', color: 'from-[#00F5FF]/20 to-[#A855F7]/20', iconColor: 'text-[#00F5FF]' },
    { icon: FiTrendingUp, label: 'Bugungi daromad', value: money(k.today_revenue), sub: `Kecha: ${money(k.yesterday_revenue)}`, color: 'from-emerald-500/20 to-teal-500/20', iconColor: 'text-emerald-400', trend: todayTrend },
    { icon: FiZap, label: 'Haftalik daromad', value: money(k.week_revenue), sub: 'So\'nggi 7 kun', color: 'from-amber-500/20 to-orange-500/20', iconColor: 'text-amber-400' },
    { icon: FiCalendar, label: 'Oylik daromad', value: money(k.month_revenue), sub: 'So\'nggi 30 kun', color: 'from-blue-500/20 to-indigo-500/20', iconColor: 'text-blue-400' },
    // Orders group
    { icon: FiShoppingBag, label: 'Jami buyurtmalar', value: fmt(k.total_orders), sub: `${fmt(k.paid_orders)} ta to\'langan`, color: 'from-cyan-500/20 to-blue-500/20', iconColor: 'text-cyan-400' },
    { icon: FiClock, label: 'Kutilayotgan', value: fmt(k.pending_orders), sub: `${fmt(k.processing_orders)} ta bajarilmoqda`, color: 'from-yellow-500/20 to-amber-500/20', iconColor: 'text-yellow-400' },
    { icon: FiCheckCircle, label: 'Tugallangan', value: fmt(k.completed_orders), sub: `Muvaffaqiyat ${fmt(k.success_rate)}%`, color: 'from-green-500/20 to-emerald-500/20', iconColor: 'text-green-400' },
    { icon: FiXCircle, label: 'Bekor qilingan', value: fmt(k.cancelled_orders), sub: 'Umumiy buyurtmalar', color: 'from-red-500/20 to-rose-500/20', iconColor: 'text-red-400' },
    // Users group
    { icon: FiUsers, label: 'Faol foydalanuvchilar', value: fmt(k.active_users), sub: `Jami: ${fmt(k.total_users)}`, color: 'from-purple-500/20 to-pink-500/20', iconColor: 'text-purple-400' },
    { icon: FiUserPlus, label: 'Bugungi ro\'yxatlar', value: fmt(k.new_users_today), sub: 'Yangi foydalanuvchilar', color: 'from-teal-500/20 to-emerald-500/20', iconColor: 'text-teal-400' },
    { icon: FiUserCheck, label: 'Onlayn', value: fmt(k.online_users), sub: 'Jonli ulanishlar', color: 'from-green-500/20 to-lime-500/20', iconColor: 'text-lime-400' },
    { icon: FiActivity, label: 'Bloklangan', value: fmt(k.blocked_users), sub: `${fmt(k.blacklisted_users)} qora ro\'yxat`, color: 'from-red-500/20 to-orange-500/20', iconColor: 'text-red-400' },
    // Referral & quality group
    { icon: FiGift, label: 'Referal foydalanuvchilar', value: fmt(k.total_referrals), sub: 'Taklif qilingan', color: 'from-pink-500/20 to-rose-500/20', iconColor: 'text-pink-400' },
    { icon: FiAward, label: 'Referal cashback', value: money(k.referral_cashback), sub: 'To\'langan bonuslar', color: 'from-orange-500/20 to-amber-500/20', iconColor: 'text-orange-400' },
    { icon: FiBarChart2, label: 'O\'rtacha buyurtma', value: money(k.avg_order_price), sub: 'O\'rtacha narx', color: 'from-indigo-500/20 to-blue-500/20', iconColor: 'text-indigo-400' },
    { icon: FiPercent, label: 'Konversiya', value: `${fmt(k.conversion_rate)}%`, sub: `Ishlov vaqti: ${fmt(k.avg_processing_minutes)} min`, color: 'from-cyan-500/20 to-teal-500/20', iconColor: 'text-cyan-400' },
  ];

  const charts = data?.charts || {};

  return (
    <div className="space-y-6">
      {/* ═══ Header ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F5FF] to-[#A855F7] flex items-center justify-center">
              <FiActivity className="w-5 h-5 text-[#0F172A]" />
            </span>
            CRM Dashboard
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Xush kelibsiz, {user?.username} — {user?.role === 'super_admin' ? 'Super Admin' : 'Admin'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <RealTimeIndicator isConnected={connectionStatus === 'connected'} showLabel={false} />
          {canResetStats && (
            <button
              onClick={() => setShowResetModal(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 border border-red-500/25 hover:border-red-500/50 transition-all text-xs font-semibold"
              title="Savdo statistikasini 0 ga qaytarish"
            >
              <FiTrash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Statistikani tozalash</span>
            </button>
          )}
          <button
            onClick={() => setRefreshKey((k) => k + 1)}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-[#00F5FF] transition-all"
            title="Yangilash"
          >
            <FiRefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ═══ User Client status banner ═══ */}
      {ucStatus && !ucStatus.authorized && (
        <Link
          href="/admin/user-client"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 hover:border-amber-500/50 transition-all group"
        >
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <FiZap className="w-4 h-4 text-amber-400" />
            </span>
            <div>
              <p className="text-sm font-semibold text-amber-300">
                User Client: <span className="text-amber-400">KIRILMAGAN</span>
              </p>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                Karta to'lovlarini avtomatik tekshirish uchun Telegram akkauntga kirish kerak
              </p>
            </div>
          </div>
          <span className="px-3.5 py-2 rounded-xl bg-amber-400 text-[#0F172A] text-xs font-bold group-hover:bg-amber-300 transition-colors">
            Kirish →
          </span>
        </Link>
      )}
      {ucStatus?.authorized && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-green-500/25 bg-green-500/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="w-9 h-9 rounded-xl bg-green-500/20 flex items-center justify-center">
              <FiZap className="w-4 h-4 text-green-400" />
            </span>
            <div>
              <p className="text-sm font-semibold text-green-300">
                User Client: <span className="text-green-400">KIRILGAN</span>{' '}
                {ucStatus.worker_online ? '· Worker ONLINE' : '· Worker offline'}
              </p>
              <p className="text-xs text-[#94A3B8] mt-0.5">
                {ucStatus.username ? `@${ucStatus.username}` : ''}{' '}
                Karta to'lovlari kuzatilmoqda
              </p>
            </div>
          </div>
          <Link href="/admin/user-client" className="text-xs font-semibold text-green-400 hover:text-green-300 transition-colors">
            Boshqarish →
          </Link>
        </div>
      )}

      {/* ═══ Live metrics bar ═══ */}
      <RealtimeMetricsBar />

      {/* ═══ KPI GRID ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.4) }}
            className="glass-card p-5 hover:border-[#00F5FF]/25 transition-all duration-300 group"
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center group-hover:scale-110 transition-transform duration-300`}>
                <card.icon className={`w-5 h-5 ${card.iconColor}`} />
              </div>
              {card.trend !== undefined && (
                <span className={`flex items-center gap-0.5 text-[11px] font-semibold ${card.trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {card.trend >= 0 ? <FiArrowUpRight /> : <FiArrowDownRight />}
                  {Math.abs(card.trend)}%
                </span>
              )}
            </div>
            <p className="text-lg font-bold text-white truncate">{card.value}</p>
            <p className="text-xs text-[#64748B] mt-0.5">{card.label}</p>
            {card.sub && <p className="text-[11px] text-[#64748B] mt-0.5 truncate">{card.sub}</p>}
          </motion.div>
        ))}
      </div>

      {/* ═══ REVENUE CHART with period switch ═══ */}
      <div className="glass-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <FiTrendingUp className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Daromad</h2>
          </div>
          <div className="flex gap-1.5 p-1 rounded-xl bg-white/5 border border-white/5">
            {PERIODS.map((p) => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  period === p.key
                    ? 'bg-gradient-to-r from-[#00F5FF] to-[#A855F7] text-[#0F172A]'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={charts.revenue || []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00F5FF" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#A855F7" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} width={70} tickFormatter={(v: any) => fmt(v)} />
              <Tooltip contentStyle={TooltipStyle} formatter={(v: any) => money(v)} />
              <Area type="monotone" dataKey="revenue" stroke="#00F5FF" strokeWidth={2.5} fill="url(#revGrad)" name="Daromad" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ═══ CHARTS ROW 1 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Orders line */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <FiShoppingBag className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Buyurtmalar (14 kun)</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts.orders || []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip contentStyle={TooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="created" stroke="#00F5FF" strokeWidth={2.5} dot={false} name="Yaratilgan" />
                <Line type="monotone" dataKey="completed" stroke="#10B981" strokeWidth={2.5} dot={false} name="Tugallangan" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment methods pie */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <FiPieChart className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">To'lov usullari</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={(charts.payment_methods || []).map((p: any) => ({ name: paymentLabel(p.payment_method), value: p.count }))}
                  cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value"
                >
                  {(charts.payment_methods || []).map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ═══ CHARTS ROW 2 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top products bar */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <FiBarChart2 className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Top xizmatlar</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(charts.top_products || []).map((p: any) => ({ name: p.service__name || '—', orders: p.orders }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={55} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip contentStyle={TooltipStyle} />
                <Bar dataKey="orders" name="Buyurtmalar" radius={[6, 6, 0, 0]}>
                  {(charts.top_products || []).map((_: any, i: number) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top users bar */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <FiUsers className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Top foydalanuvchilar</h2>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={(charts.top_users || []).map((u: any) => ({ name: u.customer__username || '—', spent: Number(u.spent || 0) }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} axisLine={false} interval={0} angle={-20} textAnchor="end" height={55} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} width={60} tickFormatter={(v: any) => fmt(v)} />
                <Tooltip contentStyle={TooltipStyle} formatter={(v: any) => money(v)} />
                <Bar dataKey="spent" name="Sarflangan" radius={[6, 6, 0, 0]} fill="#A855F7" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ═══ CHARTS ROW 3 ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Referral growth */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <FiGift className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Referal o'sish (14 kun)</h2>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={charts.referral_growth || []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="refGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#A855F7" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#A855F7" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip contentStyle={TooltipStyle} />
                <Area type="monotone" dataKey="count" stroke="#A855F7" strokeWidth={2.5} fill="url(#refGrad)" name="Referallar" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Registrations */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <FiUserPlus className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Ro'yxatdan o'tishlar (14 kun)</h2>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={charts.registrations || []} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} tickLine={false} axisLine={false} width={30} allowDecimals={false} />
                <Tooltip contentStyle={TooltipStyle} />
                <Line type="monotone" dataKey="registrations" stroke="#FFD700" strokeWidth={2.5} dot={false} name="Ro'yxatlar" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ═══ HOURLY DISTRIBUTION ═══ */}
      {charts.hourly_distribution && charts.hourly_distribution.length === 24 && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <FiClock className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Soatlik faollik (30 kun)</h2>
          </div>
          <div className="flex items-end gap-1 h-32">
            {charts.hourly_distribution.map((count: number, hour: number) => {
              const max = Math.max(...charts.hourly_distribution, 1);
              const h = Math.max((count / max) * 100, 2);
              return (
                <div key={hour} className="flex-1 h-full flex flex-col items-center justify-end gap-1 group" title={`${hour}:00 — ${count} ta`}>
                  <div className="w-full rounded-t-md bg-gradient-to-t from-[#00F5FF]/20 to-[#A855F7]/70 transition-all duration-300 group-hover:from-[#00F5FF]/40 group-hover:to-[#A855F7]" style={{ height: `${h}%` }} />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1 mt-2">
            {[0, 6, 12, 18, 23].map((h) => (
              <span key={h} className="flex-1 text-center text-[10px] text-[#64748B]">{h}:00</span>
            ))}
          </div>
        </div>
      )}

      {/* ═══ BOTTOM ROW: Activity ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ActivityFeed limit={15} refreshInterval={15000} />
        </div>
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <FiActivity className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Umumiy ko'rsatkichlar</h2>
          </div>
          <div className="space-y-3">
            {[
              ['Jami daromad', money(k.total_revenue)],
              ['Jami buyurtmalar', fmt(k.total_orders)],
              ['To\'langan buyurtmalar', fmt(k.paid_orders)],
              ['Jami foydalanuvchilar', fmt(k.total_users)],
              ['Muvaffaqiyat darajasi', `${fmt(k.success_rate)}%`],
              ['Konversiya', `${fmt(k.conversion_rate)}%`],
              ['O\'rtacha ishlov vaqti', `${fmt(k.avg_processing_minutes)} daqiqa`],
              ['Referal cashback', money(k.referral_cashback)],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between items-center p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] transition-all">
                <span className="text-sm text-[#94A3B8]">{label}</span>
                <span className="text-sm font-semibold text-white">{value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ RESET STATS CONFIRMATION MODAL ═══ */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md glass-card p-6 border-red-500/25">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-500/15 flex items-center justify-center shrink-0">
                <FiAlertTriangle className="w-6 h-6 text-red-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">Statistikani 0 ga qaytarish</h3>
                <p className="text-sm text-[#94A3B8] mt-1 leading-relaxed">
                  Bu amal <span className="text-red-400 font-semibold">BARCHA buyurtmalar, to'lovlar,
                  balans tranzaksiyalari va audit loglarni</span> butunlay o'chiradi.
                  Foydalanuvchilar, xizmatlar, paketlar va balanslarga tegmaydi.
                  Bu amalni <span className="text-white font-semibold">ortga qaytarib bo'lmaydi!</span>
                </p>
              </div>
            </div>
            <div className="mt-5">
              <label className="block text-xs font-semibold text-[#94A3B8] mb-1.5">
                Tasdiqlash uchun <span className="text-red-400">RESET</span> so'zini yozing
              </label>
              <input
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="RESET"
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-[#0F172A] border border-white/10 focus:border-red-500/50 focus:outline-none text-white text-sm placeholder-[#475569] transition-colors"
              />
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowResetModal(false)}
                className="flex-1 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-white text-sm font-semibold transition-all"
              >
                Bekor qilish
              </button>
              <button
                onClick={handleResetStats}
                disabled={resetConfirm.trim().toUpperCase() !== 'RESET' || resetting}
                className="flex-1 px-4 py-3 rounded-xl bg-red-500/90 hover:bg-red-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
              >
                {resetting ? (
                  <><FiRefreshCw className="w-4 h-4 animate-spin" /> Tozalanmoqda...</>
                ) : (
                  <><FiTrash2 className="w-4 h-4" /> 0 ga qaytarish</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
