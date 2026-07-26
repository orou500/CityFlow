import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import {
  addTreasuryTransaction,
  pruneTreasuryTransactions,
  pruneCompanyTreasuryTransactions,
  TREASURY_TRANSACTION_RETENTION_TICKS,
  MAX_TREASURY_TRANSACTIONS,
} from '../companyProcessing.js';

beforeEach(async () => {
  await RealEstateCompany.deleteMany({});
});

const createTestCompany = async () => {
  return RealEstateCompany.create({
    name: `TestCompany_${Date.now()}_${Math.random()}`,
    founderId: new mongoose.Types.ObjectId(),
    members: [],
    treasury: { balance: 0, transactions: [] },
    active: true,
  });
};

describe('Treasury Transaction Helpers', () => {
  it('addTreasuryTransaction records tick and trims to max', async () => {
    const company = await createTestCompany();
    for (let i = 0; i < MAX_TREASURY_TRANSACTIONS + 5; i++) {
      addTreasuryTransaction(company, { type: 'deposit', amount: i, description: `tx ${i}` }, 100);
    }
    expect(company.treasury.transactions.length).toBe(MAX_TREASURY_TRANSACTIONS);
    expect(company.treasury.transactions[0].tick).toBe(100);
    expect(company.treasury.transactions[0].amount).toBe(5);
  });

  it('pruneTreasuryTransactions removes transactions older than retention ticks', async () => {
    const company = await createTestCompany();
    const currentTick = 50;
    addTreasuryTransaction(
      company,
      { type: 'deposit', amount: 1, description: 'old' },
      currentTick - TREASURY_TRANSACTION_RETENTION_TICKS - 1,
    );
    addTreasuryTransaction(
      company,
      { type: 'deposit', amount: 2, description: 'edge' },
      currentTick - TREASURY_TRANSACTION_RETENTION_TICKS,
    );
    addTreasuryTransaction(company, { type: 'deposit', amount: 3, description: 'new' }, currentTick);

    pruneTreasuryTransactions(company, currentTick);

    expect(company.treasury.transactions.length).toBe(2);
    expect(company.treasury.transactions[0].amount).toBe(2);
    expect(company.treasury.transactions[1].amount).toBe(3);
  });

  it('pruneTreasuryTransactions keeps legacy transactions by createdAt fallback', async () => {
    const company = await createTestCompany();
    company.treasury.transactions.push({
      type: 'deposit',
      amount: 1,
      description: 'legacy old',
      tick: null,
      createdAt: new Date(Date.now() - (TREASURY_TRANSACTION_RETENTION_TICKS + 2) * 6 * 60 * 60 * 1000),
    });
    company.treasury.transactions.push({
      type: 'deposit',
      amount: 2,
      description: 'legacy new',
      tick: null,
      createdAt: new Date(Date.now() - 1 * 6 * 60 * 60 * 1000),
    });

    pruneTreasuryTransactions(company, 100);

    expect(company.treasury.transactions.length).toBe(1);
    expect(company.treasury.transactions[0].amount).toBe(2);
  });

  it('pruneCompanyTreasuryTransactions prunes companies with transactions', async () => {
    const company = await createTestCompany();
    addTreasuryTransaction(company, { type: 'deposit', amount: 1, description: 'old' }, 1);
    addTreasuryTransaction(company, { type: 'deposit', amount: 2, description: 'new' }, 100);
    await company.save();

    const prunedCount = await pruneCompanyTreasuryTransactions(100);
    expect(prunedCount).toBe(1);

    const updated = await RealEstateCompany.findById(company._id);
    expect(updated.treasury.transactions.length).toBe(1);
    expect(updated.treasury.transactions[0].amount).toBe(2);
  });
});
