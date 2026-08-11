'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiX, FiCopy, FiClock, FiUser, FiDollarSign, FiPackage, FiCheckCircle, FiAlertCircle, FiSmartphone, FiCalendar } from 'react-icons/fi';
import { orderAPI } from '@/lib/api';
import OrderStatus from './OrderStatus';

interface OrderDetailModalProps {
  orderId: number | null;
  onClose: () => void;
}

const paymentStatusConfig: Record<string, { label: string; color: string; bg: string }> = {
  paid: { label: "To'langan", color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20' },
  unpaid: { label: "To'lanmagan", color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  refunded: { label: 'Qaytarilgan', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
};

const statusTimeline = [
  { key: 'pending', label: 'Yaratilgan', icon: FiClock },
  { key: 'processing', label: 'Bajarilmoqda', icon: FiSmartphone },
  { key: 'completed', label: 'Tugallangan', icon: FiCheckCircle },
  { key: 'cancelled', label: 'Bekor qilingan', icon: FiAlertCircle },
];

export default function OrderDetailModal({ orderId, onClose }: OrderDetailModalProps) {
  const [order, setOrder] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    setLoading(true);
    orderAPI.adminDetail(orderId)
      .then(res => setOrder(res.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orderId]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const currentStatusIndex = order
    ? statusTimeline.findIndex(s => s.key === order.status)
    : -1;

  return (
    <AnimatePresence>
      {orderId && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-4 md:inset-auto md:top-[5%] md:left-1/2 md:-translate-x-1/2 md:w-[600px] md:max-h-[90vh] z-50 overflow-hidden"
          >
            <div className="glass-card h-full md:h-auto md:max-h-[85vh] overflow-y-auto rounded-2xl border border-white/10">
              {/* Header */}
              <div className="sticky top-0 z-10 bg-[#0B0F1A]/95 backdrop-blur-xl border-b border-white/5 p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center">
                    <FiPackage className="w-5 h-5 text-[#00F5FF]" />
                  </div>
                  <div>
                    {loading ? (
                      <div className="h-5 w-32 bg-white/10 rounded animate-pulse" />
                    ) : (
                      <>
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                          Buyurtma #{order?.order_number?.slice(-8)}
                          <button
                            onClick={(e) => { e.stopPropagation(); copyToClipboard(order?.order_number || ''); }}
                            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                            title="Nusxalash"
                          >
                            <FiCopy className="w-3.5 h-3.5 text-[#64748B]" />
                          </button>
                        </h2>
                        <p className="text-xs text-[#64748B]">To'liq ma'lumot</p>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 transition-colors flex items-center justify-center group"
                >
                  <FiX className="w-4 h-4 text-[#64748B] group-hover:text-white transition-colors" />
                </button>
              </div>

              {loading ? (
                <div className="p-8 space-y-4">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : order ? (
                <div className="p-5 space-y-6">
                  {/* Status Timeline */}
                  <div className="glass-deep rounded-2xl p-5">
                    <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-4">Holat</h3>
                    <div className="flex items-center justify-between">
                      {statusTimeline.map((step, i) => {
                        const Icon = step.icon;
                        const isActive = i <= currentStatusIndex;
                        const isCurrent = i === currentStatusIndex;
                        const isCancelled = order.status === 'cancelled';
                        return (
                          <div key={step.key} className="flex flex-col items-center relative">
                            {i < statusTimeline.length - 1 && (
                              <div className={`absolute left-[calc(50%+12px)] top-4 w-[calc(100%-24px)] h-0.5 ${
                                isCancelled && i >= currentStatusIndex
                                  ? 'bg-red-500/30'
                                  : isActive ? 'bg-[#00F5FF]/50' : 'bg-white/10'
                              }`} />
                            )}
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center relative z-10 transition-all duration-300 ${
                              isCurrent
                                ? 'bg-[#00F5FF]/20 border-2 border-[#00F5FF] shadow-lg shadow-[#00F5FF]/20'
                                : isCancelled && i >= currentStatusIndex
                                  ? 'bg-red-500/10 border border-red-500/30'
                                  : isActive
                                    ? 'bg-[#00F5FF]/10 border border-[#00F5FF]/30'
                                    : 'bg-white/5 border border-white/10'
                            }`}>
                              <Icon className={`w-4 h-4 ${
                                isCurrent ? 'text-[#00F5FF]' : isActive ? 'text-[#00F5FF]/70' : 'text-[#64748B]'
                              }`} />
                            </div>
                            <span className={`text-[10px] mt-1.5 whitespace-nowrap ${
                              isCurrent ? 'text-[#00F5FF] font-medium' : 'text-[#64748B]'
                            }`}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Order Info Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="glass-deep rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FiUser className="w-3.5 h-3.5 text-[#00F5FF]" />
                        <span className="text-xs text-[#64748B]">Mijoz</span>
                      </div>
                      <p className="text-sm text-white font-medium">{order.customer_name}</p>
                      <p className="text-xs text-[#64748B] mt-0.5">{order.customer_telegram || "Ko'rsatilmagan"}</p>
                    </div>

                    <div className="glass-deep rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FiPackage className="w-3.5 h-3.5 text-[#00F5FF]" />
                        <span className="text-xs text-[#64748B]">Xizmat</span>
                      </div>
                      <p className="text-sm text-white font-medium">{order.service_name}</p>
                      <p className="text-xs text-[#64748B] mt-0.5">{order.package_name}</p>
                    </div>

                    <div className="glass-deep rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FiDollarSign className="w-3.5 h-3.5 text-[#00F5FF]" />
                        <span className="text-xs text-[#64748B]">To'lov</span>
                      </div>
                      <p className="text-sm text-white font-medium">{Number(order.total_price).toLocaleString()} so'm</p>
                      <span className={`inline-flex items-center gap-1.5 text-xs mt-1 px-2 py-0.5 rounded-full border ${
                        paymentStatusConfig[order.payment_status]?.bg || 'bg-white/5'
                      } ${paymentStatusConfig[order.payment_status]?.color || 'text-[#94A3B8]'}`}>
                        {paymentStatusConfig[order.payment_status]?.label || order.payment_status}
                      </span>
                    </div>

                    <div className="glass-deep rounded-2xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FiCalendar className="w-3.5 h-3.5 text-[#00F5FF]" />
                        <span className="text-xs text-[#64748B]">Sana</span>
                      </div>
                      <p className="text-sm text-white font-medium">
                        {new Date(order.created_at).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </p>
                      <p className="text-xs text-[#64748B] mt-0.5">
                        {new Date(order.created_at).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  {/* Field Values */}
                  {order.field_values && Object.keys(order.field_values).length > 0 && (
                    <div className="glass-deep rounded-2xl p-4">
                      <h3 className="text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-3">Ma'lumotlar</h3>
                      <div className="grid grid-cols-2 gap-3">
                        {Object.entries(order.field_values).map(([key, value]) => (
                          <div key={key} className="bg-white/[0.03] rounded-xl p-3">
                            <p className="text-[10px] uppercase tracking-wider text-[#64748B] mb-1">
                              {key.replace(/_/g, ' ')}
                            </p>
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-white font-mono">{String(value)}</p>
                              <button
                                onClick={() => copyToClipboard(String(value))}
                                className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                              >
                                <FiCopy className="w-3 h-3 text-[#64748B]" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Status Update */}
                  {order.status !== 'completed' && order.status !== 'cancelled' && (
                    <div className="flex gap-3">
                      {order.status === 'pending' && (
                        <button
                          onClick={async () => {
                            await orderAPI.updateStatus(order.id, 'processing');
                            const res = await orderAPI.adminDetail(order.id);
                            setOrder(res.data);
                          }}
                          className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-blue-500/20 to-indigo-500/20 border border-blue-500/30 text-blue-400 text-sm font-medium hover:from-blue-500/30 hover:to-indigo-500/30 transition-all"
                        >
                          Qabul qilish
                        </button>
                      )}
                      {order.status === 'processing' && (
                        <button
                          onClick={async () => {
                            await orderAPI.updateStatus(order.id, 'completed');
                            const res = await orderAPI.adminDetail(order.id);
                            setOrder(res.data);
                          }}
                          className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 text-green-400 text-sm font-medium hover:from-green-500/30 hover:to-emerald-500/30 transition-all"
                        >
                          Tugallash
                        </button>
                      )}
                      <button
                        onClick={async () => {
                          await orderAPI.updateStatus(order.id, 'cancelled');
                          const res = await orderAPI.adminDetail(order.id);
                          setOrder(res.data);
                        }}
                        className="py-2.5 px-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-medium hover:bg-red-500/20 transition-all"
                      >
                        Bekor qilish
                      </button>
                    </div>
                  )}

                  {/* Order Number Full */}
                  <div className="text-center">
                    <p className="text-[10px] text-[#64748B] uppercase tracking-wider mb-1">Buyurtma raqami</p>
                    <p className="text-[#00F5FF] font-mono text-sm">{order.order_number}</p>
                  </div>
                </div>
              ) : (
                <div className="p-12 text-center text-[#64748B]">
                  <FiAlertCircle className="w-10 h-10 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Buyurtma topilmadi</p>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
