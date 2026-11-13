import { Inject, Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { currentTenantId, runUnscoped } from '../tenancy/tenant-context';
import { PrismaService } from '../prisma/prisma.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { getUpstartLogoPng } from './brand-logo';
import { type InvoicePdfInput, type InvoicePdfLineItem, renderInvoicePdfBuffer } from './invoice-pdfmake.util';

type Numeric = { toString(): string } | number;

type LineItem = {
  description: string;
  quantity: Numeric;
  unitPrice: Numeric;
  amount: Numeric;
  projectId?: string | null;
  project?: { id: string; name: string } | null;
};

type InvoiceData = {
  displayNumber: string;
  issueDate: Date;
  dueDate?: Date | null;
  notes?: string | null;
  subtotal: Numeric;
  taxRate?: Numeric | null;
  taxAmount?: Numeric | null;
  total: Numeric;
  billToName?: string | null;
  billToAddress?: string | null;
  billTo?: string | null;
  createdById?: string | null;
  client?: { name: string; email?: string | null; address?: string | null; city?: string | null; state?: string | null; zip?: string | null } | null;
  lineItems: LineItem[];
};

@Injectable()
export class PdfService {
  private readonly logger = new Logger(PdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  async generateInvoicePdf(
    invoice: InvoiceData,
    fromName: string,
    payUrl?: string | null,
  ): Promise<Buffer> {
    const started = Date.now();
    const person = invoice.billTo === 'TENANT' && invoice.createdById ? await this.submitter(invoice.createdById) : null;
    const profile = person
      ? null
      : await this.prisma.organizationProfile.findUnique({ where: { tenantId: currentTenantId() } });

    const displayName = person?.name || profile?.companyName?.trim() || fromName;
    const logoImage = person ? null : await this.resolveLogoImage(profile?.logoUrl);
    const fromDetailsLines = person
      ? person.email ? [person.email] : []
      : formatFromDetailsLines(profile);

    const c = invoice.client;
    const billToLines = [
      invoice.billToName || c?.name,
      ...(invoice.billToAddress
        ? invoice.billToAddress.split(/\r?\n/)
        : [
            c?.address,
            c?.city && c?.state ? `${c.city}, ${c.state} ${c.zip ?? ''}`.trim() : (c?.city || c?.state || ''),
          ]),
    ]
      .map((line) => line?.toString().trim())
      .filter((line): line is string => !!line);

    const lineItems: InvoicePdfLineItem[] = invoice.lineItems.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      amount: Number(item.amount),
      projectId: item.projectId ?? item.project?.id ?? null,
      projectName: item.project?.name ?? null,
    }));

    const input: InvoicePdfInput = {
      displayNumber: invoice.displayNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      notes: invoice.notes,
      subtotal: Number(invoice.subtotal),
      taxRate: invoice.taxRate != null ? Number(invoice.taxRate) : null,
      taxAmount: invoice.taxAmount != null ? Number(invoice.taxAmount) : null,
      total: Number(invoice.total),
      billToLines,
      fromDisplayName: displayName,
      fromDetailsLines,
      logoImage,
      lineItems,
      payUrl: payUrl ?? null,
    };

    const buffer = await renderInvoicePdfBuffer(input);
    this.logger.log(`Invoice PDF ${invoice.displayNumber}: pdfmake ${Date.now() - started}ms`);
    return buffer;
  }

  private async resolveLogoImage(logoUrl?: string | null): Promise<string | null> {
    const fromTenant = await this.loadLogoDataUri(logoUrl);
    if (fromTenant) return fromTenant;
    const fallback = getUpstartLogoPng();
    if (!fallback?.length) return null;
    return `data:image/png;base64,${fallback.toString('base64')}`;
  }

  private async loadLogoDataUri(logoUrl?: string | null): Promise<string | null> {
    const raw = logoUrl?.trim();
    if (!raw) return null;
    try {
      const key = this.storage.keyFromUrl(raw);
      if (!key || key.startsWith('http')) return null;
      const buffer = await this.storage.read(key);
      if (!buffer.length) return null;
      return this.bufferToPdfImageDataUri(buffer, key);
    } catch (err) {
      this.logger.warn(`Could not load tenant logo for invoice PDF: ${String(err)}`);
      return null;
    }
  }

  private async bufferToPdfImageDataUri(buffer: Buffer, key: string): Promise<string | null> {
    const lower = key.toLowerCase();
    if (lower.endsWith('.png')) {
      return `data:image/png;base64,${buffer.toString('base64')}`;
    }
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }
    if (lower.endsWith('.webp') || lower.endsWith('.gif') || lower.endsWith('.svg')) {
      try {
        const png = await sharp(buffer).png().toBuffer();
        return `data:image/png;base64,${png.toString('base64')}`;
      } catch {
        return null;
      }
    }
    return `data:image/jpeg;base64,${buffer.toString('base64')}`;
  }

  private async submitter(userId: string): Promise<{ name: string; email: string } | null> {
    const u = await runUnscoped(() =>
      this.prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, name: true, email: true } }),
    );
    if (!u) return null;
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.name?.trim() || u.email;
    return { name, email: u.email };
  }
}

function formatFromDetailsLines(profile?: {
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  phone?: string | null;
} | null): string[] {
  if (!profile) return [];
  const cityLine = profile.city && profile.state
    ? `${profile.city}, ${profile.state} ${profile.zip ?? ''}`.trim()
    : (profile.city || profile.state || profile.zip || '');
  return [profile.address, cityLine, profile.phone]
    .map((part) => part?.trim())
    .filter((part): part is string => !!part);
}
