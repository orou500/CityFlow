// READ-ONLY production auction audit — no writes.
const gs = db.gamestates.findOne({ key: 'global' });
const currentTick = gs ? gs.tickNumber : -1;
print('CURRENT_TICK=' + currentTick);
print('LAST_TICK_AT=' + (gs ? gs.lastTickAt : 'n/a'));

// 1) Auctions whose property doc no longer exists (dangling propertyId)
const propIds = db.auctions.distinct('propertyId');
const existing = new Set(
  db.properties.distinct('_id', { _id: { $in: propIds } }).map((x) => x.toString())
);
const dangling = db.auctions.find({}).toArray().filter((a) => {
  if (!a.propertyId) return true;
  const s = a.propertyId.toString ? a.propertyId.toString() : String(a.propertyId);
  return !existing.has(s);
});
print('TOTAL_AUCTIONS=' + db.auctions.countDocuments({}));
print('DANGLING_PROPERTY_AUCTIONS=' + dangling.length);
const danglingByStatus = {};
for (const a of dangling) danglingByStatus[a.status] = (danglingByStatus[a.status] || 0) + 1;
print('DANGLING_BY_STATUS=' + JSON.stringify(danglingByStatus));
print('---DANGLING_SAMPLE---');
dangling.slice(0, 15).forEach((a) =>
  print(
    [a._id.toString(), a.status, a.propertyId ? String(a.propertyId) : 'null', a.sellerType, (a.bids || []).length]
      .join(' | ')
  )
);

// 2) Auction timing consistency: endTick vs originalEndTick (extensions)
const extended = db.auctions.find({ $expr: { $ne: ['$endTick', '$originalEndTick'] } }).toArray();
print('EXTENDED_AUCTIONS=' + extended.length);
const deltaCounts = {};
for (const a of extended) {
  const d = a.endTick - a.originalEndTick;
  const key = (d > 0 ? '+' : '') + d + ' tick(s)';
  deltaCounts[key] = (deltaCounts[key] || 0) + 1;
}
print('EXTENSION_DELTAS=' + JSON.stringify(deltaCounts));
const big = extended.filter((a) => a.endTick - a.originalEndTick !== 1);
print('NON_SINGLE_EXTENSIONS=' + big.length);
big.slice(0, 15).forEach((a) =>
  print(
    [
      a._id.toString(),
      a.status,
      'start=' + a.startTick,
      'end=' + a.endTick,
      'orig=' + a.originalEndTick,
      'delta=' + (a.endTick - a.originalEndTick),
      'bids=' + (a.bids || []).length,
      'lastBidTick=' + (a.bids && a.bids.length ? a.bids[a.bids.length - 1].tick : '-'),
    ].join(' | ')
  )
);

// 3) Auctions where remaining time could have increased: active auctions whose
//    last bid's tick is > endTick - 2 (i.e., bid landed inside the anti-sniping
//    window) and which were extended.
const activeNow = db.auctions.find({ status: 'active' }).toArray();
print('ACTIVE_AUCTIONS=' + activeNow.length);
const windowHits = activeNow.filter((a) => {
  const last = a.bids && a.bids.length ? a.bids[a.bids.length - 1].tick : null;
  return last != null && a.endTick - last <= 2;
});
print('ACTIVE_WITH_LAST_BID_IN_WINDOW=' + windowHits.length);
windowHits.forEach((a) =>
  print(
    [
      a._id.toString(),
      'end=' + a.endTick,
      'orig=' + a.originalEndTick,
      'delta=' + (a.endTick - a.originalEndTick),
      'lastBidTick=' + a.bids[a.bids.length - 1].tick,
      'currentTick=' + currentTick,
      'remaining=' + (a.endTick - currentTick),
    ].join(' | ')
  )
);

// 4) Weird: endTick < originalEndTick, or endTick <= startTick
const weird = db.auctions
  .find({ $or: [{ $expr: { $lt: ['$endTick', '$originalEndTick'] } }, { $expr: { $lte: ['$endTick', '$startTick'] } }] })
  .toArray();
print('WEIRD_TIMING_AUCTIONS=' + weird.length);
weird.slice(0, 10).forEach((a) =>
  print([a._id.toString(), a.status, 'start=' + a.startTick, 'end=' + a.endTick, 'orig=' + a.originalEndTick].join(' | '))
);

// 5) Auctions in 'ending'/'ended'/'cancelled' per sellerType
print('BY_STATUS=' + JSON.stringify(db.auctions.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]).toArray()));
print('ENDED_NO_WINNER=' + db.auctions.countDocuments({ status: 'ended', winningBid: { $lte: 0 } }));
print('CANCELLED=' + db.auctions.countDocuments({ status: 'cancelled' }));
print('AUDIT_DONE');