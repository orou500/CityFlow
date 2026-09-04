import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, createTestProperty, authHeader } from '../../test/helpers.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import CityContract from '../../models/CityContract.js';
import GameState from '../../models/GameState.js';
import Notification from '../../models/Notification.js';

const app = createApp();

async function createFounder(overrides = {}) {
  const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { user, token } = await createAuthenticatedUser({
    balance: 50_000_000,
    level: 20,
    createdAt,
    ...overrides,
  });
  await createTestProperty({ ownerId: user._id, currentPrice: 5_000_000, basePrice: 5_000_000 });
  return { user, token };
}

async function createTestCompany(founder, overrides = {}) {
  const city = await createTestCity();
  const res = await request(app)
    .post('/real-estate-companies')
    .set(authHeader(founder.token))
    .send({ name: `ContCo_${Date.now()}`, description: 'A test company', hqCityId: city._id, ...overrides });
  expect(res.status).toBe(201);
  const company = await RealEstateCompany.findById(res.body._id);
  return { company, res, token: founder.token, city };
}

async function addMemberToCompany(companyId, founderToken, applicantData) {
  const applyRes = await request(app)
    .post(`/real-estate-companies/${companyId}/apply`)
    .set(authHeader(applicantData.token))
    .send({ message: 'I want to join' });
  expect(applyRes.status).toBe(201);

  const refreshedCompany = await RealEstateCompany.findById(companyId);
  const application = refreshedCompany.applications.find(
    (a) => a.userId?.toString() === applicantData.user._id.toString() && a.status === 'pending',
  );
  expect(application).toBeTruthy();

  const approveRes = await request(app)
    .post(`/real-estate-companies/${companyId}/applications/${application._id}/approve`)
    .set(authHeader(founderToken))
    .send({});
  expect(approveRes.status).toBe(200);
}

describe('City Contracts — treasury budget reservation', () => {
  beforeEach(async () => {
    await GameState.findOneAndUpdate({}, { tickNumber: 100, $setOnInsert: { season: 1 } }, { upsert: true, new: true });
  });

  it('success: approving a contract reserves exactly contract.cost from the treasury and activates it', async () => {
    const founder = await createFounder();
    const memberData = await createFounder({ username: 'member_contract', email: 'membercontract@test.com' });
    const { company, token, city } = await createTestCompany(founder);
    await addMemberToCompany(company._id, token, memberData);

    const contract = await CityContract.create({
      companyId: company._id,
      cityId: city._id,
      contractType: 'renovation',
      name: 'Street Renovation',
      cost: 500_000,
      reward: 750_000,
      durationTicks: 10,
      requiredLevel: 1,
      requiredTreasury: 0,
      status: 'available',
    });

    company.treasury.balance = 10_000_000;
    await company.save();

    const proposeRes = await request(app)
      .post(`/city-contracts/${company._id}/contracts/${contract._id}/propose`)
      .set(authHeader(token))
      .send({});
    expect(proposeRes.status).toBe(200);

    const voteRes = await request(app)
      .post(`/city-contracts/${company._id}/contracts/${contract._id}/vote`)
      .set(authHeader(memberData.token))
      .send({ vote: 'yes' });
    expect(voteRes.status).toBe(200);

    const companyAfter = await RealEstateCompany.findById(company._id);
    expect(companyAfter.treasury.balance).toBe(9_500_000);

    const contractAfter = await CityContract.findById(contract._id);
    expect(contractAfter.status).toBe('active');
    expect(contractAfter.startTick).toBe(100);
    expect(contractAfter.endTick).toBe(110);
    expect(contractAfter.progress).toBe(0);
    expect(contractAfter.budgetSpent).toBe(0);
    expect(contractAfter.acceptedBy.toString()).toBe(memberData.user._id.toString());

    const tx = companyAfter.treasury.transactions.find((t) => t.type === 'contract_reward');
    expect(tx).toBeTruthy();
    expect(tx.amount).toBe(500_000);
  });

  it('contract proposal notifications carry deep-link metadata (tab, subTab, contractId)', async () => {
    const founder = await createFounder();
    const memberData = await createFounder({ username: 'member_dl', email: 'memberdl@test.com' });
    const { company, token, city } = await createTestCompany(founder);
    await addMemberToCompany(company._id, token, memberData);

    const contract = await CityContract.create({
      companyId: company._id,
      cityId: city._id,
      contractType: 'renovation',
      name: 'Deep Link Contract',
      cost: 500_000,
      reward: 750_000,
      durationTicks: 10,
      requiredLevel: 1,
      requiredTreasury: 0,
      status: 'available',
    });

    company.treasury.balance = 10_000_000;
    await company.save();

    const proposeRes = await request(app)
      .post(`/city-contracts/${company._id}/contracts/${contract._id}/propose`)
      .set(authHeader(token))
      .send({});
    expect(proposeRes.status).toBe(200);

    const voteRequest = await Notification.findOne({
      userId: memberData.user._id,
      eventKey: `company:${company._id}:contract:${contract._id}:vote_request:${memberData.user._id}`,
    });
    expect(voteRequest).toBeTruthy();
    expect(voteRequest.route).toBe(`/real-estate-companies/${company._id}`);
    expect(voteRequest.tab).toBe('contracts');
    expect(voteRequest.subTab).toBe('proposed');
    expect(voteRequest.contractId.toString()).toBe(contract._id.toString());
    expect(voteRequest.entityId.toString()).toBe(company._id.toString());

    const submitted = await Notification.findOne({
      userId: founder.user._id,
      eventKey: `company:${company._id}:contract:${contract._id}:submitted`,
    });
    expect(submitted).toBeTruthy();
    expect(submitted.subTab).toBe('proposed');
    expect(submitted.contractId.toString()).toBe(contract._id.toString());
  });
});
