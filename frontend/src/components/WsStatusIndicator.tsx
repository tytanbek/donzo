'use client';

import React from 'react';
import { useWebSocket } from '@/lib/websocket';

/**
 * Tiny live WebSocket status dot — shows a green pulsing dot when the real-time
 * connection is up, red when it dropped (auto-reconnect runs in the background).
 * Renders nothing while not authenticated.
 */
export default function WsStatusIndicator() {
  const { isConnected } = useWebSocket();

  return (
    <span
      className="relative inline-flex w-2 h-2"
      title={isConnected ? 'Jonli ulanish faol' : 'Ulanish tiklanmoqda…'}
      aria-hidden
    >
      <span
        className={`absolute inline-flex h-full w-full rounded-full ${
          isConnected
            ? 'bg-[#22C55E] opacity-60 animate-ping'
            : 'bg-[#F59E0B] opacity-60'
        }`}
        style={{ animationDuration: '2s' }}
      />
      <span
        className={`relative inline-flex rounded-full w-2 h-2 ${
          isConnected ? 'bg-[#22C55E]' : 'bg-[#F59E0B]'
        }`}
      />
    </span>
  );
}
