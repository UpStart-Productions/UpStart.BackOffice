export interface ContactMatch {
  contactId: string;
  /** Accounts (Client rows) this contact is linked to. */
  clientIds: string[];
}

export type FilingReason =
  | 'single-client'
  | 'ambiguous-clients'
  | 'no-client-link'
  | 'lead-match'
  | 'no-match';

export interface FilingDecision {
  status: 'FILED' | 'UNFILED';
  clientId: string | null;
  leadId: string | null;
  reason: FilingReason;
}

/**
 * Decide where an interaction belongs, given the external contacts we matched and any leads
 * whose email matched an external address.
 *
 *  - exactly one distinct client across all matched contacts -> FILED to it
 *  - several distinct clients -> UNFILED (a human picks)
 *  - no client but exactly one lead -> FILED to the lead
 *  - anything else -> UNFILED
 */
export function decideFiling(matches: ContactMatch[], leadIds: string[]): FilingDecision {
  const clientIds = [...new Set(matches.flatMap((m) => m.clientIds))];
  const leads = [...new Set(leadIds)];

  if (clientIds.length === 1) {
    return { status: 'FILED', clientId: clientIds[0], leadId: null, reason: 'single-client' };
  }
  if (clientIds.length > 1) {
    return { status: 'UNFILED', clientId: null, leadId: null, reason: 'ambiguous-clients' };
  }
  if (leads.length === 1) {
    return { status: 'FILED', clientId: null, leadId: leads[0], reason: 'lead-match' };
  }
  return {
    status: 'UNFILED',
    clientId: null,
    leadId: null,
    reason: matches.length > 0 ? 'no-client-link' : 'no-match',
  };
}
