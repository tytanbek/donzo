'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FiCheck, FiClock, FiPlus, FiZap, FiGift, FiAward, FiAlertCircle, FiRotateCcw, FiHeadphones } from 'react-icons/fi';
import { useStore } from '@/lib/store';
import { balanceAPI, authAPI } from '@/lib/api';
import toast from 'react-hot-toast';
import { BOT_URL } from '@/lib/brand';

const presetAmounts = [10000, 25000, 50000, 100000, 200000, 500000];

const GIFT_TABS = [
  { key: 'gifts', label: 'Giftlar', icon: FiGift },
  { key: 'nft', label: 'NFT', icon: FiAward },
];

export default function BalancePage() {
  const { user, isAuthenticated, setUser } = useStore();
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentResult, setPaymentResult] = useState<any>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('gifts');
  // Card-payment live state: 'waiting' → poll until paid / expired
  const [cardState, setCardState] = useState<'waiting' | 'paid' | 'expired'>('waiting');
  const [secondsLeft, setSecondsLeft] = useState(0);

  // When the platform uses the unique-amount card flow, poll the request
  // status every 5s: the user client credits the balance automatically the
  // moment the exact amount arrives.
  useEffect(() => {
    if (!paymentResult?.requires_unique_payment || !paymentResult?.balance_tx_id) return;
    setCardState('waiting');

    const tick = () => {
      const exp = paymentResult.expires_at ? new Date(paymentResult.expires_at).getTime() : 0;
      const left = Math.max(0, Math.floor((exp - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) setCardState('expired');
    };
    tick();
    const timer = setInterval(tick, 1000);

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await balanceAPI.topUpStatus(paymentResult.balance_tx_id);
        if (cancelled) return;
        if (res.data.status === 'completed') {
          setCardState('paid');
          setPaymentResult((pr: any) => ({ ...pr, balance_after: res.data.balance_after }));
          try { const p = await authAPI.profile(); setUser(p.data); } catch (e) { /* ignore */ }
        } else if (res.data?.card_request?.status === 'expired' || res.data.status === 'cancelled') {
          setCardState('expired');
        }
      } catch (e) { /* transient — keep polling */ }
    };
    poll();
    const poller = setInterval(poll, 5000);

    return () => { cancelled = true; clearInterval(timer); clearInterval(poller); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentResult?.balance_tx_id, paymentResult?.requires_unique_payment]);



  const getAmount = () => {
    if (customAmount) return parseFloat(customAmount);
    return amount || 0;
  };

  // A fresh key per top-up attempt makes the backend idempotent: retrying the
  // SAME request (network retry / double-click) can never credit balance twice.
  const genIdemKey = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const handleTopUp = async () => {
    const finalAmount = getAmount();
    if (finalAmount < 1000) {
      toast.error('Minimal to\'lov miqdori 1 000 so\'m');
      return;
    }
    if (finalAmount > 100000000) {
      toast.error('Maksimal to\'lov miqdori 100 000 000 so\'m');
      return;
    }

    const idemKey = genIdemKey();
    setIsSubmitting(true);
    setPaymentError(null);
    try {
      const res = await balanceAPI.topUp({ amount: finalAmount, idempotency_key: idemKey });
      setPaymentResult(res.data);
      try {
        const profileRes = await authAPI.profile();
        setUser(profileRes.data);
      } catch (e) { /* ignore */ }
      // SECURITY: top-ups now require admin approval (no instant free money).
      if (res.data?.requires_approval) {
        toast(`So'rov yuborildi — admin tasdiqlagach balansga tushadi`, { duration: 6000, icon: '🟡' });
      } else if (!res.data?.idempotent) {
        toast.success(`Balansingiz ${Number(finalAmount).toLocaleString()} so'mga to'ldirildi!`, { duration: 5000 });
      }
    } catch (e: any) {
      const msg = e.response?.data?.detail || 'Xatolik yuz berdi';
      setPaymentError(msg);
      toast.error(msg, { duration: 5000 });
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const res = await balanceAPI.history();
      setHistory(res.data.results || res.data);
    } catch (e) { /* ignore */ }
  };

  useEffect(() => {
    if (showHistory) fetchHistory();
  }, [showHistory]);

  // DEMO MODE: layout avtomatik demo-login qiladi — yuklanayotganda spinner.
  if (!isAuthenticated || !user) {
    return <div className="px-4 pt-6 pb-6"><div className="max-w-md mx-auto glass-card p-8 text-center text-sm text-[#9CA3AF]">Yuklanmoqda...</div></div>;
  }

  return (
    <div>
      {/* ═══ Balance Card ═══ */}
      <div className="mini-balance-hero">
        <div className="mini-balance-label">Joriy balans</div>
        <div className="mini-balance-value">
          {Number(user.balance || 0).toLocaleString()}
        </div>
        <div className="mini-balance-unit">so'm</div>
      </div>

      {paymentError ? (
        /* ═══ Error State — retry + operator contact ═══ */
        <div className="px-4 pt-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mini-panel text-center py-10 px-6"
          >
            <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
              <FiAlertCircle className="w-8 h-8 text-red-400" />
            </div>
            <h2 className="text-lg font-bold text-white mb-2">To'lov amalga oshmadi</h2>
            <p className="text-sm text-[#9CA3AF] mb-6 break-words">
              {paymentError}
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setPaymentError(null)}
                className="pill-btn !py-3.5 !text-sm"
              >
                <FiRotateCcw className="w-4 h-4" />
                Qayta urinib ko'rish
              </button>
              <a
                href={BOT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="pill-btn pill-btn-ghost !py-3.5 !text-sm"
              >
                <FiHeadphones className="w-4 h-4" />
                Operatorga yozish
              </a>
            </div>
          </motion.div>
        </div>
      ) : !paymentResult ? (
        <>
          {/* ═══ 2 Tabs: Giftlar / NFT ═══ */}
          <div className="tab-row !pt-4">
            {GIFT_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`order-tab flex items-center gap-1.5 ${activeTab === tab.key ? 'active' : ''}`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'gifts' ? (
            <div className="px-4 pt-4">
              {/* ═══ Available Gifts — amount selection ═══ */}
              <div className="mini-panel mb-4">
                <div className="mini-panel-title">
                  <FiPlus className="w-4 h-4 text-[#2DD4BF]" />
                  Mavjud giftlar — miqdorni tanlang
                </div>

                <div className="amount-grid mb-4">
                  {presetAmounts.map((preset) => (
                    <button
                      key={preset}
                      onClick={() => { setAmount(preset); setCustomAmount(''); }}
                      className={`amount-chip ${amount === preset && !customAmount ? 'active' : ''}`}
                    >
                      <div className="amount-chip-value">{preset.toLocaleString()}</div>
                      <div className="amount-chip-unit">so'm</div>
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <input
                    type="number"
                    placeholder="Boshqa miqdor..."
                    value={customAmount}
                    onChange={(e) => { setCustomAmount(e.target.value); setAmount(null); }}
                    className="glass-input !rounded-2xl pl-12 text-lg"
                    min="1000"
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-[#9CA3AF]">
                    so'm
                  </span>
                </div>

                <div className="flex justify-between items-center mt-2">
                  <p className="text-[11px] text-[#9CA3AF]">Min: 1 000 so'm</p>
                  <p className="text-[11px] text-[#9CA3AF]">Max: 100 000 000 so'm</p>
                </div>
              </div>

              {/* ═══ Info Note ═══ */}
              <div className="mini-panel mb-4 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2DD4BF]/15 to-[#6366F1]/15 flex items-center justify-center text-lg flex-shrink-0">
                  💰
                </div>
                <div>
                  <p className="text-sm font-semibold text-white mb-0.5">To'g'ridan-to'g'ri to'lov</p>
                  <p className="text-xs text-[#9CA3AF] leading-relaxed">
                    Balans bir zumda to'ldiriladi va tarixga yoziladi. Keyin xaridlar balansdan amalga oshadi.
                  </p>
                </div>
              </div>

              {/* ═══ Top Up Button ═══ */}
              <button
                onClick={handleTopUp}
                disabled={isSubmitting || getAmount() < 1000}
                className="pill-btn !py-4 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-[#0B0F1A] rounded-full animate-spin" />
                ) : (
                  <>
                    <FiZap className="w-5 h-5" />
                    Balansni to'ldirish — {getAmount().toLocaleString()} so'm
                  </>
                )}
              </button>
            </div>
          ) : (
            /* ═══ NFT tab — premium empty state ═══ */
            <div className="pt-5">
              <div className="premium-empty">
                <div className="premium-empty-icon">🖼️</div>
                <div className="premium-empty-title">NFT giftlar</div>
                <div className="premium-empty-sub">
                  NFT kolleksiyalari hozircha mavjud emas. Tez orada!
                </div>
              </div>
            </div>
          )}

          {/* ═══ My Gifts — history ═══ */}
          {activeTab === 'gifts' && (
            <div className="px-4 pt-3">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="mini-panel w-full text-left flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <FiClock className="w-4 h-4 text-[#9CA3AF]" />
                  <span className="text-sm text-white">Mening giftlarim — tarix</span>
                </div>
                <span className={`text-[#9CA3AF] transition-transform duration-200 inline-block ${showHistory ? 'rotate-180' : ''}`}>
                  ▾
                </span>
              </button>

              {showHistory && (
                <div className="pt-3">
                  {history.length === 0 ? (
                    <div className="premium-empty !my-0 !py-8">
                      <div className="premium-empty-title !text-sm">To'lov tarixi mavjud emas</div>
                    </div>
                  ) : (
                    history.map((tx: any) => (
                      <div key={tx.id} className="mini-panel mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center text-base flex-shrink-0 ${
                            tx.tx_type === 'topup' ? 'from-[#2DD4BF]/20 to-teal-500/20' :
                            tx.tx_type === 'purchase' ? 'from-[#6366F1]/20 to-indigo-500/20' : 'from-[#2DD4BF]/20 to-[#6366F1]/20'
                          }`}>
                            {tx.tx_type === 'topup' ? '💰' : tx.tx_type === 'purchase' ? '🛒' : '🔄'}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-white font-medium truncate">
                              {tx.tx_type === 'topup' ? "Balans to'ldirish" :
                               tx.tx_type === 'purchase' ? 'Xarid' :
                               tx.tx_type === 'cashback' ? 'Cashback' : tx.tx_type}
                            </p>
                            <p className="text-[11px] text-[#9CA3AF]">
                              {new Date(tx.created_at).toLocaleString('uz-UZ')}
                            </p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-bold ${tx.amount > 0 ? 'text-[#34D399]' : 'text-red-400'}`}>
                            {tx.amount > 0 ? '+' : ''}{Number(tx.amount).toLocaleString()} so'm
                          </p>
                          <p className="text-[11px] text-[#9CA3AF]">
                            {tx.status === 'completed' ? '✅ Tugallangan' :
                             tx.status === 'pending' ? '🟡 Kutilmoqda' : '❌ Xatolik'}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </>
      ) : paymentResult.requires_unique_payment ? (
        /* ═══ Card payment — send the EXACT unique amount ═══ */
        <div className="px-4 pt-4">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mini-panel overflow-hidden">
            {cardState === 'paid' ? (
              <div className="mini-success !my-0">
                <div className="mini-success-icon"><FiCheck className="w-9 h-9" /></div>
                <h2 className="text-xl font-bold text-white mb-1">To'lov tasdiqlandi! 🎉</h2>
                <p className="text-sm text-[#9CA3AF] mb-5">
                  {Number(paymentResult.unique_amount).toLocaleString()} so'm hisobingizga avtomatik qo'shildi
                </p>
                <div className="mini-panel mb-6">
                  <p className="text-[11px] text-[#9CA3AF] mb-1">Yangi balans</p>
                  <p className="text-2xl font-bold gradient-text">
                    {Number(paymentResult.balance_after || user.balance).toLocaleString()} so'm
                  </p>
                </div>
                <div className="flex gap-3">
                  <button onClick={() => setPaymentResult(null)} className="pill-btn !py-3.5 flex-1 !text-sm">Yana to'ldirish</button>
                  <Link href="/" className="pill-btn pill-btn-ghost !py-3.5 flex-1 !text-sm">Xarid qilish</Link>
                </div>
              </div>
            ) : cardState === 'expired' ? (
              <div className="mini-success !my-0">
                <div className="mini-success-icon bg-red-500/15"><FiClock className="w-9 h-9 text-red-400" /></div>
                <h2 className="text-xl font-bold text-white mb-1">To'lov vaqti tugadi</h2>
                <p className="text-sm text-[#9CA3AF] mb-5">
                  {Number(paymentResult.unique_amount).toLocaleString()} so'm {paymentResult.timeout_minutes} daqiqa ichida
                  yuborilmadi — so'rov bekor qilindi. Qayta urinib ko'ring.
                </p>
                <div className="flex gap-3">
                  <button onClick={() => setPaymentResult(null)} className="pill-btn !py-3.5 flex-1 !text-sm">Qayta urinish</button>
                  <a href={BOT_URL} target="_blank" rel="noopener noreferrer" className="pill-btn pill-btn-ghost !py-3.5 flex-1 !text-sm">
                    <FiHeadphones className="w-4 h-4" /> Operator
                  </a>
                </div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="text-center pt-6 pb-1">
                  <h2 className="text-lg font-bold text-white mb-1">Kartaga to'lov qiling</h2>
                  <p className="text-xs text-[#9CA3AF]">
                    To'lov avtomatik tekshiriladi — balans bir zumda qo'shiladi
                  </p>
                </div>

                {/* EXACT amount — copy-friendly, huge */}
                <div className="px-5 py-4 mt-2">
                  <div className="rounded-3xl bg-gradient-to-br from-[#2DD4BF]/15 via-[#6366F1]/10 to-[#00F5FF]/15 border border-[#00F5FF]/25 p-5 text-center">
                    <p className="text-[11px] uppercase tracking-widest text-[#9CA3AF] mb-1.5">
                      AYNAN SHU SUMMANI YUBORING
                    </p>
                    <p className="text-4xl font-extrabold gradient-text tracking-tight">
                      {Number(paymentResult.unique_amount).toLocaleString()}
                    </p>
                    <p className="text-sm text-[#9CA3AF] mt-1">so'm</p>
                  </div>

                  {/* Card number */}
                  {paymentResult.card_number && (
                    <div className="mini-panel mt-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] text-[#9CA3AF] mb-0.5">Karta raqami</p>
                        <p className="text-base font-mono font-semibold text-white tracking-wider truncate">
                          {paymentResult.card_number}
                        </p>
                        {paymentResult.card_holder && (
                          <p className="text-[11px] text-[#64748B] mt-0.5">Egasi: {paymentResult.card_holder}</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Countdown */}
                  <div className="mt-3 rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 flex items-center justify-between">
                    <span className="text-xs text-[#9CA3AF] flex items-center gap-2">
                      <FiClock className="w-4 h-4 text-[#2DD4BF]" />
                      To'lov uchun qolgan vaqt
                    </span>
                    <span className={`text-lg font-bold tabular-nums ${secondsLeft <= 60 ? 'text-red-400' : 'text-white'}`}>
                      {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                    </span>
                  </div>

                  {/* Strict instructions */}
                  <div className="mt-3 rounded-2xl bg-amber-500/[0.07] border border-amber-500/20 p-3.5 flex items-start gap-3">
                    <FiAlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-[11px] text-[#9CA3AF] leading-relaxed">
                      <p className="text-amber-400 font-semibold mb-1">⚠️ QAT'IY TALAB:</p>
                      <p>• Aynan <b className="text-white">{Number(paymentResult.unique_amount).toLocaleString()} so'm</b> yuboring — boshqa summa hisobga tushmaydi.</p>
                      <p>• Summa identifikatsiya uchun noyob — siz uchun maxsus tanlangan.</p>
                      <p>• To'lov {paymentResult.timeout_minutes} daqiqa ichida bajarilishi shart.</p>
                      <p>• To'lov amalga oshgach balans avtomatik qo'shiladi (odatda 1 daqiqa).</p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </div>
      ) : (
        /* ═══ Success / Pending State (classic admin-approval) ═══ */
        <div className="mini-success">
          <div className={`mini-success-icon ${paymentResult.requires_approval ? 'bg-amber-500/15' : ''}`}>
            {paymentResult.requires_approval ? <FiClock className="w-9 h-9 text-amber-400" /> : <FiCheck className="w-9 h-9" />}
          </div>
          {paymentResult.requires_approval ? (
            <>
              <h2 className="text-xl font-bold text-white mb-1">So'rov yuborildi 🟡</h2>
              <p className="text-sm text-[#9CA3AF] mb-5">
                {Number(paymentResult.amount).toLocaleString()} so'm — admin tasdiqlagach balansingizga qo'shiladi.
                Odatda bir necha daqiqa ichida tasdiqlanadi.
              </p>
              <div className="mini-panel mb-6 flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0 text-lg">
                  ⏳
                </div>
                <p className="text-xs text-[#9CA3AF] leading-relaxed">
                  To'lovni operatorga o'tkazganingizdan so'ng, operator so'rovni
                  admin panelda tasdiqlaydi va balans bir zumda ko'rinadi.
                </p>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-white mb-1">Balans to'ldirildi!</h2>
              <p className="text-sm text-[#9CA3AF] mb-5">
                {Number(paymentResult.amount).toLocaleString()} so'm hisobingizga qo'shildi
              </p>
              <div className="mini-panel mb-6">
                <p className="text-[11px] text-[#9CA3AF] mb-1">Yangi balans</p>
                <p className="text-2xl font-bold gradient-text">
                  {Number(paymentResult.balance_after || user.balance).toLocaleString()} so'm
                </p>
              </div>
            </>
          )}

          <div className="flex gap-3">
            <button onClick={() => setPaymentResult(null)} className="pill-btn !py-3.5 flex-1 !text-sm">
              {paymentResult.requires_approval ? 'Yana so\u0027rov' : 'Yana to\u0027ldirish'}
            </button>
            <Link href="/" className="pill-btn pill-btn-ghost !py-3.5 flex-1 !text-sm">
              Xarid qilish
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
