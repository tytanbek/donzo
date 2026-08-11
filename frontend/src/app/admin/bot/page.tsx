'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiRefreshCw, FiSend, FiUsers, FiMessageSquare, FiClock, FiRotateCw,
  FiActivity, FiLink, FiKey, FiTerminal, FiCheckCircle,
  FiAlertTriangle, FiShield, FiWifi, FiXCircle
} from 'react-icons/fi';
import { adminAPI, telegramSessionsAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { BOT_USERNAME } from '@/lib/brand';

const COMMAND_LABELS: Record<string, string> = {
  start: '/start',
  balance: '/balance',
  orders: '/orders',
  help: '/help',
  'button:balance': '💰 Balansim tugmasi',
  'button:orders': '📦 Buyurtmalarim tugmasi',
};

function formatUptime(iso: string | null, now: number): string {
  if (!iso) return '—';
  const start = new Date(iso).getTime();
  if (isNaN(start)) return '—';
  const diff = Math.max(0, (now - start) / 1000);
  const d = Math.floor(diff / 86400);
  const h = Math.floor((diff % 86400) / 3600);
  const m = Math.floor((diff % 3600) / 60);
  const s = Math.floor(diff % 60);
  if (d > 0) return `${d}k ${h}s`;
  if (h > 0) return `${h}s ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatAgo(iso: string | null, now: number): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const diff = Math.max(0, (now - t) / 1000);
  if (diff < 60) return `${Math.floor(diff)}s avval`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m avval`;
  return `${Math.floor(diff / 3600)}s avval`;
}

type StatCard = {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  label: string;
  value: string;
  accent: string;
  sub?: string;
};

export default function AdminBotStatusPage() {
  const [data, setData] = useState<any>(null);
  const [sessions, setSessions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchStatus = useCallback(async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const res = await adminAPI.get('/admin/bot-status/');
      setData(res.data);
    } catch (e: any) {
      console.error(e);
      if (!silent) toast.error('Bot holatini olishda xatolik');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch recent Telegram Web App sessions (verified Web App logins)
  const fetchSessions = useCallback(async (silent = false) => {
    try {
      const res = await telegramSessionsAPI.list({ limit: 10 });
      setSessions(res.data.results || []);
    } catch (e: any) {
      if (!silent) console.error('Sessiyalarni olishda xatolik:', e);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    fetchSessions();
  }, [fetchStatus, fetchSessions]);

  // Live tick every 5s (for uptime / last-activity labels)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  // Auto-refresh every 15s (status + sessions)
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      fetchStatus(true);
      fetchSessions(true);
    }, 15000);
    return () => clearInterval(t);
  }, [autoRefresh, fetchStatus, fetchSessions]);

  if (isLoading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="glass-card p-12 text-center text-[#64748B]">
        Bot holati ma'lumotlarini olish imkonsiz.
      </div>
    );
  }

  const running = data.running;
  const stats = data.stats || {};
  const commands = stats.commands || {};
  const commandEntries: [string, number][] = Object.entries(commands)
    .map(([k, v]) => [k, Number(v) || 0] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  const maxCommand = Math.max(1, ...commandEntries.map(([, v]) => v));

  return (
    <div>
      {/* ═══ Header ═══ */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center border ${
            running
              ? 'bg-emerald-500/15 border-emerald-500/30 shadow-[0_0_24px_rgba(16,185,129,0.25)]'
              : 'bg-red-500/15 border-red-500/30'
          }`}>
            <FiSend className={`w-6 h-6 ${running ? 'text-emerald-400' : 'text-red-400'}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Bot holati</h1>
            <p className="text-sm text-[#64748B]">Telegram bot — jonli monitoring</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-[#94A3B8] cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="accent-[#00F5FF]"
            />
            Avto-yangilash (15s)
          </label>
          <button
            onClick={() => fetchStatus()}
            className="glow-btn-outline flex items-center gap-2 px-4 py-2 text-sm"
          >
            <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Yangilash
          </button>
        </div>
      </div>

      {/* ═══ Status hero banner ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`glass-card p-6 mb-6 border-l-4 overflow-hidden relative ${
          running ? 'border-l-emerald-400' : 'border-l-red-500'
        }`}
      >
        <div className="absolute inset-0 pointer-events-none" style={{
          background: running
            ? 'radial-gradient(600px 120px at 10% 0%, rgba(16,185,129,0.12), transparent)'
            : 'radial-gradient(600px 120px at 10% 0%, rgba(239,68,68,0.12), transparent)',
        }} />
        <div className="relative flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 flex-1">
            <span className="relative flex w-4 h-4">
              {running && (
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
              )}
              <span className={`relative inline-flex w-4 h-4 rounded-full ${
                running ? 'bg-emerald-400' : 'bg-red-500'
              }`} />
            </span>
            <div>
              <h2 className={`text-xl font-bold ${running ? 'text-emerald-400' : 'text-red-400'}`}>
                {running ? 'Bot ishlamoqda' : 'Bot ishlamayapti'}
              </h2>
              <p className="text-xs text-[#64748B]">
                {running
                  ? `Oxirgi faollik: ${formatAgo(stats.last_activity, now)}`
                  : 'Heartbeat 120s dan ortiq qabul qilinmadi. Supervisor log\'ni tekshiring.'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {data.config?.bot_username && (
              <span className="px-3 py-1.5 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-xs text-[#38BDF8] font-medium flex items-center gap-1.5">
                <FiLink className="w-3.5 h-3.5" /> @{data.config.bot_username}
              </span>
            )}
            {data.config?.token_prefix && (
              <span className="px-3 py-1.5 rounded-lg bg-[#F59E0B]/10 border border-[#F59E0B]/20 text-xs text-[#F59E0B] font-mono flex items-center gap-1.5">
                <FiKey className="w-3.5 h-3.5" /> {data.config.token_prefix}...
              </span>
            )}
          </div>
        </div>
      </motion.div>

      {/* ═══ Token status strip ═══ */}
      {(() => {
        const ts = stats.token_status;
        // A check only counts if the bot actually ran getMe (checked_at set) —
        // an empty {} / null must render as "Tekshirilmagan", never "invalid".
        const checked = !!(ts && ts.checked_at);
        const valid = ts?.valid === true;
        const configured = data.token_configured === true;
        let color = '#64748B', bg = 'bg-white/5', border = 'border-white/10', icon = FiKey, label = 'Tekshirilmagan';
        if (!configured) {
          color = '#EF4444'; bg = 'bg-red-500/10'; border = 'border-red-500/30'; icon = FiXCircle; label = 'Token sozlanmagan';
        } else if (checked && valid) {
          color = '#10B981'; bg = 'bg-emerald-500/10'; border = 'border-emerald-500/30'; icon = FiCheckCircle; label = 'Token to\'g\'ri';
        } else if (checked) {
          color = '#EF4444'; bg = 'bg-red-500/10'; border = 'border-red-500/30'; icon = FiXCircle; label = 'Token noto\'g\'ri';
        }
        const Icon = icon;
        return (
          <div className={`glass-card p-4 mb-6 flex flex-col sm:flex-row sm:items-center gap-3 border ${border} ${bg}`}>
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${bg} border ${border}`}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
              <div>
                <p className="text-[10px] text-[#64748B] uppercase tracking-wider">Telegram token holati</p>
                <p className="text-sm font-bold" style={{ color }}>{label}</p>
              </div>
            </div>
            {ts?.username && (
              <span className="px-3 py-1.5 rounded-lg bg-[#38BDF8]/10 border border-[#38BDF8]/20 text-xs text-[#38BDF8] font-medium flex items-center gap-1.5">
                <FiShield className="w-3.5 h-3.5" /> @{ts.username}
              </span>
            )}
            {ts?.checked_at && (
              <span className="text-[11px] text-[#64748B]">
                Tekshirilgan: {formatAgo(ts.checked_at, now)}
              </span>
            )}
            {ts?.detail && !valid && (
              <span className="text-[11px] text-red-400/80 font-mono max-w-xs truncate" title={ts.detail}>
                {ts.detail}
              </span>
            )}
          </div>
        );
      })()}

      {/* ═══ Stat cards ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {(
          [
            { icon: FiActivity, label: 'Uptime', value: formatUptime(stats.started_at, now), accent: '#00F5FF', sub: stats.uptime_seconds != null ? `${Math.floor(stats.uptime_seconds)}s` : undefined },
            { icon: FiClock, label: 'Oxirgi heartbeat', value: stats.last_heartbeat ? formatAgo(stats.last_heartbeat, now) : '—', accent: '#38BDF8', sub: stats.heartbeat_age_seconds != null ? `yoshi: ${Math.floor(stats.heartbeat_age_seconds)}s` : undefined },
            { icon: FiMessageSquare, label: 'Yuborilgan xabarlar', value: Number(stats.messages_sent || 0).toLocaleString(), accent: '#A855F7' },
            { icon: FiSend, label: 'Qabul qilingan so\'rovlar', value: Number(stats.updates_handled || 0).toLocaleString(), accent: '#10B981' },
            { icon: FiUsers, label: 'Telegram foydalanuvchilar', value: Number(data.telegram_users || 0).toLocaleString(), accent: '#F59E0B', sub: `Jami hisoblar: ${Number(data.total_users || 0).toLocaleString()}` },
            { icon: FiRotateCw, label: 'Qayta ishga tushirishlar', value: String(stats.restarts || 0), accent: '#EF4444' },
          ] as StatCard[]
        ).map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="glass-card p-4"
          >
            <div className="flex items-center gap-2 mb-3">
              <s.icon className="w-4 h-4" style={{ color: s.accent }} />
              <span className="text-[10px] text-[#64748B] uppercase tracking-wider">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-white">{s.value}</p>
            {s.sub && <p className="text-[10px] text-[#475569] mt-0.5">{s.sub}</p>}
          </motion.div>
        ))}
      </div>

      {/* ═══ getUpdates polling errors ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass-card p-6 mb-6"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${
              (stats.polling_errors || []).length
                ? 'bg-red-500/15 border-red-500/30'
                : 'bg-emerald-500/15 border-emerald-500/30'
            }`}>
              <FiWifi className={`w-4 h-4 ${(stats.polling_errors || []).length ? 'text-red-400' : 'text-emerald-400'}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">getUpdates xatolari</h3>
              <p className="text-[11px] text-[#64748B]">Polling tarmoq holati — 409 Conflict / NetworkError / timeout</p>
            </div>
          </div>
          {(stats.polling_errors || []).length === 0 && (
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              SOF — xatolar yo'q
            </span>
          )}
        </div>

        {(stats.polling_errors || []).length === 0 ? (
          <div className="text-center py-8">
            <FiCheckCircle className="w-8 h-8 text-emerald-500/50 mx-auto mb-3" />
            <p className="text-sm text-[#64748B]">So'nggi 20 ta getUpdates chaqiruvida xato qayd etilmagan</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {(stats.polling_errors as any[]).slice().reverse().map((err, i) => (
              <div key={i} className="flex items-start gap-3 bg-[#0A0F1E] border border-white/5 rounded-lg px-3 py-2">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold shrink-0 mt-0.5 ${
                  err.kind === 'conflict_409'
                    ? 'bg-amber-500/15 text-amber-400'
                    : 'bg-red-500/15 text-red-400'
                }`}>
                  {err.kind === 'conflict_409' ? '409 Conflict' : err.kind}
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-[#94A3B8] font-mono truncate" title={err.message}>{err.message}</p>
                  <p className="text-[10px] text-[#475569] mt-0.5">{new Date(err.ts).toLocaleString('uz-UZ', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══ Command usage ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-card p-6"
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="w-9 h-9 rounded-xl bg-[#A855F7]/15 border border-[#A855F7]/30 flex items-center justify-center">
              <FiActivity className="w-4 h-4 text-[#A855F7]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Buyruqlar statistikasi</h3>
              <p className="text-[11px] text-[#64748B]">Har bir buyruq va tugma necha marta ishlatildi</p>
            </div>
          </div>

          {commandEntries.length === 0 ? (
            <div className="text-center py-10">
              <FiMessageSquare className="w-8 h-8 text-[#334155] mx-auto mb-3" />
              <p className="text-sm text-[#64748B]">Hali buyruqlar ishlatilmagan</p>
              <p className="text-xs text-[#475569] mt-1">Foydalanuvchilar @{BOT_USERNAME}'ga /start yuborganda bu yerda ko'rinadi</p>
            </div>
          ) : (
            <div className="space-y-3">
              {commandEntries.map(([cmd, count]) => (
                <div key={cmd}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-[#94A3B8] font-medium">
                      {COMMAND_LABELS[cmd] || cmd}
                    </span>
                    <span className="text-xs font-bold text-white">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${((count as number) / maxCommand) * 100}%` }}
                      transition={{ duration: 0.6 }}
                      className="h-full rounded-full bg-gradient-to-r from-[#A855F7] to-[#00F5FF]"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ═══ Supervisor log ═══ */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass-card p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#00F5FF]/15 border border-[#00F5FF]/30 flex items-center justify-center">
                <FiTerminal className="w-4 h-4 text-[#00F5FF]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Supervisor log</h3>
                <p className="text-[11px] text-[#64748B]">.freebuff/bot-supervisor.log — oxirgi 30 qator</p>
              </div>
            </div>
            {running && (
              <span className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>

          <div className="bg-[#0A0F1E] border border-white/10 rounded-xl p-4 font-mono text-[11px] leading-relaxed max-h-72 overflow-y-auto">
            {data.supervisor_log?.length ? (
              data.supervisor_log.map((line: string, i: number) => (
                <p key={i} className={line.includes('XATO') || line.includes('Traceback') ? 'text-red-400' : 'text-[#7DD3FC]/80'}>
                  {line || '\u00A0'}
                </p>
              ))
            ) : (
              <p className="text-[#475569]">Log topilmadi. Supervisor ishga tushganda yoziladi.</p>
            )}
          </div>
        </motion.div>
      </div>

      {/* ═══ Recent Telegram Web App sessions ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-6 mt-6"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl bg-[#38BDF8]/15 border border-[#38BDF8]/30 flex items-center justify-center">
            <FiUsers className="w-4 h-4 text-[#38BDF8]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Oxirgi Telegram Web App kirishlari</h3>
            <p className="text-[11px] text-[#64748B]">Imzo tasdiqlangan sessiyalar (so'nggi 10 ta)</p>
          </div>
        </div>

        {sessions.length === 0 ? (
          <div className="text-center py-8">
            <FiActivity className="w-8 h-8 text-[#334155] mx-auto mb-3" />
            <p className="text-sm text-[#64748B]">Hozircha sessiyalar yo'q</p>
            <p className="text-xs text-[#475569] mt-1">Foydalanuvchi bot'dan Web App'ni ochganda shu yerda ko'rinadi</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-[10px] uppercase tracking-wider text-[#64748B]">
                  <th className="pb-2 pr-4">Foydalanuvchi</th>
                  <th className="pb-2 pr-4">Telegram ID</th>
                  <th className="pb-2 pr-4">Holat</th>
                  <th className="pb-2 pr-4">Ochilgan</th>
                  <th className="pb-2">Oxirgi faollik</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s: any) => (
                  <tr key={s.id} className="border-b border-white/5 last:border-0">
                    <td className="py-2.5 pr-4">
                      <span className="text-white font-medium">
                        {s.first_name || s.username || '—'}
                      </span>
                      {s.username && (
                        <span className="text-[11px] text-[#64748B] block">@{s.username}</span>
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
                        {s.is_authenticated ? 'Tasdiqlangan' : s.error_code || 'Rad etilgan'}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-[#94A3B8]">
                      {new Date(s.opened_at).toLocaleString('uz-UZ', {
                        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="py-2.5 text-xs text-[#94A3B8]">
                      {formatAgo(s.last_seen_at, now)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* ═══ Info footer ═══ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.35 }}
        className="glass-card p-5 mt-6"
      >
        <div className="flex items-start gap-3">
          {running
            ? <FiCheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            : <FiAlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />}
          <div className="text-xs text-[#64748B] leading-relaxed">
            <p className="font-semibold text-white text-sm mb-1">
              {running ? 'Bot to\'liq ishlayapti' : 'Bot to\'xtagan — nima qilish kerak?'}
            </p>
            {running ? (
              <p>
                Bot <strong className="text-emerald-400">@{BOT_USERNAME}</strong> da ishlamoqda va har 30 soniyada
                heartbeat yozadi. Uptime, yuborilgan xabarlar va buyruqlar statistikasi real vaqtda yangilanadi.
                Avtomatik qayta ishga tushirish <strong>bot_supervisor.py</strong> (watchdog) tomonidan boshqariladi.
              </p>
            ) : (
              <p>
                Bot jarayoni to'xtab qolgan yoki heartbeati kechikmoqda. Tekshirish uchun:
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Supervisor log'ni yuqorida tekshiring (xatolik yozuvi bormi?)</li>
                  <li>Terminalda: <code className="text-[#00F5FF]">cd backend && python bot_supervisor.py</code></li>
                  <li>Admin panel → Kalitlar sahifasida token to'g'ri kiritilganini tekshiring</li>
                </ol>
              </p>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
