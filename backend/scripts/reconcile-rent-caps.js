import 'dotenv/config';
import mongoose from 'mongoose';
import Property from '../src/models/Property.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/cityflow';
const APPLY = process.argv.includes('--apply');

async function main() {
  await mongoose.connect(MONGODB_URI);

  const properties = await Property.find({ rentPerUnit: { $gt: 0 } })
    .select('name type rent rentPerUnit maxValidatedRentPerUnit')
    .lean();

  const ops = [];
  const affected = [];
  for (const p of properties) {
    const grandfathered = Math.max(p.rentPerUnit || 0, p.maxValidatedRentPerUnit || 0);
    if (grandfathered > 0 && (p.maxValidatedRentPerUnit || 0) !== grandfathered) {
      ops.push({
        updateOne: {
          filter: { _id: p._id },
          update: { $set: { maxValidatedRentPerUnit: grandfathered } },
        },
      });
      affected.push(p);
    }
  }

  const total = properties.length;
  console.log(`Total properties with a per-unit rent: ${total}`);
  console.log(`Properties missing a validated rent cap: ${affected.length}`);
  console.log(`Pending updates: ${ops.length}`);
  for (const p of affected.slice(0, 50)) {
    console.log(
      `  ${p._id} "${p.name}" rent=${p.rent} rentPerUnit=${p.rentPerUnit} maxValidated=${p.maxValidatedRentPerUnit || 0}`,
    );
  }
  if (affected.length > 50) {
    console.log(`  ... and ${affected.length - 50} more`);
  }

  if (ops.length === 0) {
    console.log('Already in sync — nothing to do.');
  } else if (APPLY) {
    for (let i = 0; i < ops.length; i += 500) {
      await Property.bulkWrite(ops.slice(i, i + 500));
    }
    console.log(`Applied ${ops.length} updates. Idempotent — re-running is a no-op.`);
  } else {
    console.log('DRY RUN — no changes written. Re-run with --apply to backfill.');
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
