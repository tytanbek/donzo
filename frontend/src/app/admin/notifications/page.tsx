'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSend, FiBell, FiLoader, FiCheckCircle, FiAlertTriangle, FiClock } from 'react-icons/fi';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';

const LEVELS = [
  { value: 'info', label: 'Ma\'lumot', color: 'bg-sky-500/10 text-sky-400 border-sky-500/20' },
  { value: 'success', label: 'Muvaffaqiyat', color: 'bg-green-500/10 text-green-400 border-green-500/20' },
  { value: 'warning', label: 'Ogohlantirish', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  { value: 'error', label: 'Xato', color: 'bg-red-500/10 text-red-400 border-red-500/20' },
];

export default function AdminNotificationsPage() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [level, setLevel] = useState('info');
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = async () => {
    try {
      const res = await adminAPI.get('/admin/notifications/');
      setHistory(res.data.results || res.data || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const send = async () => {
    if (!title.trim() || !message.trim()) {
      toast.error('Sarlavha va matn kiritish shart');
      return;
    }
    setSending(true);
    try {
      await adminAPI.post('/admin/notifications/', { title, message, level });
      toast.success('Bildirishnoma barcha foydalanuvchilarga yuborildi!');
      setTitle('');
      setMessage('');
      setLevel('info');
      fetchHistory();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-3">
          <FiBell className="text-[#00F5FF]" />
          Bildirishnomalar
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Global xabar — barcha onlayn foydalanuvchilarga real-time yuboriladi (WebSocket)
        </p>
      </div>

      {/* Send form */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6"
      >
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <FiSend className="text-[#00F5FF]" />
          Yangi bildirishnoma yuborish
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Sarlavha</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Masalan: Yangi xizmat qo'shildi!"
              className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500 focus:border-[#00F5FF]/50 focus:outline-none transition-all"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Matn</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Xabar matni..."
              className="w-full px-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700 text-white placeholder-slate-500 focus:border-[#00F5FF]/50 focus:outline-none transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">Daraja</label>
            <div className="flex flex-wrap gap-2">
              {LEVELS.map((l) => (
                <button
                  key={l.value}
                  onClick={() => setLevel(l.value)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                    level === l.value
                      ? `${l.color} ring-1 ring-current`
                      : 'bg-slate-800/40 border-slate-700 text-slate-400 hover:text-white'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={send}
            disabled={sending}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-[#00F5FF] to-[#A855F7] text-[#0B1220] font-semibold hover:opacity-90 disabled:opacity-60 transition-all duration-200"
          >
            {sending ? <FiLoader className="w-4 h-4 animate-spin" /> : <FiSend className="w-4 h-4" />}
            {sending ? 'Yuborilmoqda...' : 'Barchaga yuborish'}
          </button>
        </div>
      </motion.div>

      {/* History */}
      <div className="glass-card p-6">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <FiClock className="text-[#00F5FF]" />
          Yuborilganlar tarixi
        </h2>

        {loading ? (
          <div className="text-center py-10 text-slate-500">Yuklanmoqda...</div>
        ) : history.length === 0 ? (
          <div className="text-center py-10">
            <FiBell className="w-14 h-14 mx-auto mb-3 text-slate-700" />
            <p className="text-slate-500">Hali bildirishnoma yuborilmagan</p>
          </div>
        ) : (
          <div className="space-y-3">
            {history.map((item) => {
              const lvl = LEVELS.find((l) => l.value === item.level) || LEVELS[0];
              return (
                <div key={item.id} className="p-4 rounded-xl bg-slate-800/40 border border-slate-700/60">
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${lvl.color}`}>
                        {lvl.label}
                      </span>
                      <span className="text-sm font-bold text-white">{item.title}</span>
                    </div>
                    <span className="text-xs text-slate-500">
                      {new Date(item.created_at).toLocaleString('uz-UZ')}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">{item.message}</p>
                  <p className="text-xs text-slate-500 mt-2">👤 {item.created_by_name || 'Admin'}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
