import type { Prisma } from '@prisma/client';
import { DEFAULT_EXPENSE_CATEGORIES, expenseCategoryNameKey } from './expense-categories.constants';

export type ExpenseCategoriesDb = Pick<Prisma.TransactionClient, 'expenseCategory'>;

/** Insert any missing built-in categories for this tenant (does not change existing rows). */
export async function ensureDefaultExpenseCategories(db: ExpenseCategoriesDb, tenantId: string): Promise<void> {
  for (const def of DEFAULT_EXPENSE_CATEGORIES) {
    const existing = await db.expenseCategory.findFirst({
      where: { tenantId, slug: def.slug },
      select: { id: true },
    });
    if (existing) continue;
    await db.expenseCategory.create({
      data: {
        tenantId,
        slug: def.slug,
        name: def.name,
        nameKey: expenseCategoryNameKey(def.name),
        sortOrder: def.sortOrder,
        isActive: true,
      },
    });
  }
}
