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

function pushLog(backup, level, message) {
  return Backup.updateOne({ _id: backup._id }, { $push: { logs: { timestamp: new Date(), level, message } } });
}

const OID_RE = /^[0-9a-f]{24}$/i;

function convertToObjectId(value) {
  if (value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value === 'string' && OID_RE.test(value)) {
    try {
      return new mongoose.Types.ObjectId(value);
    } catch {
      return value;
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value) && value.$oid) {
    try {
      return new mongoose.Types.ObjectId(value.$oid);
    } catch {
      return value;
    }
  }
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && !Array.isArray(value) && value.$date) {
    try {
      return new Date(value.$date);
    } catch {
      return value;
    }
  }
  if (Array.isArray(value)) return value.map(convertToObjectId);
  if (value && typeof value === 'object' && value.constructor === Object) {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = convertToObjectId(v);
    }
    return out;
  }
  return value;
}

function docToObjectId(doc) {
  return convertToObjectId(doc);
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
    await pushLog(backup, 'info', `Found ${collections.length} collections: ${collections.map((c) => c.name).join(', ')}`);

    const writeStream = createWriteStream(filepath);
    const gzip = createGzip();
    const pipePromise = pipeline(gzip, writeStream);

    let totalDocs = 0;

    for (const colInfo of collections) {
      const collName = colInfo.name;
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
    await pushLog(backup, 'info', `Backup completed: ${formatBytes(stat.size)}, ${totalDocs} documents in ${collections.length} collections, ${duration}s`);

    appendLog('info', `Created ${filename} (${formatBytes(stat.size)}) - ${totalDocs} docs in ${collections.length} collections, ${duration}s`);
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
  const backup = await Backup.findById(backupId);
  if (!backup) throw new Error('Backup not found');
  if (backup.status !== 'completed') throw new Error('Backup is not in completed status');

  const filepath = path.join(config.backupDir, backup.filename);
  try {
    await fs.access(filepath);
  } catch {
    throw new Error('Backup file not found on disk');
  }

  await pushLog(backup, 'info', 'Restore started, enabling maintenance mode');
  await setMaintenanceMode(true, 'Database restoration in progress.', userId);
  appendLog('info', `Restore started for ${backup.filename}, maintenance mode enabled`);

  backup.status = 'restoring';
  await backup.save();

  try {
    const db = mongoose.connection.db;
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
    for (const line of pendingLines) {
      let collName, documents;
      try {
        const data = typeof line === 'string' ? EJSON.parse(line, { relaxed: true }) : line;
        collName = data.collection;
        documents = Array.isArray(data.documents) ? data.documents : [];
        documents = documents.map(docToObjectId);
      } catch (parseErr) {
        throw new Error(`Failed to parse backup collection: ${parseErr.message}`);
      }
      if (documents.length > 0) {
        try {
          await db.dropCollection(collName);
        } catch {
          // collection may not exist
        }
        await db.collection(collName).insertMany(documents, { ordered: false });
        collectionsRestored++;
      }
    }

    await pushLog(backup, 'info', `Restore completed: ${collectionsRestored} collections restored`);
    await setMaintenanceMode(false, '', userId);
    appendLog('info', `Restored from ${backup.filename}, maintenance mode disabled`);
    return { success: true, message: `Database restored from ${backup.filename}. Please log in again.` };
  } catch (err) {
    await pushLog(backup, 'error', `Restore failed: ${err.message}`);
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

export async function uploadBackup(filepath, originalName, userId) {
  await ensureBackupDir();

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
