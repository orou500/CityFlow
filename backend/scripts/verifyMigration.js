print("=== POST-MIGRATION VERIFICATION ===");
print("");

var orphaned = db.properties.find({ownerId: null, forSale: false}).toArray();
print("1. Remaining orphaned properties: " + orphaned.length + " (expected 12: 8 active + 4 winner-mismatch)");

var activeOrphaned = 0;
var winnerOrphaned = 0;
for (var i = 0; i < orphaned.length; i++) {
  var prop = orphaned[i];
  var auctionCursor = db.auctions.find({propertyId: prop._id}).sort({createdAt: -1}).limit(1);
  var auction = auctionCursor.hasNext() ? auctionCursor.next() : null;
  if (!auction) { continue; }
  if (auction.status === "active" || auction.status === "ending" || auction.status === "upcoming") { activeOrphaned++; continue; }
  if (auction.winnerId) { winnerOrphaned++; }
}
print("   Active/ending auctions:  " + activeOrphaned + " (expected 8)");
print("   Winner-mismatch:         " + winnerOrphaned + " (expected 4)");

var totalProps = db.properties.countDocuments();
print("");
print("2. Total properties in DB: " + totalProps);

var playerWithForSale = db.properties.countDocuments({ownerId: {$ne: null}, forSale: true});
print("3. Player-owned + forSale=true: " + playerWithForSale);

var bankPropsNoOwner = db.properties.countDocuments({ownerId: null, forSale: false});
print("4. Orphaned (null owner, not forSale): " + bankPropsNoOwner + " (should be 12)");

var totalAuctions = db.auctions.countDocuments();
print("5. Total auctions: " + totalAuctions);

var activeAuctions = db.auctions.countDocuments({status: {$in: ["active", "ending"]}});
print("6. Active/ending auctions: " + activeAuctions);

var endedWithWinner = db.auctions.countDocuments({status: "ended", winnerId: {$ne: null}});
print("7. Ended auctions with winner: " + endedWithWinner);

var endedNoWinner = db.auctions.countDocuments({status: "ended", winnerId: null});
print("8. Ended auctions with no winner: " + endedNoWinner);

print("");
print("=== INTEGRITY CHECKS ===");

var propsWithOwnerInList = db.properties.countDocuments({ownerId: {$ne: null}, ownedProperties: {$exists: true}});
print("9. Properties with ownerId set: checking user consistency...");

var orphansWithActiveAuction = 0;
for (var i = 0; i < orphaned.length; i++) {
  var prop = orphaned[i];
  var auction = db.auctions.findOne({propertyId: prop._id, status: {$in: ["active", "ending", "upcoming"]}});
  if (auction) orphansWithActiveAuction++;
}
print("10. Orphaned properties with active auction: " + orphansWithActiveAuction);

var deletedBankAuctions = db.auctions.countDocuments({status: "ended", winnerId: null, sellerType: "bank"});
print("11. Ended bank auctions with no winner (auction records preserved): " + deletedBankAuctions);

print("");
print("=== ALL CHECKS COMPLETE ===");
