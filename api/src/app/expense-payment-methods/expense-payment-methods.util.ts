import type { Prisma } from '@prisma/client';
import { DEFAULT_EXPENSE_PAYMENT_METHODS, expensePaymentMethodNameKey } from './expense-payment-methods.constants';

export type ExpensePaymentMethodsDb = Pick<Prisma.TransactionClient, 'expensePaymentMethod'>;

export async function ensureDefaultExpensePaymentMethods(db: ExpensePaymentMethodsDb, tenantId: string): Promise<void> {
  for (const def of DEFAULT_EXPENSE_PAYMENT_METHODS) {
    const existing = await db.expensePaymentMethod.findFirst({
      where: { tenantId, slug: def.slug },
      select: { id: true },
    });
    if (existing) continue;
    await db.expensePaymentMethod.create({
      data: {
        tenantId,
        slug: def.slug,
        name: def.name,
        nameKey: expensePaymentMethodNameKey(def.name),
        sortOrder: def.sortOrder,
        isActive: true,
      },
    });
  }
}
