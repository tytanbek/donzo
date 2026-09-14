'use client';

import React, { useState, useEffect } from 'react';
import { FiCalendar, FiGift, FiClock, FiCheck, FiEdit2, FiSave } from 'react-icons/fi';
import api from '@/lib/api';
import toast from 'react-hot-toast';

interface BirthdayRewardData {
  coupon_code: string;
  discount_percent: number;
  status: string;
  issued_at: string;
  expires_at: string;
  is_valid: boolean;
  remaining_seconds: number;
}

interface BirthdayStatus {
  has_birthday: boolean;
  is_today: boolean;
  next_birthday_days: number | null;
  next_birthday_date: string | null;
  active_reward: BirthdayRewardData | null;
  birthday_date: string | null;
}

const MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export default function BirthdaySection() {
  const [status, setStatus] = useState<BirthdayStatus | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [dateInput, setDateInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchStatus = async () => {
    try {
      const res = await api.get('/birthday/status/');
      setStatus(res.data);
      if (res.data.birthday_date) {
        const d = new Date(res.data.birthday_date);
        setDateInput(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchStatus(); }, []);

  useEffect(() => {
    if (!status?.active_reward?.is_valid) return;
    const iv = setInterval(() => {
      setStatus(prev => {
        if (!prev?.active_reward) return prev;
        const rem = prev.active_reward.remaining_seconds - 1;
        if (rem <= 0) return { ...prev, active_reward: { ...prev.active_reward, is_valid: false, remaining_seconds: 0 } };
        return { ...prev, active_reward: { ...prev.active_reward, remaining_seconds: rem } };
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [status?.active_reward?.is_valid]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put('/birthday/profile/', { birthday_date: dateInput || null });
      toast.success("Tug'ilgan kun saqlandi");
      setIsEditing(false);
      fetchStatus();
    } catch { toast.error('Xatolik'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
            <FiCalendar className="w-5 h-5 text-pink-400" />
          </div>
          <p className="text-sm text-[#9CA3AF]">Yuklanmoqda...</p>
        </div>
      </div>
    );
  }

  // Edit mode
  if (isEditing) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <FiCalendar className="w-4 h-4 text-pink-400" />
          {"Tug'ilgan kunni kiriting"}
        </h3>
        <input type="date" value={dateInput} onChange={e => setDateInput(e.target.value)} className="glass-input w-full mb-3" />
        <p className="text-xs text-[#9CA3AF] mb-4">
          {"Tug'ilgan kuningiz faqat avtomatik tabrik uchun ishlatiladi. Boshqa foydalanuvchilarga ko'rsatilmaydi."}
        </p>
        <div className="flex gap-3">
          <button onClick={handleSave} disabled={saving} className="glow-btn flex items-center gap-2 px-4 py-2 text-sm">
            <FiSave className="w-4 h-4" /> {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
          <button onClick={() => setIsEditing(false)} className="glow-btn-outline px-4 py-2 text-sm">Bekor qilish</button>
        </div>
      </div>
    );
  }

  // No birthday set
  if (!status?.has_birthday) {
    return (
      <div className="glass-card p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
              <FiCalendar className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">{"Tug'ilgan kunim"}</h3>
              <p className="text-xs text-[#9CA3AF]">Sana kiritilmagan</p>
            </div>
          </div>
          <button onClick={() => setIsEditing(true)} className="glow-btn-outline flex items-center gap-2 px-3 py-2 text-xs">
            <FiEdit2 className="w-3.5 h-3.5" /> Qo'shish
          </button>
        </div>
      </div>
    );
  }

  // Birthday set — show status
  return (
    <div className="space-y-3">
      {/* Birthday Info */}
      <div className="glass-card p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-pink-500/10 to-purple-500/10 rounded-full blur-[40px]" />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-purple-500/20 flex items-center justify-center">
                <FiCalendar className="w-5 h-5 text-pink-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">{"Tug'ilgan kunim"}</h3>
                <p className="text-xs text-[#9CA3AF]">{formatDate(status.birthday_date)}</p>
              </div>
            </div>
            <button onClick={() => setIsEditing(true)} className="glow-btn-outline flex items-center gap-2 px-3 py-2 text-xs">
              <FiEdit2 className="w-3.5 h-3.5" />
            </button>
          </div>
          {status.is_today ? (
            <div className="bg-gradient-to-r from-pink-500/10 to-purple-500/10 rounded-xl p-4 border border-pink-500/20">
              <p className="text-sm font-bold text-pink-300 mb-1">
                {"\u{1F382} Bugun tug'ilgan kuningiz!"}
              </p>
              <p className="text-xs text-[#9CA3AF]">Tabriklarimizni qabul qiling!</p>
            </div>
          ) : (
            <div className="bg-white/5 rounded-xl p-4">
              <p className="text-xs text-[#9CA3AF]">
                {"Keyingi tug'ilgan kuningizgacha "}
                <span className="text-white font-bold">{status.next_birthday_days}</span>
                {" kun qoldi"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Active Reward */}
      {status.active_reward?.is_valid && (
        <div className="glass-card p-6 relative overflow-hidden border border-pink-500/20">
          <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-pink-500/15 to-yellow-500/15 rounded-full blur-[40px]" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500/20 to-yellow-500/20 flex items-center justify-center">
                <FiGift className="w-5 h-5 text-pink-400" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Birthday Reward</h3>
                <p className="text-xs text-[#9CA3AF]">Maxsus sovga</p>
              </div>
            </div>
            <div className="bg-gradient-to-r from-pink-500/10 to-yellow-500/10 rounded-xl p-4 border border-pink-500/20 mb-3">
              <p className="text-2xl font-bold text-white mb-1">
                10% <span className="text-sm font-normal text-[#9CA3AF]">CHEGIRMA</span>
              </p>
              <p className="text-xs text-pink-300">
                Kod: <span className="font-mono">{status.active_reward.coupon_code}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <FiClock className="w-4 h-4 text-pink-400" />
              <span className="text-white font-mono">{formatTime(status.active_reward.remaining_seconds)}</span>
              <span className="text-[#9CA3AF]">qoldi</span>
            </div>
          </div>
        </div>
      )}

      {/* Inactive reward */}
      {status.active_reward && !status.active_reward.is_valid && (
        <div className="glass-card p-4 opacity-60">
          <div className="flex items-center gap-2">
            <FiCheck className="w-4 h-4 text-[#9CA3AF]" />
            <p className="text-xs text-[#9CA3AF]">
              {"Birthday chegirmasi ishlatildi yoki muddati tugadi"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
