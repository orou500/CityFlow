import { createRedisClient, isRedisConnected } from '../config/redis.js';

let subscriber = null;
let publisher = null;
const channels = new Map();
const metrics = { published: 0, received: 0 };

function getPublisher() {
  if (!publisher && isRedisConnected()) {
    publisher = createRedisClient();
  }
  return publisher;
}

export function getSubscriber() {
  if (!subscriber && isRedisConnected()) {
    subscriber = createRedisClient();
  }
  return subscriber;
}

export async function publish(channel, message) {
  if (!isRedisConnected()) return 0;
  try {
    const pub = getPublisher();
    const result = await pub.publish(channel, JSON.stringify(message));
    metrics.published++;
    return result;
  } catch (err) {
    console.error(`[PUBSUB] Publish ${channel} error:`, err.message);
    return 0;
  }
}

export async function subscribe(channel, callback) {
  if (!isRedisConnected()) return false;
  try {
    const sub = getSubscriber();
    await sub.subscribe(channel);
    sub.on('message', (ch, message) => {
      if (ch === channel) {
        metrics.received++;
        try {
          callback(JSON.parse(message));
        } catch {
          callback(message);
        }
      }
    });
    channels.set(channel, callback);
    return true;
  } catch (err) {
    console.error(`[PUBSUB] Subscribe ${channel} error:`, err.message);
    return false;
  }
}

export async function unsubscribe(channel) {
  if (!isRedisConnected()) return false;
  try {
    const sub = getSubscriber();
    await sub.unsubscribe(channel);
    channels.delete(channel);
    return true;
  } catch (err) {
    console.error(`[PUBSUB] Unsubscribe ${channel} error:`, err.message);
    return false;
  }
}

export function getPubSubMetrics() {
  return { ...metrics, activeChannels: channels.size };
}

export const CHANNELS = {
  TICK: 'cityflow:tick',
  MARKET_UPDATE: 'cityflow:market:update',
  NOTIFICATION_CREATED: 'cityflow:notification:created',
  PROPERTY_PURCHASED: 'cityflow:property:purchased',
  PROPERTY_SOLD: 'cityflow:property:sold',
  PROPERTY_UPGRADED: 'cityflow:property:upgraded',
  COMPANY_CREATED: 'cityflow:company:created',
  COMPANY_LEVEL_UP: 'cityflow:company:levelup',
  COMPANY_VOTE_CREATED: 'cityflow:company:vote:created',
  COMPANY_VOTE_COMPLETED: 'cityflow:company:vote:completed',
  COMPANY_TREASURY_UPDATED: 'cityflow:company:treasury:updated',
  CONTRACT_STARTED: 'cityflow:contract:started',
  CONTRACT_COMPLETED: 'cityflow:contract:completed',
  INVESTMENT_CREATED: 'cityflow:investment:created',
  INVESTMENT_MATURED: 'cityflow:investment:matured',
  LOAN_APPROVED: 'cityflow:loan:approved',
  LOAN_REPAID: 'cityflow:loan:repaid',
  DEVELOPMENT_STARTED: 'cityflow:development:started',
  PUBLIC_COMPANY_PRICES: 'cityflow:publicCompany:prices',
  PUBLIC_COMPANY_DIVIDENDS: 'cityflow:publicCompany:dividends',
  PUBLIC_COMPANY_EVENT: 'cityflow:publicCompany:event',
  PUBLIC_COMPANY_IPO_LAUNCH: 'cityflow:publicCompany:ipo:launch',
  PUBLIC_COMPANY_DELISTING: 'cityflow:publicCompany:delisting',
};
