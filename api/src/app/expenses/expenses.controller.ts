import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { Request } from 'express';
import { AccessService } from '../access/access.service';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { AccessGuard, Area, Action } from '../access/access.guard';
import { currentTenantId } from '../tenancy/tenant-context';
import { ExpenseCategoriesService } from '../expense-categories/expense-categories.service';

const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

const linkedInvoiceSelect = {
  select: { invoice: { select: { id: true, displayNumber: true, status: true } } },
} as const;

const expenseInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true, avatarUrl: true } },
  project: {
    select: {
      id: true,
      name: true,
      client: { select: { id: true, name: true } },
    },
  },
  invoiceLineItem: linkedInvoiceSelect,
  tenantInvoiceLineItem: linkedInvoiceSelect,
} satisfies Prisma.ExpenseInclude;

type ExpenseWithLinks = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

/** Billable: Not billed, then Invoiced (on a client invoice), then Paid (that invoice is paid). */
export type ExpenseBillingStatus = 'UNBILLED' | 'INVOICED' | 'PAID';
/** Reimbursable: Not submitted, then Submitted (on the person's invoice to the organization), then Reimbursed (paid). */
export type ExpenseReimbursementStatus = 'NOT_SUBMITTED' | 'SUBMITTED' | 'REIMBURSED';

type LinkedInvoice = { id: string; displayNumber: string; status: string } | null | undefined;

function linkStatus(invoice: LinkedInvoice): 'NONE' | 'ON_INVOICE' | 'PAID' {
  if (!invoice || invoice.status === 'VOID') return 'NONE';
  return invoice.status === 'PAID' ? 'PAID' : 'ON_INVOICE';
}

function invoiceRef(invoice: LinkedInvoice) {
  return invoice && invoice.status !== 'VOID'
    ? { id: invoice.id, displayNumber: invoice.displayNumber, status: invoice.status }
    : null;
}

@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
    private readonly expenseCategories: ExpenseCategoriesService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /** Own expenses when the role says so; expenses on a project must be for a client the user can reach. */
  private async scope(user: UserContext): Promise<Prisma.ExpenseWhereInput> {
    const clientIds = await this.access.clientIdFilter(user);
    return {
      AND: [
        this.access.level(user, 'expenses') === 'own' ? { userId: user.id } : {},
        clientIds ? { OR: [{ project: { clientId: clientIds } }, { projectId: null, userId: user.id }] } : {},
      ],
    };
  }

  private async assertProjectAllowed(user: UserContext, projectId: string) {
    const clientIds = await this.access.clientIdFilter(user);
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ...(clientIds ? { clientId: clientIds } : {}) },
      select: { id: true },
    });
    if (!project) throw new NotFoundException('Project not found');
  }

  /** The organization's mileage rate per mile (Settings → Expenses and Invoicing), or null when not set. */
  @Get('mileage-rate')
  async mileageRate() {
    return { rate: await this.currentMileageRate() };
  }

  private async currentMileageRate(): Promise<number | null> {
    const profile = await this.prisma.organizationProfile.findUnique({
      where: { tenantId: currentTenantId() },
      select: { mileageRate: true },
    });
    return profile?.mileageRate != null ? Number(profile.mileageRate) : null;
  }

  /**
   * Amount and mileage fields for a save. Miles set: amount = miles x rate (the expense keeps the rate it was first
   * saved with; a new mileage expense uses the organization's current rate). Miles null: a regular expense again.
   */
  private async mileageFields(
    dto: { miles?: number | null; amount?: number },
    existing?: { miles: Prisma.Decimal | null; mileageRate: Prisma.Decimal | null },
  ): Promise<{ amount?: number; miles?: number | null; mileageRate?: number | null; category?: string }> {
    if (dto.miles === undefined) {
      // A mileage expense's amount always comes from its miles.
      if (existing?.miles != null) return {};
      return dto.amount !== undefined ? { amount: dto.amount } : {};
    }
    if (dto.miles === null) {
      if (dto.amount === undefined) throw new BadRequestException('Amount is required');
      return { amount: dto.amount, miles: null, mileageRate: null };
    }
    const rate = existing?.mileageRate != null ? Number(existing.mileageRate) : await this.currentMileageRate();
    if (rate == null) {
      throw new BadRequestException('Set a mileage rate in Settings → Expenses and Invoicing before adding mileage');
    }
    return {
      miles: dto.miles,
      mileageRate: rate,
      amount: Math.round(dto.miles * rate * 100) / 100,
      category: await this.expenseCategories.mileageCategoryName(),
    };
  }

  @Get()
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async list(
    @Req() req: Request,
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const scope = await this.scope(req.user as UserContext);
    const expenses = await this.prisma.expense.findMany({
      where: {
        AND: [scope],
        ...(projectId ? { projectId } : {}),
        ...(userId ? { userId } : {}),
        ...(from || to
          ? {
              incurredAt: {
                ...(from ? { gte: new Date(from) } : {}),
                ...(to ? { lte: new Date(to) } : {}),
              },
            }
          : {}),
      },
      include: expenseInclude,
      orderBy: { incurredAt: 'desc' },
    });
    return expenses.map((e) => this.toView(e));
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateExpenseDto) {
    const user = req.user as UserContext;
    if (dto.projectId) await this.assertProjectAllowed(user, dto.projectId);
    const mileage = await this.mileageFields(dto);
    if (mileage.amount === undefined) throw new BadRequestException('Amount is required');
    const expense = await this.prisma.expense.create({
      data: {
        userId: user.id,
        projectId: dto.projectId,
        description: dto.description,
        amount: mileage.amount,
        miles: mileage.miles ?? null,
        mileageRate: mileage.mileageRate ?? null,
        category: mileage.category ?? dto.category,
        incurredAt: new Date(dto.incurredAt),
        isReimbursable: dto.isReimbursable ?? false,
        isBillable: dto.isBillable ?? false,
        paymentMethod: dto.paymentMethod,
        notes: dto.notes,
      },
      include: expenseInclude,
    });
    return this.toView(expense);
  }

  @Get(':id')
  async get(@Req() req: Request, @Param('id') id: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, ...(await this.scope(req.user as UserContext)) }, include: expenseInclude });
    if (!expense) throw new NotFoundException('Expense not found');
    return this.toView(expense);
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    const user = req.user as UserContext;
    const existing = await this.prisma.expense.findFirst({ where: { id, ...(await this.scope(user)) }, include: expenseInclude });
    if (!existing) throw new NotFoundException('Expense not found');
    if (dto.projectId) await this.assertProjectAllowed(user, dto.projectId);
    const mileage = await this.mileageFields(dto, existing);
    this.assertInvoicedFieldsUnchanged(existing, dto, mileage);

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.category !== undefined && { category: dto.category }),
        ...mileage,
        ...(dto.incurredAt !== undefined && { incurredAt: new Date(dto.incurredAt) }),
        ...(dto.projectId !== undefined && { projectId: dto.projectId || null }),
        ...(dto.isReimbursable !== undefined && { isReimbursable: dto.isReimbursable }),
        ...(dto.isBillable !== undefined && { isBillable: dto.isBillable }),
        ...(dto.paymentMethod !== undefined && { paymentMethod: dto.paymentMethod }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: expenseInclude,
    });
    return this.toView(expense);
  }

  /** Upload/replace the receipt image for an existing expense. */
  @Action('edit')
  @Post(':id/receipt')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: RECEIPT_MAX_BYTES } }))
  async uploadReceipt(
    @Req() req: Request,
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    const existing = await this.prisma.expense.findFirst({ where: { id, ...(await this.scope(req.user as UserContext)) } });
    if (!existing) throw new NotFoundException('Expense not found');
    if (!file) throw new BadRequestException('file is required');

    const ext = extname(file.originalname) || '.jpg';
    const key = `expenses/${existing.userId}/${id}/${randomUUID()}${ext}`;
    await this.storage.upload({ buffer: file.buffer, key, mimeType: file.mimetype });

    if (existing.receiptUrl) {
      await this.deleteStoredReceipt(existing.receiptUrl);
    }

    const expense = await this.prisma.expense.update({
      where: { id },
      data: { receiptUrl: key },
      include: expenseInclude,
    });
    return this.toView(expense);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const existing = await this.prisma.expense.findFirst({ where: { id, ...(await this.scope(req.user as UserContext)) }, include: expenseInclude });
    if (!existing) throw new NotFoundException('Expense not found');
    const invoice = invoiceRef(existing.invoiceLineItem?.invoice) ?? invoiceRef(existing.tenantInvoiceLineItem?.invoice);
    if (invoice) {
      throw new BadRequestException(`This expense is on invoice ${invoice.displayNumber}. Remove it from that invoice before deleting it.`);
    }
    if (existing.receiptUrl) {
      await this.deleteStoredReceipt(existing.receiptUrl);
    }
    await this.prisma.expense.delete({ where: { id } });
    return { deleted: true };
  }

  private async deleteStoredReceipt(receiptUrl: string): Promise<void> {
    try {
      const key = this.storage.keyFromUrl(receiptUrl);
      if (key && !key.startsWith('http')) {
        await this.storage.delete(key);
      }
    } catch {
      /* best-effort cleanup */
    }
  }

  /** The expense plus its billing and reimbursement status, worked out from its invoice links. */
  private toView(expense: ExpenseWithLinks) {
    const { invoiceLineItem, tenantInvoiceLineItem, ...rest } = expense;
    const billing = invoiceLineItem?.invoice;
    const reimbursement = tenantInvoiceLineItem?.invoice;
    const billingLink = linkStatus(billing);
    const reimbursementLink = linkStatus(reimbursement);
    const billingStatus: ExpenseBillingStatus | null = expense.isBillable
      ? billingLink === 'PAID' ? 'PAID' : billingLink === 'ON_INVOICE' ? 'INVOICED' : 'UNBILLED'
      : null;
    const reimbursementStatus: ExpenseReimbursementStatus | null = expense.isReimbursable
      ? reimbursementLink === 'PAID' ? 'REIMBURSED' : reimbursementLink === 'ON_INVOICE' ? 'SUBMITTED' : 'NOT_SUBMITTED'
      : null;
    return {
      ...rest,
      receiptUrl: toPublicAssetUrl(expense.receiptUrl),
      billingStatus,
      billingInvoice: invoiceRef(billing),
      reimbursementStatus,
      reimbursementInvoice: invoiceRef(reimbursement),
    };
  }

  /**
   * An expense on an invoice keeps what the invoice was built from: amount, miles, project, Billable and Reimbursable.
   * Throws when the update would change one of them. Remove it from the invoice (or void the draft) first.
   */
  private assertInvoicedFieldsUnchanged(existing: ExpenseWithLinks, dto: UpdateExpenseDto, mileage: { amount?: number; miles?: number | null }) {
    const invoice = invoiceRef(existing.invoiceLineItem?.invoice) ?? invoiceRef(existing.tenantInvoiceLineItem?.invoice);
    if (!invoice) return;
    const changed =
      (mileage.amount !== undefined && Number(mileage.amount) !== Number(existing.amount)) ||
      (mileage.miles !== undefined && (mileage.miles == null ? null : Number(mileage.miles)) !== (existing.miles == null ? null : Number(existing.miles))) ||
      (dto.projectId !== undefined && (dto.projectId || null) !== existing.projectId) ||
      (dto.isBillable !== undefined && dto.isBillable !== existing.isBillable) ||
      (dto.isReimbursable !== undefined && dto.isReimbursable !== existing.isReimbursable);
    if (changed) {
      throw new BadRequestException(
        `This expense is on invoice ${invoice.displayNumber}. Remove it from that invoice before changing the amount, project, Billable or Reimbursable.`,
      );
    }
  }
}
