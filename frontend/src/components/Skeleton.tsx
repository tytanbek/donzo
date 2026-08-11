'use client';

import React from 'react';

export function ServiceCardSkeleton() {
  return (
    <div className="glass-card overflow-hidden">
      <div className="p-6 pb-4">
        <div className="w-16 h-16 rounded-2xl bg-white/5 shimmer mb-4" />
        <div className="flex justify-between items-start mb-4">
          <div className="h-3 w-24 rounded-full bg-white/5 shimmer" />
        </div>
      </div>
      <div className="p-6 pt-2">
        <div className="h-5 w-32 rounded-full bg-white/5 shimmer mb-3" />
        <div className="h-4 w-full rounded-full bg-white/5 shimmer mb-2" />
        <div className="h-4 w-3/4 rounded-full bg-white/5 shimmer" />
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="min-h-screen flex items-center justify-center pt-20">
      <div className="text-center">
        <div className="loading-spinner mx-auto mb-4" />
        <p className="text-[#64748B] text-sm">Yuklanmoqda...</p>
      </div>
    </div>
  );
}
