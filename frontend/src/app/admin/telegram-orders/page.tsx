'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiRefreshCw, FiCheck, FiX, FiSearch, FiZap, FiStar, FiAward,
  FiAlertCircle, FiClipboard, FiDollarSign, FiClock, FiSend
} from 'react-icons/fi';
import { telegramOrderAPI } from '@/lib/api';
import OrderStatus from '@/components/OrderStatus';
import toast from 'react-hot-toast';

const STATUS_OPTIONS = ['all', 'pending', 'processing', 'completed', 'cancelled'];
const TYPE_OPTIONS = [
  { key: 'all', label: 'Barchasi', icon: FiZap },
  { key: 'premium', label: 'Premium', icon: FiAward },
  { key: 'stars', label: 'Stars', icon: FiStar },
];

const money = (v: any) => Number(v || 0).toLocaleString('uz-UZ');

function isStars(order: any): boolean {
  return /stars/i.test(order.package_name || '');
}

function getUsername(order: any): string {
  const fv = order.field_values || {};
  const uname = fv.username || fv.telegram || '';
  if (uname) return String(uname).startsWith('@') ? uname : `@${uname}`;
  return order.customer_telegram || '—';
}

function copyText(text: string) {
  if (navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
  toast.success(`Nusxalandi: ${text}`);
}

export default function AdminTelegramOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  // Search faqat submit'da API'ga yuboriladi (har tugma bosishda so'rov
  // ketmasligi uchun) — `submittedQ` fetchData dep'ida turadi.
  const [submittedQ, setSubmittedQ] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timerRef = useRef<any>(null);

  const fetchData = useCallback(async () => {
    try {
      const params: any = {};
      if (statusFilter !== 'all') params.status = statusFilter;
      if (submittedQ.trim()) params.q = submittedQ.trim();
      const res = await telegramOrderAPI.list(params);
      setOrders(res.data.results || []);
      setStats(res.data.stats || null);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Error fetching telegram orders:', e);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, submittedQ]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 6s so confirm/reject results appear without reload
  useEffect(() => {
    timerRef.current = setInterval(fetchData, 6000);
    return () => clearInterval(timerRef.current);
  }, [fetchData]);

  const handleConfirm = async (order: any) => {
    setBusyId(order.id);
    try {
      const res = await telegramOrderAPI.confirm(order.id);
      const data = res.data;
      if (data.ok) {
        toast.success(data.detail || 'Buyurtma bajarildi ✅');
      } else {
        toast.error(data.detail || 'Buyurtmani bajarib bo‘lmadi');
      }
      fetchData();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Xatolik yuz berdi');
      fetchData();
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setRejecting(true);
    try {
      const res = await telegramOrderAPI.reject(rejectTarget.id, rejectReason.trim());
      toast.success(res.data.detail || 'Buyurtma rad etildi');
      setRejectTarget(null);
      setRejectReason('');
      fetchData();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setRejecting(false);
    }
  };

  const filtered = orders.filter((o) => {
    if (typeFilter === 'premium') return !isStars(o);
    if (typeFilter === 'stars') return isStars(o);
    return true;
  });

  const renderActionButtons = (order: any) => {
    const paid = order.payment_status === 'paid';
    if (order.status === 'completed') {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); copyText(order.order_number); }}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#64748B] hover:text-white transition-all"
            title="Buyurtma raqamini nusxalash"
          >
            <FiClipboard className="w-4 h-4" />
          </button>
        </div>
      );
    }
    if (order.status === 'cancelled') {
      return <span className="text-xs text-[#64748B]">—</span>;
    }
    if (!paid) {
      return (
        <span className="text-xs text-[#64748B]">
          <FiAlertCircle className="inline w-3.5 h-3.5 mr-1" />
          To‘lanmagan
        </span>
      );
    }
    if (order.status === 'pending') {
      return (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleConfirm(order); }}
            disabled={busyId === order.id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            title="Fragment API orqali darhol bajarish"
          >
            {busyId === order.id ? (
              <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <FiCheck className="w-3.5 h-3.5" />
            )}
            Tasdiqlash
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setRejectTarget(order); setRejectReason(''); }}
            disabled={busyId === order.id}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 hover:text-red-300 active:scale-95 transition-all disabled:opacity-50"
            title="Bekor qilish va balansni qaytarish"
          >
            <FiX className="w-3.5 h-3.5" />
            Rad qilish
          </button>
        </div>
      );
    }
    // processing — yetkazib berishda xatolik; qayta tasdiqlash xavfli (double-spend),
    // faqat rad qilish (balans qaytariladi)
    return (
      <button
        onClick={(e) => { e.stopPropagation(); setRejectTarget(order); setRejectReason(''); }}
        disabled={busyId === order.id}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/25 hover:bg-red-500/20 hover:text-red-300 active:scale-95 transition-all disabled:opacity-50"
        title="Bekor qilish va balansni qaytarish"
      >
        <FiX className="w-3.5 h-3.5" />
        Rad qilish
      </button>
    );
  };

  return (
    <div>
      {/* ═══ Header ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#229ED9]/30 to-[#2AABEE]/10 border border-[#2AABEE]/30 flex items-center justify-center">
              <FiSend className="w-5 h-5 text-[#2AABEE]" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Telegram buyurtmalar</h1>
              <p className="text-sm text-[#64748B]">
                Premium va Stars yetkazib berish — tasdiqlang, fragment-api.uz orqali darhol bajariladi
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-[#64748B] flex items-center gap-1.5">
              <FiClock className="w-3.5 h-3.5" />
              {lastUpdated.toLocaleTimeString('uz-UZ')}
            </span>
          )}
          <button
            onClick={fetchData}
            className="glow-btn-outline flex items-center gap-2 px-4 py-2 text-sm"
          >
            <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Yangilash
          </button>
        </div>
      </div>

      {/* ═══ KPI Cards ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          {
            label: 'Tasdiq kutilmoqda',
            value: stats ? String(stats.waiting) : '—',
            sub: stats ? `${money(stats.waiting_revenue)} so‘m` : '',
            icon: FiClock,
            accent: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
          },
          {
            label: 'Tugallangan',
            value: stats ? String(stats.completed) : '—',
            sub: stats ? `${money(stats.total_revenue)} so‘m daromad` : '',
            icon: FiCheck,
            accent: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20',
          },
          {
            label: 'Jami buyurtma',
            value: stats ? String(stats.total) : '—',
            sub: stats
              ? `${money(stats.waiting_revenue + stats.total_revenue + (stats.refunded_revenue || 0))} so‘m to‘langan`
              : '',
            icon: FiDollarSign,
            accent: 'text-[#2AABEE] bg-[#2AABEE]/10 border-[#2AABEE]/20',
          },
          {
            label: 'Rad etilgan',
            value: stats ? String(stats.cancelled) : '—',
            sub: 'Balans qaytarilgan',
            icon: FiX,
            accent: 'text-red-400 bg-red-400/10 border-red-400/20',
          },
        ].map((k) => (
          <div key={k.label} className="glass-card p-4 flex items-center gap-4">
            <div className={`w-11 h-11 rounded-2xl border flex items-center justify-center flex-shrink-0 ${k.accent}`}>
              <k.icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-[#64748B] uppercase tracking-wider">{k.label}</p>
              <p className="text-xl font-bold text-white leading-tight">{k.value}</p>
              {k.sub && <p className="text-[11px] text-[#64748B] truncate">{k.sub}</p>}
            </div>
          </div>
        ))}
      </div>

      {/* ═══ Filters ═══ */}
      <div className="glass-card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setSubmittedQ(search.trim());
              // Bir xil so'rov qayta yuborilsa identity o'zgarmaydi — qo'lda chaqiramiz
              if (search.trim() === submittedQ.trim()) fetchData();
            }}
            className="flex-1"
          >
            <div className="relative">
              <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
              <input
                type="text"
                placeholder="Qidirish (buyurtma raqami, @username...)"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="glass-input pl-10 py-3 text-sm"
              />
            </div>
          </form>
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1 w-fit">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTypeFilter(t.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                  typeFilter === t.key
                    ? 'bg-[#2AABEE]/15 text-[#2AABEE] shadow-lg shadow-[#2AABEE]/10'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap mt-3">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all ${
                statusFilter === s
                  ? 'bg-[#00F5FF]/10 text-[#00F5FF] border border-[#00F5FF]/30'
                  : 'bg-white/5 text-[#94A3B8] border border-white/10 hover:border-white/20'
              }`}
            >
              {s === 'all' ? 'Barchasi' :
               s === 'pending' ? 'Kutilmoqda' :
               s === 'processing' ? 'Bajarilmoqda' :
               s === 'completed' ? 'Tugallangan' : 'Bekor qilingan'}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Orders ═══ */}
      <div className="glass-card overflow-hidden">
        {isLoading ? (
          <div className="p-12 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-2xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-[#229ED9]/15 to-[#2AABEE]/5 border border-[#2AABEE]/20 flex items-center justify-center mb-4">
              <FiSend className="w-9 h-9 text-[#2AABEE]/60" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">Telegram buyurtmalar topilmadi</h3>
            <p className="text-sm text-[#64748B] max-w-md mx-auto">
              Telegram Premium yoki Stars buyurtmasi to‘langach shu yerda paydo bo‘ladi va
              tasdiqlashni kutadi.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-xs text-[#64748B] uppercase tracking-wider border-b border-white/5">
                  <th className="text-left p-4">Buyurtma</th>
                  <th className="text-left p-4">Mijoz</th>
                  <th className="text-left p-4">Paket</th>
                  <th className="text-left p-4">Narx</th>
                  <th className="text-left p-4">To‘lov</th>
                  <th className="text-left p-4">Holat</th>
                  <th className="text-left p-4">Sana</th>
                  <th className="text-left p-4">Amal</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => {
                  const stars = isStars(order);
                  return (
                    <tr key={order.id} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors group">
                      <td className="p-4">
                        <span className="text-[#00F5FF] font-mono text-sm">#{order.order_number?.slice(-6)}</span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-sm text-white">
                          {stars
                            ? <FiStar className="w-3.5 h-3.5 text-[#FFD54A]" />
                            : <FiAward className="w-3.5 h-3.5 text-[#2AABEE]" />}
                          <span>{getUsername(order)}</span>
                        </div>
                        <div className="text-xs text-[#64748B]">{order.customer_name}</div>
                      </td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                            stars
                              ? 'bg-[#FFD54A]/10 text-[#FFD54A] border-[#FFD54A]/25'
                              : 'bg-[#2AABEE]/10 text-[#2AABEE] border-[#2AABEE]/25'
                          }`}
                        >
                          {stars ? '⭐ ' : '👑 '}{order.package_name}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-white font-medium">{money(order.total_price)} so‘m</td>
                      <td className="p-4">
                        <span
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${
                            order.payment_status === 'paid'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25'
                              : order.payment_status === 'refunded'
                              ? 'bg-orange-500/10 text-orange-400 border-orange-500/25'
                              : 'bg-white/5 text-[#64748B] border-white/10'
                          }`}
                        >
                          {order.payment_status === 'paid' ? '✅ To‘langan' :
                           order.payment_status === 'refunded' ? '↩️ Qaytarilgan' : 'To‘lanmagan'}
                        </span>
                      </td>
                      <td className="p-4">
                        <OrderStatus status={order.status} size="sm" />
                      </td>
                      <td className="p-4 text-sm text-[#64748B]">
                        {new Date(order.created_at).toLocaleString('uz-UZ', {
                          day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="p-4">{renderActionButtons(order)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ Reject Modal ═══ */}
      <AnimatePresence>
        {rejectTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setRejectTarget(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card max-w-md w-full p-6"
            >
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-4">
                <FiAlertCircle className="w-6 h-6 text-red-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">Buyurtmani rad etish</h3>
              <p className="text-sm text-[#64748B] mb-4">
                #{rejectTarget.order_number} · {getUsername(rejectTarget)} ·{' '}
                {rejectTarget.package_name} — <b className="text-white">{money(rejectTarget.total_price)} so‘m</b>
                {rejectTarget.payment_status === 'paid' && (
                  <> mijoz balansiga <b className="text-emerald-400">qaytariladi</b></>
                )}
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Rad etish sababi (mijozga ko‘rinadi)"
                rows={3}
                className="glass-input w-full p-3 text-sm mb-5"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setRejectTarget(null)}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-medium bg-white/5 text-[#94A3B8] hover:bg-white/10 transition-all"
                >
                  Bekor qilish
                </button>
                <button
                  onClick={handleReject}
                  disabled={rejecting}
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-red-500 to-rose-500 text-white shadow-lg shadow-red-500/20 hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                >
                  {rejecting ? (
                    <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin align-middle" />
                  ) : (
                    'Rad etish'
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
