import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessGuard, AdminOnly, Area } from '../access/access.guard';
import { CreateExpensePaymentMethodDto } from './dto/create-expense-payment-method.dto';
import { UpdateExpensePaymentMethodDto } from './dto/update-expense-payment-method.dto';
import { ExpensePaymentMethodsService } from './expense-payment-methods.service';

@ApiTags('expense-payment-methods')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Controller('expense-payment-methods')
export class ExpensePaymentMethodsController {
  constructor(private readonly methods: ExpensePaymentMethodsService) {}

  @Get()
  @Area('expenses')
  list() {
    return this.methods.listForPicker();
  }

  @Get('manage')
  @AdminOnly()
  listManage() {
    return this.methods.listForSettings();
  }

  @Post()
  @AdminOnly()
  create(@Body() dto: CreateExpensePaymentMethodDto) {
    return this.methods.create(dto);
  }

  @Put(':id')
  @AdminOnly()
  update(@Param('id') id: string, @Body() dto: UpdateExpensePaymentMethodDto) {
    return this.methods.update(id, dto);
  }

  @Delete(':id')
  @AdminOnly()
  remove(@Param('id') id: string) {
    return this.methods.remove(id);
  }
}
