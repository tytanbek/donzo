'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiPackage, FiList,
  FiToggleLeft, FiToggleRight, FiImage, FiCheckCircle, FiInfo,
} from 'react-icons/fi';
import { serviceAPI, packageAPI, fieldAPI, categoryAPI } from '@/lib/api';
import toast from 'react-hot-toast';

// ── Yordamchilar ──────────────────────────────────────────────────────────
// field_name texnik kalit — oddiy foydalanuvchi yozmasin, label'dan avtomatik
const slugify = (s: string) =>
  (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

// ── Tur tipi ──────────────────────────────────────────────────────────────
type Pkg = { id?: number; _new?: boolean; name: string; price: number | string; currency: string };
type Fld = { id?: number; _new?: boolean; field_name: string; field_label: string; field_type: string; is_required: boolean };

const EMPTY_PKG: Pkg = { name: '', price: '', currency: 'UZS', _new: true };
const EMPTY_FLD: Fld = { field_name: '', field_label: '', field_type: 'text', is_required: false, _new: true };

export default function AdminServicesPage() {
  const [services, setServices] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null); // null = yangi
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [instruction, setInstruction] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [fields, setFields] = useState<Fld[]>([]);

  // ── Yuklash ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [servicesRes, categoriesRes] = await Promise.all([
          serviceAPI.list(),
          categoryAPI.list(),
        ]);
        setServices(servicesRes.data.results || servicesRes.data);
        setCategories(categoriesRes.data.results || categoriesRes.data);
      } catch (e) {
        console.error('Error:', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  // ── Formani ochish / yopish ──────────────────────────────────────────────
  const openCreate = () => {
    setEditingId(null);
    setName(''); setCategory(''); setImageUrl(''); setDescription(''); setInstruction('');
    setIsActive(true); setPackages([]); setFields([]);
    setShowForm(true);
  };

  const openEdit = async (service: any) => {
    setEditingId(service.id);
    // To'liq ma'lumot: BARCHA paketlar va maydonlar (admin detail endpoint)
    try {
      const res = await serviceAPI.adminDetail(service.id);
      const full = res.data;
      setName(full.name || '');
      setCategory(full.category?.toString() || '');
      setImageUrl(full.image_url || '');
      setDescription(full.description || '');
      setInstruction(full.instruction_text || '');
      setIsActive(full.is_active);
      setPackages((full.packages || []).map((p: any) => ({
        id: p.id, name: p.name, price: p.price ?? '', currency: p.currency || 'UZS',
      })));
      setFields((full.fields || []).map((f: any) => ({
        id: f.id, field_name: f.field_name, field_label: f.field_label,
        field_type: f.field_type, is_required: f.is_required,
      })));
      setShowForm(true);
    } catch (e) {
      toast.error("Xizmat ma'lumotlarini yuklashda xatolik");
    }
  };

  const closeForm = () => { setShowForm(false); setSaving(false); };

  // ── Paketlar ─────────────────────────────────────────────────────────────
  const addPackage = () => setPackages((prev) => [...prev, { ...EMPTY_PKG }]);
  const updatePackage = (i: number, patch: Partial<Pkg>) =>
    setPackages((prev) => prev.map((p, idx) => idx === i ? { ...p, ...patch } : p));
  const removePackage = (i: number) => setPackages((prev) => prev.filter((_, idx) => idx !== i));

  // ── Maydonlar ────────────────────────────────────────────────────────────
  const addField = () => setFields((prev) => [...prev, { ...EMPTY_FLD }]);
  const updateField = (i: number, patch: Partial<Fld>) =>
    setFields((prev) => prev.map((f, idx) => {
      if (idx !== i) return f;
      const next = { ...f, ...patch };
      // field_name texnik kalit — label'dan avtomatik (faqat yangi yoki bo'sh)
      if (next.field_name === slugify(f.field_label) || !next.field_name || f.field_name === '') {
        next.field_name = slugify(next.field_label);
      }
      return next;
    }));
  const removeField = (i: number) => setFields((prev) => prev.filter((_, idx) => idx !== i));

  // ── Saqlash ──────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!name.trim()) { toast.error('Xizmat nomini kiriting'); return; }
    if (!category) { toast.error('Kategoriya tanlang'); return; }
    const invalidPkg = packages.find((p) => !p.name.trim() || p.price === '' || Number(p.price) <= 0);
    if (invalidPkg) { toast.error('Har bir paket uchun nom va narx (0 dan katta) kiriting'); return; }

    setSaving(true);
    try {
      const data = {
        name: name.trim(),
        category: parseInt(category),
        image_url: imageUrl.trim() || null,
        description,
        instruction_text: instruction,
        is_active: isActive,
      };

      let savedId: number;
      if (editingId != null) {
        const res = await serviceAPI.update(editingId, data);
        savedId = editingId;
        toast.success('Xizmat saqlandi');
      } else {
        const res = await serviceAPI.create(data);
        savedId = res.data.id;
        toast.success('Xizmat yaratildi');
      }

      // ── Paketlarni saqlash ──
      // Formada TURGAN id'lar saqlanadi; formadan o'chirilganlar backend'dan ham o'chiriladi.
      const keptPkgIds = packages.filter((p) => p.id).map((p) => p.id) as number[];
      for (const pkg of packages) {
        const pkgData = {
          service: savedId,
          name: pkg.name.trim(),
          amount_label: pkg.name.trim(),
          price: Number(pkg.price),
          currency: pkg.currency || 'UZS',
          is_active: true,
        };
        if (pkg._new) await packageAPI.create(pkgData);
        else if (pkg.id) await packageAPI.update(pkg.id, pkgData);
      }
      // O'chirilganlarni tozalash
      const existingPkgIds = (await serviceAPI.adminDetail(savedId)).data.packages.map((p: any) => p.id);
      for (const pid of existingPkgIds) {
        if (!keptPkgIds.includes(pid)) { try { await packageAPI.delete(pid); } catch { /* allaqachon o'chirilgan */ } }
      }

      // ── Maydonlarni saqlash ──
      const keptFieldIds = fields.filter((f) => f.id).map((f) => f.id) as number[];
      for (const f of fields) {
        const fieldData = {
          service: savedId,
          field_name: slugify(f.field_label) || f.field_name || 'field',
          field_label: f.field_label.trim(),
          field_type: f.field_type,
          is_required: f.is_required,
          validation_regex: '',
        };
        if (f._new) await fieldAPI.create(fieldData);
        else if (f.id) await fieldAPI.update(f.id, fieldData);
      }
      const existingFieldIds = (await serviceAPI.adminDetail(savedId)).data.fields.map((f: any) => f.id);
      for (const fid of existingFieldIds) {
        if (!keptFieldIds.includes(fid)) { try { await fieldAPI.delete(fid); } catch { /* allaqachon o'chirilgan */ } }
      }

      // Ro'yxatni yangilash
      const res = await serviceAPI.list();
      setServices(res.data.results || res.data);
      closeForm();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Xatolik yuz berdi');
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Xizmatni o'chirishni tasdiqlaysizmi? Buyurtmalar buzilishi mumkin.")) return;
    try {
      await serviceAPI.delete(id);
      toast.success('Xizmat o\'chirildi');
      setServices((prev) => prev.filter((s) => s.id !== id));
    } catch (e) {
      toast.error('Xatolik yuz berdi (buyurtmalar bog\'liq bo\'lishi mumkin)');
    }
  };

  const toggleActive = async (service: any) => {
    try {
      await serviceAPI.update(service.id, { ...service, is_active: !service.is_active });
      setServices((prev) => prev.map((s) => s.id === service.id ? { ...s, is_active: !s.is_active } : s));
      toast.success(service.is_active ? 'Xizmat o\'chirildi (mijozlarga ko\'rinmaydi)' : 'Xizmat faollashtirildi');
    } catch (e) {
      toast.error('Xatolik yuz berdi');
    }
  };

  const catName = (id: number) => categories.find((c: any) => Number(c.id) === Number(id))?.name || '—';

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Xizmatlar</h1>
          <p className="text-sm text-[#64748B]">O'yin/xizmat, uning narxlari (paketlar) va buyurtma formasi maydonlarini boshqaring</p>
        </div>
        <button onClick={openCreate} className="glow-btn flex items-center gap-2 px-4 py-2.5 text-sm">
          <FiPlus className="w-4 h-4" /> Yangi xizmat
        </button>
      </div>

      {/* ═══════════ Forma (modal) ═══════════ */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center pt-12 pb-10 bg-black/60 backdrop-blur-sm overflow-y-auto"
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="w-full max-w-2xl mx-4"
            >
              <div className="glass-card p-8">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-xl font-bold text-white">
                    {editingId != null ? 'Xizmatni tahrirlash' : 'Yangi xizmat yaratish'}
                  </h2>
                  <button onClick={closeForm} className="p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-white transition-all">
                    <FiX className="w-5 h-5" />
                  </button>
                </div>

                {/* ── 1) Asosiy ma'lumot ── */}
                <div className="space-y-5">
                  <div>
                    <p className="text-xs font-bold text-[#00F5FF] uppercase tracking-wider mb-4">1. Asosiy ma'lumot</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#94A3B8] mb-2">Xizmat nomi *</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="glass-input" placeholder="Masalan: Mobile Legends" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#94A3B8] mb-2">Kategoriya *</label>
                        <select value={category} onChange={(e) => setCategory(e.target.value)} className="glass-input">
                          <option value="">Tanlang...</option>
                          {categories.map((cat: any) => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-[#94A3B8] mb-2">Rasm URL (o'yin logosi)</label>
                        <div className="flex items-center gap-3">
                          <input type="url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="glass-input flex-1" placeholder="https://example.com/game-logo.png" />
                          {imageUrl && (
                            <div className="w-12 h-12 rounded-xl bg-[#0F172A] overflow-hidden border border-[#00F5FF]/10 flex-shrink-0">
                              <img src={imageUrl} alt="preview" className="w-full h-full object-contain p-1" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-[#94A3B8] mb-2">Tavsif</label>
                        <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="glass-input min-h-[70px] resize-none" placeholder="Xizmat haqida qisqacha — mijozlarga ko'rinadi" />
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-[#94A3B8] mb-2">Buyurtma yo'riqnomasi</label>
                        <textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} className="glass-input min-h-[60px] resize-none" placeholder="Masalan: Game ID'ni profilingizdan topishingiz mumkin..." />
                      </div>
                      <div>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <button
                            onClick={() => setIsActive(!isActive)}
                            className={`w-12 h-6 rounded-full transition-colors duration-200 ${isActive ? 'bg-[#00F5FF]' : 'bg-[#374151]'}`}
                          >
                            <div className={`w-5 h-5 rounded-full bg-white transform transition-transform duration-200 ${isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                          <span className="text-sm text-[#94A3B8]">Faol (mijozlarga ko'rinadi)</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {/* ── 2) Paketlar (narxlar) ── */}
                  <div className="border-t border-white/5 pt-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs font-bold text-[#00F5FF] uppercase tracking-wider flex items-center gap-2">
                          <FiPackage className="w-4 h-4" /> 2. Paketlar (narxlar)
                        </p>
                        <p className="text-[11px] text-[#64748B] mt-1">Mijozga ko'rinadigan variantlar — masalan: 86 Diamond, 172 Diamond...</p>
                      </div>
                      <button onClick={addPackage} className="glow-btn-outline flex items-center gap-1.5 px-3 py-1.5 text-xs">
                        <FiPlus className="w-3 h-3" /> Paket qo'shish
                      </button>
                    </div>
                    <div className="space-y-2.5">
                      {packages.map((pkg, i) => (
                        <div key={pkg.id ?? `new-${i}`} className="glass-deep rounded-xl p-3.5 flex items-center gap-3">
                          <div className="flex-1">
                            <input
                              type="text"
                              placeholder="Nomi — masalan: 86 Diamond"
                              value={pkg.name}
                              onChange={(e) => updatePackage(i, { name: e.target.value })}
                              className="glass-input text-sm w-full"
                            />
                          </div>
                          <div className="w-36 flex-shrink-0">
                            <div className="relative">
                              <input
                                type="number"
                                min="0"
                                placeholder="Narx"
                                value={pkg.price}
                                onChange={(e) => updatePackage(i, { price: e.target.value })}
                                className="glass-input text-sm w-full pr-14"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[#64748B]">so'm</span>
                            </div>
                          </div>
                          <button onClick={() => removePackage(i)} className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all flex-shrink-0" title="Paketni o'chirish">
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {packages.length === 0 && (
                        <p className="text-sm text-[#64748B] text-center py-5 border border-dashed border-white/10 rounded-xl">
                          Paketlar yo'q — <button onClick={addPackage} className="text-[#00F5FF] underline">birinchi paketni qo'shing</button>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* ── 3) Forma maydonlari ── */}
                  <div className="border-t border-white/5 pt-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="text-xs font-bold text-[#00F5FF] uppercase tracking-wider flex items-center gap-2">
                          <FiList className="w-4 h-4" /> 3. Buyurtma formasi maydonlari
                        </p>
                        <p className="text-[11px] text-[#64748B] mt-1">Mijoz buyurtma berishda nimani kiritadi — masalan: Game ID, Server ID</p>
                      </div>
                      <button onClick={addField} className="glow-btn-outline flex items-center gap-1.5 px-3 py-1.5 text-xs">
                        <FiPlus className="w-3 h-3" /> Maydon qo'shish
                      </button>
                    </div>
                    <div className="space-y-2.5">
                      {fields.map((fld, i) => (
                        <div key={fld.id ?? `newf-${i}`} className="glass-deep rounded-xl p-3.5 flex items-center gap-3">
                          <div className="flex-1">
                            <input
                              type="text"
                              placeholder="Ko'rinadigan nom — masalan: Game ID"
                              value={fld.field_label}
                              onChange={(e) => updateField(i, { field_label: e.target.value })}
                              className="glass-input text-sm w-full"
                            />
                          </div>
                          <select
                            value={fld.field_type}
                            onChange={(e) => updateField(i, { field_type: e.target.value })}
                            className="glass-input text-sm w-28 flex-shrink-0"
                          >
                            <option value="text">Matn</option>
                            <option value="number">Raqam</option>
                            <option value="select">Tanlov</option>
                          </select>
                          <label className="flex items-center gap-1.5 text-xs text-[#94A3B8] flex-shrink-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={fld.is_required}
                              onChange={(e) => updateField(i, { is_required: e.target.checked })}
                              className="rounded border-gray-600"
                            />
                            Majburiy
                          </label>
                          <button onClick={() => removeField(i)} className="p-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all flex-shrink-0" title="Maydonni o'chirish">
                            <FiTrash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                      {fields.length === 0 && (
                        <p className="text-sm text-[#64748B] text-center py-5 border border-dashed border-white/10 rounded-xl">
                          Maydonlar yo'q — <button onClick={addField} className="text-[#00F5FF] underline">birinchi maydonni qo'shing</button>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Saqlash */}
                  <div className="flex gap-3 pt-4 border-t border-white/5">
                    <button onClick={handleSave} disabled={saving} className="glow-btn flex items-center gap-2 px-6 py-3 disabled:opacity-50">
                      {saving ? <span className="loading-spinner !w-4 !h-4" /> : <FiSave className="w-4 h-4" />}
                      {editingId != null ? 'Saqlash' : 'Yaratish'}
                    </button>
                    <button onClick={closeForm} className="glow-btn-outline px-6 py-3">Bekor qilish</button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══════════ Ro'yxat ═══════════ */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20"><div className="loading-spinner" /></div>
      ) : services.length === 0 ? (
        <div className="text-center py-20 text-[#64748B]">
          <FiPackage className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p>Xizmatlar yo'q</p>
          <button onClick={openCreate} className="glow-btn mt-5 inline-flex items-center gap-2 px-4 py-2.5 text-sm">
            <FiPlus className="w-4 h-4" /> Birinchi xizmatni yarating
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {services.map((service) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`glass-card p-6 ${!service.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  {service.image_url ? (
                    <div className="w-14 h-14 rounded-2xl bg-[#0F172A] overflow-hidden border border-[#00F5FF]/10 flex-shrink-0">
                      <img src={service.image_url} alt={service.name} className="w-full h-full object-contain p-1.5" loading="lazy" />
                    </div>
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00F5FF]/20 to-[#A855F7]/20 flex items-center justify-center text-[#00F5FF] font-bold text-lg flex-shrink-0">
                      {service.name?.charAt(0)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-bold text-white truncate">{service.name}</h3>
                      {!service.is_active && (
                        <span className="px-2 py-0.5 rounded-full bg-gray-500/20 text-gray-400 text-[10px]">Nofaol</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-[#64748B]">
                      <span className="text-[#00F5FF]/80">{catName(service.category)}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1"><FiPackage className="w-3 h-3" /> {service.packages_count || 0} paket</span>
                      {service.min_price != null && (
                        <>
                          <span>·</span>
                          <span>dan {Number(service.min_price).toLocaleString()} so'm</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => toggleActive(service)}
                    className="p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00F5FF] transition-all"
                    title={service.is_active ? "Mijozlardan yashirish" : "Faollashtirish"}
                  >
                    {service.is_active ? <FiToggleRight className="w-5 h-5 text-green-400" /> : <FiToggleLeft className="w-5 h-5" />}
                  </button>
                  <button onClick={() => openEdit(service)} className="p-2 rounded-lg hover:bg-white/5 text-[#64748B] hover:text-[#00F5FF] transition-all" title="Tahrirlash">
                    <FiEdit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(service.id)} className="p-2 rounded-lg hover:bg-red-500/10 text-[#64748B] hover:text-red-400 transition-all" title="O'chirish">
                    <FiTrash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
