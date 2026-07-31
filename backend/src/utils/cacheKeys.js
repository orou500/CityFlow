const prefix = 'cf';

export const cacheKeys = {
  company: (id) => `${prefix}:company:${id}`,
  companyMembers: (id) => `${prefix}:company:${id}:members`,
  companyTreasury: (id) => `${prefix}:company:${id}:treasury`,
  companyLoans: (id) => `${prefix}:company:${id}:loans`,
  companyContracts: (id) => `${prefix}:company:${id}:contracts`,
  companyInvestments: (id) => `${prefix}:company:${id}:investments`,
  companyStats: (id) => `${prefix}:company:${id}:stats`,
  companyProgression: (id) => `${prefix}:company:${id}:progression`,

  property: (id) => `${prefix}:property:${id}`,
  propertyDetail: (id) => `${prefix}:property:${id}:detail`,

  user: (id) => `${prefix}:user:${id}`,
  userProfile: (username) => `${prefix}:user:profile:${username}`,

  city: (id) => `${prefix}:city:${id}`,
  cities: () => `${prefix}:cities`,
  countries: () => `${prefix}:countries`,

  district: (id) => `${prefix}:district:${id}`,
  districtByCity: (cityId) => `${prefix}:district:city:${cityId}`,
  districtLeaderboard: (districtId) => `${prefix}:district:${districtId}:leaders`,
  districtHistory: (districtId) => `${prefix}:district:${districtId}:history`,

  market: () => `${prefix}:market:global`,
  marketStocks: () => `${prefix}:market:stocks`,
  marketIndexes: () => `${prefix}:market:indexes`,
  stockDetail: (id) => `${prefix}:stock:${id}`,
  indexDetail: (id) => `${prefix}:index:${id}`,
  stockPortfolio: (userId) => `${prefix}:portfolio:stock:${userId}`,
  indexPortfolio: (userId) => `${prefix}:portfolio:index:${userId}`,
  publicCompanies: () => `${prefix}:stocks:public`,
  publicCompaniesStats: () => `${prefix}:stocks:public:stats`,
  publicCompaniesEvents: () => `${prefix}:stocks:public:events`,

  stockDividends: (userId) => `${prefix}:stocks:dividends:${userId}`,

  contracts: (companyId) => `${prefix}:contracts:${companyId}`,
  contractsHistory: (companyId) => `${prefix}:contracts:${companyId}:history`,

  investments: (companyId) => `${prefix}:investments:${companyId}`,
  investmentsProducts: (companyId) => `${prefix}:investments:${companyId}:products`,
  investmentsPerformance: (companyId) => `${prefix}:investments:${companyId}:perf`,

  tick: () => `${prefix}:tick:current`,
  worldStatus: () => `${prefix}:world:status`,
  worldStats: () => `${prefix}:world:stats`,
  activeEvents: () => `${prefix}:events:active`,

  stats: () => `${prefix}:stats:global`,

  leaderboard: (category, season, offset, limit) => `${prefix}:lb:rankings:${category}:${season}:${offset}:${limit}`,
  leaderboardSummary: (season) => `${prefix}:lb:summary:${season}`,
  leaderboardMyRank: (userId, season, cats) => `${prefix}:lb:myrank:${userId}:${season}:${cats}`,
  leaderboardPlayer: (userId) => `${prefix}:lb:player:${userId}`,
  leaderboardHistory: (category, season, limit) => `${prefix}:lb:history:${category}:${season}:${limit}`,

  competitiveEvents: (status) => `${prefix}:events:comp:${status || 'all'}`,
  competitiveEvent: (id) => `${prefix}:events:comp:${id}`,

  loanOptions: (companyId) => `${prefix}:company:${companyId}:loanOptions`,

  rentStatus: (userId) => `${prefix}:rent:status:${userId}`,
  bankSummary: (userId) => `${prefix}:bank:summary:${userId}`,

  miReport: (userId, reportType, tier, cityId, districtId) =>
    `${prefix}:mi:${userId}:${reportType}:${tier}:${cityId || 'none'}:${districtId || 'none'}`,
  miTrends: (cityId) => `${prefix}:mi:trends:${cityId}`,

  auction: (id) => `${prefix}:auction:${id}`,
  auctionList: (status) => `${prefix}:auctions:${status || 'all'}`,
  auctionFeatured: () => `${prefix}:auctions:featured`,
  auctionAnalytics: () => `${prefix}:auctions:analytics`,
  auctionWatchlist: (userId) => `${prefix}:auctions:watchlist:${userId}`,
  auctionReputation: (userId) => `${prefix}:auctions:rep:${userId}`,

  missionDashboard: (userId) => `${prefix}:missions:dashboard:${userId}`,
  missionActive: (userId) => `${prefix}:missions:active:${userId}`,
  missionStats: (userId) => `${prefix}:missions:stats:${userId}`,

  careerDashboard: (userId) => `${prefix}:career:dashboard:${userId}`,

  allCompany: (id) => [
    `${prefix}:company:${id}`,
    `${prefix}:company:${id}:members`,
    `${prefix}:company:${id}:treasury`,
    `${prefix}:company:${id}:loans`,
    `${prefix}:company:${id}:contracts`,
    `${prefix}:company:${id}:investments`,
    `${prefix}:company:${id}:stats`,
    `${prefix}:company:${id}:progression`,
    `${prefix}:company:${id}:loanOptions`,
  ],
};

export const cacheTTL = {
  short: 15,
  medium: 30,
  standard: 60,
  long: 180,
  tick: 360,
};
