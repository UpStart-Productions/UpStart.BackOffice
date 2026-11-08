import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { LogInteractionDto } from './communications.dto';

const errorsFor = (body: object) => validateSync(plainToInstance(LogInteractionDto, body)).map((e) => e.property);

describe('LogInteractionDto', () => {
  it('accepts a logged email, call, meeting and note', () => {
    for (const type of ['EMAIL', 'CALL', 'MEETING', 'NOTE']) {
      expect(errorsFor({ type, clientId: 'c1', subject: 'Hi' })).toEqual([]);
    }
  });

  it('rejects other types', () => {
    expect(errorsFor({ type: 'SMS', clientId: 'c1', subject: 'Hi' })).toEqual(['type']);
  });
});
