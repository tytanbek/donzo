'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FiHome, FiSearch, FiArrowLeft } from 'react-icons/fi';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center pt-24 pb-16">
      <div className="text-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          {/* 404 Text */}
          <div className="relative mb-8">
            <div className="text-[120px] sm:text-[180px] font-extrabold leading-none">
              <span className="gradient-text">4</span>
              <span className="text-white/10">0</span>
              <span className="gradient-text">4</span>
            </div>
            {/* Glow effect */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-40 h-40 bg-[#00F5FF]/10 rounded-full blur-[80px] animate-pulse-glow" />
            </div>
          </div>

          {/* Message */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="relative z-10"
          >
            <h1 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              Sahifa topilmadi
            </h1>
            <p className="text-[#94A3B8] text-lg mb-8 max-w-md mx-auto leading-relaxed">
              Qidirgan sahifangiz mavjud emas yoki ko'chirilgan bo'lishi mumkin.
              Iltimos, qaytadan urinib ko'ring.
            </p>
          </motion.div>

          {/* Actions */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              href="/"
              className="glow-btn text-base px-8 py-4 inline-flex items-center gap-3 group"
            >
              <FiHome className="w-5 h-5" />
              <span>Bosh sahifa</span>
              <FiArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
            </Link>
            <Link
              href="/#services"
              className="glow-btn-outline text-base px-8 py-4 inline-flex items-center gap-3"
            >
              <FiSearch className="w-5 h-5" />
              <span>Xizmatlarni ko'rish</span>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
