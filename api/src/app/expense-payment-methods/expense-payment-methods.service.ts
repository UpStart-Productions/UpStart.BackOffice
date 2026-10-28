import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenantId } from '../tenancy/tenant-context';
import { expensePaymentMethodNameKey } from './expense-payment-methods.constants';
import { ensureDefaultExpensePaymentMethods } from './expense-payment-methods.util';
import { CreateExpensePaymentMethodDto } from './dto/create-expense-payment-method.dto';
import { UpdateExpensePaymentMethodDto } from './dto/update-expense-payment-method.dto';

export type ExpensePaymentMethodView = {
  id: string;
  slug: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
  expenseCount: number;
};

@Injectable()
export class ExpensePaymentMethodsService {
  constructor(private readonly prisma: PrismaService) {}

  private displayName(name: string) {
    return name.trim().replace(/\s+/g, ' ');
  }

  async ensureDefaults() {
    await ensureDefaultExpensePaymentMethods(this.prisma, currentTenantId());
  }

  async listForPicker(): Promise<ExpensePaymentMethodView[]> {
    await this.ensureDefaults();
    const rows = await this.prisma.expensePaymentMethod.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => ({ ...r, expenseCount: 0 }));
  }

  async listForSettings(): Promise<ExpensePaymentMethodView[]> {
    await this.ensureDefaults();
    const rows = await this.prisma.expensePaymentMethod.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const counts = await this.expenseCountsByNameKey();
    return rows.map((r) => ({ ...r, expenseCount: counts.get(r.nameKey) ?? 0 }));
  }

  private async expenseCountsByNameKey(): Promise<Map<string, number>> {
    const expenses = await this.prisma.expense.findMany({
      where: { paymentMethod: { not: null } },
      select: { paymentMethod: true },
    });
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = expensePaymentMethodNameKey(e.paymentMethod!);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }

  async create(dto: CreateExpensePaymentMethodDto) {
    await this.ensureDefaults();
    const name = this.displayName(dto.name);
    if (!name) throw new BadRequestException('Name is required');
    const nameKey = expensePaymentMethodNameKey(name);
    const existing = await this.prisma.expensePaymentMethod.findFirst({ where: { nameKey } });
    if (existing) throw new BadRequestException('A payment method with this name already exists');
    const maxOrder = await this.prisma.expensePaymentMethod.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.expensePaymentMethod.create({
      data: { name, nameKey, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    });
    return this.toView(row, 0);
  }

  async update(id: string, dto: UpdateExpensePaymentMethodDto) {
    await this.ensureDefaults();
    const row = await this.prisma.expensePaymentMethod.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Payment method not found');
    let name = row.name;
    let nameKey = row.nameKey;
    if (dto.name !== undefined) {
      name = this.displayName(dto.name);
      if (!name) throw new BadRequestException('Name is required');
      nameKey = expensePaymentMethodNameKey(name);
      const clash = await this.prisma.expensePaymentMethod.findFirst({
        where: { nameKey, id: { not: id } },
      });
      if (clash) throw new BadRequestException('A payment method with this name already exists');
    }
    const updated = await this.prisma.expensePaymentMethod.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name, nameKey }),
        ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
    const counts = await this.expenseCountsByNameKey();
    return this.toView(updated, counts.get(updated.nameKey) ?? 0);
  }

  async remove(id: string) {
    await this.ensureDefaults();
    const row = await this.prisma.expensePaymentMethod.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Payment method not found');
    const counts = await this.expenseCountsByNameKey();
    const used = counts.get(row.nameKey) ?? 0;
    if (used > 0) {
      throw new BadRequestException(
        `This payment method is used on ${used} expense(s). Update those expenses first or deactivate it instead.`,
      );
    }
    if (row.slug) {
      const deactivated = await this.prisma.expensePaymentMethod.update({
        where: { id },
        data: { isActive: false },
      });
      return this.toView(deactivated, 0);
    }
    await this.prisma.expensePaymentMethod.delete({ where: { id } });
    return { deleted: true as const };
  }

  private toView(
    row: { id: string; slug: string | null; name: string; sortOrder: number; isActive: boolean },
    expenseCount: number,
  ): ExpensePaymentMethodView {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      expenseCount,
    };
  }
}
