'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiBell, FiShoppingBag, FiX, FiClock, FiUser, FiZap } from 'react-icons/fi';
import { onWSEvent } from '@/lib/websocket';
import OrderStatus from './OrderStatus';

interface OrderEvent {
  type: string;
  order: {
    id: number;
    order_number: string;
    status: string;
    total_price: number;
    customer_name: string;
    service_name: string;
    package_name: string;
    created_at: string;
  };
  timestamp: string;
}

interface OrderRealtimeListProps {
  onNewOrder?: (order: any) => void;
  onOrderUpdate?: (order: any) => void;
}

export default function OrderRealtimeList({ onNewOrder, onOrderUpdate }: OrderRealtimeListProps) {
  const [recentEvents, setRecentEvents] = useState<OrderEvent[]>([]);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const unsub1 = onWSEvent('order_created', (data) => {
      setRecentEvents((prev) => [data, ...prev].slice(0, 20));
      setUnreadCount((c) => c + 1);
      onNewOrder?.(data.order);
    });

    const unsub2 = onWSEvent('order_updated', (data) => {
      setRecentEvents((prev) => [data, ...prev].slice(0, 20));
      onOrderUpdate?.(data.order);
    });

    const unsub3 = onWSEvent('payment_received', (data) => {
      if (data.payment) {
        setRecentEvents((prev) => [{
          type: 'payment_received',
          order: data.order,
          timestamp: data.timestamp,
        } as OrderEvent, ...prev].slice(0, 20));
        setUnreadCount((c) => c + 1);
      }
    });

    return () => {
      unsub1();
      unsub2();
      unsub3();
    };
  }, [onNewOrder, onOrderUpdate]);

  const eventIcon = (event: OrderEvent) => {
    switch (event.type) {
      case 'order_created':
        return <FiShoppingBag className="w-4 h-4 text-[#00F5FF]" />;
      case 'order_updated':
        return <FiZap className="w-4 h-4 text-[#A855F7]" />;
      case 'payment_received':
        return <div className="w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center text-[8px] text-[#0F172A] font-bold">$</div>;
      default:
        return <FiBell className="w-4 h-4 text-[#64748B]" />;
    }
  };

  return (
    <>
      {/* Bell Button */}
      <button
        onClick={() => { setIsPanelOpen(!isPanelOpen); setUnreadCount(0); }}
        className="relative p-2.5 rounded-xl hover:bg-white/5 text-[#94A3B8] hover:text-[#00F5FF] transition-all duration-200"
      >
        <FiBell className="w-5 h-5" />
        <AnimatePresence>
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 w-5 h-5 bg-[#00F5FF] rounded-full text-[10px] font-bold text-[#0F172A] flex items-center justify-center"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}
        </AnimatePresence>
      </button>

      {/* Slide-in Panel */}
      <AnimatePresence>
        {isPanelOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsPanelOpen(false)}
            />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed right-0 top-0 bottom-0 w-96 max-w-full z-50 glass-card rounded-l-2xl border-l border-[#00F5FF]/10 overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-[#00F5FF]/10">
                <div className="flex items-center gap-3">
                  <FiBell className="w-5 h-5 text-[#00F5FF]" />
                  <h3 className="font-semibold text-white">Real-time hodisalar</h3>
                </div>
                <button
                  onClick={() => setIsPanelOpen(false)}
                  className="p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-white transition-all"
                >
                  <FiX className="w-4 h-4" />
                </button>
              </div>

              <div className="overflow-y-auto h-[calc(100vh-70px)] p-4 space-y-2">
                {recentEvents.length === 0 ? (
                  <div className="text-center py-12">
                    <FiBell className="w-10 h-10 text-[#64748B] mx-auto mb-3" />
                    <p className="text-sm text-[#64748B]">Hozircha hodisa yo'q</p>
                    <p className="text-xs text-[#64748B] mt-1">Yangi buyurtma kelganda bu yerda ko'rinadi</p>
                  </div>
                ) : (
                  <AnimatePresence>
                    {recentEvents.map((event, i) => (
                      <motion.div
                        key={`${event.type}-${event.order?.id}-${i}`}
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ delay: i * 0.02 }}
                        className="p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all cursor-pointer"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                            {eventIcon(event)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white">
                              {event.type === 'order_created' && `#${event.order?.order_number} - ${event.order?.service_name}`}
                              {event.type === 'order_updated' && `Buyurtma #${event.order?.order_number} yangilandi`}
                              {event.type === 'payment_received' && `To'lov qabul qilindi`}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              {event.order?.status && <OrderStatus status={event.order.status} size="sm" />}
                              <span className="text-xs text-[#64748B]">
                                {event.order?.total_price ? `${Number(event.order.total_price).toLocaleString()} so'm` : ''}
                              </span>
                            </div>
                            <p className="text-xs text-[#64748B] mt-1">
                              {new Date(event.timestamp).toLocaleTimeString('uz-UZ')}
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
