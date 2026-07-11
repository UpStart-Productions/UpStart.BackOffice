export type ExpenseProject = { id: string; name: string; client: { id: string; name: string } };

export type ExpenseUser = { id: string; firstName?: string | null; lastName?: string | null; email: string };

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
  user: ExpenseUser;
  project?: ExpenseProject | null;
};

export const SUGGESTED_EXPENSE_CATEGORIES = [
  'Software',
  'Travel',
  'Meals',
  'Supplies',
  'Contractor',
  'Advertising',
  'Other',
];
