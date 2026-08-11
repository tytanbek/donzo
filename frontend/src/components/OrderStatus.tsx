'use client';

import React from 'react';

interface OrderStatusProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<string, { label: string; className: string; dot: string }> = {
  pending: {
    label: 'Kutilmoqda',
    className: 'badge-pending',
    dot: 'bg-yellow-400',
  },
  processing: {
    label: 'Bajarilmoqda',
    className: 'badge-processing',
    dot: 'bg-blue-400',
  },
  completed: {
    label: 'Tugallangan',
    className: 'badge-completed',
    dot: 'bg-green-400',
  },
  cancelled: {
    label: 'Bekor qilingan',
    className: 'badge-cancelled',
    dot: 'bg-red-400',
  },
};

export default function OrderStatus({ status, size = 'md' }: OrderStatusProps) {
  const config = statusConfig[status] || statusConfig.pending;
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : size === 'lg' ? 'px-4 py-1.5 text-sm' : 'px-3 py-1 text-sm';

  return (
    <span className={`inline-flex items-center gap-2 rounded-full font-medium ${sizeClasses} ${config.className}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot} animate-pulse`} />
      {config.label}
    </span>
  );
}
