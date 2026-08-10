/**
 * Seasonal leaderboard rewards.
 *
 * Tiers are evaluated top-to-bottom. A tier may use a single `rank` or a
 * `minRank`/`maxRank` range. Rewards are distributed once when a season ends,
 * based on the player's final net-worth rank.
 *
 * Edit this file to change rewards — no code changes required.
 */
export const LEADERBOARD_REWARD_TIERS = [
  { rank: 1, reward: 100000 },
  { rank: 2, reward: 75000 },
  { rank: 3, reward: 50000 },
  { minRank: 4, maxRank: 10, reward: 25000 },
  { minRank: 11, maxRank: 25, reward: 10000 },
];

export function getLeaderboardRewardForRank(rank) {
  if (!Number.isInteger(rank) || rank < 1) return null;
  for (const tier of LEADERBOARD_REWARD_TIERS) {
    if (tier.rank === rank) {
      return { ...tier, rank };
    }
    if (tier.minRank && rank >= tier.minRank && rank <= tier.maxRank) {
      return { ...tier, rank };
    }
  }
  return null;
}
