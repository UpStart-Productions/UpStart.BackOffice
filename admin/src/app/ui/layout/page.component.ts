import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { HelpTextComponent } from '../help-text/help-text.component';

/**
 * The one page shell and header for every back-office page (see .cursor/rules/page-header.mdc).
 *
 * The header sits above the white content panels:
 *   [← back]  [pageLead: avatar or color tile]  Title (help)  [pageMeta: status tags, chips]  ......  [pageActions: secondary…, primary]
 *   [pageSubtitle: optional one-line details]
 *
 * Search, filters and tabs never go in the header; they belong at the top of the panel.
 * At most one purple (primary) button in pageActions, and it is always the last one.
 */
@Component({
  selector: 'app-page',
  standalone: true,
  imports: [RouterLink, ButtonModule, HelpTextComponent],
  // `title` is also a global HTML attribute; clear it so pages don't get a host tooltip.
  host: {
    '[attr.title]': 'null',
  },
  template: `
    @if (!skipTitle()) {
      <header class="page-header">
        <div class="page-header-row">
          @if (backLink(); as link) {
            <p-button
              icon="pi pi-arrow-left"
              [rounded]="true"
              [text]="true"
              severity="secondary"
              type="button"
              class="page-header-back"
              [routerLink]="link"
              [ariaLabel]="backLabel()"
            />
          }
          <ng-content select="[pageLead]" />
          <h1 class="page-title page-header-title">
            {{ title() }}
            @if (helpKey(); as key) {
              <app-help-text [key]="key" />
            }
          </h1>
          <div class="page-header-meta">
            <ng-content select="[pageMeta]" />
          </div>
          <div class="page-header-actions">
            <ng-content select="[pageActions]" />
          </div>
        </div>
        <ng-content select="[pageSubtitle]" />
      </header>
    }
    <ng-content />
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class PageComponent {
  title = input.required<string>();
  /** Legacy: hide the header. Only for pages not yet moved to the shared header. */
  skipTitle = input(false);
  /** Shows the back arrow before the title. */
  backLink = input<string | unknown[] | null>(null);
  backLabel = input('Back');
  /** Help-text key shown as the ⓘ after the title. */
  helpKey = input<string | null>(null);
}
