import { Network } from '@capacitor/network';
import { isNativePlatform } from './capacitor';

let networkListeners = [];
let currentStatus = true;

export function getNetworkStatus() {
  return currentStatus;
}

export function onNetworkChange(callback) {
  networkListeners.push(callback);
  return () => {
    networkListeners = networkListeners.filter((l) => l !== callback);
  };
}

export async function setupNetworkListener() {
  if (!isNativePlatform()) {
    window.addEventListener('online', () => updateStatus(true));
    window.addEventListener('offline', () => updateStatus(false));
    currentStatus = navigator.onLine;
    return;
  }

  currentStatus = (await Network.getStatus()).connected;

  Network.addListener('networkStatusChange', (status) => {
    updateStatus(status.connected);
  });
}

function updateStatus(connected) {
  currentStatus = connected;
  for (const listener of networkListeners) {
    try {
      listener(connected);
    } catch {
      /* ignore listener errors */
    }
  }
}
