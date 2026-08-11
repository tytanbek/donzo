'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiZap, FiClock, FiUser, FiDollarSign, FiShoppingBag,
  FiCheckCircle, FiSearch, FiRefreshCw, FiPackage,
  FiActivity, FiArrowRight,
} from 'react-icons/fi';
import { orderAPI } from '@/lib/api';
import { onWSEvent, useWebSocket } from '@/lib/websocket';
import OrderStatus from '@/components/OrderStatus';
import OrderDetailModal from '@/components/OrderDetailModal';
import RealTimeIndicator from '@/components/RealTimeIndicator';
import toast from 'react-hot-toast';

interface Order {
  id: number;
  order_number: string;
  customer_name: string;
  customer_telegram: string;
  service_name: string;
  package_name: string;
  total_price: number;
  status: string;
  payment_status: string;
  assigned_operator: number | null;
  assigned_operator_name: string;
  created_at: string;
  field_values: Record<string, string>;
}

export default function OperatorRealtimeOrdersPage() {
  const { connectionStatus } = useWebSocket();
  const [availableOrders, setAvailableOrders] = useState<Order[]>([]);
  const [acceptedOrders, setAcceptedOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [acceptedIds, setAcceptedIds] = useState<Set<number>>(new Set());
  const [acceptingId, setAcceptingId] = useState<number | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [newOrderFlash, setNewOrderFlash] = useState<number | null>(null);
  const [showAccepted, setShowAccepted] = useState(false);

  const playNotification = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch (e) {
      // Audio not available
    }
  }, []);

  const fetchAvailableOrders = useCallback(async () => {
    try {
      const res = await orderAPI.availableOrders();
      const data = res.data.results || [];
      setAvailableOrders(data);
    } catch (e) {
      // Silent fail - WebSocket will fill in
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAvailableOrders();
  }, [fetchAvailableOrders]);

  useEffect(() => {
    const unsub1 = onWSEvent('order_created', (data: any) => {
      if (data.order && data.order.status === 'pending' && !data.order.assigned_operator_id) {
        setAvailableOrders((prev) => {
          if (prev.some((o) => o.id === data.order.id)) return prev;
          playNotification();
          setNewOrderFlash(data.order.id);
          setTimeout(() => setNewOrderFlash(null), 2000);
          return [data.order, ...prev];
        });
      }
    });

    const unsub2 = onWSEvent('order_updated', (data: any) => {
      if (data.order) {
        setAvailableOrders((prev) =>
          prev.filter((o) => o.id !== data.order.id)
        );
        setAcceptedOrders((prev) =>
          prev.map((o) => (o.id === data.order.id ? { ...o, ...data.order } : o))
        );
      }
    });

    const unsub3 = onWSEvent('connection_established', () => {
      fetchAvailableOrders();
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [playNotification, fetchAvailableOrders]);

  const handleAccept = async (orderId: number) => {
    if (acceptedIds.has(orderId)) return;
    setAcceptingId(orderId);
    try {
      const res = await orderAPI.acceptOrder(orderId);
      const order = res.data;
      setAvailableOrders((prev) => prev.filter((o) => o.id !== orderId));
      setAcceptedOrders((prev) => [order, ...prev]);
      setAcceptedIds((prev) => new Set(prev).add(orderId));
      toast.success('Buyurtma qabul qilindi!');
    } catch (e: any) {
      const status = e.response?.status;
      if (status === 409) {
        setAvailableOrders((prev) => prev.filter((o) => o.id !== orderId));
        toast.error('Bu buyurtmani boshqa operator qabul qilib olgan');
      } else if (status === 400 || status === 403) {
        setAvailableOrders((prev) => prev.filter((o) => o.id !== orderId));
        toast.error(e.response?.data?.detail || 'Bu buyurtma endi mavjud emas');
      } else {
        toast.error('Xatolik yuz berdi');
      }
    } finally {
      setAcceptingId(null);
    }
  };

  const getWaitingMinutes = (createdAt: string) => {
    const diff = Date.now() - new Date(createdAt).getTime();
    return Math.floor(diff / 60000);
  };

  const filteredOrders = availableOrders.filter((o) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.order_number?.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.customer_telegram?.toLowerCase().includes(q) ||
      o.service_name?.toLowerCase().includes(q)
    );
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.04 },
    },
  };

  const orderCardVariants = {
    hidden: { opacity: 0, x: -20, scale: 0.95 },
    visible: { opacity: 1, x: 0, scale: 1 },
    exit: { opacity: 0, x: 20, scale: 0.95 },
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Real-time buyurtmalar</h1>
            <p className="text-sm text-[#64748B]">Yangi buyurtmalarni jonli efirda kuzating</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass-card p-5 animate-pulse">
              <div className="h-4 bg-white/10 rounded w-2/3 mb-4" />
              <div className="h-3 bg-white/5 rounded w-1/2 mb-3" />
              <div className="h-3 bg-white/5 rounded w-3/4 mb-2" />
              <div className="h-8 bg-white/5 rounded w-full mt-4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const renderEmptyState = () => {
    if (searchQuery) {
      return (
        <div className="col-span-full">
          <div className="glass-card p-12 text-center">
            <FiSearch className="w-12 h-12 mx-auto mb-4 text-[#64748B] opacity-50" />
            <p className="text-lg text-[#64748B] font-medium">Qidiruv boyicha hech narsa topilmadi</p>
            <p className="text-sm text-[#64748B] mt-1">Boshqa soz bilan urinib koring</p>
          </div>
        </div>
      );
    }
    return (
      <div className="col-span-full">
        <div className="glass-card p-12 text-center">
          <motion.div
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <FiCheckCircle className="w-16 h-16 mx-auto mb-4 text-green-400/50" />
          </motion.div>
          <p className="text-lg text-[#64748B] font-medium">Barcha buyurtmalar qabul qilingan</p>
          <p className="text-sm text-[#64748B] mt-1">
            Yangi buyurtma kelganda avtomatik ravishda bu yerda paydo boladi
          </p>
          {connectionStatus !== 'connected' && (
            <div className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/10 text-yellow-400 text-xs">
              <FiClock className="w-3 h-3" />
              WebSocket uzilgan
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderOrderCard = (order: Order, isAccepted: boolean) => {
    const waiting = getWaitingMinutes(order.created_at);
    const isFlashing = newOrderFlash === order.id && !isAccepted;

    return (
      <motion.div
        key={order.id}
        layout
        variants={orderCardVariants}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={`glass-card p-5 group cursor-pointer transition-all duration-300 ${
          isFlashing
            ? 'border-[#A855F7]/50 shadow-lg shadow-[#A855F7]/10'
            : isAccepted
              ? 'hover:border-green-500/30'
              : 'hover:border-[#A855F7]/30'
        }`}
        onClick={() => setSelectedOrderId(order.id)}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center ${
              isAccepted
                ? 'from-green-500/20 to-emerald-500/20'
                : 'from-[#A855F7]/20 to-[#00F5FF]/20'
            }`}>
              <FiShoppingBag className={`w-4.5 h-4.5 ${isAccepted ? 'text-green-400' : 'text-[#A855F7]'}`} />
            </div>
            <div>
              <p className="text-sm font-bold text-white font-mono">#{order.order_number?.slice(-8)}</p>
              <p className="text-xs text-[#64748B]">{order.service_name}</p>
            </div>
          </div>
          {isAccepted ? (
            <OrderStatus status={order.status} size="sm" />
          ) : (
            <span className={`px-2 py-1 rounded-lg text-[10px] font-medium flex items-center gap-1 ${
              waiting < 2
                ? 'bg-green-500/10 text-green-400'
                : waiting < 5
                  ? 'bg-yellow-500/10 text-yellow-400'
                  : 'bg-red-500/10 text-red-400'
            }`}>
              <FiClock className="w-3 h-3" />
              {waiting < 1 ? 'Hozir' : `${waiting} min`}
            </span>
          )}
        </div>

        <div className="space-y-1.5 mb-4">
          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
            <FiUser className="w-3 h-3 shrink-0" />
            <span className="truncate">{order.customer_name}</span>
            {order.customer_telegram && (
              <>
                <span className="text-[#64748B]">·</span>
                <span className="text-[#00F5FF]">
                  @{order.customer_telegram.replace('https://t.me/', '')}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-[#94A3B8]">
            <FiDollarSign className="w-3 h-3 shrink-0" />
            <span className="text-white font-medium">
              {Number(order.total_price).toLocaleString()} som
            </span>
            <span className="text-[#64748B]">·</span>
            <span>{order.package_name}</span>
          </div>
        </div>

        {!isAccepted && order.field_values && Object.keys(order.field_values).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {Object.entries(order.field_values).slice(0, 2).map(([key, value]) => (
              <span key={key} className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-[#64748B]">
                {key}: {String(value)}
              </span>
            ))}
            {Object.keys(order.field_values).length > 2 && (
              <span className="px-2 py-0.5 rounded-md bg-white/5 text-[10px] text-[#64748B]">
                +{Object.keys(order.field_values).length - 2} more
              </span>
            )}
          </div>
        )}

        {isAccepted ? (
          <div className="flex items-center justify-between text-xs text-[#64748B]">
            <span>
              Qabul qilingan:{' '}
              {new Date(order.created_at).toLocaleTimeString('uz-UZ', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedOrderId(order.id); }}
              className="text-[#00F5FF] hover:underline"
            >
              Batafsil
            </button>
          </div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={(e) => { e.stopPropagation(); handleAccept(order.id); }}
            disabled={acceptingId === order.id}
            className="w-full py-2.5 rounded-xl bg-gradient-to-r from-[#A855F7] to-[#00F5FF] text-[#0F172A] text-sm font-bold transition-all duration-200 hover:shadow-lg hover:shadow-[#A855F7]/20 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {acceptingId === order.id ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-4 h-4 border-2 border-[#0F172A] border-t-transparent rounded-full"
                />
                Qabul qilinmoqda...
              </>
            ) : (
              <>
                <FiZap className="w-4 h-4" />
                Qabul qilish
                <FiArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        )}
      </motion.div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <FiZap className="w-6 h-6 text-[#A855F7]" />
              <motion.span
                className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-400"
                animate={{
                  scale: connectionStatus === 'connected' ? [1, 1.3, 1] : 0.5,
                  opacity: connectionStatus === 'connected' ? [0.7, 1, 0.7] : 0.3,
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Real-time buyurtmalar</h1>
              <p className="text-sm text-[#64748B]">
                Yangi buyurtmalarni sahifani yangilamasdan kuzating
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <RealTimeIndicator isConnected={connectionStatus === 'connected'} showLabel />
          <button
            onClick={fetchAvailableOrders}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[#64748B] hover:text-white transition-all"
            title="Yangilash"
          >
            <FiRefreshCw className="w-4 h-4" />
          </button>
          <div className="text-right">
            <p className="text-2xl font-bold gradient-text">{availableOrders.length}</p>
            <p className="text-xs text-[#64748B]">kutayotgan</p>
          </div>
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="relative flex-1 w-full">
            <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buyurtma raqami, mijoz yoki xizmat boyicha qidirish..."
              className="glass-input pl-10 w-full text-sm"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAccepted(false)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                !showAccepted
                  ? 'bg-[#A855F7]/20 text-[#A855F7] border border-[#A855F7]/30'
                  : 'bg-white/5 text-[#64748B] border border-transparent hover:text-white'
              }`}
            >
              <FiActivity className="w-3.5 h-3.5 inline mr-1.5" />
              Mavjud ({availableOrders.length})
            </button>
            <button
              onClick={() => setShowAccepted(true)}
              className={`px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                showAccepted
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-white/5 text-[#64748B] border border-transparent hover:text-white'
              }`}
            >
              <FiCheckCircle className="w-3.5 h-3.5 inline mr-1.5" />
              Qabul qilingan ({acceptedOrders.length})
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {!showAccepted ? (
          <motion.div
            key="available"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            {filteredOrders.length === 0
              ? renderEmptyState()
              : filteredOrders.map((order) => renderOrderCard(order, false))
            }
          </motion.div>
        ) : (
          <motion.div
            key="accepted"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
          >
            {acceptedOrders.length === 0 ? (
              <div className="col-span-full">
                <div className="glass-card p-12 text-center">
                  <FiPackage className="w-12 h-12 mx-auto mb-4 text-[#64748B] opacity-50" />
                  <p className="text-lg text-[#64748B] font-medium">Hali hech qanday buyurtma qabul qilinmadi</p>
                  <p className="text-sm text-[#64748B] mt-1">
                    Mavjud bolimdan buyurtmalarni qabul qiling
                  </p>
                </div>
              </div>
            ) : (
              acceptedOrders.map((order) => renderOrderCard(order, true))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40"
      >
        <div className="glass-card px-5 py-3 rounded-full shadow-lg shadow-black/20 border-[#00F5FF]/10">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-yellow-400'
              }`} />
              <span className="text-[#94A3B8]">
                {connectionStatus === 'connected' ? 'Ulangan' : 'Uzilgan'}
              </span>
            </div>
            <span className="text-[#64748B]">·</span>
            <span className="text-[#94A3B8]">
              <span className="text-white font-bold">{availableOrders.length}</span> ta kutayotgan
            </span>
            <span className="text-[#64748B]">·</span>
            <span className="text-[#94A3B8]">
              <span className="text-green-400 font-bold">{acceptedOrders.length}</span> ta qabul qilingan
            </span>
            <span className="text-[#64748B]">·</span>
            <button
              onClick={fetchAvailableOrders}
              className="text-[#00F5FF] hover:underline flex items-center gap-1"
            >
              <FiRefreshCw className="w-3 h-3" />
              Yangilash
            </button>
          </div>
        </div>
      </motion.div>

      <OrderDetailModal
        orderId={selectedOrderId}
        onClose={() => setSelectedOrderId(null)}
      />
    </div>
  );
}
