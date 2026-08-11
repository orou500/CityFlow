import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { readdir } from 'fs/promises';
import mongoose from 'mongoose';
import { EJSON } from 'bson';
import { createGunzip, gzipSync } from 'zlib';
import { createReadStream } from 'fs';
import { tmpdir } from 'os';
import { config } from '../../config/index.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import City from '../../models/City.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import Company from '../../models/Company.js';
import StockHolding from '../../models/StockHolding.js';
import Auction from '../../models/Auction.js';
import AuctionReservation from '../../models/AuctionReservation.js';
import Notification from '../../models/Notification.js';
import MissionProgress from '../../models/MissionProgress.js';
import Transaction from '../../models/Transaction.js';
import GameState from '../../models/GameState.js';
import Season from '../../models/Season.js';
import Backup from '../../models/Backup.js';
import {
  createBackup,
  restoreBackup,
  BACKUP_VERSION,
  EXCLUDED_BACKUP_COLLECTIONS,
  inspectBackupHeader,
} from '../backup.js';

// Register every model in src/models so the coverage test can enumerate them
const MODEL_DIR = path.resolve(__dirname, '../../models');

async function registerAllModels() {
  const files = (await readdir(MODEL_DIR)).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    try {
      await import(`../../models/${file}`);
    } catch {
      // ignore — some model files may have side-effect imports
    }
  }
}

function readBackupLines(filepath) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    createReadStream(filepath)
      .pipe(createGunzip())
      .on('data', (c) => chunks.push(c))
      .on('end', () => resolve(Buffer.concat(chunks).toString('utf8').trim().split('\n')))
      .on('error', reject);
  });
}

async function wipeAllCollections() {
  const collections = await mongoose.connection.db.listCollections().toArray();
  for (const c of collections) {
    // deleteMany keeps collections + indexes intact (dropCollection would
    // race with mongoose autoCreate/index builds on the shared test DB)
    await mongoose.connection.db.collection(c.name).deleteMany({});
  }
}

async function collectionNames() {
  return (await mongoose.connection.db.listCollections().toArray()).map((c) => c.name);
}

async function countDocs() {
  const counts = {};
  const names = await collectionNames();
  for (const name of names) {
    counts[name] = await mongoose.connection.db.collection(name).countDocuments();
  }
  return counts;
}

describe('Backup — full audit & restore', () => {
  const createdBackupFiles = [];

  beforeAll(async () => {
    await registerAllModels();
    // Point backups at a temp dir so the test never touches real backups
    config.backupDir = path.join(tmpdir(), `cf-backup-test-${Date.now()}`);
    await fs.mkdir(config.backupDir, { recursive: true });
    // Ensure every registered model has a (possibly empty) collection so the
    // coverage test is valid regardless of worker/DB state
    for (const name of mongoose.modelNames()) {
      const collName = mongoose.model(name).collection.collectionName;
      if (!EXCLUDED_BACKUP_COLLECTIONS[collName]) {
        await mongoose.connection.db.createCollection(collName).catch(() => {});
      }
    }
  });

  afterAll(async () => {
    // Clean up backup files and the temp dir created by this test
    for (const f of createdBackupFiles) {
      await fs.unlink(f).catch(() => {});
    }
    await fs.rm(config.backupDir, { recursive: true, force: true }).catch(() => {});
    await Backup.deleteMany({});
    await wipeAllCollections();
  });

  it('every registered Mongoose model collection is covered by the backup (or explicitly excluded)', async () => {
    global.currentTick = 42;
    await User.create({ username: 'cov_user', email: 'cov@test.com', password: 'x' });

    const backup = await createBackup(null, 'manual');
    createdBackupFiles.push(path.join(config.backupDir, backup.filename));
    const lines = await readBackupLines(path.join(config.backupDir, backup.filename));

    // parse per-collection lines
    const backedUp = new Set();
    for (const line of lines) {
      const data = EJSON.parse(line, { relaxed: true });
      if (data && data.header === true) continue;
      backedUp.add(data.collection);
    }

    const modelNames = mongoose.modelNames();
    for (const name of modelNames) {
      const model = mongoose.model(name);
      const collName = model.collection.collectionName;
      if (EXCLUDED_BACKUP_COLLECTIONS[collName]) continue; // documented exclusion
      expect(backedUp.has(collName), `model ${name} -> collection ${collName} not backed up`).toBe(true);
    }
  });

  it('backup file has a v2 header with version and collection metadata', async () => {
    await User.create({ username: 'hdr_user', email: 'hdr@test.com', password: 'x' });
    const backup = await createBackup(null, 'manual');
    createdBackupFiles.push(path.join(config.backupDir, backup.filename));

    expect(backup.backupVersion).toBe(BACKUP_VERSION);
    const header = await inspectBackupHeader(path.join(config.backupDir, backup.filename));
    expect(header.backupVersion).toBe(BACKUP_VERSION);
    expect(header.createdAt).toBeTruthy();
    expect(header.collections).toContain('users');
    expect(header.collections).not.toContain('backups');
  });

  it('rejects backups with a newer format version', async () => {
    const filepath = path.join(tmpdir(), `future-${Date.now()}.json.gz`);
    const payload =
      EJSON.stringify({
        header: true,
        backupVersion: BACKUP_VERSION + 1,
        createdAt: new Date().toISOString(),
        collections: ['users'],
      }) + '\n';
    await fs.writeFile(filepath, gzipSync(Buffer.from(payload, 'utf8')));
    createdBackupFiles.push(filepath);

    await expect(inspectBackupHeader(filepath)).rejects.toThrow(/newer/i);
  });

  it('full backup → wipe → restore reconstructs the exact game state', async () => {
    global.currentTick = 123;

    // ── 1. Populate a representative database ───────────────────────────
    const city = await City.create({
      name: 'Backup City',
      country: 'Testland',
      coordinates: { lat: 0, lng: 0 },
      population: 500000,
      propertyCount: 100,
    });

    const admin = await User.create({
      username: 'backup_admin',
      email: 'admin@backup.test',
      password: 'password123',
      role: 'admin',
      balance: 1000000,
    });
    const player = await User.create({
      username: 'backup_player',
      email: 'player@backup.test',
      password: 'password123',
      balance: 100000,
      reservedAuctionFunds: 40000,
      level: 7,
      achievements: ['first_property'],
      completedOnboarding: ['properties', 'management'],
    });

    const property = await Property.create({
      cityId: city._id,
      ownerId: player._id,
      name: 'Backup House',
      type: 'house',
      basePrice: 50000,
      currentPrice: 60000,
      rent: 4300,
      forSale: false,
    });

    const reCompany = await RealEstateCompany.create({
      name: 'Backup RE Co',
      founderId: player._id,
      members: [
        { userId: player._id, role: 'ceo', shares: 510 },
        { userId: admin._id, role: 'director', shares: 300 },
      ],
      shares: { totalShares: 1000, treasuryShares: 190, parValue: 100 },
      treasury: { balance: 25000, transactions: [{ type: 'deposit', amount: 25000, description: 'seed', tick: 1 }] },
      prestige: 2,
      hqCityId: city._id,
      level: 5,
      xp: 100,
      reputation: 40,
      employees: { count: 3, maxEmployees: 10, monthlySalaryPerEmployee: 5000, totalPayroll: 15000, departments: [] },
      ipo: {
        listed: true,
        sharePrice: 10,
        sharesOutstanding: 10000,
        dividendsPaid: 100,
        lastDividendPerShare: 1,
        lastDividendTick: 100,
        listFee: 100000,
        ipoValue: 100000,
        listedAt: new Date(),
      },
      active: true,
      foundedTick: 10,
    });

    const ipoCompany = await Company.create({
      name: 'Backup IPO Co',
      ticker: 'BIPO',
      industry: 'finance',
      hqCityId: city._id,
      isIPO: true,
      active: true,
      sharePrice: 50,
      sharesOutstanding: 100000,
      realEstateCompanyId: reCompany._id,
      dividendPerShare: 2,
      lastDividendTick: 100,
      marketCap: 5000000,
    });

    await StockHolding.create({
      userId: player._id,
      companyId: ipoCompany._id,
      shares: 5000,
      avgBuyPrice: 40,
      locked: true,
      unclaimedDividends: 200,
    });

    const auction = await Auction.create({
      propertyId: property._id,
      sellerId: null,
      sellerType: 'bank',
      auctionType: 'standard',
      startingBid: 1000,
      currentBid: 40000,
      currentBidderId: player._id,
      bidIncrement: 100,
      status: 'active',
      startTick: 100,
      endTick: 200,
      originalEndTick: 200,
      totalBids: 1,
      bids: [{ bidderId: player._id, amount: 40000, tick: 123, username: player.username }],
      activity: [{ type: 'bid', userId: player._id, username: player.username, amount: 40000, tick: 123 }],
      watchers: [player._id],
      watcherCount: 1,
    });

    await AuctionReservation.create({ userId: player._id, auctionId: auction._id, amount: 40000 });
    await Notification.create({
      userId: player._id,
      type: 'system',
      title: 'Test Notif',
      message: 'backup test',
      route: '/career',
    });
    await MissionProgress.create({
      userId: player._id,
      missionId: 'first_property',
      status: 'completed',
      progress: 1,
      target: 1,
      completedAt: new Date(),
    });
    await Transaction.create({
      buyerId: player._id,
      sellerId: admin._id,
      propertyId: property._id,
      price: 40000,
      type: 'buy',
    });
    await Season.create({ number: 1, status: 'active', startDate: new Date() });
    await GameState.findOneAndUpdate(
      { key: 'global' },
      { $set: { tickNumber: 123, seasonId: null, maintenanceMode: false } },
      { upsert: true, new: true },
    );

    // ── 2. Run Admin Backup ─────────────────────────────────────────────
    const backup = await createBackup(admin._id, 'manual');
    createdBackupFiles.push(path.join(config.backupDir, backup.filename));
    expect(backup.status).toBe('completed');
    expect(backup.backupVersion).toBe(BACKUP_VERSION);

    // ── 3. Snapshot state ───────────────────────────────────────────────
    const before = await countDocs();
    expect(before['auctionreservations']).toBe(1);
    expect(before['gamestates']).toBe(1);

    const adminBefore = await User.findById(admin._id).lean();

    // ── 4. Wipe the database (metadata included) ────────────────────────
    await wipeAllCollections();

    // ── 5. Restore the backup (by filename — metadata was wiped too) ────
    const result = await restoreBackup(backup.filename, admin._id);
    expect(result.success).toBe(true);
    expect(result.backupVersion).toBe(BACKUP_VERSION);
    expect(result.preRestoreBackup).toBeTruthy();

    // ── 6. Compare restored state with the original ─────────────────────
    const after = await countDocs();
    for (const [coll, count] of Object.entries(before)) {
      if (coll === 'backups') continue; // documented excluded collection
      expect(after[coll], `collection ${coll} count after restore`).toBe(count);
    }

    // Users: balances, reserved funds, progression survive exactly
    const restoredAdmin = await User.findById(admin._id).lean();
    const restoredPlayer = await User.findById(player._id).lean();
    expect(restoredAdmin.username).toBe('backup_admin');
    expect(restoredAdmin.balance).toBe(adminBefore.balance);
    expect(restoredPlayer.balance).toBe(100000);
    expect(restoredPlayer.reservedAuctionFunds).toBe(40000);
    expect(restoredPlayer.achievements).toEqual(['first_property']);
    expect(restoredPlayer.completedOnboarding).toEqual(['properties', 'management']);

    // Auction reservation — the $40K is reserved exactly once
    const restoredReservation = await AuctionReservation.findOne({ userId: player._id }).lean();
    expect(restoredReservation).not.toBeNull();
    expect(restoredReservation.amount).toBe(40000);
    const restoredAuction = await Auction.findById(auction._id).lean();
    expect(restoredAuction.currentBid).toBe(40000);
    expect(restoredAuction.currentBidderId.toString()).toBe(player._id.toString());
    expect(restoredAuction.status).toBe('active');
    expect(restoredAuction.bids.length).toBe(1);
    expect(restoredAuction.watchers.length).toBe(1);

    // Company ownership: members, shares, treasury, IPO state
    const restoredCompany = await RealEstateCompany.findById(reCompany._id).lean();
    expect(restoredCompany.members.length).toBe(2);
    expect(restoredCompany.members.find((m) => m.userId.toString() === player._id.toString()).shares).toBe(510);
    expect(restoredCompany.shares.treasuryShares).toBe(190);
    expect(restoredCompany.prestige).toBe(2);
    expect(restoredCompany.ipo.listed).toBe(true);
    expect(restoredCompany.ipo.dividendsPaid).toBe(100);
    expect(restoredCompany.treasury.transactions.length).toBe(1);

    // Stock holdings + dividends
    const restoredHolding = await StockHolding.findOne({ userId: player._id }).lean();
    expect(restoredHolding.shares).toBe(5000);
    expect(restoredHolding.locked).toBe(true);
    expect(restoredHolding.unclaimedDividends).toBe(200);

    // Engine state
    expect(global.currentTick).toBe(123);
    const restoredState = await GameState.findOne({ key: 'global' }).lean();
    expect(restoredState.tickNumber).toBe(123);
    const restoredSeason = await Season.findOne({ number: 1 }).lean();
    expect(restoredSeason.status).toBe('active');

    // Notification + mission + transaction + property
    expect(await Notification.countDocuments({ userId: player._id })).toBe(1);
    expect(await MissionProgress.countDocuments({ userId: player._id })).toBe(1);
    expect(await Transaction.countDocuments({ buyerId: player._id })).toBe(1);
    const restoredProperty = await Property.findById(property._id).lean();
    expect(restoredProperty.ownerId.toString()).toBe(player._id.toString());
    expect(restoredProperty.rent).toBe(4300);

    // Indexes were recreated (e.g. unique email index on users)
    const userIndexes = await mongoose.connection.db.collection('users').indexes();
    const emailIndex = userIndexes.find((i) => i.name === 'email_1');
    expect(emailIndex).toBeDefined();

    // Sparse options are preserved (unique+sparse on sizopsUserId — dropping
    // sparse would reject unlinked users after a restore).
    const sizopsIndex = userIndexes.find((i) => i.name === 'sizopsUserId_1');
    expect(sizopsIndex).toBeDefined();
    expect(sizopsIndex.unique).toBe(true);
    expect(sizopsIndex.sparse).toBe(true);

    // Maintenance mode was turned back off
    const finalState = await GameState.findOne({ key: 'global' }).lean();
    expect(finalState.maintenanceMode).toBe(false);
  });
});
