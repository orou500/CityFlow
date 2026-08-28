// Soft-delete the two E2E slider test users, mirroring the app's own
// DELETE /account semantics (users.js): set deletedAt, clear pushTokens and
// discordId. READ-ONLY by default; pass `--apply` to write.
// Idempotent: matches only users with deletedAt == null, so re-runs are no-ops.
const APPLY = process.argv.includes('--apply');
const USERNAMES = ['e2e_slider_b_238448', 'e2e_slider_290592'];

print('MODE=' + (APPLY ? 'APPLY' : 'DRY-RUN (read-only, no writes)'));
for (const username of USERNAMES) {
  const u = db.users.findOne({ username });
  if (!u) {
    print(`${username} NOT_FOUND (nothing to do)`);
    continue;
  }
  if (u.deletedAt) {
    print(`${username} ALREADY_SOFT_DELETED deletedAt=${u.deletedAt}`);
    continue;
  }
  print(`${username} id=${u._id} -> would set deletedAt, clear pushTokens (${(u.pushTokens || []).length}) and discordId (${u.discordId ?? 'null'})`);
  if (APPLY) {
    const res = db.users.updateOne(
      { _id: u._id, deletedAt: null },
      { $set: { deletedAt: new Date(), pushTokens: [], discordId: null } },
    );
    print(`${username} APPLIED matched=${res.modifiedCount === 1} modified=${res.modifiedCount}`);
  }
}

// Verify post-state (applies to both modes).
for (const username of USERNAMES) {
  const u = db.users.findOne({ username });
  print(`VERIFY ${username} deletedAt=${u ? u.deletedAt : 'USER_GONE'}`);
}
print('CLEANUP_DONE');