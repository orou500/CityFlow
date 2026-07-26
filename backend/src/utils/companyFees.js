import RealEstateCompany from '../models/RealEstateCompany.js';
import { getGameState } from '../models/GameState.js';
import { addTreasuryTransaction } from '../engine/companyProcessing.js';

const OPERATING_FEE_RATES = {
  property_purchase: 0.005,
  property_sale: 0.005,
  property_upgrade: 0.01,
  property_improvement: 0.01,
  construction: 0.02,
  rent_income: 0.002,
};

export async function collectOperatingFee(userId, amount, actionType) {
  try {
    if (!userId) return;
    const feeRate = OPERATING_FEE_RATES[actionType];
    if (!feeRate) return;

    const { default: User } = await import('../models/User.js');
    const user = await User.findById(userId).select('companyId');
    if (!user?.companyId) return;

    const fee = Math.round(amount * feeRate);
    if (fee <= 0) return;

    const company = await RealEstateCompany.findById(user.companyId);
    if (!company) return;

    company.treasury.balance += fee;
    const gameState = await getGameState();
    addTreasuryTransaction(
      company,
      {
        type: 'operating_fee',
        amount: fee,
        userId: userId,
        description: `Operating fee from ${actionType.replace(/_/g, ' ')} ($${amount.toLocaleString()})`,
      },
      gameState.tickNumber,
    );

    await company.save();
  } catch {
    // ignore
  }
}
