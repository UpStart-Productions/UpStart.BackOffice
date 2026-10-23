import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { AppAuthGuard } from '../auth/app-auth.guard';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(AppAuthGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenants the caller may act in: all of them for a super user, otherwise just their own. */
  @Get('mine')
  async mine(@Req() req: Request) {
    const user = req.user as UserContext;
    const select = { id: true, name: true, slug: true } as const;
    if (user.isSuper) return this.prisma.tenant.findMany({ select, orderBy: { name: 'asc' } });
    if (!user.tenantId) return [];
    const own = await this.prisma.tenant.findUnique({ where: { id: user.tenantId }, select });
    return own ? [own] : [];
  }
}
