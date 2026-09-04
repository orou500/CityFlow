import User from '../models/User.js';

/**
 * Shared bulk identity resolver for ranked/player lists.
 *
 * Overrides username/displayName/avatar on a collection of ranking-like
 * entries with the CURRENT User values, using ONE bulk User query (no N+1).
 * Deleted/missing users keep their snapshot value so historical rows remain
 * readable. Pure snapshot data (rank, value, tick numbers) is untouched.
 *
 * Attaches:
 *   entry.cosmetics       — the user's current supporter cosmetics subdoc
 *   entry.supporterBadge  — current supporter badge (e.g. 'founding_supporter')
 *   entry.supporterSince  — donationStats.donorSince
 *
 * Cosmetics are deliberately resolved from authoritative CURRENT user data
 * instead of being copied into historical snapshots (see AGENTS.md —
 * "Current identity should be resolved efficiently from authoritative
 * current user data").
 */
export async function resolveCurrentUsers(entries, idField = 'userId', opts = {}) {
  if (!entries || entries.length === 0) return entries;
  const ids = [...new Set(entries.map((e) => e[idField]?.toString()).filter(Boolean))];
  if (ids.length === 0) return entries;

  const users = await User.find({ _id: { $in: ids } }).select(
    '_id username displayName avatar cosmetics supporter.badge donationStats.donorSince',
  );
  const byId = new Map(users.map((u) => [u._id.toString(), u]));

  // Entries may be Mongoose (sub)documents (e.g. leaderboard snapshot rows,
  // event participants) whose strict schema would silently DROP cosmetic
  // fields. Normalize every entry to a plain object so attached identity
  // fields always serialize.
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const raw = entries[i];
    const entry = raw && typeof raw.toObject === 'function' ? raw.toObject() : raw;
    const id = entry?.[idField]?.toString();
    const user = id ? byId.get(id) : null;
    if (user) {
      // `preservePresentation` keeps the historical snapshot's
      // username/displayName/avatar (used for completed competitive events)
      // while still attaching current cosmetics — cosmetics are never baked
      // into historical snapshots.
      if (!opts.preservePresentation) {
        entry.username = user.username;
        if (user.displayName) entry.displayName = user.displayName;
        if (user.avatar) entry.avatar = user.avatar;
      }
      if (user.cosmetics) entry.cosmetics = user.cosmetics;
      if (user.supporter?.badge && user.supporter.badge !== 'none') entry.supporterBadge = user.supporter.badge;
      if (user.donationStats?.donorSince) entry.supporterSince = user.donationStats.donorSince;
    }
    out.push(entry);
  }
  // Replace in place so caller-held references (e.g. subdoc arrays) reflect
  // the resolved plain entries.
  entries.splice(0, entries.length, ...out);
  return entries;
}

/**
 * Resolve identity for a single user id; returns the same presentation
 * fields resolveCurrentUsers attaches (or null when the user is missing).
 */
export async function resolveUserIdentity(userId) {
  if (!userId) return null;
  const user = await User.findById(userId).select(
    '_id username displayName avatar cosmetics supporter.badge donationStats.donorSince',
  );
  if (!user) return null;
  return {
    userId: user._id.toString(),
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    cosmetics: user.cosmetics || undefined,
    supporterBadge: user.supporter?.badge && user.supporter.badge !== 'none' ? user.supporter.badge : undefined,
    supporterSince: user.donationStats?.donorSince || undefined,
  };
}
