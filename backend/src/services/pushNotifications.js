import admin from 'firebase-admin';
import User from '../models/User.js';

let initialized = false;

function initializeFirebase() {
  if (initialized) return;
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
      });
    }
    initialized = true;
    console.log('[PUSH] Firebase Admin initialized');
  } catch (err) {
    console.warn('[PUSH] Firebase Admin not initialized:', err.message);
  }
}

export async function sendPushNotification(userId, { title, body, data = {} }) {
  initializeFirebase();
  if (!initialized) return;

  try {
    const user = await User.findById(userId).select('pushTokens pushNotificationsEnabled');
    if (!user || !user.pushNotificationsEnabled || !user.pushTokens?.length) return;

    const tokens = user.pushTokens.map((t) => t.token);

    const message = {
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(message);

    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      if (failedTokens.length) {
        await User.findByIdAndUpdate(userId, {
          $pull: { pushTokens: { token: { $in: failedTokens } } },
        });
        console.log(`[PUSH] Cleaned ${failedTokens.length} invalid tokens for user ${userId}`);
      }
    }

    return response;
  } catch (err) {
    console.error(`[PUSH] Failed to send notification to user ${userId}:`, err.message);
  }
}

export async function sendPushToUsers(userIds, { title, body, data = {} }) {
  for (const userId of userIds) {
    await sendPushNotification(userId, { title, body, data });
  }
}
