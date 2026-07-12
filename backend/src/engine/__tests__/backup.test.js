import { describe, it, expect } from 'vitest';
import { EJSON } from 'bson';
import { gzipSync } from 'zlib';
import { tmpdir } from 'os';
import path from 'path';
import fs from 'fs/promises';
import { convertExtendedJSONValue, validateBackupGzip, findBackupByIdentifier, shouldSkipRestoreCollection } from '../backup.js';

describe('Backup Tests', () => {
  it('converts extended JSON date wrappers to Date instances', () => {
    const mockData = {
      onboarding: {
        completedAt: { $date: '2026-07-12T07:59:58.068Z' },
      },
      createdAt: { $date: '2026-07-12T07:59:36.052Z' },
    };

    const normalized = convertExtendedJSONValue(mockData);

    expect(normalized.onboarding.completedAt).toBeInstanceOf(Date);
    expect(normalized.createdAt).toBeInstanceOf(Date);
    expect(normalized.onboarding.completedAt.toISOString()).toBe('2026-07-12T07:59:58.068Z');
    expect(normalized.createdAt.toISOString()).toBe('2026-07-12T07:59:36.052Z');
  });

  it('converts extended JSON date wrappers with $numberLong payloads', () => {
    const timestamp = Date.parse('2026-07-12T07:59:36.052Z');
    const mockData = {
      createdAt: { $date: { $numberLong: String(timestamp) } },
    };

    const normalized = convertExtendedJSONValue(mockData);

    expect(normalized.createdAt).toBeInstanceOf(Date);
    expect(normalized.createdAt.getTime()).toBe(timestamp);
  });

  it('validates gzip backup files before upload', async () => {
    const tempFile = path.join(tmpdir(), `backup-test-${Date.now()}.json.gz`);
    const backupRecord = {
      collection: 'users',
      documents: [
        {
          onboarding: { completedAt: { $date: '2026-07-12T07:59:58.068Z' } },
          createdAt: { $date: '2026-07-12T07:59:36.052Z' },
        },
      ],
    };
    const payload = EJSON.stringify(backupRecord) + '\n';
    await fs.writeFile(tempFile, gzipSync(Buffer.from(payload, 'utf8')));

    await expect(validateBackupGzip(tempFile)).resolves.toBeUndefined();

    await fs.unlink(tempFile);
  });

  it('converts raw buffer-like object ids to ObjectId instances', () => {
    const rawObjectId = {
      '0': 106,
      '1': 83,
      '2': 97,
      '3': 101,
      '4': 17,
      '5': 21,
      '6': 160,
      '7': 37,
      '8': 38,
      '9': 207,
      '10': 235,
      '11': 83,
    };
    const normalized = convertExtendedJSONValue({ _id: rawObjectId });

    expect(normalized._id).toBeDefined();
    expect(normalized._id.toString()).toMatch(/^[0-9a-fA-F]{24}$/);
  });

  it('converts nested $oid object wrappers to ObjectId instances', () => {
    const nestedOid = { _id: { $oid: { '0': '106', '1': '83', '2': '97', '3': '101', '4': '17', '5': '21', '6': '160', '7': '37', '8': '38', '9': '207', '10': '235', '11': '83' } } };
    const normalized = convertExtendedJSONValue(nestedOid);

    expect(normalized._id).toBeDefined();
    expect(normalized._id.toString()).toMatch(/^[0-9a-fA-F]{24}$/);
  });

  it('skips backups collection during restore but restores users', () => {
    expect(shouldSkipRestoreCollection('backups')).toBe(true);
    expect(shouldSkipRestoreCollection('users')).toBe(false);
    expect(shouldSkipRestoreCollection('properties')).toBe(false);
    expect(shouldSkipRestoreCollection('transactions')).toBe(false);
    expect(shouldSkipRestoreCollection('loans')).toBe(false);
  });

  it('converts nested ObjectId-like objects in nested fields', () => {
    const propertyDoc = {
      _id: { $oid: '507f1f77bcf86cd799439011' },
      cityId: { '0': 106, '1': 83, '2': 97, '3': 101, '4': 17, '5': 21, '6': 160, '7': 37, '8': 38, '9': 207, '10': 235, '11': 83 },
      ownerId: { $oid: '507f1f77bcf86cd799439012' },
      parentBuilding: { '0': 106, '1': 83, '2': 97, '3': 101, '4': 17, '5': 21, '6': 160, '7': 37, '8': 38, '9': 207, '10': 235, '11': 84 },
    };
    const normalized = convertExtendedJSONValue(propertyDoc);

    expect(normalized._id).toBeInstanceOf(Object);
    expect(normalized._id.toString()).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(normalized.cityId).toBeInstanceOf(Object);
    expect(normalized.cityId.toString()).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(normalized.ownerId).toBeInstanceOf(Object);
    expect(normalized.ownerId.toString()).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(normalized.parentBuilding).toBeInstanceOf(Object);
    expect(normalized.parentBuilding.toString()).toMatch(/^[0-9a-fA-F]{24}$/);
  });

  it('finds a backup by direct file path when metadata is missing', async () => {
    const tempFile = path.join(tmpdir(), `backup-fileonly-${Date.now()}.json.gz`);
    await fs.writeFile(tempFile, gzipSync(Buffer.from(EJSON.stringify({ collection: 'users', documents: [] }) + '\n', 'utf8')));

    const result = await findBackupByIdentifier(tempFile);

    expect(result).toBeDefined();
    expect(result.filename).toBe(path.basename(tempFile));
    expect(result.filepath).toBe(tempFile);
    expect(result.status).toBe('completed');
    expect(result.__fileOnly).toBe(true);

    await fs.unlink(tempFile);
  });

  it('converts deeply nested ObjectId-like structures in property documents', () => {
    const complexProperty = {
      _id: { $oid: '507f1f77bcf86cd799439011' },
      cityId: { '0': 106, '1': 83, '2': 97, '3': 101, '4': 17, '5': 21, '6': 160, '7': 37, '8': 38, '9': 207, '10': 235, '11': 83 },
      ownerId: { $oid: '507f1f77bcf86cd799439012' },
      parentBuilding: { $oid: '507f1f77bcf86cd799439013' },
      priceHistory: [
        { tick: 1, price: 100 },
        { tick: 2, price: 110 },
      ],
      upgrades: [
        {
          name: 'upgrade1',
          appliedAt: 100,
          effect: { bonus: 10 },
        },
      ],
    };

    const normalized = convertExtendedJSONValue(complexProperty);

    expect(normalized._id?.toString?.()).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(normalized.cityId?.toString?.()).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(normalized.ownerId?.toString?.()).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(normalized.parentBuilding?.toString?.()).toMatch(/^[0-9a-fA-F]{24}$/);
    expect(normalized.priceHistory).toEqual([
      { tick: 1, price: 100 },
      { tick: 2, price: 110 },
    ]);
    expect(normalized.upgrades[0]).toEqual({
      name: 'upgrade1',
      appliedAt: 100,
      effect: { bonus: 10 },
    });
  });
});

