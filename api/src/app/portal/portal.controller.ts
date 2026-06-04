import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InvoiceStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';
import { toPortalClientView } from './portal-client.util';
import {
  clearPortalSessionCookie,
  PortalSessionGuard,
  setPortalSessionCookie,
} from './portal-session.guard';
import { PortalSessionService } from './portal-session.service';

const PORTAL_INVOICE_STATUSES: InvoiceStatus[] = ['SENT', 'PAID'];

/**
 * Public client portal for heyupstart.com — magic-link access, no Cognito login.
 * Exchange a portal token for a session, then call other /portal/* routes.
 */
@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portalSession: PortalSessionService,
  ) {}

  /** Exchange magic-link token for a session (HttpOnly cookie + bearer token in body). */
  @Post('session')
  async createSession(
    @Body() dto: CreatePortalSessionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const client = await this.prisma.client.findFirst({
      where: {
        portalToken: dto.token.trim(),
        portalEnabled: true,
        isActive: true,
      },
    });

    if (!client) {
      throw new UnauthorizedException('Invalid or disabled portal link');
    }

    const sessionToken = this.portalSession.sign(client.id);
    setPortalSessionCookie(res, sessionToken, this.portalSession);

    return {
      client: toPortalClientView(client),
      sessionToken,
    };
  }

  @Delete('session')
  clearSession(@Res({ passthrough: true }) res: Response) {
    clearPortalSessionCookie(res, this.portalSession);
    return { cleared: true };
  }

  @Get('me')
  @UseGuards(PortalSessionGuard)
  async me(@Req() req: Request) {
    const client = await this.requirePortalClient(req.portalClientId!);
    return { client: toPortalClientView(client) };
  }

  @Get('invoices')
  @UseGuards(PortalSessionGuard)
  async invoices(@Req() req: Request) {
    const clientId = req.portalClientId!;
    await this.requirePortalClient(clientId);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        clientId,
        status: { in: PORTAL_INVOICE_STATUSES },
      },
      orderBy: { issueDate: 'desc' },
      select: {
        id: true,
        displayNumber: true,
        status: true,
        issueDate: true,
        dueDate: true,
        total: true,
        paidAt: true,
        lineItems: {
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            description: true,
            quantity: true,
            unitPrice: true,
            amount: true,
            project: { select: { id: true, name: true } },
          },
        },
      },
    });

    return {
      invoices: invoices.map((inv) => ({
        ...inv,
        total: Number(inv.total),
        lineItems: inv.lineItems.map((li) => ({
          ...li,
          quantity: Number(li.quantity),
          unitPrice: Number(li.unitPrice),
          amount: Number(li.amount),
        })),
      })),
    };
  }

  @Get('projects')
  @UseGuards(PortalSessionGuard)
  async projects(@Req() req: Request) {
    const clientId = req.portalClientId!;
    await this.requirePortalClient(clientId);

    const projects = await this.prisma.project.findMany({
      where: { clientId, isActive: true },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        description: true,
        isBillable: true,
      },
    });

    return { projects };
  }

  private async requirePortalClient(clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: {
        id: clientId,
        portalEnabled: true,
        isActive: true,
      },
    });
    if (!client) {
      throw new NotFoundException('Client portal access is not available');
    }
    return client;
  }
}
