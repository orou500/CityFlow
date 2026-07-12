import fs from 'fs/promises';
import { appendFileSync } from 'fs';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip, createGunzip } from 'zlib';
import path from 'path';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { config } from '../config/index.js';
import Backup from '../models/Backup.js';
import { setMaintenanceMode } from '../models/GameState.js';

const LOG_FILE = path.join(config.backupDir, 'backup.log');

function appendLog(level, message) {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level.toUpperCase()}] ${message}\n`;
  try {
    appendFileSync(LOG_FILE, line);
  } catch {
    // backup dir may not exist yet
  }
  console.log(`[BACKUP] ${message}`);
}

export async function ensureBackupDir() {
  await fs.mkdir(config.backupDir, { recursive: true });
}

function normalizeBackupIdentifier(backupId) {
  if (typeof backupId !== 'string') return backupId;
  const trimmed = backupId.trim();
  const objectIdMatch = trimmed.match(/^(?:new\s+)?ObjectId\(['"]([0-9a-fA-F]{24})['"]\)$/);
  if (objectIdMatch) return objectIdMatch[1];
  const objectIdQueryMatch = trimmed.match(/^\{\s*_id\s*:\s*(?:new\s+)?ObjectId\(['"]([0-9a-fA-F]{24})['"]\)\s*\}$/);
  if (objectIdQueryMatch) return objectIdQueryMatch[1];
  return trimmed;
}

export async function findBackupByIdentifier(backupId) {
  const id = normalizeBackupIdentifier(backupId);
  let backup = null;
  if (typeof id === 'string') {
    if (/^[0-9a-fA-F]{24}$/.test(id)) {
      try {
        backup = await Backup.findById(id);
      } catch {
        backup = null;
      }
    }
    if (!backup) {
      backup = await Backup.findOne({ filename: id });
    }
    if (!backup) {
      backup = await Backup.findOne({ originalName: id });
    }
    if (!backup) {
      const directFilepath = path.isAbsolute(id) ? id : path.join(config.backupDir, id);
      try {
        await fs.access(directFilepath);
        return {
          filename: path.basename(directFilepath),
          filepath: directFilepath,
          status: 'completed',
          __fileOnly: true,
        };
      } catch {
        // ignore
      }
    }
  }
  return backup;
}

export async function validateBackupGzip(filepath) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filepath).pipe(createGunzip());
    let buffer = '';
    let finished = false;

    const cleanup = () => {
      finished = true;
      stream.destroy();
    };

    const parseLine = (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const data = EJSON.parse(trimmed, { relaxed: true });
        if (!data || typeof data.collection !== 'string') {
          throw new Error('Missing collection metadata');
        }
        resolve();
      } catch (err) {
        reject(new Error(`Invalid backup gzip file: ${err.message}`));
      } finally {
        cleanup();
      }
    };

    stream.on('data', (chunk) => {
      buffer += chunk.toString();
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) return;
      parseLine(buffer.slice(0, newlineIndex));
    });

    stream.on('end', () => {
      if (finished) return;
      if (buffer.trim()) {
        parseLine(buffer);
      } else {
        reject(new Error('Backup gzip file is empty or not a valid backup'));
      }
    });

    stream.on('error', (err) => {
      if (!finished) {
        reject(new Error(`Invalid backup gzip file: ${err.message}`));
      }
    });
  });
}

function pushLog(backup, level, message) {
  return Backup.updateOne({ _id: backup._id }, { $push: { logs: { timestamp: new Date(), level, message } } });
}

const SKIP_RESTORE_COLLECTIONS = new Set(['backups']);

export function shouldSkipRestoreCollection(collectionName) {
  return SKIP_RESTORE_COLLECTIONS.has(collectionName);
}

function isObjectIdLikeBufferObject(value) {
  if (!value || typeof value !== 'object') return false;
  const keys = Object.keys(value);
  if (keys.length !== 12) return false;
  for (let i = 0; i < 12; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, String(i))) return false;
    const v = value[String(i)];
    if (typeof v === 'number') {
      if (v < 0 || v > 255) return false;
    } else if (typeof v === 'string') {
      const num = Number(v);
      if (Number.isNaN(num) || num < 0 || num > 255) return false;
    } else {
      return false;
    }
  }
  return true;
}

function toBuffer(value) {
  if (value == null || typeof value !== 'object') return null;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) return value;
  if (value.type === 'Buffer' && Array.isArray(value.data)) {
    return Buffer.from(value.data);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'data') && typeof value.data === 'object' && value.data !== null) {
    const data = value.data;
    if (Array.isArray(data)) return Buffer.from(data);
    if (isObjectIdLikeBufferObject(data)) {
      return Buffer.from(Object.values(data).map((v) => (typeof v === 'string' ? Number(v) : v)));
    }
  }
  if (isObjectIdLikeBufferObject(value)) {
    return Buffer.from(Object.values(value).map((v) => (typeof v === 'string' ? Number(v) : v)));
  }
  return null;
}

function logBackup(backup, level, message) {
  if (backup && backup._id) {
    return pushLog(backup, level, message);
  }
  appendLog(level, message);
  return Promise.resolve();
}

function normalizeObjectIdValue(value) {
  if (value == null || typeof value !== 'object') return null;

  if (value instanceof mongoose.Types.ObjectId) return value;

  if (typeof value.toHexString === 'function') {
    try {
      return new mongoose.Types.ObjectId(value.toHexString());
    } catch {
      // fall through
    }
  }

  if (value._bsontype === 'ObjectID') {
    try {
      return new mongoose.Types.ObjectId(value.id);
    } catch {
      // fall through
    }
  }

  if (typeof value.toString === 'function') {
    const str = value.toString();
    if (/^[0-9a-fA-F]{24}$/.test(str)) {
      try {
        return new mongoose.Types.ObjectId(str);
      } catch {
        // fall through
      }
    }
  }

  if (typeof value === 'string' && /^[0-9a-fA-F]{24}$/.test(value)) {
    try {
      return new mongoose.Types.ObjectId(value);
    } catch {
      // fall through
    }
  }

  const keys = Object.keys(value);
  if (keys.length === 1 && typeof value.$oid !== 'undefined') {
    if (typeof value.$oid === 'string') {
      try {
        return new mongoose.Types.ObjectId(value.$oid);
      } catch {
        // fall through
      }
    }
    return normalizeObjectIdValue(value.$oid);
  }

  if (keys.length === 1 && typeof value.$binary !== 'undefined') {
    if (value.$binary && typeof value.$binary.base64 === 'string') {
      try {
        const buffer = Buffer.from(value.$binary.base64, 'base64');
        if (buffer.length === 12) return new mongoose.Types.ObjectId(buffer);
      } catch {
        // fall through
      }
    }
  }

  const buffer = toBuffer(value);
  if (buffer && buffer.length === 12) {
    try {
      return new mongoose.Types.ObjectId(buffer);
    } catch {
      // fall through
    }
  }

  return null;
}

function convertExtendedJSONValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(convertExtendedJSONValue);
  if (typeof value !== 'object') return value;

  const objectId = normalizeObjectIdValue(value);
  if (objectId) return objectId;

  const keys = Object.keys(value);
  if (keys.length === 1 && keys[0] === '$binary' && value.$binary && typeof value.$binary.base64 === 'string') {
    try {
      return Buffer.from(value.$binary.base64, 'base64');
    } catch {
      return value;
    }
  }

  if (keys.length === 1 && keys[0] === '$date') {
    const dateValue = value.$date;
    if (dateValue instanceof Date) return dateValue;
    if (typeof dateValue === 'number' || typeof dateValue === 'string') {
      const date = new Date(dateValue);
      if (!Number.isNaN(date.getTime())) return date;
      return value;
    }
    if (dateValue && typeof dateValue === 'object') {
      if (typeof dateValue.$numberLong === 'string') {
        const ms = Number(dateValue.$numberLong);
        if (!Number.isNaN(ms)) return new Date(ms);
      }
    }
    return value;
  }

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date)) {
      const nestedObjectId = normalizeObjectIdValue(v);
      if (nestedObjectId) {
        out[k] = nestedObjectId;
        continue;
      }
      if (typeof v.toHexString === 'function' || v._bsontype === 'ObjectID' || Object.keys(v).length === 0) {
        try {
          const hex = typeof v.toHexString === 'function' ? v.toHexString() : String(v);
          if (/^[0-9a-fA-F]{24}$/.test(hex)) {
            out[k] = new mongoose.Types.ObjectId(hex);
            continue;
          }
        } catch {
          // fall through
        }
      }
    }
    out[k] = convertExtendedJSONValue(v);
  }
  return out;
}

function normalizeAllObjectIds(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value;
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (Array.isArray(value)) return value.map(normalizeAllObjectIds);
  if (typeof value !== 'object' || value instanceof Buffer) return value;

  const objectId = normalizeObjectIdValue(value);
  if (objectId) return objectId;

  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = normalizeAllObjectIds(v);
  }
  return out;
}

export async function createBackup(userId, type = 'manual') {
  await ensureBackupDir();

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `backup-${timestamp}-${crypto.randomBytes(4).toString('hex')}.json.gz`;
  const filepath = path.join(config.backupDir, filename);

  const backup = await Backup.create({
    filename,
    type,
    status: 'creating',
    createdBy: userId,
    logs: [{ timestamp: new Date(), level: 'info', message: 'Backup creation started' }],
  });

  const start = Date.now();

  try {
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    await pushLog(
      backup,
      'info',
      `Found ${collections.length} collections: ${collections.map((c) => c.name).join(', ')}`,
    );

    const writeStream = createWriteStream(filepath);
    const gzip = createGzip();
    const pipePromise = pipeline(gzip, writeStream);

    let totalDocs = 0;

    for (const colInfo of collections) {
      const collName = colInfo.name;
      if (collName === 'backups') {
        await pushLog(backup, 'info', `Skipped backing up collection: ${collName}`);
        continue;
      }

      const collection = db.collection(collName);
      const docs = await collection.find().toArray();

      const chunk = EJSON.stringify({ collection: collName, documents: docs }) + '\n';
      gzip.write(chunk);
      totalDocs += docs.length;

      await pushLog(backup, 'info', `Exported ${collName}: ${docs.length} documents`);
    }

    gzip.end();
    await pipePromise;

    const stat = await fs.stat(filepath);
    const duration = Math.round((Date.now() - start) / 1000);

    backup.size = stat.size;
    backup.duration = duration;
    backup.collections = collections.length;
    backup.status = 'completed';
    await backup.save();
    await pushLog(
      backup,
      'info',
      `Backup completed: ${formatBytes(stat.size)}, ${totalDocs} documents in ${collections.length} collections, ${duration}s`,
    );

    appendLog(
      'info',
      `Created ${filename} (${formatBytes(stat.size)}) - ${totalDocs} docs in ${collections.length} collections, ${duration}s`,
    );
    return backup;
  } catch (err) {
    backup.status = 'failed';
    backup.error = err.message;
    await pushLog(backup, 'error', `Backup failed: ${err.message}`);
    await backup.save();
    appendLog('error', `Create failed: ${err.message}`);
    throw err;
  }
}

export async function restoreBackup(backupId, userId) {
  const backup = await findBackupByIdentifier(backupId);
  if (!backup) throw new Error('Backup not found');
  if (backup.status && backup.status !== 'completed') throw new Error('Backup is not in completed status');

  const filepath = backup.filepath || path.join(config.backupDir, backup.filename);
  try {
    await fs.access(filepath);
  } catch {
    throw new Error('Backup file not found on disk');
  }

  await logBackup(backup, 'info', 'Restore started, enabling maintenance mode');
  await setMaintenanceMode(true, 'Database restoration in progress.', userId);
  appendLog('info', `Restore started for ${backup.filename}, maintenance mode enabled`);

  if (backup._id) {
    backup.status = 'restoring';
    backup.error = undefined;
    await backup.save();
  }

  try {
    const db = mongoose.connection.db;
    let preservedAdmin = null;
    try {
      preservedAdmin = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(userId) });
      if (preservedAdmin) {
        appendLog('info', `Preserved admin user: ${preservedAdmin.username} (${preservedAdmin._id})`);
      }
    } catch {
      // userId may not be a valid ObjectId or user may not exist yet
    }

    const gunzip = createGunzip();
    const readStream = createReadStream(filepath);

    let buffer = '';
    const pendingLines = [];

    await new Promise((resolve, reject) => {
      const stream = readStream.pipe(gunzip);
      stream.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop();
        for (const line of lines) {
          if (line.trim()) pendingLines.push(line);
        }
      });
      stream.on('end', () => {
        if (buffer.trim()) pendingLines.push(buffer);
        resolve();
      });
      stream.on('error', reject);
    });

    let collectionsRestored = 0;
    const expectedCounts = {};
    for (const line of pendingLines) {
      let collName, documents;
      try {
        const data = typeof line === 'string' ? EJSON.parse(line, { relaxed: true }) : line;
        collName = data.collection;
        documents = Array.isArray(data.documents) ? data.documents : [];
        expectedCounts[collName] = documents.length;
      } catch (parseErr) {
        try {
          const data = JSON.parse(line);
          collName = data.collection;
          documents = Array.isArray(data.documents) ? data.documents : [];
        } catch (jsonErr) {
          throw new Error(
            `Failed to parse backup collection: ${parseErr.message}; fallback failed: ${jsonErr.message}`,
            {
              cause: jsonErr,
            },
          );
        }
      }

      if (shouldSkipRestoreCollection(collName)) {
        await logBackup(backup, 'info', `Skipping restore of ${collName} collection to preserve current system state`);
        continue;
      }

      documents = documents.map((doc) => {
        const converted = convertExtendedJSONValue(doc);
        const normalized = normalizeAllObjectIds(converted);

        if (normalized._id != null && !(normalized._id instanceof mongoose.Types.ObjectId)) {
          const oid = normalizeObjectIdValue(normalized._id);
          if (oid) {
            normalized._id = oid;
          } else {
            try {
              normalized._id = new mongoose.Types.ObjectId(String(normalized._id));
            } catch {
              appendLog(
                'warn',
                `Generating new _id for document in ${collName} (was: ${JSON.stringify(normalized._id)})`,
              );
              normalized._id = new mongoose.Types.ObjectId();
            }
          }
        }

        return normalized;
      });

      if (documents.length > 0) {
        try {
          await db.dropCollection(collName);
        } catch {
          // collection may not exist
        }

        try {
          const result = await db.collection(collName).insertMany(documents, { ordered: false });

          if (collName === 'properties' && result.insertedIds.length > 0) {
            const insertedId = result.insertedIds[0];
            const inserted = await db.collection(collName).findOne({ _id: insertedId });
            appendLog(
              'info',
              `Property inserted: _id=${inserted._id} (type: ${typeof inserted._id}), cityId type: ${typeof inserted.cityId}`,
            );
          }

          collectionsRestored++;
        } catch (insertErr) {
          throw new Error(`Failed to insert documents into ${collName}: ${insertErr.message}`, { cause: insertErr });
        }

        if (collName === 'users' && preservedAdmin) {
          const adminExists = await db.collection('users').findOne({ _id: preservedAdmin._id });
          if (!adminExists) {
            await db.collection('users').insertOne(preservedAdmin);
            appendLog('info', `Re-inserted admin user: ${preservedAdmin.username}`);
          }
        }
      }
    }

    const validationResults = [];
    for (const [collName, expectedCount] of Object.entries(expectedCounts)) {
      try {
        const actualCount = await db.collection(collName).countDocuments();
        const status = actualCount === expectedCount ? 'OK' : 'MISMATCH';
        validationResults.push({ collection: collName, expected: expectedCount, actual: actualCount, status });
        if (actualCount !== expectedCount) {
          await logBackup(
            backup,
            'warn',
            `Validation mismatch for ${collName}: expected ${expectedCount}, got ${actualCount}`,
          );
        }
      } catch {
        validationResults.push({ collection: collName, expected: expectedCount, actual: -1, status: 'ERROR' });
      }
    }
    const mismatches = validationResults.filter((r) => r.status !== 'OK');
    if (mismatches.length > 0) {
      await logBackup(
        backup,
        'warn',
        `Restore validation: ${mismatches.length} collection(s) have count mismatches: ${mismatches.map((m) => `${m.collection} (expected ${m.expected}, got ${m.actual})`).join(', ')}`,
      );
    } else {
      await logBackup(
        backup,
        'info',
        `Restore validation: all ${validationResults.length} collections match expected counts`,
      );
    }

    await logBackup(backup, 'info', `Restore completed: ${collectionsRestored} collections restored`);
    if (backup._id) {
      backup.status = 'completed';
      backup.error = undefined;
      await backup.save();
    }
    await setMaintenanceMode(false, '', userId);
    appendLog('info', `Restored from ${backup.filename}, maintenance mode disabled`);
    return { success: true, message: `Database restored from ${backup.filename}. Please log in again.` };
  } catch (err) {
    await logBackup(backup, 'error', `Restore failed: ${err.message}`);
    if (backup._id) {
      backup.status = 'failed';
      backup.error = err.message;
      await backup.save();
    }
    await setMaintenanceMode(false, '', userId);
    appendLog('error', `Restore failed for ${backup.filename}: ${err.message}`);
    throw new Error(`Restore failed: ${err.message}`, { cause: err });
  }
}

export async function deleteBackup(backupId) {
  const backup = await Backup.findById(backupId);
  if (!backup) throw new Error('Backup not found');

  if (backup.status !== 'deleted') {
    const filepath = path.join(config.backupDir, backup.filename);
    try {
      await fs.unlink(filepath);
    } catch {
      // file may already be gone
    }
  }

  await Backup.findByIdAndDelete(backupId);
  appendLog('info', `Deleted ${backup.filename}`);
  return { success: true };
}

export async function getBackupStats() {
  const backups = await Backup.find({ status: 'completed' }).sort({ createdAt: -1 });
  const totalSize = backups.reduce((sum, b) => sum + (b.size || 0), 0);
  const lastBackup = backups[0] || null;

  return {
    totalBackups: backups.length,
    totalSize,
    totalSizeFormatted: formatBytes(totalSize),
    lastBackup: lastBackup
      ? { filename: lastBackup.filename, createdAt: lastBackup.createdAt, size: lastBackup.size }
      : null,
  };
}

export async function enforceRetention() {
  const count = config.backupRetentionCount;
  const backups = await Backup.find({ status: 'completed' }).sort({ createdAt: -1 });

  if (backups.length <= count) return 0;

  const toDelete = backups.slice(count);
  let deleted = 0;

  for (const backup of toDelete) {
    try {
      await deleteBackup(backup._id);
      deleted++;
    } catch {
      // skip failures
    }
  }

  if (deleted > 0) appendLog('info', `Retention: removed ${deleted} old backup(s)`);
  return deleted;
}

export { convertExtendedJSONValue };

export async function uploadBackup(filepath, originalName, userId) {
  await ensureBackupDir();
  try {
    await validateBackupGzip(filepath);
  } catch (err) {
    await fs.unlink(filepath).catch(() => {});
    throw err;
  }

  const stat = await fs.stat(filepath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `upload-${timestamp}-${crypto.randomBytes(4).toString('hex')}.json.gz`;
  const dest = path.join(config.backupDir, filename);

  await fs.rename(filepath, dest);

  const backup = await Backup.create({
    filename,
    originalName,
    size: stat.size,
    type: 'upload',
    status: 'completed',
    createdBy: userId,
    logs: [{ timestamp: new Date(), level: 'info', message: `Uploaded ${originalName} (${formatBytes(stat.size)})` }],
  });

  appendLog('info', `Uploaded ${originalName} as ${filename} (${formatBytes(stat.size)})`);
  return backup;
}

export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
