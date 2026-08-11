'use client';

import React from 'react';
import OperatorLayout from '@/components/OperatorLayout';

export default function OperatorRootLayout({ children }: { children: React.ReactNode }) {
  return (
    <OperatorLayout>{children}</OperatorLayout>
  );
}
