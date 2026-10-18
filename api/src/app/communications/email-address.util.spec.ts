import { describe, expect, it } from 'vitest';
import { extractAliasFromRecipients, normalizeEmail, splitName } from './email-address.util';

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

describe('extractAliasFromRecipients', () => {
  it('returns the local part for the configured domain', () => {
    expect(extractAliasFromRecipients(['TPN@in.example.test'], 'in.example.test')).toBe('tpn');
  });
  it('skips other domains when a domain is configured', () => {
    expect(extractAliasFromRecipients(['a@other.test', 'tpn@in.example.test'], 'in.example.test')).toBe('tpn');
    expect(extractAliasFromRecipients(['a@other.test'], 'in.example.test')).toBeNull();
  });
  it('accepts any domain when none is configured (dev)', () => {
    expect(extractAliasFromRecipients(['tpn@anything.test'])).toBe('tpn');
  });
});
