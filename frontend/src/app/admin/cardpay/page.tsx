'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiCreditCard, FiAlertTriangle, FiMessageSquare, FiSettings, FiRefreshCw,
  FiCheckCircle, FiXCircle, FiClock, FiUser, FiZap, FiToggleLeft, FiToggleRight, FiSave, FiActivity, FiSend
} from 'react-icons/fi';
import { cardpayAPI } from '@/lib/api';
import { validateCardNumber, isCardReady, cardDigits } from '@/lib/card';
import toast from 'react-hot-toast';

type TabKey = 'requests' | 'suspicious' | 'messages' | 'settings' | 'client';

const TABS: { key: TabKey; label: string; icon: React.ComponentType<any> }[] = [
  { key: 'requests', label: "So'rovlar", icon: FiCreditCard },
  { key: 'suspicious', label: 'Shubhali', icon: FiAlertTriangle },
  { key: 'messages', label: 'Xabarlar', icon: FiMessageSquare },
  { key: 'settings', label: 'Sozlamalar', icon: FiSettings },
  { key: 'client', label: 'User Client', icon: FiUser },
];

const REQ_STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Kutilmoqda', cls: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
  paid: { label: "To'landi", cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
  expired: { label: "Muddati o'tgan", cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  cancelled: { label: 'Bekor qilingan', cls: 'bg-[#64748B]/10 text-[#94A3B8] border-white/10' },
};

const OUTCOME: Record<string, { label: string; cls: string }> = {
  matched: { label: '✅ Mos tushdi', cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
  suspicious: { label: '⚠️ Shubhali', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  no_match: { label: '❌ Mos emas', cls: 'bg-white/5 text-[#94A3B8] border-white/10' },
  duplicate: { label: '🔁 Takroriy', cls: 'bg-[#64748B]/10 text-[#94A3B8] border-white/10' },
};

const fmtUZS = (v: any) => Number(v || 0).toLocaleString();

const TAB_KEYS: TabKey[] = ['requests', 'suspicious', 'messages', 'settings', 'client'];

function getInitialTab(): TabKey {
  if (typeof window !== 'undefined') {
    const t = new URLSearchParams(window.location.search).get('tab') as TabKey | null;
    if (t && TAB_KEYS.includes(t)) return t;
  }
  return 'requests';
}

export default function AdminCardpayPage() {
  const [tab, setTabState] = useState<TabKey>(getInitialTab);

  // The SSR initial render ignores the URL param (window unavailable), so
  // re-read it after hydration — client-side navigations rely on this.
  useEffect(() => {
    const t = getInitialTab();
    if (t !== tab) setTabState(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tab state <-> URL (?tab=client) — lets links deep-open a section.
  const setTab = (t: TabKey) => {
    setTabState(t);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', t);
      window.history.replaceState(null, '', url.toString());
    }
  };
  const [statusFilter, setStatusFilter] = useState('pending');
  const [spFilter, setSpFilter] = useState('pending');
  const [requests, setRequests] = useState<any[]>([]);
  const [reqCounts, setReqCounts] = useState<any>({});
  const [suspicious, setSuspicious] = useState<any[]>([]);
  const [spCounts, setSpCounts] = useState<any>({});
  const [messages, setMessages] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<number | null>(null);
  // User client login wizard state
  const [ucStatus, setUcStatus] = useState<any>(null);
  const [ucPhone, setUcPhone] = useState('');
  const [ucCode, setUcCode] = useState('');
  const [ucPassword, setUcPassword] = useState('');
  const [ucStep, setUcStep] = useState<'idle' | 'phone' | 'code' | 'password'>('idle');
  const [ucBusy, setUcBusy] = useState(false);
  // Two-step confirm for the dangerous APPROVE action (credits real money)
  const [confirmApproveId, setConfirmApproveId] = useState<number | null>(null);

  const fetchUcStatus = useCallback(async () => {
    try {
      const r = await cardpayAPI.userClientStatus();
      setUcStatus(r.data);
      if (r.data?.authorized) setUcStep('idle');
      // Backend login holatini DB'da saqlaydi (daphne multi-worker) —
      // sahifa yangilansa ham kodni kiritish bosqichiga qaytamiz.
      else if (r.data?.login_pending && ucStep === 'idle') setUcStep('code');
    } catch { /* ignore */ }
  }, [ucStep]);

  const fetchStatus = useCallback(async () => {
    try { const r = await cardpayAPI.status(); setStatus(r.data); } catch { /* ignore */ }
  }, []);

  const fetchRequests = useCallback(async (st = statusFilter) => {
    setLoading(true);
    try {
      const r = await cardpayAPI.requests(st);
      setRequests(r.data.results || []);
      setReqCounts(r.data.counts || {});
    } catch (e) { toast.error('So\'rovlar yuklanmadi'); }
    finally { setLoading(false); }
  }, [statusFilter]);

  const fetchSuspicious = useCallback(async (st = spFilter) => {
    setLoading(true);
    try {
      const r = await cardpayAPI.suspicious(st);
      setSuspicious(r.data.results || []);
      setSpCounts(r.data.counts || {});
    } catch (e) { toast.error('Shubhali to\'lovlar yuklanmadi'); }
    finally { setLoading(false); }
  }, [spFilter]);

  const fetchMessages = useCallback(async () => {
    setLoading(true);
    try {
      const r = await cardpayAPI.messages({ limit: 60 });
      setMessages(r.data.results || []);
    } catch (e) { toast.error('Xabarlar yuklanmadi'); }
    finally { setLoading(false); }
  }, []);

  const fetchSettings = useCallback(async () => {
    try { const r = await cardpayAPI.settings(); setSettings(r.data); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchStatus();
    const t = setInterval(fetchStatus, 30000);
    return () => clearInterval(t);
  }, [fetchStatus]);

  useEffect(() => {
    fetchUcStatus();
    const t = setInterval(fetchUcStatus, 30000);
    return () => clearInterval(t);
  }, [fetchUcStatus]);

  useEffect(() => {
    if (tab === 'requests') fetchRequests();
    if (tab === 'suspicious') fetchSuspicious();
    if (tab === 'messages') fetchMessages();
    if (tab === 'settings') fetchSettings();
  }, [tab, fetchRequests, fetchSuspicious, fetchMessages, fetchSettings]);

  const handleSuspicious = async (id: number, action: 'approve' | 'reject', note = '') => {
    setActingId(id);
    try {
      if (action === 'approve') {
        await cardpayAPI.approveSuspicious(id);
        toast.success('Tasdiqlandi — balansga tushdi ✅');
      } else {
        await cardpayAPI.rejectSuspicious(id, note);
        toast.success('Rad etildi');
      }
      fetchSuspicious(); fetchStatus();
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Xatolik yuz berdi');
    } finally { setActingId(null); }
  };

  const saveSettings = async () => {
    try {
      await cardpayAPI.updateSettings(settings);
      toast.success('Sozlamalar saqlandi ✅');
      fetchSettings();
    } catch (e) { toast.error('Saqlashda xatolik'); }
  };

  const set = (key: string, value: any) => setSettings((s: any) => ({ ...s, [key]: value }));

  // ── User client login wizard handlers ──────────────────────────────
  const handleUcStart = async () => {
    if (!ucPhone.trim()) { toast.error('Telefon raqamni kiriting'); return; }
    setUcBusy(true);
    try {
      const r = await cardpayAPI.userClientStart(ucPhone.trim());
      const d = r.data || {};
      if (d.ok) {
        toast.success('Tasdiqlash kodi yuborildi — Telegram/SMS tekshiring');
        setUcStep('code');
        setUcCode('');
      } else {
        toast.error(d.detail || 'Kod yuborilmadi');
      }
    } catch (e: any) {
      const d = e.response?.data || {};
      if (d.already_authorized) {
        setUcStep('idle');
        toast.success('Akkaunt allaqachon kiritilgan');
        fetchUcStatus();
      } else {
        toast.error(d.detail || 'Xatolik');
      }
    }
    finally { setUcBusy(false); }
  };

  const handleUcVerify = async () => {
    if (!ucCode.trim()) { toast.error('Kodni kiriting'); return; }
    setUcBusy(true);
    try {
      const r = await cardpayAPI.userClientVerify(ucCode.trim());
      const d = r.data || {};
      if (d.ok) {
        toast.success('✅ Telegram akkauntga kirdik! User client ishga tushmoqda...');
        setUcStep('idle'); setUcCode(''); setUcPhone('');
        setTimeout(fetchUcStatus, 4000);
      } else if (d.needs_password) {
        setUcStep('password');
        toast('2FA parolni kiriting');
      } else {
        toast.error(d.detail || 'Kod noto‘g‘ri');
      }
    } catch (e: any) {
      const d = e.response?.data || {};
      if (d.needs_password) {
        setUcStep('password');
        toast('2FA parolni kiriting');
      } else {
        toast.error(d.detail || 'Xatolik');
      }
    }
    finally { setUcBusy(false); }
  };

  const handleUcPassword = async () => {
    if (!ucPassword) { toast.error('Parolni kiriting'); return; }
    setUcBusy(true);
    try {
      const r = await cardpayAPI.userClientPassword(ucPassword);
      const d = r.data || {};
      if (d.ok) {
        toast.success('✅ 2FA tasdiqlandi! User client ishga tushmoqda...');
        setUcStep('idle'); setUcPassword(''); setUcPhone('');
        setTimeout(fetchUcStatus, 4000);
      } else {
        toast.error(d.detail || 'Parol noto‘g‘ri');
      }
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Xatolik'); }
    finally { setUcBusy(false); }
  };

  const handleUcLogout = async () => {
    setUcBusy(true);
    try {
      const r = await cardpayAPI.userClientLogout();
      toast.success(r.data?.detail || 'Chiqildi');
      setUcStep('idle'); setUcPhone(''); setUcCode(''); setUcPassword('');
      setTimeout(fetchUcStatus, 2000);
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Xatolik'); }
    finally { setUcBusy(false); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FiCreditCard className="w-6 h-6 text-[#00F5FF]" />
            To'lov nazorati
          </h1>
          <p className="text-sm text-[#64748B]">
            Karta to'lovlarini avtomatik tekshirish — user client (Telethon)
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
            status?.listener_online
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-red-500/10 text-red-400 border-red-500/20'
          }`}>
            <FiActivity className="w-3.5 h-3.5" />
            User Client: {status?.listener_online ? 'ONLINE' : 'OFFLINE'}
          </span>
          <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
            status?.enabled
              ? 'bg-green-500/10 text-green-400 border-green-500/20'
              : 'bg-white/5 text-[#94A3B8] border-white/10'
          }`}>
            Monitor: {status?.enabled ? 'YOQILGAN' : "O'CHIRILGAN"}
          </span>
        </div>
      </div>

      {/* Today summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="glass-card p-4">
          <p className="text-2xl font-bold text-green-400">{status?.today?.paid ?? '—'}</p>
          <p className="text-xs text-[#64748B]">Bugungi to'lovlar</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-2xl font-bold gradient-text">{fmtUZS(status?.today?.total)}</p>
          <p className="text-xs text-[#64748B]">so'm jami bugun</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-2xl font-bold text-yellow-400">{status?.today?.pending ?? '—'}</p>
          <p className="text-xs text-[#64748B]">Kutilayotgan to'lovlar</p>
        </div>
        <div className="glass-card p-4">
          <p className="text-2xl font-bold text-amber-400">{status?.today?.suspicious_pending ?? '—'}</p>
          <p className="text-xs text-[#64748B]">Shubhali (kutilmoqda)</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-all ${
              tab === t.key
                ? 'bg-[#00F5FF]/10 text-[#00F5FF] border border-[#00F5FF]/30'
                : 'bg-white/5 text-[#94A3B8] border border-white/10 hover:border-white/20'
            }`}
          >
            <t.icon className="w-4 h-4" />
            {t.label}
            {t.key === 'suspicious' && (spCounts.pending > 0) && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                {spCounts.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

          {/* ═══ REQUESTS ═══ */}
          {tab === 'requests' && (
            <div>
              <div className="flex flex-wrap gap-2 mb-4">
                {['pending', 'paid', 'expired', 'cancelled'].map((s) => (
                  <button key={s} onClick={() => { setStatusFilter(s); fetchRequests(s); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${statusFilter === s ? 'bg-[#00F5FF]/10 text-[#00F5FF] border border-[#00F5FF]/30' : 'bg-white/5 text-[#94A3B8] border border-white/10'}`}
                  >
                    {REQ_STATUS[s]?.label} {reqCounts[s] ? `(${reqCounts[s]})` : ''}
                  </button>
                ))}
              </div>
              <div className="glass-card p-4">
                {loading ? <div className="p-10 text-center"><div className="loading-spinner mx-auto" /></div>
                : requests.length === 0 ? (
                  <div className="p-10 text-center text-[#64748B] text-sm">Bu holatda so'rovlar yo'q ✓</div>
                ) : (
                  <div className="space-y-3">
                    {requests.map((r: any) => (
                      <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-[#00F5FF]/10 flex items-center justify-center flex-shrink-0">
                            <FiCreditCard className="w-5 h-5 text-[#00F5FF]" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">
                              Yuborilishi kerak: <span className="text-[#00F5FF]">{fmtUZS(r.unique_amount)} so'm</span>
                              <span className="ml-2 text-xs font-normal text-[#64748B]">#{r.id}</span>
                            </p>
                            <p className="text-xs text-[#64748B]">
                              <FiUser className="w-3 h-3 inline mr-1" />
                              @{r.user?.telegram_username || r.user?.username || '—'} •
                              So'ralgan: {fmtUZS(r.requested_amount)} so'm •
                              {r.status === 'pending'
                                ? <> tugaydi: {new Date(r.expires_at).toLocaleString('uz-UZ')}</>
                                : new Date(r.created_at).toLocaleString('uz-UZ')}
                            </p>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${REQ_STATUS[r.status]?.cls || 'bg-white/10'}`}>
                          {REQ_STATUS[r.status]?.label || r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ SUSPICIOUS ═══ */}
          {tab === 'suspicious' && (
            <div>
              <div className="flex flex-wrap gap-2 mb-4">
                {['pending', 'approved', 'rejected'].map((s) => (
                  <button key={s} onClick={() => { setSpFilter(s); fetchSuspicious(s); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${spFilter === s ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' : 'bg-white/5 text-[#94A3B8] border border-white/10'}`}
                  >
                    {s === 'pending' ? 'Kutilmoqda' : s === 'approved' ? 'Tasdiqlangan' : 'Rad etilgan'} {spCounts[s] ? `(${spCounts[s]})` : ''}
                  </button>
                ))}
              </div>
              <div className="glass-card p-4 border-amber-500/20">
                <div className="flex items-start gap-3 mb-4">
                  <FiAlertTriangle className="w-5 h-5 text-amber-400 mt-0.5" />
                  <p className="text-xs text-[#64748B] leading-relaxed">
                    <b className="text-amber-400">Shubhali limitdan yuqori tushumlar balansga AVTOMATIK tushmaydi.</b>{' '}
                    Tasdiqlash tugmasini bosgandagina mijoz balansiga qo'shiladi. Rad etish — hech narsa o'zgarmaydi.
                  </p>
                </div>
                {loading ? <div className="p-10 text-center"><div className="loading-spinner mx-auto" /></div>
                : suspicious.length === 0 ? (
                  <div className="p-10 text-center text-[#64748B] text-sm">Shubhali to'lovlar yo'q ✓</div>
                ) : (
                  <div className="space-y-3">
                    {suspicious.map((sp: any) => (
                      <div key={sp.id} className="rounded-2xl bg-white/[0.03] border border-amber-500/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                              <FiAlertTriangle className="w-5 h-5 text-amber-400" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white">
                                {fmtUZS(sp.amount)} so'm
                                <span className="ml-2 text-xs font-normal text-[#64748B]">#{sp.id}</span>
                              </p>
                              <p className="text-xs text-[#64748B]">
                                @{sp.user?.telegram_username || sp.user?.username || '—'} • {new Date(sp.created_at).toLocaleString('uz-UZ')}
                              </p>
                              {sp.note && <p className="text-[11px] text-amber-400/80 mt-1">{sp.note}</p>}
                            </div>
                          </div>
                          {sp.status === 'pending' ? (
                            confirmApproveId === sp.id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] text-amber-400 font-medium">Haqiqatan tasdiqlaysizmi?</span>
                                <button onClick={() => { setConfirmApproveId(null); handleSuspicious(sp.id, 'approve'); }} disabled={actingId === sp.id}
                                  className="px-4 py-2 rounded-xl text-xs font-bold bg-green-500 text-white hover:bg-green-400 transition-all disabled:opacity-50">
                                  Ha, tasdiqlash
                                </button>
                                <button onClick={() => setConfirmApproveId(null)} disabled={actingId === sp.id}
                                  className="px-3 py-2 rounded-xl text-xs font-medium bg-white/5 text-[#94A3B8] border border-white/10 hover:bg-white/10 transition-all">
                                  Bekor
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <button onClick={() => setConfirmApproveId(sp.id)} disabled={actingId === sp.id}
                                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-all disabled:opacity-50 flex items-center gap-1.5">
                                  <FiCheckCircle className="w-3.5 h-3.5" /> Tasdiqlash
                                </button>
                                <button onClick={() => handleSuspicious(sp.id, 'reject')} disabled={actingId === sp.id}
                                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center gap-1.5">
                                  <FiXCircle className="w-3.5 h-3.5" /> Rad etish
                                </button>
                              </div>
                            )
                          ) : (
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${sp.status === 'approved' ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-red-500/10 text-red-400 border-red-500/20'}`}>
                              {sp.status === 'approved' ? '✅ Tasdiqlangan' : '❌ Rad etilgan'}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ MESSAGES ═══ */}
          {tab === 'messages' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs text-[#64748B]">Monitor chat'da aniqlangan oxirgi 60 xabar (dedup: chat+message id)</p>
                <button onClick={fetchMessages} className="glow-btn-outline flex items-center gap-2 px-3 py-1.5 text-xs">
                  <FiRefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Yangilash
                </button>
              </div>
              <div className="glass-card p-4">
                {loading ? <div className="p-10 text-center"><div className="loading-spinner mx-auto" /></div>
                : messages.length === 0 ? (
                  <div className="p-10 text-center text-[#64748B] text-sm">Xabarlar yo'q — user client ishga tushgach ko'rinadi</div>
                ) : (
                  <div className="space-y-2.5">
                    {messages.map((m: any) => (
                      <div key={m.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
                          <FiMessageSquare className="w-4 h-4 text-[#64748B]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-[#64748B] font-mono truncate">
                            [{m.chat_id}:{m.message_id}] {new Date(m.received_at).toLocaleString('uz-UZ')}
                          </p>
                          <p className="text-[11px] text-[#94A3B8] truncate mt-1">{m.raw_text || '—'}</p>
                          {m.parsed_amounts && (
                            <p className="text-[11px] text-[#00F5FF] mt-1">Summalar: {m.parsed_amounts}</p>
                          )}
                        </div>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-medium border whitespace-nowrap ${OUTCOME[m.outcome]?.cls || 'bg-white/5'}`}>
                          {OUTCOME[m.outcome]?.label || m.outcome}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ═══ USER CLIENT (Telethon login wizard) ═══ */}
          {tab === 'client' && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="glass-card p-5">
                <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <FiUser className="w-4 h-4 text-[#00F5FF]" /> Telegram akkauntga kirish
                </h2>
                <p className="text-xs text-[#64748B] mb-5">
                  User client sizning shaxsiy Telegram akkauntingiz bilan ishlaydi — karta to‘lov
                  xabarlarini kuzatib, balanslarni avtomatik to‘ldiradi.
                </p>

                {/* Status badges */}
                <div className="flex flex-wrap gap-2 mb-5">
                  <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                    ucStatus?.authorized
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {ucStatus?.authorized ? '✅ Kiritilgan' : '❌ Kiritilmagan'}
                  </span>
                  <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border flex items-center gap-1.5 ${
                    ucStatus?.worker_online
                      ? 'bg-green-500/10 text-green-400 border-green-500/20'
                      : 'bg-red-500/10 text-red-400 border-red-500/20'
                  }`}>
                    <FiActivity className="w-3.5 h-3.5" />
                    Worker: {ucStatus?.worker_online ? 'ONLINE' : 'OFFLINE'}
                  </span>
                  {ucStatus?.credentials === false && (
                    <span className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-red-500/10 text-red-400 border-red-500/20">
                      Kalitlar sozlanmagan — Kalitlar → telegram_api_id/hash
                    </span>
                  )}
                </div>

                {ucStatus?.authorized ? (
                  /* ── Logged in state ── */
                  <div className="rounded-2xl bg-white/[0.03] border border-green-500/20 p-5 text-center">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[#00F5FF]/15 to-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                      <FiCheckCircle className="w-8 h-8 text-emerald-400" />
                    </div>
                    <p className="text-lg font-bold text-white">
                      @{ucStatus?.username || ucStatus?.first_name || 'Akkaunt'}
                    </p>
                    {ucStatus?.phone && (
                      <p className="text-xs text-[#64748B] mt-1 font-mono">
                        {ucStatus.phone.replace(/.(?=.{3})/g, '*')}
                      </p>
                    )}
                    <p className="text-[11px] text-[#64748B] mt-3">
                      User client ishga tushgach, belgilangan chatdagi to‘lov xabarlarini
                      avtomatik kuzatadi. Saved Messages'ga <b>status</b> deb yozsangiz — hisobot chiqadi.
                    </p>
                    <button onClick={handleUcLogout} disabled={ucBusy}
                      className="mt-5 px-5 py-2.5 rounded-xl text-sm font-semibold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-all disabled:opacity-50">
                      Chiqish (sessionni o‘chirish)
                    </button>
                  </div>
                ) : (
                  /* ── Login wizard ── */
                  <div className="space-y-4">
                    {ucStep === 'idle' && (
                      <div>
                        <label className="text-xs text-[#94A3B8] block mb-1.5">
                          1️⃣ Telegram telefon raqamingiz (xalqaro format)
                        </label>
                        <div className="flex gap-2">
                          <input
                            value={ucPhone}
                            onChange={(e) => setUcPhone(e.target.value)}
                            placeholder="+998901234567"
                            inputMode="tel"
                            className="glass-input flex-1 text-sm font-mono"
                          />
                          <button
                            onClick={handleUcStart}
                            disabled={ucBusy || !ucPhone.trim()}
                            className="glow-btn px-5 text-sm disabled:opacity-50 flex items-center gap-2"
                          >
                            <FiSend className="w-4 h-4" />
                            {ucBusy ? 'Yuborilmoqda...' : 'Kod olish'}
                          </button>
                        </div>
                        <p className="text-[10px] text-[#64748B] mt-2">
                          Telegram bu raqamga tasdiqlash kodini yuboradi (SMS yoki Telegram ichida).
                        </p>
                      </div>
                    )}

                    {ucStep === 'code' && (
                      <div>
                        <label className="text-xs text-[#94A3B8] block mb-1.5">
                          2️⃣ Telegram‘dan kelgan 5–6 xonali kodni kiriting (5 raqamli bo‘lsa ham to‘g‘ri)
                        </label>
                        <div className="flex gap-2">
                          <input
                            value={ucCode}
                            onChange={(e) => setUcCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="123456"
                            inputMode="numeric"
                            maxLength={8}
                            autoFocus
                            className="glass-input flex-1 text-sm font-mono tracking-widest"
                          />
                          <button
                            onClick={handleUcVerify}
                            disabled={ucBusy || ucCode.length < 4}
                            className="glow-btn px-5 text-sm disabled:opacity-50 flex items-center gap-2"
                          >
                            <FiCheckCircle className="w-4 h-4" />
                            {ucBusy ? 'Tekshirilmoqda...' : 'Tasdiqlash'}
                          </button>
                        </div>
                        <button onClick={() => setUcStep('idle')}
                          className="text-[11px] text-[#64748B] hover:text-[#00F5FF] mt-2 transition-colors">
                          ← Raqamni o‘zgartirish
                        </button>
                      </div>
                    )}

                    {ucStep === 'password' && (
                      <div>
                        <label className="text-xs text-[#94A3B8] block mb-1.5">
                          3️⃣ Akkauntda 2FA yoqilgan — Telegram parolini kiriting
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            value={ucPassword}
                            onChange={(e) => setUcPassword(e.target.value)}
                            placeholder="••••••••"
                            autoFocus
                            className="glass-input flex-1 text-sm"
                          />
                          <button
                            onClick={handleUcPassword}
                            disabled={ucBusy || !ucPassword}
                            className="glow-btn px-5 text-sm disabled:opacity-50 flex items-center gap-2"
                          >
                            <FiCheckCircle className="w-4 h-4" />
                            {ucBusy ? 'Tekshirilmoqda...' : 'Kirish'}
                          </button>
                        </div>
                        <button onClick={() => setUcStep('code')}
                          className="text-[11px] text-[#64748B] hover:text-[#00F5FF] mt-2 transition-colors">
                          ← Kodga qaytish
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Worker info card */}
              <div className="glass-card p-5">
                <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <FiZap className="w-4 h-4 text-[#00F5FF]" /> Worker holati
                </h2>
                <p className="text-xs text-[#64748B] mb-5">
                  User client jarayoni (Telethon) — karta xabarlarini kuzatuvchi
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
                    <span className="text-xs text-[#64748B]">So‘nggi heartbeat</span>
                    <span className="text-xs font-mono text-[#94A3B8]">
                      {ucStatus?.last_heartbeat ? new Date(ucStatus.last_heartbeat).toLocaleString('uz-UZ') : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
                    <span className="text-xs text-[#64748B]">Restartlar</span>
                    <span className="text-xs font-mono text-[#94A3B8]">{ucStatus?.restarts ?? 0}</span>
                  </div>
                  {ucStatus?.last_error && (
                    <div className="rounded-xl bg-red-500/5 border border-red-500/20 px-4 py-3">
                      <p className="text-xs text-red-400 font-semibold mb-1">Oxirgi xato</p>
                      <p className="text-[11px] text-[#94A3B8] font-mono break-all">{ucStatus.last_error}</p>
                      {ucStatus.last_error_ts && (
                        <p className="text-[10px] text-[#64748B] mt-1">
                          {new Date(ucStatus.last_error_ts).toLocaleString('uz-UZ')}
                        </p>
                      )}
                    </div>
                  )}
                  <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-3">
                    <p className="text-xs text-[#64748B] leading-relaxed">
                      💡 Kirish muvaffaqiyatli bo‘lsa, user client <b>avtomatik</b> ishga tushadi
                      (supervisor nazoratida) va belgilangan chatdagi to‘lov xabarlarini kuzata boshlaydi.
                      To‘lov xabarlari keladigan chatni <b>Sozlamalar</b> bo‘limida belgilang.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SETTINGS ═══ */}
          {tab === 'settings' && settings && (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="glass-card p-5">
                <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <FiZap className="w-4 h-4 text-[#00F5FF]" /> Monitor sozlamalari
                </h2>
                <p className="text-xs text-[#64748B] mb-5">User client qaysi chatni kuzatadi va hisobotlarni qayerga yuboradi</p>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-[#94A3B8] block mb-1.5">To'lov xabarlari chat ID (bank-xabar guruhi)</label>
                    <input value={settings.monitor_chat_id || ''} onChange={(e) => set('monitor_chat_id', e.target.value)}
                      placeholder="-1001234567890 yoki @username" className="glass-input text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8] block mb-1.5">Hisobot guruhi ID (bot a'zo bo'lishi shart)</label>
                    <input value={settings.report_chat_id || ''} onChange={(e) => set('report_chat_id', e.target.value)}
                      placeholder="-1009876543210" className="glass-input text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[#94A3B8] block mb-1.5">Shubhali limit (so'm)</label>
                      <input type="number" value={settings.suspicious_limit ?? 500000} onChange={(e) => set('suspicious_limit', e.target.value)}
                        className="glass-input text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-[#94A3B8] block mb-1.5">To'lov vaqti (daqiqa)</label>
                      <input type="number" value={settings.timeout_minutes ?? 10} onChange={(e) => set('timeout_minutes', e.target.value)}
                        className="glass-input text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8] block mb-1.5">Unique summa offset (0..999)</label>
                    <input type="number" value={settings.offset_max ?? 999} onChange={(e) => set('offset_max', e.target.value)}
                      className="glass-input text-sm" />
                  </div>
                </div>
              </div>

              <div className="glass-card p-5">
                <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <FiCreditCard className="w-4 h-4 text-[#00F5FF]" /> Karta ma'lumotlari
                </h2>
                <p className="text-xs text-[#64748B] mb-5">Mijozga ko'rsatiladigan to'lov karta raqami</p>

                {(() => {
                  const check = validateCardNumber(settings.card_number || '');
                  const ready = check.status === 'valid';
                  if (ready) return null;
                  const isWarn = check.status === 'placeholder';
                  return (
                    <div className={`flex items-start gap-3 rounded-2xl border p-4 mb-5 ${isWarn
                      ? 'border-red-500/40 bg-red-500/10'
                      : 'border-amber-500/40 bg-amber-500/10'}`}>
                      <FiAlertTriangle className={`w-5 h-5 mt-0.5 shrink-0 ${isWarn ? 'text-red-400' : 'text-amber-400'}`} />
                      <div>
                        <p className={`text-sm font-bold ${isWarn ? 'text-red-300' : 'text-amber-300'}`}>
                          {isWarn ? '🚨 TEST RAQAM — MIJOZGA YUBORISH MUMKIN EMAS!' : 'Karta hali tayyor emas'}
                        </p>
                        <p className="text-xs text-[#94A3B8] mt-1 leading-relaxed">{check.hint}</p>
                        {isWarn && (
                          <p className="text-xs text-red-300/80 mt-1">
                            Mijozlar balans sahifasida aynan shu raqamni ko'radi — haqiqiy kartani kiritmaguningizcha to'lov xavfsiz emas.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-[#94A3B8] block mb-1.5">Karta raqami</label>
                    <input value={settings.card_number || ''} onChange={(e) => set('card_number', e.target.value)}
                      placeholder="8600 0000 0000 0000"
                      className={`glass-input text-sm font-mono ${settings.card_number ? (isCardReady(settings.card_number) ? 'border-green-500/40' : 'border-red-500/40') : ''}`} />
                    {(() => {
                      const c = validateCardNumber(settings.card_number || '');
                      if (c.status === 'empty') return null;
                      const ok = c.status === 'valid';
                      return (
                        <p className={`text-[11px] mt-1 flex items-center gap-1 ${ok ? 'text-green-400' : 'text-red-400'}`}>
                          {ok ? <FiCheckCircle className="w-3 h-3" /> : <FiXCircle className="w-3 h-3" />} {c.hint}
                        </p>
                      );
                    })()}
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8] block mb-1.5">Karta egasi (ixtiyoriy)</label>
                    <input value={settings.card_holder || ''} onChange={(e) => set('card_holder', e.target.value)}
                      placeholder="DONZO" className="glass-input text-sm" />
                  </div>

                  <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4">
                    <p className="text-[11px] text-[#64748B] uppercase tracking-wide mb-2">Mijoz ko'radigan ko'rinish</p>
                    <div className="rounded-xl bg-gradient-to-br from-[#0B1220] to-[#101B2E] border border-white/10 p-4 flex items-center justify-between">
                      <div>
                        <p className="font-mono text-lg font-bold text-white tracking-wider">
                          {cardDigits(settings.card_number || '').replace(/(\d{4})(?=\d)/g, '$1 ') || '0000 0000 0000 0000'}
                        </p>
                        <p className="text-xs text-[#94A3B8] mt-1">{settings.card_holder || 'Karta egasi'}</p>
                      </div>
                      <FiCreditCard className="w-6 h-6 text-[#00F5FF]/60" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between rounded-2xl bg-white/[0.03] border border-white/10 p-4 mt-2">
                    <div>
                      <p className="text-sm font-semibold text-white">Monitor yoqilgan</p>
                      <p className="text-xs text-[#64748B]">O'chirilsa, to'lovlar admin tasdiqlashida qoladi</p>
                    </div>
                    <button onClick={() => {
                      const next = !settings.enabled;
                      setSettings((s: any) => ({
                        ...s,
                        payment_card_monitor_enabled: next ? 'True' : 'False',
                        enabled: next,
                      }));
                    }}
                      className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${settings.enabled ? 'bg-[#00F5FF]/30 justify-end' : 'bg-white/10 justify-start'}`}>
                      <div className={`w-5 h-5 rounded-full transition-colors ${settings.enabled ? 'bg-[#00F5FF]' : 'bg-[#64748B]'}`} />
                    </button>
                  </div>

                  <button onClick={saveSettings} className="glow-btn w-full flex items-center justify-center gap-2 py-3">
                    <FiSave className="w-4 h-4" /> Saqlash
                  </button>
                  <p className="text-[11px] text-[#64748B] leading-relaxed">
                    💡 <b>User Client</b>ni ishga tushirish uchun: admin → Kalitlar →{' '}
                    <code className="text-[#00F5FF]">telegram_api_id / telegram_api_hash</code> (my.telegram.org) to'ldiring,
                    keyin <b>User Client</b> bo'limida telefon raqamingiz bilan kiring — kod
                    Telegram orqali keladi, session avtomatik saqlanadi va worker o'zi ishga tushadi.
                    Saved Messages'ga <b>status</b> deb yozsangiz — hisobot chiqadi.
                  </p>
                </div>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
