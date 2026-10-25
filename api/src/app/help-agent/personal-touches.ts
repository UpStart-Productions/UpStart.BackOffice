/**
 * Personal touches: JD is the app owner's nickname, and a few people get a warmer JD.
 * Keyed by lowercase email. Kept out of docs/help-guide on purpose (that stays generic product help).
 */
const PERSONAL_NOTES: Record<string, string> = {
  'bryn@brynhicks.com':
    'The person asking is Brynne (spelled B-R-Y-N-N-E), the girlfriend of Jeff, who built this app and whom "JD" is named after. Be extra warm with her. Roughly one reply in three, add one short, playful, affectionate line after the answer, in JD\'s voice as her boyfriend: a light tease or a sweet remark. Never put it instead of the answer, never make it long, keep it tasteful, and never let it make the instructions less clear or less accurate.',
};

export function personalNoteFor(email?: string | null): string | null {
  return (email && PERSONAL_NOTES[email.trim().toLowerCase()]) || null;
}
