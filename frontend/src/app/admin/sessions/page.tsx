'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiRadio, FiRefreshCw, FiUsers, FiCheckCircle, FiXCircle,
  FiMonitor, FiGlobe, FiZap, FiClock, FiFilter,
} from 'react-icons/fi';
import { telegramSessionsAPI } from '@/lib/api';
import { onWSEvent, useWebSocket } from '@/lib/websocket';

const MAX_ROWS = 50;
const NEW_WINDOW_MS = 15000; // 15s ichida kelgan sessiya "YANGI" deb yoritiladi

type SessionRow = {
  id: number;
  telegram_id?: string | null;
  username?: string | null;
  first_name?: string | null;
  is_authenticated: boolean;
  launch_source?: string;
  user_agent?: string | null;
  ip_address?: string | null;
  error_code?: string | null;
  diag?: string | null;
  opened_at: string;
  last_seen_at?: string;
  arrivedAt?: number; // frontend tomondan: WS/poll orqali kelgan vaqt
};

type Filter = 'all' | 'ok' | 'fail';

function formatAgo(iso: string | null, now: number): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const diff = Math.max(0, (now - t) / 1000);
  if (diff < 5) return 'hozir';
  if (diff < 60) return `${Math.floor(diff)}s avval`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m avval`;
  return `${Math.floor(diff / 3600)}s avval`;
}

function shortUA(ua?: string | null): string {
  if (!ua) return '—';
  if (ua.includes('iPhone')) return '📱 iPhone';
  if (ua.includes('Android')) return '🤖 Android';
  if (ua.includes('Windows')) return '💻 Windows';
  if (ua.includes('Macintosh')) return '🍎 macOS';
  if (ua.includes('python-requests') || ua.includes('Python-urllib')) return '🧪 Test (script)';
  return ua.slice(0, 28) + (ua.length > 28 ? '…' : '');
}

const LAUNCH_LABELS: Record<string, string> = {
  telegram_webapp: 'Web App',
  telegram_code: 'Kod',
};

export default function AdminLiveSessionsPage() {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [now, setNow] = useState(Date.now());
  const [isLoading, setIsLoading] = useState(true);
  const [newId, setNewId] = useState<number | null>(null);
  const [pollOn, setPollOn] = useState(true);
  const seenIds = useRef<Set<number>>(new Set());
  const { isConnected, connectionStatus } = useWebSocket();

  // Merge a session into the list (dedupe by id, newest first, cap MAX_ROWS)
  const mergeSession = useCallback((s: SessionRow) => {
    if (!s || seenIds.current.has(s.id)) return;
    seenIds.current.add(s.id);
    setSessions((prev) => {
      const next = [{ ...s, arrivedAt: Date.now() }, ...prev]
        .filter((x) => x.id !== s.id)
        .slice(0, MAX_ROWS);
      return next;
    });
    setNewId(s.id);
    window.setTimeout(() => setNewId((cur) => (cur === s.id ? null : cur)), 4000);
  }, []);

  // Initial REST fetch + WS subscription
  useEffect(() => {
    let cancelled = false;
    telegramSessionsAPI
      .list({ limit: MAX_ROWS })
      .then((res: any) => {
        if (cancelled) return;
        const rows: SessionRow[] = (res.data?.results || []).map((s: any) => ({
          ...s,
          arrivedAt: Date.now(),
        }));
        rows.forEach((r) => seenIds.current.add(r.id));
        setSessions(rows);
      })
      .catch((e: any) => console.error('Sessiyalarni yuklashda xatolik:', e))
      .finally(() => !cancelled && setIsLoading(false));

    const unsub = onWSEvent('telegram_session', (data: any) => {
      if (data?.session) mergeSession(data.session);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [mergeSession]);

  // Live tick (5s) — "avval" yorliqlari uchun
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // Fallback poll (5s) — WS uzilgan bo'lsa ham yangilari ko'rinsin
  useEffect(() => {
    if (!pollOn) return;
    const t = setInterval(() => {
      telegramSessionsAPI
        .list({ limit: 20 })
        .then((res: any) => {
          (res.data?.results || []).forEach((s: any) => mergeSession(s));
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [pollOn, mergeSession]);

  const filtered = sessions.filter((s) =>
    filter === 'all' ? true : filter === 'ok' ? s.is_authenticated : !s.is_authenticated
  );
  const okCount = sessions.filter((s) => s.is_authenticated).length;
  const failCount = sessions.length - okCount;

  return (
    <div>
      {/* ═══ Header ═══ */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center border bg-[#00F5FF]/15 border-[#00F5FF]/30 shadow-[0_0_24px_rgba(0,245,255,0.15)]">
            <FiRadio className="w-6 h-6 text-[#00F5FF]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Jonli sessiyalar</h1>
            <p className="text-sm text-[#64748B]">
              Telegram ichidan kirgan real foydalanuvchilar — zudlik bilan
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium ${
            isConnected
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          }`}>
            <span className={`relative flex w-2 h-2`}>
              <span className={`absolute inline-flex w-full h-full rounded-full opacity-60 animate-ping ${
                isConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`} />
              <span className={`relative inline-flex w-2 h-2 rounded-full ${
                isConnected ? 'bg-emerald-400' : 'bg-amber-400'
              }`} />
            </span>
            {isConnected ? 'WS jonli' : `${connectionStatus} · poll 5s`}
          </span>
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-[#94A3B8] cursor-pointer">
            <input
              type="checkbox"
              checked={pollOn}
              onChange={(e) => setPollOn(e.target.checked)}
              className="accent-[#00F5FF]"
            />
            Fallback-poll (5s)
          </label>
          <button
            onClick={() => {
              setIsLoading(true);
              telegramSessionsAPI
                .list({ limit: MAX_ROWS })
                .then((res: any) => {
                  const rows = (res.data?.results || []).map((s: any) => ({ ...s }));
                  rows.forEach((r: any) => seenIds.current.add(r.id));
                  setSessions(rows);
                })
                .catch(() => {})
                .finally(() => setIsLoading(false));
            }}
            className="glow-btn-outline flex items-center gap-2 px-4 py-2 text-sm"
          >
            <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Yangilash
          </button>
        </div>
      </div>

      {/* ═══ Stats + filters ═══ */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/10">
            <p className="text-[10px] text-[#64748B] uppercase tracking-wider">Jami (oxirgi {MAX_ROWS})</p>
            <p className="text-xl font-bold text-white">{sessions.length}</p>
          </div>
          <div className="px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
            <p className="text-[10px] text-emerald-500/70 uppercase tracking-wider flex items-center gap-1">
              <FiCheckCircle className="w-3 h-3" /> Tasdiqlangan
            </p>
            <p className="text-xl font-bold text-emerald-400">{okCount}</p>
          </div>
          <div className="px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <p className="text-[10px] text-red-400/70 uppercase tracking-wider flex items-center gap-1">
              <FiXCircle className="w-3 h-3" /> Rad etilgan
            </p>
            <p className="text-xl font-bold text-red-400">{failCount}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FiFilter className="w-4 h-4 text-[#64748B]" />
          {([
            { key: 'all', label: 'Barcha' },
            { key: 'ok', label: '✅ Tasdiqlangan' },
            { key: 'fail', label: '❌ Rad etilgan' },
          ] as { key: Filter; label: string }[]).map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                filter === f.key
                  ? 'bg-[#00F5FF]/15 text-[#00F5FF] border-[#00F5FF]/30'
                  : 'bg-white/5 text-[#94A3B8] border-white/10 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Table ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6"
      >
        {isLoading && sessions.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="loading-spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <FiUsers className="w-10 h-10 text-[#334155] mx-auto mb-3" />
            <p className="text-sm text-[#64748B]">
              {sessions.length === 0 ? 'Hozircha sessiyalar yo\'q' : 'Bu filtrda sessiya yo\'q'}
            </p>
            <p className="text-xs text-[#475569] mt-1">
              Foydalanuvchi @DONZOROBOT'dan Web App'ni ochganda shu yerda zudlik bilan ko'rinadi
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-[#64748B]">
                  <th className="pb-2.5 pr-4">Foydalanuvchi</th>
                  <th className="pb-2.5 pr-4">Telegram ID</th>
                  <th className="pb-2.5 pr-4">Holat</th>
                  <th className="pb-2.5 pr-4">IP</th>
                  <th className="pb-2.5 pr-4">Qurilma</th>
                  <th className="pb-2.5 pr-4">Manba</th>
                  <th className="pb-2.5">Vaqt</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {filtered.map((s) => {
                    const isNew = s.id === newId;
                    return (
                      <motion.tr
                        key={s.id}
                        layout
                        initial={{ opacity: 0, backgroundColor: 'rgba(0,245,255,0.18)' }}
                        animate={{
                          opacity: 1,
                          backgroundColor: isNew ? 'rgba(0,245,255,0.18)' : 'rgba(255,255,255,0)',
                        }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.4 }}
                        className="border-b border-white/5 last:border-0"
                      >
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">
                              {s.first_name || s.username || '—'}
                            </span>
                            {isNew && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-[#00F5FF]/20 border border-[#00F5FF]/40 text-[9px] font-bold text-[#00F5FF]">
                                NEW
                              </span>
                            )}
                          </div>
                          {s.username && (
                            <span className="text-[11px] text-[#64748B]">@{s.username}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4 text-[#94A3B8] font-mono text-xs">
                          {s.telegram_id || '—'}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full ${
                            s.is_authenticated
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-red-500/10 text-red-400'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              s.is_authenticated ? 'bg-emerald-400' : 'bg-red-400'
                            }`} />
                            {s.is_authenticated ? 'Tasdiqlangan' : (s.error_code || 'Rad etilgan')}
                          </span>
                          {s.diag && !s.is_authenticated && (
                            <span
                              title={s.diag}
                              className="block mt-1 max-w-[280px] truncate text-[10px] font-mono text-[#64748B]/80"
                            >
                              {s.diag}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 pr-4">
                          <span className="inline-flex items-center gap-1.5 text-xs text-[#94A3B8] font-mono">
                            <FiGlobe className="w-3 h-3 text-[#64748B]" />
                            {s.ip_address || '—'}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-[#94A3B8]">
                          <span className="inline-flex items-center gap-1.5">
                            <FiMonitor className="w-3 h-3 text-[#64748B]" />
                            {shortUA(s.user_agent)}
                          </span>
                        </td>
                        <td className="py-2.5 pr-4 text-xs text-[#94A3B8]">
                          <span className="inline-flex items-center gap-1.5">
                            <FiZap className="w-3 h-3 text-[#64748B]" />
                            {LAUNCH_LABELS[s.launch_source || ''] || s.launch_source || '—'}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-[#94A3B8]">
                          <span className="inline-flex items-center gap-1.5">
                            <FiClock className="w-3 h-3 text-[#64748B]" />
                            {formatAgo(s.opened_at, now)}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* ═══ Footer info ═══ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
        className="glass-card p-5 mt-5"
      >
        <div className="flex items-start gap-3">
          <FiRadio className="w-5 h-5 text-[#00F5FF] shrink-0 mt-0.5" />
          <div className="text-xs text-[#64748B] leading-relaxed">
            <p className="font-semibold text-white text-sm mb-1">Qanday ishlaydi</p>
            <p>
              Har bir Web App ochilishi (muvaffaqiyatli yoki <code className="text-[#00F5FF]">error_code</code> bilan
              rad etilgan) <strong className="text-white">WebSocket orqali zudlik bilan</strong> shu ekranga keladi.
              WS uzilgan bo'lsa, 5 soniyalik fallback-poll yangiliklarni olib keladi. IP maydoni — audit uchun
              (xavfsizlik tahlilida bir IP'dan ko'p urinishlarni aniqlash imkonini beradi).
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
