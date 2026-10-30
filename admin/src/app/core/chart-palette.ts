/**
 * Chart series colors. Hexes match --palette-* in assets/layout/variables/_colors.scss.
 * Doughnut, pie, and stacked bar alternate dark and light so neighbors contrast.
 * Line and plain bar charts use the darker shade only.
 */
export const CHART_PALETTE = [
  { dark: '#4E79A7', light: '#A0CBE8' },
  { dark: '#F28E2B', light: '#FFBE7D' },
  { dark: '#59A14F', light: '#8CD17D' },
  { dark: '#B6992D', light: '#F1CE63' },
  { dark: '#499894', light: '#86BCB6' },
  { dark: '#E15759', light: '#FF9D9A' },
  { dark: '#79706E', light: '#BAB0AC' },
  { dark: '#D37295', light: '#FABFD2' },
  { dark: '#B07AA1', light: '#D4A6C8' },
  { dark: '#9D7660', light: '#D7B5A6' },
] as const;

export type ChartColorMode = 'alternate' | 'dark';

/** Pick a mode from the chart form. Stacked bars alternate; a plain bar or line stays dark. */
export function chartColorMode(type: 'doughnut' | 'pie' | 'bar' | 'line', stacked = false): ChartColorMode {
  if (type === 'doughnut' || type === 'pie' || stacked) return 'alternate';
  return 'dark';
}

/** One color per slice or series, in palette order. */
export function chartSeriesColors(count: number, mode: ChartColorMode): string[] {
  const families = CHART_PALETTE.length;
  return Array.from({ length: count }, (_, i) => {
    const family = CHART_PALETTE[i % families];
    if (mode === 'dark') return family.dark;
    const pass = Math.floor(i / families);
    const darkOnEvenPass = pass % 2 === 0;
    const useDark = i % 2 === 0 ? darkOnEvenPass : !darkOnEvenPass;
    return useDark ? family.dark : family.light;
  });
}
