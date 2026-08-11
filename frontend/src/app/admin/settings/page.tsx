'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiSave, FiRefreshCw, FiServer, FiDatabase, FiShield, FiLink, FiCreditCard, FiAlertTriangle, FiCheckCircle } from 'react-icons/fi';
import { adminAPI } from '@/lib/api';
import toast from 'react-hot-toast';

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isWritingEnv, setIsWritingEnv] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await adminAPI.settings();
        setSettings(res.data || res);
      } catch (e) { console.error('Error:', e); }
      finally { setIsLoading(false); }
    };
    fetchSettings();
  }, []);

  const update = (key: string, value: any) => {
    setSettings((prev: Record<string, any>) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await adminAPI.updateSettings(settings);
      toast.success('Sozlamalar saqlandi');
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

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="loading-spinner" /></div>;
  }

  const InputField = ({ label, keyName, type = 'text', placeholder = '', hint = '', sensitive = false }: any) => (
    <div>
      <label className="block text-sm font-medium text-[#94A3B8] mb-2">{label}</label>
      <input
        type={sensitive ? 'password' : type}
        value={settings[keyName] ?? ''}
        onChange={(e) => update(keyName, e.target.value)}
        className="glass-input"
        placeholder={placeholder}
      />
      {hint && <p className="text-[10px] text-[#64748B] mt-1.5">{hint}</p>}
    </div>
  );

  const ToggleField = ({ label, keyName, hint = '' }: any) => {
    const isOn = settings[keyName] === 'True' || settings[keyName] === true;
    return (
      <div>
        <label className="block text-sm font-medium text-[#94A3B8] mb-2">{label}</label>
        <button
          onClick={() => update(keyName, isOn ? 'False' : 'True')}
          className={`w-12 h-6 rounded-full transition-colors ${isOn ? 'bg-emerald-500' : 'bg-[#374151]'}`}
        >
          <div className={`w-5 h-5 rounded-full bg-white transform transition-transform ${isOn ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
        {hint && <p className="text-[10px] text-[#64748B] mt-1.5">{hint}</p>}
      </div>
    );
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Sozlamalar</h1>
          <p className="text-sm text-[#64748B]">Sayt va server sozlamalari</p>
        </div>
        <div className="flex items-center gap-3">
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

      <div className="space-y-6">

        {/* ========== SITE SETTINGS ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-8">
          <div className="flex items-center gap-3 mb-6">
            <FiServer className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Sayt sozlamalari</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Sayt nomi" keyName="site_name" />
            <InputField label="Valyuta" keyName="currency" placeholder="UZS" />
            <div className="md:col-span-2">
              <InputField label="Sayt tavsifi" keyName="site_description" />
            </div>
            <InputField label="Qo'llab-quvvatlash Telegram" keyName="support_telegram" placeholder="@topuphub" />
            <ToggleField label="Texnik xizmat rejimi" keyName="maintenance_mode" hint="Yoqilganda faqat admin panel ishlaydi" />
          </div>
        </motion.div>

        {/* ========== DJANGO SERVER ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="glass-card p-8 border-l-4 border-l-[#F59E0B]">
          <div className="flex items-center gap-3 mb-6">
            <FiShield className="w-5 h-5 text-[#F59E0B]" />
            <h2 className="text-lg font-bold text-white">Django server sozlamalari</h2>
          </div>
          <div className="bg-[#F59E0B]/10 border border-[#F59E0B]/20 rounded-xl p-4 mb-6 flex items-start gap-3">
            <FiAlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />
            <p className="text-xs text-[#F59E0B]/80">
              <strong>Diqqat!</strong> Bu sozlamalar server xavfsizligiga ta'sir qiladi.
              Production da <strong>DEBUG</strong> ni <code>False</code> qiling va kuchli <strong>SECRET_KEY</strong> ishlating.
              O'zgarishlar kuchga kirishi uchun <strong>.env ga yozish</strong> tugmasini bosing va serverni qayta ishga tushiring.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <InputField
                label="DJANGO_SECRET_KEY"
                keyName="django_secret_key"
                sensitive
                placeholder="bo'sh qoldirilsa default ishlatiladi"
                hint="50+ belgidan iborat random kalit. Hech kimga bermang!"
              />
            </div>
            <ToggleField
              label="DEBUG (xatoliklar ko'rinishi)"
              keyName="debug"
              hint="Production da False qilish majburiy!"
            />
            <InputField
              label="ALLOWED_HOSTS"
              keyName="allowed_hosts"
              placeholder="localhost,127.0.0.1,example.com"
              hint="Vergul bilan ajrating. Masalan: example.com,www.example.com"
            />
          </div>
        </motion.div>

        {/* ========== CORS ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="glass-card p-8 border-l-4 border-l-[#00F5FF]">
          <div className="flex items-center gap-3 mb-6">
            <FiLink className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">CORS sozlamalari</h2>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <InputField
              label="CORS_ALLOWED_ORIGINS"
              keyName="cors_allowed_origins"
              placeholder="http://localhost:3000,http://localhost:8000"
              hint="Frontend domenlari. Vergul bilan ajrating. Masalan: https://mening-saytim.uz"
            />
          </div>
        </motion.div>

        {/* ========== DATABASE ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="glass-card p-8 border-l-4 border-l-[#8B5CF6]">
          <div className="flex items-center gap-3 mb-6">
            <FiDatabase className="w-5 h-5 text-[#8B5CF6]" />
            <h2 className="text-lg font-bold text-white">Ma'lumotlar bazasi</h2>
          </div>
          <div className="bg-[#8B5CF6]/10 border border-[#8B5CF6]/20 rounded-xl p-4 mb-6 flex items-start gap-3">
            <FiAlertTriangle className="w-5 h-5 text-[#8B5CF6] shrink-0 mt-0.5" />
            <p className="text-xs text-[#8B5CF6]/80">
              PostgreSQL ma'lumotlar bazasi sozlamalari. Agar bo'sh qoldirilsa, SQLite ishlatiladi.
              O'zgarishlar kuchga kirishi uchun serverni qayta ishga tushiring.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="DB_NAME" keyName="db_name" placeholder="topup_hub" />
            <InputField label="DB_USER" keyName="db_user" placeholder="postgres" />
            <InputField label="DB_PASSWORD" keyName="db_password" sensitive placeholder="postgres" />
            <InputField label="DB_HOST" keyName="db_host" placeholder="localhost" />
            <InputField label="DB_PORT" keyName="db_port" placeholder="5432" />
          </div>
        </motion.div>

        {/* ========== TELEGRAM ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="glass-card p-8">
          <div className="flex items-center gap-3 mb-6">
            <FiServer className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Telegram Bot</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField
              label="Bot Token"
              keyName="telegram_bot_token"
              sensitive
              placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
              hint="BotFather dan olingan token"
            />
            <InputField
              label="Bot Username"
              keyName="telegram_bot_username"
              placeholder="my_topup_bot"
              hint="@ belgisiz"
            />
          </div>
        </motion.div>

        {/* ========== EMAIL ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="glass-card p-8">
          <div className="flex items-center gap-3 mb-6">
            <FiServer className="w-5 h-5 text-[#00F5FF]" />
            <h2 className="text-lg font-bold text-white">Email (SMTP)</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="SMTP Host" keyName="email_smtp_host" placeholder="smtp.gmail.com" />
            <InputField label="SMTP Port" keyName="email_smtp_port" placeholder="587" />
            <InputField label="SMTP User" keyName="email_smtp_user" />
            <InputField label="SMTP Password" keyName="email_smtp_password" sensitive />
          </div>
        </motion.div>

        {/* ========== PAYMENT GATEWAYS ========== */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="glass-card p-8 border-l-4 border-l-[#10B981]">
          <div className="flex items-center gap-3 mb-6">
            <FiCreditCard className="w-5 h-5 text-[#10B981]" />
            <h2 className="text-lg font-bold text-white">To'lov tizimlari kalitlari (ma'lumot uchun)</h2>
          </div>
          <div className="bg-[#10B981]/10 border border-[#10B981]/20 rounded-xl p-4 mb-6 flex items-start gap-3">
            <FiCheckCircle className="w-5 h-5 text-[#10B981] shrink-0 mt-0.5" />
            <p className="text-xs text-[#10B981]/80">
              Platformada hozirda faqat <strong>balans orqali to'lov</strong> tizimi ishlaydi.
              Quyidagi kalitlar faqat ma'lumot uchun saqlanadi va .env fayliga yoziladi.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-xl bg-[#1E293B]/50 border border-[#334155]">
              <h3 className="text-sm font-semibold text-white mb-3">Click</h3>
              <div className="space-y-3">
                <InputField label="Merchant ID" keyName="click_merchant_id" placeholder="12345" />
                <InputField label="Secret Key" keyName="click_secret_key" sensitive />
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#1E293B]/50 border border-[#334155]">
              <h3 className="text-sm font-semibold text-white mb-3">Payme</h3>
              <div className="space-y-3">
                <InputField label="Merchant ID" keyName="payme_merchant_id" placeholder="5e1f3...a1b2c" />
                <InputField label="Secret Key" keyName="payme_secret_key" sensitive />
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[#1E293B]/50 border border-[#334155]">
              <h3 className="text-sm font-semibold text-white mb-3">Uzum</h3>
              <div className="space-y-3">
                <InputField label="Merchant ID" keyName="uzum_merchant_id" placeholder="12345" />
                <InputField label="Secret Key" keyName="uzum_secret_key" sensitive />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ========== INFO ========== */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="glass-card p-6">
          <div className="flex items-start gap-3">
            <FiAlertTriangle className="w-5 h-5 text-[#F59E0B] shrink-0 mt-0.5" />
            <div className="text-xs text-[#64748B] leading-relaxed">
              <p className="mb-1"><strong>O'zgarishlarni qo'llash tartibi:</strong></p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Yuqoridagi maydonlarni to'ldiring va <strong>"Saqlash"</strong> tugmasini bosing (ma'lumotlar bazasiga yoziladi)</li>
                <li><strong>".env ga yozish"</strong> tugmasini bosing (faylga yoziladi)</li>
                <li>Serverni qayta ishga tushiring (backend terminalida <code>Ctrl+C</code> va <code>python manage.py runserver</code>)</li>
              </ol>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
