'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  FiUser, FiZap, FiSettings, FiRefreshCw, FiLogOut, FiSend, FiCheckCircle,
  FiXCircle, FiKey, FiMessageSquare, FiActivity, FiClock, FiAlertTriangle,
} from 'react-icons/fi';
import { cardpayAPI } from '@/lib/api';
import { validateCardNumber, isCardReady } from '@/lib/card';
import toast from 'react-hot-toast';
import { PageSkeleton } from '@/components/Skeleton';

const fmtUZS = (v: any) => Number(v || 0).toLocaleString('uz-UZ');

export default function AdminUserClientPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null); // { status, settings, api_id, api_id_set, api_hash_set, log }
  const [busy, setBusy] = useState(false);

  // ── Login wizard ──
  const [step, setStep] = useState<'idle' | 'phone' | 'code' | 'password'>('idle');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');

  // ── Settings form ──
  const [form, setForm] = useState<any>({});
  const [saving, setSaving] = useState(false);

  // ── API keys form ──
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');

  // ── Monitor check ──
  const [monitorCheck, setMonitorCheck] = useState<any>(null);
  const [checking, setChecking] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      const r = await cardpayAPI.userClientDetail();
      setData(r.data);
      setForm({
        monitor_chat_id: r.data.settings?.monitor_chat_id || '',
        report_chat_id: r.data.settings?.report_chat_id || '',
        payment_suspicious_limit: r.data.settings?.suspicious_limit ?? 500000,
        payment_timeout_minutes: r.data.settings?.timeout_minutes ?? 10,
        payment_unique_offset_max: r.data.settings?.offset_max ?? 999,
        payment_card_number: r.data.settings?.card_number || '',
        payment_card_holder: r.data.settings?.card_holder || '',
        payment_card_monitor_enabled: r.data.settings?.enabled ?? true,
      });
      if (r.data.status?.authorized) setStep('idle');
    } catch { toast.error('Ma\'lumot yuklanmadi'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const st = data?.status || {};
  const authorized = !!st.authorized;

  const doStart = async () => {
    if (!/^\+?[0-9]{7,15}$/.test(phone.trim())) {
      toast.error('Telefon raqam noto\'g\'ri — masalan +998901234567');
      return;
    }
    setBusy(true);
    try {
      const r = await cardpayAPI.userClientStart(phone.trim());
      if (r.data.ok) { setStep('code'); toast.success('Kod yuborildi — Telegram/SMS tekshiring'); }
      else toast.error(r.data.detail || 'Kod yuborilmadi');
    } catch { toast.error('Kod yuborilmadi'); } finally { setBusy(false); }
  };

  const doVerify = async () => {
    if (!code.trim()) { toast.error('Kodni kiriting'); return; }
    setBusy(true);
    try {
      const r = await cardpayAPI.userClientVerify(code.trim());
      if (r.data.ok) {
        toast.success('✅ Akkaunt kiritildi! Worker ishga tushmoqda...');
        setStep('idle'); setCode(''); await fetchAll();
      } else if (r.data.needs_password) {
        setStep('password'); toast('2FA — Telegram parolini kiriting');
      } else {
        toast.error(r.data.detail || 'Kod noto\'g\'ri');
      }
    } catch (e: any) {
      const d = e.response?.data || {};
      if (d.needs_password) {
        setStep('password');
        toast('2FA — Telegram parolini kiriting');
      } else if (d.detail) {
        toast.error(d.detail);
      } else {
        toast.error('Kod tekshirilmadi — birozdan so\'ng qayta urinib ko\'ring');
      }
    } finally { setBusy(false); }
  };

  const doPassword = async () => {
    if (!password) { toast.error('Parolni kiriting'); return; }
    setBusy(true);
    try {
      const r = await cardpayAPI.userClientPassword(password);
      if (r.data.ok) {
        toast.success('✅ 2FA tasdiqlandi!');
        setStep('idle'); setPassword(''); await fetchAll();
      } else toast.error(r.data.detail || 'Parol noto\'g\'ri');
    } catch { toast.error('Parol qabul qilinmadi'); } finally { setBusy(false); }
  };

  const doLogout = async () => {
    if (!confirm('Session o\'chirilsinmi? Worker to\'xtaydi.')) return;
    try { await cardpayAPI.userClientLogout(); toast.success('Chiqildi'); await fetchAll(); }
    catch { toast.error('Chiqib bo\'lmadi'); }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const r = await cardpayAPI.settingsSave(form);
      toast.success('Sozlamalar saqlandi');
      setForm((f: any) => ({ ...f, ...r.data }));
    } catch { toast.error('Saqlanmadi'); } finally { setSaving(false); }
  };

  const saveApiKeys = async () => {
    if (!apiId && !apiHash) { toast.error('Hech narsa kiritilmadi'); return; }
    setBusy(true);
    try {
      await cardpayAPI.userClientApiKeys({ telegram_api_id: apiId, telegram_api_hash: apiHash });
      toast.success('API kalitlar saqlandi');
      setApiId(''); setApiHash(''); await fetchAll();
    } catch { toast.error('Saqlanmadi'); } finally { setBusy(false); }
  };

  const checkMonitor = async () => {
    setChecking(true); setMonitorCheck(null);
    try {
      const r = await cardpayAPI.userClientMonitorCheck();
      setMonitorCheck(r.data);
    } catch { setMonitorCheck({ ok: false, detail: 'Tekshirish amalga oshmadi' }); }
    finally { setChecking(false); }
  };

  const restartWorker = async () => {
    try { await cardpayAPI.userClientRestart(); toast.success('Worker qayta ishga tushirilmoqda'); }
    catch { toast.error('Restart amalga oshmadi'); }
  };

  if (loading) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F5FF] to-[#A855F7] flex items-center justify-center">
              <FiUser className="w-5 h-5 text-[#0F172A]" />
            </span>
            User Client
          </h1>
        </div>
        <PageSkeleton />
      </div>
    );
  }

  const card = 'glass-card p-5';
  const label = 'text-xs font-semibold text-[#64748B] uppercase tracking-wider mb-2';
  const input = 'w-full px-3.5 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-[#64748B] focus:outline-none focus:border-[#00F5FF]/40 transition-colors';

  return (
    <div>
      {/* ═══ Header ═══ */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00F5FF] to-[#A855F7] flex items-center justify-center">
              <FiUser className="w-5 h-5 text-[#0F172A]" />
            </span>
            User Client
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            Karta to'lovlarini avtomatik tekshirish — hamma sozlamalar shu yerda
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${authorized
            ? 'bg-green-500/10 text-green-400 border-green-500/25'
            : 'bg-amber-500/10 text-amber-400 border-amber-500/25'}`}>
            {authorized ? '✅ KIRILGAN' : '❌ KIRILMAGAN'}
          </span>
          <span className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${st.worker_online
            ? 'bg-green-500/10 text-green-400 border-green-500/25'
            : 'bg-red-500/10 text-red-400 border-red-500/25'}`}>
            Worker: {st.worker_online ? 'ONLINE' : 'OFFLINE'}
          </span>
          <button onClick={fetchAll} className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-[#00F5FF] transition-all" title="Yangilash">
            <FiRefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ═══ Chap ustun ═══ */}

        {/* ── Akkaunt / Kirish ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={card}>
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
            <FiUser className="w-4 h-4 text-[#00F5FF]" /> Telegram akkaunt
          </h2>

          {authorized ? (
            <div>
              <div className="rounded-xl bg-green-500/10 border border-green-500/20 p-4 mb-4">
                <p className="text-green-400 font-semibold text-sm">✅ Kiritilgan</p>
                <p className="text-[#94A3B8] text-xs mt-1">
                  @{st.username || '—'} · {st.first_name || ''}
                </p>
                <p className="text-[#64748B] text-xs mt-1">ID: {st.user_id} · Tel: {st.phone ? `+${st.phone}` : '—'}</p>
              </div>
              <button onClick={doLogout} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/25 hover:border-red-500/50 transition-all text-sm font-semibold">
                <FiLogOut className="w-4 h-4" /> Chiqish
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {step === 'idle' && (
                <div>
                  <p className={label}>1️⃣ Telegram telefon raqamingiz (xalqaro format)</p>
                  <div className="flex gap-2">
                    <input
                      className={input} placeholder="+998901234567" value={phone}
                      onChange={(e) => setPhone(e.target.value)} />
                    <button onClick={doStart} disabled={busy}
                      className="px-4 py-2.5 rounded-xl bg-[#00F5FF]/15 hover:bg-[#00F5FF]/25 text-[#00F5FF] border border-[#00F5FF]/30 text-sm font-bold whitespace-nowrap transition-all disabled:opacity-50">
                      <FiSend className="w-4 h-4 inline mr-1" />{busy ? 'Yuborilmoqda...' : 'KOD OLISH'}
                    </button>
                  </div>
                  <p className="text-[#64748B] text-xs mt-2">Telegram bu raqamga tasdiqlash kodini yuboradi (SMS yoki Telegram ichida).</p>
                </div>
              )}
              {step === 'code' && (
                <div>
                  <p className={label}>2️⃣ Telegram'dan kelgan 5–6 xonali kod (5 raqamli bo'lsa ham to'g'ri)</p>
                  <div className="flex gap-2">
                    <input className={input} placeholder="000000" value={code}
                      onChange={(e) => setCode(e.target.value)} />
                    <button onClick={doVerify} disabled={busy}
                      className="px-4 py-2.5 rounded-xl bg-[#00F5FF]/15 hover:bg-[#00F5FF]/25 text-[#00F5FF] border border-[#00F5FF]/30 text-sm font-bold whitespace-nowrap transition-all disabled:opacity-50">
                      {busy ? 'Tekshirilmoqda...' : 'TASDIQLASH'}
                    </button>
                  </div>
                  <button onClick={() => setStep('phone')} className="text-xs text-[#64748B] hover:text-[#00F5FF] mt-2">← Kodga qaytish</button>
                </div>
              )}
              {step === 'password' && (
                <div>
                  <p className={label}>3️⃣ Akkauntda 2FA yoqilgan — Telegram parolini kiriting</p>
                  <div className="flex gap-2">
                    <input type="password" className={input} placeholder="Parol" value={password}
                      onChange={(e) => setPassword(e.target.value)} />
                    <button onClick={doPassword} disabled={busy}
                      className="px-4 py-2.5 rounded-xl bg-[#00F5FF]/15 hover:bg-[#00F5FF]/25 text-[#00F5FF] border border-[#00F5FF]/30 text-sm font-bold whitespace-nowrap transition-all disabled:opacity-50">
                      {busy ? 'Tekshirilmoqda...' : 'TASDIQLASH'}
                    </button>
                  </div>
                  <button onClick={() => { setStep('code'); setPassword(''); }} className="text-xs text-[#64748B] hover:text-[#00F5FF] mt-2">← Kodga qaytish</button>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* ── API kalitlar ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className={card}>
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
            <FiKey className="w-4 h-4 text-[#A855F7]" /> API kalitlar (my.telegram.org)
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[10px] text-[#64748B] uppercase">API ID</p>
              <p className="text-sm font-bold text-white mt-1">{data?.api_id_set ? data.api_id : '—'}</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[10px] text-[#64748B] uppercase">API HASH</p>
              <p className="text-sm font-bold text-white mt-1">{data?.api_hash_set ? '••••••••' : '—'}</p>
            </div>
          </div>
          <div className="space-y-2">
            <input className={input} placeholder="Telegram API ID (o'zgartirish uchun)" value={apiId} onChange={(e) => setApiId(e.target.value)} />
            <input className={input} placeholder="Telegram API HASH (o'zgartirish uchun)" value={apiHash} onChange={(e) => setApiHash(e.target.value)} />
          </div>
          <button onClick={saveApiKeys} disabled={busy}
            className="mt-3 px-4 py-2.5 rounded-xl bg-[#A855F7]/15 hover:bg-[#A855F7]/25 text-[#C084FC] border border-[#A855F7]/30 text-sm font-bold transition-all disabled:opacity-50">
            {busy ? 'Saqlanmoqda...' : 'Kalitlarni saqlash'}
          </button>
        </motion.div>

        {/* ═══ O'ng ustun ═══ */}

        {/* ── Sozlamalar ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={card}>
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
            <FiSettings className="w-4 h-4 text-[#00F5FF]" /> To'lov nazorati sozlamalari
          </h2>
          <div className="space-y-3">
            <div>
              <p className={label}>Monitor chat (bank xabarlari keladigan chat)</p>
              <input className={input} value={form.monitor_chat_id || ''}
                onChange={(e) => setForm({ ...form, monitor_chat_id: e.target.value })}
                placeholder="chat username yoki ID (masalan -1001234567890)" />
            </div>
            <div>
              <p className={label}>Hisobot chat (staff guruhi)</p>
              <input className={input} value={form.report_chat_id || ''}
                onChange={(e) => setForm({ ...form, report_chat_id: e.target.value })}
                placeholder="-100..." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={label}>Shubhali limit (so'm)</p>
                <input type="number" className={input} value={form.payment_suspicious_limit ?? 500000}
                  onChange={(e) => setForm({ ...form, payment_suspicious_limit: e.target.value })} />
              </div>
              <div>
                <p className={label}>Muddat (daqiqa)</p>
                <input type="number" className={input} value={form.payment_timeout_minutes ?? 10}
                  onChange={(e) => setForm({ ...form, payment_timeout_minutes: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className={label}>Noyob summa offseti (maks)</p>
                <input type="number" className={input} value={form.payment_unique_offset_max ?? 999}
                  onChange={(e) => setForm({ ...form, payment_unique_offset_max: e.target.value })} />
              </div>
              <div>
                <p className={label}>Karta raqami</p>
                <input className={`${input} ${form.payment_card_number ? (isCardReady(form.payment_card_number) ? 'border-green-500/40' : 'border-red-500/40') : ''}`}
                  value={form.payment_card_number || ''}
                  onChange={(e) => setForm({ ...form, payment_card_number: e.target.value })}
                  placeholder="8600 0000 0000 0000" />
                {(() => {
                  const c = validateCardNumber(form.payment_card_number || '');
                  if (c.status === 'empty') return null;
                  const ok = c.status === 'valid';
                  return (
                    <p className={`text-[11px] mt-1 flex items-center gap-1 ${ok ? 'text-green-400' : 'text-red-400'}`}>
                      {ok ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />} {c.hint}
                    </p>
                  );
                })()}
              </div>
            </div>
            <div>
              <p className={label}>Karta egasi</p>
              <input className={input} value={form.payment_card_holder || ''}
                onChange={(e) => setForm({ ...form, payment_card_holder: e.target.value })} />
            </div>
            {(() => {
              const c = validateCardNumber(form.payment_card_number || '');
              if (c.status === 'valid') return null;
              const isWarn = c.status === 'placeholder';
              return (
                <div className={`flex items-start gap-3 rounded-xl border p-3 ${isWarn
                  ? 'border-red-500/40 bg-red-500/10'
                  : 'border-amber-500/40 bg-amber-500/10'}`}>
                  <FiAlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${isWarn ? 'text-red-400' : 'text-amber-400'}`} />
                  <div>
                    <p className={`text-xs font-bold ${isWarn ? 'text-red-300' : 'text-amber-300'}`}>
                      {isWarn ? '🚨 TEST RAQAM — MIJOZGA YUBORISH MUMKIN EMAS!' : 'Karta hali tayyor emas'}
                    </p>
                    <p className="text-[11px] text-[#94A3B8] mt-0.5 leading-relaxed">{c.hint}</p>
                  </div>
                </div>
              );
            })()}
            <label className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3 cursor-pointer">
              <span className="text-sm text-[#94A3B8]">Monitor yoqilgan</span>
              <button onClick={() => setForm({ ...form, payment_card_monitor_enabled: !form.payment_card_monitor_enabled })}
                className={`w-11 h-6 rounded-full transition-colors relative ${form.payment_card_monitor_enabled ? 'bg-[#00F5FF]' : 'bg-white/10'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${form.payment_card_monitor_enabled ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </label>
          </div>
          <button onClick={saveSettings} disabled={saving}
            className="mt-4 px-4 py-2.5 rounded-xl bg-[#00F5FF]/15 hover:bg-[#00F5FF]/25 text-[#00F5FF] border border-[#00F5FF]/30 text-sm font-bold transition-all disabled:opacity-50">
            {saving ? 'Saqlanmoqda...' : 'Sozlamalarni saqlash'}
          </button>
        </motion.div>

        {/* ── Worker holati + log ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className={card}>
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
            <FiActivity className="w-4 h-4 text-[#10B981]" /> Worker holati
          </h2>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[10px] text-[#64748B] uppercase">So'nggi heartbeat</p>
              <p className="text-sm font-bold text-white mt-1">{st.last_heartbeat ? new Date(st.last_heartbeat).toLocaleTimeString('uz-UZ') : '—'}</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[10px] text-[#64748B] uppercase">Restartlar</p>
              <p className="text-sm font-bold text-white mt-1">{st.restarts ?? 0}</p>
            </div>
          </div>
          {st.last_error && (
            <div className="rounded-xl bg-red-500/10 border border-red-500/25 p-3 mb-4 flex items-start gap-2">
              <FiAlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-red-400 font-semibold">Oxirgi xato</p>
                <p className="text-xs text-[#94A3B8] mt-0.5">{st.last_error}</p>
              </div>
            </div>
          )}
          <button onClick={restartWorker}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#10B981]/10 hover:bg-[#10B981]/20 text-green-400 border border-[#10B981]/30 text-sm font-semibold transition-all">
            <FiRefreshCw className="w-4 h-4" /> Workerni qayta ishga tushirish
          </button>

          <p className={`${label} mt-5`}>Supervisor log (oxirgi 40)</p>
          <div className="rounded-xl bg-black/40 border border-white/10 p-3 max-h-56 overflow-y-auto font-mono text-[11px] leading-relaxed">
            {(data?.log || []).length ? data.log.map((l: string, i: number) => (
              <p key={i} className="text-[#64748B] whitespace-pre-wrap">{l}</p>
            )) : <p className="text-[#64748B]">Log bo'sh — supervisor ishlamayapti</p>}
          </div>
        </motion.div>

        {/* ── Monitor chat tekshirish ── */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className={`${card} lg:col-span-2`}>
          <h2 className="text-sm font-bold text-white flex items-center gap-2 mb-4">
            <FiMessageSquare className="w-4 h-4 text-[#F97316]" /> Monitor chat tekshirish
          </h2>
          <p className="text-xs text-[#64748B] mb-3">
            Hozirgi monitor chatni ({form.monitor_chat_id || '—'}) kiritilgan akkaunt orqali topishga harakat qiladi.
            Worker har 5 daqiqada chatni qayta aniqlaydi.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={checkMonitor} disabled={checking}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F97316]/10 hover:bg-[#F97316]/20 text-orange-400 border border-[#F97316]/30 text-sm font-bold transition-all disabled:opacity-50">
              <FiCheckCircle className="w-4 h-4" />{checking ? 'Tekshirilmoqda...' : 'Chatni tekshirish'}
            </button>
            {monitorCheck && (
              <div className={`flex-1 min-w-[240px] rounded-xl border p-3 ${monitorCheck.ok ? 'bg-green-500/10 border-green-500/25' : 'bg-red-500/10 border-red-500/25'}`}>
                {monitorCheck.ok ? (
                  <p className="text-xs text-green-400 font-semibold flex items-center gap-2">
                    <FiCheckCircle className="w-4 h-4" /> Topildi: <b>{monitorCheck.name}</b> (ID: {monitorCheck.resolved_id})
                  </p>
                ) : (
                  <p className="text-xs text-red-400 flex items-start gap-2">
                    <FiXCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span>{monitorCheck.detail}</span>
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
