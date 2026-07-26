import { useEffect, useRef } from 'react';
import { connectSocket, disconnectSocket, onSocketEvent, sendHeartbeat, joinCompanyRoom, leaveCompanyRoom } from '../utils/socket';
import { useAuthStore } from '../store/useAuthStore';

const HEARTBEAT_INTERVAL = 20000;

export function useSocket() {
  const heartbeatRef = useRef(null);
  const token = useAuthStore((s) => s.token);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }

    const init = async () => {
      await connectSocket();
      heartbeatRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
    };

    init();

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      disconnectSocket();
    };
  }, [token]);
}

export function useCompanySocket(companyId) {
  useEffect(() => {
    if (!companyId) return;
    joinCompanyRoom(companyId);
    return () => leaveCompanyRoom(companyId);
  }, [companyId]);
}

export function useSocketEvent(event, callback) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    return onSocketEvent(event, (data) => {
      callbackRef.current?.(data);
    });
  }, [event]);
}
