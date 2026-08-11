'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { FiSearch, FiRefreshCw, FiFilter } from 'react-icons/fi';
import { adminAPI } from '@/lib/api';

const FILTERS = [
  { key: '', label: 'Barchasi' },
  { key: 'fragment_sync', label: 'Fragment sync' },
];

// Amal badge ranglari (muhim turlari uchun)
const actionColor = (action: string) => {
  if (action === 'fragment_sync') return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
  if (action?.includes('user') || action?.includes('role')) return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
  if (action?.includes('payment') || action?.includes('balance') || action?.includes('topup')) return 'bg-green-500/10 text-green-400 border-green-500/20';
  if (action?.includes('order')) return 'bg-[#00F5FF]/10 text-[#00F5FF] border-[#00F5FF]/20';
  if (action?.includes('delete') || action?.includes('block') || action?.includes('fail')) return 'bg-red-500/10 text-red-400 border-red-500/20';
  return 'bg-white/5 text-[#94A3B8] border-white/10';
};

export default function AdminLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  // Qidiruv faqat submit'da qo'llaniladi — har bir tugma bosishda API so'rovi ketmaydi.
  const [appliedQuery, setAppliedQuery] = useState('');

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: any = { limit: 200 };
      if (filter) params.action = filter;
      if (appliedQuery.trim()) params.q = appliedQuery.trim();
      const res = await adminAPI.logs(params);
      setLogs(res.data.results || res.data);
    } catch (e) { console.error('Error:', e); }
    finally { setIsLoading(false); }
  }, [filter, appliedQuery]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setAppliedQuery(search.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Loglar</h1>
          <p className="text-sm text-[#64748B]">Barcha muhim amallar kuzatuvi — shu jumladan har bir Fragment API so'rovi</p>
        </div>
        <button onClick={fetchLogs} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-[#00F5FF] transition-all" title="Yangilash">
          <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filter + search */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex items-center gap-2">
            <FiFilter className="w-4 h-4 text-[#64748B]" />
            <div className="flex gap-1.5 p-1 rounded-xl bg-white/5 border border-white/5">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    filter === f.key
                      ? 'bg-gradient-to-r from-[#00F5FF] to-[#A855F7] text-[#0F172A]'
                      : 'text-[#94A3B8] hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <form onSubmit={handleSearch} className="relative flex-1">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <input
              type="text"
              placeholder="Qidirish (username, tavsif)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input pl-10 py-2.5 text-sm"
            />
          </form>
        </div>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-xs text-[#64748B] uppercase tracking-wider border-b border-white/5">
                <th className="text-left p-4">Foydalanuvchi</th>
                <th className="text-left p-4">Amal</th>
                <th className="text-left p-4">Tavsif</th>
                <th className="text-left p-4">Ob'ekt</th>
                <th className="text-left p-4">Sana</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="p-12 text-center"><div className="loading-spinner mx-auto" /></td></tr>
              ) : logs.length === 0 ? (
                <tr><td colSpan={5} className="p-12 text-center text-[#64748B]">Loglar mavjud emas</td></tr>
              ) : (
                logs.map((log: any, i: number) => (
                  <motion.tr
                    key={log.id || i}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.01, 0.3) }}
                    className="border-b border-white/5 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="p-4 text-sm text-white">{log.username || 'Tizim'}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${actionColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-[#94A3B8] max-w-md break-words">{log.description}</td>
                    <td className="p-4 text-sm text-[#64748B]">{log.target_type} #{log.target_id ?? '-'}</td>
                    <td className="p-4 text-sm text-[#64748B] whitespace-nowrap">
                      {log.created_at ? new Date(log.created_at).toLocaleString('uz-UZ') : '-'}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
