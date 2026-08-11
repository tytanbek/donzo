'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiActivity, FiUsers, FiZap, FiClock, FiRefreshCw, FiWifi, FiBarChart2 } from 'react-icons/fi';
import { useWebSocket, onWSEvent } from '@/lib/websocket';
import api from '@/lib/api';

interface WsMetrics {
  active_connections: number;
  events_per_minute: number;
  total_events: number;
  latest_event_type: string;
  latest_event_time: string;
}

const eventLabels: Record<string, string> = {
  order_created: 'Yangi buyurtma',
  order_updated: 'Buyurtma yangilandi',
  payment_received: "To'lov qabul qilindi",
  operator_assigned: 'Operator biriktirildi',
  notification: 'Bildirishnoma',
};

const eventColors: Record<string, string> = {
  order_created: 'text-[#00F5FF]',
  order_updated: 'text-[#A855F7]',
  payment_received: 'text-emerald-400',
  operator_assigned: 'text-amber-400',
  notification: 'text-blue-400',
};

export default function RealtimeMetricsBar() {
  const { connectionStatus } = useWebSocket();
  const [metrics, setMetrics] = useState<WsMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isPulsing, setIsPulsing] = useState(false);
  const prevEpmRef = useRef(0);

  const fetchMetrics = async () => {
    try {
      const res = await api.get('/admin/ws/metrics/');
      const data = res.data;
      setMetrics(data);
      // Pulse animation when EPM changes
      if (prevEpmRef.current !== data.events_per_minute && prevEpmRef.current > 0) {
        setIsPulsing(true);
        setTimeout(() => setIsPulsing(false), 600);
      }
      prevEpmRef.current = data.events_per_minute;
    } catch (e) {
      // Silent fail
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  // Refresh on any WebSocket event
  useEffect(() => {
    const handler = () => {
      fetchMetrics();
    };
    const unsubs = [
      onWSEvent('order_created', handler),
      onWSEvent('order_updated', handler),
      onWSEvent('payment_received', handler),
      onWSEvent('operator_assigned', handler),
    ];
    return () => unsubs.forEach((fn: () => void) => fn());
  }, []);

  if (isLoading) {
    return (
      <div className="glass-card p-3">
        <div className="flex items-center gap-4 animate-pulse">
          <div className="h-4 bg-white/10 rounded w-24" />
          <div className="h-4 bg-white/10 rounded w-20" />
          <div className="h-4 bg-white/10 rounded w-32" />
        </div>
      </div>
    );
  }

  const latestEventLabel = metrics?.latest_event_type
    ? eventLabels[metrics.latest_event_type] || metrics.latest_event_type.replace(/_/g, ' ')
    : '—';

  const latestEventColor = metrics?.latest_event_type
    ? eventColors[metrics.latest_event_type] || 'text-[#94A3B8]'
    : 'text-[#64748B]';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card overflow-hidden"
    >
      {/* Gradient top accent */}
      <div className="h-0.5 bg-gradient-to-r from-[#00F5FF] via-[#A855F7] to-[#00F5FF]" />

      <div className="px-5 py-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {/* Connection status */}
          <div className="flex items-center gap-2 text-xs">
            <FiWifi className={`w-3.5 h-3.5 ${connectionStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'}`} />
            <span className={connectionStatus === 'connected' ? 'text-emerald-400' : 'text-amber-400'}>
              {connectionStatus === 'connected' ? 'Ulangan' : 'Uzilgan'}
            </span>
          </div>

          <span className="text-[#64748B]/50 text-xs">|</span>

          {/* Active connections */}
          <div className="flex items-center gap-2 text-xs">
            <FiUsers className="w-3.5 h-3.5 text-[#00F5FF]" />
            <span className="text-[#94A3B8]">Ulanishlar:</span>
            <motion.span
              key={metrics?.active_connections ?? 0}
              initial={{ scale: 1.3, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-white font-bold tabular-nums"
            >
              {metrics?.active_connections ?? 0}
            </motion.span>
          </div>

          <span className="text-[#64748B]/50 text-xs">|</span>

          {/* Events per minute */}
          <div className="flex items-center gap-2 text-xs">
            <div className="relative">
              <FiZap className="w-3.5 h-3.5 text-[#A855F7]" />
              <AnimatePresence>
                {isPulsing && (
                  <motion.div
                    initial={{ scale: 1, opacity: 0.6 }}
                    animate={{ scale: 2, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6 }}
                    className="absolute inset-0 w-3.5 h-3.5 rounded-full bg-[#A855F7]"
                  />
                )}
              </AnimatePresence>
            </div>
            <span className="text-[#94A3B8]">EPM:</span>
            <motion.span
              key={metrics?.events_per_minute ?? 0}
              initial={{ scale: 1.3, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-white font-bold tabular-nums"
            >
              {metrics?.events_per_minute ?? 0}
            </motion.span>
          </div>

          <span className="text-[#64748B]/50 text-xs">|</span>

          {/* Total events */}
          <div className="flex items-center gap-2 text-xs">
            <FiBarChart2 className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[#94A3B8]">{metrics?.total_events ?? 0} ta voqea</span>
          </div>

          <span className="text-[#64748B]/50 text-xs">|</span>

          {/* Latest event */}
          <div className="flex items-center gap-2 text-xs min-w-0">
            <FiActivity className="w-3.5 h-3.5 shrink-0 text-[#00F5FF]" />
            <span className="text-[#94A3B8] shrink-0">So'nggi:</span>
            <span className={`font-medium truncate max-w-[140px] ${latestEventColor}`}>
              {latestEventLabel}
            </span>
            {metrics?.latest_event_time && metrics.latest_event_time !== '—' && (
              <span className="text-[#64748B] shrink-0">
                <FiClock className="w-3 h-3 inline mr-0.5" />
                {metrics.latest_event_time}
              </span>
            )}
          </div>

          {/* Spacer + refresh */}
          <div className="flex-1" />
          <button
            onClick={fetchMetrics}
            className="p-1.5 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00F5FF] transition-all"
            title="Yangilash"
          >
            <FiRefreshCw className="w-3 h-3" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}
