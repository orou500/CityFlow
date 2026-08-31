// Central username validation + normalization rules for CityFlow.
// Used by registration (auth.js) and the username-change service so both
// paths apply identical rules. The display casing is preserved on the
// `username` field; `normalizedUsername` stores the lowercase/trimmed form
// and is the subject of the DB unique index (the final uniqueness authority).

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'system',
  'cityflow',
  'moderator',
  'support',
  'mod',
  'staff',
  'root',
  'guest',
  'null',
  'undefined',
]);

const ALLOWED_USERNAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

export function normalizeUsername(username) {
  return String(username).trim().toLowerCase();
}

/**
 * Validates a prospective username. Returns an error message string on
 * failure, or null when the username is acceptable.
 */
export function validateUsername(username) {
  if (!username || typeof username !== 'string') {
    return 'Username is required';
  }
  const trimmed = username.trim();
  if (trimmed.length < USERNAME_MIN_LENGTH) {
    return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
  }
  if (trimmed.length > USERNAME_MAX_LENGTH) {
    return `Username must be at most ${USERNAME_MAX_LENGTH} characters`;
  }
  if (!ALLOWED_USERNAME_REGEX.test(trimmed)) {
    return 'Username may only contain letters, numbers, dots, underscores and hyphens';
  }
  if (RESERVED_USERNAMES.has(normalizeUsername(trimmed))) {
    return 'This username is reserved and cannot be used';
  }
  return null;
}
