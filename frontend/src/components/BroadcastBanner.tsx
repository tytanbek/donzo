'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiBell, FiX, FiCheckCircle, FiAlertTriangle, FiInfo } from 'react-icons/fi';
import { useStore } from '@/lib/store';
import api from '@/lib/api';

/**
 * Shows recent global broadcasts (admin announcements) as a dismissible
 * banner on the customer mini-app. Fetches the last 5 broadcasts so users
 * who were OFFLINE when the WebSocket push was sent still see them.
 * Dismissed broadcasts are remembered in localStorage (per id).
 *
 * PERFORMANCE: MiniAppShell stays mounted across tab switches, and this
 * component lives inside it — a module-level TTL cache stops a redundant
 * tunnel round-trip on every navigation. Broadcasts rarely change.
 */
let broadcastCache: { ts: number; data: any[] } | null = null;
const BROADCAST_CACHE_TTL_MS = 60_000; // 60s

export default function BroadcastBanner() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const [broadcasts, setBroadcasts] = useState<any[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [current, setCurrent] = useState<any>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dismissed_broadcasts') || '[]');
      setDismissed(saved);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (broadcastCache && Date.now() - broadcastCache.ts < BROADCAST_CACHE_TTL_MS) {
      setBroadcasts(broadcastCache.data);
      return;
    }
    api
      .get('/admin/notifications/recent/')
      .then((res) => {
        const items = res.data.results || res.data || [];
        broadcastCache = { ts: Date.now(), data: items };
        setBroadcasts(items);
      })
      .catch(() => {
        /* ignore — banner is progressive enhancement */
      });
  }, [isAuthenticated]);

  // Show the first undismissed broadcast
  useEffect(() => {
    const next = broadcasts.find((b) => !dismissed.includes(String(b.id)));
    setCurrent(next || null);
  }, [broadcasts, dismissed]);

  if (!current) return null;

  const styles: Record<string, { border: string; icon: any; color: string }> = {
    success: { border: 'border-emerald-500/30', icon: FiCheckCircle, color: 'text-emerald-400' },
    warning: { border: 'border-yellow-500/30', icon: FiAlertTriangle, color: 'text-yellow-400' },
    error: { border: 'border-red-500/30', icon: FiAlertTriangle, color: 'text-red-400' },
    info: { border: 'border-[#00F5FF]/30', icon: FiInfo, color: 'text-[#00F5FF]' },
  };
  const s = styles[current.level] || styles.info;
  const Icon = s.icon;

  const dismiss = () => {
    const next = [...dismissed, String(current.id)];
    setDismissed(next);
    try {
      localStorage.setItem('dismissed_broadcasts', JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          initial={{ opacity: 0, y: -16, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -16, height: 0 }}
          className="mx-auto mt-3 max-w-md"
        >
          <div className={`rounded-2xl border ${s.border} bg-slate-900/80 backdrop-blur-xl p-4 flex items-start gap-3`}>
            <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
              <Icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{current.title}</p>
              <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{current.message}</p>
            </div>
            <button
              onClick={dismiss}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
              aria-label="Yopish"
            >
              <FiX className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
