import { processPlayerProgress } from './playerProgress.js';

export function triggerMissionProgress(userId, triggerType) {
  const userIdStr = userId?.toString?.() || userId;
  if (!userIdStr) return;

  processPlayerProgress(userId, triggerType).catch((err) => {
    console.error(`[MISSION_TRIGGER] Error in processPlayerProgress for ${userIdStr}:`, err);
  });
}

export async function triggerMissionProgressForMany(userIds, triggerType) {
  const unique = [...new Set(userIds.map((id) => id?.toString?.() || id).filter(Boolean))];
  for (const uid of unique) {
    triggerMissionProgress(uid, triggerType);
  }
}
