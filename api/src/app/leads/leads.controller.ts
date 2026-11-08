import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException,
  Param, Post, Put, Query, Req, UseGuards, ConflictException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LeadStage } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageFoldersService } from '../storage/storage-folders.service';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { CopyLeadDto } from './dto/copy-lead.dto';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { copyLeadCard } from './lead-copy.util';
import { applyLeadEditsToLinks, leadPersonView, warmConnectionLabel } from './lead-links.util';
import { linkLeadPerson, listLeadPeople, unlinkLeadPerson } from './lead-people.util';
import { promoteLeadToOrganization } from './lead-promote.util';
import { findLane, firstLane, Lane, laneFields, laneForLegacy, PipelineDb } from '../pipelines/pipeline-lanes.util';
import { AccessGuard, Area, Action } from '../access/access.guard';
import { ATTRIBUTION_INCLUDE, withAttribution } from '../common/record-attribution';
import { toPublicAssetUrl } from '../storage/asset-url.util';
import { UserContext } from '../common/app.types';
import { PipelineTrackerNotifyService } from '../notifications/pipeline-tracker-notify.service';

/** What the pipeline needs to show about a lead's Account and person. */
const linkInclude = {
  ...ATTRIBUTION_INCLUDE,
  client: { select: { id: true, name: true, journey: true } },
  invoice: {
    select: {
      id: true,
      displayNumber: true,
      status: true,
      total: true,
      client: { select: { id: true, name: true } },
    },
  },
  trackedClient: { select: { id: true, name: true, journey: true } },
  project: {
    select: {
      id: true,
      name: true,
      client: { select: { id: true, name: true } },
    },
  },
  contact: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      title: true,
      avatarUrl: true,
      phone: true,
      emails: { select: { email: true, isPrimary: true }, orderBy: { createdAt: 'asc' as const } },
      accountLinks: { select: { clientId: true, role: true } },
    },
  },
  warmConnectionContact: {
    select: { id: true, firstName: true, lastName: true, avatarUrl: true },
  },
} as const;

type LeadRow = {
  contact?: Parameters<typeof leadPersonView>[0]['contact'];
  warmConnectionContact?: { firstName: string; lastName: string | null; avatarUrl: string | null } | null;
  warmConnection: string | null;
  warmConnectionContactId: string | null;
  primaryContactId: string | null;
  clientId: string | null;
  primaryContact: string | null;
  email: string | null;
  phone: string | null;
  contactRole: string | null;
};

/** The lead with person fields read from its Contact, and the bulky contact row left out. */
function toLeadView<T extends LeadRow>(lead: T) {
  const { contact, warmConnectionContact, ...rest } = lead;
  const avatar = (contact as { avatarUrl?: string | null } | null | undefined)?.avatarUrl ?? null;
  const person = leadPersonView(lead);
  const view = {
    ...rest,
    ...person,
    primaryContactId: lead.primaryContactId,
    warmConnectionContactId: lead.warmConnectionContactId,
    warmConnection: warmConnectionLabel(lead.warmConnection, warmConnectionContact),
    contactAvatarUrl: toPublicAssetUrl(avatar),
    warmConnectionAvatarUrl: toPublicAssetUrl(warmConnectionContact?.avatarUrl ?? null),
  };
  return withAttribution(lead, view);
}

async function contactDisplayName(
  db: { contact: PrismaService['contact'] },
  contactId: string,
): Promise<string> {
  const c = await db.contact.findUnique({
    where: { id: contactId },
    select: { firstName: true, lastName: true },
  });
  if (!c) throw new NotFoundException('Person not found');
  return [c.firstName, c.lastName].filter(Boolean).join(' ');
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
    private readonly pipelineTrackerNotify: PipelineTrackerNotifyService,
  ) {}

  /** Active board cards only (won / closed cards are omitted via archivedAt). */
  @Get()
  async list(
    @Query('stage') stage?: LeadStage,
    @Query('pipelineId') pipelineId?: string,
  ) {
    const leads = await this.prisma.lead.findMany({
      where: {
        archivedAt: null,
        ...(stage ? { stage } : {}),
        ...(pipelineId ? { pipelineId } : {}),
      },
      orderBy: { organization: 'asc' },
      include: linkInclude,
    });
    return leads.map(toLeadView);
  }

  /** Distinct category and next-action strings already used on pipeline cards (for creatable pickers). */
  @Get('meta/suggestions')
  async suggestions() {
    const [categoryRows, nextRows] = await Promise.all([
      this.prisma.lead.findMany({
        where: { category: { not: null } },
        select: { category: true },
        distinct: ['category'],
      }),
      this.prisma.lead.findMany({
        where: { nextAction: { not: null } },
        select: { nextAction: true },
      }),
    ]);
    const nextActions = new Set<string>();
    for (const row of nextRows) {
      const text = row.nextAction?.trim();
      if (text) nextActions.add(text);
    }
    return {
      categories: categoryRows.map((r) => r.category).filter((c): c is string => !!c),
      nextActions: [...nextActions].sort((a, b) => a.localeCompare(b)),
    };
  }

  @Post()
  async create(@Body() dto: CreateLeadDto) {
    const lead = await this.prisma.$transaction(async (tx) => {
      const lane = (await requestedLane(tx, dto, true)) as Lane;
      let primaryPatch: { primaryContactId?: string; primaryContact?: string } = {};
      if (dto.primaryContactId) {
        primaryPatch = {
          primaryContactId: dto.primaryContactId,
          primaryContact: await contactDisplayName(tx, dto.primaryContactId),
        };
      }
      let warmPatch: { warmConnectionContactId?: string; warmConnection?: string } = {};
      if (dto.warmConnectionContactId) {
        warmPatch = {
          warmConnectionContactId: dto.warmConnectionContactId,
          warmConnection: await contactDisplayName(tx, dto.warmConnectionContactId),
        };
      }
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
          ...primaryPatch,
          ...warmPatch,
          category: dto.category,
          serviceInterests: dto.serviceInterests ?? [],
          nextAction: dto.nextAction,
          nextActionDate: dto.nextActionDate ? new Date(dto.nextActionDate) : undefined,
          lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : undefined,
        },
      });
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

  /** People on the pipeline card (before or after an organization link). */
  @Get(':id/people')
  async people(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id }, select: { id: true, primaryContactId: true } });
    if (!lead) throw new NotFoundException('Lead not found');
    const rows = await listLeadPeople(this.prisma, id);
    return rows.map((c) => ({
      ...c,
      avatarUrl: toPublicAssetUrl(c.avatarUrl),
      isLeadPrimary: c.id === lead.primaryContactId,
    }));
  }

  @Action('edit')
  @Post(':id/people')
  async addPerson(@Param('id') id: string, @Body() body: { contactId: string }) {
    if (!body.contactId?.trim()) throw new BadRequestException('contactId is required');
    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id }, select: { id: true } });
      if (!lead) throw new NotFoundException('Lead not found');
      await linkLeadPerson(tx, id, body.contactId.trim());
    });
    return this.people(id);
  }

  @Action('edit')
  @Delete(':id/people/:contactId')
  async removePerson(@Param('id') id: string, @Param('contactId') contactId: string) {
    await this.prisma.$transaction(async (tx) => {
      const lead = await tx.lead.findUnique({ where: { id }, select: { id: true } });
      if (!lead) throw new NotFoundException('Lead not found');
      await unlinkLeadPerson(tx, id, contactId);
    });
    return { removed: true };
  }

  /**
   * The people on this card, for "View people" on the board.
   * Readable with Pipeline access alone, so pipeline users don't need the Contacts area.
   */
  @Get(':id/contacts')
  async contacts(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      select: { organization: true, clientId: true, primaryContactId: true, client: { select: { name: true } } },
    });
    if (!lead) throw new NotFoundException('Lead not found');
    if (!lead.clientId) {
      const rows = await listLeadPeople(this.prisma, id);
      const contacts = rows.map((c) => {
        const primaryEmail = c.emails.find((e) => e.isPrimary) ?? c.emails[0];
        return {
          id: c.id,
          name: [c.firstName, c.lastName].filter(Boolean).join(' '),
          role: c.title ?? null,
          email: primaryEmail?.email ?? null,
          phone: c.phone,
          avatarUrl: toPublicAssetUrl(c.avatarUrl),
          isActive: c.isActive,
          isLeadContact: c.id === lead.primaryContactId,
        };
      }).sort((a, b) => Number(b.isLeadContact) - Number(a.isLeadContact) || a.name.localeCompare(b.name));
      return { accountName: lead.organization, contacts };
    }
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

  /** Another card on the target pipeline — same organization / tracker link, not a new Client. */
  @Action('create')
  @Post(':id/copy')
  async copy(@Param('id') id: string, @Body() dto: CopyLeadDto) {
    const newId = await this.prisma.$transaction((tx) =>
      copyLeadCard(tx, id, dto.pipelineId, dto.stageId),
    );
    const lead = await this.prisma.lead.findUniqueOrThrow({ where: { id: newId }, include: linkInclude });
    return toLeadView(lead);
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateLeadDto) {
    const actor = req.user as UserContext;
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lead not found');
    const prevStageId = existing.stageId;
    const lead = await this.prisma.$transaction(async (tx) => {
      const lane = await requestedLane(tx, dto, false);
      let primaryContactPatch: { primaryContactId?: string | null; primaryContact?: string } = {};
      if (dto.primaryContactId !== undefined) {
        if (dto.primaryContactId) {
          await linkLeadPerson(tx, id, dto.primaryContactId);
          primaryContactPatch = {
            primaryContactId: dto.primaryContactId,
            primaryContact: await contactDisplayName(tx, dto.primaryContactId),
          };
        } else {
          primaryContactPatch = { primaryContactId: null };
        }
      }
      let warmPatch: { warmConnectionContactId?: string | null; warmConnection?: string | null } = {};
      if (dto.warmConnectionContactId !== undefined) {
        if (dto.warmConnectionContactId) {
          warmPatch = {
            warmConnectionContactId: dto.warmConnectionContactId,
            warmConnection: await contactDisplayName(tx, dto.warmConnectionContactId),
          };
        } else {
          warmPatch = { warmConnectionContactId: null, warmConnection: null };
        }
      }
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
          ...primaryContactPatch,
          ...warmPatch,
          ...(dto.category !== undefined && { category: dto.category }),
          ...(dto.serviceInterests !== undefined && { serviceInterests: dto.serviceInterests }),
          ...(dto.nextAction !== undefined && { nextAction: dto.nextAction }),
          ...(dto.nextActionDate !== undefined && { nextActionDate: dto.nextActionDate ? new Date(dto.nextActionDate) : null }),
          ...(dto.lastContactDate !== undefined && { lastContactDate: dto.lastContactDate ? new Date(dto.lastContactDate) : null }),
          ...(dto.clientId !== undefined && { clientId: dto.clientId || null }),
        },
      });
      const updatedLead = await tx.lead.findUniqueOrThrow({ where: { id }, select: { clientId: true } });
      await applyLeadEditsToLinks(tx, { id, clientId: updatedLead.clientId }, existing.organization, dto);
      return tx.lead.findUniqueOrThrow({ where: { id }, include: linkInclude });
    });
    if (dto.stageId !== undefined && lead.stageId && lead.stageId !== prevStageId) {
      const [pipelineName, fromLane, toLane] = await Promise.all([
        this.pipelineTrackerNotify.pipelineName(lead.pipelineId),
        this.pipelineTrackerNotify.laneName(prevStageId),
        this.pipelineTrackerNotify.laneName(lead.stageId),
      ]);
      if (existing.invoiceId) {
        const invoice = await this.prisma.invoice.findUnique({
          where: { id: existing.invoiceId },
          select: { id: true, displayNumber: true },
        });
        if (invoice) {
          await this.pipelineTrackerNotify.notifyInvoiceMoved(actor, invoice, pipelineName, fromLane, toLane);
        }
      } else if (existing.trackedClientId) {
        const client = await this.prisma.client.findUnique({
          where: { id: existing.trackedClientId },
          select: { id: true, name: true },
        });
        if (client) {
          await this.pipelineTrackerNotify.notifyClientMoved(actor, client, pipelineName, fromLane, toLane);
        }
      } else if (existing.projectId) {
        const project = await this.prisma.project.findUnique({
          where: { id: existing.projectId },
          select: { id: true, name: true },
        });
        if (project) {
          await this.pipelineTrackerNotify.notifyProjectMoved(actor, project, pipelineName, fromLane, toLane);
        }
      }
    }
    return toLeadView(lead);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const existing = await this.prisma.lead.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Lead not found');
    await this.prisma.lead.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Make the lead's organization a Client and take the card off the board (history kept):
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
    if (code) {
      const taken = await this.prisma.client.findFirst({ where: { code }, select: { id: true } });
      if (taken && taken.id !== lead.clientId) {
        throw new ConflictException(`Client code "${code}" is already in use`);
      }
    }
    const client = await this.prisma.$transaction(async (tx) => {
      const clientId = await promoteLeadToOrganization(tx, id, { journey: 'CLIENT', code });
      await tx.lead.update({ where: { id }, data: { archivedAt: lead.archivedAt ?? new Date() } });
      return tx.client.findUniqueOrThrow({ where: { id: clientId } });
    });
    await this.storageFolders.ensureClientFolders(client.id);
    return client;
  }

  /** Add the card's organization as a Partner (Other + Partner tag) and remove the card from the board. */
  @Action('edit')
  @Post(':id/promote-partner')
  async promotePartner(@Param('id') id: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException('Lead not found');
    const client = await this.prisma.$transaction(async (tx) => {
      const clientId = await promoteLeadToOrganization(tx, id, { journey: 'NONE', tags: ['Partner'] });
      await tx.lead.update({ where: { id }, data: { archivedAt: lead.archivedAt ?? new Date() } });
      return tx.client.findUniqueOrThrow({ where: { id: clientId } });
    });
    return client;
  }
}
