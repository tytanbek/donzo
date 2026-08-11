'use client';

import React from 'react';
import SupportLayout from '@/components/SupportLayout';

export default function SupportOrdersLayout({ children }: { children: React.ReactNode }) {
  return (
    <SupportLayout>{children}</SupportLayout>
  );
}
