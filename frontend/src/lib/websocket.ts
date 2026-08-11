'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { useStore } from './store';

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';

type WSEventHandler = (data: any) => void;

const eventHandlers = new Map<string, Set<WSEventHandler>>();

export function onWSEvent(event: string, handler: WSEventHandler) {
  if (!eventHandlers.has(event)) {
    eventHandlers.set(event, new Set());
  }
  eventHandlers.get(event)!.add(handler);
  return () => {
    eventHandlers.get(event)?.delete(handler);
  };
}

export function emitWSEvent(event: string, data: any) {
  eventHandlers.get(event)?.forEach((handler) => handler(data));
}

let globalSocket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let isConnecting = false;

/**
 * Initialize the global WebSocket connection.
 * Call once from the app layout.
 */
export function initWebSocket(token: string | null) {
  if (!token) return;
  if (globalSocket?.readyState === WebSocket.OPEN) return;
  if (isConnecting) return;
  isConnecting = true;

  // SECURITY: pass the JWT as a WebSocket SUBPROTOCOL (Sec-WebSocket-Protocol)
  // instead of ?token= in the URL — the token never lands in proxy/access logs.
  const url = `${WS_BASE}/orders/`;

  try {
    const socket = new WebSocket(url, [`token.${token}`]);
    globalSocket = socket;

    socket.onopen = () => {
      isConnecting = false;
      console.log('[WS] Connected');
      emitWSEvent('connection', { status: 'connected' });

      // Heartbeat ping every 25 seconds to keep connection alive
      (socket as any)._pingInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const eventType = data.type;

        // Emit to registered handlers
        emitWSEvent(eventType, data);

        // Show toast notifications for key events
        handleToastNotification(data);
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    socket.onclose = (event) => {
      globalSocket = null;
      isConnecting = false;
      console.log('[WS] Disconnected:', event.code);
      emitWSEvent('connection', { status: 'disconnected' });

      // Clear heartbeat interval
      if ((socket as any)._pingInterval) {
        clearInterval((socket as any)._pingInterval);
      }

      // Auto-reconnect after 3 seconds (skip if deliberate close by server: code 4001)
      if (event.code !== 4001) {
        reconnectTimer = setTimeout(() => {
          const storedToken = localStorage.getItem('access_token');
          if (storedToken) {
            initWebSocket(storedToken);
          }
        }, 3000);
      }
    };

    socket.onerror = (error) => {
      isConnecting = false;
      console.error('[WS] Error:', error);
    };
  } catch (e) {
    isConnecting = false;
    console.error('[WS] Init error:', e);
  }
}

/**
 * Disconnect the global WebSocket.
 */
export function disconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (globalSocket) {
    globalSocket.close(1000);
    globalSocket = null;
  }
  isConnecting = false;
}

/**
 * Send a message through the global WebSocket.
 */
export function sendWSMessage(data: object) {
  if (globalSocket?.readyState === WebSocket.OPEN) {
    globalSocket.send(JSON.stringify(data));
  }
}

// ── Toast notification mapping ──

function handleToastNotification(data: any) {
  const { type, order, payment, title, message, level } = data;

  if (type === 'connection_established') return;

  switch (type) {
    case 'order_created':
      if (order) {
        toast.success(
          `🆕 Yangi buyurtma: #${order.order_number} - ${order.service_name}`,
          { duration: 5000, position: 'top-right' }
        );
      }
      break;

    case 'order_updated':
      if (order) {
        const statusLabels: Record<string, string> = {
          pending: 'Kutilmoqda',
          processing: 'Bajarilmoqda',
          completed: '✅ Tugallangan',
          cancelled: '❌ Bekor qilingan',
        };
        // Admin panelda "Bajarilmoqda" (processing) bildirishnomasi kerak emas
        const role = useStore.getState().user?.role;
        if (order.status === 'processing' && (role === 'admin' || role === 'super_admin')) {
          break;
        }
        const label = statusLabels[order.status] || order.status;
        toast(
          `📦 Buyurtma #${order.order_number}: ${label}`,
          {
            duration: 5000,
            position: 'top-right',
            icon: order.status === 'completed' ? '🎉' : order.status === 'cancelled' ? '❌' : '📦',
          }
        );
      }
      break;

    case 'payment_received':
      if (payment) {
        toast.success(
          `💰 To'lov qabul qilindi: ${Number(payment.amount).toLocaleString()} so'm (${payment.provider})`,
          { duration: 5000, position: 'top-right' }
        );
      }
      break;

    case 'operator_assigned':
      if (order) {
        toast(
          `👤 Operator biriktirildi: ${data.operator_name} → #${order.order_number}`,
          { duration: 4000, position: 'top-right', icon: '👤' }
        );
      }
      break;

    case 'notification':
      const toastFn = level === 'error' ? toast.error :
                       level === 'success' ? toast.success : toast;
      toastFn(title || message || '', { duration: 5000, position: 'top-right' });
      break;
  }
}

// ── React hook for component integration ──

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export function useWebSocket() {
  const { user, isAuthenticated } = useStore();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastEvent, setLastEvent] = useState<any>(null);
  const unsubscribes = useRef<(() => void)[]>([]);

  useEffect(() => {
    // Listen for connection status changes
    const unsub1 = onWSEvent('connection', (data) => {
      setConnectionStatus(data.status === 'connected' ? 'connected' : 'disconnected');
    });

    // Store last event for components that need to listen
    const handleEvent = (data: any) => setLastEvent(data);
    const eventTypes = [
      'order_created', 'order_updated', 'payment_received',
      'operator_assigned', 'notification',
    ];
    const unsubs = eventTypes.map((type) => onWSEvent(type, handleEvent));

    unsubscribes.current = [unsub1, ...unsubs];

    return () => {
      unsubscribes.current.forEach((fn) => fn());
    };
  }, []);

  // Auto-connect when the user logs in. DEMO MODE: rol sahifa yo'nalishiga
  // qarab almashadi (customer ↔ admin) — user o'zgarganda eski token bilan
  // ulangan socket'ni yopib, yangi token bilan qayta ulanamiz.
  const lastUserId = useRef<number | null>(null);
  useEffect(() => {
    if (isAuthenticated && user) {
      const token = localStorage.getItem('access_token');
      if (token) {
        if (lastUserId.current !== null && lastUserId.current !== user.id) {
          disconnectWebSocket(); // rol/user o'zgardi — yangi token kerak
        }
        lastUserId.current = user.id;
        initWebSocket(token);
      }
    } else if (!isAuthenticated) {
      disconnectWebSocket();
    }
  }, [isAuthenticated, user?.id]);

  return {
    connectionStatus,
    lastEvent,
    isConnected: connectionStatus === 'connected',
  };
}

/**
 * Hook to subscribe to a specific WebSocket event type.
 * Returns the latest event data for that type.
 */
export function useWSEvent(eventType: string): any {
  const [eventData, setEventData] = useState<any>(null);

  useEffect(() => {
    return onWSEvent(eventType, (data) => {
      setEventData(data);
    });
  }, [eventType]);

  return eventData;
}
