import type { FormSubmissionStatus } from '@upstart/back-office/shared';

/** How a submission's status shows as a tag. */
export const SUBMISSION_STATUS_TAG: Record<FormSubmissionStatus, { label: string; severity: 'warn' | 'success' | 'secondary' }> = {
  PENDING: { label: 'Waiting for review', severity: 'warn' },
  ACTIVE: { label: 'Accepted', severity: 'success' },
  DISMISSED: { label: 'Dismissed', severity: 'secondary' },
};
