'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FiArrowLeft, FiCopy, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import { orderAPI } from '@/lib/api';
import OrderStatus from '@/components/OrderStatus';
import { useStore } from '@/lib/store';
import toast from 'react-hot-toast';

// Order status → progress timeline steps (for the visual timeline)
const STATUS_STEPS = [
  { key: 'pending', label: 'Qabul qilindi', desc: 'Buyurtma yaratildi' },
  { key: 'processing', label: 'Bajarilmoqda', desc: 'Operator ishlayapti' },
  { key: 'completed', label: 'Tugallandi', desc: 'Xizmat yetkazildi' },
  { key: 'cancelled', label: 'Bekor qilindi', desc: 'Buyurtma bekor qilindi' },
];

function getStepIndex(status: string): number {
  if (status === 'completed') return 2;
  if (status === 'processing') return 1;
  if (status === 'pending') return 0;
  return 3; // cancelled
}

function OrderTimeline({ status, cancelReason }: { status: string; cancelReason?: string | null }) {
  const current = getStepIndex(status);
  const isCancelled = status === 'cancelled';

  return (
    <div className="glass-deep rounded-2xl p-5">
      <h3 className="text-sm font-medium text-[#94A3B8] mb-4">Buyurtma holati</h3>
      {isCancelled ? (
        <div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
              <FiAlertCircle className="w-4 h-4 text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-400">Bekor qilingan</p>
              <p className="text-xs text-[#64748B] mt-1">
                {cancelReason || 'Sabab ko\'rsatilmagan'}
              </p>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs text-[#64748B]">
            <span className="w-2 h-2 rounded-full bg-red-400" />
            <span>Buyurtma bekor qilindi va qayta ishlanmaydi</span>
          </div>
        </div>
      ) : (
        <div className="relative">
          {/* Progress line */}
          <div className="absolute left-[15px] top-2 bottom-2 w-[2px] bg-white/10" />
          <div
            className="absolute left-[15px] top-2 w-[2px] bg-gradient-to-b from-[#00E5FF] to-[#00E5FF]/40 transition-all duration-500"
            style={{ height: `${current * 50}%` }}
          />
          <div className="space-y-5">
            {STATUS_STEPS.filter((s) => s.key !== 'cancelled').map((step, i) => {
              const done = i <= current;
              const active = i === current;
              return (
                <div key={step.key} className="flex items-start gap-4">
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 flex-shrink-0 ${
                      done
                        ? 'bg-gradient-to-br from-[#00E5FF] to-[#A855F7] text-[#0B1220]'
                        : 'bg-white/10 text-[#64748B]'
                    } ${active ? 'ring-2 ring-[#00E5FF]/50 scale-110' : ''}`}
                  >
                    {done ? '✓' : i + 1}
                  </div>
                  <div className="pt-1">
                    <p className={`text-sm font-medium ${done ? 'text-white' : 'text-[#64748B]'}`}>
                      {step.label}
                    </p>
                    <p className="text-[11px] text-[#64748B]">{step.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const [order, setOrder] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    const fetchOrder = async () => {
      try {
        const res = await orderAPI.detail(Number(params.id));
        setOrder(res.data);
      } catch (e) {
        console.error('Error fetching order:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrder();
  }, [params.id, isAuthenticated]);

  const copyOrderNumber = () => {
    navigator.clipboard.writeText(order.order_number);
    toast.success('Buyurtma raqami nusxalandi');
  };

  const handleReorder = () => {
    // Open the same service page pre-filled with this order's package + data
    const params = new URLSearchParams();
    if (order.package_id || order.package) {
      params.set('package', String(order.package_id || order.package));
    }
    if (order.customer_name) params.set('name', order.customer_name);
    if (order.customer_telegram) params.set('tg', order.customer_telegram);
    if (order.field_values && typeof order.field_values === 'object') {
      Object.entries(order.field_values).forEach(([k, v]) => {
        params.set(`f_${k}`, String(v));
      });
    }
    router.push(`/services/${order.service_slug || ''}?${params.toString()}`);
  };

  // DEMO MODE: layout avtomatik demo-login qiladi — yuklanayotganda spinner.
  if (!isAuthenticated) {
    return <div className="px-4 pt-6 pb-6"><div className="max-w-md mx-auto glass-card p-8 text-center text-sm text-[#9CA3AF]">Yuklanmoqda...</div></div>;
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="flex items-center justify-center min-h-[70vh] px-4">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Buyurtma topilmadi</h2>
          <Link href="/orders" className="glow-btn-outline px-6 py-3">Buyurtmalarim</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-6">
      <div className="max-w-md mx-auto">
        <Link
          href="/orders"
          className="inline-flex items-center gap-2 text-sm text-[#64748B] hover:text-[#00F5FF] transition-colors duration-200 mb-4"
        >
          <FiArrowLeft className="w-4 h-4" />
          Buyurtmalarimga qaytish
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <h1 className="text-xl font-bold text-white truncate">
                  Buyurtma #{order.order_number}
                </h1>
                <button
                  onClick={copyOrderNumber}
                  className="p-1.5 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00F5FF] transition-all duration-200 flex-shrink-0"
                >
                  <FiCopy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-[#64748B]">
                {new Date(order.created_at).toLocaleDateString('uz-UZ', {
                  year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                })}
              </p>
            </div>
            <OrderStatus status={order.status} size="lg" />
          </div>            {/* ═══ Progress Timeline ═══ */}
            <OrderTimeline status={order.status} cancelReason={order.cancel_reason} />

            {/* ═══ Reorder Button ═══ */}
            {(order.status === 'completed' || order.status === 'cancelled') && order.service_slug && (
              <button
                onClick={handleReorder}
                className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-gradient-to-r from-[#00E5FF] to-[#A855F7] text-[#0B1220] font-semibold hover:opacity-90 hover:scale-[1.01] transition-all duration-200"
              >
                <FiRefreshCw className="w-4 h-4" />
                Qayta buyurtma berish
              </button>
            )}

            {/* Order Details */}
            <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="glass-deep rounded-2xl p-5">
                <p className="text-xs text-[#64748B] mb-1">Xizmat</p>
                <p className="text-sm font-medium text-white">{order.service_name || (order.service?.name)}</p>
              </div>
              <div className="glass-deep rounded-2xl p-5">
                <p className="text-xs text-[#64748B] mb-1">Paket</p>
                <p className="text-sm font-medium text-white">{order.package_name || (order.package?.name)}</p>
              </div>
              <div className="glass-deep rounded-2xl p-5">
                <p className="text-xs text-[#64748B] mb-1">Mijoz</p>
                <p className="text-sm font-medium text-white">{order.customer_name}</p>
              </div>
              <div className="glass-deep rounded-2xl p-5">
                <p className="text-xs text-[#64748B] mb-1">Telegram</p>
                <p className="text-sm font-medium text-[#00F5FF]">{order.customer_telegram}</p>
              </div>
            </div>

            {/* Field Values */}
            {order.field_values && Object.keys(order.field_values).length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-[#94A3B8] mb-3">Kiritilgan ma'lumotlar</h3>
                <div className="glass-deep rounded-2xl p-5 space-y-3">
                  {Object.entries(order.field_values).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center">
                      <span className="text-sm text-[#64748B]">{key}</span>
                      <span className="text-sm font-medium text-white">{String(value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Price & Payment */}
            <div className="neon-divider" />
            <div className="flex justify-between items-center">
              <span className="text-lg text-white font-semibold">Jami to'lov</span>
              <span className="text-2xl font-bold gradient-text">
                {Number(order.total_price).toLocaleString()} so'm
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[#64748B]">To'lov holati</span>
              <span className={`text-sm font-medium ${
                order.payment_status === 'paid' ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {order.payment_status === 'paid' ? "To'landi" : order.payment_status === 'refunded' ? 'Qaytarildi' : "To'lanmagan"}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
