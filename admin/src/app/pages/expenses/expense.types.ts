export type ExpenseProject = { id: string; name: string; client: { id: string; name: string } | null };

export type ExpenseUser = { id: string; firstName?: string | null; lastName?: string | null; email: string; avatarUrl?: string | null };

export type Expense = {
  id: string;
  description: string;
  amount: number;
  category?: string | null;
  incurredAt: string;
  isReimbursable: boolean;
  isBillable: boolean;
  paymentMethod?: string | null;
  receiptUrl?: string | null;
  notes?: string | null;
  /** Mileage expenses: miles driven and the rate per mile used. */
  miles?: number | null;
  mileageRate?: number | null;
  user: ExpenseUser;
  project?: ExpenseProject | null;
};

export const SUGGESTED_EXPENSE_CATEGORIES = [
  'Software',
  'Travel',
  'Mileage',
  'Meals',
  'Supplies',
  'Contractor',
  'Advertising',
  'Other',
];

/** Category that turns an expense into miles x the organization's mileage rate. */
export const MILEAGE_CATEGORY = 'Mileage';

export function isMileageCategory(category: string | null | undefined): boolean {
  return (category ?? '').trim().toLowerCase() === MILEAGE_CATEGORY.toLowerCase();
}
