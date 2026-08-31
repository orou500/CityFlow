import { io } from 'socket.io-client';
import { getApiBaseUrl, loadToken } from './capacitor';

let socket = null;
let listeners = new Map();

export function getSocket() {
  return socket;
}

export async function connectSocket() {
  if (socket?.connected) return socket;

  const token = await loadToken();
  if (!token) return null;

  const baseUrl = getApiBaseUrl();
  const wsUrl = baseUrl.replace('/api', '');

  socket = io(wsUrl, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  socket.on('connect', () => {
    console.log('[SOCKET] Connected:', socket.id);
    triggerListeners('connect', {});
  });

  socket.on('disconnect', (reason) => {
    console.log('[SOCKET] Disconnected:', reason);
    triggerListeners('disconnect', { reason });
  });

  socket.on('connect_error', (err) => {
    console.warn('[SOCKET] Connection error:', err.message);
  });

  socket.on('authenticate', (data) => {
    console.log('[SOCKET] Authenticated:', data.username);
    triggerListeners('authenticate', data);
  });

  socket.on('notification:new', (data) => {
    triggerListeners('notification:new', data);
  });

  socket.on('notification:deleted', (data) => {
    triggerListeners('notification:deleted', data);
  });

  socket.on('sizops:connection:updated', (data) => {
    triggerListeners('sizops:connection:updated', data);
  });

  socket.on('user:updated', (data) => {
    triggerListeners('user:updated', data);
  });

  socket.on('company:treasury:updated', (data) => {
    triggerListeners('company:treasury:updated', data);
  });

  socket.on('company:levelup', (data) => {
    triggerListeners('company:levelup', data);
  });

  socket.on('company:member:joined', (data) => {
    triggerListeners('company:member:joined', data);
  });

  socket.on('company:member:left', (data) => {
    triggerListeners('company:member:left', data);
  });

  socket.on('company:member:promoted', (data) => {
    triggerListeners('company:member:promoted', data);
  });

  socket.on('company:member:demoted', (data) => {
    triggerListeners('company:member:demoted', data);
  });

  socket.on('vote:created', (data) => {
    triggerListeners('vote:created', data);
  });

  socket.on('vote:completed', (data) => {
    triggerListeners('vote:completed', data);
  });

  socket.on('vote:expired', (data) => {
    triggerListeners('vote:expired', data);
  });

  socket.on('contract:started', (data) => {
    triggerListeners('contract:started', data);
  });

  socket.on('contract:completed', (data) => {
    triggerListeners('contract:completed', data);
  });

  socket.on('investment:created', (data) => {
    triggerListeners('investment:created', data);
  });

  socket.on('investment:matured', (data) => {
    triggerListeners('investment:matured', data);
  });

  socket.on('loan:approved', (data) => {
    triggerListeners('loan:approved', data);
  });

  socket.on('loan:repaid', (data) => {
    triggerListeners('loan:repaid', data);
  });

  socket.on('loan:completed', (data) => {
    triggerListeners('loan:completed', data);
  });

  socket.on('property:purchased', (data) => {
    triggerListeners('property:purchased', data);
  });

  socket.on('property:sold', (data) => {
    triggerListeners('property:sold', data);
  });

  socket.on('property:upgraded', (data) => {
    triggerListeners('property:upgraded', data);
  });

  socket.on('tick:completed', (data) => {
    triggerListeners('tick:completed', data);
  });

  socket.on('auction:bid', (data) => {
    triggerListeners('auction:bid', data);
  });

  socket.on('auction:extended', (data) => {
    triggerListeners('auction:extended', data);
  });

  socket.on('auction:ended', (data) => {
    triggerListeners('auction:ended', data);
  });

  socket.on('auction:activity', (data) => {
    triggerListeners('auction:activity', data);
  });

  socket.on('mission:progress', (data) => {
    triggerListeners('mission:progress', data);
  });

  socket.on('mission:completed', (data) => {
    triggerListeners('mission:completed', data);
  });

  socket.on('mission:reward:claimed', (data) => {
    triggerListeners('mission:reward:claimed', data);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  listeners.clear();
}

export function onSocketEvent(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, []);
  }
  listeners.get(event).push(callback);
  return () => {
    const cbs = listeners.get(event);
    if (cbs) {
      const idx = cbs.indexOf(callback);
      if (idx >= 0) cbs.splice(idx, 1);
    }
  };
}

export function joinCompanyRoom(companyId) {
  if (socket?.connected) {
    socket.emit('company:join', companyId);
  }
}

export function leaveCompanyRoom(companyId) {
  if (socket?.connected) {
    socket.emit('company:leave', companyId);
  }
}

function triggerListeners(event, data) {
  const cbs = listeners.get(event);
  if (cbs) {
    for (const cb of cbs) {
      try {
        cb(data);
      } catch (err) {
        console.error(`[SOCKET] Listener error for ${event}:`, err);
      }
    }
  }
}

export function sendHeartbeat() {
  if (socket?.connected) {
    socket.emit('heartbeat');
  }
}
