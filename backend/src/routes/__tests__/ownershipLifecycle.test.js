import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestProperty, createTestCity, authHeader } from '../../test/helpers.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import Company from '../../models/Company.js';
import StockHolding from '../../models/StockHolding.js';
import GameState from '../../models/GameState.js';

const app = createApp();

async function createFounder(overrides = {}) {
  const createdAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { user, token } = await createAuthenticatedUser({
    balance: 200_000_000,
    level: 30,
    createdAt,
    ...overrides,
  });
  const property = await createTestProperty({
    ownerId: user._id,
    currentPrice: 5_000_000,
    basePrice: 5_000_000,
  });
  return { user, token, property };
}

async function createCompany(founder, hqCityId) {
  const res = await request(app)
    .post('/real-estate-companies')
    .set(authHeader(founder.token))
    .send({ name: `OwnershipTest_${Date.now()}`, description: 'Test', hqCityId });
  return res.body;
}

async function addMember(companyId, founderToken) {
  const member = await createAuthenticatedUser({ balance: 10_000_000, level: 15 });
  await request(app)
    .post(`/real-estate-companies/${companyId}/apply`)
    .set(authHeader(member.token))
    .send({ message: 'I want to join' });
  const refreshed = await RealEstateCompany.findById(companyId);
  const appSub = refreshed.applications.find(
    (a) => a.userId?.toString() === member.user._id.toString() && a.status === 'pending',
  );
  await request(app)
    .post(`/real-estate-companies/${companyId}/applications/${appSub._id}/approve`)
    .set(authHeader(founderToken))
    .send({});
  return member;
}

describe('Ownership Lifecycle', () => {
  let hqCityId;

  beforeEach(async () => {
    await GameState.findOneAndUpdate({}, { tickNumber: 100, $setOnInsert: { season: 1 } }, { upsert: true, new: true });
    const city = await createTestCity();
    hqCityId = city._id;
  });

  // â”€â”€â”€ 1. PRIVATE COMPANY CREATION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('creates a company with correct initial share distribution', async () => {
    const founder = await createFounder();
    const company = await createCompany(founder, hqCityId);

    expect(company.shares.totalShares).toBe(1000);
    expect(company.shares.treasuryShares).toBe(300);
    expect(company.members[0].shares).toBe(700);
    expect(company.members[0].role).toBe('ceo');

    const memberSum = company.members.reduce((s, m) => s + m.shares, 0);
    expect(memberSum + company.shares.treasuryShares).toBe(company.shares.totalShares);
  });

  // â”€â”€â”€ 2. MEMBERS JOIN â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('allocates shares from treasury when members join', async () => {
    const founder = await createFounder();
    const company = await createCompany(founder, hqCityId);
    const initialTreasury = company.shares.treasuryShares;

    const member1 = await addMember(company._id, founder.token);
    const afterFirst = await RealEstateCompany.findById(company._id);

    const member1Shares =
      afterFirst.members.find((m) => m.userId.toString() === member1.user._id.toString())?.shares || 0;
    expect(member1Shares).toBeGreaterThan(0);
    expect(member1Shares).toBeLessThanOrEqual(50);
    expect(afterFirst.shares.treasuryShares).toBe(initialTreasury - member1Shares);

    await addMember(company._id, founder.token);
    const afterSecond = await RealEstateCompany.findById(company._id);

    const memberSum = afterSecond.members.reduce((s, m) => s + m.shares, 0);
    expect(memberSum + afterSecond.shares.treasuryShares).toBe(afterSecond.shares.totalShares);
    expect(afterSecond.shares.totalShares).toBe(1000);
  });

  // â”€â”€â”€ 3. MEMBER LEAVES â†’ SHARES RETURN TO TREASURY â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('returns shares to treasury when a member leaves', async () => {
    const founder = await createFounder();
    const company = await createCompany(founder, hqCityId);
    const member = await addMember(company._id, founder.token);

    const beforeLeave = await RealEstateCompany.findById(company._id);
    const memberShares =
      beforeLeave.members.find((m) => m.userId.toString() === member.user._id.toString())?.shares || 0;
    const treasuryBefore = beforeLeave.shares.treasuryShares;

    await request(app).post(`/real-estate-companies/${company._id}/leave`).set(authHeader(member.token)).send({});

    const afterLeave = await RealEstateCompany.findById(company._id);
    expect(afterLeave.shares.treasuryShares).toBe(treasuryBefore + memberShares);
    expect(afterLeave.members.find((m) => m.userId.toString() === member.user._id.toString())).toBeUndefined();

    const memberSum = afterLeave.members.reduce((s, m) => s + m.shares, 0);
    expect(memberSum + afterLeave.shares.treasuryShares).toBe(afterLeave.shares.totalShares);
    expect(afterLeave.shares.totalShares).toBe(1000);
  });

  // â”€â”€â”€ 4. CEO LEAVES / SUCCESSION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('transfers CEO role correctly on CEO leave, shares go to treasury', async () => {
    const founder = await createFounder();
    const company = await createCompany(founder, hqCityId);
    const member1 = await addMember(company._id, founder.token);
    await addMember(company._id, founder.token);

    const before = await RealEstateCompany.findById(company._id);
    const founderShares = before.members.find((m) => m.userId.toString() === founder.user._id.toString())?.shares || 0;
    const treasuryBefore = before.shares.treasuryShares;

    await request(app).post(`/real-estate-companies/${company._id}/leave`).set(authHeader(founder.token)).send({});

    const after = await RealEstateCompany.findById(company._id);
    const newCeo = after.members.find((m) => m.role === 'ceo');
    expect(newCeo).toBeDefined();
    expect(newCeo.userId.toString()).toBe(member1.user._id.toString());
    expect(after.shares.treasuryShares).toBe(treasuryBefore + founderShares);

    const memberSum = after.members.reduce((s, m) => s + m.shares, 0);
    expect(memberSum + after.shares.treasuryShares).toBe(after.shares.totalShares);
    expect(after.shares.totalShares).toBe(1000);
  });

  // â”€â”€â”€ 5. IPO OWNERSHIP DISTRIBUTION â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('distributes IPO shares: CEO 51% locked, members 19%, public 30%', async () => {
    const founder = await createFounder({ balance: 1_000_000_000, level: 30 });
    const company = await createCompany(founder, hqCityId);

    // Add members and properties to meet IPO requirements
    for (let i = 0; i < 4; i++) {
      await addMember(company._id, founder.token);
    }

    const reCompany = await RealEstateCompany.findById(company._id);
    reCompany.level = 15;
    reCompany.treasury.balance = 600_000_000;
    reCompany.stats = { totalRentalIncome: 50_000_000, propertiesOwned: 10 };
    await reCompany.save();

    for (let i = 0; i < 10; i++) {
      await createTestProperty({
        ownerId: founder.user._id,
        companyId: company._id,
        currentPrice: 30_000_000,
        basePrice: 30_000_000,
        cityId: hqCityId,
      });
    }

    const ipoRes = await request(app)
      .post(`/real-estate-companies/${company._id}/ipo`)
      .set(authHeader(founder.token))
      .send({});
    expect(ipoRes.status).toBe(200);

    const stockCompany = await Company.findById(ipoRes.body.stockCompany._id);
    const totalShares = stockCompany.sharesOutstanding;

    // CEO locked 51%
    const ceoHolding = await StockHolding.findOne({ userId: founder.user._id, companyId: stockCompany._id });
    expect(ceoHolding).toBeDefined();
    expect(ceoHolding.locked).toBe(true);
    const ceoPct = (ceoHolding.shares / totalShares) * 100;
    expect(ceoPct).toBeGreaterThanOrEqual(50.9);
    expect(ceoPct).toBeLessThanOrEqual(52);

    // Members get 19%
    const memberHoldings = await StockHolding.find({
      companyId: stockCompany._id,
      userId: { $ne: founder.user._id },
    });
    const memberShares = memberHoldings.reduce((s, h) => s + h.shares, 0);
    const memberPct = (memberShares / totalShares) * 100;
    expect(memberPct).toBeGreaterThanOrEqual(18);
    expect(memberPct).toBeLessThanOrEqual(20);

    // Member holdings not locked
    for (const h of memberHoldings) {
      expect(h.locked).toBe(false);
    }

    // Float percentage = public shares / total
    const publicShares = totalShares - ceoHolding.shares - memberShares;
    const expectedFloat = Math.round((publicShares / totalShares) * 100);
    expect(stockCompany.floatPercentage).toBe(expectedFloat);

    // totalSharesHeld = CEO + members
    expect(stockCompany.totalSharesHeld).toBe(ceoHolding.shares + memberShares);

    // Verify total: CEO + members + public = total
    expect(ceoHolding.shares + memberShares + publicShares).toBe(totalShares);
  });

  it('prevents company members from buying their own IPO shares', async () => {
    const founder = await createFounder({ balance: 1_000_000_000, level: 30 });
    const company = await createCompany(founder, hqCityId);

    let member = null;
    for (let i = 0; i < 4; i++) {
      member = await addMember(company._id, founder.token);
    }

    const reCompany = await RealEstateCompany.findById(company._id);
    reCompany.level = 15;
    reCompany.treasury.balance = 600_000_000;
    reCompany.stats = { totalRentalIncome: 50_000_000, propertiesOwned: 10 };
    await reCompany.save();

    for (let i = 0; i < 10; i++) {
      await createTestProperty({
        ownerId: founder.user._id,
        companyId: company._id,
        currentPrice: 30_000_000,
        basePrice: 30_000_000,
        cityId: hqCityId,
      });
    }

    const ipoRes = await request(app)
      .post(`/real-estate-companies/${company._id}/ipo`)
      .set(authHeader(founder.token))
      .send({});
    expect(ipoRes.status).toBe(200);

    const stockCompany = await Company.findById(ipoRes.body.stockCompany._id);

    // The member tries to buy shares in their own company â€” should be rejected
    const buyRes = await request(app)
      .post('/stocks/buy')
      .set(authHeader(member.token))
      .send({ companyId: stockCompany._id, shares: 1 });
    expect(buyRes.status).toBe(400);
  });

  it('caps public buying at available float', async () => {
    const founder = await createFounder({ balance: 1_000_000_000, level: 30 });
    const company = await createCompany(founder, hqCityId);

    for (let i = 0; i < 4; i++) {
      await addMember(company._id, founder.token);
    }

    const reCompany = await RealEstateCompany.findById(company._id);
    reCompany.level = 15;
    reCompany.treasury.balance = 600_000_000;
    reCompany.stats = { totalRentalIncome: 50_000_000, propertiesOwned: 10 };
    await reCompany.save();

    for (let i = 0; i < 10; i++) {
      await createTestProperty({
        ownerId: founder.user._id,
        companyId: company._id,
        currentPrice: 30_000_000,
        basePrice: 30_000_000,
        cityId: hqCityId,
      });
    }

    const ipoRes = await request(app)
      .post(`/real-estate-companies/${company._id}/ipo`)
      .set(authHeader(founder.token))
      .send({});
    expect(ipoRes.status).toBe(200);

    const stockCompany = await Company.findById(ipoRes.body.stockCompany._id);
    const totalShares = stockCompany.sharesOutstanding;
    const heldByInsiders = stockCompany.totalSharesHeld;
    const floatShares = totalShares - heldByInsiders;

    // Try to buy more than available float â€” should be capped
    const buyer = await createAuthenticatedUser({ balance: 10_000_000_000 });
    const buyRes = await request(app)
      .post('/stocks/buy')
      .set(authHeader(buyer.token))
      .send({ companyId: stockCompany._id, shares: floatShares + 1 });
    expect(buyRes.status).toBe(400);
    expect(buyRes.body.error).toContain('Only');

    // Try to buy exact float amount â€” should succeed
    if (floatShares > 0) {
      const buyRes2 = await request(app)
        .post('/stocks/buy')
        .set(authHeader(buyer.token))
        .send({ companyId: stockCompany._id, shares: floatShares });
      expect(buyRes2.status).toBe(200);
    }
  });

  it('prevents CEO from selling locked shares', async () => {
    const founder = await createFounder({ balance: 1_000_000_000, level: 30 });
    const company = await createCompany(founder, hqCityId);

    for (let i = 0; i < 4; i++) {
      await addMember(company._id, founder.token);
    }

    const reCompany = await RealEstateCompany.findById(company._id);
    reCompany.level = 15;
    reCompany.treasury.balance = 600_000_000;
    reCompany.stats = { totalRentalIncome: 50_000_000, propertiesOwned: 10 };
    await reCompany.save();

    for (let i = 0; i < 10; i++) {
      await createTestProperty({
        ownerId: founder.user._id,
        companyId: company._id,
        currentPrice: 30_000_000,
        basePrice: 30_000_000,
        cityId: hqCityId,
      });
    }

    const ipoRes = await request(app)
      .post(`/real-estate-companies/${company._id}/ipo`)
      .set(authHeader(founder.token))
      .send({});
    expect(ipoRes.status).toBe(200);

    const stockCompany = await Company.findById(ipoRes.body.stockCompany._id);

    // CEO tries to sell locked shares â€” should be rejected
    const sellRes = await request(app)
      .post('/stocks/sell')
      .set(authHeader(founder.token))
      .send({ companyId: stockCompany._id, shares: 1 });
    expect(sellRes.status).toBe(400);
    expect(sellRes.body.error).toContain('locked');
  });

  // â”€â”€â”€ 6. SECONDARY OFFERING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('handles secondary offering with CEO protection', async () => {
    const founder = await createFounder({ balance: 1_000_000_000, level: 30 });
    const company = await createCompany(founder, hqCityId);

    for (let i = 0; i < 4; i++) {
      await addMember(company._id, founder.token);
    }

    const reCompany = await RealEstateCompany.findById(company._id);
    reCompany.level = 15;
    reCompany.treasury.balance = 600_000_000;
    reCompany.stats = { totalRentalIncome: 50_000_000, propertiesOwned: 10 };
    await reCompany.save();

    for (let i = 0; i < 10; i++) {
      await createTestProperty({
        ownerId: founder.user._id,
        companyId: company._id,
        currentPrice: 30_000_000,
        basePrice: 30_000_000,
        cityId: hqCityId,
      });
    }

    const ipoRes = await request(app)
      .post(`/real-estate-companies/${company._id}/ipo`)
      .set(authHeader(founder.token))
      .send({});
    expect(ipoRes.status).toBe(200);

    const stockCompanyId = ipoRes.body.stockCompany._id;
    const beforeOffering = await Company.findById(stockCompanyId);
    const beforeCeoHolding = await StockHolding.findOne({
      userId: founder.user._id,
      companyId: stockCompanyId,
      locked: true,
    });
    const beforeCeoPct = (beforeCeoHolding.shares / beforeOffering.sharesOutstanding) * 100;
    expect(beforeCeoPct).toBeGreaterThanOrEqual(50.9);

    // Issue 10% new shares
    const newShares = Math.floor(beforeOffering.sharesOutstanding * 0.1);
    const offeringPrice = beforeOffering.sharePrice * 0.95;

    const offeringRes = await request(app)
      .post(`/real-estate-companies/${company._id}/secondary-offering`)
      .set(authHeader(founder.token))
      .send({ newShares, price: offeringPrice });
    expect(offeringRes.status).toBe(200);

    const afterOffering = await Company.findById(stockCompanyId);
    expect(afterOffering.sharesOutstanding).toBe(beforeOffering.sharesOutstanding + newShares);
    expect(afterOffering.sharePrice).toBe(offeringPrice);

    // CEO still has >= 51%
    const afterCeoHolding = await StockHolding.findOne({
      userId: founder.user._id,
      companyId: stockCompanyId,
      locked: true,
    });
    const afterCeoPct = (afterCeoHolding.shares / afterOffering.sharesOutstanding) * 100;
    expect(afterCeoPct).toBeGreaterThanOrEqual(50.9);

    // Market cap updated
    const expectedMc = Math.round(offeringPrice * afterOffering.sharesOutstanding);
    expect(afterOffering.marketCap).toBe(expectedMc);

    // totalSharesHeld unchanged (new shares not held by anyone yet)
    expect(afterOffering.totalSharesHeld).toBe(beforeOffering.totalSharesHeld);

    // Float percentage recalculated
    const ceoHolding = await StockHolding.findOne({
      userId: founder.user._id,
      companyId: stockCompanyId,
      locked: true,
    });
    const memberHoldings = await StockHolding.find({ companyId: stockCompanyId, userId: { $ne: founder.user._id } });
    const totalInsiderShares = ceoHolding.shares + memberHoldings.reduce((s, h) => s + h.shares, 0);
    const expectedFloatPct = Math.round(
      ((afterOffering.sharesOutstanding - totalInsiderShares) / afterOffering.sharesOutstanding) * 100,
    );
    expect(afterOffering.floatPercentage).toBe(expectedFloatPct);
  });

  it('rejects secondary offering exceeding 20% cap', async () => {
    const founder = await createFounder({ balance: 1_000_000_000, level: 30 });
    const company = await createCompany(founder, hqCityId);

    for (let i = 0; i < 4; i++) {
      await addMember(company._id, founder.token);
    }

    const reCompany = await RealEstateCompany.findById(company._id);
    reCompany.level = 15;
    reCompany.treasury.balance = 600_000_000;
    reCompany.stats = { totalRentalIncome: 50_000_000, propertiesOwned: 10 };
    await reCompany.save();

    for (let i = 0; i < 10; i++) {
      await createTestProperty({
        ownerId: founder.user._id,
        companyId: company._id,
        currentPrice: 30_000_000,
        basePrice: 30_000_000,
        cityId: hqCityId,
      });
    }

    const ipoRes = await request(app)
      .post(`/real-estate-companies/${company._id}/ipo`)
      .set(authHeader(founder.token))
      .send({});
    expect(ipoRes.status).toBe(200);

    const stockCompany = await Company.findById(ipoRes.body.stockCompany._id);
    const tooManyShares = Math.floor(stockCompany.sharesOutstanding * 0.21);

    const offeringRes = await request(app)
      .post(`/real-estate-companies/${company._id}/secondary-offering`)
      .set(authHeader(founder.token))
      .send({ newShares: tooManyShares, price: 10 });
    expect(offeringRes.status).toBe(400);
    expect(offeringRes.body.error).toContain('20%');
  });

  it('rejects secondary offering for non-IPO companies', async () => {
    const founder = await createFounder();
    const company = await createCompany(founder, hqCityId);

    const offeringRes = await request(app)
      .post(`/real-estate-companies/${company._id}/secondary-offering`)
      .set(authHeader(founder.token))
      .send({ newShares: 1000, price: 10 });
    expect(offeringRes.status).toBe(400);
    expect(offeringRes.body.error).toContain('must be publicly listed');
  });

  // â”€â”€â”€ 7. EDGE CASES â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('handles treasury shares reaching zero when members join', async () => {
    const founder = await createFounder();
    const company = await createCompany(founder, hqCityId);

    // Add members until treasury is depleted (initial treasury = 300)
    const reCompany = await RealEstateCompany.findById(company._id);
    reCompany.maxMembers = 50;
    await reCompany.save();

    let added = 0;
    for (let i = 0; i < 20; i++) {
      try {
        await addMember(company._id, founder.token);
        added++;
      } catch {
        break;
      }
    }

    const after = await RealEstateCompany.findById(company._id);
    const memberSum = after.members.reduce((s, m) => s + m.shares, 0);
    expect(memberSum + after.shares.treasuryShares).toBe(after.shares.totalShares);
    expect(after.shares.totalShares).toBe(1000);
    expect(added).toBeGreaterThan(0);
  });

  it('rejects IPO with insufficient requirements', async () => {
    const founder = await createFounder();
    const company = await createCompany(founder, hqCityId);

    const ipoRes = await request(app)
      .post(`/real-estate-companies/${company._id}/ipo`)
      .set(authHeader(founder.token))
      .send({});
    expect(ipoRes.status).toBe(400);
  });

  it('rejects secondary offering from non-CEO', async () => {
    const founder = await createFounder({ balance: 1_000_000_000, level: 30 });
    const company = await createCompany(founder, hqCityId);

    for (let i = 0; i < 4; i++) {
      await addMember(company._id, founder.token);
    }

    const reCompany = await RealEstateCompany.findById(company._id);
    reCompany.level = 15;
    reCompany.treasury.balance = 600_000_000;
    reCompany.stats = { totalRentalIncome: 50_000_000, propertiesOwned: 10 };
    await reCompany.save();

    for (let i = 0; i < 10; i++) {
      await createTestProperty({
        ownerId: founder.user._id,
        companyId: company._id,
        currentPrice: 30_000_000,
        basePrice: 30_000_000,
        cityId: hqCityId,
      });
    }

    const ipoRes = await request(app)
      .post(`/real-estate-companies/${company._id}/ipo`)
      .set(authHeader(founder.token))
      .send({});
    expect(ipoRes.status).toBe(200);

    const member = await createAuthenticatedUser();
    const offeringRes = await request(app)
      .post(`/real-estate-companies/${company._id}/secondary-offering`)
      .set(authHeader(member.token))
      .send({ newShares: 100, price: 10 });
    expect(offeringRes.status).toBe(403);
  });
});
