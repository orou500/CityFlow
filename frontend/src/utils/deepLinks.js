import { App } from '@capacitor/app';
import { isNativePlatform } from './capacitor';

let navigateFunction = null;

export function setNavigateFunction(fn) {
  navigateFunction = fn;
}

export function setupDeepLinking() {
  if (!isNativePlatform()) return;

  App.addListener('appUrlOpen', (event) => {
    console.log('Deep link received:', event.url);
    handleDeepLink(event.url);
  });

  App.addListener('appRestoredResult', (state) => {
    console.log('App restored:', state);
  });
}

function handleDeepLink(url) {
  if (!navigateFunction) {
    console.warn('Navigate function not set for deep linking');
    return;
  }

  let path = '';

  if (url.startsWith('cityflow://')) {
    const urlObj = new URL(url);
    path = urlObj.pathname;
  } else if (url.startsWith('https://cityflow.sizops.co.il')) {
    const urlObj = new URL(url);
    path = urlObj.pathname;
  } else if (url.startsWith('/')) {
    path = url;
  }

  if (path && path !== '/') {
    navigateFunction(path);
  }
}

export async function getLaunchUrl() {
  if (!isNativePlatform()) return null;
  try {
    const state = await App.getState();
    return state;
  } catch {
    return null;
  }
}
