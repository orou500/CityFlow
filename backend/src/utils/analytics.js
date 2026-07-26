import { addJob, QUEUE_NAMES } from './jobQueue.js';

export const EVENTS = {
  PROPERTY_PURCHASED: 'property_purchased',
  PROPERTY_SOLD: 'property_sold',
  PROPERTY_UPGRADED: 'property_upgraded',
  RENT_COLLECTED: 'rent_collected',
  LOAN_APPLIED: 'loan_applied',
  LOAN_REPAID: 'loan_repaid',
  COMPANY_CREATED: 'company_created',
  COMPANY_JOIN: 'company_join',
  COMPANY_LEAVE: 'company_leave',
  COMPANY_VOTE: 'company_vote',
  CONTRACT_STARTED: 'contract_started',
  INVESTMENT_CREATED: 'investment_created',
  DEVELOPMENT_STARTED: 'development_started',
  OFFER_CREATED: 'offer_created',
  OFFER_ACCEPTED: 'offer_accepted',
  USER_REGISTERED: 'user_registered',
  TICK_COMPLETED: 'tick_completed',
};

export async function trackEvent(eventType, data = {}) {
  const job = await addJob(QUEUE_NAMES.ANALYTICS, eventType, {
    ...data,
    timestamp: new Date().toISOString(),
    eventType,
  });
  return job;
}
