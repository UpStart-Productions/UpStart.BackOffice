export function inviteToast(email: string, r: { emailed: boolean; link?: string }) {
  return r.emailed
    ? { severity: 'success' as const, summary: 'Invitation sent', detail: `Welcome email sent to ${email}.`, life: 8000 }
    : {
        severity: 'warn' as const,
        summary: 'Email not sent',
        detail: r.link ? `Email isn't configured here. Invite link: ${r.link}` : 'Email could not be sent. Check mail settings.',
        life: 30000,
      };
}
