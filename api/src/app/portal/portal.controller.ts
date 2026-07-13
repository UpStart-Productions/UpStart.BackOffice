import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Prisma } from '@prisma/client';
import { InvoiceStatus } from '@prisma/client';
import { Request, Response } from 'express';
import { PdfService } from '../invoices/pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { invoicePdfKey } from '../storage/storage-keys.util';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.interface';
import { CreatePortalSessionDto } from './dto/create-portal-session.dto';
import { toPortalArtifact } from './portal-artifact.util';
import { toPortalClientView } from './portal-client.util';
import { invoicesForProject, toPortalInvoice } from './portal-invoice.util';
import {
  clearPortalSessionCookie,
  PortalSessionGuard,
  setPortalSessionCookie,
} from './portal-session.guard';
import { PortalSessionService } from './portal-session.service';

const PORTAL_INVOICE_STATUSES: InvoiceStatus[] = ['SENT', 'PAID'];

const invoiceInclude = {
  client: true,
  lineItems: {
    include: { project: { select: { id: true, name: true } } },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.InvoiceInclude;

type InvoiceWithDetails = Prisma.InvoiceGetPayload<{ include: typeof invoiceInclude }>;

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
};

/**
 * Public client portal — magic-link access, no Cognito login.
 * Exchange a portal token for a session, then call other /portal/* routes.
 */
@ApiTags('portal')
@Controller('portal')
export class PortalController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portalSession: PortalSessionService,
    private readonly pdf: PdfService,
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
  ) {}

  /** Exchange magic-link token for a session (HttpOnly cookie + bearer token in body). */
  @Post('session')
  async createSession(
    @Body() dto: CreatePortalSessionDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = dto.token.trim();
    const client = await this.prisma.client.findFirst({
      where: { portalToken: token },
    });

    if (!client) {
      throw new UnauthorizedException('Invalid or disabled portal link');
    }
    if (!client.isActive) {
      throw new UnauthorizedException('This client portal is not available');
    }
    if (!client.portalEnabled) {
      throw new UnauthorizedException('This portal link has been disabled');
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

  @Get('projects')
  @UseGuards(PortalSessionGuard)
  async projects(@Req() req: Request) {
    const clientId = req.portalClientId!;
    await this.requirePortalClient(clientId);

    const [projects, invoiceRows] = await Promise.all([
      this.prisma.project.findMany({
        where: { clientId, isActive: true },
        orderBy: { name: 'asc' },
        include: {
          artifacts: { orderBy: { createdAt: 'desc' } },
        },
      }),
      this.prisma.invoice.findMany({
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
              projectId: true,
              project: { select: { id: true, name: true } },
            },
          },
        },
      }),
    ]);

    const invoices = invoiceRows.map((inv) => toPortalInvoice(inv));

    return {
      projects: projects.map((project) => ({
        id: project.id,
        name: project.name,
        description: project.description,
        isBillable: project.isBillable,
        artifacts: project.artifacts.map(toPortalArtifact),
        invoices: invoicesForProject(project.id, invoices),
      })),
    };
  }

  @Get('invoices/:id/pdf')
  @UseGuards(PortalSessionGuard)
  async downloadInvoicePdf(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const clientId = req.portalClientId!;
    await this.requirePortalClient(clientId);

    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id,
        clientId,
        status: { in: PORTAL_INVOICE_STATUSES },
      },
      include: invoiceInclude,
    });
    if (!invoice) {
      throw new NotFoundException('Invoice not found');
    }

    const pdfBuffer = await this.readOrGenerateInvoicePdf(invoice);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoice.displayNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  }

  @Get('artifacts/:id/file')
  @UseGuards(PortalSessionGuard)
  async downloadArtifactFile(
    @Req() req: Request,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const clientId = req.portalClientId!;
    await this.requirePortalClient(clientId);

    const artifact = await this.prisma.artifact.findFirst({
      where: {
        id,
        type: 'FILE',
        project: { clientId, isActive: true },
      },
    });
    if (!artifact?.fileUrl) {
      throw new NotFoundException('File not found');
    }

    const exists = await this.storage.exists(artifact.fileUrl);
    if (!exists) {
      throw new NotFoundException('File not found');
    }

    const buffer = await this.storage.read(artifact.fileUrl);
    const ext = artifact.fileUrl.slice(artifact.fileUrl.lastIndexOf('.')).toLowerCase();
    const contentType = artifact.mimeType ?? MIME_BY_EXT[ext] ?? 'application/octet-stream';

    res.set({
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${artifact.title.replace(/"/g, '')}"`,
      'Content-Length': buffer.length,
    });
    res.send(buffer);
  }

  private async readOrGenerateInvoicePdf(invoice: InvoiceWithDetails): Promise<Buffer> {
    const key = invoicePdfKey(invoice.clientId, invoice.displayNumber);
    if (await this.storage.exists(key)) {
      return this.storage.read(key);
    }

    const fromName = process.env.MAIL_FROM_NAME || 'UpStart Back Office';
    const pdfBuffer = await this.pdf.generateInvoicePdf(invoice, fromName);
    await this.storage.upload({
      buffer: pdfBuffer,
      key,
      mimeType: 'application/pdf',
    });
    return pdfBuffer;
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
