'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  FiBarChart2, FiTrendingUp, FiDollarSign, FiUsers, 
  FiShoppingBag, FiActivity, FiPieChart, FiCreditCard 
} from 'react-icons/fi';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';

export default function AdminAnalyticsPage() {
  const [analytics, setAnalytics] = useState<any>(null);
  const [userAnalytics, setUserAnalytics] = useState<any>(null);
  const [referralStats, setReferralStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [analyticsRes, userRes, refRes] = await Promise.all([
          adminAPI.analytics(),
          adminAPI.get('/admin/users/analytics/'),
          adminAPI.get('/admin/referrals/stats/'),
        ]);
        setAnalytics(analyticsRes.data);
        setUserAnalytics(userRes.data);
        setReferralStats(refRes.data);
      } catch (e) {
        toast.error('Analitik ma\'lumotlarni yuklashda xatolik');
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Analitika</h1>
        <p className="text-sm text-[#64748B]">Platforma statistikasi va tahlil</p>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F5FF]/20 to-cyan-500/20 flex items-center justify-center">
              <FiDollarSign className="w-5 h-5 text-[#00F5FF]" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">
            {Number(analytics?.total_revenue_30d || 0).toLocaleString()} so'm
          </p>
          <p className="text-xs text-[#64748B]">30 kunlik daromad</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
              <FiShoppingBag className="w-5 h-5 text-purple-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{analytics?.total_orders_30d || 0}</p>
          <p className="text-xs text-[#64748B]">30 kunlik buyurtmalar</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-500/20 to-emerald-500/20 flex items-center justify-center">
              <FiUsers className="w-5 h-5 text-green-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{userAnalytics?.total_users || 0}</p>
          <p className="text-xs text-[#64748B]">Jami foydalanuvchilar</p>
        </div>
        <div className="glass-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-500/20 to-orange-500/20 flex items-center justify-center">
              <FiActivity className="w-5 h-5 text-yellow-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-white">{analytics?.conversion_rate?.toFixed(1) || 0}%</p>
          <p className="text-xs text-[#64748B]">Konversiya (to'langan/total)</p>
        </div>
      </div>

      {/* Two Column */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue by Provider */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <FiCreditCard className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">To'lov Provayderlari</h2>
          </div>
          <div className="space-y-4">
            {analytics?.revenue_by_provider?.map((p: any) => {
              const maxTotal = Math.max(...(analytics.revenue_by_provider || []).map((x: any) => x.total), 1);
              const barWidth = (p.total / maxTotal) * 100;
              return (
                <div key={p.provider}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-sm text-white uppercase font-medium">{p.provider}</span>
                    <span className="text-sm text-[#94A3B8]">{Number(p.total).toLocaleString()} so'm ({p.count} ta)</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(barWidth, 3)}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-[#00F5FF] to-[#A855F7]"
                    />
                  </div>
                </div>
              );
            })}
            {(!analytics?.revenue_by_provider || analytics.revenue_by_provider.length === 0) && (
              <p className="text-sm text-[#64748B]">Ma'lumot mavjud emas</p>
            )}
          </div>
        </div>

        {/* Revenue by Category */}
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <FiPieChart className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Kategoriya bo'yicha</h2>
          </div>
          <div className="space-y-4">
            {analytics?.revenue_by_category?.map((c: any) => {
              const maxTotal = Math.max(...(analytics.revenue_by_category || []).map((x: any) => x.total), 1);
              const barWidth = (c.total / maxTotal) * 100;
              return (
                <div key={c.service__category__name || 'unknown'}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-sm text-white">{c.service__category__name || 'Boshqa'}</span>
                    <span className="text-sm text-[#94A3B8]">{Number(c.total).toLocaleString()} so'm</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(barWidth, 3)}%` }}
                      className="h-full rounded-full bg-gradient-to-r from-[#A855F7] to-pink-500"
                    />
                  </div>
                </div>
              );
            })}
            {(!analytics?.revenue_by_category || analytics.revenue_by_category.length === 0) && (
              <p className="text-sm text-[#64748B]">Ma'lumot mavjud emas</p>
            )}
          </div>
        </div>
      </div>

      {/* Daily Revenue Chart */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <FiBarChart2 className="w-5 h-5 text-[#00F5FF]" />
          <h2 className="text-lg font-bold text-white">Kunlik daromad va buyurtmalar</h2>
        </div>
        <div className="space-y-3">
          {analytics?.daily_revenue?.map((day: any) => {
            const maxRev = Math.max(...(analytics.daily_revenue || []).map((d: any) => d.revenue), 1);
            const barWidth = (day.revenue / maxRev) * 100;
            return (
              <div key={day.date} className="flex items-center gap-4">
                <span className="text-xs text-[#64748B] w-16">
                  {new Date(day.date + 'T00:00:00').toLocaleDateString('uz-UZ', { weekday: 'short', day: 'numeric' })}
                </span>
                <div className="flex-1 h-8 rounded-lg bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(barWidth, 2)}%` }}
                    className="h-full rounded-lg bg-gradient-to-r from-[#00F5FF] to-[#A855F7] flex items-center px-3"
                  >
                    <span className="text-xs text-white font-medium">{day.revenue > 0 ? day.orders : ''}</span>
                  </motion.div>
                </div>
                <span className="text-xs text-[#94A3B8] w-24 text-right">
                  {Number(day.revenue).toLocaleString()} so'm
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* User Analytics */}
      <div className="glass-card p-6">
        <div className="flex items-center gap-3 mb-6">
          <FiUsers className="w-5 h-5 text-[#00F5FF]" />
          <h2 className="text-lg font-bold text-white">Foydalanuvchilar statistikasi</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl bg-white/5 text-center">
            <p className="text-2xl font-bold text-white">{userAnalytics?.active_users || 0}</p>
            <p className="text-xs text-[#64748B]">Faol</p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 text-center">
            <p className="text-2xl font-bold text-red-400">{userAnalytics?.inactive_users || 0}</p>
            <p className="text-xs text-[#64748B]">Faol emas</p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 text-center">
            <p className="text-2xl font-bold text-orange-400">{userAnalytics?.new_users_30d || 0}</p>
            <p className="text-xs text-[#64748B]">30 kunda yangi</p>
          </div>
          <div className="p-4 rounded-xl bg-white/5 text-center">
            <p className="text-2xl font-bold text-red-400">{userAnalytics?.blacklisted_users || 0}</p>
            <p className="text-xs text-[#64748B]">Qora ro'yxat</p>
          </div>
        </div>

        {/* Role Distribution */}
        <div className="flex flex-wrap gap-3">
          {userAnalytics?.role_distribution?.map((r: any) => (
            <div key={r.role} className="px-4 py-2 rounded-xl bg-white/5 text-sm flex items-center gap-2">
              <span className="text-white">{r.role}</span>
              <span className="text-[#00F5FF] font-bold">{r.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Referral Stats */}
      {referralStats && (
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-6">
            <FiTrendingUp className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Referral Tizimi</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="p-4 rounded-xl bg-white/5 text-center">
              <p className="text-2xl font-bold text-white">{referralStats.total_users_with_referrer}</p>
              <p className="text-xs text-[#64748B]">Referral ulangan</p>
            </div>
            <div className="p-4 rounded-xl bg-white/5 text-center">
              <p className="text-2xl font-bold text-white">{referralStats.total_referrers}</p>
              <p className="text-xs text-[#64748B]">Referrerlar</p>
            </div>
            <div className="p-4 rounded-xl bg-white/5 text-center">
              <p className="text-2xl font-bold gradient-text">
                {Number(referralStats.total_referral_revenue).toLocaleString()} so'm
              </p>
              <p className="text-xs text-[#64748B]">Referral daromad</p>
            </div>
            <div className="p-4 rounded-xl bg-white/5 text-center">
              <p className="text-2xl font-bold text-[#FFD700]">
                {Number(referralStats.estimated_cashback_paid).toLocaleString()} so'm
              </p>
              <p className="text-xs text-[#64748B]">Cashback to'langan</p>
            </div>
          </div>

          {/* Top Referrers */}
          {referralStats.top_referrers?.length > 0 && (
            <div>
              <h3 className="text-sm font-bold text-white mb-3">Top Referrerlar</h3>
              <div className="space-y-2">
                {referralStats.top_referrers.map((r: any, i: number) => (
                  <div key={r.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-[#64748B] font-mono">#{i + 1}</span>
                      <span className="text-sm text-white">{r.username}</span>
                    </div>
                    <span className="text-sm text-[#00F5FF] font-medium">{r.referrals_count} ta taklif</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
