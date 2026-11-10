/**
 * The in-app Back Office guide (Help Agent). Shared by the admin widget and the API.
 */

/** Display name of the guide. Change it here: the widget, greetings and the API prompt all read it. */
export const HELP_AGENT_NAME = 'JD';

/** How many earlier chat messages go with each question, so follow-ups make sense. */
export const HELP_AGENT_HISTORY_LIMIT = 10;

/** Longest earlier message sent as history (characters). Longer ones are clipped by the widget. */
export const HELP_AGENT_HISTORY_TEXT_MAX = 4000;

/**
 * Where the person is when they ask. Labels and route patterns only, never record data
 * (no IDs, names, emails or field values).
 */
export interface HelpAgentPageContext {
  /** Route pattern with params left as params, e.g. "organizations/:id". */
  route: string;
  /** Help drawer article title for that route, e.g. "Organization". */
  title: string;
}

/**
 * What the person pointed at or highlighted. Every text field must be a fixed UI label from
 * HELP_AGENT_UI_LABELS (import '@upstart/back-office/shared/help-labels'); icon and helpKey are code
 * identifiers. The API drops anything that is not on the list.
 */
export const HELP_AGENT_TARGET_KINDS = ['button', 'link', 'field', 'heading', 'tab', 'icon', 'text', 'area'] as const;
export type HelpAgentTargetKind = (typeof HELP_AGENT_TARGET_KINDS)[number];

export interface HelpAgentTarget {
  kind: HelpAgentTargetKind;
  /** Title of the panel or dialog it sits in, e.g. "People". */
  panel?: string;
  /** The control's own fixed label, e.g. "Add new person". */
  label?: string;
  /** Icon name without prefix, e.g. "trash" for pi-trash. */
  icon?: string;
  /** Help text key next to it, e.g. "lead.nextAction". */
  helpKey?: string;
  /** True when the person highlighted text that is not a known label (likely record data). It is never sent. */
  withheld?: boolean;
}

/** Same normalization as scripts/build-help-labels.mjs, so runtime text compares to the list. */
export function normalizeHelpLabel(text: string): string {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[\s:*…]+$/u, '')
    .toLowerCase();
}

export interface HelpAgentHistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface HelpAgentAskRequest {
  message: string;
  page?: HelpAgentPageContext;
  history?: HelpAgentHistoryMessage[];
  target?: HelpAgentTarget;
}
