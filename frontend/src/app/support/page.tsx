'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiShoppingBag, FiUsers, FiClock, FiCheckCircle, FiEye, FiMessageCircle } from 'react-icons/fi';
import { PageSkeleton } from '@/components/Skeleton';
import OrderDetailModal from '@/components/OrderDetailModal';
import toast from 'react-hot-toast';
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

export default function SupportDashboard() {
  const { user } = useStore();
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/admin/operator/dashboard/`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (e) {
        // Non-critical
      } finally {
        setIsLoading(false);
      }
    };
    fetchDashboard();
  }, []);

  const statCards = [
    { icon: FiShoppingBag, label: 'Jami buyurtmalar', value: stats?.total_orders || 0, color: 'from-teal-500/20 to-teal-600/20', iconColor: 'text-teal-400' },
    { icon: FiClock, label: 'Kutilayotgan', value: stats?.pending_orders || 0, color: 'from-yellow-500/20 to-orange-500/20', iconColor: 'text-yellow-400' },
    { icon: FiCheckCircle, label: 'Bugun bajarilgan', value: stats?.today_completed || 0, color: 'from-green-500/20 to-emerald-500/20', iconColor: 'text-green-400' },
    { icon: FiUsers, label: 'Faol mijozlar', value: stats?.today_orders || 0, color: 'from-blue-500/20 to-indigo-500/20', iconColor: 'text-blue-400' },
  ];

  if (isLoading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">Support paneli</h1>
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
          <h1 className="text-2xl font-bold text-white">Support paneli</h1>
          <p className="text-sm text-[#64748B]">Xush kelibsiz, {user?.username}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-full bg-teal-500/10 text-xs text-teal-400 border border-teal-500/20">
            Support Agent
          </span>
        </div>
      </div>

      {/* Stats */}
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
          </motion.div>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
              <FiMessageCircle className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Mijozlarga yordam</h3>
              <p className="text-xs text-[#64748B]">Buyurtmalar va to'lovlar bo'yicha</p>
            </div>
          </div>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Siz mijozlarning buyurtmalarini ko'rib chiqishingiz, ularga yordam berishingiz va 
            operatorlarga buyurtmalarni yo'naltirishingiz mumkin.
          </p>
        </div>

        <div className="glass-card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
              <FiShoppingBag className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Oxirgi buyurtmalar</h3>
              <p className="text-xs text-[#64748B]">So'nggi 5 ta buyurtma</p>
            </div>
          </div>
          <div className="space-y-2">
            {stats?.recent_orders?.slice(0, 5).map((order: any) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
                onClick={() => setSelectedOrderId(order.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs text-teal-400 font-mono">#{order.order_number?.slice(-8)}</span>
                  <span className="text-xs text-[#94A3B8]">{order.customer_name}</span>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${statusColors[order.status] || ''}`}>
                  {statusLabels[order.status] || order.status}
                </span>
              </div>
            ))}
            {(!stats?.recent_orders || stats.recent_orders.length === 0) && (
              <p className="text-sm text-[#64748B] text-center py-4">Buyurtmalar mavjud emas</p>
            )}
          </div>
        </div>
      </div>

      {/* Order Detail Modal */}
      <OrderDetailModal
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  );
}
