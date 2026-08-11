'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiSearch, FiUsers, FiUserPlus, FiShield, FiRefreshCw,
  FiSend, FiX, FiCheck, FiInfo, FiStar, FiTrash2, FiEye
} from 'react-icons/fi';
import { roleAPI } from '@/lib/api';
import toast from 'react-hot-toast';

const roleMeta: Record<string, { label: string; color: string; desc: string }> = {
  super_admin: { label: 'Super Admin', color: 'bg-purple-500/20 text-purple-400 border-purple-500/30', desc: 'To\'liq boshqaruv' },
  admin: { label: 'Admin', color: 'bg-[#00F5FF]/20 text-[#00F5FF] border-[#00F5FF]/30', desc: 'CRM + savdo boshqaruvi' },
  senior_operator: { label: 'Senior Operator', color: 'bg-[#A855F7]/20 text-[#A855F7] border-[#A855F7]/30', desc: 'Katta operator' },
  operator: { label: 'Operator', color: 'bg-pink-500/20 text-pink-400 border-pink-500/30', desc: 'Buyurtmalar bajarish' },
  support: { label: 'Support', color: 'bg-teal-500/20 text-teal-400 border-teal-500/30', desc: 'Qo\'llab-quvvatlash' },
};

const ASSIGNABLE_ROLES = ['admin', 'senior_operator', 'operator', 'support'];

export default function AdminRolesPage() {
  const [holders, setHolders] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  const fetchHolders = async () => {
    setIsLoading(true);
    try {
      const res = await roleAPI.holders();
      setHolders(res.data.results || []);
    } catch (e) {
      toast.error('Rol egalarini yuklashda xatolik');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchHolders(); }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    setIsSearching(true);
    try {
      const res = await roleAPI.search(search);
      setSearchResults(res.data.results || []);
    } catch (e) {
      toast.error('Qidiruvda xatolik');
    } finally {
      setIsSearching(false);
    }
  };

  const assignRole = async (user: any, role: string) => {
    try {
      await roleAPI.setRole({
        telegram_id: user.telegram_id || '',
        username: user.username || user.telegram_username || '',
        role,
      });
      toast.success(`${user.username || user.telegram_username} → ${roleMeta[role]?.label} tayinlandi`);
      setSearch('');
      setSearchResults([]);
      fetchHolders();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Rol berishda xatolik');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Rollar boshqaruvi</h1>
          <p className="text-sm text-[#64748B]">
            Xodimlarga rol berish — ular o'z Telegram akkauntida kirganda avtomatik panel ochiladi
          </p>
        </div>
        <button onClick={fetchHolders} className="p-3 rounded-lg bg-white/5 text-[#64748B] hover:text-[#00F5FF] transition-all">
          <FiRefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Owner info */}
      <div className="glass-card p-4 flex items-start gap-3 border-[#00F5FF]/20">
        <FiStar className="w-5 h-5 text-[#00F5FF] mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <p className="text-white font-medium">Egasi (Owner)</p>
          <p className="text-[#94A3B8] text-xs mt-1">
            Telegram ID <b className="text-[#00F5FF]">2007554600</b> bo'lgan akkaunt avtomatik <b>Super Admin</b> bo'ladi —
            Telegram orqali kirishi bilan admin panel ochiladi. Buni sozlamalarda o'zgartirish mumkin.
          </p>
        </div>
      </div>

      {/* Add role — search user */}
      <div className="glass-card p-5">
        <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
          <FiUserPlus className="w-5 h-5 text-[#00F5FF]" /> Rol berish
        </h3>
        <p className="text-xs text-[#64748B] mb-4">
          Foydalanuvchini <b>Telegram ID</b> yoki <b>username</b> bo'yicha qidiring (avval u Telegram orqali kamida bir marta kirgan bo'lishi kerak).
        </p>
        <form onSubmit={handleSearch} className="relative">
          <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
          <input
            type="text"
            placeholder="Telegram ID yoki username: 123456789 yoki @nick"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="glass-input pl-10 py-3 text-sm"
          />
        </form>

        {/* Search results */}
        <AnimatePresence>
          {searchResults.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-4 space-y-2">
                {searchResults.map((u) => (
                  <div key={u.id} className="p-4 rounded-xl bg-white/[0.03] border border-white/5">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center font-bold text-[#00F5FF] flex-shrink-0">
                          {(u.username || '?').charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-white truncate">{u.username}</p>
                          <p className="text-xs text-[#64748B]">
                            TG: {u.telegram_id || '-'} {u.telegram_username ? `| @${u.telegram_username}` : ''}
                          </p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                        roleMeta[u.role]?.color || 'bg-white/5 text-[#64748B]'
                      }`}>
                        {roleMeta[u.role]?.label || u.role}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {ASSIGNABLE_ROLES.map((r) => (
                        <button
                          key={r}
                          onClick={() => assignRole(u, r)}
                          disabled={u.role === r}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            u.role === r
                              ? 'bg-white/10 text-white'
                              : 'bg-white/5 text-[#94A3B8] hover:bg-[#00F5FF]/15 hover:text-[#00F5FF]'
                          }`}
                        >
                          {u.role === r ? <FiCheck className="w-3 h-3 inline mr-1" /> : null}
                          {roleMeta[r]?.label}
                        </button>
                      ))}
                      {u.role !== 'super_admin' && (
                        <button
                          onClick={() => assignRole(u, 'customer')}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all ml-auto"
                        >
                          <FiX className="w-3 h-3 inline mr-1" /> Rolni olib tashlash
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
          {isSearching && (
            <div className="flex items-center justify-center py-6"><div className="loading-spinner" /></div>
          )}
          {search && !isSearching && searchResults.length === 0 && (
            <div className="text-center py-6 text-[#64748B] text-sm">
              <FiEye className="w-10 h-10 mx-auto mb-2 opacity-30" />
              Foydalanuvchi topilmadi. Avval u Telegram orqali kirishi kerak.
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Current role holders */}
      <div>
        <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
          <FiShield className="w-5 h-5 text-[#00F5FF]" /> Joriy rol egalari ({holders.length})
        </h3>
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><div className="loading-spinner" /></div>
        ) : holders.length === 0 ? (
          <div className="glass-card p-10 text-center text-[#64748B]">
            <FiUsers className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p>Hozircha rol egalari yo'q</p>
            <p className="text-xs mt-2">Yuqoridagi qidiruv orqali birinchi xodimni qo'shing</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {holders.map((u, i) => (
              <motion.div
                key={u.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="glass-card p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center font-bold text-[#00F5FF] flex-shrink-0">
                    {(u.username || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-white truncate">{u.username}</p>
                    <p className="text-xs text-[#64748B] flex items-center gap-1">
                      <FiSend className="w-3 h-3" /> TG: {u.telegram_id || '-'}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium border flex-shrink-0 ${
                    roleMeta[u.role]?.color || 'bg-white/5 text-[#64748B]'
                  }`}>
                    {roleMeta[u.role]?.label || u.role}
                  </span>
                </div>
                <p className="text-[11px] text-[#64748B] mt-2">{roleMeta[u.role]?.desc || ''}</p>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Info note */}
      <div className="glass-card p-4 flex items-start gap-3 border-white/5">
        <FiInfo className="w-5 h-5 text-[#94A3B8] mt-0.5 flex-shrink-0" />
        <p className="text-xs text-[#64748B] leading-relaxed">
          Rol berilgan xodim o'z Telegram akkauntida bot orqali web app'ni ochsa, avtomatik ravishda
          o'z paneliga (Admin / Operator / Support) yo'naltiriladi. Parol eslab qolish shart emas.
          <br />
          <span className="text-[#94A3B8]">Eslatma:</span> ega (owner) Telegram ID'si hech qachon pasaytirilmaydi — u doim Super Admin bo'lib qoladi.
        </p>
      </div>
    </div>
  );
}
