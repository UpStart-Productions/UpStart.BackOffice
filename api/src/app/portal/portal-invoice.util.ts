import type { Invoice, InvoiceLineItem, Project } from '@prisma/client';

type PortalInvoiceRow = Pick<
  Invoice,
  'id' | 'displayNumber' | 'status' | 'issueDate' | 'dueDate' | 'total' | 'paidAt'
> & {
  lineItems: Array<
    Pick<InvoiceLineItem, 'id' | 'description' | 'quantity' | 'unitPrice' | 'amount' | 'projectId'> & {
      project: Pick<Project, 'id' | 'name'> | null;
    }
  >;
};

export function toPortalInvoice(inv: PortalInvoiceRow, payUrl: string | null = null) {
  return {
    id: inv.id,
    displayNumber: inv.displayNumber,
    status: inv.status,
    issueDate: inv.issueDate.toISOString(),
    dueDate: inv.dueDate?.toISOString() ?? null,
    total: Number(inv.total),
    paidAt: inv.paidAt?.toISOString() ?? null,
    payUrl: inv.status === 'SENT' && payUrl ? payUrl : null,
    lineItems: inv.lineItems.map((li) => ({
      id: li.id,
      description: li.description,
      quantity: Number(li.quantity),
      unitPrice: Number(li.unitPrice),
      amount: Number(li.amount),
      project: li.project ? { id: li.project.id, name: li.project.name } : null,
    })),
  };
}

export type PortalInvoiceView = ReturnType<typeof toPortalInvoice>;

export function invoicesForProject(
  projectId: string,
  invoices: PortalInvoiceView[],
): PortalInvoiceView[] {
  return invoices.filter((inv) =>
    inv.lineItems.some((li) => li.project?.id === projectId),
  );
}
