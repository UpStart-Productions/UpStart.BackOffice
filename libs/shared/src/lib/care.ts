/** Care module: tenant-defined forms (Intake form, Care profile) filled in per client. */

export type CareFormKind = 'INTAKE' | 'CARE_PROFILE';
export const CARE_FORM_KINDS: CareFormKind[] = ['INTAKE', 'CARE_PROFILE'];
export const CARE_FORM_DEFAULT_NAMES: Record<CareFormKind, string> = {
  INTAKE: 'Intake form',
  CARE_PROFILE: 'Care profile',
};

export type FormFieldType = 'TEXT' | 'LONG_TEXT' | 'NUMBER' | 'DATE' | 'SINGLE_SELECT' | 'MULTI_SELECT' | 'CHECKBOX';
export const FORM_FIELD_TYPES: FormFieldType[] = ['TEXT', 'LONG_TEXT', 'NUMBER', 'DATE', 'SINGLE_SELECT', 'MULTI_SELECT', 'CHECKBOX'];
export const FORM_FIELD_TYPE_LABELS: Record<FormFieldType, string> = {
  TEXT: 'Text',
  LONG_TEXT: 'Long text',
  NUMBER: 'Number',
  DATE: 'Date',
  SINGLE_SELECT: 'Single-select',
  MULTI_SELECT: 'Multi-select',
  CHECKBOX: 'Checkbox',
};
export function isSelectFieldType(type: FormFieldType): boolean {
  return type === 'SINGLE_SELECT' || type === 'MULTI_SELECT';
}

export type FormFieldOption = { id: string; label: string };
export type FormFieldDto = { id: string; name: string; type: FormFieldType; options: FormFieldOption[]; required: boolean };
export type FormSectionDto = { id: string; name: string; fields: FormFieldDto[] };

/** Per role: what people with that role can do with a form. Admins can always edit. */
export type CareFormAccessLevel = 'read' | 'edit';
export type CareFormAccess = Record<string, CareFormAccessLevel>;

export type CareFormDto = {
  id: string;
  kind: CareFormKind;
  name: string;
  description: string | null;
  access: CareFormAccess;
  sections: (FormSectionDto & { fields: (FormFieldDto & { valueCount?: number })[] })[];
  /** What the signed-in user can do with this form. */
  myAccess: CareFormAccessLevel | null;
};

export type CareRecordStatus = 'PENDING' | 'ACTIVE';

export type CareRecordListItemDto = {
  id: string;
  formId: string;
  kind: CareFormKind;
  status: CareRecordStatus;
  clientId: string | null;
  clientName: string | null;
  submitterName: string | null;
  submitterEmail: string | null;
  updatedAt: string;
  updatedByName: string | null;
};

export type CareRecordDto = CareRecordListItemDto & {
  formName: string;
  values: Record<string, unknown>;
  sections: FormSectionDto[];
  submitterPhone: string | null;
  publicUpdatedAt: string | null;
  publicUpdatedBy: string | null;
  myAccess: CareFormAccessLevel;
  attribution?: import('./types').RecordAttributionDto;
};

export type CareLinkKind = 'NEW_INTAKE' | 'CLIENT_UPDATE';
/** How someone opening a public link proves who they are. */
export type CareLinkVerify = 'NONE' | 'PASSCODE' | 'EMAIL_CODE';
export const CARE_LINK_VERIFY_LABELS: Record<CareLinkVerify, string> = {
  NONE: 'No check',
  PASSCODE: 'Passcode',
  EMAIL_CODE: 'Emailed code',
};

export type CareLinkDto = {
  id: string;
  formId: string;
  kind: CareLinkKind;
  label: string | null;
  clientId: string | null;
  clientName: string | null;
  verify: CareLinkVerify;
  email: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  url: string;
};

/** What the public page gets before anyone has proven who they are. */
export type CarePublicLinkDto = {
  formName: string;
  description: string | null;
  organizationName: string;
  kind: CareLinkKind;
  clientName: string | null;
  verify: CareLinkVerify;
  /** EMAIL_CODE on a client link: where the code goes, partly hidden. */
  maskedEmail: string | null;
};

export type CarePublicFormDto = {
  sections: FormSectionDto[];
  values: Record<string, unknown>;
  /** Email proven with a code (new intake); shown read-only on the form. */
  verifiedEmail: string | null;
};
