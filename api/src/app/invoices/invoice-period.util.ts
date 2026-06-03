import { BadRequestException } from '@nestjs/common';

export type InvoicePeriodType = 'month' | 'quarter' | 'custom';

export type InvoicePeriodBounds = {
  periodType: InvoicePeriodType;
  from: Date;
  to: Date;
  label: string;
};

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

export function resolveInvoicePeriod(params: {
  periodType: InvoicePeriodType;
  month?: number;
  year?: number;
  quarter?: number;
  from?: string;
  to?: string;
}): InvoicePeriodBounds {
  const now = new Date();
  const year = params.year ?? now.getFullYear();

  if (params.periodType === 'custom') {
    if (!params.from || !params.to) {
      throw new BadRequestException('Custom period requires from and to dates');
    }
    const from = new Date(params.from);
    const to = endOfLocalDay(new Date(params.to));
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) {
      throw new BadRequestException('Invalid custom date range');
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
    if (month < 1 || month > 12) {
      throw new BadRequestException('Month must be between 1 and 12');
    }
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
  if (quarter < 1 || quarter > 4) {
    throw new BadRequestException('Quarter must be between 1 and 4');
  }
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

function formatShortDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
