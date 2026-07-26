export const SOCKET_EVENTS = {
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  AUTHENTICATE: 'authenticate',
  HEARTBEAT: 'heartbeat',

  COMPANY_JOIN: 'company:join',
  COMPANY_LEAVE: 'company:leave',

  COMPANY_TREASURY_UPDATED: 'company:treasury:updated',
  COMPANY_LEVEL_UP: 'company:levelup',
  COMPANY_XP_CHANGED: 'company:xp:changed',
  COMPANY_REPUTATION_CHANGED: 'company:reputation:changed',
  COMPANY_MEMBER_JOINED: 'company:member:joined',
  COMPANY_MEMBER_LEFT: 'company:member:left',
  COMPANY_MEMBER_PROMOTED: 'company:member:promoted',
  COMPANY_MEMBER_DEMOTED: 'company:member:demoted',

  VOTE_CREATED: 'vote:created',
  VOTE_COMPLETED: 'vote:completed',
  VOTE_EXPIRED: 'vote:expired',

  LOAN_APPROVED: 'loan:approved',
  LOAN_REPAID: 'loan:repaid',
  LOAN_COMPLETED: 'loan:completed',

  PROPERTY_PURCHASED: 'property:purchased',
  PROPERTY_SOLD: 'property:sold',
  PROPERTY_UPGRADED: 'property:upgraded',

  CONTRACT_STARTED: 'contract:started',
  CONTRACT_COMPLETED: 'contract:completed',
  CONTRACT_FAILED: 'contract:failed',

  INVESTMENT_CREATED: 'investment:created',
  INVESTMENT_MATURED: 'investment:matured',
  INVESTMENT_FAILED: 'investment:failed',

  NOTIFICATION_NEW: 'notification:new',

  PRESENCE_UPDATE: 'presence:update',
  LEADERBOARD_UPDATED: 'leaderboard:updated',

  TICK: 'tick:completed',
};

export const COMPANY_ROOM_PREFIX = 'company:';
export const USER_ROOM_PREFIX = 'user:';

export function companyRoom(companyId) {
  return `${COMPANY_ROOM_PREFIX}${companyId}`;
}

export function userRoom(userId) {
  return `${USER_ROOM_PREFIX}${userId}`;
}
