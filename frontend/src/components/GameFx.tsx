'use client';

/**
 * GameFx — butun ilova uchun "o'yin hissi" dvigateli (document delegatsiyasi):
 *   1. Har bir bosishda Telegram haptik tebranishi (tugma → yengil, tanlov → selection)
 *   2. O'yin kartasi / paket / asosiy tugmada neon uchqunlar
 *   3. O'yin kartasi rasmi barmoq/kursor ortidan 3D qiyshayadi (gologramma)
 * Komponentlar o'zgartirilmaydi; reduced-motion bo'lsa faqat haptika qoladi.
 */

import { useEffect } from 'react';
import { burst, haptic, reducedMotion } from '@/lib/gamefx';

const SPARK = '.mini-card, .pkg-card, .pill-btn, .glow-btn, .lg-btn, .gx-cta';
const SELECT = '.chip, .order-tab, .pkg-card, .amount-chip, .nav-item';
const PRESS = 'button, a[href], [role="button"]';
const TILT = '.mini-card';

export default function GameFx() {
  useEffect(() => {
    const calm = reducedMotion();

    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || !(t instanceof Element)) return;
      if (t.closest(SELECT)) haptic.select();
      else if (t.closest(PRESS)) haptic.tap('light');
      const spark = t.closest(SPARK);
      if (spark && !calm) burst(e.clientX, e.clientY, spark.matches('.pkg-card, .gx-cta') ? 14 : 9);
    };

    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (calm) return;
      const card = (e.target as Element | null)?.closest?.(TILT) as HTMLElement | null;
      if (!card) return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--gx-rx', `${(-y * 14).toFixed(2)}deg`);
        card.style.setProperty('--gx-ry', `${(x * 16).toFixed(2)}deg`);
        card.style.setProperty('--gx-mx', `${((x + 0.5) * 100).toFixed(1)}%`);
        card.style.setProperty('--gx-my', `${((y + 0.5) * 100).toFixed(1)}%`);
        card.classList.add('gx-tilting');
      });
    };
    const onLeave = (e: PointerEvent) => {
      const card = (e.target as Element | null)?.closest?.(TILT) as HTMLElement | null;
      if (!card) return;
      const to = e.relatedTarget as Node | null;
      if (e.type === 'pointerout' && to && card.contains(to)) return;
      card.classList.remove('gx-tilting');
      card.style.removeProperty('--gx-rx');
      card.style.removeProperty('--gx-ry');
    };

    document.addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onLeave, { passive: true });
    document.addEventListener('pointercancel', onLeave, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onLeave);
      document.removeEventListener('pointercancel', onLeave);
    };
  }, []);

  return null;
}
