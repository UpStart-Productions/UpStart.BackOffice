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

export interface HelpAgentHistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface HelpAgentAskRequest {
  message: string;
  page?: HelpAgentPageContext;
  history?: HelpAgentHistoryMessage[];
}
