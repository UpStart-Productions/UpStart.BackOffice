/** Fixed topic ids for "Contact Support" submissions from the help drawer (matches API validation). */
export const SUPPORT_FEEDBACK_TOPIC_IDS = [
  'bug',
  'question',
  'feature_request',
  'account_access',
  'other',
] as const;

export type SupportFeedbackTopicId = (typeof SUPPORT_FEEDBACK_TOPIC_IDS)[number];

export const SUPPORT_FEEDBACK_TOPIC_LABELS: Record<SupportFeedbackTopicId, string> = {
  bug: 'Something is broken',
  question: 'How do I …?',
  feature_request: 'Feature idea',
  account_access: 'Account or access',
  other: 'Other',
};

/** Browser details captured with a support request so we can reproduce what the user saw. */
export interface SupportClientEnvironment {
  href: string;
  language: string;
  languages: string[];
  timezone: string;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  platform: string;
  cookieEnabled?: boolean;
  devicePixelRatio?: number;
}

export interface SupportFeedbackSubmit {
  topicIds: SupportFeedbackTopicId[];
  message: string;
  clientEnvironment: SupportClientEnvironment;
}

/**
 * The guide's (JD's) "email support" tool. It never sends by itself: the person sees the message on a card and
 * clicks Send, which posts it like Contact Support (support@heyupstart.com, replies go to them).
 */
export const HELP_AGENT_SUPPORT_TOOL = {
  name: 'contact_support',
  description:
    'Drafts a message to UpStart support (the people who make this app) for the person to review and send. Use it when ' +
    'they ask to contact or email support, report a bug, or when you cannot solve their problem and support could. ' +
    'Write the message in first person as them: what they were doing, what happened, and what they expected. Use only ' +
    'what they told you; never invent details. Nothing is sent until they click Send on the card.',
  inputSchema: {
    type: 'object',
    required: ['topic', 'message'],
    properties: {
      topic: { type: 'string', enum: Object.values(SUPPORT_FEEDBACK_TOPIC_LABELS) },
      message: { type: 'string', description: 'The message, in first person, a few short sentences.' },
    },
  },
} as const;

/** Card title and button for the support tool. */
export const HELP_AGENT_SUPPORT_CARD = { title: 'Email UpStart support', confirm: 'Send' } as const;

/** Topic label (as the guide sends it) back to its id; unknown → other. */
export function supportTopicIdFromLabel(label: unknown): SupportFeedbackTopicId {
  const hit = (Object.entries(SUPPORT_FEEDBACK_TOPIC_LABELS) as [SupportFeedbackTopicId, string][]).find(([, l]) => l === label);
  return hit ? hit[0] : 'other';
}
