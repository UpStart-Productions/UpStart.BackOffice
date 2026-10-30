import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { FormScores } from '@upstart/back-office/shared';

export const PUBLIC_LINK_INCLUDE = { form: { include: { publishedVersion: true } }, client: { select: { name: true } } } as const;
export type PublicLink = Prisma.FormLinkGetPayload<{ include: typeof PUBLIC_LINK_INCLUDE }>;

/** A public submission after the engine checked it: values valid for the form, required fields filled in. */
export type PublicSubmission = {
  values: Record<string, unknown>;
  name: string | null;
  email: string | null;
  phone: string | null;
  organization: string | null;
  /** The published version answered (forms with versions). */
  versionId: string | null;
  /** Scored forms: the computed scores. */
  scores: FormScores | null;
};

/** What a destination tells the respondent after saving. */
export type SubmitOutcome = { message?: string; resultToken?: string } | void;

/**
 * What a module does with its forms' public submissions. The engine handles links, verification and
 * checking answers; the destination decides where they go (Care: a pending intake, or an organization's copy).
 */
export interface FormDestination {
  /** The module that owns the forms (Form.module). */
  module: string;
  /** Tenant module that must be on for the links to work; null when the forms are core. */
  tenantModule: string | null;
  /** Links only work once the form is published (they serve the published version). Otherwise they serve the live fields. */
  requiresPublished: boolean;
  /** Who-you-are questions on new-response links, beyond name and email. */
  ask(link: PublicLink): { organization: boolean; phone: boolean };
  /** Answers a CLIENT link starts from (and merges into). */
  storedValues(link: PublicLink): Promise<Record<string, unknown>>;
  /** Save the submission. */
  submit(link: PublicLink, submission: PublicSubmission): Promise<SubmitOutcome>;
}

/** Modules register their destination when they start. */
@Injectable()
export class FormDestinations {
  private readonly byModule = new Map<string, FormDestination>();

  register(destination: FormDestination) {
    this.byModule.set(destination.module, destination);
  }

  get(module: string): FormDestination | null {
    return this.byModule.get(module) ?? null;
  }
}
