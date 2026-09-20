'use client';

/**
 * IosMotion — iOS 26 "Liquid Glass" harakat dvigateli.
 *
 * Mini App'ni iPhone'da iOS'ning o'z qismi kabi his qildirish uchun
 * `liquid-glass.css` v3 qatlamini boshqaradi. Xatti-harakatlar:
 *
 *   1. Linza  — kursorni (yoki barmoqni) kuzatib yorug' nuqta suriladi
 *   2. Glint  — bosilgan nuqtada bir zum yonib o'chadigan yorug' dog'
 *   3. Press  — iOS pressable: yumshoq siqilish, qo'yib yuborilganda
 *               prujina bilan qaytish (klassni JS qo'shadi/olib tashlaydi)
 *   4. Header — sahifa skroll bo'lganda material kuchayadi (`.is-scrolled`)
 *   5. Modal  — yangi paydo bo'lgan `fixed inset-0` qatlamlarga iOS
 *               taqdimot animatsiyasi qo'yiladi (sheet yoki markaziy panel)
 *
 * Hech qanday komponent o'zgartirilmaydi: hammasi `document` darajasidagi
 * delegatsiya orqali ishlaydi. `prefers-reduced-motion` yoqilgan bo'lsa,
 * dvigatel butunlay jim turadi.
 */

import { useEffect } from 'react';

/** Bosilganda siqiladigan (iOS pressable) elementlar */
const PRESSABLE = [
  'button',
  'a[href]',
  '[role="button"]',
  '.nav-item',
  '.lg-btn',
  '.lg-btn-soft',
  '.lg-warn-btn',
  '.glow-btn',
  '.pill-btn',
  '.amount-chip',
  '.balance-step',
].join(',');

/** Karta ko'rinishidagi bosiladigan yuzalar (faqat ixcham bo'lsa) */
const CARD = '.glass-card, .mini-card, .game-card, .mini-panel, .lg-capsule, .lg-warn';

/** Karta juda katta bo'lsa (uzun ro'yxat paneli) siqilmaydi */
const MAX_PRESS_HEIGHT = 340;

/** Yorug' linzasi kuzatiladigan shisha yuzalar */
const GLASS = [
  '.lg-glass',
  '.glass-card',
  '.mini-card',
  '.mini-panel',
  '.game-card',
  '.lg-capsule',
  '.lg-warn',
  '.lg-btn-soft',
  '.balance-badge',
  '.bottom-nav-indicator',
].join(',');

function glassFrom(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const el = target.closest(GLASS);
  return el instanceof HTMLElement ? el : null;
}

export default function IosMotion() {
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');

    /* ── 1–2. Linza va glint ─────────────────────────────────────── */
    let litEl: HTMLElement | null = null;
    let lensRaf = 0;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;

    const pct = (value: number, total: number) =>
      `${((value / total) * 100).toFixed(2)}%`;

    const dim = (el: HTMLElement) => {
      el.style.setProperty('--lgx-lit', '0');
      el.style.setProperty('--lg-lit', '0');
    };

    const paintLens = () => {
      lensRaf = 0;
      if (!pending) return;
      const { el, x, y } = pending;
      pending = null;

      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      if (litEl && litEl !== el) dim(litEl);

      const xPct = pct(x - rect.left, rect.width);
      const yPct = pct(y - rect.top, rect.height);

      // v3 qatlamlari (--lgx-*) va v2 `.lg-glass::before` (--mx/--my) uchun
      el.style.setProperty('--lgx-mx', xPct);
      el.style.setProperty('--lgx-my', yPct);
      el.style.setProperty('--mx', xPct);
      el.style.setProperty('--my', yPct);
      el.style.setProperty('--lgx-lit', '1');
      el.style.setProperty('--lg-lit', '1');
      litEl = el;
    };

    const onMove = (e: PointerEvent) => {
      if (!canHover.matches || e.pointerType === 'touch') return;
      const el = glassFrom(e.target);
      if (!el) return;
      pending = { el, x: e.clientX, y: e.clientY };
      if (!lensRaf) lensRaf = window.requestAnimationFrame(paintLens);
    };

    const onOut = (e: PointerEvent) => {
      const el = glassFrom(e.target);
      if (!el) return;
      const to = e.relatedTarget;
      if (to instanceof Node && el.contains(to)) return;
      dim(el);
      if (litEl === el) litEl = null;
    };

    /* ── 3. Press (iOS pressable) ────────────────────────────────── */
    let pressed: HTMLElement | null = null;
    let pressTimer = 0;

    const release = () => {
      window.clearTimeout(pressTimer);
      if (!pressed) return;
      const el = pressed;
      pressed = null;
      el.classList.remove('lgx-press');
    };

    const isPressable = (el: HTMLElement, target: EventTarget | null): boolean => {
      const tag = el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
      if (target instanceof Element && target.closest('input, textarea, select')) return false;
      if (el.dataset.lgxNoPress !== undefined) return false;
      if (el.matches(PRESSABLE)) return true;
      if (!el.matches(CARD)) return false;
      return el.getBoundingClientRect().height <= MAX_PRESS_HEIGHT;
    };

    const onDown = (e: PointerEvent) => {
      const el = glassFrom(e.target);
      if (!el) return;

      const rect = el.getBoundingClientRect();
      if (rect.width && rect.height) {
        el.style.setProperty('--lgx-tx', pct(e.clientX - rect.left, rect.width));
        el.style.setProperty('--lgx-ty', pct(e.clientY - rect.top, rect.height));
        el.classList.remove('lgx-tap');
        void el.offsetWidth; // animatsiyani qaytadan boshlash
        el.classList.add('lgx-tap');
      }

      if (!isPressable(el, e.target)) return;

      release(); // oldingi bosish qolib ketmasin
      pressed = el;
      el.classList.add('lgx-press');
      // Xavfsizlik: pointerup kelmasa ham siqilish qolib ketmasin
      pressTimer = window.setTimeout(release, 900);
    };

    /* ── 4. Header: skrollga bog'langan material ─────────────────── */
    let scrolledState = false;
    let scrollRaf = 0;

    const applyScroll = () => {
      scrollRaf = 0;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      const next = y > 8;
      if (next === scrolledState) return;
      scrolledState = next;
      document
        .querySelectorAll<HTMLElement>('.mini-header')
        .forEach((header) => header.classList.toggle('is-scrolled', next));
    };

    const onScroll = () => {
      release(); // barmoq bilan skroll qilinganda siqilish qolib ketmasin
      if (!scrollRaf) scrollRaf = window.requestAnimationFrame(applyScroll);
    };

    /* ── 5. Modal/sheet taqdimoti ────────────────────────────────── */
    const pendingOverlays = new Set<HTMLElement>();
    let overlayRaf = 0;

    const markOverlay = (node: HTMLElement) => {
      if (node.dataset.lgxPresent === '1') return;
      const cls = typeof node.className === 'string' ? node.className : '';
      if (!/(^|\s)fixed(\s|$)/.test(cls) || !/inset-0|inset-x-0/.test(cls)) return;

      node.dataset.lgxPresent = '1';
      node.classList.add('lgx-overlay-enter');

      const panel = node.firstElementChild;
      if (!(panel instanceof HTMLElement)) return;

      const overlayAlign = window.getComputedStyle(node).alignItems;
      const panelCls = typeof panel.className === 'string' ? panel.className : '';
      const isSheet =
        overlayAlign === 'flex-end' ||
        /items-end/.test(cls) ||
        /bottom-0|sheet/i.test(panelCls);

      panel.classList.add(isSheet ? 'lgx-sheet-panel' : 'lgx-panel-enter');
    };

    const drainOverlays = () => {
      overlayRaf = 0;
      pendingOverlays.forEach(markOverlay);
      pendingOverlays.clear();
    };

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const cls = typeof node.className === 'string' ? node.className : '';
          if (/(^|\s)fixed(\s|$)/.test(cls)) pendingOverlays.add(node);
        });
      }
      if (pendingOverlays.size && !overlayRaf) {
        overlayRaf = window.requestAnimationFrame(drainOverlays);
      }
    });

    /* ── Ulash ───────────────────────────────────────────────────── */
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerout', onOut, { passive: true });
    window.addEventListener('pointerup', release, { passive: true });
    window.addEventListener('pointercancel', release, { passive: true });
    window.addEventListener('blur', release);
    document.addEventListener('scroll', onScroll, { passive: true, capture: true });
    observer.observe(document.body, { childList: true, subtree: true });

    applyScroll();

    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerout', onOut);
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
      window.removeEventListener('blur', release);
      document.removeEventListener('scroll', onScroll, { capture: true });
      observer.disconnect();
      window.clearTimeout(pressTimer);
      if (lensRaf) window.cancelAnimationFrame(lensRaf);
      if (scrollRaf) window.cancelAnimationFrame(scrollRaf);
      if (overlayRaf) window.cancelAnimationFrame(overlayRaf);
      if (litEl) dim(litEl);
      if (pressed) pressed.classList.remove('lgx-press');
    };
  }, []);

  return null;
}
