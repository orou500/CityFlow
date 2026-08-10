import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../../test/createApp.js';
import { createAuthenticatedUser, authHeader } from '../../test/helpers.js';
import RealEstateCompany from '../../models/RealEstateCompany.js';
import Transaction from '../../models/Transaction.js';
import User from '../../models/User.js';

const app = createApp();

describe('Transaction history includes company transactions', () => {
  let user, token, company;

  beforeEach(async () => {
    await User.deleteMany({});
    await Transaction.deleteMany({});
    await RealEstateCompany.deleteMany({});
    const auth = await createAuthenticatedUser();
    user = auth.user;
    token = auth.token;
    company = await RealEstateCompany.create({
      name: `HistoryCo_${Date.now()}_${Math.random()}`,
      founderId: user._id,
      members: [{ userId: user._id, role: 'ceo' }],
    });
    await User.updateOne({ _id: user._id }, { $set: { companyId: company._id } });
  });

  it('GET /users/me includes company-only transactions alongside user transactions', async () => {
    await Transaction.create({ companyId: company._id, price: 5000, type: 'rent' });
    await Transaction.create({ buyerId: user._id, price: 0, type: 'login' });

    const res = await request(app).get('/users/me').set(authHeader(token));
    expect(res.status).toBe(200);
    const types = res.body.transactions.map((t) => t.type);
    expect(types).toContain('rent');
    expect(types).toContain('login');
  });

  it('GET /users/me does not include other companies transactions', async () => {
    const other = await RealEstateCompany.create({
      name: `OtherCo_${Date.now()}_${Math.random()}`,
      founderId: user._id,
      members: [],
    });
    await Transaction.create({ companyId: other._id, price: 5000, type: 'rent' });

    const res = await request(app).get('/users/me').set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.transactions).toHaveLength(0);
  });

  it('GET /transactions/user/:id includes company-only transactions', async () => {
    await Transaction.create({ companyId: company._id, price: 5000, type: 'rent' });
    await Transaction.create({ companyId: company._id, price: 300, type: 'loan_payment' });

    const res = await request(app).get(`/transactions/user/${user._id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    const types = res.body.map((t) => t.type);
    expect(types).toContain('rent');
    expect(types).toContain('loan_payment');
  });
});
