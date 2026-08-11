'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface PaymentProvider {
  id: string;
  name: string;
  icon: string;
  description: string;
}

interface PaymentMethodSelectorProps {
  providers: PaymentProvider[];
  selected: string | null;
  onSelect: (providerId: string) => void;
  totalPrice: number;
}

export default function PaymentMethodSelector({
  providers,
  selected,
  onSelect,
  totalPrice,
}: PaymentMethodSelectorProps) {
  if (providers.length === 0) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-[#64748B]">To'lov usullari mavjud emas</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-bold text-white mb-4">To'lov usulini tanlang</h3>
      <p className="text-sm text-[#64748B] mb-4">
        Jami to'lov: <span className="neon-price font-semibold">{Number(totalPrice).toLocaleString()} so'm</span>
      </p>

      {providers.map((provider, i) => {
        const isSelected = selected === provider.id;

        return (
          <motion.button
            key={provider.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            onClick={() => onSelect(provider.id)}
            className={`w-full text-left p-4 rounded-2xl border transition-all duration-300 ${
              isSelected
                ? 'bg-gradient-to-r from-[#00E5FF]/20 to-[#3B82F6]/5 border-[#00E5FF]/40 shadow-[0_0_26px_rgba(0,229,255,0.20)] scale-[1.02]'
                : 'bg-white/5 border-white/10 hover:bg-white/[0.07] hover:border-[#00E5FF]/30'
            }`}
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                isSelected ? 'bg-white/10' : 'bg-white/5'
              }`}>
                {provider.icon}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className={`font-semibold ${
                    isSelected ? 'text-white' : 'text-[#94A3B8]'
                  }`}>
                    {provider.name} — {Number(totalPrice).toLocaleString()} so'm
                  </span>
                  {isSelected && (
                    <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#00E5FF] to-[#3B82F6] flex items-center justify-center shadow-[0_0_14px_rgba(0,229,255,0.5)]">
                      <svg className="w-3.5 h-3.5 text-[#020617]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#64748B] mt-0.5">{provider.description}</p>
              </div>
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}
