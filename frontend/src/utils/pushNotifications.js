import { PushNotifications } from '@capacitor/push-notifications';
import { isNativePlatform, mobileFetch } from './capacitor';

export async function registerForPushNotifications() {
  if (!isNativePlatform()) return null;

  try {
    let permission = await PushNotifications.checkPermissions();

    if (permission.display !== 'granted') {
      permission = await PushNotifications.requestPermissions();
    }

    if (permission.display !== 'granted') {
      console.warn('Push notification permission denied');
      return null;
    }

    await PushNotifications.register();
    return true;
  } catch (err) {
    console.error('Push registration failed:', err);
    return null;
  }
}

export function setupPushNotificationListeners(navigate) {
  if (!isNativePlatform()) return;

  PushNotifications.addListener('registration', (token) => {
    console.log('Push registration success, token:', token.value);
    sendTokenToServer(token.value);
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.error('Push registration error:', err.error);
  });

  PushNotifications.addListener(
    'pushNotificationReceived',
    (notification) => {
      console.log('Push received:', notification);
    },
  );

  PushNotifications.addListener(
    'pushNotificationActionPerformed',
    (action) => {
      console.log('Push action performed:', action);
      const data = action.notification.data;
      if (data && data.deepLink && navigate) {
        navigate(data.deepLink);
      } else if (data && data.propertyId && navigate) {
        navigate(`/property/${data.propertyId}`);
      } else if (data && data.auctionId && navigate) {
        navigate(`/auctions/${data.auctionId}`);
      }
    },
  );
}

async function sendTokenToServer(token) {
  try {
    await mobileFetch('/users/push-token', {
      method: 'POST',
      body: JSON.stringify({ token, platform: 'mobile' }),
    });
  } catch (err) {
    console.error('Failed to send push token to server:', err);
  }
}

export async function unregisterPushNotifications() {
  if (!isNativePlatform()) return;
  try {
    await PushNotifications.unregister();
  } catch (err) {
    console.error('Push unregistration failed:', err);
  }
}
