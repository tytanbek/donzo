'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { FiPackage, FiGift, FiAward } from 'react-icons/fi';
import { orderAPI } from '@/lib/api';
import RealTimeIndicator from '@/components/RealTimeIndicator';
import { useWebSocket, useWSEvent } from '@/lib/websocket';
import OrderStatus from '@/components/OrderStatus';
import { useStore } from '@/lib/store';

// 3 main tabs per spec: Orders / Gifts / NFT
const TYPE_TABS = [
  { key: 'orders', label: 'Buyurtmalar', icon: FiPackage },
  { key: 'gifts', label: 'Giftlar', icon: FiGift },
  { key: 'nft', label: 'NFT', icon: FiAward },
];

// Secondary status filter (preserved functionality)
const STATUS_TABS = [
  { key: 'all', label: 'Barchasi' },
  { key: 'pending', label: 'Kutilmoqda' },
  { key: 'processing', label: 'Bajarilmoqda' },
  { key: 'completed', label: 'Tugallangan' },
  { key: 'cancelled', label: 'Bekor qilingan' },
];

const statusEmoji: Record<string, string> = {
  pending: '🟡',
  processing: '🔵',
  completed: '🟢',
  cancelled: '🔴',
};

export default function OrdersPage() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const [orders, setOrders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeType, setActiveType] = useState('orders');
  const [activeStatus, setActiveStatus] = useState('all');
  const { connectionStatus } = useWebSocket();

  // Listen for real-time order updates
  const realtimeUpdate = useWSEvent('order_updated');

  useEffect(() => {
    if (!isAuthenticated) {
      setIsLoading(false);
      return;
    }
    const fetchOrders = async () => {
      try {
        const res = await orderAPI.list();
        setOrders(res.data.results || res.data);
      } catch (e) {
        console.error('Error fetching orders:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchOrders();
  }, [isAuthenticated]);

  // Update order in local state when WebSocket sends an update
  useEffect(() => {
    if (realtimeUpdate?.order) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === realtimeUpdate.order.id
            ? { ...o, ...realtimeUpdate.order, status: realtimeUpdate.order.status, payment_status: realtimeUpdate.order.payment_status }
            : o
        )
      );
    }
  }, [realtimeUpdate]);

  const filteredOrders = activeStatus === 'all'
    ? orders
    : orders.filter((o) => o.status === activeStatus);

  // DEMO MODE: layout avtomatik demo-login qiladi — yuklanayotganda spinner.
  if (!isAuthenticated) {
    return <div className="px-4 pt-6 pb-6"><div className="max-w-md mx-auto glass-card p-8 text-center text-sm text-[#9CA3AF]">Yuklanmoqda...</div></div>;
  }

  return (
    <div>
      {/* ═══ Title ═══ */}
      <div className="mini-section-head !pt-4">
        <div className="mini-section-title flex items-center gap-2">
          <FiPackage className="w-5 h-5 text-[#2DD4BF]" />
          Buyurtmalarim
        </div>
        <RealTimeIndicator isConnected={connectionStatus === 'connected'} showLabel={false} />
      </div>

      {/* ═══ 3 Main Tabs: Orders / Gifts / NFT ═══ */}
      <div className="tab-row">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveType(tab.key)}
            className={`order-tab flex items-center gap-1.5 ${activeType === tab.key ? 'active' : ''}`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ Content by type ═══ */}
      {activeType === 'orders' ? (
        <>
          {/* ═══ Status filter pills ═══ */}
          <div className="tab-row !gap-1.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveStatus(tab.key)}
                className={`order-tab !px-3 !py-1.5 !text-[11px] ${activeStatus === tab.key ? 'active' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ═══ Order List ═══ */}
          <div className="pt-4">
            {isLoading ? (
              <div className="px-4 pt-6 space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="mini-order-card shimmer !border-0" style={{ height: 84 }} />
                ))}
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="premium-empty">
                <div className="premium-empty-icon">📦</div>
                <div className="premium-empty-title">Buyurtmalar mavjud emas</div>
                <div className="premium-empty-sub mb-5">Hali hech qanday buyurtma bermagansiz</div>
                <Link href="/" className="pill-btn !w-auto !px-8 !py-3 !text-sm inline-flex">
                  Xizmatlarni ko'rish
                </Link>
              </div>
            ) : (
              <div>
                {filteredOrders.map((order, i) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  >
                    <Link href={`/orders/${order.id}`} className="mini-order-card block">
                      <div className="mini-order-top">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-lg flex-shrink-0">{statusEmoji[order.status] || '🟡'}</span>
                          <span className="mini-order-title">
                            {order.service_name || (order.service?.name) || 'Xizmat'}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#9CA3AF] font-mono flex-shrink-0">
                          #{order.order_number?.slice(-6)}
                        </span>
                      </div>
                      <div className="mini-order-meta mb-2.5">
                        <span>{order.package_name || (order.package?.name)}</span>
                        <span>{new Date(order.created_at).toLocaleDateString('uz-UZ')}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <OrderStatus status={order.status} size="sm" />
                        <span className="mini-order-price">
                          {Number(order.total_price).toLocaleString()} so'm
                        </span>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : activeType === 'gifts' ? (
        /* ═══ Gifts tab — premium empty state ═══ */
        <div className="pt-6">
          <div className="premium-empty">
            <div className="premium-empty-icon">🎁</div>
            <div className="premium-empty-title">Giftlar bo'limi</div>
            <div className="premium-empty-sub">
              Bu bo'limda giftlar tez orada paydo bo'ladi. Balans orqali xarid qilishingiz mumkin.
            </div>
          </div>
        </div>
      ) : (
        /* ═══ NFT tab — premium empty state ═══ */
        <div className="pt-6">
          <div className="premium-empty">
            <div className="premium-empty-icon">🖼️</div>
            <div className="premium-empty-title">NFT bo'limi</div>
            <div className="premium-empty-sub">
              NFT kolleksiyalari hozircha mavjud emas. Tez orada!
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
