/**
 * Personal Assistant employment configuration.
 *
 * The Personal Assistant is a real monthly employee: hiring prepays the first
 * month's salary (mirroring the company employee convention), the tick engine
 * charges each subsequent month while she stays active, and firing takes
 * effect immediately with no rehire until the next game month.
 *
 * Her active employment unlocks the Rental Income dashboard feature.
 */
export const PERSONAL_ASSISTANT = {
  // Monthly salary in game dollars. Env-overridable; never client-controlled.
  salary: parseInt(process.env.PERSONAL_ASSISTANT_SALARY, 10) || 2000,
  // Ledger transaction type for hire prepayment and monthly payroll.
  salaryTransactionType: 'assistant_salary',
};
