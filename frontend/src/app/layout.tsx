'use client';

import React, { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useStore, getPanelByRole } from '@/lib/store';
import { authAPI } from '@/lib/api';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import MiniAppShell from '@/components/MiniAppShell';
import ScrollToTop from '@/components/ScrollToTop';
import FloatingSupport from '@/components/FloatingSupport';
import WebSocketInit from '@/components/WebSocketInit';
import FragmentLogin from '@/components/FragmentLogin';
import { Toaster } from 'react-hot-toast';
import './globals.css';

// Routes that keep the classic desktop shell (staff panels only)
const CLASSIC_SHELL_PREFIXES = ['/admin', '/operator', '/support'];

const STAFF_ROLES = ['super_admin', 'admin', 'senior_operator', 'operator', 'support'];

function Particles() {
  useEffect(() => {
    const container = document.getElementById('particles-container');
    if (!container) return;
    const count = 30;
    for (let i = 0; i < count; i++) {
      const particle = document.createElement('div');
      particle.className = 'particle';
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.animationDelay = `${Math.random() * 15}s`;
      particle.style.animationDuration = `${12 + Math.random() * 10}s`;
      particle.style.width = `${1 + Math.random() * 2}px`;
      particle.style.height = particle.style.width;
      particle.style.opacity = `${0.2 + Math.random() * 0.4}`;
      container.appendChild(particle);
    }
    return () => {
      container.innerHTML = '';
    };
  }, []);

  return <div id="particles-container" className="particles-bg" />;
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, authChecked, setUser, setAuthChecked } = useStore();

  // ── Telegram WebApp initData ile avto-kirish (REAL LOGIN) ──
  // Agar foydalanuvchi Telegram ichida WebApp ochsa, `window.Telegram.WebApp.initData`
  // ichida sign相続 (signed data) mavjud. Backend HMAC-SHA256 bilan tasdiqlaydi:
  // bot token bilan yaratilgan signature mos keladigani — foydalanuvchi haqiqiy
  // Telegram foydalanuvchisi. Boshqa manbadan kelgan initData yolg'iz signature
  // bilan tasdiqlanmaydi (HMAC orqali).
  const _tryInitDataLogin = async () => {
    try {
      // Telegram WebApp SDK yuklandi?
      const tg = (window as any).Telegram?.WebApp;
      if (!tg?.initData) {
        // Telegram ichida emas yoki initData kelmagan — FragmentLogin chiqariladi.
        setAuthChecked(true);
        return;
      }

      // initData'ni olamiz (signed data) va backendga yuboramiz.
      const initData = tg.initData;
      if (!initData) {
        setAuthChecked(true);
        return;
      }

      const res = await authAPI.initdataLogin(initData);
      if (!res.data) {
        setAuthChecked(true);
        return;
      }

      // JWT tokenlarini saqlaymiz va foydalanuvchini set qilamiz.
      localStorage.setItem('access_token', res.data.access);
      localStorage.setItem('refresh_token', res.data.refresh);
      setUser(res.data.user);
      setAuthChecked(true);
    } catch {
      // initData avto-kirish ishlamasa (backend xato, signature noto'g'ri, 
      // yoki bot token yo'q) — hech qachon cheksiz loading'da qolmasligi
      // uchun authChecked'ni DOIM set qilamiz (FragmentLogin ko'rsatiladi).
      setAuthChecked(true);
    }
  };

  const isClassicShell = CLASSIC_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
  );

  // ── AUTH AVTO-KIRISH (Telegram ichida) ────────────────────────────────────
  // 1. Token bor → profil avtomatik yuklanadi (user id orqali aniqlanadi).
  // 2. Token yo'q → avval DEMO mode login qilinib ko'radi; muvaffaqiyatsiz bo'lsa
  //    Telegram ichida bo'lsa initData avto-kirish; hamma qatoridan qolsa →
  //    FragmentLogin ekrani ko'rsatiladi (keyword/userlookup).
  useEffect(() => {
    let cancelled = false;
    const token = localStorage.getItem('access_token');
    if (!token) {
      // 1-qadam: DEMO mode — lokal/debug'da avtomatik customer sifatida kirish.
      authAPI.demoLogin('customer')
        .then((res) => {
          if (cancelled) return;
          localStorage.setItem('access_token', res.data.access);
          localStorage.setItem('refresh_token', res.data.refresh);
          setUser(res.data.user);
          setAuthChecked(true);
        })
        .catch(() => {
          // Demo-login ishlamasa (prod/DEBUG=False) — keyingi qadam: initData.
          if (!cancelled) {
            _tryInitDataLogin();
          }
        });
      } else {
        // Token bor — profilni sinxronlashtirish.
        authAPI.profile()
          .then((res) => {
            if (cancelled) return;
            setUser(res.data);
            setAuthChecked(true);
          })
          .catch(() => {
            // Token eskirgan/noto'g'ri — tozalab, login ekraniga qaytamiz.
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            if (!cancelled) {
              setUser(null);
              setAuthChecked(true);
            }
          });
      }
    return () => {
      cancelled = true;
    };
  }, [setUser, setAuthChecked]);

  // ── Rol bo'yicha yo'naltirish ────────────────────────────────────────────
  // Staff paneldan tashqariga chiqolmaydi; mijoz staff panelga kira olmaydi.
  useEffect(() => {
    if (!user || !authChecked) return;
    const isStaff = STAFF_ROLES.includes(user.role);
    const onStaffPath = CLASSIC_SHELL_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
    );
    if (isStaff && !onStaffPath) {
      router.push(getPanelByRole(user.role));
    } else if (!isStaff && onStaffPath) {
      router.push('/');
    }
  }, [user, pathname, authChecked, router]);

  if (!authChecked) {
      return (
        <html lang="uz">
          <head>
            {/* Telegram SDK — FAQAT username'ni avtomatik o'qish uchun
                (kirish Fragment API orqali tasdiqlanadi, initData tekshirilmaydi) */}
            <script src="https://telegram.org/js/telegram-web-app.js" async />
            <title>DONZO - LEVEL UP YOUR GAME</title>
            <meta name="description" content="DONZO — o'yinlar va raqamli xizmatlarga tez, xavfsiz va qulay top-up platformasi" />
            <link rel="icon" href="/images/donzo.png" type="image/png" />
            <link rel="apple-touch-icon" href="/images/donzo.png" />
            <meta name="theme-color" content="#0F172A" />
          </head>
        <body className="cyber-grid min-h-screen">
          <div className="min-h-screen flex items-center justify-center">
            <div className="w-10 h-10 rounded-2xl border-2 border-[#00F5FF]/30 border-t-[#00F5FF] animate-spin" />
          </div>
        </body>
      </html>
    );
  }

  // Token yo'q — butun ilova login ekranini ko'rsatadi
  if (!isAuthenticated || !user) {
    return (
      <html lang="uz">
        <head>
            {/* Telegram SDK — FAQAT username'ni avtomatik o'qish uchun */}
            <script src="https://telegram.org/js/telegram-web-app.js" async />
          <title>DONZO - LEVEL UP YOUR GAME</title>
          <meta name="description" content="DONZO — o'yinlar va raqamli xizmatlarga tez, xavfsiz va qulay top-up platformasi" />
          <link rel="icon" href="/images/donzo.png" type="image/png" />
          <link rel="apple-touch-icon" href="/images/donzo.png" />
          <meta name="theme-color" content="#0F172A" />
        </head>
        <body className="cyber-grid min-h-screen">
          <FragmentLogin />
        </body>
      </html>
    );
  }

  return (
    <html lang="uz">
      <head>
        {/* Telegram SDK — FAQAT username'ni avtomatik o'qish uchun */}
        <script src="https://telegram.org/js/telegram-web-app.js" async />
        <title>DONZO - LEVEL UP YOUR GAME</title>
        <meta name="description" content="DONZO — o'yinlar va raqamli xizmatlarga tez, xavfsiz va qulay top-up platformasi" />
        <link rel="icon" href="/images/donzo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/images/donzo.png" />
        <meta name="theme-color" content="#0F172A" />
      </head>
      <body className="cyber-grid min-h-screen">
        <Particles />
        {isClassicShell ? (
          <div className="relative z-10 flex flex-col min-h-screen">
            <Header />
            <main className="flex-1">
              <Toaster
                position="top-right"
                toastOptions={{
                  style: {
                    background: '#111827',
                    color: '#F8FAFC',
                    border: '1px solid rgba(0, 245, 255, 0.1)',
                    borderRadius: '12px',
                  },
                }}
              />
              {/* Lightweight fade-in only — no exit-wait so navigation is instant */}
              <motion.div
                key={pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
              >
                {children}
              </motion.div>
            </main>
            <WebSocketInit />
            <ScrollToTop />
            <FloatingSupport />
            <Footer />
          </div>
        ) : (
          <div className="relative z-10">
            <Toaster
              position="top-center"
              toastOptions={{
                style: {
                  background: '#0F172A',
                  color: '#F8FAFC',
                  border: '1px solid rgba(0, 245, 255, 0.15)',
                  borderRadius: '12px',
                },
              }}
            />
            {/* MiniAppShell stays MOUNTED across navigations (no keyed remount),
                so BroadcastBanner/header/balance do NOT re-fetch on every tab
                switch. Only the page content fades in. */}
            <MiniAppShell>
              <motion.div
                key={pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
              >
                {children}
              </motion.div>
            </MiniAppShell>
            <WebSocketInit />
            <ScrollToTop />
          </div>
        )}
      </body>
    </html>
  );
}
