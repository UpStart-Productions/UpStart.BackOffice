export const DEFAULT_EXPENSE_PAYMENT_METHODS = [
  { slug: 'personal-card', name: 'Personal Card', sortOrder: 0 },
  { slug: 'company-card', name: 'Company Card', sortOrder: 1 },
  { slug: 'cash', name: 'Cash', sortOrder: 2 },
  { slug: 'epayment', name: 'ePayment (e.g. Venmo, PayPal, CashApp)', sortOrder: 3 },
] as const;

export const expensePaymentMethodNameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
