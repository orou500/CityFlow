/**
 * Progressive onboarding — centralized level-based unlock configuration.
 *
 * Each entry unlocks a gameplay system at a given player level. When a
 * player reaches `requiredLevel` and has not yet completed the entry, they
 * receive a contextual onboarding modal and (optionally) a notification.
 *
 * Level suggestions follow the current game design:
 *  - levels 1-2: core economy (properties, rent, management)
 *  - levels 3-5: growth (development, auctions, marketplace)
 *  - levels 6-8: account depth (banking, missions, career)
 *  - levels 10+: social & advanced (companies, stocks, intel, districts,
 *    contracts, IPO)
 */
export const ONBOARDING_UNLOCKS = [
  {
    id: 'properties',
    requiredLevel: 1,
    route: '/marketplace',
    titleKey: 'onboarding.systems.properties.title',
    descriptionKey: 'onboarding.systems.properties.description',
    stepsKeys: [
      'onboarding.systems.properties.step1',
      'onboarding.systems.properties.step2',
      'onboarding.systems.properties.step3',
    ],
    notificationTitle: 'Properties Unlocked',
    notificationMessage: 'Buy and rent properties to start growing your empire!',
  },
  {
    id: 'management',
    requiredLevel: 2,
    route: '/dashboard',
    titleKey: 'onboarding.systems.management.title',
    descriptionKey: 'onboarding.systems.management.description',
    stepsKeys: ['onboarding.systems.management.step1', 'onboarding.systems.management.step2'],
    notificationTitle: 'Property Management Unlocked',
    notificationMessage: 'Adjust rents and set maintenance levels on your properties!',
  },
  {
    id: 'development',
    requiredLevel: 3,
    route: '/development',
    titleKey: 'onboarding.systems.development.title',
    descriptionKey: 'onboarding.systems.development.description',
    stepsKeys: [
      'onboarding.systems.development.step1',
      'onboarding.systems.development.step2',
      'onboarding.systems.development.step3',
    ],
    notificationTitle: 'Development Unlocked',
    notificationMessage: 'Upgrade and develop your properties to increase their value!',
  },
  {
    id: 'auctions',
    requiredLevel: 4,
    route: '/auctions',
    titleKey: 'onboarding.systems.auctions.title',
    descriptionKey: 'onboarding.systems.auctions.description',
    stepsKeys: [
      'onboarding.systems.auctions.step1',
      'onboarding.systems.auctions.step2',
      'onboarding.systems.auctions.step3',
      'onboarding.systems.auctions.step4',
    ],
    notificationTitle: 'Auctions Unlocked',
    notificationMessage: 'Compete with other players for valuable properties at auction!',
  },
  {
    id: 'marketplace',
    requiredLevel: 5,
    route: '/marketplace',
    titleKey: 'onboarding.systems.marketplace.title',
    descriptionKey: 'onboarding.systems.marketplace.description',
    stepsKeys: ['onboarding.systems.marketplace.step1', 'onboarding.systems.marketplace.step2'],
    notificationTitle: 'Marketplace Unlocked',
    notificationMessage: 'Buy and sell properties with other players on the marketplace!',
  },
  {
    id: 'banking',
    requiredLevel: 6,
    route: '/bank',
    titleKey: 'onboarding.systems.banking.title',
    descriptionKey: 'onboarding.systems.banking.description',
    stepsKeys: [
      'onboarding.systems.banking.step1',
      'onboarding.systems.banking.step2',
      'onboarding.systems.banking.step3',
    ],
    notificationTitle: 'Banking Unlocked',
    notificationMessage: 'Take loans and build your credit score to grow faster!',
  },
  {
    id: 'missions',
    requiredLevel: 7,
    route: '/missions',
    titleKey: 'onboarding.systems.missions.title',
    descriptionKey: 'onboarding.systems.missions.description',
    stepsKeys: ['onboarding.systems.missions.step1', 'onboarding.systems.missions.step2'],
    notificationTitle: 'Missions Unlocked',
    notificationMessage: 'Complete missions to earn rewards and guide your progress!',
  },
  {
    id: 'career',
    requiredLevel: 8,
    route: '/career',
    titleKey: 'onboarding.systems.career.title',
    descriptionKey: 'onboarding.systems.career.description',
    stepsKeys: ['onboarding.systems.career.step1', 'onboarding.systems.career.step2'],
    notificationTitle: 'Career Unlocked',
    notificationMessage: 'Track achievements, titles and prestige on your career page!',
  },
  {
    id: 'companies',
    requiredLevel: 10,
    route: '/real-estate-companies',
    titleKey: 'onboarding.systems.companies.title',
    descriptionKey: 'onboarding.systems.companies.description',
    stepsKeys: [
      'onboarding.systems.companies.step1',
      'onboarding.systems.companies.step2',
      'onboarding.systems.companies.step3',
    ],
    notificationTitle: 'Real Estate Companies Unlocked',
    notificationMessage: 'Found or join a company to cooperate with other players!',
  },
  {
    id: 'stocks',
    requiredLevel: 12,
    route: '/stocks',
    titleKey: 'onboarding.systems.stocks.title',
    descriptionKey: 'onboarding.systems.stocks.description',
    stepsKeys: [
      'onboarding.systems.stocks.step1',
      'onboarding.systems.stocks.step2',
      'onboarding.systems.stocks.step3',
    ],
    notificationTitle: 'Stock Market Unlocked',
    notificationMessage: 'Invest in companies and earn dividends on the stock market!',
  },
  {
    id: 'market-intelligence',
    requiredLevel: 14,
    route: '/market-intelligence',
    titleKey: 'onboarding.systems.marketIntelligence.title',
    descriptionKey: 'onboarding.systems.marketIntelligence.description',
    stepsKeys: ['onboarding.systems.marketIntelligence.step1', 'onboarding.systems.marketIntelligence.step2'],
    notificationTitle: 'Market Intelligence Unlocked',
    notificationMessage: 'Buy market reports and forecasts to make smarter investments!',
  },
  {
    id: 'districts',
    requiredLevel: 16,
    route: '/districts',
    titleKey: 'onboarding.systems.districts.title',
    descriptionKey: 'onboarding.systems.districts.description',
    stepsKeys: ['onboarding.systems.districts.step1', 'onboarding.systems.districts.step2'],
    notificationTitle: 'Districts Unlocked',
    notificationMessage: 'Compete for influence in city districts!',
  },
  {
    id: 'contracts',
    requiredLevel: 18,
    route: '/real-estate-companies',
    titleKey: 'onboarding.systems.contracts.title',
    descriptionKey: 'onboarding.systems.contracts.description',
    stepsKeys: ['onboarding.systems.contracts.step1', 'onboarding.systems.contracts.step2'],
    notificationTitle: 'City Contracts Unlocked',
    notificationMessage: 'Complete city contracts with your company for big rewards!',
  },
  {
    id: 'ipo',
    requiredLevel: 20,
    route: '/stocks',
    titleKey: 'onboarding.systems.ipo.title',
    descriptionKey: 'onboarding.systems.ipo.description',
    stepsKeys: ['onboarding.systems.ipo.step1', 'onboarding.systems.ipo.step2'],
    notificationTitle: 'Public Companies Unlocked',
    notificationMessage: 'Take your company public and trade its shares on the stock market!',
  },
];

export function getOnboardingUnlock(id) {
  return ONBOARDING_UNLOCKS.find((u) => u.id === id) || null;
}
