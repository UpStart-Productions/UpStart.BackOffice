export type InvoiceDueFlag = 'overdue' | 'due' | null;

export type InvoiceDueSortable = {
  status: string;
  dueDate?: string | null;
  number?: number;
  issueDate?: string;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isUnpaidInvoiceStatus(status: string): boolean {
  return status !== 'PAID' && status !== 'VOID';
}

/** Unpaid invoice with a due date — should be highlighted in lists. */
export function invoiceDueFlag(
  dueDate: string | null | undefined,
  status: string,
  asOf: Date = new Date(),
): InvoiceDueFlag {
  if (!dueDate || !isUnpaidInvoiceStatus(status)) return null;

  const due = startOfDay(new Date(dueDate));
  const today = startOfDay(asOf);
  return due < today ? 'overdue' : 'due';
}

export function isInvoiceOverdue(
  dueDate: string | null | undefined,
  status: string,
  asOf: Date = new Date(),
): boolean {
  return invoiceDueFlag(dueDate, status, asOf) === 'overdue';
}

export function compareInvoicesForAttention<T extends InvoiceDueSortable>(a: T, b: T): number {
  const aFlag = invoiceDueFlag(a.dueDate, a.status);
  const bFlag = invoiceDueFlag(b.dueDate, b.status);
  const rank = (flag: InvoiceDueFlag) => (flag === 'overdue' ? 0 : flag === 'due' ? 1 : 2);

  const flagDiff = rank(aFlag) - rank(bFlag);
  if (flagDiff !== 0) return flagDiff;

  if (aFlag && bFlag && a.dueDate && b.dueDate) {
    const dueDiff = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    if (dueDiff !== 0) return dueDiff;
  }

  const aNumber = a.number ?? 0;
  const bNumber = b.number ?? 0;
  if (aNumber !== bNumber) return bNumber - aNumber;

  if (a.issueDate && b.issueDate) {
    return new Date(b.issueDate).getTime() - new Date(a.issueDate).getTime();
  }

  return 0;
}

export function sortInvoicesForAttention<T extends InvoiceDueSortable>(invoices: T[]): T[] {
  return [...invoices].sort(compareInvoicesForAttention);
}
