'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FiCopy, FiUsers, FiDollarSign, FiGift, FiTrendingUp, FiAward, FiExternalLink } from 'react-icons/fi';
import { referralAPI } from '@/lib/api';
import toast from 'react-hot-toast';

interface ReferralSectionProps {
  user: any;
  copyReferral: () => void;
}

export default function ReferralSection({ user, copyReferral }: ReferralSectionProps) {
  const [stats, setStats] = useState<any>(null);
  const [referrals, setReferrals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [showReferrals, setShowReferrals] = useState(false);
  const [applyCode, setApplyCode] = useState('');
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes] = await Promise.all([
          referralAPI.stats(),
        ]);
        setStats(statsRes.data);
      } catch (e) {
        // Silent fail - referral system may not be configured
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const fetchReferrals = async () => {
    try {
      const res = await referralAPI.myReferrals();
      setReferrals(res.data.results || []);
    } catch (e) {
      toast.error('Referallarni yuklashda xatolik');
    }
  };

  const handleClaim = async () => {
    setIsClaiming(true);
    try {
      const res = await referralAPI.claimBonus();
      toast.success(res.data.detail);
      // Refresh stats
      const statsRes = await referralAPI.stats();
      setStats(statsRes.data);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setIsClaiming(false);
    }
  };

  const handleApplyCode = async () => {
    if (!applyCode.trim()) {
      toast.error('Referral kodni kiriting');
      return;
    }
    setIsApplying(true);
    try {
      const res = await referralAPI.applyCode(applyCode.trim().toUpperCase());
      toast.success(res.data.detail);
      setApplyCode('');
      // Refresh
      const statsRes = await referralAPI.stats();
      setStats(statsRes.data);
    } catch (e: any) {
      toast.error(e.response?.data?.detail || 'Xatolik yuz berdi');
    } finally {
      setIsApplying(false);
    }
  };

  // Login removed — referral links point at the home page (auto-login via
  // Telegram picks the user up; ?ref= is preserved for the backend flow).
  const referralLink = stats?.referral_link || `${window.location.origin}/?ref=${user.referral_code}`;

  if (user.role !== 'customer') return null;

  return (
    <div className="space-y-4">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card p-6 relative overflow-hidden"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-[#2DD4BF]/5 to-[#6366F1]/5 rounded-full blur-[40px]" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6">
            <FiAward className="w-6 h-6 text-[#2DD4BF]" />
            <h2 className="text-lg font-bold text-white">Referral Tizimi</h2>
            <span className="px-2 py-0.5 rounded-md bg-[#2DD4BF]/10 text-[10px] text-[#2DD4BF] font-orbitron border border-[#2DD4BF]/20">
              {stats?.bonus_percent || 5}% CASHBACK
            </span>
          </div>

          {/* Stats */}
          {!isLoading && stats && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              <div className="p-4 rounded-xl bg-white/5 text-center">
                <p className="text-2xl font-bold text-white">{stats.total_referrals}</p>
                <p className="text-xs text-[#64748B]">Takliflar</p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 text-center">
                <p className="text-2xl font-bold gradient-text-gold">{Number(stats.total_cashback_earned || 0).toLocaleString()}</p>
                <p className="text-xs text-[#64748B]">Cashback</p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 text-center">
                <p className="text-2xl font-bold gradient-text-gold">{Number(stats.available_cashback || 0).toLocaleString()}</p>
                <p className="text-xs text-[#64748B]">Mavjud</p>
              </div>
              <div className="p-4 rounded-xl bg-white/5 text-center">
                <p className="text-2xl font-bold text-[#94A3B8]">{Number(stats.total_referred_spent || 0).toLocaleString()}</p>
                <p className="text-xs text-[#64748B]">Do'stlar sarfi</p>
              </div>
            </div>
          )}

          {/* Referral Code + Share */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="flex-1 p-4 rounded-2xl bg-gradient-to-br from-[#2DD4BF]/5 to-[#6366F1]/5 border border-[#2DD4BF]/10">
              <p className="text-xs text-[#64748B] mb-1">Referral kodingiz</p>
              <div className="flex items-center justify-between">
                <code className="text-xl font-mono font-bold text-[#2DD4BF]">{user.referral_code}</code>
                <div className="flex gap-2">
                  <button onClick={copyReferral} className="p-2 rounded-lg bg-[#2DD4BF]/10 text-[#2DD4BF] hover:bg-[#2DD4BF]/20 transition-all" title="Nusxalash">
                    <FiCopy className="w-4 h-4" />
                  </button>
                  <button onClick={() => {
                    navigator.clipboard.writeText(referralLink);
                    toast.success('Referral havola nusxalandi');
                  }} className="p-2 rounded-lg bg-[#00F5FF]/10 text-[#00F5FF] hover:bg-[#00F5FF]/20 transition-all" title="Havolani nusxalash">
                    <FiExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs text-[#64748B] mt-2">
                Do'stlaringizni taklif qiling va ularning <span className="text-[#2DD4BF] font-bold">10,000 so'mdan yuqori</span> har bir buyurtmasidan <span className="text-[#2DD4BF] font-bold">{stats?.bonus_percent || 5}%</span> cashback oling!
              </p>
            </div>
          </div>

          {/* ═══ Milestone gift: 30 friends → 1 month Telegram Premium ═══ */}
          {stats && (
            <div className="p-4 rounded-2xl bg-gradient-to-br from-[#A855F7]/10 to-[#00F5FF]/5 border border-[#A855F7]/20 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-[#E9D5FF]">🎁 {stats.reward_label} sovg'a</p>
                {stats.rewards_granted > 0 && (
                  <span className="px-2 py-0.5 rounded-md bg-[#A855F7]/20 text-[10px] text-[#E9D5FF] font-bold">
                    {stats.rewards_granted}× berildi
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] text-[#94A3B8] mb-1.5">
                <span>{stats.milestone_progress} / {stats.milestone_every} do'st</span>
                <span>Keyingi sovg'a: {stats.next_milestone} ta do'st</span>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#A855F7] to-[#00F5FF] transition-all duration-700"
                  style={{ width: `${Math.min(100, (stats.milestone_progress / stats.milestone_every) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Claim Cashback Button (min 1,000 so'm — backend rule) */}
          {stats?.available_cashback >= 1000 && (
            <button
              onClick={handleClaim}
              disabled={isClaiming}
              className="glow-btn w-full py-3 text-sm flex items-center justify-center gap-2 mb-4"
            >
              {isClaiming ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <><FiGift className="w-4 h-4" /> Cashback ni balansga o'tkazish ({Number(stats.available_cashback).toLocaleString()} so'm)</>
              )}
            </button>
          )}

          {/* Apply Referral Code (if user has no referrer) */}
          {!user.referred_by && (
            <div className="p-4 rounded-xl bg-white/5">
              <p className="text-xs text-[#64748B] mb-2">Kimdir sizni taklif qilganmi? Referral kodni kiriting:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Referral kod"
                  value={applyCode}
                  onChange={e => setApplyCode(e.target.value.toUpperCase())}
                  className="glass-input text-sm flex-1 uppercase"
                  maxLength={20}
                />
                <button
                  onClick={handleApplyCode}
                  disabled={isApplying || !applyCode.trim()}
                  className="glow-btn px-4 py-2 text-xs disabled:opacity-50"
                >
                  {isApplying ? '...' : 'Tasdiqlash'}
                </button>
              </div>
            </div>
          )}

          {/* Referrals List */}
          <button
            onClick={() => { setShowReferrals(!showReferrals); if (!showReferrals && referrals.length === 0) fetchReferrals(); }}
            className="flex items-center justify-between w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-sm"
          >
            <span className="flex items-center gap-2 text-[#94A3B8]">
              <FiUsers className="w-4 h-4" />
              Do'stlarim ({stats?.total_referrals || 0})
            </span>
            <FiTrendingUp className={`w-4 h-4 text-[#64748B] transition-transform ${showReferrals ? 'rotate-180' : ''}`} />
          </button>

          {showReferrals && (
            <div className="mt-3 space-y-2">
              {referrals.length === 0 ? (
                <p className="text-sm text-[#64748B] text-center py-4">Hozircha do'stlar yo'q. Referral kodingizni ulashing!</p>
              ) : (
                referrals.map((ref: any) => (
                  <div key={ref.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2DD4BF]/20 to-[#6366F1]/20 flex items-center justify-center text-sm">
                        {ref.username?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm text-white">{ref.username}</p>
                        <p className="text-xs text-[#64748B]">{new Date(ref.registered_at).toLocaleDateString('uz-UZ')}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-[#2DD4BF]">+{Number(ref.earned_cashback).toLocaleString()} so'm</p>
                      <p className="text-xs text-[#64748B]">{Number(ref.total_spent).toLocaleString()} so'm sarflagan</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
