'use client';

/**
 * O'yinchi kartasi — daraja va XP faqat HAQIQIY bajarilgan buyurtmalardan
 * (GET /orders/stats/ → status_distribution.completed). Hech qanday soxta
 * mukofot va'da qilinmaydi: bu faqat mijozning o'z yo'lini ko'rsatadi.
 * Daraja oshganda (oldingi tashrifdan beri) — konfetti va tebranish.
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { orderStatsAPI } from '@/lib/api';
import { confetti, haptic, levelOf } from '@/lib/gamefx';

const LS_KEY = 'gx_last_level';

export default function PlayerCard({ user }: { user: any }) {
  const [completed, setCompleted] = useState<number | null>(null);
  const [levelUp, setLevelUp] = useState(false);

  useEffect(() => {
    let alive = true;
    orderStatsAPI.get()
      .then((r) => {
        if (!alive) return;
        const n = Number(r.data?.status_distribution?.completed || 0);
        setCompleted(n);
        const lv = levelOf(n).level;
        try {
          const prev = Number(localStorage.getItem(LS_KEY) || 0);
          if (prev && lv > prev) {
            setLevelUp(true);
            setTimeout(() => { confetti(90); haptic.notify('success'); }, 500);
          }
          localStorage.setItem(LS_KEY, String(lv));
        } catch {}
      })
      .catch(() => alive && setCompleted(0));
    return () => { alive = false; };
  }, []);

  const info = levelOf(completed ?? 0);
  const name = user?.first_name || user?.telegram_username || user?.username || 'O\'yinchi';
  const initial = String(name).trim().charAt(0).toUpperCase() || 'D';

  return (
    <motion.div
      className="gx-player"
      style={{ ['--lv' as any]: info.color }}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 24 }}
    >
      <span className="gx-hud-corner tl" /><span className="gx-hud-corner tr" />
      <span className="gx-hud-corner bl" /><span className="gx-hud-corner br" />

      <div className="gx-player-row">
        <div className="gx-avatar">
          {user?.avatar_url ? <img src={user.avatar_url} alt="" /> : <span>{initial}</span>}
          <b className="gx-lv-chip">LV {info.level}</b>
        </div>
        <div className="flex-1 min-w-0">
          <div className="gx-player-name">{name}</div>
          <div className="gx-rank">
            <span className="gx-rank-dot" />
            {info.name}
            {levelUp && <span className="gx-levelup">LEVEL UP!</span>}
          </div>
        </div>
        <div className="gx-stat">
          <span className="gx-stat-num">{completed ?? '–'}</span>
          <span className="gx-stat-lbl">buyurtma</span>
        </div>
      </div>

      <div className="gx-xp">
        <motion.div
          className="gx-xp-fill"
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(4, info.progress * 100)}%` }}
          transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1], delay: 0.25 }}
        />
      </div>
      <div className="gx-xp-meta">
        {completed === null ? (
          <span>Yuklanmoqda…</span>
        ) : info.next ? (
          <span>
            <b>{info.next.name}</b> darajasigacha yana {info.toNext} ta buyurtma
          </span>
        ) : (
          <span>Eng yuqori daraja — siz afsonasiz 🏆</span>
        )}
        <Link href="/orders" className="gx-xp-link">Tarix →</Link>
      </div>
    </motion.div>
  );
}
