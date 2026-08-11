'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  FiKey, FiEye, FiEyeOff, FiCopy, FiCheck, FiSave, FiRefreshCw,
  FiSend, FiShield, FiMail, FiCreditCard, FiAlertTriangle,
  FiCheckCircle, FiLock, FiTrash2, FiX, FiSettings
} from 'react-icons/fi';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';

interface KeyField {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  secret?: boolean;
  isUrl?: boolean;
  isBool?: boolean;
}

interface KeyGroup {
  id: string;
  title: string;
  icon: React.ComponentType<any>;
  accent: string;
  description: string;
  fields: KeyField[];
}

const KEY_GROUPS: KeyGroup[] = [
  {
    id: 'telegram',
    title: 'Telegram Bot',
    icon: FiSend,
    accent: '#38BDF8',
    description: 'Telegram login va bot xizmatlari uchun kalitlar',
    fields: [
      { key: 'telegram_bot_token', label: 'Bot Token', secret: true, placeholder: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', hint: 'BotFather dan olingan token' },
      { key: 'telegram_bot_token_alt', label: 'Eski/Alternative Bot Token(lar)', secret: true, placeholder: 'vergul bilan ajrating', hint: 'Eski bot tokenlari (agar foydalanuvchilar eski bot orqali kirsa). Vergul bilan ajrating' },
      { key: 'telegram_bot_username', label: 'Bot Username', placeholder: 'my_topup_bot', hint: '@ belgisisiz' },
      { key: 'web_app_url', label: 'Web App URL (Mini App link)', isUrl: true, placeholder: 'https://t.me/my_topup_bot/app', hint: 'Telegram bot web app (mini app) manzili' },
      { key: 'super_admin_telegram_id', label: 'Super Admin Telegram ID', placeholder: '2007554600', hint: 'Bu Telegram ID bilan kirgan foydalanuvchi avtomatik super_admin bo\'ladi' },
    ],
  },
  {
    id: 'click',
    title: 'Click to\'lov tizimi',
    icon: FiCreditCard,
    accent: '#00F5FF',
    description: 'Click merchant kalitlari (balans to\'ldirish uchun)',
    fields: [
      { key: 'click_merchant_id', label: 'Merchant ID', placeholder: '12345' },
      { key: 'click_secret_key', label: 'Secret Key', secret: true, placeholder: 'A1B2C3D4E5F6G7H8' },
    ],
  },
  {
    id: 'payme',
    title: 'Payme to\'lov tizimi',
    icon: FiCreditCard,
    accent: '#F97316',
    description: 'Payme merchant kalitlari',
    fields: [
      { key: 'payme_merchant_id', label: 'Merchant ID', placeholder: '5e1f3a2b...a1b2c' },
      { key: 'payme_secret_key', label: 'Secret Key', secret: true, placeholder: 'PAYME_SECRET' },
    ],
  },
  {
    id: 'uzum',
    title: 'Uzum to\'lov tizimi',
    icon: FiCreditCard,
    accent: '#8B5CF6',
    description: 'Uzum merchant kalitlari',
    fields: [
      { key: 'uzum_merchant_id', label: 'Merchant ID', placeholder: '12345' },
      { key: 'uzum_secret_key', label: 'Secret Key', secret: true, placeholder: 'UZUM_SECRET' },
    ],
  },
  {
    id: 'fragment',
    title: 'Fragment API (Telegram Stars & Premium)',
    icon: FiSend,
    accent: '#22D3EE',
    description: 'Telegram Stars va Premium avtomatik yetkazib berish (fragment-api.uz)',
    fields: [
      { key: 'fragment_api_base_url', label: 'API Base URL', isUrl: true, placeholder: 'https://fragment-api.uz/api/v1', hint: 'Fragment API manzili (default ishlaydi)' },
      { key: 'fragment_api_key', label: 'API Key', secret: true, placeholder: 'X-API-Key kaliti', hint: 'Har bir so\'rovga X-API-Key header sifatida yuboriladi — hech kimga bermang!' },
      { key: 'fragment_usd_uzs_rate', label: '1 USDT = ? so\'m', placeholder: '12800', hint: 'Fragment narxlarini so\'mga o\'tkazish kursi' },
      { key: 'fragment_price_margin_percent', label: 'Ustama %', placeholder: '15', hint: 'Narx ustiga ustama foizi (masalan 15 = +15%)' },
      { key: 'fragment_price_sync_enabled', label: 'Kunlik avtomatik sinxronlash', isBool: true, hint: 'Har 24 soatda Fragment API jonli narxlari bilan yangilanadi' },
    ],
  },
  {
    id: 'server',
    title: 'Server xavfsizligi',
    icon: FiShield,
    accent: '#F59E0B',
    description: 'Django server kalitlari',
    fields: [
      { key: 'django_secret_key', label: 'DJANGO_SECRET_KEY', secret: true, placeholder: 'bo\'sh qoldirilsa default ishlatiladi', hint: '50+ belgidan iborat random kalit. Hech kimga bermang!' },
      { key: 'debug', label: 'DEBUG rejimi', isBool: true, hint: 'Xatoliklarni batafsil ko\'rsatadi. Production\'da False bo\'lishi shart!' },
      { key: 'allowed_hosts', label: 'ALLOWED_HOSTS', placeholder: 'localhost,127.0.0.1,example.com', hint: 'Vergul bilan ajrating' },
      { key: 'cors_allowed_origins', label: 'CORS ALLOWED ORIGINS', placeholder: 'http://localhost:3000,https://site.com', hint: 'Frontend manzillari (vergul bilan)' },
    ],
  },
  {
    id: 'user_client',
    title: 'User Client (Telethon)',
    icon: FiSend,
    accent: '#34D399',
    description: 'Karta to\'lovlarini avtomatik tekshirish uchun shaxsiy Telegram akkaunt',
    fields: [
      { key: 'telegram_api_id', label: 'API ID', placeholder: '12345678', hint: 'https://my.telegram.org → API development tools dan' },
      { key: 'telegram_api_hash', label: 'API Hash', secret: true, placeholder: '0123456789abcdef0123456789abcdef', hint: 'my.telegram.org dan olinadi — hech kimga bermang!' },
    ],
  },
  {
    id: 'cardpay',
    title: 'Karta to\'lov nazorati',
    icon: FiCreditCard,
    accent: '#F472B6',
    description: 'Karta tushumlarini avtomatik tekshirish (Telethon user client)',
    fields: [
      { key: 'payment_card_monitor_enabled', label: 'Monitor yoqilgan', isBool: true, hint: 'Karta xabarlarini kuzatish yoqilganmi' },
      { key: 'payment_monitor_chat_id', label: 'Monitor Chat ID', placeholder: '-1001234567890', hint: 'Bank-xabar keladigan chat/guruh ID si' },
      { key: 'payment_report_chat_id', label: 'Hisobot Guruh ID', placeholder: '-1001234567890', hint: 'To\'lov hisobotlari yuboriladigan guruh' },
      { key: 'payment_suspicious_limit', label: 'Shubhali limit (so\'m)', placeholder: '500000', hint: 'Shu qiymatdan katta tushum balansga avtomatik TUSHMAYDI — admin tasdiqlaydi' },
      { key: 'payment_timeout_minutes', label: 'To\'lov vaqti (daqiqa)', placeholder: '10', hint: 'Foydalanuvchi shu vaqt ichida to\'lamasa so\'rov bekor qilinadi' },
      { key: 'payment_unique_offset_max', label: 'Unique summa offset (max)', placeholder: '999', hint: 'Yagona summani farqlash uchun qo\'shiladigan offset (0-999)' },
      { key: 'payment_card_number', label: 'Karta raqami', placeholder: '8600 1234 5678 9012', hint: 'Mijozga ko\'rsatiladigan karta raqami' },
      { key: 'payment_card_holder', label: 'Karta egasi', placeholder: 'DONZO PAYMENT', hint: 'Karta egasining ismi (mijozga ko\'rsatiladi)' },
    ],
  },
  {
    id: 'security',
    title: 'Security / Anti-Fraud (Gemini AI)',
    icon: FiShield,
    accent: '#EF4444',
    description: 'AI risk monitoring va incident tizimi',
    fields: [
      { key: 'gemini_api_key', label: 'Gemini API Key', secret: true, placeholder: 'AIza...', hint: 'https://aistudio.google.com dan — hech kimga bermang!' },
      { key: 'gemini_model', label: 'Gemini Model', placeholder: 'gemini-1.5-flash', hint: 'Ishlatiladigan model nomi' },
      { key: 'security_ai_enabled', label: 'AI yoqilgan', isBool: true, hint: 'Gemini AI tahlili yoqilganmi (fail-safe: o\'chsa ham qoidalar ishlaydi)' },
      { key: 'security_shadow_mode', label: 'Shadow mode (AI ta\'sir qilmaydi)', isBool: true, hint: 'AI tahlil qiladi, risk chiqaradi, lekin real to\'lovlarga ta\'sir qilmaydi' },
      { key: 'security_fail_open', label: 'Fail-open (AI ishlamasa to\'lov o\'tsin)', isBool: true, hint: 'Xavfli! AI ishlamay qolganda ham oddiy to\'lovlar o\'tadi (tavsiya: False)' },
      { key: 'emergency_telegram_id', label: 'Emergency Telegram ID (CRITICAL)', placeholder: '2007554600', hint: 'CRITICAL xavflarda darhol xabar boradigan ID' },
      { key: 'security_secondary_admin_id', label: 'Secondary Admin ID', placeholder: '', hint: 'Escalation daraja 3 uchun zaxira admin' },
      { key: 'security_high_alerts_enabled', label: 'HIGH alertlar', isBool: true, hint: 'HIGH darajadagi incidentlar uchun Telegram alert' },
      { key: 'security_critical_alerts_enabled', label: 'CRITICAL alertlar', isBool: true, hint: 'CRITICAL darajadagi incidentlar uchun Telegram alert' },
      { key: 'security_ack_timeout_min', label: 'ACK timeout (daqiqa)', placeholder: '2', hint: 'Qancha vaqtda javob bo\'lmasa escalation boshlanadi' },
      { key: 'security_escalation_timeout_min', label: 'Escalation timeout (daqiqa)', placeholder: '5', hint: 'Keyingi escalation darajasi qancha vaqtda' },
      { key: 'security_lockdown', label: 'SECURITY LOCKDOWN', isBool: true, hint: 'YOQILSA: katta to\'lovlar va shubhali to\'lovlar ushlab turiladi!' },
      { key: 'risk_low_max', label: 'LOW max (0-100)', placeholder: '29', hint: '0-29 LOW — normal o\'tadi' },
      { key: 'risk_medium_max', label: 'MEDIUM max', placeholder: '49', hint: '30-49 MEDIUM — qo\'shimcha monitoring' },
      { key: 'risk_high_max', label: 'HIGH max', placeholder: '69', hint: '50-69 HIGH — HOLD + admin alert' },
      { key: 'velocity_10m_limit', label: '10 daqiqa limit (so\'m)', placeholder: '200000' },
      { key: 'velocity_1h_limit', label: '1 soat limit (so\'m)', placeholder: '500000' },
      { key: 'velocity_24h_limit', label: '24 soat limit (so\'m)', placeholder: '1500000' },
      { key: 'velocity_7d_limit', label: '7 kun limit (so\'m)', placeholder: '5000000' },
      { key: 'new_user_max_payment', label: 'Yangi user max to\'lov', placeholder: '300000', hint: 'Yangi foydalanuvchi uchun maksimal to\'lov (kattasi HOLD)' },
      { key: 'security_blacklist', label: 'Blacklist (vergul bilan)', placeholder: '@user1, 123456789', hint: 'Bu foydalanuvchilarning to\'lovlari BLOCK qilinadi' },
      { key: 'security_whitelist', label: 'Whitelist', placeholder: '@trusted1', hint: 'Bu foydalanuvchilar riskdan ozod' },
    ],
  },
  {
    id: 'smtp',
    title: 'Email (SMTP)',
    icon: FiMail,
    accent: '#10B981',
    description: 'Email jo\'natish serveri kalitlari',
    fields: [
      { key: 'email_smtp_host', label: 'SMTP Host', placeholder: 'smtp.gmail.com' },
      { key: 'email_smtp_port', label: 'SMTP Port', placeholder: '587' },
      { key: 'email_smtp_user', label: 'SMTP User', placeholder: 'admin@example.com' },
      { key: 'email_smtp_password', label: 'SMTP Password', secret: true, placeholder: '••••••••' },
    ],
  },
  {
    id: 'site',
    title: 'Sayt sozlamalari',
    icon: FiSettings,
    accent: '#A78BFA',
    description: 'Sayt nomi, qo\'llab-quvvatlash va asosiy sozlamalar',
    fields: [
      { key: 'site_name', label: 'Sayt nomi', placeholder: 'DONZO' },
      { key: 'site_description', label: 'Sayt tavsifi', placeholder: 'O\'yinlar va raqamli xizmatlarga tez donat' },
      { key: 'support_telegram', label: 'Qo\'llab-quvvatlash Telegram', placeholder: '@topuphub' },
      { key: 'currency', label: 'Valyuta', placeholder: 'UZS' },
      { key: 'maintenance_mode', label: 'Maintenance rejimi', isBool: true, hint: 'YOQILSA sayt texnik ishlar uchun yopiladi' },
    ],
  },
];

export default function AdminKeysPage() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isWritingEnv, setIsWritingEnv] = useState(false);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState<string | null>(null);
  const [isFragmentSyncing, setIsFragmentSyncing] = useState(false);
  const [fragmentSyncResult, setFragmentSyncResult] = useState<string | null>(null);
  const [fragmentStatus, setFragmentStatus] = useState<any>(null);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await adminAPI.settings();
        setSettings(res.data || res);
      } catch (e) { console.error('Error:', e); }
      finally { setIsLoading(false); }
    };
    fetchSettings();
    // Fragment API jonli holatini ko'rsatish (wallet, narxlar, API holati)
    adminAPI.fragmentStatus()
      .then((r) => {
        const d = r.data || {};
        setFragmentStatus(d);
        const ps = d.price_sync;
        if (ps?.last_result) setFragmentSyncResult(ps.last_result);
      })
      .catch(() => {});
  }, []);

  const update = (key: string, value: any) => {
    setSettings((prev: Record<string, any>) => ({ ...prev, [key]: value }));
  };

  const isConfigured = (key: string) => {
    const v = settings[key];
    return typeof v === 'string' ? v.trim().length > 0 : Boolean(v);
  };

  const configuredCount = useMemo(() => {
    const keys = KEY_GROUPS.flatMap(g => g.fields.map(f => f.key));
    return keys.filter(isConfigured).length;
  }, [settings]);

  const totalCount = useMemo(() => {
    return KEY_GROUPS.flatMap(g => g.fields.map(f => f.key)).length;
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await adminAPI.updateSettings(settings);
      toast.success('Kalitlar saqlandi ✅');
      setTimeout(() => toast('O\'zgarishlar kuchga kirishi uchun ".env ga yozish" tugmasini bosing', { icon: '💡' }), 800);
    } catch (e) { toast.error('Xatolik yuz berdi'); }
    finally { setIsSaving(false); }
  };

  const handleWriteEnv = async () => {
    setIsWritingEnv(true);
    try {
      await adminAPI.writeEnv();
      toast.success('.env fayliga yozildi! Serverni qayta ishga tushiring.', { duration: 5000 });
    } catch (e) { toast.error('Xatolik yuz berdi'); }
    finally { setIsWritingEnv(false); }
  };

  const handleCopy = async (key: string) => {
    const value = settings[key] || '';
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(null), 1500);
    } catch (e) { toast.error('Nusxalash imkonsiz'); }
  };

  const handleClear = (key: string) => {
    update(key, '');
    setConfirmClear(null);
    toast.success('Kalit tozalandi');
  };

  const handleFragmentSync = async () => {
    setIsFragmentSyncing(true);
    try {
      const res = await adminAPI.fragmentSync();
      const data = res.data || {};
      const msg = data.result || (data.updated + ' ta paket yangilandi');
      setFragmentSyncResult(msg);
      toast.success('Fragment narxlar sinxronlandi ✅');
    } catch (e) {
      setFragmentSyncResult('Sinxronlashda xatolik — Fragment API bilan aloqa yo\'q');
      toast.error('Sinxronlashda xatolik');
    } finally {
      setIsFragmentSyncing(false);
    }
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
            <FiKey className="w-6 h-6 text-[#00F5FF]" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">Kalitlar &amp; Kodlar</h1>
            <p className="text-sm text-[#64748B]">Barcha API kalitlar, tokenlar va maxfiy kodlar</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs">
            <span className="text-[#64748B]">Sozlangan:</span>
            <span className="font-bold text-emerald-400">{configuredCount}/{totalCount}</span>
            <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden ml-1">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-[#00F5FF] transition-all duration-500"
                style={{ width: `${totalCount ? (configuredCount / totalCount) * 100 : 0}%` }} />
            </div>
          </div>
          <button
            onClick={handleWriteEnv}
            disabled={isWritingEnv}
            className="px-4 py-2.5 rounded-xl border border-[#F59E0B]/30 text-sm font-medium text-[#F59E0B] hover:bg-[#F59E0B]/10 transition-all duration-200 flex items-center gap-2 disabled:opacity-50"
          >
            <FiRefreshCw className={`w-4 h-4 ${isWritingEnv ? 'animate-spin' : ''}`} />
            {isWritingEnv ? 'Yozilmoqda...' : '.env ga yozish'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="glow-btn flex items-center gap-2 px-4 py-2.5 text-sm disabled:opacity-50"
          >
            <FiSave className="w-4 h-4" />
            {isSaving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </div>

      {/* ═══ Warning banner ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-5 mb-6 border-l-4 border-l-[#F59E0B]"
      >
        <div className="flex items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#F59E0B]/15 border border-[#F59E0B]/20 flex items-center justify-center shrink-0">
            <FiLock className="w-5 h-5 text-[#F59E0B]" />
          </div>
          <div className="text-xs text-[#94A3B8] leading-relaxed">
            <p className="font-semibold text-[#F59E0B] text-sm mb-1">Maxfiy ma'lumotlar — ehtiyot bo'ling!</p>
            <p>Bu kalitlar saytning <strong>xavfsizligi va to'lov tizimi</strong> uchun juda muhim. Kalitlarni <strong>hech kim bilan baham ko'rmang</strong> va <strong>hech qanday skrinshotda tushirmang</strong>. Agar kalit sizib ketgan bo'lsa, uni darhol o'zgartiring.</p>
            <p className="mt-2 text-[#64748B]">Kalitlar ma'lumotlar bazasida saqlanadi va <strong>".env ga yozish"</strong> tugmasi orqali .env fayliga yoziladi. O'zgarishlar kuchga kirishi uchun serverni qayta ishga tushirish talab qilinadi.</p>
          </div>
        </div>
      </motion.div>

      {/* ═══ Key groups grid ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {KEY_GROUPS.map((group, gi) => {
          const GroupIcon = group.icon;
          const groupConfigured = group.fields.filter(f => isConfigured(f.key)).length;
          return (
            <motion.div
              key={group.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.06 }}
              className={`glass-card p-6 border-t-2 transition-colors duration-300 ${groupConfigured === group.fields.length ? 'border-t-emerald-400/60' : ''}`}
              style={{ borderTopColor: groupConfigured === group.fields.length ? undefined : `${group.accent}55` }}
            >
              {/* Group header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${group.accent}1a`, border: `1px solid ${group.accent}33` }}>
                    <GroupIcon className="w-5 h-5" style={{ color: group.accent }} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white">{group.title}</h2>
                    <p className="text-[11px] text-[#64748B]">{group.description}</p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                  groupConfigured === group.fields.length
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-white/5 text-[#94A3B8] border-white/10'
                }`}>
                  {groupConfigured}/{group.fields.length}
                </span>
              </div>

              {/* Fragment: live status + price sync card */}
              {group.id === 'fragment' && (
                <div className="rounded-xl border border-[#22D3EE]/20 bg-[#22D3EE]/5 p-3.5 mb-5">
                  {/* API holati (loading paytida neytral — qizil noto'g'ri signal bermaydi) */}
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border flex items-center gap-1.5 ${
                      fragmentStatus === null
                        ? 'bg-white/5 text-[#64748B] border-white/10'
                        : fragmentStatus?.api_reachable
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        fragmentStatus === null ? 'bg-[#64748B]'
                          : fragmentStatus?.api_reachable ? 'bg-emerald-400' : 'bg-red-400'
                      } ${fragmentStatus ? 'animate-pulse' : ''}`} />
                      {fragmentStatus === null ? 'Tekshirilmoqda...' : (fragmentStatus?.api_reachable ? 'API jonli' : 'API aloqasiz')}
                    </span>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border ${
                      fragmentStatus === null
                        ? 'bg-white/5 text-[#64748B] border-white/10'
                        : fragmentStatus?.configured
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-[#F59E0B]/10 text-[#F59E0B] border-[#F59E0B]/20'
                    }`}>
                      {fragmentStatus === null ? 'Tekshirilmoqda...' : (fragmentStatus?.configured ? '✓ Kalit sozlangan' : '⚠ Kalit sozlanmagan')}
                    </span>
                  </div>

                  {/* Wallet balansi */}
                  {fragmentStatus?.wallet && !fragmentStatus.wallet.error && (
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                        <p className="text-[10px] text-[#64748B]">Hamyon TON</p>
                        <p className="text-sm font-bold text-white font-mono">{fragmentStatus.wallet.balance_ton ?? '—'}</p>
                      </div>
                      <div className="rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                        <p className="text-[10px] text-[#64748B]">Hamyon USDT</p>
                        <p className="text-sm font-bold text-white font-mono">{fragmentStatus.wallet.balance_usdt ?? '—'}</p>
                      </div>
                    </div>
                  )}

                  {/* Wallet imkoniyatlari (calculate) */}
                  {fragmentStatus?.wallet_calculate && !fragmentStatus.wallet_calculate.error && (
                    <div className="mb-3 rounded-lg bg-white/5 border border-white/10 px-3 py-2">
                      <p className="text-[10px] text-[#22D3EE] font-semibold mb-1">💡 Hamyon bilan olish mumkin:</p>
                      <div className="flex flex-wrap gap-2">
                        {Number(fragmentStatus.wallet_calculate.stars?.max_amount) > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-[#22D3EE]/10 border border-[#22D3EE]/20 text-[10px] text-[#22D3EE]">
                            ⭐ {fragmentStatus.wallet_calculate.stars.max_amount} Stars
                          </span>
                        )}
                        {(fragmentStatus.wallet_calculate.premium?.packages || []).map((p: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 text-[10px] text-[#8B5CF6]">
                            👑 {p.months} oy Premium
                          </span>
                        ))}
                        {!(Number(fragmentStatus.wallet_calculate.stars?.max_amount) > 0 || (fragmentStatus.wallet_calculate.premium?.packages || []).length) && (
                          <span className="text-[10px] text-[#64748B]">— (hisob bo'yicha hech narsa)</span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Jonli narxlar */}
                  {fragmentStatus?.premium_prices?.packages?.length > 0 && !fragmentStatus.premium_prices.error && (
                    <div className="mb-3">
                      <p className="text-[10px] text-[#64748B] mb-1">Premium narxlar (API):</p>
                      <div className="flex flex-wrap gap-2">
                        {fragmentStatus.premium_prices.packages.map((p: any, i: number) => (
                          <span key={i} className="px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-[10px] text-[#94A3B8] font-mono">
                            {p.months} oy · {p.usd ?? p.ton}$
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="text-[11px] text-[#94A3B8] leading-relaxed min-w-0">
                      <p className="font-semibold text-[#22D3EE] text-xs mb-1">⚡ Jonli narx sinxronlash</p>
                      {fragmentSyncResult ? (
                        <p className="truncate">{fragmentSyncResult}</p>
                      ) : (
                        <p>Premium va Stars narxlari Fragment API jonli narxlari bilan har 24 soatda yangilanadi.</p>
                      )}
                    </div>
                    <button
                      onClick={handleFragmentSync}
                      disabled={isFragmentSyncing}
                      className="px-3 py-2 rounded-lg bg-[#22D3EE]/15 border border-[#22D3EE]/30 text-[#22D3EE] text-xs font-semibold hover:bg-[#22D3EE]/25 transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50 shrink-0"
                    >
                      <FiRefreshCw className={`w-3.5 h-3.5 ${isFragmentSyncing ? 'animate-spin' : ''}`} />
                      {isFragmentSyncing ? 'Sinxronlanmoqda...' : 'Hozir sinxronlash'}
                    </button>
                  </div>
                </div>
              )}

              {/* Fields */}
              <div className="space-y-4">
                {group.fields.map((field) => {
                  const value = String(settings[field.key] ?? '');
                  const isVisible = visible[field.key];
                  const isSecret = field.secret;
                  const configured = isConfigured(field.key);
                  const showMasked = isSecret && !isVisible;

                  return (
                    <div key={field.key} className="relative">
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium text-[#94A3B8] flex items-center gap-2">
                          {field.label}
                          {configured ? (
                            <span className="flex items-center gap-1 text-[10px] text-emerald-400">
                              <FiCheckCircle className="w-3 h-3" /> sozlangan
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] text-[#64748B]">
                              <FiAlertTriangle className="w-3 h-3" /> sozlanmagan
                            </span>
                          )}
                        </label>
                        {isSecret && configured && (
                          <button
                            onClick={() => setVisible((p) => ({ ...p, [field.key]: !isVisible }))}
                            className="text-[#64748B] hover:text-[#00F5FF] transition-colors"
                            title={isVisible ? 'Yashirish' : 'Ko\'rsatish'}
                          >
                            {isVisible ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                          </button>
                        )}
                      </div>

                      <div className="relative">
                        {field.isBool ? (
                          <div className="flex items-center gap-3 py-1.5">
                            <button
                              type="button"
                              onClick={() => update(field.key, value === 'True' ? 'False' : 'True')}
                              className={`relative w-12 h-[26px] rounded-full transition-colors duration-300 border ${
                                value === 'True'
                                  ? 'bg-emerald-500/30 border-emerald-400/40'
                                  : 'bg-white/5 border-white/10'
                              }`}
                            >
                              <span
                                className={`absolute top-[3px] w-5 h-5 rounded-full transition-all duration-300 shadow-md ${
                                  value === 'True'
                                    ? 'left-[25px] bg-emerald-400'
                                    : 'left-[3px] bg-[#64748B]'
                                }`}
                              />
                            </button>
                            <span className={`text-xs font-medium ${value === 'True' ? 'text-emerald-400' : 'text-[#64748B]'}`}>
                              {value === 'True' ? 'Yoqilgan' : 'O\'chirilgan'}
                            </span>
                          </div>
                        ) : (
                        <input
                          type={showMasked ? 'password' : field.isUrl ? 'url' : 'text'}
                          value={value}
                          onChange={(e) => update(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className={`glass-input pr-24 py-3 text-sm font-mono ${configured ? 'border-emerald-500/20' : ''}`}
                          style={field.isUrl ? { borderColor: configured ? 'rgba(0,245,255,0.3)' : undefined } : undefined}
                        />
                        )}
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                          {configured && !field.isBool && (
                            <>
                              <button
                                onClick={() => handleCopy(field.key)}
                                className="p-2 rounded-lg hover:bg-white/10 text-[#64748B] hover:text-[#00F5FF] transition-all"
                                title="Nusxalash"
                              >
                                {copied === field.key
                                  ? <FiCheck className="w-3.5 h-3.5 text-emerald-400" />
                                  : <FiCopy className="w-3.5 h-3.5" />}
                              </button>
                              {confirmClear === field.key ? (
                                <span className="flex items-center gap-1 mr-1">
                                  <button
                                    onClick={() => handleClear(field.key)}
                                    className="px-2 py-1.5 rounded-lg bg-red-500/20 text-red-400 text-[10px] font-semibold hover:bg-red-500/30 transition-all"
                                  >
                                    Ha
                                  </button>
                                  <button
                                    onClick={() => setConfirmClear(null)}
                                    className="px-2 py-1.5 rounded-lg bg-white/10 text-[#94A3B8] text-[10px] hover:bg-white/20 transition-all"
                                  >
                                    <FiX className="w-3 h-3" />
                                  </button>
                                </span>
                              ) : (
                                <button
                                  onClick={() => setConfirmClear(field.key)}
                                  className="p-2 rounded-lg hover:bg-red-500/10 text-[#64748B] hover:text-red-400 transition-all"
                                  title="Tozalash"
                                >
                                  <FiTrash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {field.hint && <p className="text-[10px] text-[#64748B] mt-1">{field.hint}</p>}
                    </div>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ═══ How it works ═══ */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-6 mt-6"
      >
        <div className="flex items-start gap-3">
          <FiShield className="w-5 h-5 text-[#00F5FF] shrink-0 mt-0.5" />
          <div className="text-xs text-[#64748B] leading-relaxed">
            <p className="font-semibold text-white text-sm mb-2">Qanday ishlaydi?</p>
            <ol className="list-decimal list-inside space-y-1.5">
              <li>Kalitlarni kiriting yoki o'zgartiring va <strong className="text-white">"Saqlash"</strong> tugmasini bosing — ma'lumotlar bazasiga yoziladi</li>
              <li><strong className="text-white">".env ga yozish"</strong> tugmasini bosing — faylga yoziladi</li>
              <li>Serverni qayta ishga tushiring — barcha o'zgarishlar kuchga kiradi</li>
            </ol>
            <p className="mt-3 text-[#475569]">
              💡 <strong>Web App URL</strong> — Telegram botingizdagi mini-app manzili (masalan <code className="text-[#00F5FF]">https://t.me/my_bot/app</code>). Bu link foydalanuvchilarni bot orqali to'g'ridan-to'g'ri platformangizga olib boradi.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
