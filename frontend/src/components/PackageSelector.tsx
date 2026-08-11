'use client';

import React from 'react';
import { motion } from 'framer-motion';
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

export default function PackageSelector({ packages, selectedId, onSelect }: PackageSelectorProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {packages.map((pkg, index) => (
        <motion.button
          key={pkg.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: index * 0.03 }}
          onClick={() => onSelect(pkg)}
          className={`relative p-4 rounded-2xl border text-left transition-all duration-200 ${
            selectedId === pkg.id
              ? 'border-[#00E5FF] bg-[#00E5FF]/10 shadow-[0_0_26px_rgba(0,229,255,0.22)]'
              : 'border-white/10 bg-white/5 hover:border-[#00E5FF]/30 hover:bg-[#00E5FF]/[0.04]'
          }`}
        >
          {selectedId === pkg.id && (
            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gradient-to-br from-[#00E5FF] to-[#3B82F6] flex items-center justify-center shadow-[0_0_12px_rgba(0,229,255,0.5)]">
              <FiCheck className="w-3 h-3 text-[#020617]" />
            </div>
          )}
          <div className="text-sm font-medium text-white mb-1">{pkg.name}</div>
          <div className="text-xs text-[#64748B] mb-2">{pkg.amount_label}</div>
          <div className="text-lg font-bold neon-price">
            {Number(pkg.price).toLocaleString()} {pkg.currency}
          </div>
        </motion.button>
      ))}
    </div>
  );
}
