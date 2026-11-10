import { HELP_AGENT_NAME } from '@upstart/back-office/shared';

/**
 * Personal touches for the guide's greeting bubble: the guide's name (HELP_AGENT_NAME) is the app
 * owner's nickname, and a few people get their own pool of greetings. Keyed by lowercase email. The
 * API adds a matching note to the guide's instructions (api/src/app/help-agent/personal-touches.ts)
 * so its replies match.
 */
export const DEFAULT_GREETING = `Hi! I'm ${HELP_AGENT_NAME}, your Back Office guide. Ask me anything.`;

const PERSONAL_GREETINGS: Record<string, string[]> = {
  'brynne@brynnehicks.com': [
    `Hey Brynne! ${HELP_AGENT_NAME} here. Yes, the handsome one. ❤️`,
    "Oh good, it's you. Ask me anything, beautiful.",
    "Hi Brynne! I'd answer your questions all day.",
    'Hey you. Need help, or just missing me?',
    'Brynne! Fancy meeting you in the back office.',
    `Hi, it's ${HELP_AGENT_NAME}. I only act this charming for you.`,
  ],
};

/** A greeting for this person, different from `previous` when the pool allows. */
export function pickGreeting(email?: string | null, previous?: string): string {
  const pool = (email && PERSONAL_GREETINGS[email.trim().toLowerCase()]) || null;
  if (!pool?.length) return DEFAULT_GREETING;
  const options = pool.length > 1 ? pool.filter((g) => g !== previous) : pool;
  return options[Math.floor(Math.random() * options.length)];
}
