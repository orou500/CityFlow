import Notification from '../models/Notification.js';

const XP_BASE = 100;
const XP_GROWTH = 1.5;

export function getXpForLevel(level) {
  return Math.round(XP_BASE * Math.pow(XP_GROWTH, level - 1));
}

export function getLevelFromXp(totalXp) {
  let level = 1;
  let xpRemaining = totalXp;
  while (xpRemaining >= getXpForLevel(level)) {
    xpRemaining -= getXpForLevel(level);
    level++;
  }
  return { level, xpInCurrentLevel: xpRemaining, xpToNextLevel: getXpForLevel(level) };
}

export async function awardXp(user, xpAmount, action) {
  user.xp += xpAmount;

  let levelUps = 0;
  while (user.xp >= user.xpToNextLevel) {
    user.xp -= user.xpToNextLevel;
    user.level += 1;
    user.xpToNextLevel = getXpForLevel(user.level);
    levelUps++;
  }

  if (levelUps > 0) {
    await user.save();

    const levelText =
      levelUps === 1 ? `You reached Level ${user.level}!` : `You reached Level ${user.level}! (${levelUps} level-ups)`;

    await Notification.create({
      userId: user._id,
      type: 'system',
      title: 'Level Up!',
      message: levelText,
      global: false,
    });
  } else {
    await user.save();
  }

  return { level: user.level, xp: user.xp, xpToNextLevel: user.xpToNextLevel, levelUps };
}
