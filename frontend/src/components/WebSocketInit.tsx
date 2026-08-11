'use client';

import { useEffect } from 'react';
import { useStore } from '@/lib/store';
import { initWebSocket, disconnectWebSocket, useWebSocket } from '@/lib/websocket';

/**
 * Initializes the global WebSocket connection when the user is authenticated.
 * Must be rendered inside the layout so it runs on every page.
 */
export default function WebSocketInit() {
  const { isAuthenticated } = useStore();
  const { connectionStatus } = useWebSocket();

  return null;
}
