import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, createTestCity, authHeader } from '../../test/helpers.js';
import User from '../../models/User.js';
import Property from '../../models/Property.js';
import Transaction from '../../models/Transaction.js';
import GameState from '../../models/GameState.js';
import City from '../../models/City.js';
import { PERSONAL_ASSISTANT } from '../../config/personalAssistant.js';
import { processPersonalAssistantPayroll } from '../../engine/assistantPayroll.js';

const app = createApp();
const TICK = 100;
const SALARY = PERSONAL_ASSISTANT.salary;

async function seedTick(n = TICK) {
  await GameState.deleteMany({});
  await GameState.create({ key: 'global', tickNumber: n });
}

async function hire(token) {
  const res = await request(app).post('/assistant/hire').set(authHeader(token));
  expect(res.status).toBe(200);
  return res.body;
}

describe('Personal Assistant — employment lifecycle', () => {
  let owner;
  let token;

  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    await Transaction.deleteMany({});
    await GameState.deleteMany({});
    await City.deleteMany({});
    await seedTick();
    const auth = await createAuthenticatedUser({ balance: 100000 });
    owner = auth.user;
    token = auth.token;
  });

  it('hire makes the assistant active, stores the salary and debits the first month', async () => {
    const res = await request(app).post('/assistant/hire').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('active');
    expect(res.body.salary).toBe(SALARY);
    expect(res.body.hiredMonth).toBe(TICK);
    expect(res.body.canFire).toBe(true);
    expect(res.body.rentalIncomeUnlocked).toBe(true);

    const user = await User.findById(owner._id).lean();
    expect(user.balance).toBe(100000 - SALARY);
    expect(user.personalAssistant.status).toBe('active');
    expect(user.personalAssistant.paidThroughMonth).toBe(TICK);

    const tx = await Transaction.findOne({ buyerId: owner._id, type: 'assistant_salary' });
    expect(tx).toBeTruthy();
    expect(tx.price).toBe(SALARY);
  });

  it('rejects hiring with insufficient funds and changes nothing', async () => {
    await User.updateOne({ _id: owner._id }, { $set: { balance: SALARY - 1 } });

    const res = await request(app).post('/assistant/hire').set(authHeader(token));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/insufficient/i);

    const user = await User.findById(owner._id).lean();
    expect(user.balance).toBe(SALARY - 1);
    expect(user.personalAssistant.status).toBe('none');
    expect(await Transaction.countDocuments({ buyerId: owner._id, type: 'assistant_salary' })).toBe(0);
  });

  it('concurrent double hires produce exactly one assistant and one charge', async () => {
    const results = await Promise.all([
      request(app).post('/assistant/hire').set(authHeader(token)),
      request(app).post('/assistant/hire').set(authHeader(token)),
      request(app).post('/assistant/hire').set(authHeader(token)),
    ]);

    const ok = results.filter((r) => r.status === 200);
    expect(ok.length).toBe(1);

    const user = await User.findById(owner._id).lean();
    expect(user.personalAssistant.status).toBe('active');
    expect(user.balance).toBe(100000 - SALARY);
    expect(await Transaction.countDocuments({ buyerId: owner._id, type: 'assistant_salary' })).toBe(1);
  });

  it('a sequential duplicate hire is rejected', async () => {
    await hire(token);
    const res = await request(app).post('/assistant/hire').set(authHeader(token));
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already employ/i);
  });

  it('firing takes effect immediately and locks rental income', async () => {
    await hire(token);

    const res = await request(app).post('/assistant/fire').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('fired');
    expect(res.body.firedMonth).toBe(TICK);
    expect(res.body.canHire).toBe(false);
    expect(res.body.rentalIncomeUnlocked).toBe(false);

    const user = await User.findById(owner._id).lean();
    expect(user.personalAssistant.status).toBe('fired');
    expect(user.personalAssistant.firedMonth).toBe(TICK);

    // Double fire is rejected and state stays fired.
    const again = await request(app).post('/assistant/fire').set(authHeader(token));
    expect(again.status).toBe(400);
    expect((await User.findById(owner._id).lean()).personalAssistant.status).toBe('fired');
  });

  it('rehire is blocked in the same month and allowed next month', async () => {
    await hire(token);
    await request(app).post('/assistant/fire').set(authHeader(token));

    const sameMonth = await request(app).post('/assistant/hire').set(authHeader(token));
    expect(sameMonth.status).toBe(400);
    expect(sameMonth.body.error).toMatch(/next month/i);

    await seedTick(TICK + 1);
    const nextMonth = await request(app).post('/assistant/hire').set(authHeader(token));
    expect(nextMonth.status).toBe(200);
    expect(nextMonth.body.status).toBe('active');
    expect(nextMonth.body.hiredMonth).toBe(TICK + 1);
  });

  it('employment state persists across reloads (server is the source of truth)', async () => {
    await hire(token);
    const fresh = await request(app).get('/assistant/status').set(authHeader(token));
    expect(fresh.body.status).toBe('active');

    await request(app).post('/assistant/fire').set(authHeader(token));
    const after = await request(app).get('/assistant/status').set(authHeader(token));
    expect(after.body.status).toBe('fired');
    expect(after.body.canHire).toBe(false);
  });

  it('client-provided salary/status/month fields are ignored', async () => {
    const res = await request(app)
      .post('/assistant/hire')
      .set(authHeader(token))
      .send({ salary: 1, status: 'active', month: 999, rentalIncomeUnlocked: true });
    expect(res.status).toBe(200);
    const user = await User.findById(owner._id).lean();
    expect(user.personalAssistant.salary).toBe(SALARY);
    expect(user.personalAssistant.hiredMonth).toBe(TICK);
  });

  it("one user cannot manage another user's assistant (no IDOR)", async () => {
    const other = await createAuthenticatedUser({ balance: 100000 });
    await hire(token);

    const res = await request(app).post('/assistant/fire').set(authHeader(other.token));
    expect(res.status).toBe(400);
    expect((await User.findById(owner._id).lean()).personalAssistant.status).toBe('active');
  });

  it('requires authentication', async () => {
    expect((await request(app).get('/assistant/status')).status).toBe(401);
    expect((await request(app).post('/assistant/hire')).status).toBe(401);
    expect((await request(app).post('/assistant/fire')).status).toBe(401);
  });
});

describe('Personal Assistant — monthly payroll', () => {
  let owner;
  let token;

  beforeEach(async () => {
    await User.deleteMany({});
    await Transaction.deleteMany({});
    await GameState.deleteMany({});
    await seedTick(10);
    const auth = await createAuthenticatedUser({ balance: 50000 });
    owner = auth.user;
    token = auth.token;
  });

  it('charges one month per tick, idempotently, and never after firing', async () => {
    await hire(token); // paid through month 10

    await processPersonalAssistantPayroll(11);
    expect((await User.findById(owner._id).lean()).balance).toBe(50000 - SALARY * 2);
    expect(await Transaction.countDocuments({ buyerId: owner._id, type: 'assistant_salary' })).toBe(2);

    // Retried tick 11 must not charge twice.
    await processPersonalAssistantPayroll(11);
    expect((await User.findById(owner._id).lean()).balance).toBe(50000 - SALARY * 2);
    expect(await Transaction.countDocuments({ buyerId: owner._id, type: 'assistant_salary' })).toBe(2);

    await processPersonalAssistantPayroll(12);
    expect((await User.findById(owner._id).lean()).balance).toBe(50000 - SALARY * 3);

    await request(app).post('/assistant/fire').set(authHeader(token));
    await processPersonalAssistantPayroll(13);
    expect((await User.findById(owner._id).lean()).balance).toBe(50000 - SALARY * 3);
    expect(await Transaction.countDocuments({ buyerId: owner._id, type: 'assistant_salary' })).toBe(3);
  });

  it('auto-fires the assistant when the salary cannot be paid', async () => {
    await hire(token);
    await User.updateOne({ _id: owner._id }, { $set: { balance: SALARY - 1 } });

    const results = await processPersonalAssistantPayroll(11);
    const fired = results.find((r) => r.autoFired);
    expect(fired).toBeTruthy();

    const user = await User.findById(owner._id).lean();
    expect(user.personalAssistant.status).toBe('fired');
    expect(user.personalAssistant.firedMonth).toBe(11);
    expect(user.balance).toBe(SALARY - 1); // no partial charge

    // No further salary obligations.
    await processPersonalAssistantPayroll(12);
    expect((await User.findById(owner._id).lean()).balance).toBe(SALARY - 1);
  });
});

describe('Personal Assistant — Rental Income authorization', () => {
  let owner;
  let token;
  let city;

  beforeEach(async () => {
    await User.deleteMany({});
    await Property.deleteMany({});
    await Transaction.deleteMany({});
    await GameState.deleteMany({});
    await City.deleteMany({});
    await seedTick();
    city = await createTestCity();
    const auth = await createAuthenticatedUser({ balance: 100000 });
    owner = auth.user;
    token = auth.token;
  });

  async function makeRentalProperty(rent) {
    return Property.create({
      cityId: city._id,
      ownerId: owner._id,
      type: 'apartment',
      name: `Rent_${Date.now()}`,
      basePrice: 200000,
      currentPrice: 200000,
      rent,
      occupancy: 100,
      maintenanceLevel: 'none',
    });
  }

  it('returns a safe locked response without an assistant (no value leak)', async () => {
    await makeRentalProperty(10000);
    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBe(true);
    expect(res.body.reason).toBe('personal_assistant_required');
    expect(res.body.totalRentalIncome).toBeUndefined();
    expect(res.body.properties).toBeUndefined();
  });

  it('unlocks with the exact same value after hiring (authorization only, no economic change)', async () => {
    await makeRentalProperty(10000);

    await hire(token);
    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.locked).toBeUndefined();
    expect(res.body.totalRentalIncome).toBe(9800); // 10000 - 2% apartment operating
    expect(res.body.properties).toHaveLength(1);
    expect(res.body.properties[0].rentalIncome).toBe(9800);
    // The value is the authoritative occupancy-adjusted income, unchanged by
    // the employment feature.
    expect(res.body.totalRentalIncome).toBe(Math.max(0, 10000 - Math.round(10000 * 0.02)));
  });

  it('locks again immediately after firing (no stale value)', async () => {
    await makeRentalProperty(10000);
    await hire(token);
    await request(app).post('/assistant/fire').set(authHeader(token));

    const res = await request(app).get('/users/me/rental-income').set(authHeader(token));
    expect(res.body.locked).toBe(true);
    expect(res.body.totalRentalIncome).toBeUndefined();
  });
});
