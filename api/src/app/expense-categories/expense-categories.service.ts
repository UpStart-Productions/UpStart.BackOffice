import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentTenantId } from '../tenancy/tenant-context';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  expenseCategoryNameKey,
  MILEAGE_CATEGORY_SLUG,
} from './expense-categories.constants';
import { ensureDefaultExpenseCategories } from './expense-categories.util';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';

export type ExpenseCategoryView = {
  id: string;
  slug: string | null;
  name: string;
  sortOrder: number;
  isActive: boolean;
  expenseCount: number;
};

@Injectable()
export class ExpenseCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  private displayName(name: string) {
    return name.trim().replace(/\s+/g, ' ');
  }

  async ensureDefaults() {
    const tenantId = currentTenantId();
    await ensureDefaultExpenseCategories(this.prisma, tenantId);
  }

  async listForPicker(): Promise<ExpenseCategoryView[]> {
    await this.ensureDefaults();
    const rows = await this.prisma.expenseCategory.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map((r) => ({ ...r, expenseCount: 0 }));
  }

  async listForSettings(): Promise<ExpenseCategoryView[]> {
    await this.ensureDefaults();
    const rows = await this.prisma.expenseCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    const counts = await this.expenseCountsByNameKey();
    return rows.map((r) => ({ ...r, expenseCount: counts.get(r.nameKey) ?? 0 }));
  }

  private async expenseCountsByNameKey(): Promise<Map<string, number>> {
    const expenses = await this.prisma.expense.findMany({
      where: { category: { not: null } },
      select: { category: true },
    });
    const map = new Map<string, number>();
    for (const e of expenses) {
      const key = expenseCategoryNameKey(e.category!);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }

  async mileageCategoryName(): Promise<string> {
    await this.ensureDefaults();
    const row = await this.prisma.expenseCategory.findFirst({
      where: { slug: MILEAGE_CATEGORY_SLUG, isActive: true },
      select: { name: true },
    });
    return row?.name ?? DEFAULT_EXPENSE_CATEGORIES.find((d) => d.slug === MILEAGE_CATEGORY_SLUG)!.name;
  }

  /** True when the stored category string is the tenant's mileage category (by slug name or legacy miles). */
  async isMileageCategoryName(category: string | null | undefined): Promise<boolean> {
    if (!category?.trim()) return false;
    const mileageName = await this.mileageCategoryName();
    if (category.trim().toLowerCase() === mileageName.toLowerCase()) return true;
    // Legacy default before rename.
    return category.trim().toLowerCase() === 'mileage';
  }

  async create(dto: CreateExpenseCategoryDto) {
    await this.ensureDefaults();
    const name = this.displayName(dto.name);
    if (!name) throw new BadRequestException('Name is required');
    const nameKey = expenseCategoryNameKey(name);
    const existing = await this.prisma.expenseCategory.findFirst({ where: { nameKey } });
    if (existing) throw new BadRequestException('A category with this name already exists');
    const maxOrder = await this.prisma.expenseCategory.aggregate({ _max: { sortOrder: true } });
    const row = await this.prisma.expenseCategory.create({
      data: { name, nameKey, sortOrder: (maxOrder._max.sortOrder ?? -1) + 1 },
    });
    return this.toView(row, 0);
  }

  async update(id: string, dto: UpdateExpenseCategoryDto) {
    await this.ensureDefaults();
    const row = await this.prisma.expenseCategory.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Category not found');
    if (row.slug === MILEAGE_CATEGORY_SLUG && dto.isActive === false) {
      throw new BadRequestException('The mileage category cannot be removed');
    }
    let name = row.name;
    let nameKey = row.nameKey;
    if (dto.name !== undefined) {
      name = this.displayName(dto.name);
      if (!name) throw new BadRequestException('Name is required');
      nameKey = expenseCategoryNameKey(name);
      const clash = await this.prisma.expenseCategory.findFirst({
        where: { nameKey, id: { not: id } },
      });
      if (clash) throw new BadRequestException('A category with this name already exists');
    }
    const updated = await this.prisma.expenseCategory.update({
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
    const row = await this.prisma.expenseCategory.findFirst({ where: { id } });
    if (!row) throw new NotFoundException('Category not found');
    if (row.slug === MILEAGE_CATEGORY_SLUG) {
      throw new BadRequestException('The mileage category cannot be removed');
    }
    const counts = await this.expenseCountsByNameKey();
    const used = counts.get(row.nameKey) ?? 0;
    if (used > 0) {
      throw new BadRequestException(`This category is used on ${used} expense(s). Rename expenses first or deactivate it instead.`);
    }
    if (row.slug) {
      const deactivated = await this.prisma.expenseCategory.update({
        where: { id },
        data: { isActive: false },
      });
      return this.toView(deactivated, 0);
    }
    await this.prisma.expenseCategory.delete({ where: { id } });
    return { deleted: true as const };
  }

  private toView(
    row: { id: string; slug: string | null; name: string; sortOrder: number; isActive: boolean },
    expenseCount: number,
  ): ExpenseCategoryView {
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
