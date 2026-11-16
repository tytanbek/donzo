/**
 * O'yin effektlari: Telegram haptik tebranish, bosilgan joyda neon uchqunlar
 * va konfetti. Hammasi yengil DOM elementlar bilan — kutubxonasiz.
 * `prefers-reduced-motion` yoqilgan bo'lsa vizual effektlar o'chadi.
 */

type Impact = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft';
type Notice = 'success' | 'warning' | 'error';

function haptics(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).Telegram?.WebApp?.HapticFeedback || null;
}

export function reducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const haptic = {
  tap(style: Impact = 'light') {
    try { haptics()?.impactOccurred(style); } catch {}
  },
  select() {
    try { haptics()?.selectionChanged(); } catch {}
  },
  notify(type: Notice) {
    try { haptics()?.notificationOccurred(type); } catch {}
  },
};

const NEON = ['#00F5FF', '#A855F7', '#2DD4BF', '#F472B6', '#FACC15'];

function layer(): HTMLElement {
  let el = document.getElementById('gx-fx-layer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'gx-fx-layer';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  return el;
}

/** Bosilgan nuqtada neon uchqunlar + halqa. */
export function burst(x: number, y: number, count = 10, colors: string[] = NEON) {
  if (typeof document === 'undefined' || reducedMotion()) return;
  const root = layer();
  const ring = document.createElement('span');
  ring.className = 'gx-ring';
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  ring.style.setProperty('--c', colors[0]);
  root.appendChild(ring);
  setTimeout(() => ring.remove(), 600);

  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'gx-spark';
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const dist = 26 + Math.random() * 34;
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    s.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    s.style.setProperty('--c', colors[i % colors.length]);
    root.appendChild(s);
    setTimeout(() => s.remove(), 700);
  }
}

/** Ekran tepasidan tushadigan konfetti (buyurtma muvaffaqiyati, yangi daraja). */
export function confetti(pieces = 70) {
  if (typeof document === 'undefined' || reducedMotion()) return;
  const root = layer();
  const w = window.innerWidth;
  for (let i = 0; i < pieces; i++) {
    const p = document.createElement('span');
    p.className = 'gx-confetti';
    p.style.left = `${Math.random() * w}px`;
    p.style.setProperty('--c', NEON[i % NEON.length]);
    p.style.setProperty('--x', `${(Math.random() - 0.5) * 160}px`);
    p.style.setProperty('--r', `${(Math.random() - 0.5) * 1080}deg`);
    p.style.animationDuration = `${1.6 + Math.random() * 1.4}s`;
    p.style.animationDelay = `${Math.random() * 0.35}s`;
    if (i % 3 === 0) p.style.borderRadius = '50%';
    root.appendChild(p);
    setTimeout(() => p.remove(), 3500);
  }
}

/* ─── O'yinchi darajasi: faqat HAQIQIY bajarilgan buyurtmalar soniga qarab ─── */

export const LEVELS = [
  { min: 0, name: 'Yangi o\'yinchi', color: '#94A3B8' },
  { min: 1, name: 'Bronza', color: '#D97706' },
  { min: 3, name: 'Kumush', color: '#CBD5E1' },
  { min: 6, name: 'Oltin', color: '#FACC15' },
  { min: 10, name: 'Platina', color: '#2DD4BF' },
  { min: 20, name: 'Olmos', color: '#60A5FA' },
  { min: 35, name: 'Usta', color: '#A855F7' },
  { min: 50, name: 'Afsona', color: '#F472B6' },
];

export function levelOf(completed: number) {
  const n = Math.max(0, Math.floor(completed || 0));
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (n >= LEVELS[i].min) idx = i;
  const cur = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  const progress = next ? (n - cur.min) / (next.min - cur.min) : 1;
  return {
    level: idx + 1,
    name: cur.name,
    color: cur.color,
    next,
    toNext: next ? next.min - n : 0,
    progress: Math.max(0, Math.min(1, progress)),
  };
}
