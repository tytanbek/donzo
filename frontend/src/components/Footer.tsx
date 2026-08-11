'use client';

import React from 'react';
import Link from 'next/link';
import { FiSend, FiInstagram, FiMessageCircle, FiShield, FiFileText } from 'react-icons/fi';
import { BRAND_NAME, SUPPORT_TELEGRAM_URL, INSTAGRAM_URL } from '@/lib/brand';

export default function Footer() {
  return (
    <footer className="relative border-t border-[#00F5FF]/10 bg-[#0F172A]/80 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 rounded-lg overflow-hidden ring-1 ring-[#00F5FF]/30">
                <img src="/images/donzo.png" alt="DONZO" className="w-full h-full object-cover" />
              </div>
              <span className="text-lg font-bold">{BRAND_NAME}</span>
            </Link>
            <p className="text-sm text-[#64748B] leading-relaxed">
              O'yinlar va raqamli xizmatlarga tez va ishonchli donat qilish platformasi.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">HAVOLALAR</h3>
            <ul className="space-y-3">
              <li>
                <Link href="/" className="text-sm text-[#64748B] hover:text-[#00F5FF] transition-colors duration-200">
                  Bosh sahifa
                </Link>
              </li>
              <li>
                <Link href="/#services" className="text-sm text-[#64748B] hover:text-[#00F5FF] transition-colors duration-200">
                  Xizmatlar
                </Link>
              </li>
              <li>
                <Link href="/orders" className="text-sm text-[#64748B] hover:text-[#00F5FF] transition-colors duration-200">
                  Buyurtmalarim
                </Link>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">QO'LLAB-QUVVATLASH</h3>
            <ul className="space-y-3">
              <li>
                <a
                  href={SUPPORT_TELEGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[#64748B] hover:text-[#00F5FF] transition-colors duration-200"
                >
                  <FiSend className="w-4 h-4" />
                  Telegram
                </a>
              </li>
              <li>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-[#64748B] hover:text-[#00F5FF] transition-colors duration-200"
                >
                  <FiInstagram className="w-4 h-4" />
                  Instagram
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="flex items-center gap-2 text-sm text-[#64748B] hover:text-[#00F5FF] transition-colors duration-200"
                >
                  <FiMessageCircle className="w-4 h-4" />
                  24/7 Chat
                </a>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-sm font-semibold text-white mb-4">HUQUQIY</h3>
            <ul className="space-y-3">
              <li>
                <Link
                  href="#"
                  className="flex items-center gap-2 text-sm text-[#64748B] hover:text-[#00F5FF] transition-colors duration-200"
                >
                  <FiFileText className="w-4 h-4" />
                  Foydalanish shartlari
                </Link>
              </li>
              <li>
                <Link
                  href="#"
                  className="flex items-center gap-2 text-sm text-[#64748B] hover:text-[#00F5FF] transition-colors duration-200"
                >
                  <FiShield className="w-4 h-4" />
                  Maxfiylik siyosati
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="neon-divider my-8" />

        {/* Bottom */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-[#64748B]">
            © 2026 {BRAND_NAME}. Barcha huquqlar himoyalangan.
          </p>
          <p className="text-sm text-[#64748B]">
            Made with <span className="text-[#00F5FF]">⚡</span> for gamers
          </p>
        </div>
      </div>
    </footer>
  );
}
