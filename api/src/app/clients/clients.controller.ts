import {
  BadRequestException,
  Body, Controller, Delete, Get, Inject, NotFoundException, Param,
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
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { fileRefsIn } from '../forms/form-fields.util';
import { ACCOUNT_JOURNEYS, AccountJourneyValue, CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { AccessGuard, Area, Action } from '../access/access.guard';
import { setClientDimensions } from '../dimensions/dimensions.util';
import { clientIdsWithTagName, withClientDimensionRows } from '../dimensions/dimensions-load.util';
import { currentTenantId } from '../tenancy/tenant-context';
import { ATTRIBUTION_INCLUDE, withAttribution } from '../common/record-attribution';
import { AddTeamMemberDto, assertTeamCandidate, clientTeam, teamCandidates } from '../team/team.util';
import { AddPipelineCardDto } from '../pipelines/dto/add-pipeline-card.dto';
import { ClientPipelineService } from './client-pipeline.service';
import { ClientsImportService } from './clients-import.service';
import { ImportClientsFileDto } from './dto/import-clients.dto';

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
  linkedInUrl: true,
  notes: true,
  category: true,
  journey: true,
  isPublicFeatured: true,
  isReferralReady: true,
  lastContactAt: true,
  isActive: true,
  portalEnabled: true,
  portalToken: true,
  portalTokenCreatedAt: true,
  createdAt: true,
  updatedAt: true,
  ...ATTRIBUTION_INCLUDE,
} as const;

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
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly clientPipeline: ClientPipelineService,
    private readonly clientsImport: ClientsImportService,
  ) {}

  /** 404 (not 403) for a client outside the user's reach, so ids can't be probed. */
  private async assertReach(req: Request, id: string): Promise<void> {
    const ids = await this.access.clientIds(req.user as UserContext);
    if (ids !== null && !ids.includes(id)) throw new NotFoundException('Client not found');
  }

  /** Staff who can be put on a client (People panel picker). */
  @Get('team/candidates')
  teamCandidates(@Req() req: Request) {
    return teamCandidates(this.prisma, req.user as UserContext);
  }

  /** Staff on the client: assigned directly, plus everyone on its projects (shown, not assigned). */
  @Get(':id/team')
  async team(@Req() req: Request, @Param('id') id: string) {
    await this.assertReach(req, id);
    return clientTeam(this.prisma, id);
  }

  /** Assign staff to the client. With Clients at "own", this is what lets them reach it. */
  @Action('edit')
  @Post(':id/team')
  async addTeamMember(@Req() req: Request, @Param('id') id: string, @Body() dto: AddTeamMemberDto) {
    await this.assertReach(req, id);
    if (!(await this.prisma.client.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundException('Client not found');
    await assertTeamCandidate(this.prisma, req.user as UserContext, dto.userId);
    const existing = await this.prisma.clientAssignment.findUnique({ where: { clientId_userId: { clientId: id, userId: dto.userId } } });
    if (!existing) await this.prisma.clientAssignment.create({ data: { clientId: id, userId: dto.userId } });
    return clientTeam(this.prisma, id);
  }

  @Action('edit')
  @Delete(':id/team/:userId')
  async removeTeamMember(@Req() req: Request, @Param('id') id: string, @Param('userId') userId: string) {
    await this.assertReach(req, id);
    await this.prisma.clientAssignment.deleteMany({ where: { clientId: id, userId } });
    return clientTeam(this.prisma, id);
  }

  @Get(':id/pipeline-cards')
  async listPipelineCards(@Req() req: Request, @Param('id') id: string) {
    await this.assertReach(req, id);
    if (!(await this.prisma.client.findUnique({ where: { id }, select: { id: true } }))) {
      throw new NotFoundException('Client not found');
    }
    return this.clientPipeline.listForClient(id);
  }

  @Action('edit')
  @Post(':id/pipeline-cards')
  async addPipelineCard(@Req() req: Request, @Param('id') id: string, @Body() dto: AddPipelineCardDto) {
    await this.assertReach(req, id);
    return this.clientPipeline.addToPipeline(req.user as UserContext, id, dto.pipelineId);
  }

  /** Accounts. ?journey=CLIENT filters by status, ?tag=Partner by CRM tag (?role= is the old name). */
  @Get()
  async list(
    @Req() req: Request,
    @Query('journey') journey?: string,
    @Query('tag') tag?: string,
    @Query('role') role?: string,
  ) {
    const reach = await this.access.clientIdFilter(req.user as UserContext);
    const journeys = (journey ?? '')
      .split(',')
      .filter((j): j is AccountJourneyValue => (ACCOUNT_JOURNEYS as readonly string[]).includes(j));
    const tagFilter = tag ?? role;
    const tagIds = tagFilter ? await clientIdsWithTagName(this.prisma, tagFilter) : null;
    const clients = await this.prisma.client.findMany({
      where: {
        ...(reach ? { id: reach } : {}),
        ...(journeys.length ? { journey: { in: journeys } } : { journey: { not: 'PROSPECT' } }),
        ...(tagIds ? { id: { in: tagIds } } : {}),
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
        isReferralReady: true,
        lastContactAt: true,
        isPublicFeatured: true,
        linkedInUrl: true,
        isActive: true,
        portalEnabled: true,
        portalToken: true,
        portalTokenCreatedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    const withDims = await withClientDimensionRows(this.prisma, clients);
    return withDims.map((c) => withAttribution(c, toClientView(c)));
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

  /** New organization (client or partner/other). Pipeline cards are not created from here. */
  @Post()
  async create(@Body() dto: CreateClientDto, @Req() req: Request) {
    const journey = dto.journey ?? 'CLIENT';
    if (journey === 'PROSPECT') {
      throw new BadRequestException('Prospect is not a valid organization status. Add opportunities on the Pipeline.');
    }
    const tenantId = currentTenantId();
    const client = await this.prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          name: dto.name,
          code: dto.code?.toUpperCase(),
          journey,
          email: dto.email,
          phone: dto.phone,
          address: dto.address,
          city: dto.city,
          state: dto.state,
          zip: dto.zip,
          website: dto.website,
          linkedInUrl: dto.linkedInUrl,
          notes: dto.notes,
          isPublicFeatured: dto.isPublicFeatured ?? false,
          isActive: dto.isActive ?? true,
        },
        select: { id: true },
      });
      const dimensions = dto.dimensions ?? {};
      if (dto.tags !== undefined) dimensions.tags = dto.tags;
      const hasDims = Object.values(dimensions).some((v) => v !== undefined);
      if (hasDims) await setClientDimensions(tx, tenantId, created.id, dimensions);
      const row = await tx.client.findUniqueOrThrow({ where: { id: created.id }, select: clientSelect });
      const [withDims] = await withClientDimensionRows(tx, [row]);
      return withDims;
    });
    const user = req.user as UserContext;
    if (this.access.level(user, 'clients') !== 'all') {
      // Someone limited to their own clients keeps access to the one they just made.
      await this.prisma.clientAssignment.create({ data: { clientId: client.id, userId: user.id } });
    }
    await this.storageFolders.ensureClientFolders(client.id);
    return this.clientView(client);
  }

  @Action('edit')
  @Post('import/preview')
  previewImport(@Body() dto: ImportClientsFileDto) {
    return this.clientsImport.previewImport(dto.fileBase64);
  }

  @Action('edit')
  @Post('import')
  runImport(@Body() dto: ImportClientsFileDto, @Req() req: Request) {
    return this.clientsImport.commitImport(dto.fileBase64, req.user as UserContext);
  }

  @Get(':id')
  async get(@Param('id') id: string, @Req() req: Request) {
    await this.assertReach(req, id);
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: clientSelect,
    });
    if (!client) throw new NotFoundException('Client not found');
    const [withDims] = await withClientDimensionRows(this.prisma, [client]);
    return withAttribution(withDims, toClientView(withDims));
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateClientDto, @Req() req: Request) {
    await this.assertReach(req, id);
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');
    const tenantId = currentTenantId();
    const dimensions = { ...(dto.dimensions ?? {}) };
    if (dto.tags !== undefined) dimensions.tags = dto.tags;
    const hasDims = Object.values(dimensions).some((v) => v !== undefined);
    if (hasDims) await setClientDimensions(this.prisma, tenantId, id, dimensions);
    if (dto.journey === 'CLIENT' && existing.journey !== 'CLIENT') {
      // Won: the pipeline holds opportunities, so this account's open cards come off the board.
      await this.prisma.lead.updateMany({ where: { clientId: id, archivedAt: null }, data: { archivedAt: new Date() } });
    }
    const client = await this.prisma.client.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.code !== undefined && { code: dto.code.toUpperCase() }),
        ...(dto.journey !== undefined && { journey: dto.journey }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.address !== undefined && { address: dto.address }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.state !== undefined && { state: dto.state }),
        ...(dto.zip !== undefined && { zip: dto.zip }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.linkedInUrl !== undefined && { linkedInUrl: dto.linkedInUrl }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.isPublicFeatured !== undefined && { isPublicFeatured: dto.isPublicFeatured }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
      select: clientSelect,
    });
    return this.clientView(client);
  }

  private async clientView<T extends Parameters<typeof toClientView>[0]>(client: T) {
    const [withDims] = await withClientDimensionRows(this.prisma, [client]);
    return withAttribution(withDims, toClientView(withDims));
  }

  @Action('edit')
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
    return this.clientView(client);
  }

  @Action('edit')
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
    return this.clientView(client);
  }

  @Action('edit')
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
    return this.clientView(client);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @Req() req: Request) {
    await this.assertReach(req, id);
    const existing = await this.prisma.client.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Client not found');
    await this.storageFolders.removeClientTree(id);
    // Files uploaded on this client's form answers and visit checklists go with it.
    const [responses, visits] = await Promise.all([
      this.prisma.formResponse.findMany({ where: { clientId: id }, select: { values: true } }),
      this.prisma.careVisit.findMany({ where: { clientId: id }, select: { values: true } }),
    ]);
    await this.prisma.client.delete({ where: { id } });
    for (const f of [...responses, ...visits].flatMap((r) => fileRefsIn(r.values))) {
      await this.storage.delete(f.key).catch(() => undefined);
    }
    return { deleted: true };
  }
}
