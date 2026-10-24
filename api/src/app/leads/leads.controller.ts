import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException,
  Param, Post, Put, Query, UseGuards, ConflictException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { applyLeadEditsToLinks, ensureLeadLinks, leadPersonView } from './lead-links.util';
import { findLane, firstLane, Lane, laneFields, laneForLegacy, PipelineDb } from '../pipelines/pipeline-lanes.util';
import { AccessGuard, Area, Action } from '../access/access.guard';
import { toPublicAssetUrl } from '../storage/asset-url.util';

/** What the pipeline needs to show about a lead's Account and person. */
const linkInclude = {
  client: { select: { id: true, name: true, journey: true } },
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatarUrl: true,
      phone: true,
      emails: { select: { email: true, isPrimary: true }, orderBy: { createdAt: 'asc' as const } },
    },
  },
} as const;

/** The lead with person fields read from its Contact, and the bulky contact row left out. */
function toLeadView<T extends { contact?: unknown; primaryContact: string | null; email: string | null; phone: string | null; contactRole: string | null }>(
  lead: T,
) {
  const { contact, ...rest } = lead;
  const avatar = (contact as { avatarUrl?: string | null } | null | undefined)?.avatarUrl ?? null;
  return { ...rest, ...leadPersonView(lead as never), contactAvatarUrl: toPublicAssetUrl(avatar) };
}

/** The lane a create/update asks for: an explicit lane, a legacy stage, or (on create) a pipeline's first lane. */
async function requestedLane(
  db: PipelineDb,
  dto: { stageId?: string; stage?: LeadStage; pipelineId?: string },
  isCreate: boolean,
): Promise<Lane | null> {
  if (dto.stageId) {
    const lane = await findLane(db, dto.stageId);
    if (!lane) throw new BadRequestException('Unknown lane.');
    return lane;
  }
  if (dto.stage) return laneForLegacy(db, dto.stage);
  return isCreate ? firstLane(db, dto.pipelineId) : null;
}

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(AccessGuard)
@Area('pipeline')
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageFolders: StorageFoldersService,
  ) {}

  /** Board cards. Archived cards are left out unless ?archived=true (then only archived ones). */
  @Get()
  async list(
    @Query('stage') stage?: LeadStage,
    @Query('pipelineId') pipelineId?: string,
    @Query('archived') archived?: string,
  ) {
    const leads = await this.prisma.lead.findMany({
      where: {
        archivedAt: archived === 'true' ? { not: null } : null,
        ...(stage ? { stage } : {}),
        ...(pipelineId ? { pipelineId } : {}),
      },
      orderBy: { organization: 'asc' },
      include: linkInclude,
    });
    return leads.map(toLeadView);
  }

  @Post()
  async create(@Body() dto: CreateLeadDto) {
    const lead = await this.prisma.$transaction(async (tx) => {
      const lane = (await requestedLane(tx, dto, true)) as Lane;
      const created = await tx.lead.create({
        data: {
          ...laneFields(lane),
          organization: dto.organization,
          primaryContact: dto.primaryContact,
          contactRole: dto.contactRole,
          email: dto.email,
          phone: dto.phone,
          website: dto.website,
          source: dto.source,
          warmConnection: dto.warmConnection,
          category: dto.category,
          serviceInterests: dto.serviceInterests ?? [],
          nextAction: dto.nextAction,
          nextActionDate: dto.nextActionDate ? new Date(dto.nextActionDate) : undefined,
          lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : undefined,
        },
      });
      // Every pipeline item has an Account (a Prospect unless the name matches an existing one).
      await ensureLeadLinks(tx, created.id);
      return tx.lead.findUniqueOrThrow({ where: { id: created.id }, include: linkInclude });
    });
    return toLeadView(lead);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: { artifacts: { orderBy: { createdAt: 'desc' } }, ...linkInclude },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    return toLeadView(lead);
  }

  /**
   * The people on this card's account (primary person first), for "View contacts" on the board.
   * Readable with Pipeline access alone, so pipeline users don't need the Contacts area.
   */
  @Get(':id/contacts')
  async contacts(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { clientId: true, primaryContactId: true, client: { select: { name: true } } },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (!lead.clientId) return { accountName: null, contacts: [] };
    const links = await this.prisma.contactAccount.findMany({
      where: { clientId: lead.clientId },
      select: {
        role: true,
        isPrimary: true,
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            title: true,
            phone: true,
            avatarUrl: true,
            isActive: true,
            emails: { select: { email: true, isPrimary: true }, orderBy: { createdAt: 'asc' } },
          },
        },
      },
    });
    const contacts = links
      .map((l) => {
        const primaryEmail = l.contact.emails.find((e) => e.isPrimary) ?? l.contact.emails[0];
        return {
          id: l.contact.id,
          name: [l.contact.firstName, l.contact.lastName].filter(Boolean).join(' '),
          role: l.role ?? l.contact.title ?? null,
          email: primaryEmail?.email ?? null,
          phone: l.contact.phone,
          avatarUrl: toPublicAssetUrl(l.contact.avatarUrl),
          isActive: l.contact.isActive,
          /** The lead's own person. */
          isLeadContact: l.contact.id === lead.primaryContactId,
        };
      })
      .sort((a, b) => Number(b.isLeadContact) - Number(a.isLeadContact) || a.name.localeCompare(b.name));
    return { accountName: lead.client?.name ?? null, contacts };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateLeadDto) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lead not found');
    const lead = await this.prisma.$transaction(async (tx) => {
      const lane = await requestedLane(tx, dto, false);
      await tx.lead.update({
        where: { id },
        data: {
          ...(lane ? laneFields(lane) : {}),
          ...(dto.organization !== undefined && { organization: dto.organization }),
          ...(dto.primaryContact !== undefined && { primaryContact: dto.primaryContact }),
          ...(dto.contactRole !== undefined && { contactRole: dto.contactRole }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.website !== undefined && { website: dto.website }),
          ...(dto.source !== undefined && { source: dto.source }),
          ...(dto.warmConnection !== undefined && { warmConnection: dto.warmConnection }),
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.serviceInterests !== undefined && { serviceInterests: dto.serviceInterests }),
          ...(dto.nextAction !== undefined && { nextAction: dto.nextAction }),
          ...(dto.nextActionDate !== undefined && { nextActionDate: dto.nextActionDate ? new Date(dto.nextActionDate) : null }),
          ...(dto.lastContactDate !== undefined && { lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : null }),
        },
      });
      const links = await ensureLeadLinks(tx, id);
      await applyLeadEditsToLinks(
        tx,
        { id, clientId: links.clientId, primaryContactId: links.primaryContactId },
        existing.organization,
        dto,
      );
      return tx.lead.findUniqueOrThrow({ where: { id }, include: linkInclude });
    });
    return toLeadView(lead);
  }

  /** Take a card off the board. Its history, account and contact are untouched; restore any time. */
  @Action('edit')
  @Post(':id/archive')
  async archive(@Param('id') id: string) {
    const existing = await this.prisma.lead.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new NotFoundException('Lead not found');
    await this.prisma.lead.update({ where: { id }, data: { archivedAt: new Date() } });
    return { id, archived: true };
  }

  /** Put an archived card back on the board in the lane it was in (or its pipeline's first lane). */
  @Action('edit')
  @Post(':id/restore')
  async restore(@Param('id') id: string) {
    const existing = await this.prisma.lead.findUnique({ where: { id }, select: { id: true, stageId: true, pipelineId: true } });
    if (!existing) throw new NotFoundException('Lead not found');
    const lane = existing.stageId ? null : await firstLane(this.prisma, existing.pipelineId);
    await this.prisma.lead.update({
      where: { id },
      data: { archivedAt: null, ...(lane ? laneFields(lane) : {}) },
    });
    return { id, archived: false };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lead not found');
    await this.prisma.lead.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Make the lead's organization a Client and take the card off the board (archived, history kept):
   * the pipeline holds opportunities, and this one is won. Nothing is copied: the organization
   * already holds the contacts, timeline and files. The invoice code is optional and only needed
   * once you invoice. Reversible from the organization's Status field.
   */
  @Action('edit')
  @Post(':id/convert')
  async convert(@Param('id') id: string, @Body() dto: ConvertLeadDto) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');

    const code = dto.code?.trim().toUpperCase();
    const client = await this.prisma.$transaction(async (tx) => {
      const { clientId } = await ensureLeadLinks(tx, id);
      if (code) {
        const taken = await tx.client.findFirst({ where: { code, id: { not: clientId } }, select: { id: true } });
        if (taken) throw new ConflictException(`Client code "${code}" is already in use`);
      }
      // The lead's files show on the Account too.
      await tx.artifact.updateMany({ where: { leadId: id, clientId: null }, data: { clientId } });
      await tx.lead.update({ where: { id }, data: { archivedAt: lead.archivedAt ?? new Date() } });
      return tx.client.update({
        where: { id: clientId },
        data: { journey: 'CLIENT', ...(code ? { code } : {}) },
      });
    });
    await this.storageFolders.ensureClientFolders(client.id);
    return client;
  }
}
