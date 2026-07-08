import Loan from '../models/Loan.js';
import User from '../models/User.js';
import Property from '../models/Property.js';
import Transaction from '../models/Transaction.js';

export async function processLoans() {
  const activeLoans = await Loan.find({ active: true });
  const results = [];

  for (const loan of activeLoans) {
    const user = await User.findById(loan.userId);
    if (!user) continue;

    const payment = loan.paymentPerTick;
    const interestPortion = Math.round(loan.remainingBalance * (loan.interestRate / loan.durationTicks));
    const principalPortion = payment - interestPortion;

    if (user.balance >= payment) {
      user.balance -= payment;
      loan.remainingBalance -= principalPortion;
      loan.ticksRemaining--;
      loan.missedPayments = 0;

      await Transaction.create({
        buyerId: user._id,
        price: payment,
        type: 'loan_payment',
      });

      if (loan.ticksRemaining <= 0 || loan.remainingBalance <= 0) {
        loan.active = false;
        loan.remainingBalance = 0;
        loan.ticksRemaining = 0;
      }
    } else {
      loan.missedPayments++;

      if (loan.missedPayments >= 3) {
        const properties = await Property.find({ ownerId: user._id });
        for (const prop of properties) {
          prop.ownerId = null;
          prop.forSale = true;
          await prop.save();

          user.ownedProperties = user.ownedProperties.filter(
            p => p.toString() !== prop._id.toString()
          );

          await Transaction.create({
            propertyId: prop._id,
            sellerId: user._id,
            price: prop.currentPrice,
            type: 'repossess',
          });
        }

        user.balance = Math.max(0, user.balance - Math.round(payment * 0.5));
        loan.active = false;
        loan.remainingBalance = 0;
        loan.ticksRemaining = 0;
      } else {
        const penalty = Math.round(payment * 0.1);
        user.balance = Math.max(0, user.balance - penalty);

        await Transaction.create({
          buyerId: user._id,
          price: penalty,
          type: 'penalty',
        });
      }
    }

    await user.save();
    await loan.save();

    results.push({
      loanId: loan._id,
      userId: user._id,
      payment,
      missedPayments: loan.missedPayments,
      active: loan.active,
    });
  }

  return results;
}
