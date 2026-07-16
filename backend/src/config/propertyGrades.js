export const GRADE_NAMES = ['I', 'II', 'III', 'IV', 'V'];
export const MAX_GRADE = 5;
export const GRADE_UPGRADE_COOLDOWN_MS = 24 * 60 * 60 * 1000;

export const GRADE_COST_MULTIPLIERS = [0.02, 0.04, 0.06, 0.08];
export const GRADE_VALUE_BONUS = [0, 0.02, 0.035, 0.045, 0.05];
export const GRADE_RENT_BONUS = [0, 0.01, 0.015, 0.02, 0.03];

export function getGradeUpgradeCost(currentGrade, currentPrice) {
  if (currentGrade < 1 || currentGrade >= MAX_GRADE) return null;
  return Math.round(currentPrice * GRADE_COST_MULTIPLIERS[currentGrade - 1]);
}

export function getGradeValueMultiplier(grade) {
  return 1 + (GRADE_VALUE_BONUS[grade - 1] || 0);
}

export function getGradeRentMultiplier(grade) {
  return 1 + (GRADE_RENT_BONUS[grade - 1] || 0);
}
