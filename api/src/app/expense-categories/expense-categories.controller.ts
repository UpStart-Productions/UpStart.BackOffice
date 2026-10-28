import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, AdminOnly, Area } from '../access/access.guard';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { ExpenseCategoriesService } from './expense-categories.service';

@ApiTags('expense-categories')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly categories: ExpenseCategoriesService) {}

  /** Active categories for expense forms and filters. */
  @Get()
  @Area('expenses')
  list() {
    return this.categories.listForPicker();
  }

  /** All categories for Settings (includes inactive). Admins only. */
  @Get('manage')
  @AdminOnly()
  listManage() {
    return this.categories.listForSettings();
  }

  @Post()
  @AdminOnly()
  create(@Body() dto: CreateExpenseCategoryDto) {
    return this.categories.create(dto);
  }

  @Put(':id')
  @AdminOnly()
  update(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.categories.update(id, dto);
  }

  @Delete(':id')
  @AdminOnly()
  remove(@Param('id') id: string) {
    return this.categories.remove(id);
  }
}
