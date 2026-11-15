'use client';

import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCheck } from 'react-icons/fi';

interface Package {
  id: number;
  name: string;
  amount_label: string;
  price: number;
  currency: string;
}

interface PackageSelectorProps {
  packages: Package[];
  selectedId: number | null;
  onSelect: (pkg: Package) => void;
}

/** "660 UC" → 660, "1 800 Diamond" → 1800. Raqam bo'lmasa — null. */
function unitsOf(pkg: Package): number | null {
  const m = String(pkg.name || '').replace(/\s(?=\d{3}\b)/g, '').match(/\d+/);
  const n = m ? Number(m[0]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Har paket uchun HAQIQIY tejash: eng kichik paketning birlik narxiga nisbatan.
 * Faqat kamida 3 ta raqamli paket bo'lsa hisoblanadi (Royale Pass kabi
 * raqamsiz paketlarga belgi qo'yilmaydi).
 */
function useValueInfo(packages: Package[]) {
  return useMemo(() => {
    const numeric = packages
      .map((p) => ({ p, units: unitsOf(p) }))
      .filter((x): x is { p: Package; units: number } => x.units !== null && Number(x.p.price) > 0);
    if (numeric.length < 3) return { best: null as number | null, savings: {} as Record<number, number> };
    const base = numeric.reduce((a, b) => (a.units <= b.units ? a : b));
    const basePerUnit = Number(base.p.price) / base.units;
    const savings: Record<number, number> = {};
    let best: number | null = null;
    let bestPerUnit = basePerUnit;
    for (const { p, units } of numeric) {
      const perUnit = Number(p.price) / units;
      const pct = Math.round((1 - perUnit / basePerUnit) * 100);
      if (pct >= 2) savings[p.id] = pct;
      if (perUnit < bestPerUnit * 0.995) { bestPerUnit = perUnit; best = p.id; }
    }
    return { best, savings };
  }, [packages]);
}

export default function PackageSelector({ packages, selectedId, onSelect }: PackageSelectorProps) {
  const { best, savings } = useValueInfo(packages);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {packages.map((pkg, index) => {
        const selected = selectedId === pkg.id;
        const isBest = best === pkg.id;
        return (
          <motion.button
            key={pkg.id}
            type="button"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: selected ? 1.03 : 1 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 26, delay: index * 0.035 }}
            onClick={() => onSelect(pkg)}
            aria-pressed={selected}
            className={`pkg-card ${selected ? 'is-selected' : ''} ${isBest ? 'is-best' : ''}`}
          >
            {isBest && <span className="pkg-badge">⭐ Eng foydali</span>}
            <AnimatePresence>
              {selected && (
                <motion.div
                  key="check"
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', stiffness: 520, damping: 22 }}
                  className="pkg-check"
                >
                  <FiCheck className="w-3 h-3 text-[#020617]" />
                </motion.div>
              )}
            </AnimatePresence>
            <div className="pkg-name">{pkg.name}</div>
            {pkg.amount_label && pkg.amount_label !== pkg.name && (
              <div className="pkg-label">{pkg.amount_label}</div>
            )}
            <div className="pkg-price">
              {Number(pkg.price).toLocaleString('ru-RU')} <span>so'm</span>
            </div>
            {savings[pkg.id] ? <div className="pkg-save">−{savings[pkg.id]}% tejaysiz</div> : null}
          </motion.button>
        );
      })}
    </div>
  );
}
