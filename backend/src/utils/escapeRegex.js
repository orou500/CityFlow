/**
 * Escape a user-supplied string for safe inclusion in a MongoDB $regex.
 * Prevents regex injection / ReDoS from search and name-matching inputs.
 */
export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
