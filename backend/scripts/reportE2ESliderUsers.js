// Production hygiene report for the two E2E slider test users.
// READ-ONLY. Prints identity + cross-collection dependency counts and whether
// the account is already soft-deleted, so we can confirm they are pure test
// artifacts before doing anything else. Never redirects to real usernames.
const USERNAMES = ['e2e_slider_b_238448', 'e2e_slider_290592'];
const existing = new Set(db.getCollectionNames());
const iso = (d) => {
  try {
    return d && typeof d.toISOString === 'function' ? d.toISOString() : String(d ?? '');
  } catch {
    return String(d ?? '');
  }
};
// { collection, user field(s) } — every DB ref these test users could hold.
const DEPENDENCIES = [
  { c: 'properties', f: 'ownerId' },
  { c: 'transactions', f: ['buyerId', 'sellerId'] },
  { c: 'auctions', f: ['sellerId', 'currentBidderId', 'winnerId', 'watchers'] },
  { c: 'auctions', f: 'bids.bidderId' },
  { c: 'realestatecompanies', f: ['ceoId', 'members.userId', 'invitations.userId', 'applications.userId'] },
  { c: 'notifications', f: 'userId' },
  { c: 'loans', f: 'userId' },
  { c: 'constructionprojects', f: 'ownerId' },
  { c: 'marketreports', f: 'userId' },
  { c: 'auctionreservations', f: 'userId' },
  { c: 'auctionreputations', f: 'userId' },
  { c: 'missionprogresses', f: 'userId' },
  { c: 'chatmessages', f: 'senderId' },
];

for (const username of USERNAMES) {
  const u = db.users.findOne({ username });
  if (!u) {
    print(`${username} NOT_FOUND`);
    continue;
  }
  print(
    `USER ${username} id=${u._id} role=${u.role} balance=${u.balance} deletedAt=${iso(u.deletedAt)} banned=${!!u.banned} created=${iso(u.createdAt)}`,
  );
  for (const dep of DEPENDENCIES) {
    if (!existing.has(dep.c)) continue;
    for (const field of Array.isArray(dep.f) ? dep.f : [dep.f]) {
      const q = { [field]: u._id };
      let n = 0;
      try {
        n = db[dep.c].countDocuments(q);
      } catch (e) {
        n = 'ERR';
      }
      print(`  ${dep.c}.${field}=${n}`);
    }
  }
  print('--');
}
print('REPORT_DONE');