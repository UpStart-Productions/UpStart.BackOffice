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
import { Request } from 'express';
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
@UseGuards(StaffAuthGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  @Get()
  @ApiQuery({ name: 'projectId', required: false })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  async list(
    @Query('projectId') projectId?: string,
    @Query('userId') userId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const expenses = await this.prisma.expense.findMany({
      where: {
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
    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project) throw new NotFoundException('Project not found');
    }
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
  async get(@Param('id') id: string) {
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: expenseInclude });
    if (!expense) throw new NotFoundException('Expense not found');
    return this.toView(expense);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Expense not found');
    if (dto.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: dto.projectId } });
      if (!project) throw new NotFoundException('Project not found');
    }

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
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string; size: number },
  ) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
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
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.expense.findUnique({ where: { id } });
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
