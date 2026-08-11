#!/usr/bin/env node
/**
 * findDuplicateNotifications.js — READ-ONLY diagnostic report.
 *
 * Scans the notifications collection for duplicate records of the same
 * logical event and prints a report grouped by:
 *     user / notification type / event key / duplicate count
 *
 * For legacy notifications without an `eventKey`, a structural key is
 * derived from type + entity ids (same rule as new notifications) so the
 * report is comparable with the new system.
 *
 * This script performs NO writes. Cleanup, if ever needed, must be a
 * separate, reviewed migration executed deliberately by an operator.
 *
 * Usage:
 *   node src/scripts/findDuplicateNotifications.js [--limit 100]
 */
import mongoose from 'mongoose';
import { config } from '../config/index.js';

const LIMIT = Number(process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] || 500);

function deriveLegacyKey(n) {
  const parts = [n.type];
  if (n.entityType) parts.push(n.entityType);
  const entityId = n.entityId || n.relatedId;
  if (entityId) parts.push(String(entityId));
  else if (n.userId) parts.push(`user:${n.userId}`);
  return parts.join(':');
}

async function main() {
  await mongoose.connect(config.mongodbUri);
  const db = mongoose.connection.db;
  const coll = db.collection('notifications');

  const cursor = coll
    .find({}, { projection: { _id: 1, userId: 1, type: 1, eventKey: 1, eventId: 1, title: 1, createdAt: 1 } })
    .limit(LIMIT);

  const groups = new Map();
  let scanned = 0;

  for await (const n of cursor) {
    scanned++;
    const key = n.eventKey || deriveLegacyKey(n);
    const userId = n.userId ? String(n.userId) : 'global';
    const gkey = `${userId}|${n.type}|${key}`;
    if (!groups.has(gkey)) groups.set(gkey, []);
    groups.get(gkey).push({ _id: String(n._id), createdAt: n.createdAt, eventKey: key, legacy: !n.eventKey });
  }

  console.log(`Scanned ${scanned} notifications (limit ${LIMIT}).`);
  console.log('');

  let duplicateGroups = 0;
  let duplicateRecords = 0;

  for (const [gkey, docs] of groups) {
    if (docs.length < 2) continue;
    duplicateGroups++;
    duplicateRecords += docs.length - 1;
    const [userId, type, eventKey] = gkey.split('|');
    console.log(`DUPLICATE: user=${userId} type=${type}`);
    console.log(`  eventKey: ${eventKey} (legacy=${docs.some((d) => d.legacy)})`);
    console.log(`  count: ${docs.length} ids: ${docs.map((d) => d._id).join(', ')}`);
    console.log('');
  }

  console.log(
    duplicateGroups > 0
      ? `FOUND ${duplicateGroups} duplicate groups (${duplicateRecords} extra records). No changes made.`
      : 'No duplicates found in the scanned range.',
  );

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
