import { cacheDel, cacheDelPattern, cacheDelMany } from './cache.js';
import { cacheKeys } from './cacheKeys.js';
import { publish, CHANNELS } from './pubsub.js';
import { emitToCompany, emitToUser } from '../socket/index.js';
import { SOCKET_EVENTS } from '../socket/events.js';

export async function invalidateCompany(companyId) {
  await cacheDelMany(cacheKeys.allCompany(companyId));
}

export async function invalidateProperty(propertyId) {
  await cacheDel(cacheKeys.property(propertyId));
  await cacheDel(cacheKeys.propertyDetail(propertyId));
}

export async function invalidateUser(userId) {
  await cacheDel(cacheKeys.user(userId));
}

export async function invalidateUserProfile(username) {
  await cacheDel(cacheKeys.userProfile(username));
}

export async function invalidateCity(cityId) {
  await cacheDel(cacheKeys.city(cityId));
  await cacheDel(cacheKeys.cities());
}

export async function invalidateLeaderboards() {
  await cacheDelPattern('lb:*');
}

export async function invalidateMarket() {
  await cacheDel(cacheKeys.market());
  await cacheDel(cacheKeys.marketStocks());
  await cacheDel(cacheKeys.marketIndexes());
}

export async function invalidateWorld() {
  await cacheDel(cacheKeys.worldStatus());
  await cacheDel(cacheKeys.worldStats());
  await cacheDel(cacheKeys.activeEvents());
}

export async function invalidateStats() {
  await cacheDel(cacheKeys.stats());
}

export async function invalidateTick() {
  await cacheDel(cacheKeys.tick());
  await cacheDel(cacheKeys.worldStatus());
}

export async function onPropertyPurchased(buyerId, sellerId, propertyId, cityId) {
  await Promise.all([
    invalidateProperty(propertyId),
    invalidateUser(buyerId),
    invalidateUser(sellerId),
    invalidateCity(cityId),
    invalidateLeaderboards(),
    invalidateMarket(),
    invalidateStats(),
    invalidateWorld(),
  ]);
  await publish(CHANNELS.PROPERTY_PURCHASED, { buyerId, sellerId, propertyId, cityId });
  emitToUser(buyerId, SOCKET_EVENTS.PROPERTY_PURCHASED, { propertyId, role: 'buyer' });
  if (sellerId) emitToUser(sellerId, SOCKET_EVENTS.PROPERTY_PURCHASED, { propertyId, role: 'seller' });
}

export async function onPropertySold(sellerId, propertyId, cityId) {
  await Promise.all([
    invalidateProperty(propertyId),
    invalidateUser(sellerId),
    invalidateCity(cityId),
    invalidateLeaderboards(),
    invalidateMarket(),
    invalidateStats(),
  ]);
  await publish(CHANNELS.PROPERTY_SOLD, { sellerId, propertyId, cityId });
  emitToUser(sellerId, SOCKET_EVENTS.PROPERTY_SOLD, { propertyId });
}

export async function onPropertyUpgraded(userId, propertyId) {
  await Promise.all([
    invalidateProperty(propertyId),
    invalidateUser(userId),
    invalidateLeaderboards(),
    invalidateStats(),
  ]);
  await publish(CHANNELS.PROPERTY_UPGRADED, { userId, propertyId });
  emitToUser(userId, SOCKET_EVENTS.PROPERTY_UPGRADED, { propertyId });
}

export async function onRentCollected(userId) {
  await Promise.all([invalidateUser(userId), invalidateLeaderboards(), invalidateStats()]);
}

export async function onLoanAction(userId) {
  await Promise.all([invalidateUser(userId), invalidateLeaderboards(), invalidateStats()]);
}

export async function onCompanyCreated(companyId, founderId) {
  await Promise.all([
    invalidateCompany(companyId),
    invalidateUser(founderId),
    invalidateLeaderboards(),
    invalidateStats(),
  ]);
  await publish(CHANNELS.COMPANY_CREATED, { companyId, founderId });
  emitToCompany(companyId, SOCKET_EVENTS.COMPANY_TREASURY_UPDATED, { companyId });
}

export async function onCompanyUpdated(companyId) {
  await invalidateCompany(companyId);
  await invalidateLeaderboards();
}

export async function onCompanyTreasuryChanged(companyId, userId) {
  await Promise.all([
    invalidateCompany(companyId),
    invalidateUser(userId),
    invalidateLeaderboards(),
    invalidateStats(),
  ]);
  await publish(CHANNELS.COMPANY_TREASURY_UPDATED, { companyId, userId });
  emitToCompany(companyId, SOCKET_EVENTS.COMPANY_TREASURY_UPDATED, { companyId, userId });
}

export async function onCompanyVote(companyId) {
  await invalidateCompany(companyId);
  await publish(CHANNELS.COMPANY_VOTE_CREATED, { companyId });
  emitToCompany(companyId, SOCKET_EVENTS.VOTE_CREATED, { companyId });
}

export async function onCompanyVoteCompleted(companyId) {
  await invalidateCompany(companyId);
  await invalidateLeaderboards();
  await publish(CHANNELS.COMPANY_VOTE_COMPLETED, { companyId });
  emitToCompany(companyId, SOCKET_EVENTS.VOTE_COMPLETED, { companyId });
}

export async function onCompanyLevelUp(companyId, newLevel) {
  await invalidateCompany(companyId);
  await invalidateLeaderboards();
  await publish(CHANNELS.COMPANY_LEVEL_UP, { companyId, newLevel });
  emitToCompany(companyId, SOCKET_EVENTS.COMPANY_LEVEL_UP, { companyId, newLevel });
}

export async function onContractStarted(companyId) {
  await invalidateCompany(companyId);
  await invalidateStats();
  await publish(CHANNELS.CONTRACT_STARTED, { companyId });
  emitToCompany(companyId, SOCKET_EVENTS.CONTRACT_STARTED, { companyId });
}

export async function onContractCompleted(companyId) {
  await invalidateCompany(companyId);
  await invalidateLeaderboards();
  await invalidateStats();
  await publish(CHANNELS.CONTRACT_COMPLETED, { companyId });
  emitToCompany(companyId, SOCKET_EVENTS.CONTRACT_COMPLETED, { companyId });
}

export async function onInvestmentCreated(companyId) {
  await invalidateCompany(companyId);
  await publish(CHANNELS.INVESTMENT_CREATED, { companyId });
  emitToCompany(companyId, SOCKET_EVENTS.INVESTMENT_CREATED, { companyId });
}

export async function onInvestmentMatured(companyId, investmentId, profit) {
  await invalidateCompany(companyId);
  await invalidateLeaderboards();
  await invalidateStats();
  await publish(CHANNELS.INVESTMENT_MATURED, { companyId, investmentId, profit });
  emitToCompany(companyId, SOCKET_EVENTS.INVESTMENT_MATURED, { companyId, investmentId, profit });
}

export async function onNotificationCreated(userId, notification = null) {
  await publish(CHANNELS.NOTIFICATION_CREATED, { userId });
  emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_NEW, {
    userId,
    notification: notification
      ? {
          _id: String(notification._id),
          title: notification.title,
          message: notification.message,
          type: notification.type,
          route: notification.route,
          tab: notification.tab,
          priority: notification.priority,
          category: notification.category,
          createdAt: notification.createdAt,
        }
      : null,
  });
}

export async function onNotificationDeleted(userId, notificationId) {
  await publish(CHANNELS.NOTIFICATION_DELETED, { userId, notificationId });
  emitToUser(userId, SOCKET_EVENTS.NOTIFICATION_DELETED, {
    userId,
    notificationId,
  });
}

export async function onDevelopmentStarted(userId, companyId) {
  const promises = [invalidateUser(userId), invalidateLeaderboards(), invalidateStats()];
  if (companyId) promises.push(invalidateCompany(companyId));
  await Promise.all(promises);
}

export async function invalidateCompetitiveEvents() {
  await cacheDelPattern('cf:events:comp:*');
}
