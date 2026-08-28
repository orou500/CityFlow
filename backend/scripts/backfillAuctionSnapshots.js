// Backfill immutable property snapshots + anti-sniping extension counts for
// existing Auction documents produced before those fields existed.
//
// READ-ONLY by default. Pass `--apply` to write:
//   1. propertySnapshot  — copied from the live Property when present (so a
//      later recycle/delete keeps history readable)
//   2. extensionCount    — derived from (endTick - originalEndTick) so the new
//      anti-sniping ceiling (maxAntiSnipingExtensions) never extends an
//      auction that was already extended by the old code
//
// Auctions whose property was ALREADY deleted (no snapshot recoverable) are
// reported and left alone — they resolve via the controlled "property no
// longer available" fallback. Idempotent: re-running is a no-op.
const APPLY = process.argv.includes('--apply');
const gs = db.gamestates ? db.gamestates.findOne({ key: 'global' }) : null;
print('CURRENT_TICK=' + (gs ? gs.tickNumber : -1));
print('MODE=' + (APPLY ? 'APPLY' : 'DRY-RUN (read-only, no writes)'));

// 1) Snapshot backfill for auctions whose property still exists.
const cands = db.auctions
  .find({ $or: [{ propertySnapshot: { $exists: false } }, { propertySnapshot: null }] })
  .toArray();
let snapshotsBackfilled = 0;
let snapshotsAlready = 0;
let dangling = 0;
const danglingIds = [];
for (const a of cands) {
  const prop = a.propertyId ? db.properties.findOne({ _id: a.propertyId }) : null;
  if (!prop) {
    dangling++;
    danglingIds.push(a._id.toString());
    continue;
  }
  const snapshot = {
    propertyId: prop._id,
    name: typeof prop.name === 'string' ? prop.name : null,
    type: prop.type || null,
    propertyRating: prop.propertyRating || null,
    condition: typeof prop.condition === 'number' ? prop.condition : null,
    currentPrice: prop.currentPrice != null ? prop.currentPrice : prop.basePrice ?? null,
    basePrice: prop.basePrice ?? null,
    cityId: prop.cityId || null,
    location: typeof prop.location === 'string' ? prop.location : null,
  };
  if (APPLY) {
    db.auctions.updateOne({ _id: a._id }, { $set: { propertySnapshot: snapshot } });
  }
  snapshotsBackfilled++;
}
print('SNAPSHOT_BACKFILLED=' + snapshotsBackfilled);
print('SNAPSHOT_DANGLING_NO_PROPERTY=' + dangling);
print('DANGLING_SAMPLES=' + JSON.stringify(danglingIds.slice(0, 10)));

// 2) extensionCount backfill (legacy auctions extended by old code).
const extNeeding = db.auctions
  .find({ extensionCount: { $exists: false } })
  .toArray()
  .map((a) => {
    const delta = Math.max(0, (a.endTick || a.originalEndTick) - (a.originalEndTick || a.endTick));
    return { id: a._id.toString(), delta };
  });
const extExtended = extNeeding.filter((e) => e.delta > 0);
print('EXTENSION_COUNT_MISSING=' + extNeeding.length);
print('EXTENSION_COUNT_NEEDING_NONZERO=' + extExtended.length);
print('EXTENSION_NONZERO_SAMPLES=' + JSON.stringify(extExtended.slice(0, 10)));

if (APPLY) {
  db.auctions.updateMany(
    { extensionCount: { $exists: false }, $expr: { $gt: [{ $subtract: ['$endTick', '$originalEndTick'] }, 0] } },
    [{ $set: { extensionCount: { $max: [0, { $subtract: ['$endTick', '$originalEndTick'] }] } } }],
  );
  db.auctions.updateMany({ extensionCount: { $exists: false } }, { $set: { extensionCount: 0 } });
  print('APPLIED: snapshots + extensionCount written.');
}

// 3) Verify current state after backfill.
const withSnap = db.auctions.countDocuments({ propertySnapshot: { $exists: true } });
const withCount = db.auctions.countDocuments({ extensionCount: { $exists: true } });
const mismatched = db.auctions
  .find({
    extensionCount: { $exists: true },
    $expr: { $ne: ['$extensionCount', { $max: [0, { $subtract: ['$endTick', '$originalEndTick'] }] }] },
  })
  .toArray();
print('VERIFY_AUCTIONS_TOTAL=' + db.auctions.countDocuments({}));
print('VERIFY_WITH_SNAPSHOT=' + withSnap);
print('VERIFY_WITH_EXTENSION_COUNT=' + withCount);
print('VERIFY_EXTENSION_COUNT_MISMATCH=' + mismatched.length);
print('AUDIT_DONE');