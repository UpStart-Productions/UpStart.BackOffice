import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  normalizeFormSettings,
  type FormFieldDto,
  type FormResponseAnswerDto,
  type FormScores,
  type FormServiceResponseDto,
  type FormSnapshot,
} from '@upstart/back-office/shared';
import { ServiceKeyGuard } from '../auth/service-key.guard';
import { PrismaService } from '../prisma/prisma.service';
import { absolutePublicAssetUrl } from '../storage/asset-url.util';

/** How long after submitting a response can be read this way (the website emails right after submit). */
const READ_WINDOW_MS = 24 * 60 * 60 * 1000;

/** An answer as text, or null to leave it out (empty, files, sensitive numbers, repeating groups). */
function answerText(f: FormFieldDto, v: unknown): string | null {
  if (v === undefined || v === null || v === '') return null;
  const label = (id: unknown) => f.options.find((o) => o.id === id)?.label ?? String(id);
  switch (f.type) {
    case 'CONTENT':
    case 'FILE':
    case 'SSN':
    case 'GROUP':
      return null;
    case 'SINGLE_SELECT':
      return label(v);
    case 'MULTI_SELECT':
      return Array.isArray(v) && v.length ? v.map(label).join(', ') : null;
    case 'CHECKBOX':
      return v === true ? 'Yes' : v === false ? 'No' : String(v);
    default:
      return String(v);
  }
}

/**
 * Responses for services (e.g. the website's email sender): read with a service key (x-api-key), only in the
 * key's tenant and only within a day of submitting. The response id isn't a secret on its own.
 */
@ApiTags('forms')
@Controller('service/form-responses')
@UseGuards(ServiceKeyGuard)
export class FormResponsesServiceController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async response(@Param('id') id: string): Promise<FormServiceResponseDto> {
    const r = await this.prisma.formResponse.findUnique({ where: { id }, include: { form: true, version: true } });
    if (!r?.submittedAt || Date.now() - r.submittedAt.getTime() > READ_WINDOW_MS) throw new NotFoundException('Response not found');
    const snap = r.version?.snapshot as unknown as FormSnapshot | undefined;
    const values = (r.values ?? {}) as Record<string, unknown>;
    const answers: FormResponseAnswerDto[] = [];
    for (const s of snap?.sections ?? []) {
      for (const f of s.fields) {
        const value = answerText(f, values[f.id]);
        if (value !== null) answers.push({ fieldId: f.id, section: s.name, label: f.name, value });
      }
    }
    const scores = r.scores as unknown as FormScores | null;
    const band = scores?.bandId ? snap?.scoring?.bands.find((b) => b.id === scores.bandId) : null;
    const profile = await this.prisma.organizationProfile.findFirst({ select: { companyName: true } });
    const name = r.submitterName?.trim() ?? '';
    return {
      id: r.id,
      formId: r.formId,
      formName: snap?.name ?? r.form.name,
      organizationName: profile?.companyName?.trim() ?? '',
      submittedAt: r.submittedAt.toISOString(),
      submitter: {
        name,
        firstName: name.split(/\s+/)[0] ?? '',
        email: r.submitterEmail ?? '',
        phone: r.submitterPhone ?? '',
        organization: r.submitterOrganization ?? '',
      },
      answers,
      score: scores ? Math.round(scores.percent) : null,
      profile: band
        ? {
            label: band.label,
            description: band.description,
            nextSteps: band.nextSteps,
            assetUrl: absolutePublicAssetUrl(band.assetUrl) ?? '',
            assetLabel: band.assetLabel || 'Download your guide',
          }
        : null,
      groups: (scores?.groups ?? []).map((g) => ({ name: g.name, percent: Math.round(g.percent) })),
      resultToken: r.resultToken ?? '',
      thankYouHtml: normalizeFormSettings(r.form.settings).thankYou ?? '',
    };
  }
}
