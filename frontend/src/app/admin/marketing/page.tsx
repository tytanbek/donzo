'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSpeaker, FiSave, FiTarget, FiPercent, FiClock, FiZap, FiMessageSquare, FiTrendingUp, FiUsers, FiRefreshCw } from 'react-icons/fi';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';

interface SliderDef {
  key: string;
  label: string;
  icon: React.ComponentType<any>;
  hint: string;
  min: number;
  max: number;
  step: number;
  unit: string;
  format: (v: number) => string;
  parse: (v: string) => number;
  accent: string;
}

const SLIDERS: SliderDef[] = [
  {
    key: 'marketing_ad_prob',
    label: "Reklama qo'shilish ehtimoli",
    icon: FiPercent,
    hint: "Guruhdagi javobga DONZO platformasi reklamasi qo'shilish ehtimoli. 0% — reklama yo'q, 100% — har javobga reklama.",
    min: 0, max: 100, step: 5, unit: '%',
    format: (v) => `${Math.round(v)}%`,
    parse: (s) => Math.round((parseFloat(s) || 0) * 100),
    accent: '#00F5FF',
  },
  {
    key: 'marketing_rate_per_hour',
    label: 'Soatlik javob limiti',
    icon: FiClock,
    hint: "Bot har guruhda soatiga ko'pi bilan shuncha xabarga javob beradi. Spam bo'lmasligi uchun chegaralangan.",
    min: 1, max: 20, step: 1, unit: 'ta/soat',
    format: (v) => `${Math.round(v)} ta/soat`,
    parse: (s) => parseInt(s || '5', 10),
    accent: '#8B5CF6',
  },
];

export default function AdminMarketingPage() {
  const [enabled, setEnabled] = useState<'true' | 'false'>('false');
  const [dailyEnabled, setDailyEnabled] = useState<'true' | 'false'>('false');
  const [dailyTime, setDailyTime] = useState('09:00');
  const [dailyImage, setDailyImage] = useState('');
  const [values, setValues] = useState<Record<string, number>>({
    marketing_ad_prob: 60,
    marketing_rate_per_hour: 5,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      try {
        const res = await adminAPI.settings();
        const s = res.data || res;
        setEnabled((String(s.marketing_group_enabled ?? 'false')).toLowerCase() === 'true' ? 'true' : 'false');
        setDailyEnabled((String(s.marketing_daily_enabled ?? 'false')).toLowerCase() === 'true' ? 'true' : 'false');
        setDailyTime(String(s.marketing_daily_time ?? '09:00') || '09:00');
        setDailyImage(String(s.marketing_daily_image ?? ''));
        const ad = parseFloat(s.marketing_ad_prob ?? '0.6');
        setValues((prev) => ({
          ...prev,
          marketing_ad_prob: Math.round((Number.isFinite(ad) ? ad : 0.6) * 100),
          marketing_rate_per_hour: parseInt(s.marketing_rate_per_hour ?? '5', 10) || 5,
        }));
      } catch (e) { console.error('Marketing settings error:', e); }
      finally { setIsLoading(false); }
    };
    const fetchStats = async () => {
      try {
        const res = await adminAPI.marketingStats();
        setStats(res.data || res);
      } catch (e) { console.error('Marketing stats error:', e); }
      finally { setStatsLoading(false); }
    };
    fetchStats();
  }, []);

  const reloadStats = async () => {
    setStatsLoading(true);
    try {
      const res = await adminAPI.marketingStats();
      setStats(res.data || res);
      toast.success('Statistika yangilandi');
    } catch (e) { toast.error('Statistikani yuklab bo\'lmadi'); }
    finally { setStatsLoading(false); }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await adminAPI.updateSettings({
        marketing_group_enabled: enabled,
        marketing_ad_prob: String((values.marketing_ad_prob || 0) / 100),
        marketing_rate_per_hour: String(values.marketing_rate_per_hour || 5),
        marketing_daily_enabled: dailyEnabled,
        marketing_daily_time: dailyTime || '09:00',
        marketing_daily_image: dailyImage.trim(),
      });
      toast.success('Marketing sozlamalari saqlandi ✅');
    } catch (e) { toast.error('Xatolik yuz berdi'); }
    finally { setIsSaving(false); }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="loading-spinner" />
      </div>
    );
  }

  return (
    <div>
      {/* ═══ Header ═══ */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#00F5FF]/20 to-[#8B5CF6]/20 border border-[#00F5FF]/30 flex items-center justify-center shadow-[0_0_24px_rgba(0,245,255,0.15)]">
            <FiSpeaker className="w-6 h-6 text-[#00F5FF]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">Marketing</h1>
            <p className="text-sm text-[#64748B]">Guruhlarda DONZO'ning reklama va javob berish sozlamalari</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="glow-btn flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
        >
          <FiSave className="w-4 h-4" />
          {isSaving ? 'Saqlanmoqda...' : 'Saqlash'}
        </button>
      </div>

      {/* ═══ Status banner ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`rounded-2xl border p-5 mb-6 flex flex-wrap items-center gap-4 ${
          enabled === 'true'
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-[#F59E0B]/40 bg-[#F59E0B]/10'
        }`}
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
          enabled === 'true' ? 'bg-emerald-500/15 border-emerald-500/20' : 'bg-[#F59E0B]/15 border-[#F59E0B]/20'
        }`}>
          <FiZap className={`w-5 h-5 ${enabled === 'true' ? 'text-emerald-400' : 'text-[#F59E0B]'}`} />
        </div>
        <div className="flex-1 min-w-[200px]">
          <p className={`text-sm font-bold ${enabled === 'true' ? 'text-emerald-400' : 'text-[#F59E0B]'}`}>
            {enabled === 'true' ? 'Marketing rejimi YOQILGAN' : 'Marketing rejimi O\'CHIRILGAN'}
          </p>
          <p className="text-xs text-[#94A3B8] mt-0.5">
            {enabled === 'true'
              ? 'Bot boshqa guruhlarda qiziqarli xabarlarga javob beradi va platformani reklama qiladi.'
              : 'Bot faqat staff guruhida ishlaydi, boshqa guruhlarda javob bermaydi.'}
          </p>
        </div>
        <button
          onClick={() => setEnabled(enabled === 'true' ? 'false' : 'true')}
          className={`relative w-14 h-[30px] rounded-full transition-colors duration-300 border shrink-0 ${
            enabled === 'true' ? 'bg-emerald-500/30 border-emerald-400/40' : 'bg-white/5 border-white/10'
          }`}
        >
          <span
            className={`absolute top-[3px] w-6 h-6 rounded-full transition-all duration-300 shadow-md ${
              enabled === 'true' ? 'left-[29px] bg-emerald-400' : 'left-[3px] bg-[#64748B]'
            }`}
          />
        </button>
      </motion.div>

      {/* ═══ Sliders grid ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {SLIDERS.map((slider, i) => {
          const value = values[slider.key] ?? slider.min;
          const pct = slider.max > slider.min ? ((value - slider.min) / (slider.max - slider.min)) * 100 : 0;
          const Icon = slider.icon;
          return (
            <motion.div
              key={slider.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="glass-card p-6"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: `${slider.accent}1a`, border: `1px solid ${slider.accent}33` }}>
                  <Icon className="w-5 h-5" style={{ color: slider.accent }} />
                </div>
                <div className="flex-1">
                  <h2 className="text-base font-bold text-white">{slider.label}</h2>
                  <p className="text-[11px] text-[#64748B]">{slider.hint}</p>
                </div>
                <span className="px-3 py-1.5 rounded-lg text-sm font-bold font-mono whitespace-nowrap"
                  style={{ backgroundColor: `${slider.accent}1a`, color: slider.accent, border: `1px solid ${slider.accent}33` }}>
                  {slider.format(value)}
                </span>
              </div>

              {/* Slider */}
              <div className="relative pt-2 pb-1">
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${slider.accent}66, ${slider.accent})` }}
                  />
                </div>
                <input
                  type="range"
                  min={slider.min}
                  max={slider.max}
                  step={slider.step}
                  value={value}
                  onChange={(e) => setValues((p) => ({ ...p, [slider.key]: parseFloat(e.target.value) }))}
                  className="absolute inset-0 w-full h-2 opacity-0 cursor-pointer"
                  aria-label={slider.label}
                />
                <div className="flex justify-between mt-3 text-[10px] text-[#475569] font-mono">
                  <span>{slider.min}</span>
                  <span>{slider.max} {slider.unit}</span>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ═══ Kunlik ertalabki reklama ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.12 }}
        className="glass-card p-6 mb-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 flex items-center justify-center">
              <FiClock className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Kunlik ertalabki reklama</h2>
              <p className="text-[11px] text-[#64748B]">Har kuni belgilangan vaqtda barcha marketing guruhlariga suratli reklama yuboradi</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${dailyEnabled === 'true' ? 'text-emerald-400' : 'text-[#64748B]'}`}>
              {dailyEnabled === 'true' ? 'YOQILGAN' : "O'CHIRILGAN"}
            </span>
            <button
              onClick={() => setDailyEnabled(dailyEnabled === 'true' ? 'false' : 'true')}
              className={`relative w-14 h-[30px] rounded-full transition-colors duration-300 border ${
                dailyEnabled === 'true' ? 'bg-emerald-500/30 border-emerald-400/40' : 'bg-white/5 border-white/10'
              }`}
            >
              <span
                className={`absolute top-[3px] w-6 h-6 rounded-full transition-all duration-300 shadow-md ${
                  dailyEnabled === 'true' ? 'left-[29px] bg-emerald-400' : 'left-[3px] bg-[#64748B]'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <label className="block text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">
              Yuborish vaqti (Toshkent, HH:MM)
            </label>
            <input
              type="time"
              value={dailyTime}
              onChange={(e) => setDailyTime(e.target.value)}
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-amber-400/50"
            />
            <p className="text-[11px] text-[#64748B] mt-2">
              Shu vaqtda bot barcha marketing guruhlariga bittadan reklama xabari yuboradi (kuniga bir marta).
            </p>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-[#94A3B8] uppercase tracking-wider mb-2">
              Reklama surati (URL)
            </label>
            <input
              type="text"
              value={dailyImage}
              onChange={(e) => setDailyImage(e.target.value)}
              placeholder="https://.../banner.jpg"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.03] border border-white/10 text-white text-sm font-mono focus:outline-none focus:border-amber-400/50"
            />
            <p className="text-[11px] text-[#64748B] mt-2">
              Bo'sh qoldirilsa — admin panelda yuklangan <strong className="text-white">faol Banner</strong> rasmi ishlatiladi. Surat bo'lmasa matnli xabar yuboriladi.
            </p>
          </div>
        </div>
      </motion.div>

      {/* ═══ Statistika ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass-card p-6 mb-6"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00F5FF]/10 border border-[#00F5FF]/30 flex items-center justify-center">
              <FiTrendingUp className="w-5 h-5 text-[#00F5FF]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Marketing statistikasi</h2>
              <p className="text-[11px] text-[#64748B]">Qaysi guruhlarda nechta javob va reklama yuborilgani</p>
            </div>
          </div>
          <button
            onClick={reloadStats}
            disabled={statsLoading}
            className="px-3 py-2 rounded-lg border border-[#00F5FF]/30 text-[#00F5FF] text-xs font-semibold hover:bg-[#00F5FF]/10 transition-all flex items-center gap-1.5 disabled:opacity-50"
          >
            <FiRefreshCw className={`w-3.5 h-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
            Yangilash
          </button>
        </div>

        {statsLoading ? (
          <div className="flex items-center justify-center py-10">
            <div className="loading-spinner" />
          </div>
        ) : !stats ? (
          <p className="text-sm text-[#64748B] py-8 text-center">Statistika yuklanmadi — API bilan aloqani tekshiring.</p>
        ) : (
          <>
            {/* Umumiy ko'rsatkichlar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                { icon: FiUsers, label: 'Guruhlar', value: stats.totals?.groups ?? 0, accent: '#8B5CF6' },
                { icon: FiMessageSquare, label: 'Javoblar', value: stats.totals?.replies ?? 0, accent: '#00F5FF' },
                { icon: FiZap, label: 'Reklamalar', value: stats.totals?.ads ?? 0, accent: '#F59E0B' },
                { icon: FiSpeaker, label: "Qo'shilishlar", value: stats.totals?.joins ?? 0, accent: '#34D399' },
              ].map((c, i) => {
                const Icon = c.icon;
                return (
                  <div key={i} className="rounded-2xl border bg-white/[0.02] p-4" style={{ borderColor: `${c.accent}33` }}>
                    <div className="flex items-center gap-2 mb-2">
                      <Icon className="w-4 h-4" style={{ color: c.accent }} />
                      <span className="text-[11px] text-[#64748B]">{c.label}</span>
                    </div>
                    <p className="text-2xl font-bold text-white font-mono" style={{ color: c.accent }}>
                      {c.value}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* 14 kunlik grafik */}
            {(stats.daily || []).length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-[#94A3B8] mb-3">Oxirgi 14 kun — kunlik faollik</p>
                <div className="flex items-end gap-1.5 h-28">
                  {(stats.daily as any[]).map((d: any, i: number) => {
                    const max = Math.max(1, ...(stats.daily as any[]).map((x: any) => x.replies_count + x.ads_count));
                    const h = Math.max(4, Math.round(((d.replies_count + d.ads_count) / max) * 100));
                    const isToday = i === (stats.daily as any[]).length - 1;
                    return (
                      <div key={d.day} className="flex-1 flex flex-col items-center gap-1 min-w-0" title={`${d.day}: ${d.replies_count} javob, ${d.ads_count} reklama`}>
                        <div
                          className={`w-full rounded-t-md transition-all duration-300 ${
                            isToday
                              ? 'bg-gradient-to-t from-[#00F5FF]/40 to-[#00F5FF]'
                              : 'bg-gradient-to-t from-[#00F5FF]/20 to-[#00F5FF]/60'
                          }`}
                          style={{ height: `${h}%` }}
                        />
                        <span className={`text-[8px] font-mono truncate w-full text-center ${isToday ? 'text-[#00F5FF]' : 'text-[#475569]'}`}>
                          {d.day.slice(8)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Guruhlar jadvali */}
            <div>
              <p className="text-xs font-semibold text-[#94A3B8] mb-3">Guruhlar bo'yicha</p>
              {(stats.groups || []).length === 0 ? (
                <p className="text-sm text-[#64748B] py-6 text-center border border-dashed border-white/10 rounded-xl">
                  Hozircha statistika yo'q — bot guruhlarga qo'shilib, javob bera boshlaganda bu yerda ko'rinadi.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-[#475569] border-b border-white/10">
                        <th className="py-2.5 pr-3 font-semibold">Guruh</th>
                        <th className="py-2.5 pr-3 font-semibold text-right">Javoblar</th>
                        <th className="py-2.5 pr-3 font-semibold text-right">Reklamalar</th>
                        <th className="py-2.5 pr-3 font-semibold text-right">Qo'shilish</th>
                        <th className="py-2.5 font-semibold text-right">Oxirgi javob</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(stats.groups as any[]).map((g: any, i: number) => (
                        <tr key={g.chat_id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-[#00F5FF]/10 border border-[#00F5FF]/20 flex items-center justify-center text-[10px] font-bold text-[#00F5FF]">
                                {(g.chat_title || 'G').charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-white truncate max-w-[180px]">{g.chat_title}</p>
                                <p className="text-[10px] text-[#475569] font-mono">{g.chat_id}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 pr-3 text-right font-mono text-[#00F5FF]">{g.replies_count}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-[#F59E0B]">{g.ads_count}</td>
                          <td className="py-2.5 pr-3 text-right font-mono text-[#64748B]">{g.joins_count}</td>
                          <td className="py-2.5 text-right text-[11px] text-[#64748B] font-mono">
                            {g.last_reply_at ? new Date(g.last_reply_at).toLocaleString('uz-UZ', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </motion.div>

      {/* ═══ Info ═══ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="glass-card p-6"
      >
        <div className="flex items-start gap-3">
          <FiTarget className="w-5 h-5 text-[#00F5FF] shrink-0 mt-0.5" />
          <div className="text-xs text-[#64748B] leading-relaxed">
            <p className="font-semibold text-white text-sm mb-2">Qanday ishlaydi?</p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Bot istalgan guruhga qo'shilganda — <strong className="text-white">salomlashish + reklama</strong> yuboradi</li>
              <li>Guruhdagi har bir xabarga javob bermaydi — <strong className="text-white">qiziqarli mavzular</strong> (o'yin, top-up, pul, premium) tanlab olinadi</li>
              <li>Javob chiqarilganda — <strong className="text-white">Reklama ehtimoli</strong> bo'yicha platforma havolasi qo'shiladi</li>
              <li><strong className="text-white">Soatlik limit</strong> — spam bo'lmasligi uchun har guruhda soatiga maks javob sonini cheklaydi</li>
              <li>AI ning joriy rejimi (<strong className="text-white">muloyim / angry</strong>) marketing javoblariga ham qo'llanadi</li>
            </ol>
            <p className="mt-3 text-[#475569]">
              💡 Bot faqat <strong className="text-white">operatsion guruhlardan tashqari</strong> guruhlarda marketing qiladi — hisobot/monitor guruhlarida faqat ish ma'lumotlari.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
