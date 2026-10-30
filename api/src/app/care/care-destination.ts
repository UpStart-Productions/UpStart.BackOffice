import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CARE_FORM_MODULE } from '@upstart/back-office/shared';
import { FormDestinations, type FormDestination, type PublicLink, type PublicSubmission } from '../forms/form-destinations';
import { liveValues } from '../forms/form-fields.util';
import { FormStructureService } from '../forms/form-structure.service';
import { PrismaService } from '../prisma/prisma.service';
import { CareNotifyService } from './care-notify.service';

/**
 * Where Care's public submissions go. New-intake links create a pending intake for staff to review;
 * organization links update that organization's living copy of the form directly.
 */
@Injectable()
export class CareFormDestination implements FormDestination, OnModuleInit {
  readonly module = CARE_FORM_MODULE;
  readonly tenantModule = 'care';
  readonly requiresPublished = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly structure: FormStructureService,
    private readonly notify: CareNotifyService,
    private readonly destinations: FormDestinations,
  ) {}

  onModuleInit() {
    this.destinations.register(this);
  }

  /** Care asks for a phone number; the organization comes from staff when they accept an intake. */
  ask() {
    return { organization: false, phone: true };
  }

  async storedValues(link: PublicLink) {
    if (!link.clientId) return {};
    const record = await this.prisma.formResponse.findFirst({ where: { formId: link.formId, clientId: link.clientId }, select: { values: true } });
    return liveValues(await this.structure.fields(link.formId), record?.values);
  }

  async submit(link: PublicLink, sub: PublicSubmission) {
    const values = sub.values as Prisma.InputJsonValue;
    if (link.kind === 'NEW') {
      const record = await this.prisma.formResponse.create({
        data: {
          formId: link.formId, status: 'PENDING', values, living: true,
          submitterName: sub.name, submitterEmail: sub.email, submitterPhone: sub.phone,
          publicUpdatedAt: new Date(), publicUpdatedBy: sub.name,
        },
        select: { id: true },
      });
      await this.notify.publicSubmission({
        recordId: record.id, formId: link.formId, clientId: null,
        title: `New ${link.form.name}: ${sub.name}`,
        body: `${sub.name} (${sub.email}) sent ${link.form.name} through a public link. Review it under Care → Intake.`,
      });
      return;
    }

    // CLIENT: this organization's living copy.
    const clientId = link.clientId!;
    const existing = await this.prisma.formResponse.findFirst({ where: { formId: link.formId, clientId }, select: { id: true } });
    const who = sub.email ?? sub.name ?? 'Someone with the link';
    const data = { values, publicUpdatedAt: new Date(), publicUpdatedBy: who };
    const record = existing
      ? await this.prisma.formResponse.update({ where: { id: existing.id }, data, select: { id: true } })
      : await this.prisma.formResponse.create({ data: { formId: link.formId, clientId, living: true, ...data }, select: { id: true } });
    await this.notify.publicSubmission({
      recordId: record.id, formId: link.formId, clientId,
      title: `${link.form.name} updated: ${link.client?.name ?? ''}`.trim(),
      body: `${who} updated ${link.form.name} for ${link.client?.name ?? 'an organization'} through a link.`,
    });
  }
}
