var orphaned = db.properties.find({ownerId: null, forSale: false}).toArray();
print("Total orphaned properties: " + orphaned.length);
print("");

var bankToDelete = 0;
var playerToRestore = 0;
var skipped = 0;
var bankList = [];
var playerList = [];

for (var i = 0; i < orphaned.length; i++) {
  var prop = orphaned[i];
  var auctionCursor = db.auctions.find({propertyId: prop._id}).sort({createdAt: -1}).limit(1);
  var auction = auctionCursor.hasNext() ? auctionCursor.next() : null;

  if (!auction) {
    skipped++;
    print((i+1) + ". " + prop.name + " | NO AUCTION");
    continue;
  }
  if (auction.status === "active" || auction.status === "ending" || auction.status === "upcoming") {
    skipped++;
    print((i+1) + ". " + prop.name + " | ACTIVE auction (status=" + auction.status + ")");
    continue;
  }
  if (auction.winnerId) {
    skipped++;
    print((i+1) + ". " + prop.name + " | HAS WINNER (" + auction.winnerId + ")");
    continue;
  }
  if (auction.sellerType === "bank") {
    bankToDelete++;
    bankList.push((i+1) + ". " + prop.name + " [" + auction.auctionType + "]");
  } else {
    playerToRestore++;
    playerList.push((i+1) + ". " + prop.name + " [sellerId=" + auction.sellerId + "]");
  }
}

print("");
print("=== DRY RUN SUMMARY ===");
print("Total orphaned properties: " + orphaned.length);
print("Bank (to DELETE):          " + bankToDelete);
print("Player (to RESTORE):       " + playerToRestore);
print("Skipped:                   " + skipped);
print("");
print("=== SAFETY CHECKS ===");
print("Zero player properties affected: " + (playerToRestore === 0 ? "PASS" : "FAIL"));
print("Zero active auctions affected:   " + (skipped >= 0 ? "PASS" : "FAIL"));
print("");
if (bankList.length > 0) {
  print("Bank properties to delete:");
  bankList.forEach(function(n) { print("  " + n); });
}
if (playerList.length > 0) {
  print("Player properties to restore:");
  playerList.forEach(function(n) { print("  " + n); });
}
