import type { RecordAttributionDto } from '@upstart/back-office/shared';

export type ExpenseProject = {
  id: string;
  name: string;
  client: { id: string; name: string } | null;
  defaultExpenseReimbursable?: boolean;
  defaultExpenseBillable?: boolean;
};

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
  /** Billable only: Not billed, on a client invoice, or that invoice is paid. Null when not billable. */
  billingStatus?: ExpenseBillingStatus | null;
  billingInvoice?: ExpenseInvoiceRef | null;
  /** Reimbursable only: not on an invoice to the organization yet, on one, or that invoice is paid. Null when not reimbursable. */
  reimbursementStatus?: ExpenseReimbursementStatus | null;
  reimbursementInvoice?: ExpenseInvoiceRef | null;
  attribution?: RecordAttributionDto;
};

export type ExpenseBillingStatus = 'UNBILLED' | 'INVOICED' | 'PAID';
export type ExpenseReimbursementStatus = 'NOT_SUBMITTED' | 'SUBMITTED' | 'REIMBURSED';
export type ExpenseInvoiceRef = { id: string; displayNumber: string; status: string };

export type ExpenseCategory = {
  id: string;
  slug: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
  expenseCount?: number;
};

export type ExpensePaymentMethod = {
  id: string;
  slug: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
  expenseCount?: number;
};

/** Stable slug for the mileage category (display name is tenant-configurable). */
export const MILEAGE_CATEGORY_SLUG = 'mileage';

/** @deprecated Use tenant categories from the API; kept for tests and fallbacks. */
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

export function isMileageCategory(
  category: string | null | undefined,
  categories: Pick<ExpenseCategory, 'slug' | 'name' | 'isActive'>[] = [],
): boolean {
  const value = (category ?? '').trim();
  if (!value) return false;
  const mileage = categories.find((c) => c.slug === MILEAGE_CATEGORY_SLUG && c.isActive);
  if (mileage && value.toLowerCase() === mileage.name.toLowerCase()) return true;
  return value.toLowerCase() === 'mileage';
}
