import type { ChartData, ChartOptions } from 'chart.js';
import { chartColorMode, chartSeriesColors } from './chart-palette';

export type ReportProjectDoughnut = {
  chartData: ChartData;
  options: ChartOptions;
};

export function buildReportProjectDoughnut<T extends { clientName: string; projectName: string }>(
  rows: T[],
  getValue: (row: T) => number,
  unitLabel: string,
): ReportProjectDoughnut | null {
  const filtered = rows.filter((r) => getValue(r) > 0);
  if (filtered.length === 0) return null;

  const colors = chartSeriesColors(filtered.length, chartColorMode('doughnut'));

  const chartData: ChartData = {
    labels: filtered.map((r) => r.projectName),
    datasets: [
      {
        data: filtered.map((r) => getValue(r)),
        backgroundColor: colors,
        borderWidth: 0,
      },
    ],
  };

  const options: ChartOptions = {
    animation: {
      duration: 750,
    },
    plugins: {
      legend: {
        position: 'right',
        labels: { boxWidth: 12, font: { size: 12 } },
      },
      tooltip: {
        callbacks: {
          title: (items) => {
            const row = filtered[items[0].dataIndex];
            return `${row.clientName} — ${row.projectName}`;
          },
          label: (ctx) => `${ctx.parsed} ${unitLabel}`,
        },
      },
    },
  };

  return { chartData, options };
}
