'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FiPackage, FiDollarSign, FiUser, FiShoppingBag, FiTrendingUp, FiEye, FiArrowRight, FiCopy, FiCheckCircle, FiClock } from 'react-icons/fi';
import { PageSkeleton } from '@/components/Skeleton';
import OrderDetailModal from '@/components/OrderDetailModal';
import { useStore } from '@/lib/store';
import { orderAPI } from '@/lib/api';
import toast from 'react-hot-toast';

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

export default function CustomerDashboard() {
  const { user, isAuthenticated } = useStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    const fetchData = async () => {
      try {
        const res = await orderAPI.list();
        setOrders(res.data.results || res.data || []);
      } catch (e) {
        console.error('Error fetching orders:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [isAuthenticated]);

  // DEMO MODE: layout avtomatik demo-login qiladi — yuklanayotganda spinner.
  if (!isAuthenticated || !user) {
    return <div className="px-4 pt-6 pb-6"><div className="max-w-md mx-auto glass-card p-8 text-center text-sm text-[#9CA3AF]">Yuklanmoqda...</div></div>;
  }

  const activeOrders = orders.filter(o => o.status === 'pending' || o.status === 'processing');
  const completedOrders = orders.filter(o => o.status === 'completed');

  const quickStats = [
    { icon: FiShoppingBag, label: 'Jami buyurtmalar', value: orders.length, color: 'from-[#00F5FF]/20 to-blue-500/20', iconColor: 'text-[#00F5FF]' },
    { icon: FiClock, label: 'Faol buyurtmalar', value: activeOrders.length, color: 'from-yellow-500/20 to-orange-500/20', iconColor: 'text-yellow-400' },
    { icon: FiCheckCircle, label: 'Tugallangan', value: completedOrders.length, color: 'from-green-500/20 to-emerald-500/20', iconColor: 'text-green-400' },
    { icon: FiDollarSign, label: 'Balans', value: `${Number(user.balance || 0).toLocaleString()} so'm`, color: 'from-[#A855F7]/20 to-pink-500/20', iconColor: 'text-[#A855F7]' },
  ];

  return (
    <div className="px-4 pt-4 pb-6">
      <div className="max-w-md mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Welcome Header */}
          <div className="glass-card p-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#00F5FF]/5 rounded-full blur-[80px]" />
            <div className="relative z-10">
              <h1 className="text-2xl font-bold text-white">
                Xush kelibsiz, {user.username}! 👋
              </h1>
              <p className="text-[#64748B] text-sm mt-1">
                Tez va ishonchli donat platformasi
              </p>
              <div className="flex items-center gap-3 mt-3">
                <span className="px-3 py-1 rounded-full bg-[#00F5FF]/10 text-xs text-[#00F5FF] border border-[#00F5FF]/20">
                  Mijoz
                </span>
                {user.referral_code && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(user.referral_code!);
                      toast.success('Referral kod nusxalandi');
                    }}
                    className="flex items-center gap-1 px-3 py-1 rounded-full bg-white/5 text-xs text-[#94A3B8] hover:text-white transition-colors"
                  >
                    <FiCopy className="w-3 h-3" />
                    {user.referral_code}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-3">
            {quickStats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card p-4"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center`}>
                    <stat.icon className={`w-4 h-4 ${stat.iconColor}`} />
                  </div>
                </div>
                <p className="text-lg font-bold text-white">{stat.value}</p>
                <p className="text-[11px] text-[#64748B] mt-0.5">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 gap-2">
            <Link href="/" className="glass-card p-5 flex items-center justify-between group hover:border-[#00F5FF]/30 transition-all duration-300">
              <div className="flex items-center gap-3">
                <FiShoppingBag className="w-5 h-5 text-[#00F5FF]" />
                <span className="text-sm text-white font-medium">Xizmatlar</span>
              </div>
              <FiArrowRight className="w-4 h-4 text-[#64748B] group-hover:text-[#00F5FF] group-hover:translate-x-1 transition-all" />
            </Link>
            <Link href="/balance" className="glass-card p-5 flex items-center justify-between group hover:border-[#00F5FF]/30 transition-all duration-300">
              <div className="flex items-center gap-3">
                <FiDollarSign className="w-5 h-5 text-[#00F5FF]" />
                <span className="text-sm text-white font-medium">Balans to'ldirish</span>
              </div>
              <FiArrowRight className="w-4 h-4 text-[#64748B] group-hover:text-[#00F5FF] group-hover:translate-x-1 transition-all" />
            </Link>
            <Link href="/profile" className="glass-card p-5 flex items-center justify-between group hover:border-[#00F5FF]/30 transition-all duration-300">
              <div className="flex items-center gap-3">
                <FiUser className="w-5 h-5 text-[#00F5FF]" />
                <span className="text-sm text-white font-medium">Profil</span>
              </div>
              <FiArrowRight className="w-4 h-4 text-[#64748B] group-hover:text-[#00F5FF] group-hover:translate-x-1 transition-all" />
            </Link>
          </div>

          {/* My Orders */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <FiPackage className="w-5 h-5 text-[#00F5FF]" />
                <h2 className="text-lg font-bold text-white">Mening buyurtmalarim</h2>
              </div>
              <Link href="/orders" className="text-xs text-[#00F5FF] hover:underline flex items-center gap-1">
                Barchasini ko'rish <FiArrowRight className="w-3 h-3" />
              </Link>
            </div>

            {isLoading ? (
              <PageSkeleton />
            ) : orders.length === 0 ? (
              <div className="text-center py-12">
                <FiPackage className="w-16 h-16 mx-auto mb-4 text-[#374151]" />
                <p className="text-[#64748B] mb-4">Hali buyurtmalar mavjud emas</p>
                <Link href="/" className="glow-btn inline-flex items-center gap-2 px-6 py-3">
                  <FiShoppingBag className="w-4 h-4" />
                  Xizmatlarni ko'rish
                </Link>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-xs text-[#64748B] uppercase tracking-wider">
                      <th className="text-left pb-3 font-medium">Raqam</th>
                      <th className="text-left pb-3 font-medium">Xizmat</th>
                      <th className="text-left pb-3 font-medium">Narx</th>
                      <th className="text-left pb-3 font-medium">To'lov</th>
                      <th className="text-left pb-3 font-medium">Holat</th>
                      <th className="text-left pb-3 font-medium">Sana</th>
                      <th className="text-left pb-3 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {orders.slice(0, 5).map((order: any) => (
                      <tr
                        key={order.id}
                        className="border-t border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                      >
                        <td className="py-3 text-[#00F5FF] font-mono text-xs">#{order.order_number?.slice(-8)}</td>
                        <td className="py-3 text-white">{order.service_name}</td>
                        <td className="py-3 text-white">{Number(order.total_price).toLocaleString()} so'm</td>
                        <td className="py-3">
                          <span className={`text-xs font-medium ${order.payment_status === 'paid' ? 'text-green-400' : 'text-yellow-400'}`}>
                            {order.payment_status === 'paid' ? "To'langan" : "To'lanmagan"}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[order.status] || ''}`}>
                            {statusLabels[order.status] || order.status}
                          </span>
                        </td>
                        <td className="py-3 text-[#64748B] text-xs">
                          {new Date(order.created_at).toLocaleDateString('uz-UZ')}
                        </td>
                        <td className="py-3">
                          <button
                            onClick={() => setSelectedOrderId(order.id)}
                            className="p-1.5 rounded-lg bg-white/5 text-[#64748B] opacity-0 group-hover:opacity-100 transition-all hover:text-white"
                          >
                            <FiEye className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Order Detail Modal */}
      <OrderDetailModal
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  );
}
