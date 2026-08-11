'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  FiPackage, FiDollarSign, FiTrendingUp, FiPieChart,
  FiBarChart2, FiCreditCard, FiClock, FiCheckCircle,
  FiXCircle, FiRefreshCw,
} from 'react-icons/fi';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
} from 'recharts';
import { orderStatsAPI } from '@/lib/api';

const COLORS = ['#00F5FF', '#A855F7', '#3B82F6', '#10B981', '#F59E0B'];
const STATUS_COLORS: Record<string, string> = {
  pending: '#F59E0B',
  processing: '#3B82F6',
  completed: '#10B981',
  cancelled: '#EF4444',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Kutilmoqda',
  processing: 'Bajarilmoqda',
  completed: 'Tugallangan',
  cancelled: 'Bekor qilingan',
};
const PAYMENT_LABELS: Record<string, string> = {
  click: 'Click',
  payme: 'Payme',
  uzum: 'Uzum',
  paynet: 'Paynet',
  balance: 'Balans',
  unknown: 'Noma\'lum',
};
const PAYMENT_COLORS: Record<string, string> = {
  click: '#00AEEF',
  payme: '#33CC66',
  uzum: '#7000FF',
  paynet: '#FF6B00',
  balance: '#F59E0B',
  unknown: '#64748B',
};

interface StatsData {
  overall: {
    total_orders: number;
    total_spent: number;
    avg_order_value: number;
  };
  monthly_spending: Array<{
    month: string;
    spent: number;
    count: number;
  }>;
  top_services: Array<{
    name: string;
    image_url: string | null;
    count: number;
    total: number;
  }>;
  payment_methods: Array<{
    method: string;
    count: number;
    total: number;
  }>;
  status_distribution: Record<string, number>;
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card p-3 text-sm border border-[#00F5FF]/20 shadow-xl">
        <p className="text-white font-medium mb-1">{label}</p>
        {payload.map((entry: any, i: number) => (
          <p key={i} className="text-[#94A3B8]" style={{ color: entry.color }}>
            {entry.name}: <span className="font-semibold">
              {entry.name === 'Sarflangan' || entry.name === 'O\'rtacha' || entry.name === 'Jami'
                ? `${Number(entry.value).toLocaleString()} so'm`
                : entry.value}
            </span>
          </p>
        ))}
      </div>
    );
  }
  return null;
}

function PieTooltip({ active, payload }: any) {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="glass-card p-3 text-sm border border-[#00F5FF]/20 shadow-xl">
        <p className="text-white font-medium">{d.name}</p>
        <p className="text-[#94A3B8]">{d.value} ta buyurtma</p>
        <p className="text-[#94A3B8]">{Number(d.total || 0).toLocaleString()} so'm</p>
      </div>
    );
  }
  return null;
}

export default function ProfileStats() {
  const [data, setData] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartTab, setChartTab] = useState<'spending' | 'orders'>('spending');

  const fetchStats = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await orderStatsAPI.get();
      setData(res.data);
    } catch (e: any) {
      console.error('Stats error:', e);
      setError('Statistikani yuklashda xatolik');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  if (isLoading) {
    return (
      <div className="glass-card p-12">
        <div className="flex flex-col items-center justify-center py-10">
          <div className="loading-spinner mb-4" />
          <p className="text-[#64748B] text-sm">Statistika yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="glass-card p-8">
        <div className="text-center py-6">
          <FiRefreshCw className="w-12 h-12 text-[#64748B] mx-auto mb-3" />
          <p className="text-[#64748B] mb-4">{error || 'Ma\'lumot topilmadi'}</p>
          <button onClick={fetchStats} className="glow-btn-outline px-4 py-2 text-sm">
            Qayta urinish
          </button>
        </div>
      </div>
    );
  }

  const { overall, monthly_spending, top_services, payment_methods } = data;

  const statusData = Object.entries(data.status_distribution).map(([key, val]) => ({
    name: STATUS_LABELS[key] || key,
    value: val,
    color: STATUS_COLORS[key] || '#64748B',
  }));

  const paymentChartData = payment_methods.map(p => ({
    name: PAYMENT_LABELS[p.method] || p.method,
    value: p.count,
    total: p.total,
    color: PAYMENT_COLORS[p.method] || '#64748B',
  }));

  // Stats cards config
  const statCards = [
    {
      label: 'Jami buyurtmalar',
      value: overall.total_orders,
      icon: FiPackage,
      color: 'from-[#00F5FF]/20 to-[#A855F7]/20',
      iconColor: '#00F5FF',
      suffix: 'ta',
    },
    {
      label: 'Jami sarflangan',
      value: overall.total_spent.toLocaleString(),
      icon: FiDollarSign,
      color: 'from-green-500/20 to-emerald-500/20',
      iconColor: '#10B981',
      suffix: "so'm",
    },
    {
      label: "O'rtacha buyurtma",
      value: overall.avg_order_value.toLocaleString(),
      icon: FiTrendingUp,
      color: 'from-blue-500/20 to-indigo-500/20',
      iconColor: '#3B82F6',
      suffix: "so'm",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Section header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center">
          <FiBarChart2 className="w-5 h-5 text-[#00F5FF]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Buyurtma statistikasi</h2>
          <p className="text-xs text-[#64748B]">Barcha buyurtmalaringiz bo'yicha tahlil</p>
        </div>
      </div>

      {/* Overall Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="glass-card p-6 relative overflow-hidden group"
          >
            <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${card.color} blur-[40px] group-hover:scale-150 transition-transform duration-500`} />
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-3">
                <card.icon className="w-5 h-5" style={{ color: card.iconColor }} />
                <span className="text-xs text-[#64748B]">{card.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">
                {card.value.toLocaleString()}
              </p>
              <p className="text-xs text-[#64748B] mt-1">{card.suffix}</p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Monthly Spending Chart + Status Pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly chart - takes 2 cols */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-6 lg:col-span-2"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-semibold text-white">Oylik tahlil</h3>
              <p className="text-xs text-[#64748B]">Oxirgi 12 oy</p>
            </div>
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
              <button
                onClick={() => setChartTab('spending')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  chartTab === 'spending'
                    ? 'bg-[#00F5FF]/20 text-[#00F5FF]'
                    : 'text-[#64748B] hover:text-white'
                }`}
              >
                <FiDollarSign className="w-3 h-3 inline mr-1" />
                Sarf
              </button>
              <button
                onClick={() => setChartTab('orders')}
                className={`px-3 py-1.5 text-xs rounded-md transition-all ${
                  chartTab === 'orders'
                    ? 'bg-[#00F5FF]/20 text-[#00F5FF]'
                    : 'text-[#64748B] hover:text-white'
                }`}
              >
                <FiPackage className="w-3 h-3 inline mr-1" />
                Soni
              </button>
            </div>
          </div>

          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              {chartTab === 'spending' ? (
                <BarChart data={monthly_spending} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="spendingGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#00F5FF" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#A855F7" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: '#64748B', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                  />
                  <YAxis
                    tick={{ fill: '#64748B', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}k` : v}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,245,255,0.05)' }} />
                  <Bar
                    dataKey="spent"
                    name="Sarflangan"
                    fill="url(#spendingGrad)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              ) : (
                <BarChart data={monthly_spending} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="countGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#A855F7" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#00F5FF" stopOpacity={0.1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: '#64748B', fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: 'rgba(255,255,255,0.05)' }}
                  />
                  <YAxis
                    tick={{ fill: '#64748B', fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(168,85,247,0.05)' }} />
                  <Bar
                    dataKey="count"
                    name="Buyurtmalar"
                    fill="url(#countGrad)"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Status Distribution */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15 }}
          className="glass-card p-6"
        >
          <h3 className="text-base font-semibold text-white mb-6">Buyurtma holati</h3>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="none" />
                  ))}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {statusData.map((s) => (
              <div key={s.name} className="flex items-center gap-1.5 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                <span className="text-[#94A3B8]">{s.name}</span>
                <span className="text-white font-medium">{s.value}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Second row: Top Services + Payment Methods */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top Services */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6"
        >
          <h3 className="text-base font-semibold text-white mb-4">Eng ko'p buyurtma qilingan xizmatlar</h3>
          {top_services.length === 0 ? (
            <div className="text-center py-8">
              <FiPackage className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
              <p className="text-xs text-[#64748B]">Hali buyurtmalar mavjud emas</p>
            </div>
          ) : (
            <div className="space-y-3">                {top_services.map((service, i) => (
                <div key={service.name} className="flex items-center gap-4 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                    style={{
                      background: `linear-gradient(135deg, ${COLORS[i % COLORS.length]}44, rgba(168, 85, 247, 0.15))`,
                    }}
                  >
                    #{i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{service.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-[#64748B]">{service.count} ta</span>
                      <span className="text-xs text-[#10B981]">{Number(service.total).toLocaleString()} so'm</span>
                    </div>
                  </div>
                  {/* Mini bar */}
                  <div className="w-16 h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min((service.count / Math.max(...top_services.map(s => s.count))) * 100, 100)}%`,
                        background: `linear-gradient(90deg, ${COLORS[i % COLORS.length]}, ${COLORS[(i + 1) % COLORS.length]})`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Payment Methods */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="glass-card p-6"
        >
          <h3 className="text-base font-semibold text-white mb-4">To'lov usullari bo'yicha</h3>
          {paymentChartData.length === 0 ? (
            <div className="text-center py-8">
              <FiCreditCard className="w-8 h-8 text-[#64748B] mx-auto mb-2" />
              <p className="text-xs text-[#64748B]">Hali to'lov ma'lumotlari mavjud emas</p>
            </div>
          ) : (
            <>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={65}
                      paddingAngle={3}
                      dataKey="count"
                    >
                      {paymentChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.color || COLORS[i % COLORS.length]} stroke="none" />
                      ))}
                    </Pie>
                    <Tooltip content={<PieTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                {paymentChartData.map((p) => (
                  <div key={p.name} className="flex items-center gap-1.5 text-xs">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="text-[#94A3B8]">{p.name}</span>
                    <span className="text-white font-medium">{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
