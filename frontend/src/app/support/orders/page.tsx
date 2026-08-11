'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiEye, FiShoppingBag } from 'react-icons/fi';
import { PageSkeleton } from '@/components/Skeleton';
import OrderDetailModal from '@/components/OrderDetailModal';
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

export default function SupportOrders() {
  const { user } = useStore();
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1'}/orders/`,
          { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } }
        );
        if (res.ok) {
          const data = await res.json();
          setOrders(data.results || data || []);
        }
      } catch (e) {
        console.error('Error fetching orders:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, []);

  const filteredOrders = orders.filter(order => {
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const orderNum = (order.order_number || '').toLowerCase();
      const custName = (order.customer_name || '').toLowerCase();
      const custTelegram = (order.customer_telegram || '').toLowerCase();
      if (!orderNum.includes(q) && !custName.includes(q) && !custTelegram.includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Buyurtmalar</h1>
          <p className="text-sm text-[#64748B]">Barcha buyurtmalarni ko'rish</p>
        </div>
        <span className="px-3 py-1.5 rounded-full bg-teal-500/10 text-xs text-teal-400 border border-teal-500/20">
          {filteredOrders.length} ta
        </span>
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buyurtma raqami, mijoz nomi yoki telegram..."
            className="glass-input w-full pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="glass-input w-44"
        >
          <option value="all">Barcha holatlar</option>
          <option value="pending">Kutilmoqda</option>
          <option value="processing">Bajarilmoqda</option>
          <option value="completed">Tugallangan</option>
          <option value="cancelled">Bekor qilingan</option>
        </select>
      </div>

      {/* Orders Table */}
      {isLoading ? (
        <PageSkeleton />
      ) : (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[#64748B] uppercase tracking-wider border-b border-white/5">
                  <th className="text-left p-4 font-medium">Raqam</th>
                  <th className="text-left p-4 font-medium">Mijoz</th>
                  <th className="text-left p-4 font-medium">Xizmat</th>
                  <th className="text-left p-4 font-medium">Narx</th>
                  <th className="text-left p-4 font-medium">Telegram</th>
                  <th className="text-left p-4 font-medium">Holat</th>
                  <th className="text-left p-4 font-medium">Sana</th>
                  <th className="text-left p-4 font-medium"></th>
                </tr>
              </thead>
              <tbody className="text-sm">
                {filteredOrders.map((order: any) => (
                  <tr
                    key={order.id}
                    className="border-b border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <td className="p-4 text-teal-400 font-mono text-xs">#{order.order_number?.slice(-8)}</td>
                    <td className="p-4 text-white">{order.customer_name}</td>
                    <td className="p-4 text-[#94A3B8]">{order.service_name}</td>
                    <td className="p-4 text-white">{Number(order.total_price).toLocaleString()} so'm</td>
                    <td className="p-4 text-[#94A3B8] text-xs">{order.customer_telegram || '—'}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusColors[order.status] || ''}`}>
                        {statusLabels[order.status] || order.status}
                      </span>
                    </td>
                    <td className="p-4 text-[#64748B] text-xs">
                      {new Date(order.created_at).toLocaleDateString('uz-UZ')}
                    </td>
                    <td className="p-4">
                      <button
                        onClick={() => setSelectedOrderId(order.id)}
                        className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400 opacity-0 group-hover:opacity-100 transition-all hover:bg-teal-500/20"
                        title="Batafsil"
                      >
                        <FiEye className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-[#64748B] text-sm">
                      <FiShoppingBag className="w-10 h-10 mx-auto mb-2 opacity-50" />
                      Buyurtmalar topilmadi
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <OrderDetailModal
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  );
}
