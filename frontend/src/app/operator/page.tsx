'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { FiShoppingBag, FiClock, FiCheckCircle, FiTrendingUp, FiPackage, FiEye, FiBarChart2, FiAward, FiZap, FiTarget, FiCalendar, FiPieChart, FiActivity } from 'react-icons/fi';
import { PageSkeleton } from '@/components/Skeleton';
import OrderDetailModal from '@/components/OrderDetailModal';
import toast from 'react-hot-toast';
import { adminAPI } from '@/lib/api';
import { useStore } from '@/lib/store';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  processing: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  completed: 'bg-green-500/10 text-green-400 border-green-500/20',
  cancelled: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const statusLabels: Record<string, string> = {
  pending: 'Kutilmoqda',
  processing: 'Bajarilmoqda',
  completed: 'Tugallangan',
  cancelled: 'Bekor qilingan',
};

export default function OperatorDashboard() {
  const { user } = useStore();
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/admin/operator/dashboard/`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } }
        );
        const data = await res.json();
        setStats(data);
      } catch (e) {
        toast.error('Dashboard malumotlarini yuklashda xatolik');
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
  }, [refreshKey]);

  const statCards = [
    { icon: FiShoppingBag, label: 'Bugungi buyurtmalar', value: stats?.today_orders || 0, color: 'from-[#A855F7]/20 to-[#00F5FF]/20', iconColor: 'text-[#A855F7]' },
    { icon: FiCheckCircle, label: 'Bugungi bajarilgan', value: stats?.today_completed || 0, sub: `${stats?.operator_completed_today || 0} siz bajardingiz`, color: 'from-green-500/20 to-emerald-500/20', iconColor: 'text-green-400' },
    { icon: FiClock, label: 'Kutilayotgan', value: stats?.pending_orders || 0, sub: `${stats?.processing_orders || 0} ta bajarilmoqda`, color: 'from-yellow-500/20 to-orange-500/20', iconColor: 'text-yellow-400' },
    { icon: FiTrendingUp, label: 'Jami buyurtmalar', value: stats?.total_orders || 0, color: 'from-blue-500/20 to-indigo-500/20', iconColor: 'text-blue-400' },
  ];

  const [operatorStats, setOperatorStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/admin/operator/stats/`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setOperatorStats(data);
        }
      } catch (e) {
        // Stats are non-critical
      } finally {
        setStatsLoading(false);
      }
    };
    fetchStats();
  }, [refreshKey]);

  // ── Hourly chart helpers ──
  const maxHourlyValue = useMemo(() => {
    if (!operatorStats?.hourly_distribution) return 0;
    return Math.max(...operatorStats.hourly_distribution, 1);
  }, [operatorStats]);

  const hourLabels = ['00','01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23'];

  const maxDailyCompleted = useMemo(() => {
    if (!operatorStats?.daily_stats) return 0;
    return Math.max(...operatorStats.daily_stats.map((d: any) => d.completed), 1);
  }, [operatorStats]);

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Operator paneli</h1>
            <p className="text-sm text-[#64748B]">Xush kelibsiz, {user?.username}</p>
          </div>
        </div>
        <PageSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Operator paneli</h1>
          <p className="text-sm text-[#64748B]">Xush kelibsiz, {user?.username}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-full bg-[#A855F7]/10 text-xs text-[#A855F7] border border-[#A855F7]/20">
            Operator
          </span>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center`}>
                <card.icon className={`w-6 h-6 ${card.iconColor}`} />
              </div>
            </div>
            <p className="text-2xl font-bold text-white">{card.value}</p>
            <p className="text-sm text-[#64748B] mt-1">{card.label}</p>
            {card.sub && <p className="text-xs text-[#64748B] mt-0.5">{card.sub}</p>}
          </motion.div>
        ))}
      </div>

      {/* ═══ PERFORMANCE STATISTICS SECTION ═══ */}
      {!statsLoading && operatorStats && (
        <>
          {/* Performance Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass-card p-5 group cursor-default hover:border-[#A855F7]/30 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#A855F7]/20 to-[#00F5FF]/20 flex items-center justify-center">
                  <FiCheckCircle className="w-5 h-5 text-[#A855F7]" />
                </div>
                <div className="flex-1">
                  <p className="text-2xl font-bold text-white">{operatorStats.total_completed}</p>
                  <p className="text-xs text-[#64748B]">Jami bajarilgan</p>
                </div>
              </div>
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1, delay: 0.3 }}
                  className="h-full rounded-full bg-gradient-to-r from-[#A855F7] to-[#00F5FF]"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="glass-card p-5 group cursor-default hover:border-[#A855F7]/30 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                  <FiZap className="w-5 h-5 text-green-400" />
                </div>
                <div className="flex-1">
                  <p className="text-2xl font-bold text-white">{operatorStats.average_completion_minutes} <span className="text-sm font-normal text-[#64748B]">daqiqa</span></p>
                  <p className="text-xs text-[#64748B]">O&apos;rtacha bajarish vaqti</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-[#64748B]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-400"></span>
                  Eng tez: {operatorStats.fastest_completion_minutes} min
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  Eng sekin: {operatorStats.longest_completion_minutes} min
                </span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="glass-card p-5 group cursor-default hover:border-[#A855F7]/30 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-indigo-500/20 flex items-center justify-center">
                  <FiAward className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-2xl font-bold text-white">
                    #{operatorStats.operator_rank}
                    <span className="text-sm font-normal text-[#64748B]"> / {operatorStats.total_operators}</span>
                  </p>
                  <p className="text-xs text-[#64748B]">Operatorlar reytingida</p>
                </div>
              </div>
              {operatorStats.operator_rank === 1 && (
                <p className="text-xs text-yellow-400 flex items-center gap-1">
                  🏆 Eng yaxshi operator!
                </p>
              )}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="glass-card p-5 group cursor-default hover:border-[#A855F7]/30 transition-all"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-pink-500/20 flex items-center justify-center">
                  <FiTarget className="w-5 h-5 text-orange-400" />
                </div>
                <div className="flex-1">
                  <p className="text-2xl font-bold text-white">{operatorStats.today_completed}</p>
                  <p className="text-xs text-[#64748B]">Bugun bajarilgan</p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#64748B]">Bajarish darajasi</span>
                <span className="text-[#A855F7] font-medium">{operatorStats.completion_rate || 0}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/5 mt-1.5 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(operatorStats.completion_rate || 0, 100)}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                  className="h-full rounded-full bg-gradient-to-r from-[#A855F7] to-[#00F5FF]"
                />
              </div>
            </motion.div>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Hourly Distribution Chart */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="glass-card p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#A855F7]/20 to-[#00F5FF]/20 flex items-center justify-center">
                    <FiBarChart2 className="w-5 h-5 text-[#A855F7]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Eng ko&apos;p buyurtma soatlari</h3>
                    <p className="text-xs text-[#64748B]">So&apos;nggi 30 kun</p>
                  </div>
                </div>
              </div>

              {/* Hourly Bar Chart */}
              <div className="h-44 flex items-end gap-[3px] relative">
                {/* Y axis reference lines */}
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                  <div className="border-t border-white/5"></div>
                  <div className="border-t border-white/5"></div>
                  <div className="border-t border-white/5"></div>
                  <div className="border-t border-white/5"></div>
                </div>
                {operatorStats.hourly_distribution.map((value: number, i: number) => {
                  const height = maxHourlyValue > 0 ? (value / maxHourlyValue) * 100 : 0;
                  const isPeak = value > 0 && value === maxHourlyValue;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full relative group/bar">
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ duration: 0.5, delay: 0.05 * i }}
                        className={`w-full rounded-t-sm relative cursor-pointer transition-all duration-200 ${
                          isPeak
                            ? 'bg-gradient-to-t from-[#A855F7] to-[#00F5FF]'
                            : value > 0
                              ? 'bg-gradient-to-t from-[#A855F7]/60 to-[#A855F7]/30'
                              : 'bg-white/5'
                        }`}
                      >
                        {/* Tooltip */}
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1E293B] border border-white/10 rounded-lg px-2 py-1 text-xs text-white whitespace-nowrap opacity-0 group-hover/bar:opacity-100 transition-opacity pointer-events-none z-10">
                          {hourLabels[i]}:00 — {value} ta
                        </div>
                      </motion.div>
                      {i % 3 === 0 && (
                        <span className="text-[10px] text-[#64748B] mt-1.5">{hourLabels[i]}</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Peak info */}
              {(() => {
                const maxVal = Math.max(...operatorStats.hourly_distribution);
                if (maxVal === 0) return null;
                const peakHour = operatorStats.hourly_distribution.indexOf(maxVal);
                return (
                  <p className="text-xs text-[#64748B] mt-4 text-center">
                    Eng ko&apos;p buyurtma <span className="text-[#A855F7] font-medium">{hourLabels[peakHour]}:00</span> da —{' '}
                    <span className="text-white font-medium">{maxVal} ta</span>
                  </p>
                );
              })()}
            </motion.div>

            {/* Daily Trend Chart */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="glass-card p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
                    <FiActivity className="w-5 h-5 text-green-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Kunlik bajarish trendi</h3>
                    <p className="text-xs text-[#64748B]">So&apos;nggi 7 kun</p>
                  </div>
                </div>
              </div>

              {/* Daily Bars */}
              <div className="h-44 flex items-end gap-4">
                <div className="absolute inset-0 flex flex-col justify-between pointer-events-none" style={{ position: 'relative', height: 0 }}>
                  {/* These reference lines are inside the chart container */}
                </div>
                {operatorStats.daily_stats.map((day: any, i: number) => {
                  const height = maxDailyCompleted > 0 ? (day.completed / maxDailyCompleted) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center justify-end h-full relative group/day">
                      {/* Bar */}
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ duration: 0.5, delay: 0.1 * i }}
                        className="w-full rounded-t-lg relative cursor-pointer transition-all duration-200"
                        style={{
                          background: `linear-gradient(to top, ${day.completed > 0 ? '#A855F7' : '#1E293B'}, ${day.completed > 0 ? '#00F5FF' : '#1E293B'})`,
                          opacity: day.completed > 0 ? 1 : 0.3,
                        }}
                      >
                        {/* Tooltip */}
                        <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#1E293B] border border-white/10 rounded-lg px-2 py-1 text-xs text-white whitespace-nowrap opacity-0 group-hover/day:opacity-100 transition-opacity pointer-events-none z-10">
                          {day.day_name} ({day.date}) — {day.completed} ta bajarilgan
                        </div>
                        {/* Value on bar */}
                        {day.completed > 0 && (
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs text-white font-medium">
                            {day.completed}
                          </span>
                        )}
                      </motion.div>
                      <span className="text-[10px] text-[#64748B] mt-2">{day.day_name}</span>
                      {day.avg_completion_minutes > 0 && (
                        <span className="text-[9px] text-[#64748B]">{day.avg_completion_minutes}min</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>

          {/* Service Breakdown & Today Performance */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Service Breakdown */}
            {operatorStats.service_breakdown && operatorStats.service_breakdown.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="glass-card p-6"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <FiPieChart className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Xizmatlar bo&apos;yicha</h3>
                    <p className="text-xs text-[#64748B]">Eng ko&apos;p bajarilgan xizmatlar</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {operatorStats.service_breakdown.map((item: any, i: number) => {
                    const pct = operatorStats.total_completed > 0
                      ? Math.round((item.count / operatorStats.total_completed) * 100)
                      : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs text-[#64748B] w-5">{i + 1}.</span>
                        <div className="flex-1">
                          <div className="flex justify-between text-xs mb-1">
                            <span className="text-white truncate max-w-[140px]">{item.service__name}</span>
                            <span className="text-[#A855F7] font-medium">{item.count} ta</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.8, delay: 0.4 + i * 0.1 }}
                              className="h-full rounded-full bg-gradient-to-r from-[#A855F7] to-[#00F5FF]"
                            />
                          </div>
                        </div>
                        <span className="text-xs text-[#64748B] w-10 text-right">{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Today Performance Details */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className={`glass-card p-6 ${operatorStats.service_breakdown && operatorStats.service_breakdown.length > 0 ? 'lg:col-span-2' : 'lg:col-span-3'}`}
            >
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center">
                  <FiCalendar className="w-5 h-5 text-orange-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Bugungi ishlash ko&apos;rsatkichlari</h3>
                  <p className="text-xs text-[#64748B]">{new Date().toLocaleDateString('uz-UZ', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-white">{operatorStats.today_total}</p>
                  <p className="text-xs text-[#64748B] mt-1">Jami topshiriq</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-green-400">{operatorStats.today_completed}</p>
                  <p className="text-xs text-[#64748B] mt-1">Bajarilgan</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#A855F7]">{operatorStats.today_avg_completion_minutes} <span className="text-sm font-normal">min</span></p>
                  <p className="text-xs text-[#64748B] mt-1">O&apos;rtacha vaqt</p>
                </div>
                <div className="bg-white/5 rounded-xl p-4 text-center">
                  <p className="text-2xl font-bold text-[#00F5FF]">{operatorStats.completion_rate}%</p>
                  <p className="text-xs text-[#64748B] mt-1">Samaradorlik</p>
                </div>
              </div>
            </motion.div>
          </div>
        </>
      )}

      {/* Recent Orders */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <FiPackage className="w-5 h-5 text-[#A855F7]" />
            <h2 className="text-lg font-bold text-white">So&apos;nggi buyurtmalar</h2>
          </div>
          <span className="text-xs text-[#64748B]">{stats?.recent_orders?.length || 0} ta</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-[#64748B] uppercase tracking-wider">
                <th className="text-left pb-3 font-medium">Raqam</th>
                <th className="text-left pb-3 font-medium">Mijoz</th>
                <th className="text-left pb-3 font-medium">Xizmat</th>
                <th className="text-left pb-3 font-medium">Narx</th>
                <th className="text-left pb-3 font-medium">Telegram</th>
                <th className="text-left pb-3 font-medium">Holat</th>
                <th className="text-left pb-3 font-medium">Sana</th>
                <th className="text-left pb-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {stats?.recent_orders?.map((order: any) => (
                <tr
                  key={order.id}
                  className="border-t border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                >
                  <td className="py-3 text-[#A855F7] font-mono text-xs">#{order.order_number?.slice(-8)}</td>
                  <td className="py-3 text-white">{order.customer_name}</td>
                  <td className="py-3 text-[#94A3B8]">{order.service_name}</td>
                  <td className="py-3 text-white">{Number(order.total_price).toLocaleString()} so&apos;m</td>
                  <td className="py-3 text-[#94A3B8] text-xs">{order.customer_telegram || '—'}</td>
                  <td className="py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[order.status] || 'bg-white/5 text-[#94A3B8]'}`}>
                      {statusLabels[order.status] || order.status}
                    </span>
                  </td>
                  <td className="py-3 text-[#64748B] text-xs">
                    {new Date(order.created_at).toLocaleDateString('uz-UZ')}
                  </td>
                  <td className="py-3">
                    <button
                      onClick={() => setSelectedOrderId(order.id)}
                      className="p-1.5 rounded-lg bg-[#A855F7]/10 text-[#A855F7] opacity-0 group-hover:opacity-100 transition-all hover:bg-[#A855F7]/20"
                      title="Batafsil"
                    >
                      <FiEye className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {(!stats?.recent_orders || stats.recent_orders.length === 0) && (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-[#64748B] text-sm">Buyurtmalar mavjud emas</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Modal */}
      <OrderDetailModal
        orderId={selectedOrderId}
        onClose={() => { setSelectedOrderId(null); setRefreshKey(k => k + 1); }}
      />
    </div>
  );
}
