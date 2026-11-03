/** Preset nonprofit focus categories for pipeline cards (value stored on the lead). */
export const PIPELINE_CATEGORY_PRESETS: { label: string; value: string }[] = [
  { label: 'Recovery', value: 'RECOVERY' },
  { label: 'Family', value: 'FAMILY' },
  { label: 'Youth', value: 'YOUTH' },
  { label: 'Faith', value: 'FAITH' },
  { label: 'Health', value: 'HEALTH' },
  { label: 'Disability', value: 'DISABILITY' },
  { label: 'Education', value: 'EDUCATION' },
  { label: 'Jobs / Workforce', value: 'JOBS_WORKFORCE' },
  { label: 'Pets', value: 'PETS' },
  { label: 'Funding', value: 'FUNDING' },
  { label: 'Hunger', value: 'HUNGER' },
  { label: 'Violence', value: 'VIOLENCE' },
  { label: 'Activities', value: 'ACTIVITIES' },
  { label: 'Other', value: 'OTHER' },
].sort((a, b) => a.label.localeCompare(b.label));

/** Common next-step phrases for pipeline cards. */
export const PIPELINE_NEXT_ACTION_PRESETS: { label: string; value: string }[] = [
  { label: 'Follow up email', value: 'Follow up email' },
  { label: 'Schedule call', value: 'Schedule call' },
  { label: 'Schedule meeting', value: 'Schedule meeting' },
  { label: 'Send proposal', value: 'Send proposal' },
  { label: 'Send intro materials', value: 'Send intro materials' },
  { label: 'Check in', value: 'Check in' },
  { label: 'Request intro', value: 'Request intro' },
];

export function categoryDisplayLabel(value: string | null | undefined): string {
  if (!value) return '';
  const preset = PIPELINE_CATEGORY_PRESETS.find((p) => p.value === value);
  if (preset) return preset.label;
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Merge preset options with distinct values already used in the tenant. */
export function mergeCreatableOptions(
  presets: { label: string; value: string }[],
  used: string[],
): { label: string; value: string }[] {
  const seen = new Set(presets.map((p) => p.value.toLowerCase()));
  const extra = used
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((v) => !seen.has(v.toLowerCase()))
    .sort((a, b) => a.localeCompare(b))
    .map((v) => ({ label: categoryDisplayLabel(v) || v, value: v }));
  return [...presets, ...extra];
}
