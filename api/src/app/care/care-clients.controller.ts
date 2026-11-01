import { Body, Controller, ForbiddenException, Get, NotFoundException, Param, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { allows, type CareClientOverviewDto, type CareStatus } from '@upstart/back-office/shared';
import { AccessGuard, Action, Area } from '../access/access.guard';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { PrismaService } from '../prisma/prisma.service';
import { SetCareStatusDto } from './care.dto';

/**
 * A client's care status (the client page's Care tab). Open to anyone with a Care area (Care, Visits or Schedule);
 * Clients reach applies. Adding a client to care and changing the status needs Care → Setup.
 */
@ApiTags('care')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('care', 'visits', 'schedule')
@Controller('care/clients')
export class CareClientsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  @Get(':clientId')
  async overview(@Req() req: Request, @Param('clientId') clientId: string): Promise<CareClientOverviewDto> {
    const user = req.user as UserContext;
    return this.view(user, await this.reachableClient(user, clientId));
  }

  /** Add to care (ACTIVE), pause, end, or take out of care (null). Visits and shifts are kept. */
  @Put(':clientId/status')
  @Action('view')
  async setStatus(@Req() req: Request, @Param('clientId') clientId: string, @Body() dto: SetCareStatusDto): Promise<CareClientOverviewDto> {
    const user = req.user as UserContext;
    await this.reachableClient(user, clientId);
    if (!allows(user, 'care', 'setup')) throw new ForbiddenException("Your role can't change who is in care");
    const client = await this.prisma.client.update({
      where: { id: clientId },
      data: { careStatus: dto.status ?? null },
      select: { id: true, careStatus: true },
    });
    return this.view(user, client);
  }

  private async reachableClient(user: UserContext, clientId: string) {
    const ids = await this.access.clientIds(user);
    if (ids !== null && !ids.includes(clientId)) throw new NotFoundException('Client not found');
    const client = await this.prisma.client.findUnique({ where: { id: clientId }, select: { id: true, careStatus: true } });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  private view(user: UserContext, client: { id: string; careStatus: string | null }): CareClientOverviewDto {
    return {
      clientId: client.id,
      careStatus: (client.careStatus as CareStatus | null) ?? null,
      canManage: allows(user, 'care', 'setup'),
    };
  }
}
