'use client';

import { motion } from 'framer-motion';

/** Buyurtma muvaffaqiyatli: chizilib chiqadigan belgi + tarqaluvchi to'lqinlar. */
export default function SuccessCheck({ tone = 'success' }: { tone?: 'success' | 'pending' }) {
  const color = tone === 'success' ? '#34D399' : '#FBBF24';
  return (
    <div className="success-check" style={{ ['--sc' as any]: color }}>
      <span className="success-ring" />
      <span className="success-ring success-ring-2" />
      <motion.svg
        viewBox="0 0 52 52"
        className="success-svg"
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        <motion.circle
          cx="26" cy="26" r="24"
          fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
        {tone === 'success' ? (
          <motion.path
            d="M15 27 l7 7 l15 -16"
            fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.5, ease: 'easeOut' }}
          />
        ) : (
          <motion.path
            d="M26 14 v15 M26 36 v1"
            fill="none" stroke={color} strokeWidth="3.5" strokeLinecap="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.4, delay: 0.5, ease: 'easeOut' }}
          />
        )}
      </motion.svg>
    </div>
  );
}
