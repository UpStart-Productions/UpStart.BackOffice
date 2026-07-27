import { parseDateKey } from '../../core/date.util';

export type ReportPeriodType = 'month' | 'quarter' | 'custom';

export type ReportPeriodBounds = {
  periodType: ReportPeriodType;
  from: Date;
  to: Date;
  label: string;
};

export const REPORT_MONTHS = [
  { label: 'January', value: 1 },
  { label: 'February', value: 2 },
  { label: 'March', value: 3 },
  { label: 'April', value: 4 },
  { label: 'May', value: 5 },
  { label: 'June', value: 6 },
  { label: 'July', value: 7 },
  { label: 'August', value: 8 },
  { label: 'September', value: 9 },
  { label: 'October', value: 10 },
  { label: 'November', value: 11 },
  { label: 'December', value: 12 },
];

export const REPORT_QUARTERS = [
  { label: 'Q1 (Jan – Mar)', value: 1 },
  { label: 'Q2 (Apr – Jun)', value: 2 },
  { label: 'Q3 (Jul – Sep)', value: 3 },
  { label: 'Q4 (Oct – Dec)', value: 4 },
];

function endOfLocalDay(d: Date): Date {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end;
}

function startOfLocalMonth(year: number, month: number): Date {
  return new Date(year, month - 1, 1, 0, 0, 0, 0);
}

function endOfLocalMonth(year: number, month: number): Date {
  return endOfLocalDay(new Date(year, month, 0));
}

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function resolveReportPeriod(params: {
  periodType: ReportPeriodType;
  month?: number;
  year?: number;
  quarter?: number;
  from?: string;
  to?: string;
}): ReportPeriodBounds | null {
  const now = new Date();
  const year = params.year ?? now.getFullYear();

  if (params.periodType === 'custom') {
    if (!params.from || !params.to) return null;
    const from = parseDateKey(params.from);
    const toDate = parseDateKey(params.to);
    if (!from || !toDate) return null;
    const to = endOfLocalDay(toDate);
    if (from > to) {
      return null;
    }
    return {
      periodType: 'custom',
      from,
      to,
      label: `${formatShortDate(from)} – ${formatShortDate(to)}`,
    };
  }

  if (params.periodType === 'month') {
    const month = params.month ?? now.getMonth() + 1;
    if (month < 1 || month > 12) return null;
    const from = startOfLocalMonth(year, month);
    const to = endOfLocalMonth(year, month);
    return {
      periodType: 'month',
      from,
      to,
      label: from.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    };
  }

  const quarter = params.quarter ?? Math.floor(now.getMonth() / 3) + 1;
  if (quarter < 1 || quarter > 4) return null;
  const startMonth = (quarter - 1) * 3 + 1;
  const from = startOfLocalMonth(year, startMonth);
  const to = endOfLocalMonth(year, startMonth + 2);
  return {
    periodType: 'quarter',
    from,
    to,
    label: `Q${quarter} ${year}`,
  };
}

export function dateInPeriod(iso: string, from: Date, to: Date): boolean {
  const d = new Date(iso);
  return d >= from && d <= to;
}
