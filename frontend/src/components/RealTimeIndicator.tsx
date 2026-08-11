'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiWifi, FiWifiOff, FiRefreshCw } from 'react-icons/fi';

interface RealTimeIndicatorProps {
  isConnected: boolean;
  label?: string;
  showLabel?: boolean;
}

export default function RealTimeIndicator({
  isConnected,
  label,
  showLabel = true,
}: RealTimeIndicatorProps) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <AnimatePresence mode="wait">
        {isConnected ? (
          <motion.div
            key="connected"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="relative"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <motion.div
              className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400"
              animate={{ scale: [1, 2], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
            />
          </motion.div>
        ) : (
          <motion.div
            key="disconnected"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="w-2 h-2 rounded-full bg-amber-400"
          />
        )}
      </AnimatePresence>
      {showLabel && (
        <span className={`${isConnected ? 'text-emerald-400' : 'text-amber-400'} transition-colors duration-300`}>
          {isConnected ? (label || 'Real-time ulangan') : 'Uzildi'}
        </span>
      )}
    </div>
  );
}
