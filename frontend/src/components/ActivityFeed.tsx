'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiShoppingBag, FiCheckCircle,
  FiDollarSign, FiEdit2, FiRefreshCw, FiActivity, FiArrowRight,
  FiX, FiFilter, FiCalendar
} from 'react-icons/fi';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';

// ─── Action type configuration ──────────────────────────────────────────────
interface ActionConfig {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  border: string;
  label: string;
}

const actionConfigs: Record<string, ActionConfig> = {
  order_created: {
    icon: FiShoppingBag,
    color: 'text-[#00F5FF]',
    bg: 'bg-[#00F5FF]/10',
    border: 'border-[#00F5FF]/20',
    label: "Buyurtma",
  },
  order_status_changed: {
    icon: FiRefreshCw,
    color: 'text-purple-400',
    bg: 'bg-purple-500/10',
    border: 'border-purple-500/20',
    label: "Status",
  },
  payment_received: {
    icon: FiDollarSign,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/20',
    label: "To'lov",
  },
  balance_topup: {
    icon: FiArrowRight,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    label: "Balans",
  },
  user_updated: {
    icon: FiEdit2,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/20',
    label: "Foydalanuvchi",
  },
  settings_updated: {
    icon: FiEdit2,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/20',
    label: "Sozlamalar",
  },
};

const defaultAction: ActionConfig = {
  icon: FiActivity,
  color: 'text-[#64748B]',
  bg: 'bg-white/5',
  border: 'border-white/10',
  label: "Harakat",
};

function getActionConfig(action: string): ActionConfig {
  return actionConfigs[action] || {
    ...defaultAction,
    icon: action.includes('order') ? FiShoppingBag
      : action.includes('payment') || action.includes('topup') ? FiDollarSign
      : action.includes('user') ? FiEdit2
      : action.includes('settings') ? FiEdit2
      : FiActivity,
    label: action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
  };
}

// ─── Time formatting ────────────────────────────────────────────────────────
function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return 'Hozir';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min oldin`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} soat oldin`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} kun oldin`;
  return new Date(dateStr).toLocaleDateString('uz-UZ', { day: 'numeric', month: 'short' });
}

function formatFullDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('uz-UZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── User avatar with initials ──────────────────────────────────────────────
const avatarGradients = [
  'from-[#00F5FF] to-[#A855F7]',
  'from-green-400 to-emerald-500',
  'from-yellow-400 to-orange-500',
  'from-blue-400 to-indigo-500',
  'from-pink-400 to-rose-500',
  'from-cyan-400 to-teal-500',
];

function UserAvatar({ username, className = '' }: { username?: string; className?: string }) {
  const initial = (username || 'S')[0].toUpperCase();
  const gradientIdx = (username?.length || 0) % avatarGradients.length;
  return (
    <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${avatarGradients[gradientIdx]} flex items-center justify-center flex-shrink-0 ${className}`}>
      <span className="text-white text-xs font-bold">{initial}</span>
    </div>
  );
}

// ─── Action badge ──────────────────────────────────────────────────────────
function ActionBadge({ action, description }: { action: string; description?: string }) {
  const config = getActionConfig(action);
  const Icon = config.icon;
  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border ${config.bg} ${config.border} ${config.color}`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </div>
  );
}

// ─── Individual log entry ──────────────────────────────────────────────────
function LogEntry({ log, index }: { log: any; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const config = getActionConfig(log.action);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20, height: 0, marginBottom: 0 }}
      transition={{ delay: index * 0.03, duration: 0.3, layout: { duration: 0.3 } }}
      className={`group relative p-3.5 rounded-xl cursor-pointer transition-all duration-200
        ${expanded
          ? 'bg-gradient-to-r from-white/[0.06] to-white/[0.03] border border-white/[0.08] shadow-lg'
          : 'hover:bg-white/[0.03] border border-transparent'
        }`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Timeline dot */}
      <div className="absolute left-[17px] top-[52px] w-px h-[calc(100%-36px)] bg-gradient-to-b from-white/10 to-transparent" />

      <div className="flex items-start gap-3">
        {/* Avatar / Icon */}
        {log.username ? (
          <UserAvatar username={log.username} />
        ) : (
          <div className={`relative z-10 w-9 h-9 rounded-xl ${config.bg} border ${config.border} flex items-center justify-center flex-shrink-0`}>
            <FiActivity className={`w-4 h-4 ${config.color}`} />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {log.username && (
              <span className="text-sm font-medium text-white">
                {log.username}
              </span>
            )}
            {!log.username && (
              <span className="text-sm font-medium text-[#94A3B8] italic">Tizim</span>
            )}
            <span className="text-[10px] text-[#64748B] whitespace-nowrap">
              {formatTimeAgo(log.created_at)}
            </span>
          </div>

          <p className="text-sm text-[#94A3B8] mt-0.5 leading-relaxed">
            {log.description || `${log.action} — ${log.target_type || ''}#${log.target_id || ''}`}
          </p>

          {/* Expanded details */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-2.5 pt-2.5 border-t border-white/5">
                  <div className="flex items-center gap-4 text-[11px] text-[#64748B]">
                    <div className="flex items-center gap-1.5">
                      <FiCalendar className="w-3 h-3" />
                      {formatFullDate(log.created_at)}
                    </div>
                    {log.target_type && (
                      <div className="flex items-center gap-1.5">
                        <FiActivity className="w-3 h-3" />
                        <span className="font-mono">{log.target_type}#{log.target_id}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-1.5">
                    <ActionBadge action={log.action} description={log.description} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Filter dropdown ───────────────────────────────────────────────────────
const actionFilters = [
  { value: '', label: 'Barcha harakatlar', icon: FiActivity },
  { value: 'order_created', label: 'Buyurtmalar', icon: FiShoppingBag },
  { value: 'order_status_changed', label: 'Status o\'zgarishlari', icon: FiRefreshCw },
  { value: 'payment_received', label: "To'lovlar", icon: FiDollarSign },
  { value: 'balance_topup', label: 'Balans to\'ldirish', icon: FiArrowRight },
  { value: 'user_updated', label: 'Foydalanuvchi o\'zgarishlari', icon: FiEdit2 },
];

// ─── Main ActivityFeed component ──────────────────────────────────────────
interface ActivityFeedProps {
  limit?: number;
  refreshInterval?: number; // ms, 0 = no auto-refresh
  showTitle?: boolean;
  className?: string;
}

export default function ActivityFeed({
  limit = 30,
  refreshInterval = 15000,
  showTitle = true,
  className = '',
}: ActivityFeedProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const prevLogsRef = useRef<any[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchLogs = async () => {
    try {
      const params: any = { limit: limit * 2 };
      if (filter) params.action = filter;
      const res = await adminAPI.logs(params);
      const data = Array.isArray(res.data) ? res.data : res.data?.results || [];

      // Track new items for the pulse effect
      if (prevLogsRef.current.length > 0 && data.length > 0) {
        const prevIds = new Set(prevLogsRef.current.map((l: any) => l.id));
        const newItems = data.filter((l: any) => !prevIds.has(l.id));
        if (newItems.length > 0) {
          setNewCount(prev => prev + newItems.length);
          setTimeout(() => setNewCount(0), 3000);
        }
      }
      prevLogsRef.current = data;

      setLogs(data);
    } catch (e) {
      // Silent fail — the dashboard will still render
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  // Auto-refresh
  useEffect(() => {
    if (!refreshInterval) return;
    const interval = setInterval(fetchLogs, refreshInterval);
    return () => clearInterval(interval);
  }, [refreshInterval, filter]);

  // Scroll to top on new items
  useEffect(() => {
    if (newCount > 0 && containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [newCount]);

  // Filter applied logs
  const displayedLogs = logs.slice(0, limit);

  return (
    <div className={`glass-card p-5 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        {showTitle && (
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center">
              <FiActivity className="w-4.5 h-4.5 text-[#00F5FF]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Faoliyat tasmasi
                {newCount > 0 && (
                  <motion.span
                    key={newCount}
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="px-1.5 py-0.5 rounded-full bg-[#00F5FF]/20 text-[10px] text-[#00F5FF] font-medium"
                  >
                    +{newCount}
                  </motion.span>
                )}
              </h2>
              {!isLoading && (
                <p className="text-[10px] text-[#64748B]">
                  {displayedLogs.length} ta hodisa
                </p>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          {/* Refresh button */}
          <button
            onClick={fetchLogs}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition-all border border-white/10 hover:border-white/20 group"
            title="Yangilash"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 text-[#64748B] group-hover:text-white transition-colors ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Filter button */}
          <div className="relative">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-2 rounded-xl transition-all border group ${
                filter
                  ? 'bg-[#00F5FF]/10 border-[#00F5FF]/30 text-[#00F5FF]'
                  : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
              }`}
              title="Filter"
            >
              <FiFilter className="w-3.5 h-3.5 group-hover:text-white transition-colors" />
            </button>

            <AnimatePresence>
              {showFilters && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-[#0F1320] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden z-20"
                >
                  <div className="p-2 space-y-0.5">
                    {actionFilters.map((f) => {
                      const Icon = f.icon;
                      const isActive = filter === f.value;
                      return (
                        <button
                          key={f.value}
                          onClick={() => {
                            setFilter(f.value);
                            setShowFilters(false);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                            isActive
                              ? 'bg-[#00F5FF]/10 text-[#00F5FF] border border-[#00F5FF]/20'
                              : 'text-[#94A3B8] hover:bg-white/5 hover:text-white border border-transparent'
                          }`}
                        >
                          <Icon className="w-4 h-4 flex-shrink-0" />
                          <span>{f.label}</span>
                          {isActive && (
                            <FiCheckCircle className="w-3.5 h-3.5 ml-auto text-[#00F5FF]" />
                          )}
                        </button>
                      );
                    })}
                    {filter && (
                      <>
                        <div className="border-t border-white/5 my-1" />
                        <button
                          onClick={() => { setFilter(''); setShowFilters(false); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-red-400 hover:bg-red-500/10 transition-all"
                        >
                          <FiX className="w-4 h-4" />
                          <span>Filterni tozalash</span>
                        </button>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-start gap-3 p-3.5">
              <div className="w-9 h-9 rounded-xl bg-white/10 animate-pulse flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-24 bg-white/10 rounded animate-pulse" />
                <div className="h-3 w-full bg-white/5 rounded animate-pulse" />
                <div className="h-2 w-16 bg-white/5 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : displayedLogs.length === 0 ? (
        /* Empty state */
        <div className="py-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
            <FiActivity className="w-7 h-7 text-[#64748B]" />
          </div>
          <p className="text-sm text-[#64748B]">Hodisalar topilmadi</p>
          {filter && (
            <button
              onClick={() => setFilter('')}
              className="mt-2 text-xs text-[#00F5FF] hover:underline"
            >
              Filterni tozalash
            </button>
          )}
        </div>
      ) : (
        /* Log entries */
        <div
          ref={containerRef}
          className="space-y-0.5 max-h-[500px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent"
        >
          <AnimatePresence mode="popLayout">
            {displayedLogs.map((log, i) => (
              <LogEntry key={log.id} log={log} index={i} />
            ))}
          </AnimatePresence>

          {logs.length > limit && (
            <div className="pt-2 text-center">
              <span className="text-[10px] text-[#64748B]">
                {logs.length - limit} ta ko'proq hodisa...
              </span>
            </div>
          )}
        </div>
      )}

      {/* Auto-refresh indicator */}
      {refreshInterval > 0 && !isLoading && displayedLogs.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] text-[#64748B]">Real vaqt rejimi</span>
          </div>
          <span className="text-[10px] text-[#64748B] font-mono">
            {refreshInterval / 1000}s
          </span>
        </div>
      )}
    </div>
  );
}
