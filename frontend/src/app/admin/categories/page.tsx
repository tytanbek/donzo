'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX } from 'react-icons/fi';
import { categoryAPI } from '@/lib/api';
import toast from 'react-hot-toast';

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', order_index: 0, is_active: true });

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await categoryAPI.list();
        setCategories(res.data.results || res.data);
      } catch (e) { console.error('Error:', e); }
      finally { setIsLoading(false); }
    };
    fetchCategories();
  }, []);

  const resetForm = () => {
    setForm({ name: '', slug: '', order_index: 0, is_active: true });
    setEditing(null);
  };

  const handleEdit = (cat: any) => {
    setEditing(cat);
    setForm({ name: cat.name, slug: cat.slug, order_index: cat.order_index || 0, is_active: cat.is_active });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error('Kategoriya nomi majburiy'); return; }
    try {
      if (editing) {
        await categoryAPI.update(editing.id, form);
        toast.success('Kategoriya yangilandi');
      } else {
        await categoryAPI.create(form);
        toast.success('Kategoriya yaratildi');
      }
      const res = await categoryAPI.list();
      setCategories(res.data.results || res.data);
      setShowForm(false);
      resetForm();
    } catch (e: any) { toast.error('Xatolik yuz berdi'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Kategoriyani o\'chirishni tasdiqlaysizmi?')) return;
    try {
      await categoryAPI.delete(id);
      toast.success('Kategoriya o\'chirildi');
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (e) { toast.error('Xatolik yuz berdi'); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Kategoriyalar</h1>
          <p className="text-sm text-[#64748B]">Xizmat kategoriyalarini boshqarish</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="glow-btn flex items-center gap-2 px-4 py-2.5 text-sm">
          <FiPlus className="w-4 h-4" /> Yangi kategoriya
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowForm(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="glass-card p-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white">{editing ? 'Tahrirlash' : 'Yangi kategoriya'}</h2>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-white">
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">Nomi *</label>
                  <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="glass-input" placeholder="Mobile Games" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">Slug</label>
                  <input type="text" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className="glass-input" placeholder="mobile-games" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">Tartib raqami</label>
                  <input type="number" value={form.order_index} onChange={(e) => setForm({ ...form, order_index: parseInt(e.target.value) || 0 })} className="glass-input" />
                </div>
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

      {/* List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="loading-spinner" /></div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <motion.div key={cat.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="glass-card p-6 flex items-center justify-between"
            >
              <div>
                <h3 className="font-semibold text-white">{cat.name}</h3>
                <p className="text-xs text-[#64748B] mt-1">{cat.slug}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleEdit(cat)} className="p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00F5FF]">
                  <FiEdit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(cat.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-[#64748B] hover:text-red-400">
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
