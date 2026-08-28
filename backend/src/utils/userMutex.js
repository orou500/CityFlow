/**
 * In-process per-key mutex. Serializes concurrent handlers in the same
 * process (e.g. two parallel requests to the same route from one user).
 * This is NOT the security boundary — database atomicity (CAS/guarded
 * updates) is always the final protection across replicas. The mutex only
 * reduces in-process interleaving so the DB-level guards fail fast.
 */
const locks = new Map();

export async function withUserLock(key, fn) {
  const lockKey = String(key);
  const prev = locks.get(lockKey) || Promise.resolve();
  let release;
  const next = new Promise((resolve) => {
    release = resolve;
  });
  const chain = prev.then(() => next);
  locks.set(lockKey, chain);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(lockKey) === chain) {
      locks.delete(lockKey);
    }
  }
}
