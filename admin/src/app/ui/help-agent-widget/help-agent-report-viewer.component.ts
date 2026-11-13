import { Component, input, model, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import type { HelpAgentReport, HelpAgentReportBlock } from '@upstart/back-office/shared';
import { AppDialogModule } from '../../core/app-dialog.module';
import { exportHelpAgentReportPdf, reportCellText, reportTotalsRow } from './help-agent-report.pdf';

type TableBlock = Extract<HelpAgentReportBlock, { type: 'table' }>;

/** A report the guide built (make_report), in a large modal with Export PDF. Read-only. */
@Component({
  selector: 'app-help-agent-report-viewer',
  standalone: true,
  imports: [AppDialogModule, ButtonModule, TableModule, TagModule, DatePipe],
  template: `
    <p-dialog
      [(visible)]="visible"
      [modal]="true"
      appendTo="body"
      [maximizable]="true"
      [draggable]="false"
      [style]="{ width: 'min(72rem, 96vw)' }"
      [contentStyle]="{ 'max-height': '78vh' }"
    >
      <ng-template pTemplate="header">
        <div class="ha-report-header">
          <span class="p-dialog-title">{{ report()?.title ?? 'Report' }}</span>
          <p-button label="Export PDF" icon="pi pi-file-pdf" size="small" [loading]="exporting()" [disabled]="!report()" (onClick)="exportPdf()" />
        </div>
      </ng-template>
      @if (report(); as r) {
        @if (r.meta.length) {
          <div class="ha-report-meta text-color-secondary">
            @for (line of r.meta; track $index) {
              <div>{{ line }}</div>
            }
          </div>
        }
        @for (b of r.blocks; track $index) {
          @switch (b.type) {
            @case ('heading') {
              <h3 class="ha-report-heading">{{ b.text }}</h3>
            }
            @case ('text') {
              <p class="ha-report-text">{{ b.text }}</p>
            }
            @case ('table') {
              @if (b.title) {
                <h3 class="ha-report-heading">{{ b.title }}</h3>
              }
              <p-table [value]="b.rows" styleClass="table-bordered report-table" [scrollable]="true">
                <ng-template pTemplate="header">
                  <tr>
                    @for (c of b.columns; track $index) {
                      <th [class.col-numeric]="isNumeric(b, $index)">{{ c.label }}</th>
                    }
                  </tr>
                </ng-template>
                <ng-template pTemplate="body" let-row>
                  <tr>
                    @for (c of b.columns; track $index; let ci = $index) {
                      <td [class.col-numeric]="isNumeric(b, ci)">{{ cell(b, ci, row[ci]) }}</td>
                    }
                  </tr>
                </ng-template>
                <ng-template pTemplate="emptymessage">
                  <tr>
                    <td [attr.colspan]="b.columns.length">No records.</td>
                  </tr>
                </ng-template>
                @if (totals(b); as t) {
                  <ng-template pTemplate="footer">
                    <tr>
                      @for (v of t; track $index) {
                        <td class="font-semibold" [class.col-numeric]="isNumeric(b, $index)">{{ v }}</td>
                      }
                    </tr>
                  </ng-template>
                }
              </p-table>
            }
            @case ('conversation') {
              @if (b.title) {
                <h3 class="ha-report-heading">{{ b.title }}</h3>
              }
              <ul class="ha-report-conversation">
                @for (e of b.entries; track $index) {
                  <li>
                    <div class="ha-report-entry-head">
                      <span class="font-semibold">{{ e.who }}</span>
                      <span class="text-color-secondary">{{ e.date }}</span>
                      @if (e.kind) {
                        <p-tag [value]="e.kind" severity="secondary" />
                      }
                    </div>
                    @if (e.subject) {
                      <div class="ha-report-entry-subject">{{ e.subject }}</div>
                    }
                    @if (e.text) {
                      <div class="ha-report-entry-text">{{ e.text }}</div>
                    }
                  </li>
                } @empty {
                  <li class="text-color-secondary">No messages.</li>
                }
              </ul>
            }
          }
        }
        @if (r.sources.length) {
          <p class="ha-report-sources text-color-secondary">
            Built by the Back Office guide from {{ r.sources.join(', ') }} · {{ r.createdAt | date: 'MMM d, y, h:mm a' }}. Check key figures before sharing.
          </p>
        }
      }
    </p-dialog>
  `,
  styles: `
    .ha-report-header {
      display: flex;
      flex: 1;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
      min-width: 0;
      margin-right: 0.5rem;
    }
    .ha-report-meta {
      margin: 0 0 1rem;
      line-height: 1.5;
    }
    .ha-report-heading {
      margin: 1.25rem 0 0.5rem;
    }
    .ha-report-text {
      margin: 0.75rem 0;
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .ha-report-conversation {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .ha-report-conversation > li {
      padding: 0.75rem 0;
      border-bottom: 1px solid var(--color-border);
    }
    .ha-report-entry-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
    .ha-report-entry-subject {
      margin-top: 0.25rem;
      font-style: italic;
    }
    .ha-report-entry-text {
      margin-top: 0.25rem;
      white-space: pre-wrap;
      line-height: 1.5;
    }
    .ha-report-sources {
      margin: 1.25rem 0 0;
      font-size: var(--fs-sm, 0.875rem);
    }
  `,
})
export class HelpAgentReportViewerComponent {
  readonly report = input<HelpAgentReport | null>(null);
  readonly visible = model(false);
  readonly exporting = signal(false);

  isNumeric(b: TableBlock, i: number): boolean {
    const k = b.columns[i]?.kind;
    return k === 'money' || k === 'number';
  }

  cell(b: TableBlock, i: number, v: string | number | null): string {
    return reportCellText(b, i, v);
  }

  totals(b: TableBlock): string[] | null {
    return reportTotalsRow(b);
  }

  async exportPdf() {
    const r = this.report();
    if (!r) return;
    this.exporting.set(true);
    try {
      await exportHelpAgentReportPdf(r);
    } finally {
      this.exporting.set(false);
    }
  }
}
