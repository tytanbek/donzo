'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiBell, FiShoppingBag } from 'react-icons/fi';
import { useWSEvent } from '@/lib/websocket';

interface RealtimeEventBadgeProps {
  eventType?: string;
  icon?: React.ReactNode;
  onClick?: () => void;
}

export default function RealtimeEventBadge({
  eventType = 'order_created',
  icon,
  onClick,
}: RealtimeEventBadgeProps) {
  const event = useWSEvent(eventType);
  const [showFlash, setShowFlash] = React.useState(false);
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    if (event) {
      setShowFlash(true);
      setCount((c) => c + 1);
      const timer = setTimeout(() => setShowFlash(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [event]);

  return (
    <button
      onClick={onClick}
      className="relative p-2 rounded-xl hover:bg-white/5 transition-all duration-200"
    >
      <AnimatePresence>
        {showFlash && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="absolute -top-1 -right-1 w-4 h-4 bg-[#00F5FF] rounded-full text-[8px] font-bold text-[#0F172A] flex items-center justify-center z-10"
          >
            {count}
          </motion.span>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {showFlash ? (
          <motion.div
            key="flash"
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.2, 1] }}
            exit={{ scale: 1 }}
            transition={{ duration: 0.3 }}
            className="text-[#00F5FF]"
          >
            {icon || <FiShoppingBag className="w-5 h-5" />}
          </motion.div>
        ) : (
          <motion.div
            key="normal"
            initial={{ scale: 1 }}
            animate={{ scale: 1 }}
            className="text-[#64748B]"
          >
            {icon || <FiShoppingBag className="w-5 h-5" />}
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}
