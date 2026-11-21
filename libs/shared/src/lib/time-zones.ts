/** Time zones a tenant or booking type can pick. Values are IANA names. */
export const TIME_ZONE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Pacific', value: 'America/Los_Angeles' },
  { label: 'Mountain', value: 'America/Denver' },
  { label: 'Arizona (no daylight saving)', value: 'America/Phoenix' },
  { label: 'Central', value: 'America/Chicago' },
  { label: 'Eastern', value: 'America/New_York' },
  { label: 'Alaska', value: 'America/Anchorage' },
  { label: 'Hawaii', value: 'Pacific/Honolulu' },
];

/** Used when a tenant hasn't picked a time zone. */
export const DEFAULT_TIME_ZONE = 'America/Los_Angeles';

export function isKnownTimeZone(value: string | null | undefined): value is string {
  return !!value && TIME_ZONE_OPTIONS.some((o) => o.value === value);
}
