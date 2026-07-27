const PAYPAL_API = process.env.PAYPAL_API_URL || 'https://api-m.sandbox.paypal.com';
const CLIENT_ID = process.env.PAYPAL_CLIENT_ID || '';
const CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET || '';
const WEBHOOK_ID = process.env.PAYPAL_WEBHOOK_ID || '';

let accessToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  if (accessToken && Date.now() < tokenExpiresAt) return accessToken;

  const auth = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) throw new Error(`PayPal auth failed: ${res.status}`);

  const data = await res.json();
  accessToken = data.access_token;
  tokenExpiresAt = Date.now() + data.expires_in * 1000 - 60000;
  return accessToken;
}

export async function createOrder(amount, currency = 'USD') {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          amount: { currency_code: currency, value: amount.toFixed(2) },
          description: 'CityFlow Donation',
        },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal order creation failed: ${err}`);
  }

  return res.json();
}

export async function captureOrder(orderId) {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PayPal capture failed: ${err}`);
  }

  return res.json();
}

export async function verifyOrder(orderId) {
  const token = await getAccessToken();
  const res = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  return res.json();
}

export async function verifyWebhookSignature(headers, body) {
  if (!WEBHOOK_ID) {
    console.warn('[PAYPAL] PAYPAL_WEBHOOK_ID not set — skipping signature verification');
    return true;
  }

  const token = await getAccessToken();
  const verificationPayload = {
    auth_algo: headers['paypal-auth-algo'],
    cert_url: headers['paypal-cert-url'],
    transmission_id: headers['paypal-transmission-id'],
    timestamp: headers['paypal-transmission-time'],
    webhook_id: WEBHOOK_ID,
    webhook_event: typeof body === 'string' ? JSON.parse(body) : body,
  };

  const res = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(verificationPayload),
  });

  if (!res.ok) {
    console.error('[PAYPAL] Webhook verification request failed:', res.status);
    return false;
  }

  const result = await res.json();
  return result.verification_status === 'SUCCESS';
}

export function isPayPalConfigured() {
  return !!(CLIENT_ID && CLIENT_SECRET);
}

export function isWebhookConfigured() {
  return !!(WEBHOOK_ID && CLIENT_ID && CLIENT_SECRET);
}
