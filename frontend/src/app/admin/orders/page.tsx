'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiFilter, FiRefreshCw, FiChevronDown, FiEye, FiDownload } from 'react-icons/fi';
import { orderAPI } from '@/lib/api';
import OrderStatus from '@/components/OrderStatus';
import OrderDetailModal from '@/components/OrderDetailModal';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const statusOptions = ['all', 'pending', 'processing', 'completed', 'cancelled'];

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (search) params.search = search;
      const res = await orderAPI.adminList(params);
      setOrders(res.data.results || res.data);
    } catch (e) {
      console.error('Error fetching orders:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchOrders(); }, [statusFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchOrders();
  };

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    setUpdatingId(orderId);
    try {
      await orderAPI.updateStatus(orderId, newStatus);
      toast.success('Status yangilandi');
      fetchOrders();
    } catch (e: any) {
      toast.error('Xatolik yuz berdi');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Buyurtmalar boshqaruvi</h1>
          <p className="text-sm text-[#64748B]">Barcha buyurtmalarni ko'rish va boshqarish</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const token = localStorage.getItem('access_token');
              const url = `${API_BASE}/export/orders/csv/token/?token=${token}&status=${statusFilter !== 'all' ? statusFilter : ''}`;
              window.open(url, '_blank');
            }}
            className="glow-btn-outline flex items-center gap-2 px-4 py-2 text-sm"
            title="CSV eksport"
          >
            <FiDownload className="w-4 h-4" />
            CSV
          </button>
          <button
            onClick={fetchOrders}
            className="glow-btn-outline flex items-center gap-2 px-4 py-2 text-sm"
          >
            <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Yangilash
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1">
            <div className="relative">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
              <input
                type="text"
                placeholder="Qidirish (buyurtma raqami, mijoz...) "
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="glass-input pl-10 py-3 text-sm"
              />
            </div>
          </form>
          <div className="flex gap-2 flex-wrap">
            {statusOptions.map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                  statusFilter === status
                    ? 'bg-[#00F5FF]/10 text-[#00F5FF] border border-[#00F5FF]/30'
                    : 'bg-white/5 text-[#94A3B8] border border-white/10 hover:border-white/20'
                }`}
              >
                {status === 'all' ? 'Barchasi' :
                 status === 'pending' ? 'Kutilmoqda' :
                 status === 'processing' ? 'Bajarilmoqda' :
                 status === 'completed' ? 'Tugallangan' : 'Bekor qilingan'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-[#64748B] uppercase tracking-wider border-b border-white/5">
                <th className="text-left p-4">ID</th>
                <th className="text-left p-4">Mijoz</th>
                <th className="text-left p-4">Xizmat</th>
                <th className="text-left p-4">Paket</th>
                <th className="text-left p-4">Narx</th>
                <th className="text-left p-4">Holat</th>
                <th className="text-left p-4">Sana</th>
                <th className="text-left p-4">Amal</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <div className="loading-spinner mx-auto" />
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center text-[#64748B]">Buyurtmalar mavjud emas</td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className="border-b border-white/5 hover:bg-white/[0.04] transition-colors cursor-pointer group"
                  >
                    <td className="p-4">
                      <span className="text-[#00F5FF] font-mono text-sm">#{order.order_number?.slice(-6)}</span>
                    </td>
                    <td className="p-4">
                      <div className="text-sm text-white">{order.customer_name}</div>
                      <div className="text-xs text-[#64748B]">{order.customer_telegram}</div>
                    </td>
                    <td className="p-4 text-sm text-[#94A3B8]">{order.service_name}</td>
                    <td className="p-4 text-sm text-[#94A3B8]">{order.package_name}</td>
                    <td className="p-4 text-sm text-white">{Number(order.total_price).toLocaleString()} so'm</td>
                    <td className="p-4">
                      <OrderStatus status={order.status} size="sm" />
                    </td>
                    <td className="p-4 text-sm text-[#64748B]">
                      {new Date(order.created_at).toLocaleDateString('uz-UZ')}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSelectedOrderId(order.id); }}
                          className="p-2 rounded-xl bg-[#00F5FF]/10 text-[#00F5FF] opacity-0 group-hover:opacity-100 transition-all hover:bg-[#00F5FF]/20"
                          title="Batafsil"
                        >
                          <FiEye className="w-4 h-4" />
                        </button>
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <select
                            value={order.status}
                            onChange={(e) => handleStatusChange(order.id, e.target.value)}
                            disabled={updatingId === order.id}
                            className="glass-input text-xs py-1.5 px-2 pr-8 appearance-none cursor-pointer disabled:opacity-50"
                          >
                            <option value="pending">Kutilmoqda</option>
                            <option value="processing">Bajarilmoqda</option>
                            <option value="completed">Tugallangan</option>
                            <option value="cancelled">Bekor qilingan</option>
                          </select>
                          <FiChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[#64748B] pointer-events-none" />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Order Detail Modal */}
      <OrderDetailModal
        orderId={selectedOrderId}
        onClose={() => { setSelectedOrderId(null); fetchOrders(); }}
      />
    </div>
  );
}
