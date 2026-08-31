var orphaned = db.properties.find({ownerId: null, forSale: false}).toArray();
var bankDeleted = 0;
var skipped = 0;

for (var i = 0; i < orphaned.length; i++) {
  var prop = orphaned[i];
  var auctionCursor = db.auctions.find({propertyId: prop._id}).sort({createdAt: -1}).limit(1);
  var auction = auctionCursor.hasNext() ? auctionCursor.next() : null;

  if (!auction || auction.status === "active" || auction.status === "ending" || auction.status === "upcoming" || auction.winnerId) {
    skipped++;
    continue;
  }

  if (auction.sellerType === "bank") {
    var result = db.properties.deleteOne({_id: prop._id});
    if (result.deletedCount === 1) {
      bankDeleted++;
      print("DELETED: " + prop.name + " (auction " + auction._id + ")");
    }
  }
}

print("");
print("=== MIGRATION RESULT ===");
print("Bank properties deleted: " + bankDeleted);
print("Skipped:                 " + skipped);
print("");
print("Remaining orphaned (active auctions + winner-mismatch): " + (orphaned.length - bankDeleted));
