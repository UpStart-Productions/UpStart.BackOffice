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
import { Area, AreaGuard } from '../access/area.guard';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { StaffAuthGuard } from '../auth/staff-auth.guard';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';

const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

const expenseInclude = {
  user: { select: { id: true, firstName: true, lastName: true, email: true } },
  project: {
    select: {
      id: true,
      name: true,
      client: { select: { id: true, name: true } },
    },
  },
};

@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(StaffAuthGuard, AreaGuard)
@Area('expenses')
@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
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
    const expense = await this.prisma.expense.create({
      data: {
        userId: user.id,
        projectId: dto.projectId,
        description: dto.description,
        amount: dto.amount,
        category: dto.category,
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
    const existing = await this.prisma.expense.findFirst({ where: { id, ...(await this.scope(user)) } });
    if (!existing) throw new NotFoundException('Expense not found');
    if (dto.projectId) await this.assertProjectAllowed(user, dto.projectId);

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.amount !== undefined && { amount: dto.amount }),
        ...(dto.category !== undefined && { category: dto.category }),
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
    const existing = await this.prisma.expense.findFirst({ where: { id, ...(await this.scope(req.user as UserContext)) } });
    if (!existing) throw new NotFoundException('Expense not found');
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

  private toView<T extends { receiptUrl: string | null }>(expense: T) {
    return { ...expense, receiptUrl: toPublicAssetUrl(expense.receiptUrl) };
  }
}
