import { describe, expect, it } from 'vitest';
import { aliasCandidates, normalizeEmail, splitName } from './email-address.util';

describe('normalizeEmail', () => {
  it('lowercases, trims and strips brackets', () => {
    expect(normalizeEmail('  <Sally@FamilyClient.test> ')).toBe('sally@familyclient.test');
  });
  it('rejects non-addresses', () => {
    expect(normalizeEmail('not an email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
    expect(normalizeEmail(null)).toBeNull();
  });
});

describe('splitName', () => {
  it('uses the display name when present', () => {
    expect(splitName('Sally Marlow', 'sally@x.test')).toEqual({ firstName: 'Sally', lastName: 'Marlow' });
    expect(splitName('"Cher"', 'c@x.test')).toEqual({ firstName: 'Cher' });
  });
  it('falls back to the address local part', () => {
    expect(splitName(undefined, 'sally.marlow@x.test')).toEqual({ firstName: 'Sally', lastName: 'Marlow' });
    expect(splitName('sally@x.test', 'sally@x.test')).toEqual({ firstName: 'Sally' });
  });
});

describe('aliasCandidates', () => {
  it('returns each distinct local part in order, lowercased', () => {
    expect(aliasCandidates(['TPN@in.example.test', 'other@x.test', 'tpn@in.example.test'])).toEqual(['tpn', 'other']);
  });
  it('ignores values that are not addresses', () => {
    expect(aliasCandidates(['not-an-email', ''])).toEqual([]);
  });
});
