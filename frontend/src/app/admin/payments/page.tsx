'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiDollarSign, FiCheckCircle, FiXCircle, FiClock, FiExternalLink, FiRefreshCw } from 'react-icons/fi';
import { adminAPI, balanceAPI } from '@/lib/api';
import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

const providerColors: Record<string, string> = {
  balance: 'bg-green-500/10 text-green-400 border-green-500/20',
};

const statusConfig: Record<string, { label: string; color: string; bg: string }> = {
  pending: { label: 'Kutilmoqda', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  success: { label: 'Muvaffaqiyatli', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  failed: { label: 'Xatolik', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
};

export default function AdminPaymentsPage() {
  const [payments, setPayments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [providerFilter, setProviderFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [topUps, setTopUps] = useState<any[]>([]);
  const [topUpsLoading, setTopUpsLoading] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);

  const fetchTopUps = async () => {
    setTopUpsLoading(true);
    try {
      const res = await balanceAPI.adminTopUps({ status: 'pending' });
      setTopUps(res.data.results || res.data || []);
    } catch (e) { console.error(e); }
    finally { setTopUpsLoading(false); }
  };

  const handleTopUpAction = async (id: number, action: 'approve' | 'reject') => {
    setActingId(id);
    try {
      if (action === 'approve') {
        await balanceAPI.approveTopUp(id);
        toast.success('Balans to\'ldirish tasdiqlandi ✅');
      } else {
        await balanceAPI.rejectTopUp(id);
        toast.success('So\'rov rad etildi');
      }
      fetchTopUps();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setActingId(null);
    }
  };

  const fetchPayments = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (providerFilter !== 'all') params.provider = providerFilter;
      if (search) params.search = search;
      const res = await axios.get(`${API_BASE}/admin/payments/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
        params,
      });
      setPayments(res.data.results || res.data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchPayments(); }, [statusFilter, providerFilter]);
  useEffect(() => { fetchTopUps(); }, []);

  const totals = {
    total: payments.length,
    success: payments.filter(p => p.status === 'success').length,
    pending: payments.filter(p => p.status === 'pending').length,
    failed: payments.filter(p => p.status === 'failed').length,
    revenue: payments.filter(p => p.status === 'success').reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0),
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">To'lovlar</h1>
          <p className="text-sm text-[#64748B]">Barcha to'lovlar tarixi</p>
        </div>
        <button onClick={fetchPayments} className="glow-btn-outline flex items-center gap-2 px-4 py-2 text-sm">
          <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Yangilash
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="glass-card p-4">
          <p className="text-2xl font-bold text-white">{totals.total}</p>
          <p className="text-xs text-[#64748B]">Jami to'lovlar</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-2xl font-bold text-green-400">{totals.success}</p>
          <p className="text-xs text-[#64748B]">Muvaffaqiyatli</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-2xl font-bold text-yellow-400">{totals.pending}</p>
          <p className="text-xs text-[#64748B]">Kutilmoqda</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-2xl font-bold text-red-400">{totals.failed}</p>
          <p className="text-xs text-[#64748B]">Xatolik</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-2xl font-bold gradient-text">{totals.revenue.toLocaleString()}</p>
          <p className="text-xs text-[#64748B]">so'm daromad</p>
        </div>
      </div>

      {/* Filters */}
      <div className="glass-card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <input type="text" placeholder="Transaction ID yoki buyurtma raqami..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchPayments()}
              className="glass-input pl-10 py-3 text-sm"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['all', 'pending', 'success', 'failed'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${statusFilter === s ? 'bg-[#00F5FF]/10 text-[#00F5FF] border border-[#00F5FF]/30' : 'bg-white/5 text-[#94A3B8] border border-white/10 hover:border-white/20'}`}
              >
                {s === 'all' ? 'Barchasi' : s === 'pending' ? 'Kutilmoqda' : s === 'success' ? "Muvaffaqiyatli" : 'Xatolik'}
              </button>
            ))}
          </div>
          <select value={providerFilter} onChange={(e) => setProviderFilter(e.target.value)}
            className="glass-input text-sm w-40">
            <option value="all">Barcha provayderlar</option>
            <option value="balance">Balans</option>
          </select>
        </div>
      </div>

      {/* ═══ Balance top-up requests (admin approval) ═══ */}
      <div className="glass-card p-5 mb-6 border-amber-500/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <FiClock className="w-4 h-4 text-amber-400" />
              Balans to'ldirish so'rovlari
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5">
              To'lov qabul qilingandan so'ng tasdiqlang — balans faqat shunda qo'shiladi
            </p>
          </div>
          <button onClick={fetchTopUps} className="glow-btn-outline flex items-center gap-2 px-3 py-1.5 text-xs">
            <FiRefreshCw className={`w-3.5 h-3.5 ${topUpsLoading ? 'animate-spin' : ''}`} />
            Yangilash
          </button>
        </div>

        {topUpsLoading ? (
          <div className="p-8 text-center"><div className="loading-spinner mx-auto" /></div>
        ) : topUps.length === 0 ? (
          <div className="text-center text-[#64748B] py-6 text-sm">
            Kutilayotgan so'rovlar yo'q ✓
          </div>
        ) : (
          <div className="space-y-3">
            {topUps.map((t: any) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                    <FiDollarSign className="w-5 h-5 text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {Number(t.amount).toLocaleString()} so'm
                      <span className="ml-2 text-xs font-normal text-[#64748B]">#{t.id}</span>
                    </p>
                    <p className="text-xs text-[#64748B]">
                      @{t.user?.username || t.user || '—'} • {new Date(t.created_at).toLocaleString('uz-UZ')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium border bg-yellow-500/10 text-yellow-400 border-yellow-500/20">
                    Kutilmoqda
                  </span>
                  <button
                    onClick={() => handleTopUpAction(t.id, 'approve')}
                    disabled={actingId === t.id}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <FiCheckCircle className="w-3.5 h-3.5" />
                    Tasdiqlash
                  </button>
                  <button
                    onClick={() => handleTopUpAction(t.id, 'reject')}
                    disabled={actingId === t.id}
                    className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <FiXCircle className="w-3.5 h-3.5" />
                    Rad etish
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Payments Table */}
      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-[#64748B] uppercase tracking-wider border-b border-white/5">
                <th className="text-left p-4">ID</th>
                <th className="text-left p-4">Provayder</th>
                <th className="text-left p-4">Transaction ID</th>
                <th className="text-left p-4">Buyurtma</th>
                <th className="text-left p-4">Summa</th>
                <th className="text-left p-4">Holat</th>
                <th className="text-left p-4">Sana</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="p-12 text-center"><div className="loading-spinner mx-auto" /></td></tr>
              ) : payments.length === 0 ? (
                <tr><td colSpan={7} className="p-12 text-center text-[#64748B]">To'lovlar mavjud emas</td></tr>
              ) : (
                payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">
                    <td className="p-4 text-[#64748B] font-mono text-xs">#{p.id}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${providerColors[p.provider] || 'bg-white/10 text-[#94A3B8]'}`}>
                        BALANS
                      </span>
                    </td>
                    <td className="p-4 text-xs text-[#94A3B8] font-mono">{p.transaction_id || '—'}</td>
                    <td className="p-4 text-xs text-[#94A3B8]">{p.order ? `#${p.order}` : '—'}</td>
                    <td className="p-4 text-sm text-white font-medium">{Number(p.amount).toLocaleString()} so'm</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${statusConfig[p.status]?.bg || 'bg-white/10'} ${statusConfig[p.status]?.color || 'text-[#94A3B8]'}`}>
                        {statusConfig[p.status]?.label || p.status}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-[#64748B]">{new Date(p.created_at).toLocaleString('uz-UZ')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
