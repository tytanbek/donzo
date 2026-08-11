'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiPackage, FiEye, FiCheckCircle, FiClock, FiXCircle, FiRefreshCw } from 'react-icons/fi';
import { PageSkeleton } from '@/components/Skeleton';
import OrderDetailModal from '@/components/OrderDetailModal';
import OrderRealtimeList from '@/components/OrderRealtimeList';
import RealTimeIndicator from '@/components/RealTimeIndicator';
import toast from 'react-hot-toast';
import { orderAPI } from '@/lib/api';
import { useWebSocket } from '@/lib/websocket';

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

const statusActions: Record<string, { next: string; label: string; color: string }[]> = {
  pending: [
    { next: 'processing', label: 'Qabul qilish', color: 'bg-blue-500 hover:bg-blue-600' },
    { next: 'cancelled', label: 'Bekor qilish', color: 'bg-red-500/80 hover:bg-red-600' },
  ],
  processing: [
    { next: 'completed', label: 'Tugallash', color: 'bg-green-500 hover:bg-green-600' },
    { next: 'cancelled', label: 'Bekor qilish', color: 'bg-red-500/80 hover:bg-red-600' },
  ],
  completed: [],
  cancelled: [],
};

export default function OperatorOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [updatingOrderId, setUpdatingOrderId] = useState<number | null>(null);
  const { connectionStatus, lastEvent } = useWebSocket();

  // Auto-refresh when order changes come via WebSocket
  useEffect(() => {
    if (lastEvent?.type === 'order_created' || lastEvent?.type === 'order_updated') {
      fetchOrders();
    }
  }, [lastEvent]);

  const fetchOrders = async () => {
    try {
      const res = await orderAPI.adminList({ status: filterStatus || undefined, search: searchQuery || undefined });
      setOrders(res.data.results || res.data);
    } catch (e) {
      toast.error('Buyurtmalarni yuklashda xatolik');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, [filterStatus]);

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    setUpdatingOrderId(orderId);
    try {
      await orderAPI.updateStatus(orderId, newStatus);
      toast.success(`Buyurtma statusi "${statusLabels[newStatus]}" ga o'zgartirildi`);
      fetchOrders();
    } catch (e) {
      toast.error('Xatolik yuz berdi');
    } finally {
      setUpdatingOrderId(null);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  const filters = [
    { value: '', label: 'Barchasi' },
    { value: 'pending', label: 'Kutilmoqda' },
    { value: 'processing', label: 'Bajarilmoqda' },
    { value: 'completed', label: 'Tugallangan' },
    { value: 'cancelled', label: 'Bekor qilingan' },
  ];

  if (isLoading) return <div className="pt-8"><PageSkeleton /></div>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Buyurtmalar</h1>
          <p className="text-sm text-[#64748B]">Barcha buyurtmalarni ko'rish va boshqarish</p>
        </div>
        <div className="flex items-center gap-3">
          <RealTimeIndicator isConnected={connectionStatus === 'connected'} showLabel={false} />
          <OrderRealtimeList
            onNewOrder={() => fetchOrders()}
            onOrderUpdate={() => fetchOrders()}
          />
          <span className="text-xs text-[#64748B]">{orders.length} ta buyurtma</span>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buyurtma raqami, mijoz nomi yoki telegram..."
              className="glass-input pl-10 w-full"
            />
          </form>
          <div className="flex gap-2 flex-wrap">
            {filters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilterStatus(f.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  filterStatus === f.value
                    ? 'bg-[#A855F7]/20 text-[#A855F7] border border-[#A855F7]/30'
                    : 'bg-white/5 text-[#64748B] hover:text-white border border-transparent'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="glass-card p-6">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-[#64748B] uppercase tracking-wider">
                <th className="text-left pb-3 font-medium">Raqam</th>
                <th className="text-left pb-3 font-medium">Mijoz</th>
                <th className="text-left pb-3 font-medium">Xizmat</th>
                <th className="text-left pb-3 font-medium">Narx</th>
                <th className="text-left pb-3 font-medium">To'lov</th>
                <th className="text-left pb-3 font-medium">Telegram</th>
                <th className="text-left pb-3 font-medium">Holat</th>
                <th className="text-left pb-3 font-medium">Amallar</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              {orders.map((order: any) => (
                <motion.tr
                  key={order.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="border-t border-white/5 hover:bg-white/[0.04] transition-colors"
                >
                  <td className="py-3">
                    <button
                      onClick={() => setSelectedOrderId(order.id)}
                      className="text-[#A855F7] font-mono text-xs hover:underline"
                    >
                      #{order.order_number?.slice(-8)}
                    </button>
                  </td>
                  <td className="py-3 text-white">{order.customer_name}</td>
                  <td className="py-3 text-[#94A3B8] max-w-[150px] truncate">{order.service_name}</td>
                  <td className="py-3 text-white">{Number(order.total_price).toLocaleString()} so'm</td>
                  <td className="py-3">
                    <span className={`text-xs font-medium ${order.payment_status === 'paid' ? 'text-green-400' : 'text-yellow-400'}`}>
                      {order.payment_status === 'paid' ? "To'langan" : "To'lanmagan"}
                    </span>
                  </td>
                  <td className="py-3 text-[#94A3B8] text-xs">{order.customer_telegram || '—'}</td>
                  <td className="py-3">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[order.status] || ''}`}>
                      {statusLabels[order.status] || order.status}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-1.5">
                      {statusActions[order.status]?.map((action) => (
                        <button
                          key={action.next}
                          onClick={() => handleStatusChange(order.id, action.next)}
                          disabled={updatingOrderId === order.id}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium text-white transition-all disabled:opacity-50 ${action.color}`}
                        >
                          {updatingOrderId === order.id ? '...' : action.label}
                        </button>
                      ))}
                      <button
                        onClick={() => setSelectedOrderId(order.id)}
                        className="p-1.5 rounded-lg bg-white/5 text-[#64748B] hover:text-white hover:bg-white/10 transition-all"
                        title="Batafsil"
                      >
                        <FiEye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[#64748B] text-sm">
                    <FiPackage className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    Buyurtmalar mavjud emas
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Modal */}
      <OrderDetailModal
        orderId={selectedOrderId}
        onClose={() => { setSelectedOrderId(null); }}
      />
    </div>
  );
}
