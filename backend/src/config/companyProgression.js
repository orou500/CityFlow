export const MAX_COMPANY_LEVEL = 50;

const XP_TABLE = [
  0, 500, 1500, 3000, 5000, 8000, 12000, 17000, 23000, 30000, 40000, 52000, 66000, 82000, 100000, 122000, 148000,
  178000, 212000, 250000, 300000, 360000, 430000, 510000, 600000, 700000, 810000, 930000, 1060000, 1200000, 1360000,
  1530000, 1710000, 1900000, 2100000, 2310000, 2530000, 2760000, 3000000, 3250000, 3510000, 3780000, 4060000, 4350000,
  4650000, 4960000, 5280000, 5610000, 5950000, 6300000,
];

export function xpRequiredForLevel(level) {
  if (level < 1 || level > MAX_COMPANY_LEVEL) return Infinity;
  return XP_TABLE[level - 1] || 0;
}

export function xpRequiredForNextLevel(currentLevel) {
  if (currentLevel >= MAX_COMPANY_LEVEL) return Infinity;
  return XP_TABLE[currentLevel] || 0;
}

export function getLevelFromTotalXP(totalXP) {
  let level = 1;
  for (let i = 1; i < XP_TABLE.length; i++) {
    if (totalXP >= XP_TABLE[i]) {
      level = i + 1;
    } else {
      break;
    }
  }
  return Math.min(level, MAX_COMPANY_LEVEL);
}

export const XP_REWARDS = {
  property_purchased: (propertyPrice) => Math.max(50, Math.round(propertyPrice * 0.0005)),
  property_sold: (propertyPrice) => Math.max(25, Math.round(propertyPrice * 0.0003)),
  development_executed: (cost) => Math.max(40, Math.round(cost * 0.005)),
  construction_completed: (totalCost) => Math.max(60, Math.round(totalCost * 0.003)),
  contract_completed: (xpReward) => xpReward || 100,
  loan_repaid: (principal) => Math.max(20, Math.round(principal * 0.0005)),
  vote_completed: () => 3,
  rent_collected: (rentIncome) => Math.max(1, Math.round(rentIncome * 0.00005)),
  investment_matured: (profit) => Math.max(15, Math.round(profit * 0.002)),
};

export function calculateXPReward(activity, ...args) {
  const generator = XP_REWARDS[activity];
  if (!generator) return 0;
  return generator(...args);
}

export function getCompanyLevelBenefits(level) {
  return {
    maxMembers: level <= 1 ? 10 : Math.min(10 + Math.floor((level - 1) * 1.2), 50),
    operatingFeeDiscount: Math.min(level * 0.0008, 0.005),
    loanInterestDiscount: Math.min(level * 0.0004, 0.005),
    maxLoanAmount: 5_000_000 + level * 2_000_000,
    maxInvestmentAmount: level >= 5 ? 10_000_000 + (level - 5) * 5_000_000 : 0,
    canTakeContracts: level >= 3,
    maxContractReward: level >= 3 ? 500_000 * level : 0,
    canStartProjects: level >= 5,
    treasuryCapacity: level >= 10 ? Infinity : 50_000_000 + level * 10_000_000,
    canManageProperties: level >= 2,
    canInitiateInvestments: level >= 5,
    canUseDirectLoans: level >= 4,
    maxActiveLoans: Math.min(3 + Math.floor(level / 5), 10),
    maxConstructionProjects: Math.min(1 + Math.floor(level / 5), 5),
    canUnlockMilestones: level >= 2,
    advancedGovernance: level >= 15,
    customVoteDuration: level >= 20,
    premiumContracts: level >= 10,
    globalReputationBonus: level >= 25 ? Math.floor((level - 25) * 0.5) : 0,
  };
}

export const LEVEL_UP_REWARDS = {
  treasuryBonus: (level) => {
    if (level <= 5) return 10_000 * level;
    if (level <= 10) return 50_000 + (level - 5) * 20_000;
    if (level <= 20) return 150_000 + (level - 10) * 50_000;
    return 650_000 + (level - 20) * 100_000;
  },
  xpBonus: (level) => Math.round(100 * Math.pow(1.1, level)),
  reputationBonus: (level) => 10 + Math.floor(level * 2),
};

export const COMPANY_MILESTONES = [
  {
    id: 'properties_5',
    name: 'Property Pioneer',
    description: 'Own 5 properties at once',
    check: (stats) => stats.propertiesOwned >= 5,
    xpReward: 500,
    reputationReward: 25,
    treasuryReward: 50_000,
  },
  {
    id: 'properties_10',
    name: 'Real Estate Mogul',
    description: 'Own 10 properties at once',
    check: (stats) => stats.propertiesOwned >= 10,
    xpReward: 1500,
    reputationReward: 50,
    treasuryReward: 150_000,
    prerequisite: 'properties_5',
  },
  {
    id: 'properties_25',
    name: 'Property Empire',
    description: 'Own 25 properties at once',
    check: (stats) => stats.propertiesOwned >= 25,
    xpReward: 5000,
    reputationReward: 150,
    treasuryReward: 500_000,
    prerequisite: 'properties_10',
  },
  {
    id: 'properties_50',
    name: 'Real Estate Dynasty',
    description: 'Own 50 properties at once',
    check: (stats) => stats.propertiesOwned >= 50,
    xpReward: 15000,
    reputationReward: 300,
    treasuryReward: 1_000_000,
    prerequisite: 'properties_25',
  },
  {
    id: 'income_100k',
    name: 'Cash Flow Master',
    description: 'Accumulate $100,000 in total rental income',
    check: (stats) => stats.totalRentalIncome >= 100_000,
    xpReward: 800,
    reputationReward: 30,
    treasuryReward: 25_000,
  },
  {
    id: 'income_1m',
    name: 'Rental Baron',
    description: 'Accumulate $1,000,000 in total rental income',
    check: (stats) => stats.totalRentalIncome >= 1_000_000,
    xpReward: 3000,
    reputationReward: 100,
    treasuryReward: 100_000,
    prerequisite: 'income_100k',
  },
  {
    id: 'income_10m',
    name: 'Rental Tycoon',
    description: 'Accumulate $10,000,000 in total rental income',
    check: (stats) => stats.totalRentalIncome >= 10_000_000,
    xpReward: 10000,
    reputationReward: 250,
    treasuryReward: 500_000,
    prerequisite: 'income_1m',
  },
  {
    id: 'networth_1m',
    name: 'Millionaire Club',
    description: 'Reach $1,000,000 company net worth',
    check: (stats) => stats.netWorth >= 1_000_000,
    xpReward: 1000,
    reputationReward: 40,
    treasuryReward: 50_000,
  },
  {
    id: 'networth_10m',
    name: 'Wealthy Enterprise',
    description: 'Reach $10,000,000 company net worth',
    check: (stats) => stats.netWorth >= 10_000_000,
    xpReward: 4000,
    reputationReward: 120,
    treasuryReward: 200_000,
    prerequisite: 'networth_1m',
  },
  {
    id: 'networth_100m',
    name: 'Corporate Giant',
    description: 'Reach $100,000,000 company net worth',
    check: (stats) => stats.netWorth >= 100_000_000,
    xpReward: 12000,
    reputationReward: 350,
    treasuryReward: 1_000_000,
    prerequisite: 'networth_10m',
  },
  {
    id: 'networth_1b',
    name: 'Billion Dollar Corporation',
    description: 'Reach $1,000,000,000 company net worth',
    check: (stats) => stats.netWorth >= 1_000_000_000,
    xpReward: 40000,
    reputationReward: 800,
    treasuryReward: 5_000_000,
    prerequisite: 'networth_100m',
  },
  {
    id: 'developments_10',
    name: 'Building Spree',
    description: 'Complete 10 development projects',
    check: (stats) => (stats.totalDevelopments || 0) >= 10,
    xpReward: 1200,
    reputationReward: 50,
    treasuryReward: 75_000,
  },
  {
    id: 'developments_50',
    name: 'Master Developer',
    description: 'Complete 50 development projects',
    check: (stats) => (stats.totalDevelopments || 0) >= 50,
    xpReward: 6000,
    reputationReward: 200,
    treasuryReward: 400_000,
    prerequisite: 'developments_10',
  },
  {
    id: 'contracts_5',
    name: 'Contract Specialist',
    description: 'Complete 5 city contracts',
    check: (stats) => (stats.contractsCompleted || 0) >= 5,
    xpReward: 1000,
    reputationReward: 60,
    treasuryReward: 100_000,
  },
  {
    id: 'contracts_25',
    name: 'Government Partner',
    description: 'Complete 25 city contracts',
    check: (stats) => (stats.contractsCompleted || 0) >= 25,
    xpReward: 8000,
    reputationReward: 300,
    treasuryReward: 800_000,
    prerequisite: 'contracts_5',
  },
  {
    id: 'members_10',
    name: 'Growing Team',
    description: 'Have 10 members in the company',
    check: (stats) => (stats.memberCount || 0) >= 10,
    xpReward: 600,
    reputationReward: 30,
    treasuryReward: 30_000,
  },
  {
    id: 'members_25',
    name: 'Large Organization',
    description: 'Have 25 members in the company',
    check: (stats) => (stats.memberCount || 0) >= 25,
    xpReward: 3000,
    reputationReward: 120,
    treasuryReward: 200_000,
    prerequisite: 'members_10',
  },
  {
    id: 'level_5',
    name: 'Rising Star',
    description: 'Reach Company Level 5',
    check: (stats) => (stats.level || 1) >= 5,
    xpReward: 1000,
    reputationReward: 50,
    treasuryReward: 75_000,
  },
  {
    id: 'level_10',
    name: 'Established Firm',
    description: 'Reach Company Level 10',
    check: (stats) => (stats.level || 1) >= 10,
    xpReward: 3000,
    reputationReward: 100,
    treasuryReward: 250_000,
    prerequisite: 'level_5',
  },
  {
    id: 'level_25',
    name: 'Industry Leader',
    description: 'Reach Company Level 25',
    check: (stats) => (stats.level || 1) >= 25,
    xpReward: 15000,
    reputationReward: 400,
    treasuryReward: 1_000_000,
    prerequisite: 'level_10',
  },
  {
    id: 'level_50',
    name: 'Legendary Corporation',
    description: 'Reach Company Level 50 (Max Level)',
    check: (stats) => (stats.level || 1) >= 50,
    xpReward: 50000,
    reputationReward: 1000,
    treasuryReward: 10_000_000,
    prerequisite: 'level_25',
  },
  {
    id: 'loans_repaid_5',
    name: 'Credit Worthy',
    description: 'Successfully repay 5 company loans',
    check: (stats) => (stats.loansRepaid || 0) >= 5,
    xpReward: 800,
    reputationReward: 40,
    treasuryReward: 50_000,
  },
  {
    id: 'votes_100',
    name: 'Democratic Spirit',
    description: 'Complete 100 company votes',
    check: (stats) => (stats.totalVotes || 0) >= 100,
    xpReward: 500,
    reputationReward: 20,
    treasuryReward: 25_000,
  },
  {
    id: 'founded_30d',
    name: 'Veteran Company',
    description: 'Survive 30 in-game days',
    check: (stats) => (stats.ticksExisted || 0) >= 120,
    xpReward: 2000,
    reputationReward: 75,
    treasuryReward: 100_000,
  },
];

export function checkMilestones(company) {
  const completedIds = new Set((company.milestones || []).map((m) => m.milestoneId));
  const stats = {
    ...company.stats,
    level: company.level,
    memberCount: company.members?.length || 0,
  };

  const newlyCompleted = [];

  for (const milestone of COMPANY_MILESTONES) {
    if (completedIds.has(milestone.id)) continue;
    if (milestone.prerequisite && !completedIds.has(milestone.prerequisite)) continue;

    if (milestone.check(stats)) {
      newlyCompleted.push(milestone);
    }
  }

  return newlyCompleted;
}
