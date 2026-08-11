'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiImage } from 'react-icons/fi';
import { bannerAPI } from '@/lib/api';
import toast from 'react-hot-toast';

const bannerTypes = [
  { value: 'desktop', label: 'Desktop' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'popup', label: 'Popup' },
  { value: 'slider', label: 'Slider' },
  { value: 'announcement', label: "E'lon" },
];

export default function AdminBannersPage() {
  const [banners, setBanners] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ type: 'desktop', title: '', subtitle: '', image_url: '', link_url: '', is_active: true, start_date: '', end_date: '' });

  useEffect(() => {
    const fetchBanners = async () => {
      try {
        const res = await bannerAPI.list();
        setBanners(res.data.results || res.data);
      } catch (e) { console.error('Error:', e); }
      finally { setIsLoading(false); }
    };
    fetchBanners();
  }, []);

  const resetForm = () => {
    setForm({ type: 'desktop', title: '', subtitle: '', image_url: '', link_url: '', is_active: true, start_date: '', end_date: '' });
    setEditing(null);
  };

  const handleEdit = (banner: any) => {
    setEditing(banner);
    setForm({
      type: banner.type,
      title: banner.title || '',
      subtitle: banner.subtitle || '',
      image_url: banner.image_url,
      link_url: banner.link_url || '',
      is_active: banner.is_active,
      start_date: banner.start_date || '',
      end_date: banner.end_date || '',
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.image_url) { toast.error('Rasm URL manzili majburiy'); return; }
    try {
      if (editing) {
        await bannerAPI.update(editing.id, form);
        toast.success('Banner yangilandi');
      } else {
        await bannerAPI.create(form);
        toast.success('Banner yaratildi');
      }
      const res = await bannerAPI.list();
      setBanners(res.data.results || res.data);
      setShowForm(false);
      resetForm();
    } catch (e: any) { toast.error('Xatolik yuz berdi'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Bannerni o\'chirishni tasdiqlaysizmi?')) return;
    try {
      await bannerAPI.delete(id);
      toast.success('Banner o\'chirildi');
      setBanners((prev) => prev.filter((b) => b.id !== id));
    } catch (e) { toast.error('Xatolik yuz berdi'); }
  };

  const typeLabel = (type: string) => bannerTypes.find((t) => t.value === type)?.label || type;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Bannerlar</h1>
          <p className="text-sm text-[#64748B]">Banner, popup va e'lonlarni boshqarish</p>
        </div>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="glow-btn flex items-center gap-2 px-4 py-2.5 text-sm">
          <FiPlus className="w-4 h-4" /> Yangi banner
        </button>
      </div>

      {/* Form Modal */}
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
                <h2 className="text-xl font-bold text-white">{editing ? 'Bannerni tahrirlash' : 'Yangi banner'}</h2>
                <button onClick={() => setShowForm(false)} className="p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-white">
                  <FiX className="w-5 h-5" />
                </button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">Tur</label>
                  <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="glass-input">
                    {bannerTypes.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">Sarlavha</label>
                  <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="glass-input" placeholder="Masalan: Yangi yil aksiyasi!" maxLength={200} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">Tavsif (ixtiyoriy)</label>
                  <input type="text" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} className="glass-input" placeholder="Masalan: Barcha o'yinlarda 20% chegirma" maxLength={300} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">Rasm URL *</label>
                  <input type="url" value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} className="glass-input" placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#94A3B8] mb-2">Havola URL (ixtiyoriy)</label>
                  <input type="url" value={form.link_url} onChange={(e) => setForm({ ...form, link_url: e.target.value })} className="glass-input" placeholder="https://..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-[#94A3B8] mb-2">Boshlanish sanasi</label>
                    <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="glass-input" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[#94A3B8] mb-2">Tugash sanasi</label>
                    <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="glass-input" />
                  </div>
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
        <div className="grid grid-cols-1 gap-4">
          {banners.map((banner) => (
            <motion.div key={banner.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className={`glass-card p-6 flex items-center justify-between ${!banner.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center">
                  <FiImage className="w-8 h-8 text-[#00F5FF]" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{banner.title || typeLabel(banner.type)}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${banner.is_active ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
                      {banner.is_active ? 'Faol' : 'Faol emas'}
                    </span>
                  </div>
                  {banner.subtitle && <p className="text-xs text-[#94A3B8] mt-0.5 truncate max-w-md">{banner.subtitle}</p>}
                  <p className="text-xs text-[#64748B] mt-1 truncate max-w-md">{banner.image_url}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleEdit(banner)} className="p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00F5FF]">
                  <FiEdit2 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(banner.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-[#64748B] hover:text-red-400">
                  <FiTrash2 className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          ))}
          {banners.length === 0 && (
            <div className="text-center py-20 text-[#64748B]">
              <FiImage className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Bannerlar mavjud emas</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
