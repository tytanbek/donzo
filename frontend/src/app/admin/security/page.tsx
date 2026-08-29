'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FiShield, FiAlertTriangle, FiCheckCircle, FiXCircle, FiClock, FiUser,
  FiSettings, FiActivity, FiLock, FiMessageSquare, FiSend, FiRefreshCw,
  FiEye, FiEyeOff, FiFolder, FiCpu, FiSearch, FiZap, FiPauseCircle
} from 'react-icons/fi';
import { securityAPI } from '@/lib/api';
import toast from 'react-hot-toast';

type TabKey = 'dashboard' | 'incidents' | 'cases' | 'profiles' | 'settings' | 'copilot';

const TABS: { key: TabKey; label: string; icon: React.ComponentType<any> }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: FiActivity },
  { key: 'incidents', label: 'Incidents', icon: FiAlertTriangle },
  { key: 'cases', label: 'Cases', icon: FiFolder },
  { key: 'profiles', label: 'User Risk', icon: FiUser },
  { key: 'settings', label: 'Sozlamalar', icon: FiSettings },
  { key: 'copilot', label: 'AI Copilot', icon: FiCpu },
];

const RISK_COLOR: Record<string, string> = {
  LOW: 'text-green-400 bg-green-500/10 border-green-500/20',
  MEDIUM: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  HIGH: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  CRITICAL: 'text-red-400 bg-red-500/10 border-red-500/20',
};

const INC_STATUS: Record<string, { label: string; cls: string }> = {
  OPEN: { label: 'Ochiq', cls: 'bg-red-500/10 text-red-400 border-red-500/20' },
  ACKED: { label: 'Qabul qilingan', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
  INVESTIGATING: { label: 'Tekshirilmoqda', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
  RESOLVED: { label: 'Hal qilindi', cls: 'bg-green-500/10 text-green-400 border-green-500/20' },
  FALSE_POSITIVE: { label: 'Yolg\'on signal', cls: 'bg-[#64748B]/10 text-[#94A3B8] border-white/10' },
  CONFIRMED_FRAUD: { label: 'Firibgarlik', cls: 'bg-red-600/10 text-red-400 border-red-600/30' },
};

const fmtUZS = (v: any) => Number(v || 0).toLocaleString();

export default function AdminSecurityPage() {
  const [tab, setTab] = useState<TabKey>('dashboard');
  const [dashboard, setDashboard] = useState<any>(null);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [incCounts, setIncCounts] = useState<any>({});
  const [cases, setCases] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [incFilter, setIncFilter] = useState('OPEN');
  const [detail, setDetail] = useState<any>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [profileSearch, setProfileSearch] = useState('');
  const [copilotQ, setCopilotQ] = useState('');
  const [copilotChat, setCopilotChat] = useState<any[]>([]);
  const [copilotBusy, setCopilotBusy] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  const loadDashboard = useCallback(async () => {
    try { setDashboard((await securityAPI.dashboard()).data); } catch { /* ignore */ }
  }, []);

  const loadIncidents = useCallback(async (st = incFilter) => {
    setLoading(true);
    try {
      const r = await securityAPI.incidents({ status: st });
      setIncidents(r.data.results || []);
      setIncCounts(r.data.counts || {});
    } catch { toast.error('Incidentlar yuklanmadi'); }
    finally { setLoading(false); }
  }, [incFilter]);

  const loadCases = useCallback(async () => {
    try { setCases((await securityAPI.cases()).data.results || []); } catch { /* ignore */ }
  }, []);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    try {
      const r = await securityAPI.profiles({ search: profileSearch });
      setProfiles(r.data.results || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [profileSearch]);

  const loadSettings = useCallback(async () => {
    try { setSettings((await securityAPI.settings()).data); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadDashboard();
    const t = setInterval(loadDashboard, 30000);
    return () => clearInterval(t);
  }, [loadDashboard]);

  useEffect(() => {
    if (tab === 'dashboard') loadDashboard();
    if (tab === 'incidents') loadIncidents();
    if (tab === 'cases') loadCases();
    if (tab === 'profiles') loadProfiles();
    if (tab === 'settings') loadSettings();
  }, [tab, loadIncidents, loadCases, loadProfiles, loadSettings, loadDashboard]);

  const incidentAction = async (id: number, action: string) => {
    setActingId(id);
    try {
      await securityAPI.incidentAction(id, action, {});
      toast.success('Bajarildi ✅');
      loadIncidents(); loadDashboard();
      setDetail(null);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Xatolik');
    } finally { setActingId(null); }
  };

  const openDetail = async (id: number) => {
    try { setDetail((await securityAPI.incidentDetail(id)).data); } catch { /* ignore */ }
  };

  const profileAction = async (uid: number, action: string) => {
    try {
      await securityAPI.profileAction(uid, action);
      toast.success('Yangilandi');
      loadProfiles();
    } catch (e: any) { toast.error(e.response?.data?.detail || 'Xatolik'); }
  };

  const saveSettings = async () => {
    try {
      await securityAPI.updateSettings(settings);
      toast.success('Sozlamalar saqlandi ✅');
      loadSettings();
    } catch { toast.error('Saqlashda xatolik'); }
  };

  const set = (key: string, value: any) => setSettings((s: any) => ({ ...s, [key]: value }));

  const askCopilot = async () => {
    const q = copilotQ.trim();
    if (!q || copilotBusy) return;
    setCopilotBusy(true);
    const next = [...copilotChat, { role: 'user', text: q }];
    setCopilotChat(next);
    setCopilotQ('');
    try {
      const r = await securityAPI.copilot(q);
      setCopilotChat([...next, { role: 'ai', text: r.data.answer || '—' }]);
    } catch {
      setCopilotChat([...next, { role: 'ai', text: 'AI sozlanmagan — gemini_api_key kiriting.' }]);
    } finally {
      setCopilotBusy(false);
      setTimeout(() => chatRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
    }
  };

  const st = dashboard?.stats || {};
  const ai = dashboard?.ai || {};

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FiShield className="w-6 h-6 text-[#00F5FF]" />
            Security Center
          </h1>
          <p className="text-sm text-[#64748B]">AI anti-fraud · risk monitoring · incident ops</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${ai.reachable ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-white/5 text-[#94A3B8] border-white/10'}`}>
            <FiCpu className="w-3.5 h-3.5 inline mr-1" />
            Gemini: {ai.configured ? (ai.reachable ? 'ONLINE' : 'OFFLINE') : 'SOZLANMAGAN'}
          </span>
          {ai.shadow_mode && (
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-purple-500/10 text-purple-400 border-purple-500/20">
              <FiEye className="w-3.5 h-3.5 inline mr-1" /> SHADOW MODE
            </span>
          )}
          {ai.lockdown && (
            <span className="px-3 py-1.5 rounded-full text-xs font-semibold border bg-red-500/10 text-red-400 border-red-500/20">
              <FiLock className="w-3.5 h-3.5 inline mr-1" /> LOCKDOWN
            </span>
          )}
        </div>
      </div>

      {/* ═══ Tabs ═══ */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 whitespace-nowrap transition-all ${
              tab === t.key ? 'bg-[#00F5FF]/10 text-[#00F5FF] border border-[#00F5FF]/30'
                : 'bg-white/5 text-[#94A3B8] border border-white/10 hover:border-white/20'}`}>
            <t.icon className="w-4 h-4" /> {t.label}
            {t.key === 'incidents' && incCounts.OPEN > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold">{incCounts.OPEN}</span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>

          {/* ═══ DASHBOARD ═══ */}
          {tab === 'dashboard' && (
            <div>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3 mb-6">
                {[
                  { label: "Bugungi to'lovlar", value: st.payments_today ?? '—' },
                  { label: 'Jami hajm (so\'m)', value: fmtUZS(st.total_volume_today), grad: true },
                  { label: 'Tasdiqlangan', value: st.approved ?? '—', color: 'text-green-400' },
                  { label: 'Hold', value: st.hold ?? '—', color: 'text-yellow-400' },
                  { label: 'Shubhali', value: st.suspicious ?? '—', color: 'text-orange-400' },
                  { label: 'Bloklangan', value: st.blocked ?? '—', color: 'text-red-400' },
                  { label: 'AI unavailable', value: st.ai_unavailable ?? '—', color: 'text-purple-400' },
                  { label: "O'rtacha risk", value: st.avg_risk ?? '—', color: 'text-[#00F5FF]' },
                ].map((c) => (
                  <div key={c.label} className="glass-card p-3.5">
                    <p className={`text-xl font-bold ${c.grad ? 'gradient-text' : c.color || 'text-white'}`}>{c.value}</p>
                    <p className="text-[10px] text-[#64748B] mt-0.5">{c.label}</p>
                  </div>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="glass-card p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <FiAlertTriangle className="w-4 h-4 text-orange-400" /> Ochiq incidentlar
                    </h2>
                    <button onClick={loadDashboard} className="glow-btn-outline flex items-center gap-2 px-3 py-1.5 text-xs">
                      <FiRefreshCw className="w-3.5 h-3.5" /> Yangilash
                    </button>
                  </div>
                  <div className="flex gap-3 mb-4">
                    <div className="flex-1 rounded-2xl bg-orange-500/10 border border-orange-500/20 p-3 text-center">
                      <p className="text-2xl font-bold text-orange-400">{st.high_open ?? 0}</p>
                      <p className="text-[10px] text-[#64748B]">HIGH</p>
                    </div>
                    <div className="flex-1 rounded-2xl bg-red-500/10 border border-red-500/20 p-3 text-center">
                      <p className="text-2xl font-bold text-red-400">{st.critical_open ?? 0}</p>
                      <p className="text-[10px] text-[#64748B]">CRITICAL</p>
                    </div>
                  </div>
                  <div className="space-y-2.5">
                    {(dashboard?.recent_incidents || []).map((i: any) => (
                      <button key={i.id} onClick={() => { openDetail(i.id); setTab('incidents'); }}
                        className="w-full text-left rounded-2xl bg-white/[0.03] border border-white/10 hover:border-[#00F5FF]/30 p-3.5 transition-all">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${RISK_COLOR[i.severity]}`}>{i.severity}</span>
                            <span className="text-sm font-semibold text-white truncate">
                              {fmtUZS(i.amount)} so'm
                            </span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${INC_STATUS[i.status]?.cls || ''}`}>
                            {INC_STATUS[i.status]?.label || i.status}
                          </span>
                        </div>
                        <p className="text-[11px] text-[#64748B] mt-1.5 truncate">
                          @{i.user?.telegram_username || i.user?.username || '—'} • {new Date(i.created_at).toLocaleString('uz-UZ')} • Risk {i.risk_score}
                        </p>
                      </button>
                    ))}
                    {(dashboard?.recent_incidents || []).length === 0 && (
                      <p className="text-center text-[#64748B] text-sm py-6">Incidentlar yo'q ✓</p>
                    )}
                  </div>
                </div>

                <div className="glass-card p-5">
                  <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                    <FiActivity className="w-4 h-4 text-[#00F5FF]" /> Tizim holati
                  </h2>
                  <div className="space-y-3">
                    {[
                      { label: 'Gemini AI', ok: ai.reachable, detail: ai.configured ? 'Ishlayapti' : 'API kalit kutilmoqda' },
                      { label: 'Payment Listener', ok: true, detail: 'User client (Telethon)' },
                      { label: 'Rule Engine', ok: true, detail: 'Deterministik qoidalar' },
                      { label: 'Alert System', ok: true, detail: 'HIGH/CRITICAL' },
                      { label: 'Database', ok: true, detail: 'SQLite' },
                    ].map((r) => (
                      <div key={r.label} className="flex items-center justify-between rounded-2xl bg-white/[0.03] border border-white/10 p-3.5">
                        <div>
                          <p className="text-sm font-semibold text-white">{r.label}</p>
                          <p className="text-[11px] text-[#64748B]">{r.detail}</p>
                        </div>
                        <span className={`w-2.5 h-2.5 rounded-full ${r.ok ? 'bg-green-400' : 'bg-red-400'} animate-pulse`} />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-[#64748B] mt-4 leading-relaxed">
                    🤖 <b>AI observes and explains. Rules protect. Backend enforces. Humans control irreversible decisions.</b>
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ═══ INCIDENTS ═══ */}
          {tab === 'incidents' && (
            <div>
              <div className="flex flex-wrap gap-2 mb-4">
                {['OPEN', 'ACKED', 'INVESTIGATING', 'RESOLVED', 'FALSE_POSITIVE', 'CONFIRMED_FRAUD'].map((s) => (
                  <button key={s} onClick={() => { setIncFilter(s); loadIncidents(s); }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${incFilter === s ? 'bg-[#00F5FF]/10 text-[#00F5FF] border border-[#00F5FF]/30' : 'bg-white/5 text-[#94A3B8] border border-white/10'}`}>
                    {INC_STATUS[s]?.label} {incCounts[s] ? `(${incCounts[s]})` : ''}
                  </button>
                ))}
              </div>

              <div className="grid lg:grid-cols-2 gap-4">
                {loading ? <div className="p-10 text-center col-span-2"><div className="loading-spinner mx-auto" /></div>
                : incidents.length === 0 ? <p className="col-span-2 text-center text-[#64748B] py-10">Incidentlar yo'q ✓</p>
                : incidents.map((i: any) => (
                    <div key={i.id} className="glass-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${RISK_COLOR[i.severity]}`}>{i.severity}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${INC_STATUS[i.status]?.cls || ''}`}>{INC_STATUS[i.status]?.label}</span>
                            {i.escalation_level > 0 && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-red-500/10 text-red-400 border-red-500/20">
                                ESC {i.escalation_level}
                              </span>
                            )}
                          </div>
                          <p className="text-base font-bold text-white mt-2">{fmtUZS(i.amount)} so'm</p>
                          <p className="text-xs text-[#64748B] mt-0.5">
                            @{i.user?.telegram_username || i.user?.username || '—'} • Risk {i.risk_score}/100
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[10px] text-[#64748B]">{new Date(i.created_at).toLocaleString('uz-UZ')}</p>
                          <button onClick={() => openDetail(i.id)}
                            className="mt-2 text-[11px] text-[#00F5FF] hover:underline">
                            Batafsil →
                          </button>
                        </div>
                      </div>
                      {i.reasons && i.reasons.length > 0 && (
                        <div className="mt-3 rounded-xl bg-white/[0.03] border border-white/5 p-2.5">
                          {i.reasons.slice(0, 4).map((r: string, idx: number) => (
                            <p key={idx} className="text-[11px] text-[#94A3B8] font-mono">{r}</p>
                          ))}
                        </div>
                      )}
                      {i.status !== 'RESOLVED' && i.status !== 'FALSE_POSITIVE' && i.status !== 'CONFIRMED_FRAUD' && (
                        <div className="flex gap-2 mt-3">
                          <button onClick={() => incidentAction(i.id, 'approve')} disabled={actingId === i.id}
                            className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-green-500/15 text-green-400 border border-green-500/30 hover:bg-green-500/25 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                            <FiCheckCircle className="w-3.5 h-3.5" /> Approve
                          </button>
                          <button onClick={() => incidentAction(i.id, 'reject')} disabled={actingId === i.id}
                            className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                            <FiXCircle className="w-3.5 h-3.5" /> Reject
                          </button>
                          <button onClick={() => incidentAction(i.id, 'block')} disabled={actingId === i.id}
                            className="flex-1 px-3 py-2 rounded-xl text-xs font-semibold bg-red-600/10 text-red-400 border border-red-600/30 hover:bg-red-600/20 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5">
                            <FiLock className="w-3.5 h-3.5" /> Block
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* ═══ INCIDENT DETAIL MODAL ═══ */}
          <AnimatePresence>
            {detail && (
              <>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  onClick={() => setDetail(null)}
                  className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" />
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
                  className="fixed inset-x-0 bottom-0 z-50 max-h-[85vh] overflow-y-auto rounded-t-3xl glass-card !rounded-b-none p-6 lg:inset-x-auto lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:top-1/2 lg:-translate-y-1/2 lg:max-w-2xl lg:rounded-3xl lg:max-h-[85vh]">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <FiAlertTriangle className={`w-5 h-5 ${detail.severity === 'CRITICAL' ? 'text-red-400' : 'text-orange-400'}`} />
                      Incident #{detail.id}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${RISK_COLOR[detail.severity]}`}>{detail.severity}</span>
                    </h2>
                    <button onClick={() => setDetail(null)} className="p-2 rounded-xl hover:bg-white/10 text-[#94A3B8]">✕</button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
                      <p className="text-[10px] text-[#64748B]">Risk score</p>
                      <p className="text-xl font-bold text-white">{detail.risk_score}/100</p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
                      <p className="text-[10px] text-[#64748B]">Summa</p>
                      <p className="text-xl font-bold gradient-text">{fmtUZS(detail.amount)} so'm</p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
                      <p className="text-[10px] text-[#64748B]">Foydalanuvchi</p>
                      <p className="text-sm font-semibold text-white">@{detail.user?.telegram_username || detail.user?.username || '—'}</p>
                    </div>
                    <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3">
                      <p className="text-[10px] text-[#64748B]">Holat / Escalation</p>
                      <p className="text-sm font-semibold text-white">{detail.status} · {detail.escalation_level}</p>
                    </div>
                  </div>

                  <p className="text-xs font-semibold text-white mb-1.5">Sabablar (explainability)</p>
                  <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3 mb-4">
                    {detail.reasons?.map((r: string, idx: number) => (
                      <p key={idx} className="text-xs text-[#94A3B8] font-mono py-0.5">{r}</p>
                    ))}
                    {!detail.reasons?.length && <p className="text-xs text-[#64748B]">—</p>}
                  </div>

                  {detail.ai_summary && (
                    <>
                      <p className="text-xs font-semibold text-white mb-1.5">Gemini AI</p>
                      <div className="rounded-2xl bg-purple-500/5 border border-purple-500/20 p-3 mb-4">
                        <p className="text-xs text-[#94A3B8]">{detail.ai_summary}</p>
                      </div>
                    </>
                  )}

                  {detail.related_game_ids?.length > 0 && (
                    <p className="text-[11px] text-[#64748B] mb-4">Game IDs: {detail.related_game_ids.join(', ')}</p>
                  )}

                  <p className="text-xs font-semibold text-white mb-1.5">Timeline</p>
                  <div className="space-y-2 mb-4">
                    {(detail.timeline || []).map((t: any, idx: number) => (
                      <div key={idx} className="flex gap-3 items-start">
                        <span className="w-2 h-2 rounded-full bg-[#00F5FF] mt-1.5 flex-shrink-0" />
                        <div>
                          <p className="text-xs text-white font-medium">{t.action}</p>
                          <p className="text-[10px] text-[#64748B]">{new Date(t.ts).toLocaleString('uz-UZ')} {t.note ? `• ${t.note}` : ''}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  {detail.status !== 'RESOLVED' && detail.status !== 'FALSE_POSITIVE' && detail.status !== 'CONFIRMED_FRAUD' && (
                    <div className="flex gap-2">
                      <button onClick={() => incidentAction(detail.id, 'approve')} disabled={actingId === detail.id}
                        className="flex-1 px-4 py-3 rounded-xl text-sm font-bold bg-green-500 text-white hover:bg-green-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        <FiCheckCircle className="w-4 h-4" /> Tasdiqlash (kredit)
                      </button>
                      <button onClick={() => incidentAction(detail.id, 'reject')} disabled={actingId === detail.id}
                        className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-red-500/15 text-red-400 border border-red-500/30 hover:bg-red-500/25 transition-all disabled:opacity-50">
                        Rad etish
                      </button>
                      <button onClick={() => incidentAction(detail.id, 'block')} disabled={actingId === detail.id}
                        className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold bg-red-600/15 text-red-400 border border-red-600/30 hover:bg-red-600/25 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                        <FiLock className="w-4 h-4" /> Bloklash
                      </button>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* ═══ CASES ═══ */}
          {tab === 'cases' && (
            <div className="glass-card p-5">
              {cases.length === 0 ? (
                <p className="text-center text-[#64748B] py-10">Case'lar yo'q — incidentdan 'Open Case' tugmasi orqali yaratiladi</p>
              ) : (
                <div className="space-y-3">
                  {cases.map((c: any) => (
                    <div key={c.id} className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">{c.case_id}</p>
                        <p className="text-xs text-[#64748B]">
                          {c.user_count} user · {c.incident_count} incident · {c.assigned_admin ? `@${c.assigned_admin}` : 'tayinlanmagan'}
                        </p>
                        {c.admin_notes && <p className="text-[11px] text-[#94A3B8] mt-1">{c.admin_notes}</p>}
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                        c.status === 'CLOSED' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                        c.status === 'CONFIRMED_FRAUD' ? 'bg-red-600/10 text-red-400 border-red-600/30' :
                        'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                        {c.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ═══ PROFILES ═══ */}
          {tab === 'profiles' && (
            <div>
              <div className="glass-card p-4 mb-4">
                <div className="relative max-w-md">
                  <FiSearch className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]" />
                  <input value={profileSearch} onChange={(e) => setProfileSearch(e.target.value)}
                    placeholder="Username bo'yicha qidirish..." className="glass-input pl-10 py-2.5 text-sm" />
                </div>
              </div>
              <div className="glass-card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-xs text-[#64748B] uppercase tracking-wider border-b border-white/5">
                        <th className="text-left p-3.5">User</th>
                        <th className="text-left p-3.5">Risk</th>
                        <th className="text-left p-3.5">24h hajm</th>
                        <th className="text-left p-3.5">7d hajm</th>
                        <th className="text-left p-3.5">To'lovlar</th>
                        <th className="text-left p-3.5">Game IDs</th>
                        <th className="text-left p-3.5">Holat</th>
                        <th className="text-left p-3.5">Harakat</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? <tr><td colSpan={8} className="p-10 text-center"><div className="loading-spinner mx-auto" /></td></tr>
                      : profiles.length === 0 ? <tr><td colSpan={8} className="p-10 text-center text-[#64748B]">Profil yo'q</td></tr>
                      : profiles.map((p: any) => (
                          <tr key={p.user_id} className="border-b border-white/5 hover:bg-white/[0.04] transition-colors">
                            <td className="p-3.5">
                              <p className="text-sm font-semibold text-white">@{p.telegram_username || p.username}</p>
                              <p className="text-[10px] text-[#64748B]">TG: {p.telegram_id || '—'} · {p.account_age_days} kun</p>
                            </td>
                            <td className="p-3.5">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${RISK_COLOR[p.risk_level]}`}>
                                {p.risk_score} · {p.risk_level}
                              </span>
                            </td>
                            <td className="p-3.5 text-xs text-[#94A3B8]">{fmtUZS(p.volume_24h)}</td>
                            <td className="p-3.5 text-xs text-[#94A3B8]">{fmtUZS(p.volume_7d)}</td>
                            <td className="p-3.5 text-xs text-[#94A3B8]">{p.payment_count} · <span className="text-red-400">{p.failed_count} fail</span></td>
                            <td className="p-3.5 text-[10px] text-[#64748B] font-mono">{(p.game_ids || []).slice(0, 3).join(', ') || '—'}</td>
                            <td className="p-3.5">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-medium border ${
                                p.admin_flag === 'blocked' ? 'bg-red-600/10 text-red-400 border-red-600/30' :
                                p.admin_flag === 'watch' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                                p.admin_flag === 'trusted' ? 'bg-green-500/10 text-green-400 border-green-500/20' :
                                'bg-white/5 text-[#94A3B8] border-white/10'}`}>
                                {p.admin_flag}
                              </span>
                            </td>
                            <td className="p-3.5">
                              <div className="flex gap-1.5">
                                <button onClick={() => profileAction(p.user_id, 'trust')} title="Ishonchli"
                                  className="p-1.5 rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-all">✓</button>
                                <button onClick={() => profileAction(p.user_id, 'watch')} title="Kuzatuv"
                                  className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all">👁</button>
                                <button onClick={() => profileAction(p.user_id, 'block')} title="Bloklash"
                                  className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">🔒</button>
                                <button onClick={() => profileAction(p.user_id, 'unblock')} title="Blokni olib tashlash"
                                  className="p-1.5 rounded-lg bg-white/5 text-[#94A3B8] hover:bg-white/10 transition-all">↩</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ═══ SETTINGS ═══ */}
          {tab === 'settings' && settings && (
            <div className="grid lg:grid-cols-2 gap-6">
              <div className="glass-card p-5">
                <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <FiCpu className="w-4 h-4 text-purple-400" /> Gemini AI
                </h2>
                <p className="text-xs text-[#64748B] mb-5">AI — ANALYST. Qarorni backend qabul qiladi.</p>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-[#94A3B8] block mb-1.5">Gemini API Key</label>
                    <input type="password" value={settings.gemini_configured ? '••••••••••••' : ''}
                      onChange={(e) => set('gemini_api_key', e.target.value)}
                      placeholder={settings.gemini_configured ? 'Saqlangan (almashtirish uchun yozing)' : 'AIza...'}
                      className="glass-input text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[#94A3B8] block mb-1.5">Model</label>
                      <input value={settings.gemini_model || ''} onChange={(e) => set('gemini_model', e.target.value)}
                        className="glass-input text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-[#94A3B8] block mb-1.5">Fail-safe</label>
                      <select value={settings.fail_open ? 'open' : 'closed'} onChange={(e) => set('security_fail_open', e.target.value === 'open' ? 'True' : 'False')}
                        className="glass-input text-sm">
                        <option value="closed">Fail-closed (xavfsiz)</option>
                        <option value="open">Fail-open</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { key: 'security_ai_enabled', label: 'AI yoqilgan', val: settings.ai_enabled },
                      { key: 'security_shadow_mode', label: 'Shadow mode (AI ta\'sir qilmaydi)', val: settings.shadow_mode },
                    ].map((t) => (
                      <button key={t.key} onClick={() => set(t.key, t.val ? 'False' : 'True')}
                        className="w-full flex items-center justify-between rounded-2xl bg-white/[0.03] border border-white/10 p-3.5">
                        <span className="text-sm text-white">{t.label}</span>
                        <span className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${t.val ? 'bg-purple-500/30 justify-end' : 'bg-white/10 justify-start'}`}>
                          <div className={`w-5 h-5 rounded-full transition-colors ${t.val ? 'bg-purple-400' : 'bg-[#64748B]'}`} />
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="glass-card p-5">
                <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <FiCpu className="w-4 h-4 text-[#00F5FF]" /> AI Rejimi
                </h2>
                <p className="text-xs text-[#64748B] mb-5">Staff guruhidagi AI xulqini belgilang</p>
                <div className="flex gap-3">
                  {[
                    { key: 'false', label: 'Muloyim', emoji: '😊', color: 'from-green-500/20 to-emerald-600/20 border-green-500/30', active: 'bg-green-500/30 border-green-400' },
                    { key: 'true', label: 'Angry', emoji: '🔥', color: 'from-red-500/20 to-orange-600/20 border-red-500/30', active: 'bg-red-500/30 border-red-400' },
                    { key: 'strict', label: 'Qattiq', emoji: '⚔️', color: 'from-cyan-500/20 to-blue-600/20 border-cyan-500/30', active: 'bg-cyan-500/30 border-cyan-400' },
                  ].map((m) => (
                    <button key={m.key}
                      onClick={() => set('staff_ai_angry_mode', m.key)}
                      className={`flex-1 rounded-2xl border p-4 transition-all ${
                        settings.ai_mode === m.key
                          ? m.active
                          : `bg-gradient-to-br ${m.color} hover:scale-[1.02]`
                      }`}>
                      <span className="text-2xl block mb-1">{m.emoji}</span>
                      <span className="text-sm font-semibold text-white block">{m.label}</span>
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#64748B] mt-3 text-center">
                  Joriy: <span className="text-white">{settings.ai_mode === 'strict' ? 'Qattiq (buyruqboz)' : settings.ai_mode === 'true' ? 'Angry (agressiv)' : 'Muloyim'}</span>
                </p>
              </div>

              <div className="glass-card p-5">
                <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                  <FiZap className="w-4 h-4 text-[#00F5FF]" /> Risk & Velocity limitlari
                </h2>
                <p className="text-xs text-[#64748B] mb-5">Thresholdlar admin orqali o'zgaradi</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'risk_low_max', label: 'LOW max' },
                    { key: 'risk_medium_max', label: 'MEDIUM max' },
                    { key: 'risk_high_max', label: 'HIGH max' },
                    { key: 'new_user_max', label: 'Yangi user limit' },
                    { key: 'v10m', label: '10 daqiqa limit' },
                    { key: 'v1h', label: '1 soat limit' },
                    { key: 'v24h', label: '24 soat limit' },
                    { key: 'v7d', label: '7 kun limit' },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="text-xs text-[#94A3B8] block mb-1.5">{f.label}</label>
                      <input type="number" value={settings[f.key] ?? ''} onChange={(e) => set(f.key, e.target.value)}
                        className="glass-input text-sm" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="glass-card p-5">
                <h2 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
                  <FiMessageSquare className="w-4 h-4 text-[#00F5FF]" /> Telegram Alert & Escalation
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-[#94A3B8] block mb-1.5">Emergency Telegram User ID (CRITICAL)</label>
                    <input value={settings.emergency_telegram_id || ''} onChange={(e) => set('emergency_telegram_id', e.target.value)}
                      placeholder="2007554600" className="glass-input text-sm" />
                  </div>
                  <div>
                    <label className="text-xs text-[#94A3B8] block mb-1.5">Secondary Admin ID (daraja 3)</label>
                    <input value={settings.secondary_admin_id || ''} onChange={(e) => set('security_secondary_admin_id', e.target.value)}
                      className="glass-input text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[#94A3B8] block mb-1.5">ACK timeout (daqiqa)</label>
                      <input type="number" value={settings.ack_timeout_min ?? 2} onChange={(e) => set('security_ack_timeout_min', e.target.value)}
                        className="glass-input text-sm" />
                    </div>
                    <div>
                      <label className="text-xs text-[#94A3B8] block mb-1.5">Escalation timeout (daqiqa)</label>
                      <input type="number" value={settings.escalation_timeout_min ?? 5} onChange={(e) => set('security_escalation_timeout_min', e.target.value)}
                        className="glass-input text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-[#94A3B8] block mb-1.5">Blacklist (vergul bilan)</label>
                      <textarea value={settings.blacklist || ''} onChange={(e) => set('security_blacklist', e.target.value)}
                        rows={2} placeholder="@user1, 123456789" className="glass-input text-sm resize-none" />
                    </div>
                    <div>
                      <label className="text-xs text-[#94A3B8] block mb-1.5">Whitelist</label>
                      <textarea value={settings.whitelist || ''} onChange={(e) => set('security_whitelist', e.target.value)}
                        rows={2} placeholder="@trusted1" className="glass-input text-sm resize-none" />
                    </div>
                  </div>
                  <button onClick={() => set('security_lockdown', settings.lockdown ? 'False' : 'True')}
                    className={`w-full flex items-center justify-between rounded-2xl border p-3.5 transition-all ${settings.lockdown ? 'bg-red-500/10 border-red-500/30' : 'bg-white/[0.03] border-white/10'}`}>
                    <span className={`text-sm font-semibold ${settings.lockdown ? 'text-red-400' : 'text-white'}`}>
                      <FiLock className="w-4 h-4 inline mr-2" /> SECURITY LOCKDOWN
                    </span>
                    <span className={`w-12 h-7 rounded-full transition-colors flex items-center px-1 ${settings.lockdown ? 'bg-red-500/40 justify-end' : 'bg-white/10 justify-start'}`}>
                      <div className={`w-5 h-5 rounded-full transition-colors ${settings.lockdown ? 'bg-red-400' : 'bg-[#64748B]'}`} />
                    </span>
                  </button>
                  <button onClick={saveSettings} className="glow-btn w-full flex items-center justify-center gap-2 py-3">
                    <FiSettings className="w-4 h-4" /> Saqlash
                  </button>
                </div>
              </div>

              <div className="glass-card p-5">
                <h2 className="text-lg font-bold text-white mb-5 flex items-center gap-2">
                  <FiActivity className="w-4 h-4 text-[#00F5FF]" /> AI Health
                </h2>
                <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-4 space-y-2">
                  <p className="text-xs text-[#94A3B8]">Configured: <b className={settings.gemini_configured ? 'text-green-400' : 'text-red-400'}>{settings.gemini_configured ? '✅ Ha' : '❌ Yo\'q'}</b></p>
                  <p className="text-xs text-[#94A3B8]">Reachable: <b className={settings.ai_health?.reachable ? 'text-green-400' : 'text-red-400'}>{settings.ai_health?.reachable ? '✅ Ha' : '❌ Yo\'q'}</b></p>
                  <p className="text-xs text-[#94A3B8]">Detail: {settings.ai_health?.detail || '—'}</p>
                  <p className="text-[11px] text-[#64748B] pt-2 border-t border-white/5">
                    Shadow mode = AI tahlil qiladi, risk chiqaradi, lekin real to'lovlarga ta'sir qilmaydi.
                    Thresholdlarni bir necha kun kuzatib, keyin o'chiring.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ═══ COPILOT ═══ */}
          {tab === 'copilot' && (
            <div className="glass-card p-5 flex flex-col" style={{ minHeight: '60vh' }}>
              <h2 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
                <FiCpu className="w-4 h-4 text-purple-400" /> AI Security Copilot
              </h2>
              <p className="text-xs text-[#64748B] mb-4">Faqat DB ma'lumotlari asosida javob beradi — hech qachon o'zi approve/reject qilmaydi.</p>

              <div ref={chatRef} className="flex-1 space-y-3 mb-4 max-h-[50vh] overflow-y-auto">
                {copilotChat.length === 0 && (
                  <div className="text-center text-[#64748B] text-sm py-8">
                    Savol bering, masalan:
                    <div className="mt-3 space-y-2">
                      {['Bu incident nega shubhali?', 'Oxirgi 24 soatdagi eng xavfli userlar?', 'Bu user bilan bog\'liq boshqa accountlar bormi?'].map((s) => (
                        <button key={s} onClick={() => setCopilotQ(s)}
                          className="block mx-auto px-4 py-2 rounded-xl bg-white/5 border border-white/10 hover:border-[#00F5FF]/30 text-xs text-[#94A3B8] transition-all">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {copilotChat.map((m: any, idx: number) => (
                  <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === 'user'
                        ? 'bg-[#00F5FF]/15 text-white border border-[#00F5FF]/20'
                        : 'bg-white/[0.05] text-[#D1D5DB] border border-white/10'}`}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {copilotBusy && <div className="loading-spinner mx-auto" />}
              </div>

              <div className="flex gap-2">
                <input value={copilotQ} onChange={(e) => setCopilotQ(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && askCopilot()}
                  placeholder="Savolingizni yozing..." className="glass-input flex-1 text-sm" />
                <button onClick={askCopilot} disabled={copilotBusy || !copilotQ.trim()}
                  className="glow-btn px-4 disabled:opacity-50 flex items-center gap-2">
                  <FiSend className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
