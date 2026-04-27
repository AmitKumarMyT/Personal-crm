/**
 * Finance Intelligence Utilities
 * Handles EMI calculations, recurring payments, and budgeting.
 */

/**
 * Calculate EMI (Equated Monthly Installment)
 * Formula: EMI = (P * r * (1+r)^n) / ((1+r)^n - 1)
 * @param principal Principal amount
 * @param annualRate Annual interest rate in percentage
 * @param tenureMonths Tenure in months
 */
export function calculateEMI(principal: number, annualRate: number, tenureMonths: number): number {
  if (annualRate === 0) return principal / tenureMonths;
  const r = annualRate / 12 / 100;
  const n = tenureMonths;
  const emi = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  return emi;
}

/**
 * Calculate daily budget
 * @param currentBalance Current available balance
 * @param fixedExpenses Sum of upcoming fixed expenses in the period
 * @param daysLeft Days left in the budgeting period
 */
export function calculateDailyBudget(currentBalance: number, fixedExpenses: number, daysLeft: number): number {
  if (daysLeft <= 0) return 0;
  const remaining = currentBalance - fixedExpenses;
  return Math.max(0, remaining / daysLeft);
}

/**
 * Check affordability
 * @param price Item price
 * @param dailyBudget Current daily budget
 * @returns Impact in days and recommendation
 */
export function checkAffordability(price: number, dailyBudget: number) {
  if (dailyBudget <= 0) return { decision: 'Critical', impactDays: Infinity, advice: 'Budget depleted. Cannot afford.' };
  const impactDays = price / dailyBudget;
  let decision = 'Affordable';
  let advice = 'Low impact on your daily budget.';

  if (impactDays > 7) {
    decision = 'High Impact';
    advice = `This equals ${impactDays.toFixed(1)} days of your daily budget. Proceed with caution.`;
  } else if (impactDays > 3) {
    decision = 'Moderate';
    advice = `This equals ${impactDays.toFixed(1)} days of your daily budget.`;
  }

  return { decision, impactDays, advice };
}

/**
 * Idempotent check for recurring payments
 * Checks if a payment has already been generated for the target period.
 */
export function shouldGenerateRecurring(lastGenerated: Date | null, frequency: 'weekly' | 'monthly'): boolean {
  if (!lastGenerated) return true;
  const now = new Date();
  const diff = now.getTime() - lastGenerated.getTime();
  const dayMs = 24 * 60 * 60 * 1000;

  if (frequency === 'weekly') {
    return diff >= 7 * dayMs;
  } else {
    // Monthly check: same day next month or > 28 days
    const nextMonth = new Date(lastGenerated);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    return now >= nextMonth || diff >= 28 * dayMs;
  }
}
