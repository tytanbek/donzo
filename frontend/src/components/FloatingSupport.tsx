'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiMessageCircle, FiArrowUp, FiSend } from 'react-icons/fi';
import { SUPPORT_TELEGRAM_URL } from '@/lib/brand';

export default function FloatingSupport() {
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3">
      {/* Back to Top */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            transition={{ duration: 0.2 }}
            onClick={scrollToTop}
            className="w-12 h-12 rounded-2xl bg-[#1E293B]/90 backdrop-blur-xl border border-white/10 flex items-center justify-center hover:border-[#00F5FF]/30 hover:shadow-lg hover:shadow-[#00F5FF]/10 transition-all duration-300 group"
            title="Tepaga chiqish"
          >
            <FiArrowUp className="w-5 h-5 text-[#64748B] group-hover:text-[#00F5FF] transition-colors" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Telegram Support */}
      <motion.a
        href={SUPPORT_TELEGRAM_URL}
        target="_blank"
        rel="noopener noreferrer"
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#00F5FF] to-[#A855F7] flex items-center justify-center shadow-lg shadow-[#00F5FF]/20 hover:shadow-xl hover:shadow-[#00F5FF]/30 transition-all duration-300 group relative"
        title="Telegram orqali yordam"
      >
        <FiSend className="w-6 h-6 text-white" />
        {/* Pulse ring */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[#00F5FF] to-[#A855F7] opacity-20 group-hover:opacity-40 transition-opacity duration-1000" />
      </motion.a>
    </div>
  );
}
