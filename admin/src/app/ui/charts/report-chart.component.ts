import {
  AfterViewInit,
  Component,
  effect,
  ElementRef,
  input,
  OnDestroy,
  viewChild,
} from '@angular/core';
import {
  ArcElement,
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartData,
  type ChartOptions,
  type ChartType,
  DoughnutController,
  Filler,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Legend,
  Tooltip,
  Filler,
);

/**
 * Canonical report chart — Chart.js on canvas (KC.SPP.WebApp pattern).
 * update() on data changes preserves animation; PrimeNG p-chart reinit() does not.
 */
@Component({
  selector: 'app-report-chart',
  standalone: true,
  host: { class: 'report-chart-host' },
  template: `<canvas #canvas role="img"></canvas>`,
  styles: `
    :host {
      display: block;
      position: relative;
      height: 100%;
      width: 100%;
    }
    canvas {
      max-width: 100%;
    }
  `,
})
export class ReportChartComponent implements AfterViewInit, OnDestroy {
  readonly type = input.required<ChartType>();
  readonly data = input.required<ChartData>();
  readonly options = input<ChartOptions>({});

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;
  private chartType: ChartType | null = null;
  private viewReady = false;
  private renderedKey = '';

  constructor() {
    effect(() => {
      const type = this.type();
      const data = this.data();
      const options = this.options();
      if (!this.viewReady) return;

      const nextKey = chartRenderKey(type, data, options);
      if (nextKey === this.renderedKey) return;
      this.renderedKey = nextKey;
      this.render(type, data, options);
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    const type = this.type();
    const data = this.data();
    const options = this.options();
    this.renderedKey = chartRenderKey(type, data, options);
    this.render(type, data, options);
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chartType = null;
  }

  toBase64Image(type = 'image/png', quality?: number): string | undefined {
    return this.chart?.toBase64Image(type, quality);
  }

  private render(type: ChartType, data: ChartData, options: ChartOptions): void {
    const mergedOptions: ChartOptions = {
      responsive: true,
      maintainAspectRatio: false,
      ...options,
    };

    if (this.chart && this.chartType === type) {
      this.chart.data = data;
      this.chart.options = mergedOptions;
      this.chart.update('active');
      return;
    }

    this.chart?.destroy();
    this.chartType = type;
    this.chart = new Chart(this.canvasRef().nativeElement, {
      type,
      data,
      options: mergedOptions,
    });
    requestAnimationFrame(() => this.chart?.resize());
  }
}

function chartRenderKey(type: ChartType, data: ChartData, options: ChartOptions): string {
  return JSON.stringify({
    type,
    labels: data.labels,
    datasets: data.datasets?.map((dataset) => ({
      label: dataset.label,
      data: dataset.data,
    })),
    legend: options.plugins?.legend?.display,
  });
}
