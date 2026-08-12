'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { FiLoader, FiSend, FiUser, FiCheck, FiMapPin } from 'react-icons/fi';
import { useStore } from '@/lib/store';
import { authAPI } from '@/lib/api';

/**
 * FragmentLogin — FRAGMENT LOGIN ekrani.
 *
 * Username AVTOMATIK aniqlanadi:
 *   1. Telegram ichida — initDataUnsafe.user.username (JORIY akkaunt);
 *   2. Telegramdan tashqarida — localStorage'dagi oxirgi username;
 *   3. Hech narsa bo'lmasa — qo'lda kiritish formasi.
 *
 * XAVFSIZLIK: qo'lda kiritilgan username Telegram akkauntingizdagi
 * username bilan BIR XIL bo'lishi shart — aks holda kirish bloklanadi va
 * foydalanuvchiga bildirishnoma chiqadi (boshqa birovning username'ini
 * kiritib kirish mumkin emas).
 *
 * Tasdiqlash Fragment API orqali: backend getInfo bilan foydalanuvchini
 * topadi, user id ga biriktiradi va JWT qaytaradi.
 */
export default function FragmentLogin() {
  const router = useRouter();
  const { setUser, setAuthChecked } = useStore();
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'username' | 'code'>('username');
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false); // kod yuborilmoqda
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0); // kodgacha qolgan soniya
  // ── Aniq joylashuv bosqichi ──
  // Login o'tgach qurilmadan GPS so'raladi (IP emas — aniq koordinata).
  // Foydalanuvchi "Ruxsat berish" bossa — enableHighAccuracy GPS;
  // rad etsa / "Keyinroq" bossa — IP bo'yicha taxminiy fallback.
  //
  // MUHIM: login muvaffaqiyatli bo'lgach user/token'larni DARHOL set
  // qilmaymiz — aks holda layout darhol asosiy sahifani ko'rsatib
  // FragmentLogin'ni unmount qilardi (joylashuv kartasi ko'rinmasdi).
  // Token/user faqat lokatsiya bosqichi TUGAGACH saqlanadi.
  const [locationPending, setLocationPending] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const pendingTokensRef = useRef<{ access: string; refresh: string } | null>(null);
  const pendingUserRef = useRef<any>(null);
  const userRoleRef = useRef('customer');
  const autoAttempted = useRef(false);
  // Telegram WebApp initDataUnsafe'dan olingan JORIY akkaunt username'i
  // (faqat ko'rsatish/tekshirish uchun — access control'da ishlatilmaydi).
  const telegramUsernameRef = useRef<string>('');

  const normalized = username.trim().replace(/^@/, '');

  // ── ANIQ GPS: qurilmadan to'g'ridan-to'g'ri (IP emas) ──
  // enableHighAccuracy + 15s GPS lock kutiladi. Faqat foydalanuvchi tugma
  // bosganda chaqiriladi (user gesture — brauzer ruxsat popup'ini shunda
  // ishonchli ko'rsatadi). Rad etilsa/timeout bo'lsa null qaytadi.
  const requestGps = () =>
    new Promise<{ lat: number; lng: number } | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });

  // Anti-fraud: qurilma/joylashuv metadata'ni yig'ib backend'ga yuboradi.
  // hasGps=true bo'lsa — aniq koordinata (geo_source=gps); bo'lmasa IP
  // fallback (backend taxminiy IP-joylashuvni yozadi). Xato hech narsani
  // buzmaydi.
  const sendDeviceInfo = async (hasGps: boolean) => {
    const tg = (window as any).Telegram?.WebApp;
    const platform = tg?.platform || navigator.platform || '';
    const info: any = {
      platform: String(platform).slice(0, 100),
      language: navigator.language || '',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      user_agent: navigator.userAgent || '',
    };
    if (hasGps) {
      const pos = await requestGps();
      if (pos) {
        info.lat = pos.lat;
        info.lng = pos.lng;
      }
    }
    await authAPI.deviceInfo(info);
  };

  const goToPanel = (role: string) => {
    if (role === 'super_admin' || role === 'admin') router.push('/admin');
    else if (role === 'senior_operator' || role === 'operator') router.push('/operator');
    else if (role === 'support') router.push('/support');
    else router.push('/');
  };




  // Telegram ichida ekanligini aniqlash. Eslatma: telegram-web-app.js SDK
  // ODDIY brauzerda ham yuklansa window.Telegram.WebApp.initDataUnsafe
  // (bo'sh ob'ekt) yaratadi — shuning uchun faqat initDataUnsafe borligi
  // yetarli emas. Ishonchli belgi: imzolangan initData yoki haqiqiy user.
  const isInsideTelegram = () => {
    const tg = (window as any).Telegram?.WebApp;
    return !!(tg?.initData || tg?.initDataUnsafe?.user);
  };

  // Lokatsiya bosqichi tugagach — token'lar saqlanadi, user set qilinadi
  // (layout shundan keyin FragmentLogin'ni olib, asosiy sahifani ko'rsatadi).
  const commitLogin = () => {
    const t = pendingTokensRef.current;
    const u = pendingUserRef.current;
    if (!t || !u) return;
    localStorage.setItem('access_token', t.access);
    localStorage.setItem('refresh_token', t.refresh);
    localStorage.setItem('last_username', u.username);
    setUser(u);
    setAuthChecked(true);
    goToPanel(userRoleRef.current);
  };

  const finishLogin = (res: any) => {
    const { access, refresh, user } = res.data;
    pendingTokensRef.current = { access, refresh };
    pendingUserRef.current = user;
    localStorage.setItem('last_username', user.username);
    setLoading(false);
    userRoleRef.current = user.role;
    // ── Aniq joylashuv bosqichi ──
    // Panelga o'tishdan OLDI foydalanuvchidan qurilma GPS'ini so'raymiz
    // (IP emas — aniq). Foydalanuvchi tugmani bosmaguncha o'tmaymiz.
    setLocationPending(true);
  };

  // "Ruxsat berish" — aniq GPS so'raladi va yuboriladi, so'ng panelga o'tamiz.
  const handleLocationGrant = async () => {
    setLocationLoading(true);
    const pos = await requestGps();
    try {
      await sendDeviceInfo(!!pos);
    } catch { /* device-info ahamiyatsiz — login allaqachon o'tgan */ }
    setLocationPending(false);
    commitLogin();
  };

  // "Keyinroq" — IP bo'yicha fallback yuboriladi, so'ng panelga o'tamiz.
  const handleLocationSkip = async () => {
    setLocationLoading(true);
    try {
      await sendDeviceInfo(false);
    } catch { /* ahamiyatsiz */ }
    setLocationPending(false);
    commitLogin();
  };

  const attemptLogin = async (uname: string) => {
    setLoading(true);
    setError(null);
    try {
      const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      const tgId = tgUser?.id != null ? String(tgUser.id) : undefined;
      const res = await authAPI.fragmentLogin(uname, telegramUsernameRef.current, tgId);
      finishLogin(res);
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(detail || 'Kirish amalga oshmadi. Qayta urinib ko\'ring.');
      setLoading(false);
      setAutoMode(false);
      // ── AVTOMATIK FALLBACK: yangi user (Fragment'da yo'q) → kod oqimiga
      // o'tamiz. Username allaqachon JORIY Telegram akkauntga mos (auto oqim)
      // — kod shu akkauntga yuboriladi, xavfsiz. Foydalanuvchi tugma
      // bosmasdan kod ekranini ko'radi: "faqat login amalga oshmasagina
      // username kiritish sahifasi ochilsin" qoidasi.
      if (e?.response?.status === 401 && isInsideTelegram() && telegramUsernameRef.current) {
        requestCode();
      }
    }
  };

  // ── 5 daqiqalik kod taymeri ───────────────────────────────────────────
  // Kod yuborilgach har soniyada qolgan vaqtni yangilaydi; 0 ga tushganda
  // kod eskirgan — foydalanuvchi qayta yuboradi.
  useEffect(() => {
    if (!codeExpiresAt) return;
    const tick = () => setSecondsLeft(Math.max(0, Math.floor((codeExpiresAt - Date.now()) / 1000)));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [codeExpiresAt]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

  // ── BOT ORQALI TASDIQLASH KODI ────────────────────────────────────────
  // Username kiritilgach: backend kod yaratib @DONZOROBOT orqali Telegram
  // chatiga yuboradi → foydalanuvchi kodni kiritadi → JWT. Telegram
  // akkaunt id'si initDataUnsafe.user.id'dan olinadi (kod shu akkauntga
  // yuborilishi uchun).
  const requestCode = async () => {
    if (!normalized || loading || sending) return;
    setSending(true);
    setError(null);
    try {
      const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      const tgId = tgUser?.id != null ? String(tgUser.id) : undefined;
      const res = await authAPI.requestLoginCode(normalized, tgId);
      // Dev rejim (Telegramdan tashqari): kod javobda qaytadi — oldindan
      // to'ldiramiz, foydalanuvchi shunchaki tasdiqlaydi.
      if (res.data?.code) {
        setCode(String(res.data.code));
      }
      // Kod 5 daqiqa yaroqli — taymerni boshlaymiz (qayta yuborish ham
      // yangi 5 daqiqani boshlaydi).
      setCodeExpiresAt(Date.now() + 5 * 60 * 1000);
      setStep('code');
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setError(
        detail ||
          "Tasdiqlash kodi yuborilmadi. @DONZOROBOT'ni ochib Start tugmasini bosing, so'ng qayta urinib ko'ring."
      );
    } finally {
      setSending(false);
    }
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalized || code.trim().length < 4 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authAPI.verifyLoginCode(normalized, code.trim());
      finishLogin(res);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(detail || "Kod noto'g'ri. Qayta urinib ko'ring.");
      setLoading(false);
    }
  };

  const backToUsername = () => {
    setStep('username');
    setCode('');
    setCodeExpiresAt(null);
    setSecondsLeft(0);
    setError(null);
  };

  // ── AVTOMATIK kirish: username'ni hech kim yozmasdan aniqlash ──────────
  useEffect(() => {
    if (autoAttempted.current) return;
    autoAttempted.current = true;

    const doAuto = (u: string) => {
      setUsername(u);
      setAutoMode(true);
      attemptLogin(u);
    };

    // 1) Telegram ichida: JORIY akkaunt username'ini ishlatamiz — saqlangan
    //    username boshqa birovniki bo'lishi mumkin (boshqa qurilma).
    const tgUser = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
    const tgUsername = (tgUser?.username || '').trim();
    if (tgUser) {
      if (!tgUsername) {
        // Telegram ichida, lekin akkauntda username o'rnatilmagan —
        // kirishni bloklab, bildirishnoma ko'rsatamiz.
        setError("Telegram akkauntingizda username o'rnatilmagan. Telegram → Sozlamalar → Username'da o'rnating, so'ng qayta urinib ko'ring.");
        return;
      }
      telegramUsernameRef.current = tgUsername;
      doAuto(tgUsername);
      return;
    }

    // 2) Telegramdan tashqarida (dev/desktop): saqlangan username
    const stored = (localStorage.getItem('last_username') || '').trim();
    if (stored) {
      doAuto(stored);
      return;
    }

    // 3) SDK async yuklanadi — hali kelmagan bo'lishi mumkin, paydo
    //    bo'lishini ~4 soniya kutamiz (poll). Topilmasa qo'lda forma.
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const u = (window as any).Telegram?.WebApp?.initDataUnsafe?.user;
      const uname = (u?.username || '').trim();
      if (uname) {
        window.clearInterval(timer);
        telegramUsernameRef.current = uname;
        doAuto(uname);
      } else if (tries >= 20) {
        window.clearInterval(timer); // ~4s
        if ((window as any).Telegram?.WebApp?.initDataUnsafe?.user) {
          setError("Telegram akkauntingizda username o'rnatilmagan. Telegram → Sozlamalar → Username'da o'rnating, so'ng qayta urinib ko'ring.");
        }
      }
    }, 200);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!normalized || loading) return;

    // ── Telegram akkaunt mosligi tekshiruvi ──
    // Kiritilgan username JORIY Telegram akkauntingizdagi username bilan
    // bir xil bo'lishi shart. Mos kelmasa — kirish bloklanadi + bildirishnoma.
    const tgU = telegramUsernameRef.current.trim();
    if (isInsideTelegram()) {
      if (!tgU) {
        setError("Telegram akkauntingizda username o'rnatilmagan. Telegram → Sozlamalar → Username'da o'rnating, so'ng qayta urinib ko'ring.");
        return;
      }
      if (normalized.toLowerCase() !== tgU.toLowerCase()) {
        const msg = `@${normalized} Telegram akkauntingizga mos emas. Siz @${tgU} akkauntidasiz — faqat o'z username'ingiz bilan kirishingiz mumkin.`;
        setError(msg);
        toast.error(msg, { duration: 5000 });
        return;
      }
    }

    // Kod olish bosqichi: username tasdiqlangach bot orqali kod yuboriladi
    requestCode();
  };

  return (
    <div className="cyber-grid min-h-screen flex items-center justify-center px-4">
      <div className="particles-bg" />
      <motion.div
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

          {locationPending ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00F5FF]/15 to-[#34D399]/15 border border-[#00F5FF]/20 flex items-center justify-center mx-auto mb-4">
                <FiMapPin className="w-7 h-7 text-[#00F5FF]" />
              </div>
              <p className="text-sm font-bold text-white mb-1">
                Aniq joylashuvni aniqlash
              </p>
              <p className="text-[11px] text-[#64748B] mb-6 leading-relaxed">
                Xavfsizlik uchun qurilmangizdan <b className="text-[#00F5FF]">to'g'ridan-to'g'ri aniq joylashuv</b>{" "}
                aniqlanadi (GPS — IP'dan aniqroq). Ruxsat bersangiz koordinata va to'liq manzil saqlanadi.
              </p>

              {error && (
                <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-300 leading-relaxed mb-4">
                  {error}
                </div>
              )}

              <button
                onClick={handleLocationGrant}
                disabled={locationLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-[#00F5FF] to-[#34D399] text-[#0B1220] font-bold hover:opacity-90 hover:scale-[1.01] transition-all duration-200 disabled:opacity-50 disabled:hover:scale-100"
              >
                {locationLoading ? (
                  <>
                    <FiLoader className="w-5 h-5 animate-spin" />
                    Joylashuv aniqlanmoqda...
                  </>
                ) : (
                  <>
                    <FiMapPin className="w-5 h-5" />
                    Ruxsat berish — GPS joylashuv
                  </>
                )}
              </button>

              <button
                onClick={handleLocationSkip}
                disabled={locationLoading}
                className="w-full mt-3 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-[#94A3B8] hover:bg-white/10 hover:text-white transition-all disabled:opacity-50"
              >
                Keyinroq (IP bo'yicha taxminiy)
              </button>

              <p className="text-[11px] text-[#475569] mt-4">
                Joylashuv faqat xavfsizlik tahlili uchun saqlanadi
              </p>
            </>
          ) : autoMode && loading ? (
            <>
              <p className="text-sm text-[#9CA3AF] mb-4">
                Avtomatik kirish...
              </p>
              <div className="flex items-center justify-center gap-3 rounded-xl bg-white/5 border border-white/10 px-4 py-3">
                <FiLoader className="w-5 h-5 text-[#00F5FF] animate-spin" />
                <span className="text-sm text-white">@{normalized}</span>
              </div>
              <p className="text-[11px] text-[#64748B] mt-4">
                Profilingiz Fragment API orqali tekshirilmoqda
              </p>
            </>
          ) : step === 'code' ? (
            <>
              <p className="text-sm text-[#9CA3AF] mb-2">
                Tasdiqlash kodi yuborildi
              </p>
              <p className="text-[11px] text-[#64748B] mb-6 leading-relaxed">
                <b className="text-[#00F5FF]">@{normalized}</b> uchun kod{" "}
                <b>@DONZOROBOT</b> orqali Telegram&apos;ingizga yuborildi.{" "}
                Bot&apos;dan olgan <b>6 xonali kodni</b> kiriting.
              </p>

              <form onSubmit={verifyCode} className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-[#9CA3AF] mb-2 uppercase tracking-wide">
                    Tasdiqlash kodi
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="••••••"
                    autoFocus
                    className="glass-input !text-center !text-2xl !tracking-[0.5em] !font-mono"
                    disabled={loading}
                  />
                  {secondsLeft > 0 ? (
                    <p className="text-[11px] text-center text-[#64748B] mt-3">
                      Kod <b className="text-[#00F5FF]">{fmtTime(secondsLeft)}</b> da eskiradi
                    </p>
                  ) : (
                    <p className="text-[11px] text-center text-red-300 mt-3">
                      Kod eskirgan — quyidagi tugma orqali qayta yuboring
                    </p>
                  )}
                </div>

                {error && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-300 leading-relaxed">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={code.trim().length < 4 || loading}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-[#00F5FF] to-[#A855F7] text-[#0B1220] font-bold hover:opacity-90 hover:scale-[1.01] transition-all duration-200 disabled:opacity-40 disabled:hover:scale-100"
                >
                  {loading ? (
                    <>
                      <FiLoader className="w-5 h-5 animate-spin" />
                      Tekshirilmoqda...
                    </>
                  ) : (
                    <>
                      <FiCheck className="w-5 h-5" />
                      Tasdiqlash
                    </>
                  )}
                </button>

                <div className="flex items-center justify-between text-[11px]">
                  <button
                    type="button"
                    onClick={backToUsername}
                    className="text-[#64748B] hover:text-white transition-colors"
                  >
                    ← Username&apos;ni o&apos;zgartirish
                  </button>
                  <button
                    type="button"
                    onClick={requestCode}
                    disabled={sending}
                    className={`text-[#00F5FF] hover:opacity-80 transition-opacity disabled:opacity-40 ${secondsLeft === 0 ? 'text-red-300 font-semibold' : ''}`}
                  >
                    {sending
                      ? 'Yuborilmoqda...'
                      : secondsLeft > 0
                        ? `Kodni qayta yuborish (${fmtTime(secondsLeft)})`
                        : 'Kodni qayta yuborish'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-[#9CA3AF] mb-7">
                Kirish uchun Telegram username&apos;ingizni kiriting
              </p>

              <form onSubmit={handleSubmit} className="space-y-4 text-left">
                <div>
                  <label className="block text-xs font-semibold text-[#9CA3AF] mb-2 uppercase tracking-wide">
                    Telegram username
                  </label>
                  <div className="relative">
                    <FiUser className="absolute left-4 top-1/2 -translate-y-1/2 text-[#00F5FF] w-4 h-4" />
                    <span className="absolute left-10 top-1/2 -translate-y-1/2 text-[#64748B] text-sm">@</span>
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username"
                      autoComplete="username"
                      autoFocus
                      className="glass-input !pl-12 !text-base"
                      disabled={loading || sending}
                    />
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-300 leading-relaxed">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={!normalized || loading || sending}
                  className="w-full inline-flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-gradient-to-r from-[#00F5FF] to-[#A855F7] text-[#0B1220] font-bold hover:opacity-90 hover:scale-[1.01] transition-all duration-200 disabled:opacity-40 disabled:hover:scale-100"
                >
                  {sending ? (
                    <>
                      <FiLoader className="w-5 h-5 animate-spin" />
                      Kod yuborilmoqda...
                    </>
                  ) : loading ? (
                    <>
                      <FiLoader className="w-5 h-5 animate-spin" />
                      Tekshirilmoqda...
                    </>
                  ) : (
                    <>
                      <FiSend className="w-5 h-5" />
                      Davom etish
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 flex items-center justify-center gap-2 text-[11px] text-[#64748B]">
                <FiCheck className="w-3.5 h-3.5 text-[#2DD4BF]" />
                Kod Telegram bot orqali tasdiqlanadi
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
