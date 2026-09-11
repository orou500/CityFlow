import { describe, it, expect, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { setTestTick, createTestUser, createTestCity } from '../../test/helpers.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import CityContract from '../../models/CityContract.js';
import Property from '../../models/Property.js';
import CompanyAuditLog from '../../models/CompanyAuditLog.js';
import Notification from '../../models/Notification.js';
import { processCityContracts } from '../cityContracts.js';
import { getContractDeliverable, generateContractForCity } from '../../config/cityContracts.js';

function makeUnits(n) {
  return Array.from({ length: n }, (_, i) => ({
    unitNumber: i + 1,
    type: 'apartment',
    rentPrice: 1500,
    occupied: false,
  }));
}

async function createCompany(user) {
  return RealEstateCompany.create({
    name: `DelivCo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    description: 'Deliverable test company',
    founderId: user._id,
    members: [{ userId: user._id, role: 'ceo' }],
    level: 15,
    active: true,
    treasury: { balance: 10_000_000, transactions: [] },
  });
}

async function createActiveContract(company, city, overrides = {}) {
  const data = {
    companyId: company._id,
    cityId: city._id,
    contractType: 'affordable_housing',
    contractTier: 1,
    name: 'Test Affordable Housing',
    description: 'Build affordable housing for city residents.',
    cost: 2_000_000,
    reward: 3_000_000,
    reputationReward: 35,
    xpReward: 500,
    durationTicks: 37,
    startTick: 100,
    endTick: 137,
    status: 'active',
    progress: 0,
    budgetSpent: 0,
    totalBudget: 2_000_000,
    expectedProfit: 1_000_000,
    completionRule: 'deliverable',
    deliverable: getContractDeliverable('affordable_housing'),
  };
  return CityContract.create({ ...data, ...overrides });
}

async function createCompanyOwnedBuilding(city, company, buildingType, unitCount) {
  return Property.create({
    cityId: city._id,
    companyId: company._id,
    name: `${buildingType} - Test`,
    type: 'apartment',
    basePrice: 12_000_000,
    currentPrice: 12_000_000,
    buildingType,
    units: makeUnits(unitCount),
    developmentLevel: 2,
  });
}

describe('City contracts — deliverable-gated completion', () => {
  beforeEach(async () => {
    await Notification.deleteMany({});
    await CompanyAuditLog.deleteMany({});
    await CityContract.deleteMany({});
    await Property.deleteMany({});
    await RealEstateCompany.deleteMany({});
  });

  it('config: affordable_housing requires a company-owned 200-unit Housing Complex in the target city', () => {
    const spec = getContractDeliverable('affordable_housing');
    expect(spec).toBeTruthy();
    expect(spec.buildingTypes).toContain('housing_complex');
    expect(spec.minUnits).toBe(200);
    expect(spec.label).toContain('Housing Complex');
    expect(getContractDeliverable('renovation')).toBeNull();
    expect(getContractDeliverable('airport')).toBeNull();
  });

  it('generation wires completionRule/deliverable consistently with the deliverable map', () => {
    const company = { _id: new mongoose.Types.ObjectId(), level: 10 };
    const city = {
      _id: new mongoose.Types.ObjectId(),
      name: 'Hamburg',
      population: 2_000_000,
      economicCondition: 'stable',
      demandIndex: 1.0,
      supplyIndex: 1.0,
      growthRate: 0.01,
    };

    let sawDeliverable = false;
    let sawTimed = false;
    for (let i = 0; i < 80; i++) {
      const contract = generateContractForCity(company, city, 300);
      const spec = getContractDeliverable(contract.contractType);
      if (spec) {
        sawDeliverable = true;
        expect(contract.completionRule).toBe('deliverable');
        expect(contract.deliverable.buildingTypes).toEqual(spec.buildingTypes);
        expect(contract.deliverable.minUnits).toBe(spec.minUnits);
        expect(contract.deliverable.fulfilled).toBe(false);
      } else {
        sawTimed = true;
        expect(contract.completionRule).toBe('timed');
        expect(contract.deliverable).toBeUndefined();
      }
    }
    expect(sawDeliverable).toBe(true);
    expect(sawTimed).toBe(true);
  });

  it('completes the tick the company owns the required building, even before the deadline', async () => {
    await setTestTick(150);
    const user = await createTestUser();
    const company = await createCompany(user);
    const city = await createTestCity();
    await createCompanyOwnedBuilding(city, company, 'housing_complex', 200);
    const contract = await createActiveContract(company, city);

    const results = await processCityContracts(150);

    expect(results).toEqual([{ companyId: company._id, contractId: contract._id, status: 'completed' }]);

    const after = await CityContract.findById(contract._id);
    expect(after.status).toBe('completed');
    expect(after.completedAt).toBeTruthy();
    expect(after.deliverable.fulfilled).toBe(true);

    const comp = await RealEstateCompany.findById(company._id);
    expect(comp.treasury.balance).toBe(13_000_000);
    expect(comp.stats.contractsCompleted).toBe(1);

    const audit = await CompanyAuditLog.findOne({ companyId: company._id, action: 'contract_completed' });
    expect(audit).toBeTruthy();
  });

  it('keeps the contract active with time progress when the deliverable is missing but the deadline has not passed', async () => {
    await setTestTick(120);
    const user = await createTestUser();
    const company = await createCompany(user);
    const city = await createTestCity();
    const contract = await createActiveContract(company, city);

    const results = await processCityContracts(120);

    expect(results).toEqual([]);
    const after = await CityContract.findById(contract._id);
    expect(after.status).toBe('active');
    expect(after.deliverable.fulfilled).toBe(false);
    expect(after.progress).toBe(54);
  });

  it('fails the contract when the deadline passes without the deliverable', async () => {
    await setTestTick(137);
    const user = await createTestUser();
    const company = await createCompany(user);
    const city = await createTestCity();
    const contract = await createActiveContract(company, city);

    const results = await processCityContracts(137);

    expect(results).toEqual([]);
    const after = await CityContract.findById(contract._id);
    expect(after.status).toBe('failed');
    expect(after.failedReason).toBe('Deliverable not delivered by the deadline');

    const comp = await RealEstateCompany.findById(company._id);
    expect(comp.treasury.balance).toBe(10_000_000);
    expect(comp.stats.contractsCompleted || 0).toBe(0);

    const audit = await CompanyAuditLog.findOne({ companyId: company._id, action: 'contract_failed' });
    expect(audit).toBeTruthy();

    const notif = await Notification.findOne({
      userId: user._id,
      eventKey: `company:${company._id}:contract:${contract._id}:failed:${user._id}`,
    });
    expect(notif).toBeTruthy();
    expect(notif.subTab).toBe('history');
  });

  it('completes instead of failing when the deliverable arrives by the deadline tick', async () => {
    await setTestTick(137);
    const user = await createTestUser();
    const company = await createCompany(user);
    const city = await createTestCity();
    await createCompanyOwnedBuilding(city, company, 'housing_complex', 200);
    const contract = await createActiveContract(company, city);

    const results = await processCityContracts(137);

    expect(results).toEqual([{ companyId: company._id, contractId: contract._id, status: 'completed' }]);
  });

  it('does not count a building owned by another company in the same city', async () => {
    await setTestTick(137);
    const user = await createTestUser();
    const company = await createCompany(user);
    const otherCompany = await createCompany(await createTestUser());
    const city = await createTestCity();
    await createCompanyOwnedBuilding(city, otherCompany, 'housing_complex', 200);
    const contract = await createActiveContract(company, city);

    await processCityContracts(137);

    const after = await CityContract.findById(contract._id);
    expect(after.status).toBe('failed');
  });

  it('timed (legacy/in-flight) contracts still complete exactly at endTick', async () => {
    await setTestTick(137);
    const user = await createTestUser();
    const company = await createCompany(user);
    const city = await createTestCity();
    const contract = await createActiveContract(company, city, {
      completionRule: 'timed',
      deliverable: null,
    });

    const results = await processCityContracts(137);

    expect(results).toEqual([{ companyId: company._id, contractId: contract._id, status: 'completed' }]);
    const comp = await RealEstateCompany.findById(company._id);
    expect(comp.treasury.balance).toBe(13_000_000);
  });

  it('timed contracts do not complete early just because a building exists', async () => {
    await setTestTick(130);
    const user = await createTestUser();
    const company = await createCompany(user);
    const city = await createTestCity();
    await createCompanyOwnedBuilding(city, company, 'housing_complex', 200);
    const contract = await createActiveContract(company, city, {
      completionRule: 'timed',
      deliverable: null,
    });

    const results = await processCityContracts(130);

    expect(results).toEqual([]);
    const after = await CityContract.findById(contract._id);
    expect(after.status).toBe('active');
  });

  it('is idempotent: a completed contract is never rewarded twice', async () => {
    await setTestTick(150);
    const user = await createTestUser();
    const company = await createCompany(user);
    const city = await createTestCity();
    await createCompanyOwnedBuilding(city, company, 'housing_complex', 200);
    const contract = await createActiveContract(company, city);

    const first = await processCityContracts(150);
    expect(first.filter((r) => r.contractId.toString() === contract._id.toString()).length).toBe(1);
    const treasuryAfterFirst = (await RealEstateCompany.findById(company._id)).treasury.balance;

    const second = await processCityContracts(150);
    expect(second).toEqual([]);
    expect((await RealEstateCompany.findById(company._id)).treasury.balance).toBe(treasuryAfterFirst);
    const comp = await RealEstateCompany.findById(company._id);
    expect(comp.stats.contractsCompleted).toBe(1);
  });
});
