'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPlus, FiEdit2, FiTrash2, FiSave, FiX, FiCreditCard, FiRefreshCw, FiZap, FiCheckCircle, FiAlertTriangle, FiInfo } from 'react-icons/fi';
import { cardpayAPI } from '@/lib/api';
import { cardDigits, validateCardNumber, isCardReady } from '@/lib/card';
import toast from 'react-hot-toast';

const fmt = (v: any) => {
  const n = Number(v || 0);
  return n.toLocaleString('uz-UZ', { maximumFractionDigits: 0 });
};

type Card = {
  id: number;
  card_number: string;
  card_tail: string;
  card_holder: string;
  bank_name: string;
  enabled: boolean;
  is_active: boolean;
  max_amount: string;
  max_transfers: number;
  total_amount: string;
  transfers_count: number;
  amount_usage_pct: number | null;
  transfer_usage_pct: number | null;
  is_exhausted: boolean;
  auto_reset_daily: boolean;
  period_started_at: string;
  last_switch_at: string | null;
  order_index: number;
};

const emptyForm = {
  card_number: '',
  card_holder: '',
  bank_name: '',
  max_amount: '',
  max_transfers: '',
  order_index: '',
  enabled: true,
  is_active: false,
  auto_reset_daily: true,
};

export default function AdminCardsPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [acting, setActing] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await cardpayAPI.cards();
      setCards(res.data.cards || []);
      setActiveCard(res.data.active_card || null);
    } catch (e) {
      console.error('Error:', e);
      toast.error('Kartalarni yuklashda xatolik');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setForm({ ...emptyForm });
    setEditing(null);
  };

  const handleEdit = (card: Card) => {
    setEditing(card);
    setForm({
      card_number: card.card_number,
      card_holder: card.card_holder,
      bank_name: card.bank_name,
      max_amount: card.max_amount,
      max_transfers: String(card.max_transfers),
      order_index: String(card.order_index),
      enabled: card.enabled,
      is_active: card.is_active,
      auto_reset_daily: card.auto_reset_daily,
    });
    setShowForm(true);
  };

  const handleSave = async () => {
    const digits = cardDigits(form.card_number);
    const check = validateCardNumber(digits);
    if (check.status === 'empty') { toast.error('Karta raqamini kiriting'); return; }
    if (check.status === 'placeholder') { toast.error('BU TEST RAQAM! Haqiqiy karta raqamini kiriting'); return; }
    if (check.status === 'invalid') { toast.error(check.hint); return; }

    const payload = {
      card_number: digits,
      card_holder: form.card_holder.trim(),
      bank_name: form.bank_name.trim(),
      max_amount: form.max_amount || 0,
      max_transfers: form.max_transfers || 0,
      order_index: Number(form.order_index) || 0,
      enabled: form.enabled,
      is_active: form.is_active,
      auto_reset_daily: form.auto_reset_daily,
    };
    setSaving(true);
    try {
      if (editing) {
        await cardpayAPI.updateCard(editing.id, payload);
        toast.success('Karta yangilandi');
      } else {
        await cardpayAPI.createCard(payload);
        toast.success('Yangi karta qo‘shildi');
      }
      setShowForm(false);
      resetForm();
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Saqlashda xatolik');
    } finally {
      setSaving(false);
    }
  };

  const handleActivate = async (card: Card) => {
    setActing(card.id);
    try {
      await cardpayAPI.activateCard(card.id);
      toast.success(`***${card.card_tail} faollashtirildi`);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Xatolik');
    } finally {
      setActing(null);
    }
  };

  const handleReset = async (card: Card) => {
    setActing(card.id);
    try {
      await cardpayAPI.resetCard(card.id);
      toast.success(`***${card.card_tail} hisoblagichlari tiklandi`);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Xatolik');
    } finally {
      setActing(null);
    }
  };

  const handleDelete = async (card: Card) => {
    if (!confirm(`***${card.card_tail} kartani o‘chirishni tasdiqlaysizmi?`)) return;
    setActing(card.id);
    try {
      await cardpayAPI.deleteCard(card.id);
      toast.success('Karta o‘chirildi');
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.detail || 'Xatolik');
    } finally {
      setActing(null);
    }
  };

  const ready = isCardReady(activeCard?.card_number || '');
  const anyExhausted = cards.some(c => c.is_exhausted);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Kartalar</h1>
          <p className="text-sm text-slate-400 mt-1">Operator kartalari, limitlar va avtomatik almashtirish</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm hover:opacity-90 transition"
        >
          <FiPlus /> YANGI KARTA
        </button>
      </div>

      {/* ── Foydalanish ko‘rsatmasi ── */}
      <div className="rounded-2xl border border-cyan-500/25 bg-gradient-to-br from-cyan-500/10 to-blue-600/10 p-5">
        <div className="flex items-center gap-2 mb-3">
          <FiInfo className="text-cyan-400" />
          <h2 className="text-white font-bold text-sm">Karta limitlari — qanday ishlaydi</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs text-slate-300 leading-relaxed">
          <div className="space-y-2">
            <p><b className="text-white">1. Limitlar.</b> Har kartaga <b className="text-cyan-300">maksimal summa</b> va <b className="text-cyan-300">maksimal o‘tkazmalar soni</b> belgilang (<b className="text-white">0 = cheksiz</b>). Bank xabari kelganda hisoblagichlar shu kartaga yoziladi.</p>
            <p><b className="text-white">2. Avtomatik almashtirish.</b> Karta limitga yetganda tizim <b className="text-emerald-300">avtomatik</b> keyingi kartaga o‘tadi — mijozlar buni sezmaydi, to‘lov ma’lumotlari yangi kartaga yangilanadi.</p>
            <p><b className="text-white">3. Navbat (order_index).</b> <b className="text-cyan-300">1</b> — birinchi ishlatiladi, <b className="text-cyan-300">2</b> — uning zaxirasi va h.k. Eng kichik raqamli karta avval faollashadi; limitga yetganda navbatdagi keyingisi o‘tadi. Bir xil raqam bo‘lsa — avval qo‘shilgan karta ustun.</p>
          </div>
          <div className="space-y-2">
            <p><b className="text-white">4. Kunlik tiklash.</b> <b className="text-cyan-300">auto_reset_daily</b> yoqilgan kartada hisoblagichlar har kuni <b className="text-white">yarim tunda (00:00)</b> nolga qaytadi — limitlar kunlik doirada ishlaydi. O‘chirilgan bo‘lsa, limitlar qo‘lda “Reset” tugmasigacha to‘planadi.</p>
            <p><b className="text-white">5. Karta aniqlash.</b> To‘lov qaysi kartaga kelgani bank xabaridagi <b className="text-white">💳 ***XXXX</b> oxirgi 4 raqam orqali aniqlanadi. Har bir karta raqami noyob bo‘lishi shart.</p>
            <p><b className="text-white">6. Faollashtirish.</b> “Faollashtirish” tugmasi yoki formadagi <b className="text-white">“Darhol faollashtirish”</b> — faqat bitta karta faol bo‘lishi mumkin. Faol karta mijozlarga ko‘rsatiladi.</p>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-cyan-500/20 text-[11px] text-slate-400">
          <b className="text-white">Tavsiya etilgan sozlash:</b> 1) asosiy kartani qo‘shing (order_index=1, limit belgilang) → 2) zaxira kartani qo‘shing (order_index=2) → 3) zaxiraga limit qo‘yib “Faollashtirish”ni bosing — asosiy limitga yetganda tizim avtomatik zaxiraga o‘tadi.
        </div>
      </div>

      {/* Active card banner */}
      <div className={`rounded-2xl border p-5 flex flex-wrap items-center gap-4 ${ready ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-red-500/40 bg-red-500/10'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${ready ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
            <FiCreditCard />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold">Faol karta: <span className="font-mono">***{activeCard?.card_tail || '—'}</span></span>
              {activeCard && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">Mijozlarga shu karta ko‘rsatilmoqda</span>}
            </div>
            <p className="text-sm text-slate-400 mt-0.5">
              {activeCard ? `${activeCard.card_holder || 'Egasiz'}${activeCard.bank_name ? ' · ' + activeCard.bank_name : ''}` : 'Hozircha faol karta yo‘q — yangi karta qo‘shing yoki mavjudini faollashtiring'}
            </p>
          </div>
        </div>
        {activeCard && !ready && (
          <div className="text-sm text-red-400 flex items-center gap-2 ml-auto">
            <FiAlertTriangle /> Diqqat: karta raqami to‘g‘ri emas yoki test raqam! Mijozlar xato kartaga pul o‘tkazishi mumkin.
          </div>
        )}
        {anyExhausted && !activeCard?.is_exhausted && (
          <div className="text-sm text-amber-400 flex items-center gap-2 ml-auto">
            <FiAlertTriangle /> Ba'zi kartalar limitga yetdi — avtomatik almashtirish tayyor.
          </div>
        )}
      </div>

      {/* Limits info strip */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4">
          <div className="flex items-center gap-2 text-slate-300 text-sm font-medium"><FiZap className="text-cyan-400" /> Limit qanday ishlaydi</div>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Har kartaga <b className="text-slate-200">maksimal summa</b> va <b className="text-slate-200">o‘tkazmalar soni</b> belgilang. Limitga yetganda tizim <b className="text-slate-200">avtomatik</b> keyingi kartaga o‘tadi.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4">
          <div className="flex items-center gap-2 text-slate-300 text-sm font-medium"><FiRefreshCw className="text-cyan-400" /> Kunlik tiklash</div>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            <b className="text-slate-200">Kunlik tiklash</b> yoqilgan kartalarda hisoblagichlar har kuni yarim tunda nolga qaytadi — limitlar kunlik doira uchun ishlaydi.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-4">
          <div className="flex items-center gap-2 text-slate-300 text-sm font-medium"><FiCheckCircle className="text-emerald-400" /> To‘lovlar kartaga bog‘lanadi</div>
          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
            Bank xabaridagi <b className="text-slate-200">💳 ***XXXX</b> oxirgi 4 ta raqam orqali to‘lov qaysi kartaga kelgani aniqlanadi va shu karta hisobiga yoziladi.
          </p>
        </div>
      </div>

      {/* Cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-52 rounded-2xl border border-slate-700/60 bg-slate-800/40 animate-pulse" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-12 text-center">
          <FiCreditCard className="mx-auto text-4xl text-slate-600" />
          <p className="text-slate-300 font-medium mt-3">Hali karta qo‘shilmagan</p>
          <p className="text-sm text-slate-500 mt-1">Birinchi kartani qo‘shing — u avtomatik faol bo‘ladi</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map(card => {
            const cardReady = isCardReady(card.card_number);
            return (
              <div key={card.id} className={`rounded-2xl border p-5 space-y-4 ${card.is_active ? 'border-cyan-500/50 bg-gradient-to-b from-cyan-500/10 to-slate-800/40' : card.is_exhausted ? 'border-red-500/40 bg-slate-800/40' : 'border-slate-700/60 bg-slate-800/40'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${card.is_active ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-700/50 text-slate-400'}`}>
                      <FiCreditCard />
                    </div>
                    <div>
                      <div className="font-mono text-white font-semibold tracking-wider">***{card.card_tail}</div>
                      <div className="text-xs text-slate-400">{card.card_holder || 'Egasiz'}{card.bank_name ? ` · ${card.bank_name}` : ''}</div>
                    </div>
                  </div>
                  <div className="flex gap-1.5 items-center">
                    <span className="text-[10px] px-2 py-1 rounded-full bg-slate-700/40 text-slate-400 font-semibold" title="Navbat raqami — kichigi avval ishlatiladi">
                      #{card.order_index} {card.order_index === 1 ? '· 1-navbat' : ''}
                    </span>
                    {card.is_active ? (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-cyan-500/20 text-cyan-400 font-semibold">FAOL</span>
                    ) : card.is_exhausted ? (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-red-500/20 text-red-400 font-semibold">LIMITDA</span>
                    ) : (
                      <span className="text-[10px] px-2 py-1 rounded-full bg-slate-700/60 text-slate-300 font-semibold">{card.enabled ? 'FAOL EMAS' : 'O‘CHIRILGAN'}</span>
                    )}
                  </div>
                </div>

                {/* Amount usage */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Kelgan summa</span>
                    <span className="text-slate-200 font-medium">{fmt(card.total_amount)} / {Number(card.max_amount) > 0 ? fmt(card.max_amount) + ' so‘m' : 'cheksiz'}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${card.amount_usage_pct != null && card.amount_usage_pct >= 90 ? 'bg-red-500' : 'bg-cyan-500'}`}
                      style={{ width: `${card.amount_usage_pct ?? 0}%` }}
                    />
                  </div>
                  {card.amount_usage_pct != null && (
                    <div className="text-[10px] text-slate-500 mt-0.5">{card.amount_usage_pct}% ishlatilgan</div>
                  )}
                </div>

                {/* Transfer usage */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">O‘tkazmalar</span>
                    <span className="text-slate-200 font-medium">{card.transfers_count} / {card.max_transfers > 0 ? card.max_transfers : 'cheksiz'}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-700/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${card.transfer_usage_pct != null && card.transfer_usage_pct >= 90 ? 'bg-red-500' : 'bg-blue-500'}`}
                      style={{ width: `${card.transfer_usage_pct ?? 0}%` }}
                    />
                  </div>
                  {card.transfer_usage_pct != null && (
                    <div className="text-[10px] text-slate-500 mt-0.5">{card.transfer_usage_pct}% ishlatilgan</div>
                  )}
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{card.auto_reset_daily ? '🔄 Kunlik tiklash' : 'Tiklanmaydi'}</span>
                  {card.last_switch_at && <span>Oxirgi almashtirish: {new Date(card.last_switch_at).toLocaleDateString('uz-UZ')}</span>}
                </div>

                {!cardReady && !card.is_active && (
                  <div className="text-[11px] text-red-400 flex items-center gap-1"><FiAlertTriangle /> Test/noto‘g‘ri raqam</div>
                )}

                <div className="flex items-center gap-2 pt-2 border-t border-slate-700/50">
                  {!card.is_active && (
                    <button
                      onClick={() => handleActivate(card)}
                      disabled={acting === card.id}
                      className="flex-1 text-xs px-3 py-2 rounded-lg bg-cyan-500/15 text-cyan-400 font-semibold hover:bg-cyan-500/25 transition disabled:opacity-50"
                    >
                      Faollashtirish
                    </button>
                  )}
                  <button
                    onClick={() => handleReset(card)}
                    disabled={acting === card.id}
                    title="Hisoblagichlarni tiklash"
                    className="text-xs px-3 py-2 rounded-lg bg-slate-700/40 text-slate-300 hover:bg-slate-700/60 transition disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <FiRefreshCw className="text-sm" /> Reset
                  </button>
                  <button
                    onClick={() => handleEdit(card)}
                    disabled={acting === card.id}
                    title="Tahrirlash"
                    className="text-xs px-3 py-2 rounded-lg bg-slate-700/40 text-slate-300 hover:bg-slate-700/60 transition disabled:opacity-50"
                  >
                    <FiEdit2 />
                  </button>
                  <button
                    onClick={() => handleDelete(card)}
                    disabled={acting === card.id}
                    title="O‘chirish"
                    className="text-xs px-3 py-2 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition disabled:opacity-50"
                  >
                    <FiTrash2 />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Form modal */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#131B2E] border border-slate-700/60 rounded-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-white">{editing ? 'Kartani tahrirlash' : 'Yangi karta'}</h2>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-white transition"><FiX /></button>
              </div>

              <div>
                <label className="block text-sm text-slate-300 mb-1">Karta raqami *</label>
                <input
                  value={form.card_number}
                  onChange={e => setForm({ ...form, card_number: e.target.value })}
                  placeholder="8600 1234 5678 9012"
                  className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-white font-mono text-sm outline-none focus:border-cyan-500/60"
                />
                {form.card_number && (
                  <p className={`text-xs mt-1 ${isCardReady(form.card_number) ? 'text-emerald-400' : 'text-red-400'}`}>
                    {validateCardNumber(form.card_number).hint}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Karta egasi</label>
                  <input
                    value={form.card_holder}
                    onChange={e => setForm({ ...form, card_holder: e.target.value })}
                    placeholder="DONZO PAYMENT"
                    className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-white text-sm outline-none focus:border-cyan-500/60"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Bank</label>
                  <input
                    value={form.bank_name}
                    onChange={e => setForm({ ...form, bank_name: e.target.value })}
                    placeholder="Xalq Banki / Kapitalbank..."
                    className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-white text-sm outline-none focus:border-cyan-500/60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Maksimal summa (so‘m)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.max_amount}
                    onChange={e => setForm({ ...form, max_amount: e.target.value })}
                    placeholder="0 = cheksiz"
                    className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-white text-sm outline-none focus:border-cyan-500/60"
                  />
                  <p className="text-[11px] text-slate-500 mt-0.5">0 bo‘lsa — cheksiz</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Maksimal o‘tkazmalar soni</label>
                  <input
                    type="number"
                    min={0}
                    value={form.max_transfers}
                    onChange={e => setForm({ ...form, max_transfers: e.target.value })}
                    placeholder="0 = cheksiz"
                    className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-white text-sm outline-none focus:border-cyan-500/60"
                  />
                  <p className="text-[11px] text-slate-500 mt-0.5">0 bo‘lsa — cheksiz</p>
                </div>
                <div>
                  <label className="block text-sm text-slate-300 mb-1">Navbat (order_index)</label>
                  <input
                    type="number"
                    min={0}
                    value={form.order_index}
                    onChange={e => setForm({ ...form, order_index: e.target.value })}
                    placeholder="1"
                    className="w-full rounded-lg bg-slate-900/60 border border-slate-700 px-3 py-2 text-white text-sm outline-none focus:border-cyan-500/60"
                  />
                  <p className="text-[11px] text-slate-500 mt-0.5">1 — birinchi ishlatiladi, 2 — keyingi zaxira…</p>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.enabled}
                    onChange={e => setForm({ ...form, enabled: e.target.checked })}
                    className="accent-cyan-500"
                  />
                  Karta faol
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.auto_reset_daily}
                    onChange={e => setForm({ ...form, auto_reset_daily: e.target.checked })}
                    className="accent-cyan-500"
                  />
                  Kunlik tiklash
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                    className="accent-cyan-500"
                  />
                  Darhol faollashtirish
                </label>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-50"
                >
                  <FiSave /> {saving ? 'Saqlanmoqda...' : 'SAQLASH'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-600 text-slate-300 text-sm hover:bg-slate-700/40 transition"
                >
                  Bekor qilish
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
