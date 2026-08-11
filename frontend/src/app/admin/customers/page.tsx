'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FiSearch, FiUser, FiMail, FiPhone, FiShield, 
  FiChevronDown, FiEdit2, FiX, FiSave, FiTrash2, FiPlus,
  FiFilter, FiActivity, FiDollarSign, FiCheckCircle, FiXCircle,
  FiRefreshCw, FiAward
} from 'react-icons/fi';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import AdminUserProfileModal from '@/components/AdminUserProfileModal';
import { roleLabels, roleColors } from '@/lib/roles';

// Xavfsiz sana formatlash — noto'g'ri/bo'sh qiymatda '—' qaytaradi
// (Invalid Date xatosi chiqmasligi uchun).
const fmtDate = (v: any) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('uz-UZ');
};
const fmtDay = (v: any) => {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('uz-UZ');
};

export default function AdminCustomersPage() {
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editingUser, setEditingUser] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>({});
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ username: '', email: '', telegram_id: '', role: 'customer', phone: '' });
  const [profileUser, setProfileUser] = useState<any>(null);
  const [bulkSyncing, setBulkSyncing] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<any>(null);
  const bulkPollRef = useRef<any>(null);

  // Sahifadan chiqilganda poll to'xtatiladi (memory leak / unmounted state xavfi).
  useEffect(() => () => { if (bulkPollRef.current) clearInterval(bulkPollRef.current); }, []);

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (roleFilter) params.role = roleFilter;
      const res = await adminAPI.users(params);
      setUsers(res.data.results || res.data);
    } catch (e) {
      toast.error('Foydalanuvchilarni yuklashda xatolik');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [roleFilter]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchUsers();
  };

  // ─── Edit User ───
  const openEdit = (user: any) => {
    // Xuddi shu foydalanuvchi ochiq bo'lsa — panelni yopamiz (toggle).
    if (editingUser?.id === user.id) {
      setEditingUser(null);
      return;
    }
    setEditingUser(user);
    setEditForm({
      username: user.username,
      email: user.email,
      phone: user.phone || '',
      role: user.role,
      balance: user.balance,
      is_active: user.is_active,
      is_blacklisted: user.is_blacklisted,
    });
  };

  const saveEdit = async () => {
    if (!editingUser) return;
    try {
      await adminAPI.updateUser(editingUser.id, editForm);
      toast.success('Foydalanuvchi yangilandi');
      setEditingUser(null);
      fetchUsers();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Xatolik yuz berdi');
    }
  };

  // ─── Create User ───
  const createUser = async () => {
    if (!createForm.username || !createForm.telegram_id) {
      toast.error('Username va Telegram ID majburiy');
      return;
    }
    try {
      await adminAPI.createUser(createForm);
      toast.success('Foydalanuvchi yaratildi');
      setShowCreateForm(false);
      setCreateForm({ username: '', email: '', telegram_id: '', role: 'customer', phone: '' });
      fetchUsers();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Xatolik yuz berdi');
    }
  };

  // ─── Delete User ───
  const deleteUser = async (user: any) => {
    if (!confirm(`"${user.username}" foydalanuvchisini o'chirishni tasdiqlaysizmi?`)) return;
    try {
      await adminAPI.deleteUser(user.id);
      toast.success('Foydalanuvchi o\'chirildi');
      fetchUsers();
    } catch (e) {
      toast.error('Foydalanuvchini o\'chirishda xatolik');
    }
  };

  // ─── Toggle Blacklist ───
  const toggleBlacklist = async (user: any) => {
    try {
      await adminAPI.updateUser(user.id, { is_blacklisted: !user.is_blacklisted });
      toast.success(user.is_blacklisted ? 'Qora ro\'yxatdan chiqarildi' : 'Qora ro\'yxatga qo\'shildi');
      fetchUsers();
    } catch (e) {
      toast.error('Xatolik yuz berdi');
    }
  };

  // ─── Quick Balance Adjust ───
  const [balanceAdjust, setBalanceAdjust] = useState<{ userId: number | null; amount: string }>({ userId: null, amount: '' });
  // ─── Bulk Fragment Sync (barcha mijozlar) ───
  const startBulkSync = async () => {
    if (bulkSyncing) return;
    if (!confirm("Barcha mijozlarning ismi, rasmi va Premium holati Fragment API'dan yangilanadi. Davom etasizmi?")) return;
    try {
      const res = await adminAPI.post('/admin/users/fragment-sync-all/', {});
      if (res.data.status === 'already_running') {
        toast.error('Ommaviy sinxronlash allaqachon ishlamoqda');
        return;
      }
      setBulkSyncing(true);
      setBulkStatus({ running: true, total: res.data.total || 0, updated: 0, failed: 0, skipped: 0 });
      toast.success(`${res.data.total || 0} ta mijoz Fragment'dan sinxronlanmoqda...`);
      // Jarayon tugaguncha 3 soniyada bir holatni so'raymiz
      bulkPollRef.current = setInterval(async () => {
        try {
          const st = await adminAPI.get('/admin/users/fragment-sync-status/');
          setBulkStatus(st.data);
          if (typeof st.data?.running === 'boolean' && !st.data.running) {
            if (bulkPollRef.current) clearInterval(bulkPollRef.current);
            bulkPollRef.current = null;
            setBulkSyncing(false);
            toast.success(`Sinxronlash tugadi: ${st.data.updated ?? 0} yangilandi, ${st.data.failed ?? 0} xato, ${st.data.skipped ?? 0} o'tkazib yuborildi`);
            fetchUsers();
          }
        } catch (e) {
          if (bulkPollRef.current) clearInterval(bulkPollRef.current);
          bulkPollRef.current = null;
          setBulkSyncing(false);
          toast.error('Sinxronlash holatini olishda xatolik');
        }
      }, 3000);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Sinxronlashni boshlashda xatolik');
    }
  };

  const adjustBalance = async (userId: number) => {
    const user = users.find(u => u.id === userId);
    if (!user || !balanceAdjust.amount) return;
    const newBalance = Number(user.balance) + Number(balanceAdjust.amount);
    try {
      await adminAPI.updateUser(userId, { balance: newBalance });
      toast.success(`Balans ${Number(balanceAdjust.amount) > 0 ? '+' : ''}${Number(balanceAdjust.amount).toLocaleString()} so'm o'zgartirildi`);
      setBalanceAdjust({ userId: null, amount: '' });
      fetchUsers();
    } catch (e) {
      toast.error('Xatolik');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Foydalanuvchilar boshqaruvi</h1>
          <p className="text-sm text-[#64748B]">To'liq foydalanuvchi boshqaruvi: yaratish, tahrirlash, o'chirish</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={startBulkSync}
            disabled={bulkSyncing}
            className="glow-btn-outline flex items-center gap-2 px-5 py-2.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <FiRefreshCw className={`w-4 h-4 ${bulkSyncing ? 'animate-spin' : ''}`} />
            {bulkSyncing ? 'Sinxronlanmoqda...' : 'Fragment sinxronlash'}
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="glow-btn flex items-center gap-2 px-5 py-2.5 text-sm"
          >
            <FiPlus className="w-4 h-4" />
            Yangi foydalanuvchi
          </button>
        </div>
      </div>

      {/* Bulk sync progress bar */}
      {bulkSyncing && bulkStatus && (
        <div className="glass-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-[#00F5FF] flex items-center gap-2">
              <FiRefreshCw className="w-3.5 h-3.5 animate-spin" />
              Fragment sinxronlash jarayoni
            </p>
            <p className="text-[10px] text-[#64748B]">
              {bulkStatus.updated} yangilandi · {bulkStatus.failed} xato · {bulkStatus.skipped} o'tkazib yuborildi
            </p>
          </div>
          <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#00F5FF] to-[#A855F7] transition-all duration-500"
              style={{ width: `${bulkStatus.total ? Math.min(((bulkStatus.updated + bulkStatus.failed + bulkStatus.skipped) / bulkStatus.total) * 100, 100) : 0}%` }}
            />
          </div>
          <p className="text-[10px] text-[#64748B] mt-1.5">{bulkStatus.updated + bulkStatus.failed + bulkStatus.skipped} / {bulkStatus.total} bajarildi</p>
        </div>
      )}

      {/* Create Form */}
      <AnimatePresence>
        {showCreateForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="glass-card p-6 overflow-hidden"
          >
            <h3 className="text-lg font-bold text-white mb-4">Yangi foydalanuvchi yaratish</h3>
            <p className="text-xs text-[#94A3B8] mb-4 leading-relaxed">
              Platforma faqat <b>Telegram orqali</b> ishlaydi — login/parol o'chirilgan.
              Foydalanuvchi hisobi birinchi Telegram kirishida avtomatik yaratiladi.
              Bu yerda faqat uning <b>Telegram ID</b> si bilan yozuv oldindan tayyorlash mumkin.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-[#64748B] block mb-1">Username</label>
                <input type="text" value={createForm.username}
                  onChange={e => setCreateForm({ ...createForm, username: e.target.value })}
                  className="glass-input text-sm" placeholder="username" />
              </div>
              <div>
                <label className="text-xs text-[#64748B] block mb-1">Telegram ID (majburiy)</label>
                <input type="text" value={createForm.telegram_id}
                  onChange={e => setCreateForm({ ...createForm, telegram_id: e.target.value })}
                  className="glass-input text-sm" placeholder="123456789" />
              </div>
              <div>
                <label className="text-xs text-[#64748B] block mb-1">Email (ixtiyoriy)</label>
                <input type="email" value={createForm.email}
                  onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  className="glass-input text-sm" placeholder="email@example.com" />
              </div>
              <div>
                <label className="text-xs text-[#64748B] block mb-1">Rol</label>
                <select value={createForm.role}
                  onChange={e => setCreateForm({ ...createForm, role: e.target.value })}
                  className="glass-input text-sm">
                  {Object.entries(roleLabels).map(([key, label]) => (
                    <option key={key} value={key} className="bg-[#0F172A]">{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-[#64748B] block mb-1">Telefon</label>
                <input type="text" value={createForm.phone}
                  onChange={e => setCreateForm({ ...createForm, phone: e.target.value })}
                  className="glass-input text-sm" placeholder="+998901234567" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={createUser} className="glow-btn text-sm px-6 py-2.5 flex items-center gap-2">
                <FiSave className="w-4 h-4" /> Yaratish
              </button>
              <button onClick={() => setShowCreateForm(false)} className="glow-btn-outline text-sm px-6 py-2.5">
                Bekor qilish
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search & Filter */}
      <div className="glass-card p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <form onSubmit={handleSearch} className="relative flex-1">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <input
              type="text"
              placeholder="Qidirish (username, email, telefon)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="glass-input pl-10 py-3 text-sm"
            />
          </form>
          <div className="flex gap-2 items-center">
            <FiFilter className="w-4 h-4 text-[#64748B]" />
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value)}
              className="glass-input text-sm py-3 w-40"
            >
              <option value="">Barcha rollar</option>
              {Object.entries(roleLabels).map(([key, label]) => (
                <option key={key} value={key} className="bg-[#0F172A]">{label}</option>
              ))}
            </select>
            <button onClick={fetchUsers} className="p-3 rounded-lg bg-white/5 text-[#64748B] hover:text-[#00F5FF] transition-all">
              <FiRefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Users List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="loading-spinner" /></div>
      ) : (
        <div className="space-y-3">
          {users.map((user: any, i: number) => (
            <motion.div
              key={user.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.02 }}
              className="glass-card overflow-hidden"
            >
              {/* Main Row */}
              <div className="p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="relative flex-shrink-0">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center text-lg font-bold text-[#00F5FF] overflow-hidden">
                        {user.avatar_url ? (
                          <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          user.username?.charAt(0).toUpperCase()
                        )}
                      </div>
                      {user.is_telegram_premium && (
                        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-br from-[#229ED9] to-[#2AABEE] border-2 border-[#0F172A] flex items-center justify-center text-[8px]" title="Telegram Premium">⭐</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-semibold text-white truncate">
                          {user.first_name || user.username}
                        </h3>
                        {user.is_telegram_premium && (
                          <span className="px-1.5 py-0.5 rounded-md bg-[#2AABEE]/15 text-[#2AABEE] border border-[#2AABEE]/25 text-[9px] font-semibold">⭐ PREMIUM</span>
                        )}
                        {user.is_blacklisted && <FiXCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                        {user.is_active === false && <span className="text-xs text-red-400 flex-shrink-0">(Bloklangan)</span>}
                      </div>
                      {/* Fragment getInfo'dan olingan ma'lumotlar */}
                      <div className="flex items-center gap-3 mt-1 flex-wrap text-xs">
                        <span className="text-[#00F5FF]/90 font-medium">@{user.telegram_username || user.username || '—'}</span>
                        {user.first_name && user.first_name !== user.username && (
                          <span className="text-[#64748B]">Ism: {user.first_name}</span>
                        )}
                        {user.telegram_id && (
                          <span className="text-[#64748B] flex items-center gap-1">
                            <FiShield className="w-3 h-3" /> ID: {user.telegram_id}
                          </span>
                        )}
                        {user.language_code && (
                          <span className="text-[#64748B]">🌐 {user.language_code.toUpperCase()}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        <span className="text-xs text-[#64748B] flex items-center gap-1">
                          <FiMail className="w-3 h-3" /> {user.email}
                        </span>
                        {user.phone && (
                          <span className="text-xs text-[#64748B] flex items-center gap-1">
                            <FiPhone className="w-3 h-3" /> {user.phone}
                          </span>
                        )}
                        {user.fragment_synced_at && (
                          <span className="text-[10px] text-sky-500/80 flex items-center gap-1" title="Fragment API oxirgi sinxronlash">
                            <FiRefreshCw className="w-3 h-3" /> Fragment: {fmtDate(user.fragment_synced_at)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${roleColors[user.role] || 'bg-white/5 text-[#64748B]'}`}>
                      {roleLabels[user.role] || user.role}
                    </span>
                    <span className="text-xs text-[#94A3B8] font-medium">
                      {Number(user.balance || 0).toLocaleString()} so'm
                    </span>
                  </div>
                </div>

                {/* User Stats Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                  <div className="p-2.5 rounded-xl bg-white/[0.03] text-center">
                    <p className="text-sm font-bold text-white">{user.orders_count ?? '-'}</p>
                    <p className="text-[10px] text-[#64748B]">Buyurtmalar</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.03] text-center">
                    <p className="text-sm font-bold text-white">{user.referrals_count ?? '0'}</p>
                    <p className="text-[10px] text-[#64748B]">Referallar</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.03] text-center">
                    <p className="text-sm font-bold text-white">{fmtDay(user.created_at)}</p>
                    <p className="text-[10px] text-[#64748B]">Ro'yxat</p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-white/[0.03] text-center">
                    <p className="text-sm font-bold text-white">{fmtDay(user.last_login)}</p>
                    <p className="text-[10px] text-[#64748B]">Oxirgi kirish</p>
                  </div>
                </div>

                {/* Quick Actions Row */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-white/5">
                  <button onClick={() => setProfileUser(user)} className="p-2 rounded-lg bg-[#00F5FF]/10 text-[#00F5FF] hover:bg-[#00F5FF]/20 transition-all text-xs flex items-center gap-1">
                    <FiActivity className="w-3 h-3" /> Profil
                  </button>
                  <button onClick={() => openEdit(user)} className="p-2 rounded-lg bg-white/5 text-[#94A3B8] hover:text-[#00F5FF] hover:bg-white/10 transition-all text-xs flex items-center gap-1">
                    <FiEdit2 className="w-3 h-3" /> Tahrirlash
                  </button>
                  <button onClick={() => toggleBlacklist(user)} className={`p-2 rounded-lg transition-all text-xs flex items-center gap-1 ${
                    user.is_blacklisted ? 'bg-green-500/10 text-green-400 hover:bg-green-500/20' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                  }`}>
                    <FiShield className="w-3 h-3" /> {user.is_blacklisted ? 'Qora ro\'yxatdan chiqarish' : 'Bloklash'}
                  </button>
                  <button onClick={() => setBalanceAdjust({ userId: user.id, amount: '' })} className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20 transition-all text-xs flex items-center gap-1">
                    <FiDollarSign className="w-3 h-3" /> Balans
                  </button>
                  <button onClick={async () => {
                    try {
                      await adminAPI.post(`/admin/users/${user.id}/fragment-sync/`, {});
                      toast.success(`${user.telegram_username ? '@' + user.telegram_username : 'Foydalanuvchi'} Fragment'dan yangilanmoqda...`);
                      setTimeout(fetchUsers, 3000);
                    } catch (e: any) {
                      toast.error(e.response?.data?.detail || 'Fragment sync xatosi');
                    }
                  }} className="p-2 rounded-lg bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition-all text-xs flex items-center gap-1">
                    <FiRefreshCw className="w-3 h-3" /> Fragment
                  </button>
                  <button onClick={() => {
                    navigator.clipboard.writeText(user.referral_code || '');
                    toast.success('Referral kod nusxalandi');
                  }} className="p-2 rounded-lg bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 transition-all text-xs flex items-center gap-1">
                    <FiAward className="w-3 h-3" /> Ref: {user.referral_code || '-'}
                  </button>
                  {user.role !== 'super_admin' && (
                    <button onClick={() => deleteUser(user)} className="p-2 rounded-lg bg-white/5 text-[#64748B] hover:bg-red-500/10 hover:text-red-400 transition-all text-xs flex items-center gap-1 ml-auto">
                      <FiTrash2 className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => openEdit(user)}
                    className="p-2 rounded-lg bg-white/5 text-[#64748B] hover:text-[#00F5FF] transition-all ml-1"
                  >
                    <FiChevronDown className={`w-4 h-4 transition-transform ${editingUser?.id === user.id ? 'rotate-180' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Expanded Edit Panel */}
              <AnimatePresence>
                {editingUser?.id === user.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-white/5 overflow-hidden"
                  >
                    <div className="p-5 bg-white/[0.02]">
                      {/* Fragment getInfo ma'lumotlari (o'qish uchun) */}
                      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-4 mb-5">
                        <p className="text-xs font-semibold text-sky-400 mb-3 flex items-center gap-1.5">
                          <FiRefreshCw className="w-3.5 h-3.5" /> Fragment API ma'lumotlari
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div>
                            <p className="text-[10px] text-[#64748B]">Telegram Username</p>
                            <p className="text-white font-medium truncate">@{user.telegram_username || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">Telegram ID</p>
                            <p className="text-white font-medium truncate">{user.telegram_id || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">Ism (getInfo)</p>
                            <p className="text-white font-medium truncate">{user.first_name || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">Premium</p>
                            <p className="font-medium">
                              {user.is_telegram_premium
                                ? <span className="text-[#2AABEE]">⭐ Premium</span>
                                : <span className="text-[#64748B]">Yo'q</span>}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">Til</p>
                            <p className="text-white font-medium">{user.language_code?.toUpperCase() || '—'}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">Oxirgi sync</p>
                            <p className="text-white font-medium truncate">{fmtDate(user.fragment_synced_at)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">Keshbek</p>
                            <p className="text-white font-medium">{Number(user.cashback_balance || 0).toLocaleString()} so'm</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-[#64748B]">Referral kod</p>
                            <p className="text-white font-medium">{user.referral_code || '—'}</p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div>
                          <label className="text-xs text-[#64748B] block mb-1">Username</label>
                          <input type="text" value={editForm.username || ''}
                            onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                            className="glass-input text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-[#64748B] block mb-1">Email</label>
                          <input type="email" value={editForm.email || ''}
                            onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                            className="glass-input text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-[#64748B] block mb-1">Rol</label>
                          <select value={editForm.role || 'customer'}
                            onChange={e => setEditForm({ ...editForm, role: e.target.value })}
                            className="glass-input text-sm">
                            {Object.entries(roleLabels).map(([key, label]) => (
                              <option key={key} value={key} className="bg-[#0F172A]">{label}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs text-[#64748B] block mb-1">Telefon</label>
                          <input type="text" value={editForm.phone || ''}
                            onChange={e => setEditForm({ ...editForm, phone: e.target.value })}
                            className="glass-input text-sm" />
                        </div>
                        <div>
                          <label className="text-xs text-[#64748B] block mb-1">Balans (so'm)</label>
                          <input type="number" value={editForm.balance || 0}
                            onChange={e => setEditForm({ ...editForm, balance: e.target.value })}
                            className="glass-input text-sm" />
                        </div>
                        <div className="flex items-end gap-3">
                          <label className="flex items-center gap-2 p-3 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10 transition-all">
                            <input type="checkbox" checked={editForm.is_active !== false}
                              onChange={e => setEditForm({ ...editForm, is_active: e.target.checked })}
                              className="w-4 h-4 accent-[#00F5FF]" />
                            <span className="text-xs text-white">Faol</span>
                          </label>
                          <label className="flex items-center gap-2 p-3 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10 transition-all">
                            <input type="checkbox" checked={editForm.is_blacklisted || false}
                              onChange={e => setEditForm({ ...editForm, is_blacklisted: e.target.checked })}
                              className="w-4 h-4 accent-red-500" />
                            <span className="text-xs text-red-400">Qora ro'yxat</span>
                          </label>
                        </div>
                      </div>
                      <div className="flex gap-3 mt-4">
                        <button onClick={saveEdit} className="glow-btn text-xs px-5 py-2.5 flex items-center gap-2">
                          <FiSave className="w-3.5 h-3.5" /> Saqlash
                        </button>
                        <button onClick={() => setEditingUser(null)} className="glow-btn-outline text-xs px-5 py-2.5">
                          Yopish
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Balance Adjust Modal */}
              <AnimatePresence>
                {balanceAdjust.userId === user.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="border-t border-yellow-500/20 overflow-hidden"
                  >
                    <div className="p-5 bg-yellow-500/5">
                      <p className="text-xs text-[#64748B] mb-2">Balansni tuzatish (joriy: {Number(user.balance).toLocaleString()} so'm)</p>
                      <div className="flex gap-3">
                        <input type="number" placeholder="Misol: 50000 yoki -10000"
                          value={balanceAdjust.amount}
                          onChange={e => setBalanceAdjust({ ...balanceAdjust, amount: e.target.value })}
                          className="glass-input text-sm flex-1" />
                        <button onClick={() => adjustBalance(user.id)} className="glow-btn text-xs px-5 py-2.5">Tasdiqlash</button>
                        <button onClick={() => setBalanceAdjust({ userId: null, amount: '' })} className="glow-btn-outline text-xs px-5 py-2.5">Bekor</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
          {users.length === 0 && (
            <div className="text-center py-20 text-[#64748B]">
              <FiUser className="w-16 h-16 mx-auto mb-4 opacity-30" />
              <p>Foydalanuvchilar topilmadi</p>
              <p className="text-xs mt-2">Qidiruv so'rovini o'zgartirib ko'ring</p>
            </div>
          )}
        </div>
      )}

      {/* Full Profile Modal */}
      <AnimatePresence>
        {profileUser && (
          <AdminUserProfileModal user={profileUser} onClose={() => setProfileUser(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
