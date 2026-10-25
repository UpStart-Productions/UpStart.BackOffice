import { BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { PasswordResetService } from './password-reset.service';

const EMAIL = 'bryn@example.org';
const hash = (code: string) => createHash('sha256').update(`${EMAIL}:${code}`).digest('hex');

function setup(opts: { user?: boolean; latest?: { createdAt: Date } | null; reset?: Record<string, unknown> | null } = {}) {
  const prisma = {
    user: { findFirst: vi.fn().mockResolvedValue(opts.user === false ? null : { firstName: 'Bryn' }) },
    passwordReset: {
      findFirst: vi.fn().mockImplementation(async (args: { select?: unknown }) => (args.select ? (opts.latest ?? null) : (opts.reset ?? null))),
      updateMany: vi.fn().mockResolvedValue({}),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const cognito = { setPermanentPassword: vi.fn().mockResolvedValue(undefined) };
  const mail = { sendRaw: vi.fn().mockResolvedValue({ sent: true }) };
  const svc = new PasswordResetService(prisma as never, cognito as never, mail as never);
  return { svc, prisma, cognito, mail };
}

describe('PasswordResetService (code emailed by the API, never by Cognito)', () => {
  it('emails a code through the app mailer and stores only a hash', async () => {
    const { svc, prisma, mail } = setup();
    await svc.request(' Bryn@Example.org ');
    expect(mail.sendRaw).toHaveBeenCalledOnce();
    const created = prisma.passwordReset.create.mock.calls[0][0].data;
    expect(created.email).toBe(EMAIL);
    const sentCode = /(\d{6})/.exec(mail.sendRaw.mock.calls[0][0].html)![1];
    expect(created.codeHash).toBe(hash(sentCode));
    expect(created.codeHash).not.toContain(sentCode);
  });

  it('does nothing, and says nothing, for an unknown email', async () => {
    const { svc, mail, prisma } = setup({ user: false });
    await expect(svc.request(EMAIL)).resolves.toBeUndefined();
    expect(mail.sendRaw).not.toHaveBeenCalled();
    expect(prisma.passwordReset.create).not.toHaveBeenCalled();
  });

  it('does not send again within the cooldown', async () => {
    const { svc, mail } = setup({ latest: { createdAt: new Date() } });
    await svc.request(EMAIL);
    expect(mail.sendRaw).not.toHaveBeenCalled();
  });

  it('sets the password with the right code, once', async () => {
    const reset = { id: 'r1', codeHash: hash('123456'), attempts: 0 };
    const { svc, cognito, prisma } = setup({ reset });
    await svc.confirm(EMAIL, '123456', 'new-password-1');
    expect(cognito.setPermanentPassword).toHaveBeenCalledWith(EMAIL, 'new-password-1');
    expect(prisma.passwordReset.update).toHaveBeenCalledWith(expect.objectContaining({ data: { usedAt: expect.any(Date) } }));
  });

  it('counts a wrong code and does not change the password', async () => {
    const reset = { id: 'r1', codeHash: hash('123456'), attempts: 0 };
    const { svc, cognito, prisma } = setup({ reset });
    await expect(svc.confirm(EMAIL, '000000', 'new-password-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(cognito.setPermanentPassword).not.toHaveBeenCalled();
    expect(prisma.passwordReset.update).toHaveBeenCalledWith(expect.objectContaining({ data: { attempts: { increment: 1 } } }));
  });

  it('locks a code after too many wrong tries, even if the next one is right', async () => {
    const reset = { id: 'r1', codeHash: hash('123456'), attempts: 5 };
    const { svc, cognito } = setup({ reset });
    await expect(svc.confirm(EMAIL, '123456', 'new-password-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(cognito.setPermanentPassword).not.toHaveBeenCalled();
  });

  it('rejects when there is no live code', async () => {
    const { svc } = setup({ reset: null });
    await expect(svc.confirm(EMAIL, '123456', 'new-password-1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
