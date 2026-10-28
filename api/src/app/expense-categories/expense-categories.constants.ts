/** Seeded per tenant; slug is stable when the display name changes. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  { slug: 'software', name: 'Software', sortOrder: 0 },
  { slug: 'travel', name: 'Travel', sortOrder: 1 },
  { slug: 'mileage', name: 'Mileage', sortOrder: 2 },
  { slug: 'meals', name: 'Meals', sortOrder: 3 },
  { slug: 'supplies', name: 'Supplies', sortOrder: 4 },
  { slug: 'contractor', name: 'Contractor', sortOrder: 5 },
  { slug: 'advertising', name: 'Advertising', sortOrder: 6 },
  { slug: 'other', name: 'Other', sortOrder: 7 },
] as const;

export const MILEAGE_CATEGORY_SLUG = 'mileage';

export const expenseCategoryNameKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
