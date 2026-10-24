import {
  Body, Controller, Delete, Get, NotFoundException, Param,
  Post, Put, Query, Req, UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AccessService } from '../access/access.service';
import { UserContext } from '../common/app.types';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { generatePortalToken } from '../portal/portal-token.util';
import { toClientView } from '../portal/portal-client.util';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { ACCOUNT_JOURNEYS, AccountJourneyValue, CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { AccessGuard, Area } from '../access/access.guard';

const clientSelect = {
  id: true,
  name: true,
  code: true,
  email: true,
  phone: true,
  address: true,
  city: true,
  state: true,
  zip: true,
  website: true,
  notes: true,
  category: true,
  journey: true,
  roles: true,
  isReferralReady: true,
  lastContactAt: true,
  isActive: true,
  portalEnabled: true,
  portalToken: true,
  portalTokenCreatedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Trim, drop blanks and case-insensitive duplicates, keep the first spelling. */
function normalizeRoles(roles: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of roles ?? []) {
    const t = r.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

@ApiTags('clients')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('clients')
@Controller('clients')
export class ClientsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageFolders: StorageFoldersService,
    private readonly access: AccessService,
  ) {}

  /** 404 (not 403) for a client outside the user's reach, so ids can't be probed. */
  private async assertReach(req: Request, id: string): Promise<void> {
    const ids = await this.access.clientIds(req.user as UserContext);
    if (ids !== null && !ids.includes(id)) throw new NotFoundException('Client not found');
  }

  @Get()
  async list(@Req() req: Request, @Query('journey') journey?: string, @Query('role') role?: string) {
    const reach = await this.access.clientIdFilter(req.user as UserContext);
    const journeys = (journey ?? '')
      .split(',')
      .filter((j): j is AccountJourneyValue => (ACCOUNT_JOURNEYS as readonly string[]).includes(j));
    const clients = await this.prisma.client.findMany({
      where: {
        ...(reach ? { id: reach } : {}),
        ...(journeys.length ? { journey: { in: journeys } } : {}),
        ...(role ? { roles: { has: role } } : {}),
      },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        code: true,
        email: true,
        phone: true,
        address: true,
        city: true,
        state: true,
        zip: true,
        website: true,
        notes: true,
        category: true,
        journey: true,
        roles: true,
        isReferralReady: true,
        lastContactAt: true,
        isActive: true,
        portalEnabled: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return clients;
  }

  /**
   * Clients the user can reach, by name only: the picker for time, expenses and invoices,
   * so roles without the Clients area can still choose one of their assigned clients.
   */
  @Get('lookup')
  @Area('clients', 'time', 'expenses', 'invoices')
  async lookup(@Req() req: Request) {
    const ids = await this.access.clientIdFilter(req.user as UserContext);
    return this.prisma.client.findMany({
      where: { isActive: true, journey: 'CLIENT', ...(ids ? { id: ids } : {}) },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  @Post()
  async create(@Body() dto: CreateClientDto, @Req() req: Request) {
    const client = await this.prisma.client.create({
      data: {
        name: dto.name,
        code: dto.code?.toUpperCase(),
        journey: dto.journey ?? 'CLIENT',
        roles: normalizeRoles(dto.roles),
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        state: dto.state,
        zip: dto.zip,
        website: dto.website,
        notes: dto.notes,
        isActive: dto.isActive ?? true,
      },
      select: clientSelect,
    });
    const user = req.user as UserContext;
    if (this.access.level(user, 'clients') !== 'all') {
      // Someone limited to their own clients keeps access to the one they just made.
      await this.prisma.clientAssignment.create({ data: { clientId: client.id, userId: user.id } });
    }
    await this.storageFolders.ensureClientFolders(client.id);
    return toClientView(client);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: Request) {
    await this.assertReach(req, id);
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: clientSelect,
    });
    if (!client) throw new NotFoundException('Client not found');
    return toClientView(client);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto, @Req() req: Request) {
    await this.assertReach(req, id);
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');
    const client = await this.prisma.client.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.journey !== undefined && { journey: dto.journey }),
        ...(dto.roles !== undefined && { roles: normalizeRoles(dto.roles) }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.zip !== undefined && { zip: dto.zip }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: clientSelect,
    });
    return toClientView(client);
  }

  @Post(':id/portal/enable')
  async enablePortal(@Param('id') id: string, @Req() req: Request) {
    await this.assertReach(req, id);
    const existing = await this.prisma.client.findUnique({ where: { id }, select: clientSelect });
    if (!existing) throw new NotFoundException('Client not found');

    const portalToken = existing.portalToken ?? generatePortalToken();
    const client = await this.prisma.client.update({
      where: { id },
      data: {
        portalEnabled: true,
        portalToken,
        ...(!existing.portalToken ? { portalTokenCreatedAt: new Date() } : {}),
      },
      select: clientSelect,
    });
    return toClientView(client);
  }

  @Post(':id/portal/disable')
  async disablePortal(@Param('id') id: string, @Req() req: Request) {
    await this.assertReach(req, id);
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');

    const client = await this.prisma.client.update({
      where: { id },
      data: { portalEnabled: false },
      select: clientSelect,
    });
    return toClientView(client);
  }

  @Post(':id/portal/regenerate')
  async regeneratePortal(@Param('id') id: string, @Req() req: Request) {
    await this.assertReach(req, id);
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');

    const client = await this.prisma.client.update({
      where: { id },
      data: {
        portalToken: generatePortalToken(),
        portalTokenCreatedAt: new Date(),
        portalEnabled: true,
      },
      select: clientSelect,
    });
    return toClientView(client);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    await this.assertReach(req, id);
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');
    await this.storageFolders.removeClientTree(id);
    await this.prisma.client.delete({ where: { id } });
    return { deleted: true };
  }
}
