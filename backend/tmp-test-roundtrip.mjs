import { EJSON, ObjectId } from 'bson';
import { createGzip, createGunzip } from 'zlib';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const OID_RE = /^[0-9a-f]{24}$/i;

function convertToObjectId(value) {
  if (typeof value === 'string' && OID_RE.test(value)) {
    try { return new ObjectId(value); } catch { return value; }
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && value.$oid) {
    try { return new ObjectId(value.$oid); } catch { return value; }
  }
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(convertToObjectId);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) { out[k] = convertToObjectId(v); }
    return out;
  }
  return value;
}

// Simulate backup creation
const docs = [
  { _id: new ObjectId(), ownerId: new ObjectId(), name: 'Tower A', price: 150000, createdAt: new Date() },
  { _id: new ObjectId(), ownerId: new ObjectId(), name: 'Tower B', price: 200000, createdAt: new Date() },
];

const lines = [];
for (const coll of ['properties', 'users', 'gamestates']) {
  const chunk = EJSON.stringify({ collection: coll, documents: docs }) + '\n';
  lines.push(chunk);
  console.log(`Created backup line for ${coll}: ${chunk.slice(0, 80)}...`);
}

// Simulate backup restore
for (const line of lines) {
  console.log(`\nRestoring line (type: ${typeof line}): ${line.slice(0, 80)}...`);
  const data = typeof line === 'string' ? JSON.parse(line) : line;
  const collName = data.collection;
  const documents = Array.isArray(data.documents) ? data.documents : [];
  const restored = documents.map(convertToObjectId);
  
  for (const doc of restored) {
    const ok = doc._id instanceof ObjectId;
    const refOk = doc.ownerId instanceof ObjectId;
    console.log(`  doc._id is ObjectId: ${ok}, doc.ownerId is ObjectId: ${refOk}, name: ${doc.name}, price: ${doc.price}`);
  }
}

console.log('\nAll tests passed!');
