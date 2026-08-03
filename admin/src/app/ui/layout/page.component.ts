import { Component, input } from '@angular/core';

@Component({
  selector: 'app-page',
  standalone: true,
  // `title` is also a global HTML attribute; clear it so pages don't get a host tooltip.
  host: {
    '[attr.title]': 'null',
  },
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
