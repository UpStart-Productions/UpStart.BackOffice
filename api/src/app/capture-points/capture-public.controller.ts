import {
  BadRequestException, Body, Controller, ForbiddenException, GoneException, HttpCode, HttpException, HttpStatus,
  NotFoundException, Param, Post, Req,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { clientIp, RateLimiter } from '../common/rate-limiter';
import { PrismaService } from '../prisma/prisma.service';
import { runUnscoped, runWithTenant } from '../tenancy/tenant-context';
import { captureToPipeline } from './capture.util';
import { PublicCaptureDto } from './capture-points.dto';

/** Under this many milliseconds on the form, a browser submission is treated as a bot (quietly dropped). */
const MIN_FORM_MS = 3000;

/**
 * Any form on any website can send people to a pipeline: POST /api/capture/:id from the browser, no key.
 * The capture point's id finds its tenant. Protections: the capture point's allowed websites (Origin), a hidden
 * honeypot field (`website`), time on the form (`t`), a per-visitor rate limit, and the capture point's on/off switch.
 * Servers (a Lambda) should use POST /api/leads/ingest with a service key instead.
 */
@ApiTags('capture')
@Controller('capture')
export class CapturePublicController {
  private readonly limiter = new RateLimiter(10, 60_000);

  constructor(private readonly prisma: PrismaService) {}

  @Post(':id')
  @HttpCode(HttpStatus.OK)
  async capture(@Req() req: Request, @Param('id') id: string, @Body() dto: PublicCaptureDto) {
    if (!this.limiter.allow(`${clientIp(req)}:${id}`)) {
      throw new HttpException('Too many submissions. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
    }
    // Bots: answer as if it worked so they don't learn anything.
    if (dto.website?.trim() || (typeof dto.t === 'number' && dto.t < MIN_FORM_MS)) return { ok: true };

    const found = await runUnscoped(() => this.prisma.capturePoint.findUnique({ where: { id }, select: { tenantId: true } }));
    if (!found) throw new NotFoundException('This form is not connected to Back Office.');

    return runWithTenant(found.tenantId, async () => {
      const cp = await this.prisma.capturePoint.findUnique({
        where: { id },
        select: { id: true, name: true, stageId: true, isActive: true, allowedOrigins: true, formId: true },
      });
      // A UBO form's capture point is fed by the form itself.
      if (!cp || cp.formId) throw new NotFoundException('This form is not connected to Back Office.');
      if (!cp.isActive) throw new GoneException("This form isn't taking submissions right now.");
      const origin = typeof req.headers.origin === 'string' ? req.headers.origin.toLowerCase() : null;
      if (cp.allowedOrigins.length && !(origin && cp.allowedOrigins.includes(origin))) {
        throw new ForbiddenException('This form is not allowed on this website.');
      }
      if (!dto.name?.trim() && !dto.email?.trim()) throw new BadRequestException('Enter your name or email.');

      const result = await this.prisma.$transaction((tx) =>
        captureToPipeline(tx, cp, {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          organization: dto.organization,
          message: dto.message,
          subject: dto.subject,
        }),
      );
      return { ok: true, duplicate: result.matched };
    });
  }
}
