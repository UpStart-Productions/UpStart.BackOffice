import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page',
  standalone: true,
  template: `
    @if (!skipTitle()) {
      <h2 class="page-title mb-3">{{ title() }}</h2>
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
  skipTitle = input(false);
}
