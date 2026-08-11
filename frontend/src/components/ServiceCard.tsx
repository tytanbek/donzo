'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { FiArrowRight, FiStar, FiZap } from 'react-icons/fi';

interface ServiceCardProps {
  name: string;
  slug: string;
  image_url?: string;
  category_name?: string;
  description?: string;
  index?: number;
  featured?: boolean;
}

// ─── Game-themed color schemes ───
const categoryColors: Record<string, { gradient: string; accent: string; rarity: string }> = {
  'Mobile Games': { gradient: 'from-emerald-500 to-teal-500', accent: '#10B981', rarity: 'rarity-rare' },
  'PC Games': { gradient: 'from-blue-500 to-indigo-500', accent: '#3B82F6', rarity: 'rarity-uncommon' },
  'Social': { gradient: 'from-purple-500 to-pink-500', accent: '#A855F7', rarity: 'rarity-epic' },
  'Streaming': { gradient: 'from-red-500 to-orange-500', accent: '#EF4444', rarity: 'rarity-common' },
  'Other': { gradient: 'from-[#00F5FF] to-[#A855F7]', accent: '#00F5FF', rarity: 'rarity-legendary' },
};

// ─── Game icons mapping ───
const gameIcons: Record<string, string> = {
  'mobile legends': '🎮',
  'mlbb': '🎮',
  'valorant': '🔫',
  'clash royale': '👑',
  'clash of clans': '⚔️',
  'roblox': '🧊',
  'free fire': '🔥',
  'pubg': '🎯',
  'fortnite': '🦴',
  'steam': '💎',
  'telegram': '✈️',
  'discord': '💬',
  'netflix': '🎬',
  'spotify': '🎵',
  'genshin': '⭐',
  'cod': '💀',
};

function getGameIcon(name: string): string {
  const lower = name.toLowerCase();
  for (const [key, icon] of Object.entries(gameIcons)) {
    if (lower.includes(key)) return icon;
  }
  return '🎮';
}

export default function ServiceCard({ name, slug, image_url, category_name, description, index = 0, featured = false }: ServiceCardProps) {
  const [imgError, setImgError] = useState(false);

  const colors = category_name && categoryColors[category_name]
    ? categoryColors[category_name]
    : { gradient: 'from-[#00F5FF] to-[#A855F7]', accent: '#00F5FF', rarity: 'rarity-legendary' };

  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2);
  const hasImage = !!image_url && !imgError;
  const gameIcon = getGameIcon(name);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: (index || 0) * 0.05 }}
    >
      <Link href={`/services/${slug}`}>
        <div className={`game-card group cursor-pointer ${colors.rarity} ${featured ? 'featured-card' : ''}`}>
          {/* Top Accent Line */}
          <div className={`absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r ${colors.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

          {/* Image / Icon Section */}
          <div className="relative p-5 pb-3">
            {hasImage ? (
              <div className="w-16 h-16 rounded-2xl bg-[#0F172A] overflow-hidden shadow-lg ring-1 ring-white/5 group-hover:scale-110 transition-transform duration-300">
                <img
                  src={image_url}
                  alt={name}
                  className="w-full h-full object-contain p-1.5"
                  loading="lazy"
                  onError={() => setImgError(true)}
                />
              </div>
            ) : (
              <div className="relative">
                <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${colors.gradient} flex items-center justify-center text-2xl shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  {gameIcon}
                </div>
                {/* Glow behind icon */}
                <div className={`absolute -inset-2 bg-gradient-to-br ${colors.gradient} rounded-3xl blur-xl opacity-0 group-hover:opacity-30 transition-opacity duration-500`} />
              </div>
            )}

            {/* Category Badge - Game Style */}
            {category_name && (
              <span className="absolute top-5 right-5 px-2.5 py-1 rounded-lg bg-black/40 backdrop-blur-sm text-[10px] font-orbitron font-semibold border border-white/10 text-[#94A3B8]">
                {category_name.toUpperCase().slice(0, 8)}
              </span>
            )}

            {/* Featured Badge */}
            {featured && (
              <span className="absolute bottom-3 right-5 flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FFD700]/20 text-[10px] font-orbitron text-[#FFD700] border border-[#FFD700]/20">
                <FiStar className="w-2.5 h-2.5" />
                TOP
              </span>
            )}
          </div>

          {/* Content */}
          <div className="px-5 pb-5 pt-1">
            <h3 className="text-base font-bold text-white group-hover:text-[#00F5FF] transition-colors duration-200 mb-1.5 truncate">
              {name}
            </h3>
            {description && (
              <p className="text-xs text-[#64748B] line-clamp-2 leading-relaxed">
                {description}
              </p>
            )}

            {/* CTA Row */}
            <div className="flex items-center justify-between mt-4">
              <div className="flex items-center gap-1.5 text-xs font-orbitron text-[#00F5FF] opacity-0 group-hover:opacity-100 transition-all duration-300">
                <span>BUYURTMA</span>
                <FiArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </div>

              {/* Rating Stars (always show for featured) */}
              {featured && (
                <div className="flex gap-0.5">
                  {[...Array(5)].map((_, j) => (
                    <FiStar key={j} className="w-2.5 h-2.5 text-[#FFD700] fill-current" />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Hover Glow Effect */}
          <div className={`absolute inset-0 bg-gradient-to-br ${colors.gradient} opacity-0 group-hover:opacity-[0.03] transition-opacity duration-500 pointer-events-none rounded-[16px]`} />
        </div>
      </Link>
    </motion.div>
  );
}
