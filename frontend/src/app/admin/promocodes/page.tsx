'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiPercent, FiDollarSign, FiCalendar, FiCheck, FiCopy, FiSearch, FiTag } from 'react-icons/fi';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';

export default function AdminPromoCodesPage() {
  const [promocodes, setPromocodes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<string>('all');

  const [form, setForm] = useState({
    code: '',
    description: '',
    discount_type: 'percentage',
    discount_value: 10,
    max_discount_amount: '',
    min_order_amount: 0,
    max_uses: 0,
    max_uses_per_user: 1,
    is_active: true,
    starts_at: '',
    expires_at: '',
  });

  const fetchCodes = async () => {
    setIsLoading(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (filterActive !== 'all') params.is_active = filterActive === 'active';
      const res = await axios.get(`${API_BASE}/admin/promocodes/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
        params,
      });
      setPromocodes(res.data.results || res.data);
    } catch (e) { console.error(e); }
    finally { setIsLoading(false); }
  };

  useEffect(() => { fetchCodes(); }, [filterActive]);

  const resetForm = () => {
    setForm({
      code: '', description: '', discount_type: 'percentage', discount_value: 10,
      max_discount_amount: '', min_order_amount: 0, max_uses: 0, max_uses_per_user: 1,
      is_active: true, starts_at: '', expires_at: '',
    });
    setEditing(null);
  };

  const generateCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    setForm({ ...form, code });
  };

  const handleEdit = (item: any) => {
    setEditing(item);
    setForm({
      code: item.code,
      description: item.description || '',
      discount_type: item.discount_type,
      discount_value: item.discount_value,
      max_discount_amount: item.max_discount_amount || '',
      min_order_amount: item.min_order_amount || 0,
      max_uses: item.max_uses || 0,
      max_uses_per_user: item.max_uses_per_user || 1,
      is_active: item.is_active,
      starts_at: item.starts_at ? item.starts_at.slice(0, 16) : '',
      expires_at: item.expires_at ? item.expires_at.slice(0, 16) : '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) { toast.error('Kod majburiy'); return; }
    if (!form.discount_value || form.discount_value <= 0) { toast.error('Chegirma qiymati majburiy'); return; }

    const data: any = {
      code: form.code.toUpperCase(),
      description: form.description,
      discount_type: form.discount_type,
      discount_value: form.discount_type === 'percentage' ? Math.min(form.discount_value, 100) : form.discount_value,
      max_uses: form.max_uses,
      max_uses_per_user: form.max_uses_per_user,
      is_active: form.is_active,
      min_order_amount: form.min_order_amount,
    };

    if (form.max_discount_amount) data.max_discount_amount = form.max_discount_amount;
    if (form.starts_at) data.starts_at = new Date(form.starts_at).toISOString();
    if (form.expires_at) data.expires_at = new Date(form.expires_at).toISOString();

    try {
      const headers = { Authorization: `Bearer ${localStorage.getItem('access_token')}` };
      if (editing) {
        await axios.put(`${API_BASE}/admin/promocodes/${editing.id}/`, data, { headers });
        toast.success('Promo kod yangilandi');
      } else {
        await axios.post(`${API_BASE}/admin/promocodes/`, data, { headers });
        toast.success('Promo kod yaratildi');
      }
      fetchCodes();
      setShowForm(false);
      resetForm();
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Xatolik'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Promo kodni o'chirishni tasdiqlaysizmi?")) return;
    try {
      await axios.delete(`${API_BASE}/admin/promocodes/${id}/`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      });
      toast.success("Promo kod o'chirildi");
      fetchCodes();
    } catch (e) { toast.error('Xatolik'); }
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Kod nusxalandi');
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Promo Kodlar</h1>
          <p className="text-sm text-[#64748B]">Chegirma kodlarini boshqarish</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="glow-btn flex items-center gap-2 px-4 py-2.5 text-sm">
          <FiPlus className="w-4 h-4" /> Yangi promo kod
        </button>
      </div>

      {/* Form Modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="w-full max-w-lg mx-4" onClick={(e) => e.stopPropagation()}
            >
              <div className="glass-card p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">
                    {editing ? 'Promo Kodni Tahrirlash' : 'Yangi Promo Kod'}
                  </h2>
                  <button onClick={() => { setShowForm(false); resetForm(); }} className="p-2 rounded-lg hover:bg-white/5 text-[#64748B]">
                    <FiX className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-4">
                  {/* Code */}
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <label className="block text-sm font-medium text-[#94A3B8]">Kod *</label>
                      <button onClick={generateCode} className="text-xs text-[#00F5FF] hover:underline">
                        Avto-generatsiya
                      </button>
                    </div>
                    <input
                      type="text" value={form.code}
                      onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                      className="glass-input font-mono text-lg tracking-widest text-center uppercase"
                      placeholder="BONUS50"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#94A3B8] mb-2">Tavsif</label>
                    <input type="text" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="glass-input" placeholder="50% chegirma" />
                  </div>

                  {/* Discount Type */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setForm({ ...form, discount_type: 'percentage' })}
                      className={`p-4 rounded-2xl border text-center transition-all ${form.discount_type === 'percentage' ? 'border-[#00F5FF] bg-[#00F5FF]/10' : 'border-white/10 bg-white/5'}`}
                    >
                      <FiPercent className="w-5 h-5 mx-auto mb-1 text-[#00F5FF]" />
                      <span className="text-sm font-medium text-white">Foiz (%)</span>
                    </button>
                    <button
                      onClick={() => setForm({ ...form, discount_type: 'fixed' })}
                      className={`p-4 rounded-2xl border text-center transition-all ${form.discount_type === 'fixed' ? 'border-[#A855F7] bg-[#A855F7]/10' : 'border-white/10 bg-white/5'}`}
                    >
                      <FiDollarSign className="w-5 h-5 mx-auto mb-1 text-[#A855F7]" />
                      <span className="text-sm font-medium text-white">Maxsus (so'm)</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#94A3B8] mb-2">
                        {form.discount_type === 'percentage' ? 'Chegirma foizi' : 'Chegirma miqdori'}
                      </label>
                      <div className="relative">
                        <input
                          type="number" value={form.discount_value}
                          onChange={(e) => setForm({ ...form, discount_value: parseFloat(e.target.value) || 0 })}
                          className="glass-input pr-10"
                          min="0" max={form.discount_type === 'percentage' ? 100 : 999999999}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#64748B]">
                          {form.discount_type === 'percentage' ? '%' : "so'm"}
                        </span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#94A3B8] mb-2">Maks. chegirma (ixtiyoriy)</label>
                      <input type="number" value={form.max_discount_amount} onChange={(e) => setForm({ ...form, max_discount_amount: e.target.value })} className="glass-input" placeholder="100000" />
                    </div>
                  </div>

                  {/* Usage Limits */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#94A3B8] mb-2">Maks. foydalanish (0=cheksiz)</label>
                      <input type="number" value={form.max_uses} onChange={(e) => setForm({ ...form, max_uses: parseInt(e.target.value) || 0 })} className="glass-input" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#94A3B8] mb-2">Foyd./foydalanuvchi</label>
                      <input type="number" value={form.max_uses_per_user} onChange={(e) => setForm({ ...form, max_uses_per_user: parseInt(e.target.value) || 1 })} className="glass-input" />
                    </div>
                  </div>

                  {/* Dates */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-[#94A3B8] mb-2">Boshlanish sanasi</label>
                      <input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="glass-input" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#94A3B8] mb-2">Tugash sanasi</label>
                      <input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} className="glass-input" />
                    </div>
                  </div>

                  {/* Active Toggle */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <button
                      onClick={() => setForm({ ...form, is_active: !form.is_active })}
                      className={`w-12 h-6 rounded-full transition-colors ${form.is_active ? 'bg-[#00F5FF]' : 'bg-[#374151]'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transform transition-transform ${form.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-sm text-[#94A3B8]">Faol</span>
                  </label>

                  <button onClick={handleSave} className="glow-btn w-full flex items-center justify-center gap-2 py-3 mt-2">
                    <FiSave className="w-4 h-4" /> {editing ? 'Yangilash' : 'Yaratish'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filters */}
      <div className="glass-card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
            <input type="text" placeholder="Kod yoki tavsif bo'yicha qidirish..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && fetchCodes()}
              className="glass-input pl-10 py-3 text-sm"
            />
          </div>
          <div className="flex gap-2">
            {[{ value: 'all', label: 'Barchasi' }, { value: 'active', label: 'Faol' }, { value: 'inactive', label: 'Faol emas' }].map((f) => (
              <button key={f.value} onClick={() => setFilterActive(f.value)}
                className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${filterActive === f.value ? 'bg-[#00F5FF]/10 text-[#00F5FF] border border-[#00F5FF]/30' : 'bg-white/5 text-[#94A3B8] border border-white/10 hover:border-white/20'}`}
              >{f.label}</button>
            ))}
          </div>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-20"><div className="loading-spinner" /></div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {promocodes.map((item: any, i: number) => {
            const usesLeft = item.max_uses > 0 ? item.max_uses - item.current_uses : -1;
            const isExpired = item.expires_at && new Date(item.expires_at) < new Date();
            const isNotStarted = item.starts_at && new Date(item.starts_at) > new Date();
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className={`glass-card p-5 ${!item.is_active ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center">
                      <FiTag className="w-6 h-6 text-[#00F5FF]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-white font-mono tracking-wider">{item.code}</h3>
                        <button onClick={() => copyCode(item.code)} className="p-1 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00F5FF] transition-all">
                          <FiCopy className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-[#00F5FF] font-semibold">
                          {item.discount_type === 'percentage' ? `${item.discount_value}%` : `${Number(item.discount_value).toLocaleString()} so'm`}
                        </span>
                        {item.max_discount_amount && (
                          <span className="text-xs text-[#64748B]">Maks: {Number(item.max_discount_amount).toLocaleString()} so'm</span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-xs text-[#64748B] mt-0.5">{item.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="flex items-center gap-1.5">
                        {isExpired ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-500/10 text-red-400">Muddati tugagan</span>
                        ) : isNotStarted ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-500/10 text-yellow-400">Kutilmoqda</span>
                        ) : item.is_active ? (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-400">Faol</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-500/10 text-gray-400">O'chirilgan</span>
                        )}
                      </div>
                      <p className="text-xs text-[#64748B] mt-1">
                        {item.current_uses} / {item.max_uses > 0 ? item.max_uses : '∞'} foydalanilgan
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleEdit(item)} className="p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00F5FF]">
                        <FiEdit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(item.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-[#64748B] hover:text-red-400">
                        <FiTrash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
          {promocodes.length === 0 && (
            <div className="text-center py-20 text-[#64748B]">
              <FiTag className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Promo kodlar mavjud emas</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
