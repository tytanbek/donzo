'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { FiLoader, FiAlertTriangle, FiExternalLink, FiCheck, FiLock } from 'react-icons/fi';
import { useStore } from '@/lib/store';
import { authAPI } from '@/lib/api';

/**
 * FragmentLogin — AVTO-KIRISH ekrani (username YO'Q).
 *
 * Yagona kirish yo'li — Telegram WebApp initData:
 *   1. Telegram ichida WebApp ochilganda `window.Telegram.WebApp.initData`
 *      mavjud → backend HMAC-SHA256 bilan tasdiqlaydi → avtomatik kirish.
 *   2. Telegram ichida bo'lmasa — foydalanuvchiga bot orqali ochish
 *      ko'rsatiladi (username kiritish YO'Q).
 *
 * XAVFSIZLIK: username-based login butunlay o'chirilgan (backend 403).
 * Aks holda har kim admin username'ini kiritib kirishi mumkin edi
 * (account takeover). Kirish faqat Telegram tomonidan imzolangan
 * initData orqali — foydalanuvchi hech narsa yozmaydi.
 */
export default function FragmentLogin() {
  const router = useRouter();
  const { setUser, setAuthChecked } = useStore();
  const [state, setState] = useState<'checking' | 'logging' | 'error' | 'outside'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const attemptedRef = useRef(false);
  const autoRetryRef = useRef(false);

  const goToPanel = (role: string) => {
    if (role === 'super_admin' || role === 'admin') router.push('/admin');
    else if (role === 'senior_operator' || role === 'operator') router.push('/operator');
    else if (role === 'support') router.push('/support');
    else router.push('/dashboard');
  };

  const tryAutoLogin = async (initData: string) => {
    setState('logging');
    setError(null);
    try {
      const res = await authAPI.initdataLogin(initData);
      const { access, refresh, user } = res.data;
      if (!access || !user) throw new Error('Javob to\'liq emas');
      localStorage.setItem('access_token', access);
      localStorage.setItem('refresh_token', refresh);
      // Anti-fraud metadata — fire-and-forget (login o'tgan, ahamiyatsiz).
      // try/catch bilan o'rab qo'yamiz: deviceInfo xatosi loginni bloklamasligi kerak.
      try {
        const tg = (window as any).Telegram?.WebApp;
        authAPI.deviceInfo({
          platform: String(tg?.platform || navigator.platform || '').slice(0, 100),
          language: navigator.language || '',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
          user_agent: navigator.userAgent || '',
        }).catch(() => {});
      } catch { /* ahamiyatsiz */ }
      setUser(user);
      setAuthChecked(true);
      // Clear force-logout flag — user successfully re-entered
      try { localStorage.removeItem('donzo_force_logout'); } catch { /* noop */ }
      goToPanel(user.role);
    } catch (e: any) {
      let detail = e?.response?.data?.detail || '';
      if (e?.code === 'ECONNABORTED' || e?.message?.includes('timeout')) {
        detail = 'Server javob bermadi (sovuq start). Qayta urinib ko\'ring.';
      } else if (!e?.response) {
        detail = 'Internet aloqasi yo\'q. Qayta urinib ko\'ring.';
      } else if (e?.response?.status === 403) {
        detail = detail || 'Telegram tasdiqlanmadi. Bot orqali WebApp\'ni qayta oching.';
      } else if (e?.response?.status >= 500) {
        detail = 'Server xatosi. Biroz kutib qayta urinib ko\'ring.';
      }
      if (!detail) detail = 'Avtomatik kirish amalga oshmadi. Qayta urinib ko\'ring.';
      // Cold start yoki tarmoq xatosi bo'lsa — 3 soniyadan keyin avtomatik qayta urinish (1 marta)
      const isTransient = e?.code === 'ECONNABORTED' || !e?.response || (e?.response?.status >= 500);
      if (isTransient && !autoRetryRef.current) {
        autoRetryRef.current = true;
        setState('checking');
        setError(null);
        setTimeout(() => {
          const tg2 = (window as any).Telegram?.WebApp;
          if (tg2?.initData) tryAutoLogin(tg2.initData);
        }, 3000);
        return;
      }
      setError(detail);
      setState('error');
    }
  };

  // ── AVTOMATIK KIRISH ────────────────────────────────────────────────────
  // Telegram SDK async yuklanadi — initData paydo bo'lishini 10s gacha kutamiz.
  // Telegram WebApp ochilganda SDK biroz kechikishi mumkin (network, CDN).
  // 10s yetarli — bundan keyin Telegram tashqarida ochilgan.
  useEffect(() => {
    if (attemptedRef.current) return;
    attemptedRef.current = true;

    // If user explicitly logged out, don't auto-login — show bot link instead
    try {
      if (localStorage.getItem('donzo_force_logout') === '1') {
        setState('outside');
        return;
      }
    } catch { /* noop */ }

    let tries = 0;
    let timer: number | undefined;
    const check = () => {
      tries += 1;
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.initData) {
        if (timer) window.clearInterval(timer);
        tryAutoLogin(tg.initData);
        return;
      }
      // 100ms × 100 = 10s — Telegram SDK yuklanishini kutish
      if (tries >= 100) {
        if (timer) window.clearInterval(timer);
        setState('outside');
      }
    };
    timer = window.setInterval(check, 100);
    check();
  }, [retryKey]);

  const retry = () => {
    attemptedRef.current = false;
    setState('checking');
    setError(null);
    setRetryKey((k) => k + 1);
  };

  return (
    <div className="cyber-grid min-h-screen flex items-center justify-center px-4">
      <div className="particles-bg" />
      <motion.div
        key={retryKey}
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass-card p-8 text-center relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-56 h-56 bg-gradient-to-br from-[#00F5FF]/15 to-[#A855F7]/20 rounded-full blur-[70px]" />

          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#00F5FF] to-[#A855F7] flex items-center justify-center mx-auto mb-5 shadow-lg shadow-[#00F5FF]/20">
            <span className="text-3xl font-black text-[#0B1220]">D</span>
          </div>
          <h1 className="text-2xl font-black gradient-text mb-1">DONZO</h1>

          {state === 'checking' || state === 'logging' ? (
            <>
              <p className="text-sm text-[#9CA3AF] mb-4 mt-6">
                {state === 'checking' ? 'Kirish tekshirilmoqda...' : 'Avtomatik kirish...'}
              </p>
              <div className="flex items-center justify-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                <FiLoader className="w-5 h-5 text-[#00F5FF] animate-spin" />
                <span className="text-sm text-white">Telegram orqali tasdiqlanmoqda</span>
              </div>
              <p className="text-[11px] text-[#64748B] mt-4">
                Hech narsa yozish shart emas — kirish avtomatik amalga oshadi
              </p>
            </>
          ) : state === 'error' ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-4 mt-4">
                <FiAlertTriangle className="w-7 h-7 text-red-400" />
              </div>
              <p className="text-sm font-bold text-white mb-1">Kirish amalga oshmadi</p>
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-300 leading-relaxed mb-6 mt-4">
                {error}
              </div>
              <button
                onClick={retry}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-[#00F5FF] to-[#A855F7] text-[#0B1220] font-bold hover:opacity-90 hover:scale-[1.01] transition-all duration-200"
              >
                <FiLoader className="w-5 h-5" />
                Qayta urinish
              </button>
              <p className="text-[11px] text-[#64748B] mt-4">
                Agar xato davom etsa — @DONZOROBOT orqali WebApp&apos;ni qayta oching
              </p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00F5FF]/15 to-[#34D399]/15 border border-[#00F5FF]/20 flex items-center justify-center mx-auto mb-4 mt-4">
                <FiLock className="w-7 h-7 text-[#00F5FF]" />
              </div>
              <p className="text-sm font-bold text-white mb-1">
                Kirish faqat Telegram orqali
              </p>
              <p className="text-[11px] text-[#64748B] mb-6 mt-3 leading-relaxed">
                DONZO platformasiga <b className="text-[#00F5FF]">@DONZOROBOT</b> orqali
                kiriladi. Bot&apos;ni oching va <b className="text-white">WebApp</b> tugmasini
                bosing — avtomatik kirasiz, hech narsa yozish shart emas.
              </p>
              <a
                href="https://t.me/DONZOROBOT"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-[#00F5FF] to-[#34D399] text-[#0B1220] font-bold hover:opacity-90 hover:scale-[1.01] transition-all duration-200"
              >
                <FiExternalLink className="w-5 h-5" />
                Bot&apos;ni ochish
              </a>
              <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-[#64748B]">
                <FiCheck className="w-3.5 h-3.5 text-[#2DD4BF]" />
                Xavfsiz — kirish Telegram tomonidan tasdiqlanadi
              </div>
            </>
          )}
        </div>

        <p className="text-center text-[11px] text-[#475569] mt-4">
          DONZO — o&apos;yinlar va raqamli xizmatlarga tez va xavfsiz top-up platformasi
        </p>
      </motion.div>
    </div>
  );
}