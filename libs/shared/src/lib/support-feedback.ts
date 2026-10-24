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
